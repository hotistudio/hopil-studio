const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('scripts/app.js', 'utf8');
function part(start, end) {
  const a = source.indexOf(start);
  const b = source.indexOf(end, a + start.length);
  assert(a >= 0 && b > a, `Missing ${start}`);
  return source.slice(a, b);
}

const focusFields = new Map([
  ['sg-term-0', { value: '새 용어' }],
  ['sg-cat-0', { value: '기타' }],
  ['sg-alias-0', { value: '' }],
  ['sg-desc-0', { value: '수정된 설명' }],
  ['sg-related-0', { value: '' }],
  ['split-rel-from', { value: '가' }],
  ['split-rel-to', { value: '나' }],
  ['split-rel-type', { value: '친구' }]
]);
const normalFields = new Map([['sg-term-0', { value: '잘못된 용어' }]]);
const focusPanel = { style: { display: 'flex' }, querySelector: selector => focusFields.get(selector.slice(5, -2)) || null };
const normalPanel = { querySelector: selector => normalFields.get(selector.slice(5, -2)) || null };
const overlay = { classList: { contains: () => true } };
let saved = 0;
let refreshed = 0;
const project = { glossary: [{ term: '옛 용어', cat: '기타' }], characters: [{name:'가'}, {name:'나'}], relations: [] };
const context = vm.createContext({
  document: { getElementById: id => ({ 'focus-ref-panel': focusPanel, 'focus-overlay': overlay, 'split-panel': normalPanel })[id] || null },
  getProject: () => project,
  window: { _glossaryPanelEdit: {} },
  state: { activeTab: 'chapters' },
  autoSave: () => saved++, updateBadges() {}, refreshSplitGlossary: () => refreshed++, refreshSplitPanel: () => refreshed++, toast() {},
  confirmDialog: (_, callback) => callback()
});
vm.runInContext(part('function splitElement(', 'function toggleSplitPanel()'), context);
assert.equal(vm.runInContext("splitElement('sg-term-0').value", context), '새 용어');

vm.runInContext(part('function saveSplitGlossary(', 'function updateSplitGlossary('), context);
vm.runInContext('saveSplitGlossary(0)', context);
assert.equal(project.glossary[0].term, '새 용어');
assert.equal(project.glossary[0].desc, '수정된 설명');

vm.runInContext(part('function addSplitRelation()', 'function renderSplitGlossary()'), context);
vm.runInContext('addSplitRelation()', context);
assert.deepEqual(JSON.parse(JSON.stringify(project.relations[0])), { from: '가', to: '나', type: '친구' });
vm.runInContext('deleteSplitRelation(0)', context);
assert.equal(project.relations.length, 0);
assert.equal(saved, 3);
assert.equal(refreshed, 3);

const classes = new Set(['hidden']);
const panel = {
  classList: { contains: value => classes.has(value), add: value => classes.add(value), remove: value => classes.delete(value) },
  style: {}, addEventListener() {}, removeEventListener() {}
};
const nodes = { 'split-panel': panel, 'split-toggle-btn': { style: {}, textContent: '' } };
const swipeContext = vm.createContext({
  window: { innerWidth: 400 },
  document: {
    getElementById: id => nodes[id] || null,
    createElement: () => ({ style: {} }),
    body: { appendChild: node => { nodes[node.id] = node; } }
  },
  renderSplitContent() {}, initAllDragScrolls() {}, setTimeout() {}
});
vm.runInContext(part('function toggleSplitPanel()', 'function switchSplitTab('), swipeContext);
vm.runInContext('toggleSplitPanel()', swipeContext);
const start = (x,y) => ({ target: { closest: () => null }, touches: [{ clientX:x, clientY:y }] });
const move = (x,y) => ({ touches: [{ clientX:x, clientY:y }] });
panel._swipeStart(start(100,100));
panel._swipeMove(move(105,150));
assert.equal(panel.style.transform, undefined);
panel._swipeEnd({ changedTouches: [{ clientX:105 }] });
assert.equal(classes.has('hidden'), false);
panel._swipeStart(start(100,100));
panel._swipeMove(move(145,104));
assert.equal(panel.style.transform, 'translateX(45px)');
panel._swipeEnd({ changedTouches: [{ clientX:190 }] });
assert.equal(classes.has('hidden'), true);

console.log('Reference panel scoping, glossary editing, in-panel relations, and swipe direction passed.');
