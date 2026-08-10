import { ARMY_SKINS, AUDIO_URLS, DEFAULT_ARMY_SKINS, GUN_AUDIO_URLS, type GunVoice } from "../assets/generated";
import type { Faction, PieceKind } from "../core/types";

type SfxName = "place" | "capture" | "check" | "fanfare";
type BedName = "ambience" | "score" | "tension";

/** How a figure's dying voice is placed in the mix. */
export interface DeathCryOptions {
  /** -1 hard left … 1 hard right — where the body is on screen. */
  pan?: number;
  /** Relative loudness (heavier figures die louder). */
  volume?: number;
  /** Playback-rate jitter so the same figure never dies twice identically. */
  rate?: number;
  /** Seconds to wait before the voice starts, so the blow lands first. */
  delay?: number;
}

/**
 * The material voice of one footfall. Drives the noise band, the body mode and
 * the ring, so the ear can tell a barefoot footsoldier from a plated guardian.
 */
export type FootstepTimbre = "scuff" | "leather" | "plate" | "regal";

/** One foot meeting the stone. */
export interface FootstepOptions {
  /** -1 hard left … 1 hard right — where the figure is on screen. */
  pan?: number;
  /** Relative loudness. */
  volume?: number;
  /** How the boot is built — see {@link FootstepTimbre}. */
  timbre?: FootstepTimbre;
  /** Seconds to wait before it sounds. */
  delay?: number;
  /** Slight per-step detune so a march never turns into a metronome. */
  jitter?: number;
}

/** Placement of one spell sound in the mix. */
export interface SpellOptions {
  /** -1 hard left … 1 hard right — where the caster or the blast is on screen. */
  pan?: number;
  /** Relative loudness. */
  volume?: number;
  /** Seconds to wait before it sounds. */
  delay?: number;
  /** How long the charge takes to reach full power (charge only). */
  duration?: number;
}

/** Placement of one gunshot in the mix, on top of the melee placement. */
export interface GunSoundOptions extends StrikeSoundOptions {
  /**
   * Which recorded barrel to fire. Omitted, the shot is the synthesised voice
   * alone — which is what every non-gunpowder army has always used.
   */
  voice?: GunVoice;
}

/** Placement of one melee-strike sound in the mix. */
export interface StrikeSoundOptions {
  /** -1 hard left … 1 hard right — where the blow is on screen. */
  pan?: number;
  /** Relative loudness. */
  volume?: number;
  /** Seconds to wait before it sounds. */
  delay?: number;
  /** 0 = a light blade cutting air, 1 = a siege hammer being hauled round. */
  weight?: number;
}

/** How the square-taken signature is placed in the mix. */
export interface ConquestOptions {
  /** -1 hard left … 1 hard right — where the taken square is on screen. */
  pan?: number;
  /** Relative loudness. */
  volume?: number;
  /** Seconds to wait before it sounds. */
  delay?: number;
  /**
   * What was taken: 0 a footsoldier, 1 the crown. Drops the motif's root,
   * lengthens its tail and adds a third note, so the ear knows how big the
   * capture was without looking at the tray.
   */
  weight?: number;
}

/** The soft confirmation note of a move joining the premove chain. */
export interface PremoveChimeOptions {
  /** -1 hard left … 1 hard right — where the square the plan lands on sits. */
  pan?: number;
  /** Which link of the chain just landed, 0-based. Steps the note up the ladder. */
  index?: number;
  /** Relative loudness. */
  volume?: number;
}

/** A wooden piece being lifted from or set down on the board. */
export interface WoodTapOptions {
  /** -1 hard left … 1 hard right — where the square is on screen. */
  pan?: number;
  /** Relative loudness. */
  volume?: number;
  /** 0 = light footsoldier tick, 1 = heavy king set-down (lower, longer ring). */
  weight?: number;
  /** Softer, brighter tick used when a figure is picked up rather than placed. */
  lift?: boolean;
  /** Seconds to wait before it sounds. */
  delay?: number;
}

/**
 * One decoded gunfire take, with the two things about it that cannot be trusted
 * to be authored correctly: where the shot actually begins, and how loud the
 * recording happens to be.
 */
interface ShotTake {
  buffer: AudioBuffer;
  /**
   * Seconds of lead-in before the report itself. Playback starts here, so the
   * transient lands on the frame the caller asked for rather than however long
   * after it the recording happened to open.
   */
  onset: number;
  /** Peak sample of the take, used to level every barrel to the same headroom. */
  peak: number;
}

/**
 * Peak every recorded take is normalised to. Generated clips come back anywhere
 * between 0.18 and 1.55 full-scale — a 9x spread. Left alone, the authored
 * per-barrel mix means nothing, because the recording level swamps it.
 */
const TAKE_PEAK = 0.92;
/** Bounds on that correction, so a hissy take is never boosted into noise. */
const TAKE_GAIN_RANGE: readonly [number, number] = [0.3, 3.4];

/**
 * How each recorded barrel sits against the synthesised voice underneath it.
 *
 * The two are not interchangeable. A take with a hard, close transient (the
 * Charleville) carries the whole report on its own and only wants the synth for
 * the sub-bass; a diffuse take (the flintlock, whose recording is mostly hall)
 * needs the synthesised crack left much further up or the shot has no edge on
 * the frame it happens. Authored per barrel, because “how good is this
 * recording” is not something `calibre` can express.
 */
const SHOT_VOICES: Record<GunVoice, { take: number; synth: number }> = {
  /** Quietest kill on the board by design — the recording is mostly room. */
  pistol: { take: 0.74, synth: 0.6 },
  /** The hardest transient of the four: it needs almost nothing under it. */
  musket: { take: 1, synth: 0.34 },
  /** A thin whip-crack; the synth supplies the body it does not have. */
  rifle: { take: 0.88, synth: 0.5 },
  /** Carries its own hall, but none of the sub-bass a field gun owes the room. */
  cannon: { take: 0.96, synth: 0.52 },
};

/**
 * Root of the claim motif, in Hz — G3, the same fundamental the judgement bell
 * is struck on. Sharing one root is what makes the two read as the same hall
 * speaking rather than as two unrelated sound effects.
 */
const CLAIM_ROOT = 196;

/** Head-room for the voices so a scream never clips over the score. */
const CRY_VOLUME = 0.85;
/** Simultaneous voices — beyond this the mix turns to mush. */
const MAX_VOICES = 3;
/**
 * The cries are generated as one-second takes, so nothing is time-stretched on
 * playback. This is only a safety net for a clip that comes back slightly long.
 */
const MAX_CRY_SECONDS = 1.15;
/** Ramp-out at the tail so a trimmed clip never clicks. */
const CRY_FADE = 0.1;

interface FootstepVoice {
  /** Overall loudness of this boot. */
  level: number;
  /** Low body mode — the weight going into the floor, in Hz. */
  body: number;
  /** Peak of the body thump. */
  weight: number;
  /** How long the thump takes to die away. */
  decay: number;
  /** Centre of the noise band — grit, cloth or steel. */
  noise: number;
  /** Sharpness of that band. */
  q: number;
  /** Level of the noise transient. */
  hiss: number;
  /** Length of the scuff in seconds. */
  scuff: number;
  /** Envelope exponent — higher is a shorter, snappier scrape. */
  grit: number;
  /** Level of the metallic afterring (0 for unarmoured feet). */
  ring: number;
  /** Pitch of that ring, in Hz. */
  ringHz: number;
}

/**
 * The four boots that walk this board. Footsoldiers scuff, the clergy creak in
 * leather, the tower guardians clank in full plate, and the crown puts a slow,
 * deep, deliberate weight through every step.
 */
