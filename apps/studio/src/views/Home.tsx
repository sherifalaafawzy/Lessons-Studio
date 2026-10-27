import { useEffect, useRef, useState } from "preact/hooks";
import type { Player } from "@lessonstudio/player";
import { LIBRARY, emulators, mcpAddress } from "../env.ts";
import { t, uiLang, type Key } from "../i18n.ts";
import { Icon, type IconName } from "../icons.tsx";
import shotEn from "../assets/editor-en.webp";
import shotAr from "../assets/editor-ar.webp";

interface Props {
  onGoogle: () => unknown;
  onTest: (email: string) => unknown;
  /** Starts loading the studio when the visitor shows they may sign in (hover, focus). */
  onPrepare?: () => void;
}

const FEATURES: { icon: IconName; title: Key; body: Key }[] = [
  { icon: "scenes", title: "homeF1", body: "homeF1b" },
  { icon: "layers", title: "homeF2", body: "homeF2b" },
  { icon: "command", title: "homeF3", body: "homeF3b" },
  { icon: "preview", title: "homeF4", body: "homeF4b" },
];
const APPS = ["ChatGPT", "claude.ai", "Claude Code", "Claude Desktop", "Cursor", "VS Code", "Gemini CLI"];

/** The public homepage: what Lesson Studio is, shown with a real lesson playing, and sign-in. */
export function Home(p: Props) {
  const [email, setEmail] = useState("teacher@example.com");
  const [busy, setBusy] = useState(false);
  const run = (f: () => unknown) => { setBusy(true); void Promise.resolve(f()).finally(() => setBusy(false)); };
  const signIn = (
    <button type="button" class="btn primary big" disabled={busy} onPointerEnter={p.onPrepare} onFocus={p.onPrepare} onClick={() => run(p.onGoogle)}>
      {t("signInGoogle")}
    </button>
  );
  return (
    <main class="home">
      <section class="hero">
        <div class="hero-text">
          <p class="eyebrow">{t("homeEyebrow")}</p>
          <h1>{t("homeTitle")}</h1>
          <p class="lead">{t("homeLead")}</p>
          <div class="hero-cta">
            {signIn}
            <a href="#how" class="btn big">{t("homeSee")}</a>
          </div>
          {emulators ? (
            <form class="testacct" onSubmit={(e) => { e.preventDefault(); run(() => p.onTest(email)); }}>
              <p class="f-hint">{t("emulatorNote")}</p>
              <label class="f-row"><span>{t("testAccount")}</span><input type="email" dir="ltr" value={email} onInput={(e) => setEmail((e.target as HTMLInputElement).value)} /></label>
              <button type="submit" class="btn" disabled={busy}>{t("useTestAccount")}</button>
            </form>
          ) : null}
        </div>
        <HeroPlayer />
      </section>

      <section id="how" class="features">
        {FEATURES.map((f) => (
          <article key={f.title} class="feature">
            <span class="feature-icon"><Icon name={f.icon} /></span>
            <h2>{t(f.title)}</h2>
            <p>{t(f.body)}</p>
          </article>
        ))}
      </section>

      <section class="shot">
        <h2>{t("homeShotTitle")}</h2>
        <p class="lead">{t("homeShotLead")}</p>
        <img src={uiLang.value === "ar" ? shotAr : shotEn} width={1200} height={717} loading="lazy" decoding="async" alt={t("homeShotAlt")} />
      </section>

      <section class="ai-sec">
        <div>
          <h2>{t("homeAiTitle")}</h2>
          <p class="lead">{t("homeAiLead")}</p>
          <ul class="app-list">{APPS.map((a) => <li key={a} dir="ltr">{a}</li>)}</ul>
        </div>
        <div class="chat">
          <p class="bubble me">{t("homeAiAsk")}</p>
          <p class="bubble ai">{t("homeAiAnswer")}</p>
          <p class="f-hint">{t("homeAiAddr")} <code dir="ltr">{mcpAddress()}</code></p>
        </div>
      </section>

      <section class="numbers">
        {([["22 KB", "homeN1"], ["6 KB", "homeN2"], ["2G", "homeN3"], ["EN ⇄ AR", "homeN4"]] as [string, Key][]).map(([n, k]) => (
          <div key={k} class="stat"><strong dir="ltr">{n}</strong><span>{t(k)}</span></div>
        ))}
      </section>

      <section class="cta-end">
        <h2>{t("homeEndTitle")}</h2>
        <p class="lead">{t("homeEndLead")}</p>
        {signIn}
      </section>
      <footer class="home-foot"><span>Lesson Studio</span><span>{t("homeFoot")}</span></footer>
    </main>
  );
}

