const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('scripts/app.js', 'utf8');
const start = source.indexOf('function ftDrawEdges(');
const end = source.indexOf('function ftApplyStage(', start);
assert(start >= 0 && end > start, 'Family tree functions were not found');

const parent = { id: 'parent', name: '부모', spouses: [{ charId: 'spouse', status: 'current' }] };
const spouse = { id: 'spouse', name: '배우자', spouses: [{ charId: 'parent', status: 'current' }] };
const child = { id: 'child', name: '자녀', parents: ['parent'] };
const characters = [parent, spouse, child];
const editButton = { disabled: true, textContent: '' };
const nodes = characters.map(character => ({
  dataset: { charId: character.id },
  classList: { toggle() {} }
}));
let opened = null;
const context = vm.createContext({
  FT_NODE_W: 130,
  FT_NODE_H: 64,
  ftState: { selectedCharId: null },
  getProject: () => ({ characters }),
  showCharModal: (index, tab) => { opened = { index, tab }; },
  document: {
    getElementById: id => id === 'ft-edit-selected' ? editButton : null,
    querySelectorAll: () => nodes
  }
});
vm.runInContext(source.slice(start, end), context);

const svg = { innerHTML: '' };
const positions = new Map([
  ['parent', { x: 0, y: 0 }],
  ['spouse', { x: 200, y: 0 }],
  ['child', { x: 0, y: 144 }]
]);
context.ftDrawEdges(svg, characters, positions);
assert.match(svg.innerHTML, /<line x1="65" y1="64" x2="65" y2="104"/);
assert.doesNotMatch(svg.innerHTML, /<line x1="165" y1="64"/);

context.ftSelectNode('child');
assert.equal(editButton.disabled, false);
assert.equal(editButton.textContent, '자녀 편집');
context.ftOpenSelectedCharModal();
assert.deepEqual(opened, { index: 2, tab: 'relation' });
context.ftSelectNode('child');
assert.equal(editButton.disabled, true);

console.log('Family tree parent edge and selected character editing passed.');
