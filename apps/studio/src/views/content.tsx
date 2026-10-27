import type { Check as QuizCheck, Element, FlowEdge, FlowNode, IconName, MessageFlag, Scene, TemplateId, Text, Tone } from "@lessonstudio/spec";
import { ICONS, TONES } from "@lessonstudio/spec";
import type { Op } from "@lessonstudio/ops";
import { edit, elementIds, freeId, lesson } from "../editor.ts";
import { t, type Key } from "../i18n.ts";
import { Check, ItemTools, NumField, Select, StringField, TextField } from "./fields.tsx";

const STAGES = { landscape: [1280, 720], portrait: [720, 1280], square: [1080, 1080] } as const;
export const designSize = (): readonly [number, number] => STAGES[lesson.value?.manifest.stage ?? "landscape"];

/** A text in the lesson's languages, from English and Arabic wording (other languages start from the English). */
export function T(en: string, ar: string): Text {
  const langs = lesson.value?.manifest.languages.map((l) => l.code) ?? ["en"];
  return Object.fromEntries(langs.map((c) => [c, c === "ar" ? ar : en]));
}
const narration = () => T("Narration for this scene.", "نص الراوي لهذا المشهد.");

export const TEMPLATE_NAMES: Record<TemplateId, Key> = {
  "title-hook": "tplTitle", steps: "tplSteps", flow: "tplFlow", "message-mock": "tplMessage", quiz: "tplQuiz", summary: "tplSummary", canvas: "tplCanvas",
};

/** A new scene of a template, with placeholder content in every language. */
export function newScene(template: TemplateId, id: string): Scene {
  const base = { id, narration: narration() as Record<string, string> };
  switch (template) {
    case "title-hook": return { ...base, template, content: { title: T("Title", "العنوان"), hook: T("Why it matters", "لماذا يهم ذلك") } };
    case "steps": return { ...base, template, content: { title: T("How it works", "كيف يعمل"), steps: [T("First step", "الخطوة الأولى"), T("Second step", "الخطوة الثانية")] } };
    case "flow": return {
      ...base, template,
      content: { nodes: [{ id: "a", label: T("Start", "البداية"), icon: "user" }, { id: "b", label: T("End", "النهاية"), icon: "server" }], edges: [{ from: "a", to: "b" }] },
    };
    case "message-mock": return { ...base, template, content: { kind: "sms", from: T("Unknown sender", "مرسل مجهول"), lines: [T("Message text", "نص الرسالة")] } };
    case "quiz": return {
      ...base, template, content: {},
      check: { type: "single-choice", id: `${id}-q`, prompt: T("The question", "السؤال"), options: [{ id: "a", text: T("Right answer", "الإجابة الصحيحة") }, { id: "b", text: T("Wrong answer", "إجابة خاطئة") }], answer: "a" },
    };
    case "summary": return { ...base, template, content: { title: T("Remember", "تذكّر"), points: [T("Key point", "فكرة أساسية")] } };
    case "canvas": {
      const [w] = designSize();
      return { ...base, template, content: { elements: [{ id: "title", type: "text", x: 80, y: 60, w: w - 160, size: 48, weight: 800, text: T("Title", "العنوان") }] } };
    }
  }
}

/* ---------- template content ---------- */

function setPath(scene: Scene, path: string, value: unknown): void {
  edit(value === undefined ? [{ op: "remove", scene: scene.id, path }] : [{ op: "set", scene: scene.id, path, value }]);
}

/** Edits a list as a whole (add, remove, reorder). */
function TextList(p: { scene: Scene; label: string; path: string; items: Text[]; min: number; max: number; add: () => Text }) {
  const save = (items: Text[]) => setPath(p.scene, p.path, items);
  return (
    <div class="f-list">
      <div class="f-list-head"><span>{p.label}</span>
        <button type="button" class="link" disabled={p.items.length >= p.max} onClick={() => save([...p.items, p.add()])}>+ {t("add")}</button>
      </div>
      {p.items.map((it, i) => (
        <div class="f-item" key={i}>
          <TextField label={`${i + 1}`} value={it} onCommit={(v) => v && save(p.items.map((x, j) => (j === i ? v : x)))} />
          <ItemTools
            onUp={i > 0 ? () => save(swap(p.items, i, i - 1)) : undefined}
            onDown={i < p.items.length - 1 ? () => save(swap(p.items, i, i + 1)) : undefined}
            onRemove={p.items.length > p.min ? () => save(p.items.filter((_, j) => j !== i)) : undefined} />
        </div>
      ))}
    </div>
  );
}
const swap = <X,>(a: X[], i: number, j: number): X[] => { const b = [...a]; [b[i], b[j]] = [b[j]!, b[i]!]; return b; };
const iconOptions = (): [IconName, string][] => ICONS.map((i) => [i, i]);

