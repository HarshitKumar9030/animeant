import { Figure, humanoid, angleDelta, radToDeg, degToRad, type Node } from "@animeant/core";
import { CanvasRenderer } from "@animeant/canvas";
import { approach, tween, type Tween } from "./tween";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const canvas = $<HTMLCanvasElement>("canvas");
const stage = canvas.parentElement!;
const list = $<HTMLUListElement>("nodes");
const highlight = $<HTMLSpanElement>("highlight");
const hint = $<HTMLParagraphElement>("hint");
const readoutName = $<HTMLSpanElement>("readout-name");
const readoutValue = $<HTMLSpanElement>("readout-value");
const resetBtn = $<HTMLButtonElement>("reset");
const swayInput = $<HTMLInputElement>("sway");
const panel = $<HTMLElement>("panel");
const handle = $<HTMLButtonElement>("panel-handle");
$<HTMLSpanElement>("count").textContent = String(humanoid.nodes.length);

const figure = Figure.fromRig(humanoid);
const renderer = new CanvasRenderer(canvas);

// ---------- Theme ----------

const readTheme = () => {
  const s = getComputedStyle(document.documentElement);
  const v = (name: string) => s.getPropertyValue(name).trim();
  renderer.theme = {
    bone: v("--bone"),
    joint: v("--bone"),
    head: v("--bone"),
    root: v("--root"),
    accent: v("--accent"),
  };
};
readTheme();
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", readTheme);

// ---------- Layout ----------

let figureScale = 1;
let offset = { x: 0, y: 0 }; // user drag of the root, in stage px
// Where the figure sits; eased so it glides when the mobile sheet opens.
const frameBox = { cy: 0, scale: 1 };
const frameTarget = { cy: 0, scale: 1 };

/** The part of the stage not covered by the bottom sheet. */
const visibleHeight = () => {
  const h = renderer.height;
  if (!panel.classList.contains("is-open") || getComputedStyle(panel).position !== "fixed") return h;
  const stageTop = stage.getBoundingClientRect().top;
  const sheetTop = window.innerHeight - panel.offsetHeight;
  return Math.max(160, Math.min(h, sheetTop - stageTop - 8));
};

