#!/usr/bin/env node
/*
 * Pocket-Mapp-Creator asset generator
 * Copyright (c) 2026 project-tech-me <project-tech-me@protonmail.com>
 *
 * Every asset produced by this script is ORIGINAL artwork drawn procedurally here,
 * released under CC0 1.0 (public domain dedication). See ASSET-LICENSES.md.
 *
 * Output:
 *   assets/<style>/<id>.svg     for style in parchment | colour | watercolour
 *   src/asset-manifest.js       catalogue used by the editor
 *
 * Run:  npm run assets
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

// ---------------------------------------------------------------- palettes
const STYLES = {
  parchment: {
    label: 'Parchment', sw: 2.3, hatch: true, wash: false,
    c: {
      ink: '#3b2817', paper: '#f1e3bf', plaster: '#ecd9ac', stone: '#dcc596', stoneD: '#b99a68',
      rock: '#d2b984', roof: '#c4a06a', roofD: '#97733f', wood: '#c9a670', woodD: '#9b7a48',
      leaf: '#d1b77f', leafD: '#ad8f58', pine: '#b89a62', pineD: '#937545', snow: '#f6ecd2',
      water: '#d6c091', waterD: '#b49a66', sand: '#e6d3a4', grass: '#d4bf8a', metal: '#d8c59c',
      metalD: '#a98d5d', glow: '#ead08a', accent: '#8e4a2c', banner: '#efdcb0', dark: '#5a4128',
      fire: '#c08a52', glass: '#e0cb9c', purple: '#a98c64', white: '#f6ecd2', road: '#d9c494'
    }
  },
  colour: {
    label: 'Full colour', sw: 2, hatch: false, wash: false,
    c: {
      ink: '#2d2216', paper: '#f4ead2', plaster: '#efe2c4', stone: '#b4aea3', stoneD: '#7d776d',
      rock: '#968e80', roof: '#b84a31', roofD: '#82301f', wood: '#a06d3d', woodD: '#6b4524',
      leaf: '#64a33f', leafD: '#3e6e28', pine: '#2f7050', pineD: '#1d4a33', snow: '#ffffff',
      water: '#5aa2cf', waterD: '#2f6f99', sand: '#e4cb8a', grass: '#80b652', metal: '#a4b8c6',
      metalD: '#5c7080', glow: '#ffd447', accent: '#c4382a', banner: '#eedcae', dark: '#3a342c',
      fire: '#f27b1d', glass: '#9cd6f2', purple: '#8d5bc6', white: '#fafaf5', road: '#c9b48a'
    }
  },
  watercolour: {
    label: 'Watercolour', sw: 1.4, hatch: false, wash: true,
    c: {
      ink: '#4a3a2b', paper: '#f7efdc', plaster: '#f0e3c8', stone: '#bdb7ad', stoneD: '#8d877d',
      rock: '#a69d8f', roof: '#c9705a', roofD: '#9b4c3a', wood: '#b5865a', woodD: '#86603d',
      leaf: '#86b865', leafD: '#5b8c47', pine: '#4f8a6a', pineD: '#386a51', snow: '#ffffff',
      water: '#7fb8da', waterD: '#4f8fb5', sand: '#ebd6a3', grass: '#a0c779', metal: '#b5c6d2',
      metalD: '#7a8e9c', glow: '#ffdf75', accent: '#cf5a48', banner: '#f2e3bf', dark: '#5d554b',
      fire: '#f39a4e', glass: '#b3e0f5', purple: '#a682d1', white: '#fbfbf7', road: '#d8c49c'
    }
  }
};

// ---------------------------------------------------------------- helpers
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash(s) { let h = 2166136261; for (const ch of s) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
const f = (n) => Math.round(n * 10) / 10;

function makeCtx(styleKey, id) {
  const st = STYLES[styleKey];
  const r = rng(hash(id));
  const j = (a) => (r() - 0.5) * 2 * a; // jitter
  const sw = st.sw;
  const c = st.c;

  // smooth wobbly path through points
  function wpath(pts, closed, amt = 0.9) {
    const p = pts.map(([x, y]) => [x + j(amt), y + j(amt)]);
    if (p.length < 2) return '';
    let d = `M${f(p[0][0])} ${f(p[0][1])}`;
    for (let i = 1; i < p.length; i++) {
      const [x0, y0] = p[i - 1]; const [x1, y1] = p[i];
      const mx = (x0 + x1) / 2 + j(amt * 0.6), my = (y0 + y1) / 2 + j(amt * 0.6);
      d += ` Q${f(mx)} ${f(my)} ${f(x1)} ${f(y1)}`;
    }
    if (closed) {
      const [x0, y0] = p[p.length - 1]; const [x1, y1] = p[0];
      d += ` Q${f((x0 + x1) / 2 + j(amt * 0.5))} ${f((y0 + y1) / 2 + j(amt * 0.5))} ${f(x1)} ${f(y1)} Z`;
    }
    return d;
  }
  const attrs = (fill, o = {}) =>
    `fill="${fill || 'none'}" stroke="${o.stroke === undefined ? c.ink : o.stroke}" stroke-width="${f((o.w || 1) * sw)}" stroke-linejoin="round" stroke-linecap="round"${o.op ? ` opacity="${o.op}"` : ''}`;

  const api = {
    c, st, r, j, sw,
    poly: (pts, fill, o = {}) => `<path d="${wpath(pts, true, o.amt ?? 0.9)}" ${attrs(fill, o)}/>`,
    line: (pts, o = {}) => `<path d="${wpath(pts, false, o.amt ?? 0.6)}" ${attrs('none', o)}/>`,
    fillOnly: (pts, fill, o = {}) => `<path d="${wpath(pts, true, o.amt ?? 0.6)}" fill="${fill}" stroke="none"${o.op ? ` opacity="${o.op}"` : ''}/>`,
    circ: (cx, cy, rad, fill, o = {}) => {
      const n = 14, pts = [];
      for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; pts.push([cx + Math.cos(a) * rad, cy + Math.sin(a) * rad]); }
      return api.poly(pts, fill, { amt: o.amt ?? Math.min(1, rad * 0.08), ...o });
    },
    ell: (cx, cy, rx, ry, fill, o = {}) => {
      const n = 16, pts = [];
      for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]); }
      return api.poly(pts, fill, { amt: o.amt ?? 0.6, ...o });
    },
    rect: (x, y, w, h, fill, o = {}) => api.poly([[x, y], [x + w, y], [x + w, y + h], [x, y + h]], fill, { amt: o.amt ?? 0.5, ...o }),
    // straight-edged rect (for sci-fi / modern precision)
    srect: (x, y, w, h, fill, o = {}) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${o.rx || 0}" ${attrs(fill, o)}/>`,
    scirc: (cx, cy, rad, fill, o = {}) => `<circle cx="${cx}" cy="${cy}" r="${rad}" ${attrs(fill, o)}/>`,
    // hatch strokes inside a band (parchment only unless forced)
    hatch: (x0, y0, x1, y1, n, dx, dy, o = {}) => {
      if (!st.hatch && !o.force) return '';
      let s = '';
      for (let i = 0; i < n; i++) {
        const t = n === 1 ? 0.5 : i / (n - 1);
        const x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t;
        s += api.line([[x, y], [x + dx + j(0.6), y + dy + j(0.6)]], { w: 0.45, amt: 0.3 });
      }
      return s;
    },
    // dots stippling (parchment)
    stipple: (cx, cy, rx, ry, n) => {
      if (!st.hatch) return '';
      let s = '';
      for (let i = 0; i < n; i++) {
        const a = r() * Math.PI * 2, d = Math.sqrt(r());
        s += `<circle cx="${f(cx + Math.cos(a) * rx * d)}" cy="${f(cy + Math.sin(a) * ry * d)}" r="${f(0.45 * sw)}" fill="${c.ink}"/>`;
      }
      return s;
    }
  };
  return api;
}

// ---------------------------------------------------------------- reusable pieces
function mountainShape(k, x, base, w, h, opts = {}) {
  const { c } = k;
  const peak = [x + w * (0.45 + k.j(0.05)), base - h];
  const L = [x, base], R = [x + w, base];
  const sh1 = [x + w * 0.62, base - h * 0.55];
  let s = '';
  s += k.fillOnly([L, [x + w * 0.2, base - h * 0.45], peak, sh1, [x + w * 0.85, base - h * 0.25], R], opts.fill || c.stone);
  // shaded side
  s += k.fillOnly([peak, sh1, [x + w * 0.85, base - h * 0.25], R, [x + w * 0.5, base]], c.stoneD, { op: k.st.hatch ? 0.45 : 0.9 });
  if (opts.snow) s += k.poly([peak, [peak[0] - w * 0.12, peak[1] + h * 0.25], [peak[0] - w * 0.04, peak[1] + h * 0.2], [peak[0] + w * 0.03, peak[1] + h * 0.28], [peak[0] + w * 0.11, peak[1] + h * 0.18]], c.snow, { w: 0.6 });
  s += k.line([L, [x + w * 0.2, base - h * 0.45], peak, sh1, [x + w * 0.85, base - h * 0.25], R]);
  s += k.line([peak, [peak[0] + w * 0.06, base - h * 0.6], [x + w * 0.52, base - h * 0.2]], { w: 0.6 });
  s += k.hatch(peak[0] + w * 0.08, peak[1] + h * 0.18, x + w * 0.82, base - h * 0.08, Math.max(4, Math.round(w / 9)), -w * 0.05, h * 0.16);
  return s;
}
function hillShape(k, x, base, w, h) {
  const { c } = k;
  let s = k.fillOnly([[x, base], [x + w * 0.25, base - h * 0.8], [x + w * 0.55, base - h], [x + w * 0.85, base - h * 0.55], [x + w, base]], c.grass);
  s += k.line([[x, base], [x + w * 0.25, base - h * 0.8], [x + w * 0.55, base - h], [x + w * 0.85, base - h * 0.55], [x + w, base]]);
  s += k.hatch(x + w * 0.62, base - h * 0.75, x + w * 0.9, base - h * 0.2, 4, w * 0.02, h * 0.28);
  if (!k.st.hatch) s += k.fillOnly([[x + w * 0.55, base - h], [x + w * 0.85, base - h * 0.55], [x + w, base], [x + w * 0.6, base]], k.c.leafD, { op: 0.35 });
  return s;
}
function deciduous(k, x, base, sz) {
  const { c } = k;
  let s = k.line([[x, base], [x, base - sz * 0.45]], { w: 1 });
  const cy = base - sz * 0.7;
  s += k.poly([[x - sz * 0.32, cy + sz * 0.1], [x - sz * 0.36, cy - sz * 0.12], [x - sz * 0.18, cy - sz * 0.32], [x + sz * 0.08, cy - sz * 0.34], [x + sz * 0.33, cy - sz * 0.15], [x + sz * 0.32, cy + sz * 0.12], [x + sz * 0.1, cy + sz * 0.24], [x - sz * 0.16, cy + sz * 0.24]], c.leaf);
  s += k.fillOnly([[x + sz * 0.05, cy - sz * 0.25], [x + sz * 0.3, cy - sz * 0.1], [x + sz * 0.28, cy + sz * 0.12], [x + sz * 0.08, cy + sz * 0.2]], c.leafD, { op: k.st.hatch ? 0.5 : 0.8 });
  s += k.hatch(x + sz * 0.1, cy - sz * 0.15, x + sz * 0.22, cy + sz * 0.12, 3, sz * 0.06, sz * 0.05);
  return s;
}
function pine(k, x, base, sz) {
  const { c } = k;
  let s = k.line([[x, base], [x, base - sz * 0.2]], { w: 1 });
  const t = base - sz;
  s += k.poly([[x, t], [x + sz * 0.2, base - sz * 0.55], [x + sz * 0.12, base - sz * 0.55], [x + sz * 0.3, base - sz * 0.2], [x - sz * 0.3, base - sz * 0.2], [x - sz * 0.12, base - sz * 0.55], [x - sz * 0.2, base - sz * 0.55]], c.pine, { amt: 0.4 });
  s += k.fillOnly([[x, t], [x + sz * 0.2, base - sz * 0.55], [x + sz * 0.12, base - sz * 0.55], [x + sz * 0.3, base - sz * 0.2], [x, base - sz * 0.2]], c.pineD, { op: k.st.hatch ? 0.5 : 0.8 });
  return s;
}
function smallHouse34(k, x, base, w, h, roofCol) {
  const { c } = k;
  const wallTop = base - h * 0.55;
  let s = '';
  s += k.poly([[x, base], [x + w * 0.62, base], [x + w * 0.62, wallTop], [x, wallTop]], c.plaster);          // front
  s += k.poly([[x + w * 0.62, base], [x + w, base - h * 0.12], [x + w, wallTop - h * 0.12], [x + w * 0.62, wallTop]], c.stone); // side
  s += k.poly([[x - w * 0.05, wallTop + 2], [x + w * 0.31, base - h], [x + w * 0.69, base - h - h * 0.12], [x + w * 1.04, wallTop - h * 0.12 + 1], [x + w * 0.67, wallTop + 2]], roofCol || c.roof); // roof
  s += k.line([[x + w * 0.31, base - h], [x + w * 0.67, wallTop + 2]], { w: 0.7 });
  s += k.rect(x + w * 0.24, base - h * 0.32, w * 0.14, h * 0.32, c.woodD, { w: 0.6 });                     // door
  s += k.hatch(x + w * 0.4, base - h * 0.85, x + w * 0.85, wallTop - h * 0.05, 5, w * 0.08, h * 0.1);
  return s;
}

// ---------------------------------------------------------------- asset definitions
// genre: fantasy | scifi | modern | realistic
// kind:  world (side-view map icons) | town (3/4 view) | battle (top-down) | decor
const A = [];
const add = (id, name, genre, kind, draw, w = 128, h = 128) => A.push({ id, name, genre, kind, draw, w, h });

// ======== FANTASY · WORLD ========
add('mountain', 'Mountain', 'fantasy', 'world', (k) => mountainShape(k, 14, 110, 100, 84));
add('mountain-tall', 'Tall Mountain', 'fantasy', 'world', (k) => mountainShape(k, 24, 118, 80, 108));
add('mountain-snow', 'Snowy Peak', 'fantasy', 'world', (k) => mountainShape(k, 14, 112, 100, 96, { snow: true }));
add('mountain-range', 'Mountain Range', 'fantasy', 'world', (k) =>
  mountainShape(k, 6, 96, 86, 72) + mountainShape(k, 60, 104, 96, 90) + mountainShape(k, 128, 98, 82, 66) + mountainShape(k, 34, 112, 70, 50) + mountainShape(k, 108, 116, 66, 46), 220, 120);
add('hill', 'Hill', 'fantasy', 'world', (k) => hillShape(k, 14, 96, 100, 42), 128, 110);
add('hills', 'Rolling Hills', 'fantasy', 'world', (k) => hillShape(k, 6, 80, 80, 34) + hillShape(k, 60, 86, 90, 40) + hillShape(k, 26, 104, 86, 34), 160, 110);
add('volcano', 'Volcano', 'fantasy', 'world', (k) => {
  const { c } = k; let s = '';
  s += k.poly([[20, 32], [16, 20], [26, 12], [38, 16], [44, 8], [58, 12], [66, 4], [80, 12], [92, 10], [100, 22], [96, 34], [80, 30], [70, 36], [54, 30], [40, 36]], c.stone, { w: 0.6, op: 0.7 });
  s += k.fillOnly([[8, 118], [44, 46], [54, 48], [60, 42], [70, 46], [80, 44], [120, 118]], c.rock);
  s += k.fillOnly([[64, 48], [80, 44], [120, 118], [80, 118]], c.stoneD, { op: k.st.hatch ? 0.45 : 0.9 });
  s += k.line([[8, 118], [44, 46], [54, 48], [60, 42], [70, 46], [80, 44], [120, 118]]);
  s += k.poly([[54, 48], [58, 64], [52, 82], [60, 96], [64, 74], [68, 58], [70, 46]], c.fire, { w: 0.6 });
  s += k.hatch(84, 58, 112, 108, 7, -6, 10);
  return s;
});
add('tree', 'Tree', 'fantasy', 'world', (k) => deciduous(k, 64, 118, 100));
add('pine', 'Pine Tree', 'fantasy', 'world', (k) => pine(k, 64, 120, 108));
add('forest', 'Forest Clump', 'fantasy', 'world', (k) => {
  let s = ''; const pos = [[30, 70, 52], [62, 66, 56], [96, 72, 50], [126, 68, 48], [18, 96, 50], [50, 100, 54], [84, 98, 56], [116, 102, 50], [146, 96, 46]];
  for (const [x, y, z] of pos) s += deciduous(k, x, y + 20, z);
  return s;
}, 168, 128);
add('pine-forest', 'Pine Forest', 'fantasy', 'world', (k) => {
  let s = ''; const pos = [[24, 74, 58], [52, 68, 64], [82, 72, 58], [112, 66, 62], [140, 74, 56], [36, 102, 60], [68, 106, 62], [98, 102, 60], [128, 106, 58]];
  for (const [x, y, z] of pos) s += pine(k, x, y + 18, z);
  return s;
}, 164, 128);
add('dead-tree', 'Dead Tree', 'fantasy', 'world', (k) => {
  let s = k.line([[64, 120], [62, 90], [66, 64], [60, 40], [64, 18]], { w: 1.6 });
  s += k.line([[63, 84], [44, 66], [34, 56]]) + k.line([[44, 66], [40, 48]]) + k.line([[65, 70], [86, 52], [96, 34]]) + k.line([[86, 52], [102, 50]]) + k.line([[61, 44], [48, 30]]);
  return s;
});
add('palm', 'Palm Tree', 'fantasy', 'world', (k) => {
  const { c } = k; let s = k.line([[64, 122], [60, 92], [62, 62], [70, 40]], { w: 2.2 });
  for (const [dx, dy] of [[-36, 8], [-26, -12], [34, 4], [24, -16], [2, -22]]) s += k.poly([[70, 40], [70 + dx * 0.5, 40 + dy - 8], [70 + dx, 40 + dy + 10], [70 + dx * 0.5, 40 + dy * 0.4 + 2]], c.leaf, { w: 0.7 });
  return s;
});
add('castle', 'Castle', 'fantasy', 'world', (k) => {
  const { c } = k; let s = '';
  const tower = (x, y, w, h) => k.rect(x, y, w, h, c.stone) + k.poly([[x - 3, y], [x + w / 2, y - h * 0.45], [x + w + 3, y]], c.roof) + k.rect(x + w * 0.35, y + h * 0.3, w * 0.3, h * 0.18, c.dark, { w: 0.4 });
  s += k.rect(30, 66, 68, 50, c.stone);
  for (let i = 0; i < 6; i++) s += k.rect(30 + i * 12, 60, 7, 7, c.stone, { w: 0.7 });
  s += tower(14, 52, 22, 64) + tower(92, 52, 22, 64) + tower(52, 34, 24, 40);
  s += k.poly([[56, 116], [56, 96], [64, 88], [72, 96], [72, 116]], c.woodD, { w: 0.8 });
  s += k.line([[64, 14], [64, 0]], { w: 0.6 }) + k.poly([[64, 0], [80, 4], [64, 8]], c.accent, { w: 0.5 });
  s += k.hatch(100, 70, 110, 110, 5, 4, 3);
  return s;
});
add('tower', 'Wizard Tower', 'fantasy', 'world', (k) => {
  const { c } = k; let s = '';
  s += k.poly([[48, 122], [52, 46], [76, 46], [80, 122]], c.stone);
  s += k.poly([[42, 48], [64, 4], [86, 48]], c.purple);
  s += k.rect(58, 64, 12, 16, c.glow, { w: 0.6 }) + k.rect(58, 96, 12, 26, c.woodD, { w: 0.6 });
  s += k.hatch(70, 52, 76, 116, 8, 5, 2);
  return s;
});
add('village', 'Village', 'fantasy', 'world', (k) => smallHouse34(k, 14, 112, 48, 50) + smallHouse34(k, 64, 104, 44, 46) + smallHouse34(k, 40, 122, 40, 38), 128, 128);
add('city', 'Walled City', 'fantasy', 'world', (k) => {
  const { c } = k; let s = '';
  s += smallHouse34(k, 30, 84, 34, 40) + smallHouse34(k, 66, 80, 38, 46) + smallHouse34(k, 104, 86, 32, 38);
  s += k.rect(78, 26, 14, 56, c.stone) + k.poly([[74, 28], [85, 4], [96, 28]], c.roof);
  s += k.poly([[10, 120], [10, 92], [150, 92], [150, 120]], c.stone);
  for (let i = 0; i < 12; i++) s += k.rect(12 + i * 12, 86, 6, 6, c.stone, { w: 0.6 });
  s += k.rect(4, 80, 18, 40, c.stone) + k.rect(138, 80, 18, 40, c.stone);
  s += k.poly([[70, 120], [70, 104], [80, 96], [90, 104], [90, 120]], c.woodD, { w: 0.7 });
  return s;
}, 160, 128);
add('ruins', 'Ruins', 'fantasy', 'world', (k) => {
  const { c } = k; let s = '';
  s += k.poly([[14, 116], [14, 60], [24, 52], [30, 62], [30, 116]], c.stone) + k.poly([[44, 116], [44, 40], [60, 40], [60, 70], [54, 78], [56, 116]], c.stone);
  s += k.poly([[76, 116], [76, 70], [84, 64], [92, 74], [92, 116]], c.stone) + k.poly([[102, 116], [104, 90], [118, 88], [118, 116]], c.stone);
  s += k.line([[10, 118], [122, 118]]) + k.rect(36, 108, 8, 8, c.stone, { w: 0.6 }) + k.rect(64, 110, 10, 7, c.stone, { w: 0.6 });
  s += k.hatch(48, 44, 56, 108, 8, 4, 2);
  return s;
});
add('temple', 'Temple', 'fantasy', 'world', (k) => {
  const { c } = k; let s = '';
  s += k.poly([[14, 46], [64, 16], [114, 46]], c.stone) + k.rect(16, 46, 96, 8, c.stone);
  for (let i = 0; i < 5; i++) s += k.rect(22 + i * 19, 54, 9, 52, c.plaster, { w: 0.8 });
  s += k.rect(10, 106, 108, 7, c.stone) + k.rect(4, 113, 120, 7, c.stone);
  return s;
});
add('cave', 'Cave Entrance', 'fantasy', 'world', (k) => {
  const { c } = k; let s = '';
  s += k.poly([[6, 116], [20, 64], [48, 40], [80, 36], [108, 58], [122, 116]], c.rock);
  s += k.poly([[40, 116], [44, 84], [64, 70], [84, 84], [88, 116]], c.dark);
  s += k.hatch(90, 60, 114, 108, 6, -6, 10);
  return s;
});
add('lighthouse', 'Lighthouse', 'fantasy', 'world', (k) => {
  const { c } = k; let s = '';
  s += k.poly([[44, 120], [52, 36], [76, 36], [84, 120]], c.white);
  s += k.fillOnly([[47, 92], [81, 92], [79, 76], [49, 76]], c.accent) + k.fillOnly([[50, 62], [78, 62], [77, 50], [51, 50]], c.accent);
  s += k.rect(50, 22, 28, 14, c.glow) + k.poly([[46, 22], [64, 6], [82, 22]], c.dark);
  s += k.line([[30, 18], [44, 26]], { w: 0.6 }) + k.line([[98, 18], [84, 26]], { w: 0.6 });
  return s;
});
add('swamp', 'Marsh Tufts', 'fantasy', 'world', (k) => {
  let s = '';
  for (const [x, y] of [[24, 80], [58, 70], [94, 84], [40, 104], [80, 106]]) {
    s += k.line([[x - 14, y], [x + 14, y]], { w: 0.7 });
    for (let i = -2; i <= 2; i++) s += k.line([[x + i * 3, y - 1], [x + i * 5, y - 12 - Math.abs(2 - Math.abs(i)) * 3]], { w: 0.6 });
  }
  return s;
}, 128, 120);
add('grass-tuft', 'Grass Tuft', 'fantasy', 'world', (k) => {
  let s = ''; for (let i = -3; i <= 3; i++) s += k.line([[64 + i * 4, 90], [64 + i * 9, 90 - 28 + Math.abs(i) * 5]], { w: 0.8 });
  return s;
}, 128, 100);
add('dunes', 'Dunes', 'fantasy', 'world', (k) => {
  let s = '';
  for (const [x, y, w] of [[10, 60, 70], [64, 52, 80], [30, 92, 90]]) {
    s += k.fillOnly([[x, y], [x + w * 0.5, y - 16], [x + w, y]], k.c.sand);
    s += k.line([[x, y], [x + w * 0.5, y - 16], [x + w, y]]) + k.line([[x + w * 0.5, y - 16], [x + w * 0.6, y]], { w: 0.5 });
  }
  return s;
}, 160, 110);

// ======== FANTASY · DECOR (work for every map) ========
add('compass', 'Compass Rose', 'fantasy', 'decor', (k) => {
  const { c } = k; let s = '';
  s += `<circle cx="64" cy="64" r="44" fill="none" stroke="${c.ink}" stroke-width="${k.sw * 0.8}"/>`;
  s += `<circle cx="64" cy="64" r="38" fill="none" stroke="${c.ink}" stroke-width="${k.sw * 0.4}"/>`;
  for (let i = 0; i < 32; i++) { const a = (i / 32) * Math.PI * 2; const r1 = 38, r2 = i % 4 === 0 ? 46 : 42; s += `<line x1="${f(64 + Math.cos(a) * r1)}" y1="${f(64 + Math.sin(a) * r1)}" x2="${f(64 + Math.cos(a) * r2)}" y2="${f(64 + Math.sin(a) * r2)}" stroke="${c.ink}" stroke-width="${k.sw * 0.4}"/>`; }
  const star = (len, wid, rot, fillA, fillB) => {
    let t = '';
    for (let i = 0; i < 4; i++) {
      const a = rot + (i * Math.PI) / 2, ax = Math.cos(a), ay = Math.sin(a), px = -ay, py = ax;
      const tip = [64 + ax * len, 64 + ay * len];
      t += `<path d="M64 64 L${f(tip[0])} ${f(tip[1])} L${f(64 + px * wid)} ${f(64 + py * wid)} Z" fill="${fillA}" stroke="${c.ink}" stroke-width="${k.sw * 0.5}" stroke-linejoin="round"/>`;
      t += `<path d="M64 64 L${f(tip[0])} ${f(tip[1])} L${f(64 - px * wid)} ${f(64 - py * wid)} Z" fill="${fillB}" stroke="${c.ink}" stroke-width="${k.sw * 0.5}" stroke-linejoin="round"/>`;
    }
    return t;
  };
  s += star(36, 9, Math.PI / 4, c.paper, c.stoneD);
  s += star(58, 11, -Math.PI / 2, c.paper, c.ink);
  s += `<path d="M64 6 L58 -2 L70 -2 Z" fill="${c.accent}" transform="translate(0 2)"/>`;
  s += `<circle cx="64" cy="64" r="4" fill="${c.accent}" stroke="${c.ink}" stroke-width="${k.sw * 0.5}"/>`;
  return s;
});
add('cartouche', 'Title Cartouche', 'fantasy', 'decor', (k) => {
  const { c } = k; let s = '';
  s += k.poly([[30, 20], [210, 20], [210, 76], [30, 76]], c.banner, { amt: 0.4 });
  s += k.poly([[30, 20], [14, 14], [8, 30], [18, 44], [30, 40]], c.banner, { w: 0.8 }) + k.poly([[210, 20], [226, 14], [232, 30], [222, 44], [210, 40]], c.banner, { w: 0.8 });
  s += k.poly([[30, 76], [14, 84], [8, 70], [18, 58], [30, 60]], c.banner, { w: 0.8 }) + k.poly([[210, 76], [226, 84], [232, 70], [222, 58], [210, 60]], c.banner, { w: 0.8 });
  s += k.rect(38, 27, 164, 42, 'none', { w: 0.45 });
  return s;
}, 240, 96);
add('banner', 'Ribbon Banner', 'fantasy', 'decor', (k) => {
  const { c } = k; let s = '';
  s += k.poly([[4, 30], [30, 30], [30, 58], [4, 58], [14, 44]], c.accent, { w: 0.8 }) + k.poly([[236, 30], [210, 30], [210, 58], [236, 58], [226, 44]], c.accent, { w: 0.8 });
  s += k.poly([[22, 22], [218, 22], [218, 50], [22, 50]], c.banner, { amt: 0.4 });
  return s;
}, 240, 70);
add('scale-bar', 'Scale Bar', 'fantasy', 'decor', (k) => {
  const { c } = k; let s = '';
  for (let i = 0; i < 5; i++) s += `<rect x="${10 + i * 44}" y="20" width="44" height="10" fill="${i % 2 ? c.paper : c.ink}" stroke="${c.ink}" stroke-width="${k.sw * 0.6}"/>`;
  return s;
}, 240, 40);
add('ship', 'Sailing Ship', 'fantasy', 'decor', (k) => {
  const { c } = k; let s = '';
  s += k.poly([[14, 84], [114, 84], [100, 104], [28, 104]], c.wood);
  s += k.line([[64, 84], [64, 14]], { w: 1.1 }) + k.line([[34, 84], [34, 34]], { w: 0.9 });
  s += k.poly([[66, 18], [96, 26], [94, 72], [66, 76]], c.banner) + k.poly([[36, 36], [56, 42], [54, 74], [36, 76]], c.banner);
  s += k.poly([[64, 14], [78, 8], [64, 4]], c.accent, { w: 0.5 });
  s += k.line([[8, 108], [24, 104], [40, 110], [60, 104], [80, 110], [100, 104], [120, 108]], { w: 0.6 });
  return s;
});
add('sea-serpent', 'Sea Serpent', 'fantasy', 'decor', (k) => {
  const { c } = k; let s = '';
  const hump = (x, w, h) => k.poly([[x, 96], [x + w * 0.2, 96 - h], [x + w * 0.8, 96 - h], [x + w, 96], [x + w * 0.75, 96], [x + w * 0.6, 96 - h * 0.6], [x + w * 0.4, 96 - h * 0.6], [x + w * 0.25, 96]], c.leafD);
  s += hump(56, 34, 26) + hump(98, 30, 20) + k.poly([[130, 96], [146, 78], [150, 70], [140, 74], [132, 92]], c.leafD);
  s += k.poly([[18, 96], [22, 46], [34, 26], [52, 22], [58, 34], [44, 38], [38, 52], [36, 96]], c.leafD);
  s += `<circle cx="44" cy="29" r="2.4" fill="${c.ink}"/>`;
  for (let i = 0; i < 4; i++) s += k.poly([[24, 50 + i * 12], [16, 54 + i * 12], [24, 58 + i * 12]], c.leaf, { w: 0.5 });
  s += k.line([[4, 100], [30, 96], [56, 102], [84, 96], [110, 102], [140, 96], [156, 100]], { w: 0.7 });
  return s;
}, 160, 112);
add('waves', 'Sea Waves', 'fantasy', 'decor', (k) => {
  let s = '';
  for (const [x, y] of [[10, 40], [50, 30], [30, 64], [74, 56]]) s += k.line([[x, y], [x + 8, y - 6], [x + 16, y], [x + 24, y - 6], [x + 32, y]], { w: 0.8 });
  return s;
}, 128, 80);
add('whirlpool', 'Whirlpool', 'fantasy', 'decor', (k) => {
  const pts = []; for (let t = 0; t < 4 * Math.PI * 2; t += 0.35) { const r = 3 + t * 2.1; pts.push([64 + Math.cos(t) * r, 64 + Math.sin(t) * r * 0.7]); }
  return k.line(pts, { w: 0.8, amt: 0.3 });
});
add('dragon', 'Dragon', 'fantasy', 'decor', (k) => {
  const { c } = k; let s = '';
  s += k.poly([[66, 58], [40, 14], [56, 26], [62, 10], [72, 30], [86, 18], [86, 46], [104, 38], [86, 64]], c.accent, { w: 0.8 }); // wing
  s += k.poly([[18, 74], [28, 62], [44, 60], [56, 66], [78, 62], [98, 70], [112, 66], [124, 72], [110, 76], [96, 80], [74, 84], [60, 96], [52, 92], [56, 82], [40, 80], [28, 82]], c.roofD); // body
  s += k.poly([[18, 74], [6, 70], [10, 78], [28, 82]], c.roofD, { w: 0.7 });
  s += k.line([[60, 96], [56, 108], [64, 108]], { w: 0.8 }) + k.line([[86, 80], [90, 96], [98, 96]], { w: 0.8 });
  s += `<circle cx="20" cy="73" r="1.8" fill="${c.ink}"/>`;
  return s;
});

// ======== FANTASY · TOWN (3/4 view) ========
add('house', 'House', 'fantasy', 'town', (k) => smallHouse34(k, 14, 118, 100, 100));
add('cottage', 'Thatched Cottage', 'fantasy', 'town', (k) => smallHouse34(k, 14, 118, 100, 84, k.c.sand) + k.hatch(30, 52, 74, 40, 8, 0, 14, { force: true }));
add('tavern', 'Tavern', 'fantasy', 'town', (k) => {
  const { c } = k; let s = smallHouse34(k, 10, 120, 110, 110);
  s += k.rect(18, 72, 16, 14, c.glow, { w: 0.6 }) + k.rect(50, 72, 16, 14, c.glow, { w: 0.6 });
  s += k.line([[78, 64], [94, 64]], { w: 0.7 }) + k.rect(86, 66, 14, 10, c.banner, { w: 0.6 });
  return s;
});
add('chapel', 'Chapel', 'fantasy', 'town', (k) => {
  const { c } = k; let s = smallHouse34(k, 10, 122, 90, 80);
  s += k.rect(86, 38, 24, 84, c.stone) + k.poly([[82, 40], [98, 4], [114, 40]], c.roofD);
  s += k.line([[98, 4], [98, -4]], { w: 0.6 }) + k.rect(93, 56, 10, 14, c.dark, { w: 0.5 });
  return s;
});
add('windmill', 'Windmill', 'fantasy', 'town', (k) => {
  const { c } = k; let s = '';
  s += k.poly([[44, 122], [50, 52], [78, 52], [84, 122]], c.plaster) + k.poly([[44, 54], [64, 32], [84, 54]], c.roof);
  s += k.rect(58, 100, 12, 22, c.woodD, { w: 0.6 });
  const hub = [64, 50];
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2, ax = Math.cos(a), ay = Math.sin(a), px = -ay * 7, py = ax * 7;
    s += k.poly([[hub[0] + ax * 8, hub[1] + ay * 8], [hub[0] + ax * 48, hub[1] + ay * 48], [hub[0] + ax * 48 + px, hub[1] + ay * 48 + py], [hub[0] + ax * 8 + px, hub[1] + ay * 8 + py]], c.banner, { w: 0.6 });
  }
  s += k.circ(64, 50, 4, c.woodD, { w: 0.6 });
  return s;
});
add('blacksmith', 'Blacksmith', 'fantasy', 'town', (k) => {
  const { c } = k; let s = smallHouse34(k, 10, 120, 100, 90, c.stoneD);
  s += k.rect(98, 30, 12, 36, c.stone) + k.circ(104, 22, 5, c.stone, { w: 0.5, op: 0.6 }) + k.circ(110, 12, 6, c.stone, { w: 0.5, op: 0.4 });
  s += k.rect(66, 76, 18, 12, c.fire, { w: 0.6 });
  return s;
});
add('market-stall', 'Market Stall', 'fantasy', 'town', (k) => {
  const { c } = k; let s = '';
  s += k.line([[24, 120], [24, 50]]) + k.line([[104, 120], [104, 50]]);
  s += k.poly([[14, 52], [30, 30], [98, 30], [114, 52]], c.accent);
  for (let i = 0; i < 4; i++) s += k.fillOnly([[30 + i * 17, 30], [38 + i * 17, 30], [36 + i * 21, 52], [26 + i * 21, 52]], c.white, { op: 0.8 });
  s += k.rect(20, 88, 88, 16, c.wood) + k.circ(40, 84, 6, c.fire) + k.circ(56, 84, 6, c.leaf) + k.circ(72, 84, 6, c.glow) + k.circ(88, 84, 6, c.accent);
  return s;
});
add('well', 'Well', 'fantasy', 'town', (k) => {
  const { c } = k; let s = '';
  s += k.ell(64, 98, 30, 10, c.dark) + k.poly([[34, 98], [34, 118], [94, 118], [94, 98]], c.stone);
  s += k.line([[40, 98], [40, 44]]) + k.line([[88, 98], [88, 44]]) + k.poly([[30, 46], [64, 22], [98, 46]], c.roof);
  s += k.line([[40, 62], [88, 62]], { w: 0.7 }) + k.line([[64, 62], [64, 80]], { w: 0.5 }) + k.rect(58, 80, 12, 10, c.wood, { w: 0.5 });
  return s;
});
add('wall', 'Town Wall', 'fantasy', 'town', (k) => {
  const { c } = k; let s = k.poly([[4, 118], [4, 50], [252, 50], [252, 118]], c.stone);
  for (let i = 0; i < 12; i++) s += k.rect(6 + i * 21, 38, 12, 12, c.stone, { w: 0.7 });
  for (let y = 66; y < 118; y += 14) s += k.line([[6, y], [250, y]], { w: 0.35 });
  return s;
}, 256, 128);
add('wall-tower', 'Wall Tower', 'fantasy', 'town', (k) => {
  const { c } = k; let s = k.poly([[30, 122], [30, 40], [98, 40], [98, 122]], c.stone);
  for (let i = 0; i < 4; i++) s += k.rect(30 + i * 19, 28, 11, 12, c.stone, { w: 0.7 });
  s += k.rect(58, 64, 12, 18, c.dark, { w: 0.5 }) + k.hatch(84, 46, 94, 116, 7, 4, 3);
  return s;
});
add('gatehouse', 'Gatehouse', 'fantasy', 'town', (k) => {
  const { c } = k; let s = k.poly([[10, 122], [10, 40], [118, 40], [118, 122]], c.stone);
  for (let i = 0; i < 5; i++) s += k.rect(10 + i * 23, 28, 14, 12, c.stone, { w: 0.7 });
  s += k.poly([[44, 122], [44, 84], [64, 66], [84, 84], [84, 122]], c.dark);
  for (let x = 50; x < 84; x += 8) s += k.line([[x, 80], [x, 122]], { w: 0.5, stroke: c.stone });
  return s;
});
add('tree-34', 'Oak Tree (3/4)', 'fantasy', 'town', (k) => {
  const { c } = k; let s = k.ell(64, 116, 30, 7, c.dark, { stroke: 'none', op: 0.25 });
  s += k.poly([[58, 118], [60, 80], [68, 80], [70, 118]], c.woodD);
  s += k.circ(44, 62, 24, c.leaf) + k.circ(84, 62, 24, c.leaf) + k.circ(64, 40, 28, c.leaf) + k.circ(64, 70, 22, c.leaf);
  s += k.fillOnly([[70, 22], [94, 44], [104, 70], [84, 84], [76, 60]], c.leafD, { op: 0.45 });
  return s;
});
add('fountain', 'Fountain', 'fantasy', 'town', (k) => {
  const { c } = k; let s = '';
  s += k.ell(64, 100, 50, 16, c.stone) + k.ell(64, 98, 42, 12, c.water, { w: 0.6 });
  s += k.rect(58, 54, 12, 44, c.stone) + k.ell(64, 54, 22, 7, c.stone) + k.ell(64, 53, 16, 4, c.water, { w: 0.5 });
  s += k.line([[64, 50], [64, 30]], { w: 0.6, stroke: c.waterD }) + k.line([[64, 32], [50, 52]], { w: 0.5, stroke: c.waterD }) + k.line([[64, 32], [78, 52]], { w: 0.5, stroke: c.waterD });
  return s;
});
add('barn', 'Barn', 'fantasy', 'town', (k) => {
  const { c } = k; let s = smallHouse34(k, 8, 122, 112, 100, c.roofD);
  s += k.line([[30, 120], [44, 100]], { w: 0.6 }) + k.line([[30, 100], [44, 120]], { w: 0.6 });
  return s;
});
add('castle-keep', 'Castle Keep (3/4)', 'fantasy', 'town', (k) => {
  const { c } = k; let s = '';
  s += k.poly([[20, 124], [20, 40], [88, 40], [88, 124]], c.stone) + k.poly([[88, 124], [112, 112], [112, 30], [88, 40]], c.stoneD);
  for (let i = 0; i < 4; i++) s += k.rect(20 + i * 18, 28, 10, 12, c.stone, { w: 0.6 });
  s += k.poly([[42, 124], [42, 94], [54, 84], [66, 94], [66, 124]], c.woodD, { w: 0.7 });
  s += k.rect(30, 56, 8, 14, c.dark, { w: 0.5 }) + k.rect(70, 56, 8, 14, c.dark, { w: 0.5 });
  s += k.line([[54, 28], [54, 6]], { w: 0.6 }) + k.poly([[54, 6], [70, 10], [54, 14]], c.accent, { w: 0.5 });
  return s;
});

// ======== FANTASY · BATTLE (top-down) ========
add('tree-top', 'Tree Canopy', 'fantasy', 'battle', (k) => {
  const { c } = k; let s = k.circ(68, 70, 50, c.dark, { stroke: 'none', op: 0.25 });
  const pts = []; for (let i = 0; i < 18; i++) { const a = (i / 18) * Math.PI * 2, r = i % 2 ? 50 : 42; pts.push([64 + Math.cos(a) * r, 64 + Math.sin(a) * r]); }
  s += k.poly(pts, c.leaf, { amt: 2 });
  s += k.circ(54, 54, 18, c.leafD, { w: 0.5, op: 0.7 }) + k.circ(78, 74, 14, c.leafD, { w: 0.5, op: 0.6 }) + k.circ(62, 62, 5, c.woodD, { w: 0.5 });
  return s;
});
add('pine-top', 'Pine (top-down)', 'fantasy', 'battle', (k) => {
  const { c } = k; let s = '';
  for (const [r, col] of [[48, c.pineD], [34, c.pine], [20, c.pineD]]) {
    const pts = []; for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2, rr = i % 2 ? r : r * 0.75; pts.push([64 + Math.cos(a) * rr, 64 + Math.sin(a) * rr]); }
    s += k.poly(pts, col, { amt: 0.6 });
  }
  return s;
});
add('bush', 'Bush', 'fantasy', 'battle', (k) => {
  const { c } = k; return k.circ(46, 70, 22, c.leaf) + k.circ(80, 72, 22, c.leaf) + k.circ(64, 50, 22, c.leaf) + k.circ(58, 58, 6, c.accent, { w: 0.4 }) + k.circ(76, 64, 5, c.accent, { w: 0.4 });
});
add('rock', 'Rock', 'fantasy', 'battle', (k) => {
  const { c } = k; let s = k.poly([[20, 70], [34, 30], [70, 18], [104, 36], [110, 78], [80, 106], [36, 100]], c.rock);
  s += k.fillOnly([[70, 18], [104, 36], [110, 78], [80, 106], [74, 60]], c.stoneD, { op: 0.5 }) + k.line([[34, 30], [74, 60], [80, 106]], { w: 0.6 });
  return s;
});
add('boulders', 'Boulder Cluster', 'fantasy', 'battle', (k) => {
  const { c } = k; let s = '';
  for (const [x, y, r] of [[40, 50, 26], [84, 44, 20], [70, 88, 28], [28, 92, 14]]) s += k.poly([[x - r, y], [x - r * 0.5, y - r], [x + r * 0.6, y - r * 0.9], [x + r, y], [x + r * 0.5, y + r * 0.9], [x - r * 0.6, y + r * 0.8]], c.rock);
  return s;
});
add('barrel', 'Barrel', 'fantasy', 'battle', (k) => {
  const { c } = k; return k.circ(64, 64, 36, c.wood) + k.circ(64, 64, 28, 'none', { w: 0.8 }) + k.line([[40, 64], [88, 64]], { w: 0.5 }) + k.line([[50, 46], [78, 46]], { w: 0.5 }) + k.line([[50, 82], [78, 82]], { w: 0.5 });
});
add('crate', 'Crate', 'fantasy', 'battle', (k) => {
  const { c } = k; return k.rect(28, 28, 72, 72, c.wood) + k.rect(36, 36, 56, 56, 'none', { w: 0.7 }) + k.line([[36, 36], [92, 92]], { w: 0.8 }) + k.line([[92, 36], [36, 92]], { w: 0.8 });
});
add('table', 'Table', 'fantasy', 'battle', (k) => {
  const { c } = k; let s = k.rect(14, 38, 100, 52, c.wood);
  for (let y = 50; y < 90; y += 13) s += k.line([[16, y], [112, y]], { w: 0.4 });
  s += k.circ(36, 56, 6, c.metal, { w: 0.5 }) + k.circ(88, 72, 6, c.metal, { w: 0.5 });
  return s;
});
add('chair', 'Chair', 'fantasy', 'battle', (k) => {
  const { c } = k; return k.rect(42, 46, 44, 44, c.wood) + k.rect(40, 32, 48, 12, c.woodD);
});
add('bed', 'Bed', 'fantasy', 'battle', (k) => {
  const { c } = k; return k.rect(30, 10, 68, 108, c.woodD) + k.rect(36, 16, 56, 96, c.white, { w: 0.7 }) + k.rect(42, 20, 44, 18, c.banner, { w: 0.6 }) + k.rect(36, 52, 56, 60, c.accent, { w: 0.7 });
});
add('chest', 'Treasure Chest', 'fantasy', 'battle', (k) => {
  const { c } = k; return k.rect(24, 40, 80, 50, c.wood) + k.rect(24, 40, 80, 14, c.woodD, { w: 0.7 }) + k.rect(58, 50, 12, 14, c.glow, { w: 0.6 }) + k.line([[38, 40], [38, 90]], { w: 0.6 }) + k.line([[90, 40], [90, 90]], { w: 0.6 });
});
add('campfire', 'Campfire', 'fantasy', 'battle', (k) => {
  const { c } = k; let s = '';
  for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2; s += k.circ(64 + Math.cos(a) * 36, 64 + Math.sin(a) * 36, 9, c.rock, { w: 0.6 }); }
  s += k.line([[44, 50], [84, 78]], { w: 2, stroke: c.woodD }) + k.line([[44, 78], [84, 50]], { w: 2, stroke: c.woodD });
  s += k.poly([[64, 40], [78, 58], [74, 80], [64, 88], [52, 80], [50, 58]], c.fire, { w: 0.6 }) + k.poly([[64, 54], [70, 66], [64, 78], [58, 66]], c.glow, { w: 0.4 });
  return s;
});
add('door', 'Door', 'fantasy', 'battle', (k) => {
  const { c } = k; return k.rect(14, 52, 100, 24, c.woodD) + k.line([[38, 54], [38, 74]], { w: 0.5 }) + k.line([[64, 54], [64, 74]], { w: 0.5 }) + k.line([[90, 54], [90, 74]], { w: 0.5 }) + k.circ(98, 64, 3, c.metal, { w: 0.4 });
});
add('stone-wall', 'Stone Wall Segment', 'fantasy', 'battle', (k) => {
  const { c } = k; let s = k.rect(2, 44, 252, 40, c.stone);
  for (let x = 4; x < 250; x += 22) s += k.line([[x, 46], [x, 82]], { w: 0.4 });
  s += k.line([[4, 64], [252, 64]], { w: 0.4 });
  return s;
}, 256, 128);
add('pillar', 'Pillar', 'fantasy', 'battle', (k) => {
  const { c } = k; return k.rect(26, 26, 76, 76, c.stoneD) + k.circ(64, 64, 30, c.stone) + k.circ(64, 64, 22, 'none', { w: 0.5 });
});
add('statue', 'Statue', 'fantasy', 'battle', (k) => {
  const { c } = k; return k.rect(22, 22, 84, 84, c.stoneD) + k.circ(64, 72, 22, c.stone) + k.circ(64, 50, 12, c.stone) + k.ell(40, 66, 8, 14, c.stone, { w: 0.6 }) + k.ell(88, 66, 8, 14, c.stone, { w: 0.6 });
});
add('rug', 'Rug', 'fantasy', 'battle', (k) => {
  const { c } = k; return k.rect(12, 28, 104, 72, c.accent) + k.rect(20, 36, 88, 56, 'none', { w: 0.6, stroke: c.glow }) + k.poly([[64, 44], [88, 64], [64, 84], [40, 64]], c.glow, { w: 0.5 });
});
add('tent', 'Tent', 'fantasy', 'battle', (k) => {
  const { c } = k; return k.poly([[16, 22], [112, 22], [112, 106], [16, 106]], c.banner) + k.line([[16, 22], [112, 106]], { w: 0.5 }) + k.line([[112, 22], [16, 106]], { w: 0.5 }) + k.poly([[16, 64], [64, 22], [112, 64], [64, 106]], 'none', { w: 0.5 });
});
add('cart', 'Cart', 'fantasy', 'battle', (k) => {
  const { c } = k; return k.rect(28, 34, 72, 60, c.wood) + k.rect(18, 40, 10, 20, c.woodD, { w: 0.6 }) + k.rect(100, 40, 10, 20, c.woodD, { w: 0.6 }) + k.rect(18, 68, 10, 20, c.woodD, { w: 0.6 }) + k.rect(100, 68, 10, 20, c.woodD, { w: 0.6 }) + k.line([[64, 94], [64, 124]], { w: 1 });
});
add('bones', 'Bones', 'fantasy', 'battle', (k) => {
  const { c } = k; return k.circ(50, 50, 14, c.white, { w: 0.7 }) + `<circle cx="45" cy="48" r="3" fill="${c.ink}"/><circle cx="55" cy="48" r="3" fill="${c.ink}"/>` + k.line([[64, 74], [100, 96]], { w: 2.2 }) + k.line([[70, 98], [96, 70]], { w: 2 });
});

// ======== SCI-FI ========
add('planet', 'Planet', 'scifi', 'world', (k) => {
  const { c } = k; return k.scirc(64, 64, 46, c.water) + k.fillOnly([[34, 40], [58, 30], [70, 48], [52, 62], [36, 58]], c.grass) + k.fillOnly([[70, 72], [96, 64], [100, 86], [78, 96]], c.grass) + `<path d="M64 18 A46 46 0 0 1 64 110 A30 46 0 0 0 64 18Z" fill="${c.ink}" opacity="0.25"/>` + k.scirc(64, 64, 46, 'none');
});
add('ringed-planet', 'Ringed Planet', 'scifi', 'world', (k) => {
  const { c } = k; return `<ellipse cx="64" cy="64" rx="60" ry="16" fill="none" stroke="${c.ink}" stroke-width="${k.sw * 2.5}"/><ellipse cx="64" cy="64" rx="60" ry="16" fill="none" stroke="${c.sand}" stroke-width="${k.sw * 1.5}"/>` + k.scirc(64, 64, 34, c.fire) + k.line([[34, 52], [94, 52]], { w: 0.5 }) + k.line([[30, 70], [98, 70]], { w: 0.5 }) + `<path d="M4 64 A60 16 0 0 0 124 64" fill="none" stroke="${c.sand}" stroke-width="${k.sw * 1.5}"/><path d="M4 64 A60 16 0 0 0 124 64" fill="none" stroke="${c.ink}" stroke-width="${k.sw * 0.5}"/>`;
});
add('star', 'Star / Sun', 'scifi', 'world', (k) => {
  const { c } = k; let s = '';
  for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; s += k.line([[64 + Math.cos(a) * 36, 64 + Math.sin(a) * 36], [64 + Math.cos(a) * (i % 2 ? 50 : 58), 64 + Math.sin(a) * (i % 2 ? 50 : 58)]], { w: 0.8 }); }
  return s + k.scirc(64, 64, 30, c.glow) + k.scirc(64, 64, 20, c.fire, { w: 0.4, op: 0.5 });
});
add('asteroid', 'Asteroid', 'scifi', 'world', (k) => {
  const { c } = k; return k.poly([[22, 60], [36, 28], [74, 20], [106, 44], [100, 92], [62, 108], [28, 92]], c.rock) + k.circ(50, 50, 9, c.stoneD, { w: 0.6 }) + k.circ(78, 76, 12, c.stoneD, { w: 0.6 }) + k.circ(46, 84, 5, c.stoneD, { w: 0.5 });
});
add('space-station', 'Space Station', 'scifi', 'world', (k) => {
  const { c } = k; let s = `<circle cx="64" cy="64" r="48" fill="none" stroke="${c.ink}" stroke-width="${k.sw * 5}"/><circle cx="64" cy="64" r="48" fill="none" stroke="${c.metal}" stroke-width="${k.sw * 3.6}"/>`;
  s += k.srect(60, 16, 8, 96, c.metalD) + k.srect(16, 60, 96, 8, c.metalD) + k.scirc(64, 64, 16, c.metal) + k.scirc(64, 64, 6, c.glass);
  return s;
});
add('starship', 'Starship', 'scifi', 'world', (k) => {
  const { c } = k; return `<path d="M64 6 L84 70 L110 100 L80 98 L72 112 L56 112 L48 98 L18 100 L44 70 Z" fill="${c.metal}" stroke="${c.ink}" stroke-width="${k.sw}" stroke-linejoin="round"/>` + `<path d="M64 26 L72 56 L56 56 Z" fill="${c.glass}" stroke="${c.ink}" stroke-width="${k.sw * 0.6}"/>` + k.srect(56, 112, 16, 6, c.fire, { w: 0.5 }) + k.line([[64, 60], [64, 104]], { w: 0.5, amt: 0 });
});
add('nebula', 'Nebula Cloud', 'scifi', 'decor', (k) => {
  const { c } = k; return k.fillOnly([[10, 70], [30, 34], [70, 26], [112, 44], [120, 84], [80, 104], [32, 100]], c.purple, { op: 0.45 }) + k.fillOnly([[34, 66], [54, 44], [86, 48], [96, 76], [64, 88]], c.water, { op: 0.4 }) + k.stipple(64, 64, 50, 36, 30);
});
add('dome', 'Habitat Dome', 'scifi', 'town', (k) => {
  const { c } = k; return k.srect(10, 98, 108, 20, c.metalD) + `<path d="M18 98 A46 46 0 0 1 110 98 Z" fill="${c.glass}" stroke="${c.ink}" stroke-width="${k.sw}" opacity="0.9"/>` + k.line([[64, 52], [64, 98]], { w: 0.5, amt: 0 }) + `<path d="M30 98 A34 46 0 0 1 98 98" fill="none" stroke="${c.ink}" stroke-width="${k.sw * 0.5}"/>` + k.srect(54, 104, 20, 14, c.dark, { w: 0.5 });
});
add('spire', 'Tech Spire', 'scifi', 'town', (k) => {
  const { c } = k; return `<path d="M54 124 L58 30 L64 6 L70 30 L74 124 Z" fill="${c.metal}" stroke="${c.ink}" stroke-width="${k.sw}" stroke-linejoin="round"/>` + k.srect(44, 100, 40, 24, c.metalD) + k.srect(58, 50, 12, 6, c.glow, { w: 0.4 }) + k.srect(58, 70, 12, 6, c.glow, { w: 0.4 }) + k.scirc(64, 8, 3, c.accent, { w: 0.4 });
});
add('antenna', 'Comms Antenna', 'scifi', 'town', (k) => {
  const { c } = k; return k.line([[64, 120], [64, 50]], { w: 1.4, amt: 0 }) + k.line([[44, 120], [64, 70], [84, 120]], { w: 0.8, amt: 0 }) + `<path d="M30 48 A40 40 0 0 0 98 48 Z" fill="${c.metal}" stroke="${c.ink}" stroke-width="${k.sw}"/>` + k.line([[64, 48], [64, 24]], { w: 0.6, amt: 0 }) + k.scirc(64, 22, 4, c.accent, { w: 0.5 });
});
add('landing-pad', 'Landing Pad', 'scifi', 'battle', (k) => {
  const { c } = k; return k.scirc(64, 64, 56, c.metalD) + k.scirc(64, 64, 46, 'none', { w: 0.5, stroke: c.glow }) + `<text x="64" y="80" text-anchor="middle" font-family="sans-serif" font-weight="bold" font-size="46" fill="${c.glow}" stroke="${c.ink}" stroke-width="${k.sw * 0.5}">H</text>`;
});
add('console', 'Computer Console', 'scifi', 'battle', (k) => {
  const { c } = k; return k.srect(14, 40, 100, 48, c.metalD, { rx: 6 }) + k.srect(22, 46, 50, 24, c.glass, { w: 0.6, rx: 2 }) + k.srect(80, 48, 8, 8, c.accent, { w: 0.4 }) + k.srect(94, 48, 8, 8, c.glow, { w: 0.4 }) + k.srect(80, 62, 22, 6, c.leaf, { w: 0.4 }) + k.srect(22, 76, 80, 6, c.metal, { w: 0.4 });
});
add('scifi-crate', 'Cargo Container', 'scifi', 'battle', (k) => {
  const { c } = k; let s = k.srect(16, 30, 96, 68, c.fire, { rx: 4 }); for (let x = 28; x < 108; x += 12) s += k.line([[x, 34], [x, 94]], { w: 0.5, amt: 0 }); return s + k.srect(16, 30, 96, 10, c.metalD, { w: 0.6 });
});
add('reactor', 'Reactor Core', 'scifi', 'battle', (k) => {
  const { c } = k; return k.scirc(64, 64, 54, c.metalD) + k.scirc(64, 64, 38, c.metal) + k.scirc(64, 64, 22, c.glass) + k.scirc(64, 64, 10, c.glow, { w: 0.5 }) + k.line([[10, 64], [26, 64]], { amt: 0 }) + k.line([[102, 64], [118, 64]], { amt: 0 }) + k.line([[64, 10], [64, 26]], { amt: 0 }) + k.line([[64, 102], [64, 118]], { amt: 0 });
});
add('bulkhead', 'Bulkhead Door', 'scifi', 'battle', (k) => {
  const { c } = k; return k.srect(6, 48, 116, 32, c.metalD) + k.srect(30, 52, 34, 24, c.metal, { w: 0.6 }) + k.srect(64, 52, 34, 24, c.metal, { w: 0.6 }) + k.line([[30, 76], [64, 52]], { w: 0.5, amt: 0, stroke: c.glow }) + k.line([[64, 76], [98, 52]], { w: 0.5, amt: 0, stroke: c.glow });
});
add('vent', 'Floor Vent', 'scifi', 'battle', (k) => {
  const { c } = k; let s = k.srect(24, 24, 80, 80, c.metalD, { rx: 6 }); for (let y = 34; y < 100; y += 10) s += k.srect(32, y, 64, 4, c.dark, { w: 0.3 }); return s;
});
add('turret', 'Turret', 'scifi', 'battle', (k) => {
  const { c } = k; return k.scirc(64, 64, 34, c.metalD) + k.srect(58, 6, 12, 52, c.metal) + k.scirc(64, 64, 20, c.metal) + k.scirc(64, 64, 6, c.accent, { w: 0.5 });
});
add('cryopod', 'Cryo Pod', 'scifi', 'battle', (k) => {
  const { c } = k; return k.srect(34, 8, 60, 112, c.metal, { rx: 28 }) + k.srect(42, 20, 44, 82, c.glass, { rx: 20, w: 0.7 }) + k.srect(56, 106, 16, 6, c.glow, { w: 0.4 });
});
add('crater', 'Crater', 'scifi', 'battle', (k) => {
  const { c } = k; return k.ell(64, 64, 52, 46, c.sand) + k.ell(66, 68, 38, 32, c.stoneD, { w: 0.6 }) + k.ell(70, 72, 24, 18, c.rock, { w: 0.4 });
});

// ======== MODERN ========
add('skyline', 'City Skyline', 'modern', 'world', (k) => {
  const { c } = k; let s = '';
  for (const [x, w, h] of [[8, 22, 50], [30, 18, 84], [48, 26, 64], [74, 16, 104], [90, 24, 72], [114, 20, 56], [134, 18, 40]]) {
    s += k.srect(x, 120 - h, w, h, c.stone);
    for (let y = 126 - h; y < 112; y += 10) s += k.srect(x + 4, y, w - 8, 3, c.glass, { w: 0.2 });
  }
  return s;
}, 160, 128);
add('factory', 'Factory', 'modern', 'world', (k) => {
  const { c } = k; return `<path d="M8 120 L8 70 L36 54 L36 70 L64 54 L64 70 L92 54 L92 120 Z" fill="${c.stone}" stroke="${c.ink}" stroke-width="${k.sw}" stroke-linejoin="round"/>` + k.srect(96, 30, 14, 90, c.roofD) + k.circ(106, 18, 8, c.stone, { w: 0.5, op: 0.6 }) + k.srect(20, 90, 14, 14, c.glass, { w: 0.5 }) + k.srect(52, 90, 14, 14, c.glass, { w: 0.5 });
});
add('wind-turbine', 'Wind Turbine', 'modern', 'world', (k) => {
  const { c } = k; return `<path d="M60 124 L62 40 L66 40 L68 124 Z" fill="${c.white}" stroke="${c.ink}" stroke-width="${k.sw * 0.8}"/>` + [0, 120, 240].map((a) => `<path d="M64 38 L60 4 L68 6 Z" transform="rotate(${a + 20} 64 38)" fill="${c.white}" stroke="${c.ink}" stroke-width="${k.sw * 0.7}"/>`).join('') + k.scirc(64, 38, 4, c.metal, { w: 0.5 });
});
add('airport', 'Airport Marker', 'modern', 'world', (k) => {
  const { c } = k; return k.scirc(64, 64, 52, c.white) + `<path d="M64 24 L70 54 L104 70 L104 78 L70 70 L68 94 L80 102 L80 108 L64 104 L48 108 L48 102 L60 94 L58 70 L24 78 L24 70 L58 54 Z" fill="${c.ink}"/>`;
});
add('modern-house', 'Modern House', 'modern', 'town', (k) => {
  const { c } = k; return `<path d="M10 122 L10 56 L70 56 L70 122 Z M70 122 L112 106 L112 46 L70 56 Z" fill="${c.white}" stroke="${c.ink}" stroke-width="${k.sw}" stroke-linejoin="round"/>` + `<path d="M4 58 L74 58 L118 44 L48 44 Z" fill="${c.stoneD}" stroke="${c.ink}" stroke-width="${k.sw}" stroke-linejoin="round"/>` + k.srect(18, 70, 30, 26, c.glass, { w: 0.6 }) + k.srect(54, 90, 12, 32, c.woodD, { w: 0.6 }) + `<path d="M80 66 L102 58 L102 84 L80 92 Z" fill="${c.glass}" stroke="${c.ink}" stroke-width="${k.sw * 0.6}"/>`;
});
add('apartments', 'Apartment Block', 'modern', 'town', (k) => {
  const { c } = k; let s = `<path d="M14 124 L14 20 L76 20 L76 124 Z" fill="${c.plaster}" stroke="${c.ink}" stroke-width="${k.sw}"/><path d="M76 124 L112 110 L112 8 L76 20 Z" fill="${c.stone}" stroke="${c.ink}" stroke-width="${k.sw}"/><path d="M14 20 L50 8 L112 8 L76 20 Z" fill="${c.stoneD}" stroke="${c.ink}" stroke-width="${k.sw}"/>`;
  for (let y = 30; y < 110; y += 16) for (let x = 22; x < 70; x += 16) s += k.srect(x, y, 9, 10, c.glass, { w: 0.4 });
  return s;
});
add('shop', 'Shop', 'modern', 'town', (k) => {
  const { c } = k; return `<path d="M10 122 L10 50 L82 50 L82 122 Z" fill="${c.plaster}" stroke="${c.ink}" stroke-width="${k.sw}"/><path d="M82 122 L114 110 L114 40 L82 50 Z" fill="${c.stone}" stroke="${c.ink}" stroke-width="${k.sw}"/>` + k.srect(16, 84, 40, 30, c.glass, { w: 0.6 }) + k.srect(62, 84, 14, 38, c.woodD, { w: 0.6 }) + `<path d="M8 82 L84 82 L84 70 L8 70 Z" fill="${c.accent}" stroke="${c.ink}" stroke-width="${k.sw * 0.7}"/>` + k.srect(18, 56, 56, 10, c.white, { w: 0.5 });
});
add('car', 'Car (top-down)', 'modern', 'battle', (k) => {
  const { c } = k; return k.srect(38, 10, 52, 108, c.accent, { rx: 14 }) + k.srect(44, 32, 40, 16, c.glass, { rx: 4, w: 0.6 }) + k.srect(44, 84, 40, 14, c.glass, { rx: 4, w: 0.6 }) + k.srect(46, 50, 36, 32, c.roofD, { rx: 4, w: 0.4 });
});
add('sofa', 'Sofa', 'modern', 'battle', (k) => {
  const { c } = k; return k.srect(10, 40, 108, 50, c.purple, { rx: 8 }) + k.srect(10, 40, 108, 14, c.dark, { rx: 6, w: 0.6, op: 0.6 }) + k.srect(20, 56, 42, 30, c.purple, { rx: 4, w: 0.5 }) + k.srect(66, 56, 42, 30, c.purple, { rx: 4, w: 0.5 });
});
add('desk', 'Office Desk', 'modern', 'battle', (k) => {
  const { c } = k; return k.srect(10, 36, 108, 50, c.wood) + k.srect(40, 42, 40, 8, c.dark, { w: 0.5 }) + k.srect(30, 58, 30, 18, c.white, { w: 0.4 }) + k.scirc(94, 66, 8, c.metal, { w: 0.4 }) + k.scirc(64, 104, 14, c.dark, { w: 0.6 });
});
add('bin', 'Wheelie Bin', 'modern', 'battle', (k) => {
  const { c } = k; return k.srect(34, 30, 60, 68, c.leafD, { rx: 6 }) + k.srect(34, 30, 60, 14, c.leaf, { rx: 4, w: 0.6 });
});
add('streetlight', 'Street Light', 'modern', 'battle', (k) => {
  const { c } = k; return `<circle cx="64" cy="64" r="44" fill="${c.glow}" opacity="0.35"/>` + k.scirc(64, 64, 10, c.metalD) + k.scirc(64, 64, 5, c.glow, { w: 0.4 });
});
add('cone', 'Traffic Cone', 'modern', 'battle', (k) => {
  const { c } = k; return k.srect(34, 34, 60, 60, c.fire, { rx: 6 }) + k.scirc(64, 64, 20, c.white) + k.scirc(64, 64, 10, c.fire);
});

// ======== REALISTIC ========
add('real-mountain', 'Shaded Mountain', 'realistic', 'world', (k) => {
  const { c } = k; let s = '';
  s += k.fillOnly([[4, 116], [30, 72], [46, 64], [64, 20], [82, 54], [96, 60], [124, 116]], c.rock, { amt: 1.5 });
  s += k.fillOnly([[64, 20], [82, 54], [96, 60], [124, 116], [70, 116], [74, 80], [66, 50]], c.stoneD, { amt: 1.5 });
  s += k.fillOnly([[64, 20], [72, 36], [66, 44], [60, 34], [54, 40]], c.snow, { amt: 0.6 });
  for (let i = 0; i < 6; i++) s += k.line([[66 + i * 8, 40 + i * 10], [70 + i * 6, 70 + i * 8]], { w: 0.35, op: 0.6 });
  return s + k.line([[4, 116], [30, 72], [46, 64], [64, 20], [82, 54], [96, 60], [124, 116]], { w: 0.5, op: 0.7 });
});
add('real-forest', 'Woodland Patch', 'realistic', 'world', (k) => {
  const { c } = k; let s = '';
  const r = k.r;
  for (let i = 0; i < 40; i++) { const x = 18 + r() * 124, y = 18 + r() * 92, rad = 7 + r() * 8; s += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(rad)}" fill="${r() > 0.5 ? c.leaf : c.leafD}" stroke="${c.ink}" stroke-width="${k.sw * 0.3}" opacity="0.95"/>`; }
  return s;
}, 160, 128);
add('real-lake', 'Lake', 'realistic', 'world', (k) => {
  const { c } = k; return k.poly([[14, 64], [26, 30], [62, 22], [104, 32], [118, 66], [96, 98], [52, 104], [22, 92]], c.water, { amt: 3 }) + k.poly([[34, 62], [46, 42], [76, 38], [98, 54], [88, 80], [52, 86]], c.waterD, { amt: 3, w: 0.3, op: 0.5 });
});
add('real-field', 'Farm Field', 'realistic', 'battle', (k) => {
  const { c } = k; let s = k.rect(8, 8, 112, 112, c.grass, { w: 0.6 }); for (let x = 16; x < 116; x += 8) s += k.line([[x, 12], [x, 116]], { w: 0.35, stroke: c.leafD }); return s;
});
add('real-tree', 'Oak (top-down)', 'realistic', 'battle', (k) => {
  const { c } = k; let s = `<circle cx="72" cy="72" r="50" fill="#000" opacity="0.2"/>`; const r = k.r;
  for (let i = 0; i < 22; i++) { const a = r() * Math.PI * 2, d = r() * 32; s += `<circle cx="${f(64 + Math.cos(a) * d)}" cy="${f(64 + Math.sin(a) * d)}" r="${f(14 + r() * 8)}" fill="${i % 3 ? c.leaf : c.leafD}" stroke="${c.ink}" stroke-width="${k.sw * 0.25}"/>`; }
  return s;
});
add('real-rocks', 'Scree Rocks', 'realistic', 'battle', (k) => {
  const { c } = k; let s = ''; const r = k.r;
  for (let i = 0; i < 14; i++) { const x = 16 + r() * 96, y = 16 + r() * 96, z = 5 + r() * 10; s += k.poly([[x - z, y], [x - z * 0.4, y - z], [x + z * 0.7, y - z * 0.8], [x + z, y + z * 0.2], [x, y + z]], i % 2 ? c.rock : c.stone, { w: 0.4 }); }
  return s;
});
add('real-pond', 'Pond', 'realistic', 'battle', (k) => {
  const { c } = k; return k.poly([[16, 64], [28, 30], [70, 18], [108, 40], [112, 84], [72, 108], [30, 98]], c.water, { amt: 3 }) + k.ell(50, 60, 9, 6, c.leaf, { w: 0.4 }) + k.ell(80, 80, 7, 5, c.leaf, { w: 0.4 });
});

// ---------------------------------------------------------------- write SVG files
function wrap(style, a, body) {
  const st = STYLES[style];
  const pad = 6;
  const vb = `${-pad} ${-pad - 6} ${a.w + pad * 2} ${a.h + pad * 2 + 6}`;
  const W = a.w + pad * 2, H = a.h + pad * 2 + 6;
  if (!st.wash) return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" width="${W * 2}" height="${H * 2}">${body}</svg>`;
  // watercolour: a soft, bleeding colour pass + a light, broken ink pass
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" width="${W * 2}" height="${H * 2}">` +
    `<defs><filter id="wc" x="-15%" y="-15%" width="130%" height="130%">` +
    `<feTurbulence type="fractalNoise" baseFrequency="0.045" numOctaves="3" seed="${hash(a.id) % 97}" result="n"/>` +
    `<feDisplacementMap in="SourceGraphic" in2="n" scale="5" result="d"/><feGaussianBlur in="d" stdDeviation="0.9" result="b"/>` +
    `<feComposite in="b" in2="d" operator="arithmetic" k1="0" k2="0.6" k3="0.55" k4="0"/></filter>` +
    `<filter id="ink"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="1" result="g"/><feDisplacementMap in="SourceGraphic" in2="g" scale="1.2"/></filter></defs>` +
    `<style>.wash *{stroke:none!important}.inkp *{fill:none!important}.inkp circle[fill="${st.c.ink}"]{fill:${st.c.ink}!important}</style>` +
    `<g class="wash" filter="url(#wc)" opacity="0.85">${body}</g><g class="inkp" filter="url(#ink)" opacity="0.75">${body}</g></svg>`;
}

const manifest = [];
for (const style of Object.keys(STYLES)) fs.mkdirSync(path.join(ROOT, 'assets', style), { recursive: true });
for (const a of A) {
  for (const style of Object.keys(STYLES)) {
    const k = makeCtx(style, a.id);
    const body = a.draw(k);
    fs.writeFileSync(path.join(ROOT, 'assets', style, `${a.id}.svg`), wrap(style, a, body));
  }
  manifest.push({ id: a.id, name: a.name, genre: a.genre, kind: a.kind, w: a.w + 12, h: a.h + 18, licence: 'CC0-1.0', author: 'project-tech-me (Pocket-Mapp-Creator original)' });
}
const out = `// AUTO-GENERATED by tools/generate-assets.js — do not edit by hand.\n// All assets: original work, CC0 1.0. See ASSET-LICENSES.md\nwindow.ASSET_STYLES = ${JSON.stringify(Object.fromEntries(Object.entries(STYLES).map(([k, v]) => [k, { label: v.label, c: v.c }])))};\nwindow.ASSET_MANIFEST = ${JSON.stringify(manifest, null, 0)};\n`;
fs.writeFileSync(path.join(ROOT, 'src', 'asset-manifest.js'), out);
console.log(`Generated ${A.length} assets x ${Object.keys(STYLES).length} styles = ${A.length * 3} SVG files.`);
