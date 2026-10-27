// The entry: the homepage for visitors, and the studio (with Firebase) only once someone signs in, or was signed in
// last time, or opens a studio link. The homepage itself downloads no Firebase.
import { render, type ComponentType } from "preact";
import { useEffect, useState } from "preact/hooks";
import { hadSession } from "./env.ts";
import { route, toast } from "./state.ts";
import { dir, uiLang } from "./i18n.ts";
import { Home } from "./views/Home.tsx";
import { TopLine } from "./views/TopLine.tsx";

type StudioModule = typeof import("./studio.tsx");
let loading: Promise<StudioModule> | null = null;
const loadStudio = (): Promise<StudioModule> => (loading ??= import("./studio.tsx"));

function Root() {
  const [Studio, setStudio] = useState<ComponentType | null>(null);
  const boot = () => loadStudio().then((m) => { setStudio(() => m.Studio); return m; });
  useEffect(() => { if (hadSession() || route.value !== "/") void boot(); }, []);
  document.documentElement.lang = uiLang.value;
  document.documentElement.dir = dir.value;
  return (
    <>
      {Studio ? <Studio /> : (
        <>
          <TopLine signedIn={false} onSignOut={() => {}} onHover={() => void loadStudio()} onSignIn={() => void boot().then((m) => m.signInGoogle())} />
          <Home onPrepare={() => void loadStudio()}
            onGoogle={() => boot().then((m) => m.signInGoogle())}
            onTest={(email) => boot().then((m) => m.signInTest(email))} />
        </>
      )}
      {toast.value ? <div class={`toast${toast.value.bad ? " bad" : ""}`} role="status">{toast.value.text}</div> : null}
    </>
  );
}

render(<Root />, document.getElementById("app")!);
