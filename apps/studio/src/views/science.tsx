// The inspector's forms for the science elements: equations, plots, networks, architecture diagrams and tables.
// Every change is one updateElement through edit(), so it syncs, and undo puts back exactly what it changed.
import { useState } from "preact/hooks";
import type { ArchBlock, ArchElement, ArchKind, Element, MathElement, NetElement, PlotElement, PlotSeries, TableElement, Text, Tone } from "@lessonstudio/spec";
import { ARCH_KINDS, SCIENCE_LIMITS, TONES, pick } from "@lessonstudio/spec";
import { ARCH_PRESETS, framesOf, tx, type ArchPreset } from "@lessonstudio/ops";
import { freeId, lang, lesson } from "../editor.ts";
import { say } from "../state.ts";
import { t, type Key } from "../i18n.ts";
import {
  ITEM_ID, SERIES_KINDS, archFlow, archFrom, cellFrom, exprProblem, layersProblem, numsText, parseNums, parsePoints, parseRows,
  pointsText, removeBlock, removeColumn, renameBlock, rowsText, seriesOf, swapColumns, texInfo, texProblem, texSources, toggleMember,
  withLayers, withTex,
} from "../science.ts";
import { Check, ItemTools, NumField, Select, SourceField, StringField, TextField, useLangs } from "./fields.tsx";

type SetProps = (props: Record<string, unknown>) => void;

const toneOptions = (): [Tone, string][] => TONES.map((x) => [x, t(`tone_${x}` as Key)]);
const swap = <X,>(a: X[], i: number, j: number): X[] => { const b = [...a]; [b[i], b[j]] = [b[j]!, b[i]!]; return b; };
const codes = (): string[] => useLangs().map((l) => l.code);
const T = (en: string, ar: string): Text => tx(en, ar, codes());
const STAGES = { landscape: [1280, 720], portrait: [720, 1280], square: [1080, 1080] } as const;
const stageSize = (): readonly [number, number] => STAGES[lesson.value?.manifest.stage ?? "landscape"];

/** The form for a science element's own fields (its box, colour and animation are the inspector's). */
export function ScienceForm({ el, set }: { el: Element; set: SetProps }) {
  switch (el.type) {
    case "math": return <MathForm key={el.id} el={el} set={set} />;
    case "plot": return <PlotForm key={el.id} el={el} set={set} />;
    case "net": return <NetForm key={el.id} el={el} set={set} />;
    case "arch": return <ArchForm key={el.id} el={el} set={set} />;
    case "table": return <TableForm key={el.id} el={el} set={set} />;
    default: return null;
  }
}

/* ---------- math ---------- */

