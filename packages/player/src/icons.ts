import type { IconName } from "@lessonstudio/spec";
import { svg } from "./dom.ts";

/** 24 px icons, 2 px round strokes. */
const PATHS: Record<IconName | "play" | "pause" | "cc" | "list" | "speed", string[]> = {
  user: ["M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z", "M4 21c0-4 3.6-6 8-6s8 2 8 6"],
  page: ["M6 3h9l4 4v14H6z", "M14 3v5h5", "M9 13h7", "M9 17h5"],
  bot: ["M5 8h14v11H5z", "M12 4v4", "M9 13h.01", "M15 13h.01", "M9.5 16h5"],
  server: ["M4 4h16v6H4z", "M4 14h16v6H4z", "M8 7h.01", "M8 17h.01"],
  data: ["M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3z", "M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6", "M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"],
  lock: ["M6 11h12v10H6z", "M8 11V7a4 4 0 0 1 8 0v4"],
  shield: ["M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"],
  phone: ["M8 2h8a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z", "M11 18h2"],
  mail: ["M3 6h18v12H3z", "M3 7l9 6 9-6"],
  link: ["M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1", "M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"],
  warning: ["M12 3l10 18H2z", "M12 10v5", "M12 18h.01"],
  key: ["M8 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z", "M12 12h9", "M18 12v3", "M21 12v2"],
  cloud: ["M7 18h10a4 4 0 0 0 0-8 6 6 0 0 0-11.5 2A3 3 0 0 0 7 18z"],
  chip: ["M7 7h10v10H7z", "M10 3v4", "M14 3v4", "M10 17v4", "M14 17v4", "M3 10h4", "M3 14h4", "M17 10h4", "M17 14h4"],
  wifi: ["M2 9a15 15 0 0 1 20 0", "M5 12.5a10 10 0 0 1 14 0", "M8.5 16a5 5 0 0 1 7 0", "M12 19.5h.01"],
  check: ["M5 12l5 5 9-10"],
  cross: ["M6 6l12 12", "M18 6L6 18"],
  spark: ["M12 3v4", "M12 17v4", "M3 12h4", "M17 12h4", "M12 8l1.5 2.5L16 12l-2.5 1.5L12 16l-1.5-2.5L8 12l2.5-1.5z"],
  play: ["M8 5v14l11-7z"],
  pause: ["M8 5v14", "M16 5v14"],
  cc: ["M3 6h18v12H3z", "M10 10.5a2 2 0 1 0 0 3", "M17 10.5a2 2 0 1 0 0 3"],
  list: ["M8 6h13", "M8 12h13", "M8 18h13", "M3 6h.01", "M3 12h.01", "M3 18h.01"],
  speed: ["M12 21a9 9 0 1 1 9-9", "M12 12l5-4"],
};

export type AnyIcon = keyof typeof PATHS;

export function icon(name: AnyIcon, size = 24, cls = "ls-icon"): SVGElement {
  return svg(
    "svg",
    { viewBox: "0 0 24 24", width: size, height: size, className: cls, "aria-hidden": "true", focusable: "false", "data-icon": name },
    ...(PATHS[name] ?? PATHS.spark).map((d) => svg("path", { d })),
  );
}
