const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('src/app/08-features.js', 'utf8');
const start = source.indexOf('// 사건 일지');
const end = source.indexOf('// ─── 사건 일지 드래그 앤 드롭', start);
assert(start >= 0 && end > start);

const project = {
  chapters: [{ id: 'c1', title: '첫 화' }],
  arcs: [{ title: '첫 아크', scenes: [{ id: 's1', title: '첫 장면' }] }],
  characters: [],
  chronicles: [{ id: 'e1', title: '기존 사건', time: '봄', order: 10 }]
};
let modal = '';
let saved = 0;
const calls = [];
const fields = {
  'cr-time': '여름', 'cr-title': '새 사건', 'cr-desc': '설명',
  'cr-place': '도시', 'cr-importance': '★ 일반',
  'cr-chapter': 'c1', 'cr-scene': 's1', 'cr-chars': ''
};
const main = { innerHTML: '' };
const context = vm.createContext({
  getProject: () => project,
  esc: value => String(value),
  uid: () => 'e2',
  autoSave: () => saved++,
  closeModal() {}, renderChronicle() {}, toast() {},
  showModal: html => { modal = html; },
  navigate: tab => calls.push(['navigate', tab]),
  showSceneModal: (arcIndex, sceneIndex) => calls.push(['scene', arcIndex, sceneIndex]),
  setTimeout() {},
  window: { _crSortMode: 'time' },
  document: {
    getElementById: id => id === 'main' ? main : ({ value: fields[id] }),
    querySelectorAll: () => []
  }
});
vm.runInContext(source.slice(start, end), context);
context.renderChronicle();
assert.equal(project.chronicles[0].sortKey, 10);
assert.match(main.innerHTML, /작중 사건 순서 · 드래그로 변경/);
context.renderChronicle = () => {};

context.showChronicleModal('e1');
assert.match(modal, /연결된 플롯 장면/);
assert.match(modal, /첫 아크 · 첫 장면/);
assert.match(modal, /사건 발생 시점/);
assert.match(modal, /독자에게 공개되는 회차/);
assert.doesNotMatch(modal, /cr-sortkey/);
context.saveChronicle('');
assert.equal(project.chronicles[1].sceneId, 's1');
assert.equal(project.chronicles[1].chapterId, 'c1');
assert.equal(project.chronicles[1].sortKey, 20);
assert.equal(saved, 2);
context.crJumpToPlotScene('s1');
assert.deepEqual(calls, [['navigate', 'plot'], ['scene', 0, 0]]);

console.log('Chronicle scene linking, save, and plot navigation passed.');
