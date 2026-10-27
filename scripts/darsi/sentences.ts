// Prints a storyboard scene by scene, sentence by sentence (numbered from 0, as design.json's "s" counts them), with
// the Egyptian Arabic beside it when it exists. For writing ar-EG.json and design.json.
//   node scripts/darsi/sentences.ts CY-1-1-2
import { splitSentences } from "../../packages/spec/src/index.ts";
import { loadArabic, loadStory } from "./convert.ts";

const id = (process.argv[2] ?? "").toUpperCase();
const story = loadStory(id);
const ar = loadArabic(id);
for (const s of story.video.scenes) {
  console.log(`\n# scene ${s.n} · ${s.beat} · ${s.voice}${s.on_screen_text ? ` · "${s.on_screen_text}"` : ""}${s.icons?.length ? ` · icons: ${s.icons.join(", ")}` : ""}`);
  const en = splitSentences(s.narration);
  const a = ar?.scenes[String(s.n)] ? splitSentences(ar.scenes[String(s.n)]!.narration) : [];
  en.forEach((t, i) => {
    console.log(`  ${i}  ${t}`);
    if (a[i]) console.log(`     ${a[i]}`);
  });
  if (a.length && a.length !== en.length) console.log(`  !! ${a.length} Arabic sentences for ${en.length} English`);
}
