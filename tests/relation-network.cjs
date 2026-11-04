const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('scripts/app.js', 'utf8');
const start = source.indexOf('const relationNetworkState =');
const end = source.indexOf('function renderRelations(', start);
assert(start >= 0 && end > start);

const project = {
  characters: [
    { id: 'a', name: '가', role: '주인공', parents: [], spouses: [{ charId: 'b', status: 'current' }] },
    { id: 'b', name: '나', parents: [], spouses: [{ charId: 'a', status: 'current' }] },
    { id: 'c', name: '다', parents: ['a'], spouses: [], lineageStatus: '서녀' },
  ],
  relations: [
    { fromId: 'a', toId: 'c', type: '스승→제자' },
    { fromId: 'a', toId: 'missing', type: '원수' },
  ],
};
const svg = { clientWidth: 700, clientHeight: 480, innerHTML: '', setAttribute(name, value) { this[name] = value; } };
const detail = { innerHTML: '' };
const context = vm.createContext({
  getProject: () => project,
  document: { getElementById: id => ({ 'rn-svg': svg, 'rn-detail': detail })[id] || null },
  esc: value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;'),
});
vm.runInContext(source.slice(start, end), context);

const edges = vm.runInContext('relationNetworkEdges(getProject())', context);
assert.equal(edges.length, 3, 'reciprocal spouse links should draw once and missing characters should not draw');
assert.deepEqual(Array.from(edges, e => e.type).sort(), ['배우자', '부모', '스승→제자']);
const positions = vm.runInContext('relationNetworkLayout(getProject().characters, relationNetworkEdges(getProject()), 700, 480)', context);
assert.equal(positions.size, 3);
for (const pos of positions.values()) assert(Number.isFinite(pos.x) && Number.isFinite(pos.y));
const single = vm.runInContext('relationNetworkLayout([getProject().characters[0]], [], 700, 480)', context);
assert.equal(single.get('a').x, 350);
assert.equal(single.get('a').y, 240);

vm.runInContext('drawRelationNetwork()', context);
assert(svg.innerHTML.includes('스승→제자'));
assert(svg.innerHTML.includes('marker-end="url(#rn-arrow)"'));
vm.runInContext("setRelationNetworkFilter('person', 'c'); setRelationNetworkFilter('focus', true)", context);
assert(!svg.innerHTML.includes('data-id="b"'));
vm.runInContext("setRelationNetworkFilter('focus', false); setRelationNetworkFilter('person', '')", context);
assert(svg.innerHTML.includes('서녀'), 'the child birth label appears on the network node');
assert(svg.innerHTML.includes('stroke-dasharray'), 'extra relations use dashed lines');
vm.runInContext("selectRelationNetworkNode('a')", context);
assert(detail.innerHTML.includes('스승→제자'));
assert(detail.innerHTML.includes('다'));
vm.runInContext("setRelationNetworkFilter('extra', false)", context);
assert(!svg.innerHTML.includes('스승→제자'));
assert(svg.innerHTML.includes('부모'));
vm.runInContext("setRelationNetworkFilter('family', false)", context);
assert(!svg.innerHTML.includes('부모'));
vm.runInContext('zoomRelationNetwork(1.2)', context);
assert.equal(vm.runInContext('relationNetworkState.zoom', context), 1.2);
vm.runInContext('resetRelationNetworkView()', context);
assert.equal(vm.runInContext('relationNetworkState.zoom', context), 1);

console.log('Relation network family links, extra links, filtering, selection, and layout passed.');

const occupied=[{x:300,y:200,w:100,h:50}];
for(let i=0;i<10;i++){const before=occupied.slice();const point=context.placeRelationLabel(350,225,90,{width:700,height:480},occupied);assert(point);const box=occupied.at(-1);assert(!before.some(b=>box.x<b.x+b.w&&box.x+box.w>b.x&&box.y<b.y+b.h&&box.y+box.h>b.y));}
