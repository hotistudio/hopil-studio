const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const features = fs.readFileSync('src/app/08-features.js', 'utf8');
const characters = fs.readFileSync('src/app/03-characters.js', 'utf8');
function section(source, start, end) {
  const a = source.indexOf(start);
  const b = source.indexOf(end, a + start.length);
  assert(a >= 0 && b > a, `Missing ${start}`);
  return source.slice(a, b);
}

const project = {
  characters: [{ id: 'char-1', name: '옛 이름', color: '#123456' }],
  psyArcs: [
    { id: 'arc-1', title: '기존 아크', charName: '옛 이름', steps: [] },
    { id: 'arc-2', title: '다른 아크', charName: '다른 인물', steps: [] },
  ],
};
const fields = new Map([
  ['cm-name', '새 이름'], ['pa-title', 'ID 연결 아크'], ['pa-char', 'char-1'],
  ['ps-title', '결심'], ['ps-emotion', '결의'], ['ps-chapter', 'chapter-1'],
  ['ps-trigger', '진실을 앎'], ['ps-before', '아무도 믿지 않는다'],
  ['ps-after', '동료를 믿는다'], ['ps-content', '동료와 함께 간다'],
]);
let saves = 0;
const context = vm.createContext({
  getProject: () => project,
  document: {
    getElementById: id => id === 'split-panel' || id === 'focus-overlay'
      ? null : { value: fields.get(id) || '' },
    querySelector: () => null,
  },
  uid: () => 'new-id', autoSave: () => saves++, closeModal() {}, toast() {},
  renderPsyArc() {}, renderCharacters() {}, state: { activeTab: 'characters' },
});
vm.runInContext(section(features, 'function getPsyArcCharacter(', '// 배경색에 따라'), context);
vm.runInContext(section(features, 'function savePsyArc(', 'function deletePsyArc('), context);
vm.runInContext(section(features, 'function savePsyStep(', 'function deletePsyStep('), context);
vm.runInContext(section(characters, 'function saveChar(', 'function deleteChar('), context);

assert.equal(context.getPsyArcCharacter(project.psyArcs[0], project).id, 'char-1');
context.saveChar(0);
assert.equal(project.characters[0].name, '새 이름');
assert.equal(project.psyArcs[0].charId, 'char-1');
assert.equal(project.psyArcs[0].charName, '새 이름');
assert.equal(project.psyArcs[1].charName, '다른 인물');
assert.equal(context.getPsyArcCharacter(project.psyArcs[0], project).name, '새 이름');

context.savePsyArc();
assert.equal(project.psyArcs[2].charId, 'char-1');
assert.equal(project.psyArcs[2].charName, '새 이름');
fields.set('ps-before', '기존 믿음');
fields.set('ps-after', '새 선택');
context.savePsyStep(2);
assert.equal(project.psyArcs[2].steps[0].beliefBefore, '기존 믿음');
assert.equal(project.psyArcs[2].steps[0].choiceAfter, '새 선택');
assert.equal(project.psyArcs[2].steps[0].trigger, '진실을 앎');

project.characters.push({ id: 'char-2', name: '새 이름' });
assert.equal(context.getPsyArcCharacter({ charName: '새 이름' }, project), null);
assert.equal(context.getPsyArcCharacter(project.psyArcs[2], project).id, 'char-1');
assert.equal(context.getPsyArcCharacter({ charId: 'deleted', charName: '새 이름' }, project), null);
assert.equal(saves, 3);
console.log('Psychological arc fields, legacy links, and character rename passed.');
