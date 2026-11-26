export type FixedCallback = (step: number, time: number) => void;
export type FrameCallback = (dt: number, alpha: number) => void;

export interface TickerOptions {
  /** Seconds per fixed step. Default 1/120. */
  fixedStep?: number;
  /** Cap on fixed steps per frame, so a stalled tab can't spiral. Default 8. */
  maxSteps?: number;
}

/**
 * One clock for everything. Simulation (physics, solvers) runs in fixed steps
 * so it is deterministic; rendering runs once per frame with an `alpha` for
 * interpolating between the last two fixed states.
 *
 * `advance(dt)` drives it manually (tests, offline rendering); `start()`
 * drives it from requestAnimationFrame.
 */
export class Ticker {
  readonly fixedStep: number;
  readonly maxSteps: number;
  time = 0;
  #acc = 0;
  #raf = 0;
  #last = 0;
  readonly #fixed = new Set<FixedCallback>();
  readonly #frame = new Set<FrameCallback>();

  constructor(opts: TickerOptions = {}) {
    this.fixedStep = opts.fixedStep ?? 1 / 120;
    this.maxSteps = opts.maxSteps ?? 8;
  }

  get running(): boolean {
    return this.#raf !== 0;
  }

  onFixed(cb: FixedCallback): () => void {
    this.#fixed.add(cb);
    return () => this.#fixed.delete(cb);
  }

  onFrame(cb: FrameCallback): () => void {
    this.#frame.add(cb);
    return () => this.#frame.delete(cb);
  }

  /** Advance by `dt` seconds. Returns the number of fixed steps run. */
  advance(dt: number): number {
    const step = this.fixedStep;
    this.#acc += Math.min(Math.max(dt, 0), step * this.maxSteps);
    let steps = 0;
    while (this.#acc >= step - 1e-9) {
      for (const cb of this.#fixed) cb(step, this.time);
      this.time += step;
      this.#acc -= step;
      steps++;
    }
    if (this.#acc < 0) this.#acc = 0;
    const alpha = this.#acc / step;
    for (const cb of this.#frame) cb(dt, alpha);
    return steps;
  }

  start(): this {
    if (this.running || typeof requestAnimationFrame === "undefined") return this;
    this.#last = performance.now();
    const loop = (now: number) => {
      const dt = (now - this.#last) / 1000;
      this.#last = now;
      this.advance(dt);
      this.#raf = requestAnimationFrame(loop);
    };
    this.#raf = requestAnimationFrame(loop);
    return this;
  }

  stop(): this {
    if (this.#raf) cancelAnimationFrame(this.#raf);
    this.#raf = 0;
    return this;
  }
}
