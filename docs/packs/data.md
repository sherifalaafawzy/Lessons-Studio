# Data pack: ERDs, SQL step by step, pipelines and spreadsheets

Four canvas element types for lessons about data: how a database is laid out, what a query really does, how data
moves through a pipeline, and how a spreadsheet works and gets cleaned. Made for Darsi's Data engineering track, whose
examples are school data (attendance, marks, rainfall, market prices, a library). The player draws them with the data
pack (`packages/player/src/packs/data/`, about 11 KB gzipped), loaded only by lessons that use them.

Everything a learner watches is computed when the lesson is made (`packages/ops/src/packs/data.ts`): **the query really
runs**, in sql.js, step by step; the formulas are evaluated; the records' routes are planned. The phone only draws.

| Type | Teaches | Animation | Right to left |
|---|---|---|---|
| `erd` | Tables, keys and how they link (one to one, one to many, many to many) | `reveal` table by table, `focus` a table or a relationship | Table positions mirror; names and types stay left to right |
| `query` | What each clause of a SQL query does, in the order the database runs it | `frame` = the step, `reveal` writes the SQL then brings the tables, `focus` lights a SQL line | Tables run right to left and the layout mirrors; the SQL and column names stay left to right |
| `pipeline` | Extract, transform, load (any DAG); batch and stream; a bad record caught and retried or set aside | `frame` = time (one hop per frame) or `pass` 0 → 1 for the whole run, `reveal` stage by stage, `focus` a stage | Mirrors |
| `sheet` | Cells, references and formulas (SUM, AVERAGE, IF…), filling down, cleaning typos, blanks and repeats | `frame` = the selection's walk and the cells that appear, change or go; `reveal` row by row; `focus` an issue | Column A on the right, as spreadsheets run in Arabic; numbers and formulas stay left to right |

Types: `packages/spec/src/packs/data/types.ts`. Validation: `packages/spec/src/packs/data/check.ts` (`DATA_LIMITS`).

**Text size.** Every element picks the biggest text that fits its box, up to 42 px (or `size`), and never draws a
learner's text smaller than its own size; keys, types, labels and step numbers are 0.875–0.95 of it. Make the box
the size you mean, and keep the content small: a landscape body under a headline holds about 7 rows and 5 SQL lines
at 32 px or more. The ERD drops its column types, and the ERD and pipeline turn top to bottom, when that buys bigger
text.

## `erd`: an entity-relationship diagram

```json
{ "id": "db", "type": "erd", "x": 50, "y": 140, "w": 1180, "h": 550,
  "tables": [
    { "name": "members", "label": { "en": "Members", "ar": "الأعضاء" }, "cols": [{ "name": "id", "type": "INT", "key": "pk" }, { "name": "name", "type": "TEXT" }] },
    { "name": "loans", "cols": [{ "name": "id", "key": "pk" }, { "name": "member_id", "key": "fk" }, { "name": "book_id", "key": "fk" }] },
    { "name": "books", "cols": [{ "name": "id", "key": "pk" }, { "name": "title" }] } ],
  "rels": [
    { "from": "members", "to": "loans", "kind": "1-n", "via": "member_id", "label": { "en": "borrows", "ar": "يستعير" } },
    { "from": "books", "to": "loans", "kind": "1-n", "via": "book_id" } ] }
```

- **Tables** (1–6, 1–8 columns each): `name` as in the database, an optional `label` in the lesson's languages (left out
  when it only repeats the name), `cols` with `type` and `key` (`pk`, `fk` or `pkfk`; PK columns are underlined, FK
  columns italic), `tone`. `types: false` hides the types.
- **Relationships** (up to 8): `kind` is `1-1`, `1-n` (`from` is the one side) or `n-n`. Crow's feet: two bars for one,
  a fork for many. `via` names the foreign key in `to`: the line meets that row, and the primary key's row at `from`.
  `label` sits on the line.
- **Layout:** automatic. From the first table out along the relationships, in columns (the first table at the start
  side), each column ordered to keep lines short. List the table the others hang off first.
