// HOME
// ═══════════════════════════════════════════════════════════════
function renderHome() {
  const main = document.getElementById('main');
  main.classList.remove('no-pad');
  const projects = state.projects;
  let cards = '';
  if (projects.length === 0) {
    cards = `<div class="card empty-state"><div class="emoji">📖</div><p>아직 작품이 없습니다.<br>첫 번째 이야기를 시작해보세요!</p></div>`;
  } else {
    cards = `<div class="project-grid" id="project-grid">` + projects.map((p, _pi) => {
      const wordCount = (p.chapters||[]).reduce((a,c) => a+(c.content||'').length, 0);
      return `
      <div class="project-card proj-drag-card" data-pid="${p.id}" style="padding:0;overflow:hidden">
        <div class="proj-drag-handle" data-pid="${p.id}"
          style="width:100%;padding:5px 0;display:flex;align-items:center;justify-content:center;
            background:var(--cream);border-bottom:1px solid var(--border);
            cursor:grab;touch-action:none;user-select:none;color:var(--muted);font-size:13px;letter-spacing:4px"
          onclick="event.stopPropagation()">⠿⠿⠿</div>
        <div style="padding:18px" onclick="openProject('${p.id}')">
          <div class="project-card-header">
            <span class="tag">${esc(p.genre)}</span>
            ${statusBadge(p.status)}
          </div>
          <div class="project-card-title">${esc(p.title||'제목 없음')}</div>
          <div class="project-card-synopsis">${esc(p.synopsis||'줄거리가 없습니다.')}</div>
          <div class="project-card-footer">
            <span class="project-card-meta">${(p.chapters||[]).length}화 · ${wordCount.toLocaleString()}자</span>
            <div style="display:flex;gap:6px" onclick="event.stopPropagation()">
              <button class="btn btn-outline btn-sm" onclick="exportSingleProject('${p.id}')" title="처음엔 파일 선택, 이후 덮어쓰기 저장">
                💾 저장
              </button>
              <button class="btn btn-danger btn-sm" onclick="deleteProjectByIndex(${_pi})">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                삭제
              </button>
            </div>
          </div>
        </div>
      </div>`;
    }).join('') + `</div>`;
  }
  main.innerHTML = `
    <div style="max-width:900px;margin:0 auto">
      <div class="home-hero">
        <h1>호필 스튜디오</h1>
        <p>아이디어에서 완성작까지 — 당신의 이야기를 완성하세요</p>
        <span style="font-size:12px;color:var(--border);font-family:'Noto Serif KR',serif;letter-spacing:.5px;font-weight:400;display:block;margin-top:6px">제작자 : 호백 with Claude</span>
        <span style="font-size:11px;color:var(--muted);opacity:.8;display:block;margin-top:8px">✏️ 글은 입력 후 자동저장 · 💾 파일 저장 버튼으로 JSON 백업 · ⚠️ Ctrl+S는 브라우저 페이지 저장 단축키이므로 사용하지 마세요</span>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;flex-wrap:wrap;gap:10px">
        <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap">
          <div style="font-size:13px;color:var(--muted)">${projects.length}개의 작품</div>
          <div id="storage-indicator" style="display:flex;align-items:center;gap:8px"></div>

        </div>
        <div style="display:flex;gap:10px">
          <button class="btn btn-outline btn-sm" onclick="exportAllProjects()" title="처음엔 파일 선택, 이후 같은 파일에 덮어쓰기">
            💾 전체 저장
          </button>
          <button class="btn btn-outline btn-sm" onclick="document.getElementById('import-file').click()">
            📂 전체 불러오기
          </button>
          <button class="btn btn-outline btn-sm" onclick="document.getElementById('import-single-file').click()">
            📥 작품 불러오기
          </button>
          <button class="btn btn-gold" onclick="showNewProjectModal()">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            새 작품 만들기
          </button>
        </div>
      </div>
      ${cards}
      <div style="text-align:center;margin-top:40px;padding:16px 0;
        border-top:1px solid var(--border)">
        <p style="font-size:11px;color:var(--muted);opacity:.6;line-height:1.8">
          호필 스튜디오 v0.6.05 beta · © 2026 호백<br>
          <a href="https://creativecommons.org/licenses/by-nc/4.0/" target="_blank"
            style="color:var(--muted);text-decoration:none;opacity:.8">CC BY-NC 4.0</a>
          · 비상업적 목적에 한해 자유롭게 사용 가능<br>
          <a href="https://github.com/hotistudio/wnstudio" target="_blank"
            style="color:var(--muted);text-decoration:none;opacity:.8">github.com/hotistudio/wnstudio</a>
        </p>
      </div>
    </div>`;
  setTimeout(renderStorageIndicator, 0);
  setTimeout(initProjDrag, 50);
  // 빈 작품 자동 감지 알림
  const emptyProjects = state.projects.filter(p =>
    (!p.title || p.title === '제목 없음') &&
    (!p.chapters || p.chapters.every(c => !c.content || !c.content.trim())) &&
    (!p.characters || p.characters.length === 0)
  );
  if (emptyProjects.length > 0) {
    setTimeout(() => {
      toast('⚠️ 빈 작품 ' + emptyProjects.length + '개 발견! 홈 화면에서 삭제해주세요.');
    }, 500);
  }
}

