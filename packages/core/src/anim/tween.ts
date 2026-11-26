import { angleDelta } from "../math/angle";
import { resolveEase, type Ease, type EaseFn } from "./easing";

export interface TweenOptions {
  /** Seconds. */
  duration: number;
  ease?: Ease;
  /** Seconds before starting. */
  delay?: number;
  /**
   * Keys treated as angles and turned the short way round.
   * Default: any key named "rotation".
   */
  angles?: readonly string[];
  onUpdate?: () => void;
}

type Numeric<T> = { [K in keyof T]: T[K] extends number ? K : never }[keyof T];
export type TweenProps<T> = Partial<Pick<T, Numeric<T>>>;

interface Lane {
  key: string;
  from: number;
  to: number;
}

/** A running tween. Await `finished`, or `cancel()` to stop where it is. */
export class Tween<T extends object = object> {
  readonly target: T;
  readonly finished: Promise<boolean>;
  lanes: Lane[] = [];
  #resolve!: (completed: boolean) => void;
  #elapsed = 0;
  #started = false;
  #done = false;
  readonly #props: Record<string, number>;
  readonly #opts: TweenOptions;
  readonly #ease: EaseFn;

  constructor(target: T, props: Record<string, number>, opts: TweenOptions) {
    this.target = target;
    this.#props = props;
    this.#opts = opts;
    this.#ease = resolveEase(opts.ease);
    this.finished = new Promise((r) => (this.#resolve = r));
  }

  get done(): boolean {
    return this.#done;
  }

  /** Drop lanes another tween now owns. */
  release(keys: Iterable<string>): void {
    const drop = new Set(keys);
    this.lanes = this.lanes.filter((l) => !drop.has(l.key));
    for (const k of drop) delete this.#props[k];
  }

  get keys(): string[] {
    return this.#started ? this.lanes.map((l) => l.key) : Object.keys(this.#props);
  }

  #start(): void {
    this.#started = true;
    const t = this.target as Record<string, number>;
    const angles = this.#opts.angles ?? ["rotation"];
    for (const [key, to] of Object.entries(this.#props)) {
      const from = t[key]!;
      const end = angles.includes(key) ? from + angleDelta(from, to) : to;
      this.lanes.push({ key, from, to: end });
    }
  }

  /** Advance by dt seconds. Returns false once finished. */
  update(dt: number): boolean {
    if (this.#done) return false;
    this.#elapsed += dt;
    const delay = this.#opts.delay ?? 0;
    if (this.#elapsed < delay) return true;
    if (!this.#started) this.#start();
    const d = Math.max(this.#opts.duration, 1e-6);
    const p = Math.min(1, (this.#elapsed - delay) / d);
    const k = this.#ease(p);
    const t = this.target as Record<string, number>;
    for (const l of this.lanes) t[l.key] = l.from + (l.to - l.from) * k;
    this.#opts.onUpdate?.();
    if (p >= 1) this.#finish(true);
    return !this.#done;
  }

  cancel(): void {
    this.#finish(false);
  }

  #finish(completed: boolean): void {
    if (this.#done) return;
    this.#done = true;
    this.#resolve(completed);
  }
}

/**
 * A group of tweens driven by one clock (hook `update` to a Ticker).
 * Tweening a key that another tween already drives takes it over.
 */
export class Tweens {
  #list: Tween<any>[] = [];

  get active(): number {
    return this.#list.length;
  }

  to<T extends object>(target: T, props: TweenProps<T>, opts: TweenOptions): Tween<T> {
    const keys = Object.keys(props);
    for (const tw of this.#list) if (tw.target === target) tw.release(keys);
    const tween = new Tween(target, { ...(props as Record<string, number>) }, opts);
    this.#list.push(tween);
    return tween;
  }

  /** Cancel tweens on a target, optionally only some keys. */
  kill(target: object, keys?: string[]): void {
    for (const tw of this.#list) {
      if (tw.target !== target) continue;
      if (keys) tw.release(keys);
      if (!keys || tw.keys.length === 0) tw.cancel();
    }
    this.#list = this.#list.filter((t) => !t.done);
  }

  update(dt: number): void {
    // Copy: callbacks may add tweens mid-update.
    for (const tw of [...this.#list]) tw.update(dt);
    this.#list = this.#list.filter((t) => !t.done && (t.keys.length > 0 || !t.lanes.length));
  }
}
