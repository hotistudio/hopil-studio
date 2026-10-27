(function TrashPatch() {
  'use strict';

  const UNDO_WINDOW_MS = 10000; // 10초

  // ─── Undo 토스트 UI ─────────────────────────────────────────────
  // 오른쪽 하단에 쌓이는 카드. 10초 카운트다운 프로그레스 바.
  let _trashStack = []; // {id, label, timer, el, undoFn, commitFn}

  function ensureContainer() {
    let c = document.getElementById('trash-toast-container');
    if (!c) {
      c = document.createElement('div');
      c.id = 'trash-toast-container';
      c.style.cssText = `
        position:fixed; right:16px; bottom:16px; z-index:10000;
        display:flex; flex-direction:column; gap:8px;
        pointer-events:none;
      `;
      document.body.appendChild(c);
    }
    return c;
  }

  function showUndoToast(label, undoFn, commitFn) {
    const id = Date.now() + Math.random();
    const container = ensureContainer();

    const el = document.createElement('div');
    el.style.cssText = `
      pointer-events:auto; min-width:280px; max-width:360px;
      background:#18120a; color:#fff; border-radius:12px;
      padding:12px 14px; box-shadow:0 8px 24px rgba(0,0,0,.3);
      font-family:'Noto Sans KR',sans-serif; font-size:13px;
      display:flex; align-items:center; gap:10px;
      animation:slideInTrash .25s ease;
      position:relative; overflow:hidden;
    `;
    el.innerHTML = `
      <style>
        @keyframes slideInTrash { from { transform:translateX(20px); opacity:0 } to { transform:translateX(0); opacity:1 } }
        @keyframes trashProgress { from { width:100% } to { width:0% } }
      </style>
      <span style="font-size:16px; flex-shrink:0">🗑️</span>
      <span style="flex:1; line-height:1.4">${label}</span>
      <button style="background:var(--gold); color:#fff; border:none;
        border-radius:6px; padding:6px 12px; font-size:12px; font-weight:700;
        cursor:pointer; font-family:'Noto Sans KR',sans-serif;
        flex-shrink:0">되돌리기</button>
      <div style="position:absolute; bottom:0; left:0; height:2px;
        background:var(--gold);
        animation:trashProgress ${UNDO_WINDOW_MS}ms linear forwards"></div>
    `;
    const btn = el.querySelector('button');

    const entry = { id, label, el, undoFn, commitFn, committed: false };

    btn.addEventListener('click', () => {
      // 되돌리기
      entry.committed = true; // commit 안 되게 표시
      clearTimeout(entry.timer);
      try { undoFn(); } catch(e) {}
      removeToast(entry);
      if (typeof toast === 'function') toast('되돌렸어요');
    });

    entry.timer = setTimeout(() => {
      // 시간 만료 → 진짜 삭제 commit
      if (entry.committed) return;
      entry.committed = true;
      try { commitFn(); } catch(e) {}
      removeToast(entry);
    }, UNDO_WINDOW_MS);

    container.appendChild(el);
    _trashStack.push(entry);
  }

  function removeToast(entry) {
    if (!entry.el) return;
    entry.el.style.transition = 'opacity .2s, transform .2s';
    entry.el.style.opacity = '0';
    entry.el.style.transform = 'translateX(20px)';
    setTimeout(() => {
      entry.el?.remove();
      entry.el = null;
      _trashStack = _trashStack.filter(e => e.id !== entry.id);
    }, 200);
  }

  // ─── deleteChapter 덮어쓰기 ─────────────────────────────────────
  const _origDeleteChapter = window.deleteChapter;
  window.deleteChapter = function (id) {
    const p = getProject();
    if (!p) return;
    const idx = p.chapters.findIndex(c => c.id === id);
    if (idx === -1) return;

    const chapter = p.chapters[idx];
    const snapshot = JSON.parse(JSON.stringify(chapter));
    const wasActive = (activeChapterId === id);
    const projId = p.id;

    // 즉시 UI 에서 제거 (화면은 이미 사라진 것처럼)
    p.chapters.splice(idx, 1);
    if (wasActive) activeChapterId = p.chapters[0]?.id || null;
    autoSave();
    if (typeof renderChapters === 'function') renderChapters();

    showUndoToast(
      `"${chapter.title || '제목 없음'}" 삭제됨`,
      // undo
      () => {
        const proj = state.projects.find(pp => pp.id === projId);
        if (!proj) return;
        // 같은 자리에 복원 (idx 가 유효하지 않을 수 있음 → clamp)
        const insertAt = Math.min(idx, proj.chapters.length);
        proj.chapters.splice(insertAt, 0, snapshot);
        if (wasActive) activeChapterId = snapshot.id;
        autoSave();
        if (typeof renderChapters === 'function') renderChapters();
      },
      // commit — 영구 삭제 확정 시점. 고아 참조 정리.
      () => {
        const proj = state.projects.find(pp => pp.id === projId);
        if (!proj) return;
        // 사건 일지에서 이 회차를 참조하던 chapterId 비움
        let cleaned = 0;
        (proj.chronicles || []).forEach(ev => {
          if (ev.chapterId === id) { ev.chapterId = ''; cleaned++; }
        });
        if (cleaned > 0) autoSave();
      }
    );
  };

  // ─── deleteProject 덮어쓰기 ─────────────────────────────────────
  // 원본은 confirmDialog 를 이미 쓰고 있음. confirmDialog 은 건드리지 않고
  // 내부 로직만 교체: 삭제 즉시 휴지통으로 이동.
  const _origDeleteProject = window.deleteProject;
  window.deleteProject = function (id) {
    const idx = state.projects.findIndex(p => p.id === id);
    if (idx === -1) return;

    // 원본은 confirmDialog 로 물어보니 우리도 그 UX 유지
    if (typeof confirmDialog === 'function') {
      confirmDialog('이 작품을 삭제합니다. 10초 내에 되돌릴 수 있어요.', () => {
        performDeleteProject(id);
      });
    } else {
      if (!confirm('이 작품을 삭제합니다. 10초 내에 되돌릴 수 있어요.')) return;
      performDeleteProject(id);
    }
  };

  const _origDeleteProjectByIndex = window.deleteProjectByIndex;
  window.deleteProjectByIndex = function (idx) {
    const proj = state.projects[idx];
    if (!proj) return;
    if (typeof confirmDialog === 'function') {
      confirmDialog('이 작품을 삭제합니다. 10초 내에 되돌릴 수 있어요.', () => {
        performDeleteProject(proj.id);
      });
    } else {
      if (!confirm('이 작품을 삭제합니다. 10초 내에 되돌릴 수 있어요.')) return;
      performDeleteProject(proj.id);
    }
  };

  function performDeleteProject(id) {
    const idx = state.projects.findIndex(p => p.id === id);
    if (idx === -1) return;
    const proj = state.projects[idx];
    const snapshot = JSON.parse(JSON.stringify(proj));

    state.projects.splice(idx, 1);
    // 활성 프로젝트가 지워지면 홈으로
    if (state.activeProjectId === id) {
      state.activeProjectId = null;
      if (typeof goHome === 'function') goHome();
    } else {
      if (typeof renderHome === 'function') renderHome();
    }
    saveToStorage();

    showUndoToast(
      `"${proj.title || '작품'}" 삭제됨`,
      () => {
        // 원위치 복원
        const insertAt = Math.min(idx, state.projects.length);
        state.projects.splice(insertAt, 0, snapshot);
        saveToStorage();
        if (typeof renderHome === 'function') renderHome();
      },
      () => {}
    );
  }

  // ─── 페이지 나갈 때 미결 commit 강제 실행 ───────────────────────
  // 복원 창이 열려있는 상태로 탭 닫히면 진짜 삭제가 아직 안 된
  // '지워진 듯 안 지워진' 상태 — 이미 state 에선 빠져있고
  // saveToStorage 도 호출됐으니 실질 문제 없음. 토스트만 정리.
  window.addEventListener('pagehide', () => {
    _trashStack.forEach(e => {
      if (!e.committed) { try { e.commitFn(); } catch(err) {} }
    });
    _trashStack = [];
  });
})();
