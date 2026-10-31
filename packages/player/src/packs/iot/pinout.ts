import type { Element } from "@lessonstudio/spec";
import type { KitRenderer } from "../../templates/types.ts";
import { at, clock, clamp01, F, fix, mix, pt, say, svg, symbol, text, tw, type Sym } from "./common.ts";

type PinoutElement = Extract<Element, { type: "pinout" }>;

/** The boards as drawn: on their side, USB to the left; each edge's pins left to right (spec: packs/iot/check.ts BOARDS). */
export const BOARD_PINS: Record<string, { name: string; top: string[]; bottom: string[] }> = {
  pico: {
    name: "Pico",
    top: ["VBUS", "VSYS", "GND", "3V3_EN", "3V3", "ADC_VREF", "GP28", "AGND", "GP27", "GP26", "RUN", "GP22", "GND", "GP21", "GP20", "GP19", "GP18", "GND", "GP17", "GP16"],
    bottom: ["GP0", "GP1", "GND", "GP2", "GP3", "GP4", "GP5", "GND", "GP6", "GP7", "GP8", "GP9", "GND", "GP10", "GP11", "GP12", "GP13", "GND", "GP14", "GP15"],
  },
  esp32: {
    name: "ESP32",
    top: ["VIN", "GND", "D13", "D12", "D14", "D27", "D26", "D25", "D33", "D32", "D35", "D34", "VN", "VP", "EN"],
    bottom: ["3V3", "GND", "D15", "D2", "D4", "RX2", "TX2", "D5", "D18", "D19", "D21", "RX0", "TX0", "D22", "D23"],
  },
  microbit: { name: "micro:bit", top: [], bottom: ["0", "1", "2", "3V", "GND"] },
};

/** Places items along a line in their order, as near their wish as their widths allow. */
function spread(items: { d: number; l: number; r: number }[], lo: number, hi: number, gap = 12): number[] {
  const x = items.map((i) => i.d);
  for (let i = 0; i < x.length; i++) x[i] = Math.max(x[i]!, i ? x[i - 1]! + items[i - 1]!.r + items[i]!.l + gap : lo + items[i]!.l);
  for (let i = x.length - 1; i >= 0; i--) x[i] = Math.min(x[i]!, i < x.length - 1 ? x[i + 1]! - items[i + 1]!.l - items[i]!.r - gap : hi - items[i]!.r);
  return x;
}

/**
 * A board with its pins, drawn simply, and parts wired to pins beside it (breadboard-lite): each part hangs from its
 * pin's wire (an LED through its resistor) down to a ground rail joined to a GND pin; a sensor module also takes 3V3.
 * Frames light the pins that are high (and their wires), the parts that are on, a micro:bit's lights and buttons.
 */
