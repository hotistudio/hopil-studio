const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('scripts/app.js', 'utf8');
const sidebarStart = source.indexOf('function toggleSidebar()');
const sidebarEnd = source.indexOf('function closeSidebar()', sidebarStart);
const categoryStart = source.indexOf('function openCategoryMenuFromChapterPanel()');
const categoryEnd = source.indexOf('function toggleMobileChapterPanel()', categoryStart);
assert(sidebarStart >= 0 && sidebarEnd > sidebarStart);
assert(categoryStart >= 0 && categoryEnd > categoryStart);
assert.match(fs.readFileSync('index.html', 'utf8'), /onclick="openCategoryMenuFromChapterPanel\(\)"/);

const classes = initial => {
  const values = new Set(initial);
  return {
    contains: value => values.has(value),
    add: value => values.add(value),
    remove: value => values.delete(value)
  };
};
const sidebar = { classList: classes([]), style: {} };
const chapterPanel = { classList: classes(['open']) };
const overlay = { style: { display: 'none' } };
let closed = 0;
const context = vm.createContext({
  window: { innerWidth: 390 },
  document: { getElementById: id => ({
    sidebar, 'sidebar-overlay': overlay, 'menu-toggle': {},
    'mobile-chapter-panel': chapterPanel
  })[id] },
  toggleMobileChapterPanel() {
    closed++;
    chapterPanel.classList.remove('open');
  }
});
vm.runInContext(source.slice(sidebarStart, sidebarEnd), context);
vm.runInContext(source.slice(categoryStart, categoryEnd), context);

vm.runInContext('toggleSidebar()', context);
assert.equal(closed, 1, '상단 메뉴는 열린 화 목록을 닫아야 한다');
assert.equal(sidebar.classList.contains('open'), true);
assert.equal(overlay.style.display, 'block');

sidebar.classList.remove('open');
overlay.style.display = 'none';
chapterPanel.classList.add('open');
vm.runInContext('openCategoryMenuFromChapterPanel()', context);
assert.equal(closed, 2, '화 목록의 전체 카테고리 버튼은 화 목록을 닫아야 한다');
assert.equal(sidebar.classList.contains('open'), true);
assert.equal(overlay.style.display, 'block');
console.log('Mobile chapter-to-category navigation passed.');