- **Animation:** `reveal` brings the tables in, in layout order, each line once both its tables are in. `focus` n lights
  table n (in `tables` order); n = tables + k lights relationship k and its key rows.

## `query`: a SQL query, step by step

Made with `queryStages` (below), never by hand:

```ts
const data = await queryStages("SELECT name, mark FROM results WHERE mark >= 50 ORDER BY mark DESC LIMIT 3", setupSql(["results"]));
const el = queryElement({ id: "q", x: 50, y: 140, w: 1180, h: 550 }, data, { words: dataWords(langs) });
```

- **The steps** follow the order the database works, not the order SQL is written: FROM (the table), JOIN (the two
  tables, matching rows joined by lines, rows without a match struck out; then the rows the join makes, with a line at
  the seam), WHERE (the rows it drops fade and are struck out; then the gap closes), GROUP BY (rows gather, a colour
  bar per group), HAVING (groups struck out), SELECT (the columns it uses light up, the others dim; then the rows it
  makes, one per group), DISTINCT (repeats struck out), ORDER BY (rows move into order, an arrow on the sort column),
  LIMIT (a cut line, the rest struck out) and the result (framed).
- **The SQL** is shown beside the tables (or above them, whichever gives bigger text; `layout` forces one), left to
  right in every language, keywords coloured. The current clause is lit, and each clause gets a number when it runs:
  learners see that SELECT, written first, runs after FROM, WHERE and GROUP BY.
- **Fields:** `sql`, `grids` (every table shown: the sources, the joined rows, the result; at most 6, 12 rows of 8),
  `steps` (`kind`, the SQL `lines` it lights, the `views` of grids: `rows` top to bottom, `out`, `groups`, `lit`,
  `dim`, `hide`, `sort`, `cut`; a join's `links`), `words` (how values show per language), `layout`, `frame`, `size`.
- **Animation:** `frame` k shows step k; fractions move rows between steps. Tables that change cross over: the old one
  fades out, then the new one in. `queryFrame(el, "where")` gives a kind's first step. `reveal` 0 → 0.55 writes the
  SQL line by line, then the tables come in. `focus` n lights SQL line n.
- **Right to left:** tables follow the language (the first column on the right; numbers stay left to right, aligned
  to the end), column names and the SQL stay left to right, and the SQL moves to the right side.
- **Values in Arabic:** `words` translates values for display (`dataWords(langs)` has the pupils' names). Translate
  only what the SQL doesn't compare or sort: the query runs on the stored values.

## `pipeline`: records flowing through stages

```ts
const el = pipeline(box, {
  stages: [{ id: "collect", label: T("Collect", "جمع"), icon: "wifi", kind: "source" }, { id: "check", label: T("Check", "فحص"), kind: "check" },
           { id: "save", label: T("Save", "حفظ"), icon: "data", kind: "store" }],
  records: 8, mode: "stream", bad: [3], fix: "aside",
}, { aside: T("Set aside", "جانبًا") });
```

- **Stages** (2–8): `id`, `label`, an `icon` of the player's own 18, `kind` (`source` and `store` drawn as data stores,
  `check` with a shield), `tone`. **Edges** `[from, to]` make any DAG (default: a chain); a branch sends records down
  its arrows in turn.
- **Records** (up to 24) are dots. `pipelineFrames` plans each one's `path` of `[frame, stage]` waypoints (`[frame,
  stage, 1]`: the stage's set-aside tray): one frame per hop, one frame of rest at each stage. **Stream:** one leaves
  the source per frame (`gap`); **batch:** all move together.
- **A bad record** (`bad`) is caught at the check (the first `check` stage, or `check`): it turns danger and is set aside
  into a dashed tray under the stage (`fix: "aside"`, with the tray's `aside` label and counter), or goes back to the
  stage before, is fixed there (turns ok) and comes through again (`fix: "retry"`).
- **Counters:** `frames[k]` has one count per stage (records that reached it by frame k), then the tray's; a badge on
  each stage shows them (`counts: false` hides them).
- **Animation:** `frame` is the time; `pass` 0 → 1 plays the whole run instead (−1 gives the time back to `frame`,
  whose default is the finished run). `reveal` brings the stages in along the flow; `focus` n lights stage n.
- **Layout:** along the width in layers (longest path), top to bottom when that's clearly bigger (a tall box).

## `sheet`: a spreadsheet

```ts
const cells = sheetCells([[T("Name", "الاسم"), T("Term 1", "الفصل 1"), T("Term 2", "الفصل 2"), T("Average", "المتوسط")],
  ["Amina", 78, 84, null], ["Joseph", 45, 61, null]], { D2: "=AVERAGE(B2:C2)" });