export const pinout: KitRenderer = (el, box, ctx) => {
  const e = el as PinoutElement;
  box.setAttribute("dir", "ltr");
  const W = e.w ?? 1000;
  const H = e.h ?? 520;
  const rtl = ctx.dir === "rtl";
  const wr = ctx.wr;
  const bd = BOARD_PINS[e.board] ?? BOARD_PINS.pico!;
  const mb = e.board === "microbit";
  const parts = e.parts ?? [];
  const edgeOf = (pin: string): 1 | -1 => (bd.top.includes(pin) ? -1 : 1);
  const has = (dir: number): boolean => parts.some((p) => edgeOf(p.pin) === dir);
  const resIn = (dir: number): boolean => parts.some((p) => edgeOf(p.pin) === dir && (p.res || p.kind === "led"));
  const zoneH = (dir: number): number => (has(dir) ? 24 + 16 * Math.min(3, parts.filter((p) => edgeOf(p.pin) === dir).length) + 14 + (resIn(dir) ? 6.6 : 3.4) * 27 + 12 : 0);
  const zT = zoneH(-1), zB = zoneH(1);
  const bh = Math.max(120, Math.min(mb ? 380 : 280, H - zT - zB - 8));
  const bw = mb ? Math.min(W - 40, bh * 1.5) : Math.min(W - 80, Math.max(bh * 2.6, W * 0.84));
  const x0 = (W - bw) / 2;
  const y0 = zT + (H - zT - zB - bh) / 2;
  // Where each header pin is.
  const pos = new Map<string, number[]>();
  const holes: { name: string; x: number; y: number; dir: number }[] = [];
  for (const [list, dir] of [[bd.top, -1], [bd.bottom, 1]] as const) {
    list.forEach((name, k) => {
      const x = mb ? x0 + bw * (0.16 + k * 0.17) : x0 + bw * 0.1 + (k * bw * 0.86) / (list.length - 1);
      const y = dir < 0 ? y0 + 18 : mb ? y0 + bh - 20 : y0 + bh - 18;
      holes.push({ name, x, y, dir });
      if (!pos.has(name)) pos.set(name, [x, y]);
    });
  }
  // The ground pin each zone's rail joins: the GND on that edge nearest its parts.
  const gndOf = (dir: number): number[] | undefined => {
    const mine = parts.filter((p) => edgeOf(p.pin) === dir);
    if (!mine.length) return undefined;
    const mid = mine.reduce((a, p) => a + pos.get(p.pin)![0]!, 0) / mine.length;
    const g = holes.filter((h) => h.dir === dir && h.name === "GND").sort((a, b) => Math.abs(a.x - mid) - Math.abs(b.x - mid))[0];
    return g ? [g.x, g.y] : undefined;
  };

  const root = svg("svg", { width: W, height: H, viewBox: `0 0 ${W} ${H}`, className: "ls-el-svg pi", direction: "ltr" });
  const gBoard = svg("g");
  const gLabels = svg("g");
  root.append(gBoard, gLabels);
  gBoard.append(svg("rect", { x: fix(x0, 1), y: fix(y0, 1), width: fix(bw, 1), height: fix(bh, 1), rx: 18, className: "pi-s pi-board" }));
  const name = e.name ? ctx.t(e.name) : bd.name;
  let led: SVGElement | null = null;
  const cells: SVGElement[] = [];
  const buttons: Record<string, SVGElement> = {};
  if (mb) {
    const m = Math.min(bw * 0.06, bh * 0.075);
    const cy = y0 + bh * 0.4;
    for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) {
      const cell = svg("rect", { x: fix(x0 + bw / 2 + (c - 2) * m * 1.7 - m / 2, 1), y: fix(cy + (r - 2) * m * 1.7 - m / 2, 1), width: fix(m, 1), height: fix(m, 1), rx: 3, className: "pi-mx" });
      gBoard.append(cell);
      cells.push(cell);
    }
    for (const [b, x] of [["A", x0 + bw * 0.14], ["B", x0 + bw * 0.86]] as const) {
      const g = svg("g");
      buttons[b] = svg("circle", { cx: fix(x, 1), cy: fix(cy, 1), r: fix(Math.max(26, bh * 0.08), 1), className: "pi-s pi-key" });
      g.append(buttons[b]!);
      text(g, x, cy + 11, b, false, "middle");
      gBoard.append(g);
    }
    if (e.name) text(gBoard, x0 + 24, y0 + 44, name, rtl, "left");
    // The edge's big pads, labelled on them.
    holes.forEach((h) => {
      gBoard.append(svg("rect", { x: fix(h.x - bw * 0.0775, 1), y: fix(y0 + bh * 0.75, 1), width: fix(bw * 0.155, 1), height: fix(bh * 0.25 + 6, 1), rx: 10, className: "pi-s pi-pad" }));
      text(gLabels, h.x, y0 + bh * 0.75 + 36, h.name, false, "middle");
    });
  } else {
    gBoard.append(svg("rect", { x: fix(x0 - 24, 1), y: fix(y0 + bh * 0.36, 1), width: 36, height: fix(bh * 0.28, 1), rx: 5, className: "pi-s pi-usb" }));
    const ch = Math.max(44, bh - 2 * 80);
    const cw = e.board === "esp32" ? bw * 0.3 : Math.max(tw(name) + 30, Math.min(bw * 0.2, ch * 1.4));
    const cx = e.board === "esp32" ? x0 + bw * 0.78 : x0 + bw / 2;
    gBoard.append(svg("rect", { x: fix(cx - cw / 2, 1), y: fix(y0 + (bh - ch) / 2, 1), width: fix(cw, 1), height: fix(ch, 1), rx: 6, className: "pi-chip" }));
    text(gBoard, cx, y0 + bh / 2 + 11, name, rtl, "middle", F, "pi-t pi-inv");
    led = svg("rect", { x: fix(x0 + bw * 0.05 - 14, 1), y: fix(y0 + bh / 2 - 9, 1), width: 28, height: 18, rx: 4, className: "pi-s pi-bled" });
    gBoard.append(led);
  }
  const holeEls = holes.map((h) => {
    const c = svg("circle", { cx: fix(h.x, 1), cy: fix(h.y, 1), r: mb ? 12 : 8, className: "pi-hole" });
    gBoard.append(c);
    return c;
  });

  // Pin labels inside the board, spread so none overlap, with a leader line when moved.
  const named = new Set<string>([...(e.pins ?? []), ...parts.map((p) => p.pin)]);
  const labels = new Map<string, SVGElement>();
  const rings = new Map<string, SVGElement>();
  if (!mb) {
    for (const dir of [-1, 1]) {
      const gp = gndOf(dir);
      const firstGnd = holes.find((h) => h.dir === dir && h.name === "GND");
      const railed = parts.length > 0;
      const unique = holes.filter((h) => h.dir === dir && (h.name !== "GND" ? named.has(h.name) : gp ? h.x === gp[0] : !railed && named.has("GND") && h === firstGnd));
      const xs = spread(unique.map((h) => ({ d: h.x, l: tw(h.name) / 2, r: tw(h.name) / 2 })), x0 + 10, x0 + bw - 10, 22);
      unique.forEach((h, i) => {
        const g = svg("g", { className: "pi-pl" });
        const ly = dir < 0 ? y0 + 66 : y0 + bh - 40;
        if (Math.abs(xs[i]! - h.x) > 3) g.append(svg("path", { d: `M${pt(h.x, h.y + dir * -10)}L${pt(xs[i]!, ly + (dir < 0 ? -26 : 4))}`, className: "pi-lead" }));
        text(g, xs[i]!, ly, h.name, false, "middle");
        gLabels.append(g);
        if (!labels.has(h.name)) labels.set(h.name, g);
      });
    }
  }
  for (const [n, [x, y]] of pos) {
    const r = svg("circle", { cx: fix(x!, 1), cy: fix(y!, 1), r: mb ? 22 : 16, className: "pi-ring" });
    gBoard.append(r);
    rings.set(n, r);
  }

  // The parts, a zone per edge: wires from the pins, the parts, the ground rail.
  interface Drawn { p: (typeof parts)[number]; g: SVGElement; sym?: Sym; wire: SVGElement; value?: SVGElement }
  const drawn: Drawn[] = [];
  const rails: SVGElement[] = [];
  for (const dir of [-1, 1] as const) {
    const mine = parts.filter((p) => edgeOf(p.pin) === dir).sort((a, b) => pos.get(a.pin)![0]! - pos.get(b.pin)![0]!);
    if (!mine.length) continue;
    const gp = gndOf(dir);
    const edge = dir < 0 ? y0 : mb ? y0 + bh + 6 : y0 + bh;
    const zone = dir < 0 ? zT : zB;
    const res = resIn(dir);
    const items = mine.map((p) => {
      const words = [p.label ? ctx.t(p.label) : "", ...(e.frames ?? []).map((f) => f.values?.[p.id] ?? ""), p.res ?? "", p.kind === "sensor" ? "3V3" : ""];
      return { d: pos.get(p.pin)![0]!, l: 76, r: 66 + Math.max(...words.map((s) => tw(s))), p };
    });
    const slots = gp ? [...items, { d: gp[0]!, l: 12, r: 12, p: null }].sort((a, b) => a.d - b.d) : items;
    const xs = spread(slots, 10, W - 10, 18);
    // Jogs: a wire going right turns lower the further left its pin is (and the mirror for wires going left).
    const go = slots.map((s, i) => ({ s, x: xs[i]!, from: s.d }));
    const rights = go.filter((g) => g.x > g.from + 1).sort((a, b) => a.from - b.from);
    const lefts = go.filter((g) => g.x < g.from - 1).sort((a, b) => b.from - a.from);
    const level = new Map<object, number>();
    rights.forEach((g, i) => level.set(g.s, rights.length - 1 - i));
    lefts.forEach((g, i) => level.set(g.s, lefts.length - 1 - i));
    const levels = Math.max(rights.length, lefts.length);
    const d0 = 24 + 16 * levels + 14;
    const u = Math.max(14, Math.min(34, (zone - d0 - 12) / (res ? 6.6 : 3.4)));
    const dP = d0 + (res ? 3.2 * u : 0);
    const dR = dP + 3.4 * u;
    const Y = (d: number): number => edge + dir * d;
    const railX = [Math.min(...xs) - 10, Math.max(...xs) + 10];
    const rail = svg("path", { d: `M${pt(railX[0]!, Y(dR))}H${fix(railX[1]!, 1)}`, className: "pi-w pi-rail" });
    rails.push(rail);
    root.append(rail);
    go.forEach(({ s, x, from }) => {
      const jog = Y(24 + 16 * (level.get(s) ?? 0));
      const top = Y(dP);
      const g = svg("g", { className: "pi-part" });
      const wire = svg("path", { d: `M${pt(from, dir < 0 ? y0 + 18 : edge)}V${fix(jog, 1)}H${fix(x, 1)}V${fix(s.p ? top : Y(dR), 1)}`, className: "pi-w" });
      g.append(wire);
      root.append(g);
      if (!s.p) { g.append(svg("circle", { cx: fix(x, 1), cy: fix(Y(dR), 1), r: 7, className: "pi-j" })); rails.push(g); return; }
      const p = s.p;
      const lx = x + 1.6 * u + 16;
      if (p.res || p.kind === "led") {
        g.append(svg("path", { d: `M${pt(x, Y(d0))}V${fix(top, 1)}`, className: "pi-w" }));
        const r = symbol(wr, "resistor", u * 0.9, 2.6 * u * 0.9, 1, 90);
        r.g.setAttribute("transform", `translate(${pt(x, Y(d0 + 1.6 * u))}) rotate(90)`);
        g.append(r.g);
        if (p.res) text(g, lx, Y(d0 + 1.6 * u) + 11, p.res, false, "left", F, "pi-t pi-m");
      }
      // The part between its wire and the rail.
      const cy = Y(dP + 1.7 * u);
      const B = p.kind === "sensor" ? 2.2 * u : ({ led: 1.7, button: 3, buzzer: 3, motor: 2.5 } as Record<string, number>)[p.kind]! * u;
      g.append(svg("path", { d: `M${pt(x, top)}V${fix(Y(dP + 1.7 * u - B / 2), 1)}M${pt(x, Y(dP + 1.7 * u + B / 2))}V${fix(Y(dR), 1)}`, className: "pi-w" }));
      g.append(svg("circle", { cx: fix(x, 1), cy: fix(Y(dR), 1), r: 7, className: "pi-j" }));
      let sym: Sym | undefined;
      if (p.kind === "sensor") {
        const m = svg("g");
        m.append(svg("rect", { x: fix(x - 1.3 * u, 1), y: fix(cy - 1.1 * u, 1), width: fix(2.6 * u, 1), height: fix(2.2 * u, 1), rx: 8, className: "pi-s" }));
        m.append(svg("circle", { cx: fix(x, 1), cy: fix(cy, 1), r: fix(0.55 * u, 1), className: "pi-eye" }));
        m.append(svg("path", { d: `M${pt(x + 0.8 * u, cy + 1.1 * u)}V${fix(cy + 1.7 * u, 1)}H${fix(x + 1.5 * u, 1)}`, className: "pi-w" }));
        text(m, x + 1.6 * u + 6, cy + 1.7 * u + 11, "3V3", false, "left", F, "pi-t pi-m");
        g.append(m);
      } else {
        const rot = dir > 0 ? 90 : -90;
        sym = symbol(wr, p.kind, u, B, dir > 0 ? -1 : 1, rot, p.color);
        sym.g.setAttribute("transform", `translate(${pt(x, cy)}) rotate(${rot})`);
        g.append(sym.g);
      }
      const name = p.label ? ctx.t(p.label) : "";
      const hasV = !!e.frames?.some((f) => f.values?.[p.id]);
      if (name) text(g, lx, cy + (hasV ? -6 : 11), name, rtl, "left");
      const value = hasV ? text(g, lx, cy + (name ? 34 : 11), "", false, "left", F, "pi-t pi-v") : undefined;
      drawn.push({ p, g, sym, wire, ...(value ? { value } : {}) });
    });
  }
  box.append(root);

  const N = 2 + drawn.length;
  return (st) => {
    const { a, b, k, n } = at(e.frames, st.frame);
    const level = (pin: string): boolean => (n?.pins?.[pin] ?? 0) >= 0.5;
    wr.style(gBoard, "opacity", fix(clamp01(st.reveal * N)));
    wr.style(gLabels, "opacity", fix(clamp01(st.reveal * N - 1)));
    for (const r of rails) wr.style(r, "opacity", fix(clamp01(st.reveal * N - 2)));
    holes.forEach((h, i) => wr.cls(holeEls[i]!, "is-hi", level(h.name)));
    const focus = Math.round(st.focus);
    const fp = focus >= 1 ? e.pins?.[focus - 1] : undefined;
    for (const [nm, r] of rings) wr.style(r, "opacity", nm === fp ? "1" : "0");
    for (const [nm, g] of labels) wr.cls(g, "is-on", nm === fp);
    if (led) wr.cls(led, "is-hi", level("LED") || (e.board === "esp32" && level("D2")));
    for (const [nm, c] of Object.entries(buttons)) wr.cls(c, "is-hi", level(nm));
    const mx = n?.matrix ?? "";
    cells.forEach((c, i) => wr.cls(c, "is-lit", mx[i] === "1"));
    drawn.forEach((d, i) => {
      wr.style(d.g, "opacity", fix(clamp01(st.reveal * N - 2 - i)));
      wr.cls(d.wire, "pi-hot", level(d.p.pin));
      const on = mix(a?.on, b?.on, k, d.p.id);
      d.sym?.paint({ on, closed: on, sense: 0, over: false, spin: clock(st) });
      if (d.value) say(d.value, n?.values?.[d.p.id] ?? "");
    });
  };
};
