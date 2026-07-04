# Thread Handoff

This file preserves the working conversation state for future agents and for moving the prototype into a durable project folder.

## Project Goal

Build a balance-first core for a turn-based dungeon crawler with:

- player stats: HP, strength, dexterity
- default playable character: Balanced Swordsman only; other character styles
  should be unlocked by rescue/quest progression
- scarce HP, currently no passive healing between rooms
- chance-based player combat, loot, crits, damage quality, and future entropy-reduction resources
- 5 dungeon levels, each with 7 encounters plus a boss, 40 rooms total
- target skilled win rate around 3%; current React-engine batch metrics are
  available through `estimateReactWinRate`, and Python/legacy metrics are
  historical reference only
- random play should survive much of level 1 but rarely pass L1 boss / early L2

## Current Playable Tools

- `index.html` / `src/` - React / Vite / Tailwind / TypeScript workbench
- `src/features/playtest/` - React-side playtest workspace and canonical engine
- `src/features/mappers/` - separate character, FX, and item mapper workspace
- `src/features/level-building/` - early native level / room-building workspace
- `public/legacy/tactical_playtest.html` - archived row-of-encounters prototype,
  no longer authoritative for game feel or balance
- `public/legacy/creature_fx_mapper.html` - shared legacy mapper, opened by the app as separate Characters and FX lanes
- `public/legacy/sprite_meaning_mapper.html` - item sprite mapper
- `tools/mapperApi.mjs` - native Vite plugin with the mapper save endpoints
  (replaces the old `tools/live_mapper_server.py` backend)

Run from the workspace root:

```bash
pnpm install
pnpm dev
```

Then open:

- `http://127.0.0.1:5173/`

The mapper API (`/api/status`, `/data/*`, `/assets/*`, `/api/save/*`) is served
by the `mapperApi()` Vite plugin in both `pnpm dev` and `pnpm preview` - no
separate Python backend. Legacy pages are served by Vite at:

- `http://127.0.0.1:5173/legacy/tactical_playtest.html`
- `http://127.0.0.1:5173/legacy/creature_fx_mapper.html`
- `http://127.0.0.1:5173/legacy/sprite_meaning_mapper.html`

## Current Combat Model — "telegraphed tactics" (v2, 2026-07-03)

The chance-based v1 engine is archived at `archive/engine-chance-v1/`. The
canonical model is now deterministic, small-integer combat:

- Attacks always land; the ONLY attack roll is the crit roll
  (`5% + 2%/DEX above 5`, crits deal ×2). A dodge stat for player/enemies is a
  planned future hook, likely DEX-driven.
- The player takes multiple actions per round under a stamina budget
  (`3` per turn, full refresh each round; enemy turn resolves when stamina hits
  0 or the player ends the turn).
- Enemy intents are telegraphed one turn ahead with EXACT damage numbers
  (`Enemy.intentDamage`), shown in the UI.
- Block is flat: Guard grants `4 + DEX/gear` block that absorbs incoming
  damage and expires at the start of the next player turn. `pierce` ignores
  block. Enemy `guard`/mage `shield` also grant flat block.
- Randomness lives upstream only: dungeon composition, encounter power bands,
  intent selection, and loot. Resolution is exact.

Player actions (stamina cost):

- `attack` (1) - weapon damage + STR bonus, exact number shown
- `heavy` (2) - double damage, axe-weapon payoff
- `bash` (2) - the DENIAL action: half damage and the target skips its
  telegraphed action. A denied enemy is `steadied` and cannot be denied again
  until it completes an action (no stun-locking).
- `sweep` (2) - reduced damage to every enemy, DEX-scaled, no crits
- `guard` (1) - flat block, stackable within a turn
- `ability` (2 + 1 charge/room) - Riposte: +3 block and counter the first
  attacker
- `end` (free) - end the turn

Enemy intents: `strike`, `heavy`, `pierce` (ignores block), `aim` (next attack
×1.5), `guard` (self block), and mage support `heal`/`shield`. Invisibility was
removed (meaningless without hit rolls). Weapon template effects map onto flat
integer bonuses, crit chance, guard block, and `staggerChance` (chance for
attack/heavy to also deny).

Encounter shape (2026-07-03):

