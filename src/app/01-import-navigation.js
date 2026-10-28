// EXPORT / IMPORT
// ═══════════════════════════════════════════════════════════════
async function exportAllProjects() {
  if (state.projects.length === 0) { toast('저장할 작품이 없어요.'); return; }
  const data = { projects: state.projects, ...statsBackup(), version: '2.1', savedAt: new Date().toISOString() };
  const filename = '호필스튜디오_전체백업_' + getTodayStr() + '.json';
  _downloadJson(data, filename);
  toast('전체 저장 완료! ' + state.projects.length + '개 작품 💾');
}

async function exportCurrentProject() {
  const p = getProject();
  if (!p) { toast('저장할 작품이 없어요.'); return; }
  if (FS_SUPPORTED) {
    try {
      if (fileHandles.projects[p.id]) {
        const ok = await writeToFileHandle(fileHandles.projects[p.id], projectBackup(p));
        if (ok) { toast(`"${p.title||'작품'}" 저장 완료 💾`); return; }
      }
      const handle = await window.showSaveFilePicker({
        suggestedName: (p.title||'작품') + '.json',
        types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }],
      });
      fileHandles.projects[p.id] = handle;
      const ok = await writeToFileHandle(handle, projectBackup(p));
      if (!ok) return;
      toast(`파일 연결 완료! 이후 자동으로 같은 파일에 저장됩니다 💾`);
      updateFileStatus();
    } catch(e) {
      if (e.name !== 'AbortError') {
        _downloadJson(projectBackup(p), (p.title||'작품') + '_' + getTodayStr() + '.json');
      }
    }
  } else {
    _downloadJson(projectBackup(p), (p.title||'작품') + '_' + getTodayStr() + '.json');
    toast(`"${p.title||'작품'}" 백업 저장 완료 📦`);
  }
}

async function exportSingleProject(pid) {
  const p = state.projects.find(p => p.id === pid);
  if (!p) return;
  if (FS_SUPPORTED) {
    try {
      if (fileHandles.projects[pid]) {
        const ok = await writeToFileHandle(fileHandles.projects[pid], projectBackup(p));
        if (ok) { toast(`"${p.title||'작품'}" 저장 완료 💾`); return; }
      }
      const handle = await window.showSaveFilePicker({
        suggestedName: (p.title||'작품') + '.json',
        types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }],
      });
      fileHandles.projects[pid] = handle;
      const ok = await writeToFileHandle(handle, projectBackup(p));
      if (!ok) return;
      toast(`"${p.title||'작품'}" 파일 연결 완료! 💾`);
      updateFileStatus();
    } catch(e) {
      if (e.name !== 'AbortError') {
        _downloadJson(projectBackup(p), (p.title||'작품') + '_' + getTodayStr() + '.json');
      }
    }
  } else {
    _downloadJson(projectBackup(p), (p.title||'작품') + '_' + getTodayStr() + '.json');
    toast(`"${p.title||'작품'}" 저장 완료 📁`);
  }
}

// exportData = exportCurrentProject 별칭 (하위 호환)
function exportData() { exportCurrentProject(); }

// 공통 다운로드 헬퍼 (폴백용)
function _downloadJson(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}

// 파일 연결 해제
function disconnectAllFile() {
  fileHandles.all = null;
  updateFileStatus();
  toast('전체 파일 연결 해제됨');
}
function disconnectProjectFile(pid) {
  delete fileHandles.projects[pid];
  updateFileStatus();
  toast('작품 파일 연결 해제됨');
}

// 헤더 파일 상태 표시 업데이트
function updateFileStatus() {
  const el = document.getElementById('file-status');
  if (!el) return;
  const p = getProject();
  const hasProject = p && fileHandles.projects[p.id];
  const hasAll = !!fileHandles.all;
  if (hasProject) {
    el.innerHTML = `<span style="font-size:11px;color:var(--teal2);display:flex;align-items:center;gap:3px" title="파일 연결됨 — 자동저장 중">🔗 파일 연결됨</span>`;
  } else if (hasAll) {
    el.innerHTML = `<span style="font-size:11px;color:var(--teal2);display:flex;align-items:center;gap:3px" title="전체 파일에 자동저장 중">🔗 전체파일 연결됨</span>`;
  } else {
    el.innerHTML = '';
  }
}

