import {
  Animator,
  Figure3D,
  Ticker,
  humanoid3d,
  humanoid3dClips,
  quat,
  quatSlerp,
  radToDeg,
  degToRad,
  type Chain3D,
  type Clip,
  type Node3D,
  type Playback,
  type Quat,
  type Vec3,
} from "@animeant/core";
import { FigureView } from "@animeant/three";
import {
  CircleGeometry, Color, DirectionalLight, HemisphereLight, Mesh, MeshStandardMaterial, PerspectiveCamera,
  Plane, Raycaster, Scene, Vector2, Vector3, WebGLRenderer,
} from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { segmented } from "./segmented";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>("canvas");
const stage = canvas.parentElement!;
const list = $<HTMLUListElement>("nodes");
const highlightBar = $<HTMLSpanElement>("highlight");
const hint = $<HTMLParagraphElement>("hint");
const readoutName = $<HTMLSpanElement>("readout-name");
const readoutValue = $<HTMLSpanElement>("readout-value");
const panel = $<HTMLElement>("panel");
const transport = $<HTMLDivElement>("transport");
const playBtn = $<HTMLButtonElement>("play");
const scrub = $<HTMLInputElement>("scrub");
const scrubTime = $<HTMLSpanElement>("scrub-time");
canvas.classList.add("is-webgl");

// ---------- Scene ----------

const figure = Figure3D.fromRig(humanoid3d);
const rest = new Map<Node3D, Quat>(figure.nodes.map((n) => [n, n.quaternion]));
const restRoot = { x: figure.root.x, y: figure.root.y, z: figure.root.z };

const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
const scene = new Scene();
const camera = new PerspectiveCamera(35, 1, 0.05, 50);
camera.position.set(1.7, 1.45, 3.6);
const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 0.78, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 1.4;
controls.maxDistance = 7;
controls.maxPolarAngle = Math.PI * 0.49;
controls.enablePan = false;

scene.add(new HemisphereLight(0xffffff, 0x808088, 2.2));
const sun = new DirectionalLight(0xffffff, 1.6);
sun.position.set(2, 4, 3);
scene.add(sun);

const floorMat = new MeshStandardMaterial({ roughness: 1 });
const floor = new Mesh(new CircleGeometry(1.3, 64), floorMat);
floor.rotation.x = -Math.PI / 2;
scene.add(floor);

let view: FigureView | undefined;
const applyTheme = () => {
  view?.dispose();
  const v = new FigureView(figure, { color: css("--bone"), jointColor: css("--muted"), accent: css("--accent") });
  scene.add(v.object);
  v.highlight(selected?.name ?? null);
  view = v;
  floorMat.color = new Color(css("--surface-2"));
};
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", applyTheme);

const resize = () => {
  const { width, height } = stage.getBoundingClientRect();
  renderer.setSize(width, height, false);
  camera.aspect = width / Math.max(1, height);
  // Phones: pull back so the whole figure fits a narrow stage.
  camera.fov = camera.aspect < 0.8 ? 48 : 35;
  camera.updateProjectionMatrix();
  stage.style.setProperty("--transport-h", `${transport.offsetHeight}px`);
};
new ResizeObserver(resize).observe(stage);

// ---------- Animation ----------

const animator = new Animator(figure);
const ticker = new Ticker({ fixedStep: 1 / 120 });
let speed = 1;
let paused = false;
const current = new Map<number, Playback>();
const chips = [...document.querySelectorAll<HTMLButtonElement>(".chip")];
const clipFor = (name: string) => humanoid3dClips[name as keyof typeof humanoid3dClips] as Clip;

