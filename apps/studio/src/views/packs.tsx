// The inspector's form for any technology pack element: its own fields as JSON, checked live by the same validator as
// the whole lesson (the pack's own checks, at their paths), and saved with one updateElement so undo and sync work.
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import type { Element } from "@lessonstudio/spec";
import { packOf } from "@lessonstudio/spec";
import { lesson } from "../editor.ts";
import { issueText, t, type Key } from "../i18n.ts";
import { elementIssues, fieldProps, fieldsText, parseFields, withFields, type ElementIssue, type FieldsProblem } from "../packs.ts";

type SetProps = (props: Record<string, unknown>) => void;

/** A pack type's name in the studio's language ("Code trace"), or the type itself. */
export function packTypeName(type: string): string {
  return t(`pt_${type}` as Key) || type;
}
export const packName = (pack: string): string => t(`pack_${pack}` as Key) || pack;

function problemText(p: FieldsProblem): string {
  if (p.kind === "object") return t("packJsonObject");
  if (p.kind === "place") return t("packJsonPlace").replace("{keys}", p.keys.join(", "));
  return `${t("packJsonBad")} ${p.message}`;
}

/** The pack element's own fields as JSON: edit, see the checks for exactly this element, save on leaving the field. */
export function PackForm({ sceneId, el, set }: { sceneId: string; el: Element; set: SetProps }) {
  const current = fieldsText(el);
  const [text, setText] = useState(current);
  const focused = useRef(false);
  useEffect(() => { if (!focused.current) setText(current); }, [current]);
  const l = lesson.value;
  const parsed = useMemo(() => parseFields(text), [text]);
  // What the element has now, and what it would have with the typed fields: only new errors stop a save, so an
  // element that came with problems can be fixed one at a time.
  const before = useMemo(() => (l ? elementIssues(l, sceneId, el) : []), [l, sceneId, current]);
  const after = useMemo(
    () => (l && "value" in parsed ? elementIssues(l, sceneId, el, withFields(el, parsed.value)) : null),
    [l, sceneId, current, parsed],
  );
  const errors = (list: ElementIssue[] | null): number => (list ?? []).filter((i) => i.bad).length;
  const savable = "value" in parsed && errors(after) <= errors(before);
  const changed = text !== current;
  const commit = () => {
    focused.current = false;
    if (!changed || !("value" in parsed) || !savable) return;
    const props = fieldProps(el, parsed.value);
    if (Object.keys(props).length) set(props);
  };
  const problem = "problem" in parsed ? parsed.problem : null;
  const at = problem?.kind === "json" ? problem.at : undefined;
  const shown = after ?? before;
  const pack = packOf(el.type) ?? "";
  return (
    <div class="f-src pack-form">
      <label class="f-row" for={`pack-json-${el.id}`}>
        <span>{t("packFields")}</span>
      </label>
      <div class="f-problem" id={`pack-p-${el.id}`} role="status" aria-live="polite">
        {problem ? (
          <>
            <p class="f-hint warn">{at !== undefined ? `${t("problemAt").replace("{n}", String(at + 1))} ` : ""}<bdi dir="ltr">{problemText(problem)}</bdi>{t("sep")}{t("notSavedYet")}</p>
            {at !== undefined ? <code class="f-where" dir="ltr" aria-hidden="true">{text.slice(Math.max(0, at - 30), at)}<mark>{text.slice(at, at + 1) || " "}</mark>{text.slice(at + 1, at + 30)}</code> : null}
          </>
        ) : null}
        {!problem && changed && !savable ? <p class="f-hint warn">{t("packMoreErrors")}{t("sep")}{t("notSavedYet")}</p> : null}
        {shown.length ? (
          <ul class="pack-issues">
            {shown.map((i, k) => (
              <li key={`${i.code}${i.path}${k}`} class={i.bad ? "bad" : "warn"}>
                <strong>{i.bad ? t("problemError") : t("problemWarning")}</strong> {issueText(i.code)}
                <code dir="ltr">{i.rel || t("packWhole")}{i.detail ? ` (${i.detail})` : ""}</code>
              </li>
            ))}
          </ul>
        ) : !problem ? <p class="f-hint ok">{t("packNoProblems")}</p> : null}
      </div>
      <div class="f-row pack-json-row">
        <textarea id={`pack-json-${el.id}`} class="mono pack-json" dir="ltr" rows={12} spellcheck={false} value={text}
          aria-invalid={problem || !savable ? true : undefined} aria-describedby={`pack-p-${el.id}`}
          onFocus={() => { focused.current = true; }}
          onInput={(e) => setText((e.target as HTMLTextAreaElement).value)}
          onBlur={commit} />
      </div>
      <div class="pack-tools">
        <button type="button" class="link" disabled={!("value" in parsed)} onClick={() => { if ("value" in parsed) setText(JSON.stringify(parsed.value, null, 2)); }}>{t("packTidy")}</button>
        <button type="button" class="link" disabled={!changed} onClick={() => { focused.current = false; setText(current); }}>{t("packDiscard")}</button>
      </div>
      <p class="f-hint">{t("packFieldsHint").replace("{id}", pack)}</p>
    </div>
  );
}
