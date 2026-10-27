import { emulators } from "../env.ts";
import { go } from "../state.ts";
import { t, uiLang } from "../i18n.ts";

/** The bar at the top of every page: the name, the studio's links when signed in, the language, sign in or out. */
export function TopLine(p: { signedIn: boolean; onSignOut: () => void; onSignIn: () => void; onHover?: () => void }) {
  const link = (path: string, label: string) => (
    <a href={path} class="link" onClick={(e) => { e.preventDefault(); go(path); }}>{label}</a>
  );
  return (
    <div class="topline">
      <a class="brand" href="/" onClick={(e) => { e.preventDefault(); go("/"); }}><span class="brand-mark" aria-hidden="true">▶</span>Lesson Studio</a>
      {emulators ? <span class="emu">{t("emulators")}</span> : null}
      <span class="spacer" />
      {p.signedIn ? link("/connect", t("connectAi")) : null}
      {p.signedIn ? link("/settings", t("settings")) : null}
      <button type="button" class="link" onClick={() => { uiLang.value = uiLang.value === "ar" ? "en" : "ar"; }} lang={uiLang.value === "ar" ? "en" : "ar"}>
        {uiLang.value === "ar" ? "English" : "العربية"}
      </button>
      {p.signedIn
        ? <button type="button" class="link" onClick={p.onSignOut}>{t("signOut")}</button>
        : <button type="button" class="link" onPointerEnter={p.onHover} onFocus={p.onHover} onClick={p.onSignIn}>{t("signIn")}</button>}
    </div>
  );
}
