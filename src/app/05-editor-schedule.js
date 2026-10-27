// CHAPTERS (EDITOR)
// ═══════════════════════════════════════════════════════════════
let activeChapterId = null;

function renderChapters() {
  const p = getProject();
  const chapters = p.chapters || [];
  const folders = p.chapterFolders || [];
  const ch = chapters.find(c => c.id === activeChapterId) || chapters[0];
  if (ch) activeChapterId = ch.id;

  // 폴더 접힘 상태
  if (!window._folderCollapsed) window._folderCollapsed = {};

  // 화 ID → 연결된 심리 단계 목록 (인물별)
  const psyByChapter = new Map(); // chapterId → [{emotion, charName, charColor, title}]
  (p.psyArcs || []).forEach(arc => {
    const charColor = arc.charName ? getCharColor(arc.charName, p) : 'var(--gold)';
    (arc.steps || []).forEach(s => {
      if (!s.chapterId) return;
      if (!psyByChapter.has(s.chapterId)) psyByChapter.set(s.chapterId, []);
      psyByChapter.get(s.chapterId).push({
        emotion: s.emotion,
        charName: arc.charName || '',
        charColor,
        title: s.title || '',
      });
    });
  });

  // 화 ID → 연결된 플롯 장면 목록
  const sceneByChapter = new Map();
  (p.arcs || []).forEach(arc => {
    (arc.scenes || []).forEach(s => {
      if (!s.chapterId) return;
      if (!sceneByChapter.has(s.chapterId)) sceneByChapter.set(s.chapterId, []);
      sceneByChapter.get(s.chapterId).push({
        arcTitle: arc.title || '',
        title: s.title || '',
        type: s.type || '',
      });
    });
  });

  function chapterItem(c) {
    const psyList = psyByChapter.get(c.id) || [];
    const sceneList = sceneByChapter.get(c.id) || [];
    // 한 화에 여러 인물의 심리 변화가 있을 수 있으니 인물별로 작은 점을 나열
    const psyBadge = psyList.length > 0
      ? `<span title="${esc(psyList.map(x => `${PSY_EMOTION_ICONS[x.emotion]||'💭'} ${x.charName?x.charName+': ':''}${x.title}`).join('\n'))}"
              style="display:inline-flex;align-items:center;gap:1px;flex-shrink:0">
           ${psyList.slice(0,3).map(x => `<span style="width:7px;height:7px;border-radius:50%;background:${x.charColor};display:inline-block"></span>`).join('')}
           <span style="font-size:9px;margin-left:1px">💭</span>
         </span>`
      : '';
    const sceneBadge = sceneList.length > 0
      ? `<span title="${esc(sceneList.map(x => `💠 [${x.arcTitle}] ${x.title}${x.type?` (${x.type})`:''}`).join('\n'))}"
              style="display:inline-flex;align-items:center;flex-shrink:0;font-size:10px;color:var(--teal);font-weight:700">
           💠${sceneList.length>1?`<span style="font-size:9px;margin-left:1px">${sceneList.length}</span>`:''}
         </span>`
      : '';
    return `
      <div class="chapter-item ch-drag-item ${c.id===activeChapterId?'active':''}"
        data-chid="${c.id}" data-folderid="${c.folderId||''}"
        onclick="selectChapter('${c.id}')">
        <div style="display:flex;align-items:center;gap:4px">
          <span class="ch-drag-handle" data-chid="${c.id}"
            style="color:var(--border);font-size:13px;cursor:grab;flex-shrink:0;
              touch-action:none;user-select:none;padding:0 2px">⠿</span>
          <div style="flex:1;min-width:0">
            <div class="chapter-item-title" style="display:flex;align-items:center;gap:5px">
              <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(c.title)}</span>
              ${sceneBadge}
              ${psyBadge}
            </div>
            ${c.summary ? `<div class="ch-summary-tip" style="font-size:10px;color:var(--muted);margin-bottom:2px;
              overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
              font-style:italic;line-height:1.4;cursor:default"
              data-summary="${esc(c.summary)}">${esc(c.summary)}</div>` : ''}
            <div class="chapter-item-meta">
              <span>${(c.content||'').length.toLocaleString()}자</span>
              <span class="status-badge s-${esc(c.status)}" style="font-size:10px;padding:1px 6px">${esc(c.status)}</span>
            </div>
          </div>
        </div>
      </div>`;
  }

  // 폴더 없는 화
  const noFolder = chapters.filter(c => !c.folderId);
  // 폴더별 화
  let listHtml = '';

  // 폴더 없는 화 먼저
  noFolder.forEach(c => { listHtml += chapterItem(c); });

  // 폴더
  folders.forEach(f => {
    const collapsed = window._folderCollapsed[f.id] || false;
    const fChapters = chapters.filter(c => c.folderId === f.id);
    listHtml += `
      <div class="ch-folder cf-drag-item" data-folderid="${f.id}">
        <div class="ch-folder-header" onclick="toggleChFolder('${f.id}')">
          <span class="cf-drag-handle" data-folderid="${f.id}"
            style="color:var(--border);font-size:13px;cursor:grab;flex-shrink:0;
              touch-action:none;user-select:none;padding:0 2px"
            onclick="event.stopPropagation()">⠿</span>
          <span style="font-size:10px;transition:transform .2s;display:inline-block;transform:rotate(${collapsed?'-90':'0'}deg);color:var(--muted)">▾</span>
          <span style="font-size:11px;font-weight:700;color:var(--muted);flex:1;
            overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(f.name)}</span>
          <span style="font-size:10px;color:var(--border)">${fChapters.length}</span>
          <button onclick="event.stopPropagation();renameFolderPrompt('${f.id}')"
            style="background:none;border:none;cursor:pointer;color:var(--muted);font-size:11px;padding:0 2px">✏️</button>
          <button onclick="event.stopPropagation();deleteFolder('${f.id}')"
            style="background:none;border:none;cursor:pointer;color:var(--rust);font-size:12px;font-weight:700;padding:0 2px">×</button>
        </div>
        ${collapsed ? '' : `<div class="ch-folder-body">${fChapters.map(chapterItem).join('')}</div>`}
      </div>`;
  });

  // 모바일용 화 선택 옵션 생성
  const chOptions = chapters.map(c => {
    const folder = (p.chapterFolders||[]).find(f => f.id === c.folderId);
    const prefix = folder ? `[${folder.name}] ` : '';
    return `<option value="${c.id}" ${c.id===activeChapterId?'selected':''}>${prefix}${esc(c.title)}</option>`;
  }).join('');

  document.getElementById('main').innerHTML = `
    <div class="editor-wrap">
      <!-- 모바일 화 선택바 -->
      <div class="mobile-chapter-bar" style="display:none">
        <button class="btn btn-outline btn-sm" onclick="toggleMobileChapterPanel()"
          style="padding:8px 12px;font-size:13px;font-weight:700">☰ 목록</button>
        <div style="flex:1;font-size:13px;font-weight:700;color:var(--ink);
          overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:0 4px">
          ${ch ? esc(ch.title) : '화 없음'}
        </div>
        <button class="btn btn-gold btn-sm" onclick="newChapter()" style="padding:8px 12px;font-size:16px;font-weight:700">＋</button>
      </div>
      <!-- 데스크탑 화 목록 -->
      <div class="chapter-list-wrap" id="chapter-list-wrap">
        <div class="chapter-list" id="chapter-list">
          <div class="chapter-list-header">
            <span style="font-size:12px;font-weight:700;color:var(--muted)">목록</span>
            <div style="display:flex;gap:4px">
              <button class="btn btn-outline btn-sm" onclick="newFolder()" title="폴더 추가"
                style="padding:3px 7px;font-size:11px">📁</button>
              <button class="btn btn-gold btn-sm" onclick="newChapter()">＋</button>
            </div>
          </div>
          <div class="chapter-list-body" id="chapter-list-body">
            ${chapters.length===0
              ? '<div style="text-align:center;color:var(--muted);font-size:12px;padding:20px 0">화를 추가하세요</div>'
              : listHtml}
          </div>
        </div>
        <button id="chapter-collapse-btn" onclick="toggleChapterList()" title="목록 접기/펼치기">◀</button>
      </div>
      <div class="editor-area" id="editor-area">
        ${ch ? renderEditorContent(ch) : `
          <div style="flex:1;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:12px;color:var(--muted)">
            <div style="font-size:36px">✍️</div>
            <div>화를 선택하거나 새로 추가하세요</div>
          </div>`}
      </div>
    </div>`;
  const prevScroll = document.getElementById('chapter-list-body')?.scrollTop || 0;
  const prevMobileScroll = document.getElementById('mobile-chapter-list-body')?.scrollTop || 0;
  setTimeout(() => {
    refreshShortcutBar(); applyEditorFontSize(); initChDrag(); initAllDragScrolls();
    if (typeof updateTypewriterButtons === 'function') updateTypewriterButtons();
    const listBody = document.getElementById('chapter-list-body');
    if (listBody) listBody.scrollTop = prevScroll;
    // 모바일 패널 바디 업데이트
    const mobileBody = document.getElementById('mobile-chapter-list-body');
    if (mobileBody) {
      mobileBody.innerHTML = chapters.length === 0
        ? '<div style="text-align:center;color:var(--muted);font-size:12px;padding:20px 0">화를 추가하세요</div>'
        : listHtml;
      mobileBody.scrollTop = prevMobileScroll;
      initChDrag();
    }
    // 모바일 상단 현재 화 이름 업데이트
    const mobileTitle = document.querySelector('.mobile-chapter-bar div[style*="flex:1"]');
    if (mobileTitle && ch) mobileTitle.textContent = ch.title;
  }, 0);
}

