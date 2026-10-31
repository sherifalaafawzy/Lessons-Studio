# Network pack: networks and the internet

Four canvas element types for lessons about home and school networks, the internet, HTTPS, DNS, sensor networks, MQTT
and AI agents calling tools. The player draws them with the network pack (`packages/player/src/packs/network/`, about
11 KB gzipped), loaded only by lessons that use them. Every frame is a pure function of its state; text is estimated,
never measured while playing.

| Type | Draws | Teaches | Mirrors in Arabic? |
|---|---|---|---|
| `topology` | Devices and links, Wi-Fi range, zones, packets hopping along routes, broken links | Home and school networks, the path across the internet, mesh networks healing | Yes, unless `fixed` |
| `sequence` | Participants, numbered messages in order, answers, notes | DNS, the HTTPS handshake, HTTP, MQTT, an agent asking before it calls a tool | Yes, unless `fixed` |
| `layers` | The sender's and receiver's protocol stacks and a message between them | Encapsulation: each layer adds its header on the way down and removes it on the way up | The stacks yes; the message's headers stay left to right |
| `packet` | A packet's fields as boxes, encrypted on cue | What an eavesdropper sees with HTTP and with HTTPS | No: left to right as on the wire |

Types: `packages/spec/src/packs/network/types.ts`. Validation: `packages/spec/src/packs/network/check.ts` (limits in
`NET_LIMITS`: 16 devices, 30 links, 8 routes of up to 12 devices, 4 zones; 6 participants, 14 messages, 6 notes; 2–7
layers; 10 fields).

**Glyphs.** Devices and participants use simple glyphs drawn by the pack: `phone`, `laptop`, `desktop`, `router`,
`switch`, `server`, `cloud`, `tower` (cell tower), `sensor`, `gateway`, `satellite`, plus `user`, `bot`, `tool`, `globe`,
`database`, `browser`, `eye` (someone watching), `lock` and `shield`.

**Text.** Labels are 34 px on a 1280-wide stage (`size` changes it; never under 24 on any stage), notes and secondary
labels 32 px. Long labels wrap to two lines and shrink a little before they do. In right-to-left languages every
left-to-right run in a label (an address, `school.example`, `24 °C`, `book(lab2, Tue 10:00)`) is isolated with LRI … PDI
(SVG has no `<bdi>`), a label with no Arabic letters stays left to right, and wrapping never breaks inside such a run.

## Animation

| Prop | `topology` | `sequence` | `layers` | `packet` |
|---|---|---|---|---|
| `reveal` (0–1) | Devices in `devices` order; a link once both ends are in; zones and rings with their first device | The participants, then each row (messages and notes, in order); an arrow travels from the sender to the receiver | The layers top first, then the link, then the message | The fields left to right, a header's name with its first field |
| `frame` | Frame k → k + 1 carries route k + 1 (hop by hop, pausing at each device) and leaves it at the end; links and devices with `downAt` break at that frame | | 0 … n − 1 the sender's layers, n − 1 → n the link, n … 2n − 1 the receiver's layers (top last) | 0 → 1 encrypts the `secret` fields |
| `focus` (from 1) | The n-th device | The n-th message | The n-th layer, in both stacks | The n-th field |
| `pass` | 0 → 1 carries route ⌊frame⌋ + 1 there, 1 → 2 brings it back | | 0 → 1 makes the whole trip, 1 → 2 the answer's trip back | |

So the studio's presets work: `type` reveals, `forward` and `backward` play `pass` (a layers element's whole trip; a
topology's first route there and back). `train` plays `frame` 0 → 1 only, because these elements have no `frames` list:
for a packet that is the encryption, for a topology its first route, for the stack its first step (keyframe the rest, or
use `encapsulationKeys`).

## Topology (`topology`)

