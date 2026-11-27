import { Animator, Figure3D, hominidGait, hominids, type GaitParams, type Playback, type Rig3D } from "@animeant/core";
import { BodyView } from "@animeant/three";
import { FilmAudio } from "./film-audio";
import {
  ACESFilmicToneMapping, CanvasTexture, Color, CylinderGeometry, DirectionalLight, Float32BufferAttribute, Fog, Group,
  ConeGeometry, HemisphereLight, IcosahedronGeometry, InstancedMesh, Matrix4, Mesh, Sprite, SpriteMaterial, MeshBasicMaterial, MeshStandardMaterial, PerspectiveCamera, PlaneGeometry,
  Scene, SphereGeometry, Vector3, WebGLRenderer,
} from "three";

// ---------- The cast ----------

interface Species {
  rig: Rig3D;
  gait: GaitParams;
  name: string;
  era: string;
  line: string;
}

const SPECIES: Species[] = [
  {
    rig: hominids.ape, gait: { quadruped: true, lean: 62, stride: 20, duration: 1.2 },
    name: "Miocene apes", era: "About 20 million years ago",
    line: "Forest apes of Africa, moving through the trees and on all fours.",
  },
  {
    rig: hominids.australopithecus, gait: { crouch: 14, stride: 20, lean: 12, armSwing: 14, duration: 1.0 },
    name: "Australopithecus afarensis", era: "3.9 to 2.9 million years ago",
    line: "Walked upright, but kept long arms for climbing. Lucy stood about 1.1 m tall.",
  },
  {
    rig: hominids.habilis, gait: { crouch: 10, stride: 22, lean: 8, duration: 1.05 },
    name: "Homo habilis", era: "2.4 to 1.4 million years ago",
    line: "A larger brain, and some of the earliest stone tools.",
  },
  {
    rig: hominids.erectus, gait: { crouch: 5, stride: 25, duration: 1.1 },
    name: "Homo erectus", era: "1.9 million to about 110,000 years ago",
    line: "Long legs built for distance. The first humans to spread beyond Africa.",
  },
  {
    rig: hominids.sapiens, gait: { crouch: 4, stride: 24, duration: 1.1 },
    name: "Homo sapiens", era: "300,000 years ago to today",
    line: "A rounded skull, a flat face, and a walk that went on to cross the world.",
  },
];

// ---------- Timeline (seconds) ----------

const STAGE = 11;
const DISSOLVE = 1.4;
const SOLO_END = STAGE * SPECIES.length;
const LINEUP = 15;
const END_CARD = 5;
const TOTAL = SOLO_END + LINEUP + END_CARD;
const LINE_GAP = 1.8;