function renderEditorContent(ch) {
  return `
    <div style="display:flex;flex:1;overflow:hidden;">
      <!-- 왼쪽: 툴바 + 단축키 + 에디터 -->
      <div style="flex:1;display:flex;flex-direction:column;overflow:hidden;">
        <div class="editor-toolbar">
          <input id="chapter-title-input" value="${esc(ch.title)}" onchange="updateChapter('${ch.id}','title',this.value)"
            style="width:160px;font-weight:700;font-size:14px;flex-shrink:0">
          <select onchange="updateChapter('${ch.id}','status',this.value)" style="width:90px;font-size:12px;flex-shrink:0">
            ${selOpts(CH_STATUSES, ch.status||'초안')}
          </select>
          <span class="wordcount" id="wc-display">${(ch.content||'').length.toLocaleString()}자</span>
          <div class="editor-toolbar-spacer"></div>
          <button class="btn btn-outline btn-sm" onclick="toggleSplitPanel()" id="split-toggle-btn" title="참고 패널" style="font-size:12px">⊞ 참고</button>
          <button class="btn btn-outline btn-sm typewriter-toggle" onclick="toggleTypewriterScrolling()" aria-pressed="false" title="입력 중인 줄을 화면 가운데에 유지" style="font-size:12px">⌖ 타자기 스크롤</button>
          <button class="btn btn-outline btn-sm" onclick="enterFocusMode()" title="집중 모드" style="font-size:13px">⛶ 집중</button>
          <details class="editor-more">
            <summary class="btn btn-outline btn-sm" aria-label="추가 집필 도구">⋯ 도구</summary>
            <div class="editor-more-actions">
              <button class="btn btn-outline btn-sm" onclick="this.closest('details').open=false;toggleFindReplace()" id="find-replace-btn" title="찾기/바꾸기 (Ctrl+H)">🔍 찾기</button>
              <div class="editor-font-controls">
                <button onclick="changeFontSize(-1)" aria-label="글자 크기 줄이기">−</button>
                <span id="font-size-display">16px</span>
                <button onclick="changeFontSize(1)" aria-label="글자 크기 키우기">＋</button>
              </div>
              <button class="btn btn-outline btn-sm" onclick="this.closest('details').open=false;togglePomodoro()" id="pomo-toolbar-btn" title="뽀모도로 타이머">🍅 집필</button>
              <button class="btn btn-outline btn-sm" id="sym-toggle-btn" onclick="this.closest('details').open=false;toggleSymbolPalette()">✦ 기호</button>
              <button class="btn btn-outline btn-sm" onclick="this.closest('details').open=false;deleteChapter('${ch.id}')" style="color:var(--rust);border-color:rgba(181,69,27,.25)">삭제</button>
            </div>
          </details>
          <div class="symbol-palette" id="symbol-palette" style="display:none;flex-wrap:wrap;"></div>
        </div>
        <div id="shortcut-bar" style="padding:6px 12px;background:var(--cream);border-bottom:1px solid var(--border);display:flex;align-items:center;gap:4px;flex-wrap:wrap;flex-shrink:0;"></div>
        <div style="padding:5px 16px;background:var(--gold-light);border-bottom:1px solid var(--border);display:flex;align-items:center;gap:8px;flex-shrink:0">
          <span style="font-size:11px;color:var(--muted);white-space:nowrap;flex-shrink:0">📝 회차 요약</span>
          <input id="chapter-summary-input" value="${esc(ch.summary||'')}"
            placeholder="이 화의 핵심 내용을 한 줄로 요약하세요 (화 목록에 표시됩니다)"
            onchange="updateChapter('${ch.id}','summary',this.value)"
            style="flex:1;font-size:12px;padding:4px 8px;border-radius:6px;background:var(--white);border:1px solid var(--border);color:var(--ink)">
        </div>
        <div id="find-replace-panel" style="display:none;padding:10px 16px;background:var(--cream);border-bottom:1.5px solid var(--border);flex-shrink:0">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
            <div style="display:flex;align-items:center;gap:6px;flex:1;min-width:200px">
              <input id="fr-find" placeholder="찾을 내용" style="flex:1;min-width:80px;padding:6px 10px;font-size:13px"
                oninput="frHighlight(false)" onkeydown="if(event.key==='Enter')frNext()">
              <span id="fr-count" style="font-size:11px;color:var(--muted);white-space:nowrap;min-width:40px"></span>
              <button class="btn btn-outline btn-sm" onclick="frPrev()" title="이전">↑</button>
              <button class="btn btn-outline btn-sm" onclick="frNext()" title="다음">↓</button>
            </div>
            <div style="display:flex;align-items:center;gap:6px;flex:1;min-width:200px">
              <input id="fr-replace" placeholder="바꿀 내용" style="flex:1;min-width:80px;padding:6px 10px;font-size:13px">
              <button class="btn btn-outline btn-sm" onclick="frReplace()">바꾸기</button>
              <button class="btn btn-gold btn-sm" onclick="frReplaceAll()">모두 바꾸기</button>
            </div>
            <div style="display:flex;align-items:center;gap:8px">
              <button onclick="closeFindReplace()" style="background:none;border:none;cursor:pointer;color:var(--muted);font-size:18px;line-height:1;padding:0 4px">×</button>
            </div>
          </div>
        </div>
        <div class="editor-content" style="flex:1;overflow-y:auto;">
          <textarea id="prose-editor" placeholder="이야기를 시작하세요..."
            oninput="onEditorInput('${ch.id}',this.value)">${esc(ch.content||'')}</textarea>
        </div>
      </div>
      <!-- 오른쪽: 참고 패널 -->
      <div id="split-panel" class="hidden" style="display:flex;flex-direction:column;">
        <div class="split-panel-tabs" id="split-tabs" style="overflow-x:auto;flex-wrap:nowrap;display:flex;align-items:center">
          <div style="display:flex;flex:1;overflow-x:auto;flex-wrap:nowrap">
            <button class="split-tab active" onclick="switchSplitTab('overview')">📋 개요</button>
            <button class="split-tab" onclick="switchSplitTab('world')">🌍 세계관</button>
            <button class="split-tab" onclick="switchSplitTab('plot')">📐 플롯</button>
            <button class="split-tab" onclick="switchSplitTab('characters')">👤 인물</button>
            <button class="split-tab" onclick="switchSplitTab('relations')">🔗 관계도</button>
            <button class="split-tab" onclick="switchSplitTab('family')">🏰 가문</button>
            <button class="split-tab" onclick="switchSplitTab('glossary')">📖 용어</button>
            <button class="split-tab" onclick="switchSplitTab('items')">📦 아이템</button>
            <button class="split-tab" onclick="switchSplitTab('memo')">📝 메모</button>
          </div>
          <button onclick="toggleSplitPanel()" class="split-panel-close-btn"
            style="display:none;flex-shrink:0;padding:6px 10px;background:none;border:none;
              font-size:18px;color:var(--muted);cursor:pointer;line-height:1">×</button>
        </div>
        <div class="split-panel-content" id="split-content"></div>
        <!-- 화별 메모 고정 -->
        <div style="flex-shrink:0;border-top:1.5px solid var(--border);background:var(--cream)">
          <div style="display:flex;align-items:center;justify-content:space-between;
            padding:6px 14px;cursor:pointer;user-select:none"
            onclick="toggleChapterMemo()">
            <span style="font-size:11px;font-weight:700;color:var(--muted)">
              📝 <span style="color:var(--gold)" id="ch-memo-title">${esc(ch.title)}</span>의 메모
            </span>
            <span id="ch-memo-arrow" style="font-size:10px;color:var(--muted);
              transition:transform .2s;display:inline-block;
              transform:rotate(${ch.memo?'0':'-90'}deg)">▾</span>
          </div>
          <div id="ch-memo-body" style="display:${ch.memo?'block':'none'};padding:0 10px 10px">
            <textarea id="ch-memo-input" rows="3" placeholder="이 화에 대한 메모..."
              oninput="updateChapterMemo('${ch.id}', this.value)"
              style="width:100%;font-size:12px;line-height:1.8;resize:vertical;
                background:var(--white);border:1.5px solid var(--border);border-radius:8px;
                padding:7px 10px;font-family:'Noto Serif KR',serif;color:var(--ink)">${esc(ch.memo||'')}</textarea>
          </div>
        </div>
      </div>
    </div>`;
}

