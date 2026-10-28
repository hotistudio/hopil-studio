const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('scripts/app.js', 'utf8');
const start = source.indexOf('const READER_STYLE_KEY');
const end = source.indexOf('function applyEditorFontSize()', start);
assert(start >= 0 && end > start);

const saved = new Map([['hopil_studio_reader_style', 'ridi']]);
const selects = [{ value: '' }, { value: '' }];
let applied = '';
const context = vm.createContext({
  localStorage: { getItem: key => saved.get(key) || null, setItem: (key, value) => saved.set(key, value) },
  document: {
    documentElement: { setAttribute: (_, value) => { applied = value; } },
    querySelectorAll: () => selects
  }
});
vm.runInContext(source.slice(start, end), context);
vm.runInContext('applyReaderStyle()', context);
assert.equal(applied, 'ridi');
assert.deepEqual(selects.map(select => select.value), ['ridi', 'ridi']);
assert.match(vm.runInContext('readerStyleOptions()', context), /value="ridi" selected/);

vm.runInContext("changeReaderStyle('naver')", context);
assert.equal(saved.get('hopil_studio_reader_style'), 'naver');
assert.equal(applied, 'naver');
vm.runInContext("changeReaderStyle('unknown')", context);
assert.equal(applied, 'naver');

const css = fs.readFileSync('styles/app.css', 'utf8');
for (const name of ['kakao', 'ridi', 'naver']) {
  assert(css.includes(`data-reader-style="${name}"`));
}
console.log('Reader style selection, persistence, and presets passed.');