export function TemplateForm({ scene }: { scene: Scene }) {
  const c = scene.content as unknown as Record<string, unknown>;
  const text = (key: string, label: Key, optional = true, multiline = false) => (
    <TextField label={t(label)} value={c[key] as Text | undefined} optional={optional} multiline={multiline} onCommit={(v) => setPath(scene, `/content/${key}`, v)} />
  );
  switch (scene.template) {
    case "title-hook":
      return <>{text("kicker", "fKicker")}{text("title", "fTitle", false)}{text("hook", "fHook")}
        <Select label={t("fIcon")} value={scene.content.icon} options={iconOptions()} empty={t("none")} onChange={(v) => setPath(scene, "/content/icon", v || undefined)} /></>;
    case "steps":
      return <>{text("title", "fTitle")}
        <TextList scene={scene} label={t("fSteps")} path="/content/steps" items={scene.content.steps} min={1} max={8} add={() => T("New step", "خطوة جديدة")} /></>;
    case "summary":
      return <>{text("title", "fTitle")}
        <TextList scene={scene} label={t("fPoints")} path="/content/points" items={scene.content.points} min={1} max={6} add={() => T("Key point", "فكرة أساسية")} />
        {text("takeaway", "fTakeaway")}</>;
    case "message-mock":
      return <>
        <Select label={t("fKind")} value={scene.content.kind} options={[["sms", "SMS"], ["chat", t("chat")], ["email", t("email")]]} onChange={(v) => setPath(scene, "/content/kind", v)} />
        {text("from", "fFrom", false)}{text("subject", "fSubject")}
        <TextList scene={scene} label={t("fLines")} path="/content/lines" items={scene.content.lines} min={1} max={8} add={() => T("Another line", "سطر آخر")} />
        {text("link", "fLink")}
        <Flags scene={scene as Extract<Scene, { template: "message-mock" }>} />
      </>;
    case "flow":
      return <>{text("title", "fTitle")}<FlowForm scene={scene as Extract<Scene, { template: "flow" }>} /></>;
    case "quiz":
      return <>{text("title", "fTitle")}<QuizForm scene={scene} /></>;
    case "canvas":
      return <p class="f-hint">{t("canvasHint")}</p>;
  }
}

