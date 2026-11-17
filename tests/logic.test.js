// 게임 규칙(logic.js) 점검 — 실행: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../logic.js');

const SEEDS = 30; // 난이도마다 확인할 문제 수

test('같은 seed·난이도는 같은 문제, 다른 seed는 다른 문제', () => {
  for (const id of L.DIFFICULTY_IDS) {
    assert.deepEqual(L.generatePuzzle(7, id), L.generatePuzzle(7, id));
    assert.notDeepEqual(L.generatePuzzle(7, id).solution, L.generatePuzzle(8, id).solution);
  }
});

test('만든 문제: 크기가 맞고, 숫자가 정답과 맞고, 정답이 딱 하나', () => {
  for (const id of L.DIFFICULTY_IDS) {
    const { rows, cols } = L.DIFFICULTIES[id];
    const g = L.geometry(rows, cols);
    for (let seed = 1; seed <= SEEDS; seed++) {
      const p = L.generatePuzzle(seed, id);
      const where = `${id} seed ${seed}`;
      assert.equal(p.clues.length, rows * cols, where);
      assert.equal(p.solution.length, g.E, where);
      assert.ok(L.checkWin(p, p.solution), `${where}: 정답이 규칙에 맞지 않음`);
      p.clues.forEach((k, i) => {
        if (k >= 0) assert.equal(k, g.cellEdges[i].reduce((n, e) => n + p.solution[e], 0), where);
      });
      assert.ok(p.clues.some(k => k >= 0), where);
      assert.equal(L.countSolutions(rows, cols, p.clues, 2), 1, `${where}: 정답이 하나가 아님`);
    }
  }
});

test('판정: 고리 두 개, 갈라진 선, 선 하나 빠짐은 정답이 아님', () => {
  const g = L.geometry(5, 5);
  const square = (lines, r, c) => { // (r,c) 칸 하나를 두르는 작은 고리
    lines[g.hEdge(r, c)] = lines[g.hEdge(r + 1, c)] = lines[g.vEdge(r, c)] = lines[g.vEdge(r, c + 1)] = 1;
  };
  const noClues = { rows: 5, cols: 5, clues: new Array(25).fill(-1) };

  const one = new Array(g.E).fill(0); square(one, 0, 0);
  assert.ok(L.checkWin(noClues, one));

  const two = one.slice(); square(two, 3, 3);
  assert.ok(!L.checkWin(noClues, two), '고리 두 개');

  const branch = one.slice(); branch[g.hEdge(0, 1)] = 1;
  assert.ok(!L.checkWin(noClues, branch), '끝이 열린 선');

  const open = one.slice(); open[g.hEdge(0, 0)] = 0;
  assert.ok(!L.checkWin(noClues, open), '선 하나 빠짐');

  assert.ok(!L.checkWin(noClues, new Array(g.E).fill(0)), '아무 선도 없음');

  const wrongClue = { ...noClues, clues: noClues.clues.slice() };
  wrongClue.clues[0] = 3;
  assert.ok(!L.checkWin(wrongClue, one), '숫자와 안 맞음');
});

test('힌트: 틀린 곳이 있으면 모두 알려 주고, 없으면 그은 선에 이어지는 정답 선을 준다', () => {
  const p = L.generatePuzzle(3, 'easy');
  const g = L.geometry(p.rows, p.cols);
  const empty = new Array(g.E).fill(0);

  // 아무것도 안 그었을 때: 정답 선 하나
  const first = L.findHint(p, empty);
  assert.equal(first.type, 'line');
  assert.equal(p.solution[first.edge], 1);

  // 틀린 선 하나 + 틀린 ✕ 하나 → 둘 다 알려 줌
  const marks = empty.slice();
  const offEdge = p.solution.findIndex(v => !v);
  const onEdge = p.solution.findIndex(v => v);
  marks[offEdge] = 1;
  marks[onEdge] = 2;
  assert.deepEqual(L.findHint(p, marks), { type: 'mistakes', edges: [offEdge, onEdge].sort((a, b) => a - b) });

  // 맞는 ✕ 는 틀린 곳이 아님
  const okCross = empty.slice();
  okCross[offEdge] = 2;
  assert.equal(L.findHint(p, okCross).type, 'line');

  // 정답 선 하나를 그어 두면 다음 힌트는 그 선에 이어지는 선
  const one = empty.slice();
  one[onEdge] = 1;
  const next = L.findHint(p, one);
  assert.equal(next.type, 'line');
  const touches = g.edgeVerts[next.edge].some(v => g.edgeVerts[onEdge].includes(v));
  assert.ok(touches, '이미 그은 선과 이어진 선이어야 함');

  // 힌트만 계속 따라가면 완성되고, 그다음엔 줄 힌트가 없음
  const auto = empty.slice();
  for (let i = 0; i < g.E; i++) {
    const h = L.findHint(p, auto);
    if (!h) break;
    assert.equal(h.type, 'line');
    auto[h.edge] = 1;
  }
  assert.ok(L.checkWin(p, auto));
  assert.equal(L.findHint(p, auto), null);
});
