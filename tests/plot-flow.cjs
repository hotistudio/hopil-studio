const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('src/app/04-world-plot.js', 'utf8');
const context = vm.createContext({ Map });
vm.runInContext(source, context);

const project = {
  chapters: [
    { id: 'folder', isFolder: true, title: '1부' },
    { id: 'second', title: '두 번째 화' },
    { id: 'first', title: '첫 번째 화' },
    { id: 'empty', title: '장면 없는 화' },
  ],
  arcs: [
    { title: '주인공', scenes: [
      { title: '첫 장면', chapterId: 'first' },
      { title: '연결 전', chapterId: '' },
      { title: '다음 장면', chapterId: 'second' },
    ] },
    { title: '조연', scenes: [
      { title: '교차 장면', chapterId: 'first' },
      { title: '삭제된 화', chapterId: 'missing' },
    ] },
  ],
};

const result = context.buildPlotFlow(project);
assert.deepEqual(Array.from(result.groups, group => group.chapter.id), ['second', 'first', 'empty']);
assert.deepEqual(Array.from(result.groups, group => group.number), [1, 2, 3]);
assert.deepEqual(Array.from(result.groups[0].scenes, entry => entry.scene.title), ['다음 장면']);
assert.deepEqual(Array.from(result.groups[1].scenes, entry => entry.scene.title), ['첫 장면', '교차 장면']);
assert.deepEqual(Array.from(result.groups[2].scenes, entry => entry.scene.title), []);
assert.deepEqual(Array.from(result.unlinked, entry => entry.scene.title), ['연결 전', '삭제된 화']);

project.arcs[0].scenes[1].chapterId = 'second';
const updated = context.buildPlotFlow(project);
assert.deepEqual(Array.from(updated.groups[0].scenes, entry => entry.scene.title), ['연결 전', '다음 장면']);
assert.deepEqual(Array.from(updated.unlinked, entry => entry.scene.title), ['삭제된 화']);

console.log('Plot flow chapter order, cross-arc scenes, gaps, and relinking passed.');