const MAX_IMPORT_BYTES = 50 * 1024 * 1024;
function validateImportFile(file) {
  if (file.size > MAX_IMPORT_BYTES) throw new Error('파일이 50MB를 넘습니다.');
}
function validateImportedProject(project) {
  if (!project || typeof project !== 'object' || Array.isArray(project)) {
    throw new Error('작품 형식이 올바르지 않습니다.');
  }
  if (project.title != null && typeof project.title !== 'string') {
    throw new Error('작품 제목 형식이 올바르지 않습니다.');
  }
  for (const key of ['chapters', 'characters', 'worldSettings', 'arcs']) {
    if (project[key] != null && !Array.isArray(project[key])) {
      throw new Error(`${key} 목록 형식이 올바르지 않습니다.`);
    }
  }
  // ID는 여러 inline 이벤트에 들어가므로 가져온 값에 코드 문자가 없어야 한다.
  const visit = (value, depth) => {
    if (depth > 40) throw new Error('파일 구조가 너무 깊습니다.');
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      if (/^(id|[a-zA-Z]+Id)$/.test(key) && child != null && child !== '') {
        if (!['string', 'number'].includes(typeof child) || !/^[\w.-]+$/.test(String(child))) {
          throw new Error('안전하지 않은 ID가 들어 있습니다.');
        }
      }
      if (Array.isArray(child)) {
        if (/^[a-zA-Z]+Ids$/.test(key) && child.some(id => !/^[\w.-]+$/.test(String(id)))) {
          throw new Error('안전하지 않은 ID가 들어 있습니다.');
        }
        child.forEach(item => visit(item, depth + 1));
      } else if (child && typeof child === 'object') {
        visit(child, depth + 1);
      }
    }
  };
  visit(project, 0);
  return project;
}

function importSingleProject(e) {
  const file = e.target.files[0];
  if (!file) return;
  try { validateImportFile(file); } catch(err) { toast(err.message); e.target.value = ''; return; }
  const reader = new FileReader();
  reader.onload = ev => {
    try {
      const data = JSON.parse(ev.target.result);

      // 전체 백업 포맷 ({projects:[...]}) 인 경우 처리
      if (data.projects && Array.isArray(data.projects)) {
        if (data.projects.length === 0) { toast('파일에 작품이 없어요.'); return; }
        if (data.projects.length === 1) {
          // 작품이 1개면 바로 가져오기
          const proj = { ...validateImportedProject(data.projects[0]), id: data.projects[0].id || uid() };
          const idx = state.projects.findIndex(p => p.id === proj.id);
          if (idx !== -1) {
            confirmDialog(`"${proj.title||'작품'}"이 이미 있어요. 덮어쓸까요?`, () => {
              state.projects[idx] = proj;
              storageLoadFailed = false; saveToStorage(); restoreStats(data, [proj.id]); renderHome();
              toast(`"${proj.title||'작품'}" 불러오기 완료 📖`);
            });
          } else {
            state.projects.push(proj);
            storageLoadFailed = false; saveToStorage(); restoreStats(data, [proj.id]); renderHome();
            toast(`"${proj.title||'작품'}" 불러오기 완료 📖`);
          }
        } else {
          // 작품이 여럿이면 전체 불러오기로 안내
          toast(`이 파일엔 ${data.projects.length}개 작품이 있어요. "전체 불러오기"를 사용해주세요.`);
        }
        e.target.value = ''; return;
      }

      // 단일 작품 형식인지 확인
      const imported = data.project || data;
      if (!imported.id && !imported.title && !imported.chapters) {
        toast('올바른 작품 파일이 아니에요.'); return;
      }
      const proj = { ...validateImportedProject(imported), id: imported.id || uid() };
      // 같은 id가 있으면 덮어쓰기, 없으면 추가
      const idx = state.projects.findIndex(p => p.id === proj.id);
      if (idx !== -1) {
        confirmDialog(`"${proj.title||'작품'}"이 이미 있어요. 덮어쓸까요?`, () => {
          state.projects[idx] = proj;
          storageLoadFailed = false; saveToStorage(); restoreStats(data, [proj.id]); renderHome();
          toast(`"${proj.title||'작품'}" 불러오기 완료 📖`);
        });
      } else {
        state.projects.push(proj);
        storageLoadFailed = false; saveToStorage(); restoreStats(data, [proj.id]); renderHome();
        toast(`"${proj.title||'작품'}" 불러오기 완료 📖`);
      }
    } catch(err) { toast(err.message || '파일을 읽을 수 없어요.'); }
    e.target.value = '';
  };
  reader.readAsText(file);
}

