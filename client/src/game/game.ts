import * as Phaser from "phaser";
import type { Room } from "@colyseus/sdk";
import { ClientMessage, DEFAULT_LAYOUT, PACK_LABELS, Phase, SHIP_TYPE_NAMES, TUNING, inStorm, statsOf, isLayoutId, isReefAmount, packButtonLit, rolePack, seaReefs, spreadLayout, type CueKind, type PackType, type Role, type Sea, type SoundCue } from "@sink-or-sail/shared";
import { CREW_STYLES } from "./crews.ts";
import { GameScene, type SceneLink } from "./GameScene.ts";
import { isBigSea, viewSetting } from "./camera.ts";
import { drawMinimap, minimapDots } from "./minimap.ts";
import { legendRows, legendShown, loadLegendHidden, saveLegendHidden } from "./legend.ts";
import { pickTip, tipShown, tipsFor } from "./tips.ts";
import type { ShipEffect } from "./effects.ts";
import { empText, formatClock, packSlotLabel, standingsRows, standingsShown, topBarScore } from "./hud.ts";
import { BeepClock, type BeepKind } from "./beeps.ts";
import { isDamaged } from "./damageLook.ts";
import { hintsFor, loadUsedHints, saveUsedHints, usedControls, type Hint, type HintSituation, type HintSpot } from "./hints.ts";
import { sound } from "./sound.ts";
import { SfxMixer, cueVolume, soundSeconds } from "./sfx.ts";
import { loadSoundOn, saveSoundOn, soundButtonText } from "./soundSetting.ts";
import { PACK_ICONS } from "./packIcons.ts";
import { startInputSender } from "./inputSender.ts";
import { PackLatch } from "./packLatch.ts";
import { gunnerPackBuzz } from "./packBuzz.ts";
import { SnapshotBuffer, type Frame } from "./interpolation.ts";
import { frameLimit, sceneDelay } from "./frameLimit.ts";
import { heldShips, hiddenShips } from "./hazardLook.ts";
import { lifebarColour, lifebarFill, lifebarShown } from "./lifebar.ts";
import { awardLines, backToLobbyText, countdownLabel, watchingLabel, hauntingText, outBanner, pausedText, respawnText, resultRows, resultTitle, sinkBanner, stormText } from "./matchText.ts";
import { blockGestures, goFullscreenLandscape, isPortrait, isTouchFirst } from "./phone.ts";
import { snapshotFromState, type GameStateView } from "./snapshot.ts";
import { layoutText } from "../lobby/settings.ts";
import { TouchControls } from "./touchControls.ts";
import { createTouchLayer } from "./touchLayer.ts";

export interface PlayerView {
  name: string;
  crew?: number;
  role?: string;
  connected: boolean;
  /** Stage 3: ready for the next match. */
  ready: boolean;
  /** Stage 3 slice 3, while waiting out a match: the role wanted next round, and the partner's session id ("" for none). */
  nextRole: string;
  partner: string;
  /** Stage 3 slice 8: watching (never in a crew). */
  spectator: boolean;
  /** Stage 3 slice 9: a partner bot; and, for a player waiting out a match, Play with a bot chosen for the next round. */
  bot: boolean;
  withBot: boolean;
  /** Stage 5: the ship type this player picks (when they're their crew's picker). */
  shipType: string;
}
export interface RoomStateView extends GameStateView {
  players: {
    get(sessionId: string): PlayerView | undefined;
    forEach(cb: (player: PlayerView, sessionId: string) => void): void;
  };
  hostId: string;
  /** Stage 3: the last match's awards (at most one per crew). */
  awards: Iterable<{ award: string; ship: number; detail: string }>;
  /** Stage 3: the last match's results, one per ship. */
  results: Iterable<{ ship: number; type: string; place: number; sinkings: number; afloatSeconds: number; livesLeft: number; out: boolean }>;
  /** Stage 3: the laptop's Wi-Fi address for the QR code, or "". */
  joinAddress: string;
  packsEnabled: boolean;
  /** Stage 3 slice 10: the host's bot ships setting (as many as fit join the crews). */
  botShips: number;
  /** Room settings for the next match (Stage 2). */
  mode: string;
  lives: number;
  /** The mode of the current (or last) match. */
  matchMode: string;
  /** The layout setting ("random" or a layout id) and the current (or last) match's layout. */
  layout: string;
  matchLayout: string;
  /** Hazards on/off and the reefs setting for the next match; the reefs of the current (or last) match. */
  hazardsEnabled: boolean;
  reefs: string;
  matchReefs: string;
  /** Stage 2 closing storm: whether the match has one, its times and the safe circle's radius now. */
  matchStorm: boolean;
  stormStartsAt: number;
  stormClosedAt: number;
  stormRadius: number;
  /** Stage 5: the current (or last) match's sea. */
  seaWidth: number;
  seaHeight: number;
  phase: string;
  pausedBy: string;
  countdown: number;
  timeLeft: number;
  winner: number;
}

