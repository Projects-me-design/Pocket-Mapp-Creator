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

**Asset genres:** Fantasy, Sci-Fi, Modern, Realistic — 107 original assets × 3 styles.

**Editing**
- Adjustable map size (presets or custom up to 8000 × 8000) — resize later by extending/cropping or by scaling everything
- Every asset can be moved, **rotated** (handle, R key, or slider) and **scaled** (corner handles, [ ] keys, or slider), flipped, layered, faded
- **Scatter brush** to paint whole forests or mountain ranges with random size, rotation and flip
- **Land brush** (add land / add water) with automatic inked coastlines; **Ground brush** for roads, dirt and clearings
- **Line tool** for tapering rivers, dashed roads, dotted trails, dash-dot borders and walls
- **Text labels** with 8 bundled map fonts, halo, letter-spacing, CAPS, and **curved text**
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
2. **To test a build:** on GitHub open **Actions → Build installers → Run workflow**. When it finishes (about 10 minutes), download the installers from the **Artifacts** section at the bottom of the run page.
3. **To publish a release:** bump `version` in `package.json`, then tag and push:
   ```bash
   git tag v0.1.0
   git push origin v0.1.0
   ```
   The installers are attached to a new GitHub Release automatically.

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
| V S B P L T H | Select · Stamp · Land · Ground · Lines · Text · Pan |
| Space + drag / middle mouse | Pan |
| Wheel | Zoom |
| Ctrl+Z / Ctrl+Y | Undo / Redo |
| Ctrl+D, Alt+drag | Duplicate |
| Delete | Delete selection |
| R / Shift+R | Rotate ±15° (Shift while dragging the handle snaps to 15°) |
| F | Flip |
| [ / ] | Brush size, or scale the selection |
| Alt while painting | Erase / paint water |

## Licences

- Code: MIT — see `LICENSE`
- Product icon: © MJO-Art (workmjo@gmail.com), all rights reserved — may not be altered or used without the Artist's express permission
- Built-in assets: original work, CC0 1.0 — see `ASSET-LICENSES.md` (full per-asset list)
- Fonts: SIL Open Font License 1.1 — see `ASSET-LICENSES.md` and `src/fonts/licenses/`

© 2026 project-tech-me · project-tech-me@protonmail.com
