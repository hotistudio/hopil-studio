const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('src/app/08-features.js', 'utf8');
function section(start, end) {
  const a = source.indexOf(start);
  const b = source.indexOf(end, a + start.length);
  assert(a >= 0 && b > a, `Missing ${start}`);
  return source.slice(a, b);
}
const stored = new Map([['hopil_studio_goal', '1500']]);
let project = { id: 'p1', title: '첫 작품' };
let saved = 0;
let storedProjects = 0;
const main = { innerHTML: '' };
const scroll = { scrollLeft: 0, scrollWidth: 1000, clientWidth: 300 };
const context = vm.createContext({
  Date,
  localStorage: {
    getItem: key => stored.has(key) ? stored.get(key) : null,
    setItem: (key, value) => stored.set(key, String(value)),
  },
  state: { activeProjectId: 'p1', projects: [project, { id: 'p2', title: '다른 작품' }] },
  getProject: () => project,
  autoSave: () => { saved++; },
  saveToStorage: () => { storedProjects++; return true; },
  getTodayStr: (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`,
  loadStats: () => ({ p1: {} }),
  getTodayTypingSec: () => 0,
  getWeekTypingSec: () => 0,
  getMonthTypingSec: () => 0,
  getTypingGap: () => 5,
  typingFmt: () => '0분 0초',
  esc: value => value,
  document: { getElementById: id => id === 'main' ? main : null, querySelector: () => scroll },
});
vm.runInContext(section('function migrateLegacyWritingGoals()', '// 타이핑 시간 감지'), context);
vm.runInContext(section('const STATS_PERIOD_KEY', '// 심리 아크'), context);

context.migrateLegacyWritingGoals();
assert.equal(project.dailyWritingGoal, 1500);
assert.equal(context.state.projects[1].dailyWritingGoal, 1500);
assert.equal(storedProjects, 1);
assert.equal(context.getWritingGoal(), 1500); // 기존 전역 목표 유지
context.setWritingGoal(2200);
assert.equal(project.dailyWritingGoal, 2200);
assert.equal(context.getWritingGoal(), 2200);
assert.equal(stored.get('hopil_studio_goal'), '1500');
assert.equal(saved, 1);
project = { id: 'p2', title: '다른 작품' };
assert.equal(context.getWritingGoal(), 1500);
project = { id: 'p1', title: '첫 작품', dailyWritingGoal: 2200 };

const now = new Date(2026, 10, 1);
const days = { '2026-10-30': 100, '2026-10-31': 200 };
const streak = context.getWritingStreak(days, now);
assert.equal(streak.count, 2);
assert.equal(streak.throughYesterday, true);
days['2026-11-01'] = 300;
assert.equal(context.getWritingStreak(days, now).count, 3);
assert.equal(context.getWritingStreak(days, now).throughYesterday, false);

const weeks = context.buildWritingHeatmap(days, 1000, 'weeks', now);
const year = context.buildWritingHeatmap(days, 1000, 'year', now);
assert.equal((weeks.match(/class="stats-heatmap-week/g) || []).length, 12);
assert.equal((weeks.match(/onclick="showStatsDay/g) || []).length, 84);
assert.equal((year.match(/onclick="showStatsDay/g) || []).length, 365);
assert.match(year, /is-month-start/);
assert.match(year, /2026-11-01, 300자/);

const months = context.getMonthlyWritingStats({ '2025-09-12': 40, '2026-11-01': 60 }, now);
assert.equal(months[0].label, '2025/9월');
assert.equal(months[0].total, 40);
assert.equal(months.at(-1).total, 60);

context.renderStats();
assert.match(main.innerHTML, /집필 활동 시간/);
assert.match(main.innerHTML, /이 작품의 하루 목표/);
assert.match(main.innerHTML, /setStatsPeriod\('year'\)/);
context.setStatsPeriod('year');
assert.equal(stored.get('hopil_studio_stats_period'), 'year');
assert.match(main.innerHTML, /최근 1년 집필 기록/);
assert.match(main.innerHTML, /stats-charts-year/);
assert.equal(scroll.scrollLeft, 700);

console.log('Project goals, streaks, heatmap ranges, and statistics display passed.');
