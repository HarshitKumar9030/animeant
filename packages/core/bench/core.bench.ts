import { bench, describe } from "vitest";
import { Animator, Chain, Figure, Node, Ragdoll, SpringChain, humanoid, humanoidClips } from "../src";

const DT = 1 / 120;
const figures = (n: number) => Array.from({ length: n }, () => Figure.fromRig(humanoid));
const rope = (n: number) => {
  const nodes = [new Node({ name: "n0", x: 0, y: 0 })];
  for (let i = 1; i < n; i++) {
    const node = new Node({ name: `n${i}`, x: 4 });
    nodes[i - 1]!.add(node);
    nodes.push(node);
  }
  return nodes;
};
/** Read every world matrix, the way a renderer does each frame. */
const draw = (f: Figure) => { for (const n of f.nodes) n.worldMatrix; };

describe("FK", () => {
  const many = figures(100);
  bench("100 figures: rotate root + read all world matrices", () => {
    for (const f of many) { f.root.rotation += 0.01; draw(f); }
  });
  const chain = rope(1000);
  bench("1000-node chain: rotate root + read tip", () => {
    chain[0]!.rotation += 0.01;
    chain[999]!.worldPosition;
  });
});

describe("Animator", () => {
  const many = figures(100).map((f) => {
    const a = new Animator(f);
    a.play(humanoidClips.dance);
    a.play(humanoidClips.wave, { layer: 1 });
    return { f, a };
  });
  bench("100 figures: dance + wave layer, one step", () => {
    for (const { f, a } of many) { a.update(DT); draw(f); }
  });
});

describe("IK", () => {
  const f = Figure.fromRig(humanoid);
  const arm = f.chain("handR");
  const base = arm.base.worldPosition;
  let t = 0;
  for (const solver of ["fabrik", "ccd"] as const) {
    bench(`humanoid arm, ${solver}`, () => {
      t += 0.05;
      arm.solve({ x: base.x + Math.cos(t) * 60, y: base.y + Math.sin(t) * 60 }, { solver });
    });
  }
  const long = new Chain(rope(64));
  bench("64-joint chain, fabrik", () => {
    t += 0.05;
    long.solve({ x: Math.cos(t) * 150, y: Math.sin(t) * 150 }, { tolerance: 0.1 });
  });
});

describe("Physics", () => {
  const ropeNodes = rope(1000);
  const spring = new SpringChain(ropeNodes, { stiffness: 0 });
  bench("SpringChain, 1000 nodes", () => spring.step(DT));

  const dolls = figures(100).map((f, i) => {
    f.root.x = i * 10; f.root.y = 100;
    const r = new Ragdoll(f, { bounds: { floor: 400 } });
    r.start({ x: 50, y: 0 });
    return r;
  });
  bench("Ragdoll, 100 humanoids", () => { for (const r of dolls) r.step(DT); });
});
