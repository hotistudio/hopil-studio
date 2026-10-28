(function DataSafetyPatch() {
  'use strict';

  // ─── IndexedDB 래퍼 (FileHandle · 스냅샷 저장용) ─────────────────
  const DB_NAME = 'hopil_studio_safety';
  const DB_VER  = 1;
  const STORE_HANDLES   = 'handles';
  const STORE_SNAPSHOTS = 'snapshots';

  let _dbPromise = null;
  function openDB() {
    if (_dbPromise) return _dbPromise;
    _dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VER);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_HANDLES)) {
          db.createObjectStore(STORE_HANDLES);
        }
        if (!db.objectStoreNames.contains(STORE_SNAPSHOTS)) {
          db.createObjectStore(STORE_SNAPSHOTS, { keyPath: 'ts' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror   = () => reject(req.error);
    });
    return _dbPromise;
  }

  async function idbPut(store, key, val) {
    const db = await openDB();
    return new Promise((res, rej) => {
      const tx = db.transaction(store, 'readwrite');
      const s  = tx.objectStore(store);
      const r  = (store === STORE_SNAPSHOTS) ? s.put(val) : s.put(val, key);
      r.onsuccess = () => res();
      r.onerror   = () => rej(r.error);
    });
  }

  async function idbGet(store, key) {
    const db = await openDB();
    return new Promise((res, rej) => {
      const tx = db.transaction(store, 'readonly');
      const r  = tx.objectStore(store).get(key);
      r.onsuccess = () => res(r.result);
      r.onerror   = () => rej(r.error);
    });
  }

  async function idbGetAll(store) {
    const db = await openDB();
    return new Promise((res, rej) => {
      const tx = db.transaction(store, 'readonly');
      const r  = tx.objectStore(store).getAll();
      r.onsuccess = () => res(r.result || []);
      r.onerror   = () => rej(r.error);
    });
  }

  async function idbDelete(store, key) {
    const db = await openDB();
    return new Promise((res, rej) => {
      const tx = db.transaction(store, 'readwrite');
      const r  = tx.objectStore(store).delete(key);
      r.onsuccess = () => res();
      r.onerror   = () => rej(r.error);
    });
  }

  // ─── FileHandle persist ─────────────────────────────────────────
  const _origExportCurrent = window.exportCurrentProject;
  window.exportCurrentProject = async function () {
    const pid = state.activeProjectId;
    const before = pid ? fileHandles.projects[pid] : null;
    await _origExportCurrent.apply(this, arguments);
    const after = pid ? fileHandles.projects[pid] : null;
    if (after && after !== before) {
      try { await idbPut(STORE_HANDLES, pid, after); } catch(e) {}
    }
  };

  const _origExportSingle = window.exportSingleProject;
  window.exportSingleProject = async function (pid) {
    const before = fileHandles.projects[pid];
    await _origExportSingle.apply(this, arguments);
    const after = fileHandles.projects[pid];
    if (after && after !== before) {
      try { await idbPut(STORE_HANDLES, pid, after); } catch(e) {}
    }
  };

  const _origDisconnectProj = window.disconnectProjectFile;
  window.disconnectProjectFile = function (pid) {
    _origDisconnectProj.apply(this, arguments);
    idbDelete(STORE_HANDLES, pid).catch(() => {});
  };

  const _origDisconnectAll = window.disconnectAllFile;
  window.disconnectAllFile = function () {
    _origDisconnectAll.apply(this, arguments);
    idbDelete(STORE_HANDLES, 'all').catch(() => {});
  };

  // ─── tryAutoReconnect 실제 구현 ─────────────────────────────────
  window.tryAutoReconnect = async function () {
    try {
      const db = await openDB();
      const tx = db.transaction(STORE_HANDLES, 'readonly');
      const s  = tx.objectStore(STORE_HANDLES);
      const keysReq = s.getAllKeys();
      const valsReq = s.getAll();
      const [keys, vals] = await Promise.all([
        new Promise(r => keysReq.onsuccess = () => r(keysReq.result)),
        new Promise(r => valsReq.onsuccess = () => r(valsReq.result)),
      ]);

      let restored = 0;
      for (let i = 0; i < keys.length; i++) {
        const key    = keys[i];
        const handle = vals[i];
        if (!handle || typeof handle.queryPermission !== 'function') continue;

        const perm = await handle.queryPermission({ mode: 'readwrite' });
        if (perm === 'granted' || perm === 'prompt') {
          if (key === 'all') fileHandles.all = handle;
          else               fileHandles.projects[key] = handle;
          if (perm === 'granted') restored++;
        } else {
          await idbDelete(STORE_HANDLES, key);
        }
      }
      if (restored > 0) {
        updateFileStatus();
      }
    } catch (e) {
    }
  };

  const _origSaveToStorage = window.saveToStorage;
  window.saveToStorage = function () {
    _origSaveToStorage.apply(this, arguments);
    ensureHandlePermissions().catch(() => {});
  };

  async function ensureHandlePermissions() {
    const handles = [];
    if (fileHandles.all) handles.push(['all', fileHandles.all]);
    for (const pid in fileHandles.projects) {
      handles.push([pid, fileHandles.projects[pid]]);
    }
    for (const [key, h] of handles) {
      if (typeof h.queryPermission !== 'function') continue;
      const perm = await h.queryPermission({ mode: 'readwrite' });
      if (perm === 'denied') {
        if (key === 'all') fileHandles.all = null;
        else               delete fileHandles.projects[key];
        await idbDelete(STORE_HANDLES, key);
        updateFileStatus();
      }
    }
  }

  // ─── pagehide/visibilitychange 시 pending save flush ────────────
  function flushPendingSaves() {
    if (window._saveTimer) {
      clearTimeout(window._saveTimer);
      window._saveTimer = null;
      try { autoSave(); } catch(e) {}
    }
    if (window._memoSaveTimer) {
      clearTimeout(window._memoSaveTimer);
      window._memoSaveTimer = null;
      try { if (typeof saveMemos === 'function') saveMemos(); } catch(e) {}
    }
  }

  window.addEventListener('pagehide', flushPendingSaves);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushPendingSaves();
  });

  // ─── 자동 스냅샷 ────────────────────────────────────────────────
  const SNAPSHOT_INTERVAL_MS = 15 * 60 * 1000;
  const SNAPSHOT_KEEP = 20;

  async function takeSnapshot(reason) {
    try {
      if (!state.projects || state.projects.length === 0) return;
      const snap = {
        ts: Date.now(),
        reason: reason || 'auto',
        projects: state.projects,
      };
      await idbPut(STORE_SNAPSHOTS, null, snap);
      const all = await idbGetAll(STORE_SNAPSHOTS);
      all.sort((a, b) => b.ts - a.ts);
      const old = all.slice(SNAPSHOT_KEEP);
      for (const s of old) await idbDelete(STORE_SNAPSHOTS, s.ts);
    } catch(e) {
    }
  }

  setTimeout(() => takeSnapshot('initial'), 5000);
  setInterval(() => takeSnapshot('interval'), SNAPSHOT_INTERVAL_MS);
  window.addEventListener('pagehide', () => takeSnapshot('pagehide'));

  window.listSnapshots = async function () {
    const all = await idbGetAll(STORE_SNAPSHOTS);
    return all
      .sort((a, b) => b.ts - a.ts)
      .map(s => ({
        ts: s.ts,
        when: new Date(s.ts).toLocaleString('ko-KR'),
        reason: s.reason,
        projectCount: (s.projects || []).length,
      }));
  };

  window.restoreSnapshot = async function (ts) {
    const snap = await idbGet(STORE_SNAPSHOTS, ts);
    if (!snap) { alert('해당 스냅샷을 찾을 수 없어요.'); return; }
    if (!confirm(new Date(ts).toLocaleString('ko-KR') + ' 시점으로 되돌립니다.\n현재 데이터는 별도 스냅샷으로 보관됩니다.')) return;
    await takeSnapshot('before-restore');
    state.projects = snap.projects;
    saveToStorage();
    location.reload();
  };

  // ─── 저장 상태 인디케이터 ───────────────────────────────────────
  let _lastSaveAt = null;

  const _origAutoSave = window.autoSave;
  window.autoSave = function () {
    _origAutoSave.apply(this, arguments);
    _lastSaveAt = Date.now();
    renderSaveIndicator();
  };

  function formatSaveAgo(ms) {
    if (ms < 3000)    return '방금 전';
    if (ms < 60000)   return Math.floor(ms / 1000) + '초 전';
    if (ms < 3600000) return Math.floor(ms / 60000) + '분 전';
    return Math.floor(ms / 3600000) + '시간 전';
  }

  function renderSaveIndicator() {
    let el = document.getElementById('save-indicator');
    if (!el) {
      const host = document.getElementById('file-status');
      if (!host) return;
      el = document.createElement('span');
      el.id = 'save-indicator';
      el.style.cssText = 'font-size:11px;color:var(--teal2);margin-right:6px;white-space:nowrap';
      host.parentNode.insertBefore(el, host);
    }
    if (_lastSaveAt == null) { el.textContent = ''; return; }
    const ago = Date.now() - _lastSaveAt;
    el.innerHTML = '<span style="opacity:.7">저장됨 · ' + formatSaveAgo(ago) + '</span>';
  }

  setInterval(renderSaveIndicator, 30 * 1000);

  // ─── 제목/상태 등 onchange → 실시간 저장 보강 ───────────────────
  document.addEventListener('input', (e) => {
    const t = e.target;
    if (!(t instanceof HTMLInputElement) && !(t instanceof HTMLTextAreaElement)) return;
    const oc = t.getAttribute('onchange');
    if (!oc) return;
    if (!/update(Chapter|Project|Char|World|Arc|Scene|Item|Glossary|Family|Foreshadow|Chronicle|PsyArc)/.test(oc)) return;
    clearTimeout(t._safetyTimer);
    t._safetyTimer = setTimeout(() => {
      try { new Function('event', oc).call(t, e); } catch(err) {}
    }, 500);
  }, true);

  setTimeout(renderSaveIndicator, 100);
})();
