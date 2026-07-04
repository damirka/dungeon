/**
 * Public surface of the playtest engine — the single source of truth for
 * combat, dungeon construction, loot, and stat math. Other features (the
 * playable game, future tools) import the engine from here rather than reaching
 * into individual modules, so the engine can evolve behind this barrel.
 *
 * This React/TypeScript engine is now canonical. Treat Python and legacy HTML
 * as historical/support tooling that must follow this module when behavior
 * changes.
 */
export * from "./core";
export {
  generateLootDraft,
  slotForItem,
  activeItemForSlot,
  itemStorageScore,
  lootChoiceScore,
  rarityOf,
  tierOf,
} from "./loot";
export {
  chooseSimAction,
  comparePolicies,
  estimateReactWinRate,
  makeSeededRng,
  randomPolicy,
  simulateReactRun,
  skilledPolicy,
} from "./sim";
export type { PolicyComparison, SimPolicy, SimRunResult, SimSummary } from "./sim";
