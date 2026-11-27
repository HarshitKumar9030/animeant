# @animeant/core

Node graph, kinematics, animation and physics for [Animeant](https://github.com/HarshitKumar9030/animeant), a code-first 2D skeletal animation library. Zero runtime dependencies.

```bash
npm install @animeant/core
```

```ts
import { Figure, humanoid } from "@animeant/core";

const fig = Figure.fromRig(humanoid);
fig.chain("handR").solve({ x: 240, y: 120 });
```

See the [main README](https://github.com/HarshitKumar9030/animeant#readme) for the full API.
