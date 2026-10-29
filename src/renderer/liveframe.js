// Frames that are drawn live on a canvas instead of with CSS. There is one so
// far: the liquid motion bubbler. Colored drops form at the top corners, let
// go, fall through clear oil (bigger drops fall faster, so they sometimes catch
// up and merge), and land in a pool along the bottom with a ripple. Small air
// bubbles wobble their way up. The canvas sits behind the window's frame, which
// is see-through for this material; the window's content covers the middle.
(() => {
  const api = { frames: 0, drops: 0, set };
  window.liveFrame = api;

  const LIQUID = ['#1590ff', '#10bfae']; // left side, right side
  let on = false, dark = false, moving = true;
  let cv = null, ctx = null, host = null, ro = null, raf = 0, lastT = 0;
  let G = null;          // geometry: x, y, w, h, t (frame thickness), rad
  let bg = null;         // cached oil + glass background
  let gloss = null;      // cached glass highlights on top
  let sim = null;

  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function set(want, isDark, isMoving) {
    const changed = want !== on || isDark !== dark || isMoving !== moving;
    on = want; dark = isDark; moving = isMoving;
    if (!on) return stop();
    if (!cv) start();
    else if (changed) { cache(); if (!raf) loop(); }
  }

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
    cv = ctx = host = ro = G = bg = gloss = sim = null;
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
    if (!sim || !old || Math.abs(old.w - G.w) > 1 || Math.abs(old.h - G.h) > 1 || old.t !== G.t) newSim();
    cache();
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
    const { w, h, t } = G;
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

  function loop(now) {
    raf = 0;
    if (!cv || !G) return;
    if (G.t < 6) { ctx.clearRect(0, 0, G.w, G.h); ctx.drawImage(bg, 0, 0, G.w, G.h); return; } // the slim bar
    const t = now || performance.now();
    const dt = lastT ? Math.min(0.05, (t - lastT) / 1000) : 1 / 60;
    lastT = t;
    if (moving) step(dt);
    draw();
    if (moving) raf = requestAnimationFrame(loop);
    else lastT = 0;
  }
})();
