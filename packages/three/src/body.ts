import type { Figure3D, Node3D } from "@animeant/core";
import {
  Bone, BufferGeometry, Color, Float32BufferAttribute, Group, Matrix4, MeshStandardMaterial, Quaternion,
  Skeleton, SkinnedMesh, Uint16BufferAttribute, Vector3, type ColorRepresentation,
} from "three";

/**
 * Body shape for the bone from a node's parent to the node, in `meta.body`:
 * a tapered capsule from radius r[0] at the parent joint to r[1] here.
 */
export interface BodySegment {
  r: [number, number];
  /** Cross-section scale: [side, front]. [1, 0.7] flattens front to back. */
  squash?: [number, number];
  color?: ColorRepresentation;
}

/** An ellipsoid attached to a node, in `meta.blobs`: torso, skull, snout, ears, eyes. */
export interface BodyBlob {
  /** Radii along the node's local x, y, z. */
  r: [number, number, number];
  /** Offset from the node, in its local space. */
  at?: [number, number, number];
  /** Extra local rotation, XYZ Euler radians. */
  rot?: [number, number, number];
  color?: ColorRepresentation;
  /** Sphere detail. Default 20. */
  detail?: number;
}

export interface BodyOptions {
  /** Color for parts without their own. Default: the root's `meta.bodyColor`. */
  color?: ColorRepresentation;
  roughness?: number;
  /** Fraction of a segment at each end that blends into its neighbor. Default 0.45. */
  blend?: number;
  radialSegments?: number;
}

type Weights = [number, number][]; // [boneIndex, weight]

interface Builder {
  pos: number[];
  col: number[];
  idx: number[];
  skinI: number[];
  skinW: number[];
}

const push = (b: Builder, p: Vector3, c: Color, w: Weights) => {
  b.pos.push(p.x, p.y, p.z);
  b.col.push(c.r, c.g, c.b);
  const top = [...w].sort((a, z) => z[1] - a[1]).slice(0, 4);
  const sum = top.reduce((s, [, v]) => s + v, 0) || 1;
  for (let i = 0; i < 4; i++) {
    b.skinI.push(top[i]?.[0] ?? 0);
    b.skinW.push((top[i]?.[1] ?? 0) / sum);
  }
  return b.pos.length / 3 - 1;
};

const smooth = (x: number) => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };

/**
 * A smooth, skinned body for a `Figure3D`, generated from shapes in the rig's
 * node `meta` (`body` for bones, `blobs` for attached parts). The mesh is
 * bound to the figure's pose when built (build it at rest) and follows the
 * nodes after every `update()`. Bones without `meta.body` get no flesh, so
 * the same rig can drive a stick view and a body.
 */
export class BodyView {
  readonly figure: Figure3D;
  readonly object = new Group();
  readonly mesh: SkinnedMesh;
  readonly material: MeshStandardMaterial;
  readonly #bones: Bone[] = [];
  readonly #nodes: Node3D[];