function toggleChapterMemo() {
  const body = document.getElementById('ch-memo-body');
  const arrow = document.getElementById('ch-memo-arrow');
  if (!body) return;
  const isHidden = body.style.display === 'none';
  body.style.display = isHidden ? 'block' : 'none';
  if (arrow) arrow.style.transform = isHidden ? 'rotate(0deg)' : 'rotate(-90deg)';
  if (isHidden) document.getElementById('ch-memo-input')?.focus();
}

function updateChapterMemo(chId, val) {
  const p = getProject();
  const ch = (p.chapters||[]).find(c => c.id === chId);
  if (!ch) return;
  ch.memo = val;
  clearTimeout(window._chMemoTimer);
  window._chMemoTimer = setTimeout(autoSave, 600);
}

function onEditorInput(id, val) {
  const p = getProject();
  const ch = p.chapters.find(c => c.id === id);
  if (!ch) return;
  const prevLen = (ch.content || '').length;
  ch.content = val;
  const wc = document.getElementById('wc-display');
  if (wc) wc.textContent = val.length.toLocaleString() + '자';
  // 날짜별 집필량 기록
  const diff = val.length - prevLen;
  if (diff > 0) recordDailyWriting(diff);
  // debounce save
  clearTimeout(window._saveTimer);
  window._saveTimer = setTimeout(() => { autoSave(); updateChapterListItem(ch); }, 800);
}