function MathForm({ el, set }: { el: MathElement; set: SetProps }) {
  const langs = useLangs();
  const all = langs.map((l) => l.code);
  const src = texSources(el);
  const perLang = typeof el.tex !== "string";
  const texCheck = (v: string) => texProblem(v);
  const commit = (code: string, v: string) => {
    const tex: MathElement["tex"] = code === "" ? v : { ...(src as Record<string, string>), [code]: v };
    set(withTex(el, tex, all));
  };
  const parts = Object.values(src).map((s) => texInfo(s)).filter(Boolean) as { groups: number[]; words: string[] }[];
  const differ = new Set(parts.map((p) => p.groups.join(","))).size > 1;
  const used = new Set(parts.flatMap((p) => p.words));
  const words = el.words ?? {};
  const keys = [...new Set([...Object.keys(words), ...used])];
  const [newKey, setNewKey] = useState("");
  const saveWords = (w: Record<string, Text>) => set({ words: Object.keys(w).length ? w : null });
  return (
    <>
      <Check label={t("texPerLang")} value={perLang} onChange={(on) => {
        if (on) set({ tex: Object.fromEntries(all.map((c) => [c, src[""] ?? ""])) });
        else set({ tex: src[lang.value] ?? src[all[0]!] ?? Object.values(src)[0] ?? "" });
      }} />
      {perLang
        ? langs.map((l) => (
          <SourceField key={l.code} label={`${t("texSource")} (${l.code.toUpperCase()})`} lang={l.code} multiline rows={3}
            value={src[l.code] ?? ""} check={texCheck} onCommit={(v) => commit(l.code, v)} />
        ))
        : <SourceField label={t("texSource")} multiline rows={3} value={src[""] ?? ""} check={texCheck} onCommit={(v) => commit("", v)}
            hint={parts[0]?.groups.length ? `${t("texParts")}: ${parts[0].groups.join(", ")}` : t("texNoParts")} />}
      {differ ? <p class="f-hint warn" role="status">{t("texPartsDiffer")}</p> : null}
      <details class="f-help">
        <summary>{t("texHelp")}</summary>
        <p class="f-hint">{t("texHelpBody")}</p>
        <ul class="f-hint f-examples" dir="ltr">
          <li><code>{"\\frac{a}{b}  x^{2}  x_{1}  \\sqrt{x}  \\sum_{i=1}^{n} x_i"}</code></li>
          <li><code>{"\\alpha \\beta \\sigma \\theta \\nabla \\partial \\le \\ne \\to"}</code></li>
          <li><code>{"\\hat{y}  \\vec{w}  \\mathbf{W}  \\text{loss}  \\log  \\max_{x}"}</code></li>
          <li><code>{"\\left( … \\right)  \\begin{bmatrix} 1 & 0 \\\\ 0 & 1 \\end{bmatrix}"}</code></li>
          <li><code>{"\\begin{aligned} L &= (\\hat{y}-y)^2 \\\\ &= 2.4 \\end{aligned}"}</code></li>
          <li><code>{"\\g{1}{…}  \\c{accent}{…}  \\w{key}"}</code></li>
        </ul>
      </details>
      <div class="f-list">
        <div class="f-list-head"><span>{t("texWords")}</span></div>
        {!keys.length ? <p class="f-hint">{t("texWordsNone")}</p> : null}
        {keys.map((k) => (
          <div class="f-item" key={k}>
            <TextField label={`\\w{${k}}`} value={words[k]} hint={!(k in words) ? t("texWordMissing") : undefined}
              onCommit={(v) => { if (v) saveWords({ ...words, [k]: v }); }} />
            <ItemTools onRemove={!used.has(k) && k in words ? () => saveWords(Object.fromEntries(Object.entries(words).filter(([x]) => x !== k))) : undefined} />
          </div>
        ))}
        <form class="f-add" onSubmit={(e) => {
          e.preventDefault();
          if (!ITEM_ID.test(newKey) || newKey in words) return;
          saveWords({ ...words, [newKey]: Object.fromEntries(all.map((c) => [c, newKey])) });
          setNewKey("");
        }}>
          <label class="f-row"><span>{t("texNewWord")}</span>
            <input class="mono" dir="ltr" value={newKey} spellcheck={false} onInput={(e) => setNewKey((e.target as HTMLInputElement).value.trim())} /></label>
          <button type="submit" class="btn small" disabled={!ITEM_ID.test(newKey) || newKey in words}>+ {t("add")}</button>
        </form>
      </div>
      <div class="f-grid4">
        <NumField label={t("fSize")} value={el.size} min={12} max={200} placeholder="48" onCommit={(v) => set({ size: v ?? null })} />
        <Select label={t("fAlign")} value={el.align ?? "center"} options={[["start", t("start")], ["center", t("center")], ["end", t("end")]]} onChange={(v) => set({ align: v === "center" ? null : v })} />
      </div>
      <Check label={t("texArabic")} value={el.notation === "arabic"} onChange={(v) => set({ notation: v ? "arabic" : null })} />
      <p class="f-hint">{t("texArabicHint")}</p>
    </>
  );
}

/* ---------- plot ---------- */

const pointsCheck = (v: string) => {
  const p = parsePoints(v);
  return !p || !p.length ? { message: t("pointsBad") } : p.length > SCIENCE_LIMITS.points ? { message: t("tooMany").replace("{n}", String(SCIENCE_LIMITS.points)) } : null;
};
const numsCheck = (v: string) => (v.trim() && !parseNums(v) ? { message: t("numbersBad") } : null);