  constructor(figure: Figure3D, opts: BodyOptions = {}) {
    this.figure = figure;
    this.#nodes = figure.nodes;
    const index = new Map(this.#nodes.map((n, i) => [n, i]));
    const base = new Color(opts.color ?? (figure.root.meta.bodyColor as ColorRepresentation | undefined) ?? 0xd9c2a7);
    const blend = opts.blend ?? 0.45;
    const radial = opts.radialSegments ?? 18;
    const b: Builder = { pos: [], col: [], idx: [], skinI: [], skinW: [] };

    const world = (n: Node3D) => new Matrix4().fromArray(n.worldMatrix);
    const wq = (n: Node3D) => new Quaternion().fromArray(n.worldQuaternion as unknown as number[]);
    const wp = (n: Node3D) => new Vector3().setFromMatrixPosition(world(n));

    // ---- Segments: capsule from parent joint to this node, driven by the parent's bone.
    for (const node of this.#nodes) {
      const seg = node.meta.body as BodySegment | undefined;
      const parent = node.parent;
      if (!seg || !parent) continue;
      const a = wp(parent), c = wp(node);
      const len = a.distanceTo(c);
      if (len < 1e-6) continue;
      const dir = c.clone().sub(a).divideScalar(len);
      // Cross-section basis: the parent's local x, made perpendicular to the bone.
      const side = new Vector3(1, 0, 0).applyQuaternion(wq(parent));
      side.sub(dir.clone().multiplyScalar(side.dot(dir)));
      if (side.lengthSq() < 1e-8) side.set(0, 0, 1).sub(dir.clone().multiplyScalar(dir.z));
      side.normalize();
      const front = new Vector3().crossVectors(side, dir).normalize();
      const [sx, sz] = seg.squash ?? [1, 1];
      const color = seg.color !== undefined ? new Color(seg.color) : base;

      const own = index.get(parent)!;
      const prev = parent.parent ? index.get(parent.parent) : undefined;
      const next = index.get(node)!;
      const weightsAt = (t: number): Weights => {
        const w: Weights = [[own, 1]];
        if (prev !== undefined && t < blend) { const k = 0.5 * (1 - smooth(t / blend)); w[0]![1] -= k; w.push([prev, k]); }
        if (t > 1 - blend) { const k = 0.5 * smooth((t - (1 - blend)) / blend); w[0]![1] -= k; w.push([next, k]); }
        return w;
      };

      const [r0, r1] = seg.r;
      const capRings = 5;
      const bodyRings = Math.max(4, Math.ceil(len / Math.max(0.01, (r0 + r1) / 2)) * 3);
      // Profile: (axial offset from a, radius, t for weights)
      const profile: [number, number, number][] = [];
      for (let k = 1; k <= capRings; k++) {
        const th = (Math.PI / 2) * (k / capRings);
        profile.push([-r0 * Math.cos(th), r0 * Math.sin(th), 0]);
      }
      for (let k = 1; k < bodyRings; k++) {
        const t = k / bodyRings;
        profile.push([t * len, r0 + (r1 - r0) * t, t]);
      }
      for (let k = capRings; k >= 1; k--) {
        const th = (Math.PI / 2) * (k / capRings);
        profile.push([len + r1 * Math.cos(th), r1 * Math.sin(th), 1]);
      }

      const pole0 = push(b, a.clone().addScaledVector(dir, -r0), color, weightsAt(0));
      const rings: number[] = [];
      for (const [off, rad, t] of profile) {
        const center = a.clone().addScaledVector(dir, off);
        const start = b.pos.length / 3;
        rings.push(start);
        const w = weightsAt(t);
        for (let i = 0; i < radial; i++) {
          const ang = (i / radial) * Math.PI * 2;
          const p = center.clone()
            .addScaledVector(side, Math.cos(ang) * rad * sx)
            .addScaledVector(front, Math.sin(ang) * rad * sz);
          push(b, p, color, w);
        }
      }
      const pole1 = push(b, a.clone().addScaledVector(dir, len + r1), color, weightsAt(1));
      for (let i = 0; i < radial; i++) {
        const j = (i + 1) % radial;
        b.idx.push(pole0, rings[0]! + j, rings[0]! + i);
        const last = rings[rings.length - 1]!;
        b.idx.push(pole1, last + i, last + j);
      }
      for (let r = 0; r < rings.length - 1; r++) {
        const r0i = rings[r]!, r1i = rings[r + 1]!;
        for (let i = 0; i < radial; i++) {
          const j = (i + 1) % radial;
          b.idx.push(r0i + i, r0i + j, r1i + i, r0i + j, r1i + j, r1i + i);
        }
      }
    }

    // ---- Blobs: ellipsoids rigidly attached to their node.
    for (const node of this.#nodes) {
      const blobs = node.meta.blobs as BodyBlob[] | undefined;
      if (!blobs) continue;
      const m = world(node);
      const q = wq(node);
      const bone = index.get(node)!;
      for (const blob of blobs) {
        const color = blob.color !== undefined ? new Color(blob.color) : base;
        const local = new Quaternion();
        if (blob.rot) local.setFromAxisAngle(new Vector3(1, 0, 0), blob.rot[0])
          .multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), blob.rot[1]))
          .multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), blob.rot[2]));
        const orient = q.clone().multiply(local);
        const center = new Vector3(...(blob.at ?? [0, 0, 0])).applyMatrix4(m);
        const detail = blob.detail ?? 20;
        const lat = Math.max(6, Math.round(detail / 2));
        const top = push(b, new Vector3(0, blob.r[1], 0).applyQuaternion(orient).add(center), color, [[bone, 1]]);
        const rings: number[] = [];
        for (let k = 1; k < lat; k++) {
          const th = (k / lat) * Math.PI;
          rings.push(b.pos.length / 3);
          for (let i = 0; i < detail; i++) {
            const ph = (i / detail) * Math.PI * 2;
            const p = new Vector3(
              Math.sin(th) * Math.cos(ph) * blob.r[0],
              Math.cos(th) * blob.r[1],
              Math.sin(th) * Math.sin(ph) * blob.r[2],
            ).applyQuaternion(orient).add(center);
            push(b, p, color, [[bone, 1]]);
          }
        }
        const bottom = push(b, new Vector3(0, -blob.r[1], 0).applyQuaternion(orient).add(center), color, [[bone, 1]]);
        for (let i = 0; i < detail; i++) {
          const j = (i + 1) % detail;
          b.idx.push(top, rings[0]! + j, rings[0]! + i);
          const last = rings[rings.length - 1]!;
          b.idx.push(bottom, last + i, last + j);
        }
        for (let r = 0; r < rings.length - 1; r++) {
          for (let i = 0; i < detail; i++) {
            const j = (i + 1) % detail;
            const a0 = rings[r]!, a1 = rings[r + 1]!;
            b.idx.push(a0 + i, a0 + j, a1 + i, a0 + j, a1 + j, a1 + i);
          }
        }
      }
    }

    const geo = new BufferGeometry();
    geo.setAttribute("position", new Float32BufferAttribute(b.pos, 3));
    geo.setAttribute("color", new Float32BufferAttribute(b.col, 3));
    geo.setAttribute("skinIndex", new Uint16BufferAttribute(b.skinI, 4));
    geo.setAttribute("skinWeight", new Float32BufferAttribute(b.skinW, 4));
    geo.setIndex(b.idx);
    geo.computeVertexNormals();

    // Bones sit flat under the group and copy each node's world matrix, so
    // the skeleton mirrors the figure exactly, wherever the group is placed.
    const inverses: Matrix4[] = [];
    for (const n of this.#nodes) {
      const bone = new Bone();
      bone.name = n.name;
      bone.matrixAutoUpdate = false;
      bone.matrix.fromArray(n.worldMatrix);
      this.#bones.push(bone);
      this.object.add(bone);
      inverses.push(world(n).invert());
    }
    this.material = new MeshStandardMaterial({ vertexColors: true, roughness: opts.roughness ?? 0.7, metalness: 0 });
    this.mesh = new SkinnedMesh(geo, this.material);
    this.mesh.frustumCulled = false; // the bind-pose bounds don't follow root motion
    this.object.add(this.mesh);
    this.object.updateMatrixWorld(true);
    this.mesh.bind(new Skeleton(this.#bones, inverses), new Matrix4());
  }

  /** Copy the figure's pose into the skeleton. Call after the figure changes. */
  update(): void {
    for (let i = 0; i < this.#bones.length; i++) {
      const bone = this.#bones[i]!;
      bone.matrix.fromArray(this.#nodes[i]!.worldMatrix);
      bone.matrixWorldNeedsUpdate = true;
    }
  }

  /** 0..1, for fades between figures. */
  set opacity(v: number) {
    // Dithered (hashed) alpha: no sorting, so overlapping parts and
    // crossfading figures stay clean.
    this.material.opacity = v;
    const hashed = v < 0.999;
    if (this.material.alphaHash !== hashed) { this.material.alphaHash = hashed; this.material.needsUpdate = true; }
    this.mesh.visible = v > 0.001;
  }
  get opacity(): number { return this.material.opacity; }

  get vertexCount(): number { return this.mesh.geometry.getAttribute("position").count; }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.object.removeFromParent();
  }
}
