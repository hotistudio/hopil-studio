// MODAL SYSTEM
// ═══════════════════════════════════════════════════════════════
function showModal(html, closable=false) {
  closeModal();
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.id = 'modal-bg';
  bg.innerHTML = `<div class="modal">${html}</div>`;
  if (closable) {
    bg.addEventListener('click', e => { if (e.target === bg) closeModal(); });
  }
  document.body.appendChild(bg);
}
function selectEdgeOpt(groupId, btn, val) {
  const group = document.getElementById(groupId);
  if (!group) return;
  // 색상 원형 그룹 판별 (nd-color-group, cm-color-group 등)
  const isColorGroup = groupId.includes('color-group');
  group.querySelectorAll('button').forEach(b => {
    const active = b === btn;
    if (isColorGroup) {
      // 색상 원형: border만 변경, 배경색은 절대 건드리지 않음
      b.style.borderColor = active ? '#c4922a' : b.dataset.border || 'rgba(0,0,0,.15)';
      b.style.transform   = active ? 'scale(1.2)' : 'scale(1)';
      b.style.boxShadow   = active ? '0 0 0 2px var(--gold)' : '';
    } else {
      b.style.borderColor = active ? 'var(--gold)'       : 'var(--border)';
      b.style.background  = active ? 'var(--gold-light)' : 'transparent';
      b.style.color       = active ? 'var(--gold)'       : 'var(--muted)';
    }
    if (active) b.dataset.selected = '1';
    else        delete b.dataset.selected;
  });
}

function closeModal() {
  const m = document.getElementById('modal-bg');
  if (m) m.remove();
  // 엣지 선택 해제
  if (dgState.selectedEdgeIdx !== null) {
    dgState.selectedEdgeIdx = null;
    renderDiagramCanvas();
  }
}
// Ctrl+S 브라우저 기본 동작 완전 차단 (캡처 단계)
window.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'h') {
    if (state.activeTab === 'chapters') {
      e.preventDefault();
      e.stopPropagation();
      toggleFindReplace();
    }
  }
  // Ctrl+Shift+F 전체 작품 검색
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'F' || e.key === 'f')) {
    if (getProject()) {
      e.preventDefault();
      e.stopPropagation();
      openGlobalSearch();
    }
  }
  // Ctrl+S 경고 배너 표시
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    showCtrlSWarning();
  }
  if ((e.ctrlKey || e.metaKey) && e.key === 'h') {
    if (getProject() && state.activeTab === 'chapters') {
      e.preventDefault();
      e.stopPropagation();
      toggleFindReplace();
    }
  }
}, true);

function showCtrlSWarning() {
  const existing = document.getElementById('ctrls-warning');
  if (existing) { existing.remove(); }
  const banner = document.createElement('div');
  banner.id = 'ctrls-warning';
  banner.style.cssText = `
    position:fixed;top:50%;left:50%;
    transform:translate(-50%,-50%);
    background:rgba(181,69,27,.95);
    color:#fff;padding:18px 28px;border-radius:16px;
    font-size:14px;font-weight:700;
    font-family:'Noto Sans KR',sans-serif;
    line-height:1.8;text-align:center;
    z-index:99999;pointer-events:none;
    box-shadow:0 8px 32px rgba(0,0,0,.3);
    opacity:0;transition:opacity .15s;
  `;
  banner.innerHTML = '⚠️ Ctrl+S는 브라우저 페이지 저장 단축키예요<br><span style="font-size:12px;font-weight:400;opacity:.85">파일 저장은 💾 파일 저장 버튼을 사용해주세요</span>';
  document.body.appendChild(banner);
  requestAnimationFrame(() => { banner.style.opacity = '1'; });
  setTimeout(() => {
    banner.style.opacity = '0';
    setTimeout(() => banner.remove(), 200);
  }, 2500);
}

document.addEventListener('keydown', e => {
  // ESC → 모달 닫기
  if (e.key === 'Escape') { closeModal(); return; }

  // Ctrl+1~0 → 특수기호 삽입 (집필 편집기 + 집중 모드)
  if ((e.ctrlKey || e.metaKey) && SHORTCUT_SYMBOLS[e.key]) {
    const ta = document.getElementById('prose-editor');
    const fe = document.getElementById('focus-editor');
    const active = document.activeElement;
    if (active !== ta && active !== fe) return;
    e.preventDefault();
    const sym = SHORTCUT_SYMBOLS[e.key];
    if (active === fe) {
      // 집중 모드 에디터
      const s = fe.selectionStart, en = fe.selectionEnd;
      const selected = fe.value.slice(s, en);
      const isPair = sym.length === 2;
      if (isPair) {
        const inner = selected || '';
        fe.value = fe.value.slice(0,s) + sym[0] + inner + sym[1] + fe.value.slice(en);
        if (inner) { fe.selectionStart = s+1; fe.selectionEnd = s+1+inner.length; }
        else fe.selectionStart = fe.selectionEnd = s+1;
      } else {
        fe.value = fe.value.slice(0,s) + sym + fe.value.slice(en);
        fe.selectionStart = fe.selectionEnd = s + sym.length;
      }
      fe.dispatchEvent(new Event('input', {bubbles:true}));
    } else {
      insertSymbol(sym);
    }
    const ind = document.getElementById('shortcut-indicator');
    if (ind) {
      ind.textContent = sym;
      ind.style.opacity = '1';
      clearTimeout(ind._t);
      ind._t = setTimeout(() => { ind.style.opacity = '0'; }, 800);
    }
    return;
  }
});


// ═══════════════════════════════════════════════════════════
// 단축키 초기화
// ═══════════════════════════════════════════════════════════
const DEFAULT_SHORTCUTS = {
  '1': '…', '2': '“”', '3': '‘’', '4': '「」',
  '5': '『』', '6': '〈〉', '7': '《》', '8': '()',
};
function loadShortcuts() {
  try {
    const s = localStorage.getItem('hopil_studio_shortcuts');
    return s ? JSON.parse(s) : {...DEFAULT_SHORTCUTS};
  } catch { return {...DEFAULT_SHORTCUTS}; }
}
function saveShortcuts(map) {
  localStorage.setItem('hopil_studio_shortcuts', JSON.stringify(map));
}
let SHORTCUT_SYMBOLS = loadShortcuts();


function showSavedBanner(success=true) {
  const existing = document.getElementById('saved-banner');
  if (existing) { existing.remove(); }
  const banner = document.createElement('div');
  banner.id = 'saved-banner';
  banner.style.cssText = `
    position:fixed;top:50%;left:50%;
    transform:translate(-50%,-50%);
    background:${success ? 'var(--ink)' : 'rgba(181,69,27,.9)'};
    color:#fff;padding:16px 32px;border-radius:40px;
    font-size:16px;font-weight:700;
    font-family:'Noto Sans KR',sans-serif;letter-spacing:.5px;
    z-index:9999;pointer-events:none;
    box-shadow:0 8px 32px rgba(0,0,0,.3);
    opacity:0;transition:opacity .15s;
  `;
  banner.textContent = success ? '✓ 저장되었습니다!' : '⚠️ 저장이 되지 않았습니다.';
  document.body.appendChild(banner);
  requestAnimationFrame(() => { banner.style.opacity = '1'; });
  setTimeout(() => {
    banner.style.opacity = '0';
    setTimeout(() => banner.remove(), 200);
  }, success ? 1200 : 2000);
}


// ═══════════════════════════════════════════════════════════
// 컬러 테마
const COLOR_THEMES = [
  { id:'yellow', label:'노랑', color:'#c4922a' },
  { id:'red',    label:'빨강', color:'#c43a3a' },
  { id:'orange', label:'주황', color:'#c4622a' },
  { id:'green',  label:'초록', color:'#2a7a3a' },
  { id:'blue',   label:'파랑', color:'#2a52c4' },
  { id:'navy',   label:'남색', color:'#2a2a8a' },
  { id:'purple', label:'보라', color:'#7a2ac4' },
];

function applyColorTheme(id) {
  document.documentElement.setAttribute('data-color-theme', id);
  localStorage.setItem('hopil_studio_color_theme', id);
  // 피커 닫기
  document.getElementById('theme-picker-popup')?.remove();
}

function toggleThemePicker() {
  const existing = document.getElementById('theme-picker-popup');
  if (existing) { existing.remove(); return; }
  const btn = document.getElementById('btn-theme');
  const rect = btn.getBoundingClientRect();
  const cur = localStorage.getItem('hopil_studio_color_theme') || 'yellow';
  const popup = document.createElement('div');
  popup.id = 'theme-picker-popup';
  popup.style.cssText = `position:fixed;top:${rect.bottom+6}px;right:${window.innerWidth-rect.right}px;
    background:var(--paper);border:1.5px solid var(--border);border-radius:14px;
    padding:14px 16px;z-index:9999;box-shadow:0 8px 32px var(--shadow);min-width:200px`;
  popup.innerHTML = `
    <div style="font-size:12px;font-weight:700;color:var(--muted);margin-bottom:12px;letter-spacing:.5px">테마 색상</div>
    <div style="display:flex;flex-direction:column;gap:8px">
      ${COLOR_THEMES.map(t => `
        <button onclick="applyColorTheme('${t.id}')"
          style="display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:9px;
            border:1.5px solid ${cur===t.id?'var(--gold)':'var(--border)'};
            background:${cur===t.id?'var(--gold-light)':'transparent'};
            cursor:pointer;font-family:'Noto Sans KR',sans-serif;
            font-size:13px;font-weight:${cur===t.id?'700':'400'};color:var(--ink);
            transition:all .15s;text-align:left;width:100%">
          <span style="width:22px;height:22px;border-radius:50%;background:${t.color};
            display:inline-block;flex-shrink:0;border:2px solid rgba(0,0,0,.08)"></span>
          ${t.label}
          ${cur===t.id?'<span style="margin-left:auto;color:var(--gold)">✓</span>':''}
        </button>`).join('')}
    </div>`;
  document.body.appendChild(popup);
  // 외부 클릭 시 닫기
  setTimeout(() => {
    document.addEventListener('click', function handler(e) {
      if (!popup.contains(e.target) && e.target !== btn) {
        popup.remove();
        document.removeEventListener('click', handler);
      }
    });
  }, 10);
}

function initColorTheme() {
  const saved = localStorage.getItem('hopil_studio_color_theme') || 'yellow';
  document.documentElement.setAttribute('data-color-theme', saved);
}

// 다크모드
// ═══════════════════════════════════════════════════════════
function initDarkMode() {
  const saved = localStorage.getItem('hopil_studio_darkmode');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const isDark = saved !== null ? saved === 'true' : prefersDark;
  applyDarkMode(isDark);
}

function applyDarkMode(isDark) {
  document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  const btn = document.getElementById('btn-darkmode');
  if (btn) btn.textContent = isDark ? '☀️' : '🌙';
  localStorage.setItem('hopil_studio_darkmode', isDark);
}

function toggleDarkMode() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  applyDarkMode(!isDark);
}


// ═══════════════════════════════════════════════════════════
// localStorage 사용량 표시
// ═══════════════════════════════════════════════════════════
function getStorageUsage() {
  try {
    let total = 0;
    for (let key in localStorage) {
      if (!localStorage.hasOwnProperty(key)) continue;
      total += (localStorage[key].length + key.length) * 2; // UTF-16 기준
    }
    return total;
  } catch { return 0; }
}

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1024 / 1024).toFixed(2) + ' MB';
}

function renderStorageIndicator() {
  const el = document.getElementById('storage-indicator');
  if (!el) return;

  const used = getStorageUsage();
  const limit = 10 * 1024 * 1024; // 10MB 기준 (Chrome Android)
  const pct = Math.min(100, (used / limit * 100));
  const color = pct > 80 ? 'var(--rust)' : pct > 60 ? 'var(--gold)' : 'var(--teal)';

  el.innerHTML = `
    <div style="display:flex;align-items:center;gap:6px">
      <div style="width:80px;height:6px;background:var(--border);border-radius:3px;overflow:hidden">
        <div style="width:${pct.toFixed(1)}%;height:100%;background:${color};border-radius:3px;transition:width .5s"></div>
      </div>
      <span style="font-size:11px;color:var(--muted)">${formatBytes(used)} / 10MB</span>
      ${pct > 80 ? '<span style="font-size:11px;color:var(--rust);font-weight:700">⚠️ 용량 부족</span>' : ''}
    </div>

  `;
}


// ═══════════════════════════════════════════════════════════
// 집필기 폰트 크기 조절
// ═══════════════════════════════════════════════════════════
let editorFontSize = parseInt(localStorage.getItem('hopil_studio_fontsize') || '16');

const READER_STYLE_KEY = 'hopil_studio_reader_style';
const READER_STYLES = [
  { id: 'default', label: '기본 집필기' },
  { id: 'kakao', label: '카카오페이지풍' },
  { id: 'ridi', label: '리디풍' },
  { id: 'naver', label: '네이버 시리즈풍' },
  { id: 'forest', label: '짙은 녹색' },
];
let readerStyle = 'default';
try {
  const saved = localStorage.getItem(READER_STYLE_KEY);
  if (READER_STYLES.some(style => style.id === saved)) readerStyle = saved;
} catch (_) {}

function readerStyleOptions() {
  return READER_STYLES.map(style =>
    `<option value="${style.id}" ${style.id === readerStyle ? 'selected' : ''}>${style.label}</option>`
  ).join('');
}

function applyReaderStyle() {
  document.documentElement.setAttribute('data-reader-style', readerStyle);
  document.querySelectorAll('.reader-style-select').forEach(select => { select.value = readerStyle; });
}

function changeReaderStyle(value) {
  if (!READER_STYLES.some(style => style.id === value)) return;
  readerStyle = value;
  try { localStorage.setItem(READER_STYLE_KEY, value); } catch (_) {}
  applyReaderStyle();
}

function applyEditorFontSize() {
  document.documentElement.style.setProperty('--editor-font-size', editorFontSize + 'px');
  const display = document.getElementById('font-size-display');
  if (display) display.textContent = editorFontSize + 'px';
}

function changeFontSize(delta) {
  editorFontSize = Math.min(28, Math.max(12, editorFontSize + delta));
  localStorage.setItem('hopil_studio_fontsize', editorFontSize);
  applyEditorFontSize();
}


// ═══════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════
// 로컬 파일 저장 (File System Access API)
// ═══════════════════════════════════════════════════════════

// Ctrl+S 시 호출 — fileHandles 시스템 사용
async function fsSaveToLocal(projectData) {
  const isProject = !!projectData;
  const data = isProject ? projectBackup(projectData) : { projects: state.projects, ...statsBackup(), version: '2.1', savedAt: new Date().toISOString() };
  const suggestedName = isProject ? (projectData.title || '호필스튜디오') + '.json' : '호필스튜디오_전체.json';

  if (FS_SUPPORTED) {
    try {
      // 기존 핸들 확인
      const existingHandle = isProject
        ? fileHandles.projects[projectData.id]
        : fileHandles.all;

      if (existingHandle) {
        const ok = await writeToFileHandle(existingHandle, data);
        if (ok) return true;
        // 핸들 깨진 경우 → 새로 선택
      }

      // 파일 선택 다이얼로그
      const handle = await window.showSaveFilePicker({
        suggestedName,
        types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }],
      });

      if (isProject) fileHandles.projects[projectData.id] = handle;
      else fileHandles.all = handle;

      const ok = await writeToFileHandle(handle, data);
      if (!ok) return false;
      updateFileStatus();
      return true;
    } catch(e) {
      if (e.name === 'AbortError') return null;
      return false;
    }
  } else {
    // 미지원 브라우저 — 다운로드 폴백
    try {
      _downloadJson(data, suggestedName);
      return true;
    } catch { return false; }
  }
}

async function tryAutoReconnect() {}

const CHAR_COLORS = [
  {v:'#ffcccc',label:'빨강'},
  {v:'#ffd9b3',label:'주황'},
  {v:'#fff0a3',label:'노랑'},
  {v:'#b3f0b3',label:'초록'},
  {v:'#b3d9ff',label:'파랑'},
  {v:'#c2b3ff',label:'남색'},
  {v:'#e0b3ff',label:'보라'},
];
// 소속별 자동 색상
const GROUP_AUTO_COLORS = [
  '#ffcccc','#ffd9b3','#fff0a3','#b3f0b3','#b3d9ff','#c2b3ff','#e0b3ff',
];



// ═══════════════════════════════════════════════════════════
// 소속 색상 관리
// ═══════════════════════════════════════════════════════════
function getGroupColorMap() {
  const p = getProject();
  if (!p.groupColors) p.groupColors = {};
  return p.groupColors;
}

function setGroupColor(groupName, color) {
  const map = getGroupColorMap();
  map[groupName] = color;
  autoSave();
  renderCharacters();
}

function getGroupColor(groupName) {
  if (!groupName) return '';
  const map = getGroupColorMap();
  if (map[groupName]) return map[groupName];
  // 자동 색상
  let hash = 0;
  for (let i=0;i<groupName.length;i++) hash = groupName.charCodeAt(i) + ((hash<<5)-hash);
  return GROUP_AUTO_COLORS[Math.abs(hash) % GROUP_AUTO_COLORS.length];
}

function showGroupColorPicker(groupName, btnEl) {
  // 기존 피커 닫기
  document.getElementById('group-color-picker')?.remove();

  const picker = document.createElement('div');
  picker.id = 'group-color-picker';
  const rect = btnEl.getBoundingClientRect();
  const pickerW = 220;
  const leftPos = Math.min(rect.left, window.innerWidth - pickerW - 12);
  picker.style.cssText = `position:fixed;top:${rect.bottom+6}px;left:${leftPos}px;
    background:var(--paper);border:1px solid var(--border);border-radius:12px;
    padding:10px;display:flex;flex-wrap:wrap;gap:6px;width:${pickerW}px;
    box-shadow:0 8px 24px var(--shadow);z-index:9000`;

  picker.innerHTML = CHAR_COLORS.map(col => `
    <button onclick="setGroupColor(${jsArg(groupName)},'${col.v}');document.getElementById('group-color-picker')?.remove()"
      style="width:28px;height:28px;border-radius:50%;background:${col.v};
        border:2px solid rgba(0,0,0,.15);cursor:pointer" title="${col.label}"></button>
  `).join('') + `
    <button onclick="setGroupColor(${jsArg(groupName)},'');document.getElementById('group-color-picker')?.remove()"
      style="width:28px;height:28px;border-radius:50%;background:var(--border);
        border:2px solid var(--border);cursor:pointer;font-size:11px" title="자동">자동</button>`;

  document.body.appendChild(picker);
  setTimeout(() => document.addEventListener('click', function h(e) {
    if (!picker.contains(e.target) && e.target !== btnEl) {
      picker.remove(); document.removeEventListener('click', h);
    }
  }), 0);
}


// ═══════════════════════════════════════════════════════════
// 가문 (FAMILY)
// ═══════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════
// 집필 통계
// ═══════════════════════════════════════════════════════════════
const STATS_KEY = 'hopil_studio_writing_stats';

function getTodayStr(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}
function loadStats() {
  try { return JSON.parse(localStorage.getItem(STATS_KEY) || '{}'); } catch(e) { return {}; }
}
function saveStats(s) {
  try { localStorage.setItem(STATS_KEY, JSON.stringify(s)); } catch(e) {}
}
function cleanImportedStats(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const cleaned = Object.create(null);
  for (const [pid, days] of Object.entries(value)) {
    if (!/^[\w.-]+$/.test(pid) || !days || typeof days !== 'object' || Array.isArray(days)) continue;
    const validDays = Object.create(null);
    for (const [day, amount] of Object.entries(days)) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(amount) && amount >= 0) validDays[day] = amount;
    }
    cleaned[pid] = validDays;
  }
  return cleaned;
}
function statsBackup(projectId) {
  const writing = cleanImportedStats(loadStats());
  const typing = cleanImportedStats(loadTypingStats());
  if (!projectId) return { writingStats: writing, typingStats: typing };
  return { writingStats: { [projectId]: writing[projectId] || {} }, typingStats: { [projectId]: typing[projectId] || {} } };
}
function projectBackup(project) {
  return { project, ...statsBackup(project.id), version: '2.1', savedAt: new Date().toISOString() };
}
function restoreStats(data, projectIds, replaceAll = false) {
  const ids = new Set(projectIds);
  for (const [key, incoming] of [[STATS_KEY, data.writingStats], [TYPING_STATS_KEY, data.typingStats]]) {
    if (incoming === undefined) continue; // 예전 백업에는 통계가 없다.
    const current = replaceAll ? {} : cleanImportedStats(key === STATS_KEY ? loadStats() : loadTypingStats());
    const restored = cleanImportedStats(incoming);
    for (const id of ids) if (Object.prototype.hasOwnProperty.call(restored, id)) current[id] = restored[id];
    try { localStorage.setItem(key, JSON.stringify(current)); } catch(e) { toast('⚠️ 집필 통계를 저장하지 못했어요.'); }
  }
}
function writtenCharDelta(before, after, inputEvent) {
  const type = inputEvent?.inputType || '';
  if (!['insertText', 'insertCompositionText', 'insertLineBreak', 'insertParagraph'].includes(type)) return 0;
  return Math.max(0, after.length - before.length);
}
function recordDailyWriting(chars) {
  const stats = loadStats();
  const pid = state.activeProjectId;
  if (!pid) return;
  const today = getTodayStr();
  if (!stats[pid]) stats[pid] = {};
  const prevCount = stats[pid][today] || 0;
  stats[pid][today] = prevCount + chars;
  saveStats(stats);
  // 목표 달성 감지 (넘는 순간 한 번만)
  const goal = getWritingGoal();
  if (prevCount < goal && stats[pid][today] >= goal) {
    setTimeout(() => launchConfetti(), 100);
  }
}

function launchConfetti() {
  // 기존 캔버스 제거
  const old = document.getElementById('confetti-canvas');
  if (old) old.remove();

  const canvas = document.createElement('canvas');
  canvas.id = 'confetti-canvas';
  canvas.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:99999;pointer-events:none';
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  document.body.appendChild(canvas);

  const ctx = canvas.getContext('2d');
  const pieces = Array.from({length: 120}, () => ({
    x: Math.random() * canvas.width,
    y: -10 - Math.random() * 100,
    r: 4 + Math.random() * 6,
    d: 2 + Math.random() * 3,
    color: `hsl(${Math.random()*360},90%,60%)`,
    tilt: Math.random() * 10 - 5,
    tiltAngle: 0,
    tiltSpeed: 0.1 + Math.random() * 0.1,
  }));

  toast('🎉 오늘 목표 달성! 수고했어요!');

  let frame = 0;
  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    pieces.forEach(p => {
      p.tiltAngle += p.tiltSpeed;
      p.y += p.d;
      p.x += Math.sin(p.tiltAngle) * 1.5;
      p.tilt = Math.sin(p.tiltAngle) * 10;
      ctx.beginPath();
      ctx.fillStyle = p.color;
      ctx.ellipse(p.x, p.y, p.r, p.r * 0.4, p.tilt, 0, Math.PI * 2);
      ctx.fill();
    });
    frame++;
    if (frame < 180) requestAnimationFrame(draw);
    else canvas.remove();
  }
  draw();
}
function getWritingGoal() {
  try { return parseInt(localStorage.getItem('hopil_studio_goal') || '1000'); } catch(e) { return 1000; }
}
function setWritingGoal(n) {
  localStorage.setItem('hopil_studio_goal', String(n));
}

