// Narrates Lesson Packages: Gemini TTS voices each sentence (in a batch at half price, or now), then
// forced alignment times every word against the audio. Writes audio/<lang>.opus (+ .m4a), timing and captions.
// Run with --help for the options. The API key comes from GEMINI_API_KEY (.env.local is read by `npm run narrate`).
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, rmSync } from "node:fs";
import { join, dirname, resolve, basename } from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { estimateTiming, splitWords, toVtt, validatePackage } from "../packages/spec/src/index.ts";
import {
  DEFAULT_MODEL, alignWords, assemble, audioOf, batchOutput, batchState, billed, downloadResults, getBatch, lineKey,
  linesOf, parseJsonl, parseWav, seconds, similarity, speak, spreadWords, submitBatch, toWav, trimSilence, ttsCost,
  ttsRequest, voiceFor, isVertexKey,
} from "../packages/narrate/src/index.ts";
import { EXAMPLES, exampleIds } from "./lib/examples.mjs";

const HELP = `Narrates Lesson Packages with Gemini TTS, then times every word against the audio.

  npm run narrate -- [lesson ids...] [options]      (no ids: every example)

  --estimate         show sentences, minutes and cost, and send nothing
  --now              voice right away at full price (default: a batch at half price)
  --no-wait          submit the batch and stop; run again later to collect it and build
  --offline          use cached audio only; never call the API
  --lang en,ar       only these languages
  --dir <folder>     narrate a package outside examples/
  --limit <n>        voice at most n sentences in this run (a cheap first test)
  --workers <n>      requests at once when voicing now (default 2; the API's rate limits are retried)
  --voice <name>     another voice (e.g. Kore); --model <id> and --style <text> likewise
  --aligner <model>  Whisper model for word timings (default small); "none" spreads words within sentences
  --skip-check       don't transcribe sentences to check the voice read them as written
  --missing <file>   write the sentences that have no audio yet (text and the WAV path each needs) and stop,
                     e.g. to record them by hand; then build with --offline
`;

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CACHE = join(ROOT, ".cache", "narrate");
const TTS = join(CACHE, "tts");
const BATCHES = join(CACHE, "batches");
const WORK = join(CACHE, "work");
const DEFAULT_VOICE = {
  provider: "gemini",
  model: DEFAULT_MODEL,
  name: "Charon",
  style: "Clear, warm and calm, like a friendly teacher explaining to adults. Steady pace.",
};
/** Below this, the transcript of a sentence is too far from the script to trust the voice read it. */
const SIMILAR = 0.8;

const { values: opt, positionals: ids } = parseArgs({
  allowPositionals: true,
  options: {
    help: { type: "boolean" },
    estimate: { type: "boolean" },
    now: { type: "boolean" },
    "no-wait": { type: "boolean" },
    offline: { type: "boolean" },
    lang: { type: "string" },
    dir: { type: "string", multiple: true },
    limit: { type: "string" },
    voice: { type: "string" },
    model: { type: "string" },
    style: { type: "string" },
    provider: { type: "string" },
    aligner: { type: "string", default: "small" },
    "skip-check": { type: "boolean" },
    workers: { type: "string" },
    missing: { type: "string" },
  },
});
if (opt.help) {
  console.log(HELP);
  process.exit(0);
}

const read = (p) => JSON.parse(readFileSync(p, "utf8"));
const write = (p, data) => {
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, data);
};
const kb = (n) => `${Math.round(n / 1024)} KB`;
const usd = (x) => (x === null ? "price unknown" : `$${x < 0.01 ? x.toFixed(4) : x.toFixed(2)}`);
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));
const ttsPath = (key) => join(TTS, `${key}.wav`);
const metaPath = (key) => join(TTS, `${key}.json`);
const cached = (key) => existsSync(ttsPath(key));
/** How long a pause (a sentence that is only "…", see linesOf) lasts. */
const PAUSE_SECONDS = 0.8;

/* ---------- what to narrate ---------- */

const langs = opt.lang ? opt.lang.split(",").map((s) => s.trim()) : null;
const overrides = Object.fromEntries(
  [["name", opt.voice], ["model", opt.model], ["style", opt.style], ["provider", opt.provider]].filter(([, v]) => v),
);
const folders = [
  ...(ids.length || !opt.dir ? (ids.length ? ids : exampleIds()).map((id) => join(EXAMPLES, id)) : []),
  ...(opt.dir ?? []).map((d) => resolve(d)),
];

