/**
 * Networks and the internet pack: the element types `topology`, `sequence`, `layers`, `packet` (docs/packs/network.md).
 * Each interface extends PackElementBase and has `type` set to one of them.
 */
import type { Text, Tone } from "../../types.ts";
import type { PackElementBase } from "../base.ts";

/** The devices a topology draws, as simple glyphs the pack draws itself. */
export type NetDevice =
  | "phone" | "laptop" | "desktop" | "router" | "switch" | "server" | "cloud" | "tower" | "sensor" | "gateway" | "satellite";
/** Every glyph: the devices, and the people and things a sequence diagram or a topology also needs. */
export type NetGlyph = NetDevice | "user" | "bot" | "tool" | "globe" | "database" | "browser" | "eye" | "lock" | "shield";

export interface TopoNode {
  /** /^[A-Za-z0-9_-]{1,40}$/, unique in the element. */
  id: string;
  kind: NetGlyph;
  label?: Text;
  /** A small line under the label: an address ("192.168.1.10"), a role. */
  note?: Text;
  /** Its centre in the element's box (pixels from its top-left corner), instead of the layout's place. */
  x?: number;
  y?: number;
  tone?: Tone;
  /** Wi-Fi range: rings around the device, this many pixels out. */
  range?: number;
  /** Switched off or broken (always, or from this `frame` on). */
  down?: boolean;
  downAt?: number;
}

export interface TopoLink {
  from: string;
  to: string;
  /** "wired" (solid, default), "wireless" (dashed) or "down" (broken, in the danger colour). */
  kind?: "wired" | "wireless" | "down";
  label?: Text;
  /** The link breaks at this `frame` (a route after it has to go another way). */
  downAt?: number;
}

/** A message travelling hop by hop: device ids, each linked to the next. */
export interface TopoRoute {
  path: string[];
  /** What it carries, in a tag that travels with it ("Hello", "24 °C"). */
  label?: Text;
  tone?: Tone;
}

/** A dashed frame around some devices, with a name: "Your home", "The internet". */
export interface TopoZone {
  devices: string[];
  label: Text;
  tone?: Tone;
}

/**
 * Devices and the links between them, laid out automatically or by hand. `reveal` brings the devices in (in `devices`
 * order, links once both ends are there); `focus` lights the n-th device; `frame` moves the packets along the routes
 * (frame k → k + 1 carries route k + 1, and leaves it at the end); `pass` 0 → 1 carries route `frame + 1` there and
 * 1 → 2 brings it back (the answer). Mirrors in right-to-left languages unless `fixed`.
 */
export interface TopologyElement extends PackElementBase {
  type: "topology";
  devices: TopoNode[];
  links: TopoLink[];
  /** "star" (the first device in the middle, default), "line", "tree" (from the first device down) or "mesh". */
  layout?: "star" | "line" | "tree" | "mesh";
  routes?: TopoRoute[];
  zones?: TopoZone[];
  /** Label size in stage pixels (default from the stage: 34 on a 1280-wide stage). */
  size?: number;
  frame?: number;
}

export interface SeqParticipant {
  id: string;
  glyph?: NetGlyph;
  label: Text;
  tone?: Tone;
}

/** An arrow from one participant to another (or to itself: a step it takes alone). */
export interface SeqMessage {
  from: string;
  to: string;
  label: Text;
  /** An answer: a dashed arrow. */
  reply?: boolean;
  /** Sent encrypted: a lock beside the label. */
  lock?: boolean;
  tone?: Tone;
}

/** A note across one or two participants' lifelines, after the first `after` messages. */
export interface SeqNote {
  after: number;
  over: string[];
  text: Text;
  tone?: Tone;
}

/**
 * A sequence diagram: participants as columns, messages as numbered arrows in order (answers dashed), and notes.
 * `reveal` goes message by message (the participants first); `focus` lights the n-th message. In right-to-left
 * languages the participants run right to left and the arrows follow, unless `fixed`.
 */
export interface SequenceElement extends PackElementBase {
  type: "sequence";
  participants: SeqParticipant[];
  messages: SeqMessage[];
  notes?: SeqNote[];
  /** Number the messages (default true). */
  numbers?: boolean;
  size?: number;
}

export interface NetLayer {
  name: Text;
  /** The header this layer adds to the message ("TCP", "IP"); none for layers that add nothing. */
  header?: Text;
  /** A small line under the name: what the layer takes care of ("ports", "addresses"). */
  note?: Text;
  tone?: Tone;
}

/**
 * A protocol stack, top (application) first, for the sender and the receiver side by side. A message goes down the
 * sender's stack gaining each layer's header (encapsulation), crosses the link, and climbs the receiver's stack losing
 * them. `frame`: 0 … n − 1 the sender's layers, n − 1 → n the link, n … 2n − 1 the receiver's layers (top last);
 * `pass` 0 → 1 makes the whole trip and 1 → 2 the answer's trip back. `reveal` brings the layers in, top first, then
 * the message; `focus` lights the n-th layer. The stacks mirror in right-to-left languages unless `fixed`; the
 * message's headers always read left to right, outermost first, as on the wire.
 */
export interface LayersElement extends PackElementBase {
  type: "layers";
  layers: NetLayer[];
  /** What the application sends ("Hello!"). */
  payload: Text;
  sender?: Text;
  receiver?: Text;
  /** The link between the two machines ("Wi-Fi", "cable"). */
  link?: Text;
  /** Draw only the sender's stack (encapsulation alone). */
  single?: boolean;
  size?: number;
  frame?: number;
}

export interface PacketField {
  /** What the field is ("Source IP"). */
  name: Text;
  /** What's in it ("192.168.1.20"); always left to right. */
  value: Text;
  /** How big it is ("4 B"). */
  size?: string;
  tone?: Tone;
  /** Encrypted at `frame` 1 (HTTPS): an eavesdropper sees `cipher` instead. */
  secret?: boolean;
  cipher?: string;
}

/** A header's or the payload's name over the fields it covers (`span` fields in turn). */
export interface PacketGroup {
  label: Text;
  span: number;
  tone?: Tone;
}

/**
 * A packet's fields as a row of boxes, left to right as on the wire in every language. `reveal` brings the fields in;
 * `focus` lights the n-th field; `frame` 0 → 1 encrypts the secret fields (HTTPS: the addresses still show, the
 * content doesn't). With `watch`, an eye marks what anyone on the way can read, and a lock what they can't.
 */
export interface PacketElement extends PackElementBase {
  type: "packet";
  fields: PacketField[];
  groups?: PacketGroup[];
  watch?: boolean;
  size?: number;
  frame?: number;
}

export type NetworkPackElement = TopologyElement | SequenceElement | LayersElement | PacketElement;
export type { PackElementBase };