const computeFrame = () => {
  const w = renderer.width;
  const vh = visibleHeight();
  // The rest pose spans ~160px above the hips and ~114px below at scale 1.
  frameTarget.scale = Math.max(0.4, Math.min(1.7, Math.min(w / 380, (vh - 48) / 300)));
  frameTarget.cy = vh / 2 + 23 * frameTarget.scale;
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

// ---------- State ----------

let selected: Node = figure.root;
let hovered: Node | null = null;
let focusAmt = 1;
let hoverAmt = 0;
let dragging: { node: Node; pointerId: number; grab: { x: number; y: number } } | null = null;
let resetTween: Tween | null = null;
const swayOffsets = new Map<string, number>();

// ---------- Node list ----------

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
  slider.addEventListener("input", () => {
    resetTween = null;
    node.rotation = degToRad(Number(slider.value)) + (swayOffsets.get(node.name) ?? 0);
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

// ---------- Pointer ----------

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
      offset = { x: p.x - dragging.grab.x - renderer.width / 2, y: p.y - dragging.grab.y - frameBox.cy };
      placeRoot();
    } else {
      // Rotate the parent so this joint points at the pointer.
      const parent = node.parent!;
      const pivot = parent.worldPosition;
      const joint = node.worldPosition;
      const current = Math.atan2(joint.y - pivot.y, joint.x - pivot.x);
      const wanted = Math.atan2(p.y - pivot.y, p.x - pivot.x);
      parent.rotation += angleDelta(current, wanted);
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
  canvas.setPointerCapture(e.pointerId);
  resetTween = null;
  const w = hit.worldPosition;
  dragging = { node: hit, pointerId: e.pointerId, grab: { x: p.x - w.x, y: p.y - w.y } };
  select(hit === figure.root ? hit : hit.parent ?? hit);
  canvas.style.cursor = "grabbing";
  hint.classList.add("is-gone");
});

const endDrag = (e: PointerEvent) => {
  if (!dragging || e.pointerId !== dragging.pointerId) return;
  dragging = null;
  canvas.style.cursor = hovered ? "grab" : "default";
};
canvas.addEventListener("pointerup", endDrag);
canvas.addEventListener("pointercancel", endDrag);
canvas.addEventListener("pointerleave", () => { if (!dragging) hovered = null; });

// ---------- Controls ----------

resetBtn.addEventListener("click", () => {
  const nodes = figure.nodes;
  const from = [...nodes.map((n) => n.rotation - (swayOffsets.get(n.name) ?? 0)), offset.x, offset.y];
  const to = from.map(() => 0);
  // Unwind each joint the short way round.
  for (let i = 0; i < nodes.length; i++) from[i] = angleDelta(0, from[i]!);
  resetTween = tween(from, to, 700, (v) => {
    nodes.forEach((n, i) => { n.rotation = v[i]! + (swayOffsets.get(n.name) ?? 0); });
    offset = { x: v[nodes.length]!, y: v[nodes.length + 1]! };
  });
  resetBtn.classList.add("is-pulsing");
  setTimeout(() => resetBtn.classList.remove("is-pulsing"), 200);
});

handle.addEventListener("click", () => {
  panel.classList.toggle("is-open");
  computeFrame();
  setTimeout(moveHighlight, 30);
});

// ---------- Sway (additive, so it composes with dragging) ----------

const swayPlan: [string, number, number, number][] = [
  // node, amplitude (rad), speed, phase
  ["spine", 0.05, 1.3, 0],
  ["neck", 0.06, 1.3, 0.6],
  ["shoulderL", 0.12, 1.3, 1.2],
  ["shoulderR", 0.12, 1.3, 1.2 + Math.PI],
  ["elbowL", 0.1, 1.3, 1.8],
  ["elbowR", 0.1, 1.3, 1.8 + Math.PI],
];
let swayWeight = 0;

const applySway = (time: number, dt: number) => {
  swayWeight = approach(swayWeight, swayInput.checked ? 1 : 0, dt, 4);
  for (const [name, amp, speed, phase] of swayPlan) {
    const next = Math.sin(time * speed + phase) * amp * swayWeight;
    const prev = swayOffsets.get(name) ?? 0;
    figure.node(name).rotation += next - prev;
    swayOffsets.set(name, next);
  }
};

// ---------- Loop ----------

let last = performance.now();
const frame = (now: number) => {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  if (resetTween && !resetTween.update(now)) resetTween = null;
  frameBox.cy = approach(frameBox.cy, frameTarget.cy, dt, 7);
  frameBox.scale = approach(frameBox.scale, frameTarget.scale, dt, 7);
  placeRoot();
  applySway(now / 1000, dt);

  focusAmt = approach(focusAmt, 1, dt, 12);
  hoverAmt = approach(hoverAmt, hovered && hovered !== selected ? 1 : 0, dt, 16);

  renderer.clear();
  renderer.draw(figure, {
    focus: { node: selected, amount: focusAmt },
    hover: hovered ? { node: hovered, amount: hoverAmt } : null,
    boneWidth: 3.5 * Math.min(1.3, Math.max(0.8, figureScale)),
    jointRadius: 4.5 * Math.min(1.3, Math.max(0.8, figureScale)),
    headRadius: 16 * figureScale,
  });

  for (const [node, row] of rows) {
    const deg = Math.round(radToDeg(angleDelta(0, node.rotation - (swayOffsets.get(node.name) ?? 0))));
    if (deg !== row.last) {
      row.last = deg;
      row.value.textContent = `${deg}°`;
      if (document.activeElement !== row.slider) row.slider.value = String(deg);
      row.slider.style.setProperty("--p", `${((deg + 180) / 360) * 100}%`);
    }
  }
  readoutValue.textContent = rows.get(selected)!.value.textContent;

  requestAnimationFrame(frame);
};
layout();
requestAnimationFrame(frame);