function FlowForm({ scene }: { scene: Extract<Scene, { template: "flow" }> }) {
  const { nodes, edges } = scene.content;
  const saveNodes = (n: FlowNode[]) => setPath(scene, "/content/nodes", n);
  const saveEdges = (e: FlowEdge[]) => setPath(scene, "/content/edges", e);
  const ids: [string, string][] = nodes.map((n) => [n.id, n.id]);
  return (
    <>
      <div class="f-list">
        <div class="f-list-head"><span>{t("fNodes")}</span>
          <button type="button" class="link" disabled={nodes.length >= 8} onClick={() => saveNodes([...nodes, { id: freeId("node", nodes.map((n) => n.id)), label: T("New box", "مربع جديد") }])}>+ {t("add")}</button>
        </div>
        {nodes.map((n, i) => (
          <div class="f-item" key={n.id}>
            <div class="f-grid">
              <TextField label={n.id} value={n.label} onCommit={(v) => v && saveNodes(nodes.map((x, j) => (j === i ? { ...x, label: v } : x)))} />
              <Select label={t("fIcon")} value={n.icon} options={iconOptions()} empty={t("none")} onChange={(v) => saveNodes(nodes.map((x, j) => (j === i ? { ...x, icon: v } : x)))} />
              <Select label={t("fTone")} value={n.tone ?? "neutral"} options={[["neutral", t("neutral")], ["trusted", t("trusted")], ["system", t("system")], ["danger", t("danger")]]}
                onChange={(v) => saveNodes(nodes.map((x, j) => (j === i ? { ...x, tone: v } : x)))} />
            </div>
            <ItemTools onRemove={nodes.length > 2 ? () => edit([
              { op: "set", scene: scene.id, path: "/content/edges", value: edges.filter((e) => e.from !== n.id && e.to !== n.id) },
              { op: "set", scene: scene.id, path: "/content/nodes", value: nodes.filter((_, j) => j !== i) },
            ]) : undefined} />
          </div>
        ))}
      </div>
      <div class="f-list">
        <div class="f-list-head"><span>{t("fEdges")}</span>
          <button type="button" class="link" disabled={edges.length >= 12} onClick={() => saveEdges([...edges, { from: nodes[0]!.id, to: nodes[nodes.length - 1]!.id }])}>+ {t("add")}</button>
        </div>
        {edges.map((e, i) => (
          <div class="f-item" key={i}>
            <div class="f-grid">
              <Select label={t("fFrom")} value={e.from} options={ids} onChange={(v) => saveEdges(edges.map((x, j) => (j === i ? { ...x, from: v } : x)))} />
              <Select label={t("fTo")} value={e.to} options={ids} onChange={(v) => saveEdges(edges.map((x, j) => (j === i ? { ...x, to: v } : x)))} />
              <TextField label={t("fLabel")} value={e.label} optional onCommit={(v) => saveEdges(edges.map((x, j) => (j === i ? (v ? { ...x, label: v } : { from: x.from, to: x.to }) : x)))} />
            </div>
            <ItemTools onRemove={edges.length > 1 ? () => saveEdges(edges.filter((_, j) => j !== i)) : undefined} />
          </div>
        ))}
      </div>
    </>
  );
}

function Flags({ scene }: { scene: Extract<Scene, { template: "message-mock" }> }) {
  const flags = scene.content.flags ?? [];
  const save = (f: MessageFlag[]) => setPath(scene, "/content/flags", f.length ? f : undefined);
  const lines: [string, string][] = [["from", t("fFrom")], ...scene.content.lines.map((_, i) => [String(i), `${t("line")} ${i + 1}`] as [string, string]), ...(scene.content.link ? [["link", t("fLink")] as [string, string]] : [])];
  return (
    <div class="f-list">
      <div class="f-list-head"><span>{t("fFlags")}</span>
        <button type="button" class="link" onClick={() => save([...flags, { id: freeId("flag", flags.map((f) => f.id)), line: 0, label: T("Warning sign", "علامة تحذير") }])}>+ {t("add")}</button>
      </div>
      {flags.map((f, i) => (
        <div class="f-item" key={f.id}>
          <div class="f-grid">
            <Select label={t("fLine")} value={String(f.line)} options={lines} onChange={(v) => save(flags.map((x, j) => (j === i ? { ...x, line: v === "from" || v === "link" ? v : Number(v) } : x)))} />
            <TextField label={f.id} value={f.label} onCommit={(v) => v && save(flags.map((x, j) => (j === i ? { ...x, label: v } : x)))} />
          </div>
          <ItemTools onRemove={() => save(flags.filter((_, j) => j !== i))} />
        </div>
      ))}
    </div>
  );
}

