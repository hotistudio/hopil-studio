// INIT
// ═══════════════════════════════════════════════════════════════
loadFromStorage();
migrateAllProjects();
initDarkMode();
initColorTheme();
applyEditorFontSize();
applyReaderStyle();
renderHome();
history.replaceState({screen:'home'}, null);
setTimeout(() => { tryAutoReconnect(); }, 300);

// 뒤로가기 처리
window.addEventListener('popstate', e => {
  const s = e.state;
  if (!s || s.screen === 'home') { goHome(); return; }
  if (s.screen === 'tab') {
    if (s.id && s.id !== state.activeProjectId) {
      // 다른 프로젝트면 그 프로젝트로
      openProject(s.id);
    } else if (s.id && state.activeProjectId) {
      // 같은 프로젝트 내 탭 이동
      navigate(s.tab);
    } else {
      goHome();
    }
  }
});

// PWA Service Worker 등록
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js', { scope: './' })
      .then(reg => {
        reg.addEventListener('updatefound', () => {
          const newSW = reg.installing;
          newSW.addEventListener('statechange', () => {
            if (newSW.state === 'installed') {
              newSW.postMessage({type: 'SKIP_WAITING'});
            }
          });
        });
        setInterval(() => { reg.update().catch(() => {}); }, 60000);
      })
      .catch(e => {});
  });
}

// ═══════════════════════════════════════════════════════════════
// 종료 전 백업 알림
// ═══════════════════════════════════════════════════════════════
const BACKUP_KEY = 'hopil_studio_last_backup';

function getLastBackupTime() {
  return localStorage.getItem(BACKUP_KEY) ? new Date(localStorage.getItem(BACKUP_KEY)) : null;
}
function setLastBackupTime() {
  localStorage.setItem(BACKUP_KEY, new Date().toISOString());
}

// 백업 알림 배너 표시
function showBackupBanner() {
  if (document.getElementById('backup-banner')) return;
  const last = getLastBackupTime();
  const lastText = last
    ? `마지막 백업: ${last.toLocaleDateString('ko-KR')} ${last.toLocaleTimeString('ko-KR', {hour:'2-digit',minute:'2-digit'})}`
    : '아직 백업한 적 없어요';

  const banner = document.createElement('div');
  banner.id = 'backup-banner';
  banner.style.cssText = `
    position:fixed;bottom:0;left:0;right:0;z-index:9000;
    background:#18120a;color:#fff;padding:14px 20px;
    display:flex;align-items:center;gap:14px;flex-wrap:wrap;
    box-shadow:0 -4px 20px rgba(0,0,0,.3);
    animation:slideUpBanner .3s ease;
  `;
  banner.innerHTML = `
    <style>@keyframes slideUpBanner{from{transform:translateY(100%)}to{transform:translateY(0)}}</style>
    <span style="font-size:18px">💾</span>
    <div style="flex:1;min-width:200px">
      <div style="font-weight:700;font-size:14px;margin-bottom:2px">앱을 닫기 전에 백업하시겠어요?</div>
      <div style="font-size:12px;color:rgba(255,255,255,.6)">${lastText}</div>
    </div>
    <button onclick="backupAllAndClose()" style="
      background:var(--gold);color:#fff;border:none;border-radius:8px;
      padding:9px 18px;font-size:13px;font-weight:700;cursor:pointer;
      font-family:'Noto Sans KR',sans-serif;white-space:nowrap;
    ">전체 백업 후 닫기</button>
    <button onclick="exportData();setLastBackupTime();dismissBackupBanner();" style="
      background:rgba(255,255,255,.15);color:#fff;border:none;border-radius:8px;
      padding:9px 18px;font-size:13px;font-weight:600;cursor:pointer;
      font-family:'Noto Sans KR',sans-serif;white-space:nowrap;
    ">현재 작품만 백업</button>
    <button onclick="dismissBackupBanner()" style="
      background:transparent;color:rgba(255,255,255,.5);border:none;
      border-radius:8px;padding:9px 12px;font-size:13px;cursor:pointer;
      font-family:'Noto Sans KR',sans-serif;white-space:nowrap;
    ">나중에</button>
  `;
  document.body.appendChild(banner);
}

function dismissBackupBanner() {
  const b = document.getElementById('backup-banner');
  if (b) b.remove();
}

// 전체 작품 백업 (모든 작품을 하나의 JSON으로)
function backupAllAndClose() {
  const blob = new Blob([JSON.stringify(state.projects, null, 2)], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = '웹소설스튜디오_전체백업_' + new Date().toISOString().slice(0,10) + '.json';
  a.click();
  setLastBackupTime();
  dismissBackupBanner();
  toast('전체 백업 완료! 📁');
}

// exportData도 백업 시간 기록하도록 오버라이드
const _origExport = exportData;
exportData = function() {
  _origExport();
  setLastBackupTime();
};

// beforeunload 제거 (PWA에서 오동작)

// 페이지 숨김(탭 전환, 홈 버튼 등) 감지 → 배너 표시
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    if (state.projects.length === 0) return;
    const last = getLastBackupTime();
    const now = new Date();
    const hoursSince = last ? (now - last) / 1000 / 60 / 60 : 999;
    if (hoursSince > 1) {
      // 다시 돌아왔을 때 배너 표시
      document.addEventListener('visibilitychange', function showOnReturn() {
        if (document.visibilityState === 'visible') {
          showBackupBanner();
          document.removeEventListener('visibilitychange', showOnReturn);
        }
      });
    }
  }
});
