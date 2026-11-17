'use strict';
// 울타리 잇기 화면 동작: 판 그리기, 입력, 되돌리기, 저장, 타이머
(() => {
  const L = window.FenceLogic;
  const STORAGE_KEY = 'fence-loop:v1';
  const S = 40, M = 20; // SVG 안에서 칸 크기와 바깥 여백
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const EMPTY = 0, LINE = 1, CROSS = 2;

  const $ = id => document.getElementById(id);
  const board = $('board');
  const diffButtons = [...document.querySelectorAll('[data-difficulty]')];

  // 저장 형식: { difficulty, games: { easy: {puzzle, marks, elapsed, solved}, ... }, best: { easy: ms } }
  let save = loadSave();
  let game, geo, edgeEls, crossEls, clueEls, cursorEl;
  let history = [];
  let cursor = { y: 0, x: 1 };
  let startedAt = 0;

  function loadSave() {
    try {
      const data = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (data && data.games && L.DIFFICULTIES[data.difficulty]) return data;
    } catch (_) { /* 저장소를 못 쓰면 새로 시작 */ }
    return { difficulty: 'easy', games: {}, best: {} };
  }
  function persist() {
    // 지금까지 흐른 시간을 elapsed 에 옮겨 담고 시계를 다시 0부터 (여러 번 불려도 중복으로 더해지지 않게)
    if (game && !game.solved) { game.elapsed = elapsed(); startedAt = Date.now(); }
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(save)); } catch (_) { /* 사생활 보호 모드 등 */ }
  }

  function randomSeed() {
    return crypto.getRandomValues(new Uint32Array(1))[0];
  }

  // ── 시작 / 문제 바꾸기 ─────────────────────────────
  function openDifficulty(id) {
    save.difficulty = id;
    const saved = save.games[id];
    if (saved && saved.puzzle && saved.marks && saved.marks.length === L.geometry(saved.puzzle.rows, saved.puzzle.cols).E) {
      startGame(saved);
    } else {
      newPuzzle();
    }
  }

  function newPuzzle() {
    const id = save.difficulty;
    $('statusText').textContent = '문제 만드는 중…';
    // 어려움은 0.2초쯤 걸려서, 글자가 먼저 보이도록 한 박자 쉬고 만듭니다
    setTimeout(() => {
      const puzzle = L.generatePuzzle(randomSeed(), id);
      const g = L.geometry(puzzle.rows, puzzle.cols);
      save.games[id] = { puzzle, marks: new Array(g.E).fill(EMPTY), elapsed: 0, solved: false };
      startGame(save.games[id]);
      persist();
    }, 30);
  }

  function startGame(g) {
    game = g;
    geo = L.geometry(game.puzzle.rows, game.puzzle.cols);
    history = [];
    cursor = { y: 0, x: 1 };
    startedAt = Date.now();
    diffButtons.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.difficulty === save.difficulty)));
    buildBoard();
    refresh();
  }

  // ── 판 그리기 ──────────────────────────────────────
  function el(tag, attrs, parent) {
    const node = document.createElementNS(SVG_NS, tag);
    for (const k in attrs) node.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(node);
    return node;
  }

  function edgeEnds(e) {
    const { C, H } = geo;
    if (e < H) { const r = Math.floor(e / C), c = e % C; return [c, r, c + 1, r]; }
    const k = e - H, r = Math.floor(k / (C + 1)), c = k % (C + 1);
    return [c, r, c, r + 1];
  }

  function buildBoard() {
    const { R, C } = geo;
    const w = C * S + 2 * M, h = R * S + 2 * M;
    board.innerHTML = '';
    board.setAttribute('viewBox', `0 0 ${w} ${h}`);
    board.style.width = `min(100%, ${Math.round(w * 1.6)}px)`; // 작은 판이 너무 크게 늘어나지 않게

    clueEls = game.puzzle.clues.map((k, i) => {
      if (k < 0) return null;
      const t = el('text', { class: 'clue', x: M + (i % C + 0.5) * S, y: M + (Math.floor(i / C) + 0.5) * S }, board);
      t.textContent = k;
      return t;
    });
    edgeEls = []; crossEls = [];
    for (let e = 0; e < geo.E; e++) {
      const [x1, y1, x2, y2] = edgeEnds(e).map(v => M + v * S);
      edgeEls.push(el('line', { class: 'edge', x1, y1, x2, y2 }, board));
      const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2, d = 5;
      crossEls.push(el('path', { class: 'cross', d: `M${cx - d} ${cy - d}L${cx + d} ${cy + d}M${cx + d} ${cy - d}L${cx - d} ${cy + d}` }, board));
    }
    for (let r = 0; r <= R; r++) for (let c = 0; c <= C; c++) el('circle', { class: 'dot', cx: M + c * S, cy: M + r * S, r: 3.5 }, board);
    cursorEl = el('rect', { class: 'cursor', width: 16, height: 16, rx: 4 }, board);
  }

  function refresh() {
    const marks = game.marks;
    marks.forEach((m, e) => {
      edgeEls[e].classList.toggle('on', m === LINE);
      crossEls[e].classList.toggle('on', m === CROSS);
    });
    game.puzzle.clues.forEach((k, i) => {
      if (k < 0) return;
      let on = 0, decided = 0;
      for (const e of geo.cellEdges[i]) { if (marks[e] === LINE) on++; if (marks[e] !== EMPTY) decided++; }
      // 0 은 선을 안 그어도 맞으니, ✕ 로 네 변을 다 막았을 때만 흐리게
      clueEls[i].classList.toggle('ok', on === k && (k > 0 || decided === 4));
      clueEls[i].classList.toggle('wrong', on > k || (decided === 4 && on !== k));
    });
    cursorEl.setAttribute('x', M + cursor.x * S / 2 - 8);
    cursorEl.setAttribute('y', M + cursor.y * S / 2 - 8);
    board.classList.toggle('solved', game.solved);
    $('undoButton').disabled = game.solved || !history.length;
    $('resetButton').disabled = game.solved;
    $('winCard').hidden = !game.solved;
    $('statusText').textContent = game.solved ? '완성!' : `선 ${marks.filter(m => m === LINE).length}개`;
    const best = save.best[save.difficulty];
    $('bestLabel').textContent = best ? `최고 기록 ${formatTime(best)}` : '';
    updateTimer();
  }

  // ── 입력 ───────────────────────────────────────────
  // history 의 한 칸 = 한 번의 동작에서 바뀐 변들 [[변, 이전 값], ...] (드래그 한 번 = 되돌리기 한 번)
  function setMark(e, value) {
    if (game.solved || game.marks[e] === value) return;
    history.push([[e, game.marks[e]]]);
    game.marks[e] = value;
    afterChange();
  }

  function afterChange() {
    const lines = game.marks.map(m => (m === LINE ? 1 : 0));
    if (L.checkWin(game.puzzle, lines)) {
      game.elapsed = elapsed();
      game.solved = true;
      const time = game.elapsed;
      const prev = save.best[save.difficulty];
      const record = !prev || time < prev;
      if (record) save.best[save.difficulty] = time;
      $('winText').textContent = `${formatTime(time)} 만에 풀었어요.${record ? ' 최고 기록이에요! 🏅' : ''}`;
    }
    refresh();
    persist();
  }

  // 누른 곳에서 가장 가까운 변을 찾습니다 (선을 정확히 안 눌러도 됨)
  // 화면 좌표 → 판 좌표 (점 사이 간격 = 1)
  function boardPoint(event) {
    const rect = board.getBoundingClientRect();
    const vb = board.viewBox.baseVal;
    return {
      px: ((event.clientX - rect.left) * vb.width / rect.width - M) / S,
      py: ((event.clientY - rect.top) * vb.height / rect.height - M) / S,
    };
  }

  function edgeAt(event) {
    const { px, py } = boardPoint(event);
    const { R, C } = geo;
    let best = -1, bestDist = 0.45; // 칸 한가운데를 누르면 아무 변도 고르지 않음
    const hr = Math.round(py), hc = Math.floor(px);
    if (hr >= 0 && hr <= R && hc >= 0 && hc < C && Math.abs(py - hr) < bestDist) { best = geo.hEdge(hr, hc); bestDist = Math.abs(py - hr); }
    const vc = Math.round(px), vr = Math.floor(py);
    if (vc >= 0 && vc <= C && vr >= 0 && vr < R && Math.abs(px - vc) < bestDist) best = geo.vEdge(vr, vc);
    return best;
  }

  function cycle(e) {
    setMark(e, game.marks[e] === EMPTY ? CROSS : EMPTY); // 탭: 빈칸 → ✕, ✕·선 → 빈칸 (선은 드래그로만 긋기)
  }

  // 드래그: 점에서 점으로 끌면 선. 선 위에서 시작하면 지우개.
  let drag = null;          // { r, c: 마지막으로 지난 점, value: 칠할 값, batch: 이번 드래그의 변경 목록 }
  let suppressClick = false; // 드래그가 끝난 직후 따라오는 click 은 무시

  board.addEventListener('pointerdown', event => {
    if (event.button !== 0 || game.solved) return;
    drag = { r: null, c: null, value: null, batch: null };
    try { board.setPointerCapture(event.pointerId); } catch (_) { /* 판 밖으로 나가도 계속 받기 위한 것, 실패해도 드래그는 됨 */ }
  });

  board.addEventListener('pointermove', event => {
    if (!drag || game.solved) return;
    const { px, py } = boardPoint(event);
    const r = Math.round(py), c = Math.round(px);
    // 점 가까이 왔을 때만 반응 (변 한가운데서 손이 흔들려도 선이 생기지 않게)
    if (r < 0 || c < 0 || r > geo.R || c > geo.C || Math.hypot(px - c, py - r) > 0.35) return;
    if (drag.r === null || (r !== drag.r && c !== drag.c)) { drag.r = r; drag.c = c; return; } // 시작점, 또는 대각선 건너뜀
    let changed = false;
    while (drag.r !== r || drag.c !== c) { // 빨리 끌어 점을 건너뛰어도 같은 줄이면 사이 변을 모두 채움
      const nr = drag.r + Math.sign(r - drag.r), nc = drag.c + Math.sign(c - drag.c);
      const e = nr !== drag.r ? geo.vEdge(Math.min(nr, drag.r), nc) : geo.hEdge(nr, Math.min(nc, drag.c));
      if (drag.value === null) {
        drag.value = game.marks[e] === LINE ? EMPTY : LINE;
        drag.batch = [];
        history.push(drag.batch);
      }
      // 지우개는 선만 지우고 ✕ 는 그대로 둠
      if (game.marks[e] !== drag.value && (drag.value === LINE || game.marks[e] === LINE)) {
        drag.batch.push([e, game.marks[e]]);
        game.marks[e] = drag.value;
        changed = true;
      }
      drag.r = nr; drag.c = nc;
    }
    if (changed) afterChange();
  });

  const endDrag = () => {
    if (drag && drag.batch) {
      suppressClick = true;
      if (!drag.batch.length) { history.pop(); refresh(); }
    }
    drag = null;
  };
  board.addEventListener('pointerup', endDrag);
  board.addEventListener('pointercancel', endDrag);

  board.addEventListener('click', event => {
    if (suppressClick) { suppressClick = false; return; }
    const e = edgeAt(event);
    if (e >= 0) cycle(e);
  });
  board.addEventListener('contextmenu', event => {
    event.preventDefault();
    const e = edgeAt(event);
    if (e >= 0) setMark(e, game.marks[e] === CROSS ? EMPTY : CROSS);
  });

  // 키보드: 점·칸·변을 모두 밟는 반 칸 격자 위에서 커서를 움직입니다
  function cursorEdge() {
    const { y, x } = cursor;
    if ((y + x) % 2 === 0) return -1; // 점 또는 칸 가운데
    return y % 2 === 0 ? geo.hEdge(y / 2, (x - 1) / 2) : geo.vEdge((y - 1) / 2, x / 2);
  }
  board.addEventListener('keydown', event => {
    const moves = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
    const key = event.key;
    if (moves[key]) {
      const [dy, dx] = moves[key];
      cursor.y = Math.min(2 * geo.R, Math.max(0, cursor.y + dy));
      cursor.x = Math.min(2 * geo.C, Math.max(0, cursor.x + dx));
      refresh();
    } else if (key === ' ' || key === 'Enter') {
      const e = cursorEdge();
      if (e >= 0) setMark(e, game.marks[e] === LINE ? EMPTY : LINE);
    } else if (key === 'x' || key === 'X') {
      const e = cursorEdge();
      if (e >= 0) setMark(e, game.marks[e] === CROSS ? EMPTY : CROSS);
    } else return;
    event.preventDefault();
  });
  document.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); undo(); }
  });

  function undo() {
    if (game.solved || !history.length) return;
    const batch = history.pop();
    for (let i = batch.length - 1; i >= 0; i--) game.marks[batch[i][0]] = batch[i][1];
    refresh();
    persist();
  }

  $('undoButton').addEventListener('click', undo);
  $('resetButton').addEventListener('click', () => {
    if (!game.marks.some(m => m !== EMPTY) || !confirm('그은 선을 모두 지우고 처음부터 할까요?')) return;
    game.marks.fill(EMPTY);
    history = [];
    refresh();
    persist();
  });
  const askNew = () => {
    if (!game.solved && game.marks.some(m => m !== EMPTY) && !confirm('지금 문제를 그만두고 새 문제를 풀까요?')) return;
    newPuzzle();
  };
  $('newButton').addEventListener('click', askNew);
  $('winNewButton').addEventListener('click', askNew);
  diffButtons.forEach(b => b.addEventListener('click', () => {
    if (b.dataset.difficulty === save.difficulty) return;
    persist();
    openDifficulty(b.dataset.difficulty);
    persist();
  }));

  // ── 타이머 ─────────────────────────────────────────
  function elapsed() {
    if (!game) return 0;
    return game.solved ? game.elapsed : game.elapsed + (Date.now() - startedAt);
  }
  function formatTime(ms) {
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, sec = String(s % 60).padStart(2, '0');
    return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
  }
  function updateTimer() { $('timer').textContent = formatTime(elapsed()); }
  setInterval(() => { if (game && !game.solved && !document.hidden) updateTimer(); }, 1000);
  // 다른 탭에 가 있는 동안은 시간을 세지 않음
  document.addEventListener('visibilitychange', () => {
    if (!game || game.solved) return;
    if (document.hidden) persist();
    else startedAt = Date.now();
  });
  window.addEventListener('pagehide', persist);

  function toast(message) {
    const t = $('toast');
    t.textContent = message;
    t.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => { t.hidden = true; }, 2200);
  }

  try {
    openDifficulty(save.difficulty);
  } catch (err) {
    toast('문제를 불러오지 못했어요. 새 문제를 만들어요.');
    save = { difficulty: 'easy', games: {}, best: {} };
    openDifficulty('easy');
  }
})();