const jobs = [];
for (const dir of folders) {
  if (!existsSync(join(dir, "manifest.json"))) {
    console.error(`No package at ${dir}`);
    process.exit(1);
  }
  const manifest = read(join(dir, "manifest.json"));
  const scenes = read(join(dir, "scenes.json")).scenes;
  for (const track of manifest.languages) {
    if (langs && !langs.includes(track.code)) continue;
    // `chosen` is what the manifest records; `voice` adds per-language hints and is what the key and request use.
    const chosen = { ...DEFAULT_VOICE, ...track.voice, ...overrides };
    const voice = voiceFor(track.code, chosen, DEFAULT_VOICE);
    // The cast: a scene with a speaker is voiced by that speaker's voice; the narrator's settings fill the gaps.
    const cast = Object.fromEntries(Object.entries(track.voices ?? {}).map(([who, v]) => [who, voiceFor(track.code, v, chosen)]));
    const lines = [];
    for (const scene of linesOf(scenes, track.code)) {
      lines.push(await Promise.all(scene.map(async (l) => {
        const v = (l.speaker && cast[l.speaker]) || voice;
        if (l.pause) return { ...l, voice: v, key: "pause" };
        return { ...l, voice: v, key: await lineKey(v, track.code, l.text) };
      })));
    }
    const est = estimateTiming(scenes, track.code);
    const speech = est.scenes.reduce((a, s) => a + s.sentences.reduce((b, x) => b + x.end - x.start, 0), 0);
    jobs.push({ id: basename(dir), dir, manifest, scenes, track, chosen, voice, lines, speech });
  }
}
if (!jobs.length) {
  console.error("Nothing to narrate.");
  process.exit(1);
}

/* ---------- estimate ---------- */

const allLines = (j) => j.lines.flat();
let need = new Map(); // key -> { text, lang, voice }
console.log("Sentences to voice:");
for (const j of jobs) {
  const missing = allLines(j).filter((l) => !l.pause && !cached(l.key));
  for (const l of missing) need.set(l.key, { text: l.text, lang: j.track.code, voice: l.voice });
  const chars = allLines(j).reduce((a, l) => a + l.text.length, 0);
  const share = missing.length / Math.max(1, allLines(j).length);
  const model = j.voice.model;
  console.log(
    `  ${j.id} ${j.track.code}: ${allLines(j).length} sentences, ${missing.length} not voiced yet, about ${Math.round(j.speech)} s of speech;` +
      ` ${[...new Set(allLines(j).map((l) => l.voice.name))].join(", ")} on ${model}; to voice the rest: ${usd(ttsCost(model, j.speech * share, chars * share, true))} in a batch,` +
      ` ${usd(ttsCost(model, j.speech * share, chars * share, false))} now`,
  );
}
if (opt.missing) {
  const list = [...need].map(([key, info]) => ({ key, lang: info.lang, text: info.text, wav: ttsPath(key) }));
  write(resolve(opt.missing), JSON.stringify(list, null, 2) + "\n");
  console.log(`Wrote ${list.length} sentences to ${opt.missing}. Save each as 16-bit mono WAV at its "wav" path.`);
  process.exit(0);
}
if (opt.estimate) process.exit(0);

/* ---------- voicing ---------- */

function saveClip(key, info, spoken, mode, batch) {
  write(ttsPath(key), toWav(spoken.pcm));
  const meta = { text: info.text, lang: info.lang, voice: info.voice, mode, at: new Date().toISOString() };
  if (batch) meta.batch = batch;
  if (spoken.tokens !== undefined) meta.tokens = spoken.tokens;
  if (spoken.inputTokens !== undefined) meta.inputTokens = spoken.inputTokens;
  write(metaPath(key), JSON.stringify(meta, null, 2) + "\n");
}

function apiKey() {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (key) return key;
  console.error(
    "\nGEMINI_API_KEY is not set. Put it in .env.local at the repository root, as one line:\n" +
      "  GEMINI_API_KEY=<your key>\nThen run this again. (`--estimate` and `--offline` don't need it.)",
  );
  process.exit(2);
}