/** The quick check a scene asks when it ends (the quiz template needs one; any scene may have one). */
export function QuizForm({ scene }: { scene: Scene }) {
  const c = scene.check;
  if (!c) {
    return <button type="button" class="link" onClick={() => edit([{ op: "set", scene: scene.id, path: "/check", value: newScene("quiz", scene.id).check }])}>+ {t("addCheck")}</button>;
  }
  const save = (next: QuizCheck) => edit([{ op: "set", scene: scene.id, path: "/check", value: next }]);
  return (
    <div class="f-list">
      <TextField label={t("fQuestion")} value={c.prompt} onCommit={(v) => v && save({ ...c, prompt: v })} />
      {c.options.map((o, i) => (
        <div class="f-item" key={o.id}>
          <TextField label={`${t("option")} ${o.id}`} value={o.text} onCommit={(v) => v && save({ ...c, options: c.options.map((x, j) => (j === i ? { ...x, text: v } : x)) })} />
          <ItemTools onRemove={c.options.length > 2 ? () => save({ ...c, options: c.options.filter((_, j) => j !== i), answer: c.answer === o.id ? c.options.find((x) => x.id !== o.id)!.id : c.answer }) : undefined} />
        </div>
      ))}
      <button type="button" class="link" disabled={c.options.length >= 5}
        onClick={() => save({ ...c, options: [...c.options, { id: freeId(String.fromCharCode(97 + c.options.length), c.options.map((o) => o.id)), text: T("Another answer", "إجابة أخرى") }] })}>+ {t("option")}</button>
      <Select label={t("fAnswer")} value={c.answer} options={c.options.map((o) => [o.id, o.id])} onChange={(v) => save({ ...c, answer: v })} />
      <TextField label={t("fExplain")} value={c.explain} optional multiline onCommit={(v) => save(v ? { ...c, explain: v } : (({ explain: _e, ...rest }) => rest)(c))} />
      {scene.template !== "quiz" ? <button type="button" class="link danger" onClick={() => edit([{ op: "remove", scene: scene.id, path: "/check" }])}>{t("removeCheck")}</button> : null}
    </div>
  );
}

/* ---------- free elements ---------- */

export const ELEMENT_KINDS: { key: string; label: Key; make: (id: string) => Element }[] = [
  { key: "text", label: "elText", make: (id) => ({ id, type: "text", x: 200, y: 300, w: 600, size: 44, weight: 700, text: T("New text", "نص جديد") }) },
  { key: "rect", label: "elBox", make: (id) => ({ id, type: "shape", shape: "rect", x: 440, y: 220, w: 400, h: 260, stroke: "accent", strokeWidth: 5, radius: 18 }) },
  { key: "ellipse", label: "elCircle", make: (id) => ({ id, type: "shape", shape: "ellipse", x: 540, y: 260, w: 200, h: 200, fill: "surface", stroke: "accent", strokeWidth: 5 }) },
  { key: "arrow", label: "elArrow", make: (id) => ({ id, type: "line", x: 400, y: 360, x2: 880, y2: 360, arrow: "end", strokeWidth: 6, tone: "muted" }) },
  { key: "icon", label: "elIcon", make: (id) => ({ id, type: "icon", icon: "spark", x: 580, y: 300, w: 120, h: 120, tone: "accent" }) },
  { key: "code", label: "elCode", make: (id) => ({ id, type: "code", x: 340, y: 240, w: 600, size: 26, code: "print(\"hello\")" }) },
  { key: "chart", label: "elChart", make: (id) => ({ id, type: "chart", kind: "bar", x: 340, y: 200, w: 600, h: 320, data: [3, 5, 8], tone: "accent" }) },
];

export function addElement(scene: Scene, kind: string): string | null {
  const k = ELEMENT_KINDS.find((x) => x.key === kind)!;
  const id = freeId(kind, elementIds(scene));
  return edit([{ op: "addElement", scene: scene.id, element: k.make(id) }]) ? id : null;
}

const toneOptions = (): [Tone, string][] => TONES.map((x) => [x, t(`tone_${x}` as Key)]);