function importData(e) {
  const file = e.target.files[0];
  if (!file) return;
  try { validateImportFile(file); } catch(err) { toast(err.message); e.target.value = ''; return; }
  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      const data = JSON.parse(ev.target.result);

      // 전체 백업 (배열 또는 {projects:[]}) 처리
      const projects = Array.isArray(data) ? data : (data.projects || null);
      if (projects) {
        if (!Array.isArray(projects)) throw new Error('작품 목록 형식이 올바르지 않습니다.');
        const cleaned = projects.map(validateImportedProject);
        const existing = state.projects.length;
        const doImport = () => {
          state.projects = cleaned.map(p => ({ ...p, id: p.id || uid() }));
          fileHandles.all = null; fileHandles.projects = {};
          storageLoadFailed = false; saveToStorage(); restoreStats(data, state.projects.map(p => p.id), true);
          renderHome();
          toast('불러오기 완료! ' + cleaned.length + '개 작품 📖');
        };
        if (existing > 0) {
          confirmDialog(
            '⚠️ 전체 불러오기를 하면 현재 작품 ' + existing + '개가 모두 삭제되고 파일의 내용으로 교체됩니다. 계속하시겠습니까?',
            doImport
          );
        } else {
          doImport();
        }
        return;
      }
      // 단일 작품 처리
      const imported = validateImportedProject(data.project || data);
      const project = { ...imported, id: imported.id || uid() };
      const exists = state.projects.findIndex(p => p.id === project.id);
      if (exists >= 0) state.projects[exists] = project;
      else state.projects.push(project);
      fileHandles.all = null; fileHandles.projects = {};
      storageLoadFailed = false; saveToStorage(); restoreStats(data, [project.id]);
      toast('불러오기 완료! 📖');
      renderHome();
    } catch(err) { toast(err.message || '파일을 읽을 수 없습니다.'); }
  };
  reader.readAsText(file);
  e.target.value = '';
}

// ═══════════════════════════════════════════════════════════════
// NAVIGATION
// ═══════════════════════════════════════════════════════════════
function goHome() {
  state.activeProjectId = null;
  state.activeTab = 'home';
  document.getElementById('sidebar').style.display = 'none';
  document.getElementById('menu-toggle').style.display = 'none';
  document.getElementById('header-sep').style.display = 'none';
  document.getElementById('header-project').textContent = '';
  document.getElementById('btn-save-project').style.display = 'none';
  document.getElementById('btn-load-project').style.display = 'none';
  const gsBtn = document.getElementById('btn-global-search');
  if (gsBtn) gsBtn.style.display = 'none';
  document.getElementById('main').classList.remove('no-pad');
  closeSidebar();
  history.replaceState({screen:'home'}, null);
  renderHome();
}

function openProject(id) {
  if (state.activeProjectId !== id) splitOverviewEditing = false;
  state.activeProjectId = id;
  state.activeTab = 'overview';
  const p = getProject();
  document.getElementById('sidebar').style.display = 'flex';
  document.getElementById('menu-toggle').style.display = 'inline-flex';
  document.getElementById('header-sep').style.display = 'inline';
  document.getElementById('header-project').textContent = p.title || '제목 없음';
  document.getElementById('btn-save-project').style.display = 'inline-flex';
  document.getElementById('btn-load-project').style.display = 'inline-flex';
  const gsBtn = document.getElementById('btn-global-search');
  if (gsBtn) gsBtn.style.display = 'inline-flex';
  document.getElementById('sidebar-project-title').textContent = p.title || '제목 없음';
  document.getElementById('sidebar-project-status').innerHTML = statusBadge(p.status);
  updateFileStatus();
  navigate('overview');
}

function navigate(tab) {
  const prevTab = state.activeTab;
  state.activeTab = tab;
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.tab === tab);
  });
  document.getElementById('main').classList.toggle('no-pad', tab === 'chapters');
  closeSidebar();
  updateBadges();
  history.pushState({screen:'tab', tab, id: state.activeProjectId}, null);

  // 열려있는 패널/백드롭 모두 닫기
  const splitPanel = document.getElementById('split-panel');
  if (splitPanel) splitPanel.classList.add('hidden');
  const splitBd = document.getElementById('split-panel-backdrop');
  if (splitBd) splitBd.style.display = 'none';
  const mobileBd = document.getElementById('mobile-chapter-backdrop');
  if (mobileBd) mobileBd.style.display = 'none';
  const mobilePanel = document.getElementById('mobile-chapter-panel');
  if (mobilePanel) mobilePanel.classList.remove('open');
  // 복선 자동완성 드롭다운 잔존물 제거
  if (typeof fsAcClose === 'function') fsAcClose();
  // 떠있는 다이얼로그/모달 정리
  document.querySelectorAll('.ask-dialog-bg, .confirm-dialog-bg').forEach(el => el.remove());
  const gsM = document.getElementById('gs-modal');
  if (gsM) gsM.style.display = 'none';

  const renders = {
    overview: renderOverview,
    characters: renderCharacters,
    relations: renderRelations,
    world: renderWorld,
    plot: renderPlot,
    chapters: renderChapters,
    schedule: renderSchedule,
    diagram: renderDiagram,
    familytree: renderFamilyTree,
    manuscript: renderManuscript,
    memo: renderMemo,
    family: renderFamily,
    psyarc: renderPsyArc,
    foreshadow: renderForeshadow,
    chronicle: renderChronicle,
    stats: renderStats,
    items: renderItems,
    glossary: renderGlossary,
  };

  if (renders[tab]) renders[tab]();
}