export interface GameHandle {
  stop(): void;
  /** Stage 4 slice 2: a tick's sound cues from the server. */
  cues(cues: readonly SoundCue[]): void;
}

const byId = (id: string) => document.getElementById(id)!;

/** Stage 5: the match's sea from the room state (today's sea until a match says otherwise). */
const seaOf = (state: RoomStateView): Sea => ({ width: state.seaWidth || TUNING.sea.width, height: state.seaHeight || TUNING.sea.height });

/** Stage 4: every beep this page has played (all matches), read by the browser smoke tests (they can't hear). */
const played: BeepKind[] = [];
/** Stage 4 slice 2: the sound effects this page played, for the browser tests too. */
const playedSfx: CueKind[] = [];

/**
 * Stage 5 slice 3: one Phaser game and scene for the whole visit, made with the first game view; each match's view
 * attaches to it, and between matches it sleeps. `made` counts the games made (read by the browser tests).
 */
let kept: { game: Phaser.Game; scene: GameScene } | null = null;
let made = 0;

function keptScene(parent: HTMLElement): { game: Phaser.Game; scene: GameScene } {
  if (kept) {
    kept.game.loop.wake();
    // The page may have changed size while the game view was hidden.
    kept.game.scale.refresh();
    return kept;
  }
  const scene = new GameScene();
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    // Stage 4: the chart's deep blue around the sea (the sea itself is drawn by the scene).
    backgroundColor: "#1f4a63",
    // Touch is handled by our own touch layer. Phaser's touch input listens on the whole window,
    // so a thumb on the aiming stick would also count as a pressed mouse button (and fire).
    input: { touch: false },
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: TUNING.sea.width,
      height: TUNING.sea.height,
    },
    // Browser tests only: ?fps=20 draws less often, to keep a busy test machine responsive.
    ...(frameLimit(location.search) !== undefined && { fps: { limit: frameLimit(location.search) } }),
    // Browser tests only: ?sceneDelay=… starts the scene late, like a slow device loading the sea.
    scene: sceneDelay(location.search) === undefined ? scene : [],
  });
  if (sceneDelay(location.search) !== undefined) setTimeout(() => game.scene.add("game", scene, true), sceneDelay(location.search));
  made += 1;
  parent.dataset.games = String(made);
  kept = { game, scene };
  return kept;
}

/**
 * Shows the game view from the countdown to the scoreboard: draws the sea, sends this player's input,
 * and shows the countdown, sink banner and end-of-match scoreboard. `onExit` runs on "Back to room".
 */
