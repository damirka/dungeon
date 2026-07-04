# Loot Report

Command:

```bash
python3 -B - <<'PY'
from collections import Counter
from statistics import mean

from dungeon_balance import BalanceConfig, build_default_dungeon, estimate_win_rate
from dungeon_balance.archetypes import DEFAULT_BUILDS, build_by_name
from dungeon_balance.loot import LootConfig
from dungeon_balance.simulator import estimate_loot_win_rate, simulate_dungeon_with_loot

config = BalanceConfig()
dungeon = build_default_dungeon(config.dungeon)
loot_config = LootConfig()
runs = 10000

for build in DEFAULT_BUILDS:
    print(build.name, estimate_loot_win_rate(build, config, dungeon, loot_config, runs=runs, seed=701))
PY
```

Loot config:

```text
draft_size:          3
base_luck_pool:      9.20
luck_pool_growth:    1.50
normal_luck_share:   0.10
boss_luck_share:     0.21
luck_variance:       0.22
training_gain_mult:  0.27
```

Current tactical loot structure:

- HP, strength, and dexterity gear occupy separate slots: amulet, charm, relic.
- New gear replaces the active item in that slot instead of stacking forever.
- Weighted loot policy scores the improvement over equipped gear and can skip
  weak replacement drafts.
- A small training budget now supplies baseline build growth outside loot.

Direct stat-budget control, 10000 runs:

```text
balanced           win= 0.06% rooms= 6.44 hp/win= 1.74
survivor           win= 2.13% rooms= 8.27 hp/win= 3.59
strength-dominant  win= 0.72% rooms= 7.09 hp/win= 2.73
hp-dominant        win= 0.31% rooms= 7.07 hp/win= 2.54
dex-dominant       win= 0.05% rooms= 6.22 hp/win= 2.47
glass-cannon       win= 0.36% rooms= 6.79 hp/win= 1.90
stonewall          win= 0.30% rooms= 8.06 hp/win= 3.54
ace-duelist        win= 0.04% rooms= 6.36 hp/win= 3.38
```

Loot-choice progression, 10000 runs:

```text
balanced           win= 1.23% rooms= 6.46 items= 6.45 hp/win= 6.31
survivor           win= 2.99% rooms= 7.27 items= 7.24 hp/win= 7.74
strength-dominant  win= 1.66% rooms= 6.70 items= 6.69 hp/win= 6.50
hp-dominant        win= 2.38% rooms= 7.20 items= 7.18 hp/win= 7.65
dex-dominant       win= 0.12% rooms= 5.59 items= 5.59 hp/win= 4.10
glass-cannon       win= 0.12% rooms= 5.75 items= 5.75 hp/win= 3.32
stonewall          win= 2.28% rooms= 7.24 items= 7.21 hp/win= 7.87
ace-duelist        win= 0.08% rooms= 5.68 items= 5.68 hp/win= 5.37
```

Random loot choice proxy, 10000 runs:

```text
random-loot        win= 0.04% rooms= 5.29 items= 5.29
```

Random loot choice deaths:

```text
R04 L1 Boss:       4047
R05 L2 Encounter:   864
R06 L2 Encounter:   510
R07 L2 Encounter:   529
R08 L2 Boss:       3083
R09 L3 Encounter:   175
R10 L3 Encounter:   130
R11 L3 Encounter:    71
R12 L3 Boss:        526
R13 L4 Encounter:    14
R14 L4 Encounter:     4
R15 L4 Encounter:     2
R16 L4 Boss:         33
R18 L5 Encounter:     2
R19 L5 Encounter:     1
R20 L5 Boss:          5
```

Survivor loot deaths, 10000 runs:

```text
R04 L1 Boss:       2759
R05 L2 Encounter:   525
R06 L2 Encounter:   203
R07 L2 Encounter:   222
R08 L2 Boss:       3277
R09 L3 Encounter:   224
R10 L3 Encounter:   152
R11 L3 Encounter:    62
R12 L3 Boss:       1769
R13 L4 Encounter:    55
R14 L4 Encounter:    26
R15 L4 Encounter:    29
R16 L4 Boss:        260
R17 L5 Encounter:    10
R18 L5 Encounter:    13
R19 L5 Encounter:     6
R20 L5 Boss:        109
```

Survivor chosen item rarity distribution:

```text
common:     54928
uncommon:   16354
rare:        1160
very rare:      5
```

Survivor chosen item tag distribution:

```text
strength:  36841
hp:        31170
dexterity:  4436
swingy:     3500
balanced:   2226
crit:         82
```

Interpretation:

- The first naive loot pool, `base_luck_pool=9.0`, pushed survivor to roughly
  27% wins and broke the hard-core target.
- The current tactical tuning reshapes loot instead of raising enemy damage:
  stat gear is slot-replacement based, weak loot can be skipped, and training
  carries baseline growth. In the latest tactical 10K sample, Balanced Swordsman
  lands at `2.94%` while L3 boss reach is `20.84%`.
- Random loot choice still collapses early, with most deaths concentrated at
  the level 1 boss and level 2 boss.
- Legendary and epic items exist in the model but are not expected in ordinary
  default runs yet. They are reserved for later floors, treasury rooms, special
  bosses, or explicit luck spikes.
