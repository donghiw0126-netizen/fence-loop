'use strict';
// 울타리 잇기(슬리더링크) 규칙 — 화면과 무관한 순수 로직
// 브라우저에서는 window.FenceLogic 으로, Node.js 테스트에서는 require('./logic.js') 로 사용합니다.
//
// 규칙: 점과 점 사이를 이어 끊기지 않는 고리 하나를 만듭니다.
//       칸 안의 숫자는 그 칸의 네 변 중 선이 지나가는 변의 개수입니다.
//
// 번호 매기기 (R행 × C열 판):
//   가로 변 e = r*C + c            (r: 0..R, 칸 (r,c) 의 윗변)
//   세로 변 e = H + r*(C+1) + c    (c: 0..C, 칸 (r,c) 의 왼변), H = (R+1)*C
//   점     v = r*(C+1) + c
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FenceLogic = api;
})(typeof self !== 'undefined' ? self : this, function () {
  // keepRatio: 숫자를 이 비율 밑으로는 지우지 않음 (높을수록 쉬움)
  const DIFFICULTIES = {
    easy:   { rows: 5,  cols: 5,  keepRatio: 0.6 },
    normal: { rows: 7,  cols: 7,  keepRatio: 0.45 },
    hard:   { rows: 10, cols: 10, keepRatio: 0 },
  };
  const DIFFICULTY_IDS = Object.keys(DIFFICULTIES);
  const MAX_ATTEMPTS = 50;
  // 숫자 하나를 지울 때 풀이기가 볼 수 있는 최대 갈림길 수.
  // 이 안에 "정답 하나"가 증명돼야 지웁니다 → 생성 시간이 일정하고, 찍기가 덜 필요한 문제가 됨
  const SEARCH_BUDGET = 300;

  // ── 결정적 난수 (같은 seed → 같은 문제) ───────────────
  function makeRng(seed) { // mulberry32
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function shuffle(list, rng) {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  }

  // ── 판 모양 (크기별로 한 번만 계산) ───────────────────
  const geoCache = new Map();
  function geometry(R, C) {
    const key = R + 'x' + C;
    if (geoCache.has(key)) return geoCache.get(key);
    const H = (R + 1) * C;
    const E = H + R * (C + 1);
    const V = (R + 1) * (C + 1);
    const hEdge = (r, c) => r * C + c;
    const vEdge = (r, c) => H + r * (C + 1) + c;
    const vert = (r, c) => r * (C + 1) + c;
    const cellEdges = [];
    for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
      cellEdges.push([hEdge(r, c), hEdge(r + 1, c), vEdge(r, c), vEdge(r, c + 1)]);
    }
    const edgeVerts = [];
    const edgeCells = [];
    for (let r = 0; r <= R; r++) for (let c = 0; c < C; c++) {
      edgeVerts.push([vert(r, c), vert(r, c + 1)]);
      edgeCells.push([r > 0 ? (r - 1) * C + c : -1, r < R ? r * C + c : -1]);
    }
    for (let r = 0; r < R; r++) for (let c = 0; c <= C; c++) {
      edgeVerts.push([vert(r, c), vert(r + 1, c)]);
      edgeCells.push([c > 0 ? r * C + c - 1 : -1, c < C ? r * C + c : -1]);
    }
    const vertEdges = Array.from({ length: V }, () => []);
    edgeVerts.forEach(([a, b], e) => { vertEdges[a].push(e); vertEdges[b].push(e); });
    const g = { R, C, H, E, V, cellEdges, edgeVerts, edgeCells, vertEdges, hEdge, vEdge, vert };
    geoCache.set(key, g);
    return g;
  }

  // ── 고리 만들기: 안쪽 영역을 한 칸씩 키움 ──────────────
  // 안쪽이 한 덩어리 + 구멍 없음 + 대각선으로만 닿는 곳 없음 → 경계선이 고리 하나가 됩니다.
  function makeLoop(R, C, rng) {
    const N = R * C;
    const inside = new Uint8Array(N);
    const target = Math.floor(N * (0.45 + rng() * 0.15));
    inside[Math.floor(rng() * N)] = 1;
    let count = 1;
    while (count < target) {
      const cand = [];
      for (let i = 0; i < N; i++) {
        if (inside[i]) continue;
        const r = Math.floor(i / C), c = i % C;
        if ((r > 0 && inside[i - C]) || (r < R - 1 && inside[i + C]) ||
            (c > 0 && inside[i - 1]) || (c < C - 1 && inside[i + 1])) cand.push(i);
      }
      shuffle(cand, rng);
      const pick = cand.find(i => { inside[i] = 1; const ok = regionOk(inside, R, C, i); inside[i] = 0; return ok; });
      if (pick === undefined) break;
      inside[pick] = 1;
      count++;
    }
    const g = geometry(R, C);
    const lines = new Uint8Array(g.E);
    for (let e = 0; e < g.E; e++) {
      const [a, b] = g.edgeCells[e];
      if ((a >= 0 && inside[a] === 1) !== (b >= 0 && inside[b] === 1)) lines[e] = 1;
    }
    return lines;
  }

  function regionOk(inside, R, C, added) {
    // 새 칸 주변 네 꼭짓점에 체크무늬(대각선으로만 닿음)가 생기면 안 됨
    const r0 = Math.floor(added / C), c0 = added % C;
    for (const [dr, dc] of [[-1, -1], [-1, 0], [0, -1], [0, 0]]) {
      const r = r0 + dr, c = c0 + dc;
      if (r < 0 || c < 0 || r + 1 >= R || c + 1 >= C) continue;
      const a = inside[r * C + c], b = inside[r * C + c + 1], d = inside[(r + 1) * C + c], e = inside[(r + 1) * C + c + 1];
      if (a === e && b === d && a !== b) return false;
    }
    // 바깥 칸은 모두 판 가장자리까지 바깥 칸으로 이어져야 함 (구멍 금지)
    const N = R * C;
    const seen = new Uint8Array(N);
    const stack = [];
    for (let i = 0; i < N; i++) {
      const r = Math.floor(i / C), c = i % C;
      if (!inside[i] && (r === 0 || c === 0 || r === R - 1 || c === C - 1)) { seen[i] = 1; stack.push(i); }
    }
    while (stack.length) {
      const i = stack.pop();
      const r = Math.floor(i / C), c = i % C;
      for (const j of [r > 0 ? i - C : -1, r < R - 1 ? i + C : -1, c > 0 ? i - 1 : -1, c < C - 1 ? i + 1 : -1]) {
        if (j >= 0 && !inside[j] && !seen[j]) { seen[j] = 1; stack.push(j); }
      }
    }
    for (let i = 0; i < N; i++) if (!inside[i] && !seen[i]) return false;
    return true;
  }

  // ── 풀이기: 정답 개수를 limit 개까지 셉니다 ─────────────
  // state[e]: -1 모름, 0 선 없음, 1 선
  // maxNodes 만큼 탐색해도 끝나지 않으면 -1 (모름) 을 돌려줍니다.
  function countSolutions(R, C, clues, limit = 2, maxNodes = Infinity) {
    const g = geometry(R, C);
    const state = new Int8Array(g.E).fill(-1);
    let found = 0, nodes = 0;
    const search = (s) => {
      if (++nodes > maxNodes) { found = limit; return; }
      if (!propagate(g, clues, s)) return;
      const e = pickEdge(g, s);
      if (e < 0) { if (isSolved(g, clues, s)) found++; return; }
      for (const val of [1, 0]) {
        const next = s.slice();
        next[e] = val;
        search(next);
        if (found >= limit) return;
      }
    };
    search(state);
    return nodes > maxNodes ? -1 : found;
  }

  function setEdge(g, s, e, val, queue) {
    if (s[e] === val) return true;
    if (s[e] !== -1) return false;
    s[e] = val;
    queue.push(e);
    return true;
  }

  function propagate(g, clues, s) {
    const queue = [];
    for (let e = 0; e < g.E; e++) if (s[e] !== -1) queue.push(e);
    // 처음엔 모든 숫자 칸·점을 한 번씩 확인
    for (let i = 0; i < clues.length; i++) if (clues[i] >= 0 && !checkCell(g, clues, s, i, queue)) return false;
    for (let v = 0; v < g.V; v++) if (!checkVert(g, s, v, queue)) return false;
    for (;;) {
      while (queue.length) {
        const e = queue.pop();
        for (const v of g.edgeVerts[e]) if (!checkVert(g, s, v, queue)) return false;
        for (const c of g.edgeCells[e]) if (c >= 0 && clues[c] >= 0 && !checkCell(g, clues, s, c, queue)) return false;
      }
      const res = checkLoops(g, clues, s, queue);
      if (res === false) return false;
      if (!queue.length) return true;
    }
  }

  function checkCell(g, clues, s, i, queue) {
    const k = clues[i];
    let on = 0, unk = 0;
    for (const e of g.cellEdges[i]) { if (s[e] === 1) on++; else if (s[e] === -1) unk++; }
    if (on > k || on + unk < k) return false;
    if (unk && (on === k || on + unk === k)) {
      const val = on === k ? 0 : 1;
      for (const e of g.cellEdges[i]) if (s[e] === -1 && !setEdge(g, s, e, val, queue)) return false;
    }
    return true;
  }

  function checkVert(g, s, v, queue) {
    let on = 0, unk = 0, last = -1;
    for (const e of g.vertEdges[v]) { if (s[e] === 1) on++; else if (s[e] === -1) { unk++; last = e; } }
    if (on > 2 || (on === 1 && unk === 0)) return false;
    if (on === 2 || (on === 0 && unk === 1)) {
      for (const e of g.vertEdges[v]) if (s[e] === -1) setEdge(g, s, e, 0, queue);
    } else if (on === 1 && unk === 1) {
      setEdge(g, s, last, 1, queue);
    }
    return true;
  }

  // 선 조각들을 살펴 작은 고리가 생기지 않게 합니다.
  function checkLoops(g, clues, s, queue) {
    const comp = new Int32Array(g.V).fill(-1);
    const compEdges = [];
    let totalOn = 0;
    for (let e = 0; e < g.E; e++) if (s[e] === 1) totalOn++;
    if (!totalOn) return true;
    for (let start = 0; start < g.V; start++) {
      if (comp[start] >= 0 || !g.vertEdges[start].some(e => s[e] === 1)) continue;
      const id = compEdges.length;
      let edges = 0, ends = [];
      const stack = [start];
      comp[start] = id;
      while (stack.length) {
        const v = stack.pop();
        let deg = 0;
        for (const e of g.vertEdges[v]) {
          if (s[e] !== 1) continue;
          deg++;
          const w = g.edgeVerts[e][0] === v ? g.edgeVerts[e][1] : g.edgeVerts[e][0];
          if (comp[w] < 0) { comp[w] = id; stack.push(w); }
        }
        edges += deg;
        if (deg === 1) ends.push(v);
      }
      edges /= 2;
      compEdges.push(edges);
      if (!ends.length) { // 닫힌 고리: 이게 전부여야 함
        if (edges !== totalOn) return false;
        for (let e = 0; e < g.E; e++) if (s[e] === -1 && !setEdge(g, s, e, 0, queue)) return false;
        return true;
      }
      // 조각의 두 끝을 바로 잇는 변: 다른 선이 남아 있으면 잇지 않음
      if (ends.length === 2 && edges < totalOn) {
        for (const e of g.vertEdges[ends[0]]) {
          if (s[e] !== -1) continue;
          const [a, b] = g.edgeVerts[e];
          if (a === ends[1] || b === ends[1]) setEdge(g, s, e, 0, queue);
        }
      }
    }
    return true;
  }

  function pickEdge(g, s) {
    // 선 끝에서 뻗는 변을 먼저 고르면 탐색이 훨씬 빨라짐
    for (let v = 0; v < g.V; v++) {
      let on = 0, unk = -1;
      for (const e of g.vertEdges[v]) { if (s[e] === 1) on++; else if (s[e] === -1) unk = e; }
      if (on === 1 && unk >= 0) return unk;
    }
    for (let e = 0; e < g.E; e++) if (s[e] === -1) return e;
    return -1;
  }

  // 모든 변이 정해졌을 때: 숫자가 맞고 고리가 딱 하나인지
  function isSolved(g, clues, s) {
    return isValidLoop(g, clues, Array.from(s, x => x === 1 ? 1 : 0));
  }

  function isValidLoop(g, clues, lines) {
    for (let i = 0; i < clues.length; i++) {
      if (clues[i] < 0) continue;
      let on = 0;
      for (const e of g.cellEdges[i]) on += lines[e];
      if (on !== clues[i]) return false;
    }
    let total = 0, start = -1;
    for (let v = 0; v < g.V; v++) {
      let deg = 0;
      for (const e of g.vertEdges[v]) deg += lines[e];
      if (deg !== 0 && deg !== 2) return false;
      if (deg) start = v;
    }
    for (let e = 0; e < g.E; e++) total += lines[e];
    if (!total) return false;
    // 한 점에서 출발해 고리를 따라가며 센 변 수가 전체와 같아야 함
    let walked = 0, prev = -1, v = start;
    do {
      const e = g.vertEdges[v].find(x => lines[x] && x !== prev);
      const [a, b] = g.edgeVerts[e];
      v = a === v ? b : a;
      prev = e;
      walked++;
    } while (v !== start);
    return walked === total;
  }

  // ── 문제 만들기 ───────────────────────────────────────
  function generatePuzzle(seed, difficulty) {
    const cfg = DIFFICULTIES[difficulty];
    if (!cfg) throw new Error('알 수 없는 난이도: ' + difficulty);
    const { rows: R, cols: C } = cfg;
    const g = geometry(R, C);
    const rng = makeRng(seed);
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const lines = makeLoop(R, C, rng);
      const clues = g.cellEdges.map(es => es.reduce((n, e) => n + lines[e], 0));
      if (countSolutions(R, C, clues, 2, SEARCH_BUDGET) !== 1) continue;
      const minKeep = Math.ceil(R * C * cfg.keepRatio);
      let kept = R * C;
      for (const i of shuffle([...clues.keys()], rng)) {
        if (kept <= minKeep) break;
        const k = clues[i];
        clues[i] = -1;
        if (countSolutions(R, C, clues, 2, SEARCH_BUDGET) === 1) kept--;
        else clues[i] = k;
      }
      return { rows: R, cols: C, difficulty, seed, clues, solution: Array.from(lines) };
    }
    throw new Error('문제를 만들지 못했어요');
  }

  // 플레이어가 그은 선(1=선)이 정답인지: 정답이 하나뿐이니 규칙만 맞으면 정답
  function checkWin(puzzle, lines) {
    return isValidLoop(geometry(puzzle.rows, puzzle.cols), puzzle.clues, lines);
  }

  // 힌트: 틀린 표시가 있으면 그 변들을, 없으면 아직 안 그은 정답 선 하나를 알려 줍니다.
  // marks: 0 빈칸, 1 선, 2 ✕
  // 돌려주는 값: { type: 'mistakes', edges: [...] } | { type: 'line', edge } | null (더 알려 줄 게 없음)
  function findHint(puzzle, marks) {
    const g = geometry(puzzle.rows, puzzle.cols);
    const sol = puzzle.solution;
    const wrong = [];
    for (let e = 0; e < g.E; e++) {
      if ((marks[e] === 1 && !sol[e]) || (marks[e] === 2 && sol[e])) wrong.push(e);
    }
    if (wrong.length) return { type: 'mistakes', edges: wrong };
    // 이미 그은 선에 이어지는 선을 먼저 (엉뚱한 곳보다 덜 헷갈림), 그다음 큰 숫자 옆
    let best = -1, bestScore = -1;
    for (let e = 0; e < g.E; e++) {
      if (!sol[e] || marks[e] === 1) continue;
      let score = 0; // 그은 선과 닿은 끝 하나당 10점 + 옆 칸의 가장 큰 숫자(0~3)
      for (const v of g.edgeVerts[e]) if (g.vertEdges[v].some(x => marks[x] === 1)) score += 10;
      score += Math.max(0, ...g.edgeCells[e].map(c => (c >= 0 ? puzzle.clues[c] : 0)));
      if (score > bestScore) { best = e; bestScore = score; }
    }
    return best >= 0 ? { type: 'line', edge: best } : null;
  }

  return { DIFFICULTIES, DIFFICULTY_IDS, geometry, generatePuzzle, countSolutions, checkWin, findHint, makeRng };
});