export function startGame(room: Room, onExit: () => void): GameHandle {
  const buffer = new SnapshotBuffer();
  const onState = (state: RoomStateView) => buffer.push(snapshotFromState(state, performance.now()));
  room.onStateChange(onState);
  onState(room.state as RoomStateView);

  const seat = (): { crew: number; role: Role } | null => {
    const me = (room.state as RoomStateView).players.get(room.sessionId);
    if (!me || me.crew === undefined || me.role === undefined) return null;
    return { crew: me.crew, role: me.role as Role };
  };

  let input: { pack?: boolean } | null = null;
  let heldBefore: PackType | null = null;
  const packLatch = new PackLatch();
  const stopSending = startInputSender(
    () => (input === null ? null : { ...input, pack: packLatch.take() }),
    (message) => room.send(ClientMessage.Input, message),
    TUNING.client.inputRate,
  );

  const screen = byId("game-screen");
  const canvasHost = byId("game");
  const rotate = byId("rotate");
  const countdown = byId("countdown");
  const banner = byId("banner");
  const stormStatus = byId("storm-status");
  const scoreboard = byId("scoreboard");
  const standings = byId("standings");
  const paused = byId("paused");
  screen.hidden = false;
  byId("back-to-room").onclick = onExit;
  // Stage 3: the host plays again at once (same crews and settings); the results close by themselves after a while.
  byId("play-again").onclick = () => room.send(ClientMessage.Start);
  let overSince: number | null = null;
  // Stage 3 slice 3: a player watching while they wait goes back to the waiting screen.
  byId("hud-back").onclick = onExit;
  // Stage 3 slice 8: a spectator asks to play the next round (they then wait for it).
  byId("hud-play-next").onclick = () => room.send(ClientMessage.PlayNextRound);

  // Pause: any seated player. Resume and Exit: host only (the server checks both).
  const endMatch = () => {
    if (window.confirm("End the match now?")) room.send(ClientMessage.EndMatch);
  };
  byId("hud-pause").onclick = () => room.send(ClientMessage.Pause);
  byId("hud-exit").onclick = endMatch;
  byId("resume").onclick = () => room.send(ClientMessage.Resume);
  byId("paused-exit").onclick = endMatch;

  // Stage 4 slice 1: the countdown beeps, and the speaker switch remembered on this device.
  const soundStore = (() => {
    try {
      return localStorage;
    } catch {
      return null;
    }
  })();
  let soundOn = loadSoundOn(soundStore);
  const soundButton = byId("hud-sound");
  soundButton.textContent = soundButtonText(soundOn);
  soundButton.onclick = () => {
    soundOn = !soundOn;
    saveSoundOn(soundStore, soundOn);
    soundButton.textContent = soundButtonText(soundOn);
  };
  // Stage 4 slice 8: control hints, until each control is first used on this device (remembered).
  const usedHints = loadUsedHints(soundStore);
  const hintEls = { left: byId("hint-left"), boost: byId("hint-boost"), fire: byId("hint-fire"), shield: byId("hint-shield"), pack: byId("hint-pack"), keys: byId("hint-keys") };
  let shownHints: Hint[] = [];
  const hideHints = byId("hints-hide");
  hideHints.onclick = () => {
    for (const hint of shownHints) for (const k of hint.keys) usedHints.add(k);
    saveUsedHints(soundStore, usedHints);
  };
  // Stage 5 slice 4: the laptop controls legend (Hide remembered on this device), and one tip per match.
  let legendHidden = loadLegendHidden(soundStore);
  const legend = byId("legend");
  const legendShow = byId("legend-show");
  byId("legend-hide").onclick = () => {
    legendHidden = true;
    saveLegendHidden(soundStore, true);
  };
  legendShow.onclick = () => {
    legendHidden = false;
    saveLegendHidden(soundStore, false);
  };
  const tip = byId("tip");
  let tipText: string | null | undefined;
  const beepClock = new BeepClock();
  // The 3-2-1, the layout banner and the countdown beeps (and the rest of the page: updatePage) run on a loop of their
  // own from the room state, so they don't wait for the sea to load (on a slow device the scene starts late).
  // On animation frames, like drawing (the browser keeps those going on a busy machine, where a timer can lag
  // by over a second), but not Phaser's, which start only once the scene has loaded.
  let countdownLoop = 0;
  const countdownTick = () => {
    countdownLoop = requestAnimationFrame(countdownTick);
    const state = room.state as RoomStateView;
    showCountdown(state, { countdown, banner });
    for (const kind of beepClock.update(state)) {
      if (!soundOn) continue;
      sound.play(kind);
      played.push(kind);
      canvasHost.dataset.beeps = played.join(",");
    }
    updatePage();
  };
  const mixer = new SfxMixer();
  const stoppers = new Map<number, () => void>();

  // Phone controls: shown on touch-first devices, or as soon as anyone touches the screen.
  const touch = new TouchControls(TUNING.client.stickRadius, TUNING.client.stickDeadZone);
  const touchLayer = createTouchLayer(touch);
  if (isTouchFirst()) touchLayer.activate();
  const unblockGestures = blockGestures(screen);
  const onFirstTouch = (e: PointerEvent) => {
    if (e.pointerType !== "touch") return;
    touchLayer.activate();
    void goFullscreenLandscape(document.documentElement);
    screen.removeEventListener("pointerdown", onFirstTouch, true);
  };
  screen.addEventListener("pointerdown", onFirstTouch, true);

  const minimap = byId("minimap") as HTMLCanvasElement;
  const link: SceneLink = {
    // Browser tests only: ?view=0.5 shows half as much sea, so the camera follows and the minimap shows.
    viewScale: viewSetting(location.search),
    sea: () => seaOf(room.state as RoomStateView),
    frame: (): Frame | null => buffer.sample(performance.now() - TUNING.client.interpolationDelayMs),
    // Stage 5: the layout on the match's sea (spread out on a bigger one).
    islands: () => {
      const state = room.state as RoomStateView;
      return spreadLayout(isLayoutId(state.matchLayout) ? state.matchLayout : DEFAULT_LAYOUT, seaOf(state)).islands;
    },
    stormRadius: () => {
      const state = room.state as RoomStateView;
      return state.matchStorm ? state.stormRadius : null;
    },
    wrecks: () => {
      const state = room.state as RoomStateView;
      return spreadLayout(isLayoutId(state.matchLayout) ? state.matchLayout : DEFAULT_LAYOUT, seaOf(state)).wrecks;
    },
    reefs: () => {
      const state = room.state as RoomStateView;
      return seaReefs(isLayoutId(state.matchLayout) ? state.matchLayout : DEFAULT_LAYOUT, seaOf(state), isReefAmount(state.matchReefs) ? state.matchReefs : "none");
    },
    chartKey: () => {
      const state = room.state as RoomStateView;
      return `${state.matchLayout}:${state.matchReefs}:${state.seaWidth}x${state.seaHeight}`;
    },
    chartDrawn: (marks) => {
      // Read by the browser smoke tests: the layout drawn and how many waves, palms and reef marks it has.
      canvasHost.dataset.chart = `${(room.state as RoomStateView).matchLayout}:${marks.waves}:${marks.palms}:${marks.reefMarks}`;
    },
    seat,
    // Stage 5 slice 7: the room's players, for the crews' name labels.
    players: () => roomPlayers(room.state as RoomStateView),
    touch,
    setInput: (next) => {
      input = next as { pack?: boolean } | null;
      packLatch.update(!!input?.pack);
    },
    drawn: (frame, effects, view, labels) => {
      // What the scene drew (the rest of the page updates on its own loop, see updatePage).
      const mine = seat();
      const state = room.state as RoomStateView;
      // Stage 5 slice 3: the part of the sea in view, and the minimap while the sea is bigger than the view.
      canvasHost.dataset.view = [view.x, view.y, view.width, view.height].map(Math.round).join(",");
      const sea = seaOf(state);
      const big = isBigSea(sea, view);
      minimap.hidden = !big;
      if (big) {
        const dots = frame ? minimapDots(frame.ships, frame.hazards, mine?.crew ?? null) : [];
        drawMinimap(minimap, TUNING.client.minimap, {
          sea,
          islands: link.islands(),
          reefs: link.reefs(),
          stormRadius: link.stormRadius(),
          hazards: frame?.hazards ?? new Map(),
          dots,
          view,
        });
        // Read by the browser smoke tests: the crews shown as dots.
        minimap.dataset.dots = dots.map((d) => d.crew).join(",");
      }
      if (mine && effects[mine.crew]?.justSank) navigator.vibrate?.(TUNING.client.sinkVibrateMs);
      // Read by the browser smoke tests (a canvas has no elements to inspect).
      canvasHost.dataset.ships = String(frame?.ships.filter((s) => !s.sunk).length ?? 0);
      canvasHost.dataset.shots = String(frame?.shots.size ?? 0);
      canvasHost.dataset.layout = state.matchLayout;
      const own = mine ? frame?.ships[mine.crew] : undefined;
      if (own) {
        canvasHost.dataset.ownX = String(Math.round(own.x));
        canvasHost.dataset.ownY = String(Math.round(own.y));
      }
      // Packs on the water as "type@x,y;…", for the browser smoke tests.
      canvasHost.dataset.packs = [...(frame?.packs.values() ?? [])]
        .filter((p) => !p.signalled)
        .map((p) => `${p.type}@${Math.round(p.x)},${Math.round(p.y)}`)
        .join(";");
      canvasHost.dataset.mines = String(frame?.mines.size ?? 0);
      if (own) canvasHost.dataset.ownHealth = String(Math.round(own.health));
      // Stage 5: each ship's type, for the browser smoke tests.
      canvasHost.dataset.types = (frame?.ships ?? []).map((s) => s.type).join(",");
      // Wrecks still standing as "id:health:pack;…" (pack 1 when it holds one), for the browser smoke tests.
      canvasHost.dataset.wrecks = [...(frame?.wrecks ?? new Map())].map(([id, w]) => `${id}:${Math.round(w.health)}:${w.hasPack ? 1 : 0}`).join(";");
      canvasHost.dataset.torpedoes = String(frame?.torpedoes.size ?? 0);
      // Stage 2 hazards as "id:kind:phase:x,y;…", and the ships a moving storm hides from this player, for the browser smoke tests.
      canvasHost.dataset.hazards = [...(frame?.hazards ?? new Map())].map(([id, h]) => `${id}:${h.kind}:${h.phase}:${Math.round(h.x)},${Math.round(h.y)}`).join(";");
      canvasHost.dataset.hidden = frame ? hiddenShips(frame.ships, frame.hazards, mine?.crew ?? null).join(",") : "";
      // Stage 3 lifebars shown to this player as "ship:fill:colour;…", for the browser smoke tests.
      canvasHost.dataset.lifebars = (frame?.ships ?? [])
        .map((s, id) => (lifebarShown(s, id, mine?.crew ?? null, frame!.hazards) ? `${id}:${lifebarFill(s.health, statsOf(s).maxHealth).toFixed(2)}:${lifebarColour(lifebarFill(s.health, statsOf(s).maxHealth))}` : ""))
        .filter(Boolean)
        .join(";");
      // Stage 4: the ships this player sees damaged (below a quarter of full health), for the browser smoke tests.
      canvasHost.dataset.damaged = (frame?.ships ?? [])
        .flatMap((s, id) => (isDamaged(s) && lifebarShown(s, id, mine?.crew ?? null, frame!.hazards) ? [id] : []))
        .join(",");
      // Stage 5 slice 7: the name labels shown, "crew:symbol names;…" (a ghost's "gcrew:…"), for the browser smoke tests.
      canvasHost.dataset.labels = labels.join(";");
      // Ghosts as "ship:x,y;…", for the browser smoke tests.
      canvasHost.dataset.ghosts = [...(frame?.ghosts ?? new Map())].map(([id, g]) => `${id}:${Math.round(g.x)},${Math.round(g.y)}`).join(";");
      // Ships a kraken holds, for the browser smoke tests.
      canvasHost.dataset.held = frame ? heldShips(frame.hazards).join(",") : "";
      // A short buzz on the gunner's phone when the crew picks up a torpedo or EMP (Android only).
      const heldNow = own?.gunnerPack ?? null;
      if (mine && gunnerPackBuzz(heldBefore, heldNow, mine.role)) navigator.vibrate?.(TUNING.client.gunnerPackVibrateMs);
      heldBefore = heldNow;
      // Read by the EMP smoke test: is any ship disabled right now?
      canvasHost.dataset.disabled = (frame?.ships ?? []).map((s) => (s.disabled > 0 ? "1" : "0")).join("");
    },
  };
  // Stage 5 slice 3: the scene is kept between matches (made with the first game view).
  const { game, scene } = keptScene(canvasHost);
  scene.attach(link);

  /**
   * Everything on the page outside the sea (2026-10-30): the banner and results, pause controls, hints, the storm
   * status, the phone controls, the rotate screen and the top bar. It runs on the countdown's own loop from the
   * latest snapshots, not on the scene's frames, so on a slow device it shows before the sea has loaded.
   */
  function updatePage(): void {
    const frame = buffer.sample(performance.now() - TUNING.client.interpolationDelayMs);
    const mine = seat();
    const state = room.state as RoomStateView;
    showMatchOverlays(state, frame, mine?.crew ?? null, { banner, scoreboard });
    // A host who only watches can still pause (Stage 3 slice 8).
    showPauseControls(state, mine !== null || state.hostId === room.sessionId, state.hostId === room.sessionId, paused);
    // Stage 3 results: Play again for the host; everyone back to the lobby after a while.
    if (state.phase === Phase.Over) {
      overSince ??= performance.now();
      const left = TUNING.client.resultsSeconds - (performance.now() - overSince) / 1000;
      if (left <= 0) {
        onExit();
        return;
      }
      const isHost = state.hostId === room.sessionId;
      byId("play-again").hidden = !isHost;
      byId("results-wait").textContent = isHost ? "" : "Waiting for the host to play again";
      byId("results-countdown").textContent = backToLobbyText(left);
    } else {
      overSince = null;
    }
    shownHints = showHints(state, frame, mine, input, touchLayer.active, usedHints, soundStore, hintEls);
    const playing = state.phase === Phase.Countdown || state.phase === Phase.Running || state.phase === Phase.Paused;
    const ghost = !!(mine && frame?.ships[mine.crew]?.out);
    const shown = legendShown({ seated: mine !== null, playing, phone: touchLayer.active, hidden: legendHidden });
    legend.hidden = !shown;
    legendShow.hidden = !(mine !== null && playing && !touchLayer.active && legendHidden);
    if (shown && mine) {
      const key = `${mine.role}:${ghost}`;
      if (legend.dataset.key !== key) {
        legend.dataset.key = key;
        byId("legend-rows").replaceChildren(...legendRows(mine.role, ghost).map(([k, what]) => {
          const tr = document.createElement("tr");
          tr.append(Object.assign(document.createElement("td"), { textContent: k }), Object.assign(document.createElement("td"), { textContent: what }));
          return tr;
        }));
      }
    }
    // The tip: picked once this match's seat is known, for its role and settings.
    if (tipText === undefined && mine) {
      tipText = pickTip(tipsFor({ role: mine.role, packs: state.packsEnabled, hazards: state.hazardsEnabled, lastAfloat: state.matchMode === "lastAfloat" }));
    }
    const duration = state.matchMode === "lastAfloat" ? TUNING.lastAfloat.duration : TUNING.match.duration;
    tip.hidden = !(tipText && tipShown(state.phase, duration - state.timeLeft));
    if (!tip.hidden && tip.textContent !== tipText) tip.textContent = tipText!;
    hideHints.hidden = shownHints.length === 0;
    const spectator = state.players.get(room.sessionId)?.spectator === true;
    byId("hud-back").hidden = mine !== null || spectator;
    byId("hud-play-next").hidden = !spectator;
    const own = mine ? frame?.ships[mine.crew] : undefined;
    showStormStatus(state, own ?? null, stormStatus);
    touchLayer.update(mine?.role ?? null, own && mine ? rolePack(own, mine.role) : null, (own?.disabled ?? 0) > 0, !!own?.out);
    rotate.hidden = !(touchLayer.active && isPortrait(window.innerWidth, window.innerHeight));
    updateHud(frame, mine, state.timeLeft, state.matchMode === "lastAfloat");
    showStandings(standings, frame, mine?.crew ?? null, state, playing);
  }
  // The first tick at once (not on the next frame), now that everything it updates exists.
  countdownTick();

  return {
    cues(cues) {
      if (!soundOn) return;
      const myCrew = seat()?.crew ?? null;
      for (const cue of cues) {
        const volume = cueVolume(cue, myCrew);
        const seconds = soundSeconds(cue.k);
        const now = performance.now();
        const admitted = mixer.admit(cue.k, volume, seconds, now);
        if (!admitted.play) continue;
        for (const id of admitted.stop) {
          stoppers.get(id)?.();
          stoppers.delete(id);
        }
        stoppers.set(admitted.id, sound.playSfx(cue.k, volume));
        setTimeout(() => stoppers.delete(admitted.id), seconds * 1000 + 100);
        playedSfx.push(cue.k);
        canvasHost.dataset.sfx = playedSfx.slice(-50).join(",");
      }
    },
    stop() {
      stopSending();
      cancelAnimationFrame(countdownLoop);
      room.onStateChange.remove(onState);
      // Stage 5 slice 3: the scene sleeps until the next match's game view (no new game to load then).
      scene.detach();
      game.loop.sleep();
      touchLayer.destroy();
      unblockGestures();
      screen.removeEventListener("pointerdown", onFirstTouch, true);
      delete canvasHost.dataset.ships;
      delete canvasHost.dataset.chart;
      delete canvasHost.dataset.ownX;
      delete canvasHost.dataset.ownY;
      delete canvasHost.dataset.packs;
      delete canvasHost.dataset.mines;
      delete canvasHost.dataset.ownHealth;
      delete canvasHost.dataset.wrecks;
      delete canvasHost.dataset.torpedoes;
      delete canvasHost.dataset.hazards;
      delete canvasHost.dataset.hidden;
      delete canvasHost.dataset.held;
      delete canvasHost.dataset.ghosts;
      delete canvasHost.dataset.lifebars;
      delete canvasHost.dataset.labels;
      delete canvasHost.dataset.damaged;
      delete canvasHost.dataset.disabled;
      delete canvasHost.dataset.shots;
      delete canvasHost.dataset.view;
      delete minimap.dataset.dots;
      minimap.hidden = true;
      tip.hidden = true;
      legend.hidden = true;
      legendShow.hidden = true;
      delete legend.dataset.key;
      rotate.hidden = true;
      countdown.hidden = true;
      banner.hidden = true;
      stormStatus.hidden = true;
      scoreboard.hidden = true;
      standings.hidden = true;
      delete standings.dataset.key;
      paused.hidden = true;
      screen.hidden = true;
    },
  };
}

