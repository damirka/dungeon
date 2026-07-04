import type { JSX } from "react";
import { useGame } from "./useGame";
import { GameStage } from "./GameStage";
import { TitleScreen } from "./Screens";

export function PlayWorkspace(): JSX.Element {
  const game = useGame();

  if (game.state.phase === "title") {
    return (
      <TitleScreen
        onBegin={game.begin}
        musicOn={game.musicOn}
        sfxOn={game.sfxOn}
        onToggleMusic={game.toggleMusic}
        onToggleSfx={game.toggleSfx}
      />
    );
  }

  return <GameStage {...game} />;
}
