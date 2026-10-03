# Oracle Breaker

Oracle Breaker is a browser-based fighting game where an offline n-gram model learns your move patterns and telegraphs its predictions. Build entropy by staying predictable, then spend it on deviations to break the Oracle's read.

## Play

Open the deployed [GitHub Pages game](https://princesudaim.github.io/ai-prediction-combat-system/) or run it locally:

```sh
npm ci
npm run dev
```

Press **Enter** to start. Default keyboard controls:

| Action | Keys |
| --- | --- |
| Move back / forward | A / D |
| Guard / dash | S / Space |
| Jab / slash / throw | J / K / L |
| Late cancel / fake recovery / stance swap | Q / E / R |
| Pause | Escape |

Controls can be rebound in-game. The game simulation runs in the browser; control bindings are saved in browser local storage. Matches are not saved, and starting a new match resets its round, statistics, and learned model. Google Fonts are requested for typography, with system-font fallbacks.

## Build

```sh
npm run build
npm run preview
```

The production build is a self-contained static page in `dist/`. GitHub Pages deploys it automatically when changes are pushed to `main`.