const roleLabel: Record<Role, string> = { pilot: "Pilot", gunner: "Gunner" };

/** Everyone in the room as a list (the state's players are a map). */
function roomPlayers(state: RoomStateView): PlayerView[] {
  const players: PlayerView[] = [];
  state.players.forEach((p) => players.push(p));
  return players;
}

/**
 * Stage 5 slice 7: a spectator's scoreboard with more than 3 crews, one row per crew by place (symbol and crew name in
 * its colour, players, ship type, score or hearts), while a match is on. Redrawn only when a row changes.
 */
function showStandings(el: HTMLElement, frame: Frame | null, crew: number | null, state: RoomStateView, playing: boolean): void {
  const ships = frame?.ships ?? [];
  el.hidden = !(playing && standingsShown(crew, ships.length));
  if (el.hidden) return;
  const rows = standingsRows(ships, roomPlayers(state), state.matchMode === "lastAfloat");
  const key = JSON.stringify(rows);
  if (el.dataset.key === key) return;
  el.dataset.key = key;
  byId("standings-rows").replaceChildren(...rows.map((r) => {
    const tr = document.createElement("tr");
    tr.dataset.crew = String(r.crew);
    const cell = (text: string, className = "") => Object.assign(document.createElement("td"), { textContent: text, className });
    const name = cell(`${r.symbol} ${r.name}`, "crew");
    name.style.color = r.css;
    tr.append(cell(r.place), name, cell(r.players), cell(r.ship), cell(r.score, "score"));
    return tr;
  }));
}

