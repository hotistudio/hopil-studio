const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('src/app/05-editor-schedule.js', 'utf8');
const fields = {}, listeners = {}, frames = [];
let focus = false;
const document = {
  activeElement: null,
  getElementById: id => id === 'focus-overlay' ? {classList:{contains:()=>focus}} : fields[id],
  querySelectorAll: () => Object.values(fields),
  addEventListener: (name, fn) => (listeners[name] ||= []).push(fn)
};
function editor(id) {
  return fields[id] = { id, isConnected:true, hidden:false, selectionStart:0, selectionEnd:0,
    selectionDirection:'none', scrollTop:0, scrollLeft:0,
    matches(selector) { return selector.split(', ').includes('#'+id); },
    closest() { return this.hidden ? {} : null; },
    setSelectionRange(start,end,direction) { Object.assign(this,{selectionStart:start,selectionEnd:end,selectionDirection:direction}); }
  };
}
const ctx=vm.createContext({document,requestAnimationFrame:fn=>frames.push(fn)});
vm.runInContext(source.slice(source.indexOf('const manuscriptViews'),source.indexOf('function refreshSecondEditor')),ctx);
const flush=()=>{while(frames.length) frames.shift()();};
const chapterA={id:'a'}, chapterB={id:'b'};
const primary=editor('prose-editor'), secondary=editor('second-prose-editor');
ctx.bindManuscriptEditor(primary,chapterA);ctx.bindManuscriptEditor(secondary,chapterB);flush();
primary.setSelectionRange(12,19,'backward');primary.scrollTop=180;
secondary.setSelectionRange(400,410,'forward');secondary.scrollTop=850;
ctx.rememberManuscriptViews();
document.activeElement=secondary;listeners.focusin[0]({target:secondary});
document.activeElement={};assert.equal(ctx.getActiveManuscriptEditor(),secondary,'toolbar retains target');
secondary.hidden=true;assert.equal(ctx.getActiveManuscriptEditor(),primary,'hidden secondary excluded');secondary.hidden=false;
focus=true;const focused=editor('focus-second-prose-editor');ctx.bindManuscriptEditor(focused,chapterB);flush();
assert.equal(focused.selectionStart,400);assert.equal(focused.scrollTop,850);
focused.setSelectionRange(510,520,'backward');focused.scrollTop=950;ctx.rememberManuscriptViews();
focus=false;ctx.bindManuscriptEditor(secondary,chapterB);flush();assert.equal(secondary.selectionStart,510);assert.equal(secondary.scrollTop,950);
ctx.bindManuscriptEditor(primary,chapterA);flush();assert.equal(primary.selectionStart,12);assert.equal(primary.selectionDirection,'backward');assert.equal(primary.scrollTop,180);
ctx.bindManuscriptEditor(secondary,{id:'b'});flush();assert.equal(secondary.scrollTop,0,'same ID in another project has independent position');
ctx.bindManuscriptEditor(secondary,chapterB);ctx.bindManuscriptEditor(secondary,chapterA);flush();assert.equal(secondary.selectionStart,12,'stale animation frame cannot restore wrong chapter');
console.log('Editor target, chapter view restoration, focus roundtrip, hidden panes, project isolation and stale frames passed.');
