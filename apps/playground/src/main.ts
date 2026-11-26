import {
  Animator,
  Figure,
  Ticker,
  Tweens,
  angleDelta,
  damp,
  degToRad,
  humanoid,
  humanoidClips,
  radToDeg,
  type Chain,
  type Clip,
  type Node,
  type Playback,
  type Solver,
} from "@animeant/core";
import { CanvasRenderer } from "@animeant/canvas";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const canvas = $<HTMLCanvasElement>("canvas");
const stage = canvas.parentElement!;
const list = $<HTMLUListElement>("nodes");
const highlight = $<HTMLSpanElement>("highlight");
const hint = $<HTMLParagraphElement>("hint");
const readoutName = $<HTMLSpanElement>("readout-name");
const readoutValue = $<HTMLSpanElement>("readout-value");
const resetBtn = $<HTMLButtonElement>("reset");
const panel = $<HTMLElement>("panel");
const handle = $<HTMLButtonElement>("panel-handle");
const solverRow = $<HTMLDivElement>("solver-row");
const transport = $<HTMLDivElement>("transport");
const playBtn = $<HTMLButtonElement>("play");
const scrub = $<HTMLInputElement>("scrub");
const scrubTime = $<HTMLSpanElement>("scrub-time");
$<HTMLSpanElement>("count").textContent = String(humanoid.nodes.length);

const figure = Figure.fromRig(humanoid);
const renderer = new CanvasRenderer(canvas);
const animator = new Animator(figure);
const tweens = new Tweens();
const ticker = new Ticker({ fixedStep: 1 / 120 });

// ---------- Theme ----------

const readTheme = () => {
  const s = getComputedStyle(document.documentElement);
  const v = (name: string) => s.getPropertyValue(name).trim();
  renderer.theme = { bone: v("--bone"), joint: v("--bone"), head: v("--bone"), root: v("--root"), accent: v("--accent") };
};
readTheme();
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", readTheme);

// ---------- Layout ----------

let figureScale = 1;
/** User drag of the root, in stage px. An object so it can be tweened. */
const offset = { x: 0, y: 0 };
/** Where the figure sits; eased so it glides when the mobile sheet opens. */
const frameBox = { cy: 0, scale: 1 };
const frameTarget = { cy: 0, scale: 1 };

/** The part of the stage not covered by the transport or the bottom sheet. */
const visibleHeight = () => {
  let h = renderer.height - transport.offsetHeight - 12;
  if (panel.classList.contains("is-open") && getComputedStyle(panel).position === "fixed") {
    const stageTop = stage.getBoundingClientRect().top;
    const sheetTop = window.innerHeight - panel.offsetHeight;
    h = Math.min(h, sheetTop - stageTop - 8);
  }
  return Math.max(160, h);
};

const computeFrame = () => {
  const vh = visibleHeight();
  // Rest pose spans ~160px above the hips and ~118px below at scale 1, plus room for jumps.
  frameTarget.scale = Math.max(0.4, Math.min(1.6, Math.min(renderer.width / 380, (vh - 64) / 300)));
  frameTarget.cy = vh / 2 + 30 * frameTarget.scale;
  stage.style.setProperty("--transport-h", `${transport.offsetHeight}px`);
};

const placeRoot = () => {
  figureScale = frameBox.scale;
  figure.root.scaleX = figure.root.scaleY = figureScale;
  figure.root.x = renderer.width / 2 + offset.x;
  figure.root.y = frameBox.cy + offset.y;
};

const layout = () => {
  renderer.resize();
  computeFrame();
  if (frameBox.cy === 0) Object.assign(frameBox, frameTarget);
  placeRoot();
};
new ResizeObserver(layout).observe(stage);

// ---------- Selection & node list ----------

let selected: Node = figure.root;
let hovered: Node | null = null;
let focusAmt = 1;
let hoverAmt = 0;

const depthOf = (n: Node) => {
  let d = 0;
  for (let p = n.parent; p; p = p.parent) d++;
  return d;
};

const rows = new Map<Node, { li: HTMLLIElement; value: HTMLSpanElement; slider: HTMLInputElement; last: number }>();

figure.nodes.forEach((node, i) => {
  const li = document.createElement("li");
  li.className = "node";
  li.style.animationDelay = `${i * 30}ms`;
  li.innerHTML = `
    <span class="node-name">
      <span class="node-depth">${"·".repeat(depthOf(node)) || "◦"}</span>
      <span class="node-label">${node.name}</span>
    </span>
    <span class="node-value">0°</span>
    <input class="slider" type="range" min="-180" max="180" step="1" value="0" aria-label="${node.name} rotation" />
  `;
  const value = li.querySelector<HTMLSpanElement>(".node-value")!;
  const slider = li.querySelector<HTMLInputElement>(".slider")!;
  if (node.limits) {
    slider.min = String(Math.round(radToDeg(node.limits[0])));
    slider.max = String(Math.round(radToDeg(node.limits[1])));
  }
  slider.addEventListener("input", () => {
    tweens.kill(node);
    node.rotation = degToRad(Number(slider.value));
    select(node);
  });
  li.addEventListener("pointerdown", () => select(node));
  list.appendChild(li);
  rows.set(node, { li, value, slider, last: NaN });
});

