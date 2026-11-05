/**
 * Technology packs: groups of canvas element types the player draws with a separate file, loaded only by lessons that
 * use one of them (and saved with a course downloaded for offline use). The element type names are fixed here, so
 * every part of Lesson Studio (validator, player, studio, converter, Darsi) knows which pack an element needs.
 * docs/packs.md is the contract; each pack's own page is docs/packs/<id>.md.
 */
export const PACKS = {
  /** Equations, plots, neural networks, model architectures, tables (docs/science.md). */
  science: ["math", "plot", "net", "arch", "table"],
  /** Programming: code running line by line, flowcharts, arrays being sorted, call trees, a bug and its fix. */
  code: ["trace", "flowchart", "array", "calltree", "codediff"],
  /** Data: entity-relationship diagrams, a SQL query step by step, data pipelines, spreadsheets. */
  data: ["erd", "query", "pipeline", "sheet"],
  /** Electronics and IoT: circuits with current flowing, board pinouts, sensor signals, logic gates, bits. */
  iot: ["circuit", "pinout", "signal", "gates", "bits"],
  /** Networks and the internet: topologies with packets, sequence diagrams, protocol layers, a packet's fields. */
  network: ["topology", "sequence", "layers", "packet"],
  /** Optimization: graphs and shortest paths or routes, timetables and Gantt charts, knapsacks, LP regions, search trees. */
  opt: ["graph", "schedule", "knapsack", "lp", "searchtree"],
} as const;

export type PackId = keyof typeof PACKS;
export type PackType = (typeof PACKS)[PackId][number];
export const PACK_IDS = Object.keys(PACKS) as PackId[];
export const PACK_TYPES: readonly PackType[] = PACK_IDS.flatMap((id) => PACKS[id]);

/**
 * The tracks a lesson can belong to, and the packs that teach that track. The studio lists a lesson's own packs
 * first. A track can use more than one pack (data science uses data and science). Agents use the science pack,
 * whose architecture diagrams include an agent and retrieval.
 */
export const TRACKS = ["ai", "cyber", "iot", "code", "data", "data-science", "agents", "opt", "aisec"] as const;
export type TrackId = (typeof TRACKS)[number];
export const TRACK_PACKS: Record<TrackId, readonly PackId[]> = {
  ai: ["science"],
  cyber: ["network"],
  iot: ["iot"],
  code: ["code"],
  data: ["data"],
  "data-science": ["data", "science"],
  agents: ["science"],
  opt: ["opt"],
  aisec: ["network", "science"],
};

/** The packs for a track, or none when the lesson has no track or an unknown one. */
export function packsForTrack(track: string | undefined): PackId[] {
  if (!track || !(TRACKS as readonly string[]).includes(track)) return [];
  return [...TRACK_PACKS[track as TrackId]];
}

/** The pack that draws an element type, or undefined for the player's own elements. */
export function packOf(type: string): PackId | undefined {
  for (const id of PACK_IDS) if ((PACKS[id] as readonly string[]).includes(type)) return id;
  return undefined;
}