/** Collects a finished batch into the cache. Returns true when the batch is over (finished or failed). */
async function collect(client, file) {
  const rec = read(file);
  let op;
  try {
    op = await getBatch(client, rec.name);
  } catch (e) {
    console.log(`  ${rec.name}: couldn't check it (${e.message})`);
    return false;
  }
  const st = batchState(op);
  if (!st.done) return false;
  if (st.state !== "succeeded") {
    console.log(`  ${rec.name}: ${st.state}${st.error ? ` (${st.error})` : ""}; its sentences will be sent again`);
    rmSync(file);
    return true;
  }
  const out = batchOutput(op);
  const items = "file" in out ? parseJsonl(await downloadResults(client, out.file)) : out.items;
  let ok = 0;
  for (const it of items) {
    const key = it.key ?? rec.keys[it.index];
    const info = rec.lines[key];
    if (!key || !info) continue;
    try {
      if (it.error) throw new Error(it.error);
      saveClip(key, info, audioOf(it.response), "batch", rec.name);
      ok++;
    } catch (e) {
      console.log(`  "${info.text.slice(0, 60)}": ${e.message}`);
    }
  }
  console.log(`  ${rec.name}: ${ok} of ${rec.keys.length} sentences voiced`);
  rmSync(file);
  return true;
}

const pendingFiles = () => (existsSync(BATCHES) ? readdirSync(BATCHES).filter((f) => f.endsWith(".json")).map((f) => join(BATCHES, f)) : []);

if (!opt.offline && (need.size || pendingFiles().length)) {
  const key = apiKey();
  const client = { key, vertex: isVertexKey(key) };
  // Vertex AI keys have no half-price batch: they voice now.
  const now = opt.now || client.vertex;
  if (client.vertex && !opt.now) console.log("\nThis is a Vertex AI key, which can't use the batch, so the sentences are voiced now at the standard price.");
  // Batches from an earlier run first: their sentences may already be done.
  for (const f of pendingFiles()) await collect(client, f);
  const inFlight = new Set(pendingFiles().flatMap((f) => read(f).keys));
  need = new Map([...need].filter(([k]) => !cached(k) && !inFlight.has(k)));
  if (inFlight.size) console.log(`${inFlight.size} sentences are still in a batch from an earlier run.`);

  let todo = [...need];
  if (opt.limit) todo = todo.slice(0, Number(opt.limit));
  if (todo.length && now) {
    console.log(`\nVoicing ${todo.length} sentences now...`);
    let done = 0;
    const queue = [...todo];
    const worker = async () => {
      for (let item = queue.shift(); item; item = queue.shift()) {
        const [key, info] = item;
        try {
          // Vertex AI's quota is shared and runs out under load ("Resource exhausted"): keep trying for longer.
          saveClip(key, info, await speak(client, info.text, info.voice, client.vertex ? 12 : 5), "now");
        } catch (e) {
          console.log(`  "${info.text.slice(0, 60)}": ${e.message}`);
        }
        console.log(`  ${++done}/${todo.length}`);
      }
    };
    await Promise.all(Array.from({ length: Math.max(1, Number(opt.workers ?? 2)) }, worker));
  } else if (todo.length) {
    const byModel = Map.groupBy(todo, ([, info]) => info.voice.model);
    for (const [model, items] of byModel) {
      const name = await submitBatch(
        client,
        model,
        `lessonstudio narrate ${new Date().toISOString()}`,
        items.map(([key, info]) => ({ key, request: ttsRequest(info.text, info.voice) })),
      );
      const rec = { name, model, submittedAt: new Date().toISOString(), keys: items.map(([k]) => k), lines: Object.fromEntries(items) };
      write(join(BATCHES, `${name.replace(/\W+/g, "-")}.json`), JSON.stringify(rec, null, 2) + "\n");
      console.log(`\nSubmitted ${items.length} sentences to ${model} as ${name} (batch price).`);
    }
  }
  if (!now && !opt["no-wait"] && pendingFiles().length) {
    console.log("Waiting for the batch. Most finish within minutes; Google allows up to 24 hours.");
    console.log("It's safe to stop with Ctrl+C: run the same command later to collect it.");
    const from = Date.now();
    let said = 0;
    while (pendingFiles().length) {
      await sleep(30_000);
      for (const f of pendingFiles()) await collect(client, f);
      const min = Math.floor((Date.now() - from) / 60_000);
      if (pendingFiles().length && min >= said + 5) {
        said = min;
        console.log(`  still running after ${min} min`);
      }
    }
  } else if (pendingFiles().length) {
    console.log("Run the same command later to collect the batch and build.");
  }
}

