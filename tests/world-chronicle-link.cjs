const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('src/app/04-world-plot.js', 'utf8');
const end = source.indexOf('function showWorldModal(');
assert(end > 0);
const project = {
  id: 'p1', genre: '판타지', worldSettings: [],
  worldTimeline: [{ id: 'w1', title: '전쟁', year: 3, yearLabel: '건국 3년', type: '전쟁' }],
  chronicles: [
    { id: 'c1', title: '피난', worldEventId: 'w1' },
    { id: 'c2', title: '배신', worldEventId: 'w1' },
    { id: 'c3', title: '귀환', worldEventId: '' }
  ]
};
const main = { innerHTML: '' };
const calls = [];
let saved = 0;
const context = vm.createContext({
  window: {},
  getProject: () => project,
  getWorldCats: () => ['기타'],
  esc: value => String(value),
  uid: () => 'new-id',
  autoSave: () => saved++,
  closeModal() {}, toast() {},
  navigate: tab => calls.push(['navigate', tab]),
  showChronicleModal: id => calls.push(['chronicle', id]),
  setTimeout() {},
  document: { activeElement: null, getElementById: id => id === 'main' ? main : null }
});
vm.runInContext(source.slice(0, end), context);

context.renderWorld();
assert.match(main.innerHTML, /사건 일지 2건/);
assert.match(main.innerHTML, /피난/);
assert.match(main.innerHTML, /배신/);
context.openWorldChronicle(1);
assert.deepEqual(calls, [['navigate', 'chronicle'], ['chronicle', 'c2']]);

context.deleteTimeline('w1');
assert.equal(project.worldTimeline.length, 0);
assert.deepEqual(project.chronicles.map(event => event.title), ['피난', '배신', '귀환']);
assert.deepEqual(project.chronicles.map(event => event.worldEventId), ['', '', '']);
assert.equal(saved, 1);

project.worldTimeline.push({ title: '새 역사', year: 4 });
context.ensureWorldTimelineIds(project);
assert.equal(project.worldTimeline[0].id, 'new-id');
assert.equal(saved, 2);

console.log('World timeline reverse links, unlink on delete, and legacy IDs passed.');
