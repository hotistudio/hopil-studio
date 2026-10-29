const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const project = {
  chapters: [
    { id: 'c1', title: '시작' },
    { id: 'folder', title: '묶음', isFolder: true },
    { id: 'c2', title: '전환' },
    { id: 'c3', title: '결말' }
  ],
  arcs: [{ title: '1부', scenes: [
    { title: '만남', chapterId: 'c1' },
    { title: '미배치 장면', chapterId: '' }
  ] }],
  psyArcs: [{ title: '성장', steps: [
    { title: '결심', chapterId: 'c2' },
    { title: '미배치 변화', chapterId: 'missing' }
  ] }],
  foreshadows: [
    { id: 'f1', tagName: '열쇠' },
    { id: 'f2', tagName: '미등록' }
  ]
};
const main = { innerHTML: '' };
const calls = [];
const context = vm.createContext({
  getProject: () => project,
  getPsyArcCharacter: () => ({ name: '주인공' }),
  buildForeshadowIndex: () => ({}),
  classifyForeshadowChapters: f => f.id === 'f1'
    ? { linked: true, planted: 'c1', mentioned: ['c2'], harvested: 'c3' }
    : { linked: false },
  document: { getElementById: () => main },
  esc: value => String(value),
  navigate: tab => calls.push(['navigate', tab]),
  showSceneModal: (...args) => calls.push(['scene', ...args]),
  showPsyStepModal: (...args) => calls.push(['psy', ...args]),
  showForeshadowModal: id => calls.push(['foreshadow', id]),
  gotoChapterFromScene: id => calls.push(['chapter', id])
});
vm.runInContext(fs.readFileSync('src/app/08-narrative-timeline.js', 'utf8'), context);

const data = context.buildNarrativeTimeline(project, {});
assert.equal(data.rows.length, 3);
assert.equal(data.rows[0].lanes.plot[0].title, '만남');
assert.equal(data.rows[0].lanes.foreshadow[0].detail, '🌱 첫 등장');
assert.equal(data.rows[1].lanes.psy[0].detail, '주인공');
assert.equal(data.rows[1].lanes.foreshadow[0].detail, '💬 중간 언급');
assert.equal(data.rows[2].lanes.foreshadow[0].detail, '✅ 회수');
assert.equal(data.unlinked.plot[0].title, '미배치 장면');
assert.equal(data.unlinked.psy[0].title, '미배치 변화');
assert.equal(data.unlinked.foreshadow[0].title, '미등록');

context.renderNarrativeTimeline();
assert.match(main.innerHTML, /서사 타임라인/);
assert.match(main.innerHTML, /회차에 연결되지 않은 기록/);
assert.doesNotMatch(main.innerHTML, /묶음<\/button>/);
context.ntOpen('plot', 0, 0);
context.ntOpen('psy', 0, 0);
context.ntOpen('foreshadow', 0);
context.ntOpenChapter(1);
assert.deepEqual(calls, [
  ['navigate', 'plot'], ['scene', 0, 0],
  ['navigate', 'psyarc'], ['psy', 0, 0],
  ['navigate', 'foreshadow'], ['foreshadow', 'f1'],
  ['chapter', 'c2']
]);

console.log('Narrative timeline grouping, unlinked records, and source navigation passed.');