function deleteProject(id) {
  confirmDialog('이 작품을 삭제합니다. 복구할 수 없습니다.', () => {
    state.projects = state.projects.filter(p => p.id !== id);
    saveToStorage(); renderHome();
    toast('작품이 삭제되었습니다.');
  });
}

function deleteProjectByIndex(idx) {
  confirmDialog('이 작품을 삭제합니다. 복구할 수 없습니다.', () => {
    state.projects.splice(idx, 1);
    saveToStorage(); renderHome();
    toast('작품이 삭제되었습니다.');
  });
}

// ═══════════════════════════════════════════════════════════════
// NEW PROJECT MODAL
// ═══════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════
// 홈 프로젝트 카드 드래그 앤 드롭
// ═══════════════════════════════════════════════════════════════
let _projDrag = null;

function initProjDrag() {
  document.querySelectorAll('.proj-drag-handle').forEach(h => {
    h.addEventListener('touchstart', projTouchStart, {passive: false});
    h.addEventListener('mousedown', projMouseStart);
  });
}
function projTouchStart(e) {
  e.preventDefault();
  projDragInit(e.currentTarget, e.touches[0].clientX, e.touches[0].clientY);
  document.addEventListener('touchmove', projTouchMove, {passive: false});
  document.addEventListener('touchend', projTouchEnd, {once: true});
}
function projMouseStart(e) {
  projDragInit(e.currentTarget, e.clientX, e.clientY);
  document.addEventListener('mousemove', projMouseMove);
  document.addEventListener('mouseup', projMouseEnd, {once: true});
}
function projDragInit(handle, clientX, clientY) {
  const pid = handle.dataset.pid;
  const card = handle.closest('.proj-drag-card');
  const rect = card.getBoundingClientRect();
  const title = card.querySelector('.project-card-title')?.textContent || '';

  const ghost = document.createElement('div');
  ghost.style.cssText = `position:fixed;left:${rect.left}px;top:${rect.top}px;
    width:${rect.width}px;height:${rect.height}px;z-index:9999;pointer-events:none;
    background:var(--gold-light);border:2px solid var(--gold);border-radius:12px;
    box-shadow:0 8px 24px rgba(0,0,0,.2);opacity:.9;
    display:flex;align-items:center;justify-content:center;
    font-family:'Noto Serif KR',serif;font-weight:700;font-size:15px;color:var(--ink);
    padding:16px`;
  ghost.textContent = title;
  document.body.appendChild(ghost);
  card.style.opacity = '0.3';

  _projDrag = { pid, card, ghost, offsetX: clientX - rect.left, offsetY: clientY - rect.top };
}
function projTouchMove(e) { e.preventDefault(); if (_projDrag) projDragMove(e.touches[0].clientX, e.touches[0].clientY); }
function projMouseMove(e) { if (_projDrag) projDragMove(e.clientX, e.clientY); }
function projDragMove(clientX, clientY) {
  const { ghost } = _projDrag;
  ghost.style.left = (clientX - _projDrag.offsetX) + 'px';
  ghost.style.top  = (clientY - _projDrag.offsetY) + 'px';

  // 카드 위치 기반 드롭 타깃 계산
  const cards = [...document.querySelectorAll('.proj-drag-card')];
  cards.forEach(c => c.style.outline = '');
  let targetIdx = null;
  for (let i = 0; i < cards.length; i++) {
    const r = cards[i].getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    if (Math.abs(clientX - cx) < r.width / 2 && Math.abs(clientY - cy) < r.height / 2) {
      if (cards[i] !== _projDrag.card) {
        cards[i].style.outline = '2px solid var(--gold)';
        cards[i].style.borderRadius = '12px';
        targetIdx = i;
      }
      break;
    }
  }
  _projDrag.targetIdx = targetIdx;
}
function projTouchEnd() { document.removeEventListener('touchmove', projTouchMove); projDragCommit(); }
function projMouseEnd() { document.removeEventListener('mousemove', projMouseMove); projDragCommit(); }
function projDragCommit() {
  if (!_projDrag) return;
  const { pid, card, ghost, targetIdx } = _projDrag;
  _projDrag = null;
  ghost.remove();
  document.querySelectorAll('.proj-drag-card').forEach(c => { c.style.opacity=''; c.style.outline=''; });

  if (targetIdx !== null) {
    const fromIdx = state.projects.findIndex(p => p.id === pid);
    if (fromIdx !== -1 && fromIdx !== targetIdx) {
      const [item] = state.projects.splice(fromIdx, 1);
      state.projects.splice(targetIdx, 0, item);
      saveToStorage();
    }
  }
  renderHome();
  setTimeout(initProjDrag, 50);
}