// ═══════════════════════════════════════════════════════════
// 타이핑 시간 감지
// ═══════════════════════════════════════════════════════════
const TYPING_IDLE_KEY = 'hopil_studio_typing_gap';
function getTypingGap() {
  return parseInt(localStorage.getItem(TYPING_IDLE_KEY) || '5');
}
function setTypingGap(n) {
  localStorage.setItem(TYPING_IDLE_KEY, String(Math.max(1, Math.min(30, n))));
}
const TYPING_STATS_KEY = 'hopil_studio_typing_stats';
function loadTypingStats() {
  try { return JSON.parse(localStorage.getItem(TYPING_STATS_KEY) || '{}'); } catch { return {}; }
}
function saveTypingStats(s) {
  try { localStorage.setItem(TYPING_STATS_KEY, JSON.stringify(s)); } catch {}
}
function recordTypingSec(sec) {
  const pid = state.activeProjectId;
  if (!pid) return;
  const today = getTodayStr();
  const s = loadTypingStats();
  if (!s[pid]) s[pid] = {};
  s[pid][today] = (s[pid][today] || 0) + sec;
  saveTypingStats(s);
}
function getTodayTypingSec() {
  const pid = state.activeProjectId;
  if (!pid) return 0;
  const s = loadTypingStats();
  return (s[pid] || {})[getTodayStr()] || 0;
}
function getWeekTypingSec() {
  const pid = state.activeProjectId;
  if (!pid) return 0;
  const s = (loadTypingStats()[pid] || {});
  let total = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date(); d.setDate(d.getDate() - i);
    total += s[getTodayStr(d)] || 0;
  }
  return total;
}
function getMonthTypingSec() {
  const pid = state.activeProjectId;
  if (!pid) return 0;
  const s = (loadTypingStats()[pid] || {});
  let total = 0;
  for (let i = 0; i < 30; i++) {
    const d = new Date(); d.setDate(d.getDate() - i);
    total += s[getTodayStr(d)] || 0;
  }
  return total;
}
let _typingState = { active:false, idleTimer:null, sessionSec:0, ticker:null };
function typingFmt(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m + '분 ' + s + '초';
}
function onTypingKey() {
  if (!_typingState.active) {
    _typingState.active = true;
    _typingState.ticker = setInterval(() => {
      _typingState.sessionSec++;
      pomoState.sessionTypingSec++;
      recordTypingSec(1);
      updateTypingDisplay();
    }, 1000);
  }
  clearTimeout(_typingState.idleTimer);
  _typingState.idleTimer = setTimeout(() => {
    _typingState.active = false;
    clearInterval(_typingState.ticker);
    _typingState.ticker = null;
  }, getTypingGap() * 1000);
}
function stopTypingTimer() {
  clearTimeout(_typingState.idleTimer);
  clearInterval(_typingState.ticker);
  _typingState.active = false;
  _typingState.ticker = null;
}
document.addEventListener('visibilitychange', () => { if (document.hidden) stopTypingTimer(); });
window.addEventListener('blur', stopTypingTimer);
function updateTypingDisplay() {
  const el = document.getElementById('pomo-typing-time');
  if (el) el.textContent = typingFmt(pomoState.sessionTypingSec);
  const todayEl = document.getElementById('stat-typing-today');
  if (todayEl) todayEl.textContent = typingFmt(getTodayTypingSec());
}
function resetSessionTyping() {
  _typingState.sessionSec = 0;
  pomoState.sessionTypingSec = 0;
  const el = document.getElementById('pomo-typing-time');
  if (el) el.textContent = '0분 0초';
}

function renderStats() {
  const p = getProject();
  if (!p) return;
  const stats = loadStats();
  const pid = state.activeProjectId;
  const pStats = stats[pid] || {};
  const today = getTodayStr();
  const todayCount = pStats[today] || 0;
  const goal = getWritingGoal();
  const goalPct = Math.min(100, Math.round(todayCount / goal * 100));

  // streak 계산
  let streak = 0;
  const d = new Date();
  for (let i = 0; i < 365; i++) {
    const key = getTodayStr(d);
    if ((pStats[key] || 0) > 0) { streak++; d.setDate(d.getDate() - 1); }
    else break;
  }

  // 히트맵 (8주)
  const weeks = 12;
  const days = weeks * 7;
  const maxVal = Math.max(...Object.values(pStats).filter(v => v > 0), 1);
  const colors = ['var(--cream)','#c6e48b','#7bc96f','#239a3b','#196127'];
  // 7행 × 12열 — 오늘(왼쪽 위), 아래로 날짜 증가(과거), 열 넘어가면 다음 열
  let calRows = '';
  for (let row = 0; row < 7; row++) {
    let rowHtml = '';
    for (let col = 0; col < weeks; col++) {
      const idx = col * 7 + row;
      const dd = new Date();
      dd.setDate(dd.getDate() - idx);
      const key = getTodayStr(dd);
      const val = pStats[key] || 0;
      const intensity = val === 0 ? 0 : Math.ceil((val / maxVal) * 4);
      const isToday = key === today;
      rowHtml += `<div title="${key}: ${val.toLocaleString()}자" style="width:16px;height:16px;border-radius:3px;background:${colors[intensity]};${isToday?'outline:2px solid var(--gold);outline-offset:1px':''}"></div>`;
    }
    calRows += `<div style="display:flex;gap:3px">${rowHtml}</div>`;
  }

  // 월별 통계 (2026년 3월부터 현재까지)
  const startYear = 2026, startMonth = 2; // 0-indexed: 2 = 3월
  const nowDate = new Date();
  const monthStats = [];
  let my = startYear, mm = startMonth;
  while (my < nowDate.getFullYear() || (my === nowDate.getFullYear() && mm <= nowDate.getMonth())) {
    const label = `${my}/${mm+1}월`;
    let total = 0;
    const daysInMonth = new Date(my, mm+1, 0).getDate();
    for (let d2 = 1; d2 <= daysInMonth; d2++) {
      const key = `${my}-${String(mm+1).padStart(2,'0')}-${String(d2).padStart(2,'0')}`;
      total += pStats[key] || 0;
    }
    monthStats.push({ label, total });
    mm++;
    if (mm > 11) { mm = 0; my++; }
  }
  const maxMonth = Math.max(...monthStats.map(m => m.total), 1);

  // 최근 30일 합산
  const last30 = Array.from({length:30},(_,i)=>{
    const dd = new Date(); dd.setDate(dd.getDate()-i);
    return pStats[getTodayStr(dd)]||0;
  }).reduce((a,b)=>a+b,0);

  const goalColor = goalPct >= 100 ? 'var(--teal)' : 'var(--gold)';

  document.getElementById('main').innerHTML = `
    <div style="max-width:700px;margin:0 auto">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:22px">
        <div>
          <div class="font-display" style="font-size:22px">집필 통계</div>
          <div style="font-size:12px;color:var(--muted);margin-top:4px">${esc(p.title)}</div>
          <div style="font-size:11px;color:var(--muted);margin-top:5px">직접 입력해 늘어난 글자만 기록해요 · 붙여넣기는 제외돼요</div>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:20px">
        <div class="card card-sm" style="text-align:center">
          <div style="font-size:11px;color:var(--muted);margin-bottom:6px">오늘 쓴 글자</div>
          <div class="font-display" style="font-size:28px;color:var(--gold)">${todayCount.toLocaleString()}</div>
          <div style="font-size:11px;color:var(--muted)">자</div>
        </div>
        <div class="card card-sm" style="text-align:center">
          <div style="font-size:11px;color:var(--muted);margin-bottom:6px">연속 집필</div>
          <div class="font-display" style="font-size:28px;color:var(--teal)">${streak}</div>
          <div style="font-size:11px;color:var(--muted)">일째 🔥</div>
        </div>
        <div class="card card-sm" style="text-align:center">
          <div style="font-size:11px;color:var(--muted);margin-bottom:6px">최근 30일</div>
          <div class="font-display" style="font-size:28px;color:var(--ink)">${last30.toLocaleString()}</div>
          <div style="font-size:11px;color:var(--muted)">자</div>
        </div>
      </div>

      <!-- 타이핑 시간 카드 -->
      <div class="card card-sm" style="margin-bottom:20px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
          <span style="font-weight:700;font-size:13px">⌨️ 순수 타이핑 시간</span>
          <div style="display:flex;align-items:center;gap:6px">
            <span style="font-size:11px;color:var(--muted)">유휴 간격</span>
            <input type="number" id="typing-gap-input" value="${getTypingGap()}" min="1" max="30" step="1"
              style="width:52px;text-align:center;font-size:13px;padding:4px 6px"
              onchange="setTypingGap(parseInt(this.value)||5)">
            <span style="font-size:11px;color:var(--muted)">초</span>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap">
          <div style="text-align:center;flex:1">
            <div class="font-display" style="font-size:26px;color:var(--teal)" id="stat-typing-today">${typingFmt(getTodayTypingSec())}</div>
            <div style="font-size:11px;color:var(--muted);margin-top:2px">오늘</div>
          </div>
          <div style="text-align:center;flex:1">
            <div class="font-display" style="font-size:26px;color:var(--muted)">${typingFmt(getWeekTypingSec())}</div>
            <div style="font-size:11px;color:var(--muted);margin-top:2px">최근 7일</div>
          </div>
          <div style="text-align:center;flex:1">
            <div class="font-display" style="font-size:26px;color:var(--muted)">${typingFmt(getMonthTypingSec())}</div>
            <div style="font-size:11px;color:var(--muted);margin-top:2px">최근 30일</div>
          </div>
        </div>
        <div style="font-size:11px;color:var(--muted);margin-top:10px;padding-top:8px;border-top:1px solid var(--border)">
          💡 키를 입력하다 <b>${getTypingGap()}초</b> 이상 멈추면 타이핑이 끊긴 것으로 간주해요
        </div>
      </div>

      <div class="card card-sm" style="margin-bottom:20px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
          <span style="font-weight:700;font-size:13px">오늘 목표</span>
          <div style="display:flex;align-items:center;gap:8px">
            <input type="number" id="goal-input" value="${goal}" min="100" step="100"
              style="width:90px;text-align:right;font-size:13px;padding:4px 8px"
              onchange="setWritingGoal(parseInt(this.value)||1000);renderStats()">
            <span style="font-size:12px;color:var(--muted)">자</span>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:10px">
          <div class="progress-bar" style="flex:1;height:12px">
            <div class="progress-fill" style="width:${goalPct}%"></div>
          </div>
          <span style="font-size:13px;font-weight:700;color:${goalColor};min-width:36px;text-align:right">${goalPct}%</span>
        </div>
        ${goalPct >= 100
          ? `<div style="font-size:12px;color:var(--teal);margin-top:8px;text-align:center">🎉 오늘 목표 달성!</div>`
          : `<div style="font-size:11px;color:var(--muted);margin-top:6px;text-align:right">${(goal-todayCount).toLocaleString()}자 남았어요</div>`}
      </div>

      <div class="card card-sm">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;align-items:start">
          <!-- 달력 히트맵 -->
          <div>
            <div style="font-weight:700;font-size:12px;margin-bottom:10px;color:var(--muted)">📅 최근 ${weeks}주</div>
            <div style="display:flex;flex-direction:column;gap:3px">
              ${calRows}
            </div>
            <div style="display:flex;align-items:center;gap:4px;margin-top:8px">
              <span style="font-size:10px;color:var(--muted)">적음</span>
              ${colors.map(c=>`<div style="width:12px;height:12px;border-radius:2px;background:${c}"></div>`).join('')}
              <span style="font-size:10px;color:var(--muted)">많음</span>
            </div>
          </div>
          <!-- 월별 통계 -->
          <div>
            <div style="font-weight:700;font-size:12px;margin-bottom:10px;color:var(--muted)">📊 월별 글자 수</div>
            ${monthStats.map(m => `
              <div style="margin-bottom:7px">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px">
                  <span style="font-size:11px;font-weight:600">${m.label}</span>
                  <span style="font-size:11px;color:var(--muted)">${m.total.toLocaleString()}자</span>
                </div>
                <div style="height:5px;background:var(--cream);border-radius:3px;overflow:hidden">
                  <div style="height:100%;width:${Math.round(m.total/maxMonth*100)}%;background:var(--teal2);border-radius:3px;transition:width .4s"></div>
                </div>
              </div>`).join('')}
          </div>
        </div>
      </div>
    </div>`;
}

// ═══════════════════════════════════════════════════════════════
// 심리 아크
// ═══════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════
// 아이템 사전
// ═══════════════════════════════════════════════════════════════
const ITEM_GROUPS = [
  { group: '중요',  cats: ['메인','서브'] },
  { group: '장비',  cats: ['무기','방어구','의복'] },
  { group: '소비',  cats: ['재료','음식','약물'] },
  { group: '생활',  cats: ['책','문서','화폐'] },
  { group: '기타',  cats: ['탈것','마법/기술','기타'] },
];
const ITEM_CATS = ITEM_GROUPS.flatMap(g => g.cats);
const ITEM_RARITIES = [
  {label:'일반',   color:'#9a8e7f'},
  {label:'희귀',   color:'#2d8285'},
  {label:'영웅',   color:'#7986cb'},
  {label:'전설',   color:'#c4922a'},
  {label:'신화',   color:'#e06040'},
];

// ═══════════════════════════════════════════════════════════
// 복선 관리
// ═══════════════════════════════════════════════════════════

// ─── 복선 태그 스캐너 ────────────────────────────────────────
// 본문에서 [[복선:이름]] 패턴을 찾아 인덱스를 만듦.
// 이름에는 공백·한글 허용, `]]` 만 제외.
const FORESHADOW_TAG_RE = /\[\[복선:([^\]\n]+?)\]\]/g;

// 결과: { byName: {name:{chapters:[chId], positions:[{chId,pos,len,before,after}]}},
//        byChapter: {chId:[name...]} }
// 캐시 안 함 — 호출할 때마다 새로 스캔 (작가 스타일상 200화 × 5000자도 <50ms).
function buildForeshadowIndex() {
  const p = getProject();
  const chapters = (p?.chapters) || [];
  const byName = {};
  const byChapter = {};
  chapters.forEach(ch => {
    const text = ch.content || '';
    if (!text) { byChapter[ch.id] = []; return; }
    const seenInCh = new Set();
    FORESHADOW_TAG_RE.lastIndex = 0;
    let m;
    while ((m = FORESHADOW_TAG_RE.exec(text)) !== null) {
      const name = m[1].trim();
      if (!name) continue;
      if (!byName[name]) byName[name] = { chapters: [], positions: [] };
      if (!seenInCh.has(name)) {
        byName[name].chapters.push(ch.id);
        seenInCh.add(name);
      }
      const pos = m.index, len = m[0].length;
      const ctxB = 24, ctxA = 32;
      byName[name].positions.push({
        chId: ch.id,
        pos, len,
        before: (pos > ctxB ? '…' : '') + text.substring(Math.max(0,pos-ctxB), pos),
        tag: m[0],
        after: text.substring(pos+len, Math.min(text.length, pos+len+ctxA)) + (pos+len+ctxA < text.length ? '…' : ''),
      });
    }
    byChapter[ch.id] = [...seenInCh];
  });
  return { byName, byChapter };
}

// 해당 복선의 심기/회수/언급 화 분류.
// 심기 = 첫 등장 화, 회수 = 마지막 등장 화 (복선 status=='회수완료'일 때만),
// 언급 = 그 사이 중간 등장 화들.
function classifyForeshadowChapters(foreshadow, index) {
  const tagName = (foreshadow?.tagName || '').trim();
  if (!tagName) return { planted: null, harvested: null, mentioned: [], linked: false, tagName: '' };
  const entry = index.byName[tagName];
  if (!entry || entry.chapters.length === 0) {
    return { planted: null, harvested: null, mentioned: [], linked: false, tagName };
  }
  const chIds = entry.chapters;
  const planted = chIds[0];
  let harvested = null;
  let mentioned = chIds.slice(1);
  if (foreshadow.status === '회수완료' && chIds.length >= 2) {
    harvested = chIds[chIds.length - 1];
    mentioned = chIds.slice(1, -1);
  }
  return { planted, harvested, mentioned, linked: true, tagName };
}

// 화 ID → 사람이 보기 좋은 라벨.
// 제목이 이미 번호형(1화 / 1. / 1장 / 프롤로그 / 에필로그 등)이면 제목만,
// 그렇지 않으면 "N화: 제목" 형식.
function chapterLabel(chId) {
  const p = getProject();
  if (!p) return '?';
  const chapters = p.chapters || [];
  const idx = chapters.findIndex(c => c.id === chId);
  if (idx < 0) return '?';
  const ch = chapters[idx];
  const title = (ch.title || '').trim();
  if (!title) return `${idx + 1}화`;
  // 번호·회차성 제목이면 그대로
  // 예: "1화", "1 화", "1장", "1부", "1회", "1편", "1. 제목", "제1화", "프롤로그", "에필로그", "번외", "외전"
  const isNumeric = /^(제\s*)?\d+\s*(화|장|부|회|편|\.)/.test(title)
                  || /^(프롤로그|에필로그|번외|외전|서장|종장|막간)/.test(title);
  if (isNumeric) return title;
  return `${idx + 1}화: ${title}`;
}

// ─── 에디터 내 [[복선: 자동완성 ─────────────────────────────
// prose-editor 에서 키 입력 시 커서 앞을 보고, "[[복선:" 뒤 쿼리가 있으면
// 기존 복선의 tagName 중 매칭되는 것을 드롭다운으로 보여줌.
const FSAC = {
  open: false,
  items: [],
  sel: 0,
  triggerStart: -1, // "[[" 시작 위치
  queryStart: -1,   // ":" 뒤 쿼리 시작
};

