import { Client, type Room } from "@colyseus/sdk";
import qrcode from "qrcode-generator";
import {
  ClientMessage,
  JoinError,
  Phase,
  GAME_MODES,
  CREWS,
  ROLES,
  ROOM_NAME,
  ServerMessage,
  normaliseCode,
  normaliseName,
  type RejectedMessage,
  type Role,
} from "@sink-or-sail/shared";
import { renderResult, startGame, type GameHandle, type RoomStateView } from "../game/game.ts";
import { joinErrorText, rejectedText } from "./messages.ts";
import { reloadIfNewBuild } from "./newBuild.ts";
import { botShipCount, crewRows, myCrew, readyCount, type LobbyPlayer } from "./crewList.ts";
import { waitingView } from "./waiting.ts";
import { BOT_SHIP_CHOICES, LAYOUT_CHOICES, LIFE_CHOICES, REEF_CHOICES, botShipsText, hazardsText, layoutText, livesShown, settingsText } from "./settings.ts";
import { clearToken, loadToken, saveToken } from "./reconnectToken.ts";
import { codeFromSearch, joinBase, joinLink } from "./joinLink.ts";
import { loadName, saveName } from "./rememberedName.ts";

/** The parts of the server's room state the lobby reads. */
type StateView = RoomStateView;

const CONSENTED = 4000; // Colyseus close code for a deliberate leave.

const roleLabel: Record<Role, string> = { pilot: "Pilot", gunner: "Gunner" };

const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

