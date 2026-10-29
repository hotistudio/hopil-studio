// 원본 기능 파일을 기존 순서대로 합쳐 브라우저용 classic script를 만든다.
// 실행: node build-app.cjs
const fs = require('node:fs');
const parts = [
  '00-storage-family.js',
  '01-import-navigation.js',
  '02-home-overview.js',
  '03-characters.js',
  '04-world-plot.js',
  '05-editor-schedule.js',
  '06-diagram.js',
  '07-memo-manuscript.js',
  '08-features.js',
  '08-narrative-timeline.js',
  '08-hwpx-export.js',
  '09-init.js'
];
const output = parts.map(name => fs.readFileSync(`src/app/${name}`, 'utf8')).join('');
fs.writeFileSync('scripts/app.js', output);
console.log(`Built scripts/app.js from ${parts.length} source files`);