function updateChapterListItem(ch) {
  // refresh chapter list meta without full re-render
  const items = document.querySelectorAll('.chapter-item');
  items.forEach(el => {
    if (el.querySelector('.chapter-item-title')?.textContent === ch.title) {
      const meta = el.querySelector('.chapter-item-meta span');
      if (meta) meta.textContent = (ch.content||'').length.toLocaleString() + '자';
    }
  });
}

function selectChapter(id) {
  activeChapterId = id;
  const sp = document.getElementById('split-panel');
  const wasOpen = sp && !sp.classList.contains('hidden');
  const savedScroll = document.getElementById('chapter-list-body')?.scrollTop || 0;
  renderChapters();
  const sp2 = document.getElementById('split-panel');
  if (sp2) {
    if (wasOpen) sp2.classList.remove('hidden');
    else sp2.classList.add('hidden');
  }
  setTimeout(() => {
    const lb = document.getElementById('chapter-list-body');
    if (lb) lb.scrollTop = savedScroll;
    refreshChapterMemoPanel();
  }, 0);
  // 모바일: 패널 닫고 에디터로 이동
  if (window.innerWidth <= 768) {
    const panel = document.getElementById('mobile-chapter-panel');
    if (panel?.classList.contains('open')) toggleMobileChapterPanel();
    setTimeout(() => {
      const ea = document.getElementById('editor-area');
      if (ea) ea.scrollIntoView({behavior:'smooth'});
    }, 100);
  }
}

function refreshChapterMemoPanel() {
  const p = getProject();
  const ch = (p?.chapters||[]).find(c => c.id === activeChapterId);
  if (!ch) return;
  const title = document.getElementById('ch-memo-title');
  const input = document.getElementById('ch-memo-input');
  const body  = document.getElementById('ch-memo-body');
  const arrow = document.getElementById('ch-memo-arrow');
  if (title) title.textContent = ch.title;
  if (input) {
    input.value = ch.memo || '';
    input.oninput = () => updateChapterMemo(ch.id, input.value);
  }
  if (body)  body.style.display = ch.memo ? 'block' : 'none';
  if (arrow) arrow.style.transform = ch.memo ? 'rotate(0deg)' : 'rotate(-90deg)';
}

// 폴더 기능
// 폴더 드래그 앤 드롭
let _cfDrag = null;

