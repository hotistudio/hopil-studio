const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const navigation = fs.readFileSync('src/app/01-import-navigation.js', 'utf8');
const world = fs.readFileSync('src/app/04-world-plot.js', 'utf8');
const manuscript = fs.readFileSync('src/app/07-memo-manuscript.js', 'utf8');
const navStart = navigation.indexOf('const WORLD_CATS_COMMON');
const navEnd = navigation.indexOf('const SCENE_TYPES', navStart);
const worldEnd = world.indexOf('function toggleTlDetail(');
const splitStart = manuscript.indexOf('function resetSplitWorldFilter()');
const splitEnd = manuscript.indexOf('function refreshSplitPanel()', splitStart);
assert(navStart >= 0 && navEnd > navStart && worldEnd > 0 && splitStart >= 0 && splitEnd > splitStart);

let project = {
  id: 'p1', genre: '판타지', worldTimeline: [],
  worldSettings: [
    { id: 'w1', title: '수도', category: '도시', content: '왕궁이 있는 도시' },
    { id: 'w2', title: '북부', category: '지역', content: '눈과 빙하' },
    { id: 'w3', title: '화폐', category: '경제/화폐', content: '금화와 은화' }
  ]
};
const main = { innerHTML: '' };
const nodes = {
  'split-world-inner': { innerHTML: '' },
  'split-world-clear': { style: {} },
  'split-world-count': { textContent: '' },
  'split-world-search': { value: '' },
  'split-world-category': { value: '전체' }
};
const context = vm.createContext({
  window: {},
  getProject: () => project,
  esc: value => String(value),
  setTimeout: () => {},
  document: { activeElement: null, getElementById: id => id === 'main' ? main : null },
  splitElement: id => nodes[id]
});
vm.runInContext(navigation.slice(navStart, navEnd), context);
vm.runInContext(world.slice(0, worldEnd), context);
vm.runInContext(manuscript.slice(splitStart, splitEnd), context);

context.renderWorld();
assert.match(main.innerHTML, /showWorldModal\(0\)/);
assert.match(main.innerHTML, /showWorldModal\(1\)/);
context.window._worldSearch = '빙하';
context.renderWorld();
assert.match(main.innerHTML, /showWorldModal\(1\)/);
assert.doesNotMatch(main.innerHTML, /showWorldModal\(0\)/);
assert.match(main.innerHTML, /눈과 빙하/);
assert.match(main.innerHTML, /display:block/);

context.window._worldSearch = '';
context.window._worldCategory = '경제/화폐';
context.renderWorld();
assert.match(main.innerHTML, /showWorldModal\(2\)/);
assert.doesNotMatch(main.innerHTML, /showWorldModal\(1\)/);

context.window._spWorldSearch = '왕궁';
context.refreshSplitWorld();
assert.match(nodes['split-world-inner'].innerHTML, /수도/);
assert.doesNotMatch(nodes['split-world-inner'].innerHTML, /북부/);
assert.equal(nodes['split-world-count'].textContent, '1 / 3개');
assert.equal(nodes['split-world-clear'].style.display, '');
context.resetSplitWorldFilter();
assert.equal(nodes['split-world-search'].value, '');
assert.equal(nodes['split-world-count'].textContent, '3 / 3개');

project = { id: 'p2', genre: '기타', worldSettings: [{ title: '새 설정', content: '', category: '기타' }] };
context.renderWorld();
assert.equal(context.window._worldCategory, '전체');
assert.equal(context.window._spWorldSearch, '');

console.log('World search, category filtering, split reference, and project reset passed.');
