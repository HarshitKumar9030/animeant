import {
  dog3d, dog3dClips, hominidGait, hominids, humanoid3d, humanoid3dClips, type Clip, type Rig3D,
} from "@animeant/core";

export interface CreatureClip {
  key: string;
  label: string;
  clip: Clip;
  /** Plays on a layer above the body clips. */
  layer?: number;
  /** One-shot that holds its last frame. */
  hold?: boolean;
  /** Root height to use while this clip plays (from a generated gait). */
  height?: number;
}

export interface Creature {
  key: string;
  label: string;
  rig: Rig3D;
  clips: CreatureClip[];
  /** End node → chain names, base first. */
  effectors: Record<string, string[]>;
  selected: string;
  /** Orbit target and camera offset from it. */
  target: [number, number, number];
  camera: [number, number, number];
  /** Whether the rig carries body shapes. */
  body: boolean;
}

const human = (key: string, label: string, rig: Rig3D, gait: Parameters<typeof hominidGait>[1], extra = 1): Creature => {
  const g = hominidGait(rig, gait);
  const h = rig.nodes[0]!.y ?? 1;
  return {
    key, label, rig, body: true,
    clips: [
      { key: "idle", label: "Idle", clip: humanoid3dClips.idle },
      { key: "walk", label: "Walk", clip: g.clip, height: g.height },
      { key: "wave", label: "Wave", clip: humanoid3dClips.wave, layer: 1 },
    ],
    effectors: {
      handL: ["shoulderL", "elbowL", "handL"], handR: ["shoulderR", "elbowR", "handR"],
      footL: ["hipL", "kneeL", "footL"], footR: ["hipR", "kneeR", "footR"], head: ["spine", "neck", "head"],
    },
    selected: "shoulderR",
    target: [0, h * 0.85, 0],
    camera: [1.7 * extra, 0.6 * extra, 3.4 * extra].map((v) => v * (h / 0.95)) as [number, number, number],
  };
};

export const creatures: Record<string, Creature> = {
  sapiens: human("sapiens", "Human", hominids.sapiens, { crouch: 4, stride: 24 }),
  erectus: human("erectus", "Erectus", hominids.erectus, { crouch: 5, stride: 25 }),
  habilis: human("habilis", "Habilis", hominids.habilis, { crouch: 10, stride: 22, lean: 8 }),
  australopithecus: human("australopithecus", "Lucy", hominids.australopithecus, { crouch: 14, stride: 20, lean: 12, armSwing: 14 }),
  ape: human("ape", "Ape", hominids.ape, { quadruped: true, lean: 62, stride: 20, duration: 1.2 }),
  dog: {
    key: "dog", label: "Dog", rig: dog3d, body: true,
    clips: [
      { key: "idle", label: "Idle", clip: dog3dClips.idle },
      { key: "trot", label: "Trot", clip: dog3dClips.trot },
      { key: "sit", label: "Sit", clip: dog3dClips.sit, hold: true },
    ],
    effectors: {
      pawFL: ["shoulderFL", "elbowFL", "wristFL"], pawFR: ["shoulderFR", "elbowFR", "wristFR"],
      pawBL: ["hipBL", "kneeBL", "hockBL"], pawBR: ["hipBR", "kneeBR", "hockBR"],
      head: ["chest", "neck", "head"], tail4: ["tail1", "tail2", "tail3", "tail4"],
    },
    selected: "neck",
    target: [0, 0.32, 0],
    camera: [1.1, 0.45, 1.5],
  },
  stick: {
    key: "stick", label: "Stick", rig: humanoid3d, body: false,
    clips: [
      { key: "idle", label: "Idle", clip: humanoid3dClips.idle },
      { key: "walk", label: "Walk", clip: humanoid3dClips.walk },
      { key: "wave", label: "Wave", clip: humanoid3dClips.wave, layer: 1 },
    ],
    effectors: {
      handL: ["shoulderL", "elbowL", "handL"], handR: ["shoulderR", "elbowR", "handR"],
      footL: ["hipL", "kneeL", "footL"], footR: ["hipR", "kneeR", "footR"], head: ["spine", "neck", "head"],
    },
    selected: "shoulderR",
    target: [0, 0.78, 0],
    camera: [1.7, 0.67, 3.6],
  },
};
