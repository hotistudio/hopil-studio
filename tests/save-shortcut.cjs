const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('scripts/app.js','utf8');
const start = source.indexOf('let shortcutSavePending = false;');
const end = source.indexOf('// 나머지 전역 단축키', start);
let listener, calls = 0, release;
const context = vm.createContext({
  window: { addEventListener(type, fn, capture) { assert.equal(type,'keydown'); assert.equal(capture,true); listener=fn; } },
  exportCurrentProject: () => { calls++; return new Promise(resolve => { release=resolve; }); },
  console: {error() {}}, toast() {}
});
vm.runInContext(source.slice(start,end), context);
const event = overrides => ({ctrlKey:true,metaKey:false,altKey:false,shiftKey:false,key:'s',code:'KeyS',repeat:false,isComposing:false,
  preventDefault(){this.prevented=true;},stopPropagation(){this.stopped=true;},...overrides});
(async () => {
  for (const overrides of [{}, {key:'S'}, {key:'ㄴ'}, {ctrlKey:false,metaKey:true}]) {
    const e=event(overrides), before=calls;
    const saving=listener(e);
    assert.equal(calls,before+1); assert(e.prevented && e.stopped);
    await listener(event()); assert.equal(calls,before+1,'Pending save must not open another dialog');
    release(); await saving;
  }
  for (const overrides of [{repeat:true},{isComposing:true},{shiftKey:true},{altKey:true},{ctrlKey:false},{key:'a',code:'KeyA'}]) {
    const before=calls; await listener(event(overrides)); assert.equal(calls,before);
  }
  context.exportCurrentProject=()=>{throw Error('failed');};
  await listener(event());
  context.exportCurrentProject=()=>{calls++;};
  const before=calls; await listener(event()); assert.equal(calls,before+1,'Failure must release the save lock');
  assert(!source.includes('function showCtrlSWarning'));
  assert(!fs.readFileSync('scripts/extension-07.js','utf8').includes("addEventListener('keydown'"));
  console.log('Save shortcut: Ctrl/Cmd, Korean layout, uppercase, repeat, pending, IME, modifiers, and retry passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
