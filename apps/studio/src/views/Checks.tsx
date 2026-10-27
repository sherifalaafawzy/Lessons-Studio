import { useState } from "preact/hooks";
import { elementId, lesson, report, sceneId } from "../editor.ts";
import { t, issueText } from "../i18n.ts";

/** The validator's findings, live: errors stop a lesson playing right; warnings keep it light and in sync. */
export function Checks() {
  const r = report.value;
  const [open, setOpen] = useState(false);
  if (!r) return null;
  const all = [...r.errors.map((i) => ({ ...i, bad: true })), ...r.warnings.map((i) => ({ ...i, bad: false }))];
  const go = (path: string) => {
    const m = /scenes\[(\d+)\]/.exec(path);
    const s = m ? lesson.value?.scenes.scenes[Number(m[1])] : undefined;
    if (s) { sceneId.value = s.id; elementId.value = null; }
  };
  return (
    <div class="checks">
      <button type="button" class={`checks-sum ${r.errors.length ? "bad" : r.warnings.length ? "warn" : "ok"}`} aria-expanded={open} onClick={() => setOpen(!open)}>
        {r.errors.length === 0 && r.warnings.length === 0 ? t("allGood") : `${r.errors.length} ${t("errors")}, ${r.warnings.length} ${t("warnings")}`}
      </button>
      {open && all.length ? (
        <ul class="checks-list">
          {all.map((i, k) => (
            <li key={k} class={i.bad ? "bad" : "warn"}>
              <button type="button" class="link" onClick={() => go(i.path)}>{issueText(i.code)}</button>
              <span class="f-hint" dir="ltr">{i.path}{i.detail ? ` (${i.detail})` : ""}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
