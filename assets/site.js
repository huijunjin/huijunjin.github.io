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

  // ---- theme: the visitor's system setting, unless they pick one with the
  // header button (remembered in this browser) ----
  const root = document.documentElement, toggle = document.querySelector('.theme');
  const isDark = () => root.dataset.theme ? root.dataset.theme === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
  const announce = () => {
    if (toggle) toggle.setAttribute('aria-label', isDark() ? 'Switch to light mode' : 'Switch to dark mode');
    document.dispatchEvent(new Event('themechange'));
  };
  if (toggle) toggle.addEventListener('click', () => {
    root.dataset.theme = isDark() ? 'light' : 'dark';
    try { localStorage.setItem('theme', root.dataset.theme); } catch (e) { /* private mode: not remembered */ }
    announce();
  });
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', announce);
  if (toggle) toggle.setAttribute('aria-label', isDark() ? 'Switch to light mode' : 'Switch to dark mode');

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

  // ---- the live search: a real HNSW (assets/hnsw.js, the demo's implementation)
  // over 2-D points. Each query starts at the entry point on the top layer, takes
  // long jumps across the sparse upper layers (amber), then looks around the
  // bottom layer (blue) and ends on its five nearest points. ----
  const live = document.getElementById('live-search');
  if (live && window.HN) {
    const r = rng(2027);
    const blobs = Array.from({ length: 6 }, () => [0.12 + r() * 0.76, 0.14 + r() * 0.72, 0.05 + r() * 0.05]);
    const pts = [];
    while (pts.length < 160) {
      const b = blobs[Math.floor(r() * blobs.length)];
      const p = r() < 0.22 ? [0.04 + r() * 0.92, 0.05 + r() * 0.9] : [b[0] + gauss(r) * b[2], b[1] + gauss(r) * b[2]];
      if (p[0] < 0.03 || p[0] > 0.97 || p[1] < 0.04 || p[1] > 0.96) continue;
      if (pts.some(q => dist(p, q) < 0.025)) continue;
      pts.push(p);
    }
    const g = new HN.HNSW({ M: 4, efConstruction: 40, seed: 7 });
    pts.forEach(p => g.add(p));
    const links = [];
    g.links.forEach((ls, u) => { for (const v of ls[0]) if (u < v || !g.links[v][0].includes(u)) links.push([u, v]); });
    // One traced search, ready to draw.
    const K = 5, EF = 12;
    function searchFrom(q) {
      const res = g.search(q, K, EF, { trace: true }), ev = res.trace.evaluated, first = new Map();
      ev.forEach((e, i) => { if (!first.has(e.id)) first.set(e.id, i); });
      const path = res.trace.path, at = path.map(id => (id === g.entry ? -1 : first.get(id)));
      return { q, ev, path, at, found: res.ids, exact: res.ids.every(id => g.bruteForce(q, K).includes(id)),
               upHops: path.filter((id, j) => j > 0 && ev[at[j]].layer > 0).length };
    }
    // The looping examples: queries the search answers exactly, far enough from
    // the entry to show both phases.
    const runs = [];
    for (let t = 0; t < 80 && runs.length < 8; t++) {
      const run = searchFrom([0.1 + r() * 0.8, 0.1 + r() * 0.8]);
      if (run.exact && run.upHops >= 1 && run.path.length >= 4) runs.push(run);
    }

    let view = hidpi(live), C = {};
    const tokens = () => { C = { ink: css('--ink'), ink2: css('--ink-2'), ink3: css('--ink-3'), edge: css('--edge'), accent: css('--accent'), amber: css('--amber'), surface: css('--surface') }; };
    tokens();
    const X = p => 16 + p[0] * (view.w - 32), Y = p => 16 + p[1] * (view.h - 32);
    const seg = (ctx, a, b, k = 1) => { ctx.moveTo(X(a), Y(a)); ctx.lineTo(X(a) + (X(b) - X(a)) * k, Y(a) + (Y(b) - Y(a)) * k); };

    // One query's frame at time t (seconds): query in, the walk event by event, rings, fade.
    const WALK = 3.2, HOLD = 1.8, FADE = 0.5, span = 0.5 + WALK + 0.5 + HOLD + FADE;
    function draw(run, t) {
      const { ctx, w, h } = view;
      ctx.clearRect(0, 0, w, h);
      ctx.strokeStyle = C.edge; ctx.lineWidth = 1;
      ctx.beginPath(); for (const [a, b] of links) seg(ctx, pts[a], pts[b]); ctx.stroke();
      const fade = Math.max(0, Math.min(1, (span - t) / FADE));
      const p = Math.max(0, Math.min(1, (t - 0.5) / WALK)) * run.ev.length;
      // what the search compared, in a light wash
      for (const up of [true, false]) {
        ctx.strokeStyle = alpha(up ? C.amber : C.accent, 0.28 * fade); ctx.lineWidth = 1.2;
        ctx.beginPath();
        for (let i = 0; i < p; i++) if ((run.ev[i].layer > 0) === up) seg(ctx, pts[run.ev[i].from], pts[run.ev[i].id]);
        ctx.stroke();
      }
      // points; the ones that also live on upper layers are drawn larger
      for (let i = 0; i < pts.length; i++) {
        const lv = g.level[i];
        ctx.beginPath(); ctx.arc(X(pts[i]), Y(pts[i]), lv >= 2 ? 4 : lv ? 3 : 2.2, 0, Math.PI * 2);
        ctx.fillStyle = lv >= 2 ? C.ink2 : lv ? C.ink3 : alpha(C.ink3, 0.7); ctx.fill();
      }
      // the walk: upper-layer jumps in amber, bottom-layer steps in blue
      for (let j = 1; j < run.path.length; j++) {
        const e = run.at[j];
        if (e >= p) break;
        const up = run.ev[e].layer > 0;
        ctx.strokeStyle = alpha(up ? C.amber : C.accent, fade); ctx.lineWidth = up ? 3 : 2.6;
        ctx.beginPath(); seg(ctx, pts[run.path[j - 1]], pts[run.path[j]]); ctx.stroke();
        ctx.beginPath(); ctx.arc(X(pts[run.path[j]]), Y(pts[run.path[j]]), 4, 0, Math.PI * 2);
        ctx.fillStyle = alpha(up ? C.amber : C.accent, fade); ctx.fill();
      }
      // the entry point, on the top layer
      const ex = X(pts[g.entry]), ey = Y(pts[g.entry]);
      ctx.beginPath(); ctx.arc(ex, ey, 5.5, 0, Math.PI * 2); ctx.fillStyle = C.ink; ctx.fill();
      ctx.font = `600 11px ${css('--mono') || 'monospace'}`; ctx.fillStyle = C.ink2; ctx.textAlign = 'center';
      ctx.fillText('entry', ex, ey - 11);
      // the five nearest, once the walk is done
      const ringK = Math.max(0, Math.min(1, (t - 0.5 - WALK) / 0.5)) * fade;
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

    let idx = 0, current = runs[0], start = null, raf = 0, visible = true;
    const still = () => { if (current) draw(current, span - FADE - 0.01); };
    function frame(now) {
      if (start == null) start = now;
      let t = (now - start) / 1000;
      if (t > span) { idx = (idx + 1) % runs.length; current = runs[idx]; start = now; t = 0; }
      draw(current, t);
      raf = requestAnimationFrame(frame);
    }
    const play = () => { cancelAnimationFrame(raf); start = null; if (!current || reduced() || !visible || document.hidden) { still(); return; } raf = requestAnimationFrame(frame); };
    // A click searches from that spot; the examples carry on afterwards.
    live.addEventListener('click', e => {
      const box = live.getBoundingClientRect();
      const x = (e.clientX - box.left) * view.w / box.width, y = (e.clientY - box.top) * view.h / box.height;
      const clamp = v => Math.max(0.02, Math.min(0.98, v));
      current = searchFrom([clamp((x - 16) / (view.w - 32)), clamp((y - 16) / (view.h - 32))]);
      play();
    });
    if ('IntersectionObserver' in window) new IntersectionObserver(es => { visible = es[0].isIntersecting; play(); }).observe(live);
    document.addEventListener('visibilitychange', play);
    window.addEventListener('resize', () => { view = hidpi(live); still(); });
    document.addEventListener('themechange', () => { tokens(); still(); });
    still();
    play();
  }

  // ---- the demo, opened over the page at full size and loaded on first open;
  // a narrow screen, or a click meant for a new tab, follows the link instead ----
  let overlay = null, lastFocus = null;
  function closeDemo() {
    if (!overlay || overlay.hidden) return;
    overlay.hidden = true;
    root.classList.remove('locked');
    if (lastFocus) lastFocus.focus();
  }
  function openDemo(href) {
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'demo-overlay';
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-modal', 'true');
      overlay.setAttribute('aria-label', 'Interactive demo');
      overlay.innerHTML = `<div class="bar"><span>Interactive demo</span><span class="bar-acts"><a href="${href}" target="_blank" rel="noopener">Open in a new tab</a><button type="button" class="close" aria-label="Close the demo"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></span></div><iframe title="Interactive research demo" src="${href}"></iframe>`;
      document.body.appendChild(overlay);
      overlay.querySelector('.close').addEventListener('click', closeDemo);
      overlay.addEventListener('click', e => { if (e.target === overlay) closeDemo(); });
      // Escape pressed inside the demo closes it too (same site, so the frame can be listened to).
      overlay.querySelector('iframe').addEventListener('load', e => {
        try { e.target.contentWindow.addEventListener('keydown', k => { if (k.key === 'Escape') closeDemo(); }); } catch (err) { /* another origin: the close button still works */ }
      });
    }
    lastFocus = document.activeElement;
    overlay.hidden = false;
    root.classList.add('locked');
    overlay.querySelector('.close').focus();
  }
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeDemo(); });
  document.querySelectorAll('[data-demo]').forEach(a => a.addEventListener('click', e => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || window.innerWidth < 760) return;
    e.preventDefault();
    openDemo(a.getAttribute('href'));
  }));

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
  document.addEventListener('themechange', glyphs);
})();
