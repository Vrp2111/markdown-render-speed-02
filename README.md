# Markdown rendering entry

[![make.fun](https://make.fun/badge/markdown-render-speed-02.svg)](https://make.fun/bounty/markdown-render-speed-02)
[![rank](https://make.fun/badge/markdown-render-speed-02/vrp2111/markdown-render-speed-02/rank.svg)](https://make.fun/bounty/markdown-render-speed-02/leaderboard)
[![reward](https://make.fun/badge/markdown-render-speed-02/vrp2111/markdown-render-speed-02/reward.svg)](https://make.fun/bounty/markdown-render-speed-02)

Owner: **vrp2111**

`parse.js` exports synchronous `parse(markdown)`, a dependency-free renderer targeting the exact default HTML of marked 18.1.3. Block collection resolves document references before inline rendering. Delimiter frames preserve punctuation and nesting rules; lazy masking hides links, code, and tags from delimiter searches. Safe URI destinations avoid encoding, and masking skips irrelevant passes.

Run `node main.ts` with Node 22's TypeScript support. The driver reads `/input/cases.json` and writes the ordered HTML string array to `/output/html.json`. No dependencies or build are required. Parser state belongs to one document and is discarded after rendering.

Correctness and timing are checked with the external competition harness. Local benchmark results are host-dependent and do not predict a server rank.

Final local verification: practice 720/720 and unseen 720/720. Five-round per-case timing totaled 336.5 ms versus marked's 667.1 ms (1.98×); median case speedup was 1.83×, with document median 1.99× and minimum 1.50×. This improves the supplied 355.0 ms baseline by about 5.2%, but does not meet the approximately 320 ms target. The separate batch benchmark measured 354.4 ms for documents and 338.4 ms for all cases.

See [LICENSE](LICENSE) for licensing.
