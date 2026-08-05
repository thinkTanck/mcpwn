import {
  classifyInbound,
  jsonRpcError,
  jsonRpcResult,
  parseCallToolParams,
  parseGetPromptParams,
  parseInitializeParams,
  parseListPromptsParams,
  parseListToolsParams,
  RPC_INVALID_PARAMS,
  RPC_INVALID_REQUEST,
  ServerProtocolError,
} from '@/harness/server/protocol';

describe('server/protocol: classifyInbound', () => {
  it('classifies a well-formed request', () => {
    const message = { jsonrpc: '2.0', id: 1, method: 'tools/list' };
    const inbound = classifyInbound(message);
    expect(inbound.kind).toBe('request');
    if (inbound.kind === 'request') expect(inbound.message.method).toBe('tools/list');
  });

  it('classifies a notification by the ABSENCE of id, not the schema', () => {
    const inbound = classifyInbound({ jsonrpc: '2.0', method: 'notifications/initialized' });
    expect(inbound.kind).toBe('notification');
  });

  it.each([
    ['a bare number', 42],
    ['null', null],
    ['an array', [1, 2, 3]],
    ['a JSON-RPC 1.0 message', { jsonrpc: '1.0', id: 1, method: 'tools/list' }],
    ['a request with no method', { jsonrpc: '2.0', id: 1 }],
    ['a request with an empty method', { jsonrpc: '2.0', id: 1, method: '' }],
  ])('marks %s invalid with INVALID_REQUEST', (_label, raw) => {
    const inbound = classifyInbound(raw);
    expect(inbound.kind).toBe('invalid');
    if (inbound.kind === 'invalid') expect(inbound.error.code).toBe(RPC_INVALID_REQUEST);
  });

  it('recovers a correlatable id from an otherwise-invalid message', () => {
    const inbound = classifyInbound({ jsonrpc: '1.0', id: 7, method: 'x' });
    expect(inbound.kind).toBe('invalid');
    if (inbound.kind === 'invalid') expect(inbound.id).toBe(7);
  });

  it('returns a null id when none can be recovered', () => {
    const inbound = classifyInbound(42);
    if (inbound.kind === 'invalid') expect(inbound.id).toBeNull();
  });
});

describe('server/protocol: param parsers validate external input', () => {
  it('requires a protocolVersion on initialize', () => {
    expect(() => parseInitializeParams({})).toThrow(ServerProtocolError);
  });

  it('accepts initialize with client info and extra loose fields', () => {
    const params = parseInitializeParams({
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'agent', version: '1.0' },
      _meta: { anything: true },
    });
    expect(params.clientInfo?.name).toBe('agent');
  });

  it('defaults absent tool arguments to an empty object', () => {
    const params = parseCallToolParams({ name: 'read' });
    expect(params.arguments).toEqual({});
  });

  it('rejects a tools/call with no name', () => {
    expect(() => parseCallToolParams({})).toThrow(ServerProtocolError);
  });

  it('parses tools/list and prompts/list cursors leniently', () => {
    expect(parseListToolsParams(undefined)).toEqual({});
    expect(parseListPromptsParams({ cursor: 'x' })).toMatchObject({ cursor: 'x' });
  });

  it('rejects a prompts/get with no name', () => {
    expect(() => parseGetPromptParams({})).toThrow(ServerProtocolError);
  });

  it('carries the INVALID_PARAMS code on a param failure', () => {
    try {
      parseCallToolParams({});
    } catch (error) {
      expect(error).toBeInstanceOf(ServerProtocolError);
      expect((error as ServerProtocolError).rpcCode).toBe(RPC_INVALID_PARAMS);
    }
  });
});

describe('server/protocol: outbound envelopes', () => {
  it('builds a result envelope', () => {
    expect(jsonRpcResult(1, { ok: true })).toEqual({ jsonrpc: '2.0', id: 1, result: { ok: true } });
  });

  it('builds an error envelope', () => {
    expect(jsonRpcError(null, RPC_INVALID_REQUEST, 'bad')).toEqual({
      jsonrpc: '2.0',
      id: null,
      error: { code: RPC_INVALID_REQUEST, message: 'bad' },
    });
  });
});
