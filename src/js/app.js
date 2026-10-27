// Pocket-Mapp-Creator — editor
// Copyright (c) 2026 project-tech-me <project-tech-me@protonmail.com> — MIT Licence
(function () {
  'use strict';
  const MT = window.MT;
  const MANIFEST = window.ASSET_MANIFEST;
  const BY_ID = Object.fromEntries(MANIFEST.map((a) => [a.id, a]));
  const api = window.mapp || null;
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const uid = () => Math.random().toString(36).slice(2, 10);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const rad = (d) => (d * Math.PI) / 180;
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const KIND_BASE = { world: 0.8, town: 1, battle: 0.55, decor: 1.2 };
  const FONTS = ['IM Fell English', 'IM Fell English SC', 'Uncial Antiqua', 'Cinzel', 'Macondo', 'EB Garamond', 'Caveat', 'Orbitron', 'Georgia', 'Arial'];
  const INK = { parchment: '#3b2817', colour: '#2d2216', watercolour: '#4a3a2b' };
  const PAPER = { parchment: '#f1e3bf', colour: '#f6efdc', watercolour: '#f7efdc' };
  const MAP_TYPES = {
    world: { label: 'World / Region', desc: 'Continents, kingdoms, coastlines — side-view icons', kind: 'world', sizes: [[3000, 2000], [4000, 2800], [2400, 1800], [1920, 1080]] },
    town: { label: 'Town / City / Village', desc: '3/4 view buildings, walls, roads', kind: 'town', sizes: [[2400, 1800], [3000, 2000], [1920, 1080]] },
    battle: { label: 'Battle Map', desc: 'Top-down RPG encounter maps with a grid', kind: 'battle', sizes: [[1400, 1400], [2100, 1400], [2800, 2100], [1050, 1050]] }
  };
  const LINE_KINDS = { river: 'River', road: 'Road (dashed)', trail: 'Trail (dotted)', border: 'Border (dash-dot)', wall: 'Wall (solid)', ink: 'Ink line' };

  // ------------------------------------------------------------------ state
  let doc = null;
  let filePath = null;
  let landMask, pathMask, maskScale = 1;
  let base = null, baseDirty = true, baseBusy = false;
  const view = { zoom: 1, ox: 0, oy: 0 };
  let tool = 'select';
  let stampKey = null;
  const selection = new Set();
  const ui = {
    brush: 60, brushMode: 'add', rough: true,
    scatter: false, spacing: 1, randScale: 0.15, randRot: 0, randFlip: true, stampScale: 1, depthSort: true,
    lineKind: 'river', lineWidth: 6,
    textFont: 'IM Fell English', textSize: 60, textColor: null, textBold: false, textItalic: false,
    genre: 'fantasy', kind: 'all', search: ''
  };
  const imgCache = new Map();
  let needsDraw = true;
  const history = []; let hIndex = -1;
  let lastLandSnap = null, lastPathSnap = null;

  const stage = $('#stage');
  const sctx = stage.getContext('2d');
  const measureCtx = document.createElement('canvas').getContext('2d');

  // ------------------------------------------------------------------ document
  function makeDoc(o = {}) {
    const type = o.type || 'world';
    return {
      app: 'Pocket-Mapp-Creator', version: 1,
      name: o.name || 'Untitled Map',
      type,
      width: o.width || MAP_TYPES[type].sizes[0][0],
      height: o.height || MAP_TYPES[type].sizes[0][1],
      style: o.style || 'parchment',
      seed: o.seed || Math.floor(Math.random() * 1e6),
      grid: { type: type === 'battle' ? 'square' : 'none', size: 70, color: '#000000', opacity: 0.25 },
      border: type !== 'battle',
      objects: [],
      custom: {}
    };
  }

  function allocMasks(w, h) {
    maskScale = Math.min(1, Math.sqrt(3.2e6 / (w * h)));
    const mw = Math.max(1, Math.round(w * maskScale)), mh = Math.max(1, Math.round(h * maskScale));
    landMask = document.createElement('canvas'); landMask.width = mw; landMask.height = mh;
    pathMask = document.createElement('canvas'); pathMask.width = mw; pathMask.height = mh;
  }
  function fillMask(m, on) {
    const c = m.getContext('2d'); c.clearRect(0, 0, m.width, m.height);
    if (on) { c.fillStyle = '#fff'; c.fillRect(0, 0, m.width, m.height); }
  }

  function newMap(o) {
    landSel = null;
    doc = makeDoc(o);
    allocMasks(doc.width, doc.height);
    const start = o.start || 'sea'; // every new map starts as open ocean; the user paints the land
    if (start === 'generate' || start === 'example') MT.generateLand(landMask, doc.seed, 0.44);
    else if (start === 'land') fillMask(landMask, true);
    else fillMask(landMask, false);
    fillMask(pathMask, false);
    filePath = null;
    selection.clear();
    ui.kind = MAP_TYPES[doc.type].kind;
    ui.textSize = Math.round(Math.min(doc.width, doc.height) / 30); ui.textColor = null;
    syncTopbar(); buildLibrary();
    resetHistory();
    baseDirty = true;
    if (o.start === 'example') buildExample();
    zoomFit();
    refreshPanels();
  }

  // ------------------------------------------------------------------ images
  function assetSrc(key, style = doc.style) {
    if (key.startsWith('custom:')) return doc.custom[key.slice(7)]?.src;
    return `../assets/${style}/${key}.svg`;
  }
  function assetInfo(key) {
    if (key.startsWith('custom:')) {
      const c = doc.custom[key.slice(7)];
      return c ? { name: c.name, w: c.w, h: c.h, kind: 'custom', base: 1 } : null;
    }
    const a = BY_ID[key];
    return a ? { name: a.name, w: a.w, h: a.h, kind: a.kind, base: KIND_BASE[a.kind] || 1, genre: a.genre } : null;
  }
  function getImg(key, style = doc.style) {
    const k = key.startsWith('custom:') ? key : `${style}/${key}`;
    let im = imgCache.get(k);
    if (!im) {
      im = new Image();
      im.onload = () => { needsDraw = true; };
      im.src = assetSrc(key, style) || '';
      imgCache.set(k, im);
    }
    return im;
  }
  function whenImagesReady() {
    const keys = new Set(doc.objects.filter((o) => o.t === 'asset').map((o) => o.a));
    return Promise.all([...keys].map((k) => { const im = getImg(k); return im.complete ? im.decode().catch(() => {}) : new Promise((r) => { im.addEventListener('load', r, { once: true }); im.addEventListener('error', r, { once: true }); }); }));
  }

  // ------------------------------------------------------------------ base terrain
  function rebuildBase(sync = false) {
    if (baseBusy) { baseDirty = true; return; }
    baseBusy = true;
    status('Inking coastlines…');
    const run = () => {
      try {
        base = MT.renderBase({ landMask, pathMask, mapW: doc.width, mapH: doc.height, scale: maskScale, style: doc.style, mapType: doc.type, seed: doc.seed });
      } finally {
        baseBusy = false; baseDirty = false; needsDraw = true; status('');
      }
    };
    if (sync) run(); else setTimeout(run, 16);
  }

  // ------------------------------------------------------------------ drawing objects
  function objSize(o) {
    if (o.t === 'asset') {
      const inf = assetInfo(o.a) || { w: 100, h: 100, base: 1 };
      return { w: inf.w * inf.base * o.s, h: inf.h * inf.base * o.s };
    }
    if (o.t === 'text') {
      const m = measureText(o);
      return { w: m.w * o.s, h: m.h * o.s };
    }
    return { w: 0, h: 0 };
  }
  function fontStr(o) { return `${o.italic ? 'italic ' : ''}${o.bold ? '700 ' : ''}${o.size}px "${o.font}"`; }
  function measureText(o) {
    measureCtx.font = fontStr(o);
    measureCtx.letterSpacing = `${o.spacing || 0}px`;
    const lines = textLines(o);
    let w = 0; for (const l of lines) w = Math.max(w, measureCtx.measureText(l).width);
    let h = lines.length * o.size * 1.15;
    if (o.curve) { const th = (Math.abs(o.curve) / 100) * Math.PI * 0.9; const R = w / th; h += R * (1 - Math.cos(th / 2)); w = Math.min(w, 2 * R * Math.sin(th / 2)) || w; }
    return { w: Math.max(w, 10), h: Math.max(h, 10) };
  }
  function textLines(o) { const t = o.upper ? o.text.toUpperCase() : o.text; return o.curve ? [t.replace(/\n/g, ' ')] : t.split('\n'); }

  function drawAsset(ctx, o) {
    const inf = assetInfo(o.a); if (!inf) return;
    const im = getImg(o.a); if (!im.complete || !im.naturalWidth) return;
    const k = inf.base * o.s;
    ctx.save();
    ctx.translate(o.x, o.y); ctx.rotate(rad(o.r)); ctx.scale(o.fx ? -k : k, k);
    ctx.globalAlpha = o.o ?? 1;
    ctx.drawImage(im, -inf.w / 2, -inf.h / 2, inf.w, inf.h);
    ctx.restore();
  }

  function drawText(ctx, o) {
    ctx.save();
    ctx.translate(o.x, o.y); ctx.rotate(rad(o.r)); ctx.scale(o.s, o.s);
    ctx.globalAlpha = o.o ?? 1;
    ctx.font = fontStr(o);
    ctx.letterSpacing = `${o.spacing || 0}px`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    const halo = o.halo ? (o.haloColor || PAPER[doc.style]) : null;
    const lines = textLines(o);
    if (!o.curve) {
      const lh = o.size * 1.15, y0 = -((lines.length - 1) * lh) / 2;
      lines.forEach((l, i) => {
        if (halo) { ctx.strokeStyle = halo; ctx.lineWidth = o.size * 0.22; ctx.globalAlpha = (o.o ?? 1) * 0.85; ctx.strokeText(l, 0, y0 + i * lh); ctx.globalAlpha = o.o ?? 1; }
        ctx.fillStyle = o.color; ctx.fillText(l, 0, y0 + i * lh);
      });
    } else {
      const t = lines[0]; ctx.letterSpacing = '0px';
      const sp = o.spacing || 0;
      const widths = [...t].map((ch) => ctx.measureText(ch).width + sp);
      const W = widths.reduce((a, b) => a + b, 0) - sp;
      const th = (Math.abs(o.curve) / 100) * Math.PI * 0.9, R = W / th, sign = o.curve > 0 ? 1 : -1;
      const sag = R * (1 - Math.cos(th / 2));
      ctx.translate(0, sign * sag / 2);
      const pass = (stroke) => {
        let acc = 0;
        [...t].forEach((ch, i) => {
          const a = -th / 2 + (acc + widths[i] / 2) / R; acc += widths[i];
          ctx.save(); ctx.translate(0, sign * R); ctx.rotate(sign * a); ctx.translate(0, -sign * R);
          if (stroke) ctx.strokeText(ch, 0, 0); else ctx.fillText(ch, 0, 0);
          ctx.restore();
        });
      };
      if (halo) { ctx.strokeStyle = halo; ctx.lineWidth = o.size * 0.22; ctx.globalAlpha = (o.o ?? 1) * 0.85; pass(true); ctx.globalAlpha = o.o ?? 1; }
      ctx.fillStyle = o.color; pass(false);
    }
    ctx.restore();
  }

  function smoothPath(ctx, pts) {
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
    if (pts.length === 2) { ctx.lineTo(pts[1][0], pts[1][1]); return; }
    for (let i = 1; i < pts.length - 1; i++) {
      const mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2;
      ctx.quadraticCurveTo(pts[i][0], pts[i][1], mx, my);
    }
    const l = pts[pts.length - 1]; ctx.lineTo(l[0], l[1]);
  }
  function lineColours(kind) {
    const L = MT.LOOK[doc.style]; const ink = INK[doc.style];
    const water = doc.style === 'parchment' ? '#dcc79a' : `rgb(${L.shallow ? L.shallow.join(',') : L.sea.join(',')})`;
    return { ink, water, border: doc.style === 'parchment' ? '#8e4a2c' : '#a33a2a', wall: doc.style === 'parchment' ? '#b99a68' : '#8a847a' };
  }
  function drawLine(ctx, o) {
    const pts = o.pts; if (!pts || pts.length < 2) return;
    const C = lineColours(o.kind); const w = o.w;
    ctx.save(); ctx.globalAlpha = o.o ?? 1; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (o.kind === 'river') {
      // tapered: thin at the source (first point), wide at the mouth
      const n = pts.length;
      const seg = (pass) => {
        for (let i = 1; i < n; i++) {
          const t = i / (n - 1), ww = w * (0.25 + 0.75 * t);
          ctx.beginPath(); ctx.moveTo(pts[i - 1][0], pts[i - 1][1]); ctx.lineTo(pts[i][0], pts[i][1]);
          ctx.lineWidth = pass ? Math.max(0.5, ww - 1.6) : ww + 1.6;
          ctx.strokeStyle = pass ? C.water : C.ink; ctx.stroke();
        }
      };
      seg(false); seg(true);
    } else {
      smoothPath(ctx, pts);
      if (o.kind === 'road') { ctx.setLineDash([w * 2.6, w * 1.6]); ctx.strokeStyle = C.ink; ctx.lineWidth = w * 0.6; }
      else if (o.kind === 'trail') { ctx.setLineDash([0.1, w * 1.8]); ctx.strokeStyle = C.ink; ctx.lineWidth = w * 0.8; }
      else if (o.kind === 'border') { ctx.setLineDash([w * 4, w * 1.5, w * 0.5, w * 1.5]); ctx.strokeStyle = C.border; ctx.lineWidth = w * 0.5; }
      else if (o.kind === 'wall') { ctx.strokeStyle = C.ink; ctx.lineWidth = w + 3; ctx.stroke(); smoothPath(ctx, pts); ctx.strokeStyle = C.wall; ctx.lineWidth = w; }
      else { ctx.strokeStyle = o.color || C.ink; ctx.lineWidth = w * 0.5; }
      ctx.stroke();
    }
    ctx.restore();
  }
  function drawObject(ctx, o) {
    if (o.hidden) return;
    if (o.t === 'asset') drawAsset(ctx, o);
    else if (o.t === 'text') drawText(ctx, o);
    else if (o.t === 'line') drawLine(ctx, o);
  }

  function drawGrid(ctx) {
    const g = doc.grid; if (g.type === 'none') return;
    ctx.save(); ctx.strokeStyle = g.color; ctx.globalAlpha = g.opacity; ctx.lineWidth = 1.5;
    ctx.beginPath();
    if (g.type === 'square') {
      for (let x = 0; x <= doc.width + 0.1; x += g.size) { ctx.moveTo(x, 0); ctx.lineTo(x, doc.height); }
      for (let y = 0; y <= doc.height + 0.1; y += g.size) { ctx.moveTo(0, y); ctx.lineTo(doc.width, y); }
    } else {
      const r = g.size / 2, hh = Math.sqrt(3) * r;
      for (let col = 0, x = r; x - r < doc.width; col++, x += r * 1.5) {
        for (let y = (col % 2 ? hh : hh / 2); y - hh / 2 < doc.height; y += hh) {
          for (let i = 0; i < 6; i++) { const a = (Math.PI / 3) * i, px = x + r * Math.cos(a), py = y + r * Math.sin(a); if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); }
          ctx.closePath();
        }
      }
    }
    ctx.stroke(); ctx.restore();
  }
  function drawBorder(ctx) {
    if (!doc.border) return;
    const ink = INK[doc.style]; const m = Math.min(doc.width, doc.height);
    const t = Math.max(6, m * 0.008), g = t * 1.6;
    ctx.save(); ctx.strokeStyle = ink;
    ctx.lineWidth = t; ctx.strokeRect(t / 2, t / 2, doc.width - t, doc.height - t);
    ctx.lineWidth = t * 0.25; ctx.strokeRect(t + g, t + g, doc.width - 2 * (t + g), doc.height - 2 * (t + g));
    if (doc.style === 'parchment') {
      // tick marks like an old surveyed chart
      ctx.lineWidth = t * 0.2;
      const step = m / 24, a = t, b = t + g;
      for (let x = b + step; x < doc.width - b; x += step) { ctx.beginPath(); ctx.moveTo(x, a); ctx.lineTo(x, b); ctx.moveTo(x, doc.height - a); ctx.lineTo(x, doc.height - b); ctx.stroke(); }
      for (let y = b + step; y < doc.height - b; y += step) { ctx.beginPath(); ctx.moveTo(a, y); ctx.lineTo(b, y); ctx.moveTo(doc.width - a, y); ctx.lineTo(doc.width - b, y); ctx.stroke(); }
    }
    ctx.restore();
  }

  // Render the full map into a 2D context in map coordinates
  function renderMapContent(ctx, baseCanvas, opts = {}) {
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    if (baseCanvas) ctx.drawImage(baseCanvas, 0, 0, doc.width, doc.height);
    else { ctx.fillStyle = PAPER[doc.style]; ctx.fillRect(0, 0, doc.width, doc.height); }
    if (opts.floatLand) drawFloatingLand(ctx);
    if (opts.grid !== false) drawGrid(ctx);
    for (const o of doc.objects) if (o.t !== 'text') drawObject(ctx, o);
    drawBorder(ctx);
    // labels are always drawn last so land, assets and lines never cover them
    for (const o of doc.objects) if (o.t === 'text') drawObject(ctx, o);
  }

  // ------------------------------------------------------------------ stage render loop
  function resizeStage() {
    const r = stage.parentElement.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    stage.width = Math.round(r.width * dpr); stage.height = Math.round(r.height * dpr);
    needsDraw = true;
  }
  let paintPreview = null; // canvas at mask res showing un-inked brush strokes
  let lineDraft = null, marquee = null, hoverPt = null;

  function draw() {
    if (!doc) return;
    if (baseDirty && !baseBusy && !painting) rebuildBase();
    const dpr = window.devicePixelRatio || 1;
    const ctx = sctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, stage.width, stage.height);
    ctx.setTransform(dpr * view.zoom, 0, 0, dpr * view.zoom, dpr * view.ox, dpr * view.oy);
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.55)'; ctx.shadowBlur = 30; ctx.fillStyle = '#000'; ctx.fillRect(0, 0, doc.width, doc.height); ctx.restore();
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, doc.width, doc.height); ctx.clip();
    renderMapContent(ctx, base, { floatLand: true });
    if (paintPreview) { ctx.globalAlpha = 0.85; ctx.drawImage(paintPreview, 0, 0, doc.width, doc.height); ctx.globalAlpha = 1; }
    if (lineDraft && lineDraft.pts.length > 1) drawLine(ctx, lineDraft);
    ctx.restore();
    drawSelection(ctx); drawLandSelection(ctx);
    if (marquee) {
      ctx.save(); ctx.strokeStyle = '#4fa3e0'; ctx.fillStyle = 'rgba(79,163,224,.12)'; ctx.lineWidth = 1 / view.zoom; ctx.setLineDash([5 / view.zoom, 4 / view.zoom]);
      const x = Math.min(marquee.x0, marquee.x1), y = Math.min(marquee.y0, marquee.y1);
      ctx.fillRect(x, y, Math.abs(marquee.x1 - marquee.x0), Math.abs(marquee.y1 - marquee.y0)); ctx.strokeRect(x, y, Math.abs(marquee.x1 - marquee.x0), Math.abs(marquee.y1 - marquee.y0)); ctx.restore();
    }
    if (hoverPt && (isBrush())) {
      ctx.save(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5 / view.zoom; ctx.beginPath(); ctx.arc(hoverPt.x, hoverPt.y, ui.brush / 2, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = '#000'; ctx.setLineDash([4 / view.zoom, 4 / view.zoom]); ctx.stroke(); ctx.restore();
    }
    if (hoverPt && tool === 'stamp' && stampKey && !dragState) {
      const ghost = { t: 'asset', a: stampKey, x: hoverPt.x, y: hoverPt.y, s: ui.stampScale, r: 0, o: 0.55 };
      drawAsset(ctx, ghost);
    }
    $('#zoomLabel').textContent = `${Math.round(view.zoom * 100)}%`;
  }
  function loop() { if (needsDraw) { needsDraw = false; draw(); } requestAnimationFrame(loop); }

  // selection outline + handles
  function objCorners(o) {
    const { w, h } = objSize(o); const c = Math.cos(rad(o.r)), s = Math.sin(rad(o.r));
    return [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]].map(([x, y]) => [o.x + x * c - y * s, o.y + x * s + y * c]);
  }
  function lineBounds(o) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of o.pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    const p = o.w; return { x0: x0 - p, y0: y0 - p, x1: x1 + p, y1: y1 + p };
  }
  function handlePositions(o) {
    const cs = objCorners(o); const { h } = objSize(o);
    const c = Math.cos(rad(o.r)), s = Math.sin(rad(o.r)), off = h / 2 + 28 / view.zoom;
    return { corners: cs, rot: [o.x + off * s, o.y - off * c], top: [(cs[0][0] + cs[1][0]) / 2, (cs[0][1] + cs[1][1]) / 2] };
  }
  function drawSelection(ctx) {
    const z = view.zoom;
    for (const id of selection) {
      const o = findObj(id); if (!o) continue;
      ctx.save(); ctx.strokeStyle = '#4fa3e0'; ctx.lineWidth = 1.5 / z;
      if (o.t === 'line') {
        const b = lineBounds(o); ctx.setLineDash([6 / z, 4 / z]); ctx.strokeRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0);
        ctx.restore(); continue;
      }
      const cs = objCorners(o);
      ctx.beginPath(); cs.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); ctx.stroke();
      if (selection.size === 1) {
        const hp = handlePositions(o), hs = 9 / z;
        ctx.beginPath(); ctx.moveTo(hp.top[0], hp.top[1]); ctx.lineTo(hp.rot[0], hp.rot[1]); ctx.stroke();
        ctx.fillStyle = '#fff';
        for (const [x, y] of hp.corners) { ctx.fillRect(x - hs / 2, y - hs / 2, hs, hs); ctx.strokeRect(x - hs / 2, y - hs / 2, hs, hs); }
        ctx.beginPath(); ctx.arc(hp.rot[0], hp.rot[1], hs * 0.65, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      }
      ctx.restore();
    }
  }

  // ------------------------------------------------------------------ hit testing
  function findObj(id) { return doc.objects.find((o) => o.id === id); }
  function hitObj(o, x, y) {
    if (o.hidden || o.locked) return false;
    if (o.t === 'line') {
      const tol = o.w / 2 + 6 / view.zoom;
      for (let i = 1; i < o.pts.length; i++) {
        const [ax, ay] = o.pts[i - 1], [bx, by] = o.pts[i];
        const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy || 1;
        const t = clamp(((x - ax) * dx + (y - ay) * dy) / L, 0, 1);
        if (Math.hypot(x - (ax + t * dx), y - (ay + t * dy)) < tol) return true;
      }
      return false;
    }
    const { w, h } = objSize(o);
    const c = Math.cos(-rad(o.r)), s = Math.sin(-rad(o.r));
    const lx = (x - o.x) * c - (y - o.y) * s, ly = (x - o.x) * s + (y - o.y) * c;
    return Math.abs(lx) <= w / 2 && Math.abs(ly) <= h / 2;
  }
  function hitTest(x, y) {
    for (let i = doc.objects.length - 1; i >= 0; i--) if (doc.objects[i].t === 'text' && hitObj(doc.objects[i], x, y)) return doc.objects[i];
    for (let i = doc.objects.length - 1; i >= 0; i--) if (doc.objects[i].t !== 'text' && hitObj(doc.objects[i], x, y)) return doc.objects[i];
    return null;
  }
  function hitHandle(x, y) {
    if (selection.size !== 1) return null;
    const o = findObj([...selection][0]); if (!o || o.t === 'line') return null;
    const hp = handlePositions(o), tol = 9 / view.zoom;
    if (Math.hypot(x - hp.rot[0], y - hp.rot[1]) < tol) return { type: 'rotate', o };
    for (const [cx, cy] of hp.corners) if (Math.hypot(x - cx, y - cy) < tol) return { type: 'scale', o };
    return null;
  }

  // ------------------------------------------------------------------ painting masks
  let painting = null;
  function dab(mask, x, y, size, erase, rough, rng) {
    const c = mask.getContext('2d');
    c.globalCompositeOperation = erase ? 'destination-out' : 'source-over';
    c.fillStyle = '#fff';
    const r = (size / 2) * maskScale, mx = x * maskScale, my = y * maskScale;
    c.beginPath();
    if (rough) {
      const n = 18;
      for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2, rr = r * (0.82 + rng() * 0.18); const px = mx + Math.cos(a) * rr, py = my + Math.sin(a) * rr; if (i) c.lineTo(px, py); else c.moveTo(px, py); }
      c.closePath();
    } else c.arc(mx, my, r, 0, Math.PI * 2);
    c.fill();
    c.globalCompositeOperation = 'source-over';
    // preview
    const pc = paintPreview.getContext('2d');
    const L = MT.LOOK[doc.style];
    const target = mask === landMask ? (erase ? L.sea : (doc.type === 'world' ? L.land : L.ground)) : (erase ? (doc.type === 'world' ? L.land : L.ground) : L.path);
    pc.fillStyle = `rgb(${target.join(',')})`;
    pc.beginPath(); pc.arc(mx, my, r, 0, Math.PI * 2); pc.fill();
  }
  function startPaint(pt, kind, erase) {
    paintPreview = document.createElement('canvas'); paintPreview.width = landMask.width; paintPreview.height = landMask.height;
    painting = { mask: kind === 'land' ? landMask : pathMask, erase, last: pt, rng: MT.rng(Math.floor(Math.random() * 1e9)) };
    dab(painting.mask, pt.x, pt.y, ui.brush, erase, ui.rough, painting.rng);
  }
  function continuePaint(pt) {
    const p = painting; const d = Math.hypot(pt.x - p.last.x, pt.y - p.last.y); const step = Math.max(2, ui.brush * 0.18);
    for (let t = step; t <= d; t += step) dab(p.mask, p.last.x + ((pt.x - p.last.x) * t) / d, p.last.y + ((pt.y - p.last.y) * t) / d, ui.brush, p.erase, ui.rough, p.rng);
    if (d >= step) p.last = pt;
    needsDraw = true;
  }
  function endPaint() {
    painting = null;
    base = MT.renderBase({ landMask, pathMask, mapW: doc.width, mapH: doc.height, scale: maskScale, style: doc.style, mapType: doc.type, seed: doc.seed });
    baseDirty = false; paintPreview = null; needsDraw = true;
    commit();
  }

  // ------------------------------------------------------------------ landmass selection (move / resize / rotate land)
  // Land is a painted mask, so a "landmass" is one connected region of it. Selecting one lifts it
  // out of the mask into a floating piece; it is stamped back (transformed) when the selection ends.
  let landSel = null; let settling = false;
  function landAt(x, y) {
    const mx = Math.floor(x * maskScale), my = Math.floor(y * maskScale);
    if (mx < 0 || my < 0 || mx >= landMask.width || my >= landMask.height) return false;
    return landMask.getContext('2d', { willReadFrequently: true }).getImageData(mx, my, 1, 1).data[3] > 127;
  }
  function pickLand(x, y) {
    const mw = landMask.width, mh = landMask.height;
    const lctx = landMask.getContext('2d', { willReadFrequently: true });
    const pctx = pathMask.getContext('2d', { willReadFrequently: true });
    const limg = lctx.getImageData(0, 0, mw, mh), L = limg.data;
    const sx = Math.floor(x * maskScale), sy = Math.floor(y * maskScale);
    if (sx < 0 || sy < 0 || sx >= mw || sy >= mh || L[(sy * mw + sx) * 4 + 3] <= 127) return null;
    // flood fill the connected land
    const seen = new Uint8Array(mw * mh); const stack = new Int32Array(mw * mh); let sp = 0;
    let x0 = sx, x1 = sx, y0 = sy, y1 = sy;
    stack[sp++] = sy * mw + sx; seen[sy * mw + sx] = 1;
    while (sp) {
      const i = stack[--sp], px = i % mw, py = (i / mw) | 0;
      if (px < x0) x0 = px; if (px > x1) x1 = px; if (py < y0) y0 = py; if (py > y1) y1 = py;
      const nb = [px > 0 ? i - 1 : -1, px < mw - 1 ? i + 1 : -1, py > 0 ? i - mw : -1, py < mh - 1 ? i + mw : -1];
      for (const n of nb) if (n >= 0 && !seen[n] && L[n * 4 + 3] > 127) { seen[n] = 1; stack[sp++] = n; }
    }
    // include the soft anti-aliased edge pixels around it
    x0 = Math.max(0, x0 - 1); y0 = Math.max(0, y0 - 1); x1 = Math.min(mw - 1, x1 + 1); y1 = Math.min(mh - 1, y1 + 1);
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
    const inc = new Uint8Array(bw * bh);
    for (let yy = y0; yy <= y1; yy++) for (let xx = x0; xx <= x1; xx++) {
      const i = yy * mw + xx; let on = seen[i];
      if (!on && L[i * 4 + 3] > 0) on = (xx > 0 && seen[i - 1]) || (xx < mw - 1 && seen[i + 1]) || (yy > 0 && seen[i - mw]) || (yy < mh - 1 && seen[i + mw]);
      inc[(yy - y0) * bw + (xx - x0)] = on ? 1 : 0;
    }
    // lift the land (and any ground paint on it) out into floating canvases
    const pimg = pctx.getImageData(0, 0, mw, mh), Pd = pimg.data;
    const comp = document.createElement('canvas'); comp.width = bw; comp.height = bh;
    const pcomp = document.createElement('canvas'); pcomp.width = bw; pcomp.height = bh;
    const ci = comp.getContext('2d').createImageData(bw, bh), pi = pcomp.getContext('2d').createImageData(bw, bh);
    for (let yy = 0; yy < bh; yy++) for (let xx = 0; xx < bw; xx++) {
      const k = yy * bw + xx; if (!inc[k]) continue;
      const i = ((yy + y0) * mw + xx + x0) * 4;
      ci.data[k * 4] = ci.data[k * 4 + 1] = ci.data[k * 4 + 2] = 255; ci.data[k * 4 + 3] = L[i + 3];
      pi.data[k * 4] = pi.data[k * 4 + 1] = pi.data[k * 4 + 2] = 255; pi.data[k * 4 + 3] = Pd[i + 3];
      L[i + 3] = 0; Pd[i + 3] = 0;
    }
    comp.getContext('2d').putImageData(ci, 0, 0); pcomp.getContext('2d').putImageData(pi, 0, 0);
    // preview image: the land as currently rendered (coastline, ripples and all), cut out around it
    if (baseDirty || !base) rebuildBase(true);
    const m = Math.ceil(60 * maskScale);
    const pw = bw + 2 * m, ph = bh + 2 * m;
    const halo = document.createElement('canvas'); halo.width = pw; halo.height = ph;
    const hc = halo.getContext('2d');
    for (let a = 0; a < 16; a++) for (const rr of [m * 0.45, m * 0.9]) hc.drawImage(comp, m + Math.cos(a / 16 * 6.283) * rr, m + Math.sin(a / 16 * 6.283) * rr);
    const prev = document.createElement('canvas'); prev.width = pw; prev.height = ph;
    const pc = prev.getContext('2d');
    pc.drawImage(base, x0 - m, y0 - m, pw, ph, 0, 0, pw, ph);
    pc.globalCompositeOperation = 'destination-in'; pc.filter = `blur(${Math.max(1, m * 0.15)}px)`; pc.drawImage(halo, 0, 0);
    lctx.putImageData(limg, 0, 0); pctx.putImageData(pimg, 0, 0);
    // items standing on this land move with it
    const onIt = (px, py) => { const mx = Math.floor(px * maskScale) - x0, my = Math.floor(py * maskScale) - y0; return mx >= 0 && my >= 0 && mx < bw && my < bh && inc[my * bw + mx]; };
    const items = [];
    for (const o of doc.objects) {
      if (o.hidden || o.locked) continue;
      if (o.t === 'line') { const n = o.pts.filter(([px, py]) => onIt(px, py)).length; if (n > o.pts.length / 2) items.push({ o, pts: o.pts.map((q) => q.slice()), w: o.w }); }
      else if (onIt(o.x, o.y)) items.push({ o, x: o.x, y: o.y, s: o.s, r: o.r });
    }
    const ms = maskScale;
    landSel = { comp, pcomp, prev, m, x0, y0, bw, bh, w0: bw / ms, h0: bh / ms, cx: (x0 + bw / 2) / ms, cy: (y0 + bh / 2) / ms, dx: 0, dy: 0, s: 1, r: 0, items, withItems: true, changed: false };
    baseDirty = true; needsDraw = true;
    return landSel;
  }
  function landPoint(px, py) { // apply the current land transform to a map point
    const L = landSel, c = Math.cos(rad(L.r)), s = Math.sin(rad(L.r));
    const x = (px - L.cx) * L.s, y = (py - L.cy) * L.s;
    return [L.cx + L.dx + x * c - y * s, L.cy + L.dy + x * s + y * c];
  }
  function applyLandItems() {
    const L = landSel; if (!L) return;
    for (const it of L.items) {
      const o = it.o;
      if (o.t === 'line') { o.pts = (L.withItems ? it.pts.map(([x, y]) => landPoint(x, y)) : it.pts.map((q) => q.slice())); o.w = L.withItems ? it.w * L.s : it.w; }
      else if (L.withItems) { [o.x, o.y] = landPoint(it.x, it.y); o.s = it.s * L.s; o.r = ((it.r + L.r + 540) % 360) - 180; }
      else { o.x = it.x; o.y = it.y; o.s = it.s; o.r = it.r; }
    }
    L.changed = L.dx !== 0 || L.dy !== 0 || L.s !== 1 || L.r !== 0;
    needsDraw = true;
  }
  function stampLand(mask, src) {
    const L = landSel, c = mask.getContext('2d'), ms = maskScale;
    c.save(); c.setTransform(ms, 0, 0, ms, 0, 0);
    c.translate(L.cx + L.dx, L.cy + L.dy); c.rotate(rad(L.r)); c.scale(L.s, L.s);
    c.imageSmoothingEnabled = !(L.s === 1 && L.r === 0);
    c.drawImage(src, -L.w0 / 2, -L.h0 / 2, L.w0, L.h0);
    c.restore();
  }
  // Put the floating land back into the map. remove=true deletes it instead.
  function settleLand(remove = false) {
    if (!landSel || settling) return;
    settling = true;
    const L = landSel; const changed = L.changed || remove;
    if (!remove) {
      if (L.s === 1 && L.r === 0) { // exact pixel restore (no resampling) when only moved or untouched
        const ox = Math.round(L.dx * maskScale), oy = Math.round(L.dy * maskScale);
        landMask.getContext('2d').drawImage(L.comp, L.x0 + ox, L.y0 + oy); pathMask.getContext('2d').drawImage(L.pcomp, L.x0 + ox, L.y0 + oy);
      } else { stampLand(landMask, L.comp); stampLand(pathMask, L.pcomp); }
    }
    landSel = null;
    base = MT.renderBase({ landMask, pathMask, mapW: doc.width, mapH: doc.height, scale: maskScale, style: doc.style, mapType: doc.type, seed: doc.seed });
    baseDirty = false; needsDraw = true;
    if (changed) commit();
    settling = false;
    renderProps();
  }
  function landCorners() {
    const L = landSel; const w = L.w0 / 2, h = L.h0 / 2;
    return [[-w, -h], [w, -h], [w, h], [-w, h]].map(([x, y]) => landPoint(L.cx + x, L.cy + y));
  }
  function landRotHandle() {
    const L = landSel; const c = Math.cos(rad(L.r)), s = Math.sin(rad(L.r)), off = (L.h0 * L.s) / 2 + 28 / view.zoom;
    return [L.cx + L.dx + off * s, L.cy + L.dy - off * c];
  }
  function hitLandHandle(x, y) {
    if (!landSel) return null; const tol = 10 / view.zoom;
    const rh = landRotHandle(); if (Math.hypot(x - rh[0], y - rh[1]) < tol) return 'rotate';
    for (const [cx, cy] of landCorners()) if (Math.hypot(x - cx, y - cy) < tol) return 'scale';
    return null;
  }
  function insideLandBox(x, y) {
    if (!landSel) return false; const L = landSel;
    const c = Math.cos(-rad(L.r)), s = Math.sin(-rad(L.r));
    const lx = (x - L.cx - L.dx) * c - (y - L.cy - L.dy) * s, ly = (x - L.cx - L.dx) * s + (y - L.cy - L.dy) * c;
    return Math.abs(lx) <= (L.w0 * L.s) / 2 && Math.abs(ly) <= (L.h0 * L.s) / 2;
  }
  function drawFloatingLand(ctx) {
    const L = landSel; if (!L) return; const ms = maskScale;
    ctx.save(); ctx.translate(L.cx + L.dx, L.cy + L.dy); ctx.rotate(rad(L.r)); ctx.scale(L.s, L.s);
    ctx.drawImage(L.prev, -L.w0 / 2 - L.m / ms, -L.h0 / 2 - L.m / ms, L.prev.width / ms, L.prev.height / ms);
    ctx.restore();
  }
  function drawLandSelection(ctx) {
    if (!landSel) return; const z = view.zoom, cs = landCorners(), hs = 10 / z, rh = landRotHandle();
    ctx.save(); ctx.strokeStyle = '#e0a640'; ctx.lineWidth = 2 / z; ctx.setLineDash([8 / z, 5 / z]);
    ctx.beginPath(); cs.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); ctx.stroke();
    ctx.setLineDash([]);
    const top = [(cs[0][0] + cs[1][0]) / 2, (cs[0][1] + cs[1][1]) / 2];
    ctx.beginPath(); ctx.moveTo(top[0], top[1]); ctx.lineTo(rh[0], rh[1]); ctx.stroke();
    ctx.fillStyle = '#fff';
    for (const [x, y] of cs) { ctx.fillRect(x - hs / 2, y - hs / 2, hs, hs); ctx.strokeRect(x - hs / 2, y - hs / 2, hs, hs); }
    ctx.beginPath(); ctx.arc(rh[0], rh[1], hs * 0.65, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.restore();
  }
  function setLandScale(v) { if (!landSel) return; landSel.s = clamp(v, 0.05, 10); applyLandItems(); }
  function setLandRot(v) { if (!landSel) return; landSel.r = ((v + 540) % 360) - 180; applyLandItems(); }

  // ------------------------------------------------------------------ objects: create / edit
  function addAsset(key, x, y, opts = {}) {
    const o = { id: uid(), t: 'asset', a: key, x, y, s: opts.s ?? ui.stampScale, r: opts.r ?? 0, fx: !!opts.fx, o: 1 };
    if (ui.depthSort && (assetInfo(key)?.kind === 'world' || assetInfo(key)?.kind === 'town')) {
      // keep side-view / 3/4 icons layered so lower ones overlap higher ones
      let idx = doc.objects.length;
      for (let i = 0; i < doc.objects.length; i++) {
        const q = doc.objects[i];
        if (q.t === 'asset' && (assetInfo(q.a)?.kind === 'world' || assetInfo(q.a)?.kind === 'town') && q.y > y) { idx = i; break; }
      }
      // never slip beneath decor/text added later than the last terrain icon
      doc.objects.splice(idx, 0, o);
    } else doc.objects.push(o);
    return o;
  }
  function addText(x, y, props = {}) {
    const o = Object.assign({ id: uid(), t: 'text', text: 'New Label', x, y, s: 1, r: 0, o: 1, font: ui.textFont, size: ui.textSize || Math.round(Math.min(doc.width, doc.height) / 30), color: ui.textColor || INK[doc.style], halo: true, bold: ui.textBold, italic: ui.textItalic, upper: false, spacing: 2, curve: 0 }, props);
    doc.objects.push(o); return o;
  }
  function deleteIds(ids) {
    const s = new Set(ids);
    doc.objects = doc.objects.filter((o) => !s.has(o.id));
    for (const id of ids) selection.delete(id);
  }
  function duplicateSelection() {
    const created = [];
    for (const id of selection) {
      const o = findObj(id); if (!o) continue;
      const c = JSON.parse(JSON.stringify(o)); c.id = uid();
      if (c.t === 'line') c.pts = c.pts.map(([x, y]) => [x + 30, y + 30]); else { c.x += 30; c.y += 30; }
      doc.objects.push(c); created.push(c.id);
    }
    selection.clear(); created.forEach((id) => selection.add(id));
    commit(); refreshPanels();
  }
  function moveObj(o, dx, dy) { if (o.t === 'line') o.pts = o.pts.map(([x, y]) => [x + dx, y + dy]); else { o.x += dx; o.y += dy; } }
  function reorder(dir) {
    const ids = [...selection]; if (!ids.length) return;
    const sel = doc.objects.filter((o) => selection.has(o.id)), rest = doc.objects.filter((o) => !selection.has(o.id));
    if (dir === 'front') doc.objects = rest.concat(sel);
    else if (dir === 'back') doc.objects = sel.concat(rest);
    else {
      const arr = doc.objects;
      const order = dir === 'up' ? [...arr.keys()].reverse() : [...arr.keys()];
      for (const i of order) {
        const j = dir === 'up' ? i + 1 : i - 1;
        if (selection.has(arr[i].id) && j >= 0 && j < arr.length && !selection.has(arr[j].id)) [arr[i], arr[j]] = [arr[j], arr[i]];
      }
    }
    commit(); needsDraw = true;
  }

  // ------------------------------------------------------------------ history
  function snapshot() {
    const lc = landMask.getContext('2d', { willReadFrequently: true }), pc = pathMask.getContext('2d', { willReadFrequently: true });
    const land = lc.getImageData(0, 0, landMask.width, landMask.height), path = pathMask.getContext('2d').getImageData(0, 0, pathMask.width, pathMask.height);
    // share identical mask data with the previous state to save memory
    const same = (a, b) => { if (!a || a.data.length !== b.data.length) return false; const x = new Uint32Array(a.data.buffer), y = new Uint32Array(b.data.buffer); for (let i = 0; i < x.length; i += 7) if (x[i] !== y[i]) return false; for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return false; return true; };
    if (!same(lastLandSnap, land)) lastLandSnap = land;
    if (!same(lastPathSnap, path)) lastPathSnap = path;
    void pc;
    const { objects, custom, ...settings } = doc;
    return { json: JSON.stringify({ objects, settings }), custom, land: lastLandSnap, path: lastPathSnap, mw: landMask.width, mh: landMask.height };
  }
  function resetHistory() { history.length = 0; hIndex = -1; lastLandSnap = lastPathSnap = null; commit(true); }
  function commit(initial = false) {
    if (landSel && !settling) { const ch = landSel.changed; settleLand(); if (ch) return; /* settling already saved this step */ }
    history.length = hIndex + 1;
    history.push(snapshot()); if (history.length > 60) history.shift();
    hIndex = history.length - 1;
    if (!initial) markDirty();
    scheduleUsedList();
  }
  function restore(st) {
    const prevSize = [doc.width, doc.height], prevStyle = doc.style, prevType = doc.type;
    const { objects, settings } = JSON.parse(st.json);
    Object.assign(doc, settings); doc.objects = objects; doc.custom = st.custom;
    if (landMask.width !== st.mw || landMask.height !== st.mh) { landMask.width = pathMask.width = st.mw; landMask.height = pathMask.height = st.mh; maskScale = st.mw / doc.width; }
    landMask.getContext('2d').putImageData(st.land, 0, 0); pathMask.getContext('2d').putImageData(st.path, 0, 0);
    lastLandSnap = st.land; lastPathSnap = st.path;
    for (const id of [...selection]) if (!findObj(id)) selection.delete(id);
    baseDirty = true;
    if (prevStyle !== doc.style || prevType !== doc.type) buildLibrary();
    if (prevSize[0] !== doc.width || prevSize[1] !== doc.height) zoomFit();
    syncTopbar(); refreshPanels(); needsDraw = true;
  }
  function undo() { if (landSel) { const ch = landSel.changed; settleLand(); if (ch) { hIndex--; restore(history[hIndex]); markDirty(); return; } } if (hIndex > 0) { hIndex--; restore(history[hIndex]); markDirty(); } }
  function redo() { settleLand(); if (hIndex < history.length - 1) { hIndex++; restore(history[hIndex]); markDirty(); } }
  let dirtyFlag = false;
  function markDirty() { dirtyFlag = true; document.title = `Pocket-Mapp-Creator — ${doc.name}*`; }

  // ------------------------------------------------------------------ view
  function zoomFit() {
    const r = stage.parentElement.getBoundingClientRect();
    view.zoom = Math.min((r.width - 80) / doc.width, (r.height - 80) / doc.height);
    view.ox = (r.width - doc.width * view.zoom) / 2; view.oy = (r.height - doc.height * view.zoom) / 2;
    needsDraw = true;
  }
  function zoomAt(f, sx, sy) {
    const nz = clamp(view.zoom * f, 0.03, 8);
    view.ox = sx - ((sx - view.ox) * nz) / view.zoom; view.oy = sy - ((sy - view.oy) * nz) / view.zoom;
    view.zoom = nz; needsDraw = true;
  }
  function toMap(e) { const r = stage.getBoundingClientRect(); return { x: (e.clientX - r.left - view.ox) / view.zoom, y: (e.clientY - r.top - view.oy) / view.zoom, sx: e.clientX - r.left, sy: e.clientY - r.top }; }

  // ------------------------------------------------------------------ pointer interaction
  let dragState = null; let spaceDown = false;
  stage.addEventListener('wheel', (e) => {
    e.preventDefault();
    const p = toMap(e);
    if (e.ctrlKey || e.metaKey || !e.shiftKey) zoomAt(Math.exp(-e.deltaY * 0.0015), p.sx, p.sy);
    else { view.ox -= e.deltaY; needsDraw = true; }
  }, { passive: false });

  stage.addEventListener('pointerdown', (e) => {
    try { stage.setPointerCapture(e.pointerId); } catch (_) { /* synthetic events */ }
    const p = toMap(e);
    if (e.button === 1 || e.button === 2 && tool !== 'select' || spaceDown || tool === 'pan') { dragState = { type: 'pan', sx: p.sx, sy: p.sy, ox: view.ox, oy: view.oy }; return; }
    if (e.button !== 0) return;
    if (isBrush()) {
      // Land brush adds land, Ocean brush turns land back into sea; Alt swaps them
      const erase = tool === 'ocean' ? !e.altKey : tool === 'land' ? e.altKey : (ui.brushMode === 'erase' || e.altKey);
      startPaint(p, tool === 'path' ? 'path' : 'land', erase); dragState = { type: 'paint' }; return;
    }
    if (tool === 'stamp') {
      if (!stampKey) { status('Choose an asset from the library first'); return; }
      const o = placeStamp(p.x, p.y);
      dragState = { type: 'stamp', last: p, placed: [o.id] };
      needsDraw = true; return;
    }
    if (tool === 'line') { lineDraft = { t: 'line', kind: ui.lineKind, w: ui.lineWidth, o: 1, pts: [[p.x, p.y]] }; dragState = { type: 'line' }; return; }
    if (tool === 'text') {
      const hit = hitTest(p.x, p.y);
      if (hit && hit.t === 'text') {
        // click a label to pick it up and drag it to a new location
        selection.clear(); selection.add(hit.id);
        dragState = { type: 'move', last: p, moved: false };
        refreshPanels(); needsDraw = true;
        return;
      }
      const t = addText(p.x, p.y); selection.clear(); selection.add(t.id); commit();
      refreshPanels(); needsDraw = true;
      setTimeout(() => { const ta = $('#toText'); if (ta) { ta.focus(); ta.select(); } }, 30);
      return;
    }
    // select tool
    const lh = hitLandHandle(p.x, p.y);
    if (lh) {
      const L = landSel, cx = L.cx + L.dx, cy = L.cy + L.dy;
      dragState = lh === 'rotate'
        ? { type: 'landRotate', start: Math.atan2(p.y - cy, p.x - cx), r0: L.r }
        : { type: 'landScale', d0: Math.hypot(p.x - cx, p.y - cy), s0: L.s };
      return;
    }
    const h = hitHandle(p.x, p.y);
    if (h) {
      const o = h.o;
      dragState = h.type === 'rotate'
        ? { type: 'rotate', o, start: Math.atan2(p.y - o.y, p.x - o.x), r0: o.r }
        : { type: 'scale', o, d0: Math.hypot(p.x - o.x, p.y - o.y), s0: o.s };
      return;
    }
    const hit = hitTest(p.x, p.y);
    if (!hit && landSel && insideLandBox(p.x, p.y)) { dragState = { type: 'landMove', last: p }; return; }
    if (!hit && !e.shiftKey && !landSel && landAt(p.x, p.y)) {
      // clicked bare land: select the whole landmass
      selection.clear(); pickLand(p.x, p.y);
      dragState = { type: 'landMove', last: p };
      refreshPanels(); return;
    }
    if (landSel) settleLand();
    if (!hit && !e.shiftKey && landAt(p.x, p.y)) { selection.clear(); pickLand(p.x, p.y); dragState = { type: 'landMove', last: p }; refreshPanels(); return; }
    if (hit) {
      if (e.shiftKey || e.ctrlKey || e.metaKey) { if (selection.has(hit.id)) selection.delete(hit.id); else selection.add(hit.id); }
      else if (!selection.has(hit.id)) { selection.clear(); selection.add(hit.id); }
      if (e.altKey) { duplicateSelectionInPlace(); }
      dragState = { type: 'move', last: p, moved: false };
    } else {
      if (!e.shiftKey) selection.clear();
      marquee = { x0: p.x, y0: p.y, x1: p.x, y1: p.y, add: e.shiftKey };
      dragState = { type: 'marquee' };
    }
    refreshPanels(); needsDraw = true;
  });
  function duplicateSelectionInPlace() {
    const ids = [];
    for (const id of selection) { const o = findObj(id); const c = JSON.parse(JSON.stringify(o)); c.id = uid(); doc.objects.push(c); ids.push(c.id); }
    selection.clear(); ids.forEach((i) => selection.add(i));
  }
  function placeStamp(x, y) {
    const sc = ui.stampScale * (1 + (Math.random() * 2 - 1) * (ui.scatter ? ui.randScale : 0));
    const rr = ui.scatter && ui.randRot ? (Math.random() * 2 - 1) * ui.randRot : 0;
    const fx = ui.scatter && ui.randFlip ? Math.random() < 0.5 : false;
    return addAsset(stampKey, x, y, { s: sc, r: rr, fx });
  }

  stage.addEventListener('pointermove', (e) => {
    const p = toMap(e); hoverPt = p;
    if (isBrush() || tool === 'stamp') needsDraw = true;
    status(`${Math.round(p.x)}, ${Math.round(p.y)}${doc.grid.type === 'square' ? `  ·  square ${Math.floor(p.x / doc.grid.size) + 1}, ${Math.floor(p.y / doc.grid.size) + 1}` : ''}`, true);
    if (!dragState) { updateCursor(p); return; }
    const d = dragState;
    if (d.type === 'pan') { view.ox = d.ox + (p.sx - d.sx); view.oy = d.oy + (p.sy - d.sy); needsDraw = true; }
    else if (d.type === 'paint') continuePaint(p);
    else if (d.type === 'stamp' && ui.scatter) {
      const inf = assetInfo(stampKey); const gap = Math.max(8, Math.max(inf.w, inf.h) * inf.base * ui.stampScale * 0.55 * ui.spacing);
      if (Math.hypot(p.x - d.last.x, p.y - d.last.y) >= gap) {
        const jx = (Math.random() - 0.5) * gap * 0.5, jy = (Math.random() - 0.5) * gap * 0.5;
        d.placed.push(placeStamp(p.x + jx, p.y + jy).id); d.last = p; needsDraw = true;
      }
    } else if (d.type === 'line') {
      const l = lineDraft.pts[lineDraft.pts.length - 1];
      if (Math.hypot(p.x - l[0], p.y - l[1]) > 4 / view.zoom) { lineDraft.pts.push([p.x, p.y]); needsDraw = true; }
    } else if (d.type === 'move') {
      const dx = p.x - d.last.x, dy = p.y - d.last.y; d.last = p; d.moved = true;
      for (const id of selection) moveObj(findObj(id), dx, dy);
      needsDraw = true; refreshPropsValues();
    } else if (d.type === 'rotate') {
      let r = d.r0 + ((Math.atan2(p.y - d.o.y, p.x - d.o.x) - d.start) * 180) / Math.PI;
      if (e.shiftKey) r = Math.round(r / 15) * 15;
      d.o.r = ((r + 540) % 360) - 180; needsDraw = true; refreshPropsValues();
    } else if (d.type === 'scale') {
      d.o.s = clamp((d.s0 * Math.hypot(p.x - d.o.x, p.y - d.o.y)) / Math.max(1, d.d0), 0.05, 20); needsDraw = true; refreshPropsValues();
    } else if (d.type === 'marquee') { marquee.x1 = p.x; marquee.y1 = p.y; needsDraw = true; }
    else if (d.type === 'landMove' && landSel) { landSel.dx += p.x - d.last.x; landSel.dy += p.y - d.last.y; d.last = p; applyLandItems(); refreshLandProps(); }
    else if (d.type === 'landScale' && landSel) { const cx = landSel.cx + landSel.dx, cy = landSel.cy + landSel.dy; setLandScale(d.s0 * Math.hypot(p.x - cx, p.y - cy) / Math.max(1, d.d0)); refreshLandProps(); }
    else if (d.type === 'landRotate' && landSel) { const cx = landSel.cx + landSel.dx, cy = landSel.cy + landSel.dy; let r = d.r0 + ((Math.atan2(p.y - cy, p.x - cx) - d.start) * 180) / Math.PI; if (e.shiftKey) r = Math.round(r / 15) * 15; setLandRot(r); refreshLandProps(); }
  });
  function finishPointer() {
    const d = dragState; dragState = null; if (!d) return;
    if (d.type === 'paint') endPaint();
    else if (d.type === 'stamp') { commit(); }
    else if (d.type === 'line') {
      if (lineDraft.pts.length > 1) { const o = { id: uid(), ...lineDraft, pts: simplify(lineDraft.pts, 1.5 / view.zoom) }; doc.objects.push(o); commit(); }
      lineDraft = null;
    } else if (d.type === 'move' && d.moved) commit();
    else if (d.type === 'rotate' || d.type === 'scale') commit();
    else if (d.type === 'marquee') {
      const x0 = Math.min(marquee.x0, marquee.x1), x1 = Math.max(marquee.x0, marquee.x1), y0 = Math.min(marquee.y0, marquee.y1), y1 = Math.max(marquee.y0, marquee.y1);
      if (x1 - x0 > 2 || y1 - y0 > 2) for (const o of doc.objects) {
        if (o.hidden || o.locked) continue;
        let cx, cy; if (o.t === 'line') { const b = lineBounds(o); cx = (b.x0 + b.x1) / 2; cy = (b.y0 + b.y1) / 2; } else { cx = o.x; cy = o.y; }
        if (cx >= x0 && cx <= x1 && cy >= y0 && cy <= y1) selection.add(o.id);
      }
      marquee = null;
    }
    refreshPanels(); needsDraw = true;
  }
  stage.addEventListener('pointerup', finishPointer);
  stage.addEventListener('pointercancel', finishPointer);
  stage.addEventListener('pointerleave', () => { hoverPt = null; needsDraw = true; });
  stage.addEventListener('contextmenu', (e) => e.preventDefault());
  stage.addEventListener('dblclick', (e) => {
    const p = toMap(e); const hit = hitTest(p.x, p.y);
    if (hit && hit.t === 'text') { selection.clear(); selection.add(hit.id); refreshPanels(); setTimeout(() => { $('#propText')?.focus(); $('#propText')?.select(); }, 20); }
  });
  function updateCursor(p) {
    let c = 'default';
    if (tool === 'pan' || spaceDown) c = 'grab';
    else if (isBrush()) c = 'none';
    else if (tool === 'stamp' || tool === 'line') c = 'crosshair';
    else if (tool === 'text') c = 'text';
    else { const lh = hitLandHandle(p.x, p.y), h = lh ? null : hitHandle(p.x, p.y); if (lh) c = lh === 'rotate' ? 'alias' : 'nwse-resize'; else if (h) c = h.type === 'rotate' ? 'alias' : 'nwse-resize'; else if (hitTest(p.x, p.y) || (landSel && insideLandBox(p.x, p.y))) c = 'move'; else if (landAt(p.x, p.y)) c = 'pointer'; }
    stage.style.cursor = c;
  }
  // Ramer–Douglas–Peucker
  function simplify(pts, tol) {
    if (pts.length < 3) return pts;
    const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
    const stack = [[0, pts.length - 1]];
    while (stack.length) {
      const [a, b] = stack.pop(); let md = 0, mi = -1;
      const [ax, ay] = pts[a], [bx, by] = pts[b], L = Math.hypot(bx - ax, by - ay) || 1;
      for (let i = a + 1; i < b; i++) { const d = Math.abs((bx - ax) * (ay - pts[i][1]) - (ax - pts[i][0]) * (by - ay)) / L; if (d > md) { md = d; mi = i; } }
      if (md > tol) { keep[mi] = 1; stack.push([a, mi], [mi, b]); }
    }
    return pts.filter((_, i) => keep[i]).map(([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10]);
  }

  // drag & drop from the library
  const wrap = $('#stageWrap');
  wrap.addEventListener('dragover', (e) => e.preventDefault());
  wrap.addEventListener('drop', (e) => {
    e.preventDefault(); const key = e.dataTransfer.getData('text/mapp-asset'); if (!key) return;
    const p = toMap(e); const o = addAsset(key, p.x, p.y, { s: ui.stampScale });
    selection.clear(); selection.add(o.id); commit(); refreshPanels(); needsDraw = true;
  });

  // ------------------------------------------------------------------ keyboard
  window.addEventListener('keydown', (e) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName);
    if ((e.ctrlKey || e.metaKey) && !typing) {
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); return; }
      if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); redo(); return; }
      if (k === 'd') { e.preventDefault(); duplicateSelection(); return; }
      if (k === 'a') { e.preventDefault(); selectAll(); return; }
    }
    if (typing) return;
    if (e.key === ' ') { spaceDown = true; stage.style.cursor = 'grab'; e.preventDefault(); return; }
    if ((e.key === 'Delete' || e.key === 'Backspace') && landSel) { settleLand(true); return; }
    if (e.key === 'Escape' && landSel) { settleLand(); return; }
    if ((e.key === '[' || e.key === ']') && landSel) { setLandScale(landSel.s * (e.key === ']' ? 1.1 : 0.9)); refreshLandProps(); return; }
    if ((e.key === 'r' || e.key === 'R') && landSel) { setLandRot(landSel.r + (e.shiftKey ? -15 : 15)); refreshLandProps(); return; }
    if (e.key === 'Delete' || e.key === 'Backspace') { if (selection.size) { deleteIds([...selection]); commit(); refreshPanels(); needsDraw = true; } return; }
    if (e.key === 'Escape') { selection.clear(); lineDraft = null; refreshPanels(); needsDraw = true; return; }
    const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (arrows[e.key] && selection.size) { const m = e.shiftKey ? 10 : 1; for (const id of selection) moveObj(findObj(id), arrows[e.key][0] * m, arrows[e.key][1] * m); commit(); refreshPropsValues(); needsDraw = true; e.preventDefault(); return; }
    if (e.key === '[' || e.key === ']') {
      const dir = e.key === ']' ? 1 : -1;
      if (isBrush()) { ui.brush = clamp(ui.brush + dir * 10, 4, 600); renderToolOptions(); needsDraw = true; }
      else if (selection.size) { for (const id of selection) { const o = findObj(id); if (o.t !== 'line') o.s = clamp(o.s * (dir > 0 ? 1.1 : 0.9), 0.05, 20); } commit(); refreshPropsValues(); needsDraw = true; }
      return;
    }
    if ((e.key === 'r' || e.key === 'R') && selection.size) { for (const id of selection) { const o = findObj(id); if (o.t !== 'line') o.r = ((o.r + (e.shiftKey ? -15 : 15) + 540) % 360) - 180; } commit(); refreshPropsValues(); needsDraw = true; return; }
    if ((e.key === 'f' || e.key === 'F') && selection.size) { for (const id of selection) { const o = findObj(id); if (o.t === 'asset') o.fx = !o.fx; } commit(); needsDraw = true; return; }
    const map = { v: 'select', s: 'stamp', b: 'land', e: 'ocean', p: 'path', l: 'line', t: 'text', h: 'pan' };
    if (map[e.key.toLowerCase()]) setTool(map[e.key.toLowerCase()]);
  });
  window.addEventListener('keyup', (e) => { if (e.key === ' ') { spaceDown = false; stage.style.cursor = ''; } });
  function selectAll() { selection.clear(); doc.objects.forEach((o) => !o.locked && !o.hidden && selection.add(o.id)); refreshPanels(); needsDraw = true; }

  // ------------------------------------------------------------------ tools UI
  function isBrush() { return tool === 'land' || tool === 'ocean' || tool === 'path'; }
  function setTool(t) {
    if (t !== 'select') settleLand();
    tool = t;
    $$('.tool').forEach((b) => b.classList.toggle('active', b.dataset.tool === t));
    renderToolOptions(); needsDraw = true;
  }
  $$('.tool').forEach((b) => b.addEventListener('click', () => setTool(b.dataset.tool)));

  function renderToolOptions() {
    const el = $('#toolOptions');
    if (isBrush()) {
      const title = tool === 'land' ? 'Land brush — paint land' : tool === 'ocean' ? 'Ocean brush — turn land into sea' : 'Ground / path brush';
      el.innerHTML = `
        <b>${title}</b>
        ${tool === 'path' ? `<div class="seg"><button data-bm="add" class="${ui.brushMode === 'add' ? 'on' : ''}">Paint</button><button data-bm="erase" class="${ui.brushMode === 'erase' ? 'on' : ''}">Erase</button></div>` : ''}
        <label>Size <input type="range" id="toBrush" min="4" max="600" value="${ui.brush}"> <span id="toBrushV">${ui.brush}</span></label>
        <label class="chk"><input type="checkbox" id="toRough" ${ui.rough ? 'checked' : ''}> Rough edge</label>
        <span class="muted">${tool === 'land' ? 'Alt = ocean' : tool === 'ocean' ? 'Alt = land' : 'Alt = erase'} · [ ] size</span>`;
      el.querySelectorAll('[data-bm]').forEach((b) => b.onclick = () => { ui.brushMode = b.dataset.bm; renderToolOptions(); });
      $('#toBrush').oninput = (e) => { ui.brush = +e.target.value; $('#toBrushV').textContent = ui.brush; };
      $('#toRough').onchange = (e) => { ui.rough = e.target.checked; };
    } else if (tool === 'stamp') {
      const inf = stampKey ? assetInfo(stampKey) : null;
      el.innerHTML = `
        <b>${inf ? esc(inf.name) : 'Pick an asset'}</b>
        <label>Scale <input type="range" id="toScale" min="0.1" max="4" step="0.05" value="${ui.stampScale}"> <span id="toScaleV">${ui.stampScale.toFixed(2)}</span></label>
        <label class="chk"><input type="checkbox" id="toScatter" ${ui.scatter ? 'checked' : ''}> Scatter brush</label>
        ${ui.scatter ? `<label>Spacing <input type="range" id="toSpacing" min="0.3" max="3" step="0.1" value="${ui.spacing}"></label>
        <label>Size ± <input type="range" id="toRandS" min="0" max="0.6" step="0.05" value="${ui.randScale}"></label>
        <label>Rotate ± <input type="range" id="toRandR" min="0" max="180" step="5" value="${ui.randRot}"></label>
        <label class="chk"><input type="checkbox" id="toFlip" ${ui.randFlip ? 'checked' : ''}> Random flip</label>` : ''}
        <label class="chk" title="Lower icons overlap higher ones (best for mountains, forests, buildings)"><input type="checkbox" id="toDepth" ${ui.depthSort ? 'checked' : ''}> Depth sort</label>`;
      $('#toScale').oninput = (e) => { ui.stampScale = +e.target.value; $('#toScaleV').textContent = ui.stampScale.toFixed(2); needsDraw = true; };
      $('#toScatter').onchange = (e) => { ui.scatter = e.target.checked; renderToolOptions(); };
      $('#toDepth').onchange = (e) => { ui.depthSort = e.target.checked; };
      if (ui.scatter) {
        $('#toSpacing').oninput = (e) => { ui.spacing = +e.target.value; };
        $('#toRandS').oninput = (e) => { ui.randScale = +e.target.value; };
        $('#toRandR').oninput = (e) => { ui.randRot = +e.target.value; };
        $('#toFlip').onchange = (e) => { ui.randFlip = e.target.checked; };
      }
    } else if (tool === 'line') {
      el.innerHTML = `<b>Lines</b>
        <select id="toKind">${Object.entries(LINE_KINDS).map(([k, v]) => `<option value="${k}" ${k === ui.lineKind ? 'selected' : ''}>${v}</option>`).join('')}</select>
        <label>Width <input type="range" id="toLW" min="1" max="40" value="${ui.lineWidth}"> <span id="toLWV">${ui.lineWidth}</span></label>
        <span class="muted">Rivers: draw from source to sea</span>`;
      $('#toKind').onchange = (e) => { ui.lineKind = e.target.value; };
      $('#toLW').oninput = (e) => { ui.lineWidth = +e.target.value; $('#toLWV').textContent = ui.lineWidth; };
    } else if (tool === 'text') {
      const sel = selection.size === 1 ? findObj([...selection][0]) : null;
      const t = sel && sel.t === 'text' ? sel : null;
      const font = t ? t.font : ui.textFont;
      const size = t ? Math.round(t.size * t.s) : (ui.textSize || 60);
      const color = t ? t.color : (ui.textColor || INK[doc.style]);
      const bold = t ? t.bold : ui.textBold, italic = t ? t.italic : ui.textItalic;
      el.innerHTML = `
        <b>${t ? 'Edit label' : 'Text'}</b>
        ${t ? `<input type="text" id="toText" value="${esc(t.text)}" style="width:170px">` : ''}
        <select id="toFont">${FONTS.map((f) => `<option ${f === font ? 'selected' : ''}>${f}</option>`).join('')}</select>
        <label>Size <input type="range" id="toTSize" min="8" max="400" value="${size}"><input type="number" id="toTSizeN" min="6" max="600" value="${size}" style="width:62px"></label>
        <input type="color" id="toTColor" value="${color}" title="Colour">
        <label class="chk"><input type="checkbox" id="toTBold" ${bold ? 'checked' : ''}> B</label>
        <label class="chk"><input type="checkbox" id="toTItal" ${italic ? 'checked' : ''}> <i>I</i></label>
        <span class="muted">${t ? 'Drag the label to move it' : 'Pick a font and size, then click the map'}</span>`;
      const apply = (fn, done) => { fn(); if (t) { needsDraw = true; if (done) { commit(); renderProps(); } } };
      const setSize = (v) => { v = clamp(+v || 12, 6, 600); ui.textSize = v; if (t) { t.size = v; t.s = 1; } $('#toTSize').value = v; $('#toTSizeN').value = v; };
      $('#toFont').onchange = (e) => apply(() => { ui.textFont = e.target.value; if (t) t.font = e.target.value; }, true);
      $('#toTSize').oninput = (e) => apply(() => setSize(e.target.value));
      $('#toTSize').onchange = () => apply(() => {}, true);
      $('#toTSizeN').onchange = (e) => apply(() => setSize(e.target.value), true);
      $('#toTColor').oninput = (e) => apply(() => { ui.textColor = e.target.value; if (t) t.color = e.target.value; });
      $('#toTColor').onchange = () => apply(() => {}, true);
      $('#toTBold').onchange = (e) => apply(() => { ui.textBold = e.target.checked; if (t) t.bold = e.target.checked; }, true);
      $('#toTItal').onchange = (e) => apply(() => { ui.textItalic = e.target.checked; if (t) t.italic = e.target.checked; }, true);
      if (t) {
        $('#toText').oninput = (e) => { t.text = e.target.value; needsDraw = true; };
        $('#toText').onchange = () => { commit(); renderProps(); };
        $('#toText').onkeydown = (e) => { if (e.key === 'Enter') e.target.blur(); };
      }
    } else el.innerHTML = '';
  }

  // ------------------------------------------------------------------ library
  function buildLibrary() {
    const grid = $('#assetGrid'); grid.innerHTML = '';
    $$('#genreSeg button').forEach((b) => b.classList.toggle('on', b.dataset.genre === ui.genre));
    $$('#kindSeg button').forEach((b) => b.classList.toggle('on', b.dataset.kind === ui.kind));
    const q = ui.search.trim().toLowerCase();
    const list = MANIFEST.filter((a) => (ui.genre === 'all' || a.genre === ui.genre) && (ui.kind === 'all' || a.kind === ui.kind || (a.kind === 'decor' && ui.kind !== 'decor' && false)) && (!q || a.name.toLowerCase().includes(q) || a.id.includes(q)));
    if (!list.length) grid.innerHTML = '<p class="muted" style="grid-column:1/-1">No assets match. Try another genre or “All”.</p>';
    for (const a of list) grid.appendChild(assetTile(a.id, a.name));
    const cg = $('#customGrid'); cg.innerHTML = '';
    const customs = Object.entries(doc.custom);
    if (!customs.length) cg.innerHTML = '<p class="muted" style="grid-column:1/-1;margin:0">Import your own PNG/SVG assets — they are saved inside the map file.</p>';
    for (const [k, c] of customs) cg.appendChild(assetTile(`custom:${k}`, c.name));
  }
  function assetTile(key, name) {
    const d = document.createElement('div');
    d.className = `asset style-${doc.style}${stampKey === key ? ' on' : ''}`; d.title = name; d.draggable = true;
    d.innerHTML = `<img src="${esc(assetSrc(key))}" alt=""><div class="nm">${esc(name)}</div>`;
    d.onclick = () => { stampKey = key; $$('.asset').forEach((x) => x.classList.remove('on')); d.classList.add('on'); setTool('stamp'); };
    d.ondragstart = (e) => { e.dataTransfer.setData('text/mapp-asset', key); };
    return d;
  }
  $$('#genreSeg button').forEach((b) => b.onclick = () => { ui.genre = b.dataset.genre; buildLibrary(); });
  $$('#kindSeg button').forEach((b) => b.onclick = () => { ui.kind = b.dataset.kind; buildLibrary(); });
  $('#assetSearch').oninput = (e) => { ui.search = e.target.value; buildLibrary(); };

  async function importAssets() {
    let files = [];
    if (api) files = await api.importAssets();
    else files = await browserPickImages();
    for (const f of files) {
      const im = new Image(); im.src = f.dataUrl; await im.decode().catch(() => {});
      const k = uid(); const m = Math.max(im.naturalWidth, im.naturalHeight) || 160; const sc = 160 / m;
      doc.custom[k] = { name: f.name, src: f.dataUrl, w: Math.round((im.naturalWidth || 160) * sc), h: Math.round((im.naturalHeight || 160) * sc) };
    }
    if (files.length) { buildLibrary(); commit(); }
  }

  // ------------------------------------------------------------------ properties panel
  function refreshPanels() { renderProps(); scheduleUsedList(); if (tool === 'text' && document.activeElement?.id !== 'toText') renderToolOptions(); }
  function propRow(label, html) { return `<div class="row"><label>${label}</label>${html}</div>`; }
  function refreshLandProps() {
    if (!landSel) return; const set = (sel_, v) => { const n = $(sel_); if (n && document.activeElement !== n) n.value = v; };
    set('#lS', Math.round(landSel.s * 100)); set('#lSn', Math.round(landSel.s * 100)); set('#lR', Math.round(landSel.r)); set('#lRn', Math.round(landSel.r));
  }
  function renderProps() {
    const el = $('#props');
    if (landSel) {
      const L = landSel;
      el.innerHTML = `<div class="row"><b style="flex:1">Landmass</b><span class="muted">${L.items.length} item${L.items.length === 1 ? '' : 's'} on it</span></div>
        <p class="muted" style="margin:0">Drag to move · drag a corner to resize · round handle to rotate</p>
        ${propRow('Size %', `<input type="range" id="lS" min="10" max="400" value="${Math.round(L.s * 100)}"><input type="number" id="lSn" min="5" max="1000" value="${Math.round(L.s * 100)}" style="width:66px">`)}
        ${propRow('Rotation', `<input type="range" id="lR" min="-180" max="180" value="${Math.round(L.r)}"><input type="number" id="lRn" value="${Math.round(L.r)}" style="width:66px">`)}
        <label class="chk"><input type="checkbox" id="lItems" ${L.withItems ? 'checked' : ''}> Move items on this land with it</label>
        <div class="btnrow"><button id="lSmaller">Smaller</button><button id="lBigger">Bigger</button><button id="lReset">Reset</button></div>
        <div class="btnrow"><button class="primary" id="lDone">Done</button><button class="danger" id="lDel">Delete land</button></div>`;
      $('#lS').oninput = (e) => { setLandScale(+e.target.value / 100); refreshLandProps(); };
      $('#lSn').onchange = (e) => { setLandScale((+e.target.value || 100) / 100); refreshLandProps(); };
      $('#lR').oninput = (e) => { setLandRot(+e.target.value); refreshLandProps(); };
      $('#lRn').onchange = (e) => { setLandRot(+e.target.value || 0); refreshLandProps(); };
      $('#lItems').onchange = (e) => { L.withItems = e.target.checked; applyLandItems(); };
      $('#lSmaller').onclick = () => { setLandScale(L.s * 0.9); refreshLandProps(); };
      $('#lBigger').onclick = () => { setLandScale(L.s * 1.1); refreshLandProps(); };
      $('#lReset').onclick = () => { L.s = 1; L.r = 0; L.dx = 0; L.dy = 0; applyLandItems(); refreshLandProps(); };
      $('#lDone').onclick = () => settleLand();
      $('#lDel').onclick = () => settleLand(true);
      return;
    }
    const sel = [...selection].map(findObj).filter(Boolean);
    if (!sel.length) {
      const g = doc.grid;
      el.innerHTML = `
        ${propRow('Name', `<input type="text" id="pName" value="${esc(doc.name)}">`)}
        ${propRow('Type', `<select id="pType">${Object.entries(MAP_TYPES).map(([k, v]) => `<option value="${k}" ${k === doc.type ? 'selected' : ''}>${v.label}</option>`).join('')}</select>`)}
        <div class="row"><label>Size</label><span>${doc.width} × ${doc.height}px</span><button class="mini" data-cmd="resize">Change…</button></div>
        <div class="btnrow"><button class="mini" id="pAllLand">Fill with land</button><button class="mini" id="pAllSea">Clear all land</button><button class="mini" id="pClearPaths">Clear ground paint</button></div>
        <div class="panel-sub muted">Grid</div>
        ${propRow('Grid', `<select id="pGrid"><option value="none">None</option><option value="square" ${g.type === 'square' ? 'selected' : ''}>Square</option><option value="hex" ${g.type === 'hex' ? 'selected' : ''}>Hex</option></select>`)}
        ${propRow('Cell size', `<input type="number" id="pGridSize" min="10" max="500" value="${g.size}"> px`)}
        ${propRow('Colour', `<input type="color" id="pGridCol" value="${g.color}"><input type="range" id="pGridOp" min="0.05" max="1" step="0.05" value="${g.opacity}">`)}
        <p class="muted">Suggested order: paint land with the <b>Land</b> and <b>Ocean</b> brushes, add mountains, forests and towns, then finish with <b>Text</b>. Labels always sit on top of everything else.<br>With the <b>Select</b> tool, click any land to select that landmass, then drag its corners to make it bigger or smaller.</p>`;
      $('#pName').onchange = (e) => { doc.name = e.target.value || 'Untitled Map'; commit(); };
      $('#pType').onchange = (e) => { doc.type = e.target.value; ui.kind = MAP_TYPES[doc.type].kind; baseDirty = true; buildLibrary(); commit(); needsDraw = true; };
      $('#pAllLand').onclick = () => { fillMask(landMask, true); baseDirty = true; commit(); needsDraw = true; };
      $('#pAllSea').onclick = () => { fillMask(landMask, false); baseDirty = true; commit(); needsDraw = true; };
      $('#pClearPaths').onclick = () => { fillMask(pathMask, false); baseDirty = true; commit(); needsDraw = true; };
      $('#pGrid').onchange = (e) => { doc.grid.type = e.target.value; $('#gridToggle').checked = doc.grid.type !== 'none'; commit(); needsDraw = true; };
      $('#pGridSize').onchange = (e) => { doc.grid.size = clamp(+e.target.value || 70, 10, 500); commit(); needsDraw = true; };
      $('#pGridCol').oninput = (e) => { doc.grid.color = e.target.value; needsDraw = true; };
      $('#pGridCol').onchange = () => commit();
      $('#pGridOp').oninput = (e) => { doc.grid.opacity = +e.target.value; needsDraw = true; };
      $('#pGridOp').onchange = () => commit();
      bindCmdButtons(el);
      return;
    }
    if (sel.length > 1) {
      el.innerHTML = `<p><b>${sel.length}</b> objects selected</p>
        <div class="btnrow"><button id="mScaleDn">Smaller</button><button id="mScaleUp">Larger</button><button id="mFlip">Flip</button><button id="mRandRot">Random tilt</button></div>
        <div class="btnrow"><button id="mFront">To front</button><button id="mBack">To back</button><button id="mDup">Duplicate</button><button class="danger" id="mDel">Delete ${sel.length}</button></div>`;
      const each = (fn) => { sel.forEach(fn); commit(); needsDraw = true; };
      $('#mScaleDn').onclick = () => each((o) => { if (o.t !== 'line') o.s = clamp(o.s * 0.9, 0.05, 20); });
      $('#mScaleUp').onclick = () => each((o) => { if (o.t !== 'line') o.s = clamp(o.s * 1.1, 0.05, 20); });
      $('#mFlip').onclick = () => each((o) => { if (o.t === 'asset') o.fx = !o.fx; });
      $('#mRandRot').onclick = () => each((o) => { if (o.t !== 'line') o.r = Math.round((Math.random() * 2 - 1) * 12); });
      $('#mFront').onclick = () => reorder('front'); $('#mBack').onclick = () => reorder('back');
      $('#mDup').onclick = duplicateSelection;
      $('#mDel').onclick = () => { deleteIds(sel.map((o) => o.id)); commit(); refreshPanels(); needsDraw = true; };
      return;
    }
    const o = sel[0];
    let h = '';
    if (o.t === 'asset') {
      const inf = assetInfo(o.a) || { name: '?' };
      h += `<div class="row"><b style="flex:1">${esc(inf.name)}</b><button class="mini" id="pSelSame">Select all like this</button></div>`;
    }
    if (o.t === 'text') {
      h += `<textarea id="propText" rows="2">${esc(o.text)}</textarea>`;
      h += propRow('Font', `<select id="pFont">${FONTS.map((f) => `<option ${f === o.font ? 'selected' : ''} style="font-family:'${f}'">${f}</option>`).join('')}</select>`);
      h += propRow('Size', `<input type="number" id="pSize" min="6" max="600" value="${o.size}"><input type="color" id="pColor" value="${o.color}">`);
      h += `<div class="btnrow"><label class="chk"><input type="checkbox" id="pBold" ${o.bold ? 'checked' : ''}> Bold</label><label class="chk"><input type="checkbox" id="pItal" ${o.italic ? 'checked' : ''}> Italic</label><label class="chk"><input type="checkbox" id="pUpper" ${o.upper ? 'checked' : ''}> CAPS</label><label class="chk"><input type="checkbox" id="pHalo" ${o.halo ? 'checked' : ''}> Halo</label></div>`;
      h += propRow('Spacing', `<input type="range" id="pSpacing" min="-2" max="40" value="${o.spacing}">`);
      h += propRow('Curve', `<input type="range" id="pCurve" min="-100" max="100" value="${o.curve}">`);
    }
    if (o.t === 'line') {
      h += propRow('Kind', `<select id="pLKind">${Object.entries(LINE_KINDS).map(([k, v]) => `<option value="${k}" ${k === o.kind ? 'selected' : ''}>${v}</option>`).join('')}</select>`);
      h += propRow('Width', `<input type="range" id="pLW" min="1" max="40" value="${o.w}">`);
    } else {
      h += propRow('X / Y', `<input type="number" id="pX" value="${Math.round(o.x)}"><input type="number" id="pY" value="${Math.round(o.y)}">`);
      h += propRow('Scale', `<input type="range" id="pS" min="0.05" max="6" step="0.01" value="${o.s}"><input type="number" id="pSn" step="0.05" value="${o.s.toFixed(2)}" style="width:62px">`);
      h += propRow('Rotation', `<input type="range" id="pR" min="-180" max="180" value="${Math.round(o.r)}"><input type="number" id="pRn" value="${Math.round(o.r)}" style="width:62px">`);
    }
    h += propRow('Opacity', `<input type="range" id="pO" min="0.05" max="1" step="0.05" value="${o.o ?? 1}">`);
    h += `<div class="btnrow">${o.t === 'asset' ? '<button id="pFlip">Flip ⇋</button>' : ''}<button id="pFront">Front</button><button id="pUp">▲</button><button id="pDown">▼</button><button id="pBack">Back</button></div>`;
    h += `<div class="btnrow"><button id="pDup">Duplicate</button><button class="danger" id="pDel">Delete</button></div>`;
    el.innerHTML = h;

    const live = (sel_, prop, conv = (v) => v, after) => {
      const n = $(sel_); if (!n) return;
      n.oninput = (e) => { o[prop] = conv(e.target.type === 'checkbox' ? e.target.checked : e.target.value); after && after(); needsDraw = true; };
      n.onchange = () => { commit(); };
    };
    live('#propText', 'text'); live('#pFont', 'font'); live('#pSize', 'size', (v) => clamp(+v || 12, 6, 600)); live('#pColor', 'color');
    live('#pBold', 'bold'); live('#pItal', 'italic'); live('#pUpper', 'upper'); live('#pHalo', 'halo');
    live('#pSpacing', 'spacing', Number); live('#pCurve', 'curve', Number);
    live('#pLKind', 'kind'); live('#pLW', 'w', Number);
    live('#pX', 'x', Number); live('#pY', 'y', Number);
    live('#pS', 's', Number, () => { $('#pSn').value = o.s.toFixed(2); }); live('#pSn', 's', (v) => clamp(+v || 1, 0.05, 20), () => { $('#pS').value = o.s; });
    live('#pR', 'r', Number, () => { $('#pRn').value = o.r; }); live('#pRn', 'r', (v) => clamp(+v || 0, -180, 180), () => { $('#pR').value = o.r; });
    live('#pO', 'o', Number);
    $('#pFlip') && ($('#pFlip').onclick = () => { o.fx = !o.fx; commit(); needsDraw = true; });
    $('#pFront').onclick = () => reorder('front'); $('#pBack').onclick = () => reorder('back');
    $('#pUp').onclick = () => reorder('up'); $('#pDown').onclick = () => reorder('down');
    $('#pDup').onclick = duplicateSelection;
    $('#pDel').onclick = () => { deleteIds([o.id]); commit(); refreshPanels(); needsDraw = true; };
    $('#pSelSame') && ($('#pSelSame').onclick = () => { selection.clear(); doc.objects.forEach((q) => q.t === 'asset' && q.a === o.a && selection.add(q.id)); refreshPanels(); needsDraw = true; });
  }
  function refreshPropsValues() {
    if (selection.size !== 1) return;
    const o = findObj([...selection][0]); if (!o || o.t === 'line') return;
    const set = (s, v) => { const n = $(s); if (n && document.activeElement !== n) n.value = v; };
    set('#pX', Math.round(o.x)); set('#pY', Math.round(o.y)); set('#pS', o.s); set('#pSn', o.s.toFixed(2)); set('#pR', Math.round(o.r)); set('#pRn', Math.round(o.r));
  }

  // ------------------------------------------------------------------ assets-used list
  let usedTimer = null; const openGroups = new Set();
  function scheduleUsedList() { clearTimeout(usedTimer); usedTimer = setTimeout(renderUsedList, 60); }
  function renderUsedList() {
    const el = $('#usedList');
    const groups = new Map();
    for (const o of doc.objects) {
      const key = o.t === 'asset' ? `a:${o.a}` : o.t === 'text' ? 't:text' : `l:${o.kind}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(o);
    }
    $('#usedCount').textContent = doc.objects.length;
    if (!groups.size) { el.innerHTML = '<p class="muted">Nothing placed yet. Every asset, label and line you add is listed here so you can select or delete all copies at once.</p>'; return; }
    const sorted = [...groups.entries()].sort((a, b) => b[1].length - a[1].length);
    el.innerHTML = sorted.map(([key, items]) => {
      let name, thumb = '';
      if (key.startsWith('a:')) { const k = key.slice(2); name = assetInfo(k)?.name || 'Missing asset'; thumb = `<img src="${esc(assetSrc(k) || '')}" alt="">`; }
      else if (key === 't:text') { name = 'Text labels'; thumb = '<span class="glyph" style="font-family:\'IM Fell English\'">A</span>'; }
      else { name = `${LINE_KINDS[key.slice(2)] || 'Line'}`; thumb = '<span class="glyph">〰</span>'; }
      const allSel = items.every((o) => selection.has(o.id));
      const open = openGroups.has(key);
      return `<div class="used" data-key="${esc(key)}">
        <div class="used-head">${thumb}<span class="nm" title="${esc(name)}">${esc(name)}</span><span class="ct">×${items.length}</span>
          <button data-act="toggle" title="Show each copy">${open ? '▾' : '▸'}</button></div>
        <div class="used-acts">
          <button data-act="sel" title="Select all copies"${allSel ? ' style="border-color:#4fa3e0"' : ''}>Select</button>
          <button data-act="hide" title="Hide/show all copies">${items.every((o) => o.hidden) ? 'Show' : 'Hide'}</button>
          <button data-act="del" class="danger" title="Delete all copies">Delete</button></div>
        ${open ? `<div class="used-items">${items.map((o, i) => `<button data-id="${o.id}" class="${selection.has(o.id) ? 'sel' : ''}">${o.t === 'text' ? esc(o.text.slice(0, 14)) : `#${i + 1}`}</button>`).join('')}</div>` : ''}
      </div>`;
    }).join('');
    el.querySelectorAll('.used').forEach((g) => {
      const key = g.dataset.key; const items = groups.get(key);
      g.querySelectorAll('[data-act]').forEach((b) => b.onclick = async () => {
        const act = b.dataset.act;
        if (act === 'toggle') { if (openGroups.has(key)) openGroups.delete(key); else openGroups.add(key); renderUsedList(); }
        if (act === 'sel') { selection.clear(); items.forEach((o) => selection.add(o.id)); refreshPanels(); needsDraw = true; }
        if (act === 'hide') { const hide = !items.every((o) => o.hidden); items.forEach((o) => { o.hidden = hide; if (hide) selection.delete(o.id); }); commit(); refreshPanels(); needsDraw = true; }
        if (act === 'del') {
          const ok = await confirmBox(`Delete all ${items.length} × “${g.querySelector('.nm').textContent}”?`, 'You can undo this with Ctrl+Z.');
          if (ok) { deleteIds(items.map((o) => o.id)); commit(); refreshPanels(); needsDraw = true; }
        }
      });
      g.querySelectorAll('[data-id]').forEach((b) => b.onclick = (e) => {
        const o = findObj(b.dataset.id); if (!o) return;
        if (!e.shiftKey) selection.clear(); selection.add(o.id);
        if (o.t !== 'line') { const r = stage.getBoundingClientRect(); view.ox = r.width / 2 - o.x * view.zoom; view.oy = r.height / 2 - o.y * view.zoom; }
        refreshPanels(); needsDraw = true;
      });
    });
  }

  // ------------------------------------------------------------------ dialogs
  function openDialog(html, onMount) {
    $('#dialog').innerHTML = html; $('#modal').classList.remove('hidden');
    onMount && onMount($('#dialog'));
  }
  function closeDialog() { $('#modal').classList.add('hidden'); $('#dialog').innerHTML = ''; }
  $('#modal').addEventListener('mousedown', (e) => { if (e.target.id === 'modal' && doc) closeDialog(); });
  async function confirmBox(message, detail) {
    if (api) return api.confirm(message, detail);
    return window.confirm(`${message}\n${detail || ''}`);
  }

  function newMapDialog(first = false) {
    let type = 'world', style = doc?.style || 'parchment';
    const render = () => {
      const T = MAP_TYPES[type];
      openDialog(`
        <h2>${first ? 'Welcome to Pocket-Mapp-Creator' : 'New Map'}</h2>
        <h3>Map type</h3>
        <div class="cards">${Object.entries(MAP_TYPES).map(([k, v]) => `<div class="card ${k === type ? 'on' : ''}" data-type="${k}"><b>${v.label}</b><small>${v.desc}</small></div>`).join('')}</div>
        <h3>Style</h3>
        <div class="cards">${Object.entries(window.ASSET_STYLES).map(([k, v]) => `<div class="card ${k === style ? 'on' : ''}" data-style="${k}"><b>${v.label}</b><small>${k === 'parchment' ? 'Tolkien-style sepia ink on parchment' : k === 'colour' ? 'Bold, saturated, game-ready' : 'Soft washes with bleeding edges'}</small></div>`).join('')}</div>
        <h3>Size</h3>
        <div class="row"><label>Preset</label><select id="nPreset">${T.sizes.map(([w, h]) => `<option value="${w}x${h}">${w} × ${h}${type === 'battle' ? ` (${w / 70} × ${h / 70} squares)` : ''}</option>`).join('')}<option value="custom">Custom…</option></select></div>
        <div class="row"><label>Width × Height</label><input type="number" id="nW" value="${T.sizes[0][0]}" min="200" max="8000"> × <input type="number" id="nH" value="${T.sizes[0][1]}" min="200" max="8000"> px</div>
        <div class="row"><label>Name</label><input type="text" id="nName" value="${type === 'battle' ? 'Battle Map' : type === 'town' ? 'Town Map' : 'The Known World'}"></div>
        <p class="muted">Your map starts as open ocean. Use the <b>Land</b> brush to paint land in any shape, and the <b>Ocean</b> brush to carve it back into sea.</p>
        <div class="actions">${first ? '<button data-cmd="open">Open existing…</button>' : '<button id="nCancel">Cancel</button>'}<button class="primary" id="nCreate">Create map</button></div>`, (d) => {
        d.querySelectorAll('[data-type]').forEach((c) => c.onclick = () => { type = c.dataset.type; render(); });
        d.querySelectorAll('[data-style]').forEach((c) => c.onclick = () => { style = c.dataset.style; d.querySelectorAll('[data-style]').forEach((x) => x.classList.toggle('on', x === c)); });
        d.querySelector('#nPreset').onchange = (e) => { if (e.target.value !== 'custom') { const [w, h] = e.target.value.split('x'); d.querySelector('#nW').value = w; d.querySelector('#nH').value = h; } };
        const c = d.querySelector('#nCancel'); if (c) c.onclick = closeDialog;
        bindCmdButtons(d);
        d.querySelector('#nCreate').onclick = () => {
          const w = clamp(+d.querySelector('#nW').value || 2000, 200, 8000), h = clamp(+d.querySelector('#nH').value || 1400, 200, 8000);
          closeDialog();
          newMap({ type, style, width: w, height: h, name: d.querySelector('#nName').value, start: 'sea' });
        };
      });
    };
    render();
  }

  function resizeDialog() {
    openDialog(`<h2>Map size</h2>
      <div class="row"><label>Width × Height</label><input type="number" id="rW" value="${doc.width}" min="200" max="8000"> × <input type="number" id="rH" value="${doc.height}" min="200" max="8000"> px</div>
      <div class="row"><label>Mode</label><select id="rMode"><option value="canvas">Extend / crop the canvas</option><option value="scale">Scale everything to fit</option></select></div>
      <div class="row"><label>Anchor</label><select id="rAnchor"><option value="c">Centre</option><option value="tl">Top-left</option><option value="t">Top</option><option value="l">Left</option><option value="br">Bottom-right</option></select></div>
      <p class="muted">New canvas area is filled with ${doc.type === 'world' ? 'sea' : 'ground'}.</p>
      <div class="actions"><button id="rCancel">Cancel</button><button class="primary" id="rOk">Apply</button></div>`, (d) => {
      d.querySelector('#rCancel').onclick = closeDialog;
      d.querySelector('#rOk').onclick = () => {
        const W = clamp(+d.querySelector('#rW').value, 200, 8000), H = clamp(+d.querySelector('#rH').value, 200, 8000);
        resizeMap(W, H, d.querySelector('#rMode').value, d.querySelector('#rAnchor').value); closeDialog();
      };
    });
  }
  function resizeMap(W, H, mode, anchor) {
    settleLand();
    const oldW = doc.width, oldH = doc.height, oldLand = landMask, oldPath = pathMask;
    let dx = 0, dy = 0, sx = 1, sy = 1;
    if (mode === 'scale') { sx = W / oldW; sy = H / oldH; }
    else {
      if (anchor === 'c') { dx = (W - oldW) / 2; dy = (H - oldH) / 2; }
      if (anchor === 't') dx = (W - oldW) / 2; if (anchor === 'l') dy = (H - oldH) / 2;
      if (anchor === 'br') { dx = W - oldW; dy = H - oldH; }
    }
    allocMasks(W, H);
    if (doc.type !== 'world' && mode !== 'scale') fillMask(landMask, true);
    const draw = (dst, src, clearFirst) => {
      const c = dst.getContext('2d');
      if (clearFirst && mode !== 'scale') c.clearRect(dx * maskScale, dy * maskScale, oldW * maskScale, oldH * maskScale);
      c.drawImage(src, dx * maskScale, dy * maskScale, oldW * sx * maskScale, oldH * sy * maskScale);
    };
    draw(landMask, oldLand, true); draw(pathMask, oldPath, false);
    const avg = Math.sqrt(sx * sy);
    for (const o of doc.objects) {
      if (o.t === 'line') { o.pts = o.pts.map(([x, y]) => [x * sx + dx, y * sy + dy]); o.w *= avg; }
      else { o.x = o.x * sx + dx; o.y = o.y * sy + dy; o.s *= avg; }
    }
    doc.width = W; doc.height = H;
    lastLandSnap = lastPathSnap = null;
    baseDirty = true; commit(); zoomFit(); refreshPanels();
  }

  function exportDialog(fmt) {
    const maxS = Math.sqrt(64e6 / (doc.width * doc.height));
    openDialog(`<h2>Export ${fmt.toUpperCase()}</h2>
      <div class="row"><label>Resolution</label><select id="eScale">
        ${[0.5, 1, 1.5, 2].filter((s) => s <= maxS + 0.01).map((s) => `<option value="${s}" ${s === 1 ? 'selected' : ''}>${s}× — ${Math.round(doc.width * s)} × ${Math.round(doc.height * s)} px</option>`).join('')}
      </select></div>
      ${fmt === 'jpg' ? '<div class="row"><label>Quality</label><input type="range" id="eQ" min="0.5" max="1" step="0.02" value="0.92"></div>' : ''}
      <div class="row"><label>Include grid</label><input type="checkbox" id="eGrid" ${doc.grid.type !== 'none' ? 'checked' : ''}></div>
      <div class="actions"><button id="eCancel">Cancel</button><button class="primary" id="eGo">Export</button></div>`, (d) => {
      d.querySelector('#eCancel').onclick = closeDialog;
      d.querySelector('#eGo').onclick = async () => {
        const s = +d.querySelector('#eScale').value, q = fmt === 'jpg' ? +d.querySelector('#eQ').value : 1, grid = d.querySelector('#eGrid').checked;
        closeDialog(); await exportImage(fmt, s, q, grid);
      };
    });
  }
  async function renderExportCanvas(s, grid) {
    await whenImagesReady(); await document.fonts.ready;
    // render the terrain at full output resolution where memory allows
    const ts = Math.min(s, Math.sqrt(16e6 / (doc.width * doc.height)));
    const hiBase = MT.renderBase({ landMask, pathMask, mapW: doc.width, mapH: doc.height, scale: ts, style: doc.style, mapType: doc.type, seed: doc.seed });
    const cv = document.createElement('canvas'); cv.width = Math.round(doc.width * s); cv.height = Math.round(doc.height * s);
    const ctx = cv.getContext('2d'); ctx.scale(s, s);
    renderMapContent(ctx, hiBase, { grid });
    return cv;
  }
  async function exportImage(fmt, s = 1, q = 0.92, grid = true) {
    settleLand();
    status('Rendering export…');
    await new Promise((r) => setTimeout(r, 30));
    const cv = await renderExportCanvas(s, grid);
    const url = cv.toDataURL(fmt === 'jpg' ? 'image/jpeg' : 'image/png', q);
    if (api) { const p = await api.exportImage(url, fmt); status(p ? `Exported to ${p}` : ''); }
    else { const a = document.createElement('a'); a.href = url; a.download = `${doc.name}.${fmt}`; a.click(); status('Exported'); }
  }

  function creditsDialog() {
    const counts = {}; MANIFEST.forEach((a) => (counts[a.genre] = (counts[a.genre] || 0) + 1));
    openDialog(`<h2>Licences</h2>
      <p>Pocket-Mapp-Creator © 2026 project-tech-me — released under the MIT Licence.</p>
      <h3>Product icon</h3>
      <p><b>Icon Artist:</b> MJO-Art · workmjo@gmail.com<br>The product Icon files are custom images created by MJO-Art for this project. These icons can not be altered or used without the express permission of the Artist.</p>
      <h3>Built-in map assets (${MANIFEST.length} × 3 styles)</h3>
      <p>All built-in assets are <b>original artwork</b> drawn procedurally by Pocket-Mapp-Creator's own generator and dedicated to the public domain under <b>CC0 1.0</b>. You may use maps made with them commercially, with no attribution required.</p>
      <p class="muted">${Object.entries(counts).map(([g, n]) => `${g}: ${n}`).join(' · ')}</p>
      <h3>Fonts — SIL Open Font Licence 1.1</h3>
      <table><tr><th>Font</th><th>Licence</th></tr>
      ${['IM Fell English (Igino Marini)', 'IM Fell English SC (Igino Marini)', 'Uncial Antiqua (Astigmatic)', 'Cinzel (Natanael Gama)', 'Macondo (John Vargas Beltrán)', 'EB Garamond (Georg Duffner, Octavio Pardo)', 'Caveat (Impallari Type)', 'Orbitron (Matt McInerney)'].map((f) => `<tr><td>${f}</td><td>OFL-1.1</td></tr>`).join('')}
      </table>
      <p class="muted">Full licence texts ship with the app in ASSET-LICENSES.md and src/fonts/licenses/. Imported assets are your responsibility — check their licence.</p>
      <div class="actions"><button class="primary" id="cOk">Close</button></div>`, (d) => { d.querySelector('#cOk').onclick = closeDialog; });
  }
  function shortcutsDialog() {
    const rows = [['V / S / B / E / P / L / T / H', 'Select · Stamp · Land brush · Ocean brush · Ground · Lines · Text · Pan'], ['Space + drag, middle mouse', 'Pan'], ['Mouse wheel', 'Zoom'], ['Ctrl+Z / Ctrl+Y', 'Undo / Redo'], ['Ctrl+D', 'Duplicate'], ['Alt + drag', 'Duplicate while moving'], ['Delete', 'Delete selection'], ['R / Shift+R', 'Rotate ±15°'], ['F', 'Flip asset'], ['Click land (Select tool)', 'Select a whole landmass to move, resize or rotate'], ['[ / ]', 'Brush size, or scale selection'], ['Arrows (+Shift)', 'Nudge 1px (10px)'], ['Shift while rotating', 'Snap to 15°'], ['Alt while painting', 'Swap Land ↔ Ocean brush']];
    openDialog(`<h2>Keyboard shortcuts</h2><table>${rows.map(([k, v]) => `<tr><td><kbd>${k}</kbd></td><td>${v}</td></tr>`).join('')}</table><div class="actions"><button class="primary" id="kOk">Close</button></div>`, (d) => { d.querySelector('#kOk').onclick = closeDialog; });
  }

  // ------------------------------------------------------------------ save / open
  function serialize() {
    settleLand();
    return JSON.stringify({ ...doc, landMask: landMask.toDataURL('image/png'), pathMask: pathMask.toDataURL('image/png') });
  }
  async function loadImageToMask(mask, url) {
    const im = new Image(); im.src = url; await im.decode();
    const c = mask.getContext('2d'); c.clearRect(0, 0, mask.width, mask.height); c.drawImage(im, 0, 0, mask.width, mask.height);
  }
  async function deserialize(text) {
    landSel = null;
    const d = JSON.parse(text);
    if (d.app !== 'Pocket-Mapp-Creator' && d.app !== 'Mapp-Creator') throw new Error('Not a Pocket-Mapp-Creator map file');
    d.app = 'Pocket-Mapp-Creator';
    const { landMask: lm, pathMask: pm, ...rest } = d;
    doc = Object.assign(makeDoc({ type: rest.type }), rest);
    allocMasks(doc.width, doc.height);
    await loadImageToMask(landMask, lm); await loadImageToMask(pathMask, pm);
    selection.clear(); ui.kind = MAP_TYPES[doc.type]?.kind || 'all';
    syncTopbar(); buildLibrary(); resetHistory(); baseDirty = true; zoomFit(); refreshPanels();
  }
  async function save(as = false) {
    const data = serialize();
    if (api) {
      const p = await api.saveProject(data, as ? null : filePath);
      if (p) { filePath = p; dirtyFlag = false; document.title = `Pocket-Mapp-Creator — ${doc.name}`; status(`Saved ${p}`); }
    } else {
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([data], { type: 'application/json' })); a.download = `${doc.name}.mapp`; a.click();
    }
  }
  async function open() {
    try {
      let r;
      if (api) r = await api.openProject();
      else r = await browserPickText();
      if (!r) return;
      closeDialog();
      await deserialize(r.data); filePath = r.filePath || null; document.title = `Pocket-Mapp-Creator — ${doc.name}`;
    } catch (err) { alert(`Could not open map: ${err.message}`); }
  }
  function browserPickText() {
    return new Promise((res) => { const i = document.createElement('input'); i.type = 'file'; i.accept = '.mapp,.json'; i.onchange = async () => { const f = i.files[0]; res(f ? { data: await f.text() } : null); }; i.click(); });
  }
  function browserPickImages() {
    return new Promise((res) => {
      const i = document.createElement('input'); i.type = 'file'; i.accept = 'image/*'; i.multiple = true;
      i.onchange = async () => res(await Promise.all([...i.files].map((f) => new Promise((r) => { const fr = new FileReader(); fr.onload = () => r({ name: f.name.replace(/\.[^.]+$/, ''), dataUrl: fr.result }); fr.readAsDataURL(f); }))));
      i.click();
    });
  }

  // ------------------------------------------------------------------ commands
  async function newWithConfirm() {
    if (dirtyFlag && !(await confirmBox('Start a new map?', 'Unsaved changes to the current map will be lost.'))) return;
    newMapDialog();
  }
  const COMMANDS = {
    new: newWithConfirm, open, save: () => save(false), saveAs: () => save(true),
    exportPng: () => exportDialog('png'), exportJpg: () => exportDialog('jpg'),
    undo, redo, duplicate: duplicateSelection, selectAll, resize: resizeDialog,
    zoomIn: () => { const r = stage.getBoundingClientRect(); zoomAt(1.25, r.width / 2, r.height / 2); },
    zoomOut: () => { const r = stage.getBoundingClientRect(); zoomAt(0.8, r.width / 2, r.height / 2); },
    zoomFit, importAsset: importAssets, credits: creditsDialog, shortcuts: shortcutsDialog
  };
  function bindCmdButtons(root) { root.querySelectorAll('[data-cmd]').forEach((b) => b.onclick = () => COMMANDS[b.dataset.cmd]?.()); }
  bindCmdButtons(document);
  if (api) api.onMenu((cmd) => COMMANDS[cmd]?.());

  function syncTopbar() {
    $('#styleSelect').value = doc.style;
    $('#gridToggle').checked = doc.grid.type !== 'none';
    $('#borderToggle').checked = !!doc.border;
    document.title = `Pocket-Mapp-Creator — ${doc.name}`;
  }
  $('#styleSelect').onchange = (e) => {
    settleLand();
    const prev = doc.style; doc.style = e.target.value;
    // keep ink-coloured labels readable when switching styles
    for (const o of doc.objects) if (o.t === 'text' && o.color === INK[prev]) o.color = INK[doc.style];
    baseDirty = true; buildLibrary(); commit(); scheduleUsedList(); needsDraw = true;
  };
  $('#gridToggle').onchange = (e) => { doc.grid.type = e.target.checked ? (doc.grid.type === 'none' ? 'square' : doc.grid.type) : 'none'; if (e.target.checked && doc.grid.type === 'none') doc.grid.type = 'square'; commit(); renderProps(); needsDraw = true; };
  $('#borderToggle').onchange = (e) => { doc.border = e.target.checked; commit(); needsDraw = true; };

  let statusTimer;
  function status(msg, coords = false) {
    const el = $('#status');
    if (coords) { if (!el.dataset.msg) el.textContent = msg; return; }
    el.dataset.msg = msg ? '1' : ''; el.textContent = msg;
    clearTimeout(statusTimer); if (msg) statusTimer = setTimeout(() => { el.dataset.msg = ''; }, 2500);
  }

  // ------------------------------------------------------------------ example map
  function buildExample() {
    const W = doc.width, H = doc.height, R = MT.rng(doc.seed);
    const landAt = (x, y) => {
      const c = landMask.getContext('2d', { willReadFrequently: true });
      return c.getImageData(Math.floor(x * maskScale), Math.floor(y * maskScale), 1, 1).data[3] > 127;
    };
    const coastDist = (x, y, r) => { for (let a = 0; a < 6.28; a += 0.8) if (!landAt(x + Math.cos(a) * r, y + Math.sin(a) * r)) return false; return true; };
    const pick = (n, test) => { const out = []; let tries = 0; while (out.length < n && tries++ < n * 60) { const x = W * (0.06 + R() * 0.88), y = H * (0.08 + R() * 0.84); if (test(x, y)) out.push([x, y]); } return out; };
    const k = Math.min(W, H) / 1400;
    // mountain chains
    for (let c = 0; c < 3; c++) {
      const [sx, sy] = pick(1, (x, y) => landAt(x, y) && coastDist(x, y, 160 * k))[0] || [W / 2, H / 2];
      let x = sx, y = sy, ang = R() * Math.PI * 2;
      for (let i = 0; i < 9; i++) {
        if (landAt(x, y) && coastDist(x, y, 60 * k)) addAsset(R() < 0.25 ? 'mountain-snow' : R() < 0.5 ? 'mountain-tall' : 'mountain', x, y, { s: (0.8 + R() * 0.4) * k * 1.1 });
        ang += (R() - 0.5) * 0.7; x += Math.cos(ang) * 70 * k; y += Math.sin(ang) * 40 * k;
      }
    }
    pick(10, (x, y) => landAt(x, y) && coastDist(x, y, 50 * k)).forEach(([x, y]) => addAsset('hill', x, y, { s: 0.7 * k }));
    // forests
    for (const [fx, fy] of pick(5, (x, y) => landAt(x, y) && coastDist(x, y, 120 * k))) {
      for (let i = 0; i < 16; i++) { const x = fx + (R() - 0.5) * 220 * k, y = fy + (R() - 0.5) * 120 * k; if (landAt(x, y) && coastDist(x, y, 20 * k)) addAsset(R() < 0.5 ? 'pine' : 'tree', x, y, { s: (0.35 + R() * 0.15) * k, fx: R() < 0.5 }); }
    }
    const places = pick(6, (x, y) => landAt(x, y) && coastDist(x, y, 40 * k));
    const names = ['Eldmoor', 'Harrowgate', 'Thornwick', 'Dunmere', 'Ashford', 'Greyhaven'];
    places.forEach(([x, y], i) => {
      addAsset(i === 0 ? 'city' : i === 1 ? 'castle' : i === 2 ? 'tower' : 'village', x, y, { s: (i < 2 ? 0.6 : 0.5) * k });
      addText(x, y + 70 * k, { text: names[i], size: Math.round(30 * k), font: 'IM Fell English' });
    });
    const sea = pick(3, (x, y) => !landAt(x, y) && !landAt(x + 80 * k, y) && !landAt(x - 80 * k, y));
    if (sea[0]) addAsset('ship', sea[0][0], sea[0][1], { s: 0.6 * k });
    if (sea[1]) addAsset('sea-serpent', sea[1][0], sea[1][1], { s: 0.7 * k });
    if (sea[2]) addText(sea[2][0], sea[2][1], { text: 'The Sundering Sea', size: Math.round(46 * k), italic: true, spacing: 8, curve: 18 });
    addAsset('compass', W - 170 * k, H - 190 * k, { s: 1.1 * k });
    addAsset('cartouche', W / 2, 115 * k, { s: 2.6 * k });
    addText(W / 2, 115 * k, { text: doc.name, size: Math.round(52 * k), font: 'IM Fell English SC', spacing: 4, halo: false });
    commit();
  }

  // ------------------------------------------------------------------ boot
  window.addEventListener('resize', () => { resizeStage(); });
  new ResizeObserver(resizeStage).observe(stage.parentElement);
  resizeStage();
  window.addEventListener('beforeunload', (e) => { if (dirtyFlag && !api?.testMode) { e.returnValue = ''; } });

  async function boot() {
    await document.fonts.load('30px "IM Fell English"').catch(() => {});
    if (api && api.testMode) { await runTest(api.testMode); return; }
    newMap({ type: 'world', style: 'parchment', start: 'sea', name: 'The Known World' });
    setTool('land');
    loop();
    setTimeout(() => newMapDialog(true), 50);
  }

  // automated screenshot test (MAPP_TEST=<dir>)
  async function runTest(dir) {
    loop();
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const shot = async (name) => { needsDraw = true; await wait(400); await api.testCapture(`${dir}/${name}.png`); };
    newMap({ type: 'world', style: 'parchment', start: 'example', name: 'The Known World', seed: 7 });
    await wait(2500); await whenImagesReady(); await shot('01-parchment-world');
    const sample = doc.objects.find((o) => o.t === 'asset' && o.a === 'castle'); if (sample) { selection.add(sample.id); refreshPanels(); openGroups.add('a:mountain'); renderUsedList(); }
    await shot('02-selection');
    selection.clear(); refreshPanels();
    const ex = await renderExportCanvas(1, false); const exUrl = ex.toDataURL('image/png');
    await api.testWrite(`${dir}/export-parchment.png`, exUrl); window.__exportPng = exUrl.length;
    await api.testWrite(`${dir}/export-parchment.jpg`, ex.toDataURL('image/jpeg', 0.9));
    $('#styleSelect').value = 'colour'; $('#styleSelect').onchange({ target: $('#styleSelect') }); await wait(2500); await shot('03-colour-world');
    $('#styleSelect').value = 'watercolour'; $('#styleSelect').onchange({ target: $('#styleSelect') }); await wait(2500); await shot('04-watercolour-world');
    newMap({ type: 'battle', style: 'colour', start: 'land', name: 'Forest Clearing' });
    for (let i = 0; i < 18; i++) addAsset('tree-top', 80 + Math.random() * 1240, 80 + Math.random() * 1240, { s: 1 + Math.random() * 0.5, r: Math.random() * 360 });
    addAsset('campfire', 700, 700, { s: 1 }); addAsset('tent', 560, 620, { s: 1.2, r: 20 }); addAsset('barrel', 840, 600); addAsset('crate', 880, 640, { r: 12 }); addAsset('rock', 400, 900, { s: 1.3 });
    const pc = pathMask.getContext('2d'); pc.fillStyle = '#fff'; pc.beginPath(); pc.ellipse(700 * maskScale, 700 * maskScale, 260 * maskScale, 200 * maskScale, 0, 0, 7); pc.fill();
    const lc = landMask.getContext('2d'); lc.globalCompositeOperation = 'destination-out'; lc.beginPath(); lc.ellipse(1150 * maskScale, 1150 * maskScale, 220 * maskScale, 160 * maskScale, 0, 0, 7); lc.fill(); lc.globalCompositeOperation = 'source-over';
    baseDirty = true; commit(); setTool('stamp'); stampKey = 'tree-top'; renderToolOptions(); buildLibrary();
    await wait(2500); await whenImagesReady(); await shot('05-battle-colour');
    newMap({ type: 'town', style: 'parchment', start: 'land', name: 'Thornwick Village' });
    const blds = ['house', 'tavern', 'chapel', 'cottage', 'windmill', 'blacksmith', 'barn', 'well', 'market-stall', 'house', 'cottage', 'tree-34', 'tree-34', 'fountain'];
    blds.forEach((b, i) => addAsset(b, 380 + (i % 5) * 380 + Math.random() * 60, 380 + Math.floor(i / 5) * 420 + Math.random() * 60, { s: 1.6 }));
    const p2 = pathMask.getContext('2d'); p2.strokeStyle = '#fff'; p2.lineWidth = 70 * maskScale; p2.lineCap = 'round'; p2.beginPath(); p2.moveTo(0, 900 * maskScale); p2.bezierCurveTo(800 * maskScale, 700 * maskScale, 1500 * maskScale, 1100 * maskScale, 2400 * maskScale, 860 * maskScale); p2.stroke();
    doc.objects.push({ id: uid(), t: 'line', kind: 'river', w: 26, o: 1, pts: [[1800, 0], [1750, 400], [1900, 900], [1820, 1400], [1900, 1800]] });
    addText(1200, 160, { text: 'Thornwick', size: 90, font: 'IM Fell English SC', spacing: 6 });
    baseDirty = true; commit(); setTool('select'); buildLibrary();
    await wait(2500); await whenImagesReady(); await shot('06-town-parchment');
    // save / load round trip
    const data = serialize(); await deserialize(data); await wait(2000); await shot('07-roundtrip');
    // interaction test with synthetic pointer events
    newMap({ type: 'world', style: 'parchment', name: 'Interaction Test', width: 2000, height: 1400 });
    await wait(500);
    window.__landStart = landMask.getContext('2d').getImageData(0, 0, landMask.width, landMask.height).data.some((v, i) => i % 4 === 3 && v > 0) ? 'HAS_LAND' : 'empty';
    const r = stage.getBoundingClientRect();
    const ev = (type, mx, my, extra = {}) => { const sx = r.left + view.ox + mx * view.zoom, sy = r.top + view.oy + my * view.zoom; stage.dispatchEvent(new PointerEvent(type, { clientX: sx, clientY: sy, button: 0, buttons: type === 'pointerup' ? 0 : 1, pointerId: 1, bubbles: true, ...extra })); };
    const stroke = (pts) => { ev('pointerdown', ...pts[0]); for (const p of pts.slice(1)) ev('pointermove', ...p); ev('pointerup', ...pts[pts.length - 1]); };
    setTool('land'); ui.brush = 260;
    const blob = []; for (let a = 0; a < 6.3; a += 0.15) blob.push([1000 + Math.cos(a) * 420, 700 + Math.sin(a) * 280]);
    stroke(blob); stroke([[900, 700], [1100, 700], [1000, 620], [1000, 780]]);
    setTool('ocean'); ui.brush = 120; stroke([[1000, 700], [1050, 720]]);
    setTool('stamp'); stampKey = 'pine'; ui.scatter = true; ui.stampScale = 0.5; ui.randFlip = true;
    stroke([[760, 600], [800, 620], [840, 600], [880, 640], [920, 610], [960, 640], [1000, 600]]);
    ui.scatter = false; stampKey = 'castle'; ui.stampScale = 0.8; stroke([[1180, 760]]);
    setTool('line'); ui.lineKind = 'river'; ui.lineWidth = 10; stroke([[1300, 600], [1340, 650], [1330, 720], [1380, 790], [1450, 900], [1500, 960]]);
    setTool('text'); ui.textFont = 'Cinzel'; ui.textSize = 70; ev('pointerdown', 1180, 860); ev('pointerup', 1180, 860);
    const label = doc.objects[doc.objects.length - 1]; label.text = 'Castle Rock'; label.curve = 0;
    ev('pointerdown', 1180, 860); ev('pointermove', 1100, 520); ev('pointerup', 1100, 520);
    $('#toTSizeN').value = 90; $('#toTSizeN').onchange({ target: $('#toTSizeN') });
    window.__label = `${label.font}/${label.size}/${Math.round(label.x)},${Math.round(label.y)}`;
    stampKey = 'mountain'; setTool('stamp'); ui.stampScale = 1; stroke([[1100, 520]]);
    selection.clear(); setTool('select'); ev('pointerdown', 1180, 760); ev('pointerup', 1180, 760);
    const castle = findObj([...selection][0]);
    const hp = handlePositions(castle); ev('pointerdown', hp.rot[0], hp.rot[1]); ev('pointermove', hp.rot[0] + 80, hp.rot[1] + 20); ev('pointerup', hp.rot[0] + 80, hp.rot[1] + 20);
    const rotated = Math.round(castle.r);
    const before = doc.objects.length; undo(); const afterUndo = Math.round(findObj(castle.id)?.r); redo(); const afterRedo = Math.round(findObj(castle.id)?.r);
    await wait(1500); await whenImagesReady(); await shot('08-interactions');
    const pineCount = doc.objects.filter((o) => o.a === 'pine').length;
    // landmass selection: pick the island, scale it up 1.5x, check land area and items followed
    const area = () => { const d = landMask.getContext('2d').getImageData(0, 0, landMask.width, landMask.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 127) n++; return n; };
    const a0 = area(); setTool('select'); selection.clear(); refreshPanels();
    const pine0 = doc.objects.find((o) => o.a === 'pine'); const px0 = pine0.x;
    ev('pointerdown', 700, 760); ev('pointerup', 700, 760);
    const picked = !!landSel; const nItems = landSel ? landSel.items.length : -1;
    const cs = landCorners(); const L = landSel; const cx = L.cx, cy = L.cy;
    const k = [cs[2][0] + (cs[2][0] - cx) * 0.5, cs[2][1] + (cs[2][1] - cy) * 0.5];
    ev('pointerdown', cs[2][0], cs[2][1]); ev('pointermove', k[0], k[1]); ev('pointerup', k[0], k[1]);
    const sAfter = landSel ? landSel.s.toFixed(2) : 'none';
    await wait(300); await shot('09-land-selected');
    ev('pointerdown', 60, 60); ev('pointerup', 60, 60); // click sea to finish
    const a1 = area();
    window.__land = `picked=${picked} items=${nItems} scale=${sAfter} area=${(a1 / a0).toFixed(2)} pineMoved=${Math.round(pine0.x - px0)}`;
    undo(); const a2 = area(); window.__land += ` undoArea=${(a2 / a0).toFixed(2)}`; redo();
    await wait(1500); await shot('10-land-resized');
    document.title = `TESTDONE ${window.__land} label=${window.__label} landStart=${window.__landStart} objs=${before} pines=${pineCount} rotated=${rotated} undoR=${afterUndo} redoR=${afterRedo} sel=${castle.a} png=${window.__exportPng}`;
  }
  boot();
})();
