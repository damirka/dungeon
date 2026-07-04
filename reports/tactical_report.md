# Tactical Combat Report

This report covers the first intent-based combat layer. The classic duel
simulator remains as a control; this mode adds visible enemy intents, five
player actions, multi-enemy normal rooms, and instant-consume health potion
drafts.

Command:

```bash
python3 -B - <<'PY'
from dungeon_balance import BalanceConfig
from dungeon_balance.archetypes import DEFAULT_BUILDS, build_by_name
from dungeon_balance.loot import LootConfig
from dungeon_balance.tactical import build_tactical_dungeon, estimate_tactical_loot_win_rate

config = BalanceConfig()
groups = build_tactical_dungeon(config)
loot = LootConfig()
runs = 15000

for build in DEFAULT_BUILDS:
    print(build.name, estimate_tactical_loot_win_rate(build, config, groups, loot, runs=runs, seed=701))

print(
    "random",
    estimate_tactical_loot_win_rate(
        build_by_name("balanced"),
        config,
        groups,
        loot,
        runs=runs,
        seed=1701,
        action_policy="random",
        loot_policy="random",
    ),
)
PY
```

## Tactical Rules

- Enemy intent is visible before the player chooses an action.
- Normal rooms can contain one or two enemies.
- Bosses are currently solo enemies with a repeatable intent cycle.
- Player actions are `attack`, `heavy`, `quick`, `sweep`, and `guard`.
- `quick` can double-strike and can interrupt a targeted heavy intent.
- `heavy` has been nerfed from the earlier pass: lower burst, higher commitment,
  weaker guard bypass, and lower sunder scaling. It should be a payoff button,
  not the default strong attack.
- `sweep` damages every living enemy with a light DEX-scaled strike. Each target
  rolls crit and damage quality independently. Glancing sweep rolls still
  deal small graze damage, so the action always touches every living target.
- `guard` reduces incoming damage from the enemy group, but pierce ignores part
  of the reduction.
- Loot still drops after each cleared encounter, including multi-enemy rooms.
- Health potions can appear beside max-HP items and weapons. They restore
  current HP immediately and do not increase max HP or become wearable gear.
- Wearable stat gear now replaces by slot: HP uses amulet, strength uses charm,
  and dexterity uses relic. Weak replacement offers can be skipped.
- Cleared rooms grant a small hidden training budget, so build growth is not
  dependent on infinitely stacking stat trinkets.
- Skilled Auto now mirrors the observed simple policy: sweep multi-enemy rooms,
  then quick single targets unless heavy has a guard/finisher/weapon payoff.

## Current Gates

Latest React-engine skilled Balanced Swordsman probe, 1000 runs, seed `920000`:

```text
win= 2.30% rooms=19.92
reach L2 boss=80.20% clear L2 boss=54.70%
reach L3 boss=44.10% clear L3 boss=24.90%
reach L4 boss=18.70% reach L5= 7.30%
rooms p50=18 p75=23 p90=31 p95=39 p99=40
```

This pass changed enemy attacks to always connect, retuned enemy damage down,
and kept the React engine near the rough 3% target. Balanced Swordsman is the
only default unlocked character. Stat gear is slot-based, weak loot can be
skipped, and training supplies the baseline growth that stacked trinkets were
previously faking.

Skilled tactical loot progression, 15000 runs:

```text
balanced           win= 0.67% rooms= 5.57 items= 5.56 hp/win= 7.01
survivor           win= 3.27% rooms= 7.26 items= 7.23 hp/win= 8.22
strength-dominant  win= 1.55% rooms= 6.58 items= 6.57 hp/win= 6.41
hp-dominant        win= 1.15% rooms= 6.20 items= 6.19 hp/win= 7.82
dex-dominant       win= 0.14% rooms= 4.94 items= 4.94 hp/win= 5.50
glass-cannon       win= 0.15% rooms= 5.58 items= 5.58 hp/win= 3.94
stonewall          win= 1.11% rooms= 6.21 items= 6.20 hp/win= 7.54
ace-duelist        win= 0.17% rooms= 5.14 items= 5.14 hp/win= 5.63
```

Random tactical action and random loot choice, 15000 runs:

```text
random             win= 0.00% rooms= 3.87 items= 3.87 hp/win= 0.00
```

## Interpretation

- The old target still holds: the best current tactical policy is around 2-3%.
- Random play still collapses early, mostly on the level 1 boss.
- Multi-enemy rooms now have a specific answer in `sweep`, while `quick` owns
  the single-target reliability lane.
- Potions are live but tightly budgeted: default draft weight is low and healing
  is `1.00 HP` per item power, so they soften attrition without replacing max HP.
- HP amulets no longer stack indefinitely; a stronger amulet replaces the old
  one, and bad replacements can be ignored.
- DEX is still underperforming as a dominant build, but `sweep` and `quick`
  provide the first two mechanics that can later support a tempo/evasion item
  package.