function showNewProjectModal() {
  showModal(`
    <div class="modal-title">✨ 새 작품 만들기</div>
    <div class="form-grid">
      <div class="full"><label class="label">작품 제목 *</label><input id="np-title" placeholder="임시 제목도 괜찮아요!"></div>
      <div><label class="label">장르</label><select id="np-genre">${selOpts(GENRES,'판타지')}</select></div>
      <div><label class="label">상태</label><select id="np-status">${selOpts(STATUSES,'기획중')}</select></div>
      <div class="full"><label class="label">타겟 독자층</label><input id="np-target" placeholder="예: 20~30대 여성, 판타지 팬"></div>
      <div class="full"><label class="label">줄거리 (선택)</label><textarea id="np-synopsis" rows="4" placeholder="아이디어가 있다면 적어보세요..."></textarea></div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="closeModal()">취소</button>
      <button class="btn btn-gold" onclick="createProject()">만들기</button>
    </div>
  `, false);
  setTimeout(() => document.getElementById('np-title')?.focus(), 100);
}

function createProject() {
  const title = document.getElementById('np-title').value.trim();
  if (!title) { toast('제목을 입력해주세요.'); return; }
  const p = {
    id: uid(),
    title,
    genre: document.getElementById('np-genre').value,
    status: document.getElementById('np-status').value,
    targetAudience: document.getElementById('np-target').value,
    synopsis: document.getElementById('np-synopsis').value,
    memo: '',
    platform: '', uploadCycle: '', targetChapters: '', startDate: '',
    characters: [], worldSettings: [], arcs: [], chapters: [], relations: [],
    families: [], familyTrees: [],
    schemaVersion: 2,
    createdAt: new Date().toISOString(),
  };
  state.projects.push(p);
  saveToStorage();
  closeModal();
  openProject(p.id);
  toast('새 작품이 만들어졌습니다! 🎉');
}