/** Fills a scoreboard element: result title and one row per crew. Also used on the room screen. */
/** The results: the winner, then a table of the crews by place (Stage 3), and the layout played. */
export function renderResult(el: HTMLElement, state: RoomStateView): void {
  const players = roomPlayers(state);
  const lastAfloat = state.matchMode === "lastAfloat";
  const title = document.createElement("h2");
  title.textContent = resultTitle(state.winner);
  const layout = document.createElement("p");
  layout.textContent = layoutText(state.layout, state.matchLayout);
  const table = document.createElement("table");
  table.className = "results";
  const head = ["Place", "Crew", "Ship", "Sinkings", "Time afloat", ...(lastAfloat ? ["Lives left"] : [])];
  const row = (cells: string[], tag: "th" | "td") => {
    const tr = document.createElement("tr");
    tr.append(...cells.map((text) => Object.assign(document.createElement(tag), { textContent: text })));
    return tr;
  };
  table.append(row(head, "th"), ...resultRows([...state.results], players, lastAfloat).map((cells) => row(cells, "td")));
  // Stage 3 awards: "Sharpshooter · ■ Crew 2 · most hits (7)".
  const awards = document.createElement("ul");
  awards.className = "awards";
  awards.append(...awardLines([...state.awards]).map((a) => {
    const item = document.createElement("li");
    const name = document.createElement("strong");
    name.textContent = a.name;
    item.append(name, ` · ${a.crew} · ${a.detail}`);
    return item;
  }));
  el.replaceChildren(title, table, ...(awards.childElementCount > 0 ? [awards] : []), layout);
}