- Every floor has a GUARANTEED elite encounter at the halfway slot
  (`DUNGEON.eliteEncounterSlot`, shown as `◆` on the floor map): one
  heavyweight foe at `×1.7 hp / ×1.25 dmg` (~60% boss weight), tagged `elite`,
  named "Elite <creature>", behind a bigger loot share (`eliteLuckShare`).
- Encounters cap at 3 enemies. Power bands 3-4 can roll a squeezed triple
  (`tripleChance` 0.22/0.30): the pair budget spread across three bodies at
  `×0.8` per-enemy stats. Band 5 is a native 3-enemy group.
- Denial = POSTPONE + RE-ROLL (2026-07-04, designer-chosen): a bashed enemy
  skips its action this round, and the plan that comes back next round is a
  FRESH intent roll — bosses advance their script via `Enemy.scriptShift`, so
  a stopped boss heavy is deleted, never deferred. Two rejected variants,
  both sim-tested: pure delay (same heavy returns — a trap players walk into)
  and re-roll-acts-this-round (bash loses all mitigation; skilled win rate
  collapsed to 0.2%). Bash stays charge-limited (2/room) + steadied.
- Policy A/B (2026-07-04, `pnpm sim:policies`, 800 paired seeds): the player's
  "ALWAYS bash a live heavy telegraph" principle scores 4.38% vs the greedy
  baseline's 4.00% (+0.38pts, within noise; 30 vs 27 discordant seeds) while
  spending ~68% more bash charges. Verdict: heavies are the correct default
  bash target; liberal spending on them loses nothing.
- Desperation AI: non-boss enemies at <=35% HP stop rolling guard/aim, and the
  last enemy standing also stops casting support — cornered foes attack.
- The Heavy combo (2026-07-04): a landed Heavy EXPOSES the target for the rest
  of the round — every other hit you land on it gains
  `TACTICAL.exposedBonusDamage` (+3). This gives Heavy a lead-the-combo
  identity vs attack-spam. UI shows an EXPOSED chip and live-updated numbers.
- Enemy Heavy CRUSHES block (2026-07-04): your block absorbs heavy at
  `TACTICAL.heavyBlockEfficiency` (0.5 — every 2 block stops 1 heavy damage,
  and the used block burns at double rate). This breaks the guard-everything
  meta: heavy telegraphs demand deny/riposte/burst, not just Guard. The shown
  number carries a `‡` marker. Counter-gear: the `guard_heavy_block` shield
  effect (very rare+) makes block fully effective vs heavy again
  (`guard_pierce_block` remains the legendary pierce mirror). Compensation:
  heavy intent multiplier `1.8 -> 1.6`, boss damage `×1.35 -> ×1.2`.
- Riposte is a PERFECT PARRY (2026-07-04, from an L4-boss death log): while
  Riposte is armed, ALL your block that turn is fully effective even against
  Heavy — the once-per-room answer to boss heavies (an L4 boss telegraphs
  ~22‡). Compensation: boss HP `×2.5 -> ×3.0`, elite HP `×1.7 -> ×1.8`
  (the parry defuses one heavy per fight; longer premium fights re-add
  pressure).
- Run persistence (2026-07-04): the in-progress run is saved to localStorage
  (`hollow-descent-run`) on every state change and resumed on reload. BUMP
  `SAVE_VERSION` in `src/features/play/useGame.ts` whenever the GameState
  shape changes — stale/unparseable saves are discarded, never migrated.