const smooth = (x: number) => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };
const easeOut = (x: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

// ---------- Renderer, scene, camera ----------

const glCanvas = document.getElementById("gl") as HTMLCanvasElement;
const capCanvas = document.getElementById("captions") as HTMLCanvasElement;
const cap = capCanvas.getContext("2d")!;
const renderer = new WebGLRenderer({ canvas: glCanvas, antialias: true, preserveDrawingBuffer: true });
renderer.toneMapping = ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new Scene();
const camera = new PerspectiveCamera(32, 16 / 9, 0.1, 400);
const SKY_FOREST = new Color("#bcd3c4");
const SKY_SAVANNA = new Color("#f0d2a0");
const SKY_DUSK = new Color("#e9b48a");
scene.background = SKY_FOREST.clone();
scene.fog = new Fog(SKY_FOREST.clone(), 14, 75);

const hemi = new HemisphereLight(0xfff4e6, 0x6d6150, 1.4);
scene.add(hemi);
const sun = new DirectionalLight(0xfff0d8, 2.3);
sun.position.set(-4, 8, 6);
scene.add(sun);

// ---------- Actors ----------

interface Actor {
  sp: Species;
  fig: Figure3D;
  body: BodyView;
  group: Group;
  shadow: Mesh;
  animator: Animator;
  pb: Playback;
  speed: number;
  duration: number;
  height: number;
  /** Walk phase last frame, for footstep triggers. */
  lastPhase: number;
}

const shadowTex = (() => {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, "rgba(40,30,20,0.42)");
  grad.addColorStop(1, "rgba(40,30,20,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return new CanvasTexture(c);
})();

const actors: Actor[] = SPECIES.map((sp) => {
  const gait = hominidGait(sp.rig, sp.gait);
  const fig = Figure3D.fromRig(sp.rig);
  const body = new BodyView(fig, { roughness: 0.75 });
  fig.root.y = gait.height;
  const animator = new Animator(fig);
  const pb = animator.play(gait.clip, { fade: 0 }).pause();
  const group = new Group();
  group.rotation.y = Math.PI / 2; // face +x, the direction of travel
  group.add(body.object);
  const shadow = new Mesh(new PlaneGeometry(1, 1), new MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.003;
  const size = sp.gait.quadruped ? 1.4 : 0.8;
  shadow.scale.set(size, size * 0.6, 1);
  scene.add(group, shadow);
  // Standing height: the top of the skull at rest.
  let top = 0;
  for (const n of fig.nodes) top = Math.max(top, n.worldPosition.y);
  return { sp, fig, body, group, shadow, animator, pb, speed: gait.speed, duration: gait.clip.duration, height: top + 0.15, lastPhase: -1 };
});

// Distance and walk phase at each stage boundary, so any time can be evaluated directly.
const startX: number[] = [0];
const startPhase: number[] = [0];
actors.forEach((a, i) => {
  startX.push(startX[i]! + a.speed * STAGE);
  startPhase.push(startPhase[i]! + STAGE / a.duration);
});
const lineupSpeed = actors[actors.length - 1]!.speed;
const xAt = (t: number) => {
  if (t <= SOLO_END) {
    const i = Math.min(actors.length - 1, Math.floor(t / STAGE));
    return startX[i]! + actors[i]!.speed * (t - i * STAGE);
  }
  return startX[actors.length]! + lineupSpeed * (t - SOLO_END);
};
const soloPhase = (t: number) => {
  const i = Math.min(actors.length - 1, Math.floor(t / STAGE));
  return startPhase[i]! + (t - i * STAGE) / actors[i]!.duration;
};

// ---------- Scenery ----------

let seed = 7;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const forestEnd = startX[1]! + 2;
const end = xAt(TOTAL) + 40;

const groundGeo = new PlaneGeometry(end + 80, 140, Math.ceil((end + 80) / 2), 1);
groundGeo.rotateX(-Math.PI / 2);
groundGeo.translate((end + 80) / 2 - 40, 0, -40);
{
  const pos = groundGeo.getAttribute("position");
  const colors: number[] = [];
  const forest = new Color("#58703e"), grass = new Color("#a89a5c"), dry = new Color("#c4a46a");
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const c = forest.clone().lerp(grass, smooth((x - forestEnd + 6) / 14)).lerp(dry, smooth((x - startX[3]!) / 30));
    colors.push(c.r, c.g, c.b);
  }
  groundGeo.setAttribute("color", new Float32BufferAttribute(colors, 3));
}
scene.add(new Mesh(groundGeo, new MeshStandardMaterial({ vertexColors: true, roughness: 1 })));

// A path worn into the ground, where every walker goes.
const path = new Mesh(new PlaneGeometry(end + 80, 0.9), new MeshStandardMaterial({ color: "#9b8456", roughness: 1, transparent: true, opacity: 0.35 }));
path.rotation.x = -Math.PI / 2;
path.position.set((end + 80) / 2 - 40, 0.002, 0);
scene.add(path);

const trunkMat = new MeshStandardMaterial({ color: "#5b4532", roughness: 1 });
const leafDark = new MeshStandardMaterial({ color: "#2f5a2c", roughness: 1, flatShading: true });
const leafOlive = new MeshStandardMaterial({ color: "#6f7a3a", roughness: 1, flatShading: true });
const rockMat = new MeshStandardMaterial({ color: "#9a8f80", roughness: 1, flatShading: true });
const trunkGeo = new CylinderGeometry(0.12, 0.2, 1, 7);
const canopyGeo = new IcosahedronGeometry(1, 1);

const tree = (x: number, z: number, forest: boolean) => {
  const g = new Group();
  const h = forest ? 4 + rand() * 4 : 2.4 + rand() * 1.4;
  const trunk = new Mesh(trunkGeo, trunkMat);
  trunk.scale.set(forest ? 1.4 : 0.7, h, forest ? 1.4 : 0.7);
  trunk.position.y = h / 2;
  const canopy = new Mesh(canopyGeo, forest ? leafDark : leafOlive);
  const w = forest ? 1.8 + rand() * 1.4 : 1.9 + rand() * 1.2;
  canopy.scale.set(w, forest ? w * 1.1 : w * 0.32, w);
  canopy.position.y = h + (forest ? w * 0.6 : 0.1);
  g.add(trunk, canopy);
  g.position.set(x, 0, z);
  g.rotation.y = rand() * Math.PI;
  scene.add(g);
};

for (let x = -16; x < forestEnd + 4; x += 1.6 + rand() * 1.8) tree(x, -3.5 - rand() * 18, true);
// Leaves the opening crane drops through: canopies between the high camera
// and the walker, on trunks the settled tracking shot never sees.
for (const [tx, tz, cx, cy, cz, w] of [
  [-3.8, 4.6, -1.5, 6.5, 3.7, 2.4],
  [2.8, -3.6, 1.6, 7.3, 1.2, 2.3],
  [-6.5, 2.5, -3.6, 5.8, 2.4, 2.6],
] as const) {
  const trunk = new Mesh(trunkGeo, trunkMat);
  trunk.scale.set(1.6, cy, 1.6);
  trunk.position.set(tx, cy / 2, tz);
  const canopy = new Mesh(canopyGeo, leafDark);
  canopy.scale.set(w, w * 0.55, w);
  canopy.position.set(cx, cy, cz);
  scene.add(trunk, canopy);
}
for (let x = -16; x < forestEnd - 6; x += 5 + rand() * 4) tree(x, 9 + rand() * 6, true);
for (let x = forestEnd; x < end; x += 7 + rand() * 12) tree(x, -6 - rand() * 26, false);
for (let x = 0; x < end; x += 3 + rand() * 6) {
  const rock = new Mesh(canopyGeo, rockMat);
  const s = 0.1 + rand() * 0.35;
  rock.scale.set(s * 1.4, s * 0.6, s);
  rock.position.set(x, s * 0.15, -1.6 - rand() * 8);
  scene.add(rock);
}
for (let i = 0; i < 9; i++) {
  const hill = new Mesh(new SphereGeometry(1, 24, 12), new MeshStandardMaterial({ color: "#8e8a6a", roughness: 1 }));
  hill.scale.set(40 + rand() * 40, 6 + rand() * 8, 20);
  hill.position.set(-30 + i * (end / 8), -2, -95);
  scene.add(hill);
}

// Grass: thousands of instanced blades, thicker out in the open.
{
  const blade = new ConeGeometry(0.022, 0.26, 3);
  blade.translate(0, 0.13, 0);
  const count = 7000;
  const grass = new InstancedMesh(blade, new MeshStandardMaterial({ roughness: 1, emissive: "#3a3220", emissiveIntensity: 0.35 }), count);
  const m = new Matrix4();
  const c = new Color();
  const greenA = new Color("#7d9a4c"), greenB = new Color("#a3a457"), dryA = new Color("#d6bd7e"), dryB = new Color("#e8d39a");
  let n = 0;
  while (n < count) {
    const x = -14 + rand() * (end + 10);
    const z = -14 + rand() * 18;
    if (Math.abs(z) < 0.75) continue;
    const open = smooth((x - forestEnd + 4) / 16);
    if (rand() > 0.35 + open * 0.65) continue;
    const h = 0.5 + rand() * (0.6 + open * 0.7);
    m.makeRotationY(rand() * Math.PI).premultiply(new Matrix4().makeScale(1, h, 1));
    m.setPosition(x, 0, z);
    grass.setMatrixAt(n, m);
    c.copy(open > 0.5 ? dryA : greenA).lerp(open > 0.5 ? dryB : greenB, rand());
    grass.setColorAt(n, c);
    n++;
  }
  scene.add(grass);
}

// A low sun and a far ridge, both kept in frame as the camera travels.
const sunSprite = (() => {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grad.addColorStop(0, "rgba(255,247,225,1)");
  grad.addColorStop(0.18, "rgba(255,236,196,0.95)");
  grad.addColorStop(0.35, "rgba(255,214,150,0.35)");
  grad.addColorStop(1, "rgba(255,200,120,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  const sprite = new Sprite(new SpriteMaterial({ map: new CanvasTexture(c), depthWrite: false, fog: false, transparent: true }));
  sprite.scale.set(46, 46, 1);
  scene.add(sprite);
  return sprite;
})();
const ridge = new Mesh(new SphereGeometry(1, 48, 16), new MeshStandardMaterial({ color: "#9a8f7c", roughness: 1 }));
ridge.scale.set(240, 18, 30);
scene.add(ridge);

// ---------- Pose the film at time t ----------

const tmp = new Vector3();
function evaluate(t: number, sound: FilmAudio | null = null) {
  const solo = t < SOLO_END + 0.001;
  const x = xAt(t);

  actors.forEach((a, i) => {
    let opacity = 0;
    let ax = x;
    let time = 0;
    if (solo || t < SOLO_END + DISSOLVE) {
      // Each species owns its stage and crossfades into the next, in step.
      const fadeIn = i === 0 ? 1 : smooth((t - (i * STAGE - DISSOLVE / 2)) / DISSOLVE);
      const fadeOut = i === actors.length - 1 ? 1 : 1 - smooth((t - ((i + 1) * STAGE - DISSOLVE / 2)) / DISSOLVE);
      opacity = Math.min(fadeIn, fadeOut);
      time = (soloPhase(Math.min(t, SOLO_END)) % 1) * a.duration;
    }
    if (t >= SOLO_END) {
      // The lineup: ancestors fade in behind, everyone walks at one pace,
      // each clip sped up or slowed so its feet stay planted.
      const k = actors.length - 1 - i;
      const lt = t - SOLO_END;
      const appear = i === actors.length - 1 ? 1 : smooth((lt - 0.8 - k * 0.7) / 1.4);
      opacity = Math.max(opacity, appear);
      ax = x - k * LINE_GAP;
      const phase0 = i === actors.length - 1 ? soloPhase(SOLO_END) : k * 0.27;
      time = (((phase0 + (lt * lineupSpeed) / a.speed / a.duration) % 1) + 1) % 1 * a.duration;
    }
    a.body.opacity = opacity;
    a.group.visible = opacity > 0.001;
    a.shadow.visible = a.group.visible;
    (a.shadow.material as MeshBasicMaterial).opacity = opacity;
    if (!a.group.visible) { a.lastPhase = -1; return; }
    // Footsteps: heel strikes at phase 0 (left) and 0.5 (right); knuckles in between.
    const phase = time / a.duration;
    if (sound && a.lastPhase >= 0 && phase !== a.lastPhase) {
      const wrapped = phase < a.lastPhase;
      const crossed = (at: number) => (wrapped ? a.lastPhase < at || phase >= at || at === 0 : a.lastPhase < at && phase >= at);
      const pan = (ax - camera.position.x) / 3;
      const weight = a.height / 1.7;
      if (crossed(0) || crossed(0.5)) sound.step(weight, pan, opacity);
      if (a.sp.gait.quadruped && (crossed(0.25) || crossed(0.75))) sound.step(weight, pan, opacity, true);
    }
    a.lastPhase = phase;
    a.group.position.set(ax, 0, 0);
    a.shadow.position.x = ax + (a.sp.gait.quadruped ? 0.15 : 0);
    a.pb.seek(time);
    a.animator.update(0);
    a.body.update();
  });

  // Camera: a side-on tracking shot that pulls wide for the lineup.
  const i = Math.min(actors.length - 1, Math.floor(Math.min(t, SOLO_END - 0.001) / STAGE));
  const local = Math.min(t, SOLO_END) - i * STAGE;
  const hNow = lerp(actors[i]!.height, actors[Math.min(i + 1, actors.length - 1)]!.height, smooth((local - (STAGE - DISSOLVE)) / DISSOLVE));
  const wide = easeOut((t - SOLO_END) / 6);
  const portrait = camera.aspect < 1 ? 1.6 : 1;
  const dist = lerp(2.2 + hNow * 2.6, 12.5, wide) * portrait;
  const targetX = x + lerp(0.35, -LINE_GAP * 2 + 0.6, wide);
  const targetY = lerp(hNow * 0.62, 0.95, wide);
  const drift = Math.sin(t * 0.17) * 0.35;
  const pos = new Vector3(targetX + 0.8 + drift, targetY + lerp(0.15, 1.4, wide), dist);
  const look = new Vector3(targetX, targetY, 0);
  const shot = (w: number, p: [number, number, number], l: [number, number, number]) => {
    if (w <= 0) return;
    pos.lerp(tmp.set(...p), w);
    look.lerp(tmp.set(...l), w);
  };
  // Opening: a crane down through the canopy.
  shot(1 - smooth((t - 0.6) / 4.6), [x - 1.6, 8.6, dist * 1.1], [x + 0.8, 2.2, 0]);
  // First upright steps: down at the feet.
  shot(smooth((t - 11.2) / 0.9) * (1 - smooth((t - 15) / 1.1)), [x + 2.2, 0.14, 2.7 * portrait], [x + 0.7, 0.4, 0]);
  // Homo erectus strides across a slower camera.
  {
    const x0 = xAt(33.6);
    const cx = x0 + 1.6 + (x - x0) * 0.6;
    shot(smooth((t - 33.4) / 1) * (1 - smooth((t - 42) / 1.2)), [cx + 0.4, 1.25, 5.6 * portrait], [cx, 1.05, 0]);
  }
  // Homo sapiens: a slow push in toward the face.
  {
    const k = smooth((t - 45.8) / 6.5) * (1 - smooth((t - 53.6) / 1.2));
    shot(k * 0.85, [x + 1.1, 1.62, 2.1 * portrait], [x + 0.05, 1.45, 0]);
  }
  camera.position.copy(pos);
  camera.lookAt(look);

  // Light and air: forest morning to open savanna to evening.
  const p = x / startX[actors.length]!;
  const sky = SKY_FOREST.clone().lerp(SKY_SAVANNA, smooth((x - forestEnd + 6) / 14)).lerp(SKY_DUSK, smooth((t - SOLO_END) / LINEUP));
  (scene.background as Color).copy(sky);
  scene.fog!.color.copy(sky);
  sun.intensity = lerp(2.3, 2.6, smooth(p));
  const dusk = smooth((t - SOLO_END) / LINEUP);
  sunSprite.position.set(camera.position.x + 30, lerp(34, 14, dusk), -170);
  (sunSprite.material as SpriteMaterial).opacity = lerp(0.35, 1, smooth((x - forestEnd) / 10));
  ridge.position.set(camera.position.x * 0.85, -4, -190);
  sun.color.set(0xfff0d8).lerp(new Color(0xffc48a), dusk);
  sun.position.set(camera.position.x - 6, lerp(8, 4, dusk), 6);
  sun.target.position.set(camera.position.x, 0, 0);
  sun.target.updateMatrixWorld();
}

// ---------- Captions (canvas, so recordings include them) ----------

interface Card { from: number; to: number; draw: (alpha: number, rise: number) => void; }
let W = 0, H = 0, S = 1;
const font = (weight: number, px: number, family = "Inter") => `${weight} ${Math.round(px * S)}px ${family}, system-ui, sans-serif`;

const wrap = (text: string, maxW: number) => {
  const words = text.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (cap.measureText(next).width > maxW && line) { lines.push(line); line = w; } else line = next;
  }
  if (line) lines.push(line);
  return lines;
};

const speciesCard = (sp: Species, i: number): Card => ({
  from: i === 0 ? 5 : i * STAGE + 1.2,
  to: (i + 1) * STAGE - 1.4,
  draw: (a, rise) => {
    const x = Math.max(24, W * 0.06);
    const maxW = Math.min(W - x * 2, 560 * S);
    cap.font = font(400, 17);
    const lines = wrap(sp.line, maxW);
    const lineH = 25 * S;
    let y = H - Math.max(96, H * 0.13) - lines.length * lineH + rise;
    cap.globalAlpha = a;
    cap.fillStyle = "rgba(255,159,67,1)";
    cap.font = font(500, 13, "JetBrains Mono");
    cap.fillText(sp.era.toUpperCase(), x, y - 46 * S);
    cap.fillStyle = "#fff";
    cap.font = font(600, 34);
    cap.fillText(sp.name, x, y - 12 * S);
    cap.fillStyle = "rgba(255,255,255,0.82)";
    cap.font = font(400, 17);
    for (const l of lines) { y += lineH; cap.fillText(l, x, y); }
  },
});

const cards: Card[] = [
  {
    from: 0.4, to: 4.6,
    draw: (a, rise) => {
      cap.globalAlpha = a;
      cap.textAlign = "center";
      cap.fillStyle = "#fff";
      cap.font = font(600, 64);
      cap.fillText("Walking Upright", W / 2, H * 0.2 + rise);
      cap.fillStyle = "rgba(255,255,255,0.82)";
      cap.font = font(400, 18);
      cap.fillText("Twenty million years, one walk", W / 2, H * 0.2 + 40 * S + rise);
      cap.textAlign = "left";
    },
  },
  ...SPECIES.map(speciesCard),
  {
    from: SOLO_END + 6, to: SOLO_END + LINEUP - 0.5,
    draw: (a, rise) => {
      const x = Math.max(24, W * 0.06);
      const maxW = Math.min(W - x * 2, 600 * S);
      cap.globalAlpha = a;
      cap.fillStyle = "#fff";
      cap.font = font(600, 40);
      const y0 = Math.max(80, H * 0.16) + rise;
      cap.fillText("Not a ladder. A bush.", x, y0);
      cap.fillStyle = "rgba(255,255,255,0.86)";
      cap.font = font(400, 18);
      wrap("Many of these species lived at the same time, and most branches ended. This is one path through a much bigger family tree.", maxW)
        .forEach((l, i) => cap.fillText(l, x, y0 + (36 + i * 26) * S));
    },
  },
];

const endCard = (t: number) => {
  const a = smooth((t - (SOLO_END + LINEUP)) / 1.2);
  if (a <= 0) return;
  cap.globalAlpha = a * 0.88;
  cap.fillStyle = "#0b0b0c";
  cap.fillRect(0, 0, W, H);
  const b = easeOut((t - (SOLO_END + LINEUP + 0.6)) / 1);
  cap.globalAlpha = b;
  cap.textAlign = "center";
  cap.fillStyle = "#fff";
  cap.font = font(600, 46);
  cap.fillText("Walking Upright", W / 2, H * 0.46 + (1 - b) * 12 * S);
  cap.fillStyle = "rgba(255,255,255,0.7)";
  cap.font = font(400, 16);
  cap.fillText("Animated in code with Animeant", W / 2, H * 0.46 + 36 * S + (1 - b) * 12 * S);
  cap.fillStyle = "rgba(255,159,67,0.95)";
  cap.font = font(500, 13, "JetBrains Mono");
  cap.fillText("github.com/HarshitKumar9030/animeant", W / 2, H * 0.46 + 64 * S + (1 - b) * 12 * S);
  cap.textAlign = "left";
};

function drawCaptions(t: number) {
  cap.setTransform(1, 0, 0, 1, 0, 0);
  cap.clearRect(0, 0, capCanvas.width, capCanvas.height);
  cap.textBaseline = "alphabetic";
  // A soft shade at the bottom keeps white text readable over a bright sky.
  const shade = cap.createLinearGradient(0, H * 0.55, 0, H);
  shade.addColorStop(0, "rgba(0,0,0,0)");
  shade.addColorStop(1, "rgba(0,0,0,0.38)");
  cap.globalAlpha = 1;
  cap.fillStyle = shade;
  cap.fillRect(0, H * 0.55, W, H * 0.45);
  const top = cap.createLinearGradient(0, 0, 0, H * 0.4);
  top.addColorStop(0, "rgba(0,0,0,0.22)");
  top.addColorStop(1, "rgba(0,0,0,0)");
  cap.fillStyle = top;
  cap.fillRect(0, 0, W, H * 0.4);

  const vig = cap.createRadialGradient(W / 2, H * 0.48, Math.min(W, H) * 0.35, W / 2, H * 0.48, Math.hypot(W, H) * 0.62);
  vig.addColorStop(0, "rgba(0,0,0,0)");
  vig.addColorStop(1, "rgba(20,12,6,0.32)");
  cap.fillStyle = vig;
  cap.fillRect(0, 0, W, H);

  for (const c of cards) {
    if (t < c.from || t > c.to + 0.6) continue;
    const inT = easeOut((t - c.from) / 0.7);
    const outT = smooth((t - c.to) / 0.6);
    const a = inT * (1 - outT);
    if (a <= 0) continue;
    c.draw(a, (1 - inT) * 14 * S - outT * 8 * S);
  }
  cap.globalAlpha = 0.85;
  cap.fillStyle = "#fff";
  cap.font = font(600, 15);
  cap.fillText("animeant", Math.max(24, W * 0.06), Math.max(36, H * 0.07));
  endCard(t);
  cap.globalAlpha = 1;
}

// ---------- Sizing ----------

let recording: { rec: MediaRecorder; chunks: Blob[]; comp: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null = null;

function resize() {
  const dpr = Math.min(devicePixelRatio, 2);
  const w = recording ? 1920 : innerWidth;
  const h = recording ? 1080 : innerHeight;
  const ratio = recording ? 1 : dpr;
  renderer.setPixelRatio(ratio);
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.fov = w / h < 1 ? 50 : 32;
  camera.updateProjectionMatrix();
  capCanvas.width = Math.round(w * ratio);
  capCanvas.height = Math.round(h * ratio);
  W = capCanvas.width;
  H = capCanvas.height;
  // Type scales with the frame in CSS pixels, with a floor so phones stay readable.
  S = ratio * Math.min(1.6, Math.max(0.82, Math.min(w / 1280, h / 720)));
  const fit = recording ? "contain" : "fill";
  glCanvas.style.objectFit = capCanvas.style.objectFit = fit;
}
addEventListener("resize", resize);

// ---------- Playback ----------

const playBtn = document.getElementById("play") as HTMLButtonElement;
const scrub = document.getElementById("scrub") as HTMLInputElement;
const timeEl = document.getElementById("time")!;
const recordBtn = document.getElementById("record") as HTMLButtonElement;
const controls = document.getElementById("controls")!;
const filmEl = document.querySelector(".film")!;
const chapters = document.getElementById("chapters")!;
const soundBtn = document.getElementById("sound") as HTMLButtonElement;

let audio: FilmAudio | null = null;
let soundOn = false;
const setSound = async (on: boolean) => {
  audio ??= new FilmAudio();
  soundOn = on;
  soundBtn.setAttribute("aria-pressed", String(on));
  soundBtn.setAttribute("aria-label", on ? "Mute" : "Sound on");
  await audio.enable(on);
};
soundBtn.addEventListener("click", () => void setSound(!soundOn));
for (const at of [...SPECIES.map((_, i) => i * STAGE), SOLO_END, SOLO_END + LINEUP]) {
  if (at <= 0) continue;
  const s = document.createElement("span");
  s.style.left = `${(at / TOTAL) * 100}%`;
  chapters.appendChild(s);
}

let t = 0;
let playing = true;
let scrubbed = false;
let last = performance.now();
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

const setPlaying = (p: boolean) => {
  playing = p;
  playBtn.dataset.state = p ? "playing" : "paused";
  playBtn.setAttribute("aria-label", p ? "Pause" : "Play");
  if (p && t >= TOTAL) t = 0;
  poke();
};
playBtn.addEventListener("click", () => setPlaying(!playing));
scrub.addEventListener("input", () => { t = (Number(scrub.value) / 1000) * TOTAL; scrubbed = true; });
addEventListener("keydown", (e) => {
  if (e.key === " ") { e.preventDefault(); setPlaying(!playing); }
  if (e.key === "ArrowRight") { t = Math.min(TOTAL, t + 5); scrubbed = true; }
  if (e.key === "ArrowLeft") { t = Math.max(0, t - 5); scrubbed = true; }
  if (e.key === "m") void setSound(!soundOn);
});

// Controls fade away while the film plays untouched.
let idleTimer = 0;
const poke = () => {
  controls.classList.remove("is-idle");
  clearTimeout(idleTimer);
  idleTimer = window.setTimeout(() => { if (playing) controls.classList.add("is-idle"); }, 2600);
};
addEventListener("pointermove", poke);
addEventListener("pointerdown", poke);

// ---------- Recording ----------

const stopRecording = () => {
  if (!recording) return;
  recording.rec.stop();
};
recordBtn.addEventListener("click", () => {
  if (recording) { stopRecording(); return; }
  const comp = document.createElement("canvas");
  comp.width = 1920;
  comp.height = 1080;
  const ctx = comp.getContext("2d")!;
  // Recordings always carry the sound; the click is the gesture that allows it.
  void setSound(true);
  const stream = new MediaStream([...comp.captureStream(60).getVideoTracks(), ...audio!.stream.getAudioTracks()]);
  const type = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"].find((m) => MediaRecorder.isTypeSupported(m)) ?? "";
  const rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 14_000_000 });
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  rec.onstop = () => {
    const url = URL.createObjectURL(new Blob(chunks, { type: "video/webm" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "walking-upright.webm";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    recording = null;
    filmEl.classList.remove("is-recording");
    recordBtn.setAttribute("aria-pressed", "false");
    resize();
  };
  recording = { rec, chunks, comp, ctx };
  resize();
  t = 0;
  setPlaying(true);
  rec.start(1000);
  filmEl.classList.add("is-recording");
  recordBtn.setAttribute("aria-pressed", "true");
});

// ---------- Loop ----------

function frame(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (playing) {
    t += dt;
    if (t >= TOTAL) {
      t = TOTAL;
      if (recording) stopRecording();
      setPlaying(false);
    }
  }
  // Footsteps only for real playback, not for scrubs or jumps.
  const audible = audio && soundOn && playing && !scrubbed ? audio : null;
  scrubbed = false;
  evaluate(t, audible);
  if (audio && soundOn) {
    const x = xAt(t);
    const chapter = t < SOLO_END ? Math.min(SPECIES.length - 1, Math.floor(t / STAGE)) : SPECIES.length;
    const forest = 1 - smooth((x - forestEnd + 4) / 10);
    const swell = smooth((t - SOLO_END) / 4) * (1 - smooth((t - TOTAL + 2) / 2));
    audio.update(chapter, forest, 1 - forest, playing ? swell : 0);
  }
  renderer.render(scene, camera);
  drawCaptions(t);
  if (recording) {
    recording.ctx.drawImage(glCanvas, 0, 0, 1920, 1080);
    recording.ctx.drawImage(capCanvas, 0, 0, 1920, 1080);
  }
  if (document.activeElement !== scrub) scrub.value = String(Math.round((t / TOTAL) * 1000));
  scrub.style.setProperty("--p", `${(t / TOTAL) * 100}%`);
  timeEl.textContent = fmt(t);
  requestAnimationFrame(frame);
}

resize();
// Wait for the caption fonts so the first frames don't flash a fallback.
Promise.all([document.fonts.load(font(600, 34)), document.fonts.load(font(500, 13, "JetBrains Mono"))])
  .catch(() => undefined)
  .then(() => {
    poke();
    requestAnimationFrame((n) => { last = n; frame(n); });
  });

if (import.meta.env.DEV) Object.assign(window, { __film: { seek: (s: number) => (t = s), get t() { return t; }, pause: () => setPlaying(false), TOTAL } });