function cfTouchStart(e) {
  e.preventDefault();
  cfDragInit(e.currentTarget, e.touches[0].clientY);
  document.addEventListener('touchmove', cfTouchMove, {passive: false});
  document.addEventListener('touchend', cfTouchEnd, {once: true});
}
function cfMouseStart(e) {
  cfDragInit(e.currentTarget, e.clientY);
  document.addEventListener('mousemove', cfMouseMove);
  document.addEventListener('mouseup', cfMouseEnd, {once: true});
}
function cfDragInit(handle, clientY) {
  const fid = handle.dataset.folderid;
  const row = handle.closest('.cf-drag-item');
  const rect = row.getBoundingClientRect();
  const name = row.querySelector('.ch-folder-header span:nth-child(3)')?.textContent || '';
  const ghost = document.createElement('div');
  ghost.style.cssText = `position:fixed;left:${rect.left}px;top:${rect.top}px;
    width:${rect.width}px;z-index:9999;pointer-events:none;
    background:var(--gold-light);border:1.5px solid var(--gold);
    border-radius:7px;padding:6px 10px;font-size:11px;font-weight:700;
    color:var(--ink);box-shadow:0 4px 16px rgba(0,0,0,.2)`;
  ghost.textContent = '📁 ' + name;
  document.body.appendChild(ghost);
  row.style.opacity = '0.3';
  _cfDrag = { fid, el: row, ghost, offsetY: clientY - rect.top };
}
function cfTouchMove(e) { e.preventDefault(); if (_cfDrag) cfDragMove(e.touches[0].clientY); }
function cfMouseMove(e) { if (_cfDrag) cfDragMove(e.clientY); }
function cfDragMove(clientY) {
  const { ghost, offsetY } = _cfDrag;
  ghost.style.top = (clientY - offsetY) + 'px';
  document.querySelectorAll('.cf-drag-item').forEach(r => r.style.borderTop = '');
  const items = [...document.querySelectorAll('.cf-drag-item')];
  let insertBefore = null;
  for (let i = 0; i < items.length; i++) {
    const r = items[i].getBoundingClientRect();
    if (clientY < r.top + r.height / 2) {
      if (items[i] !== _cfDrag.el) {
        items[i].style.borderTop = '2px solid var(--gold)';
        insertBefore = items[i].dataset.folderid;
      }
      break;
    }
    if (i === items.length - 1) insertBefore = '__end__';
  }
  _cfDrag.insertBefore = insertBefore;
}
function cfTouchEnd() { document.removeEventListener('touchmove', cfTouchMove); cfDragCommit(); }
function cfMouseEnd() { document.removeEventListener('mousemove', cfMouseMove); cfDragCommit(); }
function cfDragCommit() {
  if (!_cfDrag) return;
  const { fid, el, ghost, insertBefore } = _cfDrag;
  _cfDrag = null;
  ghost.remove();
  el.style.opacity = '';
  document.querySelectorAll('.cf-drag-item').forEach(r => r.style.borderTop = '');

  const p = getProject();
  const folders = p.chapterFolders || [];
  const fromIdx = folders.findIndex(f => f.id === fid);
  if (fromIdx === -1 || !insertBefore) { renderChapters(); return; }

  if (insertBefore !== '__end__') {
    const toIdx = folders.findIndex(f => f.id === insertBefore);
    if (toIdx !== -1 && toIdx !== fromIdx) {
      const [item] = folders.splice(fromIdx, 1);
      const newTo = folders.findIndex(f => f.id === insertBefore);
      folders.splice(newTo, 0, item);
    }
  } else {
    const [item] = folders.splice(fromIdx, 1);
    folders.push(item);
  }
  autoSave(); renderChapters();
  setTimeout(initChDrag, 50);
}

function newFolder() {
  showModal(`
    <div class="modal-title">폴더 추가</div>
    <div style="margin-bottom:20px">
      <label class="label">폴더 이름 *</label>
      <input id="folder-name-input" placeholder="예: 1부, 프롤로그, 외전" autofocus>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="closeModal()">취소</button>
      <button class="btn btn-gold" onclick="confirmNewFolder()">추가</button>
    </div>`, false);
  setTimeout(() => document.getElementById('folder-name-input')?.focus(), 100);
}
function confirmNewFolder() {
  const name = document.getElementById('folder-name-input')?.value.trim();
  if (!name) { toast('폴더 이름을 입력해주세요.'); return; }
  const p = getProject();
  if (!p.chapterFolders) p.chapterFolders = [];
  p.chapterFolders.push({ id: uid(), name });
  autoSave(); closeModal();
  const body = document.getElementById('chapter-list-body');
  const scrollTop = body ? body.scrollTop : 0;
  renderChapters();
  setTimeout(() => {
    const newBody = document.getElementById('chapter-list-body');
    if (newBody) newBody.scrollTop = scrollTop;
  }, 0);
}

function toggleChFolder(fid) {
  if (!window._folderCollapsed) window._folderCollapsed = {};
  window._folderCollapsed[fid] = !window._folderCollapsed[fid];
  renderChapters();
}

function renameFolderPrompt(fid) {
  const p = getProject();
  const f = (p.chapterFolders||[]).find(x => x.id === fid);
  if (!f) return;
  showModal(`
    <div class="modal-title">폴더 이름 변경</div>
    <div style="margin-bottom:20px">
      <label class="label">새 이름 *</label>
      <input id="folder-rename-input" value="${esc(f.name)}" placeholder="폴더 이름">
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="closeModal()">취소</button>
      <button class="btn btn-gold" onclick="confirmRenameFolder('${fid}')">저장</button>
    </div>`, false);
  setTimeout(() => document.getElementById('folder-rename-input')?.focus(), 100);
}
function confirmRenameFolder(fid) {
  const name = document.getElementById('folder-rename-input')?.value.trim();
  if (!name) { toast('이름을 입력해주세요.'); return; }
  const p = getProject();
  const f = (p.chapterFolders||[]).find(x => x.id === fid);
  if (f) { f.name = name; autoSave(); closeModal(); renderChapters(); }
}

function deleteFolder(fid) {
  confirmDialog('폴더를 삭제합니다. 안의 화는 폴더 밖으로 이동해요.', () => {
    const p = getProject();
    (p.chapters||[]).forEach(c => { if (c.folderId === fid) delete c.folderId; });
    p.chapterFolders = (p.chapterFolders||[]).filter(f => f.id !== fid);
    autoSave(); renderChapters();
  });
}

// 화 드래그 앤 드롭
let _chDrag = null;

function initDragScroll(el) {
  if (!el || el._dragScroll) return;
  el._dragScroll = true;
  el.style.cursor = 'grab';

  let startX, scrollLeft, dragging = false, moved = false;

  el.addEventListener('mousedown', e => {
    dragging = true; moved = false;
    startX = e.clientX;
    scrollLeft = el.scrollLeft;
    el.style.cursor = 'grabbing';
    e.preventDefault(); // 텍스트 선택 방지
  });

  window.addEventListener('mousemove', e => {
    if (!dragging) return;
    const dx = e.clientX - startX;
    if (Math.abs(dx) > 3) moved = true;
    if (moved) el.scrollLeft = scrollLeft - dx;
  });

  window.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    el.style.cursor = 'grab';
  });

  // 드래그 후 탭 클릭 방지
  el.addEventListener('click', e => {
    if (moved) { e.stopPropagation(); e.preventDefault(); moved = false; }
  }, true);
}

function initAllDragScrolls() {
  document.querySelectorAll('.split-panel-tabs').forEach(el => {
    el._dragScroll = false; // 재초기화 허용
    initDragScroll(el);
  });
}