/**
 * Stage 3 pack icons: the top bar's two slots as icons ("—" when empty), the pilot's first, with their names as hover
 * and spoken text; or a line of text (a ghost crew's haunting meter); or nothing without a seat.
 */
function showPackSlots(el: HTMLElement, content: (PackType | null)[] | string | null): void {
  const key = content === null ? "" : typeof content === "string" ? `text:${content}` : content.join(",");
  if (el.dataset.key === key) return;
  el.dataset.key = key;
  if (content === null || typeof content === "string") {
    el.textContent = content ?? "";
    el.removeAttribute("aria-label");
    el.removeAttribute("title");
    return;
  }
  const label = packSlotLabel(content[0] ?? null, content[1] ?? null);
  el.setAttribute("aria-label", label);
  el.title = label;
  const slot = (pack: PackType | null) => {
    if (!pack) return document.createTextNode("—");
    const img = document.createElement("img");
    img.src = PACK_ICONS[pack];
    img.className = "pack-icon";
    img.alt = PACK_LABELS[pack];
    img.title = PACK_LABELS[pack];
    return img;
  };
  // Stage 4 slice 7: "Packs:" in a label of its own, left out on small screens.
  const name = document.createElement("span");
  name.className = "hud-label";
  name.textContent = "Packs: ";
  el.replaceChildren(name, slot(content[0] ?? null), document.createTextNode(" · "), slot(content[1] ?? null));
}