const moveHighlight = () => {
  const row = rows.get(selected);
  if (!row) return;
  highlight.style.transform = `translateY(${row.li.offsetTop}px)`;
  highlight.style.height = `${row.li.offsetHeight}px`;
  highlight.classList.add("is-on");
};

function select(node: Node) {
  if (node === selected) return;
  rows.get(selected)?.li.classList.remove("is-selected");
  selected = node;
  focusAmt = 0;
  const row = rows.get(node)!;
  row.li.classList.add("is-selected");
  moveHighlight();
  row.li.scrollIntoView({ block: "nearest", behavior: "smooth" });
  readoutName.classList.add("is-swapping");
  setTimeout(() => {
    readoutName.textContent = node.name;
    readoutName.classList.remove("is-swapping");
  }, 120);
}

rows.get(selected)!.li.classList.add("is-selected");
requestAnimationFrame(moveHighlight);
window.addEventListener("resize", moveHighlight);

// ---------- Segmented controls ----------

/** A segmented control whose pill slides to the checked option. */
function segmented<T extends string>(root: HTMLElement, initial: T, onChange: (v: T) => void) {
  const pill = root.querySelector<HTMLSpanElement>(".segmented-pill")!;
  const buttons = [...root.querySelectorAll<HTMLButtonElement>("button")];
  const set = (value: T, notify: boolean) => {
    for (const b of buttons) {
      const on = b.dataset.value === value;
      b.setAttribute("aria-checked", String(on));
      if (on) {
        pill.style.width = `${b.offsetWidth}px`;
        pill.style.transform = `translateX(${b.offsetLeft}px)`;
      }
    }
    if (notify) onChange(value);
  };
  buttons.forEach((b) => b.addEventListener("click", () => set(b.dataset.value as T, true)));
  const sync = () =>
    set((buttons.find((b) => b.getAttribute("aria-checked") === "true")?.dataset.value ?? initial) as T, false);
  new ResizeObserver(sync).observe(root);
  set(initial, false);
}

type Mode = "fk" | "ik";
let mode: Mode = "ik";
let solver: Solver = "fabrik";
let speed = 1;

const setHint = () => {
  for (const el of hint.querySelectorAll<HTMLElement>("[data-fk]")) el.textContent = el.dataset[mode] ?? "";
};

segmented<Mode>($("mode"), mode, (v) => {
  mode = v;
  solverRow.classList.toggle("is-hidden", mode !== "ik");
  setHint();
});
segmented<Solver>($("solver"), solver, (v) => (solver = v));
segmented<"0.5" | "1" | "2">($("speed"), "1", (v) => {
  speed = Number(v);
  for (const pb of animator.playbacks) pb.speed = speed;
});

// ---------- Clips ----------

const clipFor = (name: string) => humanoidClips[name as keyof typeof humanoidClips] as Clip;
const chips = [...document.querySelectorAll<HTMLButtonElement>(".chip")];
/** The current clip on each layer: 0 = body clips, 1 = wave. */
const current = new Map<number, Playback>();
let paused = false;

const syncChips = () => {
  for (const chip of chips) {
    const layer = chip.dataset.clip === "wave" ? 1 : 0;
    const pb = current.get(layer);
    chip.setAttribute("aria-pressed", String(!!pb && !pb.stopping && pb.clip.name === chip.dataset.clip));
  }
  const base = current.get(0) ?? current.get(1);
  const live = !!base && !base.stopping;
  scrub.disabled = !live;
  playBtn.disabled = !live;
};

const setPaused = (p: boolean) => {
  paused = p;
  for (const pb of animator.playbacks) p ? pb.pause() : pb.resume();
  playBtn.dataset.state = p ? "paused" : "playing";
  playBtn.setAttribute("aria-label", p ? "Play" : "Pause");
};

for (const chip of chips) {
  chip.addEventListener("click", () => {
    const name = chip.dataset.clip!;
    const layer = name === "wave" ? 1 : 0;
    const pb = current.get(layer);
    if (pb && !pb.stopping && pb.clip.name === name) {
      pb.stop(0.45);
      current.delete(layer);
    } else {
      tweens.kill(offset);
      for (const n of figure.nodes) tweens.kill(n);
      current.set(layer, animator.play(clipFor(name), { layer, fade: 0.45, speed }));
      if (paused) setPaused(false);
    }
    hint.classList.add("is-gone");
    syncChips();
  });
}

