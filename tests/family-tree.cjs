const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('scripts/app.js', 'utf8');
const start = source.indexOf('function ftDrawEdges(');
const end = source.indexOf('function ftApplyStage(', start);
assert(start >= 0 && end > start, 'Family tree functions were not found');

const parent = { id: 'parent', name: '부모', spouses: [{ charId: 'spouse', status: 'current' }] };
const spouse = { id: 'spouse', name: '배우자', spouses: [{ charId: 'parent', status: 'current' }] };
const child = { id: 'child', name: '자녀', parents: ['parent'], lineageStatus: '서녀' };
const characters = [parent, spouse, child];
const editButton = { disabled: true, textContent: '' };
const renderedNodes = { innerHTML: '' };
const renderedEdges = { innerHTML: '' };
const nodes = characters.map(character => ({
  dataset: { charId: character.id },
  classList: { toggle() {} }
}));
let opened = null;
const context = vm.createContext({
  FT_NODE_W: 130,
  FT_NODE_H: 64,
  FT_H_GAP: 24,
  ftState: { selectedCharId: null },
  getProject: () => ({ characters }),
  ftAssignGenerations: () => new Map(),
  ftFindComponents: () => [characters],
  ftLayoutComponent: () => new Map([
    ['parent', { x: 0, y: 0 }], ['spouse', { x: 200, y: 0 }], ['child', { x: 0, y: 144 }]
  ]),
  esc: value => String(value),
  showCharModal: (index, tab) => { opened = { index, tab }; },
  document: {
    getElementById: id => ({ 'ft-edit-selected': editButton, 'ft-nodes': renderedNodes, 'ft-svg': renderedEdges })[id] || null,
    querySelectorAll: () => nodes
  }
});
vm.runInContext(source.slice(start, end), context);
vm.runInContext(source.slice(source.indexOf('function ftDrawTree()'), start), context);

context.ftDrawTree();
assert.match(renderedNodes.innerHTML, /ft-node-lineage">서녀<\/span>/);

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

context.ftDrawEdges(svg, [{ id: 'parent' }, { id: 'spouse' }, { id: 'child', parents: ['parent', 'spouse'] }], positions);
assert.match(svg.innerHTML, /<line x1="65" y1="64" x2="65" y2="104"/);
assert.match(svg.innerHTML, /<line x1="265" y1="64" x2="265" y2="104"/);
assert.match(svg.innerHTML, /<line x1="65" y1="104" x2="265" y2="104"/);
assert.match(renderedNodes.innerHTML, /width:130px;height:64px/);

// Reproduce two children with one shared parent and different other parents.
const blended = [
  { id: 'a' }, { id: 'b' }, { id: 'c' },
  { id: 'ab', parents: ['a', 'b'] }, { id: 'bc', parents: ['b', 'c'] },
  { id: 'unrelated', relations: [{ targetId: 'b', type: '내연 상대' }] }
];
const blendedPos = new Map([
  ['a', {x:0,y:0}], ['b', {x:154,y:0}], ['c', {x:308,y:0}],
  ['ab', {x:77,y:144}], ['bc', {x:231,y:144}], ['unrelated', {x:500,y:0}]
]);
const originalData = JSON.stringify(blended);
context.ftDrawEdges(svg, blended, blendedPos);
const routes = svg.innerHTML.split('<g class="ft-parent-route">').slice(1);
assert.equal(routes.length, 2, 'Additional relations must not create parent routes');
const segments = routes.map(route => [...route.matchAll(/<line x1="([^"]+)" y1="([^"]+)" x2="([^"]+)" y2="([^"]+)"/g)].map(m => m.slice(1).map(Number)));
const buses = segments.map(lines => lines.find(([x1,y1,x2,y2]) => y1 === y2 && x1 !== x2));
assert.notEqual(buses[0][1], buses[1][1], 'Different parent combinations need separate horizontal lanes');
const ports = segments.map(lines => [...new Set(lines.filter(s => s[1] === 64).map(s => s[0]))]);
assert.deepEqual(ports[0], [65, 211]);
assert.deepEqual(ports[1], [227, 373]);
assert(!ports[1].includes(65), 'The first parent must not connect to the second child');
assert.match(svg.innerHTML, /stroke="var\(--paper\)" stroke-width="7"/);
assert.equal(JSON.stringify(blended), originalData, 'Rendering must not change recorded relationships');
console.log('Blended-family buses, separate parent ports, crossing separation, and unrelated people passed.');
