import { listAttackCodes, getAttack, ATTACK_CODES } from '@/attacks';

const CORE_5 = ['ASI01', 'ASI02', 'ASI04', 'ASI06', 'ASI10'] as const;

describe('attack barrel — registry fully populated', () => {
  it('registry lists exactly the 5 Core-5 codes', () => {
    expect(listAttackCodes()).toEqual([...CORE_5]);
  });

  it('resolves each of the 5 attacks by code', () => {
    for (const code of CORE_5) {
      expect(getAttack(code).category).toBe(code);
    }
  });

  it('the canonical ATTACK_CODES match the registered set', () => {
    expect([...ATTACK_CODES].sort()).toEqual(listAttackCodes());
  });
});