- Player wish held for later: more spell/effect variety per item ("each item
  feels better in a build") and effects that create unique game mechanics —
  expand EffectKey + pools when balancing allows.
- Loot QoL (2026-07-04): draft cards show a "Now: <equipped> (...) · ±N"
  comparison line (weapons compare vs the active weapon even before any weapon
  item drops); SKIPPING a draft grants permanent training
  (`skipTrainingBudget(level)`, base 0.9 ×1.3 per floor) so no draft is a dead
  choice; and each floor has a minimum loot power
  (`LOOT.minOptionPowerByLevel`: L2 uncommon+, L4+ rare+) so commons dry up at
  depth. The bot's recommendedLootIndex now skips when nothing beats the
  training value. Enemy growth compensated up to `×1.44 hp / ×1.42 dmg`.
- Riposte (2026-07-04) counters EVERY enemy that attacks that turn (was: first
  attacker only) — a real multi-enemy answer for its once-per-room cost.
- Gear effects are never silent: every trigger floats text over the hero
  (`FxEvent` type "buff") and logs. Battle-start effect labels renamed to
  "Block at combat start" / "Bolt all foes at combat start".
- Full run transcript: every log line (with floor/room/round prefix), room
  rosters (enemy hp/dmg), and offered loot drafts are kept in
  `GameState.transcript` (capped 8000 lines). The UI has a "Download run log"
  button (topbar ⤓ and the end screen) — use these logs to tune off real
  player runs.
- GUARD FATIGUE (2026-07-04, answering the guard-spam meta confirmed by an
  external playtester log: heavy 60 / guard 52 / bash 0 / riposte 0 to F4):
  each consecutive round ending with a guard reduces guard's block by
  `COMBAT.guardFatigueDecay` (3), floored at `guardFatigueFloor` (2); a round
  without guarding resets it. Same-round guard stacking is NOT penalized —
  burst-guarding a big telegraph is the intended play. Sim landed at 2.8%
  with no other retune; the bot's guard usage halved.
- ADOPTED after initial decline (designer reversed 2026-07-04): "level-up HP
  should also heal current HP" — see the revised growth-heals pillar above.
- Riposte tooltip uses plain player language first ("negates damage for one
  attack, once per encounter") with the mechanical fine print second —
  discoverability over precision in the headline (designer copy).
- UX BACKLOG from external playtest (owner to prioritize, none blocking):
  distinct battle-vs-exploration presentation; colour-coded stat bars;
  full-stat hover comparison on loot (current -> with-item); per-effect chip
  layout on loot cards; stamina as token icons on action cards; mouse-only and
  gamepad input; highlighted interactive objects/titles in exploration.
  Shipped quick wins: whisper-faint battle grid overlay (.hd-battle-grid),
  bigger HP bar (24px) + stamina pips (18px).
- PROPOSED, awaiting designer (from friend + original spec's dodge hook): a
  risk/reward dodge — e.g. an aggressive stance action that attacks AND rolls
  DEX-scaled % to dodge ALL damage that round (no block). Fits the crit-only
  RNG budget as a chosen gamble; design it in the unique-mechanics session.
- Catalog sprite mislabels are excluded in tools/build_item_templates.py
  (MISLABELED_IDS — e.g. oryx_r10_c18 "Crimson Shield" is visually a sword).
- The skilled sim bot treats Bash and Riposte as premium resources (Riposte
  only on boss/elite pressure; Bash on boss/elite telegraphs or near-lethal
  trash hits) and guards whenever a guard absorbs ~a full block's worth of
  telegraphed damage.
- Combat HUD (2026-07-03): enemy intent chips show the exact number in red,
  enemy plates show numeric HP, hovering an action card previews the damage
  slice on the target's HP bar (with a skull on lethal), and Vitals shows the
  total telegraphed incoming ("IN n") after block. Bash/Riposte cards show
  remaining charges. Focus items are labelled "passive, fires automatically".

Stats: HP 30 base; STR = +1 flat damage per 2 above 5; DEX = crit chance,
guard block, and sweep damage. New `block` stat gear (Warding Idol, `shield`
slot) raises Guard block; wearable slots are now weapon + 4 stat slots.
Max-HP gains no longer heal current HP (`currentHpFromMaxHpGainFraction: 0`)
— potions are the only healing.

Enemy attack-type labels in the mapper include placeholders such as `burn`, `poison`, `freeze`, `shock`, `curse`, `bleed`, `stun`, `stagger`, `sunder`, and `summon`, but most of these are not balanced or implemented yet. They should be treated as planned vocabulary.

## Item + Effect System (2026-07-03)

- Assets guide item identity. Trinket names + sprites come straight from
  `data/oryx_item_catalog.json` via the generated
  `src/features/playtest/engine/itemTemplates.ts`
  (`python3 tools/build_item_templates.py` to regenerate). A family's catalog
  order is its quality ladder (Wooden Shield -> ... -> Tower Shield), mapped to
  rarity when a drop rolls.
- Slots by catalog family: amulet/heart-charm = HP (amulet slot), ring = STR
  (charm), teardrop-gem/gem = DEX (relic), shield = BLOCK (shield), and
  orb/book/rune/scroll/skull/crown = **focus** (pure special-effect "spell"
  trinkets). Wearables: weapon + 5 slots (limit 6).
- 13 gear-effect classes live in `EffectKey` (core.ts): thorns,
  battle_start_block, battle_start_bolt, stamina_on_kill, heal_on_kill,
  heal_on_clear, deny_bonus, counter_bonus, guard_pierce_block, max_stamina,
  potion_boost, crit_chance, crit_splash. Magnitudes scale with rarity via
  `EFFECT_TABLE` in loot.ts; trinkets tier 1-2 have no effect, rare+ roll 1,
  epic 1-2, legendary/unique 2. Signature effects are rarity-gated
  (stamina_on_kill epic+; guard_pierce_block and max_stamina legendary+).
- Every effect class is verified: a deterministic unit test per class in
  core.test.ts, plus `pnpm sim:effects` (tools/simEffectAudit.ts) which runs
  paired-seed sims per effect, writes `data/effect_audit_latest.json`, and
  fails if a class never fires. `pnpm loot:preview` prints sample drops per
  rarity for eyeballing names/effects.
- Every gear effect firing increments `stats.effectTriggers` in GameState.

## Important Design Decisions

- HP is scarce. Crimson Vial, Crimson Potion, and Crimson Elixir are instant
  heal-now loot choices, not wearable gear, and they use mapped Oryx item
  sprites.
- DESIGN PILLAR (revised by designer 2026-07-04, adopting playtester
  feedback): growth heals — training/level-up max-HP gains ALSO restore that
  much current HP (`currentHpFromMaxHpGainFraction: 1`), and equip upgrades
  heal their positive delta. Free regeneration stays OFF:
  `postEncounterHealFraction`/`postLevelHealFraction` remain 0 and
  floor-transition heals remain rejected. Damage growth was tightened to
  `×1.45` to absorb the extra sustain (sim back at ~3.7%).
- Ruling on HP gear (designer, 2026-07-04): EQUIPPING an item that raises max
  HP heals exactly the positive delta over the previous value (upgrading +3 ->
  +15 amulet heals 12; downgrades/sidegrades heal 0). This is the current
  `Math.max(0, newMax - oldMax)` behavior in equipWearableItem — intentional,
  keep it. An earned, slot-costed heal is pillar-compatible.
- Save/resume gotcha (fixed 2026-07-04): NEVER persist or restore
  `GameState.fx` — it is transient animation state. Restoring it wedged the
  UI busy flag under React StrictMode (the release timer gets cleared by the
  simulated unmount) so all actions stayed disabled after resuming mid-combat.
  useGame strips fx on both save and load.
- Game-facing options are characters, not abstract builds. Balanced Swordsman
  is the only unlocked/default character; Axe Bruiser, Needle Duelist, and
  Warder are locked roster hooks.
- Loot choices can include heal-now, max HP, stat gear, or weapons in the same draft.
- Only one weapon can be active at a time.
- Wearable stat gear replaces by slot: HP amulet, strength charm, dexterity relic.
- Wearable inventory is capped at 4 active items as a backstop, but the normal
  active set is weapon plus one item per stat slot.
- Stash is capped at 4 other items; in the sim, weakest items are dropped/stashed automatically.
- Loot drafts should avoid repeated identical effect choices in the same pick set.
- Weak replacement loot can be skipped; weighted loot policy scores delta over
  equipped gear instead of raw item value.
- A small hidden training budget supplies baseline build growth outside gear,
  replacing the old accidental progression from endlessly stacked trinkets.
- DEX contributes crit chance, damage quality, quick tempo, double strike, dodge, and sweep scaling.
- Binary whiffs were softened on 2026-07-02: player misses now become
  low-damage grazes. Enemy attacks always connect. The UI should show damage,
  role, cost, and pressure instead.
- Skilled Auto models the current observed player heuristic: sweep multi-enemy
  rooms, then quick single targets unless heavy has a specific payoff.
- Heavy attack is now a larger payoff action: guard breaker,
  finisher, or weapon-synergy button rather than default single-target damage.
- 2026-07-03 follow-up: React is now the canonical version. The Python/legacy
  randomized power-band sim is historical context at `0.0%` wins over 10K
  skilled runs after enemy attacks were changed to always connect; it is not the
  current balance gate. The current action spread is
  intentionally wider:
  Heavy is `1.60x` damage, costs `2 MP`, breaks guard, and has a weak `0.14x`
  graze; Quick is `0.45x` damage with tempo/control pressure and a `0.30x`
  graze.
- React now uses a seedable randomized power-band room builder with explore-only
  floor entrances, 7 encounters, and an authored boss per floor. Encounter
  archetypes, pairings, support enemies, and high-power three-enemy groups vary
  per run; bosses remain strict by floor.
- Mages/support enemies can heal, shield, and apply invisibility, but should not cast heal when allies are healthy.
- Hero-category creature sprites should never be pushed into enemy game pools or boss slots.
- Legacy browser playtest and Python should be treated as references. If their
  constants disagree with `src/features/playtest/engine/`, React wins.

## Current Balance Snapshot

Machine-readable metrics live in:

- `data/balance_metrics_latest.json` - canonical React-engine batch metrics,
  regenerated by `pnpm sim:balance` (defaults: 5K skilled + 2K random runs,
  seed `920000`; override with `SIM_RUNS` / `SIM_RANDOM_RUNS` / `SIM_SEED` /
  `SIM_OUT`)
- `data/balance_metrics_python_reference.json` - archived historical
  Python/legacy snapshot; not a tuning target

React engine skilled-policy batch (2026-07-04, seed `920000`, 5000 runs, after
bash postpone+re-roll, guard fatigue, and the growth-heals reversal;
`ENEMY_CURVE` `16 hp ×1.44` / `4 dmg ×1.45`, boss `×3.4/×1.35`, elite
`×1.9/×1.3`):

- win rate: `3.90%`
- average rooms cleared: `28.2`
- reach L3: `99.2%`, L4: `80.3%`, L5: `10.9%`
- deaths by room kind: boss `2195`, elite `2169`, then P3/P4 ~130 each —
  premium fights are ~90% of deaths.
- timeouts: `0`

Random-policy batch (2000 runs, same dungeon seeds):

- win rate `0%`, average rooms cleared `3.5` — the mid-floor elite is a hard
  wall for random play (slightly below the "survives much of L1" pillar;
  revisit if manual playtests feel too brutal early).

Interpretation:

- Skilled sits at `3.78%`, on the ~3% target for a first cut of the new model.
  The skilled bot is a greedy one-action policy; treat it as a rough lower
  bound on skilled human play.
- The reach curve is top-heavy: L1-L3 are near-free for the bot and deaths
  wall at L4. Next tuning pass should add early-floor pressure (base damage or
  power-band factors) instead of growth exponents, then re-flatten L4.
- Random play dies mid-L1 (avg ~5 of 9 rooms) and essentially never passes the
  L1 boss (`0.8%`) — slightly harsher than the "survives much of L1" pillar;
  acceptable for now, revisit with the early-floor pass.
- The 40-run seed-9000 skilled summary is snapshot-locked in
  `src/features/playtest/engine/sim.test.ts`. After a deliberate balance
  change, re-lock it (`vitest -u`) and rerun `pnpm sim:balance`.
- For paired-seed policy A/B use `comparePolicies` in `sim.ts`; for
  engine-constant experiments, run `pnpm sim:balance` with the same `SIM_SEED`
  on both versions and diff the JSON (dungeons are identical per seed).
- If the React room model changes, tune floor/boss reach rates, not just final
  win rate.

## Weapon Lift Snapshot

The 3K samples per starting weapon, archived in
`data/balance_metrics_python_reference.json`, are historical context only until
rerun through the React engine:

- Iron Sword: win `2.77%`, L3B `19.80%`, L4B `5.73%`
- Crushing Axe: win `3.20%`, L3B `22.40%`, L4B `6.40%`
- Stunning Axe: win `3.67%`, L3B `22.97%`, L4B `6.90%`
- Heavy Axe: win `3.20%`, L3B `22.30%`, L4B `6.40%`
- Needle Rapier: win `3.97%`, L3B `24.13%`, L4B `6.83%`

Interpretation:

- Starting weapon lift may have changed materially after Riposte and action
  spread updates.
- Still compare boss reach lift when tuning weapon effects; final win rate alone
  hides how much a weapon changes depth.

## Suggested Metrics Going Forward

Track these on every tuning pass:

- `win_rate`
- `avg_rooms_cleared`
- `rooms_p50`, `rooms_p75`, `rooms_p90`, `rooms_p95`, `rooms_p99`
- `reach_l2_rate`, `reach_l3_rate`, `reach_l4_rate`, `reach_l5_rate`
- `reach_l2_boss_rate`, `reach_l3_boss_rate`, `reach_l4_boss_rate`, `reach_l5_boss_rate`
- `clear_l2_boss_rate`, `clear_l3_boss_rate`, `clear_l4_boss_rate`, `clear_l5_boss_rate`
- conditional boss pass rates, such as `l3_boss_clear_given_reached`
- weapon lift versus Iron Sword

## Current Files To Treat As Source

- `data/oryx_item_catalog.json`
- `data/oryx_creature_fx_catalog.json`
- `data/tactical_enemy_visuals.js`
- `data/dungeon_biome_plan.json`
- `data/balance_metrics_latest.json`
- `AGENTS.md`
- `THREAD_HANDOFF.md`

## Deploying (Vercel, 2026-07-04)

- `vercel.json` is checked in: `pnpm build` -> `dist/`, SPA rewrite that
  excludes `data/`, `legacy/`, `room-assets/`, `app-assets/`.
- `pnpm build` copies `data/` into `dist/data` — the game fetches
  `/data/dungeon_room_catalog.json` and `/data/dungeon_plan.json` at runtime
  (both also have bundled fallbacks).
- Production builds show ONLY the Play workspace
  (`src/features/workbench/workspaces.ts` gates on `import.meta.env.PROD`).
  Mappers/Levels/Dungeon/Playtest are the local dev studio; their save
  endpoints live in the Vite mapper-API plugin and cannot work on static
  hosting. `useApiStatus` also skips the `/api/status` poll in prod.
- Verified: the static `dist/` (python http.server, no Vite plugins) boots,
  fetches data, and plays combat with zero console errors and zero /api calls.
- The `dist-static` entry in `.claude/launch.json` serves the built bundle for
  local pre-deploy checks.

## Tests

From `dungeon_balance_core`:

```bash
python3 -m unittest discover tests
```

Latest known passing count: 89 tests.

The native mapper save/normalization logic has its own Node test suite:

```bash
pnpm test:web
```

The React engine has a fast Vitest suite (unit + golden runs + a locked 40-run
sim snapshot) and a slow balance batch that rewrites
`data/balance_metrics_latest.json`:

```bash
pnpm test:engine
pnpm sim:balance
```

If `pnpm` 11 tries to recreate `node_modules` during `pnpm exec`/script
commands, direct binaries are a reliable local check:

```bash
./node_modules/.bin/tsc --noEmit -p tsconfig.json
./node_modules/.bin/tsc --noEmit -p tsconfig.node.json
./node_modules/.bin/vite build
node --test tools/*.test.mjs
```

## Current Next Steps

1. Continue replacing legacy HTML workflows with native React surfaces, using `reports/workbench_architecture.md` as the boundary map.
2. Make mapper attack-type options distinguish implemented vs planned.
3. Done 2026-07-03: `sim.ts` + `pnpm sim:balance` are now the canonical batch
   metrics source; `data/balance_metrics_latest.json` holds React-engine
   skilled + random-policy metrics (Python snapshot archived).
4. Done 2026-07-03: timeout accounting, in-engine `maxCombatRounds`
   enforcement, a random policy, and paired-seed `comparePolicies` landed in
   the sim; `sim.test.ts` now locks a 40-run summary snapshot.
5. Tune the new React randomized power-band room builder with native metrics.
6. Rerun weapon-lift samples through the React runner after the current
   Riposte/action-spread patch.
7. Validate the new midgame reach curve through manual React playtest runs, not only seeded simulation.
8. Update `data/balance_metrics_latest.json` after each major tuning pass.
9. Keep `AGENTS.md` and this handoff updated before switching agents or moving project folders.
