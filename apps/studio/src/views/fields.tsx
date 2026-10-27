import { useEffect, useRef, useState } from "preact/hooks";
import type { ComponentChildren } from "preact";
import type { Text } from "@lessonstudio/spec";
import { lesson } from "../editor.ts";
import { t } from "../i18n.ts";

/** The lesson's languages: one input each for every text. */
export function useLangs() {
  return lesson.value?.manifest.languages ?? [];
}

let uid = 0;
const nextId = () => `f${++uid}`;

/** A text in every language of the lesson. Commits when the field loses focus (or on Enter, single line). */
export function TextField(p: { label: string; value: Text | undefined; onCommit: (v: Text | undefined) => void; multiline?: boolean; optional?: boolean; hint?: string; path?: string }) {
  const langs = useLangs();
  const asObj = (v: Text | undefined): Record<string, string> =>
    v === undefined ? {} : typeof v === "string" ? Object.fromEntries(langs.map((l) => [l.code, v])) : { ...v };
  const [draft, setDraft] = useState(asObj(p.value));
  const focused = useRef(false);
  useEffect(() => { if (!focused.current) setDraft(asObj(p.value)); }, [JSON.stringify(p.value), langs.length]);
  const commit = () => {
    focused.current = false;
    const filled = Object.fromEntries(Object.entries(draft).map(([k, v]) => [k, v.trim()]).filter(([, v]) => v !== ""));
    const next: Text | undefined = Object.keys(filled).length ? filled : undefined;
    if (JSON.stringify(next) !== JSON.stringify(p.value === undefined ? undefined : asObj(p.value))) p.onCommit(next);
  };
  return (
    <fieldset class="f-text" data-path={p.path}>
      <legend>{p.label}{p.optional ? <span class="f-opt"> {t("optional")}</span> : null}</legend>
      {langs.map((l) => {
        const id = `${p.label}-${l.code}`;
        const common = {
          id, value: draft[l.code] ?? "", dir: l.dir, lang: l.code,
          onFocus: () => { focused.current = true; },
          onInput: (e: Event) => setDraft({ ...draft, [l.code]: (e.target as HTMLInputElement).value }),
          onBlur: commit,
        };
        return (
          <label class="f-lang" key={l.code} for={id}>
            <span class="f-code" aria-label={l.name}>{l.code.toUpperCase()}</span>
            {p.multiline
              ? <textarea {...common} rows={3} />
              : <input {...common} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />}
          </label>
        );
      })}
      {p.hint ? <p class="f-hint">{p.hint}</p> : null}
    </fieldset>
  );
}

export function StringField(p: { label: string; value: string | undefined; onCommit: (v: string) => void; mono?: boolean; dir?: "ltr" | "rtl" }) {
  const [v, setV] = useState(p.value ?? "");
  useEffect(() => setV(p.value ?? ""), [p.value]);
  const id = useRef(nextId()).current;
  return (
    <label class="f-row" for={id}>
      <span>{p.label}</span>
      <input id={id} class={p.mono ? "mono" : undefined} dir={p.dir ?? "ltr"} value={v}
        onInput={(e) => setV((e.target as HTMLInputElement).value)}
        onBlur={() => { if (v !== (p.value ?? "")) p.onCommit(v); }}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
    </label>
  );
}

export function NumField(p: { label: string; value: number | undefined; onCommit: (v: number | undefined) => void; min?: number; max?: number; step?: number; placeholder?: string }) {
  const [v, setV] = useState(p.value === undefined ? "" : String(p.value));
  useEffect(() => setV(p.value === undefined ? "" : String(p.value)), [p.value]);
  const id = useRef(nextId()).current;
  const commit = () => {
    const n = v.trim() === "" ? undefined : Number(v);
    if (n !== undefined && !Number.isFinite(n)) { setV(p.value === undefined ? "" : String(p.value)); return; }
    if (n !== p.value) p.onCommit(n);
  };
  return (
    <label class="f-num" for={id}>
      <span>{p.label}</span>
      <input id={id} type="number" inputMode="decimal" dir="ltr" value={v} min={p.min} max={p.max} step={p.step ?? 1} placeholder={p.placeholder}
        onInput={(e) => setV((e.target as HTMLInputElement).value)} onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") commit(); }} />
    </label>
  );
}

export function Select<T extends string | number>(p: { label: string; value: T | undefined; options: [T, string][]; onChange: (v: T) => void; empty?: string }) {
  const id = useRef(nextId()).current;
  return (
    <label class="f-row" for={id}>
      <span>{p.label}</span>
      <select id={id} value={p.value === undefined ? "" : String(p.value)}
        onChange={(e) => {
          const raw = (e.target as HTMLSelectElement).value;
          const hit = p.options.find(([v]) => String(v) === raw);
          if (hit) p.onChange(hit[0]);
        }}>
        {p.value === undefined || p.empty ? <option value="">{p.empty ?? "—"}</option> : null}
        {p.options.map(([v, l]) => <option key={String(v)} value={String(v)}>{l}</option>)}
      </select>
    </label>
  );
}

export function Check(p: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label class="f-check">
      <input type="checkbox" checked={p.value} onChange={(e) => p.onChange((e.target as HTMLInputElement).checked)} />
      <span>{p.label}</span>
    </label>
  );
}

/** A collapsible group in the inspector. */
export function Section(p: { title: string; children: ComponentChildren; open?: boolean; actions?: ComponentChildren }) {
  return (
    <details class="sec" open={p.open ?? true}>
      <summary><span>{p.title}</span>{p.actions ? <span class="sec-act" onClick={(e) => e.preventDefault()}>{p.actions}</span> : null}</summary>
      <div class="sec-body">{p.children}</div>
    </details>
  );
}

/** Small icon-like buttons for list items. */
export function ItemTools(p: { onUp?: () => void; onDown?: () => void; onRemove?: () => void; onCopy?: () => void }) {
  return (
    <span class="tools">
      {p.onUp ? <button type="button" class="tool" onClick={p.onUp} aria-label={t("moveUp")} title={t("moveUp")}>↑</button> : null}
      {p.onDown ? <button type="button" class="tool" onClick={p.onDown} aria-label={t("moveDown")} title={t("moveDown")}>↓</button> : null}
      {p.onCopy ? <button type="button" class="tool" onClick={p.onCopy} aria-label={t("duplicate")} title={t("duplicate")}>⧉</button> : null}
      {p.onRemove ? <button type="button" class="tool danger" onClick={p.onRemove} aria-label={t("remove")} title={t("remove")}>✕</button> : null}
    </span>
  );
}