/* ---------- word timings ---------- */

const ready = jobs.filter((j) => allLines(j).every((l) => l.pause || cached(l.key)));
for (const j of jobs) if (!ready.includes(j)) console.log(`\n${j.id} ${j.track.code}: not every sentence is voiced yet; nothing written.`);
if (!ready.length) process.exit(0);

const clipOf = new Map(); // key -> trimmed Pcm
for (const l of ready.flatMap(allLines)) if (!l.pause && !clipOf.has(l.key)) clipOf.set(l.key, trimSilence(parseWav(readFileSync(ttsPath(l.key)))));
// A pause is silence at the voices' own rate.
const rate = clipOf.values().next().value?.rate ?? 24000;
clipOf.set("pause", { rate, samples: new Int16Array(Math.round(rate * PAUSE_SECONDS)) });

const python = [process.env.LESSONSTUDIO_PYTHON, join(ROOT, "services/ai/.venv/Scripts/python.exe"), join(ROOT, "services/ai/.venv/bin/python")]
  .find((p) => p && existsSync(p));
const aligner = opt.aligner === "none" ? null : python ? opt.aligner : null;
const check = !opt["skip-check"];
const alignDir = join(CACHE, "align", aligner ?? "none");
const alignPath = (key) => join(alignDir, `${key}.json`);
if (opt.aligner !== "none" && !python) {
  console.log(
    "\nThe word aligner isn't set up, so word times will be spread within each sentence (sentence times are exact).\n" +
      "Set it up once with:\n  python -m venv services/ai/.venv\n  services/ai/.venv/Scripts/python -m pip install -r services/ai/requirements.txt",
  );
}
if (aligner) {
  const todo = ready.flatMap((j) => allLines(j).filter((l) => !l.pause).map((l) => ({ ...l, lang: j.track.code })))
    .filter((l, i, all) => all.findIndex((x) => x.key === l.key) === i)
    .filter((l) => {
      if (!existsSync(alignPath(l.key))) return true;
      const a = read(alignPath(l.key));
      return check && !a.error && a.heard == null;
    });
  if (todo.length) {
    console.log(`\nTiming the words of ${todo.length} sentences with Whisper ${aligner} (on this computer)...`);
    const clips = todo.map((l) => {
      const wav = join(WORK, "clips", `${l.key}.wav`);
      write(wav, toWav(clipOf.get(l.key)));
      return { key: l.key, wav, lang: l.lang, text: l.text };
    });
    write(join(WORK, "align-in.json"), JSON.stringify({ clips }));
    const args = [join(ROOT, "services/ai/align.py"), "--in", join(WORK, "align-in.json"), "--out", join(WORK, "align-out.json"), "--model", aligner];
    if (check) args.push("--check");
    const r = spawnSync(python, args, {
      stdio: ["ignore", "inherit", "pipe"],
      env: { ...process.env, HF_HUB_DISABLE_TELEMETRY: "1", HF_HUB_DISABLE_SYMLINKS_WARNING: "1", PYTHONIOENCODING: "utf-8" },
      encoding: "utf8",
    });
    if (r.status !== 0) {
      console.log(`The aligner failed; word times will be spread within sentences.\n${(r.stderr ?? "").split("\n").slice(-8).join("\n")}`);
    } else {
      const out = read(join(WORK, "align-out.json"));
      for (const [key, a] of Object.entries(out)) write(alignPath(key), JSON.stringify(a) + "\n");
    }
  }
}

/* ---------- build ---------- */