function PlotForm({ el, set }: { el: PlotElement; set: SetProps }) {
  const [nonce, setNonce] = useState(0);
  const frames = framesOf(el);
  const range = (k: "xr" | "yr", i: 0 | 1) => (
    <NumField key={`${k}${i}${nonce}`} label={t(`${k}${i}` as Key)} value={el[k][i]}
      onCommit={(v) => {
        if (v === undefined) { setNonce(nonce + 1); return; }
        const r: [number, number] = [el[k][0], el[k][1]];
        r[i] = v;
        if (r[0] < r[1]) set({ [k]: r });
        else { say(t("rangeOrder"), true); setNonce(nonce + 1); }
      }} />
  );
  const ticks = (k: "xTicks" | "yTicks", label: Key) => (
    <SourceField label={t(label)} value={numsText(el[k])} placeholder="−1, 0, 1" check={numsCheck}
      onCommit={(v) => { const n = parseNums(v); set({ [k]: n && n.length ? n.slice(0, 12) : null }); }} />
  );
  return (
    <>
      <div class="f-grid4">{range("xr", 0)}{range("xr", 1)}{range("yr", 0)}{range("yr", 1)}</div>
      <TextField label={t("xLabel")} value={el.xLabel} optional onCommit={(v) => set({ xLabel: v ?? null })} />
      <TextField label={t("yLabel")} value={el.yLabel} optional onCommit={(v) => set({ yLabel: v ?? null })} />
      <div class="f-grid2">{ticks("xTicks", "xTicks")}{ticks("yTicks", "yTicks")}</div>
      <Check label={t("plotGrid")} value={!!el.grid} onChange={(v) => set({ grid: v || null })} />
      {frames > 1 ? (
        <div class="f-grid4">
          <NumField label={t("frameShown")} value={el.frame} min={0} max={frames - 1} placeholder="0" onCommit={(v) => set({ frame: v ?? null })} />
          <p class="f-hint f-span">{t("framesHint").replace("{n}", String(frames))}</p>
        </div>
      ) : null}
      <SeriesList el={el} set={set} />
    </>
  );
}

function SeriesList({ el, set }: { el: PlotElement; set: SetProps }) {
  const series = el.series;
  const save = (s: PlotSeries[]) => set({ series: s });
  const kindName = (k: PlotSeries["kind"]): string => t(`series_${k}` as Key);
  return (
    <div class="f-list">
      <div class="f-list-head"><span>{t("plotSeries")}</span>
        <select class="f-add-select" aria-label={t("addSeries")} value="" disabled={series.length >= 8}
          onChange={(e) => {
            const k = (e.target as HTMLSelectElement).value as PlotSeries["kind"];
            (e.target as HTMLSelectElement).value = "";
            if (k) save([...series, seriesOf(k, el)]);
          }}>
          <option value="">+ {t("addSeries")}</option>
          {SERIES_KINDS.map((k) => <option key={k} value={k}>{kindName(k)}</option>)}
        </select>
      </div>
      {series.map((s, i) => {
        const put = (next: PlotSeries) => save(series.map((x, j) => (j === i ? next : x)));
        const patch = (p: Record<string, unknown>) => {
          const next = { ...s, ...p } as Record<string, unknown>;
          for (const [k, v] of Object.entries(p)) if (v === undefined || v === false) delete next[k];
          put(next as unknown as PlotSeries);
        };
        const sx = s as { tone?: Tone; dash?: boolean; label?: Text };
        return (
          <div class="f-item" key={i}>
            <div class="f-grid">
              <div class="f-grid4">
                <Select label={`${i + 1}. ${t("fKind")}`} value={s.kind} options={SERIES_KINDS.map((k) => [k, kindName(k)])}
                  onChange={(k) => { if (k !== s.kind) put(seriesOf(k, el, s)); }} />
                {s.kind !== "heat" ? <Select label={t("fTone")} value={sx.tone} options={toneOptions()} empty={t("auto")} onChange={(v) => patch({ tone: v || undefined })} /> : null}
                {s.kind !== "heat" && s.kind !== "marker" ? <Check label={t("fDash")} value={!!sx.dash} onChange={(v) => patch({ dash: v })} /> : null}
              </div>
              <SeriesFields s={s} patch={patch} />
              {s.kind !== "heat" ? <TextField label={t("fLabel")} value={sx.label} optional onCommit={(v) => patch({ label: v })} /> : null}
            </div>
            <ItemTools
              onUp={i > 0 ? () => save(swap(series, i, i - 1)) : undefined}
              onDown={i < series.length - 1 ? () => save(swap(series, i, i + 1)) : undefined}
              onRemove={series.length > 1 ? () => save(series.filter((_, j) => j !== i)) : undefined} />
          </div>
        );
      })}
      <p class="f-hint">{t("focusSeriesHint")}</p>
    </div>
  );
}

