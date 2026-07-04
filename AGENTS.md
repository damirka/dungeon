# Dungeon Balance Core Handoff

This folder is the current project boundary for the dungeon crawler balance prototype.
Future agents should start here before changing formulas, mapper data, or the
React playtest engine.

## Current Entry Points

- `index.html` and `src/` - React / Vite / Tailwind / TypeScript workbench shell.
- `src/features/playtest/engine/` - **the canonical game engine** (combat, dungeon
  construction, loot, stat math). Other features import it from the
  `src/features/playtest/engine` barrel rather than reaching into individual
  files. Tune the game here first; Python and legacy HTML must follow React, not
  the other way around.
- `src/features/playtest/` - now holds ONLY the engine (the Playtest workspace
  page was removed; batch metrics live in `pnpm sim:balance` +
  `data/balance_metrics_latest.json`).
- `src/features/play/` - the default first-screen playable game (UI + explore layer) on top of the engine.
- `src/features/mappers/` - separate character, FX, and item mapper workspace.
  The Item Editor tab is native React (`ItemCatalogEditor.tsx`); saving items
  through `/api/save/items` also re-bakes `weaponTemplates.ts` automatically.
- `src/features/level-building/` - native level / room-building workspace; early but real, not just a placeholder.
  Ships in production builds alongside Play: without the save API it keeps edits
  in localStorage and shares rooms as JSON files via Export / Import. The
  bundled fallback snapshot `src/game/roomData.ts` is re-baked from the room
  catalog by `tools/build_room_data.mjs` on every room save (drift-guarded by
  `pnpm test:web`).
- `src/features/dungeon/` - native Dungeon Map workspace: per-floor enemy
  rosters/bosses/biomes (including enemy types normally assigned to other
  floors) plus authored-room coverage per floor. Persists a designer plan that
  the engine consumes via the optional `DungeonPlan` argument on
  `buildDungeon`/`newGame` (`src/game/dungeonPlan.ts` is the live loader:
  localStorage → `data/dungeon_plan.json` → engine defaults).
- `src/game/` - play-side data + assets (sprite/FX/room data, audio) shared by the UI.
- `public/legacy/tactical_playtest.html` - archived browser prototype. It can be
  used for archaeology, but it is no longer authoritative for balance or game feel.
- `public/legacy/creature_fx_mapper.html` - shared legacy sprite mapper; app tabs open it locked to `?sheet=creatures` or `?sheet=fx`.
- `public/legacy/sprite_meaning_mapper.html` - item sprite mapper.
- `dungeon_balance/` - Python balance engine and simulator. Treat it as a
  historical/control tool until it is explicitly realigned to the React engine.
- `data/` - persisted mapper/catalog state used by the HTML tools.
- `reports/` - human-readable balance and mapping notes.
- `tests/` - regression tests for formulas, loot, tactical combat, mapper output,
  and legacy wiring.

## Persisted State

The Vite mapper API (`tools/mapperApi.mjs`) saves the current editable state to:

- `data/oryx_item_catalog.json`
- `data/oryx_creature_fx_catalog.json`
- `data/tactical_enemy_visuals.js`
- `data/dungeon_biome_plan.json`
- `data/dungeon_plan.json` (designer per-floor enemy/boss/biome plan from the Dungeon workspace)

These files should be treated as source data, not generated scratch. Commit them when the mapping changes are meaningful.

## Latest Balance Snapshot

The latest handoff metrics are stored in:

- `data/balance_metrics_latest.json`

Key current signal: Balanced Swordsman is still the only unlocked/default
playable character, but the current balance file is now a historical reference,
not the live game gate. `data/balance_metrics_latest.json` stores a Python/legacy
10K sample after the no-enemy-miss pass (`0.0%` win rate, `2.24%` reach L3 boss,
`0.28%` reach L4 boss), but those numbers are not authoritative for React because
`src/features/playtest/engine/core.ts` is now the game source of truth and uses
a seedable randomized power-band room builder with explore-only entrance rooms,
randomized encounter pairings/supports, and strict authored bosses.

Current canonical rule: if React, Python, and legacy HTML disagree, React wins.
Do not tune React to match HTML. Use the native React engine simulator in
`src/features/playtest/engine/sim.ts` before treating any win-rate snapshot as
current.

Latest quick React-engine probe (`estimateReactWinRate(1000, 920000)`) after
enemy attacks were changed to always connect and enemy damage was retuned:
`2.3%` win rate, `19.92` average rooms cleared, rooms p50 `18`, rooms p90 `31`,
rooms p95 `39`, reach L3 boss `44.1%`, reach L4 boss `18.7%`, and reach L5 boss
`5.4%`. Action counts in that sample were Attack `36,068`, Quick `15,450`,
Heavy `9,594`, Sweep `390`, Guard `739`, and Riposte `3,010`.

Current tactical identity notes:

- Balanced Swordsman has `Riposte`, not Knight's Ward.
- Riposte costs `2 MP`, reduces incoming damage for the round, and counters the
  first hostile attack attempt. It does not trigger on
  support/non-attack intents such as guard, aim, heal, shield, or invisibility.
- Skilled Auto saves mana-costed Riposte for priority threats: `elite`, `tank`,
  `hp-check`, and `boss` tags.
- Mana is per encounter: max/start `4`, regen `1` per round, `quick` costs `1`,
  `heavy`/`sweep`/Riposte cost `2`, and `attack`/`guard` are free.
- Action identity is intentionally wider now: Attack is the stable middle,
  Quick is lower raw damage with tempo/pressure, Heavy is a high-payoff
  commitment, and player misses become glancing contact rather than full no-ops.
  Enemy attacks do not roll to miss.
- Current health drops are `Crimson Vial`, `Crimson Potion`, and `Crimson
  Elixir` using their mapped Oryx item sprites. They restore current HP only;
  they do not increase max HP.

## Recommended Commands

From this folder:

```bash
python3 -m unittest discover tests
```

Historical Python reference sample, not a current React balance gate:

```bash
python3 -c 'from dungeon_balance import BalanceConfig
from dungeon_balance.archetypes import build_by_name
from dungeon_balance.loot import LootConfig
from dungeon_balance.tactical import estimate_tactical_loot_win_rate
config=BalanceConfig(); loot=LootConfig()
summary=estimate_tactical_loot_win_rate(build_by_name("balanced"), config=config, loot_config=loot, runs=10000, seed=920000)
for key in ("win_rate","reach_l3_boss_rate","clear_l3_boss_rate","reach_l4_boss_rate","reach_l5_rate","rooms_p50","rooms_p75","rooms_p90","rooms_p95","rooms_p99"):
    print(key, summary[key])
'
```

Install and run the workbench from this folder:

```bash
pnpm install
pnpm dev
```

Then open:

- `http://127.0.0.1:5173/`

The mapper API (`/api/status`, `/data/*`, `/assets/*`, and the `/api/save/*`
write endpoints) is served natively by Vite through the `mapperApi()` plugin in
`tools/mapperApi.mjs` — there is no separate backend process. It is active in
both `pnpm dev` and `pnpm preview`, so saving works in any local deployment.
Legacy pages are still served by Vite at `/legacy/*.html` for reference and
mapper migration work, e.g.:

- `http://127.0.0.1:5173/legacy/tactical_playtest.html`
- `http://127.0.0.1:5173/legacy/creature_fx_mapper.html`
- `http://127.0.0.1:5173/legacy/sprite_meaning_mapper.html`

The mapper save/normalization logic is covered by `pnpm test:web`
(`tools/mapperApi.test.mjs`), alongside the Python suite in `pnpm test`.

Loot weapons in the React engine are drawn from catalog-derived templates. The
template set is baked into
`src/features/playtest/engine/weaponTemplates.ts` by `tools/build_weapon_templates.mjs`
(run it after editing `data/oryx_item_catalog.json`), and `pnpm test:web`
(`tools/weaponTemplates.test.mjs`) fails if the baked file drifts from the catalog.

## Current Tuning Direction

Do not only tune final win rate. Track:

- floor entry rates: `reach_l2_rate`, `reach_l3_rate`, `reach_l4_rate`, `reach_l5_rate`
- boss reach rates: `reach_l2_boss_rate`, `reach_l3_boss_rate`, `reach_l4_boss_rate`, `reach_l5_boss_rate`
- boss pass rates: `l2_boss_clear_given_reached`, `l3_boss_clear_given_reached`, `l4_boss_clear_given_reached`, `l5_boss_clear_given_reached`
- depth percentiles: `rooms_p50`, `rooms_p75`, `rooms_p90`, `rooms_p95`, `rooms_p99`
- weapon lift vs Iron Sword: compare starting weapon profiles on win rate and boss reach rates

Working hypothesis: React's randomized power-band rooms are currently too easy
under the native sim, especially in regular encounters before boss gates. The
Python baseline is useful context only. Do not tune from the stale Heavy-nerf
weapon-lift sample; rerun weapon comparisons with `estimateReactWinRate` after
any change that touches action multipliers, Riposte, mana, healing consumables,
or encounter generation.

## Git Notes

This folder is inside a Git repository, but `main` currently has no commits.
Treat the whole tree as an initial project import until a first commit exists.
When making that initial commit, include at least:

- `AGENTS.md`
- `README.md`
- `dungeon_balance/`
- `tests/`
- `data/*.json`
- `data/tactical_enemy_visuals.js`
- `reports/`
- `index.html`
- `public/legacy/*.html`
- `src/`
- `package.json`
- `pnpm-lock.yaml`
- `tools/`

Avoid committing temporary browser exports, screenshots, or local server logs.
