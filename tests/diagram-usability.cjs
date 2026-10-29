const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const diagram = {
  id: 'd1', nodes: [
    { id: 'a', label: '시작', x: 0, y: 0 },
    { id: 'b', label: '끝', x: 600, y: 300 }
  ], edges: []
};
const project = { diagrams: [diagram] };
const wrap = {
  clientWidth: 400, clientHeight: 240, offsetWidth: 400, offsetHeight: 240,
  style: {},
  getBoundingClientRect: () => ({ left: 100, top: 20 })
};
const stage = { style: {} };
const label = { textContent: '' };
const editButton = { disabled: true, textContent: '' };
const elements = {
  'dg-wrap': wrap, 'dg-stage': stage, 'zoom-label': label,
  'btn-edit-node': editButton,
  'node-a': { offsetWidth: 120, offsetHeight: 60 },
  'node-b': { offsetWidth: 120, offsetHeight: 60 },
  'nd-label': { value: '새 노드' }, 'nd-sub': { value: '' }
};
let saved = 0;
const math = Object.create(Math);
math.random = () => 0.5;
const context = vm.createContext({
  Math: math,
  getProject: () => project,
  document: {
    getElementById: id => elements[id] || null,
    querySelector: () => null
  },
  autoSave: () => saved++, closeModal() {}, toast() {}, uid: () => 'new'
});
vm.runInContext(fs.readFileSync('src/app/06-diagram.js', 'utf8'), context);
const state = vm.runInContext('dgState', context);
state.activeDiagramId = 'd1';

context.resetView();
assert(state.zoom < 1 && state.zoom > 0.3);
assert(Math.abs(state.pan.x - 32) < 0.1);
assert.match(stage.style.transform, /translate\(/);
assert.match(label.textContent, /%/);

diagram.nodes[1].x = 200;
diagram.nodes[1].y = 0;
diagram.edges = [{ from: 'a', to: 'b' }];
state.pan = { x: 50, y: 40 };
state.zoom = 2;
assert.equal(context.findDiagramEdgeAt(470, 120, 20), 0);
assert.equal(context.findDiagramEdgeAt(470, 190, 20), -1);

state.selectedNodeId = 'a';
context.updateDiagramSelectionToolbar();
assert.equal(editButton.disabled, false);
assert.equal(editButton.textContent, '시작 편집');
state.selectedNodeId = null;
context.updateDiagramSelectionToolbar();
assert.equal(editButton.disabled, true);

context.addNode();
assert.equal(saved, 1);
assert.equal(diagram.nodes.at(-1).x, -15);
assert.equal(diagram.nodes.at(-1).y, 10);

const wrapEvents = new Map();
const windowEvents = new Map();
const on = events => (name, handler) => events.set(name, [...(events.get(name) || []), handler]);
const dispatch = (events, name, event) => (events.get(name) || []).forEach(handler => handler(event));
wrap.addEventListener = on(wrapEvents);
elements['diagram-canvas'] = { addEventListener() {} };
context.window = { addEventListener: on(windowEvents) };
context.setupDiagramEvents();
state.pan = { x: 0, y: 0 };
state.zoom = 1;
const blank = { closest: () => null };
dispatch(wrapEvents, 'mousedown', { button: 0, target: blank, clientX: 100, clientY: 100 });
dispatch(windowEvents, 'mousemove', { clientX: 125, clientY: 110 });
assert.equal(state.pan.x, 25);
assert.equal(state.pan.y, 10);
dispatch(windowEvents, 'mouseup', {});
dispatch(wrapEvents, 'wheel', { clientX: 300, clientY: 120, deltaY: -100, preventDefault() {} });
assert(state.zoom > 1);

state.pan = { x: 0, y: 0 };
dispatch(wrapEvents, 'touchstart', { touches: [{ clientX: 140, clientY: 80 }], target: blank });
dispatch(wrapEvents, 'touchmove', { touches: [{ clientX: 155, clientY: 90 }], preventDefault() {} });
assert.equal(state.pan.x, 15);
assert.equal(state.pan.y, 10);
dispatch(wrapEvents, 'touchend', { touches: [] });

let editedEdge = -1;
context.showEditEdgeModal = index => { editedEdge = index; };
state.zoom = 1;
state.pan = { x: 0, y: 0 };
dispatch(wrapEvents, 'touchstart', { touches: [{ clientX: 260, clientY: 50 }], target: blank });
dispatch(wrapEvents, 'touchend', { touches: [] });
assert.equal(editedEdge, 0);

console.log('Diagram view fitting, edge editing, selection, node placement, and panning passed.');