/**
 * A real lesson in the real player, looping quietly. Switch its language and the animation follows the other
 * narrator's words, mirrored; switch to a low-end phone and it plays the light version. Pauses when off screen.
 */
function HeroPlayer() {
  const host = useRef<HTMLDivElement>(null);
  const player = useRef<Player | null>(null);
  const [lang, setLang] = useState<"en" | "ar">(uiLang.value === "ar" ? "ar" : "en");
  const [tier, setTier] = useState<"full" | "lite">("full");
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let dead = false;
    const calm = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    Promise.all([import("@lessonstudio/player"), import("@lessonstudio/ops"), import("../examples.ts")]).then(async ([{ createPlayer }, { toPackage }, { EXAMPLES }]) => {
      const ex = EXAMPLES.find((e) => e.id === "how-ai-learns") ?? EXAMPLES[0]!;
      const lesson = await ex.load();
      if (dead || !host.current) return;
      const p: Player = createPlayer(host.current, toPackage(lesson), {
        lang, tier: calm ? "lite" : "full", captions: true, library: LIBRARY,
        onCheck: async () => ({ correct: true }),
        onEvent: (e) => { if (e.type === "ended") { p.seek(0); void p.play(); } },
      });
      player.current = p;
      setReady(true);
      // Plays only while it is on screen.
      const io = new IntersectionObserver(([en]) => {
        const seen = !!en && en.isIntersecting && en.intersectionRect.height >= Math.min(160, en.boundingClientRect.height * 0.4);
        if (seen && !calm) { if (!p.playing) void p.play(); } else p.pause();
      }, { threshold: [0, 0.1, 0.25, 0.4, 0.6] });
      io.observe(host.current);
      cleanup = () => io.disconnect();
    });
    let cleanup = () => {};
    return () => { dead = true; cleanup(); player.current?.destroy(); player.current = null; };
  }, []);
  const pickLang = (l: "en" | "ar") => { setLang(l); void player.current?.setLang(l); };
  const pickTier = (x: "full" | "lite") => { setTier(x); player.current?.setTier(x); };
  return (
    <figure class="hero-player">
      <div class="hp-frame"><div ref={host} class="hp-host" aria-label={t("homePlayerLabel")} />{ready ? null : <div class="hp-wait" />}</div>
      <figcaption>
        <div class="seg" role="radiogroup" aria-label={t("lessonLanguage")}>
          <button type="button" role="radio" aria-checked={lang === "en"} class={lang === "en" ? "on" : ""} onClick={() => pickLang("en")} lang="en">English</button>
          <button type="button" role="radio" aria-checked={lang === "ar"} class={lang === "ar" ? "on" : ""} onClick={() => pickLang("ar")} lang="ar">العربية</button>
        </div>
        <div class="seg" role="radiogroup" aria-label={t("homeDevice")}>
          <button type="button" role="radio" aria-checked={tier === "full"} class={tier === "full" ? "on" : ""} onClick={() => pickTier("full")}>{t("homeFull")}</button>
          <button type="button" role="radio" aria-checked={tier === "lite"} class={tier === "lite" ? "on" : ""} onClick={() => pickTier("lite")}>{t("homeLowEnd")}</button>
        </div>
        <span class="f-hint">{t("homePlayerNote")}</span>
      </figcaption>
    </figure>
  );
}
