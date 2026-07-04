# Baseline Report

Command:

```bash
python3 -B -m dungeon_balance.cli --runs 2000 --seed 7
```

Output:

```text
Dungeon balance report
runs per build: 2000 | seed: 7 | rooms: 20

build                  win   rooms   hp/win  balance l5 boss margin
------------------------------------------------------------------------
balanced              0.1%    6.40      4.6     1.00           3.38
survivor              2.1%    8.11      3.8     0.82           3.72
strength-dominant     0.4%    7.07      2.7     0.97           3.52
hp-dominant           0.6%    7.08      2.1     0.97           3.46
dex-dominant          0.0%    6.22      0.0     0.97           3.06
glass-cannon          0.2%    6.78      3.1     0.83           3.25
stonewall             0.5%    8.02      3.0     0.81           3.17
ace-duelist           0.2%    6.29      5.1     0.93           3.07
```

Random per-point policy sample:

```text
sampled policies: 500
runs per policy:  120
mean win rate:    0.18%
median win rate:  0.00%
p90 win rate:     0.83%
mean rooms:       6.49 / 20
median rooms:     6.47 / 20
```

Balanced random-choice proxy over 5000 runs:

```text
win rate:                    0.04%
cleared level-1 normals:   100.00%
cleared level-1 boss:       66.10%
reached mid level 2:        62.10%
```

Deaths by rooms cleared:

```text
3: 1695
4:  102
5:   98
6:  163
7: 1953
8:   44
9:   79
10:  34
11: 739
12:   3
13:   4
14:   3
15:  61
18:   1
19:  19
```

Room mapping: each floor has 3 normal encounters and 1 boss. Death at `3` means
the player cleared the three normal level-1 rooms and died to the level-1 boss;
death at `7` means death to the level-2 boss.
