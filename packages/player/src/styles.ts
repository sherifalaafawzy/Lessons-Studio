/**
 * The player's stylesheet, inside its shadow root. Old-phone rules: no blur, no filters, no
 * backdrop effects; shadows are hard offsets; motion is transform and opacity only.
 * Stage sizes are logical pixels (the stage is scaled to fit); controls and captions use real pixels.
 */
export const CSS = `
:host{display:block;contain:content}
*{box-sizing:border-box}
[hidden]{display:none!important}
.ls-player{
  --ls-font:system-ui,-apple-system,"Segoe UI",Roboto,"Noto Sans","Noto Sans Arabic",Tahoma,sans-serif;
  font-family:var(--ls-font);color:var(--ls-fg);background:var(--ls-bg);border-radius:12px;overflow:hidden;
  -webkit-tap-highlight-color:transparent;line-height:1.35}
.ls-brand-studio-dark{--ls-bg:#0b1020;--ls-surface:#121a2e;--ls-card:#18223b;--ls-fg:#eef2fb;--ls-muted:#a3aecb;
  --ls-line:#3a4a75;--ls-accent:#56c8ff;--ls-on-accent:#04121c;--ls-hi-fg:#56c8ff;--ls-accent2:#ffd166;--ls-danger:#ff6b81;--ls-ok:#4fe0a6;
  --ls-shadow:0 6px 0 #050812;--ls-radius:18px;--ls-cap-bg:rgba(5,8,18,.86);--ls-cap-fg:#fff;--ls-cap-now:#ffd166;--ls-cap-later:rgba(255,255,255,.6)}
.ls-brand-darsi-light{--ls-bg:#f4f1ea;--ls-surface:#fffdf8;--ls-card:#fff;--ls-fg:#1e1a33;--ls-muted:#5a5570;
  --ls-line:#1e1a33;--ls-accent:#ff6a2b;--ls-on-accent:#1e1a33;--ls-hi-fg:#a8340a;--ls-accent2:#ffc53d;--ls-danger:#c62f4f;--ls-ok:#0b7a5c;
  --ls-shadow:0 5px 0 #1e1a33;--ls-radius:16px;--ls-cap-bg:rgba(30,26,51,.92);--ls-cap-fg:#fff;--ls-cap-now:#ffc53d;--ls-cap-later:rgba(255,255,255,.64)}
@media (prefers-contrast:more){.ls-player{--ls-muted:var(--ls-fg)}.ls-node,.ls-step,.ls-phone{border-width:4px!important}}

.ls-main{position:relative}
/* Padding boxes rather than aspect-ratio, for older WebViews. */
.ls-viewport{position:relative;overflow:hidden;background:var(--ls-bg);height:0;padding-top:56.25%;cursor:pointer}
.ls-portrait .ls-viewport{padding-top:177.778%}
.ls-square .ls-viewport{padding-top:100%}
.ls-stage{position:absolute;left:0;top:0;transform-origin:0 0;overflow:hidden}
.ls-scene{position:absolute;top:0;right:0;bottom:0;left:0;display:flex;flex-direction:column;justify-content:center;gap:26px;padding:56px 80px 130px}
.ls-portrait .ls-scene{padding:96px 52px 250px;gap:30px}
.ls-word{display:inline-block}
.ls-cut,.ls-shot{position:absolute;top:0;right:0;bottom:0;left:0;transform-origin:0 0}
.ls-cut{transform-origin:50% 50%}
.ls-wipe{position:absolute;top:0;right:0;bottom:0;left:0;background:var(--ls-accent)}
.ls-layer{position:absolute;left:0;top:0;transform-origin:0 0}
.ls-t-canvas{padding:0}
.ls-el{position:absolute;transform-origin:50% 50%;line-height:1.2}
.ls-el.is-hi{color:var(--ls-hi-fg)!important}
.ls-el-svg{display:block;overflow:visible}
.ls-el-icon svg{display:block;width:100%;height:100%}
.ls-el-image img{display:block;width:100%;height:100%;border-radius:var(--ls-radius)}
.ls-el-code pre{margin:0;font:inherit;font-family:ui-monospace,Menlo,Consolas,monospace;background:var(--ls-card);
  border:3px solid var(--ls-line);border-radius:var(--ls-radius);padding:18px 22px;color:var(--ls-fg);box-shadow:var(--ls-shadow)}
.ls-code-line{display:block;white-space:pre;min-height:1.2em}
.ls-code-line.is-mark{background:var(--ls-surface);box-shadow:inset 5px 0 0 var(--ls-accent)}
.ls-icon{fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;flex:none}
.ls-title{margin:0;font-size:46px;font-weight:800;letter-spacing:-.01em}
.ls-kicker{margin:0;font-size:26px;font-weight:700;color:var(--ls-accent);display:flex;align-items:center;gap:10px}
.ls-brand-darsi-light .ls-kicker{color:var(--ls-fg)}
.is-hi{color:var(--ls-hi-fg)}

.ls-t-title-hook{align-items:center;text-align:center}
.ls-th-icon{width:150px;height:150px;border-radius:40px;background:var(--ls-card);border:3px solid var(--ls-line);
  display:grid;place-items:center;color:var(--ls-accent);box-shadow:var(--ls-shadow)}
.ls-th-title{margin:0;font-size:92px;font-weight:850;line-height:1.08;letter-spacing:-.02em;max-width:1050px}
.ls-portrait .ls-th-title{font-size:78px}
.ls-th-hook{margin:0;font-size:38px;color:var(--ls-muted);max-width:980px}

.ls-steps,.ls-points,.ls-quiz-opts,.ls-callouts{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:18px}
.ls-step{display:flex;align-items:center;gap:22px;padding:20px 26px;border-radius:var(--ls-radius);background:var(--ls-card);
  border:3px solid var(--ls-line);font-size:34px;font-weight:650}
.ls-step.is-now{border-color:var(--ls-accent);box-shadow:var(--ls-shadow)}
.ls-num{flex:none;width:58px;height:58px;border-radius:50%;display:grid;place-items:center;background:var(--ls-accent);
  color:var(--ls-on-accent);font-weight:800;font-size:30px}
.ls-progress{height:10px;border-radius:5px;background:var(--ls-card);overflow:hidden}
.ls-progress-fill{height:100%;background:var(--ls-accent);transform-origin:0 50%}
[dir=rtl] .ls-progress-fill{transform-origin:100% 50%}

.ls-t-flow{justify-content:flex-start}
.ls-flow{position:absolute;top:0;right:0;bottom:0;left:0}
.ls-flow-svg{position:absolute;top:0;right:0;bottom:0;left:0;overflow:visible}
.ls-edge{stroke:var(--ls-muted);stroke-width:5;stroke-linecap:round;fill:none}
.ls-edge.is-hi{stroke:var(--ls-danger)}
.ls-edge-head{fill:var(--ls-muted)}
.ls-packet{fill:var(--ls-accent2);stroke:var(--ls-bg);stroke-width:4}
.ls-node{position:absolute;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;text-align:center;
  border-radius:var(--ls-radius);background:var(--ls-card);border:3px solid var(--ls-line);padding:10px 14px;
  font-size:28px;font-weight:700;box-shadow:var(--ls-shadow);color:var(--ls-fg)}
.ls-node .ls-icon{color:var(--ls-accent)}
.ls-tone-danger .ls-icon{color:var(--ls-danger)}
.ls-tone-trusted .ls-icon{color:var(--ls-ok)}
.ls-node.is-hi{border-color:var(--ls-danger);color:var(--ls-fg)}
.ls-tone-danger.is-hi{background:var(--ls-danger);color:#fff}
.ls-tone-danger.is-hi .ls-icon{color:#fff}
.ls-edge-label-at{position:absolute;transform:translate(-50%,-50%)}
.ls-edge-label-side{transform:translate(14px,-50%)}
[dir=rtl] .ls-edge-label-side{transform:translate(calc(-100% - 14px),-50%)}
.ls-edge-label{display:block;white-space:nowrap;font-size:20px;font-weight:650;padding:4px 12px;border-radius:999px;
  background:var(--ls-bg);color:var(--ls-muted);border:2px solid var(--ls-line)}

.ls-t-message{flex-direction:row;align-items:center;gap:56px}
.ls-portrait .ls-t-message{flex-direction:column;align-items:stretch;justify-content:flex-start;gap:34px}
.ls-phone{flex:none;width:560px;border-radius:36px;background:var(--ls-card);border:3px solid var(--ls-line);box-shadow:var(--ls-shadow);
  padding:22px;display:flex;flex-direction:column;gap:18px}
.ls-portrait .ls-phone{width:auto}
.ls-msg-from{display:flex;align-items:center;gap:14px;font-size:28px;font-weight:750;padding:6px 8px;border-radius:12px}
.ls-avatar{width:54px;height:54px;border-radius:50%;display:grid;place-items:center;background:var(--ls-surface);border:2px solid var(--ls-line)}
.ls-msg-name{flex:1}
.ls-msg-time{font-size:22px;color:var(--ls-muted);font-weight:500}
.ls-bubble{background:var(--ls-surface);border:2px solid var(--ls-line);border-radius:24px;border-start-start-radius:6px;padding:20px 24px;
  display:flex;flex-direction:column;gap:12px}
.ls-msg-subject{margin:0;font-weight:800;font-size:28px}
.ls-msg-line{margin:0;font-size:28px;padding:4px 8px;border-radius:8px;border-inline-start:6px solid transparent}
.ls-msg-link{color:var(--ls-accent);text-decoration:underline;text-align:left;word-break:break-all}
.ls-brand-darsi-light .ls-msg-link{color:#1d4ed8}
.is-flag{border-inline-start-color:var(--ls-danger);background:rgba(255,107,129,.16)}
.ls-msg-from.is-flag{outline:3px solid var(--ls-danger)}
.ls-callouts{flex:1;gap:16px}
.ls-callout{display:flex;align-items:center;gap:16px;font-size:30px;font-weight:700;padding:14px 20px;border-radius:var(--ls-radius);
  background:var(--ls-card);border:3px solid var(--ls-danger)}
.ls-callout .ls-icon{color:var(--ls-danger)}

.ls-t-quiz{gap:30px}
.ls-quiz-prompt{margin:0;font-size:44px;font-weight:800;line-height:1.2}
.ls-portrait .ls-quiz-prompt{font-size:40px}
.ls-quiz-opt{display:flex;align-items:center;gap:20px;font-size:32px;font-weight:650;padding:18px 24px;border-radius:var(--ls-radius);
  background:var(--ls-card);border:3px solid var(--ls-line)}
.ls-letter{flex:none;width:52px;height:52px;border-radius:14px;display:grid;place-items:center;border:3px solid var(--ls-line);font-weight:800}

.ls-point{display:flex;align-items:center;gap:20px;font-size:34px;font-weight:650}
.ls-point .ls-icon{color:var(--ls-ok)}
.ls-takeaway{margin:6px 0 0;padding:22px 28px;border-radius:var(--ls-radius);background:var(--ls-accent);color:var(--ls-on-accent);
  font-size:40px;font-weight:850;box-shadow:var(--ls-shadow)}

.ls-captions{position:absolute;left:0;right:0;bottom:0;padding:0 10px 10px;display:flex;justify-content:center;pointer-events:none}
.ls-cap{margin:0;max-width:94%;padding:6px 12px;border-radius:8px;background:var(--ls-cap-bg);color:var(--ls-cap-later);
  font-size:var(--ls-cap-size,18px);font-weight:600;line-height:1.45;text-align:center}
.ls-cap .is-said{color:var(--ls-cap-fg)}
.ls-cap .is-now{color:var(--ls-cap-now)}
.ls-bigplay{position:absolute;left:50%;top:50%;width:76px;height:76px;margin:-38px 0 0 -38px;border-radius:50%;border:3px solid var(--ls-line);
  background:var(--ls-accent);color:var(--ls-on-accent);display:grid;place-items:center;cursor:pointer;box-shadow:var(--ls-shadow)}
.ls-bigplay .ls-icon{fill:currentColor;stroke:none}

.ls-bar{display:flex;align-items:center;gap:6px;padding:6px 8px;background:var(--ls-surface);border-top:2px solid var(--ls-line);flex-wrap:wrap}
.ls-btn{min-width:44px;height:44px;padding:0 10px;border-radius:10px;border:2px solid transparent;background:transparent;color:var(--ls-fg);
  font:inherit;font-weight:700;display:inline-grid;place-items:center;cursor:pointer}
.ls-btn:hover{border-color:var(--ls-line)}
.ls-btn[aria-pressed=true]{background:var(--ls-card);border-color:var(--ls-line)}
.ls-btn:focus-visible,.ls-seek:focus-visible,.ls-opt:focus-visible,.ls-sent:focus-visible,.ls-bigplay:focus-visible{outline:3px solid var(--ls-accent2);outline-offset:2px}
.ls-play .ls-icon{fill:currentColor;stroke:none}
.ls-time{font-size:14px;font-variant-numeric:tabular-nums;color:var(--ls-muted);padding:0 4px;white-space:nowrap}
.ls-track{position:relative;flex:1;min-width:120px;display:flex;align-items:center}
.ls-seek{width:100%;margin:0;accent-color:var(--ls-accent);height:44px;background:transparent}
.ls-ticks{position:absolute;left:0;right:0;top:50%;height:0;pointer-events:none}
.ls-tick{position:absolute;top:-7px;width:2px;height:14px;background:var(--ls-muted);opacity:.7}
.ls-ai{font-size:12px;color:var(--ls-muted);padding:4px 8px;border:1px solid var(--ls-line);border-radius:999px;white-space:nowrap}

.ls-check,.ls-end{position:absolute;top:0;right:0;bottom:0;left:0;display:flex;align-items:center;justify-content:center;padding:12px;background:rgba(0,0,0,.55)}
.ls-card{width:100%;max-width:560px;max-height:100%;overflow:auto;background:var(--ls-surface);color:var(--ls-fg);border:3px solid var(--ls-line);
  border-radius:16px;box-shadow:var(--ls-shadow);padding:18px;display:flex;flex-direction:column;gap:12px}
.ls-card h3{margin:0;font-size:19px;line-height:1.35}
.ls-card .ls-kicker{font-size:14px}
.ls-opts{display:flex;flex-direction:column;gap:8px}
.ls-opt{display:flex;align-items:center;gap:12px;min-height:48px;padding:8px 12px;border-radius:12px;border:2px solid var(--ls-line);
  background:var(--ls-card);color:var(--ls-fg);font:inherit;font-size:16px;font-weight:600;text-align:start;cursor:pointer}
.ls-opt .ls-letter{width:32px;height:32px;border-radius:9px;border-width:2px;font-size:15px}
.ls-opt.is-right{border-color:var(--ls-ok);box-shadow:inset 0 0 0 2px var(--ls-ok)}
.ls-opt.is-wrong{border-color:var(--ls-danger);box-shadow:inset 0 0 0 2px var(--ls-danger)}
.ls-fb{margin:0;font-weight:800}
.ls-fb.is-right{color:var(--ls-ok)}
.ls-fb.is-wrong{color:var(--ls-danger)}
.ls-explain{margin:0;color:var(--ls-muted)}
.ls-go{align-self:flex-end;min-height:44px;padding:0 18px;border-radius:12px;border:2px solid var(--ls-line);background:var(--ls-accent);
  color:var(--ls-on-accent);font:inherit;font-weight:800;cursor:pointer}
.ls-go:disabled{opacity:.45;cursor:default}

.ls-transcript{max-height:280px;overflow:auto;padding:10px 12px;border-top:2px solid var(--ls-line);background:var(--ls-surface)}
.ls-player[data-tier=text] .ls-transcript{max-height:none}
.ls-player[data-tier=text] .ls-viewport{display:none}
.ls-player[data-tier=text] .ls-check,.ls-player[data-tier=text] .ls-end{position:static;background:none;padding:12px}
.ls-sent{display:block;width:100%;text-align:start;background:none;border:0;border-radius:8px;padding:6px 8px;margin:0;color:var(--ls-muted);
  font:inherit;font-size:16px;line-height:1.5;cursor:pointer}
.ls-sent.is-now{color:var(--ls-fg);background:var(--ls-card);font-weight:650}
.ls-check,.ls-end{z-index:5}
.ls-score{margin:0;font-weight:800;color:var(--ls-ok)}
.ls-tip{position:absolute;bottom:44px;transform:translateX(-50%);display:grid;gap:4px;justify-items:center;pointer-events:none;z-index:6}
.ls-tipt{background:rgba(0,0,0,.86);color:#fff;font-size:12px;padding:3px 8px;border-radius:6px;white-space:nowrap;max-width:240px;overflow:hidden;text-overflow:ellipsis}
.ls-pv{position:relative;width:160px;overflow:hidden;border-radius:6px;border:2px solid #fff;background:var(--ls-bg)}
.ls-pvs{position:absolute;left:0;top:0;transform-origin:0 0;overflow:hidden}
.ls-menu{position:absolute;right:8px;bottom:60px;z-index:7;min-width:220px;max-width:calc(100% - 16px);max-height:70%;overflow:auto;background:var(--ls-surface);
  border:2px solid var(--ls-line);border-radius:12px;padding:6px;box-shadow:var(--ls-shadow)}
[dir=rtl] .ls-menu{right:auto;left:8px}
.ls-mh{margin:6px 8px 4px;font-size:12px;color:var(--ls-muted);font-weight:700}
.ls-mrow{display:flex;gap:4px;padding:0 0 4px}
.ls-mi{display:flex;justify-content:space-between;align-items:center;gap:12px;width:100%;min-height:40px;padding:6px 10px;border:0;border-radius:8px;
  background:transparent;color:var(--ls-fg);font:inherit;font-weight:600;text-align:start;cursor:pointer}
.ls-mrow .ls-mi{flex:1;justify-content:center;padding:6px 4px}
.ls-mi:hover,.ls-mi:focus-visible{background:var(--ls-card)}
.ls-mi.is-on{background:var(--ls-card);box-shadow:inset 0 0 0 2px var(--ls-accent)}
.ls-mt{color:var(--ls-muted);font-variant-numeric:tabular-nums;font-size:13px}
.ls-volr{width:76px;margin:0;accent-color:var(--ls-accent)}
.ls-nocapbg .ls-cap{background:transparent;text-shadow:0 0 4px #000,0 2px 3px #000}
.ls-float .ls-bar{position:absolute;left:0;right:0;bottom:0;z-index:4;background:linear-gradient(transparent,rgba(0,0,0,.8) 50%);border-top:0;
  padding-top:22px;transition:opacity .25s}
.ls-float .ls-bar .ls-btn,.ls-float .ls-time{color:#fff}
.ls-float .ls-ai{color:#ddd;border-color:rgba(255,255,255,.4)}
.ls-float.ls-idle .ls-bar{opacity:0;pointer-events:none}
.ls-float.ls-idle{cursor:none}
.ls-float .ls-captions{transition:padding .25s}
.ls-float:not(.ls-idle) .ls-captions{padding-bottom:64px}
.ls-player:fullscreen{background:#000;display:flex;flex-direction:column;justify-content:center}
.ls-player:fullscreen .ls-main{width:min(100%,calc(100vh * var(--ls-ar,1.78)));margin:0 auto}
@media (max-width:420px){.ls-time,.ls-volr{display:none}}
`;