function toggleSidebar() {
  const sb  = document.getElementById('sidebar');
  const ov  = document.getElementById('sidebar-overlay');
  const btn = document.getElementById('menu-toggle');
  const isMobile = window.innerWidth <= 768;

  if (isMobile) {
    // 모바일: open 클래스 토글
    const isOpen = sb.classList.contains('open');
    if (isOpen) {
      sb.classList.remove('open');
      ov.style.display = 'none';
    } else {
      sb.classList.add('open');
      ov.style.display = 'block';
    }
  } else {
    // PC/태블릿: sidebar 자체를 숨기거나 보이게
    const isHidden = sb.style.display === 'none' || sb.classList.contains('hidden');
    if (isHidden) {
      sb.style.display = 'flex';
      sb.classList.remove('hidden');
      if (btn) { btn.style.opacity = '1'; }
    } else {
      sb.style.display = 'none';
      sb.classList.add('hidden');
      if (btn) { btn.style.opacity = '0.5'; }
    }
  }
}
function closeSidebar() {
  if (window.innerWidth <= 768) {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebar-overlay').style.display = 'none';
  }
}

function updateBadges() {
  const p = getProject();
  if (!p) return;
  const b = {
    characters: (p.characters||[]).length,
    world: (p.worldSettings||[]).length,
    plot: (p.arcs||[]).length,
    chapters: (p.chapters||[]).length,
    psyarc: (p.psyArcs||[]).length,
    items: (p.items||[]).length,
    glossary: (p.glossary||[]).length,
  };
  Object.entries(b).forEach(([k,v]) => {
    const el = document.getElementById('badge-'+k);
    if (el) el.textContent = v || '';
  });
}

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════
const GENRES = ['판타지','현대 판타지','로맨스','로맨스 판타지','무협','SF','스릴러','호러','일상물','기타'];
const STATUSES = ['기획중','집필중','탈고','연재중','완결'];
const ROLES = ['주인공','히로인/히어로','조력자','악역','중립','조연','단역'];
const WORLD_CATS_COMMON = ['역사/연표','종족/민족','언어','종교/신앙','마법·기술 체계','법률/제도','경제/화폐','문화/관습','기타'];
const WORLD_CATS_GEO = {
  '판타지':        ['세계/차원','대륙','왕국','지역','도시','마을/장소'],
  '로맨스 판타지': ['세계/차원','대륙','왕국','지역','도시','마을/장소'],
  '현대 판타지':   ['국가','도시','구/지역','장소/건물'],
  '로맨스':        ['국가','도시','구/지역','장소/건물'],
  '무협':          ['천하','지역','문파/도시','마을/장소'],
  'SF':            ['은하/성계','행성','구역','도시','장소'],
  '스릴러':        ['국가','도시','구/지역','장소/건물'],
  '호러':          ['국가','도시','구/지역','장소/건물'],
  '일상물':        ['국가','도시','구/지역','장소/건물'],
  '기타':          ['지역','도시','장소'],
};
function getWorldCats(genre) {
  const geo = WORLD_CATS_GEO[genre] || WORLD_CATS_GEO['기타'];
  return [...geo, ...WORLD_CATS_COMMON];
}
const WORLD_CATS = getWorldCats('판타지');
const SCENE_TYPES = ['평범','긴장감','갈등','전투','로맨스','반전','복선','클라이맥스'];
const CH_STATUSES = ['초안','수정중','완료'];
const PLATFORMS = ['카카오페이지','네이버 시리즈','문피아','조아라','리디','기타'];

function uid() { return Date.now() + Math.random().toString(36).slice(2,6); }
function esc(s) { return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function jsArg(s) { return esc(JSON.stringify(String(s ?? ''))); }
function statusBadge(s) {
  return `<span class="status-badge s-${esc(s)}">${esc(s)}</span>`;
}
function selOpts(arr, val) {
  return arr.map(a => `<option value="${esc(a)}" ${a===val?'selected':''}>${esc(a)}</option>`).join('');
}
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}
function autoSave() {
  const savedLocally = saveToStorage();
  updateBadges();
  return savedLocally;
}

// ═══════════════════════════════════════════════════════════════
