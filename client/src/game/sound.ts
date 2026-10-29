import { TUNING, type CueKind } from "@sink-or-sail/shared";
import type { BeepKind } from "./beeps.ts";

/** One part of a sound effect (see `TUNING.client.sfx`), with its defaults filled in. */
type Part = { wave: OscillatorType | "noise"; hz: number; toHz: number; seconds: number; delay: number; gain: number };
const parts = (kind: CueKind): Part[] =>
  TUNING.client.sfx.sounds[kind].map((p) => ({
    wave: p.wave,
    hz: p.hz,
    toHz: "toHz" in p ? p.toHz : p.hz,
    seconds: p.seconds,
    delay: "delay" in p ? p.delay : 0,
    gain: "gain" in p ? p.gain : 1,
  }));

/**
 * Stage 4: plays the beeps (slice 1) and the sound effects (slice 2), made by the browser's Web Audio (no files). Phones only allow sound
 * after a tap, so `unlock` runs on the page's taps and key presses; until then (or without Web Audio) nothing plays.
 */
class Sound {
  private context: AudioContext | null = null;

  unlock(): void {
    try {
      this.context ??= new AudioContext();
      if (this.context.state !== "running") void this.context.resume();
    } catch {
      // No Web Audio: the game stays silent.
    }
  }

  play(kind: BeepKind): void {
    const s = TUNING.client.sound;
    switch (kind) {
      case "double":
        this.tone(s.double.hz, s.double.seconds, 0);
        this.tone(s.double.hz, s.double.seconds, s.double.seconds + s.double.gap);
        break;
      case "horn": this.tone(s.horn.hz, s.horn.seconds, 0, "sawtooth"); break;
      default: this.tone(s[kind].hz, s[kind].seconds, 0);
    }
  }

  /** Stage 4 slice 2: plays a sound effect at `volume` (0 to 1) of the effects' volume; returns a way to stop it. */
  playSfx(kind: CueKind, volume: number): () => void {
    const context = this.context;
    if (!context || context.state !== "running") return () => {};
    const sources = parts(kind).map((part) => this.part(context, part, volume * TUNING.client.sfx.volume));
    return () => {
      for (const source of sources) {
        try {
          source.stop();
        } catch {
          // Already ended.
        }
      }
    };
  }

  private part(context: AudioContext, part: Part, volume: number): AudioScheduledSourceNode {
    const start = context.currentTime + part.delay;
    const end = start + part.seconds;
    const gain = context.createGain();
    const peak = volume * part.gain;
    // A short fade in, then down to silence by the end (a natural decay).
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(peak, start + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);
    let source: AudioScheduledSourceNode;
    if (part.wave === "noise") {
      const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * part.seconds), context.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      const noise = context.createBufferSource();
      noise.buffer = buffer;
      const filter = context.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(part.hz, start);
      filter.frequency.exponentialRampToValueAtTime(part.toHz, end);
      noise.connect(filter).connect(gain);
      source = noise;
    } else {
      const oscillator = context.createOscillator();
      oscillator.type = part.wave;
      oscillator.frequency.setValueAtTime(part.hz, start);
      oscillator.frequency.exponentialRampToValueAtTime(part.toHz, end);
      oscillator.connect(gain);
      source = oscillator;
    }
    gain.connect(context.destination);
    source.start(start);
    source.stop(end);
    return source;
  }

  private tone(hz: number, seconds: number, delay: number, wave: OscillatorType = "sine"): void {
    const context = this.context;
    if (!context || context.state !== "running") return;
    const start = context.currentTime + delay;
    const volume = TUNING.client.sound.volume;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = wave;
    oscillator.frequency.value = hz;
    // A short fade in and out, so the tone doesn't click.
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(volume, start + 0.01);
    gain.gain.setValueAtTime(volume, start + seconds - 0.02);
    gain.gain.linearRampToValueAtTime(0, start + seconds);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + seconds);
  }
}

export const sound = new Sound();

/** Unlocks sound at the page's first taps, clicks and key presses (the Join tap, usually). */
export function unlockSoundOnGestures(target: EventTarget = document): void {
  const unlock = () => sound.unlock();
  target.addEventListener("pointerdown", unlock, true);
  target.addEventListener("keydown", unlock, true);
}
