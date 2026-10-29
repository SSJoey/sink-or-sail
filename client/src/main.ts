import { unlockSoundOnGestures } from "./game/sound.ts";
import { startLobby } from "./lobby/lobby.ts";

// Stage 4: phones allow sound only after a tap; the first tap or key press on the page switches it on.
unlockSoundOnGestures();
startLobby();
