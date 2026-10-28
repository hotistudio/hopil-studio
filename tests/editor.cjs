const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('scripts/app.js', 'utf8');
const start = source.indexOf('function frScrollTo()');
const end = source.indexOf('function frUpdateCount()', start);
assert(start >= 0 && end > start);

const editor = {
  value: '긴 문장'.repeat(100),
  clientHeight: 200,
  scrollHeight: 1000,
  scrollTop: 0,
  focus() {},
  setSelectionRange(start, end) { this.selection = [start, end]; }
};
const fields = { 'fr-find': { value: '문장' } };
const context = vm.createContext({
  _frCurrent: 0,
  _frMatches: [120],
  document: { getElementById: id => fields[id] || null },
  frGetEditor: () => editor,
  getTextareaCaretTop: () => 700
});
vm.runInContext(source.slice(start, end), context);
vm.runInContext('frScrollTo()', context);
assert.deepEqual(editor.selection, [120, 122]);
assert.equal(editor.scrollTop, 630);

const splitStart = source.indexOf('function setSplitPanelWidth(');
const splitEnd = source.indexOf('function initSplitPanelResize()', splitStart);
assert(splitStart >= 0 && splitEnd > splitStart);
const panel = { style: {}, closest: () => wrap };
const wrap = { clientWidth: 824 };
const list = { getBoundingClientRect: () => ({ width: 216 }) };
const layout = vm.createContext({
  window: { innerWidth: 1024 },
  document: { getElementById: id => id === 'split-panel' ? panel : list },
  localStorage: { setItem() {} },
  SPLIT_WIDTH_KEY: 'hopil_studio_reference_width'
});
vm.runInContext(source.slice(splitStart, splitEnd), layout);
vm.runInContext('setSplitPanelWidth(500)', layout);
assert.equal(panel.style.width, '308px');
assert.equal(wrap.clientWidth - 216 - 308, 300);
list.getBoundingClientRect = () => ({ width: 16 });
vm.runInContext('setSplitPanelWidth(360)', layout);
assert.equal(panel.style.width, '360px');
console.log('Find position and tablet editor width passed.');
