import { useState } from "preact/hooks";
import type { Issue, Text } from "@lessonstudio/spec";
import { getAt, type Op } from "@lessonstudio/ops";
import { edit, elementId, lesson, report, sceneId, timings } from "../editor.ts";
import { t, issueText } from "../i18n.ts";
import { clean } from "./Animations.tsx";

/** The validator's findings, live: errors stop a lesson playing right; warnings keep it light and in sync. */
export function Checks() {
  const r = report.value;
  const [open, setOpen] = useState(false);
  if (!r) return null;
  // A word missing from the narration usually anchors several animations: it is listed (and repaired) once.
  const groups = new Map<string, number>();
  const all = [...r.errors.map((i) => ({ ...i, bad: true })), ...r.warnings.map((i) => ({ ...i, bad: false }))].filter((i) => {
    const g = wordGroup(i);
    if (!g) return true;
    groups.set(g, (groups.get(g) ?? 0) + 1);
    return groups.get(g) === 1;
  });
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
            <li key={`${i.code}${i.path}${i.detail ?? ""}${k}`} class={i.bad ? "bad" : "warn"}>
              <button type="button" class="link" onClick={() => go(i.path)}>{issueText(i.code)}</button>
              <span class="f-hint" dir="ltr">{i.path}{i.detail ? ` (${i.detail})` : ""}{(groups.get(wordGroup(i) ?? "") ?? 1) > 1 ? ` ×${groups.get(wordGroup(i)!)}` : ""}</span>
              {i.code === "keyWordMissing" || i.code === "cueWordMissing" ? <NewWord issue={i} /> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** "scenes[2].content.elements[1].anim[0]" → scene 2 and "/content/elements/1/anim/0". */
export function issuePointer(path: string): { scene: number; ptr: string } | null {
  const m = /^scenes\[(\d+)\]((?:\.[A-Za-z]+|\[\d+\])*)$/.exec(path);
  return m ? { scene: Number(m[1]), ptr: m[2]!.replace(/\.([A-Za-z]+)/g, "/$1").replace(/\[(\d+)\]/g, "/$1") } : null;
}

/** The word an issue's anchor is waiting for, in the issue's language. */
function missingWord(issue: Issue): { scene: number; path: string; word: string } | null {
  if (issue.code !== "keyWordMissing" && issue.code !== "cueWordMissing") return null;
  const loc = issuePointer(issue.path);
  const s = loc ? lesson.value?.scenes.scenes[loc.scene] : undefined;
  if (!loc || !s || !issue.detail) return null;
  const path = `${loc.ptr}${issue.code === "keyWordMissing" ? "/at/word" : "/word"}`;
  const w = getAt(s, path) as Text | undefined;
  return { scene: loc.scene, path, word: typeof w === "string" ? w : w?.[issue.detail] ?? "" };
}
const wordGroup = (i: Issue): string | null => { const m = missingWord(i); return m ? `${m.scene}|${i.detail}|${m.word}` : null; };

/** Every anchor in a scene (cues, keyframes, camera, overlays) waiting for `word` in language `code`, as JSON pointers. */
export function anchorsOf(scene: unknown, code: string, word: string): { path: string; value: Text }[] {
  const out: { path: string; value: Text }[] = [];
  const walk = (v: unknown, path: string): void => {
    if (Array.isArray(v)) { v.forEach((x, i) => walk(x, `${path}/${i}`)); return; }
    if (!v || typeof v !== "object") return;
    for (const [k, x] of Object.entries(v)) {
      if (k === "word" && (typeof x === "string" ? x : (x as Record<string, string>)?.[code]) === word) out.push({ path: `${path}/word`, value: x as Text });
      else walk(x, `${path}/${k}`);
    }
  };
  walk(scene, "");
  return out;
}

/** When narration changes and an anchored word is no longer spoken: pick the word that should start it now. */
function NewWord({ issue }: { issue: Issue }) {
  const [open, setOpen] = useState(false);
  const l = lesson.value;
  const loc = issuePointer(issue.path);
  const scene = loc ? l?.scenes.scenes[loc.scene] : undefined;
  const code = issue.detail;
  if (!l || !loc || !scene || !code) return null;
  const path = `${loc.ptr}${issue.code === "keyWordMissing" ? "/at/word" : "/word"}`;
  const cur = getAt(scene, path) as Text | undefined;
  const track = l.manifest.languages.find((x) => x.code === code);
  const words = timings.value[code]?.scenes[loc.scene]?.words ?? [];
  const old = typeof cur === "string" ? cur : cur?.[code] ?? "";
  // Every animation and cue in the scene that waited for the old word moves to the new one, in this language only.
  const choose = (w: string) => {
    const ops: Op[] = anchorsOf(scene, code, old).map((a) => {
      const next = typeof a.value === "string" ? Object.fromEntries(l.manifest.languages.map((x) => [x.code, a.value as string])) : { ...a.value };
      next[code] = clean(w);
      return { op: "set", scene: scene.id, path: a.path, value: next };
    });
    if (ops.length && edit(ops)) setOpen(false);
  };
  if (!open) return <button type="button" class="btn small" onClick={() => { sceneId.value = scene.id; setOpen(true); }}>{t("pickNewWord")}</button>;
  return (
    <div class="words-pick">
      <p class="f-hint">{t("wasWord").replace("{word}", old)}</p>
      <div class="words-row" dir={track?.dir} lang={code}>
        <span class="f-code" dir="ltr">{code.toUpperCase()}</span>
        {words.map((w, k) => <button type="button" key={k} class="word" onClick={() => choose(w.w)}>{w.w}</button>)}
      </div>
      <button type="button" class="link" onClick={() => setOpen(false)}>{t("cancel")}</button>
    </div>
  );
}
