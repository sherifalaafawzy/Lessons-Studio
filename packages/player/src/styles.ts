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
.ls-viewport{position:relative;overflow:hidden;background:var(--ls-bg);height:0;padding-top:56.25%;cursor:pointer;touch-action:manipulation}
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
.ls-bigplay{position:absolute;left:50%;top:50%;z-index:3;width:68px;height:68px;margin:-34px 0 0 -34px;border:0;border-radius:50%;
  background:var(--ls-accent);color:var(--ls-on-accent);display:grid;place-items:center;cursor:pointer;box-shadow:var(--ls-shadow)}
.ls-bigplay .ls-icon,.ls-play .ls-icon,.ls-next .ls-icon{fill:currentColor;stroke:none}
.ls-flash{position:absolute;top:0;bottom:0;z-index:3;width:42%;display:flex;align-items:center;justify-content:center;color:#fff;
  font-size:22px;font-weight:800;font-variant-numeric:tabular-nums;pointer-events:none;background:rgba(255,255,255,.22)}
.ls-flash.is-back{left:0;border-radius:0 120px 120px 0}
.ls-flash.is-fwd{right:0;border-radius:120px 0 0 120px}

.ls-bar{display:flex;flex-direction:column;justify-content:flex-end;background:var(--ls-surface);border-top:2px solid var(--ls-line)}
.ls-row{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:2px 4px 4px}
.ls-cluster{display:flex;align-items:center;gap:2px;min-width:0}
.ls-btn{min-width:40px;height:40px;padding:0 6px;border:0;border-radius:8px;background:transparent;color:var(--ls-fg);
  font:inherit;font-weight:700;display:inline-grid;place-items:center;cursor:pointer}
.ls-btn:hover,.ls-btn[aria-pressed=true]{background:var(--ls-card)}
.ls-btn:disabled{opacity:.38;cursor:default}
.ls-btn:focus-visible,.ls-opt:focus-visible,.ls-sent:focus-visible,.ls-bigplay:focus-visible,.ls-volr:focus-visible,.ls-mi:focus-visible{
  outline:3px solid var(--ls-accent2);outline-offset:2px}
.ls-time{flex:none;font-size:13px;font-weight:650;font-variant-numeric:tabular-nums;color:var(--ls-muted);padding:0 6px;white-space:nowrap}
.ls-track{position:relative;height:20px;display:flex;align-items:center;cursor:pointer;touch-action:none}
.ls-track.is-key{outline:3px solid var(--ls-accent2);outline-offset:2px;border-radius:4px}
.ls-rail{position:relative;width:100%;height:4px;border-radius:2px;background:var(--ls-line);transform-origin:50% 50%;overflow:hidden}
.ls-track:hover .ls-rail,.ls-track.is-key .ls-rail,.ls-scrub .ls-rail{transform:scaleY(2)}
.ls-played,.ls-buf{position:absolute;left:0;top:0;bottom:0;width:100%;transform:scaleX(0);transform-origin:0 50%}
.ls-played{background:var(--ls-accent);z-index:1}
.ls-buf{background:var(--ls-muted);opacity:.5;z-index:0}
.ls-ticks{position:absolute;inset:0;z-index:2}
.ls-tick{position:absolute;top:0;bottom:0;width:3px;margin-left:-1px;background:var(--ls-surface)}
.ls-dot{position:absolute;top:50%;z-index:3;width:13px;height:13px;border-radius:50%;background:var(--ls-accent);pointer-events:none;
  transform:translate(-50%,-50%) scale(0)}
.ls-track:hover .ls-dot,.ls-track:focus-within .ls-dot,.ls-scrub .ls-dot{transform:translate(-50%,-50%) scale(1)}
.ls-seek{position:absolute;inset:0;width:100%;height:100%;margin:0;padding:0;cursor:pointer;background:transparent;color:transparent;
  appearance:none;-webkit-appearance:none}
.ls-seek::-webkit-slider-runnable-track{height:100%;background:transparent;border:0}
.ls-seek::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:1px;height:1px;background:transparent;border:0}
.ls-seek::-moz-range-track{height:100%;background:transparent;border:0}
.ls-seek::-moz-range-thumb{width:1px;height:1px;background:transparent;border:0}
.ls-seek:focus{outline:none}
.ls-volbox{position:relative;display:flex;align-items:center}
.ls-volr{position:absolute;inset-inline-start:100%;top:50%;z-index:3;width:84px;height:28px;margin-top:-14px;padding:0 8px;border:0;
  border-radius:8px;background:rgba(0,0,0,.72);accent-color:var(--ls-accent);opacity:0;pointer-events:none;transform:scaleX(0);transform-origin:0 50%}