const syncChips = () => {
  for (const chip of chips) {
    const layer = chip.dataset.clip === "wave" ? 1 : 0;
    const pb = current.get(layer);
    chip.setAttribute("aria-pressed", String(!!pb && !pb.stopping && pb.clip.name === clipFor(chip.dataset.clip!).name));
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
    const clip = clipFor(chip.dataset.clip!);
    const layer = chip.dataset.clip === "wave" ? 1 : 0;
    const pb = current.get(layer);
    if (pb && !pb.stopping && pb.clip === clip) {
      pb.stop(0.45);
      current.delete(layer);
    } else {
      resetting = null;
      current.set(layer, animator.play(clip, { layer, fade: 0.45, speed }));
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
  setPaused(true);
  const t = (Number(scrub.value) / 1000) * pb.duration;
  for (const p of animator.playbacks) p.seek(t);
});

segmented($("speed"), "1", (v) => {
  speed = Number(v);
  for (const pb of animator.playbacks) pb.speed = speed;
});
segmented($("dim"), "3d", (_, button) => {
  setTimeout(() => (location.href = button.dataset.href!), 180);
});

// ---------- Node list and axes ----------

const depthOf = (n: Node3D) => { let d = 0; for (let p = n.parent; p; p = p.parent) d++; return d; };
const rows = new Map<Node3D, HTMLLIElement>();
let selected: Node3D = figure.node("shoulderR");

$("count").textContent = String(figure.nodes.length);
figure.nodes.forEach((node, i) => {
  const li = document.createElement("li");
  li.className = "node";
  li.style.animationDelay = `${i * 30}ms`;
  li.innerHTML = `
    <span class="node-name">
      <span class="node-depth">${"·".repeat(depthOf(node)) || "◦"}</span>
      <span class="node-label">${node.name}</span>
    </span>
    <span class="node-value"></span>`;
  li.addEventListener("pointerdown", () => select(node));
  list.appendChild(li);
  rows.set(node, li);
});

const axes = [...document.querySelectorAll<HTMLLabelElement>(".axis")].map((label) => {
  const slider = label.querySelector<HTMLInputElement>("input")!;
  const value = label.querySelector<HTMLSpanElement>(".axis-value")!;
  const key = slider.dataset.axis as "rx" | "ry" | "rz";
  slider.addEventListener("input", () => {
    resetting = null;
    selected[key] = degToRad(Number(slider.value));
  });
  return { label, slider, value, key, axis: key[1] as "x" | "y" | "z" };
});

const syncAxes = () => {
  for (const a of axes) {
    const r = selected.limits?.[a.axis];
    const lo = r ? Math.round(radToDeg(r[0])) : -180;
    const hi = r ? Math.round(radToDeg(r[1])) : 180;
    a.slider.min = String(lo);
    a.slider.max = String(hi);
    a.label.classList.toggle("is-locked", lo === hi);
    a.slider.style.setProperty("--z", `${hi > lo ? ((Math.min(hi, Math.max(lo, 0)) - lo) / (hi - lo)) * 100 : 0}%`);
  }
};

const moveHighlight = () => {
  const li = rows.get(selected)!;
  highlightBar.style.transform = `translateY(${li.offsetTop}px)`;
  highlightBar.style.height = `${li.offsetHeight}px`;
  highlightBar.classList.add("is-on");
};

function select(node: Node3D) {
  if (node === selected) return;
  rows.get(selected)?.classList.remove("is-selected");
  selected = node;
  const li = rows.get(node)!;
  li.classList.add("is-selected");
  moveHighlight();
  li.scrollIntoView({ block: "nearest", behavior: "smooth" });
  view!.highlight(node.name);
  syncAxes();
  readoutName.classList.add("is-swapping");
  setTimeout(() => {
    readoutName.textContent = node.name;
    readoutName.classList.remove("is-swapping");
  }, 120);
}

// ---------- IK drags ----------

interface Drag {
  chain: Chain3D;
  target: Vec3;
  /** 1 while held; eases to 0 after release when a clip owns the pose. */
  weight: number;
  held: boolean;
  plane: Plane;
}
const effectors = new Map<string, Chain3D>([
  ["handL", figure.chain("handL")],
  ["handR", figure.chain("handR")],
  ["footL", figure.chain("footL")],
  ["footR", figure.chain("footR")],
  ["head", figure.chain(["spine", "neck", "head"])],
]);
const drags: Drag[] = [];
let active: Drag | null = null;
const raycaster = new Raycaster();
const ndc = new Vector2();
const hit = new Vector3();

const rayFrom = (e: PointerEvent) => {
  const r = canvas.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
};

canvas.addEventListener("pointerdown", (e) => {
  rayFrom(e);
  const name = view!.pick(raycaster, [...effectors.keys()]) ?? view!.pick(raycaster);
  if (!name) return;
  const node = figure.node(name);
  select(node);
  const chain = effectors.get(name);
  if (!chain) return;
  controls.enabled = false;
  resetting = null;
  hint.classList.add("is-gone");
  const p = node.worldPosition;
  const normal = camera.getWorldDirection(new Vector3()).negate();
  const plane = new Plane().setFromNormalAndCoplanarPoint(normal, new Vector3(p.x, p.y, p.z));
  // One drag per chain: grabbing a settling limb takes it over.
  const prior = drags.findIndex((d) => d.chain === chain);
  if (prior !== -1) drags.splice(prior, 1);
  active = { chain, target: p, weight: 1, held: true, plane };
  drags.push(active);
  try { canvas.setPointerCapture(e.pointerId); } catch { /* synthetic pointers */ }
  canvas.style.cursor = "grabbing";
});

canvas.addEventListener("pointermove", (e) => {
  rayFrom(e);
  if (active) {
    if (raycaster.ray.intersectPlane(active.plane, hit)) active.target = { x: hit.x, y: Math.max(0.02, hit.y), z: hit.z };
    return;
  }
  canvas.style.cursor = view!.pick(raycaster, [...effectors.keys()]) ? "grab" : "";
});

const release = () => {
  if (!active) return;
  active.held = false;
  // Without a clip the pose stays where it was put.
  if (!animator.active) drags.splice(drags.indexOf(active), 1);
  active = null;
  controls.enabled = true;
  canvas.style.cursor = "";
};
canvas.addEventListener("pointerup", release);
canvas.addEventListener("pointercancel", release);

const animQ = new Map<Node3D, Quat>();
const tmp = quat();

/** Blend IK over whatever the animator wrote, by each drag's weight. */
const applyDrags = (dt: number) => {
  if (!drags.length) return;
  if (animator.active) {
    // The animator only writes channels it animates, so start dragged joints
    // from rest, lay the clip over them once, and remember that pose.
    for (const d of drags) for (const j of d.chain.joints) j.setQuaternion(rest.get(j)!);
    animator.apply();
    for (const d of drags) for (const j of d.chain.joints) animQ.set(j, j.quaternion);
  }
  for (let i = drags.length - 1; i >= 0; i--) {
    const d = drags[i]!;
    if (!d.held) d.weight = Math.max(0, d.weight - dt / 0.35);
    if (d.weight <= 0) { drags.splice(i, 1); continue; }
    d.chain.solve(d.target);
    if (animator.active && d.weight < 1) {
      for (const j of d.chain.joints) j.setQuaternion(quatSlerp(tmp, animQ.get(j)!, j.quaternion, d.weight));
    }
  }
};

// ---------- Reset ----------

let resetting: { t: number; from: Map<Node3D, Quat>; root: Vec3 } | null = null;
$("reset").addEventListener("click", () => {
  animator.stop(undefined, 0.3);
  current.clear();
  drags.length = 0;
  syncChips();
  resetting = {
    t: 0,
    from: new Map(figure.nodes.map((n) => [n, n.quaternion])),
    root: { x: figure.root.x, y: figure.root.y, z: figure.root.z },
  };
  const btn = $("reset");
  btn.classList.add("is-pulsing");
  setTimeout(() => btn.classList.remove("is-pulsing"), 240);
});

const stepReset = (dt: number) => {
  if (!resetting || animator.active) return;
  resetting.t = Math.min(1, resetting.t + dt / 0.45);
  const k = 1 - Math.pow(1 - resetting.t, 3);
  for (const [n, q] of resetting.from) n.setQuaternion(quatSlerp(tmp, q, rest.get(n)!, k));
  figure.root.x = resetting.root.x + (restRoot.x - resetting.root.x) * k;
  figure.root.y = resetting.root.y + (restRoot.y - resetting.root.y) * k;
  figure.root.z = resetting.root.z + (restRoot.z - resetting.root.z) * k;
  if (resetting.t >= 1) resetting = null;
};

// ---------- Panel sheet (phones) ----------

$("panel-handle").addEventListener("click", () => panel.classList.toggle("is-open"));

// ---------- Loop ----------

const lastAxis = { rx: NaN, ry: NaN, rz: NaN };
ticker.onFixed((dt) => {
  animator.update(dt);
  applyDrags(dt);
  stepReset(dt);
});
ticker.onFrame(() => {
  controls.update();
  view!.update();
  renderer.render(scene, camera);

  for (const a of axes) {
    const deg = Math.round(radToDeg(selected[a.key]));
    if (deg === lastAxis[a.key] && document.activeElement !== a.slider) continue;
    lastAxis[a.key] = deg;
    if (document.activeElement !== a.slider) a.slider.value = String(deg);
    a.value.textContent = `${deg}°`;
    const lo = Number(a.slider.min), hi = Number(a.slider.max);
    a.slider.style.setProperty("--p", `${hi > lo ? ((deg - lo) / (hi - lo)) * 100 : 0}%`);
  }
  readoutValue.textContent = axes.map((a) => `${Math.round(radToDeg(selected[a.key]))}°`).join(" ");

  const pb = current.get(0) ?? current.get(1);
  if (pb && !pb.stopping) {
    if (document.activeElement !== scrub) scrub.value = String(Math.round(pb.progress * 1000));
    scrub.style.setProperty("--p", `${pb.progress * 100}%`);
    scrubTime.textContent = `${pb.localTime.toFixed(2)}s`;
  }
});

applyTheme();
resize();
rows.get(selected)!.classList.add("is-selected");
view!.highlight(selected.name);
readoutName.textContent = selected.name;
syncAxes();
requestAnimationFrame(moveHighlight);
window.addEventListener("resize", moveHighlight);
syncChips();
setPaused(false);
current.set(0, animator.play(humanoid3dClips.idle, { fade: 0.6 }));
syncChips();
ticker.start();
