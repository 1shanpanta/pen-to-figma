# Pen to Figma

Figma plugin that converts [Pencil](https://pencil.evolveui.com/) `.pen` design files into native, editable Figma nodes. Not screenshots. Not flattened images. Real frames with auto-layout, real text with loaded fonts, real colors, real strokes.

## The problem

Pencil is built for AI-to-design workflows (Claude Code + MCP tools). Figma is built for human collaboration and developer handoff. There's no bridge between them. You design in Pencil, then you're stuck.

This plugin is that bridge. Export your `.pen` data as JSON, load it into Figma, get editable screens on your canvas.

## What converts

| Pencil | Figma | Notes |
|--------|-------|-------|
| Frames + auto-layout (vertical, horizontal) | Frames + auto-layout | Gap, padding, justify, align all preserved |
| Text (font family, size, weight, style, spacing) | Text nodes with loaded fonts | Fallback chain tries multiple style name variations per weight, falls back to Inter |
| `fill_container` / `fit_content` sizing | `FILL` / `HUG` sizing | Frames without explicit dimensions default to HUG |
| Solid fills (`#RRGGBB`, `#RRGGBBAA`, `#RGB`) | Solid paints with opacity | Alpha channel parsed from 8-digit hex |
| Gradients (linear, radial, angular) | Gradient paints | Rotation converted to affine transform matrix |
| Strokes (solid color, per-side thickness) | Strokes with individual side weights | `inside` / `center` / `outside` alignment |
| Corner radius (uniform + per-corner `[TL, TR, BR, BL]`) | Corner radius | Both uniform and individual |
| Effects (drop shadow, inner shadow, layer blur, background blur) | Effects | Applied to frames, rectangles, and ellipses |
| Rectangles, ellipses, lines | Rectangles, ellipses | Including fill_container sizing |
| `layoutPosition: "absolute"` | `layoutPositioning: "ABSOLUTE"` | Nodes removed from auto-layout flow |
| Clip content | `clipsContent: true` | Overflow hidden |
| Opacity, rotation | Opacity, rotation | Direct mapping |
| Icon fonts (Lucide, etc.) | Placeholder frame with icon name label | Swap manually from a Figma Lucide library |
| Image fills | Gray placeholder rectangle | Drop in real images manually |
| Component instances (`ref` nodes) | Flattened frames | No linked components yet |
| Paths / SVG vectors | Rectangle placeholder | Shape preserved as bounding box only |

## Setup

Requires Node.js 18+ and Figma Desktop.

```bash
git clone https://github.com/1shanpanta/pen-to-figma.git
cd pen-to-figma
npm install
npm run build
```

Output: `dist/code.js` (20KB, es6 target for Figma's QuickJS sandbox).

## Usage

### Step 1: Export .pen data as JSON

The `.pen` file format is managed by Pencil's editor. To get the data out, use the Pencil MCP tools via Claude Code:

```
# Read all screens with full depth
batch_get({
  filePath: "your-file.pen",
  nodeIds: ["screen1-id", "screen2-id", ...],
  readDepth: 10
})
```

Save the returned JSON array to a `.json` file. Each element is a top-level screen frame with nested children.

The JSON format is a flat array of screen objects:
```json
[
  {
    "type": "frame",
    "name": "01 — Login",
    "width": 393,
    "height": 852,
    "layout": "vertical",
    "children": [...]
  },
  ...
]
```

### Step 2: Import the plugin into Figma

1. Open **Figma Desktop** (not the web app, plugins require desktop)
2. Open any design file (the plugin menu only appears inside a file, not the home screen)
3. Click the **Figma menu** (top-left corner) or right-click the canvas
4. **Plugins > Development > Import plugin from manifest...**
5. Navigate to and select `pen-to-figma/manifest.json`

You only need to do this once. The plugin stays in your dev plugins list.

### Step 3: Run the plugin

1. Inside a Figma file, open **Plugins > Development > Pen to Figma**
2. Click **Load from file** and select your `.json` export
3. Or paste the JSON directly into the text area
4. Click **Import to Figma**
5. The plugin pre-loads all fonts, then creates each screen
6. When done, all screens are selected and the viewport zooms to fit them

After importing, the screens are fully editable native Figma nodes. You can move them, edit text, change colors, add components on top.

## How fonts work

Before creating any nodes, the plugin scans the entire JSON tree and collects every unique font family + weight + style combination. It then loads each one using `figma.loadFontAsync()`.

Font weight mapping (what the plugin tries, in order):
```
"100" → Thin
"200" → ExtraLight, Extra Light, UltraLight
"300" → Light
"400" → Regular
"500" → Medium
"600" → SemiBold, Semi Bold, DemiBold
"700" → Bold
"800" → ExtraBold, Extra Bold, UltraBold
"900" → Black, Heavy
```

For italic variants, it tries `"Light Italic"`, `"LightItalic"`, `"Italic"`, etc.

If the exact font isn't available, it falls back to the family's Regular weight. If the family itself isn't installed, it falls back to **Inter Regular**.

Common fonts that work out of the box in Figma: Inter, Space Grotesk, JetBrains Mono, IBM Plex Mono, Playfair Display (all Google Fonts).

## How sizing works

The converter follows Figma's required order of operations:

1. Create the frame node
2. Set `layoutMode` (VERTICAL / HORIZONTAL / NONE)
3. `appendChild()` to parent
4. Set `layoutSizingHorizontal` / `layoutSizingVertical` (FILL / HUG / FIXED)
5. Build children (which repeat steps 1-4)

Key behaviors:
- **Top-level screens** (direct children of the Figma page) are always FIXED at their specified dimensions
- **`fill_container`** maps to `layoutSizingHorizontal/Vertical: "FILL"`, set after appending to parent
- **`fit_content`** maps to `"HUG"`
- **Frames with no explicit width/height** default to HUG (expand to fit content)
- **Frames default to horizontal layout** when no `layout` property is specified (per .pen spec)
- **Groups default to no layout** (absolute positioning)

## Project structure

```
pen-to-figma/
  manifest.json           # Figma plugin manifest (api 1.0.0, es6 target)
  package.json            # esbuild 0.28.0 + @figma/plugin-typings 1.124.0
  tsconfig.json           # TypeScript strict mode, ES2020 target
  src/
    code.ts               # Plugin entry: UI messaging, font preloading, import orchestration
    converter.ts           # Core: .pen node → Figma node (frame, text, rect, ellipse, icon)
    colors.ts              # Hex parsing (#RGB/#RRGGBB/#RRGGBBAA → {r,g,b,a}), gradient transforms
    fonts.ts               # Font loading with weight→style fallback chains, tree-wide preloading
    types.ts               # TypeScript definitions for .pen node schema
    ui.html                # Plugin UI: dark theme, file picker, JSON paste area, progress spinner
  test/
    validate-json.mjs      # Validates .pen JSON: types, colors, fonts, layout, sizing (3261 checks)
  dist/
    code.js                # Compiled plugin (esbuild, es6 target, ~20KB)
  docs/
    how-it-works.html      # Visual explainer page
```

## Validation

Run the test suite against any `.pen` JSON export:

```bash
node test/validate-json.mjs path/to/screens.json
```

Validates every node in every screen: correct types, valid hex colors, proper font weights, valid layout/alignment values, valid sizing modes, valid stroke alignment. Catches malformed data before it hits Figma's runtime.

## Development

Watch mode for live rebuilds while developing:

```bash
npm run watch
```

After each rebuild, close and reopen the plugin in Figma to pick up the new `dist/code.js`. Figma caches the plugin code until the plugin window is fully closed.

The plugin targets `es6` because Figma's sandbox runs QuickJS compiled to WASM, not a modern browser engine. Avoid optional catch binding (`catch {}`), nullish coalescing in some contexts, and other post-es6 features that QuickJS may not support.

## Known limitations

- **Icon fonts** render as small placeholder frames with the icon name as a text label inside. The icon's fill color is used as a tinted background. To get real icons, install the [Lucide Icons Figma community file](https://www.figma.com/community/file/1266031898150039286) and swap manually.
- **Image fills** become gray placeholder rectangles (50% gray, 30% opacity). Replace with real images in Figma.
- **Component instances** (`.pen` `ref` nodes) are flattened into regular frames. No Figma component linking.
- **Gradient transforms** convert rotation to an affine matrix but don't handle complex center/size offsets. Most gradients look correct, some may need manual adjustment.
- **Per-side strokes** work on frames but may silently fail on text nodes or ellipses (Figma API limitation).
- **Glass morphism fills** (white at 4-8% opacity on black backgrounds) are technically correct but appear nearly invisible at small canvas zoom levels. Zoom in to verify.

## License

MIT
