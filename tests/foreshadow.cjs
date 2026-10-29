const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const featureSource = fs.readFileSync('src/app/08-features.js', 'utf8');
const manuscriptSource = fs.readFileSync('src/app/07-memo-manuscript.js', 'utf8');
const platformSource = fs.readFileSync('scripts/extension-06.js', 'utf8');
function section(source, start, end) {
  const a = source.indexOf(start);
  const b = source.indexOf(end, a + start.length);
  assert(a >= 0 && b > a, `Missing ${start}`);
  return source.slice(a, b);
}

const project = {
  title: '작품',
  chapters: [
    { id: 'one', title: '첫 화', content: '시작 [[복선:열쇠]] 문장' },
    { id: 'two', title: '둘째 화', content: '언급 [[복선:열쇠]] 문장' },
    { id: 'three', title: '셋째 화', content: '다시 [[복선:열쇠]] 등장' },
  ],
  foreshadows: [{ id: 'f1', tagName: '열쇠', status: '회수완료' }],
};
let visited = '';
let downloaded;
let copied = '';
let docXml = '';
class FakeZip {
  file(name, content) { if (name === 'word/document.xml') docXml = content; }
  generateAsync() { return Promise.resolve(new Blob(['docx'])); }
}
const context = vm.createContext({
  Blob, Set, URL: { createObjectURL: blob => { downloaded = blob; return 'blob:test'; } },
  window: { JSZip: FakeZip }, JSZip: FakeZip,
  document: {
    getElementById: () => null,
    createElement: tag => tag === 'script' ? {} : { click() {} },
    head: { appendChild() {} }, body: { appendChild() {} },
  },
  navigator: { clipboard: { writeText: text => { copied = text; return Promise.resolve(); } } },
  getProject: () => project, navigate: tab => { visited = tab; },
  setTimeout: fn => fn(), toast() {}, activeChapterId: null,
  autoSave() {}, closeModal() {}, renderForeshadow() {}, uid: () => 'new-id',
});
vm.runInContext(section(featureSource, 'const FORESHADOW_TAG_RE', 'function chapterLabel('), context);
vm.runInContext(section(featureSource, 'function foreshadowJumpTo(', 'function foreshadowToggleMentions('), context);
vm.runInContext(section(manuscriptSource, 'function manuscriptExportText(', '// TXT 저장'), context);
vm.runInContext(section(manuscriptSource, 'function exportTxt(', '// DOCX 저장'), context);
vm.runInContext(section(manuscriptSource, 'function exportDocx(', '// 내보내기 모달'), context);
vm.runInContext(section(featureSource, 'function saveForeshadow(', '// 일반용 확인 다이얼로그'), context);
vm.runInContext(section(featureSource, 'function updateForeshadowHarvestOptions(', 'function saveForeshadow('), context);

const index = context.buildForeshadowIndex();
let classified = context.classifyForeshadowChapters(project.foreshadows[0], index);
assert.equal(classified.planted, 'one');
assert.equal(classified.harvested, null); // 기존 완료 기록의 마지막 등장을 회수로 추정하지 않음
assert.deepEqual(Array.from(classified.mentioned), ['two', 'three']);

const form = new Map([
  ['fs-content', '열쇠의 비밀'], ['fs-tagname', '열쇠'], ['fs-plant', ''],
  ['fs-harvest', ''], ['fs-harvest-chapter', 'two'], ['fs-status', '회수완료'],
  ['fs-importance', ''], ['fs-tags', ''], ['fs-hint', ''], ['fs-chars', ''],
]);
context.document.getElementById = id => form.has(id) ? { value: form.get(id) } : null;
context.saveForeshadow('f1');
assert.equal(project.foreshadows[0].harvestChapterId, 'two');
classified = context.classifyForeshadowChapters(project.foreshadows[0], index);
assert.equal(classified.harvested, 'two');
assert.deepEqual(Array.from(classified.mentioned), ['three']);
project.foreshadows[0].status = '미회수';
assert.equal(context.classifyForeshadowChapters(project.foreshadows[0], index).harvested, null);
project.foreshadows[0].status = '회수완료';
const harvestSelect = { innerHTML: '', value: '' };
const harvestHint = { textContent: '' };
context.chapterLabel = id => id;
context.esc = value => String(value);
context.document.getElementById = id => ({
  'fs-harvest-chapter': harvestSelect, 'fs-harvest-hint': harvestHint,
})[id] || (form.has(id) ? { value: form.get(id) } : null);
context.updateForeshadowHarvestOptions(index, '열쇠', 'two');
assert.match(harvestSelect.innerHTML, /value="two"/);
assert.equal(harvestSelect.value, 'two');
context.foreshadowJumpTo('f1', 'harvest');
assert.equal(context.activeChapterId, 'two');
assert.equal(visited, 'chapters');
context.foreshadowJumpTo('f1', 'mention', 0);
assert.equal(context.activeChapterId, 'three');

const original = project.chapters[0].content;
assert.equal(context.manuscriptExportText('앞[[복선:열쇠]]뒤'), '앞뒤');
assert.equal(context.manuscriptExportText('[[복선:미완성'), '[[복선:미완성');
const platformContext = vm.createContext({
  window: {}, document: {}, manuscriptExportText: context.manuscriptExportText,
});
vm.runInContext(platformSource.replace(/\}\)\(\);\s*$/, 'globalThis.testBuildExportText = buildExportText;\n})();'), platformContext);
const platformText = platformContext.testBuildExportText(project, 'current', 0, { paragraphSep: '\n\n' });
assert.equal(platformText.includes('[[복선:'), false);
context.copyToClipboard('one');
assert.equal(copied.includes('[[복선:'), false);
context.exportTxt();
downloaded.text().then(text => {
  assert.equal(text.includes('[[복선:'), false);
  context.exportDocx('one');
  return Promise.resolve();
}).then(() => {
  assert.equal(docXml.includes('[[복선:'), false);
  assert.equal(project.chapters[0].content, original);
  console.log('Foreshadow export, explicit harvest, and chapter jumps passed.');
}).catch(error => { throw error; });