export function startLobby(): void {
  const client = new Client(location.origin);
  const storage = sessionStorage;

  const joinScreen = byId("join-screen");
  const roomScreen = byId("room-screen");
  const nameInput = byId<HTMLInputElement>("name");
  const codeInput = byId<HTMLInputElement>("code-input");
  const errorLine = byId("error");

  const showError = (text: string) => { errorLine.textContent = text; };
  // Stage 3: the device remembers the last name used (localStorage can be missing or refuse: then it doesn't).
  const nameStore = (() => {
    try {
      return localStorage;
    } catch {
      return null;
    }
  })();
  nameInput.value = loadName(nameStore);
  // A QR code's join link fills in the room code; the player only types a name.
  const linkedCode = codeFromSearch(location.search);
  if (linkedCode) {
    codeInput.value = linkedCode;
    nameInput.focus();
  }
  let game: GameHandle | null = null;
  /** Stage 3 slice 3: a player waiting out a match is watching it (Watch the match) rather than on the waiting screen. */
  let watching = false;
  let lastPhase = "";
  const stopGame = () => {
    game?.stop();
    game = null;
  };

  function showJoinScreen(): void {
    roomScreen.hidden = true;
    joinScreen.hidden = false;
  }

  // After a server rebuild, a page left open would keep running old code; reload it instead.
  // The reload rejoins the same seat through the saved reconnection token.
  const thisScript = document.querySelector<HTMLScriptElement>('script[type="module"][src]')?.getAttribute("src") ?? null;
  const checkForNewBuild = () =>
    void reloadIfNewBuild(async () => (await fetch("/", { cache: "no-store" })).text(), thisScript, () => location.reload());

  function enterRoom(room: Room): void {
    saveToken(storage, room.reconnectionToken);
    checkForNewBuild();
    joinScreen.hidden = true;
    roomScreen.hidden = false;
    byId("code").textContent = room.roomId;
    byId("status").textContent = "";
    showError("");

    room.onStateChange((state: StateView) => renderRoom(room, state));
    room.onMessage(ServerMessage.Rejected, (message: RejectedMessage) => showError(rejectedText(message)));
    room.onDrop(() => { byId("status").textContent = "Connection lost — reconnecting…"; });
    room.onReconnect(() => {
      saveToken(storage, room.reconnectionToken);
      checkForNewBuild();
      byId("status").textContent = "";
    });
    room.onLeave((code) => {
      stopGame();
      clearToken(storage);
      showJoinScreen();
      if (code !== CONSENTED) showError("You were disconnected from the room.");
    });
    // Stage 3: changing your name between matches (the server checks it is free and that no match is on).
    const nameEdit = byId("name-edit");
    const nameNew = byId<HTMLInputElement>("name-new");
    const closeNameEdit = () => { nameEdit.hidden = true; byId("name-change").hidden = false; };
    byId("name-change").onclick = () => {
      nameNew.value = byId("my-name").textContent ?? "";
      nameEdit.hidden = false;
      byId("name-change").hidden = true;
      nameNew.focus();
    };
    byId("name-cancel").onclick = closeNameEdit;
    byId("name-save").onclick = () => {
      showError("");
      const name = normaliseName(nameNew.value);
      if (name === null) {
        showError(joinErrorText(new Error(JoinError.InvalidName)));
        return;
      }
      room.send(ClientMessage.SetName, { name });
      closeNameEdit();
    };
    byId("leave").onclick = () => { void room.leave(); };
    // Stage 3 crews: switch role in your crew, find a partner, leave your crew, and Ready.
    for (const role of ROLES) byId(`role-${role}`).onclick = () => takeSeat(room, myCrewNow ?? 0, role);
    byId("find-partner").onclick = () => { showError(""); room.send(ClientMessage.FindPartner); };
    byId("leave-crew").onclick = () => { showError(""); room.send(ClientMessage.LeaveCrew); };
    // Stage 3 slice 9: a bot takes your crew's free role, or leaves it (also on the waiting screen, for the next round).
    byId("play-bot").onclick = () => { showError(""); room.send(ClientMessage.PlayWithBot); };
    byId("remove-bot").onclick = () => { showError(""); room.send(ClientMessage.RemoveBot); };
    byId("w-bot").onclick = () => room.send(ClientMessage.PlayWithBot);
    byId("w-remove-bot").onclick = () => room.send(ClientMessage.RemoveBot);
    // Stage 3 slice 3: setting up your crew for the next round while waiting out a match.
    for (const role of ROLES) byId(`w-role-${role}`).onclick = () => room.send(ClientMessage.SetNextRole, { role });
    // Stage 3 slice 8: watching instead of playing, and back.
    byId("watch-instead").onclick = () => { showError(""); room.send(ClientMessage.Watch); };
    byId("play-next").onclick = () => { showError(""); room.send(ClientMessage.PlayNextRound); };
    byId("w-alone").onclick = () => room.send(ClientMessage.PairWith, { player: "" });
    byId("w-watch").onclick = () => {
      watching = true;
      renderRoom(room, room.state as StateView);
    };
    byId("ready").onclick = () => room.send(ClientMessage.SetReady, { ready: byId("ready").getAttribute("aria-pressed") !== "true" });
    // Only the host sees Start; the server checks it too.
    byId("start").onclick = () => { showError(""); room.send(ClientMessage.Start); };
    byId<HTMLInputElement>("packs-toggle").onchange = (e) =>
      room.send(ClientMessage.SetPacks, { on: (e.target as HTMLInputElement).checked });
    // Mode and lives (Stage 2): host only, between matches; the server checks both.
    for (const mode of GAME_MODES) byId(`mode-${mode}`).onclick = () => room.send(ClientMessage.SetMode, { mode });
    const lives = byId<HTMLSelectElement>("lives-select");
    lives.replaceChildren(...LIFE_CHOICES.map((n) => new Option(String(n), String(n))));
    lives.onchange = () => room.send(ClientMessage.SetLives, { lives: Number(lives.value) });
    byId<HTMLInputElement>("hazards-toggle").onchange = (e) =>
      room.send(ClientMessage.SetHazards, { on: (e.target as HTMLInputElement).checked });
    const reefs = byId<HTMLSelectElement>("reefs-select");
    reefs.replaceChildren(...REEF_CHOICES.map((c) => new Option(c.label, c.value)));
    reefs.onchange = () => room.send(ClientMessage.SetReefs, { reefs: reefs.value });
    const layout = byId<HTMLSelectElement>("layout-select");
    layout.replaceChildren(...LAYOUT_CHOICES.map((c) => new Option(c.label, c.value)));
    layout.onchange = () => room.send(ClientMessage.SetLayout, { layout: layout.value });
    const botShips = byId<HTMLSelectElement>("bot-ships-select");
    botShips.replaceChildren(...BOT_SHIP_CHOICES.map((n) => new Option(String(n), String(n))));
    botShips.onchange = () => room.send(ClientMessage.SetBotShips, { count: Number(botShips.value) });
  }

  /** The QR code for this room (redrawn only when its link changes), or a hint when phones couldn't use one. */
  let qrLink: string | null = null;
  function renderQr(code: string, joinAddress: string): void {
    const base = joinBase(location, joinAddress);
    const link = base ? joinLink(base, code) : null;
    if (link === qrLink) return;
    qrLink = link;
    const box = byId("qr");
    const caption = byId("qr-caption");
    if (!link) {
      box.replaceChildren();
      box.hidden = true;
      delete box.dataset.link;
      caption.textContent = "Phones can't open localhost: open this page at the laptop's Wi-Fi address (hostname -I) to show a QR code here.";
      return;
    }
    const qr = qrcode(0, "M");
    qr.addData(link);
    qr.make();
    // The library builds the SVG from the link's bits only, so it is safe to insert.
    box.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
    box.hidden = false;
    box.dataset.link = link;
    caption.textContent = "Scan to join";
  }

  function renderRoom(room: Room, state: StateView): void {
    const phase = state.phase;
    const matchOn = phase === Phase.Countdown || phase === Phase.Running || phase === Phase.Paused;
    renderQr(room.roomId, state.joinAddress);
    // Stage 3: your name, changeable between matches; remembered on this device whenever it changes.
    const myName = state.players.get(room.sessionId)?.name ?? "";
    if (byId("my-name").textContent !== myName) {
      byId("my-name").textContent = myName;
      if (myName) saveName(nameStore, myName);
    }
    if (matchOn) {
      byId("name-edit").hidden = true;
      byId("name-change").hidden = true;
    } else if (byId("name-edit").hidden) {
      byId("name-change").hidden = false;
    }
    renderCrews(room, state, matchOn);
    // Stage 3 slice 8: a spectator's lobby (the code large, "Join on your phone"); Watch instead / Play next round.
    const spectating = state.players.get(room.sessionId)?.spectator === true;
    roomScreen.classList.toggle("spectating", spectating);
    byId("spectating").hidden = !spectating;
    byId("watch-instead").hidden = spectating || matchOn;
    byId("play-next").hidden = !spectating;

    // The game view runs from the countdown until the player leaves the scoreboard.
    // A countdown straight after "over" is a new match (a fresh game view); after a pause it's a resume.
    if (phase === Phase.Countdown && lastPhase === Phase.Over && game) stopGame();
    // A player waiting out the match sees the game only while watching it (Back returns to the waiting screen).
    const me = state.players.get(room.sessionId);
    const spectator = me?.spectator === true;
    const waiting = matchOn && me?.crew === undefined && !spectator;
    if (!matchOn) watching = false;
    // A spectator who chose Play next round during a match waits for it now: back to the waiting screen.
    if (game && waiting && !watching) stopGame();
    if (matchOn && !game && (!waiting || watching)) {
      game = startGame(room, () => {
        watching = false;
        stopGame();
      });
    }
    if (phase === Phase.Waiting && game) stopGame();
    lastPhase = phase;

    const isHost = state.hostId === room.sessionId;
    const start = byId<HTMLButtonElement>("start");
    start.hidden = !isHost;
    start.disabled = matchOn;

    // Packs on/off: the host's checkbox (between matches, applies from the next match); others see the setting.
    byId("packs-host").hidden = !isHost;
    const toggle = byId<HTMLInputElement>("packs-toggle");
    toggle.checked = state.packsEnabled;
    toggle.disabled = matchOn;
    byId("packs-status").textContent = isHost ? "" : `Packs: ${state.packsEnabled ? "on" : "off"}`;

    // Mode and lives: the host's buttons and dropdown (between matches); others see the settings.
    byId("mode-host").hidden = !isHost;
    for (const mode of GAME_MODES) {
      const button = byId<HTMLButtonElement>(`mode-${mode}`);
      button.setAttribute("aria-pressed", String(state.mode === mode));
      button.disabled = matchOn;
    }
    byId("lives-host").hidden = !livesShown(state.mode);
    const lives = byId<HTMLSelectElement>("lives-select");
    lives.value = String(state.lives);
    lives.disabled = matchOn;
    byId("mode-status").textContent = isHost ? "" : settingsText(state.mode, state.lives);

    // Hazards and reefs: the host's checkbox and dropdown (reefs greyed out with hazards off); others see the settings.
    byId("hazards-host").hidden = !isHost;
    byId("reefs-host").hidden = !isHost;
    const hazards = byId<HTMLInputElement>("hazards-toggle");
    hazards.checked = state.hazardsEnabled;
    hazards.disabled = matchOn;
    const reefs = byId<HTMLSelectElement>("reefs-select");
    reefs.value = state.reefs;
    reefs.disabled = matchOn || !state.hazardsEnabled;
    byId("hazards-status").textContent = isHost ? "" : hazardsText(state.hazardsEnabled, state.reefs);

    // Layout: the host's dropdown; others see the setting. With Random, everyone sees what it picked.
    byId("layout-host").hidden = !isHost;
    const layout = byId<HTMLSelectElement>("layout-select");
    layout.value = state.layout;
    layout.disabled = matchOn;
    const picked = phase === Phase.Waiting ? null : state.matchLayout;
    const layoutLine = layoutText(state.layout, picked);
    byId("layout-status").textContent = !isHost || (state.layout === "random" && picked) ? layoutLine : "";

    // Stage 3 slice 10: bot ships: the host's dropdown; others see the setting; everyone sees when fewer fit.
    byId("bot-ships-host").hidden = !isHost;
    const botShips = byId<HTMLSelectElement>("bot-ships-select");
    botShips.value = String(state.botShips);
    botShips.disabled = matchOn;
    const crewed: LobbyPlayer[] = [];
    state.players.forEach((pl, id) => crewed.push({ id, name: pl.name, crew: pl.crew, role: pl.role, ready: pl.ready, connected: pl.connected, bot: pl.bot }));
    const fits = botShipCount(crewed);
    byId("bot-ships-status").textContent = !isHost || fits < state.botShips ? botShipsText(state.botShips, fits) : "";
    byId("match").textContent = matchOn
      ? "Match on"
      : isHost ? "" : "Waiting for the host to start";

    const lastResult = byId("last-result");
    lastResult.hidden = phase !== Phase.Over;
    if (phase === Phase.Over) renderResult(lastResult, state);
  }

  function takeSeat(room: Room, crew: number, role: Role): void {
    showError("");
    room.send(ClientMessage.TakeSeat, { crew, role });
  }

  /** Stage 3 slice 3: the waiting screen, for a player without a crew while a match is on. */
  function renderWaiting(room: Room, state: StateView, shown: boolean): void {
    byId("waiting").hidden = !shown;
    if (!shown) return;
    const players: { id: string; name: string; crew?: number; nextRole: string; partner: string; withBot: boolean }[] = [];
    state.players.forEach((pl, id) => players.push({ id, name: pl.name, crew: pl.crew, nextRole: pl.nextRole, partner: pl.partner, withBot: pl.withBot }));
    const view = waitingView({
      players, mode: state.matchMode, timeLeft: state.timeLeft, matchStorm: state.matchStorm,
      stormStartsAt: state.stormStartsAt, stormClosedAt: state.stormClosedAt, ships: [...state.ships],
    }, room.sessionId);
    byId("w-afloat").textContent = String(view.afloat);
    byId("w-clock").textContent = view.clock.value;
    byId("w-clock-label").textContent = view.clock.label;
    byId("w-others").textContent = String(view.othersWaiting);
    for (const role of ROLES) byId(`w-role-${role}`).setAttribute("aria-pressed", String(view.nextRole === role));
    byId("w-partner").textContent = view.partnerName ? `Paired with ${view.partnerName}` : view.withBot ? "Playing with a bot" : "Looking for a partner";
    byId("w-alone").hidden = view.partnerName === null;
    byId("w-bot").hidden = view.withBot;
    byId("w-remove-bot").hidden = !view.withBot;
    const pair = byId("w-pair");
    const wanted = view.pairWith.map((o) => o.id).join(",");
    if (pair.dataset.ids !== wanted) {
      pair.dataset.ids = wanted;
      pair.replaceChildren(...view.pairWith.map((other) => {
        const button = document.createElement("button");
        button.textContent = `Pair with ${other.name}`;
        button.onclick = () => room.send(ClientMessage.PairWith, { player: other.id });
        return button;
      }));
    }
  }

  /** This player's crew right now (for the role buttons), or null without one. */
  let myCrewNow: number | null = null;

  /**
   * Stage 3: your crew (its colour, the Pilot and Gunner buttons, Find me a partner, Leave this crew), the crews
   * in the room (with Join), and Ready. Crews are locked during a match; a player without a crew can still Join.
   */
  function renderCrews(room: Room, state: StateView, matchOn: boolean): void {
    const players: LobbyPlayer[] = [];
    state.players.forEach((pl, id) => players.push({ id, name: pl.name, crew: pl.crew, role: pl.role, ready: pl.ready, connected: pl.connected, bot: pl.bot }));
    const mine = myCrew(players, room.sessionId);
    myCrewNow = mine?.crew ?? null;
    byId("my-crew").hidden = mine === null;
    const spectator = state.players.get(room.sessionId)?.spectator === true;
    renderWaiting(room, state, mine === null && matchOn && !spectator);
    // Read by the browser tests: this player's crew (from 0) and role.
    const crewBox = byId("my-crew");
    if (mine) {
      crewBox.dataset.crew = String(mine.crew);
      crewBox.dataset.role = mine.role;
    } else {
      delete crewBox.dataset.crew;
      delete crewBox.dataset.role;
    }
    if (mine) {
      const title = byId("my-crew-title");
      title.textContent = `Your crew: ${mine.label}`;
      title.style.color = mine.colour;
      for (const role of ROLES) {
        const button = byId<HTMLButtonElement>(`role-${role}`);
        const who = mine[role];
        button.setAttribute("aria-pressed", String(mine.role === role));
        // Tap the free role to switch to it; locked during a match.
        button.disabled = matchOn || who !== null;
        byId(`role-${role}-who`).textContent = who ?? (mine.alone ? "Waiting for a partner" : "");
      }
      byId("play-bot").hidden = matchOn || !mine.alone;
      byId("remove-bot").hidden = matchOn || !mine.withBot;
      byId("find-partner").hidden = matchOn || !mine.alone;
      byId("leave-crew").hidden = matchOn || mine.alone || mine.crews >= CREWS.length;
    }

    const list = byId("crew-list");
    list.replaceChildren(
      ...crewRows(players, state.hostId, room.sessionId).map((row) => {
        const item = document.createElement("li");
        item.dataset.crew = String(row.crew);
        const swatch = document.createElement("span");
        swatch.textContent = row.label;
        swatch.style.color = row.colour;
        const names = document.createElement("span");
        names.className = "crew-name";
        names.textContent = row.names;
        const status = document.createElement("span");
        status.textContent = row.status;
        item.append(swatch, names, status);
        // Join a crew with one player: between matches, or (without a crew) during one.
        // (Not for a spectator: Play next round first.)
        const spectating = state.players.get(room.sessionId)?.spectator === true;
        if (row.join && !spectating && (!matchOn || !mine)) {
          const join = document.createElement("button");
          join.textContent = `Join as ${roleLabel[row.join].toLowerCase()}`;
          join.onclick = () => takeSeat(room, row.crew, row.join!);
          item.append(join);
        }
        return item;
      }),
    );

    const me = state.players.get(room.sessionId);
    const ready = byId<HTMLButtonElement>("ready");
    ready.hidden = matchOn || !mine;
    ready.setAttribute("aria-pressed", String(!!me?.ready));
    ready.textContent = me?.ready ? "Ready ✓" : "Ready";
    const count = readyCount(players);
    byId("ready-count").textContent = state.hostId === room.sessionId && !matchOn ? `${count.ready} of ${count.crews} crews ready` : "";
  }

  function readName(): string | null {
    const name = normaliseName(nameInput.value);
    if (name === null) showError(joinErrorText(new Error(JoinError.InvalidName)));
    return name;
  }

  byId("create").onclick = async () => {
    const name = readName();
    if (name === null) return;
    try {
      enterRoom(await client.create(ROOM_NAME, { name }));
    } catch (error) {
      showError(joinErrorText(error));
    }
  };

  // Stage 3 slice 8: join to watch (a TV, a laptop everyone can see), with the same code and a name.
  byId("watch").onclick = async () => {
    const name = readName();
    if (name === null) return;
    const code = normaliseCode(codeInput.value);
    if (code === null) {
      showError("Room codes are 4 letters.");
      return;
    }
    try {
      enterRoom(await client.joinById(code, { name, watch: true }));
    } catch (error) {
      showError(joinErrorText(error));
    }
  };

  byId("join").onclick = async () => {
    const name = readName();
    if (name === null) return;
    const code = normaliseCode(codeInput.value);
    if (code === null) {
      showError("Room codes are 4 letters.");
      return;
    }
    try {
      enterRoom(await client.joinById(code, { name }));
    } catch (error) {
      showError(joinErrorText(error));
    }
  };

  // After a page reload, try to take back the seat we had.
  const token = loadToken(storage);
  if (token) {
    client.reconnect(token)
      .then(enterRoom)
      .catch(() => {
        clearToken(storage);
        showJoinScreen();
      });
  }
}
