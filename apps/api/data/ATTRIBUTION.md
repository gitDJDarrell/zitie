# Reference data — sources and licenses

Everything in this directory is **generated** from open datasets by the scripts
in `../scripts/`, except `stories.json`, `insights-hsk1.json`,
`hsk-words-supplement.json` and `readings-override.json`, which are written by
hand. None of the sources are committed; the build scripts download them.

| File | Built by | From |
| --- | --- | --- |
| `hanzi.json` | `build-hanzi-data.ts` | CHISE IDS, Unihan + CC-CEDICT (via makemeahanzi) |
| `insights-hsk.json` | `build-reference-data.ts` | `hanzi.json`, CC-CEDICT, HSK 3.0 word list, Leiden Weibo Corpus frequencies |
| `hsk-words.json` | `build-reference-data.ts` | HSK 3.0 word list, CC-CEDICT, `hsk-words-supplement.json`, `readings-override.json` |
| `hsk-words-supplement.json` | hand-written | glosses for the 272 HSK entries CC-CEDICT doesn't list (transparent phrases like 车上, 看到) |
| `readings-override.json` | hand-written | the everyday reading for 38 heteronyms the dictionary heuristic gets wrong (打 is dǎ, not dá) |
| `insights-hsk1.json` | hand-written | reviewed breakdowns that take precedence over the generated ones |
| `stories.json` | hand-written | etymologies for the 184 dex characters the datasets record no account of |
| `insights-curated.json` | `build-curated.ts` | `stories.json` + readings from `hanzi.json` + compounds from `insights-hsk.json` |
| `strokes-hsk.json` | `build-stroke-data.ts` | makemeahanzi `graphics.txt` — stroke outlines and centrelines for the 3,000 dex characters |
| `apps/web/src/data/lookalikes.ts` (outside this directory) | `build-lookalikes.ts` | `strokes-hsk.json` — which characters are easy to misread as which, for read mode's distractors |

## Sources

**CC-CEDICT** — Creative Commons Attribution-Share Alike 3.0.
<https://www.mdbg.net/chinese/dictionary?page=cc-cedict>. Referenced works:
CEDICT, Copyright © 1997, 1998 Paul Andrew Denisowski. Obtained via the
[`hanzi`](https://www.npmjs.com/package/hanzi) npm package, which republishes
the MDBG release verbatim.

Word readings and glosses in `hsk-words.json`, the compound lists in
`insights-hsk.json` (and, through it, `insights-curated.json`), and the
character glosses reaching `hanzi.json` through makemeahanzi are derived from
CC-CEDICT, so **those files are themselves
licensed CC BY-SA 3.0** and any redistribution must keep this notice.

**Unihan Database** — © Unicode, Inc., under the Unicode License.
<https://www.unicode.org/charts/unihan.html>. Radicals, readings and
definitions, reaching `hanzi.json` through makemeahanzi.

**CHISE IDS / cjkvi-ids** — © 2014–2017 CJKVI Database, based on the CHISE IDS
Database. <https://github.com/cjkvi/cjkvi-ids>. Ideographic Description
Sequences — the component decompositions in `hanzi.json`.

**makemeahanzi** — <https://github.com/skishore/makemeahanzi>, MIT license for
the code and CC BY 4.0 for the data. Decompositions, etymologies and stroke
data, itself derived from Unihan and CC-CEDICT. `strokes-hsk.json` is a direct
derivation of its `graphics.txt` (stroke outlines and medians), so that file
carries the same attribution requirement — as does
`apps/web/src/data/lookalikes.ts`, which is computed from it and, unlike the
rest of this table, is **shipped in the web bundle** rather than only seeded
into the database.

**HSK 3.0 character and word lists** — © 2021 Pleco Inc., MIT license, via
<https://github.com/elkmovie/hsk30>. The dex levels in
`apps/web/src/data/dex.ts` and the levels in `hsk-words.json`.

**Leiden Weibo Corpus word frequencies** — bundled in the `hanzi` package; used
only to rank which compounds a character's card shows first.

## Regenerating

```sh
npm run build:hanzi --workspace apps/api        # hanzi.json
npm run build:reference --workspace apps/api    # insights-hsk.json + hsk-words.json
npm run build:curated --workspace apps/api      # insights-curated.json (from stories.json)
npm run build:strokes --workspace apps/api      # strokes-hsk.json
npm run build:lookalikes --workspace apps/api   # apps/web/src/data/lookalikes.ts
```

The first two download their sources to a scratch directory (pass a path as the
first argument to reuse one). None of them touch the hand-written files, and
`build:curated` needs `insights-hsk.json` to be current — it reads the compound
lists straight out of it. `build:lookalikes` downloads nothing but needs
`strokes-hsk.json`, so run it after `build:strokes`.
