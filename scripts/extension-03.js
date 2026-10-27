(function UndoRedoPatch() {
  'use strict';

  // ─── 유틸: execCommand 로 텍스트 삽입 ───────────────────────────
  // textarea/input 에도 동작. 쌍 기호일 때도 한 번의 execCommand 로
  // 넣어야 undo 한 번에 되돌려짐.
  function insertTextAtCursor(el, text, opts) {
    opts = opts || {};
    el.focus();
    const s = el.selectionStart, e = el.selectionEnd;

    // execCommand 시도 (브라우저 native undo stack 보존)
    let ok = false;
    try {
      ok = document.execCommand('insertText', false, text);
    } catch (err) { ok = false; }

    // 실패 시 폴백 — 최소한 직전 스냅샷은 커스텀 스택에 저장
    if (!ok) {
      pushCustomSnapshot(el);
      const before = el.value.slice(0, s);
      const after  = el.value.slice(e);
      el.value = before + text + after;
      el.selectionStart = el.selectionEnd = s + text.length;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }

    // 쌍 기호 처리: 선택 영역을 감싸고 내부를 선택 상태로
    if (opts.selectInner && opts.innerLen != null) {
      el.selectionStart = s + 1;
      el.selectionEnd   = s + 1 + opts.innerLen;
    } else if (opts.cursorOffset != null) {
      el.selectionStart = el.selectionEnd = s + opts.cursorOffset;
    }
  }

  // ─── 커스텀 스냅샷 스택 (화별) ──────────────────────────────────
  // 화 ID → [{content, selStart, selEnd, ts}, ...]
  // 최근 10개만 유지. textarea 재생성/대량 변경 시 직전 상태 보존용.
  const CUSTOM_STACK_MAX = 10;
  const _customStacks = new Map(); // chapterId → snapshot[]
  const _customRedo   = new Map(); // chapterId → snapshot[]

  function currentChapterId() {
    // activeChapterId 전역, focus 모드도 동일 ID 사용
    return (typeof activeChapterId !== 'undefined') ? activeChapterId : null;
  }

  function pushCustomSnapshot(el) {
    const cid = currentChapterId();
    if (!cid) return;
    const stack = _customStacks.get(cid) || [];
    const last  = stack[stack.length - 1];
    // 동일 내용이면 스킵
    if (last && last.content === el.value) return;
    stack.push({
      content:  el.value,
      selStart: el.selectionStart,
      selEnd:   el.selectionEnd,
      ts: Date.now(),
    });
    while (stack.length > CUSTOM_STACK_MAX) stack.shift();
    _customStacks.set(cid, stack);
    // 새 스냅샷이 쌓이면 redo 는 비움
    _customRedo.set(cid, []);
  }

  function popCustomSnapshot() {
    const cid = currentChapterId();
    if (!cid) return null;
    const stack = _customStacks.get(cid) || [];
    return stack.pop() || null;
  }

  function peekCustomSnapshot() {
    const cid = currentChapterId();
    if (!cid) return null;
    const stack = _customStacks.get(cid) || [];
    return stack[stack.length - 1] || null;
  }

  // ─── idle 스냅샷: 타이핑 300ms 멈추면 1회 기록 ───────────────────
  // 과도하게 쌓이지 않게 내용 변동 임계치도 체크.
  let _idleTimer = null;
  let _lastSnapshotContent = '';

  function scheduleIdleSnapshot(el) {
    clearTimeout(_idleTimer);
    _idleTimer = setTimeout(() => {
      if (!el || !document.body.contains(el)) return;
      // 직전 스냅샷과 같으면 무시
      const last = peekCustomSnapshot();
      if (last && last.content === el.value) return;
      // 최소 변동: 5자 이상 차이 날 때만
      if (_lastSnapshotContent &&
          Math.abs(el.value.length - _lastSnapshotContent.length) < 5) return;
      pushCustomSnapshot(el);
      _lastSnapshotContent = el.value;
    }, 300);
  }

  // ─── 기존 insertSymbol 덮어쓰기 ─────────────────────────────────
  const _origInsertSymbol = window.insertSymbol;
  window.insertSymbol = function (sym) {
    const ta = document.getElementById('prose-editor');
    if (!ta) return;
    const s = ta.selectionStart, e = ta.selectionEnd;
    const selected = ta.value.slice(s, e);
    const isPair = sym.length === 2;

    if (isPair) {
      const inner = selected || '';
      const text = sym[0] + inner + sym[1];
      insertTextAtCursor(ta, text, {
        selectInner: !!inner,
        innerLen: inner.length,
        cursorOffset: inner ? null : 1,
      });
    } else {
      insertTextAtCursor(ta, sym, { cursorOffset: sym.length });
    }
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  };

  // ─── 집중 모드 기호 버튼 / Ctrl+숫자 단축키 덮어쓰기 ─────────────
  // 원본이 keydown 리스너로 달려있고 제거할 방법이 없어서,
  // capture 단계에서 가로채고 stopImmediatePropagation 으로
  // 원본이 실행되지 않게 막은 뒤 우리가 execCommand 로 처리.
  window.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    if (typeof SHORTCUT_SYMBOLS === 'undefined') return;
    const sym = SHORTCUT_SYMBOLS[e.key];
    if (!sym) return;

    const ta = document.getElementById('prose-editor');
    const fe = document.getElementById('focus-editor');
    const active = document.activeElement;
    if (active !== ta && active !== fe) return;

    e.preventDefault();
    e.stopImmediatePropagation();

    const target = active;
    const s = target.selectionStart, en = target.selectionEnd;
    const selected = target.value.slice(s, en);
    const isPair = sym.length === 2;

    if (isPair) {
      const inner = selected || '';
      const text = sym[0] + inner + sym[1];
      insertTextAtCursor(target, text, {
        selectInner: !!inner,
        innerLen: inner.length,
        cursorOffset: inner ? null : 1,
      });
    } else {
      insertTextAtCursor(target, sym, { cursorOffset: sym.length });
    }
    target.dispatchEvent(new Event('input', { bubbles: true }));
  }, true); // capture = true, 원본보다 먼저 실행

  // ─── 찾아바꾸기 frReplace / frReplaceAll 덮어쓰기 ────────────────
  // 특히 "모두 바꾸기"는 변경 전 스냅샷을 커스텀 스택에 넣어
  // Ctrl+Z 한 방에 전체 롤백 가능하게 한다.
  const _origFrReplace = window.frReplace;
  if (typeof _origFrReplace === 'function') {
    window.frReplace = function () {
      const ta = typeof frGetEditor === 'function' ? frGetEditor() : document.getElementById('prose-editor');
      if (ta) pushCustomSnapshot(ta);
      return _origFrReplace.apply(this, arguments);
    };
  }

  const _origFrReplaceAll = window.frReplaceAll;
  if (typeof _origFrReplaceAll === 'function') {
    window.frReplaceAll = function () {
      const ta = typeof frGetEditor === 'function' ? frGetEditor() : document.getElementById('prose-editor');
      if (!ta) return _origFrReplaceAll.apply(this, arguments);

      // 확인 프롬프트 추가 — 대량 변경은 반드시 확인
      const q = document.getElementById('fr-find')?.value || '';
      const r = document.getElementById('fr-replace')?.value || '';
      if (q) {
        const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
        const count = (ta.value.match(regex) || []).length;
        if (count > 1) {
          if (!confirm(`"${q}" → "${r}" 로 ${count}개 모두 바꿉니다.\nCtrl+Z 로 되돌릴 수 있어요. 진행할까요?`)) {
            return;
          }
        }
      }
      pushCustomSnapshot(ta);
      return _origFrReplaceAll.apply(this, arguments);
    };
  }

  // ─── 화 전환 직전 스냅샷 ────────────────────────────────────────
  const _origSelectChapter = window.selectChapter;
  if (typeof _origSelectChapter === 'function') {
    window.selectChapter = function (id) {
      const ta = document.getElementById('prose-editor');
      if (ta && activeChapterId && activeChapterId !== id) {
        pushCustomSnapshot(ta);
      }
      return _origSelectChapter.apply(this, arguments);
    };
  }

  // ─── Ctrl+Z / Ctrl+Shift+Z 인터셉트 ─────────────────────────────
  // 기본적으로 브라우저 native undo 에 맡기되,
  // 브라우저가 "더 되돌릴 게 없음" 상태일 때 커스텀 스택 발동.
  // 판정 방법: undo 실행 전후로 value 가 바뀌었는지 확인.
  window.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase();
    const isUndo = (e.ctrlKey || e.metaKey) && !e.shiftKey && key === 'z';
    const isRedo = (e.ctrlKey || e.metaKey) && (e.shiftKey && key === 'z' || key === 'y');
    if (!isUndo && !isRedo) return;

    const active = document.activeElement;
    const ta = document.getElementById('prose-editor');
    const fe = document.getElementById('focus-editor');
    if (active !== ta && active !== fe) return;

    const target = active;
    const before = target.value;
    const beforeSel = [target.selectionStart, target.selectionEnd];

    // 브라우저 native 에 먼저 기회를 준다 — 다음 tick 에 확인
    setTimeout(() => {
      if (target.value !== before) {
        // native 가 뭔가 되돌렸음. OK.
        return;
      }
      // native 가 아무것도 못 함 → 커스텀 스택 사용
      if (isUndo) {
        const snap = popCustomSnapshot();
        if (!snap) return;
        // 현재 상태는 redo 용으로 보존
        const cid = currentChapterId();
        if (cid) {
          const redoStack = _customRedo.get(cid) || [];
          redoStack.push({
            content: target.value,
            selStart: beforeSel[0],
            selEnd:   beforeSel[1],
            ts: Date.now(),
          });
          while (redoStack.length > CUSTOM_STACK_MAX) redoStack.shift();
          _customRedo.set(cid, redoStack);
        }
        target.value = snap.content;
        target.selectionStart = snap.selStart || 0;
        target.selectionEnd   = snap.selEnd   || 0;
        target.dispatchEvent(new Event('input', { bubbles: true }));
        if (typeof toast === 'function') toast('되돌렸어요 (1단계)');
      } else if (isRedo) {
        const cid = currentChapterId();
        if (!cid) return;
        const redoStack = _customRedo.get(cid) || [];
        const snap = redoStack.pop();
        if (!snap) return;
        pushCustomSnapshot(target);
        target.value = snap.content;
        target.selectionStart = snap.selStart || 0;
        target.selectionEnd   = snap.selEnd   || 0;
        target.dispatchEvent(new Event('input', { bubbles: true }));
        if (typeof toast === 'function') toast('다시 실행했어요');
      }
    }, 0);
  }, false);

  // ─── idle 스냅샷 훅: prose-editor / focus-editor 모두 ────────────
  // 기존 oninput 을 건드리지 않고 capture 리스너로 추가.
  document.addEventListener('input', (e) => {
    const t = e.target;
    if (t && (t.id === 'prose-editor' || t.id === 'focus-editor')) {
      scheduleIdleSnapshot(t);
    }
  }, true);

  // ─── 디버그용 콘솔 API ──────────────────────────────────────────
  window.__undo = {
    getStacks: () => ({
      undo: Object.fromEntries(_customStacks),
      redo: Object.fromEntries(_customRedo),
    }),
    clear: () => { _customStacks.clear(); _customRedo.clear(); },
  };
})();