function SeriesFields({ s, patch }: { s: PlotSeries; patch: (p: Record<string, unknown>) => void }) {
  switch (s.kind) {
    case "fn":
      return <>
        <SourceField label="y =" value={s.fn} check={exprProblem} onCommit={(v) => patch({ fn: v })} hint={t("fnHint")} />
        <SourceField label={t("fnParams")} value={rowsText(s.params)} placeholder="1, 0; 2, -1"
          check={(v) => { if (!v.trim()) return null; const r = parseRows(v); return !r || r.some((x) => x.length > 4) ? { message: t("paramsBad") } : r.length > SCIENCE_LIMITS.frames ? { message: t("tooMany").replace("{n}", String(SCIENCE_LIMITS.frames)) } : null; }}
          onCommit={(v) => { const r = parseRows(v); patch({ params: r && r.length ? r : undefined }); }} hint={t("fnParamsHint")} />
      </>;
    case "line": case "area": case "dots":
      return <>
        {s.frames ? (
          <div class="f-note">
            <p class="f-hint">{t("seriesFrames").replace("{n}", String(s.frames.length)).replace("{m}", String(s.frames[0]?.length ?? 0))}</p>
            <button type="button" class="link" onClick={() => patch({ pts: s.frames![s.frames!.length - 1], frames: undefined, clsFrames: undefined })}>{t("useFixedPoints")}</button>
          </div>
        ) : (
          <SourceField label={t("points")} multiline rows={2} value={pointsText(s.pts)} placeholder="0, 1; 1, 2; 2, 1.5" check={pointsCheck}
            onCommit={(v) => { const p = parsePoints(v)!; const cls = s.cls && s.cls.length === p.length ? s.cls : undefined; patch({ pts: p, cls }); }} hint={t("pointsHint")} />
        )}
        {s.kind === "dots" && !s.clsFrames ? (
          <SourceField label={t("dotClasses")} value={numsText(s.cls)} placeholder="0, 1, 1, 0"
            check={(v) => {
              if (!v.trim()) return null;
              const n = parseNums(v);
              const len = s.pts?.length ?? s.frames?.[0]?.length ?? 0;
              return !n || !n.every((c) => Number.isInteger(c) && c >= 0 && c <= 3) ? { message: t("classesBad") } : n.length !== len ? { message: t("classesCount").replace("{n}", String(len)) } : null;
            }}
            onCommit={(v) => { const n = parseNums(v); patch({ cls: n && n.length ? n : undefined }); }} hint={t("dotClassesHint")} />
        ) : null}
      </>;
    case "marker":
      return <>
        <SourceField label={t("markerPath")} multiline rows={2} value={pointsText(s.pts)} check={pointsCheck} onCommit={(v) => patch({ pts: parsePoints(v)! })} hint={t("markerHint")} />
        <Check label={t("markerTrail")} value={!!s.trail} onChange={(v) => patch({ trail: v })} />
      </>;
    case "hline": case "vline":
      return <NumField label={s.kind === "hline" ? t("atY") : t("atX")} value={s.at} onCommit={(v) => { if (v !== undefined) patch({ at: v }); }} />;
    case "heat":
      return <>
        {s.frames ? <p class="f-hint">{t("heatFrames").replace("{n}", String(s.frames.length)).replace("{r}", String(s.frames[0]?.length ?? 0)).replace("{c}", String(s.frames[0]?.[0]?.length ?? 0))}</p> : (
          <SourceField label={t("heatGrid")} multiline rows={3} value={rowsText(s.grid)} placeholder="0, 0, 1; 0, 1, 1; 1, 1, 1"
            check={(v) => {
              const r = parseRows(v);
              const ok = r && r.length <= SCIENCE_LIMITS.heat && r.every((x) => x.length === r[0]!.length && x.length <= SCIENCE_LIMITS.heat && x.every((c) => (s.scale ? c >= 0 && c <= 1 : Number.isInteger(c) && c >= 0 && c <= 3)));
              return ok ? null : { message: s.scale ? t("heatBadScale") : t("heatBad") };
            }}
            onCommit={(v) => patch({ grid: parseRows(v)! })} hint={t("heatHint")} />
        )}
        <Check label={t("heatScale")} value={!!s.scale} onChange={(v) => patch({ scale: v })} />
      </>;
  }
}