const { cells: filled, frames } = sheetFill(cells, "D2", "D3");
const el = sheet(box, filled, { cols: 4, rows: 3, frames, words: dataWords(langs) });
```

- **Cells** by address (`A1`…`H12`; up to 8 columns and 12 rows): `v` (the value; a formula's is computed), `t` (text
  per language), `f` (the formula), `at` (the frame it appears), `to` (`{ at, v | t }`: a change, as a typo corrected),
  `out` (struck out from that frame), `b` (bold). `widths` in stage pixels, else from the contents.
- **The formula bar** shows the selected cell's address and its formula (its `"…"` text through `words`), or its value.
  `bar: false` hides it.
- **`frames`**: the selected cell frame by frame (null for none). The selection glides between cells; its column
  letter and row number light up.
- **Issues** (`typo`, `blank`, `dup`, `bad`) are outlined in danger, in ok once `fixed`; `focus` n lights issue n and
  shows its `label` beside the sheet.
- **Animation:** `frame` (above), `reveal` fills the rows in from the top, `focus` an issue.

## Authoring helpers (`packages/ops/src/packs/data.ts`, also `packs.data` from `@lessonstudio/ops`)

- **Queries:** `queryStages(sql, setup)` (sql.js loaded in Node by `loadSql`), `queryStagesWith(SQL, sql, setup)`
  with an engine you loaded, `queryElement(box, data, { words, layout, size })`, `queryFrame(el, kind)`. A query on one
  line is set one clause per line. Each step runs as SQL of its own, with the rows' rowids to follow them, and the
  result is checked against the query run whole. It supports one table or two joined (INNER or LEFT JOIN … ON), WHERE,
  GROUP BY, HAVING, aggregates (one group without GROUP BY), DISTINCT, ORDER BY (a sort column that isn't picked shows
  until the result), LIMIT and OFFSET; a subquery inside a clause runs but isn't drawn. UNION, a second JOIN and comma
  joins are refused, saying why.
- **Data:** `DATASETS` (students, results, marks, attendance, rainfall, prices, books, loans), `setupSql(names, own)`,
  `dataWords(langs)`.
- **ERDs:** `erdCols("id INT pk, member_id INT fk")`, `erdTable(name, cols, label)`, `erdSchema(name, box, langs)` for
  `school`, `library`, `attendance` and `market`.
- **Pipelines:** `pipelineFrames(plan)`, `pipeline(box, plan, { aside, counts, size })`, `pipelineEnd(el)`,
  `etlPipeline(box, langs, { mode, fix, records })` (rain gauges: collect, check, clean, save).
- **Sheets:** `evalFormula`, `sheetEval(cells)` (SUM, AVERAGE, COUNT, COUNTA, MIN, MAX, IF, AND, OR, NOT, ROUND, ABS,
  COUNTIF, SUMIF, TRIM, UPPER, LOWER, LEN; `+ − × ÷ ^ &`, comparisons, references and ranges, `$` for absolute; errors
  `#DIV/0!`, `#NAME?`, `#VALUE!`, `#REF!` for a loop), `shiftFormula`, `sheetFill(cells, from, to, { at, step })`,
  `sheetCells(rows, formulas)`, `cleanSheet(cells, size, { known, labels, at })` (blanks, typos two letters from a
  `known` value, repeated rows; the fixes one per frame), `sheet(box, cells, …)`, `marksSheet`, `pricesSheet`, `addr`.
