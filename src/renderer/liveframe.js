// Frames that are drawn live on a canvas instead of with CSS:
//  - the liquid motion bubbler: colored drops form at the top corners, let go,
//    fall through clear oil (bigger drops fall faster, so they sometimes catch
//    up and merge), and land in a pool along the bottom with a ripple. Small
//    air bubbles wobble their way up.
//  - the lava lamp: soft blobs of wax warm up in the glow at the bottom, rise,
//    cool off at the top and sink again, stretching and merging as they pass.
//  - the day & night sky: the sky at this time of day on your clock, with the
//    sun or moon travelling around the frame.
// The canvas sits behind the window's frame, which is see-through for these
// materials; the window's content covers the middle.
(() => {
  const api = { frames: 0, drops: 0, set };
  window.liveFrame = api;

  const LIQUID = ['#1590ff', '#10bfae']; // left side, right side
  let kind = null, dark = false, moving = true;
  let E = null;          // the engine for the current kind (bubbler or lava)
  let cv = null, ctx = null, host = null, ro = null, raf = 0, lastT = 0;
  let G = null;          // geometry: x, y, w, h, t (frame thickness), rad
  let bg = null;         // cached oil + glass background
  let gloss = null;      // cached glass highlights on top
  let sim = null;

  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function set(want, isDark, isMoving) {
    want = ENGINES[want] ? want : null;
    const newKind = want !== kind;
    const changed = newKind || isDark !== dark || isMoving !== moving;
    kind = want; dark = isDark; moving = isMoving;
    if (!kind) return stop();
    E = ENGINES[kind];
    if (!cv) start();
    else if (newKind) { sim = null; layout(); }
    else if (changed) { E.cache(); if (!raf) loop(); }
  }

  // The sky follows the clock, so even with motion off it's redrawn every minute.
  setInterval(() => { if (kind === 'sky' && cv && !raf) loop(); }, 60 * 1000);

  function start() {
    host = document.querySelector('.panel') || document.body;
    cv = document.createElement('canvas');
    cv.className = 'liveframe';
    cv.setAttribute('aria-hidden', 'true');
    Object.assign(cv.style, { position: 'fixed', pointerEvents: 'none', zIndex: host === document.body ? '-1' : '0' });
    document.body.prepend(cv);
    ctx = cv.getContext('2d');
    ro = new ResizeObserver(() => layout());
    ro.observe(host);
    addEventListener('resize', layout);
    layout();
  }

  function stop() {
    cancelAnimationFrame(raf); raf = 0;
    if (ro) ro.disconnect();
    removeEventListener('resize', layout);
    if (cv) cv.remove();
    cv = ctx = host = ro = G = bg = gloss = sim = E = null;
    lavaBuf = null;
    api.drops = 0;
  }

  // ---------- size and cached layers ----------
  function layout() {
    if (!cv) return;
    const r = host.getBoundingClientRect();
    const cs = getComputedStyle(host);
    const isBody = host === document.body;
    const t = isBody ? parseFloat(cs.paddingLeft) : parseFloat(cs.borderLeftWidth);
    const old = G;
    G = { x: r.left, y: r.top, w: r.width, h: r.height, t: t || 0, rad: isBody ? 0 : parseFloat(cs.borderTopLeftRadius) || 0 };
    Object.assign(cv.style, { left: G.x + 'px', top: G.y + 'px', width: G.w + 'px', height: G.h + 'px', borderRadius: G.rad + 'px' });
    const dpr = devicePixelRatio || 1;
    cv.width = Math.max(1, Math.round(G.w * dpr));
    cv.height = Math.max(1, Math.round(G.h * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!sim || !old || Math.abs(old.w - G.w) > 1 || Math.abs(old.h - G.h) > 1 || old.t !== G.t) E.newSim();
    E.cache();
    cancelAnimationFrame(raf); raf = 0;
    loop();
  }

  const offscreen = () => {
    const c = document.createElement('canvas');
    const dpr = devicePixelRatio || 1;
    c.width = cv.width; c.height = cv.height;
    const x = c.getContext('2d');
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    return [c, x];
  };

  // The oil inside a glass tube: lighter in the middle of each side, darker at its walls.
  function cache() {
    if (!G) return;
    const { w, h, t } = G;
    const oil = dark ? ['#08161f', '#15384c'] : ['#9cc9df', '#e2f3fb'];
    let x;
    [bg, x] = offscreen();
    x.fillStyle = oil[1];
    x.fillRect(0, 0, w, h);
    const side = (x0, y0, ww, hh, horiz, flip) => {
      const g = horiz ? x.createLinearGradient(0, flip ? y0 + hh : y0, 0, flip ? y0 : y0 + hh) : x.createLinearGradient(flip ? x0 + ww : x0, 0, flip ? x0 : x0 + ww, 0);
      g.addColorStop(0, oil[0]);
      g.addColorStop(0.45, oil[1]);
      g.addColorStop(0.62, oil[1]);
      g.addColorStop(1, oil[0]);
      x.fillStyle = g;
      x.fillRect(x0, y0, ww, hh);
    };
    side(0, 0, t, h, false, false);
    side(w - t, 0, t, h, false, true);
    side(0, 0, w, t, true, false);
    side(0, h - t, w, t, true, true);

    [gloss, x] = offscreen();
    // Long glints down the glass, and a faint inner wall line.
    const glint = dark ? 'rgba(190,235,255,.16)' : 'rgba(255,255,255,.85)';
    x.fillStyle = glint;
    x.fillRect(t * 0.28, G.rad * 0.6, Math.max(1, t * 0.09), h - G.rad * 1.2);
    x.fillRect(w - t * 0.37, G.rad * 0.6, Math.max(1, t * 0.06), h - G.rad * 1.2);
    x.fillRect(G.rad * 0.6, t * 0.22, w - G.rad * 1.2, Math.max(1, t * 0.07));
    x.strokeStyle = dark ? 'rgba(150,215,255,.16)' : 'rgba(40,100,140,.18)';
    x.lineWidth = 1;
    x.strokeRect(t - 0.5, t - 0.5, w - 2 * t + 1, h - 2 * t + 1);
  }

  // ---------- simulation ----------
  function newSim() {
    const { w, t } = G;
    const lane = (side) => ({
      side, x: side ? w - t * 0.5 : t * 0.5, color: LIQUID[side],
      y0: Math.max(t * 0.45, G.rad * 0.5), grow: 0, target: rand(0.18, 0.32) * t, wait: rand(0, 0.3),
    });
    sim = { lanes: [lane(0), lane(1)], drops: [], bubbles: [], ripples: [], time: 0, poolH: t * 0.42 };
    // Run it for a while first, so the frame never starts empty.
    for (let i = 0; i < 900; i++) step(1 / 30);
  }

  // Terminal speed in oil grows with the drop's size (Stokes' law).
  const terminal = (r) => 6 + 3.2 * r * r;

  function step(dt) {
    const { w, h, t } = G;
    const S = sim;
    S.time += dt;
    const surface = h - S.poolH;

    // Drops forming at the nozzles grow, then let go.
    for (const L of S.lanes) {
      if (L.wait > 0) { L.wait -= dt; continue; }
      L.grow += dt * L.target * rand(3, 5);
      if (L.grow >= L.target) {
        S.drops.push({ x: L.x + rand(-0.4, 0.4), y: L.y0 + L.grow, r: L.grow, v: 4, wob: 1, ph: 0, color: L.color, side: L.side });
        // Sometimes the neck leaves a tiny satellite drop behind.
        if (Math.random() < 0.35) S.drops.push({ x: L.x, y: L.y0 + 0.3 * L.grow, r: L.grow * rand(0.18, 0.3), v: 2, wob: 0.6, ph: 1, color: L.color, side: L.side });
        L.grow = 0;
        L.target = rand(0.18, 0.32) * t;
        // Mostly a steady chain, now and then a pause.
        L.wait = Math.random() < 0.12 ? rand(0.6, 1.6) : rand(0.03, 0.22);
      }
    }

    // Falling drops.
    for (const d of S.drops) {
      const vt = terminal(d.r);
      d.v += (vt - d.v) * Math.min(1, dt * 2.2);
      d.y += d.v * dt;
      d.wob *= Math.exp(-dt * 2.6);
      d.ph += dt * 26;
      d.x += Math.sin(S.time * 1.3 + d.y * 0.05) * dt * 0.6; // a little drift
      d.x = clamp(d.x, d.side ? w - t + d.r * 0.8 : d.r * 0.8, d.side ? w - d.r * 0.8 : t - d.r * 0.8);
    }
    // A faster drop that catches one below it merges into one bigger drop.
    S.drops.sort((a, b) => a.y - b.y);
    for (let i = 0; i < S.drops.length; i++) {
      const a = S.drops[i];
      if (a.dead) continue;
      for (let j = i + 1; j < S.drops.length; j++) {
        const b = S.drops[j];
        if (b.dead || b.side !== a.side) continue;
        if (b.y - a.y > a.r + b.r + 4) break;
        if (Math.hypot(a.x - b.x, a.y - b.y) < (a.r + b.r) * 0.92) {
          const vol = a.r ** 3 + b.r ** 3;
          const r = Math.cbrt(vol);
          Object.assign(a, { x: (a.x * a.r ** 3 + b.x * b.r ** 3) / vol, y: (a.y * a.r ** 3 + b.y * b.r ** 3) / vol, v: Math.max(a.v, b.v), r: Math.min(r, t * 0.42), wob: 1.4, ph: 0 });
          b.dead = true;
        }
      }
    }
    // Landing in the pool: a ripple, and the drop is gone.
    for (const d of S.drops) {
      if (!d.dead && d.y + d.r * 0.4 >= surface) {
        d.dead = true;
        S.ripples.push({ x: d.x, age: 0, amp: clamp(d.r * 0.35, 0.4, 1.8) });
      }
    }
    S.drops = S.drops.filter((d) => !d.dead);
    S.ripples = S.ripples.filter((r) => (r.age += dt) < 3);

    // Air bubbles rise and wobble; new ones now and then.
    if (Math.random() < dt * (2 + (w + h) / 220)) {
      const where = Math.random();
      const side = where < 0.5 ? 0 : 1;
      S.bubbles.push({
        x: side ? w - t * rand(0.2, 0.8) : t * rand(0.2, 0.8), y: surface - rand(0, 30), r: rand(0.8, Math.max(1, t * 0.13)),
        ph: rand(0, 6), side,
      });
    }
    for (const b of S.bubbles) {
      b.y -= (9 + 16 * b.r) * dt;
      b.ph += dt * 4;
      b.x += Math.cos(b.ph) * dt * 2.2;
      b.x = clamp(b.x, b.side ? w - t + b.r + 0.5 : b.r + 0.5, b.side ? w - b.r - 0.5 : t - b.r - 0.5);
      if (b.y < t * 0.55 + b.r) b.dead = true;
    }
    S.bubbles = S.bubbles.filter((b) => !b.dead);
    api.drops = S.drops.length;
  }

  // ---------- drawing ----------
  const hex = (c) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
  const mix = (c, to, k) => { const a = hex(c); return `rgb(${a.map((v) => Math.round(v + (to - v) * k)).join(',')})`; };

  // One drop: lit from the upper left, with a bright highlight on top and the
  // light it focuses showing as a glow near the bottom.
  function drawDrop(x, y, rx, ry, color, alpha = 1) {
    const r = Math.max(rx, ry);
    const g = ctx.createRadialGradient(x - rx * 0.3, y - ry * 0.35, r * 0.05, x, y, r * 1.15);
    g.addColorStop(0, mix(color, 255, 0.55));
    g.addColorStop(0.38, color);
    g.addColorStop(1, mix(color, 0, 0.5));
    ctx.globalAlpha = alpha;
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    if (r > 1.3) {
      const c = ctx.createRadialGradient(x + rx * 0.12, y + ry * 0.55, 0, x + rx * 0.12, y + ry * 0.55, r * 0.5);
      c.addColorStop(0, 'rgba(255,255,255,.45)');
      c.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = c;
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.92)';
      ctx.beginPath();
      ctx.ellipse(x - rx * 0.36, y - ry * 0.42, rx * 0.3, ry * 0.18, -0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = mix(color, 0, 0.6);
      ctx.globalAlpha = alpha * 0.35;
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function liquidGradient(y0, y1) {
    const g = ctx.createLinearGradient(0, 0, G.w, 0);
    g.addColorStop(0, LIQUID[0]);
    g.addColorStop(0.42, LIQUID[0]);
    g.addColorStop(0.58, LIQUID[1]);
    g.addColorStop(1, LIQUID[1]);
    return g;
  }

  function draw() {
    const { w, h, t } = G;
    const S = sim;
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    // Only the frame ring is visible, so only paint there.
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    ctx.rect(t, t, w - 2 * t, h - 2 * t);
    ctx.clip('evenodd');
    ctx.drawImage(bg, 0, 0, w, h);

    // The colored liquid feeding the drops, along the top.
    const topH = t * 0.34;
    ctx.fillStyle = liquidGradient();
    ctx.globalAlpha = 0.92;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(w, 0);
    for (let x = w; x >= 0; x -= 6) ctx.lineTo(x, topH + Math.sin(x * 0.045 + S.time * 0.9) * 0.6);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
    // Its lower edge catches the light.
    ctx.strokeStyle = 'rgba(255,255,255,.35)';
    ctx.lineWidth = 0.8;
    ctx.stroke();

    // Drops forming at the nozzles: a neck from the liquid above to a growing bead.
    for (const L of S.lanes) {
      if (L.grow <= 0.2) continue;
      const r = L.grow;
      const cy = L.y0 + r;
      const neck = Math.max(0.6, r * 0.4 * (1 - r / L.target) + 0.5);
      ctx.fillStyle = L.color;
      ctx.beginPath();
      ctx.moveTo(L.x - neck * 1.8, topH - 0.5);
      ctx.quadraticCurveTo(L.x - neck, cy - r * 0.6, L.x - r * 0.85, cy - r * 0.2);
      ctx.lineTo(L.x + r * 0.85, cy - r * 0.2);
      ctx.quadraticCurveTo(L.x + neck, cy - r * 0.6, L.x + neck * 1.8, topH - 0.5);
      ctx.closePath();
      ctx.fill();
      drawDrop(L.x, cy, r, r * 1.06, L.color);
    }

    // Falling drops: they wobble after letting go or merging, and stretch a little when fast.
    for (const d of S.drops) {
      const k = d.wob * 0.16 * Math.sin(d.ph);
      const fast = clamp(d.v / 300, 0, 0.08);
      drawDrop(d.x, d.y, d.r * (1 + k - fast * 0.5), d.r * (1 - k + fast), d.color);
    }

    // Air bubbles: a clear ring with a bright edge.
    for (const b of S.bubbles) {
      const g = ctx.createRadialGradient(b.x, b.y, b.r * 0.2, b.x, b.y, b.r);
      g.addColorStop(0, dark ? 'rgba(200,240,255,.04)' : 'rgba(255,255,255,.25)');
      g.addColorStop(0.72, dark ? 'rgba(200,240,255,.10)' : 'rgba(255,255,255,.35)');
      g.addColorStop(1, dark ? 'rgba(210,245,255,.75)' : 'rgba(30,85,120,.6)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.95)';
      ctx.beginPath();
      ctx.arc(b.x - b.r * 0.35, b.y - b.r * 0.38, Math.max(0.35, b.r * 0.28), 0, Math.PI * 2);
      ctx.fill();
    }

    // The pool along the bottom, with ripples where drops landed.
    const base = h - S.poolH;
    const surf = (x) => {
      let y = Math.sin(x * 0.03 + S.time * 0.8) * 0.4;
      for (const r of S.ripples) {
        const dx = Math.abs(x - r.x);
        y += r.amp * Math.exp(-r.age * 1.6) * Math.exp(-dx / 45) * Math.sin(dx * 0.32 - r.age * 9);
      }
      return base + y;
    };
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let x = 0; x <= w; x += 3) ctx.lineTo(x, surf(x));
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fillStyle = liquidGradient();
    ctx.fill();
    // Depth: darker toward the bottom.
    const deep = ctx.createLinearGradient(0, base, 0, h);
    deep.addColorStop(0, 'rgba(255,255,255,.18)');
    deep.addColorStop(1, 'rgba(0,0,0,.35)');
    ctx.fillStyle = deep;
    ctx.fill();
    // The surface line catches the light.
    ctx.beginPath();
    for (let x = 0; x <= w; x += 3) x ? ctx.lineTo(x, surf(x)) : ctx.moveTo(x, surf(x));
    ctx.strokeStyle = 'rgba(255,255,255,.6)';
    ctx.lineWidth = 0.9;
    ctx.stroke();

    ctx.drawImage(gloss, 0, 0, w, h);
    ctx.restore();
    api.frames++;
  }

  // ---------- lava lamp ----------
  // The wax is drawn as a "metaball" field: every blob adds r^2 / distance^2,
  // and wherever the sum passes 1 is wax. That's what makes blobs stretch,
  // touch and melt into each other. It's worked out on a half-size grid, only
  // inside the frame ring, then scaled up smoothly.
  const LAVA = {
    cool: [196, 20, 92], hot: [255, 178, 72],                      // wax
    top: [38, 10, 58], bottom: [120, 26, 92], glow: [255, 120, 60], // liquid and lamp
  };
  let lavaBuf = null;    // { c, x, img, u32, w, h }

  function lavaCache() {
    const { w, h, t } = G;
    let x;
    [bg, x] = offscreen();
    const g = x.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, `rgb(${LAVA.top})`);
    g.addColorStop(1, `rgb(${LAVA.bottom})`);
    x.fillStyle = g;
    x.fillRect(0, 0, w, h);
    [gloss, x] = offscreen();
    x.fillStyle = 'rgba(255,255,255,.22)';
    x.fillRect(t * 0.26, G.rad * 0.6, Math.max(1, t * 0.08), h - G.rad * 1.2);
    x.fillRect(w - t * 0.36, G.rad * 0.6, Math.max(1, t * 0.05), h - G.rad * 1.2);
    x.fillStyle = 'rgba(255,255,255,.12)';
    x.fillRect(G.rad * 0.6, t * 0.2, w - G.rad * 1.2, Math.max(1, t * 0.06));
    // The lamp's glow from below.
    const glow = x.createLinearGradient(0, h, 0, h * 0.55);
    glow.addColorStop(0, 'rgba(255,150,70,.35)');
    glow.addColorStop(1, 'rgba(255,150,70,0)');
    x.fillStyle = glow;
    x.fillRect(0, h * 0.55, w, h * 0.45);
    const S = 0.5;
    const bw = Math.max(1, Math.ceil(w * S)), bh = Math.max(1, Math.ceil(h * S));
    const c = document.createElement('canvas');
    c.width = bw; c.height = bh;
    const cx = c.getContext('2d');
    const img = cx.createImageData(bw, bh);
    lavaBuf = { c, x: cx, img, u32: new Uint32Array(img.data.buffer), w: bw, h: bh, S };
  }

  function lavaSim() {
    const { w, h, t } = G;
    const blobs = [];
    const add = (side, y) => blobs.push({
      side, x: side ? w - t * 0.5 : t * 0.5, y, r: rand(0.42, 0.72) * t, v: 0, T: Math.random(), ph: rand(0, 6), sq: rand(1.1, 1.6),
    });
    const per = Math.max(3, Math.round(h / 95));
    for (let side = 0; side < 2; side++) for (let i = 0; i < per; i++) add(side, rand(t, h - t));
    // Wax resting along the bottom and clinging along the top.
    const pool = [];
    for (let x = 0; x < w + t; x += t * 1.05) pool.push({ x, y: h + t * 0.25, r: rand(0.8, 1.05) * t, ph: rand(0, 6), bottom: true });
    for (let x = t * rand(3, 6); x < w - t * 3; x += t * rand(7, 13)) pool.push({ x, y: -t * 0.15, r: rand(0.45, 0.62) * t, ph: rand(0, 6), bottom: false });
    sim = { blobs, pool, time: 0 };
    for (let i = 0; i < 240; i++) lavaStep(1 / 20);
  }

  function lavaStep(dt) {
    const { w, h, t } = G;
    const S = sim;
    S.time += dt;
    for (const b of S.blobs) {
      // Warm in the glow at the bottom, cool near the top; warm wax rises.
      const depth = b.y / h;
      if (depth > 0.82) b.T += dt * 0.16;
      else b.T -= dt * (0.04 + 0.05 * (1 - depth));
      b.T = clamp(b.T, 0, 1);
      b.v += -(b.T - 0.5) * 22 * dt;
      b.v *= Math.exp(-dt * 0.9);
      b.v = clamp(b.v, -26, 26);
      b.y += b.v * dt;
      if (b.y < t * 0.4) { b.y = t * 0.4; b.v = Math.abs(b.v) * 0.2; b.T = Math.min(b.T, 0.35); }
      if (b.y > h - t * 0.3) { b.y = h - t * 0.3; b.v = -Math.abs(b.v) * 0.2; }
      b.ph += dt * 0.7;
      b.x = (b.side ? w - t * 0.5 : t * 0.5) + Math.sin(b.ph) * t * 0.08;
      // Rising or sinking fast, a blob stretches into a taller shape.
      b.sq = 1.15 + Math.min(0.9, Math.abs(b.v) / 22);
    }
    for (const p of S.pool) p.ph += dt * 0.35;
    api.drops = S.blobs.length;
  }

  function lavaDraw() {
    const { w, h, t } = G;
    const B = lavaBuf, S = sim;
    const k = B.S;
    const u32 = B.u32;
    const T0 = Math.ceil(t * k) + 1;
    const blobs = S.blobs.map((b) => ({ x: b.x * k, y: b.y * k, r2: (b.r * k) ** 2, sy: 1 / b.sq, T: b.T }));
    const pool = S.pool.map((p) => ({ x: p.x * k, y: (p.y + Math.sin(p.ph) * t * 0.12) * k, r2: ((p.r * (1 + 0.12 * Math.sin(p.ph * 1.7))) * k) ** 2, sy: 1, T: p.bottom ? 0.9 : 0.2 }));
    const all = blobs.concat(pool);
    const top = LAVA.top, bot = LAVA.bottom, cool = LAVA.cool, hot = LAVA.hot, glow = LAVA.glow;
    const H = B.h, W = B.w;
    const px = (x, y) => {
      let f = 0, fT = 0;
      for (let i = 0; i < all.length; i++) {
        const b = all[i];
        const dy = (y - b.y) * b.sy;
        const dx = x - b.x;
        const d2 = dx * dx + dy * dy;
        if (d2 > b.r2 * 16) continue;
        const c = b.r2 / (d2 + 0.6);
        f += c; fT += c * b.T;
      }
      const ly = y / H;
      let r = top[0] + (bot[0] - top[0]) * ly, g = top[1] + (bot[1] - top[1]) * ly, bl = top[2] + (bot[2] - top[2]) * ly;
      if (f >= 1) {
        const T = fT / f;
        const core = Math.min(1, (f - 1) / 1.6);
        const lit = 0.72 + 0.34 * core;          // thicker wax glows brighter
        const rim = f < 1.18 ? 0.82 + (f - 1) : 1; // a slightly darker edge
        r = (cool[0] + (hot[0] - cool[0]) * T) * lit * rim;
        g = (cool[1] + (hot[1] - cool[1]) * T) * lit * rim;
        bl = (cool[2] + (hot[2] - cool[2]) * T) * lit * rim;
      } else if (f > 0.25) {
        const a = (f - 0.25) / 0.75 * 0.42;        // warm light around the wax
        r += (glow[0] - r) * a; g += (glow[1] - g) * a; bl += (glow[2] - bl) * a;
      }
      u32[y * W + x] = 0xff000000 | (Math.min(255, bl) << 16) | (Math.min(255, g) << 8) | Math.min(255, r);
    };
    for (let y = 0; y < H; y++) {
      if (y < T0 || y >= H - T0) { for (let x = 0; x < W; x++) px(x, y); continue; }
      for (let x = 0; x < T0; x++) px(x, y);
      for (let x = W - T0; x < W; x++) px(x, y);
    }
    B.x.putImageData(B.img, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    ctx.rect(t, t, w - 2 * t, h - 2 * t);
    ctx.clip('evenodd');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(B.c, 0, 0, W, H, 0, 0, W / k, H / k);
    ctx.drawImage(gloss, 0, 0, w, h);
    ctx.restore();
    api.frames++;
  }

  // ---------- day & night sky ----------
  // The frame is the sky at this time of day, on your clock. The sun rises up
  // the left side, crosses the top and sets down the right side; the moon does
  // the same at night. Clouds drift around the frame by day, stars twinkle by
  // night (with the odd shooting star), and dawn and dusk glow orange and pink.
  // api.hour overrides the clock (tests and screenshots).
  const SKY = [ // hour, color at the top, color at the bottom
    [0, '#070b1f', '#141c3d'], [4.6, '#070b1f', '#141c3d'], [5.6, '#2a2350', '#c76a6a'], [6.6, '#5c7fc4', '#ffb37a'],
    [8, '#3f93e6', '#bfe3ff'], [16.2, '#3f93e6', '#bfe3ff'], [18, '#3c6fb8', '#ffb070'], [19.2, '#2b2a5e', '#e0607a'],
    [20.4, '#0d1430', '#29305e'], [24, '#070b1f', '#141c3d'],
  ];
  const RISE = 6, SET = 19.5; // the sun is up from 6:00 to 19:30
  const mixRGB = (a, b, f) => a.map((v, i) => Math.round(v + (b[i] - v) * f));
  const rgb = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
  const hourNow = () => (api.hour != null ? api.hour : (() => { const d = new Date(); return d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600; })());
  function skyAt(hr) {
    let i = 0;
    while (i < SKY.length - 2 && SKY[i + 1][0] <= hr) i++;
    const [h0, t0, b0] = SKY[i], [h1, t1, b1] = SKY[i + 1];
    const f = clamp((hr - h0) / (h1 - h0 || 1), 0, 1);
    return { top: mixRGB(hex(t0), hex(t1), f), bottom: mixRGB(hex(b0), hex(b1), f) };
  }
  // 1 in full night, 0 in full day, in between at dawn and dusk.
  const nightness = (hr) => (hr < 4.8 || hr > 20.6 ? 1 : hr < 7 ? clamp((7 - hr) / 2.2, 0, 1) : hr > 18.2 ? clamp((hr - 18.2) / 2.4, 0, 1) : 0);
  // A point along the frame's path: up the left side, across the top, down the right.
  function along(p) {
    const { w, h, t } = G;
    const side = h * 0.55, top = w;
    const total = side * 2 + top;
    let d = clamp(p, 0, 1) * total;
    if (d < side) return [t * 0.5, h * 0.62 - d];
    d -= side;
    if (d < top) return [clamp(d, t * 0.5, w - t * 0.5), t * 0.5];
    d -= top;
    return [w - t * 0.5, h * 0.07 + d];
  }

  let skyBg = null, skyHour = -1;
  function skyCache() {
    const hr = hourNow();
    skyHour = hr;
    const { w, h, t } = G;
    const s = skyAt(hr);
    let x;
    [skyBg, x] = offscreen();
    const g = x.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, rgb(s.top));
    g.addColorStop(1, rgb(s.bottom));
    x.fillStyle = g;
    x.fillRect(0, 0, w, h);
    // A low glow along the bottom at dawn and dusk.
    const warm = (hr > 5 && hr < 8) || (hr > 17 && hr < 20.5) ? 0.35 : 0;
    if (warm) {
      const gl = x.createLinearGradient(0, h, 0, h - t * 3);
      gl.addColorStop(0, `rgba(255,150,90,${warm})`);
      gl.addColorStop(1, 'rgba(255,150,90,0)');
      x.fillStyle = gl;
      x.fillRect(0, h - t * 3, w, t * 3);
    }
    bg = skyBg;
    [gloss, x] = offscreen();
    x.strokeStyle = 'rgba(255,255,255,.18)';
    x.lineWidth = 1;
    x.strokeRect(t - 0.5, t - 0.5, w - 2 * t + 1, h - 2 * t + 1);
  }

  function skySim() {
    const { w, h, t } = G;
    const ring = () => { // a random point inside the frame's band
      const per = 2 * (w + h);
      let d = Math.random() * per;
      if (d < w) return [d, rand(1, t - 1)];
      d -= w;
      if (d < h) return [w - rand(1, t - 1), d];
      d -= h;
      if (d < w) return [d, h - rand(1, t - 1)];
      return [rand(1, t - 1), d - w];
    };
    const stars = Array.from({ length: Math.round((w + h) / 9) }, () => { const [x, y] = ring(); return { x, y, r: rand(0.35, 1.1), ph: rand(0, 6), sp: rand(0.8, 2.4) }; });
    const clouds = Array.from({ length: Math.max(4, Math.round((w + h) / 120)) }, () => ({ d: Math.random(), sp: rand(0.004, 0.009), s: rand(0.75, 1.15), puffs: Math.round(rand(3, 5)) }));
    sim = { stars, clouds, shoot: null, nextShoot: rand(6, 16), time: 0 };
  }

  function skyStep(dt) {
    const S = sim;
    S.time += dt;
    for (const c of S.clouds) c.d = (c.d + c.sp * dt) % 1;
    if (S.shoot) { S.shoot.life -= dt; if (S.shoot.life <= 0) S.shoot = null; }
    S.nextShoot -= dt;
    if (S.nextShoot <= 0 && nightness(hourNow()) > 0.7) {
      const { w, t } = G;
      S.shoot = { x: rand(w * 0.15, w * 0.75), y: rand(t * 0.2, t * 0.6), life: 0.9, len: rand(40, 80) };
      S.nextShoot = rand(9, 22);
    }
    api.drops = S.clouds.length;
  }

  // Where along the frame a cloud is (its position around the whole loop).
  function ringPoint(d) {
    const { w, h, t } = G;
    const per = 2 * (w + h);
    let x = d * per;
    if (x < w) return [x, t * 0.5];
    x -= w;
    if (x < h) return [w - t * 0.5, x];
    x -= h;
    if (x < w) return [w - x, h - t * 0.5];
    return [t * 0.5, h - (x - w)];
  }

  function skyDraw() {
    const { w, h, t } = G;
    const hr = hourNow();
    if (Math.abs(hr - skyHour) > 0.02) skyCache(); // the colors move on about once a minute
    const S = sim;
    const night = nightness(hr);
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    ctx.rect(t, t, w - 2 * t, h - 2 * t);
    ctx.clip('evenodd');
    ctx.drawImage(skyBg, 0, 0, w, h);

    // Stars, fading in at dusk.
    if (night > 0.05) {
      for (const s of S.stars) {
        const a = night * (0.45 + 0.55 * Math.abs(Math.sin(S.time * s.sp + s.ph)));
        ctx.fillStyle = `rgba(255,255,240,${a})`;
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
      }
      if (S.shoot) {
        const k = S.shoot.life / 0.9, x0 = S.shoot.x + (1 - k) * S.shoot.len * 2, y0 = S.shoot.y + (1 - k) * 6;
        const g = ctx.createLinearGradient(x0, y0, x0 - S.shoot.len, y0 - 6);
        g.addColorStop(0, `rgba(255,255,255,${0.9 * k})`); g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.strokeStyle = g; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0 - S.shoot.len, y0 - 6); ctx.stroke();
      }
    }

    // The sun by day, the moon by night, travelling along the frame.
    const up = hr >= RISE && hr <= SET;
    const p = up ? (hr - RISE) / (SET - RISE) : ((hr < RISE ? hr + 24 : hr) - SET) / (24 - SET + RISE);
    const [bx, by] = along(p);
    const R = t * 0.62;
    if (up) {
      const low = Math.min(1, Math.abs(p - 0.5) * 2); // redder near sunrise and sunset
      const core = mixRGB([255, 244, 200], [255, 160, 90], low * low);
      const halo = ctx.createRadialGradient(bx, by, R * 0.4, bx, by, R * 4.2);
      halo.addColorStop(0, rgb(core, 0.75)); halo.addColorStop(1, rgb(core, 0));
      ctx.fillStyle = halo; ctx.fillRect(bx - R * 4.2, by - R * 4.2, R * 8.4, R * 8.4);
      ctx.fillStyle = rgb(core);
      ctx.beginPath(); ctx.arc(bx, by, R, 0, Math.PI * 2); ctx.fill();
    } else {
      const halo = ctx.createRadialGradient(bx, by, R * 0.5, bx, by, R * 3.4);
      halo.addColorStop(0, 'rgba(220,230,255,.35)'); halo.addColorStop(1, 'rgba(220,230,255,0)');
      ctx.fillStyle = halo; ctx.fillRect(bx - R * 3.4, by - R * 3.4, R * 6.8, R * 6.8);
      ctx.fillStyle = '#eef2ff';
      ctx.beginPath(); ctx.arc(bx, by, R * 0.85, 0, Math.PI * 2); ctx.fill();
      // The shadowed part makes it a crescent.
      ctx.fillStyle = rgb(skyAt(hr).top);
      ctx.beginPath(); ctx.arc(bx + R * 0.62, by - R * 0.22, R * 0.68, 0, Math.PI * 2); ctx.fill();
    }

    // Clouds drifting around the frame, pink-tinged at dawn and dusk, faint at night.
    const tint = mixRGB([255, 255, 255], skyAt(hr).bottom, 0.35 * Math.min(1, night * 2));
    const ca = 0.88 - night * 0.7;
    for (const c of S.clouds) {
      const [cx, cy] = ringPoint(c.d);
      const r = t * 0.42 * c.s;
      ctx.fillStyle = rgb(tint, ca);
      for (let i = 0; i < c.puffs; i++) {
        const ox = (i - (c.puffs - 1) / 2) * r * 0.95, oy = Math.sin(i * 2.1) * r * 0.25;
        ctx.beginPath(); ctx.arc(cx + ox, cy + oy, r * (i % 2 ? 0.85 : 1.05), 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.drawImage(gloss, 0, 0, w, h);
    ctx.restore();
    api.frames++;
  }

  const ENGINES = {
    bubbler: { cache, newSim, step, draw },
    lavalamp: { cache: lavaCache, newSim: lavaSim, step: lavaStep, draw: lavaDraw },
    sky: { cache: skyCache, newSim: skySim, step: skyStep, draw: skyDraw },
  };

  function loop(now) {
    raf = 0;
    if (!cv || !G) return;
    if (G.t < 6) { ctx.clearRect(0, 0, G.w, G.h); ctx.drawImage(bg, 0, 0, G.w, G.h); return; } // the slim bar
    const t = now || performance.now();
    const dt = lastT ? Math.min(0.05, (t - lastT) / 1000) : 1 / 60;
    lastT = t;
    if (moving) E.step(dt);
    E.draw();
    if (moving) raf = requestAnimationFrame(loop);
    else lastT = 0;
  }
})();
