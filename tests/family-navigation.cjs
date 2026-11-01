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

const project = {
  families: [{ id: 'f1', name: '아르켄', groupType: 'family', groups: {
    '직계': [{ name: '가주' }], '방계': []
  }}],
  characters: []
};
const main = { innerHTML: '' };
const ftState = { filterFamilyId: '' };
let destination = '';
const context = vm.createContext({
  getProject: () => project,
  document: { getElementById: id => id === 'main' ? main : null },
  familyCollapsed: {}, familyActiveTab: {}, ftState,
  getFamilyTabNames: () => ['직계', '방계'],
  esc: value => String(value),
  updateBadges() {}, initMemberDrag() {}, setTimeout() {},
  navigate: tab => { destination = tab; }
});
vm.runInContext(section('function renderFamilyTabs(', 'let familyActiveTab ='), context);
vm.runInContext(section('function openFamilyTreeFromCard(', 'function showFamilyModal('), context);

vm.runInContext('renderFamily()', context);
assert.match(main.innerHTML, /가문을 펼치면 직계·방계 구성원을 볼 수 있습니다/);
assert.match(main.innerHTML, /class="family-tab active"[^>]*aria-pressed="true"[^>]*>\s*직계/);
assert.match(main.innerHTML, /이 가문의 가계도 보기/);
assert.match(main.innerHTML, /전체 가계도/);

vm.runInContext('openFamilyTreeFromCard(0)', context);
assert.equal(ftState.filterFamilyId, 'f1');
assert.equal(destination, 'familytree');

if (process.env.FAMILY_PREVIEW_FILE) {
  const css = fs.readFileSync('styles/app.css', 'utf8');
  fs.writeFileSync(process.env.FAMILY_PREVIEW_FILE,
    `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><body><main id="main" style="padding:24px">${main.innerHTML}</main></body></html>`);
}
console.log('Family tabs and family tree navigation passed.');
