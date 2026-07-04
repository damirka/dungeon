from __future__ import annotations

import argparse

from .archetypes import DEFAULT_BUILDS
from .config import BalanceConfig
from .enemies import build_default_dungeon
from .formulas import project_combat, stat_balance_factor
from .simulator import estimate_win_rate


def _format_pct(value: float) -> str:
    return f"{value * 100:5.1f}%"


def _budget_before_final_boss(config: BalanceConfig) -> float:
    budget = config.dungeon.initial_stat_budget
    for level in range(1, config.dungeon.levels + 1):
        growth = config.dungeon.stat_budget_gain_growth ** (level - 1)
        budget += config.dungeon.encounters_per_level * (
            config.dungeon.stat_budget_gain_per_encounter * growth
        )
        if level < config.dungeon.levels:
            budget += config.dungeon.stat_budget_gain_per_level * growth
    return budget


def run_report(runs: int, seed: int) -> None:
    config = BalanceConfig()
    dungeon = build_default_dungeon(config.dungeon)
    final_boss = dungeon[-1].enemy
    final_boss_budget = _budget_before_final_boss(config)

    print("Dungeon balance report")
    print(f"runs per build: {runs} | seed: {seed} | rooms: {len(dungeon)}")
    print()
    print(
        f"{'build':<18} {'win':>7} {'rooms':>7} {'hp/win':>8} "
        f"{'balance':>8} {'l5 boss margin':>14}"
    )
    print("-" * 72)

    for build in DEFAULT_BUILDS:
        stats = build.stats_at_budget(final_boss_budget, config.stats)
        boss_projection = project_combat(stats, final_boss, build.weapon, config.combat)
        summary = estimate_win_rate(build, config=config, dungeon=dungeon, runs=runs, seed=seed)
        print(
            f"{build.name:<18} "
            f"{_format_pct(summary['win_rate']):>7} "
            f"{summary['avg_rooms_cleared']:7.2f} "
            f"{summary['avg_final_hp_on_win']:8.1f} "
            f"{stat_balance_factor(build.weights):8.2f} "
            f"{boss_projection.survival_margin:14.2f}"
        )


def main() -> None:
    parser = argparse.ArgumentParser(description="Run a baseline dungeon balance report.")
    parser.add_argument("--runs", type=int, default=500, help="Monte Carlo runs per build.")
    parser.add_argument("--seed", type=int, default=7, help="Seed used for deterministic reports.")
    args = parser.parse_args()
    run_report(runs=args.runs, seed=args.seed)


if __name__ == "__main__":
    main()