function fsAcCheck() {
  const ta = document.getElementById('prose-editor');
  if (!ta || document.activeElement !== ta) { fsAcClose(); return; }
  const pos = ta.selectionStart;
  const text = ta.value;
  // 커서 앞 최대 40자 조사 — 닫힘(]]) 전까지만
  const back = text.substring(Math.max(0, pos - 40), pos);
  const m = /\[\[복선:([^\]\n]*)$/.exec(back);
  if (!m) { fsAcClose(); return; }
  const triggerStart = pos - m[0].length;
  const queryStart = triggerStart + 5; // "[[복선:" = 5 chars... 실제로는 [[복선: = 5 글자
  // 문자열 길이 계산: [[ + 복선 + : = 2+2+1 = 5
  const query = m[1];
  // 후보 수집
  const p = getProject();
  const pool = (p?.foreshadows || [])
    .map(f => ({ name: (f.tagName||'').trim(), content: (f.content||'').slice(0, 50), status: f.status || '미회수' }))
    .filter(x => x.name);
  // 중복 제거
  const seen = new Set();
  const unique = [];
  for (const x of pool) {
    if (seen.has(x.name)) continue;
    seen.add(x.name); unique.push(x);
  }
  const q = query.toLowerCase();
  let items = q ? unique.filter(x => x.name.toLowerCase().includes(q)) : unique;
  // 신규 생성 옵션
  const exact = unique.some(x => x.name === query);
  if (query && !exact) {
    items = [{ name: query, content: '(새로 만들기)', isNew: true }, ...items];
  }
  items = items.slice(0, 8);
  if (items.length === 0) { fsAcClose(); return; }
  FSAC.open = true;
  FSAC.items = items;
  FSAC.sel = Math.min(FSAC.sel, items.length - 1);
  if (FSAC.sel < 0) FSAC.sel = 0;
  FSAC.triggerStart = triggerStart;
  FSAC.queryStart = queryStart;
  fsAcRender(ta);
}

function fsAcRender(ta) {
  let dd = document.getElementById('fs-ac-dd');
  if (!dd) {
    dd = document.createElement('div');
    dd.id = 'fs-ac-dd';
    dd.style.cssText = `position:absolute;z-index:9000;background:var(--paper);border:1px solid var(--border);
      border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.18);padding:4px;font-family:'Noto Sans KR',sans-serif;
      min-width:240px;max-width:360px;max-height:320px;overflow-y:auto`;
    document.body.appendChild(dd);
  }
  // 위치: textarea 내 커서 추정. 단순하게 textarea 박스 기준 아래에 띄움.
  // 정확한 커서 좌표는 textarea에선 어렵기 때문에 mirror div 기법 사용.
  const rect = fsAcCaretRect(ta);
  dd.style.left = rect.left + 'px';
  dd.style.top = rect.top + 'px';
  dd.innerHTML = FSAC.items.map((it, i) => `
    <div class="fs-ac-item ${i===FSAC.sel?'sel':''}" data-i="${i}"
      style="padding:7px 10px;border-radius:7px;cursor:pointer;display:flex;flex-direction:column;gap:2px;
        background:${i===FSAC.sel?'var(--gold-light)':'transparent'}">
      <div style="display:flex;align-items:center;gap:6px">
        <span style="font-weight:700;font-size:13px;color:${it.isNew?'var(--teal)':'var(--ink)'}">${it.isNew?'+ ':''}${esc(it.name)}</span>
        ${!it.isNew && it.status ? `<span style="font-size:9px;font-weight:700;padding:1px 5px;border-radius:10px;background:${it.status==='회수완료'?'var(--teal-light)':'var(--gold-light)'};color:${it.status==='회수완료'?'var(--teal)':'var(--gold)'}">${it.status==='회수완료'?'✅':'⏳'}</span>` : ''}
      </div>
      ${it.content ? `<div style="font-size:11px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(it.content)}</div>` : ''}
    </div>
  `).join('');
  dd.querySelectorAll('.fs-ac-item').forEach(el => {
    el.addEventListener('mousedown', (e) => {
      e.preventDefault(); // textarea blur 방지
      FSAC.sel = parseInt(el.dataset.i, 10);
      fsAcAccept();
    });
    el.addEventListener('mouseenter', () => {
      FSAC.sel = parseInt(el.dataset.i, 10);
      [...dd.querySelectorAll('.fs-ac-item')].forEach((x, i) => {
        x.style.background = i === FSAC.sel ? 'var(--gold-light)' : 'transparent';
      });
    });
  });
}

// textarea 커서 좌표 추정 (mirror div 기법)
function fsAcCaretRect(ta) {
  const rect = ta.getBoundingClientRect();
  const mirror = document.createElement('div');
  const cs = getComputedStyle(ta);
  const props = ['boxSizing','width','height','overflowX','overflowY','borderTopWidth','borderRightWidth','borderBottomWidth','borderLeftWidth','paddingTop','paddingRight','paddingBottom','paddingLeft','fontFamily','fontSize','fontWeight','lineHeight','letterSpacing','whiteSpace','wordBreak','wordWrap'];
  props.forEach(p => { mirror.style[p] = cs[p]; });
  mirror.style.position = 'absolute';
  mirror.style.visibility = 'hidden';
  mirror.style.top = '0';
  mirror.style.left = '-9999px';
  mirror.style.whiteSpace = 'pre-wrap';
  mirror.style.wordWrap = 'break-word';
  document.body.appendChild(mirror);
  const before = ta.value.substring(0, ta.selectionStart);
  mirror.textContent = before;
  const span = document.createElement('span');
  span.textContent = '\u200b';
  mirror.appendChild(span);
  const spanRect = span.getBoundingClientRect();
  const mRect = mirror.getBoundingClientRect();
  const x = rect.left + (spanRect.left - mRect.left) - ta.scrollLeft;
  const y = rect.top + (spanRect.top - mRect.top) - ta.scrollTop + (parseInt(cs.lineHeight,10) || 22);
  mirror.remove();
  // 화면 바깥 방지
  const ddW = 260;
  const left = Math.min(x + window.scrollX, window.innerWidth - ddW - 10);
  const top = y + window.scrollY;
  return { left, top };
}

function fsAcClose() {
  FSAC.open = false;
  FSAC.items = [];
  FSAC.sel = 0;
  // 혹시 여러 개 남아있을 경우에도 전부 제거
  document.querySelectorAll('#fs-ac-dd').forEach(el => {
    try { el.remove(); } catch(e) { el.style.display = 'none'; }
  });
}

function fsAcAccept() {
  if (!FSAC.open) return;
  const ta = document.getElementById('prose-editor');
  if (!ta) return;
  const it = FSAC.items[FSAC.sel];
  if (!it) return;
  const pos = ta.selectionStart;
  const before = ta.value.substring(0, FSAC.triggerStart);
  const after = ta.value.substring(pos);
  const tag = `[[복선:${it.name}]]`;
  const newVal = before + tag + after;
  // execCommand로 넣어 undo 스택 유지 (기존 패턴 따라감)
  const selEnd = ta.selectionEnd;
  ta.focus();
  ta.setSelectionRange(FSAC.triggerStart, selEnd);
  const ok = document.execCommand && document.execCommand('insertText', false, tag);
  if (!ok) {
    // 폴백
    ta.value = newVal;
    const newPos = FSAC.triggerStart + tag.length;
    ta.setSelectionRange(newPos, newPos);
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  }
  fsAcClose();
  // 신규 생성 옵션이었다면 해당 이름으로 복선 빠르게 추가
  if (it.isNew) {
    const p = getProject();
    if (!p.foreshadows) p.foreshadows = [];
    p.foreshadows.push({
      id: uid(),
      content: '(에디터에서 생성됨) ' + it.name,
      tagName: it.name,
      status: '미회수',
      importance: '',
    });
    autoSave();
    toast(`복선 "${it.name}" 추가됨. 복선 관리에서 내용을 채워주세요.`);
  }
}

function fsAcKeydown(e) {
  if (!FSAC.open) return false;
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    FSAC.sel = (FSAC.sel + 1) % FSAC.items.length;
    const ta = document.getElementById('prose-editor');
    if (ta) fsAcRender(ta);
    return true;
  }
  if (e.key === 'ArrowUp') {
    e.preventDefault();
    FSAC.sel = (FSAC.sel - 1 + FSAC.items.length) % FSAC.items.length;
    const ta = document.getElementById('prose-editor');
    if (ta) fsAcRender(ta);
    return true;
  }
  if (e.key === 'Enter' || e.key === 'Tab') {
    e.preventDefault();
    fsAcAccept();
    return true;
  }
  if (e.key === 'Escape') {
    e.preventDefault();
    fsAcClose();
    return true;
  }
  return false;
}

// 에디터에 이벤트 위임으로 autocomplete 연결
document.addEventListener('input', (e) => {
  if (e.target && e.target.id === 'prose-editor') {
    setTimeout(fsAcCheck, 0);
  }
}, true);
document.addEventListener('keydown', (e) => {
  if (e.target && e.target.id === 'prose-editor') {
    if (fsAcKeydown(e)) return;
  }
}, true);
// 에디터 바깥 클릭 시 자동완성 드롭다운 닫기 (버블 단계로만 감시 — 다른 버튼 클릭을 방해하지 않도록)
document.addEventListener('click', (e) => {
  if (!FSAC.open) return;
  if (e.target && e.target.closest && e.target.closest('#fs-ac-dd')) return;
  if (e.target && e.target.id === 'prose-editor') return;
  fsAcClose();
});
document.addEventListener('scroll', () => {
  if (FSAC.open) fsAcClose();
}, true);

function renderForeshadow() {
  const p = getProject();
  if (!p) return;
  if (!p.foreshadows) p.foreshadows = [];
  // id 없는 레거시 항목 보정
  let _idFixed = false;
  p.foreshadows.forEach(f => { if (!f.id) { f.id = uid(); _idFixed = true; } });
  if (_idFixed) autoSave();
  const list = p.foreshadows;
  if (!window._fsFilter)     window._fsFilter = '전체';
  if (!window._fsCharFilter) window._fsCharFilter = '전체';
  if (!window._fsImpFilter)  window._fsImpFilter = '전체';
  if (!window._fsTagFilter)  window._fsTagFilter = '전체';
  const filter     = window._fsFilter;
  const charFilter = window._fsCharFilter;
  const impFilter  = window._fsImpFilter;
  const tagFilter  = window._fsTagFilter;

  const STATUS_COLOR = {'미회수':'var(--gold)','회수완료':'var(--teal)'};
  const STATUS_BG    = {'미회수':'var(--gold-light)','회수완료':'var(--teal-light)'};
  const IMP_COLOR    = {'★★★ 핵심':'var(--rust)','★★ 중요':'var(--gold)','★ 일반':'var(--muted)'};

  const total = list.length;
  const done  = list.filter(f=>f.status==='회수완료').length;
  const pct   = total ? Math.round(done/total*100) : 0;

  // 필터링
  let filtered = filter==='전체' ? list : list.filter(f=>f.status===filter);
  if (charFilter!=='전체') filtered = filtered.filter(f=>(f.chars||'').split(',').map(s=>s.trim()).includes(charFilter));
  if (impFilter!=='전체')  filtered = filtered.filter(f=>(f.importance||'')=== impFilter);

  const usedChars = [...new Set(list.flatMap(f=>(f.chars||'').split(',').map(s=>s.trim()).filter(Boolean)))].sort();
  const allImps   = ['★★★ 핵심','★★ 중요','★ 일반'].filter(i=>list.some(f=>f.importance===i));

  // 본문 태그 스캔 (한 번만)
  const fsIndex = buildForeshadowIndex();

  const filterBtn = (label, active, onclick, color='var(--gold)') =>
    `<button onclick="${onclick}"
      style="padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600;white-space:nowrap;
        flex-shrink:0;cursor:pointer;font-family:'Noto Sans KR',sans-serif;transition:all .15s;
        border:1.5px solid ${active?color:'var(--border)'};
        background:${active?color:'transparent'};
        color:${active?'#fff':'var(--muted)'}">${label}</button>`;

  const selectStyle = 'padding:5px 10px;border-radius:8px;font-size:12px;font-weight:600;background:var(--paper);color:var(--ink);font-family:\'Noto Sans KR\',sans-serif;cursor:pointer;outline:none;';

  document.getElementById('main').innerHTML = `
    <div style="max-width:800px;margin:0 auto">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
        <div class="font-display" style="font-size:22px">복선 관리 (${total})</div>
        <button class="btn btn-gold" onclick="showForeshadowModal()">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          복선 추가
        </button>
      </div>

      <!-- 회수율 -->
      ${total > 0 ? `
      <div class="card" style="margin-bottom:14px;padding:12px 16px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <span style="font-size:12px;font-weight:700;color:var(--muted)">회수율</span>
          <span style="font-size:13px;font-weight:700;color:var(--teal)">${done}/${total} (${pct}%)</span>
        </div>
        <div style="height:8px;background:var(--border);border-radius:4px;overflow:hidden">
          <div style="height:100%;width:${pct}%;background:var(--teal);border-radius:4px;transition:width .5s"></div>
        </div>
      </div>` : ''}

      <!-- 상태 필터 -->
      <div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:10px">
        ${['전체','미회수','회수완료'].map(s=>
          filterBtn(
            s + ` <span style="opacity:.7">(${s==='전체'?total:list.filter(f=>f.status===s).length})</span>`,
            filter===s,
            `window._fsFilter='${s}';renderForeshadow()`
          )
        ).join('')}
      </div>

      <!-- 중요도 + 인물 드롭다운 나란히 -->
      <div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap">
        <select style="${selectStyle}border:1.5px solid ${impFilter!=='전체'?'var(--rust)':'var(--border)'};color:${impFilter!=='전체'?'var(--rust)':'var(--ink)'}"
          onchange="window._fsImpFilter=this.value;renderForeshadow()">
          <option value="전체" ${impFilter==='전체'?'selected':''}>★ 중요도 전체</option>
          ${allImps.map(i=>`<option value="${i}" ${impFilter===i?'selected':''}>${i}</option>`).join('')}
        </select>
        ${usedChars.length > 0 ? `
        <select style="${selectStyle}border:1.5px solid ${charFilter!=='전체'?'var(--teal)':'var(--border)'};color:${charFilter!=='전체'?'var(--teal)':'var(--ink)'}"
          onchange="window._fsCharFilter=this.value;renderForeshadow()">
          <option value="전체" ${charFilter==='전체'?'selected':''}>👤 인물 전체</option>
          ${usedChars.map(c=>`<option value="${esc(c)}" ${charFilter===c?'selected':''}>${esc(c)}</option>`).join('')}
        </select>` : ''}
      </div>

      <!-- 카드 목록 -->
      ${filtered.length === 0
        ? `<div class="card empty-state"><div class="emoji">🎯</div><p>${total===0?'복선을 추가해보세요.':'해당하는 복선이 없어요.'}</p></div>`
        : filtered.map(f => {
          const fsIdEsc = esc(f.id||'');
          const st  = f.status || '미회수';
          const imp = f.importance || '';
          const tags = (f.tags||'').split(',').map(s=>s.trim()).filter(Boolean);
          const nextStatus = st==='미회수' ? '회수완료' : st==='회수완료' ? '미회수' : null;
          const cls = classifyForeshadowChapters(f, fsIndex);
          const autoPlant = cls.linked ? chapterLabel(cls.planted) : null;
          const autoHarvest = cls.linked && cls.harvested ? chapterLabel(cls.harvested) : null;
          const mentionCount = cls.linked ? cls.mentioned.length : 0;
          // 자동 vs 수동 우선 표시 결정
          const showPlant = autoPlant || f.plant || '';
          const showHarvest = autoHarvest || f.harvest || (st==='미회수'?'미회수':'');
          const hasRow = cls.linked || f.plant || f.harvest;
          return `
          <div class="card" style="margin-bottom:12px;border-left:4px solid ${STATUS_COLOR[st]}">
            <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px">
              <div style="flex:1;min-width:0">
                <!-- 뱃지 행 -->
                <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:8px">
                  <!-- 상태 퀵 토글 -->
                  <button onclick="foreshadowToggleStatus('${fsIdEsc}')"
                    title="${nextStatus ? nextStatus+'(으)로 변경' : ''}"
                    style="font-size:11px;font-weight:700;padding:2px 10px;border-radius:20px;cursor:${nextStatus?'pointer':'default'};
                      background:${STATUS_BG[st]};color:${STATUS_COLOR[st]};border:none;
                      font-family:'Noto Sans KR',sans-serif;transition:all .15s">
                    ${st==='회수완료'?'✅ ':''}${st}
                  </button>
                  ${imp?`<span style="font-size:11px;font-weight:700;color:${IMP_COLOR[imp]||'var(--muted)'}">${imp}</span>`:''}
                  ${tags.map(t=>`<span style="font-size:11px;padding:1px 8px;border-radius:20px;
                    background:var(--cream);color:var(--muted);font-weight:600">#${esc(t)}</span>`).join('')}
                  ${f.chars?`<span style="font-size:11px;color:var(--muted)">👤 ${esc(f.chars)}</span>`:''}
                  ${cls.linked?`<span title="본문 태그 [[복선:${esc(cls.tagName)}]]와 연결됨" style="font-size:10px;font-weight:700;padding:1px 7px;border-radius:20px;background:var(--teal-light);color:var(--teal);font-family:'Noto Sans KR',sans-serif">🔗 연결됨</span>`:''}
                </div>
                <!-- 복선 내용 -->
                <div style="font-size:14px;font-weight:600;margin-bottom:8px;white-space:pre-wrap">${esc(f.content||'')}</div>
                <!-- 뿌린 화 → 회수 화 (자동 연결 우선) -->
                ${hasRow ? `
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap;
                  background:var(--cream);border-radius:8px;padding:6px 10px;font-size:12px">
                  <span style="color:var(--muted)">🌱</span>
                  ${autoPlant
                    ? `<button onclick="foreshadowJumpTo('${fsIdEsc}', 'first')" style="background:none;border:none;cursor:pointer;padding:0;font-weight:600;color:var(--teal);font-family:'Noto Sans KR',sans-serif;text-decoration:underline;text-decoration-color:rgba(20,140,120,.3);text-underline-offset:3px">${esc(autoPlant)}</button>`
                    : `<span style="font-weight:600;color:var(--ink)">${esc(showPlant||'?')}</span>`
                  }
                  <span style="color:var(--border);font-size:16px">→→→</span>
                  ${autoHarvest
                    ? `<button onclick="foreshadowJumpTo('${fsIdEsc}', 'last')" style="background:none;border:none;cursor:pointer;padding:0;font-weight:600;color:var(--teal);font-family:'Noto Sans KR',sans-serif;text-decoration:underline;text-decoration-color:rgba(20,140,120,.3);text-underline-offset:3px">${esc(autoHarvest)}</button>`
                    : `<span style="font-weight:600;color:${st==='회수완료'?'var(--teal)':'var(--ink)'}">${esc(showHarvest||'?')}</span>`
                  }
                  ${st==='회수완료'?'<span style="color:var(--teal)">✅</span>':''}
                  ${mentionCount > 0 ? `<button onclick="foreshadowToggleMentions('${fsIdEsc}')" style="margin-left:auto;background:none;border:1px solid var(--border);border-radius:12px;padding:2px 9px;cursor:pointer;font-size:11px;font-weight:600;color:var(--muted);font-family:'Noto Sans KR',sans-serif" title="중간 언급된 화 보기">💬 언급 ${mentionCount}</button>` : ''}
                </div>
                ${mentionCount > 0 && window._fsExpandMentions === f.id ? `
                <div style="margin-bottom:8px;padding:8px 12px;background:var(--paper);border:1px dashed var(--border);border-radius:8px;font-size:12px">
                  <div style="font-size:10px;font-weight:700;color:var(--muted);margin-bottom:4px;letter-spacing:.5px">중간 언급된 화</div>
                  ${cls.mentioned.map((cid, mi) => `
                    <div style="display:flex;align-items:center;gap:6px;padding:3px 0">
                      <span style="color:var(--muted);font-size:10px">•</span>
                      <button onclick="foreshadowJumpTo('${fsIdEsc}', 'mention', ${mi})" style="background:none;border:none;cursor:pointer;padding:0;color:var(--ink);font-family:'Noto Sans KR',sans-serif;text-align:left;font-size:12px">${esc(chapterLabel(cid))}</button>
                    </div>
                  `).join('')}
                </div>` : ''}
                ` : ''}
                <!-- 힌트/메모 -->
                ${f.hint?`<div style="font-size:12px;color:var(--muted);font-style:italic;
                  border-left:3px solid var(--border);padding-left:8px;white-space:pre-wrap">💡 ${esc(f.hint)}</div>`:''}
              </div>
              <div style="display:flex;gap:4px;flex-shrink:0">
                <button onclick="showForeshadowModal('${fsIdEsc}')"
                  style="background:none;border:none;cursor:pointer;font-size:16px;color:var(--muted)">✏️</button>
                <button onclick="deleteForeshadow('${fsIdEsc}')"
                  style="background:none;border:none;cursor:pointer;font-size:16px;color:var(--rust)">✕</button>
              </div>
            </div>
          </div>`;}).join('')}
    </div>`;
}

// 복선 카드 → 본문의 해당 태그 위치로 이동
// kind: 'first' = 첫 등장(심기), 'last' = 마지막 등장(회수), 'mention' = 중간 언급 n번째
function foreshadowJumpTo(id, kind, mentionIdx) {
  const p = getProject();
  const f = p?.foreshadows?.find(x => x.id === id);
  if (!f || !f.tagName) return;
  const fsIndex = buildForeshadowIndex();
  const entry = fsIndex.byName[f.tagName.trim()];
  if (!entry || entry.positions.length === 0) {
    toast('본문에서 태그를 찾을 수 없어요.');
    return;
  }
  // 화별로 첫 등장 위치 맵 만들기
  const byCh = {};
  entry.positions.forEach(pos => {
    if (!byCh[pos.chId]) byCh[pos.chId] = pos;
  });
  let target = null;
  if (kind === 'first') {
    target = byCh[entry.chapters[0]];
  } else if (kind === 'last') {
    target = byCh[entry.chapters[entry.chapters.length - 1]];
  } else if (kind === 'mention' && typeof mentionIdx === 'number') {
    // 중간 언급 = 첫 화·마지막 화 제외 (회수완료일 때만 마지막 제외)
    const middle = f.status === '회수완료' && entry.chapters.length >= 2
      ? entry.chapters.slice(1, -1)
      : entry.chapters.slice(1);
    const cid = middle[mentionIdx];
    if (cid) target = byCh[cid];
  }
  if (!target) { toast('위치를 찾을 수 없어요.'); return; }
  activeChapterId = target.chId;
  navigate('chapters');
  setTimeout(() => {
    const ta = document.getElementById('prose-editor');
    if (ta) {
      ta.focus();
      try { ta.setSelectionRange(target.pos, target.pos + target.len); } catch(e) {}
      const lineHeight = parseInt(getComputedStyle(ta).lineHeight) || 24;
      const lines = (ta.value || '').substring(0, target.pos).split('\n').length;
      ta.scrollTop = Math.max(0, (lines - 3) * lineHeight);
    }
  }, 120);
}

function foreshadowToggleMentions(id) {
  const p = getProject();
  const f = p?.foreshadows?.find(x => x.id === id);
  if (!f) return;
  if (window._fsExpandMentions === f.id) window._fsExpandMentions = null;
  else window._fsExpandMentions = f.id;
  renderForeshadow();
}

function foreshadowToggleStatus(id) {
  const p = getProject();
  const f = p?.foreshadows?.find(x => x.id === id);
  if (!f) return;
  if (f.status === '미회수') f.status = '회수완료';
  else if (f.status === '회수완료') f.status = '미회수';
  else return;
  autoSave();
  renderForeshadow();
}

function showForeshadowModal(id) {
  const p = getProject();
  const f = id ? (p.foreshadows||[]).find(x => x.id === id) : null;
  const isEdit = !!f;
  const fData = f || {};
  const chars = p.characters || [];
  const STATUS = ['미회수','회수완료'];
  const IMP = ['','★ 일반','★★ 중요','★★★ 핵심'];
  const selChars = (fData.chars||'').split(',').map(s=>s.trim()).filter(Boolean);
  const idEsc = esc(id||'');
  // 기존 복선 인덱스 (자동 계산 정보용)
  const fsIndex = buildForeshadowIndex();
  const cls = classifyForeshadowChapters(fData, fsIndex);
  const isLinked = cls.linked;
  const linkHint = isLinked
    ? `<span style="color:var(--teal);font-weight:700">🔗 본문 연결됨</span> · ${cls.planted ? '심기: '+esc(chapterLabel(cls.planted)) : ''}${cls.harvested ? ' · 회수: '+esc(chapterLabel(cls.harvested)) : ''}`
    : (fData.tagName ? `<span style="color:var(--muted)">본문에 <code>[[복선:${esc(fData.tagName)}]]</code> 태그가 아직 없어요</span>` : '');

  showModal(`
    <div class="modal-title">${isEdit ? '복선 수정' : '복선 추가'}</div>
    <div class="form-grid">
      <div class="full"><label class="label">복선 내용 *</label>
        <textarea id="fs-content" rows="3" placeholder="어떤 복선인지 적어주세요">${esc(fData.content||'')}</textarea></div>
      <div class="full">
        <label class="label">태그 이름
          <span style="font-size:11px;color:var(--muted);font-weight:500">— 본문에 <code style="background:var(--cream);padding:1px 5px;border-radius:3px">[[복선:이름]]</code>으로 심으면 자동 추적</span>
        </label>
        <input id="fs-tagname" value="${esc(fData.tagName||'')}" placeholder="예: 검의 정체, 왕의 비밀" autocomplete="off">
        <div id="fs-tag-status" style="font-size:11px;margin-top:5px;min-height:14px">${linkHint}</div>
      </div>
      <div><label class="label">뿌린 화/장면 <span style="font-size:10px;color:var(--muted)">(수동 입력)</span></label>
        <input id="fs-plant" value="${esc(fData.plant||'')}" placeholder="예: 3화, 1부 2장"></div>
      <div><label class="label">회수 화/장면 <span style="font-size:10px;color:var(--muted)">(수동 입력)</span></label>
        <input id="fs-harvest" value="${esc(fData.harvest||'')}" placeholder="예: 15화"></div>
      <div><label class="label">상태</label>
        <select id="fs-status">${STATUS.map(s=>`<option value="${s}" ${(fData.status||'미회수')===s?'selected':''}>${s}</option>`).join('')}</select></div>
      <div><label class="label">중요도</label>
        <select id="fs-importance">${IMP.map(s=>`<option value="${s}" ${(fData.importance||'')===s?'selected':''}>${s||'없음'}</option>`).join('')}</select></div>
      <div class="full"><label class="label">태그 <span style="font-size:11px;color:var(--muted)">(쉼표로 구분)</span></label>
        <input id="fs-tags" value="${esc(fData.tags||'')}" placeholder="예: 정체, 마법, 가족"></div>
      <div class="full"><label class="label">힌트/메모</label>
        <textarea id="fs-hint" rows="2" placeholder="이 복선을 어떻게 회수할지, 관련 아이디어...">${esc(fData.hint||'')}</textarea></div>
      <div class="full"><label class="label">관련 인물</label>
        ${chars.length===0
          ? `<input id="fs-chars" value="${esc(fData.chars||'')}" placeholder="예: 영희, 철수">`
          : `<select id="fs-chars-select" multiple
              style="width:100%;padding:6px 8px;border:1.5px solid var(--border);border-radius:8px;
                background:var(--paper);color:var(--ink);font-family:'Noto Sans KR',sans-serif;
                font-size:13px;min-height:80px">
              ${chars.map(c=>`<option value="${esc(c.name)}" ${selChars.includes(c.name)?'selected':''}>${esc(c.name)}${c.role?` (${esc(c.role)})`:''}</option>`).join('')}
            </select>
            <div style="font-size:11px;color:var(--muted);margin-top:4px">Ctrl(또는 Cmd)을 누른 채 클릭하면 여러 명 선택할 수 있어요</div>`}
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="closeModal()">취소</button>
      <button class="btn btn-gold" onclick="saveForeshadow('${idEsc}')">저장</button>
    </div>`);
  setTimeout(()=>document.getElementById('fs-content')?.focus(),100);

  // 태그 이름 입력 시 실시간 상태 표시
  const tagIn = document.getElementById('fs-tagname');
  const statusEl = document.getElementById('fs-tag-status');
  if (tagIn && statusEl) {
    tagIn.addEventListener('input', () => {
      const name = tagIn.value.trim();
      if (!name) { statusEl.innerHTML = ''; return; }
      const entry = fsIndex.byName[name];
      if (!entry || entry.chapters.length === 0) {
        statusEl.innerHTML = `<span style="color:var(--muted)">본문에 <code style="background:var(--cream);padding:1px 5px;border-radius:3px">[[복선:${esc(name)}]]</code> 태그가 아직 없어요</span>`;
      } else {
        const first = entry.chapters[0];
        const last = entry.chapters[entry.chapters.length-1];
        statusEl.innerHTML = `<span style="color:var(--teal);font-weight:700">🔗 본문에서 ${entry.chapters.length}개 화에 발견</span> · 첫 등장: ${esc(chapterLabel(first))}${entry.chapters.length > 1 ? ' · 마지막: '+esc(chapterLabel(last)) : ''}`;
      }
    });
  }
}

function saveForeshadow(id) {
  const content = document.getElementById('fs-content').value.trim();
  if (!content) { toast('복선 내용을 입력해주세요.'); return; }
  const p = getProject();
  if (!p.foreshadows) p.foreshadows = [];
  const existingIdx = id ? p.foreshadows.findIndex(x => x.id === id) : -1;
  const isEdit = existingIdx >= 0;
  const sel = document.getElementById('fs-chars-select');
  const chars = sel
    ? [...sel.selectedOptions].map(o=>o.value).join(', ')
    : (document.getElementById('fs-chars')?.value||'');
  const tagName = (document.getElementById('fs-tagname')?.value||'').trim();
  const oldTagName = (isEdit ? (p.foreshadows[existingIdx].tagName || '') : '').trim();
  const f = {
    id: isEdit ? p.foreshadows[existingIdx].id : uid(),
    content,
    tagName,
    plant:      document.getElementById('fs-plant').value,
    harvest:    document.getElementById('fs-harvest').value,
    status:     document.getElementById('fs-status').value,
    importance: document.getElementById('fs-importance').value,
    tags:       document.getElementById('fs-tags').value,
    hint:       document.getElementById('fs-hint').value,
    chars
  };

  // 태그 이름이 변경된 경우 본문의 [[복선:기존이름]]을 [[복선:새이름]]으로 일괄 치환 제안
  const nameChanged = oldTagName && tagName && oldTagName !== tagName;
  const nameRemoved = oldTagName && !tagName;
  if (nameChanged || nameRemoved) {
    // 기존 이름이 본문에 몇 번 있는지 세기
    const idxScan = buildForeshadowIndex();
    const entry = idxScan.byName[oldTagName];
    const count = entry ? entry.positions.length : 0;
    if (count > 0) {
      const title = nameChanged ? '태그 이름을 변경할까요?' : '태그를 본문에서도 제거할까요?';
      const msg = nameChanged
        ? `본문의 <code style="background:var(--cream);padding:1px 5px;border-radius:3px">[[복선:${esc(oldTagName)}]]</code> 태그 ${count}개를 <code style="background:var(--cream);padding:1px 5px;border-radius:3px">[[복선:${esc(tagName)}]]</code>(으)로 일괄 변경합니다.`
        : `본문의 <code style="background:var(--cream);padding:1px 5px;border-radius:3px">[[복선:${esc(oldTagName)}]]</code> 태그 ${count}개를 모두 제거합니다.`;
      askDialog({
        icon: nameChanged ? '✏️' : '🗑️',
        title,
        message: msg,
        okLabel: nameChanged ? '일괄 변경' : '모두 제거',
        okColor: nameChanged ? 'var(--gold)' : 'var(--rust)',
        onOk: () => {
          renameForeshadowTagInContent(oldTagName, nameChanged ? tagName : null);
          if (isEdit) p.foreshadows[existingIdx] = f;
          else p.foreshadows.push(f);
          autoSave(); closeModal(); renderForeshadow();
        },
        onCancel: () => {
          // 본문은 그대로 두되 복선 데이터는 저장
          if (isEdit) p.foreshadows[existingIdx] = f;
          else p.foreshadows.push(f);
          autoSave(); closeModal(); renderForeshadow();
        },
        cancelLabel: '본문은 그대로',
      });
      return;
    }
  }

  if (isEdit) p.foreshadows[existingIdx] = f;
  else p.foreshadows.push(f);
  autoSave(); closeModal(); renderForeshadow();
}

// 일반용 확인 다이얼로그 (confirmDialog 는 삭제 전용이라 따로 만듦)
function askDialog({icon='❓', title='확인', message='', okLabel='확인', cancelLabel='취소', okColor='var(--gold)', onOk, onCancel}) {
  document.querySelectorAll('.ask-dialog-bg').forEach(el => el.remove());
  const bg = document.createElement('div');
  bg.className = 'ask-dialog-bg';
  bg.style.cssText = 'position:fixed;inset:0;background:rgba(24,18,10,.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;';
  bg.innerHTML = `<div style="background:var(--paper);border:1px solid var(--border);border-radius:14px;padding:24px;width:360px;max-width:100%;text-align:center;font-family:'Noto Sans KR',sans-serif">
    <div style="font-size:28px;margin-bottom:12px">${icon}</div>
    <div style="font-size:15px;font-weight:700;color:var(--ink);margin-bottom:8px">${title}</div>
    <div style="font-size:13px;color:var(--muted);line-height:1.6;margin-bottom:20px">${message}</div>
    <div style="display:flex;gap:10px">
      <button class="ask-cancel" style="flex:1;padding:10px;border:1.5px solid var(--border);border-radius:8px;background:transparent;color:var(--muted);cursor:pointer;font-size:14px;font-weight:600;font-family:'Noto Sans KR',sans-serif">${esc(cancelLabel)}</button>
      <button class="ask-ok" style="flex:1;padding:10px;border:none;border-radius:8px;background:${okColor};color:#fff;cursor:pointer;font-size:14px;font-weight:700;font-family:'Noto Sans KR',sans-serif">${esc(okLabel)}</button>
    </div>
  </div>`;
  document.body.appendChild(bg);
  bg.querySelector('.ask-cancel').addEventListener('click', () => { bg.remove(); onCancel?.(); });
  bg.querySelector('.ask-ok').addEventListener('click', () => { bg.remove(); onOk?.(); });
}

// 본문 전체에서 [[복선:oldName]] → [[복선:newName]] 일괄 치환
// newName === null 이면 태그 제거
function renameForeshadowTagInContent(oldName, newName) {
  const p = getProject();
  if (!p) return 0;
  const chapters = p.chapters || [];
  const escapedOld = oldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`\\[\\[복선:${escapedOld}\\]\\]`, 'g');
  const replacement = newName ? `[[복선:${newName}]]` : '';
  let total = 0;
  chapters.forEach(ch => {
    if (!ch.content) return;
    const before = ch.content;
    const after = before.replace(re, replacement);
    if (before !== after) {
      ch.content = after;
      total += (before.length - after.length) / (oldName.length - (newName||'').length + 5); // 대략
    }
  });
  // 열려있는 에디터가 있으면 반영
  const editor = document.getElementById('prose-editor');
  if (editor && editor.dataset.chid) {
    const cur = chapters.find(c => c.id === editor.dataset.chid);
    if (cur) editor.value = cur.content || '';
  } else if (editor && activeChapterId) {
    const cur = chapters.find(c => c.id === activeChapterId);
    if (cur) editor.value = cur.content || '';
  }
  return total;
}

function deleteForeshadow(id) {
  const p = getProject();
  const i = p?.foreshadows?.findIndex(x => x.id === id) ?? -1;
  if (i < 0) return;
  confirmDialog('이 복선을 삭제합니다.', () => {
    p.foreshadows.splice(i, 1);
    autoSave(); renderForeshadow();
  });
}

// ═══════════════════════════════════════════════════════════
// 사건 일지
// ═══════════════════════════════════════════════════════════
// chars 필드를 항상 배열로 반환 (하위 호환: 문자열이면 쉼표 분리)
function _crCharsArr(ev) {
  if (!ev) return [];
  if (Array.isArray(ev.chars)) return ev.chars.filter(Boolean);
  if (typeof ev.chars === 'string') return ev.chars.split(',').map(s=>s.trim()).filter(Boolean);
  return [];
}
// 표시용 문자열
function _crCharsStr(ev) {
  return _crCharsArr(ev).join(', ');
}

// 회차 ID → 회차 객체
function _crGetChapter(chapterId) {
  if (!chapterId) return null;
  const p = getProject();
  return (p?.chapters||[]).find(c => c.id === chapterId) || null;
}

// 회차 ID → 정렬용 순서(배열 인덱스). 연결 없으면 Infinity (맨 뒤)
function _crChapterOrder(chapterId) {
  if (!chapterId) return Infinity;
  const p = getProject();
  const idx = (p?.chapters||[]).findIndex(c => c.id === chapterId);
  return idx < 0 ? Infinity : idx;
}

// 사건 카드의 📖 배지 클릭 → 해당 회차 열기
function crJumpToChapter(chapterId) {
  const ch = _crGetChapter(chapterId);
  if (!ch) { toast('연결된 회차를 찾을 수 없어요.'); return; }
  activeChapterId = ch.id;
  navigate('chapters');
}

function renderChronicle() {
  const p = getProject();
  if (!p) return;
  if (!p.chronicles) p.chronicles = [];

  // order 없는 항목 보정 — 현재 배열 순서대로 10 간격 부여
  let _orderFixed = false;
  p.chronicles.forEach((e, i) => {
    if (!e.order) { e.order = (i + 1) * 10; _orderFixed = true; }
  });
  if (_orderFixed) autoSave();

  // 렌더 전에 검색 input 포커스 상태 기록
  const prevFocused = document.activeElement?.id === 'cr-search-input';
  const prevSelStart = prevFocused ? document.activeElement.selectionStart : null;

  // 필터 상태 (전역 window 에 저장)
  if (!window._crImpFilter)   window._crImpFilter = '전체';
  if (!window._crCharFilter)  window._crCharFilter = '전체';
  if (!window._crPlaceFilter) window._crPlaceFilter = '전체';
  if (!window._crChapterFilter) window._crChapterFilter = '전체';
  if (!window._crSortMode)    window._crSortMode = 'manual'; // 'manual' | 'chapter' | 'time'
  if (window._crSearch === undefined) window._crSearch = '';
  const impFilter     = window._crImpFilter;
  const charFilter    = window._crCharFilter;
  const placeFilter   = window._crPlaceFilter;
  const chapterFilter = window._crChapterFilter;
  const sortMode      = window._crSortMode;
  const search        = window._crSearch.trim().toLowerCase();

  // 정렬 모드에 따라 list 재정렬
  let list;
  if (sortMode === 'chapter') {
    // 회차 순 → 회차 내에서는 수동 order 유지
    list = [...p.chronicles].sort((a,b) => {
      const ca = _crChapterOrder(a.chapterId);
      const cb = _crChapterOrder(b.chapterId);
      if (ca !== cb) return ca - cb;
      return (a.order||0) - (b.order||0);
    });
  } else if (sortMode === 'time') {
    // 작중 연대순 → sortKey 오름차순, 없는 건 Infinity (맨 뒤). 동률은 수동 order 유지
    list = [...p.chronicles].sort((a,b) => {
      const sa = (a.sortKey ?? Infinity);
      const sb = (b.sortKey ?? Infinity);
      if (sa !== sb) return sa - sb;
      return (a.order||0) - (b.order||0);
    });
  } else {
    list = [...p.chronicles].sort((a,b) => (a.order||0) - (b.order||0));
  }

  const IMPORTANCE = ['★★★ 핵심','★★ 중요','★ 일반'];
  const IMP_COLOR = {'★★★ 핵심':'var(--rust)','★★ 중요':'var(--gold)','★ 일반':'var(--muted)'};

  // 필터링 (정렬된 list에 대해)
  let filtered = list;
  if (impFilter !== '전체')
    filtered = filtered.filter(e => (e.importance||'★ 일반') === impFilter);
  if (charFilter !== '전체')
    filtered = filtered.filter(e => _crCharsArr(e).includes(charFilter));
  if (placeFilter !== '전체')
    filtered = filtered.filter(e => (e.place||'').trim() === placeFilter);
  if (chapterFilter !== '전체') {
    if (chapterFilter === '__none__') filtered = filtered.filter(e => !e.chapterId);
    else filtered = filtered.filter(e => e.chapterId === chapterFilter);
  }
  if (search) {
    filtered = filtered.filter(e =>
      (e.title||'').toLowerCase().includes(search) ||
      (e.desc||'').toLowerCase().includes(search) ||
      (e.time||'').toLowerCase().includes(search) ||
      (e.place||'').toLowerCase().includes(search) ||
      _crCharsStr(e).toLowerCase().includes(search)
    );
  }

  const usedChars  = [...new Set(list.flatMap(e=>_crCharsArr(e)))].sort();
  const usedPlaces = [...new Set(list.map(e=>(e.place||'').trim()).filter(Boolean))].sort();
  const allImps    = IMPORTANCE.filter(i=>list.some(e=>(e.importance||'★ 일반')===i));
  // 사건에서 실제로 쓰인 회차 id (유효한 것만, 현재 회차 순서대로)
  const usedChapterIds = new Set(list.map(e=>e.chapterId).filter(Boolean));
  const usedChapters = (p.chapters||[]).filter(c => !c.isFolder && usedChapterIds.has(c.id));
  const hasUnlinked = list.some(e => !e.chapterId);

  const selectStyle = 'padding:5px 10px;border-radius:8px;font-size:12px;font-weight:600;background:var(--paper);color:var(--ink);font-family:\'Noto Sans KR\',sans-serif;cursor:pointer;outline:none;';

  const hasAnyFilter = impFilter!=='전체' || charFilter!=='전체' || placeFilter!=='전체' || chapterFilter!=='전체' || search;
  const canDrag = sortMode === 'manual' && !hasAnyFilter && list.length >= 2;

  document.getElementById('main').innerHTML = `
    <div style="max-width:800px;margin:0 auto">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
        <div class="font-display" style="font-size:22px">사건 일지 (${list.length})</div>
        <button class="btn btn-gold" onclick="showChronicleModal()">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          사건 추가
        </button>
      </div>

      ${list.length > 0 ? `
      <!-- 검색 -->
      <div style="display:flex;gap:8px;margin-bottom:10px;align-items:center">
        <input id="cr-search-input" value="${esc(window._crSearch)}"
          oninput="window._crSearch=this.value;clearTimeout(window._crSearchT);window._crSearchT=setTimeout(()=>renderChronicle(),150)"
          placeholder="사건·시점·장소·인물 검색..."
          style="flex:1;padding:8px 12px;font-size:13px;border:1.5px solid ${search?'var(--gold)':'var(--border)'};border-radius:8px;background:var(--paper);color:var(--ink);outline:none;font-family:'Noto Sans KR',sans-serif">
        ${search?`<button onclick="window._crSearch='';renderChronicle()"
          style="padding:7px 10px;font-size:12px;border:1.5px solid var(--border);border-radius:8px;background:transparent;color:var(--muted);cursor:pointer;font-family:'Noto Sans KR',sans-serif">✕</button>`:''}
      </div>

      <!-- 드롭다운 필터 + 정렬 -->
      <div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap;align-items:center">
        <!-- 정렬 모드 토글 -->
        <div style="display:inline-flex;border:1.5px solid var(--border);border-radius:8px;overflow:hidden;background:var(--paper)">
          <button onclick="window._crSortMode='manual';renderChronicle()"
            style="padding:5px 10px;font-size:12px;font-weight:600;border:none;cursor:pointer;font-family:'Noto Sans KR',sans-serif;
              background:${sortMode==='manual'?'var(--gold)':'transparent'};color:${sortMode==='manual'?'#fff':'var(--muted)'}"
            title="드래그로 직접 정한 순서">📝 수동</button>
          <button onclick="window._crSortMode='time';renderChronicle()"
            style="padding:5px 10px;font-size:12px;font-weight:600;border:none;cursor:pointer;font-family:'Noto Sans KR',sans-serif;border-left:1.5px solid var(--border);
              background:${sortMode==='time'?'var(--gold)':'transparent'};color:${sortMode==='time'?'#fff':'var(--muted)'}"
            title="작중 연대순 숫자로 정렬">⏳ 연대순</button>
          <button onclick="window._crSortMode='chapter';renderChronicle()"
            style="padding:5px 10px;font-size:12px;font-weight:600;border:none;cursor:pointer;font-family:'Noto Sans KR',sans-serif;border-left:1.5px solid var(--border);
              background:${sortMode==='chapter'?'var(--gold)':'transparent'};color:${sortMode==='chapter'?'#fff':'var(--muted)'}"
            title="연결된 회차 순서대로 정렬">📖 회차순</button>
        </div>

        ${allImps.length > 0 ? `
        <select style="${selectStyle}border:1.5px solid ${impFilter!=='전체'?'var(--rust)':'var(--border)'};color:${impFilter!=='전체'?'var(--rust)':'var(--ink)'}"
          onchange="window._crImpFilter=this.value;renderChronicle()">
          <option value="전체" ${impFilter==='전체'?'selected':''}>★ 중요도 전체</option>
          ${allImps.map(i=>`<option value="${i}" ${impFilter===i?'selected':''}>${i}</option>`).join('')}
        </select>` : ''}
        ${usedChars.length > 0 ? `
        <select style="${selectStyle}border:1.5px solid ${charFilter!=='전체'?'var(--teal)':'var(--border)'};color:${charFilter!=='전체'?'var(--teal)':'var(--ink)'}"
          onchange="window._crCharFilter=this.value;renderChronicle()">
          <option value="전체" ${charFilter==='전체'?'selected':''}>👤 인물 전체</option>
          ${usedChars.map(c=>`<option value="${esc(c)}" ${charFilter===c?'selected':''}>${esc(c)}</option>`).join('')}
        </select>` : ''}
        ${usedPlaces.length > 0 ? `
        <select style="${selectStyle}border:1.5px solid ${placeFilter!=='전체'?'var(--gold)':'var(--border)'};color:${placeFilter!=='전체'?'var(--gold)':'var(--ink)'}"
          onchange="window._crPlaceFilter=this.value;renderChronicle()">
          <option value="전체" ${placeFilter==='전체'?'selected':''}>📍 장소 전체</option>
          ${usedPlaces.map(pl=>`<option value="${esc(pl)}" ${placeFilter===pl?'selected':''}>${esc(pl)}</option>`).join('')}
        </select>` : ''}
        ${(usedChapters.length > 0 || hasUnlinked) ? `
        <select style="${selectStyle}border:1.5px solid ${chapterFilter!=='전체'?'var(--teal)':'var(--border)'};color:${chapterFilter!=='전체'?'var(--teal)':'var(--ink)'}"
          onchange="window._crChapterFilter=this.value;renderChronicle()">
          <option value="전체" ${chapterFilter==='전체'?'selected':''}>📖 회차 전체</option>
          ${hasUnlinked ? `<option value="__none__" ${chapterFilter==='__none__'?'selected':''}>— 연결 없음</option>` : ''}
          ${usedChapters.map(c=>`<option value="${esc(c.id)}" ${chapterFilter===c.id?'selected':''}>${esc(c.title||'(제목 없음)')}</option>`).join('')}
        </select>` : ''}
        ${hasAnyFilter ? `
        <button onclick="window._crImpFilter='전체';window._crCharFilter='전체';window._crPlaceFilter='전체';window._crChapterFilter='전체';window._crSearch='';renderChronicle()"
          style="padding:5px 10px;font-size:11px;font-weight:600;border:1.5px solid var(--border);border-radius:20px;background:transparent;color:var(--muted);cursor:pointer;font-family:'Noto Sans KR',sans-serif">
          필터 초기화
        </button>` : ''}
        <span style="margin-left:auto;font-size:11px;color:var(--muted)">
          ${hasAnyFilter ? `${filtered.length} / ${list.length}건` : `${list.length}건`}
          ${canDrag ? ' · ⠿ 드래그로 정렬' : (sortMode!=='manual' && list.length>=2 ? ` · ${sortMode==='time'?'연대순':'회차순'} (드래그 비활성)` : '')}
        </span>
      </div>` : ''}

      ${list.length === 0
        ? `<div class="card empty-state"><div class="emoji">📖</div>
            <p style="margin-bottom:4px;font-weight:600">작품 세계 안에서 일어난 사건을 시간순으로 기록해요.</p>
            <p style="font-size:12px;color:var(--muted);line-height:1.7">
              첫 만남 · 결정적 선택 · 배신 · 발각 · 운명의 분기점…<br>
              본편 장면뿐 아니라 과거·막간·설정상 사건도 함께 정리할 수 있어요.
            </p>
          </div>`
        : filtered.length === 0
        ? `<div class="card empty-state"><div class="emoji">🔍</div><p>조건에 맞는 사건이 없어요.</p></div>`
        : `<div id="cr-list" style="position:relative;padding-left:24px">
            <div style="position:absolute;left:8px;top:0;bottom:0;width:2px;background:var(--border);border-radius:2px"></div>
            ${filtered.map(ev => {
              const imp = ev.importance || '★ 일반';
              const charsStr = _crCharsStr(ev);
              const evIdEsc = esc(ev.id||'');
              const linkedCh = _crGetChapter(ev.chapterId);
              return `
              <div class="ev-drag-item" data-ev-id="${evIdEsc}" style="position:relative;margin-bottom:16px">
                <div style="position:absolute;left:-20px;top:14px;width:10px;height:10px;border-radius:50%;
                  background:${IMP_COLOR[imp]};border:2px solid var(--paper)"></div>
                <div class="card ev-card">
                  <div style="display:flex;align-items:flex-start;gap:8px">
                    <span class="ev-drag-handle" data-ev-id="${evIdEsc}"
                      style="color:var(--border);font-size:16px;${canDrag?'cursor:grab':'cursor:not-allowed;opacity:.35'};flex-shrink:0;
                        touch-action:none;user-select:none;padding:2px 3px;margin-top:2px;line-height:1"
                      title="${canDrag?'드래그하여 순서 변경':(sortMode!=='manual'?'수동 모드에서만 드래그할 수 있어요':'필터를 해제하면 드래그할 수 있어요')}">⠿</span>
                    <div style="flex:1;min-width:0">
                      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px">
                        <span style="font-size:13px;font-weight:700;color:var(--gold)">${esc(ev.time||'')}</span>
                        ${ev.sortKey !== undefined ? `<span style="font-size:11px;color:${sortMode==='time'?'var(--gold)':'var(--muted)'};${sortMode==='time'?'font-weight:700':''}">⏳ ${ev.sortKey}</span>` : ''}
                        <span style="font-size:11px;color:${IMP_COLOR[imp]};font-weight:700">${imp}</span>
                        ${linkedCh ? `<button onclick="crJumpToChapter('${esc(linkedCh.id)}')"
                          style="font-size:11px;color:var(--teal);background:var(--teal-light);border:none;padding:2px 8px;border-radius:10px;cursor:pointer;font-weight:600;font-family:'Noto Sans KR',sans-serif"
                          title="이 회차로 이동">📖 ${esc(linkedCh.title||'(제목 없음)')}</button>` : ''}
                        ${ev.place?`<span style="font-size:11px;color:var(--muted)">📍 ${esc(ev.place)}</span>`:''}
                        ${charsStr?`<span style="font-size:11px;color:var(--muted)">👤 ${esc(charsStr)}</span>`:''}
                      </div>
                      <div style="font-size:14px;font-weight:600;margin-bottom:4px">${esc(ev.title||'')}</div>
                      ${ev.desc?`<div style="font-size:13px;color:var(--muted);white-space:pre-wrap;line-height:1.7">${esc(ev.desc)}</div>`:''}
                    </div>
                    <div style="display:flex;gap:6px;flex-shrink:0">
                      <button onclick="showChronicleModal('${evIdEsc}')" style="background:none;border:none;cursor:pointer;font-size:16px;color:var(--muted)">✏️</button>
                      <button onclick="deleteChronicle('${evIdEsc}')" style="background:none;border:none;cursor:pointer;font-size:16px;color:var(--rust)">✕</button>
                    </div>
                  </div>
                </div>
              </div>`}).join('')}
          </div>`}
    </div>`;
  // 렌더 전 검색 input 포커스였으면 복원
  if (prevFocused) {
    setTimeout(() => {
      const inp = document.getElementById('cr-search-input');
      if (inp) {
        inp.focus();
        try {
          if (prevSelStart !== null) inp.setSelectionRange(prevSelStart, prevSelStart);
          else { const v = inp.value; inp.setSelectionRange(v.length, v.length); }
        } catch(e) {}
      }
    }, 0);
  }
  // 드래그 활성화 (수동 모드 + 필터 없을 때만)
  if (canDrag) {
    setTimeout(initChronicleDrag, 30);
  }
}

function showChronicleModal(id) {
  const p = getProject();
  const ev = id ? (p.chronicles||[]).find(e => e.id === id) : null;
  const isEdit = !!ev;
  const evData = ev || {};
  const chars = p.characters || [];
  const selectedChars = _crCharsArr(evData);
  const IMPORTANCE = ['★★★ 핵심','★★ 중요','★ 일반'];
  const idEsc = esc(id||'');
  const chapters = (p.chapters||[]).filter(c => !c.isFolder);
  const chOpts = chapters.map(c => {
    const folder = (p.chapterFolders||[]).find(f => f.id === c.folderId);
    const prefix = folder ? `[${folder.name}] ` : '';
    return `<option value="${esc(c.id)}" ${evData.chapterId===c.id?'selected':''}>${prefix}${esc(c.title||'(제목 없음)')}</option>`;
  }).join('');
  showModal(`
    <div class="modal-title">${isEdit ? '사건 수정' : '사건 추가'}</div>
    <div class="form-grid">
      <div><label class="label">작품 내 시점 *
        <span style="font-size:11px;color:var(--muted);font-weight:500">— 자유 표기</span>
      </label>
        <input id="cr-time" value="${esc(evData.time||'')}" placeholder="예: 즉위 5년 봄, D+3일"></div>
      <div><label class="label">작중 연대순
        <span style="font-size:11px;color:var(--muted);font-weight:500">— 정렬용 숫자 (선택)</span>
      </label>
        <input id="cr-sortkey" type="number" step="any" value="${evData.sortKey ?? ''}" placeholder="예: 1, 2, 2.5"></div>
      <div class="full"><label class="label">사건 제목 *</label>
        <input id="cr-title" value="${esc(evData.title||'')}" placeholder="사건을 한 줄로 요약"></div>
      <div class="full"><label class="label">사건 내용</label>
        <textarea id="cr-desc" rows="3" placeholder="자세한 내용 — 누가·어디서·무엇이 어떻게">${esc(evData.desc||'')}</textarea></div>
      <div><label class="label">장소</label>
        <input id="cr-place" value="${esc(evData.place||'')}" placeholder="예: 왕궁, 시장, 동굴"></div>
      <div><label class="label">중요도</label>
        <select id="cr-importance">${IMPORTANCE.map(s=>`<option value="${s}" ${evData.importance===s?'selected':''}>${s}</option>`).join('')}</select></div>
      ${chapters.length > 0 ? `
      <div class="full"><label class="label">연결된 회차
        <span style="font-size:11px;color:var(--muted);font-weight:500">— 본편에서 이 사건이 등장하는 회차 (선택사항)</span>
      </label>
        <select id="cr-chapter">
          <option value="" ${!evData.chapterId?'selected':''}>— 연결 안 함 —</option>
          ${chOpts}
        </select></div>` : ''}
      <div class="full"><label class="label">관련 인물</label>
        ${chars.length===0
          ? `<input id="cr-chars" value="${esc(selectedChars.join(', '))}" placeholder="예: 영희, 철수">`
          : `<div style="display:flex;flex-wrap:wrap;gap:6px;padding:8px;border:1.5px solid var(--border);border-radius:8px;background:var(--paper)">
              ${chars.map(c=>{
                const sel=selectedChars.includes(c.name);
                return `<label style="display:flex;align-items:center;gap:4px;cursor:pointer;
                  padding:3px 8px;border-radius:20px;font-size:12px;font-weight:600;
                  border:1.5px solid ${sel?'var(--gold)':'var(--border)'};
                  background:${sel?'var(--gold-light)':'transparent'};
                  color:${sel?'var(--gold)':'var(--muted)'};transition:all .15s">
                  <input type="checkbox" name="cr-chars-check" value="${esc(c.name)}" ${sel?'checked':''}
                    style="display:none"
                    onchange="this.parentElement.style.borderColor=this.checked?'var(--gold)':'var(--border)';
                      this.parentElement.style.background=this.checked?'var(--gold-light)':'transparent';
                      this.parentElement.style.color=this.checked?'var(--gold)':'var(--muted)'">
                  ${esc(c.name)}</label>`;
              }).join('')}
            </div>`}
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="closeModal()">취소</button>
      <button class="btn btn-gold" onclick="saveChronicle('${idEsc}')">저장</button>
    </div>`);
  setTimeout(()=>document.getElementById('cr-time')?.focus(),100);
}

function saveChronicle(id) {
  const time = document.getElementById('cr-time').value.trim();
  const title = document.getElementById('cr-title').value.trim();
  if (!time||!title) { toast('시점과 제목을 입력해주세요.'); return; }
  const p = getProject();
  if (!p.chronicles) p.chronicles = [];

  // 관련 인물 — 배열로 저장
  const checkboxes = document.querySelectorAll('input[name="cr-chars-check"]');
  let charsArr;
  if (checkboxes.length > 0) {
    charsArr = [...checkboxes].filter(el => el.checked).map(el => el.value);
  } else {
    const raw = document.getElementById('cr-chars')?.value || '';
    charsArr = raw.split(',').map(s=>s.trim()).filter(Boolean);
  }

  const existingIdx = id ? p.chronicles.findIndex(e => e.id === id) : -1;
  const isEdit = existingIdx >= 0;

  const defaultOrder = isEdit
    ? (p.chronicles[existingIdx].order || 0)
    : (p.chronicles.reduce((m, e) => Math.max(m, e.order||0), 0) + 10);

  // sortKey — 빈 값은 undefined, 아니면 숫자 파싱
  const sortKeyRaw = document.getElementById('cr-sortkey')?.value?.trim() ?? '';
  const sortKeyNum = sortKeyRaw === '' ? undefined : parseFloat(sortKeyRaw);
  const sortKey = (sortKeyNum !== undefined && !isNaN(sortKeyNum)) ? sortKeyNum : undefined;

  const ev = {
    id: isEdit ? p.chronicles[existingIdx].id : uid(),
    time, title,
    desc: document.getElementById('cr-desc').value,
    place: document.getElementById('cr-place').value,
    importance: document.getElementById('cr-importance').value,
    chapterId: document.getElementById('cr-chapter')?.value || '',
    sortKey,
    order: defaultOrder,
    chars: charsArr,
  };
  // sortKey undefined 면 객체에서 제거 (깔끔한 직렬화)
  if (sortKey === undefined) delete ev.sortKey;
  if (isEdit) p.chronicles[existingIdx] = ev;
  else p.chronicles.push(ev);
  autoSave(); closeModal(); renderChronicle();
}

function deleteChronicle(id) {
  const p = getProject();
  const i = p?.chronicles?.findIndex(e => e.id === id) ?? -1;
  if (i < 0) return;
  const ev = p.chronicles[i];
  const title = ev?.title ? `"${ev.title}"` : '이 사건';
  confirmDialog(`${title}을(를) 삭제합니다.`, () => {
    p.chronicles.splice(i, 1);
    autoSave(); renderChronicle();
  });
}

// ─── 사건 일지 드래그 앤 드롭 ────────────────────────────────
let _evDrag = null;

function initChronicleDrag() {
  document.querySelectorAll('.ev-drag-handle').forEach(h => {
    h.addEventListener('mousedown', evMouseStart);
    h.addEventListener('touchstart', evTouchStart, { passive: false });
  });
}

function evTouchStart(e) {
  e.preventDefault();
  const t = e.touches[0];
  evDragInit(e.currentTarget, t.clientX, t.clientY);
  document.addEventListener('touchmove', evTouchMove, { passive: false });
  document.addEventListener('touchend', evTouchEnd, { once: true });
}
function evMouseStart(e) {
  evDragInit(e.currentTarget, e.clientX, e.clientY);
  document.addEventListener('mousemove', evMouseMove);
  document.addEventListener('mouseup', evMouseEnd, { once: true });
}

function evDragInit(handle, x, y) {
  const evId = handle.dataset.evId;
  const row = handle.closest('.ev-drag-item');
  if (!row) return;
  const rect = row.getBoundingClientRect();
  const p = getProject();
  const ev = (p?.chronicles || []).find(e => e.id === evId);
  const label = ev ? (ev.title || '(제목 없음)') : '사건';

  const ghost = document.createElement('div');
  ghost.style.cssText = `position:fixed;left:${rect.left+24}px;top:${rect.top}px;
    width:${rect.width-24}px;height:40px;z-index:9999;pointer-events:none;
    box-shadow:0 6px 24px rgba(0,0,0,.18);border-radius:10px;
    background:var(--gold-light);border:2px solid var(--gold);
    display:flex;align-items:center;padding:0 14px;gap:10px;opacity:.92`;
  ghost.innerHTML = `<span style="font-size:16px;color:var(--gold)">⠿</span>
    <span style="font-weight:700;font-size:13px;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(label)}</span>`;
  document.body.appendChild(ghost);
  row.style.opacity = '0.3';

  _evDrag = {
    evId,
    row,
    ghost,
    offsetX: x - rect.left - 24,
    offsetY: y - rect.top,
    dropTarget: null,
  };
}

function evTouchMove(e) {
  if (!_evDrag) return;
  e.preventDefault();
  evDragMove(e.touches[0].clientX, e.touches[0].clientY);
}
function evMouseMove(e) {
  if (!_evDrag) return;
  evDragMove(e.clientX, e.clientY);
}

function evDragMove(cx, cy) {
  const { ghost, offsetX, offsetY, row } = _evDrag;
  ghost.style.left = (cx - offsetX) + 'px';
  ghost.style.top = (cy - offsetY) + 'px';

  document.querySelectorAll('.ev-drop-line').forEach(el => el.remove());

  const all = [...document.querySelectorAll('.ev-drag-item')];
  let bestRow = null, bestBefore = true;
  for (const r of all) {
    if (r === row) continue;
    const rc = r.getBoundingClientRect();
    if (cy >= rc.top - 8 && cy <= rc.bottom + 8) {
      bestRow = r;
      bestBefore = cy < rc.top + rc.height / 2;
      break;
    }
  }
  if (bestRow) {
    const line = document.createElement('div');
    line.className = 'ev-drop-line';
    const rc = bestRow.getBoundingClientRect();
    line.style.cssText = `position:fixed;left:${rc.left}px;width:${rc.width}px;
      top:${bestBefore ? rc.top - 2 : rc.bottom - 1}px;height:3px;
      background:var(--gold);z-index:9998;pointer-events:none;border-radius:2px`;
    document.body.appendChild(line);
    _evDrag.dropTarget = { rowEl: bestRow, before: bestBefore };
  } else {
    _evDrag.dropTarget = null;
  }
}

function evTouchEnd() {
  document.removeEventListener('touchmove', evTouchMove);
  evDragCommit();
}
function evMouseEnd() {
  document.removeEventListener('mousemove', evMouseMove);
  evDragCommit();
}

function evDragCommit() {
  if (!_evDrag) return;
  const { evId, row, ghost, dropTarget } = _evDrag;
  _evDrag = null;

  ghost.remove();
  document.querySelectorAll('.ev-drop-line').forEach(el => el.remove());
  row.style.opacity = '';

  if (!dropTarget) return;
  const p = getProject();
  if (!p?.chronicles) return;

  // 현재 표시 순서대로 배열 재구성
  const all = [...document.querySelectorAll('.ev-drag-item')];
  const reordered = [];
  for (const r of all) {
    if (r === row) continue;
    if (r === dropTarget.rowEl && dropTarget.before) {
      const draggedEv = p.chronicles.find(e => e.id === evId);
      if (draggedEv) reordered.push(draggedEv);
    }
    const rowEv = p.chronicles.find(e => e.id === r.dataset.evId);
    if (rowEv) reordered.push(rowEv);
    if (r === dropTarget.rowEl && !dropTarget.before) {
      const draggedEv = p.chronicles.find(e => e.id === evId);
      if (draggedEv) reordered.push(draggedEv);
    }
  }
  // order 재할당 (10 간격으로, 나중에 삽입 여유 확보)
  reordered.forEach((ev, i) => { ev.order = (i + 1) * 10; });
  // p.chronicles 배열 자체도 동일 순서로 재배치 (indexOf 기반 편집이 정상 동작하려면)
  p.chronicles = reordered;
  autoSave();
  renderChronicle();
}

function renderItems() {
  const p = getProject();
  if (!p.items) p.items = [];
  // id 보정
  let _fixed = false;
  p.items.forEach(it => { if (!it.id) { it.id = uid(); _fixed = true; } });
  if (_fixed) autoSave();
  const items = p.items;
  const chars = p.characters || [];

  // 필터 상태
  if (!window._itemFilter)     window._itemFilter = '전체';
  if (!window._itemCharFilter) window._itemCharFilter = '전체';
  if (window._itemSearch === undefined) window._itemSearch = '';
  const filter     = window._itemFilter;
  const charFilter = window._itemCharFilter;
  const sq         = (window._itemSearch || '').trim().toLowerCase();

  // 카테고리 필터링
  const parentGroup = ITEM_GROUPS.find(g => g.group === filter);
  const baseFiltered = filter === '전체' ? items
    : parentGroup ? items.filter(it => parentGroup.cats.includes(it.cat))
    : items.filter(it => it.cat === filter);

  // 인물 필터링
  const charFiltered = charFilter === '전체' ? baseFiltered
    : baseFiltered.filter(it => it.chars && it.chars.includes(charFilter));

  // 검색 필터링
  const searchFiltered = sq
    ? charFiltered.filter(it =>
        (it.name||'').toLowerCase().includes(sq) ||
        (it.desc||'').toLowerCase().includes(sq))
    : charFiltered;

  // 희귀도 순 정렬
  const rarityOrder = ITEM_RARITIES.map(r => r.label).reverse();
  const filtered = [...searchFiltered].sort((a, b) => {
    const ai = rarityOrder.indexOf(a.rarity || '일반');
    const bi = rarityOrder.indexOf(b.rarity || '일반');
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  // 아이템에 실제 등장하는 인물만 추출
  const usedChars = [...new Set(
    items.flatMap(it => it.chars ? it.chars.split(',').map(s=>s.trim()).filter(Boolean) : [])
  )].sort();

  // 카운트
  const totalCount = items.length;
  const groupCount = g => items.filter(it => g.cats.includes(it.cat)).length;
  const catCount   = c => items.filter(it => it.cat === c).length;

  // 필터 UI
  const activeGroup = parentGroup || ITEM_GROUPS.find(g => g.cats.includes(filter));
  const filterHtml = `
    <div style="display:flex;gap:5px;flex-wrap:nowrap;overflow-x:auto;margin-bottom:6px;
      padding-bottom:2px;-webkit-overflow-scrolling:touch;scrollbar-width:none">
      <button onclick="window._itemFilter='전체';renderItems()"
        style="padding:4px 12px;border-radius:20px;font-size:12px;font-weight:600;
          white-space:nowrap;flex-shrink:0;cursor:pointer;
          font-family:'Noto Sans KR',sans-serif;transition:all .15s;
          border:1.5px solid ${filter==='전체'?'var(--gold)':'var(--border)'};
          background:${filter==='전체'?'var(--gold)':'transparent'};
          color:${filter==='전체'?'#fff':'var(--muted)'}">
        전체 <span style="opacity:.7">(${totalCount})</span>
      </button>
      ${ITEM_GROUPS.map(g => {
        const isActive = filter===g.group || g.cats.includes(filter);
        return `<button onclick="window._itemFilter='${g.group}';renderItems()"
          style="padding:4px 12px;border-radius:20px;font-size:12px;font-weight:600;
            white-space:nowrap;flex-shrink:0;cursor:pointer;
            font-family:'Noto Sans KR',sans-serif;transition:all .15s;
            border:1.5px solid ${isActive?'var(--gold)':'var(--border)'};
            background:${isActive?'var(--gold)':'transparent'};
            color:${isActive?'#fff':'var(--muted)'}">
          ${g.group} <span style="opacity:.7">(${groupCount(g)})</span>
        </button>`;
      }).join('')}
    </div>
    ${activeGroup ? `
    <div style="display:flex;gap:5px;flex-wrap:nowrap;overflow-x:auto;margin-bottom:10px;
      padding-bottom:4px;-webkit-overflow-scrolling:touch;scrollbar-width:none">
      ${activeGroup.cats.map(c => `
        <button onclick="window._itemFilter='${c}';renderItems()"
          style="padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600;
            white-space:nowrap;flex-shrink:0;cursor:pointer;
            font-family:'Noto Sans KR',sans-serif;transition:all .15s;
            border:1.5px solid ${filter===c?'var(--teal)':'var(--border)'};
            background:${filter===c?'var(--teal)':'transparent'};
            color:${filter===c?'#fff':'var(--muted)'}">
          ${c} <span style="opacity:.7">(${catCount(c)})</span>
        </button>`).join('')}
    </div>` : '<div style="margin-bottom:4px"></div>'}
    <!-- 검색 + 인물 드롭다운 -->
    <div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap">
      <div style="position:relative;flex:1;min-width:160px">
        <input id="item-search-input" value="${esc(window._itemSearch||'')}"
          oninput="window._itemSearch=this.value;renderItemGrid()"
          placeholder="아이템 검색..."
          style="width:100%;padding:7px 30px 7px 12px;border:1.5px solid var(--border);
            border-radius:8px;font-size:12px;background:var(--paper);color:var(--ink);
            font-family:'Noto Sans KR',sans-serif;outline:none"
          onfocus="this.style.borderColor='var(--gold)'" onblur="this.style.borderColor='var(--border)'">
        ${sq?`<button onclick="window._itemSearch='';document.getElementById('item-search-input').value='';renderItemGrid()"
          style="position:absolute;right:8px;top:50%;transform:translateY(-50%);
            background:none;border:none;cursor:pointer;font-size:14px;color:var(--muted)">×</button>`:''}
      </div>
      ${usedChars.length > 0 ? `
      <select onchange="window._itemCharFilter=this.value;renderItems()"
        style="padding:7px 10px;border:1.5px solid ${charFilter!=='전체'?'var(--gold)':'var(--border)'};
          border-radius:8px;font-size:12px;background:var(--paper);color:var(--ink);
          font-family:'Noto Sans KR',sans-serif;cursor:pointer;font-weight:${charFilter!=='전체'?'700':'400'}">
        <option value="전체" ${charFilter==='전체'?'selected':''}>👤 전체 인물</option>
        ${usedChars.map(ch=>`<option value="${esc(ch)}" ${charFilter===ch?'selected':''}>${esc(ch)}</option>`).join('')}
      </select>` : ''}
    </div>`;

  document.getElementById('main').innerHTML = `
    <div style="max-width:860px;margin:0 auto">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <div class="font-display" style="font-size:22px">아이템 사전 (${items.length})</div>
        <button class="btn btn-gold" onclick="showItemModal()">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          아이템 추가
        </button>
      </div>
      ${filterHtml}
      <!-- 아이템 그리드 -->
      <div id="item-grid-wrap"></div>
    </div>`;
  renderItemGrid();
}

function renderItemGrid() {
  const p = getProject();
  const items = p.items || [];
  const filter     = window._itemFilter || '전체';
  const charFilter = window._itemCharFilter || '전체';
  const sq         = (window._itemSearch || '').trim().toLowerCase();
  const rarityOrder = ITEM_RARITIES.map(r => r.label).reverse();

  const parentGroup = ITEM_GROUPS.find(g => g.group === filter);
  const baseFiltered = filter === '전체' ? items
    : parentGroup ? items.filter(it => parentGroup.cats.includes(it.cat))
    : items.filter(it => it.cat === filter);
  const charFiltered = charFilter === '전체' ? baseFiltered
    : baseFiltered.filter(it => it.chars && it.chars.includes(charFilter));
  const searchFiltered = sq
    ? charFiltered.filter(it =>
        (it.name||'').toLowerCase().includes(sq) ||
        (it.desc||'').toLowerCase().includes(sq))
    : charFiltered;
  const filtered = [...searchFiltered].sort((a, b) => {
    const ai = rarityOrder.indexOf(a.rarity || '일반');
    const bi = rarityOrder.indexOf(b.rarity || '일반');
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  const grid = document.getElementById('item-grid-wrap');
  if (!grid) return;

  // × 버튼 표시 갱신
  const clearBtn = document.getElementById('item-search-clear');
  if (clearBtn) clearBtn.style.display = sq ? 'block' : 'none';

  grid.innerHTML = filtered.length === 0
    ? `<div class="card empty-state"><div class="emoji">📦</div><p>${items.length===0?'아이템을 추가해보세요.':'검색 결과가 없어요.'}</p></div>`
    : `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:14px">
        ${filtered.map(it => {
          const itIdEsc = esc(it.id||'');
          const rarity = ITEM_RARITIES.find(r=>r.label===it.rarity) || ITEM_RARITIES[0];
          return `
          <div class="card card-sm" style="padding:0;overflow:hidden;border-top:3px solid ${rarity.color};display:flex;flex-direction:column;cursor:default">

            <div style="padding:12px 14px;flex:1;display:flex;gap:12px;align-items:flex-start">
              <div style="flex:1;min-width:0">
                <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;flex-wrap:wrap">
                  <span style="font-weight:700;font-size:14px">${esc(it.name)}</span>
                  <span style="font-size:10px;font-weight:700;color:${rarity.color};
                    background:${rarity.color}18;border-radius:10px;padding:1px 7px">${it.rarity||'일반'}</span>
                </div>
                <div style="display:flex;gap:4px;margin-bottom:6px;flex-wrap:wrap">
                  <span class="tag" style="font-size:10px">${esc(it.cat||'기타')}</span>
                  ${it.chars ? `<span style="font-size:11px;color:var(--teal)">👤 ${esc(it.chars)}</span>` : ''}
                </div>
                ${it.desc ? `<div style="font-size:12px;color:var(--muted);line-height:1.6;
                  display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${esc(it.desc)}</div>` : ''}
                ${it.chapter ? `<div style="font-size:11px;color:var(--muted);margin-top:4px">📖 ${esc(it.chapter)}</div>` : ''}
              </div>
            </div>
            <div style="display:flex;border-top:1px solid var(--border)">
              <button onclick="showItemModal('${itIdEsc}')"
                style="flex:1;padding:7px;background:none;border:none;cursor:pointer;
                  font-size:12px;color:var(--teal);font-family:'Noto Sans KR',sans-serif">✏️ 수정</button>
              <button onclick="deleteItem('${itIdEsc}')"
                style="flex:1;padding:7px;background:none;border:none;cursor:pointer;
                  font-size:12px;color:var(--rust);font-family:'Noto Sans KR',sans-serif">🗑️ 삭제</button>
            </div>
          </div>`;
        }).join('')}
      </div>`;
}


// ═══════════════════════════════════════════════════════════
// 용어 사전 (GLOSSARY)
// ═══════════════════════════════════════════════════════════
const GLOSSARY_CATS = ['인물명','지명','마법/기술','아이템','조직/세력','언어/문자','용어','기타'];

function renderGlossaryCards() {
  const p = getProject();
  const list = p.glossary || [];
  const q   = (window._glossarySearch || '').trim().toLowerCase();
  const cat = window._glossaryCat || '전체';
  const filtered = list.filter(g =>
    (cat === '전체' || g.cat === cat) &&
    (!q || g.term.toLowerCase().includes(q) || (g.desc||'').toLowerCase().includes(q))
  );
  const cards = filtered.length === 0
    ? `<div class="card empty-state"><div class="emoji">📖</div><p>${list.length===0?'용어를 추가해보세요.':'검색 결과가 없어요.'}</p></div>`
    : `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px">${
        filtered.map(g => {
          const gIdEsc = esc(g.id||'');
          return `<div class="card card-sm" style="padding:0;overflow:hidden;display:flex;flex-direction:column">

            <div style="padding:12px 14px;flex:1">
              <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:6px">
                <div>
                  <span style="font-weight:700;font-size:15px">${esc(g.term)}</span>
                  ${g.pronunciation?`<span style="font-size:11px;color:var(--muted);margin-left:6px">[${esc(g.pronunciation)}]</span>`:''}
                </div>
                <span style="font-size:10px;background:var(--teal-light);color:var(--teal);border-radius:10px;padding:2px 8px;white-space:nowrap;flex-shrink:0">${esc(g.cat||'기타')}</span>
              </div>
              ${g.desc?`<p style="font-size:13px;color:var(--ink);line-height:1.7;margin-bottom:6px">${esc(g.desc)}</p>`:''}
              ${g.alias?`<p style="font-size:11px;color:var(--muted)">별칭: ${esc(g.alias)}</p>`:''}
            </div>
            <div style="display:flex;border-top:1px solid var(--border)">
              <button onclick="showGlossaryModal('${gIdEsc}')" style="flex:1;padding:7px;background:none;border:none;cursor:pointer;font-size:12px;color:var(--teal);font-family:'Noto Sans KR',sans-serif">✏️ 수정</button>
              <button onclick="deleteGlossary('${gIdEsc}')" style="flex:1;padding:7px;background:none;border:none;cursor:pointer;font-size:12px;color:var(--rust);font-family:'Noto Sans KR',sans-serif">🗑️ 삭제</button>
            </div>
          </div>`;
        }).join('')
      }</div>`;
  const el = document.getElementById('glossary-cards');
  if (el) el.innerHTML = cards;
  // 카테고리 버튼 활성 상태 업데이트
  document.querySelectorAll('.glossary-cat-btn').forEach(btn => {
    const active = btn.dataset.cat === cat;
    btn.style.borderColor = active ? 'var(--gold)' : 'var(--border)';
    btn.style.background = active ? 'var(--gold)' : 'transparent';
    btn.style.color = active ? '#fff' : 'var(--muted)';
  });
  // × 버튼 표시/숨김
  const clr = document.getElementById('glossary-search-clear');
  if (clr) clr.style.display = q ? 'block' : 'none';
}

function renderGlossary() {
  const p = getProject();
  if (!p.glossary) p.glossary = [];
  // id 보정
  let _fixed = false;
  p.glossary.forEach(g => { if (!g.id) { g.id = uid(); _fixed = true; } });
  if (_fixed) autoSave();
  const list = p.glossary;
  if (!window._glossarySearch) window._glossarySearch = '';
  if (!window._glossaryCat)    window._glossaryCat = '전체';
  const cat = window._glossaryCat;
  const catCounts = {};
  GLOSSARY_CATS.forEach(c => { catCounts[c] = list.filter(g => g.cat === c).length; });
  const catBtns = ['전체',...GLOSSARY_CATS].map(c => {
    const active = cat === c;
    const cnt = c !== '전체' && catCounts[c] ? ` <span style="opacity:.7">${catCounts[c]}</span>` : '';
    return `<button class="glossary-cat-btn" data-cat="${c}"
      onclick="window._glossaryCat='${c}';renderGlossaryCards()"
      style="padding:5px 12px;border-radius:20px;font-size:12px;font-weight:600;cursor:pointer;
        border:1.5px solid ${active?'var(--gold)':'var(--border)'};
        background:${active?'var(--gold)':'transparent'};
        color:${active?'#fff':'var(--muted)'}">${c}${cnt}</button>`;
  }).join('');

  document.getElementById('main').innerHTML = `
    <div style="max-width:900px;margin:0 auto">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;flex-wrap:wrap;gap:10px">
        <div>
          <h2 style="font-size:18px;font-weight:700;margin-bottom:4px">📖 용어 사전</h2>
          <p style="font-size:12px;color:var(--muted)">작품 고유 용어, 설정 단어 등을 정리해두세요</p>
        </div>
        <button class="btn btn-gold" onclick="showGlossaryModal()">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          용어 추가
        </button>
      </div>
      <div style="display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap;align-items:center">
        <div style="position:relative;flex:1;min-width:160px;max-width:260px">
          <input id="glossary-search-input" value="${esc(window._glossarySearch)}"
            placeholder="용어 검색..."
            style="width:100%;padding:7px 30px 7px 12px;border:1.5px solid var(--border);
              border-radius:8px;font-size:12px;background:var(--paper);color:var(--ink);
              font-family:'Noto Sans KR',sans-serif;outline:none"
            onfocus="this.style.borderColor='var(--gold)'" onblur="this.style.borderColor='var(--border)'">
          <button id="glossary-search-clear"
            onclick="window._glossarySearch='';document.getElementById('glossary-search-input').value='';renderGlossaryCards()"
            style="display:${window._glossarySearch?'block':'none'};position:absolute;right:8px;top:50%;transform:translateY(-50%);
              background:none;border:none;cursor:pointer;font-size:14px;color:var(--muted)">×</button>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">${catBtns}</div>
      </div>
      <div id="glossary-cards"></div>
    </div>`;
  renderGlossaryCards();
}

