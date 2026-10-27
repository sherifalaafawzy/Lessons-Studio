import { useState } from "preact/hooks";
import { createUserWithEmailAndPassword, GoogleAuthProvider, signInWithEmailAndPassword, signInWithPopup } from "firebase/auth";
import { auth, emulators } from "../fb.ts";
import { say } from "../state.ts";
import { t } from "../i18n.ts";

/** Sign in with Google. With the local emulators there's also a test account, for trying things and for tests. */
export function SignIn() {
  const [email, setEmail] = useState("teacher@example.com");
  const [busy, setBusy] = useState(false);
  const google = async () => {
    setBusy(true);
    try { await signInWithPopup(auth, new GoogleAuthProvider()); } catch (e) { say((e as { code?: string }).code ?? String(e), true); }
    setBusy(false);
  };
  const test = async () => {
    setBusy(true);
    const pass = "lessonstudio-test";
    try {
      await signInWithEmailAndPassword(auth, email, pass).catch(() => createUserWithEmailAndPassword(auth, email, pass));
    } catch (e) {
      say((e as { code?: string }).code ?? String(e), true);
    }
    setBusy(false);
  };
  return (
    <main class="signin">
      <h1>Lesson Studio</h1>
      <p>{t("tagline")}</p>
      <button type="button" class="btn primary" disabled={busy} onClick={() => void google()}>{t("signInGoogle")}</button>
      {emulators ? (
        <form class="testacct" onSubmit={(e) => { e.preventDefault(); void test(); }}>
          <p class="f-hint">{t("emulatorNote")}</p>
          <label class="f-row"><span>{t("testAccount")}</span><input type="email" dir="ltr" value={email} onInput={(e) => setEmail((e.target as HTMLInputElement).value)} /></label>
          <button type="submit" class="btn" disabled={busy}>{t("useTestAccount")}</button>
        </form>
      ) : null}
    </main>
  );
}