/* ---------- network ---------- */

function NetForm({ el, set }: { el: NetElement; set: SetProps }) {
  const frames = framesOf(el);
  const deep = el.form === "deep";
  const lb = el.labels ?? {};
  const saveLabels = (next: NonNullable<NetElement["labels"]>) => {
    const clean = Object.fromEntries(Object.entries(next).filter(([, v]) => v !== undefined));
    set({ labels: Object.keys(clean).length ? clean : null });
  };
  const L = el.layers;
  const lists: { k: "in" | "out" | "layers"; label: Key; n: number; make: (i: number) => Text }[] = [
    ...(deep ? [] : [
      { k: "in" as const, label: "netNameInputs" as Key, n: L[0]!, make: (i: number) => `x${i + 1}` },
      { k: "out" as const, label: "netNameOutputs" as Key, n: L[L.length - 1]!, make: (i: number) => (L[L.length - 1] === 1 ? "y" : `y${i + 1}`) },
    ]),
    { k: "layers", label: "netNameLayers", n: L.length, make: (i) => (i === 0 ? T("Inputs", "المدخلات") : i === L.length - 1 ? T("Output", "المخرج") : T(`Hidden ${i}`, `مخفية ${i}`)) },
  ];
  return (
    <>
      <Check label={t("netDeep")} value={deep} onChange={(on) => set(on
        ? { form: "deep", weights: null, acts: null, values: null, labels: lb.layers ? { layers: lb.layers } : null }
        : { form: null })} />
      {deep ? <p class="f-hint">{t("netDeepHint")}</p> : null}
      <SourceField label={t("netLayers")} value={L.join(", ")} placeholder={deep ? "784, 128, 64, 10" : "2, 4, 1"}
        check={(v) => { const p = layersProblem(parseNums(v), deep); return p ? { message: t(p) } : null; }}
        onCommit={(v) => set(withLayers(el, parseNums(v)!))}
        hint={el.weights ? t("netLayersClears") : t("netLayersHint")} />
      <p class="f-hint">{el.weights ? t("netTrained").replace("{n}", String(frames)) : t("netUntrained")}</p>
      {lists.map(({ k, label, n, make }) => {
        const list = lb[k];
        return (
          <div class="f-list" key={k}>
            <Check label={t(label)} value={!!list} onChange={(on) => saveLabels({ ...lb, [k]: on ? Array.from({ length: n }, (_, i) => list?.[i] ?? make(i)) : undefined })} />
            {list ? list.map((x, i) => (
              <TextField key={i} label={`${i + 1}`} value={x} onCommit={(v) => { if (v) saveLabels({ ...lb, [k]: list.map((y, j) => (j === i ? v : y)) }); }} />
            )) : null}
          </div>
        );
      })}
      <Check label={t("netValues")} value={!!el.values} onChange={(v) => set({ values: v || null })} />
      {frames > 1 ? (
        <div class="f-grid4">
          <NumField label={t("frameShown")} value={el.frame} min={0} max={frames - 1} placeholder="0" onCommit={(v) => set({ frame: v ?? null })} />
          <p class="f-hint f-span">{t("framesHint").replace("{n}", String(frames))}</p>
        </div>
      ) : null}
    </>
  );
}

