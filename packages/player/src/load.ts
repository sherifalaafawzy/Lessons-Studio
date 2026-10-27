import type { Lang, LessonPackage, Manifest, ScenesFile, TimingFile } from "@lessonstudio/spec";
import { relPathOk, DEFAULT_LIBRARY } from "@lessonstudio/spec";

async function json<T>(url: string, fetcher: typeof fetch): Promise<T> {
  const r = await fetcher(url);
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return (await r.json()) as T;
}

/** A path from the manifest, resolved against the package's base. Refuses absolute and "..". */
export function resolvePath(pkg: LessonPackage, path: string): string {
  if (!relPathOk(path)) throw new Error(`Bad package path: ${path}`);
  // The shared library (cast, extended icons) lives in one place for every lesson.
  if (path.startsWith("@lib/")) return new URL(path.slice(5), pkg.library ?? DEFAULT_LIBRARY).href;
  if (pkg.resolve) return pkg.resolve(path);
  return new URL(path, pkg.base ?? (typeof location !== "undefined" ? location.href : "http://localhost/")).href;
}

export interface LoadOptions {
  /** Which language's timing to fetch now. Default: the manifest's defaultLang. */
  lang?: Lang;
  fetch?: typeof fetch;
}

/** Loads a package from a folder URL: the manifest, the scenes and one language's timing. */
export async function loadPackage(url: string, o: LoadOptions = {}): Promise<LessonPackage> {
  const f = o.fetch ?? fetch.bind(globalThis);
  const base = new URL(url.endsWith("/") ? url : `${url}/`, typeof location !== "undefined" ? location.href : undefined).href;
  const [manifest, scenes] = await Promise.all([
    json<Manifest>(new URL("manifest.json", base).href, f),
    json<ScenesFile>(new URL("scenes.json", base).href, f),
  ]);
  const pkg: LessonPackage = { base, manifest, scenes, timing: {} };
  const lang = o.lang && manifest.languages.some((l) => l.code === o.lang) ? o.lang : manifest.defaultLang;
  await ensureTiming(pkg, lang, f);
  return pkg;
}

/** Fetches a language's timing if it isn't loaded yet. */
export async function ensureTiming(pkg: LessonPackage, lang: Lang, f: typeof fetch = fetch.bind(globalThis)): Promise<TimingFile> {
  const have = pkg.timing[lang];
  if (have) return have;
  const track = pkg.manifest.languages.find((l) => l.code === lang);
  if (!track) throw new Error(`No language ${lang} in ${pkg.manifest.id}`);
  const t = await json<TimingFile>(resolvePath(pkg, track.timing), f);
  pkg.timing[lang] = t;
  return t;
}