playBtn.addEventListener("click", () => setPaused(!paused));

scrub.addEventListener("input", () => {
  const pb = current.get(0) ?? current.get(1);
  if (!pb) return;
  if (!paused) setPaused(true);
  const phase = Number(scrub.value) / 1000;
  // Seek every live clip to the same phase so layers stay in step.
  for (const other of animator.playbacks) other.seek(phase * other.duration);
});

syncChips();

// ---------- IK chains ----------

const chains = new Map<Node, Chain>([
  [figure.node("handL"), figure.chain("handL")],
  [figure.node("handR"), figure.chain("handR")],
  [figure.node("footL"), figure.chain("footL")],
  [figure.node("footR"), figure.chain("footR")],
  [figure.node("head"), figure.chain(["spine", "neck", "head"])],
]);
const effectors = [...chains.keys()];

/**
 * A live IK drag. The pointer is the goal; `pos` trails it softly. `weight`
 * blends the solve over whatever animation is playing: 1 while held, easing
 * back to 0 after release so the clip takes the limb back.
 */
type IKDrag = {
  chain: Chain;
  goal: { x: number; y: number };
  pos: { x: number; y: number };
  reached: boolean;
  released: boolean;
  weight: number;
};
let ik: IKDrag | null = null;
let settling: IKDrag[] = [];
let effectorAmt = 1;
let targetAmt = 0;
let lastTarget = { x: 0, y: 0, reached: true };

/** Returns false when the drag is finished. */
const stepDrag = (d: IKDrag, step: number): boolean => {
  d.pos.x = damp(d.pos.x, d.goal.x, 22, step);
  d.pos.y = damp(d.pos.y, d.goal.y, 22, step);

  const animating = animator.active;
  if (d.released && animating) d.weight = damp(d.weight, 0, 5, step);

  const before = animating ? d.chain.joints.map((j) => j.rotation) : null;
  d.chain.solve(d.pos, { solver, iterations: 10, tolerance: 0.25 });
  if (before) {
    d.chain.joints.forEach((j, i) => {
      const anim = before[i]!;
      j.rotation = anim + angleDelta(anim, j.rotation) * d.weight;
    });
  }

  // Dashed ring only when the goal is truly out of reach, not while catching up.
  const b = d.chain.base.worldPosition;
  d.reached = Math.hypot(d.goal.x - b.x, d.goal.y - b.y) <= d.chain.reach + 1;

  if (!d.released) return true;
  if (animating) return d.weight > 0.01;
  return Math.hypot(d.goal.x - d.pos.x, d.goal.y - d.pos.y) > 0.3;
};

// ---------- Pointer ----------

let dragging: { node: Node; pointerId: number; grab: { x: number; y: number } } | null = null;

const toStage = (e: PointerEvent) => {
  const r = canvas.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
};

const hitTest = (p: { x: number; y: number }): Node | null => {
  const radius = Math.max(18, 14 * figureScale);
  let best: Node | null = null;
  let bestD = radius;
  for (const n of figure.nodes) {
    const w = n.worldPosition;
    const d = Math.hypot(w.x - p.x, w.y - p.y);
    if (d < bestD) { bestD = d; best = n; }
  }
  return best;
};

canvas.addEventListener("pointermove", (e) => {
  const p = toStage(e);
  if (dragging && e.pointerId === dragging.pointerId) {
    const node = dragging.node;
    if (node === figure.root) {
      offset.x = p.x - dragging.grab.x - renderer.width / 2;
      offset.y = p.y - dragging.grab.y - frameBox.cy;
    } else if (ik) {
      ik.goal = { x: p.x - dragging.grab.x, y: p.y - dragging.grab.y };
    } else {
      // FK: rotate the parent so this joint points at the pointer.
      const parent = node.parent!;
      const pivot = parent.worldPosition;
      const joint = node.worldPosition;
      const cur = Math.atan2(joint.y - pivot.y, joint.x - pivot.x);
      const want = Math.atan2(p.y - pivot.y, p.x - pivot.x);
      parent.rotation += angleDelta(cur, want);
      parent.constrain();
    }
    return;
  }
  const hit = hitTest(p);
  if (hit !== hovered) { hovered = hit; hoverAmt = 0; }
  canvas.style.cursor = hit ? "grab" : "default";
});