/* ---------- architecture ---------- */

function ArchForm({ el, set }: { el: ArchElement; set: SetProps }) {
  const [preset, setPreset] = useState<ArchPreset | undefined>(undefined);
  const all = codes();
  const blocks = el.blocks;
  const ids: [string, string][] = blocks.map((b) => [b.id, `${b.id} (${pick(b.label, lang.value) || b.kind})`]);
  const parts = (p: { blocks?: ArchBlock[]; edges?: ArchElement["edges"]; groups?: ArchElement["groups"] }) =>
    set({ ...p, ...("groups" in p ? { groups: p.groups && p.groups.length ? p.groups : null } : {}) });
  const saveBlocks = (b: ArchBlock[]) => set({ blocks: b });
  const saveEdges = (e: ArchElement["edges"]) => set({ edges: e });
  const groups = el.groups ?? [];
  const saveGroups = (g: NonNullable<ArchElement["groups"]>) => set({ groups: g.length ? g : null });
  const fill = () => {
    if (!preset) return;
    const [w, h] = stageSize();
    const a = archFrom(preset, { id: el.id, x: el.x, y: el.y, w: el.w ?? 900, h: el.h ?? 400 }, all);
    const flow = el.flow ?? archFlow({ w, h }, a.blocks.length);
    set({ blocks: a.blocks, edges: a.edges, groups: a.groups ?? null, flow: flow ?? null });
  };
  return (
    <>
      <div class="f-add">
        <Select label={t("archPreset")} value={preset} options={ARCH_PRESETS.map((p) => [p, t(`arch_${p}` as Key)])} empty={t("archPick")} onChange={(v) => setPreset(v || undefined)} />
        <button type="button" class="btn small" disabled={!preset} onClick={fill}>{t("archFill")}</button>
      </div>
      <p class="f-hint">{t("archFillHint")}</p>
      <Select label={t("archFlow")} value={el.flow ?? "right"} options={[["right", t("flowRight")], ["down", t("flowDown")], ["up", t("flowUp")]]}
        onChange={(v) => set({ flow: v === "right" ? null : v })} />

      <div class="f-list">
        <div class="f-list-head"><span>{t("archBlocks")}</span>
          <button type="button" class="link" disabled={blocks.length >= SCIENCE_LIMITS.blocks}
            onClick={() => saveBlocks([...blocks, { id: freeId("block", blocks.map((b) => b.id)), kind: "box", label: T("New block", "كتلة جديدة") }])}>+ {t("add")}</button>
        </div>
        {blocks.map((b, i) => (
          <div class="f-item" key={b.id}>
            <div class="f-grid">
              <div class="f-grid4">
                <StringField label={`${i + 1}. ${t("blockId")}`} mono value={b.id} onCommit={(v) => {
                  if (v === b.id) return;
                  if (!ITEM_ID.test(v) || blocks.some((x) => x.id === v)) { say(t("blockIdBad"), true); return; }
                  parts(renameBlock(el, b.id, v));
                }} />
                <Select label={t("fKind")} value={b.kind} options={ARCH_KINDS.map((k) => [k, t(`ak_${k}` as Key)] as [ArchKind, string])}
                  onChange={(v) => saveBlocks(blocks.map((x, j) => (j === i ? { ...x, kind: v } : x)))} />
                <Select label={t("fTone")} value={b.tone} options={toneOptions()} empty={t("auto")}
                  onChange={(v) => saveBlocks(blocks.map((x, j) => (j === i ? (v ? { ...x, tone: v } : (({ tone: _t, ...r }) => r)(x)) : x)))} />
              </div>
              <TextField label={t("fLabel")} value={b.label} onCommit={(v) => { if (v) saveBlocks(blocks.map((x, j) => (j === i ? { ...x, label: v } : x))); }} />
              <TextField label={t("blockNote")} value={b.note} optional
                onCommit={(v) => saveBlocks(blocks.map((x, j) => (j === i ? (v ? { ...x, note: v } : (({ note: _n, ...r }) => r)(x)) : x)))} />
            </div>
            <ItemTools
              onUp={i > 0 ? () => saveBlocks(swap(blocks, i, i - 1)) : undefined}
              onDown={i < blocks.length - 1 ? () => saveBlocks(swap(blocks, i, i + 1)) : undefined}
              onRemove={blocks.length > 1 ? () => parts(removeBlock(el, b.id)) : undefined} />
          </div>
        ))}
        <p class="f-hint">{t("focusBlocksHint")}</p>
      </div>

      <div class="f-list">
        <div class="f-list-head"><span>{t("fEdges")}</span>
          <button type="button" class="link" disabled={blocks.length < 2}
            onClick={() => saveEdges([...el.edges, { from: blocks[blocks.length - 2]!.id, to: blocks[blocks.length - 1]!.id }])}>+ {t("add")}</button>
        </div>
        {el.edges.map((e, i) => (
          <div class="f-item" key={i}>
            <div class="f-grid">
              <div class="f-grid2">
                <Select label={t("fFrom")} value={e.from} options={ids} onChange={(v) => { if (v !== e.to) saveEdges(el.edges.map((x, j) => (j === i ? { ...x, from: v } : x))); else say(t("edgeSelf"), true); }} />
                <Select label={t("fTo")} value={e.to} options={ids} onChange={(v) => { if (v !== e.from) saveEdges(el.edges.map((x, j) => (j === i ? { ...x, to: v } : x))); else say(t("edgeSelf"), true); }} />
              </div>
              <TextField label={t("fLabel")} value={e.label} optional
                onCommit={(v) => saveEdges(el.edges.map((x, j) => (j === i ? (v ? { ...x, label: v } : (({ label: _l, ...r }) => r)(x)) : x)))} />
              <Check label={t("edgeSkip")} value={!!e.skip} onChange={(v) => saveEdges(el.edges.map((x, j) => (j === i ? (v ? { ...x, skip: true } : (({ skip: _s, ...r }) => r)(x)) : x)))} />
            </div>
            <ItemTools onRemove={() => saveEdges(el.edges.filter((_, j) => j !== i))} />
          </div>
        ))}
        <p class="f-hint">{t("edgeSkipHint")}</p>
      </div>

      <div class="f-list">
        <div class="f-list-head"><span>{t("archGroups")}</span>
          <button type="button" class="link" onClick={() => saveGroups([...groups, { id: freeId("group", groups.map((g) => g.id)), label: T("Block", "كتلة"), blocks: [] }])}>+ {t("add")}</button>
        </div>
        {groups.map((g, i) => (
          <div class="f-item" key={g.id}>
            <div class="f-grid">
              <TextField label={t("fLabel")} value={g.label} optional
                onCommit={(v) => saveGroups(groups.map((x, j) => (j === i ? (v ? { ...x, label: v } : (({ label: _l, ...r }) => r)(x)) : x)))} />
              <NumField label={t("groupRepeat")} value={g.repeat} min={2} max={1000} placeholder="—"
                onCommit={(v) => saveGroups(groups.map((x, j) => (j === i ? (v !== undefined && v >= 2 ? { ...x, repeat: Math.round(v) } : (({ repeat: _r, ...r }) => r)(x)) : x)))} />
              <div class="chips" role="group" aria-label={t("groupBlocks")}>
                {blocks.map((b) => (
                  <button type="button" key={b.id} class="chip" aria-pressed={g.blocks.includes(b.id)}
                    onClick={() => saveGroups(toggleMember(el, g.id, b.id))}>{b.id}</button>
                ))}
              </div>
              {!g.blocks.length ? <p class="f-hint warn">{t("groupEmpty")}</p> : null}
            </div>
            <ItemTools onRemove={() => saveGroups(groups.filter((_, j) => j !== i))} />
          </div>
        ))}
      </div>
    </>
  );
}

