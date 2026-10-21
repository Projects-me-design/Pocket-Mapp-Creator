// Pocket-Mapp-Creator — terrain renderer (land/sea coastlines, ripple lines, paper texture)
// Copyright (c) 2026 project-tech-me — MIT Licence
(function () {
  const MT = (window.MT = window.MT || {});

  MT.rng = function (seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  // Multi-octave value noise in [0,1]. `cell` is the base feature size in pixels.
  MT.valueNoise = function (w, h, cell, seed, octaves = 4) {
    const out = new Float32Array(w * h);
    const r = MT.rng(seed);
    let amp = 1, total = 0, c = cell;
    for (let o = 0; o < octaves; o++) {
      const gw = Math.ceil(w / c) + 2, gh = Math.ceil(h / c) + 2;
      const g = new Float32Array(gw * gh);
      for (let i = 0; i < g.length; i++) g[i] = r();
      for (let y = 0; y < h; y++) {
        const fy = y / c, iy = fy | 0; let ty = fy - iy; ty = ty * ty * (3 - 2 * ty);
        const row0 = iy * gw, row1 = (iy + 1) * gw;
        for (let x = 0; x < w; x++) {
          const fx = x / c, ix = fx | 0; let tx = fx - ix; tx = tx * tx * (3 - 2 * tx);
          const a = g[row0 + ix], b = g[row0 + ix + 1], cc = g[row1 + ix], d = g[row1 + ix + 1];
          out[y * w + x] += amp * ((a + (b - a) * tx) + ((cc + (d - cc) * tx) - (a + (b - a) * tx)) * ty);
        }
      }
      total += amp; amp *= 0.5; c = Math.max(1, c / 2);
    }
    for (let i = 0; i < out.length; i++) out[i] /= total;
    return out;
  };

  // Two-pass chamfer distance transform. feature[i]=1 → distance 0.
  function distance(feature, w, h) {
    const INF = 1e9, D = 1, DD = 1.41421, DK = 2.23607;
    const d = new Float32Array(w * h);
    for (let i = 0; i < d.length; i++) d[i] = feature[i] ? 0 : INF;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x; let v = d[i]; if (v === 0) continue;
        if (x > 0 && d[i - 1] + D < v) v = d[i - 1] + D;
        if (y > 0) {
          const u = i - w;
          if (d[u] + D < v) v = d[u] + D;
          if (x > 0 && d[u - 1] + DD < v) v = d[u - 1] + DD;
          if (x < w - 1 && d[u + 1] + DD < v) v = d[u + 1] + DD;
          // knight moves (5x5 chamfer) for rounder distance contours
          if (x > 1 && d[u - 2] + DK < v) v = d[u - 2] + DK;
          if (x < w - 2 && d[u + 2] + DK < v) v = d[u + 2] + DK;
          if (y > 1) { const u2 = u - w; if (x > 0 && d[u2 - 1] + DK < v) v = d[u2 - 1] + DK; if (x < w - 1 && d[u2 + 1] + DK < v) v = d[u2 + 1] + DK; }
        }
        d[i] = v;
      }
    }
    for (let y = h - 1; y >= 0; y--) {
      for (let x = w - 1; x >= 0; x--) {
        const i = y * w + x; let v = d[i]; if (v === 0) continue;
        if (x < w - 1 && d[i + 1] + D < v) v = d[i + 1] + D;
        if (y < h - 1) {
          const u = i + w;
          if (d[u] + D < v) v = d[u] + D;
          if (x < w - 1 && d[u + 1] + DD < v) v = d[u + 1] + DD;
          if (x > 0 && d[u - 1] + DD < v) v = d[u - 1] + DD;
          if (x < w - 2 && d[u + 2] + DK < v) v = d[u + 2] + DK;
          if (x > 1 && d[u - 2] + DK < v) v = d[u - 2] + DK;
          if (y < h - 2) { const u2 = u + w; if (x < w - 1 && d[u2 + 1] + DK < v) v = d[u2 + 1] + DK; if (x > 0 && d[u2 - 1] + DK < v) v = d[u2 - 1] + DK; }
        }
        d[i] = v;
      }
    }
    return d;
  }

  const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

  // Visual recipe for each map style. Colours are RGB arrays.
  const LOOK = {
    parchment: {
      ink: hex('#3b2817'), sea: hex('#dcc79a'), seaFar: hex('#e3d1a8'), land: hex('#f1e3bf'), landAlt: hex('#e9d6aa'),
      ground: hex('#efe0b8'), groundAlt: hex('#e3cf9f'), path: hex('#d2b682'),
      coastW: 2.6, rings: 4, ringGap: 7, ringW: 1.0, ringFade: 0.85, grain: 0.07, stain: 0.12, vignette: 0.32, beach: 0, foam: 0
    },
    colour: {
      ink: hex('#2d2216'), sea: hex('#3f84b8'), seaFar: hex('#2c6797'), shallow: hex('#77b7da'), land: hex('#a7c27a'), landAlt: hex('#86ad5d'),
      ground: hex('#8fb562'), groundAlt: hex('#76a050'), path: hex('#c8ad7c'), beachCol: hex('#e7d39a'),
      coastW: 1.8, rings: 2, ringGap: 9, ringW: 1.0, ringFade: 0.25, grain: 0.035, stain: 0.05, vignette: 0.12, beach: 5, foam: 1
    },
    watercolour: {
      ink: hex('#5a4634'), sea: hex('#b9d9ea'), seaFar: hex('#d6e8ef'), shallow: hex('#8fc2dd'), land: hex('#e9e3c4'), landAlt: hex('#cfe0b0'),
      ground: hex('#d6e3b5'), groundAlt: hex('#bdd59a'), path: hex('#e0c99c'),
      coastW: 1.1, rings: 0, ringGap: 8, ringW: 1, ringFade: 0, grain: 0.06, stain: 0.18, vignette: 0.1, beach: 0, foam: 0, pigmentEdge: 1
    }
  };
  MT.LOOK = LOOK;

  const noiseCache = new Map();
  function noiseFor(w, h, seed) {
    const key = `${w}x${h}:${seed}`;
    if (noiseCache.has(key)) return noiseCache.get(key);
    const n = {
      low: MT.valueNoise(w, h, Math.max(w, h) / 5, seed, 4),
      wob: MT.valueNoise(w, h, 12, seed + 7, 2),
      grain: MT.valueNoise(w, h, 2, seed + 13, 2)
    };
    if (noiseCache.size > 4) noiseCache.clear();
    noiseCache.set(key, n);
    return n;
  }

  // Read a mask canvas, resampled to (w,h). Returns Uint8 alpha values.
  function sampleMask(maskCanvas, w, h, blur = 0) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.imageSmoothingEnabled = true;
    if (blur) x.filter = `blur(${blur}px)`;
    x.drawImage(maskCanvas, 0, 0, w, h);
    const d = x.getImageData(0, 0, w, h).data;
    const a = new Uint8Array(w * h);
    for (let i = 0; i < a.length; i++) a[i] = d[i * 4 + 3];
    return a;
  }

  /**
   * Render the base map (sea, land, coasts, paths, paper) to a canvas.
   * @param {object} o { landMask, pathMask, mapW, mapH, scale (output px per map px), style, mapType, seed }
   */
  MT.renderBase = function (o) {
    const L = LOOK[o.style] || LOOK.parchment;
    const w = Math.max(1, Math.round(o.mapW * o.scale)), h = Math.max(1, Math.round(o.mapH * o.scale));
    const s = o.scale; // output px per map px
    const land = sampleMask(o.landMask, w, h);
    const pathA = sampleMask(o.pathMask, w, h, Math.max(0.5, 1.5 * s));
    const isLand = new Uint8Array(w * h), isWater = new Uint8Array(w * h);
    let anyWater = false, anyLand = false;
    for (let i = 0; i < land.length; i++) { if (land[i] > 127) { isLand[i] = 1; anyLand = true; } else { isWater[i] = 1; anyWater = true; } }
    const dOut = anyLand ? distance(isLand, w, h) : null; // for water px: distance to land
    const dIn = anyWater ? distance(isWater, w, h) : null; // for land px: distance to water
    const N = noiseFor(w, h, o.seed || 1);
    const world = o.mapType === 'world';
    const landCol = world ? L.land : L.ground, landAlt = world ? L.landAlt : L.groundAlt;
    const rings = world ? L.rings : Math.min(1, L.rings);

    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d');
    const img = ctx.createImageData(w, h); const px = img.data;
    const coastHalf = (L.coastW * Math.max(0.6, Math.sqrt(o.uiScale || 1))) / 2;
    const cx = w / 2, cy = h / 2, maxR = Math.sqrt(cx * cx + cy * cy);
    const sm = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

    for (let y = 0, i = 0; y < h; y++) {
      for (let x = 0; x < w; x++, i++) {
        const low = N.low[i], wob = (N.wob[i] - 0.5) * 1.6, grain = N.grain[i];
        let r, g, b, inkA = 0;
        if (isLand[i]) {
          const d = dIn ? (dIn[i] - 0.5) / s + wob : 1e9; // map px from the coast
          const t = Math.min(1, Math.max(0, (low - 0.35) * 2.2));
          r = landCol[0] + (landAlt[0] - landCol[0]) * t; g = landCol[1] + (landAlt[1] - landCol[1]) * t; b = landCol[2] + (landAlt[2] - landCol[2]) * t;
          if (L.beach && d < L.beach + coastHalf) { const k = 1 - sm(L.beach * 0.5, L.beach + coastHalf, d); r += (L.beachCol[0] - r) * k; g += (L.beachCol[1] - g) * k; b += (L.beachCol[2] - b) * k; }
          if (L.pigmentEdge && d < 10) { const k = (1 - d / 10) * 0.35; r -= 40 * k; g -= 30 * k; b -= 40 * k; }
          if (o.style === 'parchment' && d < 6) { const k = (1 - d / 6) * 0.06; r *= 1 - k; g *= 1 - k; b *= 1 - k; }
          // painted paths / roads
          const pa = pathA[i] / 255;
          if (pa > 0.02) {
            const k = Math.min(1, pa * 1.6);
            r += (L.path[0] - r) * k; g += (L.path[1] - g) * k; b += (L.path[2] - b) * k;
            if (o.style !== 'watercolour') { const edge = 1 - Math.abs(pa - 0.42) / 0.14; if (edge > 0) inkA = Math.max(inkA, edge * (o.style === 'parchment' ? 0.55 : 0.35)); }
          }
          if (d < coastHalf + 0.6) inkA = Math.max(inkA, 1 - sm(coastHalf - 0.6, coastHalf + 0.6, d));
        } else {
          const d = dOut ? (dOut[i] - 0.5) / s + wob : 1e9;
          const far = Math.min(1, d / 90);
          r = L.sea[0] + (L.seaFar[0] - L.sea[0]) * far; g = L.sea[1] + (L.seaFar[1] - L.sea[1]) * far; b = L.sea[2] + (L.seaFar[2] - L.sea[2]) * far;
          if (L.shallow) { const k = 1 - sm(0, world ? 28 : 14, d); r += (L.shallow[0] - r) * k; g += (L.shallow[1] - g) * k; b += (L.shallow[2] - b) * k; }
          if (L.pigmentEdge) { const k = (1 - sm(0, 12, d)) * 0.45; r -= 70 * k; g -= 40 * k; b -= 20 * k; }
          if (L.foam && d < coastHalf + 3) { const k = (1 - sm(coastHalf, coastHalf + 3, d)) * 0.7; r += (255 - r) * k; g += (255 - g) * k; b += (255 - b) * k; }
          if (d < coastHalf + 0.6) inkA = Math.max(inkA, 1 - sm(coastHalf - 0.6, coastHalf + 0.6, d));
          // Tolkien-style ripple lines following the coast
          for (let k = 1; k <= rings; k++) {
            const rd = coastHalf + k * L.ringGap * (1 + (k - 1) * 0.18);
            const dist = Math.abs(d - rd);
            const lw = L.ringW * 0.5 * (1 - (k - 1) * 0.12);
            if (dist < lw + 0.7) {
              const a = (1 - sm(lw - 0.5, lw + 0.7, dist)) * L.ringFade * (1 - (k - 1) / (rings + 0.5));
              // break rings up a little so they look hand inked
              if (N.wob[i] > 0.25 || k === 1) inkA = Math.max(inkA, a);
            }
          }
        }
        // paper: stains, grain and vignette
        const st = (low - 0.5) * L.stain; const gr = (grain - 0.5) * L.grain;
        const dx = x - cx, dy = y - cy; const v = Math.pow(Math.sqrt(dx * dx + dy * dy) / maxR, 2.4) * L.vignette;
        const m = 1 - st - gr - v;
        r *= m; g *= m * (o.style === 'parchment' ? 0.985 : 1); b *= m * (o.style === 'parchment' ? 0.95 : 1);
        if (inkA > 0) { r += (L.ink[0] - r) * inkA; g += (L.ink[1] - g) * inkA; b += (L.ink[2] - b) * inkA; }
        px[i * 4] = r; px[i * 4 + 1] = g; px[i * 4 + 2] = b; px[i * 4 + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return cv;
  };

  // Random continent / island generator for world maps
  MT.generateLand = function (maskCanvas, seed, coverage = 0.42) {
    const w = maskCanvas.width, h = maskCanvas.height;
    const n = MT.valueNoise(w, h, Math.max(w, h) / 3.2, seed, 6);
    const vals = new Float32Array(w * h);
    for (let y = 0, i = 0; y < h; y++) for (let x = 0; x < w; x++, i++) {
      const dx = (x / w - 0.5) * 2, dy = (y / h - 0.5) * 2;
      vals[i] = n[i] - Math.pow(Math.max(Math.abs(dx), Math.abs(dy)) * 0.75 + Math.sqrt(dx * dx + dy * dy) * 0.25, 3) * 0.55;
    }
    const sorted = Float32Array.from(vals).sort();
    const thr = sorted[Math.floor(sorted.length * (1 - coverage))];
    const ctx = maskCanvas.getContext('2d');
    const img = ctx.createImageData(w, h);
    for (let i = 0; i < vals.length; i++) { const on = vals[i] > thr; img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = 255; img.data[i * 4 + 3] = on ? 255 : 0; }
    ctx.putImageData(img, 0, 0);
  };
})();
