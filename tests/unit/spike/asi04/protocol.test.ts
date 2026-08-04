import {
  RPC_INVALID_REQUEST,
  classifyInbound,
  jsonRpcError,
  jsonRpcResult,
  parseCallToolParams,
  parseInitializeParams,
  SpikeProtocolError,
} from '@/spike/asi04/protocol';

/**
 * The inbound JSON-RPC layer, re-exported from the ASI01 spike rather than
 * forked. These are a THIN CONFORMANCE CHECK on the re-export: they prove the
 * asi04 module surfaces a working validator, so a future refactor that lifts the
 * shared layer to `src/spike/shared/` cannot silently break this entry point.
 * The exhaustive behaviour is covered by the asi01 protocol suite.
 */

describe('spike/asi04 protocol re-export', () => {
  it('classifies a request, a notification and an invalid message', () => {
    expect(classifyInbound({ jsonrpc: '2.0', id: 1, method: 'tools/list' }).kind).toBe('request');
    expect(classifyInbound({ jsonrpc: '2.0', method: 'notifications/initialized' }).kind).toBe(
      'notification',
    );
    const invalid = classifyInbound({ nope: true });
    expect(invalid.kind).toBe('invalid');
    if (invalid.kind === 'invalid') expect(invalid.error.code).toBe(RPC_INVALID_REQUEST);
  });

  it('validates params before any field is read, throwing a typed error', () => {
    expect(() => parseInitializeParams({})).toThrow(SpikeProtocolError);
    expect(() => parseCallToolParams({ name: '' })).toThrow(SpikeProtocolError);
    expect(parseCallToolParams({ name: 'read_email' }).arguments).toEqual({});
  });

  it('builds result and error envelopes', () => {
    expect(jsonRpcResult(1, { ok: true })).toEqual({ jsonrpc: '2.0', id: 1, result: { ok: true } });
    expect(jsonRpcError(null, -32700, 'Parse error')).toMatchObject({
      jsonrpc: '2.0',
      id: null,
      error: { code: -32700 },
    });
  });
});
