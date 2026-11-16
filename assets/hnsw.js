// A small 2-D HNSW, shared with the research demo. Follows hnswlib and the
// unified fork (hnswalg.h): heuristic neighbour selection
// (getNeighborsByHeuristic2), M links per upper layer and 2M at layer 0,
// ef-bounded best-first search that walks through deleted points without
// returning them, slot reuse on insert (replace_deleted), and Chapter 4's
// repairs ROE, RDN and RUE. Every random draw comes from a seeded RNG so a scene
// renders the same way on every machine.
(function (root) {
  'use strict';

  function rng(seed) {
    let s = seed >>> 0;
    return function () {
      s = (s + 0x6D2B79F5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function gauss(r) {
    let u = 0;
    while (u === 0) u = r();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r());
  }

  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const byDist = (a, b) => a[0] - b[0];

  // Keep `arr` sorted ascending by [0]; arrays stay short (<= ef), so linear insert is fine.
  function insertSorted(arr, item) {
    let i = arr.length;
    while (i > 0 && arr[i - 1][0] > item[0]) i--;
    arr.splice(i, 0, item);
  }

  class HNSW {
    constructor({ M = 6, efConstruction = 48, seed = 1 } = {}) {
      this.M = M;
      this.M0 = 2 * M;
      this.efC = efConstruction;
      this.mL = 1 / Math.log(M);
      this.rand = rng(seed);
      this.pts = [];
      this.level = [];
      this.links = [];          // links[id][layer] = neighbour ids
      this.dead = [];           // marked deleted: still walked through, never returned
      this.vacant = [];         // deleted slots waiting for reuse, oldest first
      this.ndead = 0;
      this.entry = -1;
      this.maxLevel = -1;
      this.ndist = 0;           // distance computations, for step counts
    }

    get size() { return this.pts.length; }
    cap(layer) { return layer === 0 ? this.M0 : this.M; }

    d(q, id) { this.ndist++; return dist(q, this.pts[id]); }

    randomLevel() { return Math.floor(-Math.log(1 - this.rand()) * this.mL); }

    // A deep copy, so two update runs can start from the same graph.
    clone() {
      const g = Object.assign(Object.create(HNSW.prototype), this);
      g.pts = this.pts.slice();
      g.level = this.level.slice();
      g.dead = this.dead.slice();
      g.vacant = this.vacant.slice();
      g.links = this.links.map(ls => ls.map(l => l.slice()));
      g.rand = rng(this.size * 7919 + 17);
      return g;
    }

    // Greedy descent on an upper layer (hnswlib's searchKnn / addPoint loop).
    greedy(q, ep, layer, tr) {
      let cur = ep, cd = this.d(q, ep), changed = true;
      while (changed) {
        changed = false;
        for (const n of this.links[cur][layer]) {
          const dn = this.d(q, n);
          if (tr) {
            tr.evaluated.push({ layer, id: n, from: cur });
            if (!tr.parent.has(n)) tr.parent.set(n, cur);
          }
          if (dn < cd) { cd = dn; cur = n; changed = true; }
        }
      }
      return cur;
    }

    // Best-first search on one layer (searchBaseLayer / searchBaseLayerST).
    // Deleted points are expanded but never enter the result list, and with
    // deletions present the search keeps going until it holds ef live results.
    searchLayer(q, eps, ef, layer, tr) {
      const seen = new Set(eps);
      const cand = [], res = [];
      for (const e of eps) {
        const de = this.d(q, e);
        insertSorted(cand, [de, e]);
        if (!this.dead[e]) insertSorted(res, [de, e]);
      }
      while (res.length > ef) res.pop();
      while (cand.length) {
        const [dc, c] = cand.shift();
        const worst = res.length ? res[res.length - 1][0] : Infinity;
        if (dc > worst && (res.length >= ef || !this.ndead)) break;
        if (tr) tr.expanded.push({ layer, id: c });
        for (const n of this.links[c][layer]) {
          if (seen.has(n)) continue;
          seen.add(n);
          const dn = this.d(q, n);
          if (tr) {
            tr.evaluated.push({ layer, id: n, from: c });
            if (!tr.parent.has(n)) tr.parent.set(n, c);
          }
          if (res.length < ef || dn < res[res.length - 1][0]) {
            insertSorted(cand, [dn, n]);
            if (!this.dead[n]) {
              insertSorted(res, [dn, n]);
              if (res.length > ef) res.pop();
            }
          }
        }
      }
      return res;
    }

    // getNeighborsByHeuristic2: keep a candidate only if it is closer to the
    // base than to every neighbour already kept. W is sorted by distance.
    selectNeighbors(W, M) {
      const out = [];
      for (const [dc, c] of W) {
        if (out.length >= M) break;
        let good = true;
        for (const r of out) {
          if (dist(this.pts[c], this.pts[r]) < dc) { good = false; break; }
        }
        if (good) out.push(c);
      }
      return out;
    }

    // Candidates sorted by distance to point `base`.
    ranked(base, ids) { return ids.map(x => [dist(base, this.pts[x]), x]).sort(byDist); }

    // mutuallyConnectNewElement: M links out of `id`, then a link back from each,
    // re-pruning a full list with the heuristic. A DHNSW budget {M, M0} replaces
    // both: the new point picks its own M, and the neighbour lists it joins are
    // capped at that M above layer 0 and at the constant M0 = 2*m_start on it.
    connect(id, W, layer, isUpdate, budget) {
      const pick = budget ? budget.M : this.M;
      const cap = budget ? (layer ? budget.M : budget.M0) : this.cap(layer);
      const nb = this.selectNeighbors(W, pick);
      this.links[id][layer] = nb.slice();
      for (const n of nb) {
        const ln = this.links[n][layer];
        if (isUpdate && ln.includes(id)) continue;
        if (ln.length < cap) { ln.push(id); continue; }
        this.links[n][layer] = this.selectNeighbors(this.ranked(this.pts[n], ln.concat(id)), cap);
      }
      return nb[0];
    }

    // `budget` is DHNSW's per-point {M, ef, M0} (addPoint's M_node / ef_node /
    // M0_node); without it the insertion is upstream's.
    add(p, forcedLevel, budget) {
      const id = this.pts.length;
      const L = forcedLevel != null ? forcedLevel : this.randomLevel();
      this.pts.push(p);
      this.level.push(L);
      this.dead.push(0);
      this.links.push(Array.from({ length: L + 1 }, () => []));
      if (this.entry < 0) { this.entry = id; this.maxLevel = L; return id; }

      let ep = this.entry;
      for (let l = this.maxLevel; l > L; l--) ep = this.greedy(p, ep, l);
      for (let l = Math.min(L, this.maxLevel); l >= 0; l--) {
        const W = this.searchLayer(p, [ep], budget ? budget.ef : this.efC, l);
        if (W.length) ep = this.connect(id, W, l, false, budget);
      }
      if (L > this.maxLevel) { this.maxLevel = L; this.entry = id; }
      return id;
    }

    markDelete(id) {
      if (this.dead[id]) return;
      this.dead[id] = 1;
      this.ndead++;
      this.vacant.push(id);
    }

    // addPoint(replace_deleted=true): reuse the oldest vacant slot. updatePoint
    // re-picks the links of the slot's old neighbours from their 1- and 2-hop
    // candidates (which include the slot, now holding the new vector), then
    // repairConnectionsForUpdate links the slot in from the entry point.
    // Links that other points held into the slot are left as they were.
    replace(p) {
      if (!this.vacant.length) return this.add(p);
      const id = this.vacant.shift();
      this.dead[id] = 0;
      this.ndead--;
      this.pts[id] = p;
      for (let l = 0; l <= this.level[id]; l++) {
        const one = this.links[id][l];
        if (!one.length) continue;
        const cand = new Set([id]);
        for (const a of one) {
          cand.add(a);
          for (const b of this.links[a][l]) cand.add(b);
        }
        for (const nb of one) {
          const C = this.ranked(this.pts[nb], [...cand].filter(c => c !== nb)).slice(0, this.efC);
          this.links[nb][l] = this.selectNeighbors(C, this.cap(l));
        }
      }
      let cur = this.entry;
      for (let l = this.maxLevel; l > this.level[id]; l--) cur = this.greedy(p, cur, l);
      for (let l = this.level[id]; l >= 0; l--) {
        const W = this.searchLayer(p, [cur], this.efC, l).filter(x => x[1] !== id);
        if (W.length) cur = this.connect(id, W, l, true);
      }
      return id;
    }

    // ROE (removeObsoleteEdges): live points drop their links into `ids`, unless
    // a list would be left with no live neighbour at all. Returns [from, to, layer].
    removeObsoleteEdges(ids) {
      const del = new Set(ids), removed = [];
      for (let u = 0; u < this.size; u++) {
        if (this.dead[u]) continue;
        for (let l = 0; l <= this.level[u]; l++) {
          const L = this.links[u][l];
          const keep = L.filter(v => !del.has(v));
          if (!L.length || keep.length < 1) continue;
          for (const v of L) if (del.has(v)) removed.push([u, v, l]);
          this.links[u][l] = keep;
        }
      }
      return removed;
    }

    // Directed BFS components over all layers, started from each unvisited live
    // point in id order (findAllComponents).
    components() {
      const seen = new Uint8Array(this.size), comps = [];
      for (let s = 0; s < this.size; s++) {
        if (this.dead[s] || seen[s]) continue;
        const comp = [s], queue = [s];
        seen[s] = 1;
        while (queue.length) {
          const v = queue.shift();
          for (let l = 0; l <= this.level[v]; l++)
            for (const u of this.links[v][l])
              if (!this.dead[u] && !seen[u]) { seen[u] = 1; comp.push(u); queue.push(u); }
        }
        comps.push(comp);
      }
      return comps;
    }

    // RDN (repairDisconnectedNodes): every point in a component smaller than half
    // the live graph asks nearby points for incoming links, on each of its layers.
    // Returns the links added as [from, to, layer].
    repairDisconnectedNodes() {
      const live = this.size - this.ndead, added = [];
      for (const comp of this.components()) {
        if (comp.length >= live / 2) continue;
        for (const v of comp)
          for (let l = 0; l <= this.level[v]; l++) this.fillIncoming(v, l, added);
      }
      return added;
    }

    // attemptLimitedHopRepairFillM: BFS out along v's own links; each point met
    // that has a free slot links to v. At least three hops, then stop on the first
    // hop that gained a link, or once v counts cap(layer) links.
    fillIncoming(v, l, added) {
      const cap = this.cap(l);
      let deg = this.links[v][l].length;
      if (deg >= cap) return;
      const seen = new Uint8Array(this.size);
      seen[v] = 1;
      let frontier = [v], hop = 0;
      while (frontier.length && deg < cap) {
        hop++;
        let gained = false;
        const next = [];
        for (const u of frontier) {
          if (deg >= cap) break;
          for (const c of this.links[u][l]) {
            if (deg >= cap) break;
            if (c === v || seen[c] || this.dead[c]) continue;
            seen[c] = 1;
            next.push(c);
            const L = this.links[c][l];
            if (L.includes(v)) { gained = true; deg++; continue; }
            if (L.length < cap) { L.push(v); added.push([c, v, l]); gained = true; deg++; }
          }
        }
        if (hop >= 3 && gained) break;
        frontier = next;
      }
    }

    // RUE (resolveEdgeAsymmetry): on layer 0, give each one-way link u -> v its
    // reverse v -> u (addIncomingEdgeIfPossible). Returns the links added.
    resolveEdgeAsymmetry() {
      const added = [];
      for (let u = 0; u < this.size; u++) {
        if (this.dead[u]) continue;
        for (const v of this.links[u][0].slice()) {
          if (this.dead[v] || this.links[v][0].includes(u)) continue;
          const L = this.links[v][0];
          if (L.length < this.M0) { L.push(u); added.push([v, u, 0]); continue; }
          const sel = this.selectNeighbors(this.ranked(this.pts[v], L.concat(u)), this.M0);
          this.links[v][0] = sel;
          if (sel.includes(u)) added.push([v, u, 0]);
        }
      }
      return added;
    }

    // Live points a search can reach from the entry point, through any layer.
    reachable() {
      const seen = new Uint8Array(this.size), stack = [this.entry];
      seen[this.entry] = 1;
      while (stack.length) {
        const v = stack.pop();
        for (let l = 0; l <= this.level[v]; l++)
          for (const u of this.links[v][l]) if (!seen[u]) { seen[u] = 1; stack.push(u); }
      }
      for (let i = 0; i < this.size; i++) if (this.dead[i]) seen[i] = 0;
      return seen;
    }

    // k nearest by graph search. With `trace`, also returns what was expanded and
    // the chain of links from the entry point to the best result.
    search(q, k, ef, { trace = false } = {}) {
      const tr = trace ? { expanded: [], evaluated: [], parent: new Map([[this.entry, -1]]) } : null;
      const before = this.ndist;
      let ep = this.entry;
      for (let l = this.maxLevel; l > 0; l--) ep = this.greedy(q, ep, l, tr);
      const W = this.searchLayer(q, [ep], Math.max(ef, k), 0, tr);
      const ids = W.slice(0, k).map(x => x[1]);
      const out = { ids, ndist: this.ndist - before };
      if (tr) {
        const path = [];
        for (let v = ids[0]; v !== -1 && v !== undefined; v = tr.parent.get(v)) path.push(v);
        tr.path = path.reverse();
        out.trace = tr;
      }
      return out;
    }

    // CAMP-HNSW's mining (ours_backend.cpp mine_and_filter_cpp): for each
    // training query, pair every retrieved point with every true neighbour the
    // search missed, both ways; then each point keeps at most `budget` of its
    // candidates (the closest 2*budget, filtered by the RNG heuristic).
    // Returns [src, dst] pairs.
    mineShortcuts(queries, k, ef, budget, detail) {
      const cand = new Map();
      const push = (a, b) => { if (!cand.has(a)) cand.set(a, new Set()); cand.get(a).add(b); };
      for (const q of queries) {
        const found = this.search(q, k, ef).ids;
        const got = new Set(found);
        const missing = this.bruteForce(q, k).filter(id => !got.has(id));
        for (const h of found) for (const m of missing) if (h !== m) { push(h, m); push(m, h); }
      }
      if (detail) {   // every candidate link before filtering, once per unordered pair
        detail.cand = [];
        for (const [i, set] of cand) for (const j of set) if (i < j) detail.cand.push([i, j]);
      }
      const pairs = [];
      for (const [i, set] of cand) {
        const C = this.ranked(this.pts[i], [...set]).slice(0, 2 * budget);
        for (const t of this.selectNeighbors(C, budget)) pairs.push([i, t]);
      }
      return pairs;
    }

    // injectShortcuts (hnswalg.h): on every layer both ends share, add dst to
    // src's list and let it compete with the existing links under the RNG
    // heuristic (joint competitive pruning). Returns the pairs that survived on
    // layer 0.
    injectShortcuts(pairs) {
      const kept = [];
      for (const [src, dst] of pairs) {
        const common = Math.min(this.level[src], this.level[dst]);
        for (let l = 0; l <= common; l++) {
          const L = this.links[src][l];
          if (L.includes(dst)) continue;
          this.links[src][l] = this.selectNeighbors(this.ranked(this.pts[src], L.concat(dst)), this.cap(l));
          if (l === 0 && this.links[src][0].includes(dst)) kept.push([src, dst]);
        }
      }
      return kept;
    }

    bruteForce(q, k) {
      const out = [];
      for (let i = 0; i < this.size; i++) if (!this.dead[i]) out.push([dist(q, this.pts[i]), i]);
      return out.sort(byDist).slice(0, k).map(x => x[1]);
    }

    recall(queries, k, ef) {
      let hit = 0;
      for (const q of queries) {
        const truth = new Set(this.bruteForce(q, k));
        for (const id of this.search(q, k, ef).ids) if (truth.has(id)) hit++;
      }
      return hit / (queries.length * k);
    }
  }

  // DHNSW's parameter adaptation (unified/density.py). density: mean distance to
  // the k nearest neighbours (large = sparse; the paper first projects to dim/3,
  // which a 2-D demo skips). budgets: the coefficient of variation times lambda
  // opens [m_start, m_end] and [ef_start, ef_end] around the vanilla values, and
  // each point sits in that range by its min-max position, sparse points high.
  function densities(pts, k = 16) {
    return pts.map(p => {
      const d = pts.map(q => dist(p, q)).sort((a, b) => a - b).slice(1, k + 1);
      return d.reduce((a, b) => a + b, 0) / d.length;
    });
  }
  // `paperDirection` follows the paper's text (denser point -> larger M and ef);
  // without it the code's behaviour (larger mean distance -> larger M) is kept.
  function budgets(dens, { mVanilla, efVanilla, lambda = 1.5, paperDirection = false }) {
    const mean = dens.reduce((a, b) => a + b, 0) / dens.length;
    const cv = Math.sqrt(dens.reduce((a, b) => a + (b - mean) ** 2, 0) / dens.length) / mean;
    const delta = cv * lambda;
    const mStart = Math.max(2, Math.trunc(mVanilla - mVanilla * delta)), mEnd = Math.trunc(mVanilla + mVanilla * delta);
    const efStart = Math.max(10, Math.trunc(efVanilla - efVanilla * delta)), efEnd = Math.trunc(efVanilla + efVanilla * delta);
    const lo = Math.min(...dens), hi = Math.max(...dens), span = hi - lo;
    const per = dens.map(d => {
      const f0 = span ? (d - lo) / span : 0, f = paperDirection ? 1 - f0 : f0;
      return { M: Math.trunc(Math.min(mEnd, Math.max(mStart, mStart + f * (mEnd - mStart)))),
               ef: Math.trunc(Math.min(efEnd, Math.max(efStart, efStart + f * (efEnd - efStart)))),
               M0: 2 * mStart };
    });
    return { cv, delta, mStart, mEnd, efStart, efEnd, per };
  }

  // Blue-noise samples from a density: dart throwing with a minimum spacing,
  // so points never pile on each other at demo zoom levels.
  function sample(r, n, draw, minGap, maxTries = 60) {
    const pts = [];
    const cell = minGap / Math.SQRT2;
    const grid = new Map();
    const key = (x, y) => Math.floor(x / cell) + ',' + Math.floor(y / cell);
    for (let t = 0; pts.length < n && t < n * maxTries; t++) {
      const p = draw(r);
      if (!p) continue;
      const gx = Math.floor(p[0] / cell), gy = Math.floor(p[1] / cell);
      let ok = true;
      for (let dx = -2; dx <= 2 && ok; dx++)
        for (let dy = -2; dy <= 2 && ok; dy++) {
          const q = grid.get((gx + dx) + ',' + (gy + dy));
          if (q && dist(p, q) < minGap) ok = false;
        }
      if (!ok) continue;
      grid.set(key(p[0], p[1]), p);
      pts.push(p);
    }
    return pts;
  }

  // Clustered density over [0, aspect] x [0, 1]: k Gaussian blobs plus a uniform share.
  function mixture(r, aspect, k, spread, uniform) {
    const cs = Array.from({ length: k }, () => [0.12 + r() * (aspect - 0.24), 0.14 + r() * 0.72, spread[0] + r() * spread[1]]);
    return rr => {
      if (rr() < uniform) return [0.03 + rr() * (aspect - 0.06), 0.04 + rr() * 0.92];
      const c = cs[Math.floor(rr() * cs.length)];
      const p = [c[0] + gauss(rr) * c[2], c[1] + gauss(rr) * c[2]];
      return p[0] > 0.03 && p[0] < aspect - 0.03 && p[1] > 0.04 && p[1] < 0.96 ? p : null;
    };
  }

  function shuffle(r, a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  root.HN = { rng, gauss, dist, HNSW, sample, mixture, shuffle, densities, budgets };
})(window);