- **`element(type, langs, box)`:** a default element of each type for the studio's "Add a pack element".

**Presets** (`presets(langs, stage)`, laid out for landscape, portrait and square): `erd-school`, `query-top`
(WHERE, SELECT, ORDER BY, LIMIT), `query-join` (JOIN and GROUP BY), `pipeline-etl`, `sheet-fill` and `sheet-clean`,
each with English and Arabic narration and keyframes on the spoken words. Their queries are kept computed in
`PRESET_QUERIES` so the studio needs no sql.js; a test recomputes them and fails if they drift.

## Storyboard bodies (`scripts/darsi/packs/data.ts`)

Sentences count from 0. Each body takes the full width (nobody beside it).

```jsonc
// erd: a ready-made schema, or your own tables; `in` is the sentence each table (in layout order) comes in on
{ "erd": { "schema": "library", "in": [0, 0, 1], "focus": [{ "table": "loans", "s": 1 }, { "rel": "members>loans", "s": 2 }] } }
{ "erd": { "tables": [{ "name": "students", "label": {…}, "cols": "id INT pk, name TEXT" }, …],
           "rels": [{ "from": "students", "to": "marks", "kind": "1-n", "via": "student_id", "label": {…} }] } }
// query: run in sql.js; `data` names datasets (or `tables` of your own, or `setup` SQL);
// `at` brings each kind's first step on a sentence, the steps after it follow 1.4 s apart
{ "query": { "sql": "SELECT name, mark FROM results WHERE mark >= 50 ORDER BY mark DESC", "data": ["results"],
             "words": "names", "at": { "where": 1, "select": 2, "order": 3 } }, "headline": null }
// pipeline: `frames: [a, b]` plays the run from sentence a to the end of sentence b
{ "pipeline": { "stages": [{ "id": "collect", "label": {…}, "icon": "wifi", "kind": "source" }, …], "records": 8,
                "mode": "stream", "bad": [3], "fix": "aside", "aside": {…}, "frames": [1, 2], "focus": [{ "stage": "check", "s": 1 }] } }
// sheet: row 1 is the headers; fill a formula down, or clean
{ "sheet": { "rows": [[{…}, {…}, {…}], ["Amina", 7, null]], "formulas": { "C2": "=B2*2" }, "fill": { "from": "C2", "to": "C6", "frames": [1, 2] }, "words": "names" } }
{ "sheet": { "rows": […], "clean": { "known": { "B": ["Rice", "Beans"] }, "labels": true, "frames": [2, 3] }, "focus": [{ "issue": 1, "s": 1 }] } }
```

- Name every kind of a query's steps in `at` (each on its own sentence), so a step never comes after the next one.
- A query with a JOIN draws two tables side by side, and a body under a headline is only 430 px tall: give the scene
  `"headline": null` (the SQL is its title), keep the tables to 5 rows, and put `ON` on the JOIN's line.
- Errors name the scene: a query SQLite can't run, a step `at` names that the query hasn't, a focus on a table, stage
  or issue that isn't there.

## Example and checks

`examples/pack-data` (`node scripts/examples/pack-data.ts`, then `node scripts/make-timing.mjs pack-data`): an ERD of a
school library, three queries run in sql.js (top three; a join with GROUP BY and HAVING; DISTINCT), a stream pipeline
that sets a bad reading aside and a batch that retries one, and two spreadsheets (a formula filled down; a sheet
cleaned), in English and Arabic. Tests: `packages/spec/test/packs/data.test.ts` (validation),
`packages/ops/test/packs/data.test.ts` (the queries against sql.js, formulas, cleaning, routes, presets in every
shape), `packages/player/test/packs/data.test.ts` (drawing, steps, the same frame for the same time, right to left)
and `scripts/test/packs/data.test.ts` (the bodies, through the converter).
