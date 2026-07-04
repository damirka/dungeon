# Dungeon Balance Core

A small, dependency-free balance framework for a turn-based dungeon crawler with
three primary player stats:

- `hp`: scarce run resource. There are no floor heals or passive regen; current
  heal-now drops are Crimson Vial, Crimson Potion, and Crimson Elixir.
- `strength`: damage and fight-duration control.
- `dexterity`: hit reliability, crit chance, dodge pressure, and damage-roll
  quality.

The current target is intentionally harsh:

- The player starts every run at fixed `HP=10`, `STR=5`, `DEX=5`.
- A strong static policy is intended to clear all 5 floors about 3% of the time,
  but current React-engine batch metrics are still pending.
- Random stat choices should handle most normal level-1 encounters but usually
  fail around the level-1 boss, level 2, or the level-2 boss.
- HP remains scarce. Choosing HP can add the HP it creates; direct restoration
  comes only from explicit Crimson consumable drops.

## Quick Start

From this folder:

```bash
pnpm install
pnpm dev
```

Open `http://127.0.0.1:5173/`. React is the canonical version of the game from
here on.

## Workbench App

The editable tools now live behind a React / Vite / Tailwind / TypeScript
workbench. The old standalone pages are kept under `public/legacy/` for
reference and migration only; they are no longer authoritative for playtest
balance.

```bash
pnpm install
pnpm dev
```

Open `http://127.0.0.1:5173/`.

The app is split for parallel work:

- `src/features/play/` for the default playable game surface
- `src/features/playtest/`
- `src/features/mappers/` for separate character, FX, and item mapper lanes
- `src/features/level-building/` for the early native level / room builder

The mapper API is served natively by Vite via the `mapperApi()` plugin in
`tools/mapperApi.mjs` (active in both `pnpm dev` and `pnpm preview`). It handles
`GET /api/status`, `GET /data/*`, `GET /assets/*` (aliased to
`public/room-assets/`), and the `POST /api/save/*` endpoints that persist mapper
edits to `data/`. No separate backend process is required. The legacy pages are
served by Vite from `public/legacy/*.html`.

See `reports/workbench_architecture.md` for the migration plan from legacy HTML
adapters to native React editor surfaces.

## Core Formulas

Player base damage:

```text
base_damage = (base_player_damage + strength_scale * strength^strength_exponent + weapon_flat)
              * weapon_damage_multiplier
```

Player hit chance:

```text
hit = clamp(
  base_hit
  + dex_hit_scale * dexterity^dex_hit_exponent
  - enemy_evasion_scale * enemy_evasion^enemy_evasion_exponent
  + weapon_hit_modifier,
  min_hit,
  max_hit
)
```

Player crit chance:

```text
crit = clamp(
  base_crit
  + dex_crit_scale * dexterity^dex_crit_exponent
  - enemy_evasion_crit_scale * sqrt(enemy_evasion)
  + weapon_crit_modifier,
  0,
  max_crit
)
```

Player damage-roll quality:

```text
quality = clamp(
  dex_quality_scale * dexterity^dex_quality_exponent
  - enemy_evasion_quality_scale * enemy_evasion^enemy_evasion_quality_exponent,
  0,
  max_quality
)
```

Expected player damage per turn:

```text
player_dpt = hit
             * base_damage
             * (1 + damage_variance * quality)
             * (1 + crit * (crit_multiplier - 1))
```

Enemy damage per turn:

```text
enemy_hit = clamp(enemy_accuracy - dexterity * player_dodge_per_dexterity,
                  enemy_min_hit,
                  enemy_max_hit)

enemy_dpt = enemy_damage * enemy_hit
```

Single-combat projection:

```text
expected_rounds_to_kill = enemy_hp / player_dpt
expected_damage_taken = enemy_dpt * max(0, expected_rounds_to_kill - 0.5)
survival_margin = player_max_hp / expected_damage_taken
```

The future React/TypeScript batch runner should be the source of truth for
balance metrics. The existing Python simulator is now historical/control
infrastructure until it is explicitly realigned to React.

## Progression And Scarcity

Enemy pressure scales exponentially:

```text
enemy_hp(level)      = base_hp      * hp_growth^(level - 1)      * archetype_hp_factor
enemy_damage(level)  = base_damage  * damage_growth^(level - 1)  * archetype_damage_factor
enemy_evasion(level) = base_evasion * evasion_growth^(level - 1) * archetype_evasion_factor
```

Player stat budget starts at zero and is gained after encounters:

```text
normal_encounter_gain(level) = encounter_gain * gain_growth^(level - 1)
boss_clear_gain(level)       = boss_gain      * gain_growth^(level - 1)
```

When a stat reward increases max HP, the player receives that newly-created HP.
This is treated as stat investment, not restoration. Passive healing knobs are
zero. Direct restoration exists only as explicit heal-now loot, currently the
Crimson Vial / Potion / Elixir family.

## Current Baseline

`reports/baseline_report.md` contains saved reports. Current 2000-run default:

```text
balanced              0.1%
survivor              2.1%
strength-dominant     0.4%
hp-dominant           0.6%
dex-dominant          0.0%
glass-cannon          0.2%
stonewall             0.5%
ace-duelist           0.2%
```

Random per-point stat choices over 500 sampled policies:

```text
mean win rate:   0.18%
median win rate: 0.00%
mean rooms:      6.49 / 20
```

An exactly balanced random-choice proxy clears all three normal level-1 rooms in
the tested seeds, clears the level-1 boss about 66% of the time, and usually
dies around the level-2 boss.

## Randomness

The expected-value formulas are deterministic. Randomness appears only in rolled
combat simulation:

- Player hit or miss.
- Player crit or non-crit after a hit.
- Enemy hit or miss.
- Damage variance, currently uniform within `+-12%`.
- DEX damage quality, which biases successful player hits toward the high end
  of that variance range.

Historical Python simulations are seeded, so old report commands remain
reproducible. Random build/policy sampling used in reports is a calibration
tool, not a hidden runtime mechanic.

## Loot Mode

The direct stat-budget simulator remains as a control case. The loot simulator
uses the same combat model, but replaces direct stat investment with item drafts:

- Each level creates a luck pool.
- Each cleared encounter spends part of that level's luck pool.
- The spent luck becomes an item's total power budget.
- That power budget converts into concrete properties: currently stat boosts or
  weapon modifiers.
- Drafts are not guaranteed to cover all stats. A draft can naturally be
  `STR / STR / DEX`, `DEX / HP / HP`, or all weapons.
- Item rarities exist as `common`, `uncommon`, `rare`, `very rare`, `epic`, and
  `legendary`.

Future neutral or treasury rooms should use the same luck-pool mechanism, likely
with a larger luck share, larger draft size, or a rarity floor.

Current calibrated loot default:

```text
base_luck_pool:       9.20
luck_pool_growth:     1.50
normal_luck_share:    0.10
boss_luck_share:      0.21
draft_size:           3
```

The saved loot report is in `reports/loot_report.md`.

`reports/oryx_item_mapping.md` and `data/oryx_item_catalog.json` contain a v0
mapping of the purchased Oryx item sprite sheet into item families, slots,
rarity bands, and effect recipes. `public/legacy/oryx_item_catalog_preview.html`
provides a local static browser preview keyed by exact `16x16` sprite
coordinates.

## Tactical Playtest

The tactical simulator adds a richer combat layer beside the classic duel
simulator:

- Enemy intents are visible before the player acts.
- Normal rooms can contain multiple enemies.
- Player actions are `attack`, `heavy`, `quick`, `sweep`, `guard`, and the
  Balanced Swordsman's `Riposte` ability.
- `quick` can double-strike and interrupt a targeted heavy intent.
- `sweep` is the multi-enemy answer; `heavy` is tuned as a high-payoff,
  lower-hit commitment rather than the default.
- `guard` reduces incoming group damage, while pierce ignores part of guard.
- `Riposte` costs 2 MP, reduces incoming damage for the round, and counters the
  first hostile attack attempt even if that enemy misses.
- Current mana is per encounter: max/start 4, regen 1 per round, heavy/quick
  cost 1, sweep/Riposte cost 2, attack/guard are free.
- Loot selection still happens after each cleared encounter.

Historical Python/legacy tactical reference over 10000 runs:

```text
Balanced Swordsman tactical loot: 2.16%
reach L3 boss:                    22.49%
reach L4 boss:                    9.21%
rooms p90/p95/p99:                27 / 31 / 40
```

The machine-readable snapshot is `data/balance_metrics_latest.json`. Older saved
reports in `reports/` are historical unless explicitly refreshed. That snapshot
is also historical until replaced by a native React-engine batch sample. The
native React engine under `src/features/playtest/engine/` is the current game
source of truth.

## Extension Points

- `WeaponProfile`: damage multipliers, hit modifiers, crit modifiers.
- `StatModifier`: additive and multiplicative stat changes for items, passives,
  curses, blessings, and skills.
- `ItemSpec` and `ItemProperty`: power-budgeted loot properties, ready for
  future passives, procs, drawbacks, and special effects.
- `EnemyArchetype`: HP checks, burst checks, dex checks, and future tags.
- `EnemyCurve`: global dungeon difficulty, boss pressure, and exponential growth.
- `BalanceConfig`: the single place to tune combat, progression, and healing.

## Tuning Loop

1. Decide target clear rates by policy family.
2. Run the native React/TypeScript batch simulator once implemented.
3. If random dies before normal level-1 rooms, reduce base enemy damage.
4. If random clears level 2 too often, raise boss damage or level-2 growth.
5. If skilled clears exceed 3-5%, raise late enemy growth, boss pressure, or
   reduce resource tempo.
6. If HP dominates too hard, increase dex dodge value or add enemies that punish
   slow kills.
7. Keep passive healing at zero unless a deliberate restoration system is added;
   current restoration should stay explicit through consumables or future
   authored room outcomes.
