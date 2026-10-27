window.onerror = function(msg, src, line, col, err) {
  alert('🚨 오류\n' + msg + '\n라인: ' + line + ':' + col);
};
window.addEventListener('unhandledrejection', function(e) {
  var msg = e.reason ? (e.reason.stack || String(e.reason)) : String(e);
  // Service Worker 업데이트 / 네트워크 fetch 실패는 무시 (오프라인 시 발생, 저장과 무관)
  if (/ServiceWorker|fetching the script|Failed to fetch|NetworkError|Load failed/i.test(msg)) {
    e.preventDefault();
    return;
  }
  alert('🚨 Promise 오류\n' + msg);
});
