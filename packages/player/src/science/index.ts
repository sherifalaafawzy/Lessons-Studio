/**
 * The science kit: equations, plots, networks, architecture diagrams and tables. A separate chunk the player loads
 * only for lessons that use these elements (PlayerOptions.science), so every other lesson stays at the core's size.
 */
import type { Kit } from "../templates/types.ts";
import { arch } from "./arch.ts";
import { math } from "./math.ts";
import { net } from "./net.ts";
import { plot } from "./plot.ts";
import { table } from "./table.ts";

// Old-phone rules hold here too: no filters or blur, hard edges, motion by transform and opacity.
const CSS = `
.lm-box{display:flex;align-items:center;width:100%;height:100%}
.lm{display:inline-block;white-space:nowrap;line-height:1.15;transform-origin:50% 50%;
  font-family:"Cambria Math","STIX Two Math","Latin Modern Math","Noto Serif","Times New Roman",serif;font-style:normal}
.lm i,.lm-i{font-style:italic}.lm .lm-up{font-style:normal}
.lm-b{margin:0 .22em}.lm-r{margin:0 .3em}.lm-p{margin-inline-end:.18em}
.lm-x{font-style:normal;margin:0 .08em}
.lm-w{font-family:var(--ls-font);font-style:normal;font-size:.72em;font-weight:700}
.lm-f{display:inline-flex;flex-direction:column;vertical-align:middle;text-align:center;margin:0 .12em}
.lm-fn{border-bottom:.06em solid currentColor;padding:0 .18em .06em}.lm-fd{padding:.1em .18em 0}
.lm-f .lm-f,.lm-ss .lm-f{font-size:.84em}
.lm-sup,.lm-sub{font-size:.68em}.lm-sup{vertical-align:.62em}.lm-sub{vertical-align:-.32em}
.lm-ss{display:inline-flex;flex-direction:column;vertical-align:-.5em;font-size:.68em;line-height:1.05;margin-inline-start:.04em}
.lm-sq{display:inline-flex;align-items:stretch;vertical-align:middle;margin:0 .06em}
.lm-sqw{position:relative;width:.55em;flex:none}.lm-sqb{border-top:.06em solid currentColor;padding:.1em .1em 0}
.lm-sqi{font-size:.55em;margin-inline-end:-.35em;align-self:flex-start}
.lm-dw{position:relative;width:.38em;flex:none;margin:0 .04em}
.lm-dw svg,.lm-sqw svg{position:absolute;left:0;top:0;width:100%;height:100%;overflow:visible}
.lm-big{display:inline-flex;flex-direction:column;align-items:center;vertical-align:middle;margin:0 .15em;line-height:1}
.lm-bs{font-size:1.7em;line-height:1}.lm-bn{font-style:normal}.lm-bl{font-size:.62em}
.lm-acc{display:inline-flex;flex-direction:column;align-items:center;vertical-align:bottom;line-height:1}
.lm-am{font-size:.62em;margin-bottom:-.5em;line-height:.8;font-style:normal}
.lm-bar{border-top:.06em solid currentColor;padding-top:.05em}
.lm-bf,.lm-bf i{font-weight:700;font-style:normal}
.lm-fence{display:inline-flex;align-items:stretch;vertical-align:middle}
.lm-mat{display:inline-grid;gap:.18em .7em;padding:.12em .2em;align-items:center;justify-items:center}
.lm-stack{display:inline-grid;grid-template-columns:auto auto;row-gap:.28em;column-gap:.15em;align-items:center;vertical-align:middle}
.lm-sl{display:contents}.lm-sll{justify-self:end}.lm-slr{justify-self:start}
.lm-g{display:inline-block;border-radius:.15em}
.lm-g.is-on{color:var(--ls-hi-fg);box-shadow:0 .1em 0 currentColor}
.lp text,.ln text,.la-svg text{font-family:var(--ls-font)}
.lp-axis{stroke:var(--ls-fg);stroke-width:3}.lp-grid{stroke:var(--ls-line);stroke-width:1.5;opacity:.18}
.lp-zero{stroke:var(--ls-muted);stroke-width:2;stroke-dasharray:6 6}
.lp-line{fill:none;stroke:currentColor;stroke-width:6;stroke-linejoin:round;stroke-linecap:round}
.lp-thin{stroke-width:4}.lp-area{fill:currentColor;fill-opacity:.2;stroke:currentColor;stroke-width:4}
.lp-dot{fill:currentColor;stroke:var(--ls-fg);stroke-width:2.5}
.lp-ball{fill:currentColor;stroke:var(--ls-fg);stroke-width:4}.lp-trail{stroke:currentColor;stroke-width:4;stroke-dasharray:4 8;opacity:.7}
.lp-s.is-on .lp-line{stroke-width:9}
.lp-lb{fill:var(--ls-bg);fill-opacity:.88;stroke:var(--ls-line);stroke-opacity:.25}
.ln-w{stroke:var(--ls-accent)}.ln-w.is-neg{stroke:var(--ls-muted);stroke-dasharray:7 6}
.ln-w.is-fwd{stroke:var(--ls-hi-fg)}.ln-w.is-back{stroke:var(--ls-danger)}
.ln-n{fill:var(--ls-card);stroke:var(--ls-fg);stroke-width:3.5}.ln-n.is-on{stroke:var(--ls-accent);stroke-width:7}
.ln-a{fill:var(--ls-accent);pointer-events:none}
.ln-v{fill:var(--ls-fg);font-weight:800}.ln-l{fill:var(--ls-fg);font-weight:700}.ln-ll{fill:var(--ls-muted)}
.la{position:relative}.la-svg{position:absolute;left:0;top:0}
.la-e path{stroke:var(--ls-fg);stroke-width:3.5;stroke-linejoin:round}.la-e polygon{fill:var(--ls-fg)}
.la-skip path{stroke:var(--ls-muted);stroke-dasharray:9 7}.la-skip polygon{fill:var(--ls-muted)}
.la-el{fill:var(--ls-muted);font-weight:600}
.la-g rect{fill:none;stroke:var(--ls-muted);stroke-width:2.5;stroke-dasharray:10 8}
.la-gl{fill:var(--ls-muted);font-weight:700}.la-gr{fill:var(--ls-fg);font-weight:800}
.la-p{fill:var(--ls-accent);stroke:var(--ls-fg);stroke-width:3}.la-p.is-back{fill:var(--ls-danger)}
.la-b{position:absolute;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:.15em;text-align:center;
  background:var(--ls-card);color:var(--ls-fg);border:3px solid var(--ls-fg);border-radius:14px;box-shadow:var(--ls-shadow);
  padding:4px 10px;line-height:1.15;overflow:visible}
.la-t{font-weight:800}.la-n{color:var(--ls-muted);font-weight:600}
.la-b.is-on{outline:5px solid var(--ls-accent);outline-offset:4px}
.la-k-input,.la-k-output{border-radius:999px;background:var(--ls-surface)}
.la-k-attn{background:var(--ls-accent);color:var(--ls-on-accent)}.la-k-attn .la-n{color:var(--ls-on-accent)}
.la-k-embed,.la-k-model{background:var(--ls-accent2);color:var(--ls-on-accent)}.la-k-embed .la-n,.la-k-model .la-n{color:var(--ls-on-accent)}
.la-k-norm{background:var(--ls-surface);border-width:2px;box-shadow:none}
.la-k-conv,.la-k-pool{box-shadow:7px -7px 0 -3px var(--ls-card),7px -7px 0 0 var(--ls-fg),14px -14px 0 -3px var(--ls-card),14px -14px 0 0 var(--ls-fg)}
.la-k-softmax,.la-k-act{border-color:var(--ls-ok);border-radius:28px}
.la-k-store{border-radius:50%/18%}
.la-k-tool{border-style:dashed;box-shadow:none}
.la-k-add,.la-k-concat{border-radius:50%;padding:0;box-shadow:none}
.la-glyph{font-size:34px;font-weight:800;line-height:1}
.la-side{position:absolute;inset-inline-start:calc(100% + 12px);white-space:nowrap;font-size:26px;font-weight:700;color:var(--ls-muted)}
.la-loop{position:absolute;top:-6px;inset-inline-end:6px;font-size:26px;font-weight:800;color:var(--ls-accent)}
.lt{border-collapse:collapse;width:100%;background:var(--ls-card);border:3px solid var(--ls-fg);box-shadow:var(--ls-shadow)}
.lt th,.lt td{padding:.32em .6em;border-bottom:2px solid var(--ls-line);text-align:start}
.lt th{background:var(--ls-surface);font-weight:800}.lt td.lt-num{text-align:end;font-variant-numeric:tabular-nums}
.lt td.is-accent,.lt td.is-hot{background:var(--ls-accent);color:var(--ls-on-accent);font-weight:800}
.lt td.is-ok{background:var(--ls-ok);color:var(--ls-on-accent);font-weight:800}
.lt td.is-danger{background:var(--ls-danger);color:var(--ls-on-accent);font-weight:800}
.lt td.is-accent2,.lt td.is-warm{background:var(--ls-accent2);color:var(--ls-on-accent);font-weight:800}
.lt tr.is-on td{background:var(--ls-accent2);color:var(--ls-on-accent);font-weight:800}
`;

export const kit: Kit = { draw: { math, plot, net, arch, table }, css: CSS };
