/**
 * Attack registry barrel. Importing this module registers all seven Core-7 attacks
 * (each self-registers via `defineAttack` on import) and re-exports the engine, so
 * `listAttackCodes()` / `getAttack(code)` resolve the full Core-7 set.
 */
export * from './engine';
export { asi01 } from './asi01';
export { asi02 } from './asi02';
export { asi03 } from './asi03';
export { asi04 } from './asi04';
export { asi05 } from './asi05';
export { asi06 } from './asi06';
export { asi10 } from './asi10';
