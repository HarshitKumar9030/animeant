# @animeant/three

three.js view for [Animeant](https://github.com/HarshitKumar9030/animeant) 3D figures.

```bash
npm install @animeant/core @animeant/three three
```

```ts
import { Animator, Figure3D, humanoid3d, humanoid3dClips } from "@animeant/core";
import { FigureView } from "@animeant/three";

const fig = Figure3D.fromRig(humanoid3d);
const view = new FigureView(fig);
scene.add(view.object);

const animator = new Animator(fig);
animator.play(humanoid3dClips.walk);
// each frame:
animator.update(dt);
view.update();
```
