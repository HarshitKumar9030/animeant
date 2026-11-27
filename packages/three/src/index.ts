import type { Figure3D, Node3D } from "@animeant/core";
import {
  CylinderGeometry, Group, Matrix4, Mesh, MeshStandardMaterial, Quaternion, SphereGeometry, Vector3,
  type ColorRepresentation, type Raycaster,
} from "three";

export interface FigureViewOptions {
  boneRadius?: number;
  jointRadius?: number;
  /** Radius of the sphere drawn above the head node. 0 to skip. */
  headRadius?: number;
  /** Node the head sphere sits on. Default "head". */
  headNode?: string;
  color?: ColorRepresentation;
  jointColor?: ColorRepresentation;
  accent?: ColorRepresentation;
}

const UP = new Vector3(0, 1, 0);
const M = new Matrix4();
const A = new Vector3();
const B = new Vector3();
const Q = new Quaternion();

/**
 * A three.js object for a `Figure3D`: spheres at joints, capsules along
 * bones, a head. Add `view.object` to your scene and call `update()` after
 * the figure changes (once per frame is fine). Nodes with
 * `meta.boneWidth === 0` get no bone; `meta.hidden` hides the joint too.
 */
export class FigureView {
  readonly figure: Figure3D;
  readonly object = new Group();
  readonly #joints = new Map<Node3D, Mesh>();
  readonly #bones: { a: Node3D; b: Node3D; mesh: Mesh }[] = [];
  readonly #head: Mesh | null;
  readonly #headNode: Node3D | null;
  readonly #headRadius: number;
  readonly #base: MeshStandardMaterial;
  readonly #jointMat: MeshStandardMaterial;
  readonly #accent: MeshStandardMaterial;
  #highlighted: Mesh | null = null;

  constructor(figure: Figure3D, opts: FigureViewOptions = {}) {
    this.figure = figure;
    const boneR = opts.boneRadius ?? 0.022;
    const jointR = opts.jointRadius ?? 0.032;
    this.#headRadius = opts.headRadius ?? 0.11;
    this.#base = new MeshStandardMaterial({ color: opts.color ?? 0xe8e8ec, roughness: 0.55, metalness: 0.05 });
    this.#jointMat = new MeshStandardMaterial({ color: opts.jointColor ?? 0xffffff, roughness: 0.4 });
    this.#accent = new MeshStandardMaterial({ color: opts.accent ?? 0x4f7cff, roughness: 0.4 });

    const jointGeo = new SphereGeometry(jointR, 20, 14);
    const boneGeo = new CylinderGeometry(boneR, boneR, 1, 14, 1);
    boneGeo.translate(0, 0.5, 0); // base at the origin, grows along +y

    for (const node of figure.nodes) {
      if (node.meta.hidden) continue;
      const m = new Mesh(jointGeo, this.#jointMat);
      m.name = node.name;
      m.userData.node = node.name;
      this.#joints.set(node, m);
      this.object.add(m);
    }
    for (const [a, b] of figure.bones()) {
      if (b.meta.boneWidth === 0 || b.meta.hidden) continue;
      const mesh = new Mesh(boneGeo, this.#base);
      mesh.userData.node = b.name;
      this.#bones.push({ a, b, mesh });
      this.object.add(mesh);
    }
    const headName = opts.headNode ?? "head";
    this.#headNode = figure.has(headName) ? figure.node(headName) : null;
    if (this.#headNode && this.#headRadius > 0) {
      this.#head = new Mesh(new SphereGeometry(this.#headRadius, 32, 24), this.#base);
      this.#head.userData.node = headName;
      this.object.add(this.#head);
    } else this.#head = null;
    this.update();
  }

  update(): void {
    for (const [node, mesh] of this.#joints) {
      M.fromArray(node.worldMatrix);
      mesh.position.setFromMatrixPosition(M);
    }
    for (const { a, b, mesh } of this.#bones) {
      A.setFromMatrixPosition(M.fromArray(a.worldMatrix));
      B.setFromMatrixPosition(M.fromArray(b.worldMatrix));
      const len = A.distanceTo(B);
      mesh.visible = len > 1e-6;
      if (!mesh.visible) continue;
      mesh.position.copy(A);
      mesh.quaternion.setFromUnitVectors(UP, B.sub(A).divideScalar(len));
      mesh.scale.set(1, len, 1);
    }
    if (this.#head && this.#headNode) {
      M.fromArray(this.#headNode.worldMatrix);
      Q.fromArray(this.#headNode.worldQuaternion as unknown as number[]);
      this.#head.position.setFromMatrixPosition(M).add(A.set(0, this.#headRadius, 0).applyQuaternion(Q));
    }
  }

  /** Accent one joint (by name), or clear with null. */
  highlight(name: string | null): void {
    if (this.#highlighted) this.#highlighted.material = this.#jointMat;
    this.#highlighted = null;
    if (!name || !this.figure.has(name)) return;
    const mesh = this.#joints.get(this.figure.node(name));
    if (mesh) { mesh.material = this.#accent; this.#highlighted = mesh; }
  }

  /** The nearest joint under a ray, by node name. */
  pick(raycaster: Raycaster, nodes?: readonly string[]): string | null {
    const targets = [...this.#joints.values()].filter((m) => !nodes || nodes.includes(m.name));
    return (raycaster.intersectObjects(targets, false)[0]?.object.userData.node as string | undefined) ?? null;
  }

  dispose(): void {
    const geos = new Set<{ dispose(): void }>();
    this.object.traverse((o) => { if (o instanceof Mesh) geos.add(o.geometry); });
    geos.forEach((g) => g.dispose());
    this.#base.dispose(); this.#jointMat.dispose(); this.#accent.dispose();
    this.object.removeFromParent();
  }
}
