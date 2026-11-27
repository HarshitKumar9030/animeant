/**
 * Generated sound for the film: a soft chord pad that moves with each
 * chapter, birds in the forest, wind in the open, and footsteps triggered
 * from the walkers' gait phase. Everything is synthesized; no files.
 */
export class FilmAudio {
  readonly ctx: AudioContext;
  /** Everything audible; also feeds `stream` for recording. */
  readonly master: GainNode;
  readonly stream: MediaStream;
  #pad: { osc: OscillatorNode[]; gain: GainNode; filter: BiquadFilterNode };
  #wind: { gain: GainNode; filter: BiquadFilterNode };
  #noise: AudioBuffer;
  #chord = -1;
  #nextBird = 0;

  constructor() {
    this.ctx = new AudioContext();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0;
    const comp = this.ctx.createDynamicsCompressor();
    this.master.connect(comp);
    comp.connect(this.ctx.destination);
    const dest = this.ctx.createMediaStreamDestination();
    comp.connect(dest);
    this.stream = dest.stream;

    // One second of white noise, reused by wind and footsteps.
    this.#noise = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
    const data = this.#noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    // Pad: four voices through a slow low-pass.
    const padGain = this.ctx.createGain();
    padGain.gain.value = 0.09;
    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 900;
    filter.Q.value = 0.4;
    padGain.connect(filter);
    filter.connect(this.master);
    const osc = [0, 1, 2, 3].map((i) => {
      const o = this.ctx.createOscillator();
      o.type = i % 2 ? "triangle" : "sine";
      o.detune.value = (i - 1.5) * 4;
      const g = this.ctx.createGain();
      g.gain.value = i === 0 ? 0.5 : 0.32;
      o.connect(g);
      g.connect(padGain);
      o.start();
      return o;
    });
    this.#pad = { osc, gain: padGain, filter };

    // Wind: looping noise through a wandering band-pass.
    const src = this.ctx.createBufferSource();
    src.buffer = this.#noise;
    src.loop = true;
    const wf = this.ctx.createBiquadFilter();
    wf.type = "bandpass";
    wf.frequency.value = 500;
    wf.Q.value = 0.6;
    const wg = this.ctx.createGain();
    wg.gain.value = 0;
    src.connect(wf);
    wf.connect(wg);
    wg.connect(this.master);
    src.start();
    this.#wind = { gain: wg, filter: wf };
  }

  get running(): boolean { return this.ctx.state === "running"; }

  async enable(on: boolean): Promise<void> {
    if (on) await this.ctx.resume();
    this.master.gain.setTargetAtTime(on ? 0.9 : 0, this.ctx.currentTime, 0.25);
  }

  /** Chords per chapter: semitone offsets from A2. */
  static readonly CHORDS = [
    [0, 7, 12, 15], // Am, deep forest
    [-4, 3, 8, 12], // F
    [-2, 5, 10, 14], // G
    [3, 10, 15, 19], // C
    [-7, 0, 7, 12], // D, open
    [0, 7, 12, 16], // A major, the lineup
  ];

  /** Per frame: chapter index, how much forest is around, and how open the land is. */
  update(chapter: number, forest: number, open: number, swell: number): void {
    const t = this.ctx.currentTime;
    if (chapter !== this.#chord) {
      this.#chord = chapter;
      const chord = FilmAudio.CHORDS[Math.min(chapter, FilmAudio.CHORDS.length - 1)]!;
      chord.forEach((semi, i) => this.#pad.osc[i]!.frequency.setTargetAtTime(110 * 2 ** (semi / 12), t, 0.9));
    }
    this.#pad.filter.frequency.setTargetAtTime(700 + swell * 900, t, 0.5);
    this.#pad.gain.gain.setTargetAtTime(0.08 + swell * 0.05, t, 0.6);
    this.#wind.gain.gain.setTargetAtTime(0.02 + open * 0.06, t, 0.8);
    this.#wind.filter.frequency.setTargetAtTime(380 + Math.sin(t * 0.3) * 160 + open * 200, t, 0.5);
    if (forest > 0.05 && t > this.#nextBird) {
      this.#bird(forest);
      this.#nextBird = t + 0.6 + Math.random() * 2.4 / forest;
    }
  }

  #bird(level: number): void {
    const t = this.ctx.currentTime;
    const notes = 2 + Math.floor(Math.random() * 3);
    const base = 2200 + Math.random() * 1600;
    const pan = this.ctx.createStereoPanner();
    pan.pan.value = Math.random() * 1.6 - 0.8;
    pan.connect(this.master);
    for (let i = 0; i < notes; i++) {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      const start = t + i * 0.11;
      o.frequency.setValueAtTime(base * (1 + i * 0.06), start);
      o.frequency.exponentialRampToValueAtTime(base * (1.25 + i * 0.05), start + 0.07);
      g.gain.setValueAtTime(0, start);
      g.gain.linearRampToValueAtTime(0.035 * level, start + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, start + 0.09);
      o.connect(g);
      g.connect(pan);
      o.start(start);
      o.stop(start + 0.1);
    }
  }

  /** A footfall. `weight` ≈ body size, `pan` -1..1, `soft` for knuckles. */
  step(weight: number, pan: number, volume: number, soft = false): void {
    if (volume <= 0.01) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.#noise;
    src.playbackRate.value = 0.7 + Math.random() * 0.3;
    const f = this.ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = soft ? 900 : 380 + weight * 120;
    const g = this.ctx.createGain();
    const peak = (soft ? 0.12 : 0.26) * volume * (0.7 + weight * 0.3);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + (soft ? 0.07 : 0.16));
    const p = this.ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    src.connect(f);
    f.connect(g);
    g.connect(p);
    p.connect(this.master);
    src.start(t, Math.random() * 0.8, 0.2);
  }
}
