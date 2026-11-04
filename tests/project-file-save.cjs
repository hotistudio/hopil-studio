const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('scripts/app.js', 'utf8');
function section(startText, endText) {
  const start = source.indexOf(startText);
  const end = source.indexOf(endText, start);
  assert(start >= 0 && end > start);
  return source.slice(start, end);
}
const saveCode = section('async function saveProjectBackup(', '// exportData =');
const downloadCode = section('function _downloadJson(', '// 파일 연결 해제');
const project = { id: 'p1', title: '첫 작품', chapters: [{ content: '비어 있지 않은 원고' }] };
const backup = { project, version: '2.1' };
class MockFile {
  constructor(parts, name, options) {
    this.content = parts.join('');
    this.name = name;
    this.type = options.type;
  }
}

async function main() {
  let shared;
  let downloaded;
  const android = vm.createContext({
    project, File: MockFile, navigator: {
      userAgent: 'Mozilla/5.0 (Linux; Android 14) SamsungBrowser/27.0 Chrome/125.0 Mobile Safari/537.36', canShare: ({ files }) => files[0].content.length > 0,
      share: async payload => { shared = payload; }
    },
    projectBackup: () => backup, getTodayStr: () => '20261101',
    _downloadJson: (...args) => { downloaded = args; },
    toast() {}, console, FS_SUPPORTED: true, window: {
      showSaveFilePicker() { throw Error('Android must use share'); }
    }
  });
  vm.runInContext(saveCode, android);
  assert.equal(await vm.runInContext('saveProjectBackup(project)', android), true);
  assert.match(shared.files[0].content, /비어 있지 않은 원고/);
  assert.equal(downloaded, undefined);

  android.navigator.canShare = () => false;
  assert.equal(await vm.runInContext('saveProjectBackup(project)', android), true);
  assert.match(JSON.stringify(downloaded[0]), /비어 있지 않은 원고/);

  android.navigator.canShare = () => true;
  downloaded = undefined;
  android.navigator.share = async () => { const e = new Error('cancel'); e.name = 'AbortError'; throw e; };
  assert.equal(await vm.runInContext('saveProjectBackup(project)', android), null);
  assert.equal(downloaded, undefined, 'cancel must not trigger a second download');
  android.navigator.share = undefined;
  assert.equal(await vm.runInContext('saveProjectBackup(project)', android), true);
  assert.deepEqual(JSON.parse(JSON.stringify(downloaded[0])).project, project);

  let desktopDownload;
  const desktop = vm.createContext({
    project, navigator: { userAgent: 'Windows' },
    projectBackup: () => backup, getTodayStr: () => '20261101',
    _downloadJson: (...args) => { desktopDownload = args; },
    writeToFileHandle: async () => false,
    fileHandles: { projects: {} }, updateFileStatus() {},
    toast() {}, console, FS_SUPPORTED: true,
    window: { showSaveFilePicker: async () => ({}) }
  });
  vm.runInContext(saveCode, desktop);
  assert.equal(await vm.runInContext('saveProjectBackup(project)', desktop), true);
  assert.equal(desktop.fileHandles.projects.p1, undefined);
  assert.match(JSON.stringify(desktopDownload[0]), /비어 있지 않은 원고/);

  let blob, appended = false, clicked = false, revokedAfter;
  const anchor = {
    click() { clicked = appended; },
    remove() { appended = false; }
  };
  const download = vm.createContext({
    Blob, URL: {
      createObjectURL(value) { blob = value; return 'blob:test'; },
      revokeObjectURL() {}
    },
    document: {
      createElement: () => anchor,
      body: { appendChild() { appended = true; } }
    },
    setTimeout: (_fn, delay) => { revokedAfter = delay; }
  });
  vm.runInContext(downloadCode, download);
  vm.runInContext('_downloadJson({ project: { content: "원고" } }, "작품.json")', download);
  assert(clicked, '다운로드 링크는 문서에 붙인 뒤 눌러야 한다');
  assert(blob.size > 0);
  assert.match(await blob.text(), /원고/);
  assert.equal(revokedAfter, 60000);
  console.log('Project save payload, Android sharing, and empty-file fallback passed.');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
