// The signed-in studio: Firebase, the lessons, the editor, settings. Loaded only when someone signs in (or was signed
// in last time), so the homepage never downloads the Firebase SDK.
import { createUserWithEmailAndPassword, GoogleAuthProvider, onAuthStateChanged, signInWithEmailAndPassword, signInWithPopup, signInWithRedirect, signOut } from "firebase/auth";
import { auth } from "./fb.ts";
import { rememberSession } from "./env.ts";
import { go, route, say, user } from "./state.ts";
import { t } from "./i18n.ts";
import { TopLine } from "./views/TopLine.tsx";
import { Home } from "./views/Home.tsx";
import { Editor } from "./views/Editor.tsx";
import { Lessons } from "./views/Lessons.tsx";
import { Settings } from "./views/Settings.tsx";
import { Connect } from "./views/Connect.tsx";

onAuthStateChanged(auth, (u) => {
  user.value = u;
  rememberSession(!!u);
});

/** Google sign-in in a pop-up; where the browser blocks pop-ups, by redirecting to Google and back. */
export async function signInGoogle(): Promise<void> {
  try {
    await signInWithPopup(auth, new GoogleAuthProvider());
  } catch (e) {
    const code = (e as { code?: string }).code ?? String(e);
    if (code === "auth/popup-blocked") await signInWithRedirect(auth, new GoogleAuthProvider());
    else if (code !== "auth/popup-closed-by-user" && code !== "auth/cancelled-popup-request") say(code, true);
  }
}

/** The emulators' test account (made on first use). */
export async function signInTest(email: string): Promise<void> {
  const pass = "lessonstudio-test";
  try {
    await signInWithEmailAndPassword(auth, email, pass).catch(() => createUserWithEmailAndPassword(auth, email, pass));
  } catch (e) {
    say((e as { code?: string }).code ?? String(e), true);
  }
}

export function Studio() {
  const u = user.value;
  const m = /^\/lessons\/([a-z0-9][a-z0-9-]{1,63})$/.exec(route.value);
  return (
    <>
      <TopLine signedIn={!!u} onSignOut={() => { void signOut(auth).then(() => go("/")); }} onSignIn={() => void signInGoogle()} />
      {u === undefined ? <main class="empty"><p>{t("loading")}</p></main>
        : !u ? <Home onGoogle={signInGoogle} onTest={signInTest} />
        : m ? <Editor id={m[1]!} />
        : route.value === "/settings" ? <Settings /> : route.value === "/connect" ? <Connect /> : <Lessons />}
    </>
  );
}