function renderGlossaryPanelHtml() {
  const p = getProject();
  if (!p.glossary) p.glossary = [];
  // id 보정 (패널 먼저 진입하는 경우 대비)
  let _fixed = false;
  p.glossary.forEach(g => { if (!g.id) { g.id = uid(); _fixed = true; } });
  if (_fixed) autoSave();
  const list = p.glossary;
  if (!window._glossaryPanelQ) window._glossaryPanelQ = '';
  const q = window._glossaryPanelQ.trim().toLowerCase();
  const filtered = list.filter(g => !q || g.term.toLowerCase().includes(q) || (g.desc||'').toLowerCase().includes(q));
  const items = filtered.length === 0
    ? `<div style="text-align:center;color:var(--muted);font-size:12px;padding:20px 0">용어가 없어요</div>`
    : filtered.map(g => {
        const gIdEsc = esc(g.id||'');
        return `<div style="background:var(--cream);border-radius:8px;padding:10px 12px;cursor:pointer;margin-bottom:6px" onclick="showGlossaryModal('${gIdEsc}')">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px">
            <span style="font-weight:700;font-size:13px">${esc(g.term)}</span>
            <span style="font-size:10px;color:var(--teal)">${esc(g.cat||'기타')}</span>
          </div>
          ${g.desc?`<p style="font-size:12px;color:var(--muted);line-height:1.5;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${esc(g.desc)}</p>`:''}
        </div>`;
      }).join('');
  return `<div style="padding:12px;display:flex;flex-direction:column;gap:8px">
    <div style="position:relative;display:flex;gap:6px;margin-bottom:4px">
      <div style="position:relative;flex:1">
        <input id="glossary-panel-search" placeholder="용어 검색..." value="${esc(window._glossaryPanelQ)}"
          oninput="window._glossaryPanelQ=this.value;document.getElementById('glossary-panel-inner').innerHTML=renderGlossaryPanelHtml()"
          onkeyup="window._glossaryPanelQ=this.value;document.getElementById('glossary-panel-inner').innerHTML=renderGlossaryPanelHtml()"
          style="width:100%;padding:6px 28px 6px 10px;font-size:12px">
        ${window._glossaryPanelQ ? `<button onclick="window._glossaryPanelQ='';document.getElementById('glossary-panel-search').value='';document.getElementById('glossary-panel-inner').innerHTML=renderGlossaryPanelHtml()"
          style="position:absolute;right:6px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;font-size:13px;color:var(--muted)">×</button>` : ''}
      </div>
      <button class="btn btn-gold btn-sm" onclick="showGlossaryModal()">＋</button>
    </div>
    <div id="glossary-panel-inner">${items}</div>
  </div>`;
}

function showGlossaryModal(id) {
  const p = getProject();
  const g = id ? (p.glossary||[]).find(x => x.id === id) : null;
  const isEdit = !!g;
  const gData = g || {};
  const idEsc = esc(id||'');
  showModal(`
    <div class="modal-title">${isEdit ? '용어 수정' : '용어 추가'}</div>
    <div class="form-grid">
      <div><label class="label">용어 *</label>
        <input id="gl-term" value="${esc(gData.term||'')}" placeholder="용어명"></div>
      <div><label class="label">발음/표기</label>
        <input id="gl-pron" value="${esc(gData.pronunciation||'')}" placeholder="예: [마나], [아발론]"></div>
      <div><label class="label">카테고리</label>
        <select id="gl-cat">${GLOSSARY_CATS.map(c=>`<option value="${c}" ${(gData.cat||'기타')===c?'selected':''}>${c}</option>`).join('')}</select></div>
      <div><label class="label">별칭/다른 이름</label>
        <input id="gl-alias" value="${esc(gData.alias||'')}" placeholder="예: 검은 마법사, 어둠의 군주"></div>
      <div class="full"><label class="label">설명 *</label>
        <textarea id="gl-desc" rows="4" placeholder="이 용어에 대한 설명을 입력하세요">${esc(gData.desc||'')}</textarea></div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="closeModal()">취소</button>
      <button class="btn btn-gold" onclick="saveGlossary('${idEsc}')">저장</button>
    </div>`);
  setTimeout(() => document.getElementById('gl-term')?.focus(), 50);
}

function saveGlossary(id) {
  const p = getProject();
  if (!p.glossary) p.glossary = [];
  const term = document.getElementById('gl-term').value.trim();
  if (!term) { toast('용어를 입력해주세요.'); return; }
  const existingIdx = id ? p.glossary.findIndex(x => x.id === id) : -1;
  const isEdit = existingIdx >= 0;
  const entry = {
    id: isEdit ? p.glossary[existingIdx].id : uid(),
    term,
    pronunciation: document.getElementById('gl-pron').value.trim(),
    cat: document.getElementById('gl-cat').value,
    alias: document.getElementById('gl-alias').value.trim(),
    desc: document.getElementById('gl-desc').value.trim(),
    // 기존 related 같은 추가 필드 보존
    ...(isEdit ? { related: p.glossary[existingIdx].related } : {}),
  };
  if (isEdit) p.glossary[existingIdx] = entry;
  else p.glossary.push(entry);
  // 가나다순 정렬
  p.glossary.sort((a,b) => a.term.localeCompare(b.term, 'ko'));
  autoSave();
  closeModal();
  if (state.activeTab === 'glossary') renderGlossary();
  refreshSplitGlossary();
  updateBadges();
  toast('용어가 저장됐어요 📖');
}

function deleteGlossary(id) {
  const p = getProject();
  const i = p?.glossary?.findIndex(x => x.id === id) ?? -1;
  if (i < 0) return;
  confirmDialog('이 용어를 삭제할까요?', () => {
    p.glossary.splice(i, 1);
    autoSave();
    renderGlossary();
    updateBadges();
    toast('삭제됐어요.');
  });
}

// ═══════════════════════════════════════════════════════════
// 찾기 / 바꾸기 (FIND & REPLACE)
// ═══════════════════════════════════════════════════════════
let _frMatches = [];
let _frCurrent = -1;

function toggleFindReplace() {
  const panel = document.getElementById('find-replace-panel');
  if (!panel) return;
  const visible = panel.style.display !== 'none';
  panel.style.display = visible ? 'none' : 'flex';
  panel.style.flexDirection = 'column';
  if (!visible) {
    setTimeout(() => document.getElementById('fr-find')?.focus(), 50);
  } else {
    frClear();
  }
}

function closeFindReplace() {
  const panel = document.getElementById('find-replace-panel');
  if (panel) panel.style.display = 'none';
  frClear();
}

function frGetEditor() {
  return document.getElementById('prose-editor') || document.getElementById('focus-editor');
}

function frHighlight(scrollToFirst = true) {
  const q = document.getElementById('fr-find')?.value || '';
  const ta = frGetEditor();
  if (!ta || !q) { frClear(); return; }
  const text = ta.value;
  const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
  _frMatches = [];
  let m;
  while ((m = regex.exec(text)) !== null) _frMatches.push(m.index);
  _frCurrent = _frMatches.length > 0 ? 0 : -1;
  frUpdateCount();
  if (scrollToFirst) frScrollTo();
}

function frNext() {
  if (_frMatches.length === 0) { frHighlight(); return; }
  _frCurrent = (_frCurrent + 1) % _frMatches.length;
  frUpdateCount();
  frScrollTo();
}

function frPrev() {
  if (_frMatches.length === 0) { frHighlight(); return; }
  _frCurrent = (_frCurrent - 1 + _frMatches.length) % _frMatches.length;
  frUpdateCount();
  frScrollTo();
}

function frScrollTo() {
  const ta = frGetEditor();
  if (!ta || _frCurrent < 0 || _frMatches.length === 0) return;
  const pos = _frMatches[_frCurrent];
  const q = document.getElementById('fr-find')?.value || '';
  ta.focus();
  ta.setSelectionRange(pos, pos + q.length);
  // 실제 줄바꿈 높이를 측정해 긴 문장 안의 검색 결과도 정확히 보여준다.
  if (typeof getTextareaCaretTop === 'function') {
    const caretTop = getTextareaCaretTop(ta, pos);
    ta.scrollTop = Math.max(0, Math.min(
      caretTop - ta.clientHeight * 0.35,
      ta.scrollHeight - ta.clientHeight
    ));
  }
}

function frUpdateCount() {
  const el = document.getElementById('fr-count');
  if (!el) return;
  if (_frMatches.length === 0) {
    el.textContent = '없음';
    el.style.color = 'var(--rust)';
  } else {
    el.textContent = `${_frCurrent + 1}/${_frMatches.length}`;
    el.style.color = 'var(--muted)';
  }
}

function frReplace() {
  const ta = frGetEditor();
  if (!ta || _frCurrent < 0 || _frMatches.length === 0) return;
  const q = document.getElementById('fr-find')?.value || '';
  const r = document.getElementById('fr-replace')?.value || '';
  const pos = _frMatches[_frCurrent];
  const chId = ta.dataset.chid || ta.id;
  const before = ta.value.substring(0, pos);
  const after = ta.value.substring(pos + q.length);
  ta.value = before + r + after;
  ta.dispatchEvent(new Event('input'));
  // 재검색
  frHighlight();
  toast('1개 바꿨어요.');
}

function frReplaceAll() {
  const ta = frGetEditor();
  if (!ta) return;
  const q = document.getElementById('fr-find')?.value || '';
  const r = document.getElementById('fr-replace')?.value || '';
  if (!q) return;
  const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
  const count = (ta.value.match(regex)||[]).length;
  if (count === 0) { toast('찾을 수 없어요.'); return; }
  ta.value = ta.value.replace(regex, r);
  ta.dispatchEvent(new Event('input'));
  frClear();
  toast(count + '개를 모두 바꿨어요 ✓');
}

function frClear() {
  _frMatches = [];
  _frCurrent = -1;
  const el = document.getElementById('fr-count');
  if (el) { el.textContent = ''; }
}

// ═══════════════════════════════════════════════════════════════
// 전체 작품 검색 (Global Search)
// 모든 화의 본문·제목·요약·메모를 한 번에 검색
// ═══════════════════════════════════════════════════════════════
const GS = {
  query: '',
  scopes: { content: true, title: true, summary: true, memo: true },
  caseSensitive: false,
  regex: false,
  results: [],   // [{chId, field, pos, len, before, match, after, chTitle, folderName}]
  debounce: null,
};

function openGlobalSearch() {
  if (!getProject()) { toast('프로젝트를 먼저 열어주세요.'); return; }
  let modal = document.getElementById('gs-modal');
  if (modal) { modal.style.display = 'flex'; document.getElementById('gs-input')?.focus(); return; }

  modal = document.createElement('div');
  modal.id = 'gs-modal';
  modal.className = 'gs-modal';
  modal.innerHTML = `
    <div class="gs-backdrop" onclick="closeGlobalSearch()"></div>
    <div class="gs-panel" role="dialog" aria-label="전체 작품 검색">
      <div class="gs-header">
        <div style="font-family:'Noto Serif KR',serif;font-size:18px;font-weight:700;color:var(--ink)">
          🔎 전체 작품 검색
        </div>
        <button class="gs-close" onclick="closeGlobalSearch()" title="닫기 (Esc)">✕</button>
      </div>
      <div class="gs-search-row">
        <input id="gs-input" type="text" placeholder="검색어를 입력하세요..." autocomplete="off"
          oninput="gsOnInput()" onkeydown="gsOnKeydown(event)">
        <span id="gs-count" class="gs-count">—</span>
      </div>
      <div class="gs-options">
        <div class="gs-pill-row">
          <span class="gs-pill-label">범위</span>
          <button class="gs-pill" data-scope="content" onclick="gsToggleScope('content')">
            <span class="gs-pill-icon"></span>본문
          </button>
          <button class="gs-pill" data-scope="title" onclick="gsToggleScope('title')">
            <span class="gs-pill-icon"></span>제목
          </button>
          <button class="gs-pill" data-scope="summary" onclick="gsToggleScope('summary')">
            <span class="gs-pill-icon"></span>회차 요약
          </button>
          <button class="gs-pill" data-scope="memo" onclick="gsToggleScope('memo')">
            <span class="gs-pill-icon"></span>메모
          </button>
        </div>
        <div class="gs-pill-row">
          <span class="gs-pill-label">옵션</span>
          <button class="gs-pill gs-pill-opt" data-opt="case" onclick="gsToggleOpt('case')" title="대소문자 구분">
            <span class="gs-pill-mono">Aa</span>대소문자
          </button>
          <button class="gs-pill gs-pill-opt" data-opt="regex" onclick="gsToggleOpt('regex')" title="정규식 사용">
            <span class="gs-pill-mono">.*</span>정규식
          </button>
        </div>
      </div>
      <div class="gs-results" id="gs-results">
        <div class="gs-empty">검색어를 입력하면 결과가 표시됩니다.</div>
      </div>
    </div>`;
  document.body.appendChild(modal);

  // 직전 검색어 복원
  const input = document.getElementById('gs-input');
  if (GS.query) { input.value = GS.query; gsRun(); }
  gsSyncPills();
  setTimeout(() => { input?.focus(); input?.select(); }, 30);
}

function gsSyncPills() {
  // 범위 pill
  document.querySelectorAll('#gs-modal .gs-pill[data-scope]').forEach(btn => {
    const key = btn.dataset.scope;
    btn.classList.toggle('active', !!GS.scopes[key]);
  });
  // 옵션 pill
  const caseBtn = document.querySelector('#gs-modal .gs-pill[data-opt="case"]');
  if (caseBtn) caseBtn.classList.toggle('active', GS.caseSensitive);
  const regexBtn = document.querySelector('#gs-modal .gs-pill[data-opt="regex"]');
  if (regexBtn) regexBtn.classList.toggle('active', GS.regex);
}

function closeGlobalSearch() {
  const m = document.getElementById('gs-modal');
  if (m) m.style.display = 'none';
}

function gsToggleScope(key) {
  GS.scopes[key] = !GS.scopes[key];
  // 최소 하나는 켜져있어야 함
  const anyOn = Object.values(GS.scopes).some(v => v);
  if (!anyOn) { GS.scopes[key] = true; toast('최소 하나의 범위는 선택해야 해요.'); return; }
  gsSyncPills();
  gsRun();
}

function gsToggleOpt(opt) {
  if (opt === 'case') GS.caseSensitive = !GS.caseSensitive;
  else if (opt === 'regex') GS.regex = !GS.regex;
  gsSyncPills();
  gsRun();
}

function gsOnInput() {
  GS.query = document.getElementById('gs-input').value;
  clearTimeout(GS.debounce);
  GS.debounce = setTimeout(gsRun, 120);
}

function gsOnKeydown(e) {
  if (e.key === 'Escape') { e.preventDefault(); closeGlobalSearch(); return; }
  if (e.key === 'Enter') { e.preventDefault(); gsRun(); }
}

function gsBuildRegex() {
  const q = GS.query;
  if (!q) return null;
  const flags = GS.caseSensitive ? 'g' : 'gi';
  try {
    if (GS.regex) return new RegExp(q, flags);
    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(escaped, flags);
  } catch (err) {
    return { _invalid: true, message: err.message };
  }
}

function gsRun() {
  GS.results = [];
  const container = document.getElementById('gs-results');
  const countEl = document.getElementById('gs-count');
  if (!container) return;

  const p = getProject();
  if (!p) return;
  const q = GS.query.trim();
  if (!q) {
    container.innerHTML = '<div class="gs-empty">검색어를 입력하면 결과가 표시됩니다.</div>';
    if (countEl) countEl.textContent = '—';
    return;
  }

  const regex = gsBuildRegex();
  if (!regex) { container.innerHTML = '<div class="gs-empty">검색어를 입력하면 결과가 표시됩니다.</div>'; return; }
  if (regex._invalid) {
    container.innerHTML = `<div class="gs-empty" style="color:var(--rust)">정규식 오류: ${esc(regex.message)}</div>`;
    if (countEl) { countEl.textContent = '오류'; countEl.style.color = 'var(--rust)'; }
    return;
  }

  const chapters = p.chapters || [];
  const folders = p.chapterFolders || [];
  const folderMap = {};
  folders.forEach(f => { folderMap[f.id] = f.name; });

  const FIELDS = [
    { key: 'title',   label: '제목', prop: 'title' },
    { key: 'summary', label: '요약', prop: 'summary' },
    { key: 'memo',    label: '메모', prop: 'memo' },
    { key: 'content', label: '본문', prop: 'content' },
  ];

  chapters.forEach(ch => {
    FIELDS.forEach(f => {
      if (!GS.scopes[f.key]) return;
      const text = ch[f.prop] || '';
      if (!text) return;
      let m;
      // stateful regex — reset lastIndex
      regex.lastIndex = 0;
      const maxPerField = 500; // 화당 필드당 최대
      let count = 0;
      while ((m = regex.exec(text)) !== null) {
        const pos = m.index;
        const matched = m[0];
        if (matched.length === 0) { regex.lastIndex++; continue; }
        const ctxBefore = 30, ctxAfter = 40;
        const bStart = Math.max(0, pos - ctxBefore);
        const aEnd   = Math.min(text.length, pos + matched.length + ctxAfter);
        GS.results.push({
          chId: ch.id,
          field: f.key,
          fieldLabel: f.label,
          pos,
          len: matched.length,
          before: (bStart > 0 ? '…' : '') + text.substring(bStart, pos),
          match: matched,
          after: text.substring(pos + matched.length, aEnd) + (aEnd < text.length ? '…' : ''),
          chTitle: ch.title || '(무제)',
          folderName: folderMap[ch.folderId] || '',
        });
        count++;
        if (count >= maxPerField) break;
      }
    });
  });

  // 화 순서대로 묶기
  const chIdx = {};
  chapters.forEach((c, i) => { chIdx[c.id] = i; });
  GS.results.sort((a, b) => {
    if (chIdx[a.chId] !== chIdx[b.chId]) return chIdx[a.chId] - chIdx[b.chId];
    // field 순서는 이미 FIELDS 순서대로 push 되었으니 안정 정렬로 유지됨
    return a.pos - b.pos;
  });

  gsRenderResults();
}

function gsRenderResults() {
  const container = document.getElementById('gs-results');
  const countEl = document.getElementById('gs-count');
  if (!container) return;

  if (GS.results.length === 0) {
    container.innerHTML = '<div class="gs-empty">일치하는 내용이 없습니다.</div>';
    if (countEl) { countEl.textContent = '0건'; countEl.style.color = 'var(--muted)'; }
    return;
  }

  // 화별 그룹
  const groups = {};
  const order = [];
  GS.results.forEach((r, i) => {
    if (!groups[r.chId]) { groups[r.chId] = { chTitle: r.chTitle, folderName: r.folderName, items: [] }; order.push(r.chId); }
    groups[r.chId].items.push({ ...r, _idx: i });
  });

  const totalCh = order.length;
  const totalHits = GS.results.length;
  if (countEl) {
    countEl.textContent = `${totalHits}건 · ${totalCh}화`;
    countEl.style.color = 'var(--teal)';
  }

  const FIELD_COLOR = {
    content: 'var(--ink)',
    title:   'var(--gold)',
    summary: 'var(--teal)',
    memo:    'var(--rust)',
  };

  const html = order.map(chId => {
    const g = groups[chId];
    const hits = g.items.length;
    return `
      <div class="gs-group">
        <div class="gs-group-header">
          <span class="gs-group-title">${g.folderName ? `<span class="gs-folder">[${esc(g.folderName)}]</span> ` : ''}${esc(g.chTitle)}</span>
          <span class="gs-group-count">${hits}건</span>
        </div>
        <div class="gs-group-body">
          ${g.items.map(it => `
            <div class="gs-hit" onclick="gsJumpTo(${it._idx})">
              <span class="gs-field-tag" style="background:${FIELD_COLOR[it.field]}">${it.fieldLabel}</span>
              <span class="gs-snippet">${esc(it.before)}<mark>${esc(it.match)}</mark>${esc(it.after)}</span>
            </div>
          `).join('')}
        </div>
      </div>`;
  }).join('');

  container.innerHTML = html;
}

function gsJumpTo(idx) {
  const r = GS.results[idx];
  if (!r) return;
  const p = getProject();
  if (!p) return;
  const ch = (p.chapters || []).find(c => c.id === r.chId);
  if (!ch) { toast('해당 화를 찾을 수 없어요.'); return; }

  closeGlobalSearch();

  // 화 탭이 아니면 이동
  const needNavigate = state.activeTab !== 'chapters';
  activeChapterId = r.chId;
  if (needNavigate) {
    navigate('chapters');
  } else {
    renderChapters();
  }

  // 렌더 후 포커스 & 위치 설정
  setTimeout(() => {
    const pos = r.pos;
    const len = r.len;

    if (r.field === 'content') {
      const ta = document.getElementById('prose-editor');
      if (ta) {
        ta.focus();
        try { ta.setSelectionRange(pos, pos + len); } catch(e) {}
        // 해당 위치로 스크롤
        const lineHeight = parseInt(getComputedStyle(ta).lineHeight) || 24;
        const lines = (ta.value || '').substring(0, pos).split('\n').length;
        ta.scrollTop = Math.max(0, (lines - 3) * lineHeight);
      }
    } else if (r.field === 'title') {
      const titleIn = document.getElementById('chapter-title-input');
      if (titleIn) { titleIn.focus(); try { titleIn.setSelectionRange(pos, pos+len); } catch(e) {} titleIn.scrollIntoView({block:'center', behavior:'smooth'}); }
    } else if (r.field === 'summary') {
      const sumIn = document.getElementById('chapter-summary-input');
      if (sumIn) { sumIn.focus(); try { sumIn.setSelectionRange(pos, pos+len); } catch(e) {} sumIn.scrollIntoView({block:'center', behavior:'smooth'}); }
    } else if (r.field === 'memo') {
      // 메모 펼치고 포커스
      const body = document.getElementById('ch-memo-body');
      const arrow = document.getElementById('ch-memo-arrow');
      if (body && body.style.display === 'none') {
        body.style.display = 'block';
        if (arrow) arrow.style.transform = 'rotate(0deg)';
      }
      const memoTa = document.querySelector('#ch-memo-body textarea');
      if (memoTa) {
        memoTa.focus();
        try { memoTa.setSelectionRange(pos, pos+len); } catch(e) {}
        memoTa.scrollIntoView({block:'center', behavior:'smooth'});
      }
    }
  }, needNavigate ? 120 : 60);
}


function showItemModal(id) {
  const p = getProject();
  const it = id ? (p.items||[]).find(x => x.id === id) : null;
  const isEdit = !!it;
  const itData = it || {};
  const chars = p.characters || [];
  const idEsc = esc(id||'');
  showModal(`
    <div class="modal-title">${isEdit ? '아이템 수정' : '아이템 추가'}</div>
    <div class="form-grid">
      <div><label class="label">아이템명 *</label>
        <input id="it-name" value="${esc(itData.name||'')}" placeholder="아이템 이름"></div>
      <div><label class="label">카테고리</label>
        <select id="it-cat">${ITEM_GROUPS.map(g=>`<optgroup label="${g.group}">${g.cats.map(c=>`<option value="${c}" ${itData.cat===c?'selected':''}>${c}</option>`).join('')}</optgroup>`).join('')}</select></div>
      <div><label class="label">희귀도/등급</label>
        <select id="it-rarity">${ITEM_RARITIES.map(r=>`<option value="${r.label}" ${itData.rarity===r.label?'selected':''}>${r.label}</option>`).join('')}</select></div>
      <div class="full"><label class="label">설명</label>
        <textarea id="it-desc" rows="3" placeholder="아이템의 외형, 효과, 특징 등">${esc(itData.desc||'')}</textarea></div>
      <div class="full"><label class="label">관련 인물</label>
        ${chars.length === 0
          ? `<input id="it-chars" value="${esc(itData.chars||'')}" placeholder="예: 영희, 철수">`
          : `<select id="it-chars-select" multiple
              style="width:100%;padding:6px 8px;border:1.5px solid var(--border);border-radius:8px;
                background:var(--paper);color:var(--ink);font-family:'Noto Sans KR',sans-serif;
                font-size:13px;min-height:80px">
              ${chars.map(c => {
                const selected = (itData.chars||'').split(',').map(s=>s.trim()).includes(c.name);
                return `<option value="${esc(c.name)}" ${selected?'selected':''}>${esc(c.name)}${c.role?` (${esc(c.role)})`:''}</option>`;
              }).join('')}
            </select>
            <div style="font-size:11px;color:var(--muted);margin-top:4px">Ctrl(또는 Cmd)을 누른 채 클릭하면 여러 명 선택할 수 있어요</div>`}
      </div>
      <div><label class="label">등장 챕터/장면</label>
        <input id="it-chapter" value="${esc(itData.chapter||'')}" placeholder="예: 3화, 1부 2장"></div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="closeModal()">취소</button>
      <button class="btn btn-gold" onclick="saveItem('${idEsc}')">저장</button>
    </div>`, false);
  setTimeout(() => document.getElementById('it-name')?.focus(), 100);
}

function saveItem(id) {
  const name = document.getElementById('it-name').value.trim();
  if (!name) { toast('아이템명을 입력해주세요.'); return; }
  const p = getProject();
  if (!p.items) p.items = [];
  const existingIdx = id ? p.items.findIndex(x => x.id === id) : -1;
  const isEdit = existingIdx >= 0;
  const sel = document.getElementById('it-chars-select');
  const charsVal = sel
    ? [...sel.selectedOptions].map(o=>o.value).join(', ')
    : (document.getElementById('it-chars')?.value || '');
  const it = {
    id: isEdit ? p.items[existingIdx].id : uid(),
    name,
    cat: document.getElementById('it-cat').value,
    rarity: document.getElementById('it-rarity').value,
    desc: document.getElementById('it-desc').value,
    chars: charsVal,
    chapter: document.getElementById('it-chapter').value,
  };
  if (isEdit) p.items[existingIdx] = it;
  else p.items.push(it);
  autoSave(); closeModal();
  const splitPanel = document.getElementById('split-panel');
  const inSplitPanel = splitPanel && !splitPanel.classList.contains('hidden');
  const inFocus = document.getElementById('focus-overlay')?.classList.contains('active');
  if ((inSplitPanel || inFocus) && splitTab === 'items') {
    refreshSplitPanel();
  } else if (!inFocus) {
    renderItems();
  }
}

function deleteItem(id) {
  const p = getProject();
  const i = p?.items?.findIndex(x => x.id === id) ?? -1;
  if (i < 0) return;
  confirmDialog('이 아이템을 삭제합니다.', () => {
    p.items.splice(i, 1);
    autoSave(); renderItems(); toast('삭제했어요.');
  });
}



function renderPsyArc() {
  const p = getProject();
  const arcs = p.psyArcs || [];
  // 화 ID → {번호, 제목} 맵
  const chList = (p.chapters || []).filter(c => !c.isFolder);
  const chapterById = new Map();
  chList.forEach((c, i) => chapterById.set(c.id, { num: i + 1, title: c.title }));

  const cols = arcs.map((arc, ai) => {
    const steps = arc.steps || [];
    const charColor = arc.charName ? getCharColor(arc.charName, p) : 'var(--gold)';
    return `
      <div class="arc-col" style="min-width:240px;max-width:240px;border-top:3px solid ${charColor}">
        <div class="arc-col-header" style="flex-direction:column;align-items:flex-start;gap:6px">
          <div style="display:flex;justify-content:space-between;align-items:center;width:100%">
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
              ${arc.charName ? `<span style="background:${charColor};color:${getContrastColor(charColor)};border-radius:20px;padding:3px 12px;font-size:13px;font-weight:700">${esc(arc.charName)}</span>` : ''}
              <span class="arc-col-title">${esc(arc.title)}</span>
            </div>
            <div style="display:flex;gap:2px;flex-shrink:0">
              <button class="btn-icon" onclick="showPsyArcModal(${ai})" style="width:26px;height:26px">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              </button>
              <button onclick="deletePsyArc(${ai})" style="width:26px;height:26px;border-radius:50%;background:rgba(181,69,27,.1);border:none;cursor:pointer;color:var(--rust);font-size:13px;font-weight:700;display:flex;align-items:center;justify-content:center">×</button>
            </div>
          </div>
          ${arc.description ? `<div style="font-size:11px;color:var(--muted);line-height:1.6;font-weight:400">${esc(arc.description)}</div>` : ''}
        </div>

        ${steps.length === 0
          ? `<div style="text-align:center;padding:20px 10px;color:var(--muted);font-size:12px">변화 단계를 추가해보세요</div>`
          : `<div class="psy-step-list" data-ai="${ai}" style="position:relative;padding-left:20px">
              <div style="position:absolute;left:10px;top:0;bottom:0;width:2px;background:linear-gradient(180deg,${charColor},var(--teal2));border-radius:2px;opacity:.5"></div>
              ${steps.map((s, si) => {
                const linkedCh = s.chapterId ? chapterById.get(s.chapterId) : null;
                const chapterLine = linkedCh
                  ? `<div style="font-size:10px;color:var(--gold);margin-bottom:3px;display:flex;align-items:center;gap:4px;flex-wrap:wrap">
                       <span style="cursor:pointer;text-decoration:underline" onclick="event.stopPropagation();gotoChapterFromPsy('${esc(s.chapterId)}')" title="이 화로 이동">🔗 ${linkedCh.num}화 · ${esc(linkedCh.title)}</span>
                     </div>`
                  : (s.trigger ? `<div style="font-size:10px;color:var(--teal);margin-bottom:3px">← ${esc(s.trigger)}</div>` : '');
                const memoLine = (linkedCh && s.trigger)
                  ? `<div style="font-size:10px;color:var(--muted);margin-bottom:3px;font-style:italic">← ${esc(s.trigger)}</div>`
                  : '';
                return `
                <div class="psy-step-row" data-ai="${ai}" data-si="${si}" style="position:relative;margin-bottom:10px">
                  <div style="position:absolute;left:-14px;top:8px;width:10px;height:10px;border-radius:50%;
                    background:${PSY_EMOTION_COLORS[s.emotion]||charColor};
                    border:2px solid var(--paper);z-index:1;box-shadow:0 1px 4px var(--shadow)"></div>
                  <div style="background:var(--white);border:1px solid var(--border);border-radius:9px;padding:9px 11px;cursor:pointer"
                    onclick="showPsyStepModal(${ai},${si})">
                    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:6px">
                      <span class="psy-step-handle" data-ai="${ai}" data-si="${si}"
                        style="color:var(--border);font-size:14px;cursor:grab;flex-shrink:0;touch-action:none;user-select:none;padding:2px 4px 0 0">⠿</span>
                      <div style="min-width:0;flex:1">
                        <div style="display:flex;align-items:center;gap:5px;margin-bottom:3px;flex-wrap:wrap">
                          <span style="font-size:14px">${PSY_EMOTION_ICONS[s.emotion]||'💭'}</span>
                          <span style="font-weight:700;font-size:12px;word-break:break-all">${esc(s.title)}</span>
                        </div>
                        ${chapterLine}
                        ${memoLine}
                        ${s.content ? `<div style="font-size:11px;color:var(--muted);line-height:1.6;white-space:pre-wrap;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden">${esc(s.content)}</div>` : ''}
                      </div>
                      <button onclick="event.stopPropagation();deletePsyStep(${ai},${si})"
                        style="background:none;border:none;cursor:pointer;color:var(--rust);font-size:13px;font-weight:700;flex-shrink:0;padding:0">×</button>
                    </div>
                  </div>
                </div>`;
              }).join('')}
            </div>`}

        <button class="btn btn-outline btn-sm" style="width:100%;justify-content:center;margin-top:6px" onclick="showPsyStepModal(${ai})">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          단계 추가
        </button>
      </div>`;
  }).join('');

  document.getElementById('main').innerHTML = `
    <div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:22px">
        <div>
          <div class="font-display" style="font-size:22px">심리 아크</div>
          <div style="font-size:12px;color:var(--muted);margin-top:4px">인물의 감정선·가치관 변화를 기록하세요</div>
        </div>
        <button class="btn btn-gold" onclick="showPsyArcModal()">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          추가
        </button>
      </div>
      ${arcs.length === 0
        ? `<div class="card empty-state"><div class="emoji">💭</div><p>인물의 심리 변화를 기록해보세요.<br><span style="font-size:12px">사건을 계기로 바뀌는 가치관, 감정선, 내면의 갈등</span></p></div>`
        : `<div class="arc-list psy-arc-list">${cols}</div>`}
    </div>`;
  setTimeout(initPsyDrag, 50);
}
// ═══════════════════════════════════════════════════════════════
// 심리 아크 단계 드래그 앤 드롭
// ═══════════════════════════════════════════════════════════════
let _pDrag = null;

function initPsyDrag() {
  document.querySelectorAll('.psy-step-handle').forEach(h => {
    h.addEventListener('touchstart', psyTouchStart, {passive: false});
    h.addEventListener('mousedown', psyMouseStart);
  });
}
function psyTouchStart(e) {
  e.preventDefault();
  psyDragInit(e.currentTarget, e.touches[0].clientY);
  document.addEventListener('touchmove', psyTouchMove, {passive: false});
  document.addEventListener('touchend', psyTouchEnd, {once: true});
}
function psyMouseStart(e) {
  psyDragInit(e.currentTarget, e.clientY);
  document.addEventListener('mousemove', psyMouseMove);
  document.addEventListener('mouseup', psyMouseEnd, {once: true});
}
function psyDragInit(handle, clientY) {
  const ai = +handle.dataset.ai;
  const si = +handle.dataset.si;
  const row = handle.closest('.psy-step-row');
  const listEl = row.parentElement;
  const rect = row.getBoundingClientRect();
  const title = row.querySelector('span[style*="font-weight:700"]')?.textContent || '';
  const ghost = document.createElement('div');
  ghost.style.cssText = `position:fixed;left:${rect.left}px;top:${rect.top}px;
    width:${rect.width}px;z-index:9999;pointer-events:none;
    box-shadow:0 4px 16px rgba(0,0,0,.2);border-radius:9px;
    background:var(--gold-light);border:1.5px solid var(--gold);
    padding:8px 11px;font-size:12px;font-weight:700;color:var(--ink)`;
  ghost.textContent = title;
  document.body.appendChild(ghost);
  row.style.opacity = '0.3';
  _pDrag = { ai, si, el: row, ghost, offsetY: clientY - rect.top, listEl };
}
function psyTouchMove(e) { e.preventDefault(); if (_pDrag) psyDragMove(e.touches[0].clientY); }
function psyMouseMove(e) { if (_pDrag) psyDragMove(e.clientY); }
function psyDragMove(clientY) {
  const { ghost, listEl, offsetY } = _pDrag;
  const listRect = listEl.getBoundingClientRect();
  ghost.style.top = Math.max(listRect.top, Math.min(clientY - offsetY, listRect.bottom - ghost.offsetHeight)) + 'px';
  const rows = [...listEl.querySelectorAll('.psy-step-row')];
  rows.forEach(r => r.style.borderTop = '');
  let targetIdx = rows.length;
  for (let i = 0; i < rows.length; i++) {
    const rRect = rows[i].getBoundingClientRect();
    if (clientY < rRect.top + rRect.height / 2) {
      targetIdx = i;
      if (rows[i] !== _pDrag.el) rows[i].style.borderTop = '2px solid var(--gold)';
      break;
    }
  }
  _pDrag.targetIdx = targetIdx;
}
function psyTouchEnd() { document.removeEventListener('touchmove', psyTouchMove); psyDragCommit(); }
function psyMouseEnd() { document.removeEventListener('mousemove', psyMouseMove); psyDragCommit(); }
function psyDragCommit() {
  if (!_pDrag) return;
  const { ai, si, el, ghost, listEl, targetIdx } = _pDrag;
  _pDrag = null;
  ghost.remove();
  el.style.opacity = '';
  listEl.querySelectorAll('.psy-step-row').forEach(r => r.style.borderTop = '');
  if (targetIdx !== undefined && targetIdx !== si && targetIdx !== si + 1) {
    const steps = getProject().psyArcs[ai].steps;
    const item = steps.splice(si, 1)[0];
    steps.splice(targetIdx > si ? targetIdx - 1 : targetIdx, 0, item);
    autoSave();
  }
  renderPsyArc();
  setTimeout(initPsyDrag, 50);
}

const PSY_EMOTION_ICONS = {
  '희망':'🌱','결의':'⚔️','갈등':'🌀','절망':'🌑','분노':'🔥',
  '슬픔':'💧','공포':'😱','각성':'⚡','성장':'🌟','변화':'🦋','기타':'💭'
};
const PSY_EMOTION_COLORS = {
  '희망':'#4aabb0','결의':'#c4922a','갈등':'#7986cb','절망':'#546e7a',
  '분노':'#e06040','슬픔':'#5c8db8','공포':'#7b5ea7','각성':'#f5a623',
  '성장':'#4caf50','변화':'#ab47bc','기타':'#9a8e7f'
};

function getCharColor(name, p) {
  const c = (p.characters||[]).find(x => x.name === name);
  return c?.color || 'var(--teal)';
}

// 배경색에 따라 흰색/검정 텍스트 자동 선택
function getContrastColor(hex) {
  if (!hex || hex.startsWith('var(')) return '#fff';
  const r = parseInt(hex.slice(1,3),16);
  const g = parseInt(hex.slice(3,5),16);
  const b = parseInt(hex.slice(5,7),16);
  // 밝기 계산 (YIQ)
  return (r*299 + g*587 + b*114) / 1000 >= 140 ? '#1a1208' : '#fff';
}

function showPsyArcModal(idx) {
  const p = getProject();
  const arc = idx !== undefined ? (p.psyArcs||[])[idx] : {};
  const chars = p.characters || [];
  showModal(`
    <div class="modal-title">${idx !== undefined ? '심리 아크 수정' : '심리 아크 추가'}</div>
    <div style="margin-bottom:12px">
      <label class="label">인물</label>
      <select id="pa-char">
        <option value="">인물 선택 (선택)</option>
        ${chars.map(c => `<option value="${esc(c.name)}" ${arc.charName===c.name?'selected':''}>${esc(c.name)}</option>`).join('')}
      </select>
    </div>
    <div style="margin-bottom:12px"><label class="label">아크 제목 *</label><input id="pa-title" value="${esc(arc.title||'')}" placeholder="예: 복수에서 용서로, 냉소주의자의 각성"></div>
    <div style="margin-bottom:20px"><label class="label">설명</label><textarea id="pa-desc" rows="3" placeholder="이 인물의 심리 변화 방향을 간략히 설명하세요">${esc(arc.description||'')}</textarea></div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="closeModal()">취소</button>
      <button class="btn btn-gold" onclick="savePsyArc(${idx})">저장</button>
    </div>`, false);
  setTimeout(() => document.getElementById('pa-title')?.focus(), 100);
}

function savePsyArc(idx) {
  const title = document.getElementById('pa-title').value.trim();
  if (!title) { toast('제목을 입력해주세요.'); return; }
  const p = getProject();
  if (!p.psyArcs) p.psyArcs = [];
  const arc = {
    id: idx !== undefined ? p.psyArcs[idx].id : uid(),
    title,
    charName: document.getElementById('pa-char').value,
    description: document.getElementById('pa-desc').value,
    steps: idx !== undefined ? p.psyArcs[idx].steps : [],
  };
  if (idx !== undefined) p.psyArcs[idx] = arc;
  else p.psyArcs.push(arc);
  autoSave(); closeModal(); renderPsyArc();
}

function deletePsyArc(idx) {
  confirmDialog('이 심리 아크를 삭제합니다.', () => {
    getProject().psyArcs.splice(idx, 1);
    autoSave(); renderPsyArc(); toast('삭제했어요.');
  });
}

function showPsyStepModal(ai, si) {
  const p = getProject();
  const s = si !== undefined ? (p.psyArcs[ai].steps||[])[si] : {};
  const emotionOpts = Object.keys(PSY_EMOTION_ICONS).map(e =>
    `<option value="${e}" ${s.emotion===e?'selected':''}>${PSY_EMOTION_ICONS[e]} ${e}</option>`).join('');
  const chapters = (p.chapters || []).filter(c => !c.isFolder);
  const chapterOpts = chapters.map((c, i) => {
    const num = i + 1;
    return `<option value="${c.id}" ${s.chapterId===c.id?'selected':''}>${num}화 · ${esc(c.title)}</option>`;
  }).join('');
  showModal(`
    <div class="modal-title">${si !== undefined ? '단계 수정' : '변화 단계 추가'}</div>
    <div style="margin-bottom:12px"><label class="label">단계 제목 *</label><input id="ps-title" value="${esc(s.title||'')}" placeholder="예: 배신으로 인한 분노, 진실을 깨닫다"></div>
    <div style="margin-bottom:12px"><label class="label">감정/상태</label><select id="ps-emotion">${emotionOpts}</select></div>
    <div style="margin-bottom:12px">
      <label class="label">연결된 화 <span style="font-size:10px;color:var(--gold)">🔗 자동 동기화</span></label>
      <select id="ps-chapter" style="width:100%">
        <option value="">— 연결 안 함 —</option>
        ${chapterOpts}
      </select>
      ${chapters.length === 0 ? '<div style="font-size:11px;color:var(--muted);margin-top:4px">아직 작성된 화가 없습니다.</div>' : ''}
    </div>
    <div style="margin-bottom:12px"><label class="label">계기 (보조 메모)</label><input id="ps-trigger" value="${esc(s.trigger||'')}" placeholder="예: 스승의 죽음 — 화와 별개로 자유롭게 적어도 됩니다"></div>
    <div style="margin-bottom:20px"><label class="label">내면 묘사</label><textarea id="ps-content" rows="4" placeholder="이 시점 인물의 생각, 가치관, 감정을 자세히 기록하세요">${esc(s.content||'')}</textarea></div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="closeModal()">취소</button>
      <button class="btn btn-gold" onclick="savePsyStep(${ai},${si})">저장</button>
    </div>`, false);
  setTimeout(() => document.getElementById('ps-title')?.focus(), 100);
}

function savePsyStep(ai, si) {
  const title = document.getElementById('ps-title').value.trim();
  if (!title) { toast('제목을 입력해주세요.'); return; }
  const p = getProject();
  if (!p.psyArcs[ai].steps) p.psyArcs[ai].steps = [];
  const step = {
    id: si !== undefined ? p.psyArcs[ai].steps[si].id : uid(),
    title,
    emotion: document.getElementById('ps-emotion').value,
    chapterId: document.getElementById('ps-chapter')?.value || '',
    trigger: document.getElementById('ps-trigger').value,
    content: document.getElementById('ps-content').value,
  };
  if (si !== undefined) p.psyArcs[ai].steps[si] = step;
  else p.psyArcs[ai].steps.push(step);
  autoSave(); closeModal(); renderPsyArc();
}

function deletePsyStep(ai, si) {
  getProject().psyArcs[ai].steps.splice(si, 1);
  autoSave(); renderPsyArc();
}

/** 심리 단계 카드의 화 링크 클릭 → 집필 편집기로 이동 + 해당 화 활성화 */
function gotoChapterFromPsy(chapterId) {
  if (!chapterId) return;
  const p = getProject();
  const ch = (p.chapters || []).find(c => c.id === chapterId);
  if (!ch) { toast('연결된 화를 찾을 수 없어요.'); return; }
  activeChapterId = chapterId;
  if (typeof navigate === 'function') navigate('chapters');
  else if (typeof renderChapters === 'function') renderChapters();
}

/** 플롯 장면 카드의 화 링크 클릭 → 집필 편집기로 이동 */
function gotoChapterFromScene(chapterId) {
  gotoChapterFromPsy(chapterId);
}

function renderFamily() {
  const p = getProject();
  const families = p.families || [];

  function renderFamilyCard(f, fi, isChild) {
    const collapsed = familyCollapsed['f'+fi];
    const totalMembers = Object.values(f.groups||{}).reduce((a,g)=>a+(g||[]).length,0);
    const roots = families.filter(x=>!x.parentName);
    const rootIdx = roots.indexOf(f);
    const isFirst = isChild ? false : rootIdx === 0;
    const isLast = isChild ? false : rootIdx === roots.length - 1;
    return `
      <div style="margin-bottom:${isChild?'6':'12'}px;
        margin-left:${isChild?'24':'0'}px;
        border-left:${isChild?'3':'4'}px solid ${f.color||'var(--gold)'};
        border-radius:10px;background:var(--paper);overflow:hidden;
        ${isChild?'box-shadow:none;border-top:1px solid var(--border);border-right:1px solid var(--border);border-bottom:1px solid var(--border)':'box-shadow:0 1px 4px var(--shadow)'}">
        ${isChild?`<div style="padding:4px 12px;background:${f.color||'var(--gold)'};opacity:0.15;height:3px"></div>`:''}
        <div style="display:flex;justify-content:space-between;align-items:center;
          padding:${isChild?'8':'10'}px 14px;cursor:pointer;
          ${isChild?`background:${f.color||'#c4922a'}18`:''}"
          onclick="toggleFamilyCard(${fi})">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
            ${isChild?`<span style="font-size:12px;color:${f.color||'var(--gold)'};font-weight:700">└</span>`:''}
            <span style="font-size:11px;color:var(--muted);transition:transform .2s;display:inline-block;transform:rotate(${collapsed?'-90':'0'}deg)">▾</span>
            <span class="font-display" style="font-size:${isChild?'15':'17'}px">${esc(f.name)}</span>
            <span class="tag" style="background:var(--teal-light);color:var(--teal);border-color:var(--teal)">${({'family':'가문','guild':'길드','knight':'기사단','crime_f':'범죄조직','religion':'종교','academic':'학술','politics':'정치','corp':'기업','school':'학교','crime_m':'범죄조직','media':'미디어','military':'군사','politics_m':'정치','korean':'한국풍','chinese':'중국풍','japanese':'일본풍','other':'기타'}[f.groupType||'family']||'가문')}</span>
            ${f.rank?`<span class="tag">${esc(f.rank)}</span>`:''}
            ${totalMembers>0?`<span style="font-size:11px;color:var(--muted)">${totalMembers}명</span>`:''}
          </div>
          <div style="display:flex;gap:4px;align-items:center" onclick="event.stopPropagation()">
            ${!isChild?`
            <button onclick="moveFamilyCard(${fi},-1)"
              style="background:none;border:none;cursor:pointer;color:var(--muted);font-size:12px;padding:4px;opacity:${isFirst?'.2':'1'};pointer-events:${isFirst?'none':'auto'}">▲</button>
            <button onclick="moveFamilyCard(${fi},1)"
              style="background:none;border:none;cursor:pointer;color:var(--muted);font-size:12px;padding:4px;opacity:${isLast?'.2':'1'};pointer-events:${isLast?'none':'auto'}">▼</button>`:''}
            <button class="btn-icon" onclick="showFamilyModal(${fi})">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            <button onclick="deleteFamily(${fi})" style="width:28px;height:28px;border-radius:50%;background:rgba(181,69,27,.1);border:none;cursor:pointer;color:var(--rust);font-size:14px;font-weight:700;display:flex;align-items:center;justify-content:center">×</button>
          </div>
        </div>
        ${collapsed ? '' : `
        <div style="padding:0 14px 12px">
          ${f.description?`<div style="font-size:13px;color:var(--muted);margin-bottom:10px;line-height:1.7">${esc(f.description)}</div>`:''}
          <div style="border-top:1px solid var(--border);padding-top:10px;margin-top:4px">
            ${renderFamilyTabs(f, fi)}
          </div>
        </div>`}
      </div>`;
  }

  const roots = families.filter(f => !f.parentName);
  let familyCards = families.length === 0
    ? `<div class="card empty-state"><div class="emoji">🏰</div><p>가문 및 집단을 추가해보세요.</p></div>`
    : roots.map(f => {
        const fi = families.indexOf(f);
        const children = families.filter(cf => cf.parentName === f.name);
        const collapsed = familyCollapsed['f'+fi];
        let html = renderFamilyCard(f, fi, false);
        if (children.length > 0 && !collapsed) {
          html += `<div style="margin-bottom:12px">
            ${children.map(cf => renderFamilyCard(cf, families.indexOf(cf), true)).join('')}
          </div>`;
        }
        return html;
      }).join('');

  document.getElementById('main').innerHTML = `
    <div style="max-width:780px;margin:0 auto">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:22px">
        <h2 class="font-display" style="font-size:22px">가문 및 집단 (${families.length})</h2>
        <button class="btn btn-gold" onclick="showFamilyModal()">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          추가
        </button>
      </div>
      ${familyCards}
    </div>`;
  updateBadges();
  setTimeout(initMemberDrag, 100);
}


function showFamilyModal(idx) {
  const p = getProject();
  const f = idx !== undefined ? (p.families||[])[idx] : {};
  const FAMILY_COLORS = ['#c4922a','#e53935','#1e88e5','#43a047','#8e24aa','#546e7a','#e64a19','#00897b'];
  const FM_TYPES_MODAL = [
    {id:'family', label:'가문', subs:['직계','방계','사용인','동맹 가문','외척']},
    {id:'guild', label:'길드 (판타지)', subs:['마법사 길드','전사 길드','도적 길드','상인 길드','탐험가 길드','제작자 길드','연금술사 길드']},
    {id:'knight', label:'기사단/군사 (판타지)', subs:['근위대','원정대','용병단','반란군','저항군','혁명군','정규군','성기사단']},
    {id:'crime_f', label:'범죄조직 (판타지)', subs:['마피아','도적단','암살단','밀수단','지하조직','비밀결사','사기단']},
    {id:'religion', label:'종교/신앙', subs:['교단','신전','이단','수도회','예언자 집단','사교단','성직자회']},
    {id:'academic', label:'학계/연구 (판타지)', subs:['마법학회','연구소','학파','현자 집단','탐구회','마도연구원']},
    {id:'politics', label:'정치/파벌 (판타지)', subs:['왕당파','귀족파벌','혁명파','의회파','황실','원로원','추밀원']},
    {id:'corp', label:'기업/조직 (현대)', subs:['대기업','중소기업','스타트업','NGO','정부기관','공기업','재단','로펌']},
    {id:'school', label:'학교/연구 (현대)', subs:['초중고등학교','대학교','대학원','연구소','싱크탱크','학원','연구팀']},
    {id:'crime_m', label:'범죄조직 (현대)', subs:['갱단','카르텔','마약조직','해커 집단','테러 조직','조폭','사이비 종교','사기 집단']},
    {id:'media', label:'미디어/문화 (현대)', subs:['방송국','언론사','연예기획사','스포츠팀','광고회사','출판사','영화사']},
    {id:'military', label:'군사/경찰 (현대)', subs:['군대','특수부대','경찰서','정보기관','용병 회사','민간군사기업','자경단']},
    {id:'politics_m', label:'정치/파벌 (현대)', subs:['정당','시민단체','압력단체','로비단체','지하운동','혁명조직','의회파벌']},
    {id:'korean', label:'한국풍', subs:['왕실/내명부','의금부/포도청','삼사(사헌부·사간원·홍문관)','훈련도감/어영청','금군/별기군','화랑도','의병단','보부상/객주','향약계/두레','동학교단','불사(절)','무속 집단','권번(기생조합)','의녀 집단','역관 집단','서얼 집단']},
    {id:'chinese', label:'중국풍 (무협)', subs:['정파 문파','사파 문파','마교','검문','도문','권파','황실/조정','내각/어사대','금위군','환관 집단','표국','상회','비밀결사','도방','불문','도관','강호','녹림/흑도']},
    {id:'japanese', label:'일본풍', subs:['막부/쇼군','다이묘 가문','사무라이 집단','닌자 조직','로닌 집단','상인 길드(자','신사/불교 집단','무사도 집단','이세력/반막부','마을 자경단','기녀(게이샤) 집단','학자 집단(난학)']},
    {id:'other', label:'기타', subs:['동호회','동아리','모험가 파티','용사 일행','온라인 커뮤니티','비공개 모임','기타 집단']},
  ];
  const curType = f.groupType || 'family';
  const curSub = f.groupSub || '';
  const curTypeSubs = (FM_TYPES_MODAL.find(t=>t.id===curType)||FM_TYPES_MODAL[0]).subs;
  showModal(`
    <div class="modal-title">${idx!==undefined?'가문 및 집단 수정':'가문 및 집단 추가'}</div>
    <div style="margin-bottom:12px"><label class="label">이름 *</label>
      <input id="fm-name" value="${esc(f.name||'')}" placeholder="예: 아르켄 가문, 용사 파티, 상인 길드"></div>
    <div style="margin-bottom:12px">
      <label class="label">유형</label>
      <select id="fm-type" onchange="updateFmSubs(this.value,'')" style="width:100%;margin-bottom:6px">
        ${FM_TYPES_MODAL.map(t=>`<option value="${t.id}" ${curType===t.id?'selected':''}>${t.label}</option>`).join('')}
      </select>
      <select id="fm-sub" style="width:100%">
        ${curTypeSubs.map(s=>`<option value="${s}" ${curSub===s?'selected':''}>${s}</option>`).join('')}
      </select>
    </div>
    <div style="margin-bottom:12px"><label class="label">상위 가문/집단 (선택)</label>
      <select id="fm-parent">
        <option value="">없음 (독립)</option>
        ${(p.families||[]).filter((pf,i) => i !== idx && pf.name !== f.name).map(pf=>`<option value="${esc(pf.name)}" ${(f.parentName===pf.name)?'selected':''}>${esc(pf.name)}</option>`).join('')}
      </select></div>
    <div style="margin-bottom:12px"><label class="label">등급/직위</label>
      <input id="fm-rank" value="${esc(f.rank||'')}" placeholder="예: 공작가, 1등급, 최상위"></div>
    <div style="margin-bottom:14px"><label class="label">설명</label>
      <textarea id="fm-desc" rows="3" placeholder="역사, 특징, 가훈, 목표 등">${esc(f.description||'')}</textarea></div>
    <div style="margin-bottom:20px">
      <label class="label">색상</label>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px" id="fm-color-group">
        ${FAMILY_COLORS.map((c,i)=>`
          <button type="button" onclick="selectEdgeOpt('fm-color-group',this,'${c}')"
            data-val="${c}" ${(f.color||FAMILY_COLORS[0])===c?'data-selected="1"':''}
            style="width:32px;height:32px;border-radius:50%;background:${c};cursor:pointer;
              border:3px solid ${(f.color||FAMILY_COLORS[0])===c?'var(--ink)':'transparent'};
              transition:all .15s"></button>`).join('')}
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="closeModal()">취소</button>
      <button class="btn btn-gold" onclick="saveFamily(${idx})">저장</button>
    </div>`, false);
  setTimeout(()=>document.getElementById('fm-name')?.focus(),100);
}

function saveFamily(idx) {
  const name = document.getElementById('fm-name').value.trim();
  if (!name) { toast('가문 이름을 입력해주세요.'); return; }
  const p = getProject();
  if (!p.families) p.families = [];
  const f = {
    id: idx!==undefined ? p.families[idx].id : uid(),
    name,
    parentName: document.getElementById('fm-parent')?.value || '',
    groupType: document.getElementById('fm-type')?.value || 'family',
    groupSub: document.getElementById('fm-sub')?.value || '',
    rank: document.getElementById('fm-rank').value,
    description: document.getElementById('fm-desc').value,
    color: document.querySelector('#fm-color-group [data-selected]')?.dataset?.val || '#c4922a',
    members: idx!==undefined ? p.families[idx].members||[] : [],
    groups: idx!==undefined ? p.families[idx].groups||{} : {},
  };
  if (idx!==undefined) p.families[idx]=f; else p.families.push(f);
  autoSave(); closeModal();
  refreshSplitPanel();
  // 집필기(chapters) 또는 집중 모드에서 참고란을 통해 추가한 경우 탭 이동 안 함
  const inFocusMode = document.getElementById('focus-overlay')?.classList.contains('active');
  const inChapters = state.activeTab === 'chapters';
  if (!inFocusMode && !inChapters) renderFamily();
  toast(idx!==undefined?'수정했습니다.':'가문을 추가했습니다!');
}

function deleteFamily(idx) {
  confirmDialog('이 가문 및 집단을 삭제합니다.', () => {
    const p = getProject();
    const removedId = p.families[idx]?.id;
    p.families.splice(idx,1);
    // 인물의 familyId 및 가계도의 familyIds 에서 참조 제거
    if (removedId) cleanupFamilyReferences(p, removedId);
    autoSave(); renderFamily();
    toast('가문 및 집단을 삭제했어요.');
  });
}

function showAddMemberModal(fi) {
  const p = getProject();
  const f = p.families[fi];
  const tab = familyActiveTab['f'+fi] || getFamilyTabNames(f)[0];
  const chars = p.characters || [];
  // 이미 이 가문 어딘가에 (charId 로) 등록된 인물은 제외
  const alreadyIn = new Set();
  Object.values(f.groups || {}).forEach(list => {
    if (Array.isArray(list)) list.forEach(m => { if (m && m.charId) alreadyIn.add(m.charId); });
  });
  const availableChars = chars.filter(c => !alreadyIn.has(c.id));
  showModal(`
    <div class="modal-title">${tab} 구성원 추가</div>
    ${availableChars.length > 0 ? `
    <div style="margin-bottom:14px;padding:10px 12px;background:var(--cream);border-radius:8px;border:1px solid var(--border)">
      <div style="font-size:11px;font-weight:700;color:var(--muted);margin-bottom:8px">등장인물에서 불러오기 <span style="color:var(--gold)">🔗</span></div>
      <select onchange="fillMemberFromChar(this)" style="width:100%;font-size:13px">
        <option value="">— 인물 선택 (자동 연결) —</option>
        ${availableChars.map(c => `<option value="${esc(c.id)}">${esc(c.name)}${c.role?` (${esc(c.role)})`:''}</option>`).join('')}
      </select>
      <div style="font-size:10px;color:var(--muted);margin-top:6px">선택한 인물은 등장인물·가계도와 자동으로 연결됩니다.</div>
    </div>` : (chars.length > 0 ? `
    <div style="margin-bottom:14px;padding:8px 12px;background:var(--cream);border-radius:8px;border:1px solid var(--border);font-size:11px;color:var(--muted)">
      모든 등장인물이 이미 이 가문에 등록되어 있습니다.
    </div>` : '')}
    <input type="hidden" id="mb-charid" value="">
    <div class="form-grid">
      <div class="full"><label class="label">이름 *</label>
        <input id="mb-name" placeholder="예: 아르켄 레온하르트"></div>
      <div><label class="label">나이</label>
        <input id="mb-age" placeholder="예: 24" type="number" min="0"></div>
      <div><label class="label">성별</label>
        <select id="mb-gender">
          <option value="">미지정</option>
          <option value="남">남성</option>
          <option value="여">여성</option>
          <option value="기타">기타</option>
        </select></div>
      <div><label class="label">생사 여부</label>
        <select id="mb-alive">
          <option value="생존">생존</option>
          <option value="사망">사망</option>
          <option value="불명">불명</option>
          <option value="불사">불사/불멸</option>
        </select></div>
      <div><label class="label">관계/직위</label>
        <input id="mb-relation" placeholder="예: 가주, 장남, 3세"></div>
      <div class="full"><label class="label">비고</label>
        <input id="mb-note" placeholder="예: 현재 실종, 마법 능력 보유"></div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="closeModal()">취소</button>
      <button class="btn btn-gold" onclick="saveFamilyMember(${fi})">추가</button>
    </div>`, false);
  setTimeout(()=>document.getElementById('mb-name')?.focus(),100);
}

function fillMemberFromChar(sel) {
  const charId = sel.value;
  if (!charId) return;
  const p = getProject();
  const c = (p.characters || []).find(x => x.id === charId);
  if (!c) return;
  const idEl    = document.getElementById('mb-charid');
  const nameEl  = document.getElementById('mb-name');
  const ageEl   = document.getElementById('mb-age');
  const genEl   = document.getElementById('mb-gender');
  const alvEl   = document.getElementById('mb-alive');
  if (idEl)   idEl.value   = c.id;
  if (nameEl) nameEl.value = c.name || '';
  if (ageEl)  ageEl.value  = c.age || '';
  if (genEl) {
    const map = {'남':'남','남성':'남','여':'여','여성':'여','기타':'기타'};
    genEl.value = map[c.gender] || '';
  }
  if (alvEl) {
    const map = {'생존':'생존','사망':'사망','불명':'불명','불사':'불사','불사/불멸':'불사'};
    alvEl.value = map[c.alive] || '생존';
  }
  sel.value = '';
  document.getElementById('mb-relation')?.focus();
}

function showEditMemberModal(fi, mi) {
  const p = getProject();
  const f = p.families[fi];
  const tab = familyActiveTab['f'+fi] || getFamilyTabNames(f)[0];
  const m = (f.groups && f.groups[tab]) ? f.groups[tab][mi] : null;
  if (!m) return;

  const linkedChar = m.charId ? (p.characters || []).find(x => x.id === m.charId) : null;
  // 이 가문에 이미 연결돼 있는 charId 들 (자기 자신은 제외)
  const usedIds = new Set();
  Object.values(f.groups || {}).forEach(list => {
    if (Array.isArray(list)) list.forEach(mm => {
      if (mm && mm.charId && mm !== m) usedIds.add(mm.charId);
    });
  });
  const availableChars = (p.characters || []).filter(c => !usedIds.has(c.id));

  const linkBlock = linkedChar
    ? `<div style="margin-bottom:14px;padding:10px 12px;background:var(--gold-light);border-radius:8px;border:1px solid var(--gold);font-size:12px">
         <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">
           <div>🔗 <b>${esc(linkedChar.name)}</b> (등장인물)와 연결됨</div>
           <div style="display:flex;gap:6px">
             <button class="btn btn-outline btn-sm" onclick="openCharFromMember('${esc(linkedChar.id)}')">인물 편집</button>
             <button class="btn btn-outline btn-sm" onclick="unlinkMemberFromChar(${fi},${mi})" style="color:var(--rust);border-color:var(--rust)">연결 해제</button>
           </div>
         </div>
       </div>`
    : (availableChars.length > 0
      ? `<div style="margin-bottom:14px;padding:10px 12px;background:var(--cream);border-radius:8px;border:1px solid var(--border)">
           <div style="font-size:11px;font-weight:700;color:var(--muted);margin-bottom:6px">등장인물과 연결</div>
           <div style="display:flex;gap:6px">
             <select id="mb-link-sel" style="flex:1;font-size:13px">
               <option value="">— 인물 선택 —</option>
               ${availableChars.map(c => `<option value="${esc(c.id)}">${esc(c.name)}${c.role?` (${esc(c.role)})`:''}</option>`).join('')}
             </select>
             <button class="btn btn-outline btn-sm" onclick="linkMemberToChar(${fi},${mi})">연결</button>
           </div>
         </div>`
      : '');

  showModal(`
    <div class="modal-title">구성원 수정</div>
    ${linkBlock}
    <input type="hidden" id="mb-charid" value="${esc(m.charId||'')}">
    <div class="form-grid">
      <div class="full"><label class="label">이름 *</label>
        <input id="mb-name" value="${esc(m.name||'')}" placeholder="예: 아르켄 레온하르트"></div>
      <div><label class="label">나이</label>
        <input id="mb-age" value="${esc(m.age||'')}" placeholder="예: 24" type="number" min="0"></div>
      <div><label class="label">성별</label>
        <select id="mb-gender">
          <option value="" ${!m.gender?'selected':''}>미지정</option>
          <option value="남" ${ m.gender==='남'?'selected':''}>남성</option>
          <option value="여" ${ m.gender==='여'?'selected':''}>여성</option>
          <option value="기타" ${ m.gender==='기타'?'selected':''}>기타</option>
        </select></div>
      <div><label class="label">생사 여부</label>
        <select id="mb-alive">
          <option value="생존" ${(m.alive||'생존')==='생존'?'selected':''}>생존</option>
          <option value="사망" ${ m.alive==='사망'?'selected':''}>사망</option>
          <option value="불명" ${ m.alive==='불명'?'selected':''}>불명</option>
          <option value="불사" ${ m.alive==='불사'?'selected':''}>불사/불멸</option>
        </select></div>
      <div><label class="label">관계/직위</label>
        <input id="mb-relation" value="${esc(m.relation||'')}" placeholder="예: 가주, 장남, 3세"></div>
      <div class="full"><label class="label">비고</label>
        <input id="mb-note" value="${esc(m.note||'')}" placeholder="예: 현재 실종, 마법 능력 보유"></div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="closeModal()">취소</button>
      <button class="btn btn-gold" onclick="updateFamilyMember(${fi},${mi})">저장</button>
    </div>`, false);
  setTimeout(()=>document.getElementById('mb-name')?.focus(),100);
}

function updateFamilyMember(fi, mi) {
  const name = document.getElementById('mb-name').value.trim();
  if (!name) { toast('이름을 입력해주세요.'); return; }
  const p = getProject();
  const f = p.families[fi];
  const tab = familyActiveTab['f'+fi] || getFamilyTabNames(f)[0];
  if (!f.groups || !f.groups[tab]) return;
  const prev = f.groups[tab][mi] || {};
  const updated = {
    ...prev,
    name,
    age: document.getElementById('mb-age')?.value || '',
    gender: document.getElementById('mb-gender')?.value || '',
    alive: document.getElementById('mb-alive')?.value || '생존',
    relation: document.getElementById('mb-relation').value,
    note: document.getElementById('mb-note').value,
  };
  f.groups[tab][mi] = updated;
  // 등장인물과 연결되어 있으면 기본 정보도 함께 갱신 (관계/직위·비고는 가문 전용이므로 유지)
  if (updated.charId) {
    const c = (p.characters || []).find(x => x.id === updated.charId);
    if (c) {
      c.name   = updated.name;
      c.age    = updated.age;
      c.gender = updated.gender;
      c.alive  = updated.alive;
      // familyId 가 다른 곳을 가리키고 있다면 정정
      if (c.familyId !== f.id) c.familyId = f.id;
    }
  }
  autoSave(); closeModal(); renderFamily();
  toast('수정했습니다.');
}

function saveFamilyMember(fi) {
  const name = document.getElementById('mb-name').value.trim();
  if (!name) { toast('이름을 입력해주세요.'); return; }
  const p = getProject();
  const f = p.families[fi];
  const tab = familyActiveTab['f'+fi] || getFamilyTabNames(f)[0];
  if (!f.groups) f.groups = {};
  if (!f.groups[tab]) f.groups[tab] = [];
  const charId = (document.getElementById('mb-charid')?.value || '').trim();
  f.groups[tab].push({
    charId: charId || '',
    name,
    age: document.getElementById('mb-age')?.value || '',
    gender: document.getElementById('mb-gender')?.value || '',
    alive: document.getElementById('mb-alive')?.value || '생존',
    relation: document.getElementById('mb-relation').value,
    note: document.getElementById('mb-note').value,
  });
  // 등장인물과 연결된 경우, 해당 인물의 familyId 도 동기화
  if (charId) {
    const c = (p.characters || []).find(x => x.id === charId);
    if (c) {
      // 다른 가문에 이미 속해 있었다면 그쪽에서는 charId 멤버 제거
      if (c.familyId && c.familyId !== f.id) {
        const old = (p.families || []).find(x => x.id === c.familyId);
        if (old && old.groups) {
          Object.keys(old.groups).forEach(t => {
            const list = old.groups[t];
            if (Array.isArray(list)) old.groups[t] = list.filter(m => !(m && m.charId === c.id));
          });
        }
      }
      c.familyId = f.id;
    }
  }
  autoSave(); closeModal(); renderFamily();
}

function deleteFamilyMember(fi, mi) {
  const p = getProject();
  const f = p.families[fi];
  const tab = familyActiveTab['f'+fi] || getFamilyTabNames(f)[0];
  if (f.groups && f.groups[tab]) {
    const removed = f.groups[tab][mi];
    f.groups[tab].splice(mi, 1);
    // 연결된 인물이 있다면 그 인물의 familyId 도 비움 (양방향 동기화)
    if (removed && removed.charId) {
      const c = (p.characters || []).find(x => x.id === removed.charId);
      if (c && c.familyId === f.id) c.familyId = '';
    }
  }
  autoSave(); renderFamily();
  toast('구성원을 삭제했어요.');
}

// ═══════════════════════════════════════════════════════════════