```json
{ "id": "net", "type": "topology", "x": 80, "y": 150, "w": 1120, "h": 540, "layout": "star",
  "devices": [
    { "id": "router", "kind": "router", "label": { "en": "Home router", "ar": "الموجّه المنزلي" }, "note": "192.168.1.1", "range": 190 },
    { "id": "phone", "kind": "phone", "label": { "en": "Phone", "ar": "الهاتف" } },
    { "id": "net", "kind": "cloud", "label": { "en": "The internet", "ar": "الإنترنت" } } ],
  "links": [ { "from": "phone", "to": "router", "kind": "wireless" }, { "from": "router", "to": "net" } ],
  "routes": [ { "path": ["phone", "router", "net"], "label": { "en": "Request", "ar": "طلب" } },
              { "path": ["net", "router", "phone"], "label": { "en": "Answer", "ar": "الجواب" }, "tone": "ok" } ] }
```

- **Layouts:** `star` (default: the first device in the middle, the others round it, filling the box), `line` (in
  order; down the box when it is tall), `tree` (levels from the first device down, through the links), `mesh` (rows,
  every other one offset). A device with `x` and `y` (its centre, in the element's box) keeps that place. Cards are as
  big as the room allows.
- **Devices:** `kind`, `label`, `note` (an address, a role), `tone`, `range` (Wi-Fi rings, in pixels), `down` or
  `downAt` (a cross in the danger colour).
- **Links:** `wired` (solid), `wireless` (dashed, in the accent colour), `down` (broken: dotted danger with a cross);
  `downAt` breaks it at a frame; `label` beside its middle.
- **Routes:** each consecutive pair must be linked (`noLink`); the validator warns when a route crosses a link or device
  that is broken by its frame (`routeDown`). The packet carries its `label` as a tag above it; the tag fades between
  devices, where it would cover labels. Its trail lights hop by hop.
- **Zones:** a dashed frame round some devices with a name at its top (`Your home`, `The internet`), at least as wide as
  its name; frames side by side share the space between them.

## Sequence (`sequence`)

```json
{ "id": "flow", "type": "sequence", "x": 80, "y": 150, "w": 1120, "h": 540,
  "participants": [ { "id": "you", "glyph": "browser", "label": { "en": "Your browser", "ar": "متصفحك" } },
                    { "id": "site", "glyph": "server", "label": "grades.example" } ],
  "messages": [ { "from": "you", "to": "site", "label": { "en": "Hello! Let's talk safely", "ar": "مرحبًا! لنتحدث بأمان" } },
                { "from": "site", "to": "you", "label": { "en": "Certificate and key share", "ar": "الشهادة وجزء المفتاح" }, "reply": true },
                { "from": "you", "to": "site", "label": { "en": "Show my grades", "ar": "أرني درجاتي" }, "lock": true, "tone": "ok" } ],
  "notes": [ { "after": 2, "over": ["you"], "text": { "en": "Checks the certificate", "ar": "يتحقق من الشهادة" } } ] }
```

- Messages are numbered (`numbers: false` to hide them) on the sender's lifeline; `reply` is dashed, `lock` puts a lock
  before the label, `tone` colours the arrow. A message to oneself loops out to the side (a step taken alone).
- A note sits after the first `after` messages, over one or two participants (yellow, `tone` to change).
- A label may run past its arrow's end (one label per row); rows are sized once from their labels. The validator warns
  (`tooTall`) when the rows want more height than the box has: about 6 rows fit a landscape body. Split longer flows.

## Layers (`layers`)

```json
{ "id": "stack", "type": "layers", "x": 80, "y": 150, "w": 1120, "h": 540,
  "layers": [ { "name": { "en": "Application", "ar": "التطبيقات" }, "header": "HTTP", "note": { "en": "the message", "ar": "الرسالة" } },
              { "name": { "en": "Transport", "ar": "النقل" }, "header": "TCP", "note": { "en": "ports", "ar": "المنافذ" } },
              { "name": { "en": "Internet", "ar": "الإنترنت" }, "header": "IP", "note": { "en": "addresses", "ar": "العناوين" } },
              { "name": { "en": "Link", "ar": "الربط" }, "header": "Wi-Fi", "note": { "en": "the next hop", "ar": "القفزة التالية" } } ],
  "payload": { "en": "Hello!", "ar": "مرحبًا!" }, "sender": { "en": "Your phone", "ar": "هاتفك" }, "receiver": { "en": "The server", "ar": "الخادم" },
  "link": { "en": "Wi-Fi and cables", "ar": "الواي فاي والكابلات" } }
```

- The message (the headers, outermost first, then the payload) sits beside the layer at work, with a pointer to it;
  each header comes in as it reaches its layer and goes as it leaves it on the way up. It crosses under the stacks along
  the link. Layers without a `header` (OSI's presentation and session, the physical layer) add none.
- Colours, top first: application accent, transport accent2, internet ok, link muted; OSI's seven keep TCP/IP's colour
  for the layers they share. `tone` per layer changes it.
- `single` draws only the sender (encapsulation alone). In a tall box (portrait) the receiver's stack is under the
  sender's and the link runs down their side. The stacks give up width before the message's text would shrink.

## Packet (`packet`)

```json
{ "id": "packet", "type": "packet", "x": 80, "y": 150, "w": 1120, "h": 540, "watch": true,
  "fields": [ { "name": { "en": "To", "ar": "إلى" }, "value": "203.0.113.10", "size": "4 B" },
              { "name": { "en": "Port", "ar": "المنفذ" }, "value": "443", "size": "2 B" },
              { "name": { "en": "Password", "ar": "كلمة المرور" }, "value": "maths2026", "size": "9 B", "secret": true, "cipher": "d5c4 6651" } ],
  "groups": [ { "label": "IP", "span": 1, "tone": "accent" }, { "label": "TCP", "span": 1, "tone": "accent2" },
              { "label": { "en": "Data", "ar": "البيانات" }, "span": 1, "tone": "ok" } ] }
```

- Each field: its name and value in a box (values always left to right), its size under it. Groups name the fields they
  cover (`span` in turn; the spans must cover every field). Rows wrap when the box is narrow.
- `frame` 0 → 1 turns each `secret` value into its `cipher` on a dark well. With `watch`, an eye marks what anyone on
  the way can read and a lock what they can't: at frame 0 everything has an eye.

## Authoring helpers and presets

`packages/ops/src/packs/network.ts` (also `packs.network` from `@lessonstudio/ops`):

- `route(topology, from, to, { frame?, avoid? })`: the fewest hops, breadth first, skipping broken links and devices
  (and those broken by `frame`). Throws when there is no way.
- `encapsulationFrames(n | element)`: `{ down, cross, up, last }`, the frame at each layer of the trip.
- `encapsulationKeys(n, { down, cross, up }, move)`: `frame` keyframes, one step per spoken word: `down[k]` moves the
  message from layer k to k + 1, `cross` over the link, `up[k]` one layer up the receiver's stack.
- Sequences: `dnsLookup`, `tlsHandshake`, `httpRequest`, `mqttPubSub`, `agentToolCall` (or `sequencePreset(name, box,
  langs)`), and `sequenceReveal(el, moments)` (the participants, then each row on its moment).
- Topologies: `homeWifi`, `schoolNetwork`, `internetPath`, `sensorMesh` (or `topologyPreset(name, box, langs)`).
- `layersPreset("tcpip" | "tcpip5" | "osi", box, langs, payload?)`; packets: `httpsPacket`, `framePacket` (or
  `packetPreset`), and `cipher(value, seed)` (hex, the same every time).
- `element(type, langs, box)`: a default element of each type for the studio; `stageFrame(stage)`: where a scene's
  headline and body go on each stage shape.
- Addresses and names are the documentation ones (`203.0.113.x`, `192.168.1.x`, `*.example`).

`presets(langs, stage)`: eleven gallery scenes, each with narration in English and Arabic and keyframes on spoken words,
laid out for landscape, portrait or square:

| Id | Element | What it shows |
|---|---|---|
| `net-home` | topology | A home: Wi-Fi and a cable to the router, a request out to the internet and the answer back |
| `net-path` | topology | Laptop, home router, provider, routers on the way, the website: a request hopping across |
| `net-school` | topology | A school network as a tree: router, lab switch, Wi-Fi point, server |
| `net-mesh` | topology | Sensors passing a reading to the gateway; a link breaks and the next reading goes round |
| `net-dns` | sequence | Phone, resolver, name servers, website |
| `net-tls` | sequence | The HTTPS handshake, then requests locked; someone on the same Wi-Fi watching |
| `net-mqtt` | sequence | Subscribe, publish, the broker passing readings on, a too-hot warning |
| `net-agent` | sequence | An AI agent asks the teacher before it calls the booking tool |
| `net-layers` | layers | Down the TCP/IP stack and up again, a header per layer, on the spoken words |
| `net-osi` | layers | The seven OSI layers, the top three lit as the application layer's work |
| `net-https` | packet | What anyone on café Wi-Fi can read with HTTP, and what HTTPS scrambles |

`examples/pack-network` ("How the internet carries a message", made by `scripts/examples/pack-network.ts`) uses eight
of them, every element type.

## Storyboard bodies

`scripts/darsi/packs/network.ts`, in `design.json`. Sentences count from 0; every list is checked and errors name the
scene.

```json
{ "topology": { "preset": "home-wifi", "s": 0, "focus": [{ "device": "router", "s": 1 }], "play": [2, 3] } }
{ "topology": { "layout": "mesh", "devices": [{ "id": "gw", "kind": "gateway", "label": {…} }, …],
                "links": [["gw", "a", "wireless"], …], "down": [{ "link": ["a", "c"], "after": 1 }],
                "routes": [{ "from": "c", "to": "gw", "label": "24 °C" }, { "from": "c", "to": "gw", "label": "25 °C" }], "play": [1, 2] } }
{ "sequence": { "preset": "dns", "rows": [1, 1, 2, 2, 2, 3], "focus": [{ "message": 5, "s": 3 }] } }
{ "sequence": { "participants": [{ "id": "app", "glyph": "phone", "label": {…} }, …],
                "messages": [{ "from": "app", "to": "broker", "text": "SUBSCRIBE room1/temp" }, …], "notes": [{ "after": 2, "over": ["broker"], "text": {…} }] } }
{ "layers": { "model": "tcpip", "payload": {…}, "down": [1, 1, 1], "cross": 2, "up": [3, 3, 3] } }
{ "layers": { "model": "osi", "frames": [1, 3], "focus": [{ "layer": 4, "s": 2 }] } }
{ "packet": { "preset": "https", "encrypt": 2, "focus": [{ "field": 4, "s": 1 }] } }
```

- `topology`: a `preset` (`home-wifi`, `school`, `internet-path`, `sensor-mesh`) or `devices` and `links` (pairs, or
  triples with the kind), `zones`; `routes` written out (`path`) or found (`from`, `to`, at that route's frame, so after
  a `down` link); `play` gives each route's sentence (about two seconds each); `s` brings the devices in.
- `sequence`: a `preset` (`dns`, `tls`, `http`, `mqtt`, `agent`) or `participants`, `messages` (`text`, `reply`, `lock`,
  `tone`) and `notes`; `rows` gives each message and note (in order) its sentence, a second apart on the same sentence,
  else they spread over the scene.
- `layers`: `model` (`tcpip`, `tcpip5`, `osi`), `payload`, `sender`, `receiver`, `link`, `single`; either `down`,
  `cross` and `up` (a sentence per step) or `frames: [a, b]` (the whole trip over those sentences).
- `packet`: a `preset` (`https`, `frame`) or `fields` and `groups`; `encrypt` (the sentence it scrambles on), `watch`.

## Right to left

- Topologies and sequences mirror their x positions (the first participant on the right); the stacks of `layers`
  mirror (the sender on the right). Packets and the message's headers keep the wire's order, left to right.
- Labels read right to left only when they hold Arabic letters; left-to-right runs inside them are isolated.