const ffmpeg = process.env.FFMPEG_PATH || (await import("ffmpeg-static").then((m) => m.default).catch(() => null)) || "ffmpeg";
function encode(wav, out, args) {
  mkdirSync(dirname(out), { recursive: true });
  const r = spawnSync(ffmpeg, ["-y", "-v", "error", "-i", wav, "-map_metadata", "-1", "-ac", "1", ...args, out], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${r.stderr || r.error?.message}`);
  return readFileSync(out);
}

const sha = (b) => createHash("sha256").update(b).digest("hex");
const upsertAsset = (m, path, type, bytes) => {
  m.assets = (m.assets ?? []).filter((a) => a.path !== path);
  m.assets.push({ path, type, bytes: bytes.length, sha256: sha(bytes) });
  m.assets.sort((a, b) => a.path.localeCompare(b.path));
};

const touched = new Map(); // dir -> manifest, written once per package
for (const j of ready) {
  const lang = j.track.code;
  let source = aligner ? "aligned" : "tts";
  const flagged = [];
  const scenes = j.lines.map((lines, i) => ({
    id: j.scenes[i].id,
    clips: lines.map((l) => {
      const pcm = clipOf.get(l.key);
      if (l.pause) return { text: l.text, pcm, words: spreadWords(splitWords(l.text), 0, seconds(pcm)) };
      if (!pcm.samples.length) throw new Error(`${j.id} ${lang}: the audio for "${l.text}" is silent; delete .cache/narrate/tts/${l.key}.* and run again`);
      const words = splitWords(l.text);
      const a = aligner && existsSync(alignPath(l.key)) ? read(alignPath(l.key)) : null;
      if (!a || a.error) {
        if (aligner) source = "tts";
        return { text: l.text, pcm, words: spreadWords(words, 0, seconds(pcm)) };
      }
      const al = alignWords(words, a.words, seconds(pcm));
      const sim = a.heard == null ? null : similarity(l.text, a.heard);
      if (al.matched < 0.9 || (sim !== null && sim < SIMILAR)) flagged.push({ text: l.text, heard: a.heard, sim, key: l.key });
      return { text: l.text, pcm, words: al.words };
    }),
  }));
  const { timing, pcm } = assemble(scenes, lang, source);

  const wav = join(WORK, `${j.id}-${lang}.wav`);
  write(wav, toWav(pcm));
  const audio = `audio/${lang}.opus`;
  const fallback = `audio/${lang}.m4a`;
  const opus = encode(wav, join(j.dir, audio), ["-c:a", "libopus", "-b:a", "16k", "-vbr", "on", "-application", "voip", "-frame_duration", "60"]);
  const m4a = encode(wav, join(j.dir, fallback), ["-c:a", "aac", "-b:a", "32k", "-movflags", "+faststart"]);

  const m = touched.get(j.dir) ?? j.manifest;
  touched.set(j.dir, m);
  const track = m.languages.find((l) => l.code === lang);
  track.duration = timing.duration;
  track.audio = audio;
  track.audioFallback = fallback;
  track.captions ??= `captions/${lang}.vtt`;
  track.voice = j.chosen;
  m.ai.narration = j.chosen.provider === "human" ? "human" : "synthetic";
  upsertAsset(m, audio, "audio/ogg", opus);
  upsertAsset(m, fallback, "audio/mp4", m4a);
  write(join(j.dir, track.timing), JSON.stringify(timing) + "\n");
  write(join(j.dir, track.captions), toVtt(timing, track.dir));

  // Clips recorded outside this tool have no meta, so no known cost.
  const spent = allLines(j).reduce((a, l) => {
    if (l.pause) return a;
    if (a === null || !existsSync(metaPath(l.key))) return null;
    const x = read(metaPath(l.key));
    const c = billed(x.voice?.model ?? "", x.tokens ?? 0, x.inputTokens ?? 0, x.mode === "batch");
    return c === null ? null : a + c;
  }, 0);
  console.log(
    `\n${j.id} ${lang}: ${timing.duration.toFixed(1)} s, ${source} timings, opus ${kb(opus.length)} (m4a ${kb(m4a.length)} for older iPhones);` +
      ` voicing cost ${usd(spent)}`,
  );
  for (const f of flagged) {
    console.log(`  check this sentence: "${f.text}"`);
    if (f.heard != null) console.log(`    heard: "${f.heard}" (${Math.round((f.sim ?? 0) * 100)}% alike). To voice it again: delete .cache/narrate/tts/${f.key}.*`);
  }
}

for (const [dir, m] of touched) {
  write(join(dir, "manifest.json"), JSON.stringify(m, null, 2) + "\n");
  const scenes = read(join(dir, "scenes.json"));
  const timing = {};
  for (const l of m.languages) if (existsSync(join(dir, l.timing))) timing[l.code] = read(join(dir, l.timing));
  const r = validatePackage({ manifest: m, scenes, timing });
  console.log(`${basename(dir)}: ${r.errors.length} errors, ${r.warnings.length} warnings`);
  for (const e of [...r.errors, ...r.warnings]) console.log(`  ${e.code} at ${e.path}${e.detail ? ` (${e.detail})` : ""}`);
  if (!r.ok) process.exitCode = 1;
}