/* ---------- table ---------- */

function CellField({ label, value, onCommit }: { label: string; value: string | number | Text; onCommit: (v: string | number | Text) => void }) {
  const langs = useLangs();
  const all = langs.map((l) => l.code);
  const asText = (code: string): string => (typeof value === "number" ? String(value) : typeof value === "string" ? value : value[code] ?? "");
  return (
    <fieldset class="f-cell">
      <legend class="sr">{label}</legend>
      {langs.map((l) => (
        <input key={`${l.code}${JSON.stringify(value)}`} aria-label={`${label} ${l.name}`} dir={l.dir} lang={l.code} defaultValue={asText(l.code)}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
          onBlur={(e) => {
            const v = (e.target as HTMLInputElement).value;
            if (v.trim() === asText(l.code).trim()) return;
            const next = cellFrom({ ...Object.fromEntries(all.map((c) => [c, asText(c)])), [l.code]: v }, all);
            onCommit(next);
          }} />
      ))}
    </fieldset>
  );
}

function TableForm({ el, set }: { el: TableElement; set: SetProps }) {
  const cols = el.cols;
  const rows = el.rows;
  const ltr = el.ltr ?? [];
  const saveRows = (r: TableElement["rows"]) => set({ rows: r });
  return (
    <>
      <Check label={t("tableHeat")} value={!!el.heat} onChange={(v) => set({ heat: v || null })} />
      <div class="f-list">
        <div class="f-list-head"><span>{t("tableCols")}</span>
          <button type="button" class="link" disabled={cols.length >= SCIENCE_LIMITS.cols}
            onClick={() => set({ cols: [...cols, T("Column", "عمود")], rows: rows.map((r) => [...r, ""]) })}>+ {t("add")}</button>
        </div>
        {cols.map((c, k) => (
          <div class="f-item" key={k}>
            <div class="f-grid">
              <TextField label={`${t("tableCol")} ${k + 1}`} value={c} onCommit={(v) => { if (v) set({ cols: cols.map((x, j) => (j === k ? v : x)) }); }} />
              <Check label={t("tableLtr")} value={ltr.includes(k)} onChange={(v) => { const n = v ? [...ltr, k].sort((a, b) => a - b) : ltr.filter((i) => i !== k); set({ ltr: n.length ? n : null }); }} />
            </div>
            <ItemTools
              onUp={k > 0 ? () => set(swapColumns(el, k, k - 1)) : undefined}
              onDown={k < cols.length - 1 ? () => set(swapColumns(el, k, k + 1)) : undefined}
              onRemove={cols.length > 1 ? () => set(removeColumn(el, k)) : undefined} />
          </div>
        ))}
      </div>
      <div class="f-list">
        <div class="f-list-head"><span>{t("tableRows")}</span>
          <button type="button" class="link" disabled={rows.length >= SCIENCE_LIMITS.rows} onClick={() => saveRows([...rows, cols.map(() => "")])}>+ {t("add")}</button>
        </div>
        {rows.map((r, i) => (
          <div class="f-item" key={i}>
            <div class="f-grid">
              <span class="f-row-head">{t("tableRow")} {i + 1}</span>
              <div class="f-cells">
                {cols.map((c, k) => (
                  <CellField key={k} label={`${t("tableRow")} ${i + 1}, ${pick(c, lang.value) || `${t("tableCol")} ${k + 1}`}`} value={r[k] && typeof r[k] === "object" && "v" in r[k] ? r[k].v : r[k] ?? ""}
                    onCommit={(v) => saveRows(rows.map((x, j) => (j === i ? x.map((y, m) => (m === k ? v : y)) : x)))} />
                ))}
              </div>
            </div>
            <ItemTools
              onUp={i > 0 ? () => saveRows(swap(rows, i, i - 1)) : undefined}
              onDown={i < rows.length - 1 ? () => saveRows(swap(rows, i, i + 1)) : undefined}
              onRemove={rows.length > 1 ? () => saveRows(rows.filter((_, j) => j !== i)) : undefined} />
          </div>
        ))}
        <p class="f-hint">{t("tableHint")}</p>
      </div>
      <NumField label={t("fSize")} value={el.size} min={12} max={80} placeholder="30" onCommit={(v) => set({ size: v ?? null })} />
    </>
  );
}