const FOOTSTEP_VOICES: Record<FootstepTimbre, FootstepVoice> = {
  scuff: {
    level: 0.82,
    body: 108,
    weight: 0.2,
    decay: 0.09,
    noise: 1650,
    q: 0.8,
    hiss: 0.5,
    scuff: 0.055,
    grit: 3.2,
    ring: 0,
    ringHz: 0,
  },
  leather: {
    level: 0.9,
    body: 96,
    weight: 0.24,
    decay: 0.11,
    noise: 1180,
    q: 0.7,
    hiss: 0.42,
    scuff: 0.075,
    grit: 2.4,
    ring: 0.03,
    ringHz: 2350,
  },
  plate: {
    level: 1.12,
    body: 72,
    weight: 0.34,
    decay: 0.17,
    noise: 820,
    q: 0.55,
    hiss: 0.34,
    scuff: 0.09,
    grit: 2,
    ring: 0.09,
    ringHz: 3120,
  },
  regal: {
    level: 1.05,
    body: 62,
    weight: 0.32,
    decay: 0.2,
    noise: 940,
    q: 0.6,
    hiss: 0.3,
    scuff: 0.1,
    grit: 2.2,
    ring: 0.055,
    ringHz: 2680,
  },
};

interface Bed {
  gain: GainNode;
  source: AudioBufferSourceNode | null;
  target: number;
}

const BED_VOLUME: Record<BedName, number> = {
  ambience: 0.32,
  score: 0.34,
  tension: 0.0,
};

/**
 * Web Audio mixer: three looping beds (ambience / score / tension stem) that
 * crossfade with game intensity, plus one-shot SFX. UI blips are synthesised so
 * every hover does not cost a network asset.
 */
