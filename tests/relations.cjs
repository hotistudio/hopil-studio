const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('scripts/app.js', 'utf8');
function part(start, end) {
  const a = source.indexOf(start);
  const b = source.indexOf(end, a + start.length);
  assert(a >= 0 && b > a, `Missing ${start}`);
  return source.slice(a, b);
}

const project = {
  characters: [
    { id: 'a', name: '가' }, { id: 'b', name: '나' },
    { id: 'c', name: '동명' }, { id: 'd', name: '동명' },
  ],
  relations: [
    { from: '가', to: '나', type: '친구' },
    { from: '동명', to: '나', type: '라이벌' },
  ],
};
let saves = 0;
const fields = new Map([
  ['cm-name', { value: '가 변경' }],
  ['cr-rel-to', { value: 'b' }],
  ['cr-rel-direction', { value: 'forward' }],
  ['cr-rel-type', { value: '' }],
]);
const context = vm.createContext({
  CURRENT_SCHEMA_VERSION: 4,
  getProject: () => project,
  document: {
    getElementById: id => fields.get(id) || (id === 'split-panel' || id === 'focus-overlay' ? null : { value: '' }),
    querySelector: () => null,
  },
  state: { activeTab: 'characters' },
  autoSave: () => saves++, closeModal() {}, renderCharacters() {}, toast() {},
  confirmDialog: (_, callback) => callback(), cleanupCharacterReferences() {},
  crRerender() {},
});
vm.runInContext(part('let relationEditIndex', 'function renderRelations('), context);
vm.runInContext(part('function setCrRelationType(type)', 'function setCrFamily('), context);
vm.runInContext(part('function migrateProject(p)', 'function cleanupCharacterReferences'), context);
vm.runInContext(part('function saveChar(idx)', 'function deleteChar(idx)'), context);
vm.runInContext(part('function deleteChar(idx)', 'let relationEditIndex'), context);

assert.equal(vm.runInContext('migrateRelationIds(getProject())', context), true);
assert.equal(project.relations[0].fromId, 'a');
assert.equal(project.relations[0].toId, 'b');
assert.equal(project.relations[1].fromId, null, 'ambiguous legacy names stay unlinked');
assert.equal(project.relations[1].toId, 'b');
project.characters.pop();
assert.equal(vm.runInContext('migrateRelationIds(getProject())', context), false);
assert.equal(project.relations[1].fromId, null, 'later character changes cannot guess an old ambiguous link');
const oldProject = { schemaVersion: 3, characters: [{ id: 'x', name: '옛 인물' }], relations: [{ from: '옛 인물', to: '미상', type: '조력자' }] };
context.oldProject = oldProject;
assert.equal(vm.runInContext('migrateProject(oldProject)', context), true);
assert.equal(oldProject.schemaVersion, 4);
assert.equal(oldProject.relations[0].fromId, 'x');
assert.equal(oldProject.relations[0].toId, null);
assert.equal(vm.runInContext("saveRelationData(getProject(), 'a', 'b', '친구')", context), '이미 같은 관계가 있습니다.');
assert.equal(vm.runInContext("saveRelationData(getProject(), 'a', 'b', '동료', 0)", context), '');
assert.equal(project.relations[0].type, '동료');
assert.equal(vm.runInContext("saveRelationData(getProject(), 'c', 'b', '라이벌')", context), '');
assert.equal(project.relations[2].fromId, 'c');

vm.runInContext("setCrRelationType('스승→제자')", context);
assert.equal(fields.get('cr-rel-type').value, '스승→제자');
vm.runInContext('addCrRelation(0)', context);
assert.equal(project.relations[3].fromId, 'a');
assert.equal(project.relations[3].toId, 'b');
assert.equal(project.relations[3].type, '스승→제자');
fields.get('cr-rel-direction').value = 'reverse';
vm.runInContext("setCrRelationType('짝사랑→상대')", context);
vm.runInContext('addCrRelation(0)', context);
assert.equal(project.relations[4].fromId, 'b');
assert.equal(project.relations[4].toId, 'a');
vm.runInContext('removeCrRelation(0, 3)', context);
assert.equal(project.relations.length, 4);

vm.runInContext('saveChar(0)', context);
assert.equal(project.relations[0].from, '가 변경');
assert.equal(vm.runInContext("relationName(getProject(), getProject().relations[0], 'from')", context), '가 변경');

vm.runInContext('deleteChar(1)', context);
assert.equal(project.relations.length, 0, 'deleting a character removes its linked relations');
assert.equal(saves, 5);
console.log('Relation migration, modal add/remove, direction, duplicates, rename, and delete passed.');