function showPauseControls(state: RoomStateView, seated: boolean, isHost: boolean, paused: HTMLElement): void {
  const phase = state.phase;
  const playing = phase === Phase.Countdown || phase === Phase.Running;
  byId("hud-pause").hidden = !(seated && playing);
  byId("hud-exit").hidden = !(isHost && (playing || phase === Phase.Paused));

  paused.hidden = phase !== Phase.Paused;
  if (phase !== Phase.Paused) return;
  const text = pausedText(state.pausedBy, isHost);
  const line = byId("paused-text");
  if (line.textContent !== text) line.textContent = text;
  byId("paused-host").hidden = !isHost;
}

/**
 * Stage 4 slice 8: records the controls this frame's input used (remembered on the device), then shows the hints
 * still needed by their controls. Only for a crew member, during the countdown and the match.
 */
function showHints(
  state: RoomStateView,
  frame: Frame | null,
  seat: { crew: number; role: Role } | null,
  input: unknown,
  phone: boolean,
  used: Set<string>,
  store: Storage | null,
  els: Record<HintSpot, HTMLElement>,
): Hint[] {
  const playing = state.phase === Phase.Countdown || state.phase === Phase.Running;
  let hints: Hint[] = [];
  if (seat && playing) {
    const ship = frame?.ships[seat.crew];
    const held = ship ? rolePack(ship, seat.role) : null;
    const duration = state.matchMode === "lastAfloat" ? TUNING.lastAfloat.duration : TUNING.match.duration;
    const situation: HintSituation = {
      role: seat.role,
      phone,
      ghost: ship?.out === true,
      pack: packButtonLit(held, seat.role) ? held : null,
      elapsed: state.phase === Phase.Running ? duration - state.timeLeft : 0,
    };
    const fresh = usedControls(situation, input as Parameters<typeof usedControls>[1]).filter((k) => !used.has(k));
    if (fresh.length) {
      for (const k of fresh) used.add(k);
      saveUsedHints(store, used);
    }
    hints = hintsFor(situation, used);
  }
  for (const [spot, el] of Object.entries(els) as [HintSpot, HTMLElement][]) {
    const hint = hints.find((h) => h.spot === spot);
    el.hidden = !hint;
    if (hint && el.textContent !== hint.text) el.textContent = hint.text;
  }
  return hints;
}

/** The 3-2-1 (and "Go!"), and during it the banner naming the layout (with Random, the one it picked). */
function showCountdown(state: RoomStateView, els: { countdown: HTMLElement; banner: HTMLElement }): void {
  const duration = state.matchMode === "lastAfloat" ? TUNING.lastAfloat.duration : TUNING.match.duration;
  const label = countdownLabel(state.phase, state.countdown, state.timeLeft, duration);
  els.countdown.hidden = label === null;
  if (label !== null && els.countdown.textContent !== label) els.countdown.textContent = label;
  if (state.phase !== Phase.Countdown) return;
  els.banner.hidden = false;
  const text = layoutText(state.layout, state.matchLayout);
  if (els.banner.textContent !== text) els.banner.textContent = text;
}