export class AudioManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  /** Music/ambience sub-bus, ducked underneath death cries. */
  private bedBus: GainNode | null = null;
  private buffers = new Map<string, AudioBuffer>();
  /** Decoded death cries keyed by their URL, streamed on demand. */
  private voices = new Map<string, AudioBuffer>();
  private voiceLoads = new Map<string, Promise<void>>();
  /** Decoded gunfire takes, keyed by URL. Only the powder army needs them. */
  private shots = new Map<string, ShotTake>();
  private shotLoads = new Map<string, Promise<void>>();
  /**
   * Whose voices each side dies with. Swapped when the player musters a
   * different army, so a French line infantryman never screams like a jaguar
   * warrior.
   */
  private cries: Record<Faction, Record<PieceKind, string>> = {
    w: ARMY_SKINS[DEFAULT_ARMY_SKINS.w].cries,
    b: ARMY_SKINS[DEFAULT_ARMY_SKINS.b].cries,
  };
  private activeVoices = 0;
  private beds = new Map<BedName, Bed>();
  private muted = false;
  private started = false;
  private loading: Promise<void> | null = null;

  get isMuted(): boolean {
    return this.muted;
  }

  /** Must be called from a user gesture (browser autoplay policy). */
  async unlock(): Promise<void> {
    if (!this.ctx) {
      const Ctor: typeof AudioContext =
        window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 1;
      this.master.connect(this.ctx.destination);
      this.bedBus = this.ctx.createGain();
      this.bedBus.gain.value = 1;
      this.bedBus.connect(this.master);
    }
    if (this.ctx.state === "suspended") await this.ctx.resume();
    if (!this.loading) this.loading = this.preload();
    await this.loading;
    this.startBeds();
    // Voices only matter on a capture, so they stream in behind the music
    // rather than holding up the first frame of the game.
    void this.primeDeathCries();
    void this.primeGunfire();
  }

  private async preload(): Promise<void> {
    const entries = Object.entries(AUDIO_URLS).filter(([, url]) => url.length > 0);
    await Promise.all(
      entries.map(async ([key, url]) => {
        try {
          const response = await fetch(url);
          const raw = await response.arrayBuffer();
          const ctx = this.ctx;
          if (!ctx) return;
          const buffer = await ctx.decodeAudioData(raw);
          this.buffers.set(key, buffer);
        } catch (error) {
          console.warn(`[audio] could not load "${key}"`, error);
        }
      }),
    );
  }

  private startBeds(): void {
    if (this.started || !this.ctx || !this.master) return;
    this.started = true;
    const layers: { name: BedName; key: keyof typeof AUDIO_URLS }[] = [
      { name: "ambience", key: "ambience" },
      { name: "score", key: "score" },
      { name: "tension", key: "tension" },
    ];
    for (const layer of layers) {
      const buffer = this.buffers.get(layer.key);
      const gain = this.ctx.createGain();
      gain.gain.value = BED_VOLUME[layer.name];
      gain.connect(this.bedBus ?? this.master);
      let source: AudioBufferSourceNode | null = null;
      if (buffer) {
        source = this.ctx.createBufferSource();
        source.buffer = buffer;
        source.loop = true;
        source.connect(gain);
        source.start(0);
      }
      this.beds.set(layer.name, { gain, source, target: BED_VOLUME[layer.name] });
    }
  }

  /** 0 = calm, 1 = check / endgame. Crossfades the tension stem. */
  setIntensity(intensity: number): void {
    if (!this.ctx) return;
    const clamped = Math.max(0, Math.min(1, intensity));
    this.fadeBed("tension", clamped * 0.5, 1.8);
    this.fadeBed("score", 0.34 - clamped * 0.12, 1.8);
  }

  private fadeBed(name: BedName, value: number, seconds: number): void {
    const bed = this.beds.get(name);
    if (!bed || !this.ctx) return;
    bed.target = value;
    const now = this.ctx.currentTime;
    bed.gain.gain.cancelScheduledValues(now);
    bed.gain.gain.setValueAtTime(bed.gain.gain.value, now);
    bed.gain.gain.linearRampToValueAtTime(value, now + seconds);
  }

  play(name: SfxName, volume = 1): void {
    if (!this.ctx || !this.master || this.muted) return;
    const buffer = this.buffers.get(name);
    if (!buffer) return;
    const source = this.ctx.createBufferSource();
    const gain = this.ctx.createGain();
    gain.gain.value = volume;
    source.buffer = buffer;
    source.connect(gain);
    gain.connect(this.master);
    source.start(0);
  }

  /** Pulls score and ambience down for a beat so a voice cuts through. */
  private duckBeds(amount: number, seconds: number): void {
    if (!this.bedBus || !this.ctx) return;
    const now = this.ctx.currentTime;
    const gain = this.bedBus.gain;
    gain.cancelScheduledValues(now);
    gain.setValueAtTime(gain.value, now);
    gain.linearRampToValueAtTime(amount, now + 0.08);
    gain.linearRampToValueAtTime(1, now + 0.08 + Math.max(0.2, seconds));
  }

  /** Warms every cry in the background once the mixer is alive. */
  /**
   * Points each side at its army's voices and warms the new clips. Cries already
   * decoded stay cached (they are keyed by URL), so switching back is instant.
   */
  setArmyCries(cries: Record<Faction, Record<PieceKind, string>>): void {
    this.cries = { w: cries.w, b: cries.b };
    if (this.ctx) void this.primeDeathCries();
  }

  /** Warms the recorded barrels in the background once the mixer is alive. */
  private async primeGunfire(): Promise<void> {
    await Promise.all(Object.values(GUN_AUDIO_URLS).map((url) => this.loadShot(url)));
  }

  private loadShot(url: string): Promise<void> {
    const pending = this.shotLoads.get(url);
    if (pending) return pending;
    const job = (async () => {
      try {
        const response = await fetch(url);
        const raw = await response.arrayBuffer();
        const ctx = this.ctx;
        if (!ctx) {
          this.shotLoads.delete(url);
          return;
        }
        this.shots.set(url, this.analyseTake(await ctx.decodeAudioData(raw)));
      } catch (error) {
        console.warn("[audio] gunfire take failed to load", error);
      }
    })();
    this.shotLoads.set(url, job);
    return job;
  }

  /**
   * Finds where a recorded shot actually starts, and how hot it was recorded.
   *
   * A generated sound effect is a *clip*, not an event: it opens with whatever
   * room tone the model felt like, and the report can sit anywhere inside it.
   * Played from sample zero the ear hears the flash first and the bang after,
   * which is exactly the desync this exists to kill.
   *
   * The onset is taken from the loudest moment rather than from the first sample
   * over a threshold: threshold-crossing latches onto room tone (or onto a flint
   * scrape) and reports 0ms for a take whose crack is really 170ms in. So find
   * the loudest 4ms window, walk *backwards* to where the energy was still a
   * small fraction of it — the foot of the attack — and refine to the sample
   * inside that window where the waveform first moves.
   */
  private analyseTake(buffer: AudioBuffer): ShotTake {
    const data = buffer.getChannelData(0);
    const rate = buffer.sampleRate;
    let peak = 0;
    for (let i = 0; i < data.length; i += 1) {
      const value = Math.abs(data[i]);
      if (value > peak) peak = value;
    }
    if (peak <= 0) return { buffer, onset: 0, peak: 1 };

    // Energy envelope in 4ms windows: short enough to resolve a transient, long
    // enough that one stray sample cannot pass for one.
    const window = Math.max(1, Math.round(rate * 0.004));
    const windows = Math.ceil(data.length / window);
    const energy = new Float32Array(windows);
    let loudest = 0;
    for (let w = 0; w < windows; w += 1) {
      const start = w * window;
      const end = Math.min(data.length, start + window);
      let sum = 0;
      for (let i = start; i < end; i += 1) sum += data[i] * data[i];
      energy[w] = Math.sqrt(sum / Math.max(1, end - start));
      if (energy[w] > energy[loudest]) loudest = w;
    }

    // Foot of the attack: the last quiet window before the loudest one.
    const floor = energy[loudest] * 0.14;
    let start = loudest;
    while (start > 0 && energy[start - 1] > floor) start -= 1;

    // Refine inside that window so the crack is not clipped by up to 4ms.
    let onset = start * window;
    const limit = Math.min(data.length, onset + window);
    for (let i = onset; i < limit; i += 1) {
      if (Math.abs(data[i]) >= peak * 0.05) {
        onset = i;
        break;
      }
    }
    // Never trim into the shot itself: the attack keeps two milliseconds of
    // run-up so it still reads as a hard edge rather than a truncated click.
    onset = Math.max(0, onset - Math.round(rate * 0.002));
    return { buffer, onset: onset / rate, peak };
  }

  /**
   * Plays one recorded take, panned to where it happens on screen. Returns false
   * when the clip has not streamed in yet (and warms it for next time), so the
   * caller can fall back to its synthesised voice.
   *
   * Two corrections are applied to every take, both measured off the audio
   * rather than authored: playback starts at the shot's own onset, so the report
   * lands on the instant the caller asked for, and the level is normalised, so
   * `volume` means the same thing whichever barrel is talking.
   */
  private playTake(
    url: string,
    options: { pan?: number; volume?: number; delay?: number; rate?: number } = {},
  ): boolean {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master || this.muted) return false;
    const take = this.shots.get(url);
    if (!take) {
      void this.loadShot(url);
      return false;
    }
    const when = ctx.currentTime + Math.max(0, options.delay ?? 0);
    const source = ctx.createBufferSource();
    source.buffer = take.buffer;
    source.playbackRate.value = options.rate ?? 1;
    const gain = ctx.createGain();
    const match = Math.max(TAKE_GAIN_RANGE[0], Math.min(TAKE_GAIN_RANGE[1], TAKE_PEAK / take.peak));
    gain.gain.value = (options.volume ?? 1) * match;
    source.connect(gain);
    if (typeof ctx.createStereoPanner === "function") {
      const panner = ctx.createStereoPanner();
      panner.pan.value = Math.max(-1, Math.min(1, options.pan ?? 0)) * 0.6;
      gain.connect(panner);
      panner.connect(master);
    } else {
      gain.connect(master);
    }
    // The offset is the whole point: the transient starts here, not the file.
    source.start(when, take.onset);
    return true;
  }

  private async primeDeathCries(): Promise<void> {
    const factions: Faction[] = ["w", "b"];
    const kinds: PieceKind[] = ["k", "q", "b", "n", "r", "p"];
    for (const faction of factions) {
      await Promise.all(kinds.map((kind) => this.loadDeathCry(faction, kind)));
    }
  }

  private loadDeathCry(faction: Faction, kind: PieceKind): Promise<void> {
    const url = this.cries[faction]?.[kind];
    if (!url) return Promise.resolve();
    const pending = this.voiceLoads.get(url);
    if (pending) return pending;
    const job = (async () => {
      try {
        const response = await fetch(url);
        const raw = await response.arrayBuffer();
        const ctx = this.ctx;
        if (!ctx) {
          // Mixer went away mid-flight — let a later capture try again.
          this.voiceLoads.delete(url);
          return;
        }
        this.voices.set(url, await ctx.decodeAudioData(raw));
      } catch (error) {
        console.warn(`[audio] death cry "${faction}${kind}" failed to load`, error);
      }
    })();
    this.voiceLoads.set(url, job);
    return job;
  }

  /**
   * The dying voice of one figure: its own recorded cry, panned to where the
   * body is on screen, pitch-jittered, with a short stone-hall tail behind it
   * and the music ducked underneath. Stays silent (and warms the clip for next
   * time) if the sample has not finished streaming in yet.
   */
  deathCry(faction: Faction, kind: PieceKind, options: DeathCryOptions = {}): void {
    if (!this.ctx || !this.master || this.muted) return;
    const url = this.cries[faction]?.[kind];
    const buffer = url ? this.voices.get(url) : undefined;
    if (!buffer) {
      void this.loadDeathCry(faction, kind);
      return;
    }
    if (this.activeVoices >= MAX_VOICES) return;

    const ctx = this.ctx;
    const master = this.master;
    // Played at its natural speed — the sample itself is a one-second take, so
    // the only rate change is the per-rank pitch jitter.
    const rate = options.rate ?? 1;
    const played = Math.min(MAX_CRY_SECONDS, buffer.duration / rate);
    const when = ctx.currentTime + Math.max(0, options.delay ?? 0);
    const level = CRY_VOLUME * (options.volume ?? 1);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = rate;

    // Trim the rumble so the voice sits above the body-fall thump.
    const body = ctx.createBiquadFilter();
    body.type = "highpass";
    body.frequency.value = 165;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(level, when);
    const fade = Math.min(CRY_FADE, played * 0.4);
    gain.gain.setValueAtTime(level, when + played - fade);
    gain.gain.linearRampToValueAtTime(0.0001, when + played);

    let tail: AudioNode = gain;
    if (typeof ctx.createStereoPanner === "function") {
      const panner = ctx.createStereoPanner();
      panner.pan.value = Math.max(-1, Math.min(1, options.pan ?? 0)) * 0.7;
      gain.connect(panner);
      tail = panner;
    }
    source.connect(body);
    body.connect(gain);
    tail.connect(master);

    // Cheap slap-back so the scream reads as happening in a big space.
    const echoTone = ctx.createBiquadFilter();
    echoTone.type = "lowpass";
    echoTone.frequency.value = 1900;
    const echo = ctx.createDelay(0.5);
    echo.delayTime.value = 0.13;
    const echoGain = ctx.createGain();
    echoGain.gain.value = level * 0.26;
    gain.connect(echoTone);
    echoTone.connect(echo);
    echo.connect(echoGain);
    echoGain.connect(master);

    this.activeVoices += 1;
    source.onended = () => {
      this.activeVoices = Math.max(0, this.activeVoices - 1);
    };
    source.start(when);
    source.stop(when + played + 0.02);

    this.duckBeds(0.55, played + 0.25);
  }

  /**
   * The note a queued move leaves behind: a small struck bell, well under the
   * wood knock it rides on.
   *
   * The knock alone could not carry this. Picking a figure up for a premove and
   * actually queueing the move were the *same* dry tap at 0.5 and 0.42 — close
   * enough that the ear could not tell "heard you" from "it is in the queue",
   * and nothing at all said *which* link had just landed. So the confirmation
   * gets a voice of its own: one soft sine with a quiet octave over it, 12 ms of
   * attack so it swells rather than clicks, and a half-second tail.
   *
   * It walks up a five-note major pentatonic — the ladder has no semitone in it,
   * so a chain built quickly is a phrase rather than a pile-up, and the pitch
   * tells the player how deep the plan is without looking away from the fight.
   * Peak level is a twentieth of full scale: it must sit *under* the machine's
   * move, which is the thing actually happening on the board.
   */
  premoveChime(options: PremoveChimeOptions = {}): void {
    if (!this.ctx || !this.master || this.muted) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const ladder = [523.25, 587.33, 698.46, 783.99, 880.0];
    const step = Math.max(0, Math.min(ladder.length - 1, Math.round(options.index ?? 0)));
    const root = ladder[step];
    const level = 0.05 * (options.volume ?? 1);

    const bus = ctx.createGain();
    bus.gain.value = level;
    const tone = ctx.createBiquadFilter();
    tone.type = "lowpass";
    tone.frequency.value = 3200;
    bus.connect(tone);
    if (typeof ctx.createStereoPanner === "function") {
      const panner = ctx.createStereoPanner();
      panner.pan.value = Math.max(-1, Math.min(1, options.pan ?? 0)) * 0.5;
      tone.connect(panner);
      panner.connect(this.master);
    } else {
      tone.connect(this.master);
    }

    const partials: { ratio: number; gain: number; decay: number }[] = [
      { ratio: 1, gain: 1, decay: 0.52 },
      { ratio: 2, gain: 0.28, decay: 0.3 },
    ];
    for (const partial of partials) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(root * partial.ratio, now);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(partial.gain, now + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + partial.decay);
      osc.connect(gain);
      gain.connect(bus);
      osc.start(now);
      osc.stop(now + partial.decay + 0.05);
    }
  }

  /**
   * Synthesised body-fall: a low thump under a short burst of filtered noise,
   * played when a struck figure hits the stone.
   */
  bodyFall(volume = 1): void {
    if (!this.ctx || !this.master || this.muted) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    const thump = ctx.createOscillator();
    const thumpGain = ctx.createGain();
    thump.type = "sine";
    thump.frequency.setValueAtTime(120, now);
    thump.frequency.exponentialRampToValueAtTime(42, now + 0.22);
    thumpGain.gain.setValueAtTime(0.34 * volume, now);
    thumpGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.34);
    thump.connect(thumpGain);
    thumpGain.connect(this.master);
    thump.start(now);
    thump.stop(now + 0.4);

    const length = Math.floor(ctx.sampleRate * 0.25);
    const noiseBuffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2.5);
    }
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer;
    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = "lowpass";
    noiseFilter.frequency.value = 900;
    const noiseGain = ctx.createGain();
    noiseGain.gain.value = 0.16 * volume;
    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(this.master);
    noise.start(now);
  }

  /**
   * A chess piece meeting the board: the dry click of the base on the surface
   * plus three damped wooden body modes underneath it. Heavier ranks sit lower
   * and ring a touch longer; every tap is pitch-jittered so a game never turns
   * metronomic. Fully synthesised — no asset, no latency.
   */
  woodTap(options: WoodTapOptions = {}): void {
    if (!this.ctx || !this.master || this.muted) return;
    const ctx = this.ctx;
    const lift = options.lift === true;
    const weight = Math.max(0, Math.min(1, options.weight ?? 0.5));
    const level = 0.5 * (options.volume ?? 1) * (lift ? 0.55 : 1);
    const when = ctx.currentTime + Math.max(0, options.delay ?? 0);

    // Bus for the whole knock so panning and level happen in one place.
    const bus = ctx.createGain();
    bus.gain.value = level;
    // Wood is warm, not clicky-bright — roll the very top off the whole thing.
    const tone = ctx.createBiquadFilter();
    tone.type = "lowpass";
    tone.frequency.value = lift ? 5200 : 4200;
    bus.connect(tone);
    if (typeof ctx.createStereoPanner === "function") {
      const panner = ctx.createStereoPanner();
      panner.pan.value = Math.max(-1, Math.min(1, options.pan ?? 0)) * 0.55;
      tone.connect(panner);
      panner.connect(this.master);
    } else {
      tone.connect(this.master);
    }

    // Body modes: a fundamental with two inharmonic partials, as a struck block.
    const jitter = 0.94 + Math.random() * 0.12;
    const root = (lift ? 620 : 430 - weight * 165) * jitter;
    const ring = (lift ? 0.085 : 0.13 + weight * 0.075);
    const modes: { ratio: number; gain: number; decay: number }[] = [
      { ratio: 1, gain: 1, decay: 1 },
      { ratio: 2.06, gain: 0.42, decay: 0.62 },
      { ratio: 3.41, gain: 0.19, decay: 0.38 },
    ];
    for (const mode of modes) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      const frequency = root * mode.ratio;
      osc.frequency.setValueAtTime(frequency, when);
      // Tiny downward glide — the pitch of a knock drops as the strike settles.
      osc.frequency.exponentialRampToValueAtTime(frequency * 0.94, when + ring * mode.decay);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, when);
      gain.gain.exponentialRampToValueAtTime(mode.gain, when + 0.004);
      gain.gain.exponentialRampToValueAtTime(0.0001, when + ring * mode.decay);
      osc.connect(gain);
      gain.connect(bus);
      osc.start(when);
      osc.stop(when + ring + 0.05);
    }

    // The contact itself: a few milliseconds of filtered noise for the "tock".
    const clickLength = Math.max(1, Math.floor(ctx.sampleRate * 0.02));
    const noiseBuffer = ctx.createBuffer(1, clickLength, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < clickLength; i += 1) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / clickLength, 6);
    }
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer;
    const click = ctx.createBiquadFilter();
    click.type = "bandpass";
    click.frequency.value = lift ? 2600 : 1750 - weight * 350;
    click.Q.value = 0.9;
    const clickGain = ctx.createGain();
    clickGain.gain.value = lift ? 0.5 : 0.72;
    noise.connect(click);
    click.connect(clickGain);
    clickGain.connect(bus);
    noise.start(when);

    // Only a real set-down puts weight into the table.
    if (!lift) {
      const body = ctx.createOscillator();
      const bodyGain = ctx.createGain();
      body.type = "sine";
      body.frequency.setValueAtTime(150 - weight * 45, when);
      body.frequency.exponentialRampToValueAtTime(78 - weight * 20, when + 0.1);
      bodyGain.gain.setValueAtTime(0.0001, when);
      bodyGain.gain.exponentialRampToValueAtTime(0.22 + weight * 0.2, when + 0.006);
      bodyGain.gain.exponentialRampToValueAtTime(0.0001, when + 0.13 + weight * 0.05);
      body.connect(bodyGain);
      bodyGain.connect(bus);
      body.start(when);
      body.stop(when + 0.25);
    }
  }

  /**
   * One footfall on stone: a short low body thump for the weight, a burst of
   * band-passed noise for the grit under the sole, and — for armour — a thin
   * metallic ring of harness and plate riding on top. Fully synthesised, so a
   * whole march costs nothing to stream and lands exactly on the frame the
   * stride clock asks for.
   */
  footstep(options: FootstepOptions = {}): void {
    if (!this.ctx || !this.master || this.muted) return;
    const ctx = this.ctx;
    const timbre = options.timbre ?? "scuff";
    const voice = FOOTSTEP_VOICES[timbre];
    const when = ctx.currentTime + Math.max(0, options.delay ?? 0);
    const jitter = 1 + (options.jitter ?? (Math.random() - 0.5) * 0.16);
    const level = 0.42 * voice.level * (options.volume ?? 1);

    const bus = ctx.createGain();
    bus.gain.value = level;
    if (typeof ctx.createStereoPanner === "function") {
      const panner = ctx.createStereoPanner();
      panner.pan.value = Math.max(-1, Math.min(1, options.pan ?? 0)) * 0.6;
      bus.connect(panner);
      panner.connect(this.master);
    } else {
      bus.connect(this.master);
    }

    // Weight going through the sole into the floor.
    const thump = ctx.createOscillator();
    const thumpGain = ctx.createGain();
    thump.type = "sine";
    thump.frequency.setValueAtTime(voice.body * jitter, when);
    thump.frequency.exponentialRampToValueAtTime(voice.body * 0.55 * jitter, when + voice.decay);
    thumpGain.gain.setValueAtTime(0.0001, when);
    thumpGain.gain.exponentialRampToValueAtTime(voice.weight, when + 0.006);
    thumpGain.gain.exponentialRampToValueAtTime(0.0001, when + voice.decay);
    thump.connect(thumpGain);
    thumpGain.connect(bus);
    thump.start(when);
    thump.stop(when + voice.decay + 0.05);

    // Grit and leather: a fast noise transient shaped by the sole material.
    const length = Math.max(1, Math.floor(ctx.sampleRate * voice.scuff));
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, voice.grit);
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = voice.noise * jitter;
    band.Q.value = voice.q;
    const noiseGain = ctx.createGain();
    noiseGain.gain.value = voice.hiss;
    noise.connect(band);
    band.connect(noiseGain);
    noiseGain.connect(bus);
    noise.start(when);

    // Harness, mail and greaves answering the step.
    if (voice.ring > 0) {
      const ring = ctx.createOscillator();
      const ringGain = ctx.createGain();
      ring.type = "triangle";
      ring.frequency.setValueAtTime(voice.ringHz * jitter, when);
      ringGain.gain.setValueAtTime(0.0001, when + 0.008);
      ringGain.gain.exponentialRampToValueAtTime(voice.ring, when + 0.016);
      ringGain.gain.exponentialRampToValueAtTime(0.0001, when + 0.16);
      ring.connect(ringGain);
      ringGain.connect(bus);
      ring.start(when);
      ring.stop(when + 0.2);
    }
  }

  /**
   * Fire gathering at the head of a staff: two detuned saw voices climbing an
   * octave under a band of noise that opens as the charge builds, so the ear
   * hears the power being pulled in before the bolt leaves.
   */
  spellCharge(options: SpellOptions = {}): void {
    if (!this.ctx || !this.master || this.muted) return;
    const ctx = this.ctx;
    const when = ctx.currentTime + Math.max(0, options.delay ?? 0);
    const span = Math.max(0.18, options.duration ?? 0.5);
    const level = 0.2 * (options.volume ?? 1);
    const bus = this.spellBus(options.pan ?? 0, 0.6);

    for (const detune of [1, 1.008, 0.5]) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = detune === 0.5 ? "triangle" : "sawtooth";
      osc.frequency.setValueAtTime(96 * detune, when);
      osc.frequency.exponentialRampToValueAtTime(340 * detune, when + span);
      gain.gain.setValueAtTime(0.0001, when);
      gain.gain.exponentialRampToValueAtTime(level * (detune === 0.5 ? 0.7 : 1), when + span * 0.92);
      gain.gain.exponentialRampToValueAtTime(0.0001, when + span + 0.06);
      osc.connect(gain);
      gain.connect(bus);
      osc.start(when);
      osc.stop(when + span + 0.12);
    }

    // Air being dragged into the crystal.
    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuffer(span + 0.1, 0.35);
    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.Q.value = 1.4;
    band.frequency.setValueAtTime(420, when);
    band.frequency.exponentialRampToValueAtTime(2600, when + span);
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.0001, when);
    noiseGain.gain.exponentialRampToValueAtTime(level * 1.5, when + span * 0.95);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, when + span + 0.08);
    noise.connect(band);
    band.connect(noiseGain);
    noiseGain.connect(bus);
    noise.start(when);
  }

  /** The bolt leaving the staff: a bright snap into a falling whoosh. */
  spellCast(options: SpellOptions = {}): void {
    if (!this.ctx || !this.master || this.muted) return;
    const ctx = this.ctx;
    const when = ctx.currentTime + Math.max(0, options.delay ?? 0);
    const level = 0.42 * (options.volume ?? 1);
    const bus = this.spellBus(options.pan ?? 0, 0.7);

    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuffer(0.42, 1.6);
    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.Q.value = 0.9;
    band.frequency.setValueAtTime(3200, when);
    band.frequency.exponentialRampToValueAtTime(380, when + 0.36);
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(level, when);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, when + 0.4);
    noise.connect(band);
    band.connect(noiseGain);
    noiseGain.connect(bus);
    noise.start(when);

    // The kick of it leaving the hand.
    const thump = ctx.createOscillator();
    const thumpGain = ctx.createGain();
    thump.type = "sine";
    thump.frequency.setValueAtTime(220, when);
    thump.frequency.exponentialRampToValueAtTime(58, when + 0.24);
    thumpGain.gain.setValueAtTime(0.0001, when);
    thumpGain.gain.exponentialRampToValueAtTime(level * 0.7, when + 0.01);
    thumpGain.gain.exponentialRampToValueAtTime(0.0001, when + 0.3);
    thump.connect(thumpGain);
    thumpGain.connect(bus);
    thump.start(when);
    thump.stop(when + 0.36);
  }

  /**
   * The bolt landing on a body: a hard crack, a low boom that drops away under
   * it, and a long crackle of fire eating what is left.
   */
  spellImpact(options: SpellOptions = {}): void {
    if (!this.ctx || !this.master || this.muted) return;
    const ctx = this.ctx;
    const when = ctx.currentTime + Math.max(0, options.delay ?? 0);
    const level = 0.5 * (options.volume ?? 1);
    const bus = this.spellBus(options.pan ?? 0, 0.45);

    const boom = ctx.createOscillator();
    const boomGain = ctx.createGain();
    boom.type = "sine";
    boom.frequency.setValueAtTime(140, when);
    boom.frequency.exponentialRampToValueAtTime(32, when + 0.5);
    boomGain.gain.setValueAtTime(0.0001, when);
    boomGain.gain.exponentialRampToValueAtTime(level, when + 0.008);
    boomGain.gain.exponentialRampToValueAtTime(0.0001, when + 0.6);
    boom.connect(boomGain);
    boomGain.connect(bus);
    boom.start(when);
    boom.stop(when + 0.7);

    // The crack of the shell breaking open.
    const crack = ctx.createBufferSource();
    crack.buffer = this.noiseBuffer(0.12, 5);
    const snap = ctx.createBiquadFilter();
    snap.type = "highpass";
    snap.frequency.value = 1400;
    const crackGain = ctx.createGain();
    crackGain.gain.value = level * 0.55;
    crack.connect(snap);
    snap.connect(crackGain);
    crackGain.connect(bus);
    crack.start(when);

    // Fire left burning on the stone.
    const fire = ctx.createBufferSource();
    fire.buffer = this.noiseBuffer(0.85, 1.1);
    const body = ctx.createBiquadFilter();
    body.type = "lowpass";
    body.frequency.setValueAtTime(2600, when);
    body.frequency.exponentialRampToValueAtTime(520, when + 0.8);
    const fireGain = ctx.createGain();
    fireGain.gain.setValueAtTime(level * 0.5, when + 0.02);
    fireGain.gain.exponentialRampToValueAtTime(0.0001, when + 0.9);
    fire.connect(body);
    body.connect(fireGain);
    fireGain.connect(bus);
    fire.start(when);
  }

  /**
   * Steel moving through air: a band of noise sweeping down as the swing comes
   * round, with a low gust under it for anything heavy enough to shift weight.
   * `weight` runs from a light blade to a two-handed siege hammer.
   */
  bladeWhoosh(options: StrikeSoundOptions = {}): void {
    if (!this.ctx || !this.master || this.muted) return;
    const ctx = this.ctx;
    const when = ctx.currentTime + Math.max(0, options.delay ?? 0);
    const weight = Math.max(0, Math.min(1, options.weight ?? 0.5));
    const level = 0.3 * (options.volume ?? 1);
    const span = 0.22 + weight * 0.16;
    const bus = this.spellBus(options.pan ?? 0, 0.55);

    // The air being cut. A heavier weapon sweeps a lower, longer band.
    const air = ctx.createBufferSource();
    air.buffer = this.noiseBuffer(span + 0.08, 1.4);
    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.Q.value = 1.1 + weight * 0.6;
    band.frequency.setValueAtTime(2600 - weight * 900, when);
    band.frequency.exponentialRampToValueAtTime(380 - weight * 180, when + span);
    const airGain = ctx.createGain();
    airGain.gain.setValueAtTime(0.0001, when);
    airGain.gain.exponentialRampToValueAtTime(level, when + span * 0.62);
    airGain.gain.exponentialRampToValueAtTime(0.0001, when + span + 0.06);
    air.connect(band);
    band.connect(airGain);
    airGain.connect(bus);
    air.start(when);

    if (weight <= 0.2) return;
    // Mass being hauled round: a short low gust trailing the swing.
    const gust = ctx.createOscillator();
    const gustGain = ctx.createGain();
    gust.type = "sine";
    gust.frequency.setValueAtTime(150 - weight * 60, when + span * 0.3);
    gust.frequency.exponentialRampToValueAtTime(62 - weight * 18, when + span);
    gustGain.gain.setValueAtTime(0.0001, when + span * 0.3);
    gustGain.gain.exponentialRampToValueAtTime(level * 0.55 * weight, when + span * 0.55);
    gustGain.gain.exponentialRampToValueAtTime(0.0001, when + span + 0.1);
    gust.connect(gustGain);
    gustGain.connect(bus);
    gust.start(when + span * 0.28);
    gust.stop(when + span + 0.16);
  }

  /**
   * A blow that goes through the body and into the floor: a sub-bass drop, the
   * crack of stone giving, and a tail of rubble settling. What the tower
   * guardians and the crown leave behind — never a footsoldier.
   */
  groundSlam(options: StrikeSoundOptions = {}): void {
    if (!this.ctx || !this.master || this.muted) return;
    const ctx = this.ctx;
    const when = ctx.currentTime + Math.max(0, options.delay ?? 0);
    const level = 0.46 * (options.volume ?? 1);
    const bus = this.spellBus(options.pan ?? 0, 0.4);

    // The floor taking it.
    for (const [start, end, gain, span] of [
      [96, 26, 1, 0.62],
      [58, 19, 0.55, 0.9],
    ] as const) {
      const sub = ctx.createOscillator();
      const subGain = ctx.createGain();
      sub.type = "sine";
      sub.frequency.setValueAtTime(start, when);
      sub.frequency.exponentialRampToValueAtTime(end, when + span);
      subGain.gain.setValueAtTime(0.0001, when);
      subGain.gain.exponentialRampToValueAtTime(level * gain, when + 0.012);
      subGain.gain.exponentialRampToValueAtTime(0.0001, when + span);
      sub.connect(subGain);
      subGain.connect(bus);
      sub.start(when);
      sub.stop(when + span + 0.08);
    }

    // Stone splitting under the head of the weapon.
    const crack = ctx.createBufferSource();
    crack.buffer = this.noiseBuffer(0.16, 4.5);
    const shape = ctx.createBiquadFilter();
    shape.type = "bandpass";
    shape.Q.value = 0.7;
    shape.frequency.setValueAtTime(900, when);
    shape.frequency.exponentialRampToValueAtTime(240, when + 0.15);
    const crackGain = ctx.createGain();
    crackGain.gain.value = level * 0.7;
    crack.connect(shape);
    shape.connect(crackGain);
    crackGain.connect(bus);
    crack.start(when);

    // Grit and chips coming back down.
    const rubble = ctx.createBufferSource();
    rubble.buffer = this.noiseBuffer(0.55, 2.2);
    const grit = ctx.createBiquadFilter();
    grit.type = "highpass";
    grit.frequency.value = 1800;
    const rubbleGain = ctx.createGain();
    rubbleGain.gain.setValueAtTime(0.0001, when + 0.05);
    rubbleGain.gain.exponentialRampToValueAtTime(level * 0.3, when + 0.1);
    rubbleGain.gain.exponentialRampToValueAtTime(0.0001, when + 0.6);
    rubble.connect(grit);
    grit.connect(rubbleGain);
    rubbleGain.connect(bus);
    rubble.start(when + 0.04);

    this.duckBeds(0.7, 0.7);
  }

  /**
   * The sentence being passed: a struck bell built from inharmonic partials with
   * a slow bloom of air under it. Only the crown gets to ring this.
   */
  judgementToll(options: StrikeSoundOptions = {}): void {
    if (!this.ctx || !this.master || this.muted) return;
    const ctx = this.ctx;
    const when = ctx.currentTime + Math.max(0, options.delay ?? 0);
    const level = 0.26 * (options.volume ?? 1);
    const bus = this.spellBus(options.pan ?? 0, 0.35);
    const root = 196;

    // A real bell is not a harmonic series — these ratios are what make it metal.
    const partials: { ratio: number; gain: number; decay: number }[] = [
      { ratio: 0.5, gain: 0.7, decay: 2.6 },
      { ratio: 1, gain: 1, decay: 2.2 },
      { ratio: 2.02, gain: 0.5, decay: 1.6 },
      { ratio: 2.98, gain: 0.28, decay: 1.1 },
      { ratio: 4.07, gain: 0.15, decay: 0.7 },
    ];
    for (const partial of partials) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = root * partial.ratio;
      gain.gain.setValueAtTime(0.0001, when);
      gain.gain.exponentialRampToValueAtTime(level * partial.gain, when + 0.014);
      gain.gain.exponentialRampToValueAtTime(0.0001, when + partial.decay);
      osc.connect(gain);
      gain.connect(bus);
      osc.start(when);
      osc.stop(when + partial.decay + 0.1);
    }

    // Air pulled up around the light.
    const swell = ctx.createBufferSource();
    swell.buffer = this.noiseBuffer(0.9, 0.6);
    const body = ctx.createBiquadFilter();
    body.type = "bandpass";
    body.Q.value = 0.8;
    body.frequency.setValueAtTime(520, when);
    body.frequency.exponentialRampToValueAtTime(2200, when + 0.7);
    const swellGain = ctx.createGain();
    swellGain.gain.setValueAtTime(0.0001, when);
    swellGain.gain.exponentialRampToValueAtTime(level * 0.55, when + 0.5);
    swellGain.gain.exponentialRampToValueAtTime(0.0001, when + 0.95);
    swell.connect(body);
    body.connect(swellGain);
    swellGain.connect(bus);
    swell.start(when);

    this.duckBeds(0.6, 1.1);
  }

  /**
   * Black powder going off. One voice covers the whole army by `calibre`:
   *
   * - `0` — an officer's flintlock pistol: a dry, bright crack, gone at once.
   * - `0.5` — a Charleville musket: a harder crack over a short chest thump.
   * - `1` — a field gun: the crack is buried under a sub-bass slam that rolls
   *   away down the hall, with the report coming back off the far wall.
   *
   * The synthesised half never waits on a download, so a volley always fires on
   * time even if a take is still streaming in.
   */
  gunshot(options: GunSoundOptions = {}): void {
    if (!this.ctx || !this.master || this.muted) return;
    const ctx = this.ctx;
    const when = ctx.currentTime + Math.max(0, options.delay ?? 0);
    const calibre = Math.max(0, Math.min(1, options.weight ?? 0.5));
    // A recorded barrel carries the report; the synthesised voice then only has
    // to supply the weight underneath it, so the two never fight each other.
    const mix = options.voice !== undefined ? SHOT_VOICES[options.voice] : null;
    const recorded =
      options.voice !== undefined &&
      mix !== null &&
      this.playTake(GUN_AUDIO_URLS[options.voice], {
        pan: options.pan,
        volume: mix.take * (0.9 + calibre * 0.25) * (options.volume ?? 1),
        delay: options.delay,
        // A shade of detune so a volley never repeats the same take verbatim.
        // Kept tight: a big rate change would drag the transient off the frame
        // the trigger broke on, which is the one thing this must not do.
        rate: 0.98 + Math.random() * 0.045,
      });
    const level = (0.34 + calibre * 0.3) * (options.volume ?? 1) * (recorded && mix ? mix.synth : 1);
    const bus = this.spellBus(options.pan ?? 0, 0.5);

    // The report itself: a very short, very loud burst of noise, filtered lower
    // as the bore gets bigger.
    const crack = ctx.createBufferSource();
    crack.buffer = this.noiseBuffer(0.09 + calibre * 0.14, 5.5 - calibre * 2.6);
    const shape = ctx.createBiquadFilter();
    shape.type = "bandpass";
    shape.Q.value = 0.55;
    shape.frequency.setValueAtTime(3400 - calibre * 2200, when);
    shape.frequency.exponentialRampToValueAtTime(520 - calibre * 340, when + 0.09 + calibre * 0.1);
    const crackGain = ctx.createGain();
    crackGain.gain.setValueAtTime(level * 1.15, when);
    crackGain.gain.exponentialRampToValueAtTime(0.0001, when + 0.12 + calibre * 0.16);
    crack.connect(shape);
    shape.connect(crackGain);
    crackGain.connect(bus);
    crack.start(when);

    // The charge under it. A pistol barely has one; a gun is almost all thump.
    const punch = ctx.createOscillator();
    const punchGain = ctx.createGain();
    const span = 0.16 + calibre * 0.6;
    punch.type = "sine";
    punch.frequency.setValueAtTime(220 - calibre * 130, when);
    punch.frequency.exponentialRampToValueAtTime(52 - calibre * 26, when + span);
    punchGain.gain.setValueAtTime(0.0001, when);
    punchGain.gain.exponentialRampToValueAtTime(level * (0.5 + calibre * 0.9), when + 0.012);
    punchGain.gain.exponentialRampToValueAtTime(0.0001, when + span);
    punch.connect(punchGain);
    punchGain.connect(bus);
    punch.start(when);
    punch.stop(when + span + 0.1);

    // Powder smoke and wadding: a soft hiss trailing the shot.
    const smoke = ctx.createBufferSource();
    smoke.buffer = this.noiseBuffer(0.4 + calibre * 0.5, 1.8);
    const air = ctx.createBiquadFilter();
    air.type = "highpass";
    air.frequency.value = 2400 - calibre * 900;
    const smokeGain = ctx.createGain();
    smokeGain.gain.setValueAtTime(0.0001, when + 0.02);
    smokeGain.gain.exponentialRampToValueAtTime(level * 0.22, when + 0.07);
    smokeGain.gain.exponentialRampToValueAtTime(0.0001, when + 0.45 + calibre * 0.4);
    smoke.connect(air);
    air.connect(smokeGain);
    smokeGain.connect(bus);
    smoke.start(when + 0.02);

    // Only a gun is big enough for the hall to answer it. A recorded cannon
    // brings its own echo, so the synthesised one would only smear it.
    if (calibre > 0.6 && !recorded) {
      const echo = ctx.createBufferSource();
      echo.buffer = this.noiseBuffer(0.7, 1.2);
      const walls = ctx.createBiquadFilter();
      walls.type = "bandpass";
      walls.Q.value = 0.4;
      walls.frequency.value = 420;
      const echoGain = ctx.createGain();
      echoGain.gain.setValueAtTime(0.0001, when + 0.14);
      echoGain.gain.exponentialRampToValueAtTime(level * 0.3, when + 0.22);
      echoGain.gain.exponentialRampToValueAtTime(0.0001, when + 1.05);
      echo.connect(walls);
      walls.connect(echoGain);
      echoGain.connect(bus);
      echo.start(when + 0.13);
    }

    this.duckBeds(0.78 - calibre * 0.2, 0.5 + calibre * 0.7);
  }

  /**
   * The drill around a shot: the hammer being drawn back, a ramrod going down a
   * barrel, the ring of a linstock on a gun. Small, dry mechanical ticks that
   * make the wind-up read as a firearm rather than a spell.
   *
   * @param options `weight` 0 is a pistol lock, 1 is iron on a field gun
   */
  gunLock(options: StrikeSoundOptions = {}): void {
    if (!this.ctx || !this.master || this.muted) return;
    const ctx = this.ctx;
    const when = ctx.currentTime + Math.max(0, options.delay ?? 0);
    const weight = Math.max(0, Math.min(1, options.weight ?? 0.4));
    const level = 0.2 * (options.volume ?? 1);
    const bus = this.spellBus(options.pan ?? 0, 0.45);

    for (const step of [0, 0.07 + weight * 0.05]) {
      const tick = ctx.createBufferSource();
      tick.buffer = this.noiseBuffer(0.05, 7);
      const metal = ctx.createBiquadFilter();
      metal.type = "bandpass";
      metal.Q.value = 5 + weight * 4;
      metal.frequency.value = 2600 - weight * 1200 + (step > 0 ? 380 : 0);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(level * (step > 0 ? 0.75 : 1), when + step);
      gain.gain.exponentialRampToValueAtTime(0.0001, when + step + 0.07);
      tick.connect(metal);
      metal.connect(gain);
      gain.connect(bus);
      tick.start(when + step);
    }
  }

  /**
   * The trigger breaking, and the priming charge catching behind it.
   *
   * A muzzle-loader does not go off the instant the finger moves. The sear
   * releases, the flint rakes the frizzen, the pan flashes, and only then does
   * the main charge in the barrel light — forty to seventy milliseconds later on
   * a flintlock, longer on a gun being touched off with a portfire. That gap is
   * lock time, and it is the reason a real shot sounds like *two* events rather
   * than one: a small dry mechanical noise, then the report.
   *
   * This is the first of the two. It is played on the frame the trigger is
   * pulled; {@link gunshot} follows one lock time behind it, on the frame the
   * muzzle flash is drawn. Without it, the report is the only thing the ear gets,
   * and the moment the finger moved is inaudible.
   *
   * @param options `weight` 0 is a pistol lock, 1 is a field gun's vent
   */
  triggerPull(options: StrikeSoundOptions = {}): void {
    if (!this.ctx || !this.master || this.muted) return;
    const ctx = this.ctx;
    const when = ctx.currentTime + Math.max(0, options.delay ?? 0);
    const weight = Math.max(0, Math.min(1, options.weight ?? 0.4));
    const level = 0.16 * (options.volume ?? 1);
    const bus = this.spellBus(options.pan ?? 0, 0.5);
    // A gun is not held: it is touched off at the vent, so there is iron and a
    // fuse rather than a sear and a spring.
    const gun = weight > 0.75;

    // The sear letting go: the shortest, driest sound in the whole beat.
    const sear = ctx.createBufferSource();
    sear.buffer = this.noiseBuffer(0.018, 9);
    const snap = ctx.createBiquadFilter();
    snap.type = "bandpass";
    snap.Q.value = 6.5;
    snap.frequency.value = gun ? 1500 : 4300 - weight * 1100;
    const searGain = ctx.createGain();
    searGain.gain.setValueAtTime(level * (gun ? 1.2 : 0.9), when);
    searGain.gain.exponentialRampToValueAtTime(0.0001, when + 0.035);
    sear.connect(snap);
    snap.connect(searGain);
    searGain.connect(bus);
    sear.start(when);

    // Flint raking down the frizzen — small arms only. A very short bright
    // scrape, falling as the cock swings through.
    if (!gun) {
      const scrape = ctx.createBufferSource();
      scrape.buffer = this.noiseBuffer(0.026, 2.2);
      const steel = ctx.createBiquadFilter();
      steel.type = "bandpass";
      steel.Q.value = 1.6;
      steel.frequency.setValueAtTime(6200, when + 0.004);
      steel.frequency.exponentialRampToValueAtTime(2800, when + 0.03);
      const scrapeGain = ctx.createGain();
      scrapeGain.gain.setValueAtTime(0.0001, when + 0.004);
      scrapeGain.gain.exponentialRampToValueAtTime(level * 0.55, when + 0.009);
      scrapeGain.gain.exponentialRampToValueAtTime(0.0001, when + 0.032);
      scrape.connect(steel);
      steel.connect(scrapeGain);
      scrapeGain.connect(bus);
      scrape.start(when + 0.004);
    }

    // The priming charge catching: a thin hiss that runs right up to the report,
    // so the two read as one chain of events rather than two separate sounds. A
    // gun's fuse burns lower and longer than powder flashing in a pan.
    const flash = ctx.createBufferSource();
    const span = gun ? 0.075 : 0.03;
    flash.buffer = this.noiseBuffer(span + 0.01, 0.7);
    const air = ctx.createBiquadFilter();
    air.type = "highpass";
    air.frequency.value = gun ? 1700 : 3100;
    const flashGain = ctx.createGain();
    flashGain.gain.setValueAtTime(0.0001, when + 0.008);
    flashGain.gain.exponentialRampToValueAtTime(level * (gun ? 0.7 : 0.5), when + 0.008 + span * 0.7);
    flashGain.gain.exponentialRampToValueAtTime(0.0001, when + 0.012 + span);
    flash.connect(air);
    air.connect(flashGain);
    flashGain.connect(bus);
    flash.start(when + 0.008);
  }

  /**
   * The ball arriving: a recorded ricochet whine cut short by a thud into the
   * body. Silent (and warming) until the take has streamed in, because the
   * capture hit already has its own synthesised weight behind it.
   */
  ballImpact(options: StrikeSoundOptions = {}): void {
    this.playTake(GUN_AUDIO_URLS.impact, {
      pan: options.pan,
      volume: 0.85 * (options.volume ?? 1),
      delay: options.delay,
      rate: 0.95 + Math.random() * 0.1,
    });
  }

  /**
   * The square being taken off the enemy — the one sound in the game that means
   * *conquest* rather than violence, played on the frame the victor's boot comes
   * down on the tile it has just cleared.
   *
   * Three layers, in the order the ear should receive them:
   *
   * 1. **The boot claiming the stone.** A dry grit transient over a low stamp —
   *    weight being put down deliberately, not a body falling.
   * 2. **The claim itself.** A short brass motif rising a perfect fifth (with an
   *    octave on top when something big has gone down), each note scooped into
   *    from slightly under pitch through a filter that opens on the attack. This
   *    is the signature: two notes, up, and it can only ever mean one thing.
   * 3. **The standard planted.** Two high inharmonic partials ringing over the
   *    top for a beat, so the whole thing decays into metal rather than stopping.
   *
   * Nothing here is downloaded, so a capture is punctuated on the exact frame it
   * completes even on a cold cache.
   */
  conquest(options: ConquestOptions = {}): void {
    if (!this.ctx || !this.master || this.muted) return;
    const ctx = this.ctx;
    const when = ctx.currentTime + Math.max(0, options.delay ?? 0);
    const weight = Math.max(0, Math.min(1, options.weight ?? 0.4));
    const level = 0.28 * (options.volume ?? 1);
    const bus = this.spellBus(options.pan ?? 0, 0.5);

    // ---- the boot coming down on the taken tile --------------------------
    const heel = ctx.createBufferSource();
    heel.buffer = this.noiseBuffer(0.05, 6);
    const grit = ctx.createBiquadFilter();
    grit.type = "bandpass";
    grit.Q.value = 0.85;
    grit.frequency.value = 1550 - weight * 420;
    const heelGain = ctx.createGain();
    heelGain.gain.value = level * 0.55;
    heel.connect(grit);
    grit.connect(heelGain);
    heelGain.connect(bus);
    heel.start(when);

    const stamp = ctx.createOscillator();
    const stampGain = ctx.createGain();
    stamp.type = "sine";
    stamp.frequency.setValueAtTime(134 - weight * 42, when);
    stamp.frequency.exponentialRampToValueAtTime(48 - weight * 13, when + 0.2);
    stampGain.gain.setValueAtTime(0.0001, when);
    stampGain.gain.exponentialRampToValueAtTime(level * (0.68 + weight * 0.5), when + 0.008);
    stampGain.gain.exponentialRampToValueAtTime(0.0001, when + 0.26 + weight * 0.12);
    stamp.connect(stampGain);
    stampGain.connect(bus);
    stamp.start(when);
    stamp.stop(when + 0.42);

    // ---- the claim: root, fifth, and an octave for a heavy kill -----------
    // A bigger capture speaks lower and slower. Half an octave of drop across
    // the whole range keeps every rank inside the same motif rather than giving
    // the queen a different tune.
    const root = CLAIM_ROOT * Math.pow(2, -weight * 0.5);
    const gap = 0.08 + weight * 0.042;
    const notes: number[] = weight > 0.62 ? [1, 1.5, 2] : [1, 1.5];
    notes.forEach((ratio, index) => {
      const last = index === notes.length - 1;
      const at = when + index * gap;
      const span = last ? 0.42 + weight * 0.36 : gap * 1.6;
      const peak = level * (last ? 0.6 : 0.4);

      // Brass is a filter opening, not a waveform: the bite arrives a moment
      // after the note does.
      const bell = ctx.createBiquadFilter();
      bell.type = "lowpass";
      bell.Q.value = 0.9;
      bell.frequency.setValueAtTime(760, at);
      bell.frequency.exponentialRampToValueAtTime(2900, at + 0.05);
      bell.frequency.exponentialRampToValueAtTime(880, at + span);
      const voice = ctx.createGain();
      voice.gain.setValueAtTime(0.0001, at);
      voice.gain.exponentialRampToValueAtTime(peak, at + 0.022);
      voice.gain.exponentialRampToValueAtTime(0.0001, at + span);
      bell.connect(voice);
      voice.connect(bus);

      for (const detune of [0.996, 1.004]) {
        const brass = ctx.createOscillator();
        brass.type = "sawtooth";
        const pitch = root * ratio * detune;
        // Scooped into from under: what a horn does when it is blown hard.
        brass.frequency.setValueAtTime(pitch * 0.985, at);
        brass.frequency.exponentialRampToValueAtTime(pitch, at + 0.03);
        brass.connect(bell);
        brass.start(at);
        brass.stop(at + span + 0.06);
      }
    });

    // ---- the standard planted: metal left ringing over the square ---------
    for (const partial of [
      { ratio: 4.03, gain: 0.14, decay: 0.85 },
      { ratio: 6.11, gain: 0.07, decay: 0.6 },
    ]) {
      const ring = ctx.createOscillator();
      const ringGain = ctx.createGain();
      ring.type = "sine";
      ring.frequency.value = root * partial.ratio;
      ringGain.gain.setValueAtTime(0.0001, when + 0.012);
      ringGain.gain.exponentialRampToValueAtTime(level * partial.gain, when + 0.03);
      ringGain.gain.exponentialRampToValueAtTime(0.0001, when + partial.decay);
      ring.connect(ringGain);
      ringGain.connect(bus);
      ring.start(when + 0.012);
      ring.stop(when + partial.decay + 0.08);
    }

    this.duckBeds(0.76, 0.5 + weight * 0.45);
  }

  /** Panned input bus shared by the spell voices. */
  private spellBus(pan: number, width: number): GainNode {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) throw new Error("mixer not started");
    const bus = ctx.createGain();
    bus.gain.value = 1;
    if (typeof ctx.createStereoPanner === "function") {
      const panner = ctx.createStereoPanner();
      panner.pan.value = Math.max(-1, Math.min(1, pan)) * width;
      bus.connect(panner);
      panner.connect(master);
    } else {
      bus.connect(master);
    }
    return bus;
  }

  /**
   * Decaying white noise of a given length.
   *
   * @param falloff envelope exponent — 1 fades evenly, higher is a sharper burst
   */
  private noiseBuffer(seconds: number, falloff: number): AudioBuffer {
    const ctx = this.ctx;
    if (!ctx) throw new Error("mixer not started");
    const length = Math.max(1, Math.floor(ctx.sampleRate * seconds));
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, falloff);
    }
    return buffer;
  }

  /** Synthesised UI feedback — cheap, instant, no assets. */
  blip(kind: "hover" | "press" | "deny" = "press"): void {
    if (!this.ctx || !this.master || this.muted) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = kind === "deny" ? 700 : 2400;

    if (kind === "hover") {
      osc.type = "sine";
      osc.frequency.setValueAtTime(880, now);
      gain.gain.setValueAtTime(0.035, now);
    } else if (kind === "press") {
      osc.type = "triangle";
      osc.frequency.setValueAtTime(320, now);
      osc.frequency.exponentialRampToValueAtTime(180, now + 0.09);
      gain.gain.setValueAtTime(0.09, now);
    } else {
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(150, now);
      osc.frequency.exponentialRampToValueAtTime(80, now + 0.16);
      gain.gain.setValueAtTime(0.1, now);
    }
    gain.gain.exponentialRampToValueAtTime(0.0001, now + (kind === "hover" ? 0.09 : 0.22));
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    osc.start(now);
    osc.stop(now + 0.3);
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (!this.master || !this.ctx) return;
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(this.master.gain.value, now);
    this.master.gain.linearRampToValueAtTime(muted ? 0 : 1, now + 0.35);
  }

  dispose(): void {
    for (const bed of this.beds.values()) bed.source?.stop();
    this.beds.clear();
    this.voices.clear();
    this.voiceLoads.clear();
    this.shots.clear();
    this.shotLoads.clear();
    this.activeVoices = 0;
    this.bedBus = null;
    void this.ctx?.close();
    this.ctx = null;
  }
}

export const audio = new AudioManager();
