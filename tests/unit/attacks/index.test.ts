import { listAttackCodes, getAttack, ATTACK_CODES } from '@/attacks';

const CORE_7 = ['ASI01', 'ASI02', 'ASI03', 'ASI04', 'ASI05', 'ASI06', 'ASI10'] as const;

describe('attack barrel — registry fully populated', () => {
  it('registry lists exactly the 7 Core-7 codes', () => {
    expect(listAttackCodes()).toEqual([...CORE_7]);
  });

  it('resolves each of the 7 attacks by code', () => {
    for (const code of CORE_7) {
      expect(getAttack(code).category).toBe(code);
    }
  });

  it('the canonical ATTACK_CODES match the registered set', () => {
    expect([...ATTACK_CODES].sort()).toEqual(listAttackCodes());
  });
});