/** The sinking banner (the countdown's banner is showCountdown's) and the results. */
function showMatchOverlays(
  state: RoomStateView,
  frame: Frame | null,
  ownCrew: number | null,
  els: { banner: HTMLElement; scoreboard: HTMLElement },
): void {
  const own = ownCrew !== null ? frame?.ships[ownCrew] : undefined;
  const countingDown = state.phase === Phase.Countdown;
  const showBanner = own?.sunk === true && state.phase === Phase.Running;
  if (!countingDown) els.banner.hidden = !showBanner;
  if (!countingDown && showBanner && own) {
    // A crew that is out (Last Afloat) keeps its banner until the match ends.
    const text = own.out ? outBanner(own.sunkBy, own.sunkCause) : `${sinkBanner(own.sunkBy, own.sunkCause)} · ${respawnText(own.respawnIn)}`;
    if (els.banner.textContent !== text) els.banner.textContent = text;
  }

  const over = state.phase === Phase.Over;
  // Redrawn when the results arrive or change (they come with the match end).
  const key = [...state.results].map((r) => `${r.ship}:${r.place}`).join(",") + "|" + [...state.awards].map((a) => a.award).join(",");
  if (over && (els.scoreboard.hidden || els.scoreboard.dataset.results !== key)) {
    renderResult(byId("result"), state);
    els.scoreboard.dataset.results = key;
  }
  els.scoreboard.hidden = !over;
}

/** Stage 2 closing storm: the status line at the top of the sea, while a match with the storm is on. */
function showStormStatus(state: RoomStateView, own: { x: number; y: number; sunk: boolean } | null, el: HTMLElement): void {
  const on = state.matchStorm && (state.phase === Phase.Countdown || state.phase === Phase.Running || state.phase === Phase.Paused);
  el.hidden = !on;
  if (!on) return;
  const elapsed = TUNING.lastAfloat.duration - state.timeLeft;
  const outside = own !== null && !own.sunk && inStorm(own, state.stormRadius, seaOf(state));
  const text = stormText(elapsed, { startsAt: state.stormStartsAt, closedAt: state.stormClosedAt }, outside);
  if (el.textContent !== text) el.textContent = text;
  el.classList.toggle("in-storm", outside);
}

function updateHud(frame: Frame | null, seat: { crew: number; role: Role } | null, timeLeft: number, lastAfloat: boolean): void {
  const role = byId("hud-role");
  const crew = byId("hud-crew");
  const bar = byId("hud-energy");
  const fill = byId("hud-energy-fill");

  byId("hud-clock").textContent = formatClock(timeLeft);
  const empLine = byId("hud-emp");
  const emp = seat ? empText(frame?.ships[seat.crew]?.disabled ?? 0) : "";
  if (empLine.textContent !== emp) empLine.textContent = emp;
  const packSlot = byId("hud-pack");
  const crewShip = seat ? frame?.ships[seat.crew] : undefined;
  // Stage 2: a crew that is out sees how haunted its ghost's zone is instead of its (empty) pack slots.
  const ghost = seat && crewShip?.out ? frame?.ghosts.get(String(seat.crew)) : undefined;
  const haunting = seat && ghost && frame!.zones.length > 0 ? hauntingText(frame!.zones[ghost.zone] ?? 0) : null;
  showPackSlots(packSlot, seat ? haunting ?? [crewShip?.pilotPack ?? null, crewShip?.gunnerPack ?? null] : null);
  const score = byId("hud-score");
  const ships = frame?.ships ?? [];
  // Stage 5: with more than 3 crews, a crew member sees their own crew's score and place.
  const html = topBarScore({ sinkings: ships.map((ship) => ship.sinkings), lastAfloat, ships, crew: seat?.crew ?? null });
  if (score.innerHTML !== html) score.innerHTML = html;

  if (!seat) {
    role.textContent = watchingLabel(lastAfloat ? "lastAfloat" : "sinkCount");
    role.style.background = "";
    crew.textContent = "";
    bar.hidden = true;
    return;
  }
  const style = CREW_STYLES[seat.crew] ?? CREW_STYLES[0];
  // Stage 4 slice 7: the role as a tag in the crew colour; the crew name in ink. The Boost button and the lit Pack
  // button's glow use the crew colour too.
  // Stage 5: with the crew's ship type ("Pilot · Cutter").
  const tag = `${roleLabel[seat.role]} · ${SHIP_TYPE_NAMES[crewShip?.type ?? "frigate"]}`;
  if (role.textContent !== tag) role.textContent = tag;
  role.style.background = style.css;
  crew.textContent = `${style.symbol} ${style.name}`;
  document.getElementById("game-screen")!.style.setProperty("--crew", style.css);
  bar.hidden = false;
  const energy = crewShip?.energy ?? 0;
  // Stage 5: the bar is the ship type's own size.
  fill.style.width = `${(100 * energy) / (crewShip ? statsOf(crewShip).energyMax : TUNING.energy.max)}%`;
}
