# Science elements: equations, plots, networks, architectures and tables

Five canvas element types for lessons about AI, maths, data and optimisation. The player draws them with its **science
kit** (`packages/player/src/science/`, about 14 KB gzipped), a separate file it loads only for lessons that use them, so
every other lesson stays at the core player's size. Everything is drawn from data: no pictures, no math fonts, nothing
measured while playing, so every frame is still a pure function of time and the MP4 matches the phone.

| Type | Draws | Mirrors in Arabic? |
|---|---|---|
| `math` | An equation in a TeX subset, built part by part | No: set left to right like a textbook (or Arabic school notation, below) |
| `plot` | Axes with functions, training curves, points by class, decision regions, a moving marker | No (charts stay left to right) |
| `net` | A neural network neuron by neuron: weights, activations, data flowing forward and the error back | Yes, unless `fixed` |
| `arch` | A model's architecture as blocks and arrows: CNN, RNN, transformer, GPT, agents… | Yes, unless `fixed` |
| `table` | A table that fills row by row | Columns follow the language; numbers and `ltr` columns stay left to right |

Types: `packages/spec/src/types.ts`. Validation: `packages/spec/src/science/check.ts` (limits in `SCIENCE_LIMITS`).

## Animation

Besides `x`, `y`, `scale`, `rotate`, `opacity`:

- **`reveal`** (0–1): parts come in. Equations by `\g` part, plots draw their lines left to right and bring dots in order,
  networks layer by layer, diagrams block by block along the flow, tables row by row.
- **`frame`** (from 0; fractions blend): which snapshot to show, for plots and networks that have frames (training
  rounds, gradient descent steps, k-means steps).
- **`focus`** (from 1; 0 is none): light one part: an equation's `\g` part, a plot's series, a network's layer, a
  diagram's block (in `blocks` order), a table's row.
- **`pass`** (networks and diagrams): 0 → 1 sends data forward, 1 → 2 sends the error back; −1 hides it.

Presets (`packages/ops/src/presets.ts`): `type` (reveal), **`train`** (frame 0 → last), **`forward`** and **`backward`**
(pass). Like every keyframe, these can be anchored to a spoken word in each language.

## Equations (`math`)

```json
{ "id": "eq", "type": "math", "x": 80, "y": 170, "w": 1120, "h": 140, "size": 64,
  "tex": "\\g{1}{y} = \\sigma\\left(\\g{2}{w_1 x_1 + w_2 x_2} \\g{3}{+ \\c{accent}{b}}\\right)" }
```

- **What works:** letters (italic) and numbers; `+ − = < > ( ) [ ] , ; : ! ' | /`; `^` and `_` (with braces for more
  than one character); `\frac{a}{b}`; `\sqrt{x}` and `\sqrt[n]{x}`; `\sum`, `\prod` and `\int` with limits;
  `\max_x`, `\min`, `\lim`, `\argmax`; Greek letters (`\alpha` … `\omega`, `\Sigma`…); `\cdot \times \le \ge \ne
  \approx \to \in \partial \nabla \infty \ldots`; `\hat \bar \vec \tilde \dot`; `\mathbf`, `\text`, `\mathrm`,
  `\operatorname{softmax}`; `\log \ln \exp \sin \cos \tanh`; `\left( … \right)` (stretchy brackets);
  `\begin{bmatrix} a & b \\ c & d \end{bmatrix}` (also `matrix`, `pmatrix`, `vmatrix`, `cases`; up to 6 × 6);
  spaces `\, \; \quad`.
- **Darsi's own:**
  - `\g{n}{…}`: part n comes in with `reveal` and lights up with `focus`.
  - `\c{tone}{…}`: a colour (`accent`, `accent2`, `ok`, `danger`, `muted`, `fg`). Use it to tie a term to the
    same thing in a diagram.
  - `\w{key}`: a word from the element's `words` (`{ "loss": { "en": "loss", "ar": "الخسارة" } }`), in the lesson
    language.
- **Per language:** `tex` can be one string or one per language. The `\g` parts must match across languages.
- **Arabic school notation:** with `"notation": "arabic"`, a right-to-left language sets the equation right to left
  with Arabic-Indic digits. Write that language's `tex` with Arabic letters (`ص = أ س + ب`).
- **Fitting:** the equation is shrunk once to fit its box, when first shown. Make the box the size you mean.
- **Limits:** at most 400 characters. The validator parses every equation and names the place it can't read.

## Plots (`plot`)

`xr` and `yr` are the axes' ranges; `xLabel` and `yLabel` are per language; `xTicks` and `yTicks` (else round ones);
`grid`. Series, at most 8:

- **`fn`:** y = an expression in `x` and the parameters `a b c d`, e.g. `"a*x + b"`, `"sigmoid(x)"`,
  `"max(0, x)"`, `"(x-2)^2/2 + 0.5"`.
  - Functions: `sin cos tan tanh exp log ln log2 log10 sqrt abs floor ceil round sign sigmoid relu step`, plus two-value
    `max min pow`.
  - Constants: `pi` and `e`. Write `2*pi`, not `2pi`.
  - `params` gives one set of parameters per frame, blended between frames: a fitted line turning as it learns.
- **`line`, `area`, `dots`:** `pts` as `[x, y]`, or `frames` (one set per frame, blended: points moving).
  - Dots take class colours from `cls` (0 accent, 1 ok, 2 danger, 3 accent2), or `clsFrames` per frame (points
    changing group).
- **`heat`:** a grid of cells over the whole plot (rows from the top), at most 32 × 32: class ids, or values 0–1 with
  `scale`. `frames` too. Decision regions as a model trains.
- **`hline` and `vline`:** a threshold or a target.
- **`marker`:** one point per frame with its `trail`: gradient descent rolling downhill.
- **`label`** names a series in the legend (per language).

## Networks (`net`)

`layers` counts neurons per layer (`[2, 4, 4, 1]`; up to 8 layers of 10, 40 neurons, 200 lines).

- `weights[frame][layer][from][to]` and `acts[frame][layer][neuron]` (−1 to 1). Without weights, a fixed spread is
  drawn.
- `labels.in`, `labels.out` and `labels.layers` are per language. `values` writes the activations in the neurons.
- Lines: thicker for stronger weights, solid for positive, dashed for negative.

## Architectures (`arch`)

`blocks` (`id`, `kind`, `label`, `note`, `tone`), `edges` (`from`, `to`, `label`, `skip`), `groups` (`blocks`,
`label`, `repeat`) and `flow` (`right`, `down` or `up`).

- **Layout:** automatic, in layers along the flow (the longest path from an input). Arrows (skips aside) must not
  loop: draw a loop with a `skip` arrow back.
- **Skip arrows** (residual connections, a tool's result going back to the model) go around the side.
- **Groups** get a dashed frame, a name, and "× N".
- **Kinds:**
  - `input` and `output`: pills.
  - `embed` and `model`: yellow.
  - `attn`: the accent colour.
  - `conv` and `pool`: stacked slabs.
  - `norm`: thin.
  - `add` and `concat`: circles with + and ‖.
  - `softmax` and `act`: rounded.
  - `rnn`: with a loop mark.
  - `store`: a cylinder.
  - `tool`: dashed.
  - `dense`, `ffn` and `box`: plain.

**Ready-made** (`archPreset(name, box, langs)` in `packages/ops/src/science.ts`, labels in English and Arabic): `mlp`,
`cnn`, `rnn`, `transformer` (encoder block × 6), `gpt` (decoder-only × 12), `seq2seq`, `resnet` (residual block),
`autoencoder`, `gan`, `agent` (model, memory, tools), `rag`.

## Tables (`table`)

`cols` (per language), `rows` (strings, numbers or per-language text; at most 12 rows of 8 columns), `ltr` (columns
that stay left to right: code, ids), `size`.

## Content computed when the lesson is made

`packages/ops/src/science.ts`: everything is seeded, so the same call gives the same lesson.

- `trainNet({ layers, data, epochs, lr, frames })` trains a small network for real on a two-class dataset (`xor`,
  `circle`, `moons`, `line`, `spiral`). It returns per frame the weights, a sample's activations, the decision map, each
  point's predicted class, the loss and the accuracy.
- `trainingPlot` (decision map and points), `lossPlot` (the loss curve, labelled), `trainingNet` (the network with its
  weights per frame).
- `descend` and `descentPlot` (gradient descent on a curve), `fitLine` (a line fitted step by step), `kmeans` (centres
  and groups per step).
- `tx(en, ar, langs)` writes a label for the lesson's languages (the Arabic for every Arabic variant).

`examples/inside-a-neural-network` (made by `scripts/make-science-example.ts`) uses all of it. In Darsi storyboards,
`design.json` has `equation`, `plot`, `training`, `descent`, `network`, `arch` and `table` bodies (see
`content/darsi/README.md`).

## Right to left

- Networks and diagrams mirror (inputs on the right). Plots, equations and code don't. Tables follow the language.
- Labels and blocks go through `rich()`. Every left-to-right run inside Arabic text (Latin words, numbers, codes,
  `x ≤ 10`, `96–98%`, `2-opt`, `[14, 74]`) is isolated in `<bdi dir="ltr">` (`packages/player/src/bidi.ts`).
