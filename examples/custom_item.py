from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from dungeon_balance import BalanceConfig, build_default_dungeon, estimate_win_rate
from dungeon_balance.archetypes import build_by_name
from dungeon_balance.models import PlayerBuild, StatModifier, WeaponProfile


def main() -> None:
    config = BalanceConfig()
    dungeon = build_default_dungeon(config.dungeon)
    base = build_by_name("strength-dominant")

    relic_build = PlayerBuild(
        name="strength-dominant-with-relic",
        weights=base.weights,
        weapon=WeaponProfile(
            name="relic cleaver",
            damage_multiplier=1.02,
            hit_modifier=-0.01,
            crit_multiplier_modifier=0.02,
        ),
        modifiers=(
            StatModifier(name="vitality charm", add_hp=2),
            StatModifier(name="reckless focus", add_strength=0.5, add_dexterity=-0.3),
        ),
        description="Example of stacking item-like stat and weapon modifiers.",
    )

    for build in (base, relic_build):
        summary = estimate_win_rate(build, config=config, dungeon=dungeon, runs=1000, seed=11)
        print(
            f"{build.name:30} "
            f"win={summary['win_rate'] * 100:5.1f}% "
            f"rooms={summary['avg_rooms_cleared']:5.2f} "
            f"hp/win={summary['avg_final_hp_on_win']:5.1f}"
        )


if __name__ == "__main__":
    main()
