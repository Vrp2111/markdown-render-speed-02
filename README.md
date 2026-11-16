# markdown-render-speed-02

[![make.fun](https://make.fun/badge/markdown-render-speed-02.svg)](https://make.fun/bounty/markdown-render-speed-02)
[![rank](https://make.fun/badge/markdown-render-speed-02/vrp2111/markdown-render-speed-02/rank.svg)](https://make.fun/bounty/markdown-render-speed-02/leaderboard)
[![reward](https://make.fun/badge/markdown-render-speed-02/vrp2111/markdown-render-speed-02/reward.svg)](https://make.fun/bounty/markdown-render-speed-02)

Owner: **vrp2111**. A dependency-free ES module for rendering Markdown with marked 18.1.3 default-output compatibility.

```js
import { parse } from './parse.js';
console.log(parse('Hello **world**!'));
```

The parser gathers blocks and reference definitions, then renders inline content directly to HTML. Indexed list scanning, character dispatch, lazy delimiter masking, and simple-text and emphasis fast paths reduce intermediate work. State is local to each call; output does not depend on earlier documents.

Run `node main.ts` on Node 22.23.4 or newer. The driver reads `/input/cases.json` and writes `/output/html.json`, preserving document order. No installation or build step is needed.

Validation uses the competition's external practice harness: 680 specification examples and 40 generated documents, compared byte for byte with marked. All 720 pass. Timing is measured separately with the external five-round per-case benchmark; results vary with host load and runtime warmup.

MIT licensed; see [LICENSE](LICENSE).
