/**
 * Procedural audio for the dungeon crawler, built on Tone.js.
 *
 * - Per-biome looping background music (bass + arpeggio + pad, drums on deeper
 *   floors / bosses), in dark minor / phrygian modes.
 * - One-shot combat SFX synthesized on the fly (sword hits, crits, the thud of
 *   an enemy landing a blow, casts, loot sparkle, victory, defeat, UI ticks).
 *
 * Everything is lazy: nothing makes sound until `init()` runs inside a user
 * gesture (browser autoplay policy). All calls are no-ops until then, and the
 * whole module is wrapped so a missing/broken audio context never breaks the game.
 */

import * as Tone from "tone";
import type { BiomeId } from "../features/playtest/engine";

export type Sfx =
  | "attack"
  | "heavy"
  | "quick"
  | "sweep"
  | "guard"
  | "ability"
  | "crit"
  | "miss"
  | "hurt"
  | "enemyDown"
  | "target"
  | "loot"
  | "equip"
  | "roomClear"
  | "victory"
  | "defeat"
  | "uiHover"
  | "uiClick"
  | "descend";

interface Track {
  bpm: number;
  bass: string[];
  arp: string[];
  chords: string[][];
  drums: boolean;
}

const TRACKS: Record<string, Track> = {
  forest: {
    bpm: 94,
    bass: ["A1", "A1", "E2", "A1", "F1", "F1", "G1", "E2"],
    arp: ["A3", "C4", "E4", "C4", "B3", "D4", "E4", "G4"],
    chords: [["A3", "C4", "E4"], ["F3", "A3", "C4"], ["G3", "B3", "D4"], ["E3", "G3", "B3"]],
    drums: false,
  },
  sand: {
    bpm: 86,
    bass: ["D2", "D2", "A1", "D2", "Bb1", "Bb1", "C2", "A1"],
    arp: ["D4", "F4", "A4", "F4", "E4", "G4", "A4", "C5"],
    chords: [["D3", "F3", "A3"], ["Bb2", "D3", "F3"], ["C3", "E3", "G3"], ["A2", "C3", "E3"]],
    drums: false,
  },
  volcanic: {
    bpm: 108,
    bass: ["E1", "E1", "E1", "F1", "E1", "G1", "E1", "B1"],
    arp: ["E4", "G4", "B4", "G4", "F4", "A4", "B4", "D5"],
    chords: [["E3", "G3", "B3"], ["F3", "A3", "C4"], ["G3", "B3", "D4"], ["E3", "G3", "B3"]],
    drums: true,
  },
  castle: {
    bpm: 100,
    bass: ["B1", "B1", "F#2", "B1", "G1", "G1", "A1", "F#2"],
    arp: ["B3", "D4", "F#4", "D4", "C#4", "E4", "F#4", "A4"],
    chords: [["B3", "D4", "F#4"], ["G3", "B3", "D4"], ["A3", "C#4", "E4"], ["F#3", "A3", "C#4"]],
    drums: true,
  },
  dungeon: {
    bpm: 92,
    bass: ["C2", "C2", "G1", "C2", "Ab1", "Ab1", "Bb1", "G1"],
    arp: ["C4", "Eb4", "G4", "Eb4", "D4", "F4", "G4", "Bb4"],
    chords: [["C3", "Eb3", "G3"], ["Ab2", "C3", "Eb3"], ["Bb2", "D3", "F3"], ["G2", "Bb2", "D3"]],
    drums: true,
  },
};

function bossVariant(base: Track): Track {
  return {
    bpm: base.bpm + 14,
    bass: base.bass.map((n) => downOctave(n)),
    arp: base.arp,
    chords: base.chords,
    drums: true,
  };
}