// ═══════════════════════════════════════════════════════════════
// OVERVIEW
// ═══════════════════════════════════════════════════════════════
function renderOverview() {
  const p = getProject();
  const wordCount = (p.chapters||[]).reduce((a,c) => a+(c.content||'').length, 0);

  // 연재처 목록 렌더
  const platforms = p.platforms || [];
  const platformRows = platforms.map((pl, i) => `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
      <input value="${esc(pl.name||'')}" placeholder="연재처 이름 (예: 카카오페이지)"
        oninput="updatePlatform(${i},'name',this.value)"
        style="flex:1;min-width:0">
      <input value="${esc(pl.url||'')}" placeholder="URL (선택)"
        oninput="updatePlatform(${i},'url',this.value)"
        style="flex:1.4;min-width:0">
      <button onclick="deletePlatform(${i})"
        style="flex-shrink:0;width:28px;height:28px;border-radius:50%;
          background:rgba(181,69,27,.1);border:none;cursor:pointer;
          color:var(--rust);font-size:16px;font-weight:700;
          display:flex;align-items:center;justify-content:center">×</button>
    </div>`).join('');

  document.getElementById('main').innerHTML = `
    <div style="max-width:1100px;margin:0 auto">
      <div class="font-display" style="font-size:22px;margin-bottom:22px">작품 개요</div>

      <!-- 통계 -->
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px">
        ${(() => {
          const chapterCount = (p.chapters||[]).filter(c => !c.isFolder).length;
          const routineDays = (p.routineDays||[]);
          const dayOrder = ['월','화','수','목','금','토','일'];
          const routineStr = routineDays.length
            ? dayOrder.filter(d => routineDays.includes(d)).join('·')
            : '—';
          const allStats = (() => { try { return JSON.parse(localStorage.getItem('wnstudio_writing_stats')||'{}'); } catch(e) { return {}; } })();
          const pStats = allStats[p.id] || {};
          const todayKey = new Date().toISOString().slice(0,10);
          const todayCount = pStats[todayKey] || 0;
          return [
            {label:'집필 요일', val:routineStr, unit:'', color:'var(--gold)', small: routineDays.length > 4},
            {label:'연재 화수', val:chapterCount, unit:'', color:'var(--teal2)'},
            {label:'오늘 집필량', val:todayCount.toLocaleString(), unit:'', color:'var(--gold)'},
            {label:'총 집필량', val:wordCount.toLocaleString(), unit:'', color:'var(--teal2)'},
          ].map(s => `
            <div class="card" style="text-align:center;padding:16px 10px">
              <div class="font-display" style="font-size:${s.small?'18':'24'}px;color:${s.color};letter-spacing:${s.small?'1':'0'}px">${s.val}</div>
              <div style="font-size:11px;color:var(--muted);margin-top:4px">${s.label}${s.unit?' <span style="font-size:10px">'+s.unit+'</span>':''}</div>
            </div>`).join('');
        })()}
      </div>

      <!-- 좌우 분할 -->
      <div class="overview-split" style="display:grid;grid-template-columns:1fr 1fr;gap:16px;align-items:start">

        <!-- 왼쪽: 작품 개요 -->
        <div style="display:grid;gap:16px">
          <div class="card">
            <div class="sec-title">기본 정보</div>
            <div class="form-grid">
              <div class="full"><label class="label">작품 제목</label><input id="ov-title" value="${esc(p.title)}" oninput="updateProject('title',this.value)" placeholder="작품 제목"></div>
              <div><label class="label">장르</label><select id="ov-genre" onchange="updateProject('genre',this.value)">${selOpts(GENRES,p.genre)}</select></div>
              <div><label class="label">연재 상태</label><select id="ov-status" onchange="updateProject('status',this.value)">${selOpts(STATUSES,p.status)}</select></div>
              <div class="full"><label class="label">타겟 독자층</label><input value="${esc(p.targetAudience||'')}" oninput="updateProject('targetAudience',this.value)" placeholder="예: 20~30대 여성"></div>
            </div>
          </div>

          <div class="card">
            <div class="sec-title">줄거리</div>
            <textarea rows="6" oninput="updateProject('synopsis',this.value)" placeholder="작품의 전체 줄거리를 입력하세요...">${esc(p.synopsis||'')}</textarea>
          </div>

          <div class="card">
            <div class="sec-title">작가 메모</div>
            <textarea rows="4" oninput="updateProject('memo',this.value)" placeholder="영감, 참고 자료, 메모를 자유롭게 기록하세요...">${esc(p.memo||'')}</textarea>
          </div>
        </div>

        <!-- 오른쪽: 루틴 & 연재처 -->
        <div style="display:grid;gap:16px">

          <div class="card">
            <div class="sec-title">집필 루틴</div>
            <div style="display:grid;gap:12px">
              <div>
                <label class="label">집필 요일</label>
                <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:4px" id="ov-days-group">
                  ${['월','화','수','목','금','토','일'].map(d => {
                    const days = p.routineDays || [];
                    const active = days.includes(d);
                    return `<button type="button"
                      onclick="toggleRoutineDay('${d}',this)"
                      style="width:36px;height:36px;border-radius:50%;font-size:13px;font-weight:700;
                        font-family:'Noto Sans KR',sans-serif;cursor:pointer;border:1.5px solid;
                        background:${active?'var(--gold)':'transparent'};
                        color:${active?'#fff':'var(--muted)'};
                        border-color:${active?'var(--gold)':'var(--border)'};
                        transition:all .15s">${d}</button>`;
                  }).join('')}
                </div>
              </div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
                <div>
                  <label class="label">집필 시작 시간</label>
                  <input type="time" value="${esc(p.routineStart||'')}" oninput="updateProject('routineStart',this.value)">
                </div>
                <div>
                  <label class="label">목표 집필 시간</label>
                  <input value="${esc(p.routineDuration||'')}" placeholder="예: 2시간" oninput="updateProject('routineDuration',this.value)">
                </div>
              </div>
              <div>
                <label class="label">회차당 목표 분량</label>
                <input value="${esc(p.routineGoal||'')}" placeholder="예: 6,000자" oninput="updateProject('routineGoal',this.value)">
              </div>
              <div>
                <label class="label">루틴 메모</label>
                <textarea rows="3" oninput="updateProject('routineMemo',this.value)"
                  placeholder="루틴 관련 메모, 주의사항 등...">${esc(p.routineMemo||'')}</textarea>
              </div>
            </div>
          </div>

          <div class="card">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
              <div class="sec-title" style="margin-bottom:0;padding-bottom:0;border-bottom:none">연재처</div>
              <button class="btn btn-outline btn-sm" onclick="addPlatform()">＋ 추가</button>
            </div>
            <div id="ov-platforms">
              ${platforms.length === 0
                ? `<div style="font-size:12px;color:var(--muted);text-align:center;padding:16px 0">
                    연재처를 추가해보세요.
                  </div>`
                : platformRows}
            </div>
            <div>
              <label class="label" style="margin-top:12px">연재처 메모</label>
              <textarea rows="2" oninput="updateProject('platformMemo',this.value)"
                placeholder="계약 조건, 업로드 규칙, 담당자 등...">${esc(p.platformMemo||'')}</textarea>
            </div>
          </div>

        </div>
      </div>
    </div>`;
}

function toggleRoutineDay(day, btn) {
  const p = getProject();
  p.routineDays = p.routineDays || [];
  const idx = p.routineDays.indexOf(day);
  if (idx === -1) {
    p.routineDays.push(day);
    btn.style.background = 'var(--gold)';
    btn.style.color = '#fff';
    btn.style.borderColor = 'var(--gold)';
  } else {
    p.routineDays.splice(idx, 1);
    btn.style.background = 'transparent';
    btn.style.color = 'var(--muted)';
    btn.style.borderColor = 'var(--border)';
  }
  autoSave();
}

function addPlatform() {
  const p = getProject();
  p.platforms = p.platforms || [];
  p.platforms.push({ id: uid(), name: '', url: '' });
  autoSave();
  renderOverview();
}

function updatePlatform(idx, key, val) {
  const p = getProject();
  if (!p.platforms || !p.platforms[idx]) return;
  p.platforms[idx][key] = val;
  autoSave();
}

function deletePlatform(idx) {
  const p = getProject();
  p.platforms.splice(idx, 1);
  autoSave();
  renderOverview();
}

function updateProject(key, val) {
  const p = getProject();
  if (!p) return;
  p[key] = val;
  autoSave();
  // update header & sidebar
  if (key === 'title') {
    document.getElementById('header-project').textContent = val || '제목 없음';
    document.getElementById('sidebar-project-title').textContent = val || '제목 없음';
  }
  if (key === 'status') {
    document.getElementById('sidebar-project-status').innerHTML = statusBadge(val);
  }
}

// ═══════════════════════════════════════════════════════════════