export function ElementForm({ scene, el }: { scene: Scene; el: Element }) {
  const set = (props: Record<string, unknown>): void => { edit([{ op: "updateElement", scene: scene.id, element: el.id, props }]); };
  const n = (key: string, label: Key, o: { min?: number; max?: number; step?: number } = {}) => (
    <NumField label={t(label)} value={(el as unknown as Record<string, number | undefined>)[key]} {...o} onCommit={(v) => set({ [key]: v ?? null })} />
  );
  return (
    <>
      <div class="f-grid4">{n("x", "fX")}{n("y", "fY")}{el.type !== "line" ? <>{n("w", "fW", { min: 0 })}{n("h", "fH", { min: 0 })}</> : <>{n("x2", "fX2")}{n("y2", "fY2")}</>}</div>
      <div class="f-grid4">{n("rotate", "fRotate")}{n("scale", "fScale", { min: 0, step: 0.1 })}{n("opacity", "fOpacity", { min: 0, max: 1, step: 0.1 })}</div>
      <Select label={t("fTone")} value={el.tone} options={toneOptions()} empty={t("auto")} onChange={(v) => set({ tone: v || null })} />
      <Check label={t("fFixed")} value={!!el.fixed} onChange={(v) => set({ fixed: v || null })} />
      {el.type === "text" ? <>
        <TextField label={t("elText")} value={el.text} multiline onCommit={(v) => v && set({ text: v })} />
        <div class="f-grid4">{n("size", "fSize", { min: 8, max: 300 })}
          <Select label={t("fWeight")} value={el.weight ?? 700} options={[[400, "400"], [600, "600"], [700, "700"], [800, "800"]]} onChange={(v) => set({ weight: v })} />
          <Select label={t("fAlign")} value={el.align ?? "start"} options={[["start", t("start")], ["center", t("center")], ["end", t("end")]]} onChange={(v) => set({ align: v })} /></div>
      </> : null}
      {el.type === "shape" ? <>
        <Select label={t("fShape")} value={el.shape} options={[["rect", t("elBox")], ["ellipse", t("elCircle")], ["pill", t("pill")]]} onChange={(v) => set({ shape: v })} />
        <div class="f-grid4">
          <Select label={t("fFill")} value={el.fill} options={toneOptions()} empty={t("none")} onChange={(v) => set({ fill: v || null })} />
          <Select label={t("fStroke")} value={el.stroke} options={toneOptions()} empty={t("none")} onChange={(v) => set({ stroke: v || null })} />
          {n("strokeWidth", "fStrokeWidth", { min: 0, max: 40 })}{n("radius", "fRadius", { min: 0 })}
        </div>
      </> : null}
      {el.type === "line" ? <div class="f-grid4">
        <Select label={t("fArrow")} value={el.arrow ?? "none"} options={[["none", t("none")], ["end", t("arrowEnd")], ["both", t("arrowBoth")]]} onChange={(v) => set({ arrow: v })} />
        {n("strokeWidth", "fStrokeWidth", { min: 0, max: 40 })}
        <Check label={t("fDash")} value={!!el.dash} onChange={(v) => set({ dash: v || null })} />
      </div> : null}
      {el.type === "icon" ? <Select label={t("fIcon")} value={el.icon} options={iconOptions()} onChange={(v) => set({ icon: v })} /> : null}
      {el.type === "code" ? <>
        <label class="f-row"><span>{t("elCode")}</span>
          <textarea class="mono" dir="ltr" rows={6} value={el.code} onBlur={(e) => { const v = (e.target as HTMLTextAreaElement).value; if (v !== el.code) set({ code: v }); }} /></label>
        <StringField label={t("fHighlight")} value={(el.highlight ?? []).join(", ")} onCommit={(v) => set({ highlight: v.split(/[^0-9]+/).filter(Boolean).map(Number) })} />
        {n("size", "fSize", { min: 8, max: 300 })}
      </> : null}
      {el.type === "chart" ? <>
        <Select label={t("fKind")} value={el.kind} options={[["bar", t("bars")], ["line", t("lineChart")]]} onChange={(v) => set({ kind: v })} />
        <StringField label={t("fData")} value={el.data.join(", ")} onCommit={(v) => { const d = v.split(/[\s,،]+/).filter(Boolean).map(Number).filter(Number.isFinite); if (d.length) set({ data: d }); }} />
      </> : null}
      {el.type === "path" ? <StringField label="d" mono value={el.d} onCommit={(v) => set({ d: v })} /> : null}
    </>
  );
}

/** Operations that move or resize an element by a delta in design pixels. */
export function moveOps(scene: Scene, el: Element, dx: number, dy: number, dw = 0, dh = 0): Op[] {
  const r = (v: number) => Math.round(v);
  const props: Record<string, number> = {};
  if (dx || dy) {
    props.x = r(el.x + dx);
    props.y = r(el.y + dy);
    if (el.type === "line") { props.x2 = r(el.x2 + dx); props.y2 = r(el.y2 + dy); }
  }
  if (dw || dh) {
    if (el.type === "line") { props.x2 = r((props.x2 ?? el.x2) + dw); props.y2 = r((props.y2 ?? el.y2) + dh); }
    else { props.w = Math.max(8, r((el.w ?? 200) + dw)); props.h = Math.max(8, r((el.h ?? el.w ?? 100) + dh)); }
  }
  return [{ op: "updateElement", scene: scene.id, element: el.id, props }];
}
