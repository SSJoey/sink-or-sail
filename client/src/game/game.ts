import * as Phaser from "phaser";
import type { Room } from "@colyseus/sdk";
import { ClientMessage, DEFAULT_LAYOUT, LAYOUTS, PACK_LABELS, Phase, TUNING, inStorm, isLayoutId, isReefAmount, reefsFor, rolePack, type PackType, type Role } from "@sink-or-sail/shared";
import { CREW_STYLES } from "./crews.ts";
import { GameScene } from "./GameScene.ts";
import type { ShipEffect } from "./effects.ts";
import { empText, formatClock, livesHtml, packSlotLabel, scoreHtml } from "./hud.ts";
import { BeepClock, type BeepKind } from "./beeps.ts";
import { sound } from "./sound.ts";
import { loadSoundOn, saveSoundOn, soundButtonText } from "./soundSetting.ts";
import { PACK_ICONS } from "./packIcons.ts";
import { startInputSender } from "./inputSender.ts";
import { PackLatch } from "./packLatch.ts";
import { gunnerPackBuzz } from "./packBuzz.ts";
import { SnapshotBuffer, type Frame } from "./interpolation.ts";
import { frameLimit } from "./frameLimit.ts";
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
  results: Iterable<{ ship: number; place: number; sinkings: number; afloatSeconds: number; livesLeft: number; out: boolean }>;
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
  phase: string;
  pausedBy: string;
  countdown: number;
  timeLeft: number;
  winner: number;
}

export interface GameHandle {
  stop(): void;
}

const byId = (id: string) => document.getElementById(id)!;

/** Stage 4: every beep this page has played (all matches), read by the browser smoke tests (they can't hear). */
const played: BeepKind[] = [];

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
  const beepClock = new BeepClock();

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

  const scene = new GameScene({
    frame: (): Frame | null => buffer.sample(performance.now() - TUNING.client.interpolationDelayMs),
    islands: () => {
      const id = (room.state as RoomStateView).matchLayout;
      return LAYOUTS[isLayoutId(id) ? id : DEFAULT_LAYOUT].islands;
    },
    stormRadius: () => {
      const state = room.state as RoomStateView;
      return state.matchStorm ? state.stormRadius : null;
    },
    wrecks: () => {
      const id = (room.state as RoomStateView).matchLayout;
      return LAYOUTS[isLayoutId(id) ? id : DEFAULT_LAYOUT].wrecks;
    },
    reefs: () => {
      const state = room.state as RoomStateView;
      return reefsFor(isLayoutId(state.matchLayout) ? state.matchLayout : DEFAULT_LAYOUT, isReefAmount(state.matchReefs) ? state.matchReefs : "none");
    },
    seat,
    touch,
    setInput: (next) => {
      input = next as { pack?: boolean } | null;
      packLatch.update(!!input?.pack);
    },
    drawn: (frame, effects) => {
      const mine = seat();
      const state = room.state as RoomStateView;
      showMatchOverlays(state, frame, effects, mine?.crew ?? null, { countdown, banner, scoreboard });
      for (const kind of beepClock.update(state)) {
        if (!soundOn) continue;
        sound.play(kind);
        played.push(kind);
        canvasHost.dataset.beeps = played.join(",");
      }
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
      const spectator = state.players.get(room.sessionId)?.spectator === true;
      byId("hud-back").hidden = mine !== null || spectator;
      byId("hud-play-next").hidden = !spectator;
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
      showStormStatus(state, own ?? null, stormStatus);
      // Wrecks still standing as "id:health:pack;…" (pack 1 when it holds one), for the browser smoke tests.
      canvasHost.dataset.wrecks = [...(frame?.wrecks ?? new Map())].map(([id, w]) => `${id}:${Math.round(w.health)}:${w.hasPack ? 1 : 0}`).join(";");
      canvasHost.dataset.torpedoes = String(frame?.torpedoes.size ?? 0);
      // Stage 2 hazards as "id:kind:phase:x,y;…", and the ships a moving storm hides from this player, for the browser smoke tests.
      canvasHost.dataset.hazards = [...(frame?.hazards ?? new Map())].map(([id, h]) => `${id}:${h.kind}:${h.phase}:${Math.round(h.x)},${Math.round(h.y)}`).join(";");
      canvasHost.dataset.hidden = frame ? hiddenShips(frame.ships, frame.hazards, mine?.crew ?? null).join(",") : "";
      // Stage 3 lifebars shown to this player as "ship:fill:colour;…", for the browser smoke tests.
      canvasHost.dataset.lifebars = (frame?.ships ?? [])
        .map((s, id) => (lifebarShown(s, id, mine?.crew ?? null, frame!.hazards) ? `${id}:${lifebarFill(s.health).toFixed(2)}:${lifebarColour(lifebarFill(s.health))}` : ""))
        .filter(Boolean)
        .join(";");
      // Ghosts as "ship:x,y;…", for the browser smoke tests.
      canvasHost.dataset.ghosts = [...(frame?.ghosts ?? new Map())].map(([id, g]) => `${id}:${Math.round(g.x)},${Math.round(g.y)}`).join(";");
      // Ships a kraken holds, for the browser smoke tests.
      canvasHost.dataset.held = frame ? heldShips(frame.hazards).join(",") : "";
      // A short buzz on the gunner's phone when the crew picks up a torpedo or EMP (Android only).
      const heldNow = own?.gunnerPack ?? null;
      if (mine && gunnerPackBuzz(heldBefore, heldNow, mine.role)) navigator.vibrate?.(TUNING.client.gunnerPackVibrateMs);
      heldBefore = heldNow;
      touchLayer.update(mine?.role ?? null, own && mine ? rolePack(own, mine.role) : null, (own?.disabled ?? 0) > 0, !!own?.out);
      // Read by the EMP smoke test: is any ship disabled right now?
      canvasHost.dataset.disabled = (frame?.ships ?? []).map((s) => (s.disabled > 0 ? "1" : "0")).join("");
      rotate.hidden = !(touchLayer.active && isPortrait(window.innerWidth, window.innerHeight));
      updateHud(frame, mine, state.timeLeft, state.matchMode === "lastAfloat");
    },
  });

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: canvasHost,
    backgroundColor: "#1d4f91",
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
    scene,
  });

  return {
    stop() {
      stopSending();
      room.onStateChange.remove(onState);
      game.destroy(true);
      touchLayer.destroy();
      unblockGestures();
      screen.removeEventListener("pointerdown", onFirstTouch, true);
      delete canvasHost.dataset.ships;
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
      delete canvasHost.dataset.disabled;
      delete canvasHost.dataset.shots;
      rotate.hidden = true;
      countdown.hidden = true;
      banner.hidden = true;
      stormStatus.hidden = true;
      scoreboard.hidden = true;
      paused.hidden = true;
      screen.hidden = true;
    },
  };
}

