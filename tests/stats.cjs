const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('scripts/app.js', 'utf8');
const start = source.indexOf('function getTodayStr(');
const end = source.indexOf('function recordDailyWriting(', start);
assert(start >= 0 && end > start);

const store = new Map();
const context = vm.createContext({
  STATS_KEY: 'hopil_studio_writing_stats',
  TYPING_STATS_KEY: 'hopil_studio_typing_stats',
  localStorage: {
    getItem: key => store.get(key) || null,
    setItem: (key, value) => store.set(key, value)
  },
  loadTypingStats: () => JSON.parse(store.get('hopil_studio_typing_stats') || '{}'),
  toast() {}, Date
});
vm.runInContext(source.slice(start, end), context);

assert.equal(vm.runInContext('getTodayStr(new Date(2026, 9, 28, 0, 30))', context), '2026-10-28');
assert.equal(vm.runInContext("writtenCharDelta('글', '글자', {inputType:'insertText'})", context), 1);
assert.equal(vm.runInContext("writtenCharDelta('글', '글자', {inputType:'insertFromPaste'})", context), 0);
assert.equal(vm.runInContext("writtenCharDelta('글', '글자', {inputType:'historyRedo'})", context), 0);

store.set('hopil_studio_writing_stats', JSON.stringify({ p1: { '2026-10-28': 123 } }));
store.set('hopil_studio_typing_stats', JSON.stringify({ p1: { '2026-10-28': 45 } }));
const backup = vm.runInContext("JSON.stringify(projectBackup({id:'p1',title:'작품'}))", context);
const parsed = JSON.parse(backup);
assert.equal(parsed.project.title, '작품');
assert.equal(parsed.writingStats.p1['2026-10-28'], 123);
assert.equal(parsed.typingStats.p1['2026-10-28'], 45);

store.clear();
context.backup = parsed;
vm.runInContext("restoreStats(backup, ['p1'])", context);
assert.equal(JSON.parse(store.get('hopil_studio_writing_stats')).p1['2026-10-28'], 123);
assert.equal(JSON.parse(store.get('hopil_studio_typing_stats')).p1['2026-10-28'], 45);
vm.runInContext("restoreStats({project:{id:'p1'}}, ['p1'])", context);
assert.equal(JSON.parse(store.get('hopil_studio_writing_stats')).p1['2026-10-28'], 123);

const importStart = source.indexOf('function importData(e)');
const importEnd = source.indexOf('// NAVIGATION', importStart);
assert(importStart >= 0 && importEnd > importStart);
context.state = { projects: [] };
context.fileHandles = { all: null, projects: {} };
context.validateImportFile = () => {};
context.validateImportedProject = value => value;
context.saveToStorage = () => true;
context.renderHome = () => {};
context.uid = () => 'new-id';
context.FileReader = class {
  readAsText(file) { this.onload({ target: { result: file.text } }); }
};
vm.runInContext(source.slice(importStart, importEnd), context);
store.clear();
context.importEvent = { target: { files: [{ text: backup }], value: 'backup.json' } };
vm.runInContext('importData(importEvent)', context);
assert.equal(context.state.projects[0].title, '작품');
assert.equal(JSON.parse(store.get('hopil_studio_writing_stats')).p1['2026-10-28'], 123);
assert.equal(context.importEvent.target.value, '');

console.log('Statistics dates, input counting, and backup restoration passed.');
