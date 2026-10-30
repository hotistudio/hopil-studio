const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('src/app/08-features.js', 'utf8');
const start = source.indexOf('// ─── 사건 일지 드래그 앤 드롭');
const end = source.indexOf('function renderItems()', start);
assert(start >= 0 && end > start);

const a = { id: 'a', title: '첫 사건', order: 10, sortKey: 10 };
const b = { id: 'b', title: '둘째 사건', order: 20, sortKey: 20 };
const project = { chronicles: [a, b] };
const rowA = { dataset: { evId: 'a' }, style: {} };
const rowB = { dataset: { evId: 'b' }, style: {} };
let saved = 0;
const context = vm.createContext({
  getProject: () => project,
  autoSave: () => saved++,
  renderChronicle() {},
  document: {
    querySelectorAll: selector => selector === '.ev-drag-item' ? [rowA, rowB] : []
  }
});
vm.runInContext(source.slice(start, end), context);

function dragSecondBeforeFirst(mode) {
  context.fixture = {
    evId: 'b', row: rowB, ghost: { remove() {} }, mode,
    dropTarget: { rowEl: rowA, before: true }
  };
  vm.runInContext('_evDrag = fixture; evDragCommit();', context);
}

dragSecondBeforeFirst('time');
assert.equal(a.sortKey, 20);
assert.equal(b.sortKey, 10);
assert.equal(a.order, 10);
assert.equal(b.order, 20);
assert.deepEqual(Array.from(project.chronicles, event => event.id), ['a', 'b']);

dragSecondBeforeFirst('manual');
assert.deepEqual(Array.from(project.chronicles, event => event.id), ['b', 'a']);
assert.equal(b.order, 10);
assert.equal(a.order, 20);
assert.equal(b.sortKey, 10);
assert.equal(a.sortKey, 20);
assert.equal(saved, 2);

console.log('Chronicle chronology and manual order stay independent.');