const roleLabel: Record<Role, string> = { pilot: "Pilot", gunner: "Gunner" };

/** Fills a scoreboard element: result title and one row per crew. Also used on the room screen. */
/** The results: the winner, then a table of the crews by place (Stage 3), and the layout played. */
export function renderResult(el: HTMLElement, state: RoomStateView): void {
  const players: PlayerView[] = [];
  state.players.forEach((p) => players.push(p));
  const lastAfloat = state.matchMode === "lastAfloat";
  const title = document.createElement("h2");
  title.textContent = resultTitle(state.winner);
  const layout = document.createElement("p");
  layout.textContent = layoutText(state.layout, state.matchLayout);
  const table = document.createElement("table");
  table.className = "results";
  const head = ["Place", "Crew", "Sinkings", "Time afloat", ...(lastAfloat ? ["Lives left"] : [])];
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
  el.replaceChildren(document.createTextNode("Packs: "), slot(content[0] ?? null), document.createTextNode(" · "), slot(content[1] ?? null));
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

function showMatchOverlays(
  state: RoomStateView,
  frame: Frame | null,
  effects: ShipEffect[],
  ownCrew: number | null,
  els: { countdown: HTMLElement; banner: HTMLElement; scoreboard: HTMLElement },
): void {
  const duration = state.matchMode === "lastAfloat" ? TUNING.lastAfloat.duration : TUNING.match.duration;
  const label = countdownLabel(state.phase, state.countdown, state.timeLeft, duration);
  els.countdown.hidden = label === null;
  if (label !== null && els.countdown.textContent !== label) els.countdown.textContent = label;

  const own = ownCrew !== null ? frame?.ships[ownCrew] : undefined;
  // During the 3-2-1, the banner names the layout (with Random, the one it picked).
  const countingDown = state.phase === Phase.Countdown;
  const showBanner = countingDown || (own?.sunk === true && state.phase === Phase.Running);
  els.banner.hidden = !showBanner;
  if (countingDown) {
    const text = layoutText(state.layout, state.matchLayout);
    if (els.banner.textContent !== text) els.banner.textContent = text;
  } else if (showBanner && own) {
    // A crew that is out (Last Afloat) keeps its banner until the match ends.
    const text = own.out ? outBanner(own.sunkBy, own.sunkCause) : `${sinkBanner(own.sunkBy, own.sunkCause)} · ${respawnText(own.respawnIn)}`;
    if (els.banner.textContent !== text) els.banner.textContent = text;
  }
  if (ownCrew !== null && effects[ownCrew]?.justSank) navigator.vibrate?.(TUNING.client.sinkVibrateMs);

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
  const outside = own !== null && !own.sunk && inStorm(own, state.stormRadius);
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
  const html = lastAfloat ? livesHtml(ships) : scoreHtml(ships.map((ship) => ship.sinkings));
  if (score.innerHTML !== html) score.innerHTML = html;

  if (!seat) {
    role.textContent = watchingLabel(lastAfloat ? "lastAfloat" : "sinkCount");
    crew.textContent = "";
    bar.hidden = true;
    return;
  }
  const style = CREW_STYLES[seat.crew] ?? CREW_STYLES[0];
  role.textContent = roleLabel[seat.role];
  crew.textContent = `${style.symbol} ${style.name}`;
  crew.style.color = style.css;
  bar.hidden = false;
  const energy = frame?.ships[seat.crew]?.energy ?? 0;
  fill.style.width = `${(100 * energy) / TUNING.energy.max}%`;
}