function initChDrag() {
  document.querySelectorAll('.ch-drag-handle').forEach(h => {
    h.addEventListener('touchstart', chTouchStart, {passive: false});
    h.addEventListener('mousedown', chMouseStart);
  });
  document.querySelectorAll('.cf-drag-handle').forEach(h => {
    h.addEventListener('touchstart', cfTouchStart, {passive: false});
    h.addEventListener('mousedown', cfMouseStart);
  });
  initSummaryTooltip();
}
// ═══════════════════════════════════════════════════════════
// 회차 요약 툴팁 (마우스 호버 + 터치 꾹 누르기)
// ═══════════════════════════════════════════════════════════
// 실제 마우스 이동 여부 추적
let _mouseEverMoved = false;
document.addEventListener('mousemove', () => { _mouseEverMoved = true; }, { once: true });

function initSummaryTooltip() {
  document.querySelectorAll('.ch-summary-tip').forEach(el => {
    el.addEventListener('mouseover', e => {
      if (!_mouseEverMoved) return;
      showSummaryTip(el, e.clientX, e.clientY);
    });
    el.addEventListener('mousemove', e => {
      moveSummaryTip(e.clientX, e.clientY);
    });
    el.addEventListener('mouseout', () => hideSummaryTip());
    el.addEventListener('click', () => hideSummaryTip());
  });
  document.addEventListener('touchstart', () => {
    _mouseEverMoved = false;
    hideSummaryTip();
  }, { passive: true });
}

function showSummaryTip(el, cx, cy) {
  const text = el.dataset.summary;
  if (!text) return;
  let tip = document.getElementById('ch-summary-tooltip');
  if (!tip) {
    tip = document.createElement('div');
    tip.id = 'ch-summary-tooltip';
    document.body.appendChild(tip);
  }
  tip.textContent = text;
  moveSummaryTip(cx, cy);
  requestAnimationFrame(() => { tip.style.opacity = '1'; });
}

function moveSummaryTip(cx, cy) {
  const tip = document.getElementById('ch-summary-tooltip');
  if (!tip || tip.style.opacity === '0') return;
  // 일단 화면 밖에 배치해서 실제 크기 측정
  tip.style.left = '0px';
  tip.style.top = '-9999px';
  tip.style.opacity = '1';
  const tw = tip.offsetWidth;
  const th = tip.offsetHeight;
  const margin = 8;
  // X: 커서 오른쪽 우선, 화면 넘으면 왼쪽
  let x = cx + 14;
  if (x + tw + margin > window.innerWidth) x = cx - tw - 10;
  if (x < margin) x = margin;
  // Y: 커서 아래 우선, 화면 넘으면 위
  let y = cy + 18;
  if (y + th + margin > window.innerHeight) y = cy - th - 10;
  if (y < margin) y = margin;
  tip.style.left = x + 'px';
  tip.style.top  = y + 'px';
}

function hideSummaryTip() {
  const tip = document.getElementById('ch-summary-tooltip');
  if (tip) tip.style.opacity = '0';
}

function chTouchStart(e) {
  e.preventDefault();
  chDragInit(e.currentTarget, e.touches[0].clientY);
  document.addEventListener('touchmove', chTouchMove, {passive: false});
  document.addEventListener('touchend', chTouchEnd, {once: true});
}
function chMouseStart(e) {
  chDragInit(e.currentTarget, e.clientY);
  document.addEventListener('mousemove', chMouseMove);
  document.addEventListener('mouseup', chMouseEnd, {once: true});
}
function chDragInit(handle, clientY) {
  const chid = handle.dataset.chid;
  const row = handle.closest('.ch-drag-item');
  const rect = row.getBoundingClientRect();
  const title = row.querySelector('.chapter-item-title')?.textContent || '';
  const ghost = document.createElement('div');
  ghost.style.cssText = `position:fixed;left:${rect.left}px;top:${rect.top}px;
    width:${rect.width}px;z-index:9999;pointer-events:none;
    background:var(--gold-light);border:1.5px solid var(--gold);
    border-radius:7px;padding:8px 11px;font-size:12px;font-weight:700;
    color:var(--ink);box-shadow:0 4px 16px rgba(0,0,0,.2)`;
  ghost.textContent = title;
  document.body.appendChild(ghost);
  row.style.opacity = '0.3';
  _chDrag = { chid, el: row, ghost, offsetY: clientY - rect.top };
}
function chTouchMove(e) { e.preventDefault(); if (_chDrag) chDragMove(e.touches[0].clientY); }
function chMouseMove(e) { if (_chDrag) chDragMove(e.clientY); }
function chDragMove(clientY) {
  const { ghost, offsetY } = _chDrag;
  ghost.style.top = (clientY - offsetY) + 'px';

  // 자동 스크롤
  const listBody = document.getElementById('chapter-list-body');
  if (listBody) {
    const r = listBody.getBoundingClientRect();
    const zone = 60;
    const speed = 8;
    if (clientY < r.top + zone) listBody.scrollTop -= speed;
    else if (clientY > r.bottom - zone) listBody.scrollTop += speed;
  }

  document.querySelectorAll('.ch-drag-item').forEach(r => r.style.borderTop = '');
  document.querySelectorAll('.ch-folder').forEach(f => f.style.outline = '');

  const items = [...document.querySelectorAll('.ch-drag-item')];
  const others = items.filter(el => el !== _chDrag.el);

  let insertBefore = '__end__';
  for (let i = 0; i < others.length; i++) {
    const r = others[i].getBoundingClientRect();
    const mid = r.top + r.height / 2;
    if (clientY < mid) {
      insertBefore = others[i].dataset.chid;
      others[i].style.borderTop = '2px solid var(--gold)';
      break;
    }
  }

  // 폴더 헤더 위에 드래그 중이면 해당 폴더 하이라이트
  // insertBefore가 없을 때만 폴더 전체 영역 감지
  let targetFolder = null;
  if (insertBefore === '__end__') {
    document.querySelectorAll('.ch-folder').forEach(f => {
      const r = f.getBoundingClientRect();
      if (clientY >= r.top && clientY <= r.bottom) {
        targetFolder = f.dataset.folderid;
        f.style.outline = '2px solid var(--gold)';
        f.style.outlineOffset = '-2px';
      }
    });
  } else {
    // insertBefore가 있어도 폴더 헤더 위면 폴더 이동 우선
    document.querySelectorAll('.ch-folder').forEach(f => {
      const header = f.querySelector('.ch-folder-header');
      if (!header) return;
      const r = header.getBoundingClientRect();
      if (clientY >= r.top && clientY <= r.bottom) {
        targetFolder = f.dataset.folderid;
        f.style.outline = '2px solid var(--gold)';
        f.style.outlineOffset = '-2px';
        // 폴더 헤더 위면 insertBefore 무시
        document.querySelectorAll('.ch-drag-item').forEach(r => r.style.borderTop = '');
        insertBefore = '__end__';
        _chDrag.insertBefore = '__end__';
      }
    });
  }

  _chDrag.insertBefore = insertBefore;
  _chDrag.targetFolder = targetFolder;
}

