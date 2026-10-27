import { render } from "preact";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth, emulators } from "./fb.ts";
import { route, toast, user } from "./state.ts";
import { dir, t, uiLang } from "./i18n.ts";
import { Editor } from "./views/Editor.tsx";
import { Lessons } from "./views/Lessons.tsx";
import { SignIn } from "./views/SignIn.tsx";

onAuthStateChanged(auth, (u) => { user.value = u; });

function App() {
  const u = user.value;
  const m = /^\/lessons\/([a-z0-9][a-z0-9-]{1,63})$/.exec(route.value);
  document.documentElement.lang = uiLang.value;
  document.documentElement.dir = dir.value;
  return (
    <>
      <div class="topline">
        <span class="brand">Lesson Studio</span>
        {emulators ? <span class="emu">{t("emulators")}</span> : null}
        <span class="spacer" />
        <button type="button" class="link" onClick={() => { uiLang.value = uiLang.value === "ar" ? "en" : "ar"; }} lang={uiLang.value === "ar" ? "en" : "ar"}>
          {uiLang.value === "ar" ? "English" : "العربية"}
        </button>
        {u ? <button type="button" class="link" onClick={() => void signOut(auth)}>{t("signOut")}</button> : null}
      </div>
      {u === undefined ? <main class="empty"><p>{t("loading")}</p></main> : !u ? <SignIn /> : m ? <Editor id={m[1]!} /> : <Lessons />}
      {toast.value ? <div class={`toast${toast.value.bad ? " bad" : ""}`} role="status">{toast.value.text}</div> : null}
    </>
  );
}

render(<App />, document.getElementById("app")!);
