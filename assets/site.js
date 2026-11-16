// huijunjin.github.io: the header's scrolled state, the e-mail copy button, the
// live nearest-neighbour search in the hero and the small glyphs on the three
// research cards. Everything is drawn from the CSS colour tokens, so both
// themes work, and every random draw is seeded, so the page looks the same on
// every visit.
(function () {
  'use strict';
  const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function rng(seed) {
    let s = seed >>> 0;
    return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const gauss = r => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  function hidpi(canvas) {
    const dpr = Math.max(1, window.devicePixelRatio || 1), w = canvas.clientWidth, h = canvas.clientHeight;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    return { ctx, w, h };
  }
  const alpha = (hex, a) => {
    if (!hex.startsWith('#')) return hex;
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`;
  };

  // ---- header ----
  const head = document.querySelector('.site-head');
  if (head) {
    const onScroll = () => head.classList.toggle('scrolled', window.scrollY > 8);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  // ---- copy the e-mail address ----
  document.querySelectorAll('[data-copy]').forEach(btn => {
    btn.addEventListener('click', () => {
      const text = btn.getAttribute('data-copy');
      const done = () => { const old = btn.textContent; btn.textContent = 'Copied'; setTimeout(() => { btn.textContent = old; }, 1500); };
      const select = () => {
        const el = document.querySelector(btn.getAttribute('data-target'));
        if (!el) return;
        const range = document.createRange(); range.selectNodeContents(el);
        const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range);
      };
      try {
        navigator.clipboard.writeText(text).then(done, select);
      } catch (e) { select(); }
    });
  });

  // ---- the live search: points, their nearest-neighbour links, and a greedy
  // walk from the entry point to each new query, then its five nearest ----
  const live = document.getElementById('live-search');
  if (live) {
    const r = rng(2027);
    const blobs = Array.from({ length: 6 }, () => [0.12 + r() * 0.76, 0.14 + r() * 0.72, 0.05 + r() * 0.05]);
    const pts = [];
    while (pts.length < 150) {
      const b = blobs[Math.floor(r() * blobs.length)];
      const p = r() < 0.2 ? [0.04 + r() * 0.92, 0.05 + r() * 0.9] : [b[0] + gauss(r) * b[2], b[1] + gauss(r) * b[2]];
      if (p[0] < 0.03 || p[0] > 0.97 || p[1] < 0.04 || p[1] > 0.96) continue;
      if (pts.some(q => dist(p, q) < 0.026)) continue;
      pts.push(p);
    }
    // Each point keeps its 3 nearest; links are kept both ways.
    const nb = pts.map(() => new Set());
    pts.forEach((p, i) => {
      pts.map((q, j) => [dist(p, q), j]).filter(([, j]) => j !== i).sort((a, b) => a[0] - b[0]).slice(0, 3)
        .forEach(([, j]) => { nb[i].add(j); nb[j].add(i); });
    });
    const links = [];
    nb.forEach((s, i) => s.forEach(j => { if (i < j) links.push([i, j]); }));
    let entry = 0;
    pts.forEach((p, i) => { if (p[0] + p[1] < pts[entry][0] + pts[entry][1]) entry = i; });
    const queries = Array.from({ length: 12 }, () => [0.15 + r() * 0.7, 0.15 + r() * 0.7]);

    // Greedy best-first search: move to the neighbour nearest the query until
    // none is nearer, then look one ring further for the five nearest.
    function walk(q) {
      const path = [entry], seen = new Set([entry]), looked = [];
      let cur = entry;
      for (;;) {
        let best = cur;
        for (const n of nb[cur]) { looked.push([cur, n]); seen.add(n); if (dist(pts[n], q) < dist(pts[best], q)) best = n; }
        if (best === cur) break;
        cur = best; path.push(cur);
      }
      for (const n of [...nb[cur]]) for (const m of nb[n]) { if (!seen.has(m)) { looked.push([n, m]); seen.add(m); } }
      const found = [...seen].sort((a, b) => dist(pts[a], q) - dist(pts[b], q)).slice(0, 5);
      return { q, path, looked, found };
    }
    const runs = queries.map(walk);

    let view = hidpi(live), C = {};
    const tokens = () => { C = { ink: css('--ink'), ink3: css('--ink-3'), edge: css('--edge'), accent: css('--accent'), surface: css('--surface') }; };
    tokens();
    const X = p => 14 + p[0] * (view.w - 28), Y = p => 14 + p[1] * (view.h - 28);
    const seg = (ctx, a, b, k = 1) => { ctx.moveTo(X(a), Y(a)); ctx.lineTo(X(a) + (X(b) - X(a)) * k, Y(a) + (Y(b) - Y(a)) * k); };

    // One query's frame at time t (seconds): query in, walk out hop by hop, rings, fade.
    const HOP = 0.42, HOLD = 1.6, FADE = 0.5;
    const span = run => 0.5 + run.path.length * HOP + 0.6 + HOLD + FADE;
    function draw(run, t) {
      const { ctx, w, h } = view;
      ctx.clearRect(0, 0, w, h);
      ctx.strokeStyle = C.edge; ctx.lineWidth = 1;
      ctx.beginPath(); for (const [a, b] of links) seg(ctx, pts[a], pts[b]); ctx.stroke();
      const total = span(run), fade = Math.max(0, Math.min(1, (total - t) / FADE));
      const hops = Math.max(0, (t - 0.5) / HOP), done = hops >= run.path.length - 1;
      // what the search compared, in a light wash
      const nLooked = Math.floor(Math.min(1, hops / Math.max(1, run.path.length - 1)) * run.looked.length * (done ? 1 : 0.8));
      ctx.strokeStyle = alpha(C.accent, 0.22 * fade); ctx.lineWidth = 1.2;
      ctx.beginPath(); for (const [a, b] of run.looked.slice(0, nLooked)) seg(ctx, pts[a], pts[b]); ctx.stroke();
      for (let i = 0; i < pts.length; i++) {
        ctx.beginPath(); ctx.arc(X(pts[i]), Y(pts[i]), 2.4, 0, Math.PI * 2);
        ctx.fillStyle = alpha(C.ink3, 0.9); ctx.fill();
      }
      // the walk
      ctx.strokeStyle = alpha(C.accent, fade); ctx.lineWidth = 2.6;
      ctx.beginPath();
      for (let i = 1; i < run.path.length; i++) {
        const k = Math.max(0, Math.min(1, hops - (i - 1)));
        if (k <= 0) break;
        seg(ctx, pts[run.path[i - 1]], pts[run.path[i]], k);
      }
      ctx.stroke();
      for (let i = 0; i < run.path.length && i <= hops; i++) {
        ctx.beginPath(); ctx.arc(X(pts[run.path[i]]), Y(pts[run.path[i]]), 4, 0, Math.PI * 2);
        ctx.fillStyle = alpha(C.accent, fade); ctx.fill();
      }
      // entry point
      ctx.beginPath(); ctx.arc(X(pts[entry]), Y(pts[entry]), 5, 0, Math.PI * 2);
      ctx.fillStyle = C.ink; ctx.fill();
      // the five nearest, once the walk is done
      const ringK = Math.max(0, Math.min(1, (t - (0.5 + (run.path.length - 1) * HOP)) / 0.5)) * fade;
      if (ringK > 0) for (const id of run.found) {
        ctx.beginPath(); ctx.arc(X(pts[id]), Y(pts[id]), 8, 0, Math.PI * 2);
        ctx.strokeStyle = alpha(C.accent, ringK); ctx.lineWidth = 1.8; ctx.stroke();
      }
      // the query
      const qa = Math.min(1, t / 0.4) * fade, qx = X(run.q), qy = Y(run.q);
      ctx.beginPath(); ctx.arc(qx, qy, 16, 0, Math.PI * 2); ctx.fillStyle = alpha(C.accent, 0.12 * qa); ctx.fill();
      ctx.beginPath(); ctx.arc(qx, qy, 6.5, 0, Math.PI * 2); ctx.fillStyle = alpha(C.accent, qa); ctx.fill();
      ctx.beginPath(); ctx.arc(qx, qy, 6.5, 0, Math.PI * 2); ctx.strokeStyle = alpha(C.surface, qa); ctx.lineWidth = 2; ctx.stroke();
    }

    let idx = 0, start = null, raf = 0, visible = true;
    const still = () => draw(runs[0], span(runs[0]) - FADE);
    function frame(now) {
      if (start == null) start = now;
      let t = (now - start) / 1000;
      if (t > span(runs[idx])) { idx = (idx + 1) % runs.length; start = now; t = 0; }
      draw(runs[idx], t);
      raf = requestAnimationFrame(frame);
    }
    const play = () => { cancelAnimationFrame(raf); if (reduced() || !visible || document.hidden) { still(); return; } raf = requestAnimationFrame(frame); };
    if ('IntersectionObserver' in window) new IntersectionObserver(es => { visible = es[0].isIntersecting; play(); }).observe(live);
    document.addEventListener('visibilitychange', play);
    window.addEventListener('resize', () => { view = hidpi(live); if (reduced()) still(); });
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { tokens(); glyphs(); if (reduced()) still(); });
    still();
    play();
  }

  // ---- research glyphs: one small picture per study ----
  function glyphs() {
    document.querySelectorAll('canvas[data-glyph]').forEach(cv => {
      const { ctx, w, h } = hidpi(cv), kind = cv.getAttribute('data-glyph'), r = rng(kind.length * 97 + 11);
      const ink3 = css('--ink-3'), edge = css('--edge');
      ctx.clearRect(0, 0, w, h);
      const dot = (x, y, rad, fill) => { ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fillStyle = fill; ctx.fill(); };
      const line = (a, b, color, width, dash) => { ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = width; if (dash) ctx.setLineDash(dash); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); ctx.restore(); };
      if (kind === 'density') {
        // A crowded spot with more, larger-budget points on the left; a sparse spread on the right.
        const c = css('--density'), P = [];
        for (let i = 0; i < 16; i++) P.push([w * 0.22 + gauss(r) * 18, h / 2 + gauss(r) * 12, 1]);
        for (let i = 0; i < 9; i++) P.push([w * 0.5 + r() * w * 0.45, 10 + r() * (h - 20), 0]);
        P.forEach((p, i) => P.map((q, j) => [Math.hypot(p[0] - q[0], p[1] - q[1]), j]).filter(([, j]) => j !== i).sort((a, b) => a[0] - b[0]).slice(0, p[2] ? 3 : 1).forEach(([, j]) => line(p, P[j], edge, 1)));
        P.forEach(p => dot(p[0], p[1], p[2] ? 3.6 : 2.2, p[2] ? c : alpha(c, 0.45)));
      } else if (kind === 'repair') {
        // A cut-off point (ring) that new incoming links reach again.
        const c = css('--repair'), P = Array.from({ length: 18 }, () => [12 + r() * (w - 24), 10 + r() * (h - 20)]);
        P.forEach((p, i) => P.map((q, j) => [Math.hypot(p[0] - q[0], p[1] - q[1]), j]).filter(([, j]) => j !== i).sort((a, b) => a[0] - b[0]).slice(0, 2).forEach(([, j]) => line(p, P[j], edge, 1)));
        const v = [w * 0.7, h * 0.5];
        const near = P.map((q, j) => [Math.hypot(q[0] - v[0], q[1] - v[1]), j]).sort((a, b) => a[0] - b[0]).slice(0, 3);
        P.forEach(p => dot(p[0], p[1], 2.4, ink3));
        near.forEach(([, j]) => {
          const a = P[j], L = Math.hypot(v[0] - a[0], v[1] - a[1]), ux = (v[0] - a[0]) / L, uy = (v[1] - a[1]) / L, tip = [v[0] - ux * 10, v[1] - uy * 10];
          line(a, tip, c, 2);
          ctx.beginPath(); ctx.moveTo(tip[0], tip[1]); ctx.lineTo(tip[0] - ux * 6 - uy * 4, tip[1] - uy * 6 + ux * 4); ctx.lineTo(tip[0] - ux * 6 + uy * 4, tip[1] - uy * 6 - ux * 4); ctx.closePath(); ctx.fillStyle = c; ctx.fill();
        });
        dot(v[0], v[1], 3, ink3);
        ctx.beginPath(); ctx.arc(v[0], v[1], 8, 0, Math.PI * 2); ctx.strokeStyle = c; ctx.lineWidth = 2; ctx.stroke();
      } else {
        // Two bands of data, a query from the gap, and shortcuts across it.
        const c = css('--shortcut'), acc = css('--accent'), top = [], bot = [];
        for (let i = 0; i < 14; i++) { const x = 8 + i * (w - 16) / 13; top.push([x, h * 0.2 + Math.sin(i * 0.7) * 3]); bot.push([x, h * 0.8 + Math.sin(i * 0.7 + 1) * 3]); }
        for (const B of [top, bot]) for (let i = 1; i < B.length; i++) line(B[i - 1], B[i], edge, 1);
        [[3, 4], [7, 6], [10, 11]].forEach(([a, b]) => {
          ctx.save(); ctx.strokeStyle = c; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.moveTo(top[a][0], top[a][1]);
          ctx.quadraticCurveTo((top[a][0] + bot[b][0]) / 2 + 10, h / 2, bot[b][0], bot[b][1]); ctx.stroke(); ctx.restore();
        });
        top.concat(bot).forEach(p => dot(p[0], p[1], 2.3, ink3));
        dot(w * 0.42, h / 2, 4.5, acc);
      }
    });
  }
  glyphs();
  window.addEventListener('resize', glyphs);
})();