function chTouchEnd() { document.removeEventListener('touchmove', chTouchMove); chDragCommit(); }
function chMouseEnd() { document.removeEventListener('mousemove', chMouseMove); chDragCommit(); }
function chDragCommit() {
  if (!_chDrag) return;
  const { chid, el, ghost, insertBefore, targetFolder } = _chDrag;
  _chDrag = null;
  ghost.remove();
  el.style.opacity = '';
  document.querySelectorAll('.ch-drag-item').forEach(r => r.style.borderTop = '');
  document.querySelectorAll('.ch-folder').forEach(f => f.style.outline = '');

  const p = getProject();
  const chapters = p.chapters || [];
  const fromIdx = chapters.findIndex(c => c.id === chid);
  if (fromIdx === -1) { renderChapters(); return; }

  if (targetFolder) {
    // 폴더 헤더로 드래그 → 해당 폴더의 마지막으로 이동
    const [item] = chapters.splice(fromIdx, 1);
    item.folderId = targetFolder;
    // 해당 폴더의 마지막 위치 찾기
    const lastFolderIdx = chapters.reduce((last, c, i) => c.folderId === targetFolder ? i : last, -1);
    if (lastFolderIdx !== -1) chapters.splice(lastFolderIdx + 1, 0, item);
    else chapters.push(item);
  } else if (insertBefore && insertBefore !== '__end__') {
    const toIdx = chapters.findIndex(c => c.id === insertBefore);
    if (toIdx === -1) { renderChapters(); return; }
    // 폴더는 드롭 위치의 화 기준으로 설정
    const targetCh = chapters[toIdx];
    if (targetCh.folderId) chapters[fromIdx].folderId = targetCh.folderId;
    else delete chapters[fromIdx].folderId;
    // 순서 이동
    const [item] = chapters.splice(fromIdx, 1);
    const newTo = chapters.findIndex(c => c.id === insertBefore);
    chapters.splice(newTo, 0, item);
  } else {
    // 맨 끝으로
    const [item] = chapters.splice(fromIdx, 1);
    // 같은 폴더 유지 or 폴더 없음
    chapters.push(item);
  }

  const isMobilePanel = window.innerWidth <= 768 &&
    document.getElementById('mobile-chapter-panel')?.classList.contains('open');

  autoSave(); renderChapters();
  setTimeout(() => {
    initChDrag();
  }, 50);
}

function toggleMobileChapterPanel() {
  const panel = document.getElementById('mobile-chapter-panel');
  const bd = document.getElementById('mobile-chapter-backdrop');
  if (!panel) return;
  const isOpen = panel.classList.contains('open');
  if (isOpen) {
    panel.classList.remove('open');
    if (bd) bd.style.display = 'none';
    if (panel._swipeStart) panel.removeEventListener('touchstart', panel._swipeStart);
    if (panel._swipeMove) panel.removeEventListener('touchmove', panel._swipeMove);
    if (panel._swipeEnd) panel.removeEventListener('touchend', panel._swipeEnd);
    panel.style.transform = '';
  } else {
    panel.style.display = 'flex';
    requestAnimationFrame(() => panel.classList.add('open'));
    if (bd) bd.style.display = 'block';
    // 스와이프로 닫기 (왼쪽으로 밀기)
    let _sx = null;
    panel._swipeStart = e => { _sx = e.touches[0].clientX; };
    panel._swipeMove = e => {
      if (_sx === null) return;
      const dx = e.touches[0].clientX - _sx;
      if (dx < 0) panel.style.transform = `translateX(${dx}px)`;
    };
    panel._swipeEnd = e => {
      const dx = e.changedTouches[0].clientX - _sx;
      panel.style.transform = '';
      _sx = null;
      if (dx < -60) toggleMobileChapterPanel();
    };
    panel.addEventListener('touchstart', panel._swipeStart, {passive:true});
    panel.addEventListener('touchmove', panel._swipeMove, {passive:true});
    panel.addEventListener('touchend', panel._swipeEnd, {passive:true});
    // 현재 활성 화로 스크롤
    setTimeout(() => {
      const active = document.querySelector('#mobile-chapter-list-body .chapter-item.active');
      if (active) active.scrollIntoView({block:'center'});
    }, 300);
  }
}

function moveChapterMobile(dir) {
  const p = getProject();
  const chapters = p.chapters || [];
  const idx = chapters.findIndex(c => c.id === activeChapterId);
  if (idx === -1) return;
  const newIdx = idx + dir;
  if (newIdx < 0 || newIdx >= chapters.length) return;
  [chapters[idx], chapters[newIdx]] = [chapters[newIdx], chapters[idx]];
  autoSave();
  renderChapters();
}

