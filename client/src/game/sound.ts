import { TUNING } from "@sink-or-sail/shared";
import type { BeepKind } from "./beeps.ts";

/**
 * Stage 4 slice 1: plays the beeps as tones made by the browser's Web Audio (no files). Phones only allow sound
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
