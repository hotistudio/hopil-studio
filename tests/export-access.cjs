const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const manuscript = fs.readFileSync('src/app/07-memo-manuscript.js', 'utf8');
const editor = fs.readFileSync('src/app/05-editor-schedule.js', 'utf8');
function section(source, start, end) {
  const a = source.indexOf(start);
  const b = source.indexOf(end, a + start.length);
  assert(a >= 0 && b > a, `Missing ${start}`);
  return source.slice(a, b);
}
const project = { title: '작품', chapters: [{ id: 'ch-1', title: '첫 화', content: '본문' }] };
const main = { innerHTML: '' };
let modal = '';
const context = vm.createContext({
  getProject: () => project,
  getMsConfig: () => ({ presetId: 'kakao' }),
  MS_PRESETS: [{ id: 'kakao', icon: '📖', name: '기본', desc: '', width: 480, size: 16, line: 1.8 }],
  document: { getElementById: id => id === 'main' ? main : null },
  updateMsPreview() {}, showModal: html => { modal = html; },
  esc: value => String(value), selOpts: () => '', readerStyleOptions: () => '', CH_STATUSES: [],
});
vm.runInContext(section(manuscript, 'function renderManuscript(', 'function selectMsPreset('), context);
vm.runInContext(section(manuscript, 'function showExportModal(', '// 커스텀 확인 모달'), context);
vm.runInContext(section(editor, 'function renderEditorContent(', 'const SPLIT_WIDTH_KEY'), context);

context.renderManuscript();
assert.match(main.innerHTML, /onclick="showExportModal\(\)"[^>]*>📤 원고 내보내기/);
assert.match(context.renderEditorContent(project.chapters[0]), /onclick="showChExportMenu\('ch-1'\)"[^>]*>📤 내보내기/);
context.showExportModal();
assert.match(modal, /한글 파일 \(HWPX\) 저장/);
assert(modal.indexOf('한글 파일 (HWPX) 저장') < modal.indexOf('📋 클립보드 복사'));
context.showChExportMenu('ch-1');
assert.match(modal, /한글 파일 \(HWPX\) 저장/);
console.log('Manuscript and editor export entry points passed.');