function downOctave(note: string): string {
  const m = note.match(/^([A-G]#?b?)(\d)$/);
  if (!m) return note;
  return `${m[1]}${Math.max(0, parseInt(m[2], 10) - 1)}`;
}

class AudioEngine {
  private ready = false;
  private starting = false;
  musicOn = false;
  sfxOn = false;

  private master?: Tone.Volume;
  private musicBus?: Tone.Volume;
  private sfxBus?: Tone.Volume;

  private pad?: Tone.PolySynth;
  private bass?: Tone.MonoSynth;
  private arp?: Tone.Synth;
  private kick?: Tone.MembraneSynth;
  private hat?: Tone.NoiseSynth;

  // sfx instruments
  private blade?: Tone.NoiseSynth;
  private metal?: Tone.MetalSynth;
  private tone1?: Tone.Synth;
  private tone2?: Tone.Synth;
  private thud?: Tone.MembraneSynth;
  private spark?: Tone.PolySynth;

  private loops: Tone.Loop[] = [];
  private track: Track | null = null;
  private step = 0;
  private playing = false;

  async init(): Promise<void> {
    if (this.ready || this.starting) return;
    this.starting = true;
    try {
      await Tone.start();
      const reverb = new Tone.Reverb({ decay: 3.2, wet: 0.28 });
      this.master = new Tone.Volume(-6).toDestination();
      const limiter = new Tone.Limiter(-1).connect(this.master);
      reverb.connect(limiter);

      this.musicBus = new Tone.Volume(-9).connect(reverb);
      this.sfxBus = new Tone.Volume(-5).connect(limiter);

      const musicFilter = new Tone.Filter(2200, "lowpass").connect(this.musicBus);

      this.pad = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: "fatsawtooth", count: 2, spread: 18 },
        envelope: { attack: 0.6, decay: 0.5, sustain: 0.55, release: 2.4 },
        volume: -16,
      }).connect(musicFilter);
      this.bass = new Tone.MonoSynth({
        oscillator: { type: "triangle" },
        filter: { Q: 1, type: "lowpass" },
        envelope: { attack: 0.02, decay: 0.3, sustain: 0.5, release: 0.6 },
        filterEnvelope: { attack: 0.02, decay: 0.2, sustain: 0.4, baseFrequency: 120, octaves: 2.4 },
        volume: -12,
      }).connect(this.musicBus);
      this.arp = new Tone.Synth({
        oscillator: { type: "square" },
        envelope: { attack: 0.005, decay: 0.18, sustain: 0.05, release: 0.2 },
        volume: -24,
      }).connect(musicFilter);
      this.kick = new Tone.MembraneSynth({ octaves: 6, pitchDecay: 0.05, volume: -8 }).connect(this.musicBus);
      this.hat = new Tone.NoiseSynth({ noise: { type: "white" }, envelope: { attack: 0.001, decay: 0.05, sustain: 0 }, volume: -30 }).connect(musicFilter);

      // sfx
      this.blade = new Tone.NoiseSynth({ noise: { type: "white" }, envelope: { attack: 0.001, decay: 0.12, sustain: 0 }, volume: -8 }).connect(
        new Tone.Filter(1800, "bandpass").connect(this.sfxBus)
      );
      this.metal = new Tone.MetalSynth({ envelope: { attack: 0.001, decay: 0.25, release: 0.1 }, harmonicity: 5.1, resonance: 800, volume: -20 }).connect(this.sfxBus);
      this.tone1 = new Tone.Synth({ oscillator: { type: "triangle" }, envelope: { attack: 0.005, decay: 0.2, sustain: 0, release: 0.1 }, volume: -10 }).connect(this.sfxBus);
      this.tone2 = new Tone.Synth({ oscillator: { type: "square" }, envelope: { attack: 0.005, decay: 0.18, sustain: 0, release: 0.1 }, volume: -14 }).connect(this.sfxBus);
      this.thud = new Tone.MembraneSynth({ octaves: 4, pitchDecay: 0.08, envelope: { attack: 0.001, decay: 0.3, sustain: 0 }, volume: -4 }).connect(this.sfxBus);
      this.spark = new Tone.PolySynth(Tone.Synth, { oscillator: { type: "triangle" }, envelope: { attack: 0.005, decay: 0.15, sustain: 0, release: 0.2 }, volume: -16 }).connect(this.sfxBus);

      await reverb.ready;
      this.buildLoops();
      this.ready = true;
    } catch (err) {
      console.warn("audio init failed", err);
    } finally {
      this.starting = false;
    }
  }

  private buildLoops(): void {
    const t = Tone.getTransport();
    t.bpm.value = 96;
    // bass + arp run on 8th notes
    const seq = new Tone.Loop((time) => {
      const tr = this.track;
      if (!tr) return;
      const i = this.step % 8;
      try {
        if (this.bass) this.bass.triggerAttackRelease(tr.bass[i], "8n", time);
        if (this.arp && i % 1 === 0) this.arp.triggerAttackRelease(tr.arp[i], "16n", time + 0.01);
        if (tr.drums && this.kick && (i === 0 || i === 4)) this.kick.triggerAttackRelease("C1", "8n", time);
        if (tr.drums && this.hat && i % 2 === 1) this.hat.triggerAttackRelease("16n", time);
        if (this.pad && i === 0) {
          const chord = tr.chords[Math.floor(this.step / 8) % tr.chords.length];
          this.pad.triggerAttackRelease(chord, "1n", time);
        }
      } catch {
        /* ignore transient scheduling errors */
      }
      this.step += 1;
    }, "8n");
    seq.start(0);
    this.loops.push(seq);
  }

  playMusic(biome: BiomeId, boss = false): void {
    if (!this.ready || !this.musicOn) return;
    const base = TRACKS[biome] || TRACKS.forest;
    this.track = boss ? bossVariant(base) : base;
    const t = Tone.getTransport();
    t.bpm.rampTo(this.track.bpm, 1.5);
    if (!this.playing) {
      this.step = 0;
      t.start();
      this.playing = true;
    }
  }

  stopMusic(): void {
    try {
      Tone.getTransport().stop();
    } catch {
      /* noop */
    }
    this.playing = false;
  }

  setMusic(on: boolean): void {
    this.musicOn = on;
    if (!on) this.stopMusic();
    else if (this.track) this.playMusic((Object.keys(TRACKS).find((k) => TRACKS[k] === this.track) as BiomeId) || "forest");
  }

  setSfx(on: boolean): void {
    this.sfxOn = on;
  }

  private now(): number {
    return Tone.now();
  }

  sfx(name: Sfx): void {
    if (!this.ready || !this.sfxOn) return;
    const n = this.now();
    try {
      switch (name) {
        case "attack":
          this.blade?.triggerAttackRelease("8n", n);
          this.tone1?.triggerAttackRelease("C4", "16n", n + 0.01);
          break;
        case "heavy":
          this.thud?.triggerAttackRelease("C2", "8n", n);
          this.blade?.triggerAttackRelease("8n", n + 0.02);
          break;
        case "quick":
          this.tone2?.triggerAttackRelease("E5", "32n", n);
          this.tone2?.triggerAttackRelease("B5", "32n", n + 0.06);
          break;
        case "sweep":
          this.blade?.triggerAttackRelease("4n", n);
          break;
        case "guard":
          this.metal?.triggerAttackRelease("C3", "8n", n);
          break;
        case "ability":
          this.spark?.triggerAttackRelease(["C4", "G4", "C5"], "8n", n);
          break;
        case "crit":
          this.tone1?.triggerAttackRelease("C5", "16n", n);
          this.tone1?.triggerAttackRelease("G5", "16n", n + 0.05);
          this.tone1?.triggerAttackRelease("C6", "8n", n + 0.1);
          this.blade?.triggerAttackRelease("8n", n);
          break;
        case "miss":
          this.blade?.triggerAttackRelease("16n", n);
          break;
        case "hurt":
          this.thud?.triggerAttackRelease("A1", "8n", n);
          this.tone2?.triggerAttackRelease("Eb3", "16n", n + 0.02);
          break;
        case "enemyDown":
          this.tone1?.triggerAttackRelease("G3", "16n", n);
          this.tone1?.triggerAttackRelease("C3", "8n", n + 0.08);
          break;
        case "target":
          this.tone2?.triggerAttackRelease("A4", "32n", n);
          break;
        case "loot":
          ["C5", "E5", "G5", "C6"].forEach((note, i) => this.tone1?.triggerAttackRelease(note, "16n", n + i * 0.06));
          break;
        case "equip":
          this.spark?.triggerAttackRelease(["E4", "B4"], "8n", n);
          break;
        case "roomClear":
          ["C5", "G5"].forEach((note, i) => this.tone1?.triggerAttackRelease(note, "16n", n + i * 0.08));
          break;
        case "victory":
          ["C4", "E4", "G4", "C5", "E5"].forEach((note, i) => this.spark?.triggerAttackRelease([note], "8n", n + i * 0.14));
          break;
        case "defeat":
          ["C4", "Ab3", "F3", "C3"].forEach((note, i) => this.tone2?.triggerAttackRelease(note, "4n", n + i * 0.22));
          break;
        case "descend":
          this.thud?.triggerAttackRelease("C2", "4n", n);
          this.spark?.triggerAttackRelease(["C3", "G3"], "4n", n + 0.05);
          break;
        case "uiHover":
          this.tone2?.triggerAttackRelease("C5", "64n", n);
          break;
        case "uiClick":
          this.tone2?.triggerAttackRelease("G4", "32n", n);
          break;
      }
    } catch {
      /* ignore audio errors */
    }
  }
}

export const audio = new AudioEngine();