function newChapter() {
  const p = getProject();
  if (!p.chapters) p.chapters = [];
  const newCh = { id: uid(), title: `${p.chapters.length+1}화`, content: '', status: '초안', createdAt: new Date().toISOString() };

  const curIdx = p.chapters.findIndex(c => c.id === activeChapterId);
  if (curIdx !== -1) {
    const curCh = p.chapters[curIdx];
    if (curCh.folderId) newCh.folderId = curCh.folderId;
    p.chapters.splice(curIdx + 1, 0, newCh);
  } else {
    p.chapters.push(newCh);
  }

  activeChapterId = newCh.id;
  const savedScroll = document.getElementById('chapter-list-body')?.scrollTop || 0;
  autoSave(); renderChapters();
  setTimeout(() => {
    const lb = document.getElementById('chapter-list-body');
    if (!lb) return;
    // 새 화 아이템 찾아서 보이도록 스크롤
    const newItem = lb.querySelector(`[data-chid="${newCh.id}"]`);
    if (newItem) {
      newItem.scrollIntoView({block:'nearest', behavior:'smooth'});
    } else {
      lb.scrollTop = savedScroll;
    }
  }, 30);
}

function updateChapter(id, key, val) {
  const p = getProject();
  const ch = p.chapters.find(c => c.id === id);
  if (!ch) return;
  ch[key] = val;
  autoSave();
}

function deleteChapter(id) {
  confirmDialog('이 화를 삭제합니다.', () => {
  const p = getProject();
  p.chapters = p.chapters.filter(c => c.id !== id);
  // 사건 일지 고아 참조 정리
  (p.chronicles || []).forEach(ev => { if (ev.chapterId === id) ev.chapterId = ''; });
  // 심리 아크 단계 고아 참조 정리 (연결만 끊고 trigger 텍스트는 유지)
  (p.psyArcs || []).forEach(arc => {
    (arc.steps || []).forEach(s => { if (s.chapterId === id) s.chapterId = ''; });
  });
  // 플롯 장면 고아 참조 정리
  (p.arcs || []).forEach(arc => {
    (arc.scenes || []).forEach(s => { if (s.chapterId === id) s.chapterId = ''; });
  });
  if (activeChapterId === id) activeChapterId = p.chapters[0]?.id || null;
  autoSave(); renderChapters();
  });
}

// ═══════════════════════════════════════════════════════════════
// SCHEDULE
// ═══════════════════════════════════════════════════════════════
function renderSchedule() {
  const p = getProject();
  const chapters = p.chapters || [];
  const done = chapters.filter(c => c.status === '완료').length;
  const progress = chapters.length ? Math.round((done/chapters.length)*100) : 0;
  const totalWords = chapters.reduce((a,c) => a+(c.content||'').length, 0);

  const chRows = chapters.map((c,i) => `
    <div style="display:flex;align-items:center;gap:12px;padding:8px 12px;border-radius:8px;background:var(--cream);margin-bottom:6px">
      <span class="font-display" style="color:var(--gold);font-size:13px;min-width:32px">#${i+1}</span>
      <span style="flex:1;font-weight:500;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(c.title)}</span>
      <span style="font-size:12px;color:var(--muted)">${(c.content||'').length.toLocaleString()}자</span>
      <span class="status-badge s-${esc(c.status||'초안')}">${esc(c.status||'초안')}</span>
    </div>`).join('');

  document.getElementById('main').innerHTML = `
    <div style="max-width:780px;margin:0 auto">
      <div class="font-display" style="font-size:22px;margin-bottom:22px">연재 관리</div>

      <div class="card" style="margin-bottom:16px">
        <div class="sec-title">집필 진행률</div>
        <div style="display:flex;align-items:center;gap:16px;margin-bottom:16px">
          <div class="progress-bar" style="flex:1"><div class="progress-fill" style="width:${progress}%"></div></div>
          <span style="font-weight:700;font-size:15px;min-width:44px">${progress}%</span>
        </div>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px">
          ${[
            {l:'전체',v:chapters.length+'화',c:'var(--ink)'},
            {l:'완료',v:done+'화',c:'var(--teal)'},
            {l:'미완성',v:(chapters.length-done)+'화',c:'var(--gold)'},
            {l:'총 분량',v:totalWords.toLocaleString()+'자',c:'var(--rust)'},
          ].map(s=>`<div style="text-align:center;padding:12px 6px;background:var(--cream);border-radius:8px">
            <div class="font-display" style="font-size:16px;color:${s.c}">${s.v}</div>
            <div style="font-size:11px;color:var(--muted);margin-top:2px">${s.l}</div>
          </div>`).join('')}
        </div>
      </div>

      <div class="card" style="margin-bottom:16px">
        <div class="sec-title">연재 설정</div>
        <div class="form-grid">
          <div><label class="label">플랫폼</label>
            <select onchange="updateProject('platform',this.value)"><option value="">선택</option>${selOpts(PLATFORMS,p.platform||'')}</select>
          </div>
          <div><label class="label">업로드 주기</label>
            <select onchange="updateProject('uploadCycle',this.value)"><option value="">선택</option>${selOpts(['매일','주 2회','주 3회','주말','비정기'],p.uploadCycle||'')}</select>
          </div>
          <div><label class="label">목표 화수</label>
            <input type="number" value="${esc(p.targetChapters||'')}" oninput="updateProject('targetChapters',this.value)" placeholder="예: 100">
          </div>
          <div><label class="label">연재 시작일</label>
            <input type="date" value="${esc(p.startDate||'')}" onchange="updateProject('startDate',this.value)">
          </div>
        </div>
      </div>

      ${chapters.length > 0 ? `
      <div class="card">
        <div class="sec-title">화 목록 현황</div>
        ${chRows}
      </div>` : ''}
    </div>`;
}


// ═══════════════════════════════════════════════════════════════