[dir=rtl] .ls-volr{transform-origin:100% 50%}
.ls-volbox:hover .ls-volr,.ls-volbox:focus-within .ls-volr{opacity:1;pointer-events:auto;transform:scaleX(1)}
.ls-player:not(.ls-float) .ls-volr{background:var(--ls-card);box-shadow:0 0 0 2px var(--ls-line)}
.ls-ai{font-size:12px;color:var(--ls-muted);padding:4px 8px;border:1px solid var(--ls-line);border-radius:999px;white-space:nowrap;background:var(--ls-surface)}

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
.ls-tip{position:absolute;bottom:16px;transform:translateX(-50%);display:grid;gap:4px;justify-items:center;pointer-events:none;z-index:6}
.ls-tipt{background:rgba(0,0,0,.86);color:#fff;font-size:12px;padding:3px 8px;border-radius:6px;white-space:nowrap;max-width:240px;overflow:hidden;text-overflow:ellipsis}
.ls-pv{position:relative;width:160px;overflow:hidden;border-radius:6px;border:2px solid #fff;background:var(--ls-bg)}
.ls-pvs{position:absolute;left:0;top:0;transform-origin:0 0;overflow:hidden}
.ls-menu{position:absolute;right:8px;bottom:84px;z-index:7;min-width:220px;max-width:calc(100% - 16px);max-height:70%;overflow:auto;background:var(--ls-surface);
  border:2px solid var(--ls-line);border-radius:12px;padding:6px;box-shadow:var(--ls-shadow)}
[dir=rtl] .ls-menu{right:auto;left:8px}
.ls-mh{margin:6px 8px 4px;font-size:12px;color:var(--ls-muted);font-weight:700}
.ls-mrow{display:flex;flex-wrap:wrap;gap:4px;padding:0 0 4px}
.ls-mi{display:flex;justify-content:space-between;align-items:center;gap:12px;width:100%;min-height:40px;padding:6px 10px;border:0;border-radius:8px;
  background:transparent;color:var(--ls-fg);font:inherit;font-weight:600;text-align:start;cursor:pointer}
.ls-mrow .ls-mi{flex:1;justify-content:center;padding:6px 4px}
.ls-mi:hover,.ls-mi:focus-visible{background:var(--ls-card)}
.ls-mi.is-on{background:var(--ls-card);box-shadow:inset 0 0 0 2px var(--ls-accent)}
.ls-mt{color:var(--ls-muted);font-variant-numeric:tabular-nums;font-size:13px}
.ls-nocapbg .ls-cap{background:transparent;text-shadow:0 0 4px #000,0 2px 3px #000}
.ls-float .ls-bar{position:absolute;inset:0;z-index:4;background:none;border-top:0;pointer-events:none}
.ls-float .ls-bar::before{content:"";position:absolute;left:0;right:0;bottom:0;height:112px;pointer-events:none;
  background:linear-gradient(transparent,rgba(0,0,0,.4) 38%,rgba(0,0,0,.78))}
.ls-float .ls-row,.ls-float .ls-track{pointer-events:auto}
.ls-float .ls-row{position:relative;z-index:1;padding:0 6px 12px}
.ls-float .ls-track{position:absolute;left:0;right:0;bottom:0;z-index:2}
.ls-float .ls-rail{background:rgba(255,255,255,.3)}
.ls-float .ls-buf{background:#fff;opacity:.5}
.ls-float .ls-tick{background:rgba(0,0,0,.75)}
.ls-float .ls-row .ls-btn,.ls-float .ls-time{color:#fff}
.ls-float .ls-btn:hover{background:rgba(255,255,255,.16)}
.ls-float .ls-btn[aria-pressed=true]{background:transparent}
.ls-float .ls-cc[aria-pressed=false]{opacity:.55}
.ls-float .ls-ai{position:absolute;top:8px;inset-inline-end:8px;z-index:3;color:#eee;border-color:rgba(255,255,255,.45);background:rgba(0,0,0,.45)}
.ls-player:not(.ls-float) .ls-ai{align-self:flex-end;margin:0 8px 6px}
.ls-float.ls-idle .ls-row,.ls-float.ls-idle .ls-bar::before,.ls-float.ls-idle .ls-ai{opacity:0}
.ls-float.ls-idle .ls-row,.ls-float.ls-idle .ls-track{pointer-events:none}
.ls-float.ls-idle{cursor:none}
.ls-row,.ls-ai,.ls-dot,.ls-volr,.ls-rail,.ls-bar::before,.ls-captions{transition:opacity .18s linear,transform .12s linear,padding .18s linear}
.ls-float:not(.ls-idle) .ls-captions{padding-bottom:64px}
@media (prefers-reduced-motion:reduce){
  .ls-row,.ls-ai,.ls-dot,.ls-volr,.ls-rail,.ls-bar::before,.ls-captions{transition:none}
}
.ls-narrow .ls-btn{min-width:34px;padding:0}
.ls-narrow .ls-time{font-size:12px;padding:0 3px}
.ls-narrow .ls-cluster{gap:0}
.ls-narrow .ls-row{gap:2px;padding-left:2px;padding-right:2px}
@media (pointer:coarse){.ls-track{height:28px}.ls-btn,.ls-narrow .ls-btn{height:44px}}
.ls-player:fullscreen{background:#000;display:flex;flex-direction:column;justify-content:center}
.ls-player:fullscreen .ls-main{width:min(100%,calc(100vh * var(--ls-ar,1.78)));margin:0 auto}
.ls-asking:not(.ls-full):not(:fullscreen) .ls-check,.ls-asking:not(.ls-full):not(:fullscreen) .ls-end{position:relative;background:var(--ls-surface);padding:12px 8px}
.ls-asking:not(.ls-full):not(:fullscreen).ls-compact .ls-bar,.ls-asking:not(.ls-full):not(:fullscreen).ls-narrow .ls-viewport{display:none}
.ls-full{position:fixed;top:0;right:0;bottom:0;left:0;z-index:2147483000;background:#000;display:flex;flex-direction:column;justify-content:center;overflow:auto}
.ls-full .ls-main{width:min(100%,calc(100vh * var(--ls-ar,1.78)));margin:0 auto}
.ls-full.ls-turned{top:0;left:100%;right:auto;bottom:auto;width:100vh;height:100vw;transform:rotate(90deg);transform-origin:top left}
.ls-full.ls-turned .ls-main{width:min(100%,calc(100vw * var(--ls-ar,1.78)))}
.ls-full.ls-turned .ls-seek{touch-action:none}
`;
