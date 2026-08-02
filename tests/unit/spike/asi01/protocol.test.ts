import {
  SpikeProtocolError,
  classifyInbound,
  jsonRpcError,
  jsonRpcResult,
  parseCallToolParams,
  parseInitializeParams,
  RPC_INVALID_PARAMS,
  RPC_INVALID_REQUEST,
  RPC_METHOD_NOT_FOUND,
  RPC_PARSE_ERROR,
} from '@/spike/asi01/protocol';

/**
 * The spike endpoint is deliberately HOSTILE-FACING surface: it exists to be
 * connected to by an agent we do not control. Every inbound message is therefore
 * Zod-validated before a single field is touched, and a malformed message must
 * produce a TYPED error that becomes a JSON-RPC error response — never a crash.
 */
describe('spike/asi01 protocol: inbound classification', () => {
  it('classifies a well-formed request', () => {
    const inbound = classifyInbound({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
    expect(inbound.kind).toBe('request');
    if (inbound.kind !== 'request') return;
    expect(inbound.message.method).toBe('tools/list');
    expect(inbound.message.id).toBe(1);
  });

  it('classifies a notification (no id, so no response is owed)', () => {
    const inbound = classifyInbound({ jsonrpc: '2.0', method: 'notifications/initialized' });
    expect(inbound.kind).toBe('notification');
    if (inbound.kind !== 'notification') return;
    expect(inbound.message.method).toBe('notifications/initialized');
  });

  it('keeps unknown extra fields (real clients add _meta) rather than rejecting', () => {
    const inbound = classifyInbound({
      jsonrpc: '2.0',
      id: 'abc',
      method: 'tools/call',
      params: { name: 'read_email', _meta: { progressToken: 7 } },
    });
    expect(inbound.kind).toBe('request');
  });

  it.each([
    ['not an object', 42],
    ['null', null],
    ['wrong jsonrpc version', { jsonrpc: '1.0', id: 1, method: 'tools/list' }],
    ['missing method', { jsonrpc: '2.0', id: 1 }],
    ['empty method', { jsonrpc: '2.0', id: 1, method: '' }],
    ['id of the wrong type', { jsonrpc: '2.0', id: { nested: true }, method: 'tools/list' }],
  ])('rejects %s as invalid, without throwing', (_label, raw) => {
    const inbound = classifyInbound(raw);
    expect(inbound.kind).toBe('invalid');
    if (inbound.kind !== 'invalid') return;
    expect(inbound.error.code).toBe(RPC_INVALID_REQUEST);
  });

  it('reports the id of an otherwise-invalid request so the client can correlate', () => {
    const inbound = classifyInbound({ jsonrpc: '2.0', id: 9, method: '' });
    if (inbound.kind !== 'invalid') throw new Error('expected invalid');
    expect(inbound.id).toBe(9);
  });
});

describe('spike/asi01 protocol: params validation', () => {
  it('accepts an initialize with the spec-required protocolVersion', () => {
    const params = parseInitializeParams({
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'fake-client', version: '0.0.1' },
    });
    expect(params.protocolVersion).toBe('2025-06-18');
    expect(params.clientInfo?.name).toBe('fake-client');
  });

  it('rejects an initialize with no protocolVersion as a typed INVALID_PARAMS', () => {
    let thrown: unknown;
    try {
      parseInitializeParams({ capabilities: {} });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(SpikeProtocolError);
    expect((thrown as SpikeProtocolError).code).toBe('INVALID_PARAMS');
    expect((thrown as SpikeProtocolError).rpcCode).toBe(RPC_INVALID_PARAMS);
  });

  it('accepts a tools/call with a name and JSON arguments', () => {
    const params = parseCallToolParams({
      name: 'transfer_funds',
      arguments: { to: 'DE00-ATTACKER-9931', amount: 8500, currency: 'EUR' },
    });
    expect(params.name).toBe('transfer_funds');
    expect(params.arguments).toEqual({
      to: 'DE00-ATTACKER-9931',
      amount: 8500,
      currency: 'EUR',
    });
  });

  it('defaults absent tools/call arguments to an empty object', () => {
    expect(parseCallToolParams({ name: 'list_inbox' }).arguments).toEqual({});
  });

  it.each([
    ['no name', { arguments: {} }],
    ['an empty name', { name: '', arguments: {} }],
    ['non-object arguments', { name: 'read_email', arguments: 'inbox' }],
    ['nothing at all', undefined],
  ])('rejects a tools/call with %s', (_label, raw) => {
    expect(() => parseCallToolParams(raw)).toThrow(SpikeProtocolError);
  });
});

describe('spike/asi01 protocol: response envelopes', () => {
  it('builds a JSON-RPC result envelope', () => {
    expect(jsonRpcResult(3, { tools: [] })).toEqual({
      jsonrpc: '2.0',
      id: 3,
      result: { tools: [] },
    });
  });

  it('builds a JSON-RPC error envelope', () => {
    expect(jsonRpcError(null, RPC_PARSE_ERROR, 'Parse error')).toEqual({
      jsonrpc: '2.0',
      id: null,
      error: { code: RPC_PARSE_ERROR, message: 'Parse error' },
    });
  });

  it('exposes the standard JSON-RPC codes it answers with', () => {
    expect([RPC_PARSE_ERROR, RPC_INVALID_REQUEST, RPC_METHOD_NOT_FOUND, RPC_INVALID_PARAMS]).toEqual(
      [-32700, -32600, -32601, -32602],
    );
  });

  it('carries a typed code on every protocol error it raises', () => {
    const error = new SpikeProtocolError('METHOD_NOT_FOUND', 'no such method: resources/list');
    expect(error.name).toBe('SpikeProtocolError');
    expect(error.rpcCode).toBe(RPC_METHOD_NOT_FOUND);
    expect(error.message).toContain('resources/list');
  });
});
