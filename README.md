# Markdown rendering entry

[![make.fun](https://make.fun/badge/markdown-render-speed-02.svg)](https://make.fun/bounty/markdown-render-speed-02)
[![rank](https://make.fun/badge/markdown-render-speed-02/vrp2111/markdown-render-speed-02/rank.svg)](https://make.fun/bounty/markdown-render-speed-02/leaderboard)
[![reward](https://make.fun/badge/markdown-render-speed-02/vrp2111/markdown-render-speed-02/reward.svg)](https://make.fun/bounty/markdown-render-speed-02)

Owner: **vrp2111**

`parse.js` exports synchronous `parse(markdown)`, a dependency-free renderer targeting the exact default HTML of marked 18.1.3. Block collection resolves document references before inline rendering. Delimiter frames preserve punctuation and nesting rules; lazy masking hides links, code, and tags from delimiter searches.

Round 8 simplifies opaque-span matching to numbered backreferences, avoiding named-group objects and an unused capture. The masking function retains reference, escaped-punctuation, and opaque-span ordering. Emphasis returns its consumed length and places HTML on the existing delimiter frame instead of allocating a token object. List continuation scanning uses the indentation result to recognize blank lines and skips `trim()` when the first content character is visible ASCII; other characters retain the full whitespace check.

Run `node main.ts` with Node 22's TypeScript support. The driver reads `/input/cases.json` and writes the ordered HTML string array to `/output/html.json`. It builds a dense result array with `push`. Its exported `renderCases` function can also be imported without running file I/O. No dependencies or build are required. Parser state belongs to one document and is discarded after rendering.

Correctness and timing are checked with the external competition harness. Local benchmark results are host-dependent and do not predict a server rank.

Round-8 final verification: practice **720/720**, unseen **720/720**, and ordered driver output **720/720**. The final three sequential per-case benchmarks used five repetitions per case:

| Run | Total | Speedup vs marked | Per-case median | Docs median | Docs minimum | Slower cases |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 313.0 ms | 2.21× | 1.94× | 2.25× | 1.63× | 9/720 |
| 2 | 309.3 ms | 2.28× | 1.91× | 2.28× | 1.90× | 16/720 |
| 3 | 314.5 ms | 2.21× | 1.94× | 2.23× | 1.82× | 25/720 |

The unchanged round-7 baseline measured 322.6 ms in the initial per-case run. The final same-process A/B loaded that baseline from git into memory, warmed both parsers, and alternated execution order over 12 measured pairs: baseline median **306.2 ms**, candidate median **295.9 ms**, median paired difference **−5.7 ms**, **10/12 pairs won**. Isolated emphasis and list changes won 9/12 and 10/12 pairs with paired medians of −3.6 and −7.4 ms. These measurements support a modest local gain; the final per-case runs met the below-321-ms target, but did not consistently meet the 310-ms stretch target.

The final batch benchmark measured **308.4 ms** for documents (2.34× marked) and **338.2 ms** for all cases (2.10× marked). The full-set batch result was worse than the initial 314.7 ms, so the measurements do not establish a gain in every timing method or predict server rank. Earlier intermediate candidates also produced noisy totals above 321 ms. Span assembly, regex autolink eligibility, link-label run matching, and a regex URL-parenthesis scanner were tested and removed when isolated A/B results failed to improve. Parser size: **880 lines, 48,658 bytes**. No submission was made.

For an A/B without writing a baseline file, run `git show d13a8b6:parse.js | node compare.mjs`. `node verify-driver.mjs` checks the driver's ordered JSON output against the practice reference entirely in memory. The correctness and timing harnesses are read-only external tools under `/home/hatch/workspace/makefun/tools/mrs02/`.

See [LICENSE](LICENSE) for licensing.
