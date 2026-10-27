# Pocket-Mapp-Creator

A desktop map maker in the spirit of Inkarnate, for Windows, Linux and macOS (Electron).
Make Tolkien-style parchment world maps, towns and villages, and top-down RPG battle maps, then export them as PNG or JPG.

![Parchment world map](docs/parchment-world.png)

## Features

**Map styles** (switch at any time from the toolbar; the whole map re-skins)
- **Parchment** — sepia ink on aged paper, hatched mountains, Tolkien-style ripple lines around every coast
- **Full colour** — saturated, game-ready, beaches and shallow water
- **Watercolour** — soft washes with bleeding edges and pigment rims

**Map types**
- **World / Region** — paint continents and seas; side-view mountains, forests, castles, cities
- **Town / City / Village** — 3/4-view houses, taverns, chapels, windmills, walls, gatehouses
- **Battle maps** — top-down trees, rocks, furniture, campfires, with a square or hex grid (default 70 px cells)

**Asset genres:** Fantasy, Sci-Fi, Modern, Realistic — 127 original assets × 3 styles.
Includes ships (galleon, longship, merchant ship, rowing boat, cargo ship), docks, jetties and harbours, sea stacks and rocks for the ocean, and stone, wooden and suspension bridges, with top-down versions for battle maps.

**Editing**
- Adjustable map size (presets or custom up to 8000 × 8000) — resize later by extending/cropping or by scaling everything
- Every asset can be moved, **rotated** (handle, R key, or slider) and **scaled** (corner handles, [ ] keys, or slider), flipped, layered, faded
- **Scatter brush** to paint whole forests or mountain ranges with random size, rotation and flip
- Every new map starts as **open ocean**. Paint land in any shape with the **Land brush** (B), and turn land back into sea with the **Ocean brush** (E). Coastlines are inked automatically. The **Ground brush** paints roads, dirt and clearings
- **Select a landmass** by clicking it with the Select tool. Drag it to move it, drag a corner to make it **bigger or smaller**, or use the round handle to rotate it. Size and rotation can also be typed in. Mountains, towns, roads and labels on that land move with it (this can be turned off). Delete removes the land, and Esc or clicking the sea finishes
- **Line tool** for tapering rivers, dashed roads, dotted trails, dash-dot borders and walls
- **Text labels**: pick a font, size and colour in the Text tool bar, then click where the label should go. Drag a label to move it and resize it from the same bar. 8 bundled map fonts, halo, letter-spacing, CAPS and **curved text**. Labels always sit on top of land, assets and lines
- **Assets used** panel — every asset type on the map with its count; select all copies, hide them, or delete all copies in one click; expand to jump to individual copies
- Import your own PNG/SVG assets (saved inside the map file)
- Undo/redo, save/open `.mapp` files, export **PNG** or **JPG** at 0.5×–2× resolution

## Running it

Requires **Node.js 24** or newer (an `.nvmrc` is included, so `nvm use` picks the right version).

```bash
npm install
npm start
```

## Building installers with GitHub (Windows, macOS, Linux)

The workflow in `.github/workflows/build.yml` builds all three platforms on GitHub's own machines using Node.js 24.

1. Create a GitHub repository called `Pocket-Mapp-Creator` and push this folder to it, including `package-lock.json`.
2. **To test a build:** on GitHub open **Actions → Build installers → Run workflow**. When it finishes (about 10 minutes), open the **Releases** page. The installers are on a **draft** release called `build-<number>`, which only you can see. Delete old test drafts when you no longer need them.
3. **To publish a release:** bump `version` in `package.json`, then tag and push:
   ```bash
   git tag v0.1.0
   git push origin v0.1.0
   ```
   The installers are attached to a release and it is made public once all three platforms have built.

Installers are stored on GitHub Releases rather than as workflow "artifacts", so they don't use up the account's Actions artifact storage quota.

| Platform | Files produced |
|---|---|
| Windows | `…-win-x64.exe` (installer) and `…-win-portable.exe` (no install needed) |
| macOS | `…-mac-x64.dmg` (Intel) and `…-mac-arm64.dmg` (Apple Silicon) |
| Linux | `…-linux-x86_64.AppImage` and `…-linux-amd64.deb` |

**Unsigned builds:** the installers are not code-signed, which would need paid Apple and Windows certificates.
- On Windows, SmartScreen may say "Windows protected your PC". Click **More info → Run anyway**.
- On macOS, right-click the app and choose **Open** the first time. If macOS says the app "is damaged", run `xattr -cr "/Applications/Pocket-Mapp-Creator.app"` in Terminal.

### Building on your own computer

```bash
npm run dist:win     # on Windows
npm run dist:mac     # on a Mac
npm run dist:linux   # on Linux
```

Output goes to `dist/`.

## Regenerating the asset library

All built-in assets are drawn by code in `tools/generate-assets.js`. Edit a palette or a drawing function, then:

```bash
npm run assets
```

## Shortcuts

| Key | Action |
|---|---|
| V S B E P L T H | Select · Stamp · Land brush · Ocean brush · Ground · Lines · Text · Pan |
| Space + drag / middle mouse | Pan |
| Wheel | Zoom |
| Ctrl+Z / Ctrl+Y | Undo / Redo |
| Ctrl+D, Alt+drag | Duplicate |
| Delete | Delete selection |
| R / Shift+R | Rotate ±15° (Shift while dragging the handle snaps to 15°) |
| F | Flip |
| Click land (Select tool) | Select a landmass; [ ] resize it, R rotate, Delete remove |
| [ / ] | Brush size, or scale the selection |
| Alt while painting | Swap Land ↔ Ocean brush |

## Licences

- Code: MIT — see `LICENSE`
- Product icon: © MJO-Art (workmjo@gmail.com), all rights reserved — may not be altered or used without the Artist's express permission
- Built-in assets: original work, CC0 1.0 — see `ASSET-LICENSES.md` (full per-asset list)
- Fonts: SIL Open Font License 1.1 — see `ASSET-LICENSES.md` and `src/fonts/licenses/`

© 2026 project-tech-me · project-tech-me@protonmail.com