canvas.addEventListener("pointerdown", (e) => {
  const p = toStage(e);
  const hit = hitTest(p);
  if (!hit) return;
  try { canvas.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
  const w = hit.worldPosition;
  dragging = { node: hit, pointerId: e.pointerId, grab: { x: p.x - w.x, y: p.y - w.y } };
  tweens.kill(offset);
  for (const n of figure.nodes) tweens.kill(n);

  const chain = mode === "ik" ? chains.get(hit) : undefined;
  if (ik?.released) settling.push(ik);
  settling = settling.filter((d) => d.chain !== chain);
  ik = chain ? { chain, goal: { ...w }, pos: { ...w }, reached: true, released: false, weight: 1 } : null;

  select(hit === figure.root ? hit : hit.parent ?? hit);
  canvas.style.cursor = "grabbing";
  hint.classList.add("is-gone");
});

const endDrag = (e: PointerEvent) => {
  if (!dragging || e.pointerId !== dragging.pointerId) return;
  dragging = null;
  // Let the trailing target finish its glide, or hand the limb back to the clip.
  if (ik) ik.released = true;
  canvas.style.cursor = hovered ? "grab" : "default";
};
canvas.addEventListener("pointerup", endDrag);
canvas.addEventListener("pointercancel", endDrag);
canvas.addEventListener("pointerleave", () => { if (!dragging) hovered = null; });

// ---------- Controls ----------

resetBtn.addEventListener("click", () => {
  ik = null;
  settling = [];
  animator.stop(undefined, 0.3);
  current.clear();
  setPaused(false);
  syncChips();
  // Tweens write after the animator each step, so they win while it fades.
  figure.nodes.forEach((n, i) => {
    tweens.to(n, { rotation: 0 }, { duration: 0.7, delay: i * 0.012, ease: "outQuint" });
  });
  tweens.to(offset, { x: 0, y: 0 }, { duration: 0.7, ease: "outQuint" });
  resetBtn.classList.add("is-pulsing");
  setTimeout(() => resetBtn.classList.remove("is-pulsing"), 200);
});

handle.addEventListener("click", () => {
  panel.classList.toggle("is-open");
  computeFrame();
  setTimeout(moveHighlight, 30);
});

// ---------- Loop ----------

// Simulation: host placement → animation → IK on top → tweens, at a fixed rate.
ticker.onFixed((step) => {
  placeRoot();
  animator.rebase(figure.root);
  animator.update(step);
  settling = settling.filter((d) => stepDrag(d, step));
  if (ik) {
    const alive = stepDrag(ik, step);
    lastTarget = { x: ik.goal.x, y: ik.goal.y, reached: ik.reached };
    if (!alive) ik = null;
  }
  tweens.update(step);
  for (const [layer, pb] of current) if (pb.dead) current.delete(layer);
});

ticker.onFrame((rawDt) => {
  const dt = Math.min(0.05, rawDt);

  frameBox.cy = damp(frameBox.cy, frameTarget.cy, 7, dt);
  frameBox.scale = damp(frameBox.scale, frameTarget.scale, 7, dt);

  focusAmt = damp(focusAmt, 1, 12, dt);
  hoverAmt = damp(hoverAmt, hovered && hovered !== selected ? 1 : 0, 16, dt);
  effectorAmt = damp(effectorAmt, mode === "ik" && !dragging ? 1 : 0, 10, dt);
  const holding = !!ik && !ik.released;
  targetAmt = damp(targetAmt, holding ? 1 : 0, holding ? 18 : 8, dt);

  const k = Math.min(1.3, Math.max(0.8, figureScale));
  renderer.clear();
  renderer.draw(figure, {
    focus: { node: selected, amount: focusAmt },
    hover: hovered ? { node: hovered, amount: hoverAmt } : null,
    effectors: { nodes: effectors, amount: effectorAmt },
    target: { ...lastTarget, amount: targetAmt },
    limits: { node: selected, amount: focusAmt * (selected.limits ? 1 : 0) },
    boneWidth: 3.5 * k,
    jointRadius: 4.5 * k,
    headRadius: 16 * figureScale,
  });

  for (const [node, row] of rows) {
    const deg = Math.round(radToDeg(angleDelta(0, node.rotation)));
    if (deg === row.last) continue;
    row.last = deg;
    row.value.textContent = `${deg}°`;
    if (document.activeElement !== row.slider) row.slider.value = String(deg);
    const lo = Number(row.slider.min), hi = Number(row.slider.max);
    row.slider.style.setProperty("--p", `${((deg - lo) / (hi - lo)) * 100}%`);
    row.slider.style.setProperty("--z", `${((0 - lo) / (hi - lo)) * 100}%`);
  }
  readoutValue.textContent = rows.get(selected)!.value.textContent;

  const pb = current.get(0) ?? current.get(1);
  if (pb) {
    if (document.activeElement !== scrub || !paused) scrub.value = String(Math.round(pb.progress * 1000));
    scrub.style.setProperty("--p", `${pb.progress * 100}%`);
    scrubTime.textContent = `${pb.localTime.toFixed(2)}s`;
  }
  if (!pb && !scrub.disabled) syncChips();
});

layout();
ticker.start();
