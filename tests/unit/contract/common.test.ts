import { CategorySchema, SeveritySchema, JsonValueSchema } from '@/contract';

describe('CategorySchema — Core-7 (OWASP Agentic Top 10 2026)', () => {
  it.each(['ASI01', 'ASI02', 'ASI03', 'ASI04', 'ASI05', 'ASI06', 'ASI10'])('accepts %s', (c) => {
    expect(CategorySchema.parse(c)).toBe(c);
  });

  it.each(['ASI07', 'ASI08', 'ASI09', 'asi01', 'ASI1', ''])(
    'rejects out-of-scope/malformed %s',
    (c) => {
      expect(CategorySchema.safeParse(c).success).toBe(false);
    },
  );
});

describe('SeveritySchema — CVSS v4 qualitative bands', () => {
  it.each(['None', 'Low', 'Medium', 'High', 'Critical'])('accepts %s', (s) => {
    expect(SeveritySchema.parse(s)).toBe(s);
  });

  it.each(['none', 'Info', 'Informational', 'Severe', ''])('rejects %s', (s) => {
    expect(SeveritySchema.safeParse(s).success).toBe(false);
  });
});

describe('JsonValueSchema — arbitrary observable JSON', () => {
  it.each([
    ['string', 'hello'],
    ['number', 42],
    ['boolean', true],
    ['null', null],
  ])('accepts a %s scalar', (_label, value) => {
    expect(JsonValueSchema.safeParse(value).success).toBe(true);
  });

  it('accepts nested arrays and objects', () => {
    const value = { a: [1, 'two', false, null], b: { c: { d: [] } } };
    expect(JsonValueSchema.safeParse(value).success).toBe(true);
  });

  it('rejects non-JSON values (undefined, function)', () => {
    expect(JsonValueSchema.safeParse(undefined).success).toBe(false);
    expect(JsonValueSchema.safeParse(() => 1).success).toBe(false);
  });
});
