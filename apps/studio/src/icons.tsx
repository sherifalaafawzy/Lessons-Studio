// The studio's icons: 24×24 strokes, drawn with currentColor (styles.css .ico).
const PATHS = {
  scenes: "M3 5h18v14H3zM3 9h18M8 5v4M16 5v4",
  add: "M12 5v14M5 12h14",
  layers: "M12 3 2 8l10 5 10-5zM2 13l10 5 10-5M2 18l10 5 10-5",
  play: "M7 4.5v15l12-7.5z",
  pause: "M8 5v14M16 5v14",
  back: "M11 6 5 12l6 6M19 6l-6 6 6 6",
  fwd: "M13 6l6 6-6 6M5 6l6 6-6 6",
  stepBack: "M15 6l-6 6 6 6M7 6v12",
  stepFwd: "M9 6l6 6-6 6M17 6v12",
  loop: "M17 2l3 3-3 3M4 11V9a4 4 0 0 1 4-4h12M7 22l-3-3 3-3M20 13v2a4 4 0 0 1-4 4H4",
  zoomIn: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4M11 8v6M8 11h6",
  zoomOut: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4M8 11h6",
  fit: "M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5",
  safe: "M3 5h18v14H3zM6 8h12v8H6z",
  center: "M12 3v18M3 12h18",
  thirds: "M3 5h18v14H3zM9 5v14M15 5v14M3 10h18M3 14h18",
  undo: "M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3",
  redo: "M15 14l5-5-5-5M20 9H10a6 6 0 0 0 0 12h3",
  export: "M12 3v12M7 8l5-5 5 5M5 15v4h14v-4",
  preview: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z",
  command: "M9 6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3z",
  keyboard: "M3 7h18v10H3zM7 11h.01M11 11h.01M15 11h.01M7 14h10",
  close: "M6 6l12 12M18 6 6 18",
  down: "M6 9l6 6 6-6",
  up: "M6 15l6-6 6 6",
  eye: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z",
  mic: "M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7",
  upload: "M12 15V4M7.5 8.5 12 4l4.5 4.5M4 15v5h16v-5",
  check: "M5 12.5l4.5 4.5L19 7.5",
  trash: "M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, label }: { name: IconName; label?: string }) {
  return (
    <svg class="ico" viewBox="0 0 24 24" aria-hidden={label ? undefined : "true"} role={label ? "img" : undefined} aria-label={label}>
      <path d={PATHS[name]} />
    </svg>
  );
}
