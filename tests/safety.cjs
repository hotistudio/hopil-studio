const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('scripts/app.js', 'utf8');
function section(start, end) {
  const a = source.indexOf(start);
  const b = source.indexOf(end, a + start.length);
  assert(a >= 0 && b > a, `Missing section: ${start}`);
  return source.slice(a, b);
}

async function main() {
  const writes = [];
  const handle = {
    async createWritable() {
      return {
        async write(value) {
          if (!writes.length) await new Promise(resolve => setTimeout(resolve, 20));
          writes.push(value);
        },
        async close() {}
      };
    }
  };
  const context = vm.createContext({
    window: {}, WeakMap, Promise, console: { error() {} },
    fileHandles: { all: null, projects: { project: handle } },
    updateFileStatus() {}, toast() {}
  });
  vm.runInContext(section('const FS_SUPPORTED', 'function saveToStorage'), context);
  const write = vm.runInContext('writeToFileHandle', context);
  const first = write(handle, { content: 'old' });
  const second = write(handle, { content: 'new' });
  assert.equal(await first, true);
  assert.equal(await second, true);
  assert.deepEqual(writes.map(JSON.parse).map(x => x.content), ['old', 'new']);

  const failing = { async createWritable() { throw Error('disk error'); } };
  context.fileHandles.projects.project = failing;
  assert.equal(await write(failing, { content: 'test' }), false);
  assert.equal(context.fileHandles.projects.project, undefined);

  const store = new Map([['hopil_studio_projects_v1', '{broken json']]);
  const recovery = vm.createContext({
    STORAGE_KEY: 'hopil_studio_projects_v1', state: { projects: [] },
    localStorage: {
      getItem: key => store.get(key) || null,
      setItem: (key, value) => store.set(key, value),
      removeItem: key => store.delete(key)
    },
    console: { error() {} }, toast() {}, storageLoadFailed: false,
    fileHandles: { all: null, projects: {} }
  });
  vm.runInContext(section('function saveToStorage', '// SCHEMA MIGRATION'), recovery);
  vm.runInContext('loadFromStorage()', recovery);
  assert.equal(store.get('hopil_studio_projects_v1'), '{broken json');
  assert.equal(recovery.storageLoadFailed, true);
  assert.equal(vm.runInContext('saveToStorage()', recovery), false);
  assert.equal(store.get('hopil_studio_projects_v1'), '{broken json');

  const previous = JSON.stringify([{ id: 'legacy', title: '이전 원고' }]);
  const oldStore = new Map([['wnstudio_v1', previous]]);
  const separate = vm.createContext({
    STORAGE_KEY: 'hopil_studio_projects_v1', state: { projects: [] },
    localStorage: {
      getItem: key => oldStore.has(key) ? oldStore.get(key) : null,
      setItem: (key, value) => oldStore.set(key, value),
      removeItem: key => oldStore.delete(key)
    },
    console: { error() {} }, toast() {}, storageLoadFailed: false,
    fileHandles: { all: null, projects: {} }
  });
  vm.runInContext(section('function saveToStorage', '// SCHEMA MIGRATION'), separate);
  vm.runInContext('loadFromStorage()', separate);
  assert.equal(oldStore.get('wnstudio_v1'), previous);
  assert.equal(oldStore.get('hopil_studio_projects_v1'), previous);
  vm.runInContext("state.projects[0].title = '새 원고'; saveToStorage()", separate);
  assert.equal(JSON.parse(oldStore.get('wnstudio_v1'))[0].title, '이전 원고');
  assert.equal(JSON.parse(oldStore.get('hopil_studio_projects_v1'))[0].title, '새 원고');

  const imports = vm.createContext({});
  vm.runInContext(section('const MAX_IMPORT_BYTES', 'function importSingleProject'), imports);
  const validate = vm.runInContext('validateImportedProject', imports);
  assert.equal(validate({ id: 'p1', title: '작품', chapters: [] }).id, 'p1');
  assert.throws(() => validate({ id: "x');alert(1)//", title: '작품' }));
  assert.throws(() => validate({ id: 'p1', chapters: {} }));
  console.log('Saving order, failure, recovery, and import validation passed.');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
