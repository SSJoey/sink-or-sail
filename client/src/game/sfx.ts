import { OWN_CREW_CUES, TUNING, type CueKind, type SoundCue } from "@sink-or-sail/shared";

/**
 * Stage 4 slice 2: how loud a cue plays on this device (0 to 1): full for your own ship's sounds, `othersVolume`
 * for other ships' (wherever they are; Stage 5 may add distance here), and nothing for another crew's own-crew
 * sounds. A spectator (no crew) has no ship of its own.
 */
export function cueVolume(cue: SoundCue, myCrew: number | null): number {
  const mine = myCrew !== null && cue.s.includes(myCrew);
  if (mine) return 1;
  return OWN_CREW_CUES.includes(cue.k) ? 0 : TUNING.client.sfx.othersVolume;
}

/** The longest part of a sound, from its start: how long it plays. */
export function soundSeconds(kind: CueKind): number {
  return Math.max(...TUNING.client.sfx.sounds[kind].map((p) => ("delay" in p ? p.delay : 0) + p.seconds));
}

type Playing = { id: number; volume: number; endsAt: number };

/**
 * Keeps busy moments clear: at most one sound of each kind every `sameKindGapMs`, and at most `maxPlaying` at
 * once. When full, a sound louder than the quietest one playing takes its place (which is stopped); otherwise it
 * isn't played. Times in ms.
 */
export class SfxMixer {
  private lastAt = new Map<CueKind, number>();
  private playing: Playing[] = [];
  private nextId = 1;

  admit(kind: CueKind, volume: number, seconds: number, now: number): { play: true; id: number; stop: number[] } | { play: false; stop: [] } {
    const { sameKindGapMs, maxPlaying } = TUNING.client.sfx;
    if (volume <= 0) return { play: false, stop: [] };
    if (now - (this.lastAt.get(kind) ?? -Infinity) < sameKindGapMs) return { play: false, stop: [] };
    this.playing = this.playing.filter((p) => p.endsAt > now);
    const stop: number[] = [];
    if (this.playing.length >= maxPlaying) {
      const quietest = this.playing.reduce((a, b) => (b.volume < a.volume ? b : a));
      if (quietest.volume >= volume) return { play: false, stop: [] };
      this.playing = this.playing.filter((p) => p !== quietest);
      stop.push(quietest.id);
    }
    const id = this.nextId++;
    this.playing.push({ id, volume, endsAt: now + seconds * 1000 });
    this.lastAt.set(kind, now);
    return { play: true, id, stop };
  }
}
