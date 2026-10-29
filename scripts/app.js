// ═══════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════
const STORAGE_KEY = 'hopil_studio_projects_v1';
let storageLoadFailed = false;
let state = {
  projects: [],
  activeProjectId: null,
  activeTab: 'home',
};

function getProject() {
  return state.projects.find(p => p.id === state.activeProjectId);
}

// ═══════════════════════════════════════════════════════════════
// FILE SYSTEM ACCESS API - 파일 핸들 관리
// ═══════════════════════════════════════════════════════════════
const fileHandles = {
  all: null,       // 전체 백업 파일 핸들
  projects: {},    // 작품별 파일 핸들 { [projectId]: FileSystemFileHandle }
};

const FS_SUPPORTED = ('showSaveFilePicker' in window);
const fileWriteQueues = new WeakMap();

function writeToFileHandle(handle, data) {
  // 같은 파일에 대한 쓰기는 호출 순서대로 끝낸다. 이전 저장이 늦게
  // 완료되어 최신 원고를 덮어쓰는 일을 막기 위해 데이터도 미리 고정한다.
  const snapshot = JSON.stringify(data, null, 2);
  const previous = fileWriteQueues.get(handle) || Promise.resolve();
  const pending = previous.then(async () => {
    const writable = await handle.createWritable();
    await writable.write(snapshot);
    await writable.close();
    return true;
  });
  fileWriteQueues.set(handle, pending.catch(() => {}));
  return pending.catch(e => {
    console.error('파일 저장 실패:', e);
    if (fileHandles.all === handle) { fileHandles.all = null; updateFileStatus(); }
    for (const pid in fileHandles.projects) {
      if (fileHandles.projects[pid] === handle) delete fileHandles.projects[pid];
    }
    updateFileStatus();
    toast('⚠️ 파일 저장에 실패했어요. 다시 파일 저장을 시도해주세요.');
    return false;
  });
}

function saveToStorage() {
  if (storageLoadFailed) {
    toast('⚠️ 기존 저장 데이터를 읽지 못해 덮어쓰기를 멈췄어요. 백업 파일을 불러와 복구해주세요.');
    return false;
  }
  let savedLocally = true;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state.projects)); }
  catch(e) {
    savedLocally = false;
    toast('⚠️ 저장 실패! 브라우저 저장공간이 부족해요. 일부 작품을 JSON으로 백업 후 삭제해주세요.');
  }
  // 전체 파일 핸들이 연결되어 있으면 덮어쓰기
  if (fileHandles.all) {
    const data = { projects: state.projects, ...statsBackup(), version: '2.1', savedAt: new Date().toISOString() };
    void writeToFileHandle(fileHandles.all, data);
  }
  // 활성 작품 파일 핸들이 연결되어 있으면 덮어쓰기
  if (state.activeProjectId && fileHandles.projects[state.activeProjectId]) {
    const p = getProject();
    if (p) void writeToFileHandle(fileHandles.projects[state.activeProjectId], projectBackup(p));
  }
  return savedLocally;
}

function loadFromStorage() {
  try {
    let d = localStorage.getItem(STORAGE_KEY);
    // 첫 실행에만 예전 원고를 복사한다. 이전 앱의 원고는 삭제하거나 수정하지 않는다.
    if (d === null) {
      for (const oldKey of ['wnstudio_v1', 'wnstudio_v3', 'wnstudio_v2']) {
        const old = localStorage.getItem(oldKey);
        if (old === null) continue;
        if (!Array.isArray(JSON.parse(old))) throw new Error('이전 원고 형식이 올바르지 않습니다.');
        localStorage.setItem(STORAGE_KEY, old);
        d = old;
        break;
      }
    }
    if (d) {
      const parsed = JSON.parse(d);
      if (!Array.isArray(parsed)) throw new Error('저장된 작품 목록 형식이 올바르지 않습니다.');
      state.projects = parsed;
    }
  } catch(e) {
    storageLoadFailed = true;
    console.error('저장된 작품을 읽지 못했습니다. 원본 데이터는 보존합니다.', e);
    toast('⚠️ 저장된 작품을 읽지 못했어요. 기존 데이터는 보존했습니다.');
  }
}

// ═══════════════════════════════════════════════════════════════
// SCHEMA MIGRATION
// ═══════════════════════════════════════════════════════════════
// 현재 스키마 버전. 스키마를 바꿀 때마다 +1 하고 migrateProject 안에
// 해당 버전용 블록을 추가한다. 멱등성을 지킬 것 (여러 번 실행해도 동일 결과).
const CURRENT_SCHEMA_VERSION = 3;

/**
 * 가계도 스키마 v2 필드 정의 (참고용)
 *
 * Project:
 *   familyTrees: FamilyTree[]   // 여러 가계도 탭 지원 (예: "왕실", "북부 귀족")
 *
 * Character (기존 필드 유지, 아래 3개 추가):
 *   parents:  string[]           // 부모 캐릭터 id, 최대 2개 권장 (생물학적 부모)
 *   spouses:  SpouseLink[]       // 혼인 관계 (재혼 다혼 지원)
 *   familyId: string             // 소속 가문 id (p.families[].id). 미지정 시 ''
 *
 * SpouseLink:
 *   id:     string               // 혼인 id (재혼 추적용)
 *   charId: string               // 배우자 character id
 *   status: 'current'|'past'|'deceased'  // 현재/이별/사별
 *   note:   string               // 비고 (혼인 시기 등 자유 텍스트)
 *
 * FamilyTree:
 *   id:        string
 *   name:      string            // 가계도 이름
 *   familyIds: string[]          // 포함할 가문 id 목록 (비어있으면 전체 인물)
 *   rootIds:   string[]          // 루트로 고정할 인물 id (비어있으면 자동 추론)
 *   layout:    'auto'|'manual'   // 자동 배치 vs 수동 위치
 *   overrides: {[charId]: {x,y}} // manual 모드일 때만 사용
 *   createdAt: string
 *
 * 형제자매는 저장하지 않는다. 부모가 같은 인물을 런타임에 추론한다.
 * 자식 목록도 저장하지 않는다. parents 역참조로 계산한다.
 * 이 원칙이 데이터 불일치(부모-자식 단방향 꼬임)를 원천 차단한다.
 */

function migrateAllProjects() {
  if (!Array.isArray(state.projects)) return;
  let changed = 0;
  state.projects.forEach(p => {
    if (migrateProject(p)) changed++;
  });
  if (changed > 0) {
    saveToStorage();
    console.log(`[migration] ${changed}개 작품 업그레이드 완료 → v${CURRENT_SCHEMA_VERSION}`);
  }
}

function migrateProject(p) {
  if (!p || typeof p !== 'object') return false;
  const from = p.schemaVersion || 1;
  if (from >= CURRENT_SCHEMA_VERSION) return false;

  // v1 → v2: 가계도 스키마 도입
  if (from < 2) {
    // 프로젝트 레벨 컬렉션
    if (!Array.isArray(p.families))     p.families = [];
    if (!Array.isArray(p.familyTrees))  p.familyTrees = [];

    // 인물 레벨 필드
    if (Array.isArray(p.characters)) {
      p.characters.forEach(c => {
        if (!c || typeof c !== 'object') return;
        if (!Array.isArray(c.parents)) c.parents = [];
        if (!Array.isArray(c.spouses)) c.spouses = [];
        if (typeof c.familyId !== 'string') c.familyId = '';
      });
    }
  }

  // 이후 버전이 생기면 여기 추가:
  // if (from < 3) { ... }

  // v2 → v3: 가문 멤버 ↔ 등장인물 연결 (charId 필드 도입)
  if (from < 3) {
    if (Array.isArray(p.families) && Array.isArray(p.characters)) {
      // 이름 → 인물 매핑 (동명이인은 첫 번째 사용)
      const nameToChar = new Map();
      p.characters.forEach(c => {
        if (c && c.name && !nameToChar.has(c.name)) {
          nameToChar.set(c.name, c);
        }
      });
      p.families.forEach(f => {
        if (!f || !f.groups) return;
        Object.keys(f.groups).forEach(tab => {
          const list = f.groups[tab];
          if (!Array.isArray(list)) return;
          list.forEach(m => {
            if (!m || typeof m !== 'object') return;
            // 기존 charId 보존, 없으면 이름으로 매칭 시도
            if (typeof m.charId !== 'string') m.charId = '';
            if (!m.charId && m.name && nameToChar.has(m.name)) {
              const ch = nameToChar.get(m.name);
              m.charId = ch.id;
              // 인물의 familyId 도 비어 있으면 채워주기 (양방향 동기화)
              if (!ch.familyId) ch.familyId = f.id;
            }
          });
        });
      });
    }
  }

  p.schemaVersion = CURRENT_SCHEMA_VERSION;
  return true;
}

/**
 * 인물 삭제 시 정리 작업 (무결성 유지).
 * 삭제된 캐릭터 id를 참조하는 parents/spouses 항목을 다른 인물에서 제거한다.
 * 삭제 로직과 함께 호출하도록 나중에 연결할 것.
 */
function cleanupCharacterReferences(p, removedId) {
  if (!p || !removedId || !Array.isArray(p.characters)) return;
  p.characters.forEach(c => {
    if (Array.isArray(c.parents)) {
      c.parents = c.parents.filter(pid => pid !== removedId);
    }
    if (Array.isArray(c.spouses)) {
      c.spouses = c.spouses.filter(sp => sp && sp.charId !== removedId);
    }
  });
  // 가계도의 rootIds / overrides 에서도 제거
  if (Array.isArray(p.familyTrees)) {
    p.familyTrees.forEach(t => {
      if (Array.isArray(t.rootIds)) t.rootIds = t.rootIds.filter(id => id !== removedId);
      if (t.overrides && t.overrides[removedId]) delete t.overrides[removedId];
    });
  }
  // 가문 멤버의 charId 참조도 끊기 (멤버 자체는 유지하되 연결 해제)
  if (Array.isArray(p.families)) {
    p.families.forEach(f => {
      if (!f || !f.groups) return;
      Object.values(f.groups).forEach(list => {
        if (!Array.isArray(list)) return;
        list.forEach(m => {
          if (m && m.charId === removedId) m.charId = '';
        });
      });
    });
  }
}

/**
 * 가문 삭제 시 정리 작업.
 * 해당 가문에 속한 인물의 familyId 를 비우고, familyTrees 의 familyIds 에서도 제거.
 */
function cleanupFamilyReferences(p, removedFamilyId) {
  if (!p || !removedFamilyId) return;
  if (Array.isArray(p.characters)) {
    p.characters.forEach(c => {
      if (c.familyId === removedFamilyId) c.familyId = '';
    });
  }
  if (Array.isArray(p.familyTrees)) {
    p.familyTrees.forEach(t => {
      if (Array.isArray(t.familyIds)) {
        t.familyIds = t.familyIds.filter(id => id !== removedFamilyId);
      }
    });
  }
}

// ═══════════════════════════════════════════════════════════════
// FAMILY ↔ CHARACTER 양방향 동기화 헬퍼
// ═══════════════════════════════════════════════════════════════

/** 가문 안에서 특정 charId 를 가진 멤버를 찾기 → {tab, idx} 또는 null */
function findMemberByCharId(family, charId) {
  if (!family || !family.groups || !charId) return null;
  for (const tab of Object.keys(family.groups)) {
    const list = family.groups[tab];
    if (!Array.isArray(list)) continue;
    const idx = list.findIndex(m => m && m.charId === charId);
    if (idx !== -1) return { tab, idx };
  }
  return null;
}

/** 모든 가문에서 특정 charId 의 멤버를 제거 (해당 인물의 familyId 가 변경/제거될 때 호출) */
function removeCharFromAllFamilies(p, charId) {
  if (!p || !charId || !Array.isArray(p.families)) return;
  p.families.forEach(f => {
    if (!f || !f.groups) return;
    Object.keys(f.groups).forEach(tab => {
      const list = f.groups[tab];
      if (!Array.isArray(list)) return;
      f.groups[tab] = list.filter(m => !(m && m.charId === charId));
    });
  });
}

/** 인물을 가문의 특정 탭에 추가 (이미 다른 탭에 있으면 거기 유지). 없으면 새로 추가. */
function addCharToFamily(p, charId, familyId, preferredTab) {
  if (!p || !charId || !familyId) return;
  const c = (p.characters || []).find(x => x.id === charId);
  const f = (p.families || []).find(x => x.id === familyId);
  if (!c || !f) return;
  if (!f.groups) f.groups = {};
  // 이미 이 가문 안에 있으면 그대로 둠
  if (findMemberByCharId(f, charId)) return;
  const tabs = (typeof getFamilyTabNames === 'function') ? getFamilyTabNames(f) : ['직계'];
  const tab = (preferredTab && tabs.includes(preferredTab)) ? preferredTab : tabs[0];
  if (!Array.isArray(f.groups[tab])) f.groups[tab] = [];
  f.groups[tab].push({
    charId: c.id,
    name: c.name || '',
    age: c.age || '',
    gender: c.gender || '',
    alive: c.alive || '생존',
    relation: c.role || '',
    note: '',
  });
}



/** 인물의 조상 id Set 반환 (부모, 조부모 ...). 순환 방어 포함. */
function getAncestorIds(p, charId) {
  const out = new Set();
  if (!p || !charId) return out;
  const byId = new Map((p.characters||[]).map(c => [c.id, c]));
  const stack = [charId];
  const visited = new Set();
  while (stack.length) {
    const cur = stack.pop();
    if (visited.has(cur)) continue;
    visited.add(cur);
    const c = byId.get(cur);
    if (!c) continue;
    (c.parents || []).forEach(pid => {
      if (!visited.has(pid)) {
        out.add(pid);
        stack.push(pid);
      }
    });
  }
  return out;
}

/**
 * charId 의 parents 를 newParents 로 바꿔도 순환이 생기지 않는지 검사.
 * 순환 = newParents 중 하나가 charId 의 자손이거나 charId 본인인 경우.
 * 반환: { ok: true } 또는 { ok: false, reason: string }
 */
function validateParentAssignment(p, charId, newParents) {
  if (!Array.isArray(newParents)) return { ok: false, reason: '잘못된 입력' };
  if (newParents.includes(charId)) {
    return { ok: false, reason: '자기 자신을 부모로 지정할 수 없습니다.' };
  }
  // 새 부모 후보가 charId 의 자손이면 순환
  // → "charId 의 자손 집합"을 구해서 교집합이 있는지 확인
  const descendants = getDescendantIds(p, charId);
  for (const pid of newParents) {
    if (descendants.has(pid)) {
      const name = (p.characters||[]).find(c => c.id === pid)?.name || '해당 인물';
      return { ok: false, reason: `${name}은(는) 이 인물의 후손이라 부모로 지정할 수 없습니다.` };
    }
  }
  return { ok: true };
}

/** charId 의 모든 자손 id Set. 현재 저장된 parents 역참조로 계산. */
function getDescendantIds(p, charId) {
  const out = new Set();
  if (!p || !charId) return out;
  const chars = p.characters || [];
  // 각 인물의 parents 를 보고 자식 맵 구성
  const childrenMap = new Map();
  chars.forEach(c => {
    (c.parents || []).forEach(pid => {
      if (!childrenMap.has(pid)) childrenMap.set(pid, []);
      childrenMap.get(pid).push(c.id);
    });
  });
  const stack = [charId];
  const visited = new Set();
  while (stack.length) {
    const cur = stack.pop();
    if (visited.has(cur)) continue;
    visited.add(cur);
    const kids = childrenMap.get(cur) || [];
    kids.forEach(kid => {
      if (!visited.has(kid)) {
        out.add(kid);
        stack.push(kid);
      }
    });
  }
  return out;
}

/**
 * 배우자 양방향 동기화.
 * A 의 spouses 를 desiredSpouses 로 설정하면서, B 쪽에도 A 링크가 있도록 맞춘다.
 * 제거된 배우자의 spouses 에서 A 링크를 제거한다.
 * status 는 A 쪽 설정을 따르되, B 가 이미 링크를 갖고 있으면 B 의 status 는 유지한다.
 */
function syncSpouseLinks(p, charId, desiredSpouses) {
  if (!p || !Array.isArray(p.characters)) return;
  const me = p.characters.find(c => c.id === charId);
  if (!me) return;
  const byId = new Map(p.characters.map(c => [c.id, c]));

  const oldSpouses = Array.isArray(me.spouses) ? me.spouses : [];
  const oldIds = new Set(oldSpouses.map(s => s.charId));
  const newIds = new Set(desiredSpouses.map(s => s.charId));

  // 제거된 배우자: 상대방 쪽에서 나(charId) 링크 제거
  oldIds.forEach(otherId => {
    if (!newIds.has(otherId)) {
      const other = byId.get(otherId);
      if (other && Array.isArray(other.spouses)) {
        other.spouses = other.spouses.filter(s => s.charId !== charId);
      }
    }
  });

  // 추가/유지된 배우자: 상대방 쪽에 나 링크가 없으면 추가
  desiredSpouses.forEach(sp => {
    const other = byId.get(sp.charId);
    if (!other) return;
    if (!Array.isArray(other.spouses)) other.spouses = [];
    const existing = other.spouses.find(s => s.charId === charId);
    if (!existing) {
      other.spouses.push({
        id: uid(),
        charId: charId,
        status: sp.status || 'current',
        note: ''
      });
    }
    // 기존 링크가 있으면 status 는 건드리지 않음 (상대가 설정한 값 존중)
  });

  // 내 spouses 를 최종 반영
  me.spouses = desiredSpouses.map(sp => ({
    id: sp.id || uid(),
    charId: sp.charId,
    status: sp.status || 'current',
    note: sp.note || ''
  }));
}

// ═══════════════════════════════════════════════════════════════
// FAMILY TREE ENGINE
// ═══════════════════════════════════════════════════════════════
// 자동 계층 레이아웃으로 가계도를 그린다.
// 세대(generation) 을 Y 축에, 같은 세대 안의 정렬을 X 축에 배치한다.
// 배우자는 수평선으로 연결하고 자식들은 그 중간점에서 수직 분기한다.

const FT_NODE_W = 130;     // 노드 너비 (CSS min-width 기준)
const FT_NODE_H = 64;      // 노드 높이 추정치
const FT_H_GAP  = 24;      // 같은 세대 내 인물 간 수평 간격
const FT_V_GAP  = 80;      // 세대 간 수직 간격
const FT_COUPLE_GAP = 12;  // 배우자 사이 수평 간격 (노드 간 여백)

let ftState = {
  selectedCharId: null,
  filterFamilyId: '',   // '' 이면 전체
  pan: {x: 40, y: 40},
  zoom: 1,
};

function renderFamilyTree() {
  const p = getProject();
  if (!p) return;

  const chars    = p.characters || [];
  const families = p.families   || [];

  // 필터 UI 옵션
  const familyFilterOpts = [
    `<option value="">전체 인물</option>`,
    ...families.map(f => `<option value="${f.id}" ${ftState.filterFamilyId===f.id?'selected':''}>${esc(f.name)}</option>`)
  ].join('');

  const hasAnyRelation = chars.some(c =>
    (Array.isArray(c.parents) && c.parents.length > 0) ||
    (Array.isArray(c.spouses) && c.spouses.length > 0)
  );

  document.getElementById('main').innerHTML = `
    <div class="diagram-wrap">
      <div class="diagram-toolbar">
        <div style="font-weight:700;color:var(--gold);font-size:13px">가계도</div>
        <div style="width:1px;height:20px;background:var(--border)"></div>
        <label style="font-size:11px;color:var(--muted);display:flex;align-items:center;gap:6px">
          가문 필터
          <select onchange="ftSetFilter(this.value)" style="font-size:12px">${familyFilterOpts}</select>
        </label>
        <button class="btn btn-outline btn-sm" onclick="ftResetView()">⊕ 화면 맞춤</button>
        <span id="ft-zoom-label" style="font-size:11px;color:var(--muted);min-width:36px;text-align:center">100%</span>
        <div style="flex:1"></div>
        <div style="font-size:10px;color:var(--muted)">배치는 자동입니다. 관계는 인물 편집에서 수정하세요.</div>
      </div>
      <div class="diagram-canvas-wrap" id="ft-wrap" style="touch-action:none">
        ${chars.length === 0 ? ftEmptyState('아직 인물이 없습니다', '먼저 인물을 추가해보세요.')
          : !hasAnyRelation ? ftEmptyState('아직 관계가 없습니다', '인물 편집 → 관계 탭에서 부모/배우자를 지정하면 자동으로 가계도가 그려집니다.')
          : `<div id="ft-stage" style="position:absolute;inset:0;overflow:visible;transform-origin:0 0">
               <svg id="ft-svg" style="position:absolute;left:0;top:0;width:6000px;height:6000px;pointer-events:none;overflow:visible"></svg>
               <div id="ft-nodes" style="position:absolute;left:0;top:0"></div>
             </div>`}
      </div>
    </div>
  `;

  if (chars.length > 0 && hasAnyRelation) {
    ftDrawTree();
    ftSetupPanZoom();
  }
}

function ftEmptyState(title, msg) {
  return `<div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;color:var(--muted);padding:20px;text-align:center">
    <div style="font-size:40px">🌳</div>
    <div style="font-size:15px;font-weight:700;color:var(--ink)">${esc(title)}</div>
    <div style="font-size:13px;max-width:340px;line-height:1.5">${esc(msg)}</div>
  </div>`;
}

function ftSetFilter(famId) {
  ftState.filterFamilyId = famId;
  ftState.selectedCharId = null;
  renderFamilyTree();
}

// ═══════════════════════════════════════════════════════════════
// LAYOUT: 세대 할당 → 가족 유닛 묶기 → 좌표 계산
// ═══════════════════════════════════════════════════════════════

/**
 * 인물들을 세대 번호에 배치한다.
 * - 부모가 없으면 0
 * - 부모가 있으면 max(부모 세대) + 1
 * - 배우자는 두 명 중 더 낮은(루트 가까운) 세대로 맞춤 (시각적 정렬)
 * 순환 그래프일 경우 BFS depth 로 대체 처리.
 */
function ftAssignGenerations(chars) {
  const byId = new Map(chars.map(c => [c.id, c]));
  const gen = new Map();

  // 1차: 부모 재귀로 깊이 계산 (memoized)
  function depthOf(id, stack) {
    if (gen.has(id)) return gen.get(id);
    if (stack.has(id)) return 0; // 순환 방어
    stack.add(id);
    const c = byId.get(id);
    const parents = c?.parents || [];
    let d = 0;
    if (parents.length > 0) {
      let max = -1;
      for (const pid of parents) {
        if (!byId.has(pid)) continue;
        const pd = depthOf(pid, stack);
        if (pd > max) max = pd;
      }
      d = max + 1;
    }
    stack.delete(id);
    gen.set(id, d);
    return d;
  }
  chars.forEach(c => depthOf(c.id, new Set()));

  // 2차: 배우자 세대 맞추기
  //   고정 인물(부모 또는 자식이 있어 세대가 의미를 가진 사람)과
  //   자유 인물(배우자로만 연결된 외부인)이 결혼한 경우,
  //   자유 인물을 고정 인물 세대로 끌어온다.
  //   양쪽 다 고정이면 세대가 달라도 그대로 둔다 (세대차 부부 — 계부/계모 등).
  //   양쪽 다 자유이면 min(0) 으로 맞춘다 (루트 세대).
  const hasKids   = (id) => chars.some(x => (x.parents||[]).includes(id));
  const hasParent = (id) => (byId.get(id)?.parents || []).some(pid => byId.has(pid));
  const isAnchored = (id) => hasKids(id) || hasParent(id);

  let changed = true, safety = 0;
  while (changed && safety++ < 10) {
    changed = false;
    chars.forEach(c => {
      (c.spouses || []).forEach(sp => {
        const other = byId.get(sp.charId);
        if (!other) return;
        const g1 = gen.get(c.id), g2 = gen.get(other.id);
        if (g1 === g2) return;

        const a1 = isAnchored(c.id);
        const a2 = isAnchored(other.id);

        if (a1 && !a2) {
          // other(자유) 를 c(고정) 세대로 맞춤
          gen.set(other.id, g1); changed = true;
        } else if (!a1 && a2) {
          // c(자유) 를 other(고정) 세대로 맞춤
          gen.set(c.id, g2); changed = true;
        } else if (!a1 && !a2) {
          // 둘 다 자유 — 더 위쪽으로 (min 쪽이 0에 가까움)
          const target = Math.min(g1, g2);
          if (g1 !== target) { gen.set(c.id, target); changed = true; }
          if (g2 !== target) { gen.set(other.id, target); changed = true; }
        }
        // 둘 다 고정이면 그대로 (비정상 케이스지만 데이터 무결성 존중)
      });
    });
  }

  return gen;
}

/**
 * 인접 그래프 순회로 "관계 성분"(connected component) 을 찾는다.
 * 부모-자식, 배우자 관계로 연결된 인물들은 같은 성분.
 * 필터링 후 각 성분을 독립적으로 배치한 뒤 수평 이어붙인다.
 */
function ftFindComponents(chars) {
  const byId = new Map(chars.map(c => [c.id, c]));
  const seen = new Set();
  const comps = [];

  chars.forEach(c => {
    if (seen.has(c.id)) return;
    const comp = [];
    const stack = [c.id];
    while (stack.length) {
      const cur = stack.pop();
      if (seen.has(cur)) continue;
      seen.add(cur);
      const x = byId.get(cur);
      if (!x) continue;
      comp.push(x);
      (x.parents || []).forEach(pid => { if (byId.has(pid) && !seen.has(pid)) stack.push(pid); });
      (x.spouses || []).forEach(sp => { if (byId.has(sp.charId) && !seen.has(sp.charId)) stack.push(sp.charId); });
      // 자식 방향 (역참조)
      chars.forEach(other => {
        if ((other.parents || []).includes(cur) && !seen.has(other.id)) stack.push(other.id);
      });
    }
    comps.push(comp);
  });

  return comps;
}

/**
 * 한 성분(component) 안에서 X 좌표를 할당한다.
 * 전략:
 *  1. 세대별로 인물 목록을 만든다.
 *  2. 각 인물에 "정렬 순서(orderKey)" 를 준다.
 *     - 부모가 있으면 부모의 X 중간값을 기준으로 정렬
 *     - 없으면 자식 X 중간값, 그것도 없으면 id 해시
 *  3. 루트 세대부터 아래로, 같은 부모 쌍을 공유하는 형제는 인접 배치
 *  4. 배우자는 자기 자리 옆에 붙여둔다 (같은 "가족 유닛")
 *
 * 단순하지만 2~3세대 소규모 가계에서 실용적으로 깔끔한 결과가 나옴.
 */
function ftLayoutComponent(comp, gen) {
  const byId = new Map(comp.map(c => [c.id, c]));

  // 세대별 그룹
  const byGen = new Map();
  let maxGen = 0;
  comp.forEach(c => {
    const g = gen.get(c.id) || 0;
    if (!byGen.has(g)) byGen.set(g, []);
    byGen.get(g).push(c);
    if (g > maxGen) maxGen = g;
  });

  // 가족 유닛 구성: (parentA, parentB) 쌍을 키로, 자식 목록을 값으로.
  // 부모가 1명인 경우도 ("pid|") 형태로 처리.
  const coupleKey = (c) => {
    const ps = [...(c.parents || [])].filter(id => byId.has(id)).sort();
    return ps.join('|');
  };
  const unitsByParents = new Map();  // "p1|p2" -> child[]
  comp.forEach(c => {
    const k = coupleKey(c);
    if (!k) return;
    if (!unitsByParents.has(k)) unitsByParents.set(k, []);
    unitsByParents.get(k).push(c);
  });

  // 각 세대 안에서 X 좌표 계산
  // 루트 세대부터 내려가며 배치한다.
  const pos = new Map(); // id -> {x, y}
  const placedInGen = new Map(); // g -> 현재까지 쌓인 X 끝 위치

  // 루트 세대는 배우자 페어링을 먼저 묶고 나머지는 순서대로
  const rootGen = byGen.get(0) || [];
  const rootGroups = ftGroupByCouples(rootGen, byId);
  let xCursor = 0;
  rootGroups.forEach(group => {
    group.forEach((person, idx) => {
      pos.set(person.id, {x: xCursor, y: 0});
      xCursor += FT_NODE_W + (idx < group.length - 1 ? FT_COUPLE_GAP : FT_H_GAP);
    });
  });
  placedInGen.set(0, xCursor);

  // 1세대 이후: 부모 X 중간값 기준으로 배치
  for (let g = 1; g <= maxGen; g++) {
    const people = byGen.get(g) || [];
    // 가족 유닛으로 묶어서 배치 (형제는 인접)
    // "부모 쌍이 있는 인물" 끼리는 부모 X 중심에 맞춰 배치,
    // "부모 없는 인물" (예: 배우자로 들어온 외부인) 은 배우자 옆에 붙임.
    const placed = new Set();
    const groups = [];

    // (1) 부모 쌍 기준 그룹
    for (const [key, children] of unitsByParents) {
      const childrenInThisGen = children.filter(c => (gen.get(c.id)||0) === g);
      if (childrenInThisGen.length === 0) continue;
      const parentIds = key.split('|').filter(Boolean);
      const parentXs = parentIds.map(pid => pos.get(pid)?.x).filter(x => x !== undefined);
      const centerX = parentXs.length > 0
        ? parentXs.reduce((a,b)=>a+b, 0) / parentXs.length + FT_NODE_W/2
        : null;
      // 형제 + 그 배우자들 포함
      const withSpouses = [];
      childrenInThisGen.forEach(c => {
        withSpouses.push(c);
        placed.add(c.id);
        (c.spouses || []).forEach(sp => {
          const other = byId.get(sp.charId);
          if (other && (gen.get(other.id)||0) === g && !placed.has(other.id)) {
            // 이 배우자가 다른 부모 쌍에 속한 자식인지 확인
            const otherKey = coupleKey(other);
            if (!otherKey) {
              // 외부인 (부모 없음) → 이 그룹에 끌어옴
              withSpouses.push(other);
              placed.add(other.id);
            }
            // 부모가 있는 배우자는 자기 그룹에서 처리
          }
        });
      });
      groups.push({ centerX, items: withSpouses });
    }

    // (2) 부모 없이 이 세대에 있는 사람 (루트가 아닌 외부인, 고아 등)
    people.forEach(c => {
      if (placed.has(c.id)) return;
      if ((c.parents || []).length === 0) {
        groups.push({ centerX: null, items: [c] });
        placed.add(c.id);
      }
    });

    // 그룹들을 centerX 기준 정렬 (없으면 뒤로)
    groups.sort((a, b) => {
      if (a.centerX === null && b.centerX === null) return 0;
      if (a.centerX === null) return 1;
      if (b.centerX === null) return -1;
      return a.centerX - b.centerX;
    });

    // 배치 — 그룹끼리 겹치지 않도록 x커서로 채우되, 가능하면 centerX 존중
    let cursor = 0;
    groups.forEach(group => {
      const width = group.items.length * FT_NODE_W + (group.items.length - 1) * FT_COUPLE_GAP;
      let startX = cursor;
      if (group.centerX !== null) {
        const desired = group.centerX - width/2;
        startX = Math.max(cursor, desired);
      }
      group.items.forEach((person, idx) => {
        pos.set(person.id, {x: startX + idx * (FT_NODE_W + FT_COUPLE_GAP), y: g * (FT_NODE_H + FT_V_GAP)});
      });
      cursor = startX + width + FT_H_GAP;
    });
    placedInGen.set(g, cursor);
  }

  // 루트 세대 Y 좌표 설정
  (byGen.get(0) || []).forEach(c => {
    const p = pos.get(c.id);
    if (p) p.y = 0;
  });

  return pos;
}

/**
 * 같은 세대에서 배우자 페어를 묶는다.
 * 반환: [[A, B], [C], [D, E]] 형태의 그룹 배열
 * 이미 그룹에 포함된 사람은 중복 배치하지 않는다.
 */
function ftGroupByCouples(people, byId) {
  const placed = new Set();
  const groups = [];
  people.forEach(c => {
    if (placed.has(c.id)) return;
    const group = [c];
    placed.add(c.id);
    (c.spouses || []).forEach(sp => {
      if (placed.has(sp.charId)) return;
      const other = byId.get(sp.charId);
      if (other && people.includes(other)) {
        group.push(other);
        placed.add(other.id);
      }
    });
    groups.push(group);
  });
  return groups;
}

// ═══════════════════════════════════════════════════════════════
// RENDER
// ═══════════════════════════════════════════════════════════════

function ftDrawTree() {
  const p = getProject();
  let chars = p.characters || [];

  // 가문 필터: 해당 가문 인물 + 그들의 배우자/부모/자식 (경계 넘는 관계도 보여주기)
  if (ftState.filterFamilyId) {
    const inFamily = new Set(chars.filter(c => c.familyId === ftState.filterFamilyId).map(c => c.id));
    const extended = new Set(inFamily);
    chars.forEach(c => {
      if (!inFamily.has(c.id)) return;
      (c.parents||[]).forEach(id => extended.add(id));
      (c.spouses||[]).forEach(sp => extended.add(sp.charId));
    });
    // 자식도
    chars.forEach(c => {
      if ((c.parents||[]).some(pid => inFamily.has(pid))) extended.add(c.id);
    });
    chars = chars.filter(c => extended.has(c.id));
  }

  // 관계가 하나라도 있는 인물만 (완전 고립된 외톨이 제외)
  const hasAny = (c) =>
    (Array.isArray(c.parents) && c.parents.length > 0) ||
    (Array.isArray(c.spouses) && c.spouses.length > 0) ||
    chars.some(x => (x.parents||[]).includes(c.id));
  chars = chars.filter(hasAny);

  if (chars.length === 0) {
    const wrap = document.getElementById('ft-wrap');
    if (wrap) wrap.innerHTML = ftEmptyState('표시할 인물이 없습니다', '이 필터에는 관계가 설정된 인물이 없어요.');
    return;
  }

  const gen = ftAssignGenerations(chars);
  const components = ftFindComponents(chars);

  // 각 성분을 독립적으로 배치하고 수평으로 이어붙임
  const allPos = new Map();
  let offsetX = 0;
  components.forEach(comp => {
    const pos = ftLayoutComponent(comp, gen);
    // 이 성분의 bounds 계산
    let minX = Infinity, maxX = -Infinity;
    pos.forEach(pt => {
      if (pt.x < minX) minX = pt.x;
      if (pt.x + FT_NODE_W > maxX) maxX = pt.x + FT_NODE_W;
    });
    if (minX === Infinity) return;
    pos.forEach((pt, id) => {
      allPos.set(id, { x: pt.x - minX + offsetX, y: pt.y });
    });
    offsetX += (maxX - minX) + FT_H_GAP * 3;  // 성분 간 여유
  });

  // DOM 렌더
  const nodesWrap = document.getElementById('ft-nodes');
  const svg = document.getElementById('ft-svg');
  if (!nodesWrap || !svg) return;

  const families = p.families || [];
  const familyById = new Map(families.map(f => [f.id, f]));

  // 노드 렌더
  nodesWrap.innerHTML = chars.map(c => {
    const pt = allPos.get(c.id);
    if (!pt) return '';
    const isDead = c.alive === '사망';
    const genderSymbol = c.gender === '남' ? '♂' : c.gender === '여' ? '♀' : '';
    const family = c.familyId ? familyById.get(c.familyId) : null;
    const selected = ftState.selectedCharId === c.id ? ' selected' : '';
    const deadCls  = isDead ? ' deceased' : '';
    const famBadge = family
      ? `<div class="ft-node-family" style="background:${family.color||'#c4922a'}22;color:${family.color||'#c4922a'}">${esc(family.name)}</div>`
      : '';
    const metaBits = [];
    if (c.age) metaBits.push(esc(c.age));
    if (c.role) metaBits.push(esc(c.role));
    const meta = metaBits.length ? `<div class="ft-node-meta">${metaBits.join(' · ')}</div>` : '';
    return `<div class="ft-node${selected}${deadCls}" data-char-id="${c.id}"
      style="left:${pt.x}px;top:${pt.y}px;min-width:${FT_NODE_W}px"
      onclick="ftSelectNode('${c.id}')"
      ondblclick="ftOpenCharModal('${c.id}')">
      ${genderSymbol?`<div class="ft-node-gender">${genderSymbol}</div>`:''}
      <div class="ft-node-name">${esc(c.name)}</div>
      ${meta}
      ${famBadge}
    </div>`;
  }).join('');

  // 엣지(선) 렌더
  ftDrawEdges(svg, chars, allPos);
}

function ftDrawEdges(svg, chars, pos) {
  const byId = new Map(chars.map(c => [c.id, c]));
  let lines = '';

  // 배우자 선 (수평, 같은 Y)
  const drawnCouples = new Set();
  chars.forEach(c => {
    (c.spouses || []).forEach(sp => {
      const key = [c.id, sp.charId].sort().join('|');
      if (drawnCouples.has(key)) return;
      drawnCouples.add(key);
      const other = byId.get(sp.charId);
      if (!other) return;
      const pa = pos.get(c.id), pb = pos.get(other.id);
      if (!pa || !pb) return;
      const y  = pa.y + FT_NODE_H / 2;
      const yb = pb.y + FT_NODE_H / 2;
      const x1 = pa.x + FT_NODE_W;
      const x2 = pb.x;
      // 왼/오 판정 — 순서에 따라 반대일 수 있음
      const [lx, ly, rx, ry] = pa.x < pb.x
        ? [pa.x + FT_NODE_W, y, pb.x, yb]
        : [pb.x + FT_NODE_W, yb, pa.x, y];
      const style = sp.status === 'deceased' ? 'stroke-dasharray="6,4"' :
                    sp.status === 'past'     ? 'stroke-dasharray="2,4"' : '';
      const color = sp.status === 'current' ? '#c4922a' : '#8a8378';
      if (ly === ry) {
        lines += `<line x1="${lx}" y1="${ly}" x2="${rx}" y2="${ry}" stroke="${color}" stroke-width="3" ${style}/>`;
      } else {
        // 세대 차이가 나는 부부 (드물지만) — L자 선
        const midX = (lx + rx) / 2;
        lines += `<polyline points="${lx},${ly} ${midX},${ly} ${midX},${ry} ${rx},${ry}" fill="none" stroke="${color}" stroke-width="3" ${style}/>`;
      }
    });
  });

  // 부모-자식 선 (수직, 부모 쌍 중간점에서 자식으로)
  // 같은 부모 쌍의 자식들은 공통 "분기점"을 공유.
  // 한쪽 부모만 등록된 경우에도, 그 부모의 현재/사별 배우자가 있다면
  // 배우자를 "암묵적 공동 부모"로 간주해 부부 중간점에서 분기한다.
  // (편의상 '현재' 또는 '사별' 상태인 배우자만 인정)
  const unitsByParents = new Map();
  chars.forEach(c => {
    const ps = [...(c.parents || [])].filter(id => byId.has(id)).sort();
    if (ps.length === 0) return;
    const key = ps.join('|');
    if (!unitsByParents.has(key)) unitsByParents.set(key, { parentIds: ps, children: [] });
    unitsByParents.get(key).children.push(c);
  });

  unitsByParents.forEach(({parentIds, children}) => {
    // 부모가 1명이고 그 부모에게 배우자가 있다면, 배우자를 시각적 공동 부모로 추가
    let visualParentIds = [...parentIds];
    if (visualParentIds.length === 1) {
      const soleParent = byId.get(visualParentIds[0]);
      if (soleParent) {
        // '현재' 또는 '사별' 배우자 중 이 성분에 존재하고 같은 Y에 있는 사람
        const candidate = (soleParent.spouses || []).find(sp => {
          if (sp.status !== 'current' && sp.status !== 'deceased') return false;
          const sPos = pos.get(sp.charId);
          const pPos = pos.get(soleParent.id);
          return sPos && pPos && sPos.y === pPos.y;
        });
        if (candidate) visualParentIds.push(candidate.charId);
      }
    }

    // 부모(또는 시각적 부모) 중심점 계산
    const parentCenters = visualParentIds.map(pid => {
      const pp = pos.get(pid);
      return pp ? { x: pp.x + FT_NODE_W/2, y: pp.y + FT_NODE_H } : null;
    }).filter(Boolean);
    if (parentCenters.length === 0) return;

    // 부모가 2명이면 그 중간, 1명이면 그 아래
    const centerX = parentCenters.reduce((a,b)=>a+b.x, 0) / parentCenters.length;
    const parentBottomY = Math.max(...parentCenters.map(p => p.y));

    // 자식 중심점들
    const kidCenters = children.map(c => {
      const kp = pos.get(c.id);
      return kp ? { x: kp.x + FT_NODE_W/2, y: kp.y, id: c.id } : null;
    }).filter(Boolean);
    if (kidCenters.length === 0) return;

    // 자식 Y 최솟값을 분기점 기준으로
    const childTopY = Math.min(...kidCenters.map(k => k.y));
    const busY = parentBottomY + (childTopY - parentBottomY) / 2;

    // (1) 부모 중심(또는 부부 중간점)에서 수직으로 bus 까지
    lines += `<line x1="${centerX}" y1="${parentBottomY}" x2="${centerX}" y2="${busY}" stroke="#6b5f4f" stroke-width="2.5"/>`;

    // (2) bus 가로선 (최좌/최우 자식까지)
    if (kidCenters.length > 1) {
      const minKX = Math.min(...kidCenters.map(k => k.x));
      const maxKX = Math.max(...kidCenters.map(k => k.x));
      const busStartX = Math.min(centerX, minKX);
      const busEndX   = Math.max(centerX, maxKX);
      lines += `<line x1="${busStartX}" y1="${busY}" x2="${busEndX}" y2="${busY}" stroke="#6b5f4f" stroke-width="2.5"/>`;
    } else {
      // 자식이 1명이고 그 자식의 X가 centerX와 다르면 가로선으로 연결
      const kx = kidCenters[0].x;
      if (Math.abs(kx - centerX) > 0.5) {
        lines += `<line x1="${centerX}" y1="${busY}" x2="${kx}" y2="${busY}" stroke="#6b5f4f" stroke-width="2.5"/>`;
      }
    }

    // (3) 각 자식 수직선
    kidCenters.forEach(k => {
      lines += `<line x1="${k.x}" y1="${busY}" x2="${k.x}" y2="${k.y}" stroke="#6b5f4f" stroke-width="2.5"/>`;
    });
  });

  svg.innerHTML = lines;
}

function ftSelectNode(id) {
  ftState.selectedCharId = ftState.selectedCharId === id ? null : id;
  // 모든 노드 클래스 갱신 (재렌더 없이)
  document.querySelectorAll('.ft-node').forEach(el => {
    el.classList.toggle('selected', el.dataset.charId === ftState.selectedCharId);
  });
}

function ftOpenCharModal(id) {
  const p = getProject();
  const idx = (p.characters || []).findIndex(c => c.id === id);
  if (idx >= 0) showCharModal(idx, 'relation');
}

// ═══════════════════════════════════════════════════════════════
// PAN / ZOOM (다이어그램 것을 단순화해서 재사용)
// ═══════════════════════════════════════════════════════════════

function ftApplyStage() {
  const stage = document.getElementById('ft-stage');
  if (!stage) return;
  stage.style.transform = `translate(${ftState.pan.x}px,${ftState.pan.y}px) scale(${ftState.zoom})`;
  const zl = document.getElementById('ft-zoom-label');
  if (zl) zl.textContent = Math.round(ftState.zoom*100)+'%';
}

function ftResetView() {
  // bounds 계산해서 뷰포트에 맞춤
  const nodes = document.querySelectorAll('#ft-nodes .ft-node');
  if (!nodes.length) { ftState.pan = {x:40, y:40}; ftState.zoom = 1; ftApplyStage(); return; }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  nodes.forEach(n => {
    const x = parseFloat(n.style.left) || 0;
    const y = parseFloat(n.style.top)  || 0;
    const w = n.offsetWidth  || FT_NODE_W;
    const h = n.offsetHeight || FT_NODE_H;
    if (x < minX) minX = x; if (y < minY) minY = y;
    if (x+w > maxX) maxX = x+w; if (y+h > maxY) maxY = y+h;
  });
  const wrap = document.getElementById('ft-wrap');
  if (!wrap) return;
  const wr = wrap.getBoundingClientRect();
  const contentW = maxX - minX, contentH = maxY - minY;
  const padding = 40;
  const zx = (wr.width  - padding*2) / contentW;
  const zy = (wr.height - padding*2) / contentH;
  ftState.zoom = Math.min(1, Math.min(zx, zy));
  ftState.pan = {
    x: padding - minX * ftState.zoom + (wr.width  - contentW*ftState.zoom - padding*2)/2,
    y: padding - minY * ftState.zoom + (wr.height - contentH*ftState.zoom - padding*2)/2,
  };
  ftApplyStage();
}

function ftSetupPanZoom() {
  const wrap = document.getElementById('ft-wrap');
  if (!wrap) return;

  let panning = false, last = null;

  function xy(e) {
    const t = e.touches?.[0] ?? e.changedTouches?.[0] ?? e;
    return { x: t.clientX, y: t.clientY };
  }

  wrap.addEventListener('mousedown', e => {
    if (e.target.closest('.ft-node')) return;
    panning = true; last = xy(e); wrap.style.cursor = 'grabbing';
  });
  wrap.addEventListener('mousemove', e => {
    if (!panning) return;
    const p = xy(e);
    ftState.pan.x += p.x - last.x;
    ftState.pan.y += p.y - last.y;
    last = p;
    ftApplyStage();
  });
  window.addEventListener('mouseup', () => { panning = false; if (wrap) wrap.style.cursor = ''; });

  // 터치
  wrap.addEventListener('touchstart', e => {
    if (e.target.closest('.ft-node')) return;
    if (e.touches.length !== 1) return;
    panning = true; last = xy(e);
  }, {passive: true});
  wrap.addEventListener('touchmove', e => {
    if (!panning || e.touches.length !== 1) return;
    const p = xy(e);
    ftState.pan.x += p.x - last.x;
    ftState.pan.y += p.y - last.y;
    last = p;
    ftApplyStage();
    e.preventDefault();
  }, {passive: false});
  wrap.addEventListener('touchend', () => { panning = false; });

  // 휠 줌
  wrap.addEventListener('wheel', e => {
    e.preventDefault();
    const wr = wrap.getBoundingClientRect();
    const mx = e.clientX - wr.left, my = e.clientY - wr.top;
    const delta = -e.deltaY * 0.001;
    const newZoom = Math.max(0.2, Math.min(3, ftState.zoom * (1 + delta)));
    // 마우스 위치 기준 줌
    const scale = newZoom / ftState.zoom;
    ftState.pan.x = mx - (mx - ftState.pan.x) * scale;
    ftState.pan.y = my - (my - ftState.pan.y) * scale;
    ftState.zoom = newZoom;
    ftApplyStage();
  }, {passive: false});

  // 초기 뷰 맞춤 — DOM 레이아웃이 완료된 후 호출 (노드 크기가 확정되어야 bounds가 정확)
  requestAnimationFrame(() => {
    requestAnimationFrame(ftResetView);
  });
}

// ═══════════════════════════════════════════════════════════════
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
          호필 스튜디오 v0.6.20 beta · © 2026 호백<br>
          <a href="https://creativecommons.org/licenses/by-nc/4.0/" target="_blank"
            style="color:var(--muted);text-decoration:none;opacity:.8">CC BY-NC 4.0</a>
          · 비상업적 목적에 한해 자유롭게 사용 가능<br>
          <a href="https://github.com/hotistudio/hopil-studio" target="_blank"
            style="color:var(--muted);text-decoration:none;opacity:.8">github.com/hotistudio/hopil-studio</a>
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
          const allStats = (() => { try { return JSON.parse(localStorage.getItem('hopil_studio_writing_stats')||'{}'); } catch(e) { return {}; } })();
          const pStats = allStats[p.id] || {};
          const todayKey = getTodayStr();
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
// CHARACTERS
// ═══════════════════════════════════════════════════════════════
function renderCharacters() {
  const p = getProject();
  const chars = p.characters || [];
  if (chars.length === 0) {
    document.getElementById('main').innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
        <h2 class="font-display">등장인물 <span style="font-size:14px;color:var(--muted);font-family:'Noto Sans KR'">(0)</span></h2>
        <button class="btn btn-gold" onclick="showCharModal()">＋ 캐릭터 추가</button>
      </div>
      <div class="card empty-state"><div class="emoji">👤</div><p>캐릭터를 추가해보세요.</p></div>`;
    return;
  }

  // 역할별 그룹핑
  const groups = {};
  chars.forEach((c, i) => {
    const g = (c.role || '기타').trim();
    if (!groups[g]) groups[g] = [];
    groups[g].push({c, i});
  });

  // ROLES 순서대로 정렬, 그 외는 뒤에
  const orderedKeys = [...ROLES.filter(r => groups[r]), ...Object.keys(groups).filter(r => !ROLES.includes(r))];

  const renderCard = ({c, i}) => {
    return `
      <div class="card char-card" data-char-idx="${i}" data-char-role="${esc(c.role||'기타')}" style="margin-bottom:14px;background:${c.color || ''};border-left:3px solid ${c.color || 'var(--border)'}">
        <div style="display:flex;gap:10px;align-items:flex-start">
          <div class="char-drag-handle" data-char-idx="${i}"
            style="flex-shrink:0;align-self:center;cursor:grab;color:var(--border);font-size:18px;
              padding:4px 2px;line-height:1;touch-action:none;user-select:none"
            title="드래그하여 순서 변경">⠿</div>
          <div style="flex:1;min-width:0">
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px">
              <span class="font-serif" style="font-size:16px;font-weight:700">${esc(c.name)}</span>
              <span class="tag">${esc(c.role||'')}</span>
              ${c.age?`<span class="tag">${esc(c.age)}세</span>`:''}
              ${c.gender?`<span class="tag">${esc(c.gender)}</span>`:''}
              ${c.alive&&c.alive!=='생존'?`<span class="tag" style="background:${c.alive==='사망'?'var(--rust-light)':'var(--cream)'};color:${c.alive==='사망'?'var(--rust)':'var(--muted)'};border-color:${c.alive==='사망'?'var(--rust)':'var(--border)'}">${esc(c.alive)}</span>`:''}
            </div>
            ${c.appearance?`<div style="font-size:12px;color:var(--muted);margin-bottom:3px">외모: ${esc(c.appearance)}</div>`:''}
            ${c.personality?`<div style="font-size:13px;color:var(--ink);line-height:1.6;margin-bottom:4px">${esc(c.personality)}</div>`:''}
            ${c.background?`<div style="font-size:12px;color:var(--muted);margin-bottom:4px">배경: ${esc(c.background)}</div>`:''}
            ${c.speech?`<div style="font-size:12px;color:var(--teal)">특징/능력: ${esc(c.speech)}</div>`:''}
            ${c.goal?`<div style="font-size:12px;color:var(--rust)">목표: ${esc(c.goal)}</div>`:''}
            ${c.honorific ? `<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:6px">
              ${c.honorific.split(',').map(h=>h.trim()).filter(Boolean).map(h=>
                `<span style="font-size:11px;color:var(--gold);font-weight:700;
                  background:var(--gold-light);border:1px solid var(--gold);
                  border-radius:20px;padding:2px 10px">${esc(h)}</span>`
              ).join('')}
            </div>` : ''}
          </div>
          <div style="display:flex;gap:6px;flex-shrink:0">
            <button class="btn-icon" onclick="showCharModal(${i})" title="수정">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            <button onclick="deleteChar(${i})" title="삭제"
              style="width:34px;height:34px;border-radius:50%;background:rgba(181,69,27,.1);
                border:none;cursor:pointer;color:var(--rust);font-size:16px;font-weight:700;
                display:flex;align-items:center;justify-content:center">×</button>
          </div>
        </div>
      </div>`;
  };

  let html = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
      <h2 class="font-display">등장인물 <span style="font-size:14px;color:var(--muted);font-family:'Noto Sans KR'">(${chars.length})</span></h2>
      <button class="btn btn-gold" onclick="showCharModal()">＋ 캐릭터 추가</button>
    </div>`;

  // 역할별 폴더 렌더링
  orderedKeys.forEach(roleName => {
    const members = groups[roleName];
    const gKey = 'role_' + roleName;
    const isCollapsed = charGroupCollapsed[gKey] || false;
    html += `<div style="margin-bottom:20px">
      <div class="char-group-folder" data-role="${esc(roleName)}"
        style="display:flex;align-items:center;gap:10px;margin-bottom:${isCollapsed?'0':'10px'};padding:6px 12px;
        background:var(--cream);border-left:3px solid var(--gold);border-radius:0 8px 8px 0;cursor:pointer"
        onclick="toggleCharGroup(${jsArg(roleName)},'role_')">
        <span style="font-size:14px;transition:transform .2s;display:inline-block;transform:rotate(${isCollapsed?'-90':'0'}deg)">▾</span>
        <span style="font-size:13px;font-weight:700;color:var(--ink)">${esc(roleName)}</span>
        <span style="font-size:11px;color:var(--muted)">${members.length}명</span>
      </div>
      ${isCollapsed ? '' : members.map(renderCard).join('')}
    </div>`;
  });

  document.getElementById('main').innerHTML = html;
  updateBadges();
  setTimeout(initCharDrag, 50);
}


function showCharModal(idx, activeTab) {
  const p = getProject();
  const c = idx !== undefined ? p.characters[idx] : {};
  const tab = activeTab || 'basic';
  const isEdit = idx !== undefined;

  // 관계 탭은 저장된 인물(id 있음)에만 의미가 있음 — 신규 생성 시엔 먼저 기본정보 저장 유도
  const canShowRel = isEdit && c.id;

  showModal(`
    <div class="modal-title">${isEdit ? '캐릭터 수정' : '캐릭터 추가'}</div>

    <div style="display:flex;gap:6px;margin-bottom:16px;border-bottom:1px solid var(--border);padding-bottom:10px">
      <button type="button" class="diagram-tab ${tab==='basic'?'active':''}"
        onclick="switchCharModalTab(${idx===undefined?'undefined':idx},'basic')">기본 정보</button>
      <button type="button" class="diagram-tab ${tab==='relation'?'active':''}"
        onclick="${canShowRel?`switchCharModalTab(${idx},'relation')`:`toast('기본 정보를 먼저 저장해주세요.')`}"
        ${canShowRel?'':'style="opacity:0.5"'}>관계</button>
    </div>

    <div id="cm-tab-content">
      ${tab === 'relation' ? renderCharRelationTab(idx) : renderCharBasicTab(idx)}
    </div>

    <div class="modal-footer">
      <button class="btn btn-outline" onclick="closeModal()">취소</button>
      <button class="btn btn-gold" onclick="${tab==='relation'?`saveCharRelation(${idx})`:`saveChar(${idx===undefined?'undefined':idx})`}">저장</button>
    </div>
  `, false);
  if (tab === 'basic') {
    setTimeout(() => document.getElementById('cm-name')?.focus(), 100);
  }
}

function switchCharModalTab(idx, tab) {
  showCharModal(idx, tab);
}

function renderCharBasicTab(idx) {
  const p = getProject();
  const c = idx !== undefined ? p.characters[idx] : {};
  return `
    <div class="form-grid">
      <div><label class="label">이름 *</label><input id="cm-name" value="${esc(c.name||'')}" placeholder="캐릭터 이름"></div>
      <div><label class="label">역할</label><select id="cm-role">${selOpts(ROLES,c.role||'주인공')}</select></div>
      <div><label class="label">나이</label><input id="cm-age" value="${esc(c.age||'')}" placeholder="예: 24"></div>
      <div><label class="label">성별</label>
        <select id="cm-gender">
          ${[['','미지정'],['남','남성'],['여','여성'],['기타','기타']].map(([v,l])=>`<option value="${v}" ${(c.gender||'')=== v?'selected':''}>${l}</option>`).join('')}
        </select>
      </div>
      <div><label class="label">생사 여부</label>
        <select id="cm-alive">
          ${[['생존','생존'],['사망','사망'],['불명','불명'],['불사','불사/불멸']].map(([v,l])=>`<option value="${v}" ${(c.alive||'생존')===v?'selected':''}>${l}</option>`).join('')}
        </select>
      </div>
      <div><label class="label">외모</label><input id="cm-app" value="${esc(c.appearance||'')}" placeholder="예: 은발, 붉은 눈"></div>
      <div class="full"><label class="label">성격</label><textarea id="cm-per" rows="2" placeholder="성격 설명">${esc(c.personality||'')}</textarea></div>
      <div class="full"><label class="label">배경 / 과거</label><textarea id="cm-bg" rows="3" placeholder="캐릭터 배경, 과거, 동기">${esc(c.background||'')}</textarea></div>
      <div class="full"><label class="label">특징과 능력</label><textarea id="cm-sp" rows="2" placeholder="특징, 능력, 말투 등">${esc(c.speech||'')}</textarea></div>
      <div class="full"><label class="label">목표 / 욕망</label><textarea id="cm-goal" rows="2" placeholder="이 인물이 원하는 것, 동기...">${esc(c.goal||'')}</textarea></div>
      <div class="full"><label class="label">칭호</label><input id="cm-title" placeholder="쉼표로 구분 예: 검은 마왕, 성벽의 기사, 불사신" value="${esc(c.honorific||'')}"></div>
      <div class="full">
        <label class="label">카드 색상 <span style="font-size:10px;color:var(--muted)">(없으면 기본 배경)</span></label>
        <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:4px" id="cm-color-group">
          <button type="button" onclick="selectEdgeOpt('cm-color-group',this,'')"
            data-val="" ${!c.color?'data-selected="1"':''}
            style="width:28px;height:28px;border-radius:50%;background:var(--border);
              border:2px solid ${!c.color?'var(--gold)':'var(--border)'};cursor:pointer" title="소속 색 따르기">✕</button>
          ${CHAR_COLORS.map(col=>{
            const sel = c.color===col.v;
            return `<button type="button" onclick="selectEdgeOpt('cm-color-group',this,'${col.v}')"
              data-val="${col.v}" ${sel?'data-selected="1"':''}
              style="width:28px;height:28px;border-radius:50%;background:${col.v};
                border:2px solid ${sel?'var(--gold)':'rgba(0,0,0,.15)'};cursor:pointer" title="${col.label}"></button>`;
          }).join('')}
        </div>
      </div>
    </div>
  `;
}

// ═══════════════════════════════════════════════════════════════
// RELATION TAB — 즉시 저장 방식
// ═══════════════════════════════════════════════════════════════
// 편집 버퍼(_crState)를 쓰지 않는다. 모든 변경은 p.characters[idx] 에 즉시
// 반영되고 autoSave() 된다. 렌더링도 항상 저장된 데이터를 본다.
// 이 구조는 "편집 중 새로고침 / 모달 재열기" 같은 모든 경로에서 일관된 결과를
// 보장한다. 순환 참조 검증은 추가 시점에 수행한다.

function renderCharRelationTab(idx) {
  const p = getProject();
  const c = p.characters[idx];
  if (!c) return '<div style="color:var(--muted)">인물을 찾을 수 없습니다.</div>';

  // 데이터 필드 기본값 보정 (혹시 누락된 경우)
  if (!Array.isArray(c.parents)) c.parents = [];
  if (!Array.isArray(c.spouses)) c.spouses = [];
  if (typeof c.familyId !== 'string') c.familyId = '';

  const others   = (p.characters || []).filter(x => x.id !== c.id);
  const families = p.families || [];
  const byId     = new Map(p.characters.map(x => [x.id, x]));

  // 자손 집합 (부모로 선택 불가)
  const descendants = getDescendantIds(p, c.id);

  // ── 부모: 선택된 사람은 칩으로, 추가는 드롭다운 ──
  const parentChips = c.parents.map(pid => {
    const pp = byId.get(pid);
    if (!pp) return '';
    return `<span style="display:inline-flex;align-items:center;gap:6px;padding:5px 4px 5px 12px;
      background:var(--cream);border:1.5px solid var(--gold);border-radius:20px;
      font-size:12px;font-weight:600;color:var(--ink)">
      ${esc(pp.name)}
      <button type="button" onclick="removeCrParent(${idx}, '${pp.id}')"
        style="width:20px;height:20px;border-radius:50%;background:transparent;
        color:var(--muted);border:none;padding:0;cursor:pointer;font-size:14px;line-height:1"
        title="삭제">✕</button>
    </span>`;
  }).join('');

  // 부모 후보 필터:
  //  - 이미 부모로 등록됨 (중복 방지)
  //  - 내 자손 (순환 방지)
  //  - 내 배우자 (같은 인물이 부모이면서 배우자일 수 없음)
  const currentSpouseIdsSet = new Set(c.spouses.map(s => s.charId));
  const parentCandidates = others.filter(x =>
    !c.parents.includes(x.id) &&
    !descendants.has(x.id) &&
    !currentSpouseIdsSet.has(x.id)
  );

  const parentAdd = parentCandidates.length > 0 ? `
    <div style="display:flex;gap:6px;margin-top:8px">
      <select id="cr-parent-add" style="flex:1">
        <option value="">— 부모 선택 —</option>
        ${parentCandidates.map(x =>
          `<option value="${x.id}">${esc(x.name)}${x.role?` · ${esc(x.role)}`:''}</option>`
        ).join('')}
      </select>
      <button class="btn btn-outline btn-sm" onclick="addCrParent(${idx})">＋ 추가</button>
    </div>` : '';

  const parentEmpty = c.parents.length === 0
    ? '<div style="color:var(--muted);font-size:12px;padding:4px 0">등록된 부모가 없습니다.</div>'
    : '';

  // ── 배우자 ──
  const spouseRows = c.spouses.map((sp, si) => {
    const spouse = byId.get(sp.charId);
    if (!spouse) return '';
    return `<div style="display:flex;gap:8px;align-items:center;padding:8px;border:1px solid var(--border);border-radius:8px;margin-bottom:6px">
      <div style="flex:1;min-width:0">
        <div style="font-weight:700;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(spouse.name)}</div>
        <div style="font-size:11px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(spouse.role||'')}</div>
      </div>
      <select onchange="setCrSpouseStatus(${idx}, ${si}, this.value)" style="font-size:12px;width:auto;flex:none">
        ${[['current','현재'],['past','이별'],['deceased','사별']].map(([v,l])=>`<option value="${v}" ${sp.status===v?'selected':''}>${l}</option>`).join('')}
      </select>
      <button class="btn-icon" onclick="removeCrSpouse(${idx}, ${si})" title="삭제" style="color:var(--rust);flex:none">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>
      </button>
    </div>`;
  }).join('');

  // 배우자 후보 필터:
  //  - 이미 배우자 (중복 방지)
  //  - 내 부모 / 내 조상
  //  - 내 자식 / 내 자손
  //  (직계 혈연은 배우자가 될 수 없음. 방계는 허용 — 사촌 혼인 등 서사 자유도)
  const ancestorIds = getAncestorIds(p, c.id);
  const spouseCandidates = others.filter(x =>
    !currentSpouseIdsSet.has(x.id) &&
    !ancestorIds.has(x.id) &&
    !descendants.has(x.id) &&
    !c.parents.includes(x.id)     // 부모 배열에 있지만 ancestorIds에는 이미 포함됨. 이중 방어
  );

  return `
    <div style="display:flex;flex-direction:column;gap:18px">

      <div>
        <label class="label">소속 가문 / 집단</label>
        <select onchange="setCrFamily(${idx}, this.value)" style="width:100%">
          <option value="">— 없음 —</option>
          ${families.map(f => `<option value="${f.id}" ${c.familyId===f.id?'selected':''}>${esc(f.name)}</option>`).join('')}
        </select>
        ${families.length===0
          ? '<div style="font-size:11px;color:var(--muted);margin-top:4px">아직 가문이 없습니다. "가문" 탭에서 먼저 만들어보세요.</div>'
          : '<div style="font-size:11px;color:var(--gold);margin-top:4px">🔗 선택하면 해당 가문 구성원으로 자동 등록됩니다.</div>'}
      </div>

      <div>
        <label class="label">부모 <span style="font-size:10px;color:var(--muted)">(최대 2명 권장)</span></label>
        <div style="display:flex;flex-wrap:wrap;gap:6px;min-height:8px">
          ${parentChips}
        </div>
        ${parentEmpty}
        ${parentAdd}
      </div>

      <div>
        <label class="label">배우자 / 혼인</label>
        <div>
          ${spouseRows || '<div style="color:var(--muted);font-size:12px;padding:4px 0">등록된 배우자가 없습니다.</div>'}
        </div>
        ${spouseCandidates.length>0?`
        <div style="display:flex;gap:6px;margin-top:8px">
          <select id="cr-spouse-add" style="flex:1">
            <option value="">— 배우자 추가 —</option>
            ${spouseCandidates.map(x => `<option value="${x.id}">${esc(x.name)}</option>`).join('')}
          </select>
          <button class="btn btn-outline btn-sm" onclick="addCrSpouse(${idx})">＋ 추가</button>
        </div>`:''}
      </div>

    </div>
  `;
}

// 편집 중 같은 인물의 모달 내에서 재렌더가 필요할 때 사용
function crRerender(idx) {
  const el = document.getElementById('cm-tab-content');
  if (el) el.innerHTML = renderCharRelationTab(idx);
}

function setCrFamily(idx, familyId) {
  const p = getProject();
  const c = p.characters[idx];
  if (!c) return;
  const oldFamilyId = c.familyId || '';
  const newFamilyId = familyId || '';
  if (oldFamilyId === newFamilyId) return;

  // 이전 가문에서 이 인물 제거 (charId 기반)
  if (oldFamilyId) {
    const oldFam = (p.families || []).find(f => f.id === oldFamilyId);
    if (oldFam && oldFam.groups) {
      Object.keys(oldFam.groups).forEach(tab => {
        const list = oldFam.groups[tab];
        if (!Array.isArray(list)) return;
        oldFam.groups[tab] = list.filter(m => !(m && m.charId === c.id));
      });
    }
  }

  c.familyId = newFamilyId;

  // 새 가문에 자동 추가 (charId 연결 포함)
  if (newFamilyId) {
    addCharToFamily(p, c.id, newFamilyId);
  }
  autoSave();
}

function addCrParent(idx) {
  const p = getProject();
  const c = p.characters[idx];
  if (!c) return;
  const sel = document.getElementById('cr-parent-add');
  const id = sel?.value;
  if (!id) return;
  if (!Array.isArray(c.parents)) c.parents = [];
  if (c.parents.includes(id)) return;

  // 배우자를 부모로 지정 금지
  if (Array.isArray(c.spouses) && c.spouses.some(s => s.charId === id)) {
    const name = (p.characters||[]).find(x => x.id === id)?.name || '해당 인물';
    toast(`${name}은(는) 배우자로 등록되어 있어 부모로 지정할 수 없습니다.`);
    return;
  }

  // 순환 참조 검증 (자기 자신, 자손)
  const check = validateParentAssignment(p, c.id, [...c.parents, id]);
  if (!check.ok) {
    toast(check.reason);
    return;
  }

  c.parents.push(id);
  if (c.parents.length > 2) {
    toast('부모는 최대 2명까지 권장합니다.');
  }
  autoSave();
  crRerender(idx);
}

function removeCrParent(idx, parentId) {
  const p = getProject();
  const c = p.characters[idx];
  if (!c || !Array.isArray(c.parents)) return;
  c.parents = c.parents.filter(x => x !== parentId);
  autoSave();
  crRerender(idx);
}

function addCrSpouse(idx) {
  const p = getProject();
  const c = p.characters[idx];
  if (!c) return;
  const sel = document.getElementById('cr-spouse-add');
  const id = sel?.value;
  if (!id) return;
  if (!Array.isArray(c.spouses)) c.spouses = [];
  if (c.spouses.some(s => s.charId === id)) return;

  // 직계 혈연 금지 검증
  if (Array.isArray(c.parents) && c.parents.includes(id)) {
    const name = (p.characters||[]).find(x => x.id === id)?.name || '해당 인물';
    toast(`${name}은(는) 부모로 등록되어 있어 배우자로 지정할 수 없습니다.`);
    return;
  }
  const ancestors = getAncestorIds(p, c.id);
  if (ancestors.has(id)) {
    const name = (p.characters||[]).find(x => x.id === id)?.name || '해당 인물';
    toast(`${name}은(는) 이 인물의 조상이라 배우자로 지정할 수 없습니다.`);
    return;
  }
  const descendants = getDescendantIds(p, c.id);
  if (descendants.has(id)) {
    const name = (p.characters||[]).find(x => x.id === id)?.name || '해당 인물';
    toast(`${name}은(는) 이 인물의 후손이라 배우자로 지정할 수 없습니다.`);
    return;
  }

  const nextSpouses = [...c.spouses, { id: uid(), charId: id, status: 'current', note: '' }];
  syncSpouseLinks(p, c.id, nextSpouses);
  autoSave();
  crRerender(idx);
}

function removeCrSpouse(idx, si) {
  const p = getProject();
  const c = p.characters[idx];
  if (!c || !Array.isArray(c.spouses)) return;
  const nextSpouses = c.spouses.filter((_, i) => i !== si);
  syncSpouseLinks(p, c.id, nextSpouses);
  autoSave();
  crRerender(idx);
}

function setCrSpouseStatus(idx, si, status) {
  const p = getProject();
  const c = p.characters[idx];
  if (!c || !Array.isArray(c.spouses) || !c.spouses[si]) return;
  c.spouses[si].status = status;
  // 상대방 쪽 status 는 자동 동기화하지 않는다 (각자 독립)
  autoSave();
}

function saveCharRelation(idx) {
  // 관계 탭은 즉시 저장이므로 별도 저장 없이 닫기만 한다.
  // 분기 이동(등장인물 탭으로 가는 것)을 피하기 위해 render 호출도 생략.
  closeModal();
  toast('저장되었습니다.');
}

function saveChar(idx) {
  const name = document.getElementById('cm-name').value.trim();
  if (!name) { toast('이름을 입력해주세요.'); return; }
  const existing = idx !== undefined ? getProject().characters[idx] : null;
  const c = {
    id: existing ? existing.id : uid(),
    name, role: document.getElementById('cm-role').value,
    group: '',
    age: document.getElementById('cm-age').value,
    appearance: document.getElementById('cm-app').value,
    personality: document.getElementById('cm-per').value,
    background: document.getElementById('cm-bg').value,
    speech: document.getElementById('cm-sp').value,
    honorific: document.getElementById('cm-title')?.value || '',
    gender: document.getElementById('cm-gender')?.value || '',
    alive: document.getElementById('cm-alive')?.value || '생존',
    goal: document.getElementById('cm-goal')?.value || '',
    color: document.querySelector('#cm-color-group [data-selected]')?.dataset?.val || '',
    // 관계 필드는 "관계" 탭에서만 수정됨 → 기본 정보 저장 시 기존 값 보존
    parents:  existing && Array.isArray(existing.parents)  ? existing.parents  : [],
    spouses:  existing && Array.isArray(existing.spouses)  ? existing.spouses  : [],
    familyId: existing && typeof existing.familyId === 'string' ? existing.familyId : '',
  };
  const p = getProject();
  if (idx !== undefined) p.characters[idx] = c;
  else p.characters.push(c);
  // 이 인물과 연결된 가문 멤버(들)의 이름/나이/성별/생사 동기화
  if (c.id && Array.isArray(p.families)) {
    p.families.forEach(f => {
      if (!f || !f.groups) return;
      Object.keys(f.groups).forEach(tab => {
        const list = f.groups[tab];
        if (!Array.isArray(list)) return;
        list.forEach(m => {
          if (m && m.charId === c.id) {
            m.name = c.name;
            m.age = c.age;
            m.gender = c.gender;
            m.alive = c.alive;
          }
        });
      });
    });
  }
  autoSave(); closeModal();
  // 참고 패널이 열려있으면 패널만 갱신, 아니면 현재 탭을 재렌더
  const splitPanel = document.getElementById('split-panel');
  const inSplitPanel = splitPanel && !splitPanel.classList.contains('hidden');
  const inFocus = document.getElementById('focus-overlay')?.classList.contains('active');
  if ((inSplitPanel || inFocus) && (splitTab === 'characters' || splitTab === 'relations' || _focusRefTab === 'relations')) {
    refreshSplitPanel();
  } else if (!inFocus) {
    // 가계도 등 다른 탭에서 편집했다면 해당 탭을 유지한 채 갱신
    if (state.activeTab === 'familytree') {
      renderFamilyTree();
    } else if (state.activeTab === 'characters') {
      renderCharacters();
    } else {
      // 기타 탭에서 열었다면 현재 탭을 유지 (추가 갱신 불필요)
    }
  }
  toast(idx !== undefined ? '수정했습니다.' : '캐릭터를 추가했습니다!');
}

function deleteChar(idx) {
  confirmDialog('이 캐릭터를 삭제합니다.', () => {
    const p = getProject();
    const removedId = p.characters[idx]?.id;
    p.characters.splice(idx, 1);
    // 다른 인물의 parents/spouses 및 가계도의 rootIds/overrides 에서 참조 제거
    if (removedId) cleanupCharacterReferences(p, removedId);
    autoSave();
    // 현재 탭 유지
    if (state.activeTab === 'familytree') renderFamilyTree();
    else renderCharacters();
    toast('캐릭터를 삭제했어요.');
  });
}

// ═══════════════════════════════════════════════════════════════
// RELATIONS
// ═══════════════════════════════════════════════════════════════
function renderRelations() {
  const p = getProject();
  const chars = p.characters || [];
  const rels = p.relations || [];
  const charOpts = chars.map(c => `<option value="${esc(c.name)}">${esc(c.name)}</option>`).join('');

  const relList = rels.length === 0
    ? `<div style="text-align:center;padding:32px;color:var(--muted)">관계를 추가해보세요.</div>`
    : rels.map((r,i) => `
      <div class="rel-row">
        <span class="rel-from">${esc(r.from)}</span>
        <span class="rel-arrow">${esc(r.type)}</span>
        <span class="rel-to">${esc(r.to)}</span>
        <button class="btn-icon" onclick="deleteRelation(${i})" style="color:var(--rust);margin-left:auto">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>`).join('');

  document.getElementById('main').innerHTML = `
    <div style="max-width:780px;margin:0 auto">
      <div class="font-display" style="font-size:22px;margin-bottom:22px">인물 관계도</div>
      ${chars.length < 2
        ? `<div class="card empty-state"><div class="emoji">🔗</div><p>등장인물을 2명 이상 추가하면<br>관계를 설정할 수 있습니다.</p></div>`
        : `
        <div class="card" style="margin-bottom:16px">
          <div class="sec-title">관계 추가</div>
          <div class="form-grid" style="align-items:end">
            <div><label class="label">인물 A</label><select id="rel-from"><option value="">선택</option>${charOpts}</select></div>
            <div><label class="label">관계 유형</label><input id="rel-type" placeholder="예: 연인, 라이벌, 스승, 형제"></div>
            <div><label class="label">인물 B</label><select id="rel-to"><option value="">선택</option>${charOpts}</select></div>
            <div><button class="btn btn-gold" style="width:100%" onclick="addRelation()">추가</button></div>
          </div>
        </div>
        <div class="card">
          <div class="sec-title">관계 목록</div>
          <div class="rel-map">${relList}</div>
        </div>`}
    </div>`;
}

function addRelation() {
  const from = document.getElementById('rel-from').value;
  const to = document.getElementById('rel-to').value;
  const type = document.getElementById('rel-type').value.trim();
  if (!from || !to || !type) { toast('인물과 관계 유형을 모두 입력해주세요.'); return; }
  if (from === to) { toast('같은 인물은 선택할 수 없습니다.'); return; }
  const p = getProject();
  if (!p.relations) p.relations = [];
  p.relations.push({from, to, type});
  autoSave(); renderRelations();
}
function deleteRelation(i) {
  getProject().relations.splice(i,1);
  autoSave(); renderRelations();
  toast('관계를 삭제했어요.');
}

// ═══════════════════════════════════════════════════════════════
// WORLD
// ═══════════════════════════════════════════════════════════════
function renderWorld() {
  const p = getProject();
  const items = p.worldSettings || [];
  // worldTimeline id 보정
  if (p.worldTimeline) {
    let _fixed = false;
    p.worldTimeline.forEach(e => { if (!e.id) { e.id = uid(); _fixed = true; } });
    if (_fixed) autoSave();
  }
  const events = (p.worldTimeline || []).slice().sort((a,b) => (a.year||0) - (b.year||0));
  const cats = getWorldCats(p.genre);
  const grouped = {};
  cats.forEach(c => { grouped[c] = items.filter(i => i.category === c); });
  items.forEach(i => { if (!grouped[i.category]) grouped[i.category] = items.filter(x => x.category === i.category); });

  // 타임라인 HTML
  const TL_COLOR_MAP = {
    '전쟁':'#e06040','정치':'#7986cb','재앙':'#546e7a',
    '문화':'#4caf50','종교':'#ab47bc','경제':'#c4922a','기타':'#9a8e7f'
  };
  let timelineHtml = '';
  if (events.length === 0) {
    timelineHtml = `<div style="text-align:center;padding:20px;color:var(--muted);font-size:13px">사건을 추가해보세요</div>`;
  } else {
    const minY = events[0].year || 0;
    const maxY = events[events.length-1].year || 0;
    const range = Math.max(maxY - minY, 1);

    // 연도별 그룹핑
    const yearGroups = {};
    events.forEach((ev, ei) => {
      const key = ev.year;
      if (!yearGroups[key]) yearGroups[key] = [];
      yearGroups[key].push({ev, ei});
    });
    const uniqueYears = Object.keys(yearGroups).map(Number).sort((a,b)=>a-b);

    // 그룹당 최대 노드 수로 높이 결정
    const maxStack = Math.max(...Object.values(yearGroups).map(g=>g.length));
    const DOT = 20; // 점 크기
    const GAP = 10;  // 점 간격
    const TOUCH = 44; // 터치 영역 크기
    const LINE_Y = 40; // 가로선 y위치 (상단에서 px)
    const totalH = LINE_Y + 16 + (maxStack - 1) * (DOT + GAP) + 40; // 선 위 라벨 + 아래 점들

    const minWidth = Math.max(uniqueYears.length * 100, 400);

    let nodesHtml = '';
    uniqueYears.forEach(yr => {
      const pct = range === 0 ? 50 : ((yr - minY) / range * 86 + 7);
      const group = yearGroups[yr];
      // 연도 라벨
      nodesHtml += `<div style="position:absolute;left:${pct}%;transform:translateX(-50%);
        top:${LINE_Y - 22}px;font-size:10px;color:var(--muted);text-align:center;white-space:nowrap">
        ${esc(String(group[0].ev.yearLabel || yr))}</div>`;
      // 가로선 위 점
      nodesHtml += `<div style="position:absolute;left:${pct}%;top:${LINE_Y - 5}px;
        transform:translateX(-50%);width:2px;height:10px;background:var(--border)"></div>`;
      // 각 사건 점
      group.forEach(({ev, ei}, si) => {
        const color = TL_COLOR_MAP[ev.type] || TL_COLOR_MAP['기타'];
        const dotTop = LINE_Y + 8 + si * (DOT + GAP);
        const evIdEsc = esc(ev.id||'');
        nodesHtml += `
          <button class="tl-node" data-ei="${ei}"
            style="position:absolute;left:${pct}%;top:${dotTop - (TOUCH-DOT)/2}px;
              transform:translateX(-50%);
              width:${TOUCH}px;height:${TOUCH}px;
              display:flex;align-items:center;justify-content:center;
              background:transparent;border:none;
              cursor:pointer;z-index:2;padding:0;-webkit-tap-highlight-color:transparent;"
            title="${esc(ev.title)}"
            onclick="toggleTlDetail('tld-${evIdEsc}')">
            <div style="width:${DOT}px;height:${DOT}px;border-radius:50%;
              background:${color};border:2px solid var(--paper);
              box-shadow:0 2px 6px var(--shadow);pointer-events:none;
              transition:transform .15s"
              onmouseenter="this.style.transform='scale(1.3)'"
              onmouseleave="this.style.transform='scale(1)'"></div>
          </button>`;
      });
    });

    timelineHtml = `
      <div style="position:relative;overflow-x:auto;padding-bottom:8px">
        <div style="position:relative;min-width:${minWidth}px;height:${totalH}px;margin-bottom:8px">
          <!-- 가로선 -->
          <div style="position:absolute;top:${LINE_Y}px;left:3%;right:3%;height:2px;background:var(--border)"></div>
          ${nodesHtml}
        </div>
        <!-- 범례 -->
        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:4px">
          ${Object.entries(TL_COLOR_MAP).map(([t,c])=>`
            <span style="display:flex;align-items:center;gap:4px;font-size:11px;color:var(--muted)">
              <span style="width:8px;height:8px;border-radius:50%;background:${c};display:inline-block"></span>${t}
            </span>`).join('')}
        </div>
        <!-- 상세 카드 (접힘) -->
        <div style="margin-top:14px;border-top:1px solid var(--border);padding-top:12px;display:flex;flex-direction:column;gap:8px">
          ${events.map((ev, ei) => {
            const color = TL_COLOR_MAP[ev.type] || TL_COLOR_MAP['기타'];
            const evIdEsc = esc(ev.id||'');
            return `
            <div id="tld-${evIdEsc}" style="display:none;border:1.5px solid ${color};border-radius:10px;overflow:hidden">
              <div style="padding:10px 14px;background:${color}18;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
                <div>
                  <span style="font-weight:700;font-size:14px;color:${color}">${esc(ev.title)}</span>
                  <span style="font-size:11px;color:var(--muted);margin-left:8px">${esc(ev.yearLabel||String(ev.year))} · ${esc(ev.type)}</span>
                </div>
                <div style="display:flex;gap:6px">
                  <button class="btn btn-outline btn-sm" onclick="showTimelineModal('${evIdEsc}')" style="font-size:11px">✏️ 수정</button>
                  <button class="btn btn-danger btn-sm" onclick="deleteTimeline('${evIdEsc}')" style="font-size:11px">🗑️ 삭제</button>
                </div>
              </div>
              <div style="padding:10px 14px;font-size:13px;line-height:1.7">
                ${ev.desc ? `<div style="color:var(--muted);margin-bottom:8px;white-space:pre-wrap">${esc(ev.desc)}</div>` : ''}
                <div style="display:flex;gap:16px;flex-wrap:wrap">
                  ${ev.chars ? `<div style="font-size:12px"><span style="color:var(--muted)">👤 인물</span> ${esc(ev.chars)}</div>` : ''}
                  ${ev.place ? `<div style="font-size:12px"><span style="color:var(--muted)">📍 장소</span> ${esc(ev.place)}</div>` : ''}
                </div>
              </div>
            </div>`;
          }).join('')}
        </div>
      </div>`;
  }

  let html = '';
  const allCats = [...cats, ...Object.keys(grouped).filter(c => !cats.includes(c))];
  allCats.forEach(cat => {
    const catItems = grouped[cat] || [];
    if (catItems.length === 0) return;
    html += `<div style="margin-bottom:20px">
      <div style="font-family:'Noto Serif KR',serif;font-size:13px;font-weight:600;color:var(--muted);margin-bottom:10px;letter-spacing:1px">${esc(cat)}</div>
      <div style="display:grid;gap:10px">
        ${catItems.map(w => {
          const idx = items.findIndex(i => i.id === w.id);
          return `
          <div class="card card-sm" style="padding:0;overflow:hidden">
            <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;background:var(--cream);cursor:pointer;user-select:none" onclick="(function(el){var body=el.parentElement.querySelector('.world-main-body');var arrow=el.querySelector('.world-main-arrow');var isHidden=body.style.display==='none';body.style.display=isHidden?'':'none';arrow.style.transform=isHidden?'rotate(0deg)':'rotate(-90deg)'})(this)">
              <div style="font-weight:700;font-size:14px">${esc(w.title)}</div>
              <div style="display:flex;align-items:center;gap:6px">
                <span class="world-main-arrow" style="color:var(--muted);font-size:10px;transition:transform .2s;display:inline-block;transform:rotate(-90deg)">▼</span>
                <button class="btn-icon" onclick="event.stopPropagation();showWorldModal(${idx})" style="width:28px;height:28px">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                </button>
                <button onclick="event.stopPropagation();deleteWorld(${idx})" title="삭제"
                  style="width:28px;height:28px;border-radius:50%;background:rgba(181,69,27,.1);
                    border:none;cursor:pointer;color:var(--rust);font-size:15px;font-weight:700;
                    display:flex;align-items:center;justify-content:center">×</button>
              </div>
            </div>
            <div class="world-main-body" style="padding:10px 14px;color:var(--muted);font-size:13px;line-height:1.7;white-space:pre-wrap;display:none">${esc(w.content)}</div>
          </div>`;
        }).join('')}
      </div>
    </div>`;
  });

  document.getElementById('main').innerHTML = `
    <div style="max-width:900px;margin:0 auto">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:22px">
        <div class="font-display" style="font-size:22px">세계관 설정 (${items.length})</div>
        <button class="btn btn-gold" onclick="showWorldModal()">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          설정 추가
        </button>
      </div>

      <!-- 역사 타임라인 -->
      <div class="card" style="margin-bottom:24px;padding:0;overflow:hidden">
        <div style="display:flex;justify-content:space-between;align-items:center;
          padding:12px 18px;background:var(--cream);cursor:pointer;user-select:none"
          onclick="(function(el){
            var body=document.getElementById('timeline-body');
            var arrow=el.querySelector('.tl-collapse-arrow');
            var isHidden=body.style.display==='none';
            body.style.display=isHidden?'':'none';
            arrow.style.transform=isHidden?'rotate(0deg)':'rotate(-90deg)';
          })(this)">
          <span class="font-display" style="font-size:16px">⏳ 타임라인 (${events.length})</span>
          <div style="display:flex;align-items:center;gap:8px" onclick="event.stopPropagation()">
            <button class="btn btn-outline btn-sm" onclick="showTimelineModal()">＋ 사건 추가</button>
            <span class="tl-collapse-arrow" style="color:var(--muted);font-size:11px;
              transition:transform .2s;display:inline-block;cursor:pointer"
              onclick="event.stopPropagation();this.closest('.card').querySelector('[onclick*=timeline-body]').click()">▼</span>
          </div>
        </div>
        <div id="timeline-body" style="padding:16px 18px">
          ${timelineHtml}
        </div>
      </div>

      ${items.length === 0
        ? `<div class="card empty-state"><div class="emoji">🌍</div><p>세계관 설정을 추가해보세요.</p></div>`
        : html}
    </div>`;
}

function toggleTlDetail(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.style.display = el.style.display === 'none' ? 'block' : 'none';
}



// 타임라인
const TL_TYPES = ['전쟁','정치','재앙','문화','종교','경제','기타'];
function showTimelineModal(id) {
  const p = getProject();
  const ev = id ? (p.worldTimeline||[]).find(e => e.id === id) : null;
  const isEdit = !!ev;
  const evData = ev || {};
  const idEsc = esc(id||'');
  showModal(`
    <div class="modal-title">${isEdit ? '사건 수정' : '사건 추가'}</div>
    <div class="form-grid">
      <div><label class="label">표시 연도/시기 *</label>
        <input id="tl-year" value="${esc(evData.yearLabel||String(evData.year??''))}" placeholder="예: 건국 3년차, 300년 전, B.C 12"></div>
      <div><label class="label">정렬 순서 (숫자) *<span style="font-size:10px;color:var(--muted);font-weight:400"> 작을수록 왼쪽</span></label>
        <input id="tl-order" type="number" value="${evData.year??''}" placeholder="예: -300, 1, 100"></div>
      <div><label class="label">사건 종류</label>
        <select id="tl-type">${TL_TYPES.map(t=>`<option value="${t}" ${evData.type===t?'selected':''}>${t}</option>`).join('')}</select></div>
      <div class="full"><label class="label">사건명 *</label>
        <input id="tl-title" value="${esc(evData.title||'')}" placeholder="사건 이름"></div>
      <div class="full"><label class="label">설명</label>
        <textarea id="tl-desc" rows="3" placeholder="사건의 내용과 결과">${esc(evData.desc||'')}</textarea></div>
      <div><label class="label">관련 인물</label>
        <input id="tl-chars" value="${esc(evData.chars||'')}" placeholder="예: 영희, 철수"></div>
      <div><label class="label">관련 장소</label>
        <input id="tl-place" value="${esc(evData.place||'')}" placeholder="예: 수도 아르켄"></div>
    </div>
    <div class="modal-footer">
      ${isEdit ? `<button class="btn btn-danger btn-sm" onclick="deleteTimeline('${idEsc}')">삭제</button>` : ''}
      <button class="btn btn-outline" onclick="closeModal()">취소</button>
      <button class="btn btn-gold" onclick="saveTimeline('${idEsc}')">저장</button>
    </div>`, false);
  setTimeout(() => document.getElementById('tl-year')?.focus(), 100);
}
function saveTimeline(id) {
  const title = document.getElementById('tl-title').value.trim();
  const yearRaw = document.getElementById('tl-year').value.trim();
  const orderRaw = document.getElementById('tl-order').value.trim();
  if (!title || !yearRaw || orderRaw === '') { toast('표시 연도, 정렬 순서, 사건명을 입력해주세요.'); return; }
  const yearNum = parseFloat(orderRaw);
  const p = getProject();
  if (!p.worldTimeline) p.worldTimeline = [];
  const existingIdx = id ? p.worldTimeline.findIndex(e => e.id === id) : -1;
  const isEdit = existingIdx >= 0;
  const ev = {
    id: isEdit ? p.worldTimeline[existingIdx].id : uid(),
    year: yearNum, yearLabel: yearRaw, title,
    type: document.getElementById('tl-type').value,
    desc: document.getElementById('tl-desc').value,
    chars: document.getElementById('tl-chars').value,
    place: document.getElementById('tl-place').value,
  };
  if (isEdit) p.worldTimeline[existingIdx] = ev;
  else p.worldTimeline.push(ev);
  autoSave(); closeModal(); renderWorld();
}
function deleteTimeline(id) {
  const p = getProject();
  const i = p?.worldTimeline?.findIndex(e => e.id === id) ?? -1;
  if (i < 0) return;
  p.worldTimeline.splice(i, 1);
  autoSave(); closeModal(); renderWorld();
  toast('사건을 삭제했어요.');
}

function showWorldModal(idx) {
  const p = getProject();
  const w = idx !== undefined ? p.worldSettings[idx] : {};
  const cats = getWorldCats(p.genre);
  const defaultCat = w.category || cats[0];
  // 지리 계층과 공통 카테고리 구분해서 optgroup으로 표시
  const geo = WORLD_CATS_GEO[p.genre] || WORLD_CATS_GEO['기타'];
  const catOpts = `
    <optgroup label="📍 지리/장소">
      ${geo.map(c => `<option value="${c}" ${defaultCat===c?'selected':''}>${c}</option>`).join('')}
    </optgroup>
    <optgroup label="📚 공통 설정">
      ${WORLD_CATS_COMMON.map(c => `<option value="${c}" ${defaultCat===c?'selected':''}>${c}</option>`).join('')}
    </optgroup>`;
  showModal(`
    <div class="modal-title">${idx !== undefined ? '설정 수정' : '설정 추가'}</div>
    <div style="margin-bottom:12px"><label class="label">항목명 *</label><input id="wm-title" value="${esc(w.title||'')}" placeholder="설정 이름"></div>
    <div style="margin-bottom:12px"><label class="label">카테고리</label><select id="wm-cat">${catOpts}</select></div>
    <div style="margin-bottom:20px"><label class="label">내용</label><textarea id="wm-content" rows="6" placeholder="설정 내용을 자세히 설명하세요">${esc(w.content||'')}</textarea></div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="closeModal()">취소</button>
      <button class="btn btn-gold" onclick="saveWorld(${idx})">저장</button>
    </div>
  `, false);
  setTimeout(() => document.getElementById('wm-title')?.focus(), 100);
}

function saveWorld(idx) {
  const title = document.getElementById('wm-title').value.trim();
  if (!title) { toast('항목명을 입력해주세요.'); return; }
  const w = {
    id: idx !== undefined ? getProject().worldSettings[idx].id : uid(),
    title, category: document.getElementById('wm-cat').value,
    content: document.getElementById('wm-content').value,
  };
  const p = getProject();
  if (idx !== undefined) p.worldSettings[idx] = w;
  else p.worldSettings.push(w);
  autoSave(); closeModal();
  const _sp = document.getElementById('split-panel');
  const _inSp = _sp && !_sp.classList.contains('hidden') && splitTab === 'world';
  const _inFocus = document.getElementById('focus-overlay')?.classList.contains('active');
  if (_inFocus) { refreshSplitPanel(); }
  else if (_inSp) { renderSplitContent(); }
  else { renderWorld(); }
}
function deleteWorld(idx) {
  confirmDialog('이 세계관 설정을 삭제합니다.', () => {
    getProject().worldSettings.splice(idx,1);
    autoSave();
    const _inFocus = document.getElementById('focus-overlay')?.classList.contains('active');
    if (_inFocus) refreshSplitPanel(); else renderWorld();
    toast('설정을 삭제했어요.');
  });
}

// ═══════════════════════════════════════════════════════════════
// PLOT
// ═══════════════════════════════════════════════════════════════
let plotViewMode = 'arcs';

function setPlotViewMode(mode) {
  plotViewMode = mode === 'flow' ? 'flow' : 'arcs';
  renderPlot();
}

function buildPlotFlow(project) {
  const chapters = (project.chapters || []).filter(c => !c.isFolder);
  const groups = chapters.map((chapter, index) => ({ chapter, number: index + 1, scenes: [] }));
  const byChapter = new Map(groups.map(group => [group.chapter.id, group]));
  const unlinked = [];
  (project.arcs || []).forEach((arc, arcIndex) => {
    (arc.scenes || []).forEach((scene, sceneIndex) => {
      const entry = { scene, arc, arcIndex, sceneIndex };
      const group = byChapter.get(scene.chapterId);
      if (group) group.scenes.push(entry);
      else unlinked.push(entry);
    });
  });
  return { groups, unlinked };
}

function renderPlotFlow(project) {
  const { groups, unlinked } = buildPlotFlow(project);
  const sceneCard = ({ scene, arc, arcIndex, sceneIndex }) => `
    <button class="plot-flow-scene" onclick="showSceneModal(${arcIndex},${sceneIndex})" title="장면 수정">
      <span class="plot-flow-scene-heading"><strong>${esc(scene.title)}</strong><span class="scene-card-type">${esc(scene.type || '')}</span></span>
      <span class="plot-flow-arc">${esc(arc.title)} · 장면 ${sceneIndex + 1}</span>
      ${scene.summary ? `<span class="plot-flow-summary">${esc(scene.summary)}</span>` : ''}
    </button>`;
  return `
    <p class="plot-flow-help">화 순서로 연결된 장면을 확인하세요. 같은 화의 장면은 아크와 아크 내 장면 순서로 표시됩니다. 장면을 누르면 연결된 화를 바꿀 수 있습니다.</p>
    <div class="plot-flow-list">
      ${groups.map(group => `
        <section class="plot-flow-group">
          <div class="plot-flow-heading">
            <span><strong>${group.number}화 · ${esc(group.chapter.title)}</strong><small>장면 ${group.scenes.length}개</small></span>
            <button class="btn btn-outline btn-sm" onclick="gotoChapterFromScene('${esc(group.chapter.id)}')">집필로 이동</button>
          </div>
          ${group.scenes.length
            ? `<div class="plot-flow-scenes">${group.scenes.map(sceneCard).join('')}</div>`
            : '<p class="plot-flow-empty">연결된 장면이 없습니다.</p>'}
        </section>`).join('')}
      <section class="plot-flow-group plot-flow-unlinked">
        <div class="plot-flow-heading"><span><strong>화에 연결되지 않은 장면</strong><small>장면 ${unlinked.length}개</small></span></div>
        ${unlinked.length
          ? `<div class="plot-flow-scenes">${unlinked.map(sceneCard).join('')}</div>`
          : '<p class="plot-flow-empty">연결되지 않은 장면이 없습니다.</p>'}
      </section>
    </div>`;
}

function renderPlot() {
  const p = getProject();
  const arcs = p.arcs || [];
  const chList = (p.chapters || []).filter(c => !c.isFolder);
  const chapterById = new Map();
  chList.forEach((c, i) => chapterById.set(c.id, { num: i + 1, title: c.title }));

  const cols = arcs.map((a, ai) => {
  const scenes = (a.scenes || []).map((s, si) => {
    const linkedCh = s.chapterId ? chapterById.get(s.chapterId) : null;
    const chapterLink = linkedCh
      ? `<div style="font-size:10px;color:var(--gold);margin-top:4px;cursor:pointer" onclick="event.stopPropagation();gotoChapterFromScene('${esc(s.chapterId)}')" title="이 화로 이동"><span style="text-decoration:underline">🔗 ${linkedCh.num}화 · ${esc(linkedCh.title)}</span></div>`
      : '';
    return `
      <div class="scene-row" data-ai="${ai}" data-si="${si}" style="position:relative;margin-bottom:8px">
        <div class="scene-card" style="margin-bottom:0;padding-left:28px${linkedCh?';border-left:3px solid var(--gold)':''}" onclick="showSceneModal(${ai},${si})">
          <span class="scene-handle" data-ai="${ai}" data-si="${si}"
            style="position:absolute;left:6px;top:50%;transform:translateY(-50%);
              color:var(--border);font-size:16px;cursor:grab;padding:4px;
              touch-action:none;user-select:none;line-height:1">⠿</span>
          <span class="font-display" style="color:var(--gold);font-size:11px">#${si+1}</span>
          <div class="scene-card-title">${esc(s.title)}</div>
          <span class="scene-card-type">${esc(s.type||'')}</span>
          ${s.summary?`<div style="color:var(--muted);margin-top:4px;font-size:11px;line-height:1.5;white-space:pre-wrap">${esc(s.summary)}</div>`:''}
          ${chapterLink}
        </div>
        <button
          style="position:absolute;top:6px;right:6px;width:22px;height:22px;border-radius:50%;
            background:rgba(181,69,27,0.12);border:none;cursor:pointer;
            display:flex;align-items:center;justify-content:center;z-index:10;
            color:var(--rust);font-size:13px;font-weight:700;line-height:1"
          onclick="event.stopPropagation();deleteScene(${ai},${si})">×</button>
      </div>`;
  }).join('');

    return `
      <div class="arc-col" data-ai="${ai}">
        <div class="arc-col-header" style="flex-direction:column;align-items:flex-start;gap:4px">
          <div style="display:flex;justify-content:space-between;align-items:center;width:100%">
            <span class="arc-col-title">${esc(a.title)}</span>
            <div style="display:flex;gap:4px">
              <button class="btn-icon" onclick="showArcModal(${ai})" style="width:28px;height:28px">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              </button>
              <button class="btn-icon" onclick="deleteArc(${ai})" style="color:var(--rust);width:28px;height:28px">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
              </button>
            </div>
          </div>
          ${a.description ? `<div style="font-size:11px;color:var(--muted);font-weight:400;line-height:1.5;white-space:pre-wrap">${esc(a.description)}</div>` : ''}
        </div>
        ${scenes}
        <button class="btn btn-outline btn-sm" style="width:100%;justify-content:center;margin-top:4px" onclick="showSceneModal(${ai})">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          장면 추가
        </button>
      </div>`;
  }).join('');

  document.getElementById('main').innerHTML = `
    <div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:22px">
        <div class="font-display" style="font-size:22px">플롯 구성</div>
        <button class="btn btn-gold" onclick="showArcModal()">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          아크 추가
        </button>
      </div>
      ${arcs.length === 0
        ? `<div class="card empty-state"><div class="emoji">🗺️</div><p>스토리 아크를 추가하고<br>장면을 구성해보세요.</p></div>`
        : `<div class="plot-view-switch" role="group" aria-label="플롯 보기 방식">
            <button class="plot-view-button ${plotViewMode === 'arcs' ? 'active' : ''}" aria-pressed="${plotViewMode === 'arcs'}" onclick="setPlotViewMode('arcs')">아크별 보기</button>
            <button class="plot-view-button ${plotViewMode === 'flow' ? 'active' : ''}" aria-pressed="${plotViewMode === 'flow'}" onclick="setPlotViewMode('flow')">전체 흐름</button>
          </div>
          ${plotViewMode === 'flow' ? renderPlotFlow(p) : `<div class="arc-list">${cols}</div>`}`}
    </div>`;
  if (plotViewMode === 'arcs') setTimeout(initSceneDrag, 50);
}

function showArcModal(idx) {
  const p = getProject();
  const a = idx !== undefined ? p.arcs[idx] : {};
  showModal(`
    <div class="modal-title">${idx !== undefined ? '아크 수정' : '아크 추가'}</div>
    <div style="margin-bottom:12px"><label class="label">아크 이름 *</label><input id="am-title" value="${esc(a.title||'')}" placeholder="예: 1부 - 각성편"></div>
    <div style="margin-bottom:20px"><label class="label">설명</label><textarea id="am-desc" rows="3" placeholder="이 아크의 주요 사건">${esc(a.description||'')}</textarea></div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="closeModal()">취소</button>
      <button class="btn btn-gold" onclick="saveArc(${idx})">저장</button>
    </div>
  `, false);
  setTimeout(() => document.getElementById('am-title')?.focus(), 100);
}
function saveArc(idx) {
  const title = document.getElementById('am-title').value.trim();
  if (!title) { toast('아크 이름을 입력해주세요.'); return; }
  const a = { id: idx !== undefined ? getProject().arcs[idx].id : uid(), title, description: document.getElementById('am-desc').value, scenes: idx !== undefined ? getProject().arcs[idx].scenes : [] };
  const p = getProject();
  if (idx !== undefined) p.arcs[idx] = a;
  else p.arcs.push(a);
  autoSave(); closeModal(); renderPlot();
}
function deleteArc(idx) {
  confirmDialog('이 아크와 모든 장면을 삭제합니다.', () => {
    getProject().arcs.splice(idx,1);
    autoSave(); renderPlot();
    toast('아크를 삭제했어요.');
  });
}

function showSceneModal(arcIdx, sceneIdx) {
  const p = getProject();
  const s = sceneIdx !== undefined ? p.arcs[arcIdx].scenes[sceneIdx] : {};
  const chapters = (p.chapters || []).filter(c => !c.isFolder);
  const chapterOpts = chapters.map((c, i) =>
    `<option value="${c.id}" ${s.chapterId===c.id?'selected':''}>${i+1}화 · ${esc(c.title)}</option>`
  ).join('');
  showModal(`
    <div class="modal-title">${sceneIdx !== undefined ? '장면 수정' : '장면 추가'}</div>
    <div class="form-grid">
      <div><label class="label">장면 제목 *</label><input id="sm-title" value="${esc(s.title||'')}" placeholder="장면 이름"></div>
      <div><label class="label">유형</label><select id="sm-type">${selOpts(SCENE_TYPES,s.type||SCENE_TYPES[0])}</select></div>
      <div class="full">
        <label class="label">연결된 화 <span style="font-size:10px;color:var(--gold)">🔗 자동 동기화</span></label>
        <select id="sm-chapter" style="width:100%">
          <option value="">— 연결 안 함 —</option>
          ${chapterOpts}
        </select>
        ${chapters.length === 0 ? '<div style="font-size:11px;color:var(--muted);margin-top:4px">아직 작성된 화가 없습니다.</div>' : ''}
      </div>
      <div class="full"><label class="label">요약</label><textarea id="sm-sum" rows="3" placeholder="이 장면에서 일어나는 일">${esc(s.summary||'')}</textarea></div>
      <div class="full"><label class="label">등장인물</label><input id="sm-chars" value="${esc(s.characters||'')}" placeholder="예: 이수한, 서아린"></div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="closeModal()">취소</button>
      <button class="btn btn-gold" onclick="saveScene(${arcIdx},${sceneIdx})">저장</button>
    </div>
  `, false);
  setTimeout(() => document.getElementById('sm-title')?.focus(), 100);
}
function saveScene(arcIdx, sceneIdx) {
  const title = document.getElementById('sm-title').value.trim();
  if (!title) { toast('장면 제목을 입력해주세요.'); return; }
  const s = {
    id: sceneIdx !== undefined ? getProject().arcs[arcIdx].scenes[sceneIdx].id : uid(),
    title,
    type: document.getElementById('sm-type').value,
    chapterId: document.getElementById('sm-chapter')?.value || '',
    summary: document.getElementById('sm-sum').value,
    characters: document.getElementById('sm-chars').value,
  };
  const p = getProject();
  if (sceneIdx !== undefined) p.arcs[arcIdx].scenes[sceneIdx] = s;
  else p.arcs[arcIdx].scenes.push(s);
  autoSave(); closeModal(); renderPlot();
}
function deleteScene(arcIdx, sceneIdx) {
  confirmDialog('이 장면을 삭제합니다.', () => {
    getProject().arcs[arcIdx].scenes.splice(sceneIdx,1);
    autoSave(); renderPlot();
    toast('장면을 삭제했어요.');
  });
}

// ═══════════════════════════════════════════════════════════════
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

  const prevScroll = document.getElementById('chapter-list-body')?.scrollTop || 0;
  const prevMobileScroll = document.getElementById('mobile-chapter-list-body')?.scrollTop || 0;
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
  applyChapterListCollapsed();
  setTimeout(() => {
    refreshShortcutBar(); applyEditorFontSize(); applyReaderStyle(); initChDrag(); initAllDragScrolls(); initSplitPanelResize();
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
              <label class="reader-style-control">📖 화면 양식
                <select class="reader-style-select" aria-label="집필 화면 양식" title="집필 화면의 보기만 바뀝니다" onchange="changeReaderStyle(this.value)">${readerStyleOptions()}</select>
              </label>
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
            oninput="onEditorInput('${ch.id}',this.value,event)">${esc(ch.content||'')}</textarea>
        </div>
      </div>
      <!-- 오른쪽: 참고 패널 -->
      <div id="split-panel" class="hidden" style="display:flex;flex-direction:column;">
        <div class="split-resizer" role="separator" tabindex="0" aria-label="참고 패널 너비 조절" aria-orientation="vertical" title="드래그하여 참고 패널 너비 조절"></div>
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

const SPLIT_WIDTH_KEY = 'hopil_studio_reference_width';

function setSplitPanelWidth(width, persist = false) {
  const panel = document.getElementById('split-panel');
  const wrap = panel?.closest('.editor-wrap');
  if (!panel || !wrap || window.innerWidth <= 768) return;
  const listWidth = document.getElementById('chapter-list-wrap')?.getBoundingClientRect().width || 0;
  const maxWidth = Math.max(220, Math.min(600, wrap.clientWidth - listWidth - 300));
  const nextWidth = Math.max(220, Math.min(width, maxWidth));
  panel.style.width = nextWidth + 'px';
  if (persist) {
    try { localStorage.setItem(SPLIT_WIDTH_KEY, String(nextWidth)); } catch (_) {}
  }
}

function initSplitPanelResize() {
  const panel = document.getElementById('split-panel');
  const handle = panel?.querySelector('.split-resizer');
  if (!panel || !handle) return;
  if (window.innerWidth <= 768) { panel.style.removeProperty('width'); return; }
  let savedWidth = 360;
  try { savedWidth = Number(localStorage.getItem(SPLIT_WIDTH_KEY)) || 360; } catch (_) {}
  setSplitPanelWidth(savedWidth);
  if (handle.dataset.resizeReady) return;
  handle.dataset.resizeReady = 'true';
  let startX = 0;
  let startWidth = 0;
  handle.addEventListener('pointerdown', event => {
    startX = event.clientX;
    startWidth = panel.getBoundingClientRect().width;
    handle.setPointerCapture(event.pointerId);
    event.preventDefault();
  });
  handle.addEventListener('pointermove', event => {
    if (!handle.hasPointerCapture(event.pointerId)) return;
    setSplitPanelWidth(startWidth + startX - event.clientX);
  });
  handle.addEventListener('pointerup', event => {
    if (!handle.hasPointerCapture(event.pointerId)) return;
    handle.releasePointerCapture(event.pointerId);
    setSplitPanelWidth(panel.getBoundingClientRect().width, true);
  });
  handle.addEventListener('keydown', event => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    setSplitPanelWidth(panel.getBoundingClientRect().width + (event.key === 'ArrowLeft' ? 20 : -20), true);
    event.preventDefault();
  });
}

window.addEventListener('resize', () => {
  if (window.innerWidth <= 768) return;
  const panel = document.getElementById('split-panel');
  if (panel && !panel.classList.contains('hidden')) {
    if (window.innerWidth <= 1024) setChapterListCollapsed(true);
    setSplitPanelWidth(panel.getBoundingClientRect().width);
  }
});

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

function onEditorInput(id, val, inputEvent) {
  const p = getProject();
  const ch = p.chapters.find(c => c.id === id);
  if (!ch) return;
  const previous = ch.content || '';
  ch.content = val;
  const wc = document.getElementById('wc-display');
  if (wc) wc.textContent = val.length.toLocaleString() + '자';
  // 날짜별 집필량 기록
  const diff = writtenCharDelta(previous, val, inputEvent);
  if (diff > 0) recordDailyWriting(diff);
  if (diff > 0) onTypingKey();
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
// DIAGRAM ENGINE
// ═══════════════════════════════════════════════════════════════
const DG_COLORS = [
  {v:'#f0e9d8', label:'기본',   border:'#c4922a'},
  {v:'#e53935', label:'빨강',   border:'#b71c1c'},
  {v:'#e64a19', label:'주황',   border:'#bf360c'},
  {v:'#f9a825', label:'노랑',   border:'#f57f17'},
  {v:'#43a047', label:'초록',   border:'#1b5e20'},
  {v:'#00897b', label:'청록',   border:'#004d40'},
  {v:'#1e88e5', label:'파랑',   border:'#0d47a1'},
  {v:'#5e35b1', label:'남보라', border:'#311b92'},
  {v:'#8e24aa', label:'보라',   border:'#4a148c'},
  {v:'#d81b60', label:'핑크',   border:'#880e4f'},
  {v:'#546e7a', label:'회색',   border:'#263238'},
  {v:'#263238', label:'다크',   border:'#000000'},
];

const DG_TYPE_COLORS = {
  character: {bg:'#fff3e0', border:'#e8bc5c', text:'#7a4a00'},
  place:     {bg:'#e8f5e9', border:'#4caf50', text:'#1b5e20'},
  event:     {bg:'#e8eaf6', border:'#7986cb', text:'#283593'},
  idea:      {bg:'#fce4ec', border:'#f48fb1', text:'#880e4f'},
  world:     {bg:'#e0f7fa', border:'#4dd0e1', text:'#006064'},
  memo:      {bg:'#fffde7', border:'#ffee58', text:'#827717'},
};

const DG_TYPES = [
  {id:'character', label:'인물', icon:'👤', desc:'등장인물'},
  {id:'place',     label:'장소', icon:'📍', desc:'지역/장소'},
  {id:'event',     label:'사건', icon:'⚡', desc:'사건/사고'},
  {id:'idea',      label:'아이디어', icon:'💡', desc:'아이디어'},
  {id:'world',     label:'세계관', icon:'🌍', desc:'세계관 요소'},
  {id:'memo',      label:'메모', icon:'📝', desc:'자유 메모'},
];

const DG_DIAGRAM_TYPES = [
  {id:'relation',  label:'인물 관계도'},
  {id:'plot',      label:'플롯 흐름도'},
  {id:'world',     label:'세계관 맵'},
  {id:'free',      label:'자유 메모'},
];

let dgState = {
  activeDiagramId: null,
  selectedNodeId: null,
  selectedEdgeIdx: null,
  connecting: false,
  connectFrom: null,
  pan: {x:0, y:0},
  zoom: 1,
  dragging: null,
  dragOffset: {x:0, y:0},  // 논리 좌표 기준 offset
};

// 화면 좌표 → 논리 좌표
function screenToLogic(sx, sy) {
  const wrap = document.getElementById('dg-wrap');
  const wr   = wrap ? wrap.getBoundingClientRect() : {left:0, top:0};
  return {
    x: (sx - wr.left - dgState.pan.x) / dgState.zoom,
    y: (sy - wr.top  - dgState.pan.y) / dgState.zoom,
  };
}

// 논리 좌표 → 화면 좌표 (wrap 기준)
function logicToScreen(lx, ly) {
  return {
    x: lx * dgState.zoom + dgState.pan.x,
    y: ly * dgState.zoom + dgState.pan.y,
  };
}

// stage 트랜스폼 적용
function applyStage() {
  const stage = document.getElementById('dg-stage');
  if (!stage) return;
  stage.style.transformOrigin = '0 0';
  stage.style.transform = `translate(${dgState.pan.x}px,${dgState.pan.y}px) scale(${dgState.zoom})`;
  const zl = document.getElementById('zoom-label');
  if (zl) zl.textContent = Math.round(dgState.zoom*100)+'%';
}

function getDiagrams() { return getProject().diagrams || []; }
function getActiveDiagram() { return getDiagrams().find(d => d.id === dgState.activeDiagramId); }

function saveDiagram() {
  const p = getProject();
  if (!p.diagrams) p.diagrams = [];
  autoSave();
}

// ── 다이어그램 탭 렌더 ──
function renderDiagram() {
  const p = getProject();
  if (!p.diagrams) p.diagrams = [];
  const diagrams = p.diagrams;

  // 활성 다이어그램이 없으면 첫 번째로
  if (!dgState.activeDiagramId && diagrams.length > 0) {
    dgState.activeDiagramId = diagrams[0].id;
    dgState.pan = {x:0, y:0};
    dgState.zoom = 1;
  }

  const tabsHtml = diagrams.map(d => `
    <button class="diagram-tab ${d.id===dgState.activeDiagramId?'active':''}"
      onclick="switchDiagram('${d.id}')">${esc(d.name)}</button>`).join('');

  document.getElementById('main').innerHTML = `
    <div class="diagram-wrap">
      <div class="diagram-toolbar">
        <div class="diagram-tabs">${tabsHtml}</div>
        <button class="btn btn-gold btn-sm" onclick="showNewDiagramModal()">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          새 다이어그램
        </button>
        ${diagrams.length>0?`
        <div style="width:1px;height:20px;background:var(--border)"></div>
        <button class="btn btn-outline btn-sm" onclick="showAddNodeModal()">＋ 노드 추가</button>
        <button class="btn btn-outline btn-sm" onclick="toggleConnectMode()" id="btn-connect">🔗 연결</button>
        <button class="btn btn-outline btn-sm" onclick="resetView()">⊕ 화면 맞춤</button>
        <span id="zoom-label" style="font-size:11px;color:var(--muted);min-width:36px;text-align:center">100%</span>
        <button class="btn btn-outline btn-sm" onclick="clearSelection()">✕ 선택 해제</button>
        <div style="flex:1"></div>
        <button class="btn btn-danger btn-sm" onclick="deleteActiveDiagram()">다이어그램 삭제</button>
        `:''}
      </div>
      <div class="diagram-canvas-wrap" id="dg-wrap" style="touch-action:none">
        ${diagrams.length===0
          ? `<div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;color:var(--muted)">
              <div style="font-size:40px">🗂️</div>
              <div style="font-size:15px">다이어그램을 만들어보세요</div>
              <button class="btn btn-gold" onclick="showNewDiagramModal()">＋ 새 다이어그램 만들기</button>
            </div>`
          : `<div id="dg-stage" style="position:absolute;inset:0;overflow:visible;">
               <div id="diagram-canvas" style="position:absolute;inset:0;"></div>
               <svg id="diagram-svg" style="position:absolute;left:0;top:0;width:4000px;height:4000px;pointer-events:none;overflow:visible"><defs></defs><g id="svg-edges"></g></svg>
             </div>`}
      </div>
    </div>`;

  if (diagrams.length > 0) {
    dgState.pan = {x:0, y:0};
    dgState.zoom = 1;
    renderDiagramCanvas();
    setupDiagramEvents();
  }
}

function switchDiagram(id) {
  dgState.activeDiagramId = id;
  dgState.selectedNodeId = null;
  dgState.connecting = false;
  dgState.connectFrom = null;
  dgState.pan = {x:0, y:0};
  dgState.zoom = 1;
  renderDiagram();
}

function renderDiagramCanvas() {
  const dg = getActiveDiagram();
  if (!dg) return;
  const canvas = document.getElementById('diagram-canvas');
  const svgEdges = document.getElementById('svg-edges');
  if (!canvas || !svgEdges) return;

  // 노드 렌더
  canvas.innerHTML = '';
  (dg.nodes||[]).forEach(node => {
    const el = document.createElement('div');
    el.className = `dg-node type-${node.type}${node.id===dgState.selectedNodeId?' selected':''}`;
    el.id = 'node-'+node.id;
    el.style.left = node.x + 'px';
    el.style.top  = node.y + 'px';
    el.dataset.id = node.id;
    const typeInfo = DG_TYPES.find(t=>t.id===node.type)||DG_TYPES[0];
    // 커스텀 색상 적용
    if (node.color && node.color !== '#f0e9d8') {
      const darkColors = ['#e53935','#e64a19','#43a047','#00897b','#1e88e5','#5e35b1','#8e24aa','#d81b60','#546e7a','#263238'];
      const isDark = darkColors.includes(node.color);
      el.style.background  = node.color;
      el.style.borderColor = isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.15)';
      el.style.color       = isDark ? '#ffffff' : '#1a1208';
    }
    el.innerHTML = `
      <div class="dg-node-icon">${typeInfo.icon}</div>
      <div class="dg-node-label">${esc(node.label)}</div>
      ${node.sub?`<div class="dg-node-sub">${esc(node.sub)}</div>`:''}
    `;
    canvas.appendChild(el);
  });

  // ── 엣지(연결선) 렌더 ────────────────────────────────────────
  const EDGE_COLORS = ['#235f62','#c4922a','#b5451b','#3949ab','#7b1fa2','#555555'];

  // defs 초기화
  let defsHtml = '<defs>';
  EDGE_COLORS.forEach(c => {
    const id = c.replace('#','');
    defsHtml += `<marker id="ae-${id}" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto"><polygon points="0 0,10 3.5,0 7" fill="${c}"/></marker>`;
    defsHtml += `<marker id="as-${id}" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto-start-reverse"><polygon points="0 0,10 3.5,0 7" fill="${c}"/></marker>`;
  });
  defsHtml += '</defs>';
  svgEdges.innerHTML = defsHtml;

  // 노드 DOM 크기를 실제로 읽어서 가장자리 계산
  function calcEdgePt(node, toX, toY, arrowOff) {
    const el = document.getElementById('node-' + node.id);
    const hw = el ? el.offsetWidth  / 2 : 90;
    const hh = el ? el.offsetHeight / 2 : 38;
    const cx = node.x + hw;
    const cy = node.y + hh;
    const dx = toX - cx, dy = toY - cy;
    if (!dx && !dy) return {x: cx, y: cy};
    const sx = dx ? hw / Math.abs(dx) : 1e9;
    const sy = dy ? hh / Math.abs(dy) : 1e9;
    const s  = Math.min(sx, sy);
    const ex = cx + dx * s, ey = cy + dy * s;
    if (arrowOff > 0) {
      const len = Math.sqrt(dx*dx + dy*dy) || 1;
      return {x: ex - (dx/len)*arrowOff, y: ey - (dy/len)*arrowOff};
    }
    return {x: ex, y: ey};
  }

  (dg.edges||[]).forEach((edge, ei) => {
    const fromNode = (dg.nodes||[]).find(n => n.id === edge.from);
    const toNode   = (dg.nodes||[]).find(n => n.id === edge.to);
    if (!fromNode || !toNode) return;

    const color = edge.color  || '#235f62';
    const dir   = edge.dir   || 'forward';
    const style = edge.style || 'solid';
    const cid   = color.replace('#','');

    // 두 노드 중심 (실제 DOM 크기 기준)
    const fel = document.getElementById('node-' + fromNode.id);
    const tel = document.getElementById('node-' + toNode.id);
    const fhw = fel ? fel.offsetWidth/2  : 90, fhh = fel ? fel.offsetHeight/2 : 38;
    const thw = tel ? tel.offsetWidth/2  : 90, thh = tel ? tel.offsetHeight/2 : 38;
    const fcx = fromNode.x + fhw;
    const fcy = fromNode.y + fhh;
    const tcx = toNode.x   + thw;
    const tcy = toNode.y   + thh;

    const hasEnd   = (dir === 'forward' || dir === 'both');
    const hasStart = (dir === 'both');

    const fp = calcEdgePt(fromNode, tcx, tcy, hasStart ? 13 : 0);
    const tp = calcEdgePt(toNode,   fcx, fcy, hasEnd   ? 13 : 0);
    const fx = fp.x, fy = fp.y, tx = tp.x, ty = tp.y;
    const mx = (fx + tx) / 2, my = (fy + ty) / 2;

    const g = document.createElementNS('http://www.w3.org/2000/svg','g');
    g.dataset.edgeIdx = ei;
    const isSelected = (dgState.selectedEdgeIdx === ei);

    if (style === 'cut') {
      // 절단선: 두 반쪽 + X 기호
      const q1x = (fx*2+tx)/3, q1y = (fy*2+ty)/3;
      const q2x = (fx+tx*2)/3, q2y = (fy+ty*2)/3;
      [[fx,fy,q1x,q1y,hasStart,false],[q2x,q2y,tx,ty,false,hasEnd]].forEach(([x1,y1,x2,y2,ms,me]) => {
        const seg = document.createElementNS('http://www.w3.org/2000/svg','line');
        seg.setAttribute('x1',x1); seg.setAttribute('y1',y1);
        seg.setAttribute('x2',x2); seg.setAttribute('y2',y2);
        seg.setAttribute('stroke',color); seg.setAttribute('stroke-width','2.5');
        seg.setAttribute('stroke-linecap','round');
        if (me) seg.setAttribute('marker-end',  `url(#ae-${cid})`);
        if (ms) seg.setAttribute('marker-start',`url(#as-${cid})`);
        g.appendChild(seg);
      });
      // X 기호
      const xs = 7;
      [[-xs,-xs,xs,xs],[xs,-xs,-xs,xs]].forEach(([dx1,dy1,dx2,dy2]) => {
        const xl = document.createElementNS('http://www.w3.org/2000/svg','line');
        xl.setAttribute('x1',mx+dx1); xl.setAttribute('y1',my+dy1);
        xl.setAttribute('x2',mx+dx2); xl.setAttribute('y2',my+dy2);
        xl.setAttribute('stroke',color); xl.setAttribute('stroke-width','2.5');
        xl.setAttribute('stroke-linecap','round');
        g.appendChild(xl);
      });
    } else {
      const line = document.createElementNS('http://www.w3.org/2000/svg','line');
      line.setAttribute('x1',fx); line.setAttribute('y1',fy);
      line.setAttribute('x2',tx); line.setAttribute('y2',ty);
      line.setAttribute('stroke',color); line.setAttribute('stroke-width','2.5');
      line.setAttribute('stroke-linecap','round');
      if (style === 'dashed') line.setAttribute('stroke-dasharray','8,5');
      if (hasEnd)   line.setAttribute('marker-end',  `url(#ae-${cid})`);
      if (hasStart) line.setAttribute('marker-start',`url(#as-${cid})`);
      g.appendChild(line);
    }

    // 선택 하이라이트 (선택됐을 때만 표시)
    if (isSelected) {
      const glow = document.createElementNS('http://www.w3.org/2000/svg','line');
      glow.setAttribute('x1',fx); glow.setAttribute('y1',fy);
      glow.setAttribute('x2',tx); glow.setAttribute('y2',ty);
      glow.setAttribute('stroke', color);
      glow.setAttribute('stroke-width','10');
      glow.setAttribute('stroke-opacity','0.25');
      glow.setAttribute('stroke-linecap','round');
      g.insertBefore(glow, g.firstChild);
    }
    // 넓은 터치 히트 영역
    const hit = document.createElementNS('http://www.w3.org/2000/svg','line');
    hit.setAttribute('x1',fx); hit.setAttribute('y1',fy);
    hit.setAttribute('x2',tx); hit.setAttribute('y2',ty);
    hit.setAttribute('stroke','transparent'); hit.setAttribute('stroke-width','28');
    g.insertBefore(hit, g.firstChild);

    // 라벨 (정중앙)
    if (edge.label) {
      const lw = Math.max(50, edge.label.length * 10 + 20);
      const bg = document.createElementNS('http://www.w3.org/2000/svg','rect');
      bg.setAttribute('x', mx - lw/2); bg.setAttribute('y', my - 12);
      bg.setAttribute('width', lw);    bg.setAttribute('height', 22);
      bg.setAttribute('rx', 11);       bg.setAttribute('fill','#fff');
      bg.setAttribute('stroke', color); bg.setAttribute('stroke-width','1.5');
      g.appendChild(bg);
      const txt = document.createElementNS('http://www.w3.org/2000/svg','text');
      txt.setAttribute('x', mx); txt.setAttribute('y', my + 5);
      txt.setAttribute('text-anchor','middle'); txt.setAttribute('font-size','11');
      txt.setAttribute('fill', color); txt.setAttribute('font-weight','700');
      txt.setAttribute('font-family','Noto Sans KR,sans-serif');
      txt.textContent = edge.label;
      g.appendChild(txt);
    }

    svgEdges.appendChild(g);
  });

}

function setupDiagramEvents() {
  const canvas = document.getElementById('diagram-canvas');
  const svgEl  = document.getElementById('diagram-svg');
  if (!canvas) return;

  // ── 공통 좌표 추출 ──────────────────────────────────────────
  function xy(e) {
    const t = e.touches?.[0] ?? e.changedTouches?.[0] ?? e;
    return { x: t.clientX, y: t.clientY };
  }

  // ── 상태 ────────────────────────────────────────────────────
  let drag       = null;   // { id, offX, offY }
  let longTimer  = null;
  let moved      = false;
  let tapTimer   = null;
  let tapId      = null;

  // ── 노드 터치 시작 ───────────────────────────────────────────
  function nodeStart(e, nodeEl) {
    const id = nodeEl.dataset.id;
    const {x, y} = xy(e);

    // 첫 탭 → 선택, 선택된 노드 재탭 → 편집
    if (dgState.selectedNodeId === id) {
      // 이미 선택된 노드를 탭 → 편집 모달 열기 (짧게 탭했을 때만)
      tapId = id;
    } else {
      tapId = null;
    }

    // 드래그 offset 계산을 위해 node 미리 찾기
    const dg0   = getActiveDiagram();
    const node0 = (dg0?.nodes||[]).find(n => n.id === id);

    // 연결 모드 → 탭만으로 처리
    if (dgState.connecting) {
      if (!dgState.connectFrom) {
        dgState.connectFrom = id;
        nodeEl.style.outline = '3px solid var(--rust)';
        toast('연결할 두 번째 노드를 탭하세요');
      } else if (dgState.connectFrom !== id) {
        showConnectLabelModal(dgState.connectFrom, id);
        dgState.connectFrom = null;
        toggleConnectMode(false);
      }
      e.preventDefault(); return;
    }

    moved = false;
    dgState.selectedNodeId = id;

    // 롱프레스 (800ms) → 컨텍스트 메뉴
    longTimer = setTimeout(() => {
      if (!moved) {
        drag = null;
        showNodeContextMenu(id, x, y);  // x,y는 화면좌표 (메뉴 위치용)
      }
    }, 800);

    // 드래그 준비
    const lpos = screenToLogic(x, y);
    // node0.x/y는 이미 논리좌표 → offset도 논리좌표 기준
    drag = { id, offX: lpos.x - (node0?.x ?? lpos.x), offY: lpos.y - (node0?.y ?? lpos.y) };
    nodeEl.style.zIndex = 100;
    e.preventDefault();
  }

  // ── 노드 이동 ────────────────────────────────────────────────
  function nodeMove(e) {
    if (!drag) return;
    const {x, y} = xy(e);
    moved = true;
    clearTimeout(longTimer);
    const dgEnd  = getActiveDiagram();
    const nodeEnd2 = (dgEnd?.nodes||[]).find(n => n.id === drag.id);
    if (!nodeEnd2) return;
    const wrap = document.getElementById('dg-wrap');
    const lpos  = screenToLogic(x, y);
    const dg1   = getActiveDiagram();
    const nodeMv = (dg1?.nodes||[]).find(n => n.id === drag.id);
    if (!nodeMv) return;
    nodeMv.x = lpos.x - drag.offX;
    nodeMv.y = lpos.y - drag.offY;
    const el = document.getElementById('node-' + drag.id);
    if (el) {
      el.style.left = nodeMv.x + 'px';
      el.style.top  = nodeMv.y + 'px';
    }
    // 엣지만 빠르게 다시 그리기
    renderEdgesOnly();
    e.preventDefault();
  }

  // ── 노드 터치 끝 ─────────────────────────────────────────────
  function nodeEnd(e) {
    clearTimeout(longTimer);
    if (drag) {
      if (!moved) {
        // 짧은 탭
        if (tapId === drag.id) {
          // 이미 선택된 상태에서 탭 → 편집
          showEditNodeModal(drag.id);
        } else {
          // 첫 탭 → 선택
          dgState.selectedNodeId = drag.id;
          renderDiagramCanvas();
        }
        tapId = null;
      } else if (moved) {
        saveDiagram();
      }
      const el = document.getElementById('node-' + drag.id);
      if (el) { el.style.boxShadow = ''; el.style.zIndex = ''; }
      drag = null;
    }
  }

  // ── 캔버스 이벤트 등록 ───────────────────────────────────────
  canvas.addEventListener('touchstart', e => {
    const nodeEl = e.target.closest('.dg-node');
    if (nodeEl) nodeStart(e, nodeEl);
    else { dgState.selectedNodeId = null; renderDiagramCanvas(); }
  }, {passive: false});

  canvas.addEventListener('touchmove',  nodeMove, {passive: false});
  canvas.addEventListener('touchend',   nodeEnd,  {passive: false});

  // 마우스 (PC)
  canvas.addEventListener('mousedown', e => {
    const nodeEl = e.target.closest('.dg-node');
    if (nodeEl) nodeStart(e, nodeEl);
  });
  window.addEventListener('mousemove', e => { if (drag) nodeMove(e); });
  window.addEventListener('mouseup',   e => { if (drag) nodeEnd(e); });

  // PC 우클릭
  canvas.addEventListener('contextmenu', e => {
    e.preventDefault();
    const nodeEl = e.target.closest('.dg-node');
    if (nodeEl) showNodeContextMenu(nodeEl.dataset.id, e.clientX, e.clientY);
  });

  // ── 핀치 줌 + 두 손가락 패닝 ────────────────────────────────
  const wrapEl = document.getElementById('dg-wrap');
  if (wrapEl) {
    let lastDist  = null;
    let lastMidX  = null, lastMidY  = null;
    let isPinching = false;

    function getTouchDist(e) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      return Math.sqrt(dx*dx + dy*dy);
    }
    function getTouchMid(e) {
      return {
        x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
        y: (e.touches[0].clientY + e.touches[1].clientY) / 2,
      };
    }

    wrapEl.addEventListener('touchstart', e => {
      if (e.touches.length === 2) {
        isPinching = true;
        drag = null; // 드래그 취소
        lastDist = getTouchDist(e);
        const mid = getTouchMid(e);
        lastMidX = mid.x; lastMidY = mid.y;
        e.preventDefault();
      }
    }, {passive: false});

    wrapEl.addEventListener('touchmove', e => {
      if (e.touches.length === 2 && isPinching) {
        e.preventDefault();
        const dist = getTouchDist(e);
        const mid  = getTouchMid(e);
        const wr   = wrapEl.getBoundingClientRect();

        const wr2 = wrapEl.getBoundingClientRect();
        // 줌: 중점 고정
        if (lastDist && lastDist > 0) {
          const ratio   = dist / lastDist;
          const newZoom = Math.max(0.3, Math.min(3, dgState.zoom * ratio));
          const mx = mid.x - wr2.left;
          const my = mid.y - wr2.top;
          dgState.pan.x = mx - (mx - dgState.pan.x) * (newZoom / dgState.zoom);
          dgState.pan.y = my - (my - dgState.pan.y) * (newZoom / dgState.zoom);
          dgState.zoom  = newZoom;
        }
        // 패닝
        if (lastMidX !== null) {
          dgState.pan.x += mid.x - lastMidX;
          dgState.pan.y += mid.y - lastMidY;
        }
        lastDist = dist; lastMidX = mid.x; lastMidY = mid.y;
        applyStage();
      }
    }, {passive: false});

    wrapEl.addEventListener('touchend', e => {
      if (e.touches.length < 2) {
        isPinching = false;
        lastDist = null; lastMidX = null; lastMidY = null;
      }
    }, {passive: true});
  }

  // ── 연결선 터치 — wrap 전체에서 감지 (SVG pointer-events 우회) ──
  const wrap = document.getElementById('dg-wrap');
  if (wrap) {
    let edgeTimer = null;
    let edgeMoved = false;
    let edgeTouchX = 0, edgeTouchY = 0;

    wrap.addEventListener('touchstart', e => {
      // 노드 위면 무시 (노드 이벤트가 처리)
      if (e.target.closest('.dg-node')) return;
      edgeMoved = false;
      edgeTouchX = e.touches[0].clientX;
      edgeTouchY = e.touches[0].clientY;

      // 터치 좌표와 가장 가까운 엣지 찾기
      const dg = getActiveDiagram();
      if (!dg || !dg.edges || dg.edges.length === 0) return;
      const wrapRect = wrap.getBoundingClientRect();
      const tl = screenToLogic(edgeTouchX, edgeTouchY);
      const tx = tl.x, ty = tl.y;

      let closestIdx = -1;
      let closestDist = 30; // 30px 이내만 감지
      (dg.edges||[]).forEach((edge, ei) => {
        const from = (dg.nodes||[]).find(n=>n.id===edge.from);
        const to   = (dg.nodes||[]).find(n=>n.id===edge.to);
        if (!from||!to) return;
        const fx = from.x+dgState.pan.x+90, fy = from.y+dgState.pan.y+38;
        const ex = to.x+dgState.pan.x+90,   ey = to.y+dgState.pan.y+38;
        // 점-선분 거리 계산
        const dx = ex-fx, dy = ey-fy;
        const lenSq = dx*dx + dy*dy;
        let t = lenSq > 0 ? ((tx-fx)*dx + (ty-fy)*dy) / lenSq : 0;
        t = Math.max(0, Math.min(1, t));
        const px = fx + t*dx - tx, py = fy + t*dy - ty;
        const dist = Math.sqrt(px*px + py*py);
        if (dist < closestDist) { closestDist = dist; closestIdx = ei; }
      });

      if (closestIdx < 0) return;

      edgeTimer = setTimeout(() => {
        if (!edgeMoved) {
          navigator.vibrate?.(50);
          // 선택 표시 먼저
          dgState.selectedEdgeIdx = closestIdx;
          renderDiagramCanvas();
          showEditEdgeModal(closestIdx);
        }
      }, 800);
    }, {passive: true});

    wrap.addEventListener('touchmove', e => {
      const dx = e.touches[0].clientX - edgeTouchX;
      const dy = e.touches[0].clientY - edgeTouchY;
      if (Math.sqrt(dx*dx+dy*dy) > 8) { edgeMoved = true; clearTimeout(edgeTimer); }
    }, {passive: true});

    wrap.addEventListener('touchend',    () => clearTimeout(edgeTimer), {passive: true});
    wrap.addEventListener('touchcancel', () => clearTimeout(edgeTimer), {passive: true});

    // PC 더블클릭으로 노드/선 편집
    wrap.addEventListener('dblclick', e => {
      // 노드 더블클릭 → 편집 모달
      const nodeEl = e.target.closest('.dg-node');
      if (nodeEl) {
        const id = nodeEl.dataset.id;
        if (id) { e.preventDefault(); showEditNodeModal(id); }
        return;
      }
      const dg = getActiveDiagram();
      if (!dg || !dg.edges || dg.edges.length === 0) return;
      const wrapRect = wrap.getBoundingClientRect();
      const tl2 = screenToLogic(e.clientX, e.clientY);
      const tx = tl2.x, ty = tl2.y;
      let closestIdx = -1, closestDist = 20;
      (dg.edges||[]).forEach((edge, ei) => {
        const from = (dg.nodes||[]).find(n=>n.id===edge.from);
        const to   = (dg.nodes||[]).find(n=>n.id===edge.to);
        if (!from||!to) return;
        const fx=from.x+dgState.pan.x+90, fy=from.y+dgState.pan.y+38;
        const ex=to.x+dgState.pan.x+90,   ey=to.y+dgState.pan.y+38;
        const dx=ex-fx, dy=ey-fy, lenSq=dx*dx+dy*dy;
        let t = lenSq>0 ? ((tx-fx)*dx+(ty-fy)*dy)/lenSq : 0;
        t = Math.max(0,Math.min(1,t));
        const px=fx+t*dx-tx, py=fy+t*dy-ty;
        const dist=Math.sqrt(px*px+py*py);
        if (dist<closestDist) { closestDist=dist; closestIdx=ei; }
      });
      if (closestIdx >= 0) showEditEdgeModal(closestIdx);
    });
  }
}

function renderEdgesOnly() {
  const dg = getActiveDiagram();
  if (!dg) return;
  const svgEdges = document.getElementById('svg-edges');
  if (!svgEdges) return;

  const COLORS = ['#235f62','#c4922a','#b5451b','#3949ab','#7b1fa2','#555555'];
  let defs = '<defs>';
  COLORS.forEach(c => {
    const id = c.replace('#','');
    defs += `<marker id="ae-${id}" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto"><polygon points="0 0,10 3.5,0 7" fill="${c}"/></marker>`;
    defs += `<marker id="as-${id}" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto-start-reverse"><polygon points="0 0,10 3.5,0 7" fill="${c}"/></marker>`;
  });
  defs += '</defs>';
  svgEdges.innerHTML = defs;

  function ep(node, toX, toY, off) {
    const el=document.getElementById('node-'+node.id);
    const hw=el?el.offsetWidth/2:90, hh=el?el.offsetHeight/2:38;
    const cx=node.x+hw, cy=node.y+hh;
    const dx=toX-cx, dy=toY-cy;
    if(!dx&&!dy) return{x:cx,y:cy};
    const s=Math.min(dx?90/Math.abs(dx):1e9, dy?38/Math.abs(dy):1e9);
    const ex=cx+dx*s, ey=cy+dy*s;
    if(off>0){const l=Math.sqrt(dx*dx+dy*dy)||1;return{x:ex-dx/l*off,y:ey-dy/l*off};}
    return{x:ex,y:ey};
  }

  (dg.edges||[]).forEach(edge => {
    const fn = (dg.nodes||[]).find(n=>n.id===edge.from);
    const tn = (dg.nodes||[]).find(n=>n.id===edge.to);
    if(!fn||!tn) return;
    const color=edge.color||'#235f62', dir=edge.dir||'forward', cid=color.replace('#','');
    const fe=document.getElementById('node-'+fn.id), te=document.getElementById('node-'+tn.id);
    const fcx=fn.x+(fe?fe.offsetWidth/2:90), fcy=fn.y+(fe?fe.offsetHeight/2:38);
    const tcx=tn.x+(te?te.offsetWidth/2:90), tcy=tn.y+(te?te.offsetHeight/2:38);
    const he=dir==='forward'||dir==='both', hs=dir==='both';
    const fp=ep(fn,tcx,tcy,hs?13:0), tp=ep(tn,fcx,fcy,he?13:0);
    const line=document.createElementNS('http://www.w3.org/2000/svg','line');
    line.setAttribute('x1',fp.x); line.setAttribute('y1',fp.y);
    line.setAttribute('x2',tp.x); line.setAttribute('y2',tp.y);
    line.setAttribute('stroke',color); line.setAttribute('stroke-width','2.5');
    if(edge.style==='dashed') line.setAttribute('stroke-dasharray','8,5');
    if(he) line.setAttribute('marker-end',`url(#ae-${cid})`);
    if(hs) line.setAttribute('marker-start',`url(#as-${cid})`);
    svgEdges.appendChild(line);
  });
}



function resetView() {
  dgState.pan={x:0,y:0};
  dgState.zoom=1;
  renderDiagramCanvas();
}
function clearSelection() { dgState.selectedNodeId=null; renderDiagramCanvas(); }

function toggleConnectMode(force) {
  dgState.connecting = force !== undefined ? force : !dgState.connecting;
  dgState.connectFrom = null;
  const btn = document.getElementById('btn-connect');
  if (btn) {
    btn.style.background = dgState.connecting ? 'var(--teal)' : '';
    btn.style.color = dgState.connecting ? '#fff' : '';
    btn.style.borderColor = dgState.connecting ? 'var(--teal)' : '';
  }
  if (dgState.connecting) toast('연결할 첫 번째 노드를 탭하세요');
}

function deleteEdge(idx) {
  const dg = getActiveDiagram();
  if (!dg) return;
  dg.edges.splice(idx,1);
  saveDiagram(); renderDiagramCanvas();
}

function showEditEdgeModal(idx) {
  dgState.selectedEdgeIdx = idx;
  renderDiagramCanvas();
  const dg = getActiveDiagram();
  const edge = dg?.edges?.[idx];
  if (!edge) return;
  showModal(`
    <div class="modal-title">연결선 편집</div>
    <div style="margin-bottom:14px">
      <label class="label">설명</label>
      <input id="ee-label" value="${esc(edge.label||'')}" placeholder="예: 연인, 라이벌">
    </div>
    <div style="margin-bottom:14px">
      <label class="label">화살표 방향</label>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:4px" id="ee-dir-group">
        ${[{v:'forward',l:'단방향 →'},{v:'both',l:'양방향 ↔'},{v:'none',l:'방향 없음 ─'}].map(t=>{
          const sel=(edge.dir||'forward')===t.v;
          return `<button type="button" onclick="selectEdgeOpt('ee-dir-group',this,'${t.v}')"
            data-val="${t.v}"
            style="padding:10px 6px;border:2px solid ${sel?'var(--gold)':'var(--border)'};border-radius:8px;
              cursor:pointer;font-size:12px;font-weight:700;font-family:'Noto Sans KR',sans-serif;
              background:${sel?'var(--gold-light)':'transparent'};color:${sel?'var(--gold)':'var(--muted)'};
              transition:all .15s;text-align:center">
            ${t.l}
          </button>`;}).join('')}
      </div>
    </div>
    <div style="margin-bottom:14px">
      <label class="label">선 스타일</label>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:4px" id="ee-style-group">
        ${[{v:'solid',l:'실선 ─────'},{v:'dashed',l:'점선 ╌╌╌╌╌'},{v:'cut',l:'절단 ─ ✕ ─'}].map(t=>{
          const sel=(edge.style||'solid')===t.v;
          return `<button type="button" onclick="selectEdgeOpt('ee-style-group',this,'${t.v}')"
            data-val="${t.v}"
            style="padding:10px 6px;border:2px solid ${sel?'var(--gold)':'var(--border)'};border-radius:8px;
              cursor:pointer;font-size:12px;font-weight:700;font-family:'Noto Sans KR',sans-serif;
              background:${sel?'var(--gold-light)':'transparent'};color:${sel?'var(--gold)':'var(--muted)'};
              transition:all .15s;text-align:center">
            ${t.l}
          </button>`;}).join('')}
      </div>
    </div>
    <div style="margin-bottom:20px">
      <label class="label">선 색상</label>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:6px">
        ${[{v:'#235f62',l:'초록'},{v:'#c4922a',l:'금색'},{v:'#b5451b',l:'빨강'},{v:'#3949ab',l:'파랑'},{v:'#7b1fa2',l:'보라'},{v:'#555555',l:'회색'}].map(c=>`
          <label style="cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:4px;font-size:10px;color:var(--muted)">
            <input type="radio" name="ee-color" value="${c.v}" ${(edge.color||'#235f62')===c.v?'checked':''} style="display:none">
            <div style="width:28px;height:28px;border-radius:50%;background:${c.v};border:3px solid ${(edge.color||'#235f62')===c.v?'var(--gold)':'transparent'};transition:border-color .15s"
              onclick="document.querySelectorAll('[name=ee-color]').forEach(r=>r.parentNode.querySelector('div').style.borderColor='transparent');this.style.borderColor='var(--gold)'">
            </div>
            ${c.l}
          </label>`).join('')}
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-danger" onclick="deleteEdge(${idx});closeModal()">삭제</button>
      <button class="btn btn-outline" onclick="closeModal()">취소</button>
      <button class="btn btn-gold" onclick="saveEdge(${idx})">저장</button>
    </div>`, false);
}

function saveEdge(idx) {
  const dg = getActiveDiagram();
  const edge = dg?.edges?.[idx];
  if (!edge) return;
  edge.label = document.getElementById('ee-label').value.trim();
  edge.dir   = document.querySelector('#ee-dir-group button[data-selected]')?.dataset.val||'forward';
  edge.style = document.querySelector('#ee-style-group button[data-selected]')?.dataset.val||'solid';
  edge.color = document.querySelector('input[name="ee-color"]:checked')?.value||'#235f62';
  saveDiagram(); closeModal(); renderDiagramCanvas();
}

function deleteNode(id) {
  confirmDialog('이 노드를 삭제합니다.', () => {
  const dg = getActiveDiagram();
  if (!dg) return;
  dg.nodes = (dg.nodes||[]).filter(n=>n.id!==id);
  dg.edges = (dg.edges||[]).filter(e=>e.from!==id&&e.to!==id);
  dgState.selectedNodeId=null;
  saveDiagram(); renderDiagramCanvas();
  });
}

// ── 모달들 ──
function showNewDiagramModal() {
  showModal(`
    <div class="modal-title">새 다이어그램</div>
    <div style="margin-bottom:12px"><label class="label">이름 *</label>
      <input id="dg-name" placeholder="예: 주요 인물 관계도"></div>
    <div style="margin-bottom:20px"><label class="label">종류</label>
      <select id="dg-type">${DG_DIAGRAM_TYPES.map(t=>`<option value="${t.id}">${t.label}</option>`).join('')}</select>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="closeModal()">취소</button>
      <button class="btn btn-gold" onclick="createDiagram()">만들기</button>
    </div>`);
  setTimeout(()=>document.getElementById('dg-name')?.focus(),100);
}

function createDiagram() {
  const name = document.getElementById('dg-name').value.trim();
  if (!name) { toast('이름을 입력해주세요.'); return; }
  const p = getProject();
  if (!p.diagrams) p.diagrams = [];
  const dg = { id:uid(), name, type:document.getElementById('dg-type').value, nodes:[], edges:[] };
  p.diagrams.push(dg);
  dgState.activeDiagramId = dg.id;
  saveDiagram(); closeModal(); renderDiagram();
}

function deleteActiveDiagram() {
  confirmDialog('이 다이어그램을 삭제합니다.', () => {
    const p = getProject();
    p.diagrams = (p.diagrams||[]).filter(d=>d.id!==dgState.activeDiagramId);
    dgState.activeDiagramId = p.diagrams[0]?.id || null;
    saveDiagram(); renderDiagram();
  });
}

function showAddNodeModal() {
  const dg = getActiveDiagram();
  if (!dg) return;
  showModal(`
    <div class="modal-title">노드 추가</div>
    <div style="margin-bottom:12px"><label class="label">이름 *</label>
      <input id="nd-label" placeholder="노드 이름"></div>
    <div style="margin-bottom:12px"><label class="label">종류</label>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:4px" id="nd-type-group">
        ${DG_TYPES.map((t,i)=>`
          <button type="button" onclick="selectEdgeOpt('nd-type-group',this,'${t.id}')"
            data-val="${t.id}" ${i===0?'data-selected="1"':''}
            style="padding:10px 6px;border:2px solid ${i===0?'var(--gold)':'var(--border)'};
              border-radius:8px;cursor:pointer;font-size:12px;font-weight:700;
              font-family:'Noto Sans KR',sans-serif;text-align:center;
              background:${i===0?'var(--gold-light)':'transparent'};
              color:${i===0?'var(--gold)':'var(--muted)'};transition:all .15s">
            ${t.icon} ${t.label}
          </button>`).join('')}
      </div>
    </div>
    <div style="margin-bottom:14px"><label class="label">부제 (선택)</label>
      <input id="nd-sub" placeholder="예: 주인공, 악역, 왕국..."></div>
    <div style="margin-bottom:20px">
      <label class="label">노드 색상 (선택)</label>
      <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:6px" id="nd-color-group">
        ${DG_COLORS.map((c,i)=>`
          <button type="button" onclick="selectEdgeOpt('nd-color-group',this,'${c.v}')"
            data-val="${c.v}" ${i===0?'data-selected="1"':''}
            title="${c.label}"
            style="width:34px;height:34px;border-radius:50%;cursor:pointer;transition:all .18s;
              background:${c.v};
              border:3px solid ${i===0?'#c4922a':c.border};
              box-shadow:0 2px 6px rgba(0,0,0,.18)">
          </button>`).join('')}
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="closeModal()">취소</button>
      <button class="btn btn-gold" onclick="addNode()">추가</button>
    </div>`);
  setTimeout(()=>document.getElementById('nd-label')?.focus(),100);
}

function addNode() {
  const label = document.getElementById('nd-label').value.trim();
  if (!label) { toast('이름을 입력해주세요.'); return; }
  const type = document.querySelector('#nd-type-group button[data-selected]')?.dataset.val || 'idea';
  const sub = document.getElementById('nd-sub').value.trim();
  const dg = getActiveDiagram();
  const wrap = document.getElementById('dg-wrap');
  const cx = wrap ? wrap.offsetWidth/2 - dgState.pan.x - 90 : 200;
  const cy = wrap ? wrap.offsetHeight/2 - dgState.pan.y - 30 : 150;
  if (!dg.nodes) dg.nodes = [];
  const color = document.querySelector('#nd-color-group button[data-selected]')?.dataset.val || '#f0e9d8';
  dg.nodes.push({ id:uid(), label, type, sub, color, x:cx + (Math.random()-0.5)*80, y:cy + (Math.random()-0.5)*80 });
  saveDiagram(); closeModal(); renderDiagramCanvas();
  toast('노드가 추가됐어요!');
}

function showEditNodeModal(id) {
  const dg = getActiveDiagram();
  const node = (dg?.nodes||[]).find(n=>n.id===id);
  if (!node) return;
  showModal(`
    <div class="modal-title">노드 편집</div>
    <div style="margin-bottom:12px"><label class="label">이름 *</label>
      <input id="nd-label" value="${esc(node.label)}" placeholder="노드 이름"></div>
    <div style="margin-bottom:12px"><label class="label">종류</label>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:4px" id="nd-type-group">
        ${DG_TYPES.map(t=>{
          const sel = t.id===node.type;
          return `<button type="button" onclick="selectEdgeOpt('nd-type-group',this,'${t.id}')"
            data-val="${t.id}" ${sel?'data-selected="1"':''}
            style="padding:10px 6px;border:2px solid ${sel?'var(--gold)':'var(--border)'};
              border-radius:8px;cursor:pointer;font-size:12px;font-weight:700;
              font-family:'Noto Sans KR',sans-serif;text-align:center;
              background:${sel?'var(--gold-light)':'transparent'};
              color:${sel?'var(--gold)':'var(--muted)'};transition:all .15s">
            ${t.icon} ${t.label}
          </button>`;}).join('')}
      </div>
    </div>
    <div style="margin-bottom:14px"><label class="label">부제 (선택)</label>
      <input id="nd-sub" value="${esc(node.sub||'')}" placeholder="예: 주인공, 악역..."></div>
    <div style="margin-bottom:20px">
      <label class="label">노드 색상</label>
      <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:6px" id="nd-color-group">
        ${DG_COLORS.map(c=>{
          const sel=(node.color||'#f0e9d8')===c.v;
          return `<button type="button" onclick="selectEdgeOpt('nd-color-group',this,'${c.v}')"
            data-val="${c.v}" ${sel?'data-selected="1"':''}
            title="${c.label}"
            style="width:34px;height:34px;border-radius:50%;cursor:pointer;transition:all .18s;
              background:${c.v};
              border:3px solid ${sel?'#c4922a':c.border};
              box-shadow:0 2px 6px rgba(0,0,0,.18)">
          </button>`;}).join('')}
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-danger" onclick="deleteNode('${id}');closeModal()">삭제</button>
      <button class="btn btn-outline" onclick="closeModal()">취소</button>
      <button class="btn btn-gold" onclick="editNode('${id}')">저장</button>
    </div>`, false);
}

function editNode(id) {
  const label = document.getElementById('nd-label').value.trim();
  if (!label) { toast('이름을 입력해주세요.'); return; }
  const dg = getActiveDiagram();
  const node = (dg?.nodes||[]).find(n=>n.id===id);
  if (!node) return;
  node.label = label;
  node.type  = document.querySelector('#nd-type-group button[data-selected]')?.dataset.val || node.type;
  node.sub   = document.getElementById('nd-sub').value.trim();
  node.color = document.querySelector('#nd-color-group button[data-selected]')?.dataset.val || node.color || 'default';
  saveDiagram(); closeModal(); renderDiagramCanvas();
}

function showConnectLabelModal(fromId, toId) {
  showModal(`
    <div class="modal-title">연결선 설정</div>
    <div style="margin-bottom:14px">
      <label class="label">설명 (선택)</label>
      <input id="edge-label" placeholder="예: 연인, 라이벌, 스승, 원인→결과">
    </div>
    <div style="margin-bottom:14px">
      <label class="label">화살표 방향</label>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:4px" id="edge-dir-group">
        ${[{v:'forward',l:'단방향 →'},{v:'both',l:'양방향 ↔'},{v:'none',l:'방향 없음 ─'}].map((t,i)=>`
          <button type="button" onclick="selectEdgeOpt('edge-dir-group',this,'${t.v}')"
            data-val="${t.v}"
            style="padding:10px 6px;border:2px solid ${i===0?'var(--gold)':'var(--border)'};border-radius:8px;
              cursor:pointer;font-size:12px;font-weight:700;font-family:'Noto Sans KR',sans-serif;
              background:${i===0?'var(--gold-light)':'transparent'};color:${i===0?'var(--gold)':'var(--muted)'};
              transition:all .15s;text-align:center">
            ${t.l}
          </button>`).join('')}
      </div>
    </div>
    <div style="margin-bottom:14px">
      <label class="label">선 스타일</label>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:4px" id="edge-style-group">
        ${[{v:'solid',l:'실선 ─────'},{v:'dashed',l:'점선 ╌╌╌╌╌'},{v:'cut',l:'절단 ─ ✕ ─'}].map((t,i)=>`
          <button type="button" onclick="selectEdgeOpt('edge-style-group',this,'${t.v}')"
            data-val="${t.v}"
            style="padding:10px 6px;border:2px solid ${i===0?'var(--gold)':'var(--border)'};border-radius:8px;
              cursor:pointer;font-size:12px;font-weight:700;font-family:'Noto Sans KR',sans-serif;
              background:${i===0?'var(--gold-light)':'transparent'};color:${i===0?'var(--gold)':'var(--muted)'};
              transition:all .15s;text-align:center">
            ${t.l}
          </button>`).join('')}
      </div>
    </div>
    <div style="margin-bottom:20px">
      <label class="label">선 색상</label>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:6px">
        ${[
          {v:'#235f62',label:'초록',bg:'#235f62'},
          {v:'#c4922a',label:'금색',bg:'#c4922a'},
          {v:'#b5451b',label:'빨강',bg:'#b5451b'},
          {v:'#3949ab',label:'파랑',bg:'#3949ab'},
          {v:'#7b1fa2',label:'보라',bg:'#7b1fa2'},
          {v:'#555555',label:'회색',bg:'#555555'},
        ].map((c,i)=>`
          <label style="cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:4px;font-size:10px;color:var(--muted)">
            <input type="radio" name="edge-color" value="${c.v}" ${i===0?'checked':''} style="display:none">
            <div style="width:28px;height:28px;border-radius:50%;background:${c.bg};border:3px solid transparent;transition:border-color .15s"
              onclick="document.querySelectorAll('[name=edge-color]').forEach(r=>r.parentNode.querySelector('div').style.borderColor='transparent');this.style.borderColor='var(--gold)'">
            </div>
            ${c.label}
          </label>`).join('')}
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="closeModal()">취소</button>
      <button class="btn btn-gold" onclick="addEdge('${fromId}','${toId}')">연결</button>
    </div>`);
  setTimeout(()=>document.getElementById('edge-label')?.focus(),100);
}

function addEdge(fromId, toId) {
  const label = document.getElementById('edge-label')?.value.trim()||'';
  const dir = document.querySelector('#edge-dir-group button[data-selected]')?.dataset.val||'forward';
  const style = document.querySelector('#edge-style-group button[data-selected]')?.dataset.val||'solid';
  const color = document.querySelector('input[name="edge-color"]:checked')?.value||'#235f62';
  const dg = getActiveDiagram();
  if (!dg.edges) dg.edges = [];
  dg.edges.push({from:fromId, to:toId, label, dir, style, color});
  saveDiagram(); closeModal(); renderDiagramCanvas();
  toast('연결됐어요!');
}

function showNodeContextMenu(id, x, y) {
  const existing = document.getElementById('node-ctx-menu');
  if (existing) existing.remove();
  const menu = document.createElement('div');
  menu.id = 'node-ctx-menu';
  menu.style.cssText = `position:fixed;left:${x}px;top:${y}px;background:var(--white);
    border:1px solid var(--border);border-radius:10px;padding:6px;
    box-shadow:0 4px 20px var(--shadow);z-index:9000;min-width:130px`;
  menu.innerHTML = `
    <button onclick="showEditNodeModal('${id}');document.getElementById('node-ctx-menu')?.remove()"
      style="display:block;width:100%;text-align:left;padding:8px 12px;border:none;background:none;cursor:pointer;border-radius:6px;font-size:13px;font-family:'Noto Sans KR',sans-serif">✏️ 편집</button>
    <button onclick="dgState.connecting=true;dgState.connectFrom='${id}';document.getElementById('node-ctx-menu')?.remove();toast('연결할 노드를 탭하세요')"
      style="display:block;width:100%;text-align:left;padding:8px 12px;border:none;background:none;cursor:pointer;border-radius:6px;font-size:13px;font-family:'Noto Sans KR',sans-serif">🔗 연결하기</button>
    <hr style="border:none;border-top:1px solid var(--border);margin:4px 0">
    <button onclick="deleteNode('${id}');document.getElementById('node-ctx-menu')?.remove()"
      style="display:block;width:100%;text-align:left;padding:8px 12px;border:none;background:none;cursor:pointer;border-radius:6px;font-size:13px;color:var(--rust);font-family:'Noto Sans KR',sans-serif">🗑️ 삭제</button>
  `;
  document.body.appendChild(menu);
  setTimeout(()=>document.addEventListener('click',()=>menu.remove(),{once:true}),50);
}


// ═══════════════════════════════════════════════════════════════
// MEMO PAD
// ═══════════════════════════════════════════════════════════════
const MEMO_COLORS = [
  {bg:'#fffde7',border:'#ffe082',label:'노랑'},
  {bg:'#e8f5e9',border:'#a5d6a7',label:'초록'},
  {bg:'#e3f2fd',border:'#90caf9',label:'파랑'},
  {bg:'#fce4ec',border:'#f48fb1',label:'핑크'},
  {bg:'#f3e5f5',border:'#ce93d8',label:'보라'},
  {bg:'#fff3e0',border:'#ffcc80',label:'주황'},
  {bg:'#ffffff',border:'#ddd3be',label:'흰색'},
];

function getMemos() {
  const p = getProject();
  if (!p.memos) p.memos = [];
  return p.memos;
}

function saveMemos() { autoSave(); }

function renderMemoFull() {
  // 메모 수 갱신
  const memos = getMemos();
  const title = document.querySelector('#main .font-display');
  if (title) title.textContent = `메모장 (${memos.length})`;
  // 목록 갱신
  renderMemoList();
  // memo-grid-wrap이 없으면 전체 렌더
  if (!document.getElementById('memo-grid-wrap')) renderMemo();
}

function renderMemoList() {
  const memos = getMemos();
  // id 보정
  const p = getProject();
  if (p?.memos) {
    let _fixed = false;
    p.memos.forEach(m => { if (!m.id) { m.id = uid(); _fixed = true; } });
    if (_fixed) saveMemos();
  }
  const q = (window._memoSearch || '').trim().toLowerCase();
  const clearBtn = document.getElementById('memo-search-clear');
  if (clearBtn) clearBtn.style.display = q ? 'block' : 'none';
  const grid = document.getElementById('memo-grid-wrap');
  if (!grid) return;
  if (memos.length === 0) {
    grid.innerHTML = '<div class="card empty-state"><div class="emoji">📝</div><p>메모를 추가해보세요.<br>아이디어, 설정, 대사 등 뭐든 자유롭게!</p></div>';
    return;
  }
  const shown = memos.filter(m =>
    !q ||
    (m.title||'').toLowerCase().includes(q) ||
    (m.content||'').toLowerCase().includes(q)
  );
  if (shown.length === 0) {
    grid.innerHTML = '<div class="card empty-state"><div class="emoji">🔍</div><p>검색 결과가 없어요.</p></div>';
  } else {
    grid.innerHTML = '<div class="memo-grid">' + shown.map(m => renderMemoCard(m, q)).join('') + '</div>';
  }
}

function renderMemo() {
  const memos = getMemos();
  document.getElementById('main').innerHTML = `
    <div style="max-width:1000px;margin:0 auto">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
        <div class="font-display" style="font-size:22px">메모장 (${memos.length})</div>
        <button class="btn btn-gold" onclick="addMemo()">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          메모 추가
        </button>
      </div>
      <div style="position:relative;margin-bottom:16px">
        <input id="memo-search-input"
          oninput="window._memoSearch=this.value;renderMemoList()"
          placeholder="메모 검색..."
          style="width:100%;padding:9px 36px 9px 14px;border:1.5px solid var(--border);
            border-radius:10px;font-size:13px;background:var(--paper);color:var(--ink);
            font-family:'Noto Sans KR',sans-serif;outline:none;transition:border-color .15s"
          onfocus="this.style.borderColor='var(--gold)'" onblur="this.style.borderColor='var(--border)'">
        <button id="memo-search-clear"
          onclick="window._memoSearch='';document.getElementById('memo-search-input').value='';renderMemoList()"
          style="position:absolute;right:10px;top:50%;transform:translateY(-50%);
            display:none;background:none;border:none;cursor:pointer;font-size:16px;color:var(--muted)">×</button>
      </div>
      <div id="memo-grid-wrap"></div>
    </div>`;
  renderMemoList();
}

function renderMemoCard(m, q='') {
  const col = MEMO_COLORS.find(c=>c.bg===m.color) || MEMO_COLORS[0];
  const mIdEsc = esc(m.id||'');
  // 검색어 하이라이트 (textarea는 HTML 렌더 안 되므로 미리보기용)
  const highlightedContent = q && m.content
    ? esc(m.content).replace(new RegExp(esc(q).replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'gi'),
        s=>`<mark style="background:#ffe066;color:#18120a;border-radius:2px">${s}</mark>`)
    : null;
  return `
    <div class="memo-card" style="background:${col.bg};border-color:${col.border}">
      <div class="memo-card-header" style="border-color:${col.border};background:${col.bg}">
        <input class="memo-card-title" value="${esc(m.title||'')}"
          oninput="updateMemo('${mIdEsc}','title',this.value)" placeholder="제목"
          style="color:#1a1208 !important;background:transparent !important">
        <div style="display:flex;align-items:center;gap:6px">
          <div class="memo-color-dot" style="background:${col.bg};border-color:${col.border}"
            onclick="showMemoColorPicker('${mIdEsc}',this)"></div>
          <button class="btn-icon" onclick="deleteMemo('${mIdEsc}')" style="color:#b5451b !important;width:28px;height:28px">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#b5451b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </div>
      </div>
      ${q && highlightedContent
        ? `<div class="memo-card-body" style="color:#1a1208 !important;background:transparent !important;
            padding:10px 14px;font-size:13px;line-height:1.7;white-space:pre-wrap;min-height:80px">${highlightedContent}</div>`
        : `<textarea class="memo-card-body" rows="6"
            oninput="updateMemo('${mIdEsc}','content',this.value)"
            placeholder="자유롭게 메모하세요..."
            style="color:#1a1208 !important;background:transparent !important">${esc(m.content||'')}</textarea>`}
      <div style="padding:6px 14px 10px;font-size:10px;color:rgba(0,0,0,.4) !important">
        ${m.updatedAt ? new Date(m.updatedAt).toLocaleDateString('ko-KR') : ''}
      </div>
    </div>`;
}

function addMemo() {
  const p = getProject();
  if (!p.memos) p.memos = [];
  p.memos.unshift({
    id: uid(), title:'', content:'',
    color: MEMO_COLORS[0].bg,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  saveMemos(); renderMemoFull();
  // 첫 번째 메모 제목에 포커스
  setTimeout(() => document.querySelector('.memo-card-title')?.focus(), 100);
}

function updateMemo(id, key, val) {
  const p = getProject();
  const m = p?.memos?.find(x => x.id === id);
  if (!m) return;
  m[key] = val;
  m.updatedAt = new Date().toISOString();
  clearTimeout(window._memoSaveTimer);
  window._memoSaveTimer = setTimeout(saveMemos, 600);
}

function deleteMemo(id) {
  const p = getProject();
  const i = p?.memos?.findIndex(m => m.id === id) ?? -1;
  if (i < 0) return;
  confirmDialog('이 메모를 삭제합니다.', () => {
    p.memos.splice(i, 1);
    saveMemos(); renderMemoFull();
    toast('메모를 삭제했어요.');
  });
}

function showMemoColorPicker(id, dotEl) {
  const existing = document.getElementById('memo-color-picker');
  if (existing) { existing.remove(); return; }
  const picker = document.createElement('div');
  picker.id = 'memo-color-picker';
  const rect = dotEl.getBoundingClientRect();
  picker.style.cssText = `position:fixed;left:${rect.left-60}px;top:${rect.bottom+6}px;
    background:var(--white);border:1px solid var(--border);border-radius:10px;
    padding:10px;box-shadow:0 4px 20px var(--shadow);z-index:9000;
    display:flex;gap:8px;flex-wrap:wrap;width:180px`;
  const idEsc = esc(id||'');
  picker.innerHTML = MEMO_COLORS.map(c => `
    <div onclick="setMemoColor('${idEsc}','${c.bg}');document.getElementById('memo-color-picker')?.remove()"
      title="${c.label}"
      style="width:28px;height:28px;border-radius:50%;background:${c.bg};
        border:2px solid ${c.border};cursor:pointer;transition:transform .15s"
      onmouseover="this.style.transform='scale(1.2)'"
      onmouseout="this.style.transform=''">
    </div>`).join('');
  document.body.appendChild(picker);
  setTimeout(() => document.addEventListener('click', () => picker.remove(), {once:true}), 50);
}

function setMemoColor(id, color) {
  const p = getProject();
  const m = p?.memos?.find(x => x.id === id);
  if (!m) return;
  m.color = color;
  saveMemos(); renderMemoFull();
}


// ═══════════════════════════════════════════════════════════
// 특수기호 팔레트
// ═══════════════════════════════════════════════════════════
const SYMBOL_GROUPS = [
  {label:'따옴표', s:['"','"','‘','’','「','」','『','』','〈','〉','《','》','(',')']},
  {label:'점·선',  s:['…','·','—','–','~','～','•','―']},
  {label:'기호',   s:['○','●','□','■','△','▲','▽','▼','◇','◆','☆','★','×','✕','✓','※']},
  {label:'숫자원', s:['①','②','③','④','⑤','⑥','⑦','⑧','⑨','⑩']},
  {label:'화살표', s:['→','←','↑','↓','↔','⇒','⇐','⇔']},
];

function buildSymbolPalette(){
  const pal=document.getElementById('symbol-palette');
  if(!pal||pal.dataset.built) return;
  pal.dataset.built='1';
  SYMBOL_GROUPS.forEach(grp=>{
    const lbl=document.createElement('div');
    lbl.style.cssText='width:100%;font-size:10px;font-weight:700;color:var(--muted);letter-spacing:1px;margin-top:6px;margin-bottom:2px';
    lbl.textContent=grp.label;
    pal.appendChild(lbl);
    grp.s.forEach(sym=>{
      const btn=document.createElement('button');
      btn.className='sym-btn';
      btn.textContent=sym;
      btn.title=sym;
      btn.onclick=()=>insertSymbol(sym);
      pal.appendChild(btn);
    });
  });
}

function toggleSymbolPalette(){
  const pal=document.getElementById('symbol-palette');
  const tog=document.getElementById('sym-toggle-btn');
  if(!pal) return;
  buildSymbolPalette();
  const open=pal.style.display!=='none'&&pal.style.display!=='';
  pal.style.display=open?'none':'flex';
  if(tog){
    tog.style.background=open?'':'var(--gold-light)';
    tog.style.borderColor=open?'':'var(--gold)';
    tog.style.color=open?'':'var(--gold)';
  }
}

function insertSymbol(sym){
  const ta=document.getElementById('prose-editor');
  if(!ta) return;
  const s=ta.selectionStart, e=ta.selectionEnd;
  const selected=ta.value.slice(s,e);

  // 쌍 기호 감지: 짝수 글자이고 앞뒤가 대응되는 경우
  const isPair = sym.length===2;

  if(isPair){
    const open=sym[0], close=sym[1];
    // 선택된 텍스트가 있으면 감싸기
    const inner=selected||'';
    ta.value=ta.value.slice(0,s)+open+inner+close+ta.value.slice(e);
    if(inner){
      // 선택된 텍스트 유지
      ta.selectionStart=s+1;
      ta.selectionEnd=s+1+inner.length;
    } else {
      // 커서를 가운데로
      ta.selectionStart=ta.selectionEnd=s+1;
    }
  } else {
    ta.value=ta.value.slice(0,s)+sym+ta.value.slice(e);
    ta.selectionStart=ta.selectionEnd=s+sym.length;
  }
  ta.focus();
  ta.dispatchEvent(new Event('input',{bubbles:true}));
}


// ═══════════════════════════════════════════════════════════
// 단축키 설정
// ═══════════════════════════════════════════════════════════
const ALL_SYMBOLS = [
  '"','"','‘','’','…','·','—','–','~',
  '「','」','『','』','〈','〉','《','》','(',')',
  '○','●','□','■','△','▲','☆','★','×','✓','※','·','•',
  '→','←','↑','↓','↔','⇒','①','②','③','④','⑤',
];

function showShortcutSettings() {
  const keys = ['1','2','3','4','5','6','7','8','9','0'];
  const symOpts = ALL_SYMBOLS.map(s =>
    `<option value="${s}">${s}</option>`
  ).join('');

  const rows = keys.map(k => {
    const cur = SHORTCUT_SYMBOLS[k] || '';
    return `
      <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)">
        <div style="font-size:13px;font-weight:700;color:var(--muted);min-width:70px">
          Ctrl + <span style="background:var(--cream);border:1px solid var(--border);border-radius:5px;padding:2px 8px;color:var(--ink)">${k}</span>
        </div>
        <select id="sc-${k}" style="flex:1;padding:6px 10px;font-size:15px;font-family:'Noto Serif KR',serif">
          <option value="">없음</option>
          ${ALL_SYMBOLS.map(s => `<option value="${s}" ${s===cur?'selected':''}>${s} ${s===cur?'(현재)':''}</option>`).join('')}
        </select>
        <input id="sci-${k}" value="${cur}" maxlength="2"
          style="width:52px;text-align:center;font-size:18px;font-family:'Noto Serif KR',serif;padding:6px"
          placeholder="직접"
          oninput="document.getElementById('sc-${k}').value=''"
        >
      </div>`;
  }).join('');

  showModal(`
    <div class="modal-title">⚙ 단축키 설정</div>
    <div style="font-size:12px;color:var(--muted);margin-bottom:14px">
      목록에서 선택하거나 오른쪽 칸에 직접 입력하세요. (최대 2자)
    </div>
    <div style="margin-bottom:20px">${rows}</div>
    <div style="display:flex;gap:10px;justify-content:space-between">
      <button class="btn btn-outline" onclick="resetShortcuts()">기본값으로</button>
      <div style="display:flex;gap:10px">
        <button class="btn btn-outline" onclick="closeModal()">취소</button>
        <button class="btn btn-gold" onclick="applyShortcuts()">저장</button>
      </div>
    </div>
  `, false);
}

function applyShortcuts() {
  const keys = ['1','2','3','4','5','6','7','8','9','0'];
  const newMap = {};
  keys.forEach(k => {
    const direct = document.getElementById('sci-' + k)?.value.trim();
    const sel    = document.getElementById('sc-' + k)?.value;
    newMap[k] = direct || sel || '';
  });
  SHORTCUT_SYMBOLS = newMap;
  saveShortcuts(newMap);
  closeModal();
  refreshShortcutBar();
  toast('단축키가 저장됐습니다 ✓');
}

function resetShortcuts() {
  if (!confirm('기본값으로 초기화하시겠습니까?')) return;
  SHORTCUT_SYMBOLS = { ...DEFAULT_SHORTCUTS };
  saveShortcuts(SHORTCUT_SYMBOLS);
  closeModal();
  refreshShortcutBar();
  toast('기본값으로 초기화됐습니다.');
}

function refreshShortcutBar() {
  const bar = document.getElementById('shortcut-bar');
  if (!bar) return;
  bar.innerHTML = '';

  // 라벨
  const lbl = document.createElement('span');
  lbl.style.cssText = 'font-size:10px;font-weight:700;color:var(--muted);margin-right:4px;letter-spacing:.5px;flex-shrink:0';
  lbl.textContent = '단축키';
  bar.appendChild(lbl);

  // 기호 버튼
  const keys = ['1','2','3','4','5','6','7','8','9','0'];
  keys.forEach(k => {
    const sym = SHORTCUT_SYMBOLS[k];
    if (!sym) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.title = 'Ctrl+' + k;
    btn.style.cssText = 'display:inline-flex;align-items:center;gap:2px;background:var(--white);border:1px solid var(--border);border-radius:5px;padding:3px 8px;font-size:15px;color:var(--ink);cursor:pointer;font-family:"Noto Serif KR",serif;line-height:1';
    const small = document.createElement('span');
    small.style.cssText = 'font-size:9px;color:var(--muted);margin-right:2px;font-family:"Noto Sans KR",sans-serif';
    small.textContent = '^' + k;
    const symSpan = document.createElement('span');
    symSpan.textContent = sym;
    btn.appendChild(small);
    btn.appendChild(symSpan);
    btn.addEventListener('click', () => insertSymbol(sym));
    bar.appendChild(btn);
  });

  // 인디케이터
  const ind = document.createElement('span');
  ind.id = 'shortcut-indicator';
  ind.style.cssText = 'font-size:22px;font-weight:700;color:var(--gold);opacity:0;transition:opacity .3s;min-width:28px;text-align:center';
  bar.appendChild(ind);

  // 설정 버튼
  const cfg = document.createElement('button');
  cfg.type = 'button';
  cfg.textContent = '⚙ 단축키 설정';
  cfg.style.cssText = 'margin-left:auto;flex-shrink:0;background:transparent;border:1px solid var(--border);border-radius:6px;padding:3px 8px;font-size:11px;font-weight:600;color:var(--muted);cursor:pointer;font-family:"Noto Sans KR",sans-serif';
  cfg.addEventListener('click', showShortcutSettings);
  bar.appendChild(cfg);
}


// ═══════════════════════════════════════════════════════════
// 원고 설정 & 미리보기
// ═══════════════════════════════════════════════════════════
const MS_PRESETS = [
  {
    id: 'kakao', name: '카카오페이지', icon: '🟡',
    desc: '모바일 최적화 · 짧은 호흡',
    width: 360, font: 'Noto Serif KR', size: 16, line: 1.9,
    padH: 20, padV: 24, charsPerLine: 20, linesPerPage: 22,
  },
  {
    id: 'ridi', name: '리디', icon: '📗',
    desc: '전자책 리더 최적화',
    width: 420, font: 'Noto Serif KR', size: 17, line: 1.85,
    padH: 28, padV: 32, charsPerLine: 23, linesPerPage: 20,
  },
  {
    id: 'joara', name: '조아라', icon: '📘',
    desc: 'PC/모바일 범용',
    width: 680, font: 'Noto Sans KR', size: 15, line: 1.8,
    padH: 40, padV: 40, charsPerLine: 38, linesPerPage: 25,
  },
  {
    id: 'munpia', name: '문피아', icon: '📙',
    desc: 'PC 웹 최적화',
    width: 720, font: 'Noto Sans KR', size: 15, line: 1.8,
    padH: 48, padV: 40, charsPerLine: 40, linesPerPage: 25,
  },
  {
    id: 'naver', name: '네이버 시리즈', icon: '🟢',
    desc: '모바일 앱 최적화',
    width: 375, font: 'Noto Serif KR', size: 16, line: 1.9,
    padH: 18, padV: 24, charsPerLine: 20, linesPerPage: 22,
  },
  {
    id: 'custom', name: '직접 설정', icon: '⚙️',
    desc: '너비·글꼴·크기 직접 지정',
    width: 480, font: 'Noto Serif KR', size: 16, line: 1.85,
    padH: 24, padV: 28, charsPerLine: 26, linesPerPage: 22,
  },
];

function getMsConfig(p) {
  return p.msConfig || { presetId: 'kakao', ...MS_PRESETS[0] };
}

function renderManuscript() {
  const p = getProject();
  const cfg = getMsConfig(p);
  const preset = MS_PRESETS.find(pr => pr.id === cfg.presetId) || MS_PRESETS[0];
  const chapters = p.chapters || [];

  document.getElementById('main').innerHTML = `
    <div style="max-width:900px;margin:0 auto">
      <div class="font-display" style="font-size:22px;margin-bottom:22px">원고 설정</div>

      <!-- 플랫폼 프리셋 -->
      <div class="card" style="margin-bottom:16px">
        <div class="sec-title">플랫폼 선택</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px" id="ms-preset-group">
          ${MS_PRESETS.map(pr => {
            const sel = cfg.presetId === pr.id;
            return `<button type="button" onclick="selectMsPreset('${pr.id}')"
              data-val="${pr.id}"
              style="padding:12px 10px;border:2px solid ${sel?'var(--gold)':'var(--border)'};
                border-radius:10px;cursor:pointer;text-align:center;
                background:${sel?'var(--gold-light)':'var(--white)'};transition:all .15s;
                font-family:'Noto Sans KR',sans-serif">
              <div style="font-size:22px;margin-bottom:4px">${pr.icon}</div>
              <div style="font-size:13px;font-weight:700;color:${sel?'var(--gold)':'var(--ink)'}">${pr.name}</div>
              <div style="font-size:11px;color:var(--muted);margin-top:2px">${pr.desc}</div>
            </button>`;
          }).join('')}
        </div>
      </div>

      <!-- 세부 설정 -->
      <div class="card" style="margin-bottom:16px" id="ms-detail">
        <div class="sec-title">세부 설정
          ${cfg.presetId !== 'custom' ? '<span style="font-size:10px;color:var(--muted);font-weight:400;margin-left:6px">직접 설정 선택 시 수정 가능</span>' : ''}
        </div>
        <div class="form-grid">
          <div><label class="label">너비 (px)</label>
            <input type="number" id="ms-width" value="${cfg.width||480}" ${cfg.presetId!=='custom'?'readonly style="opacity:.6"':''}
              onchange="updateMsConfig('width',+this.value)"></div>
          <div><label class="label">글꼴</label>
            <select id="ms-font" ${cfg.presetId!=='custom'?'disabled style="opacity:.6"':''}
              onchange="updateMsConfig('font',this.value)">
              ${['Noto Serif KR','Noto Sans KR','나눔명조','나눔고딕'].map(f=>
                `<option value="${f}" ${(cfg.font||'Noto Serif KR')===f?'selected':''}>${f}</option>`
              ).join('')}
            </select>
          </div>
          <div><label class="label">글자 크기 (px)</label>
            <input type="number" id="ms-size" value="${cfg.size||16}" min="12" max="24" ${cfg.presetId!=='custom'?'readonly style="opacity:.6"':''}
              onchange="updateMsConfig('size',+this.value)"></div>
          <div><label class="label">줄 간격</label>
            <input type="number" id="ms-line" value="${cfg.line||1.85}" min="1.4" max="2.5" step="0.05" ${cfg.presetId!=='custom'?'readonly style="opacity:.6"':''}
              onchange="updateMsConfig('line',+this.value)"></div>
          <div><label class="label">좌우 여백 (px)</label>
            <input type="number" id="ms-padH" value="${cfg.padH||24}" ${cfg.presetId!=='custom'?'readonly style="opacity:.6"':''}
              onchange="updateMsConfig('padH',+this.value)"></div>
          <div><label class="label">상하 여백 (px)</label>
            <input type="number" id="ms-padV" value="${cfg.padV||28}" ${cfg.presetId!=='custom'?'readonly style="opacity:.6"':''}
              onchange="updateMsConfig('padV',+this.value)"></div>
        </div>
      </div>

      <!-- 미리보기 -->
      <div class="card" style="margin-bottom:16px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
          <div class="sec-title" style="margin:0">미리보기</div>
          <div style="display:flex;gap:8px;align-items:center">
            <select id="ms-ch-select" onchange="updateMsPreview()" style="width:140px;font-size:12px;padding:5px 8px">
              ${chapters.length===0
                ? '<option>화가 없습니다</option>'
                : chapters.map((c,i)=>`<option value="${i}">${esc(c.title)}</option>`).join('')}
            </select>
          </div>
        </div>
        <div style="overflow-x:auto;padding:8px 0">
          <div id="ms-preview-wrap" style="margin:0 auto;transition:all .3s"></div>
        </div>
      </div>
    </div>`;

  updateMsPreview();
}

function selectMsPreset(id) {
  const p = getProject();
  const preset = MS_PRESETS.find(pr => pr.id === id) || MS_PRESETS[0];
  p.msConfig = { ...preset, presetId: id };
  autoSave();
  renderManuscript();
}

function updateMsConfig(key, val) {
  const p = getProject();
  if (!p.msConfig) p.msConfig = { presetId:'custom', ...MS_PRESETS[5] };
  p.msConfig[key] = val;
  autoSave();
  updateMsPreview();
}

function updateMsPreview() {
  const p = getProject();
  const cfg = getMsConfig(p);
  const chapters = p.chapters || [];
  const selEl = document.getElementById('ms-ch-select');
  const chIdx = selEl ? parseInt(selEl.value) || 0 : 0;
  const ch = chapters[chIdx];
  const wrap = document.getElementById('ms-preview-wrap');
  if (!wrap) return;

  const text = ch ? (ch.content || '(내용 없음)') : '(화를 먼저 추가하세요)';
  const title = ch ? ch.title : '';
  // 첫 500자만 미리보기
  const preview = text.length > 500 ? text.slice(0, 500) + '…' : text;
  const totalChars = text.length;
  const charsPerPage = (cfg.charsPerLine||24) * (cfg.linesPerPage||22);
  const totalPages = Math.ceil(totalChars / charsPerPage);

  wrap.style.width = (cfg.width || 480) + 'px';
  wrap.innerHTML = `
    <div class="ms-preview" style="width:${cfg.width||480}px;
      --ms-pad-h:${cfg.padH||24}px;--ms-pad-v:${cfg.padV||28}px;
      --ms-font:'${cfg.font||'Noto Serif KR'}';--ms-size:${cfg.size||16}px;
      --ms-line:${cfg.line||1.85};--ms-height:auto;">
      <div class="ms-header">
        <span>${esc(p.title||'제목 없음')}</span>
        <span>${esc(title)} · ${totalChars.toLocaleString()}자 · 약 ${totalPages}페이지</span>
      </div>
      <div class="ms-page">${esc(preview)}</div>
      ${text.length > 500 ? `<div style="text-align:center;padding:10px;font-size:12px;color:var(--muted);background:#fafafa;border-top:1px solid #eee">미리보기는 500자까지 표시됩니다</div>` : ''}
    </div>`;
}


// ═══════════════════════════════════════════════════════════
// 내보내기 기능
// ═══════════════════════════════════════════════════════════

// 클립보드 복사 (화 선택 or 전체)
function copyToClipboard(chId) {
  const p = getProject();
  let text = '';
  if (chId) {
    const ch = (p.chapters||[]).find(c => c.id === chId);
    if (!ch) return;
    text = ch.title + '\n\n' + (ch.content||'');
  } else {
    text = (p.chapters||[]).map(c => c.title + '\n\n' + (c.content||'')).join('\n\n' + '─'.repeat(20) + '\n\n');
  }
  navigator.clipboard.writeText(text).then(() => {
    toast('클립보드에 복사됐어요! 📋');
  }).catch(() => {
    // 폴백: textarea 방식
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    toast('클립보드에 복사됐어요! 📋');
  });
}

// TXT 저장
function exportTxt(chId) {
  const p = getProject();
  let text = '', filename = '';
  if (chId) {
    const ch = (p.chapters||[]).find(c => c.id === chId);
    if (!ch) return;
    text = ch.title + '\n\n' + (ch.content||'');
    filename = (p.title||'작품') + '_' + ch.title + '.txt';
  } else {
    text = (p.chapters||[]).map(c => c.title + '\n\n' + (c.content||'')).join('\n\n' + '─'.repeat(30) + '\n\n');
    filename = (p.title||'작품') + '_전체.txt';
  }
  const blob = new Blob([text], {type: 'text/plain;charset=utf-8'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  toast('TXT 파일이 저장됐어요! 📄');
}

// DOCX 저장 (HTML → Word 변환 방식)
function exportDocx(chId) {
  const p = getProject();
  let chapters = [], filename = '';
  if (chId) {
    const ch = (p.chapters||[]).find(c => c.id === chId);
    if (!ch) return;
    chapters = [ch];
    filename = (p.title||'작품') + '_' + ch.title + '.docx';
  } else {
    chapters = p.chapters || [];
    filename = (p.title||'작품') + '_전체.docx';
  }

  // Word XML 생성
  const paragraphs = chapters.map(ch => {
    const lines = (ch.content||'').split('\n');
    const titleXml = `<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>${escXml(ch.title)}</w:t></w:r></w:p>`;
    const contentXml = lines.map(line =>
      `<w:p><w:r><w:rPr><w:sz w:val="28"/><w:szCs w:val="28"/></w:rPr><w:t xml:space="preserve">${escXml(line)}</w:t></w:r></w:p>`
    ).join('');
    return titleXml + contentXml;
  }).join('<w:p><w:r><w:t></w:t></w:r></w:p>');

  const docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:pPr><w:jc w:val="center"/></w:pPr>
      <w:r><w:rPr><w:b/><w:sz w:val="36"/></w:rPr><w:t>${escXml(p.title||'제목 없음')}</w:t></w:r>
    </w:p>
    <w:p><w:r><w:t></w:t></w:r></w:p>
    ${paragraphs}
  </w:body>
</w:document>`;

  const relsXml = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

  const wordRelsXml = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
</Relationships>`;

  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

  // JSZip으로 패키징
  const script = document.createElement('script');
  script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
  script.onload = () => {
    const zip = new JSZip();
    zip.file('[Content_Types].xml', contentTypesXml);
    zip.file('_rels/.rels', relsXml);
    zip.file('word/document.xml', docXml);
    zip.file('word/_rels/document.xml.rels', wordRelsXml);
    zip.generateAsync({type:'blob', mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'})
      .then(blob => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        a.click();
        toast('DOCX 파일이 저장됐어요! 📝');
      });
  };
  script.onerror = () => {
    // JSZip 로드 실패 시 TXT로 폴백
    toast('DOCX 변환 실패 — TXT로 저장합니다');
    exportTxt(chId);
  };
  if (!window.JSZip) {
    document.head.appendChild(script);
  } else {
    script.onload();
  }
}

function escXml(str) {
  return (str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
}

// 내보내기 모달
function showExportModal() {
  const p = getProject();
  const chapters = p.chapters || [];
  if (chapters.length === 0) { toast('집필된 화가 없습니다.'); return; }

  showModal(`
    <div class="modal-title">📤 내보내기</div>
    <div style="margin-bottom:16px">
      <label class="label">화 선택</label>
      <select id="exp-ch" style="margin-bottom:4px">
        <option value="">전체 (${chapters.length}화)</option>
        ${chapters.map(c => `<option value="${c.id}">${esc(c.title)} (${(c.content||'').length.toLocaleString()}자)</option>`).join('')}
      </select>
    </div>
    <div style="display:grid;gap:10px;margin-bottom:20px">
      <button class="btn btn-gold" onclick="copyToClipboard(document.getElementById('exp-ch').value)" style="justify-content:center;font-size:14px;padding:12px">
        📋 클립보드 복사 (플랫폼 붙여넣기용)
      </button>
      <button class="btn btn-outline" onclick="exportTxt(document.getElementById('exp-ch').value)" style="justify-content:center;font-size:14px;padding:12px">
        📄 TXT 파일로 저장
      </button>
      <button class="btn btn-outline" onclick="exportDocx(document.getElementById('exp-ch').value)" style="justify-content:center;font-size:14px;padding:12px">
        📝 DOCX (Word) 파일로 저장
      </button>
      <button class="btn btn-outline" onclick="exportHwpx(document.getElementById('exp-ch').value)" style="justify-content:center;font-size:14px;padding:12px">
        📖 HWPX (한글·화면 양식 적용) 저장
      </button>
      <button class="btn btn-outline" onclick="exportData()" style="justify-content:center;font-size:14px;padding:12px;border-color:var(--teal);color:var(--teal)">
        💾 JSON 백업 저장 (전체 데이터)
      </button>
    </div>
    <div style="font-size:11px;color:var(--muted);background:var(--cream);border-radius:8px;padding:10px 12px;line-height:1.7">
      💡 <b>클립보드 복사</b>: 카카오페이지·리디 등 웹 에디터에 바로 붙여넣기<br>
      💡 <b>TXT</b>: 메모장·기타 도구에서 열기<br>
      💡 <b>DOCX</b>: MS Word·한컴오피스에서 열기<br>
      💡 <b>HWPX</b>: 현재 화면 양식의 글꼴·크기·행간·본문색·용지색을 한글 문서에 적용<br>
      💡 <b>JSON</b>: 앱 데이터 전체 백업 (캐릭터·플롯 포함)
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="closeModal()">닫기</button>
    </div>
  `);
}


function showChExportMenu(chId) {
  const p = getProject();
  const ch = (p.chapters||[]).find(c => c.id === chId);
  if (!ch) return;
  showModal(`
    <div class="modal-title">📤 ${esc(ch.title)} 내보내기</div>
    <div style="display:grid;gap:10px;margin-bottom:20px">
      <button class="btn btn-gold" onclick="copyToClipboard('${chId}');closeModal()" style="justify-content:center;font-size:14px;padding:12px">
        📋 클립보드 복사
      </button>
      <button class="btn btn-outline" onclick="exportTxt('${chId}');closeModal()" style="justify-content:center;font-size:14px;padding:12px">
        📄 TXT 저장
      </button>
      <button class="btn btn-outline" onclick="exportDocx('${chId}');closeModal()" style="justify-content:center;font-size:14px;padding:12px">
        📝 DOCX 저장
      </button>
      <button class="btn btn-outline" onclick="exportHwpx('${chId}');closeModal()" style="justify-content:center;font-size:14px;padding:12px">
        📖 HWPX (화면 양식 적용) 저장
      </button>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="closeModal()">닫기</button>
    </div>
  `);
}


// ═══════════════════════════════════════════════════════════
// 커스텀 확인 모달 (태블릿 confirm 대체)
// ═══════════════════════════════════════════════════════════
function confirmDialog(msg, onOk) {
  document.querySelectorAll('.confirm-dialog-bg').forEach(el => el.remove());
  const bg = document.createElement('div');
  bg.className = 'confirm-dialog-bg';
  bg.style.cssText = 'position:fixed;inset:0;background:rgba(24,18,10,.55);z-index:9999;display:flex;align-items:center;justify-content:center;';
  bg.innerHTML = '<div style="background:var(--paper);border:1px solid var(--border);border-radius:14px;padding:24px;width:300px;max-width:90vw;text-align:center"><div style="font-size:28px;margin-bottom:12px">🗑️</div><div style="font-size:15px;font-weight:600;color:var(--ink);margin-bottom:6px">확인해 주세요</div><div class="cdg-message" style="font-size:13px;color:var(--muted);margin-bottom:20px"></div><div style="display:flex;gap:10px"><button class="cdg-cancel" style="flex:1;padding:10px;border:1.5px solid var(--border);border-radius:8px;background:transparent;color:var(--muted);cursor:pointer;font-size:14px;font-weight:600;font-family:Noto Sans KR,sans-serif">취소</button><button class="cdg-ok" style="flex:1;padding:10px;border:none;border-radius:8px;background:var(--rust);color:#fff;cursor:pointer;font-size:14px;font-weight:700;font-family:Noto Sans KR,sans-serif">확인</button></div></div>';
  bg.querySelector('.cdg-message').textContent = msg;
  document.body.appendChild(bg);
  bg.querySelector('.cdg-cancel').addEventListener('click', () => bg.remove());
  bg.querySelector('.cdg-ok').addEventListener('click', () => { bg.remove(); onOk(); });
}


// ═══════════════════════════════════════════════════════════
// 분할 패널 (참고 패널)
// ═══════════════════════════════════════════════════════════
let splitTab = 'overview';
let splitOverviewEditing = false;

function splitElement(id) {
  const focusPanel = document.getElementById('focus-ref-panel');
  if (document.getElementById('focus-overlay')?.classList.contains('active') &&
      focusPanel?.style.display !== 'none') {
    return focusPanel.querySelector(`[id="${id}"]`);
  }
  return document.getElementById('split-panel')?.querySelector(`[id="${id}"]`) || null;
}

function toggleSplitPanel() {
  const panel = document.getElementById('split-panel');
  const btn   = document.getElementById('split-toggle-btn');
  if (!panel) return;
  const isMobile = window.innerWidth <= 768;
  const isHidden = panel.classList.contains('hidden');
  if (isHidden) {
    panel.classList.remove('hidden');
    if (!isMobile && window.innerWidth <= 1024) setChapterListCollapsed(true);
    if (!isMobile) initSplitPanelResize();
    if (btn) { btn.style.background='var(--gold-light)'; btn.style.borderColor='var(--gold)'; btn.style.color='var(--gold)'; btn.textContent='⊠ 참고'; }
    if (isMobile) {
      let bd = document.getElementById('split-panel-backdrop');
      if (!bd) {
        bd = document.createElement('div');
        bd.id = 'split-panel-backdrop';
        document.body.appendChild(bd);
      }
      bd.style.display = 'block';
      bd.onclick = () => toggleSplitPanel();

      // 스와이프로 닫기
      let _swipeStartX = null;
      let _swipeStartY = null;
      let _swipeDirection = null;
      panel._swipeStart = (e) => {
        if (e.target.closest('.split-panel-tabs, input, textarea, select')) return;
        _swipeStartX = e.touches[0].clientX;
        _swipeStartY = e.touches[0].clientY;
        _swipeDirection = null;
      };
      panel._swipeMove = (e) => {
        if (_swipeStartX === null) return;
        const dx = e.touches[0].clientX - _swipeStartX;
        const dy = e.touches[0].clientY - _swipeStartY;
        if (!_swipeDirection && Math.max(Math.abs(dx), Math.abs(dy)) > 12) {
          _swipeDirection = Math.abs(dx) > Math.abs(dy) * 1.3 ? 'horizontal' : 'vertical';
        }
        if (_swipeDirection === 'horizontal' && dx > 0) panel.style.transform = `translateX(${dx}px)`;
      };
      panel._swipeEnd = (e) => {
        const dx = _swipeStartX === null ? 0 : (e.changedTouches[0]?.clientX ?? _swipeStartX) - _swipeStartX;
        const close = _swipeDirection === 'horizontal' && dx > 80;
        panel.style.transform = '';
        _swipeStartX = null;
        _swipeStartY = null;
        _swipeDirection = null;
        if (close) toggleSplitPanel();
      };
      panel.addEventListener('touchstart', panel._swipeStart, {passive:true});
      panel.addEventListener('touchmove',  panel._swipeMove,  {passive:true});
      panel.addEventListener('touchend',   panel._swipeEnd,   {passive:true});
      panel.addEventListener('touchcancel', panel._swipeEnd, {passive:true});
    }
    renderSplitContent();
    setTimeout(initAllDragScrolls, 50);
  } else {
    panel.classList.add('hidden');
    if (btn) { btn.style.background=''; btn.style.borderColor=''; btn.style.color=''; btn.textContent='⊞ 참고'; }
    const bd = document.getElementById('split-panel-backdrop');
    if (bd) bd.style.display = 'none';
    if (panel._swipeStart) panel.removeEventListener('touchstart', panel._swipeStart);
    if (panel._swipeMove) panel.removeEventListener('touchmove',  panel._swipeMove);
    if (panel._swipeEnd)  panel.removeEventListener('touchend',   panel._swipeEnd);
    if (panel._swipeEnd)  panel.removeEventListener('touchcancel', panel._swipeEnd);
    panel.style.transform = '';
  }
}

function switchSplitTab(tab) {
  splitTab = tab;
  document.querySelectorAll('.split-tab').forEach(b => {
    const match = b.getAttribute('onclick')?.includes("'" + tab + "'");
    b.classList.toggle('active', !!match);
  });
  renderSplitContent();
}

function renderSplitContent() {
  const el = document.getElementById('split-content');
  if (!el) return;
  const p = getProject();
  if (!p) { el.innerHTML = '<div style="color:var(--muted);text-align:center;padding:20px">작품을 먼저 열어주세요</div>'; return; }

  if (splitTab === 'overview') {
    if (splitOverviewEditing) {
      el.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
          <strong style="font-size:13px">작품 개요 편집</strong>
          <button class="btn btn-outline btn-sm" onclick="splitOverviewEditing=false;refreshSplitPanel()">완료</button>
        </div>
        <label class="label">작품 제목</label>
        <input value="${esc(p.title||'')}" oninput="updateProject('title',this.value)" style="width:100%;margin-bottom:10px">
        <label class="label">장르</label>
        <select onchange="updateProject('genre',this.value)" style="width:100%;margin-bottom:10px">${selOpts(GENRES,p.genre)}</select>
        <label class="label">연재 상태</label>
        <select onchange="updateProject('status',this.value)" style="width:100%;margin-bottom:10px">${selOpts(STATUSES,p.status)}</select>
        <label class="label">줄거리</label>
        <textarea rows="6" oninput="updateProject('synopsis',this.value)" style="width:100%;margin-bottom:10px">${esc(p.synopsis||'')}</textarea>
        <label class="label">작가 메모</label>
        <textarea rows="4" oninput="updateProject('memo',this.value)" style="width:100%">${esc(p.memo||'')}</textarea>`;
      return;
    }
    el.innerHTML = `
      <div style="margin-bottom:14px">
        <div style="font-size:11px;font-weight:700;color:var(--muted);letter-spacing:.5px;margin-bottom:4px">작품 제목</div>
        <div style="font-size:16px;font-weight:700;color:var(--ink)">${esc(p.title||'제목 없음')}</div>
      </div>
      <div style="display:flex;gap:12px;margin-bottom:14px">
        <div>
          <div style="font-size:11px;font-weight:700;color:var(--muted);margin-bottom:2px">장르</div>
          <div style="font-size:13px">${esc(p.genre||'-')}</div>
        </div>
        <div>
          <div style="font-size:11px;font-weight:700;color:var(--muted);margin-bottom:2px">상태</div>
          <div style="font-size:13px">${esc(p.status||'-')}</div>
        </div>
      </div>
      ${p.synopsis ? `
        <div style="margin-bottom:14px">
          <div style="font-size:11px;font-weight:700;color:var(--muted);margin-bottom:6px">줄거리</div>
          <div style="font-size:13px;line-height:1.9;color:var(--ink);white-space:pre-wrap;padding:12px;background:var(--cream);border-radius:8px;border-left:3px solid var(--gold)">${esc(p.synopsis)}</div>
        </div>` : ''}
      ${p.memo ? `
        <div>
          <div style="font-size:11px;font-weight:700;color:var(--muted);margin-bottom:6px">작가 메모</div>
          <div style="font-size:13px;line-height:1.8;color:var(--muted);white-space:pre-wrap">${esc(p.memo)}</div>
        </div>` : ''}
      <div style="margin-top:16px;padding-top:12px;border-top:1px solid var(--border)">
        <button class="btn btn-outline btn-sm" onclick="splitOverviewEditing=true;refreshSplitPanel()" style="font-size:11px">✏️ 이 패널에서 편집</button>
      </div>
    `;

  } else if (splitTab === 'characters') {
    const chars = p.characters || [];
    if (!chars.length) {
      el.innerHTML = `<div style="text-align:center;padding:30px 0">
        <div style="font-size:32px;margin-bottom:8px">👤</div>
        <div style="color:var(--muted);font-size:13px;margin-bottom:12px">등록된 캐릭터가 없어요</div>
        <button class="btn btn-gold btn-sm" onclick="showCharModal()">＋ 캐릭터 추가</button>
      </div>`;
      return;
    }
    el.innerHTML = `
      <div style="display:flex;justify-content:flex-end;margin-bottom:10px">
        <button class="btn btn-gold btn-sm" onclick="showCharModal()">＋ 추가</button>
      </div>
      ${chars.map((c,i) => {
        const bg = c.color || (c.group ? getGroupColor(c.group) : 'var(--white)');
        const isDark = document.documentElement.dataset.theme === 'dark';
        const hasCustomBg = !!(c.color || c.group);
        // 다크모드에서 밝은 배경 카드는 어두운 텍스트, 배경 없으면 var(--ink)
        const cardText = hasCustomBg ? '#18120a' : 'var(--ink)';
        const collapsed = splitCharCollapsed['c'+i] !== false ? true : false; // 기본 접힘
        return `
        <div style="border:1px solid var(--border);border-radius:10px;margin-bottom:10px;overflow:hidden;background:${bg};color:${cardText}">
          <div style="padding:8px 12px;background:rgba(0,0,0,.04);display:flex;justify-content:space-between;align-items:flex-start;cursor:pointer"
            onclick="toggleSplitChar(${i})">
            <div style="flex:1;min-width:0">
              <div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap;margin-bottom:2px">
                <span style="font-weight:700;font-size:14px;color:${cardText}">${esc(c.name)}</span>
                ${c.role?`<span style="font-size:10px;background:var(--gold-light);color:var(--gold);padding:1px 7px;border-radius:20px;font-weight:600">${esc(c.role)}</span>`:''}
                ${c.gender?`<span style="font-size:10px;background:rgba(0,0,0,.08);color:${cardText};padding:1px 7px;border-radius:20px;font-weight:600">${esc(c.gender)}</span>`:''}
                ${c.age?`<span style="font-size:10px;background:rgba(0,0,0,.08);color:${cardText};padding:1px 7px;border-radius:20px;font-weight:600">${esc(c.age)}세</span>`:''}
                ${c.alive&&c.alive!=='생존'?`<span style="font-size:10px;background:${c.alive==='사망'?'var(--rust-light)':'rgba(0,0,0,.08)'};color:${c.alive==='사망'?'var(--rust)':cardText};padding:1px 7px;border-radius:20px;font-weight:600">${esc(c.alive)}</span>`:''}
              </div>
              ${c.group?`<div style="font-size:10px;color:${cardText};opacity:.7">${esc(c.group)}</div>`:''}
            </div>
            <div style="display:flex;align-items:center;gap:4px;flex-shrink:0;margin-left:6px">
              <button onclick="event.stopPropagation();showCharModal(${i})"
                style="background:none;border:none;cursor:pointer;font-size:12px;color:var(--teal)">✏️</button>
              <span style="font-size:11px;color:var(--muted);transition:transform .2s;display:inline-block;transform:rotate(${collapsed?'-90':'0'}deg)">▾</span>
            </div>
          </div>
          ${collapsed ? '' : `
          <div style="padding:10px 12px;font-size:12px;line-height:1.8;border-top:1px solid rgba(0,0,0,.06)">
            ${c.honorific?`<div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:6px">${c.honorific.split(',').map(h=>h.trim()).filter(Boolean).map(h=>`<span style="font-size:10px;background:var(--teal-light);color:var(--teal);padding:1px 7px;border-radius:20px;font-weight:600">${esc(h)}</span>`).join('')}</div>`:''}
            ${c.appearance?`<div style="margin-bottom:3px"><span style="color:${cardText};opacity:.6">외모 </span>${esc(c.appearance)}</div>`:''}
            ${c.personality?`<div style="margin-bottom:3px"><span style="color:${cardText};opacity:.6">성격 </span>${esc(c.personality)}</div>`:''}
            ${c.background?`<div style="margin-bottom:3px"><span style="color:${cardText};opacity:.6">배경 </span>${esc(c.background)}</div>`:''}
            ${c.speech?`<div style="margin-bottom:3px"><span style="color:${cardText};opacity:.6">특징/능력 </span>${esc(c.speech)}</div>`:''}
            ${c.goal?`<div><span style="color:var(--rust);font-weight:600">목표 </span>${esc(c.goal)}</div>`:''}
          </div>`}
        </div>`;
      }).join('')}`;

  } else if (splitTab === 'plot') {
    const arcs = p.arcs || [];
    if (!arcs.length) {
      el.innerHTML = `<div style="text-align:center;padding:30px 0">
        <div style="font-size:32px;margin-bottom:8px">📐</div>
        <div style="color:var(--muted);font-size:13px">등록된 아크가 없어요</div>
      </div>`;
      return;
    }
    if (!window._spArcCol) window._spArcCol = {};
    el.innerHTML = arcs.map((a,ai) => {
      const col = window._spArcCol[ai] !== false ? true : false; // 기본 접힘
      return `
      <div style="margin-bottom:10px;border:1px solid var(--border);border-radius:10px;overflow:hidden">
        <div style="display:flex;align-items:center;justify-content:space-between;
          padding:8px 12px;background:var(--gold-light);cursor:pointer;user-select:none"
          onclick="window._spArcCol[${ai}]=window._spArcCol[${ai}]===undefined?false:!window._spArcCol[${ai}];refreshSplitPanel()">
          <span style="font-weight:700;font-size:13px;color:var(--gold)">${esc(a.title)}</span>
          <span style="color:var(--gold);font-size:10px;transition:transform .2s;display:inline-block;transform:rotate(${col?'-90':'0'}deg)">▼</span>
        </div>
        ${col ? '' : `<div style="padding:8px 10px">
          ${(a.scenes||[]).length === 0
            ? `<div style="font-size:12px;color:var(--muted);text-align:center;padding:8px">장면 없음</div>`
            : (a.scenes||[]).map((s,si) => `
              <div style="padding:8px 10px;border-left:2px solid var(--border);margin-bottom:6px;background:var(--white);border-radius:0 8px 8px 0">
                <div style="font-size:12px;font-weight:600;margin-bottom:4px"><span style="color:var(--muted)">#${si+1}</span> ${esc(s.title)}</div>
                ${s.summary ? `<div style="font-size:11px;color:var(--muted);line-height:1.6;white-space:pre-wrap">${esc(s.summary)}</div>` : ''}
              </div>`).join('')}
        </div>`}
      </div>`;
    }).join('');

  } else if (splitTab === 'world') {
    const worlds = p.worldSettings || [];
    if (!worlds.length) {
      el.innerHTML = `<div style="text-align:center;padding:30px 0">
        <div style="font-size:32px;margin-bottom:8px">🌍</div>
        <div style="color:var(--muted);font-size:13px;margin-bottom:12px">세계관 설정이 없어요</div>
        <button class="btn btn-gold btn-sm" onclick="showWorldModal()">＋ 설정 추가</button>
      </div>`;
      return;
    }
    const groups = {};
    worlds.forEach((w,i) => {
      const cat = w.category || '기타';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push({...w, _i:i});
    });
    // 장르 카테고리 순서대로 정렬
    const orderedCats = [...getWorldCats(p.genre), ...Object.keys(groups).filter(c => !getWorldCats(p.genre).includes(c))];
    const sortedGroups = orderedCats.filter(c => groups[c]).map(c => [c, groups[c]]);
    if (!window._spWorldCol) window._spWorldCol = {};
    el.innerHTML = `
      <div style="display:flex;justify-content:flex-end;margin-bottom:10px">
        <button class="btn btn-gold btn-sm" onclick="showWorldModal()">＋ 추가</button>
      </div>
      ${sortedGroups.map(([cat, items]) => `
        <div style="margin-bottom:16px">
          <div style="font-size:10px;font-weight:700;color:var(--muted);letter-spacing:1px;margin-bottom:6px">${esc(cat)}</div>
          ${items.map(w => {
            const col = window._spWorldCol[w._i] !== false ? true : false; // 기본 접힘
            return `
            <div style="border:1px solid var(--border);border-radius:10px;margin-bottom:8px;overflow:hidden;background:var(--white)">
              <div style="padding:8px 12px;background:var(--cream);display:flex;justify-content:space-between;align-items:center;cursor:pointer;user-select:none"
                onclick="window._spWorldCol[${w._i}]=window._spWorldCol[${w._i}]===undefined?false:!window._spWorldCol[${w._i}];refreshSplitPanel()">
                <span style="font-weight:700;font-size:13px">${esc(w.title)}</span>
                <div style="display:flex;align-items:center;gap:6px">
                  <span style="color:var(--muted);font-size:10px;transition:transform .2s;display:inline-block;transform:rotate(${col?'-90':'0'}deg)">▼</span>
                  <button onclick="event.stopPropagation();showWorldModal(${w._i})" style="background:none;border:none;cursor:pointer;font-size:12px;color:var(--teal)">✏️</button>
                </div>
              </div>
              ${col ? '' : `<div style="padding:8px 12px;font-size:12px;color:var(--muted);line-height:1.7;white-space:pre-wrap">${esc(w.content||'')}</div>`}
            </div>`;
          }).join('')}
        </div>`).join('')}`;

  } else if (splitTab === 'relations') {
    const chars = p.characters || [];
    const rels = p.relations || [];
    if (chars.length < 2) {
      el.innerHTML = `<div style="text-align:center;padding:20px;font-size:13px;color:var(--muted)">
        관계를 만들려면 인물이 두 명 이상 필요해요.<br>
        <button class="btn btn-gold btn-sm" style="margin-top:10px" onclick="showCharModal()">＋ 인물 추가</button>
      </div>`;
      return;
    }
    const charOpts = chars.map(c => `<option value="${esc(c.name)}">${esc(c.name)}</option>`).join('');
    el.innerHTML = `
      <div style="display:grid;gap:7px;margin-bottom:16px;padding:10px;background:var(--cream);border-radius:8px">
        <strong style="font-size:12px">관계 추가</strong>
        <select id="split-rel-from" aria-label="인물 A"><option value="">인물 A 선택</option>${charOpts}</select>
        <input id="split-rel-type" aria-label="관계 유형" placeholder="관계 유형 (예: 동료, 라이벌)">
        <select id="split-rel-to" aria-label="인물 B"><option value="">인물 B 선택</option>${charOpts}</select>
        <button class="btn btn-gold btn-sm" onclick="addSplitRelation()">＋ 관계 추가</button>
      </div>
      <strong style="font-size:12px">관계 목록 (${rels.length})</strong>
      ${rels.length ? rels.map((r,i) => `
        <div style="display:flex;align-items:center;gap:5px;padding:8px 0;border-bottom:1px solid var(--border);font-size:12px">
          <span style="font-weight:600">${esc(r.from)}</span>
          <span style="color:var(--teal)">${esc(r.type)}</span>
          <span style="font-weight:600">${esc(r.to)}</span>
          <button onclick="deleteSplitRelation(${i})" aria-label="${esc(r.from)}와 ${esc(r.to)}의 관계 삭제"
            style="margin-left:auto;background:none;border:none;color:var(--rust);cursor:pointer;font-size:16px">×</button>
        </div>`).join('') : '<div style="font-size:12px;color:var(--muted);padding:10px 0">등록된 관계가 없어요</div>'}
    `;

  } else if (splitTab === 'family') {
    const families = p.families || [];
    if (!families.length) {
      el.innerHTML = `<div style="text-align:center;padding:30px 0">
        <div style="font-size:32px;margin-bottom:8px">🏰</div>
        <div style="color:var(--muted);font-size:13px;margin-bottom:12px">등록된 가문 및 집단이 없어요</div>
        <button class="btn btn-gold btn-sm" onclick="showFamilyModal()">＋ 추가</button>
      </div>`;
      return;
    }
    el.innerHTML = `
      <div style="display:flex;justify-content:flex-end;margin-bottom:10px">
        <button class="btn btn-gold btn-sm" onclick="showFamilyModal()">＋ 추가</button>
      </div>
      ${families.map((f, fi) => {
        const collapsed = splitFamilyCollapsed['f'+fi];
        return `
        <div style="border:1px solid var(--border);border-radius:10px;margin-bottom:10px;overflow:hidden;border-left:3px solid ${f.color||'var(--gold)'}">
          <div style="padding:8px 12px;background:var(--cream);display:flex;justify-content:space-between;align-items:center;cursor:pointer"
            onclick="toggleSplitFamily(${fi})">
            <div>
              <span style="font-weight:700;font-size:13px">${esc(f.name)}</span>
              <span style="font-size:10px;background:var(--teal-light);color:var(--teal);padding:1px 6px;border-radius:10px;margin-left:4px">${({'family':'가문','guild':'길드','knight':'기사단','crime_f':'범죄조직','religion':'종교','academic':'학술','politics':'정치','corp':'기업','school':'학교','crime_m':'범죄조직','media':'미디어','military':'군사','politics_m':'정치','korean':'한국풍','chinese':'중국풍','japanese':'일본풍','other':'기타'}[f.groupType||'family']||'가문')}</span>
              ${f.rank?`<span style="font-size:10px;color:var(--muted);margin-left:4px">${esc(f.rank)}</span>`:''}
              <span style="font-size:10px;color:var(--muted);margin-left:6px">${Object.values(f.groups||{}).reduce((a,g)=>a+(g||[]).length,0)}명</span>
            </div>
            <span style="font-size:11px;color:var(--muted);transform:rotate(${collapsed?'-90':'0'}deg);display:inline-block;transition:transform .2s">▾</span>
          </div>
          ${collapsed ? '' : `
          <div style="padding:8px 12px">
            ${f.description?`<div style="font-size:11px;color:var(--muted);margin-bottom:8px;line-height:1.6">${esc(f.description)}</div>`:''}
            ${(()=>{
              const groups = f.groups || {};
              const allMembers = Object.entries(groups).flatMap(([tab, members]) =>
                (members||[]).map(m => ({...m, _tab: tab}))
              );
              if (!allMembers.length) return '<div style="font-size:12px;color:var(--muted);text-align:center;padding:8px">구성원 없음</div>';
              return Object.entries(groups).filter(([,members])=>(members||[]).length>0).map(([tab, members])=>`
                <div style="margin-bottom:6px">
                  <div style="font-size:10px;font-weight:700;color:var(--muted);letter-spacing:.5px;margin-bottom:4px">${esc(tab)}</div>
                  ${members.map(m=>`
                    <div style="display:flex;align-items:center;gap:8px;padding:4px 0;border-bottom:1px solid var(--border);font-size:12px">
                      <span style="font-weight:600">${esc(m.name)}</span>
                      ${m.relation?`<span style="color:var(--muted)">${esc(m.relation)}</span>`:''}
                      ${m.note?`<span style="color:var(--teal);font-size:11px">${esc(m.note)}</span>`:''}
                    </div>`).join('')}
                </div>`).join('');
            })()}
          </div>`}
        </div>`;
      }).join('')}`;

  } else if (splitTab === 'items') {
    const items = p.items || [];
    if (!window._splitItemCollapsed) window._splitItemCollapsed = {};
    if (!window._splitItemQ) window._splitItemQ = '';
    const sq = window._splitItemQ.trim().toLowerCase();
    const filtered = sq ? items.filter(it => it.name.toLowerCase().includes(sq) || (it.desc||'').toLowerCase().includes(sq)) : items;
    const usedCats = ITEM_CATS.filter(c => filtered.some(it => it.cat === c));
    const catGroups = usedCats.map(c => ({ cat: c, list: filtered.filter(it => it.cat === c) }));
    el.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">'
      + '<span style="font-size:12px;font-weight:700;color:var(--muted)">아이템 (' + items.length + ')</span>'
      + '<button onclick="showItemModal();refreshSplitPanel()" class="btn btn-gold btn-sm">＋ 추가</button>'
      + '</div>'
      + '<div style="position:relative;margin-bottom:10px">'
      + '<input id="split-item-search" placeholder="아이템 검색..." value="' + esc(window._splitItemQ) + '" '
      + 'style="width:100%;padding:6px 28px 6px 10px;font-size:12px;border:1.5px solid var(--border);border-radius:8px;background:var(--paper);color:var(--ink);font-family:\'Noto Sans KR\',sans-serif;outline:none">'
      + '<button id="split-item-clear" onclick="window._splitItemQ=\'\';splitElement(\'split-item-search\').value=\'\';refreshSplitItems()" '
      + 'style="display:' + (sq?'block':'none') + ';position:absolute;right:6px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;font-size:13px;color:var(--muted)">×</button>'
      + '</div>'
      + '<div id="split-items-inner"></div>';
    refreshSplitItems();

  } else if (splitTab === 'memo') {
    if (!window._spMemoQ) window._spMemoQ = '';
    const mq = window._spMemoQ.trim().toLowerCase();
    const allMemos = getChapterMemos();
    el.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <span style="font-size:12px;font-weight:700;color:var(--muted)">메모 (${allMemos.length})</span>
        <button onclick="addChapterMemo()" class="btn btn-gold btn-sm">＋ 추가</button>
      </div>
      <div style="position:relative;margin-bottom:10px">
        <input id="split-memo-search" placeholder="메모 검색..." value="${esc(window._spMemoQ)}"
          style="width:100%;padding:6px 28px 6px 10px;font-size:12px;border:1.5px solid var(--border);border-radius:8px;background:var(--paper);color:var(--ink);font-family:'Noto Sans KR',sans-serif;outline:none">
        <button id="split-memo-clear" onclick="window._spMemoQ='';splitElement('split-memo-search').value='';refreshSplitMemo()"
          style="display:${mq?'block':'none'};position:absolute;right:6px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;font-size:13px;color:var(--muted)">×</button>
      </div>
      <div id="split-memo-inner"></div>`;
    refreshSplitMemo();
  } else if (splitTab === 'glossary') {
    el.innerHTML = renderSplitGlossary();
  }
}

function addSplitRelation() {
  const from = splitElement('split-rel-from')?.value || '';
  const to = splitElement('split-rel-to')?.value || '';
  const type = splitElement('split-rel-type')?.value.trim() || '';
  if (!from || !to || !type) { toast('인물과 관계 유형을 모두 입력해주세요.'); return; }
  if (from === to) { toast('같은 인물은 선택할 수 없습니다.'); return; }
  const p = getProject();
  if (!p) return;
  if (!p.relations) p.relations = [];
  p.relations.push({ from, to, type });
  autoSave();
  refreshSplitPanel();
}

function deleteSplitRelation(index) {
  confirmDialog('이 관계를 삭제할까요?', () => {
    const p = getProject();
    if (!p?.relations?.[index]) return;
    p.relations.splice(index, 1);
    autoSave();
    refreshSplitPanel();
  });
}


function renderSplitGlossary() {
  const p = getProject();
  const list = p.glossary || [];
  if (!window._glossaryPanelQ) window._glossaryPanelQ = '';
  if (!window._glossaryPanelCat) window._glossaryPanelCat = '전체';
  if (!window._glossaryPanelOpen) window._glossaryPanelOpen = {};
  if (!window._glossaryPanelEdit) window._glossaryPanelEdit = {};
  const q = window._glossaryPanelQ.trim().toLowerCase();
  const cat = window._glossaryPanelCat;

  const filtered = list.filter(g =>
    (cat === '전체' || g.cat === cat) &&
    (!q || g.term.toLowerCase().includes(q) || (g.desc||'').toLowerCase().includes(q))
  );

  const catBtns = ['전체', ...GLOSSARY_CATS].map(c =>
    '<button onclick="window._glossaryPanelCat=\'' + c + '\';refreshSplitGlossary()" '
    + 'style="padding:2px 8px;border-radius:12px;border:1px solid '
    + (cat===c ? 'var(--gold)' : 'var(--border)') + ';background:'
    + (cat===c ? 'var(--gold)' : 'transparent') + ';color:'
    + (cat===c ? '#fff' : 'var(--muted)') + ';font-size:11px;cursor:pointer;white-space:nowrap">' + c + '</button>'
  ).join('');

  const cards = filtered.length === 0
    ? '<div style="text-align:center;color:var(--muted);font-size:12px;padding:20px 0">'
      + (list.length === 0 ? '용어가 없어요' : '검색 결과 없음') + '</div>'
    : filtered.map(g => {
        const idx = list.indexOf(g);
        const open = !!window._glossaryPanelOpen[idx];
        const edit = !!window._glossaryPanelEdit[idx];

        // 접힌 상태
        if (!open) {
          return '<div style="border:1px solid var(--border);border-radius:8px;margin-bottom:6px;overflow:hidden">'
            + '<div style="display:flex;align-items:center;gap:6px;padding:8px 10px;cursor:pointer;background:var(--cream)" '
            + 'onclick="window._glossaryPanelOpen[' + idx + ']=true;window._glossaryPanelEdit[' + idx + ']=false;refreshSplitGlossary()">'
            + '<span style="flex:1;font-weight:700;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(g.term) + '</span>'
            + (g.alias ? '<span style="font-size:10px;color:var(--muted)">' + esc(g.alias) + '</span>' : '')
            + '<span style="font-size:10px;color:var(--teal);flex-shrink:0">' + esc(g.cat||'기타') + '</span>'
            + '<span style="font-size:10px;color:var(--muted);flex-shrink:0;margin-left:2px">▾</span>'
            + '</div>'
            + '</div>';
        }

        // 펼쳐진 읽기 모드
        if (!edit) {
          return '<div style="border:1.5px solid var(--gold);border-radius:8px;margin-bottom:6px;overflow:hidden">'
            + '<div style="display:flex;align-items:center;gap:6px;padding:8px 10px;cursor:pointer;background:var(--gold-light)" '
            + 'onclick="window._glossaryPanelOpen[' + idx + ']=false;refreshSplitGlossary()">'
            + '<span style="flex:1;font-weight:700;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(g.term) + '</span>'
            + (g.alias ? '<span style="font-size:10px;color:var(--muted)">' + esc(g.alias) + '</span>' : '')
            + '<span style="font-size:10px;color:var(--teal);flex-shrink:0">' + esc(g.cat||'기타') + '</span>'
            + '<span style="font-size:10px;color:var(--muted);flex-shrink:0;margin-left:2px">▴</span>'
            + '</div>'
            + '<div style="padding:10px 12px;background:var(--paper)">'
            + (g.desc ? '<div style="font-size:12px;color:var(--ink);line-height:1.7;white-space:pre-wrap;margin-bottom:6px">' + esc(g.desc) + '</div>' : '<div style="font-size:12px;color:var(--muted);margin-bottom:6px">설명 없음</div>')
            + (g.related ? '<div style="font-size:11px;color:var(--teal)">🔗 ' + esc(g.related) + '</div>' : '')
            + '<div style="display:flex;justify-content:flex-end;gap:6px;margin-top:8px;padding-top:8px;border-top:1px solid var(--border)">'
            + '<button onclick="event.stopPropagation();window._glossaryPanelEdit[' + idx + ']=true;refreshSplitGlossary()" '
            + 'class="btn btn-outline btn-sm" style="font-size:11px">✏️ 수정</button>'
            + '<button onclick="event.stopPropagation();deleteSplitGlossary(' + idx + ')" '
            + 'class="btn btn-sm" style="font-size:11px;color:var(--rust);border:1px solid rgba(181,69,27,.25);background:none">🗑️ 삭제</button>'
            + '</div>'
            + '</div>'
            + '</div>';
        }

        // 편집 모드
        return '<div style="border:1.5px solid var(--teal);border-radius:8px;margin-bottom:6px;overflow:hidden">'
          + '<div style="display:flex;align-items:center;gap:6px;padding:8px 10px;background:var(--teal-light)">'
          + '<span style="flex:1;font-size:12px;font-weight:700;color:var(--teal)">✏️ 수정 중</span>'
          + '<button onclick="window._glossaryPanelEdit[' + idx + ']=false;refreshSplitGlossary()" '
          + 'style="background:none;border:none;cursor:pointer;color:var(--muted);font-size:16px;line-height:1;padding:0">×</button>'
          + '</div>'
          + '<div style="padding:10px;background:var(--paper);display:flex;flex-direction:column;gap:6px">'
          + '<div style="display:flex;gap:6px">'
          + '<input id="sg-term-' + idx + '" value="' + esc(g.term) + '" placeholder="용어명" '
          + 'style="flex:1;font-size:12px;padding:5px 8px;font-weight:700">'
          + '<select id="sg-cat-' + idx + '" style="font-size:11px;padding:5px 6px;width:80px">'
          + GLOSSARY_CATS.map(c => '<option value="' + c + '"' + (g.cat===c?' selected':'') + '>' + c + '</option>').join('')
          + '</select>'
          + '</div>'
          + '<input id="sg-alias-' + idx + '" value="' + esc(g.alias||'') + '" placeholder="별칭 (선택)" '
          + 'style="font-size:11px;padding:5px 8px;color:var(--muted)">'
          + '<textarea id="sg-desc-' + idx + '" rows="3" placeholder="설명" '
          + 'style="font-size:12px;padding:6px 8px;line-height:1.6;resize:vertical">' + esc(g.desc||'') + '</textarea>'
          + '<input id="sg-related-' + idx + '" value="' + esc(g.related||'') + '" placeholder="관련 용어" '
          + 'style="font-size:11px;padding:5px 8px;color:var(--teal)">'
          + '<div style="display:flex;justify-content:flex-end;gap:6px;margin-top:2px">'
          + '<button onclick="saveSplitGlossary(' + idx + ')" class="btn btn-gold btn-sm" style="font-size:11px">저장</button>'
          + '</div>'
          + '</div>'
          + '</div>';
      }).join('');

  return '<div style="padding:4px 0" id="split-glossary-wrap">'
    + '<div style="display:flex;gap:6px;margin-bottom:8px">'
    + '<div style="position:relative;flex:1">'
    + '<input id="split-glossary-search" placeholder="용어 검색..." value="' + esc(window._glossaryPanelQ) + '" '
    + 'style="width:100%;padding:6px 28px 6px 10px;font-size:12px">'
    + '<button id="split-glossary-clear" onclick="window._glossaryPanelQ=\'\';splitElement(\'split-glossary-search\').value=\'\';refreshSplitGlossaryCards()" '
    + 'style="display:' + (window._glossaryPanelQ ? 'block' : 'none') + ';position:absolute;right:6px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;font-size:13px;color:var(--muted)">×</button>'
    + '</div>'
    + '<button class="btn btn-gold btn-sm" onclick="showGlossaryModal()">＋</button>'
    + '</div>'
    + '<div id="split-glossary-cats" style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:8px">' + catBtns + '</div>'
    + '<div id="split-glossary-cards">' + cards + '</div>'
    + '</div>';
}

function refreshSplitGlossaryCards() {
  // 카드만 업데이트 (input 포커스 유지)
  const p = getProject();
  const list = p.glossary || [];
  const q = (window._glossaryPanelQ || '').trim().toLowerCase();
  const cat = window._glossaryPanelCat || '전체';

  const filtered = list.filter(g =>
    (cat === '전체' || g.cat === cat) &&
    (!q || g.term.toLowerCase().includes(q) || (g.desc||'').toLowerCase().includes(q))
  );

  const cards = filtered.length === 0
    ? '<div style="text-align:center;color:var(--muted);font-size:12px;padding:20px 0">'
      + (list.length === 0 ? '용어가 없어요' : '검색 결과 없음') + '</div>'
    : filtered.map(g => {
        const idx = list.indexOf(g);
        const open = !!window._glossaryPanelOpen[idx];
        const edit = !!window._glossaryPanelEdit[idx];
        if (!open) {
          return '<div style="border:1px solid var(--border);border-radius:8px;margin-bottom:6px;overflow:hidden">'
            + '<div style="display:flex;align-items:center;gap:6px;padding:8px 10px;cursor:pointer;background:var(--cream)" '
            + 'onclick="window._glossaryPanelOpen[' + idx + ']=true;window._glossaryPanelEdit[' + idx + ']=false;refreshSplitGlossaryCards()">'
            + '<span style="flex:1;font-weight:700;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(g.term) + '</span>'
            + (g.alias ? '<span style="font-size:10px;color:var(--muted)">' + esc(g.alias) + '</span>' : '')
            + '<span style="font-size:10px;color:var(--teal);flex-shrink:0">' + esc(g.cat||'기타') + '</span>'
            + '<span style="font-size:10px;color:var(--muted);flex-shrink:0;margin-left:2px">▾</span>'
            + '</div></div>';
        }
        if (!edit) {
          return '<div style="border:1.5px solid var(--gold);border-radius:8px;margin-bottom:6px;overflow:hidden">'
            + '<div style="display:flex;align-items:center;gap:6px;padding:8px 10px;cursor:pointer;background:var(--gold-light)" '
            + 'onclick="window._glossaryPanelOpen[' + idx + ']=false;refreshSplitGlossaryCards()">'
            + '<span style="flex:1;font-weight:700;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(g.term) + '</span>'
            + (g.alias ? '<span style="font-size:10px;color:var(--muted)">' + esc(g.alias) + '</span>' : '')
            + '<span style="font-size:10px;color:var(--teal);flex-shrink:0">' + esc(g.cat||'기타') + '</span>'
            + '<span style="font-size:10px;color:var(--muted);flex-shrink:0;margin-left:2px">▴</span>'
            + '</div>'
            + '<div style="padding:10px 12px;background:var(--paper)">'
            + (g.desc ? '<div style="font-size:12px;color:var(--ink);line-height:1.7;white-space:pre-wrap;margin-bottom:6px">' + esc(g.desc) + '</div>' : '<div style="font-size:12px;color:var(--muted);margin-bottom:6px">설명 없음</div>')
            + (g.related ? '<div style="font-size:11px;color:var(--teal)">🔗 ' + esc(g.related) + '</div>' : '')
            + '<div style="display:flex;justify-content:flex-end;gap:6px;margin-top:8px;padding-top:8px;border-top:1px solid var(--border)">'
            + '<button onclick="event.stopPropagation();window._glossaryPanelEdit[' + idx + ']=true;refreshSplitGlossaryCards()" class="btn btn-outline btn-sm" style="font-size:11px">✏️ 수정</button>'
            + '<button onclick="event.stopPropagation();deleteSplitGlossary(' + idx + ')" class="btn btn-sm" style="font-size:11px;color:var(--rust);border:1px solid rgba(181,69,27,.25);background:none">🗑️ 삭제</button>'
            + '</div></div></div>';
        }
        return '<div style="border:1.5px solid var(--teal);border-radius:8px;margin-bottom:6px;overflow:hidden">'
          + '<div style="display:flex;align-items:center;gap:6px;padding:8px 10px;background:var(--teal-light)">'
          + '<span style="flex:1;font-size:12px;font-weight:700;color:var(--teal)">✏️ 수정 중</span>'
          + '<button onclick="window._glossaryPanelEdit[' + idx + ']=false;refreshSplitGlossaryCards()" style="background:none;border:none;cursor:pointer;color:var(--muted);font-size:16px;line-height:1;padding:0">×</button>'
          + '</div>'
          + '<div style="padding:10px;background:var(--paper);display:flex;flex-direction:column;gap:6px">'
          + '<div style="display:flex;gap:6px">'
          + '<input id="sg-term-' + idx + '" value="' + esc(g.term) + '" placeholder="용어명" style="flex:1;font-size:12px;padding:5px 8px;font-weight:700">'
          + '<select id="sg-cat-' + idx + '" style="font-size:11px;padding:5px 6px;width:80px">'
          + GLOSSARY_CATS.map(c => '<option value="' + c + '"' + (g.cat===c?' selected':'') + '>' + c + '</option>').join('')
          + '</select></div>'
          + '<input id="sg-alias-' + idx + '" value="' + esc(g.alias||'') + '" placeholder="별칭 (선택)" style="font-size:11px;padding:5px 8px;color:var(--muted)">'
          + '<textarea id="sg-desc-' + idx + '" rows="3" placeholder="설명" style="font-size:12px;padding:6px 8px;line-height:1.6;resize:vertical">' + esc(g.desc||'') + '</textarea>'
          + '<input id="sg-related-' + idx + '" value="' + esc(g.related||'') + '" placeholder="관련 용어" style="font-size:11px;padding:5px 8px;color:var(--teal)">'
          + '<div style="display:flex;justify-content:flex-end;gap:6px;margin-top:2px">'
          + '<button onclick="saveSplitGlossary(' + idx + ')" class="btn btn-gold btn-sm" style="font-size:11px">저장</button>'
          + '</div></div></div>';
      }).join('');

  const cardsEl = splitElement('split-glossary-cards');
  if (cardsEl) cardsEl.innerHTML = cards;

  // × 버튼 표시/숨김
  const clr = splitElement('split-glossary-clear');
  if (clr) clr.style.display = q ? 'block' : 'none';

  // 카테고리 버튼 업데이트
  const catsEl = splitElement('split-glossary-cats');
  if (catsEl) {
    const catBtns = ['전체', ...GLOSSARY_CATS].map(c =>
      '<button onclick="window._glossaryPanelCat=\'' + c + '\';refreshSplitGlossaryCards()" '
      + 'style="padding:2px 8px;border-radius:12px;border:1px solid '
      + (cat===c ? 'var(--gold)' : 'var(--border)') + ';background:'
      + (cat===c ? 'var(--gold)' : 'transparent') + ';color:'
      + (cat===c ? '#fff' : 'var(--muted)') + ';font-size:11px;cursor:pointer;white-space:nowrap">' + c + '</button>'
    ).join('');
    catsEl.innerHTML = catBtns;
  }
}

function refreshSplitGlossary() {
  // split-glossary-wrap이 있으면 카드만 업데이트, 없으면 전체 재렌더
  if (splitElement('split-glossary-cards')) {
    refreshSplitGlossaryCards();
  } else {
    if (document.getElementById('focus-overlay')?.classList.contains('active')) {
      if (_focusRefTab === 'glossary') focusRefTab('glossary');
    } else {
      const el = document.getElementById('split-content');
      if (el && splitTab === 'glossary') el.innerHTML = renderSplitGlossary();
    }
  }
}

function saveSplitGlossary(idx) {
  const p = getProject();
  if (!p || !p.glossary || !p.glossary[idx]) return;
  const term = splitElement('sg-term-' + idx)?.value.trim();
  if (!term) { toast('용어명을 입력해주세요.'); return; }
  p.glossary[idx] = {
    ...p.glossary[idx],
    term,
    cat: splitElement('sg-cat-' + idx)?.value || p.glossary[idx].cat,
    alias: splitElement('sg-alias-' + idx)?.value.trim() || '',
    desc: splitElement('sg-desc-' + idx)?.value.trim() || '',
    related: splitElement('sg-related-' + idx)?.value.trim() || '',
  };
  window._glossaryPanelEdit[idx] = false;
  autoSave(); updateBadges(); refreshSplitGlossary();
  if (state.activeTab === 'glossary') renderGlossary();
  toast('수정했어요.');
}

function updateSplitGlossary(idx, key, val) {
  const p = getProject();
  if (!p || !p.glossary || !p.glossary[idx]) return;
  p.glossary[idx][key] = val;
  clearTimeout(window._glossarySaveTimer);
  window._glossarySaveTimer = setTimeout(() => { autoSave(); updateBadges(); }, 600);
}

function deleteSplitGlossary(idx) {
  confirmDialog('이 용어를 삭제합니다.', () => {
    getProject().glossary.splice(idx, 1);
    delete window._glossaryPanelOpen[idx];
    autoSave(); updateBadges(); refreshSplitGlossary();
    toast('삭제했어요.');
  });
}

// 참고 패널에서 작품 기본 정보 수정
function updateSplitField(key, val) {
  const p = getProject();
  if (!p) return;
  p[key] = val;
  autoSave();
}

// 참고 패널에서 메모 수정
function updateSplitMemo(idx, val) {
  const p = getProject();
  if (!p || !p.memos) return;
  p.memos[idx].text = val;
  autoSave();
}

function updateSplitMemoTitle(idx, val) {
  const p = getProject();
  if (!p || !p.memos) return;
  p.memos[idx].title = val;
  autoSave();
}

function deleteSplitMemo(idx) {
  const p = getProject();
  if (!p || !p.memos) return;
  p.memos.splice(idx, 1);
  autoSave();
  renderSplitContent();
}


let chapterListCollapsed = false;

function applyChapterListCollapsed() {
  const list = document.getElementById('chapter-list');
  const btn  = document.getElementById('chapter-collapse-btn');
  if (!list || !btn) return;
  list.classList.toggle('collapsed', chapterListCollapsed);
  btn.textContent = chapterListCollapsed ? '▶' : '◀';
  btn.setAttribute('aria-label', chapterListCollapsed ? '회차 목록 펼치기' : '회차 목록 접기');
}

function setChapterListCollapsed(collapsed) {
  chapterListCollapsed = collapsed;
  applyChapterListCollapsed();
  const panel = document.getElementById('split-panel');
  if (panel && !panel.classList.contains('hidden')) setSplitPanelWidth(panel.getBoundingClientRect().width);
}

function toggleChapterList() {
  setChapterListCollapsed(!chapterListCollapsed);
}


// ═══════════════════════════════════════════════════════════
// 집필기 전용 메모 (사이드바 메모장과 분리)
// ═══════════════════════════════════════════════════════════
function getChapterMemos() {
  const p = getProject();
  if (!p.memos) p.memos = [];
  return p.memos;
}

function addChapterMemo() {
  const p = getProject();
  if (!p.memos) p.memos = [];
  p.memos.unshift({ id: uid(), title: '', content: '', color: '#fff8e1', updatedAt: new Date().toISOString() });
  autoSave();
  refreshSplitPanel();
}

function deleteChapterMemo(idx) {
  getChapterMemos().splice(idx, 1);
  autoSave();
  refreshSplitPanel();
}

function updateChapterMemoText(idx, val) {
  const m = getChapterMemos()[idx];
  if (m) { m.content = val; m.updatedAt = new Date().toISOString(); autoSave(); }
}

function updateChapterMemoTitle(idx, val) {
  const m = getChapterMemos()[idx];
  if (m) { m.title = val; m.updatedAt = new Date().toISOString(); autoSave(); }
}


// ═══════════════════════════════════════════════════════════
// 집중 모드 (Focus Mode)
// ═══════════════════════════════════════════════════════════
let focusChapterId = null;

function toggleFocusChapterMemo() {
  const body  = document.getElementById('focus-ch-memo-body');
  const arrow = document.getElementById('focus-ch-memo-arrow');
  if (!body) return;
  const isHidden = body.style.display === 'none';
  body.style.display = isHidden ? 'block' : 'none';
  if (arrow) arrow.style.transform = isHidden ? 'rotate(0deg)' : 'rotate(-90deg)';
  if (isHidden) document.getElementById('focus-ch-memo-input')?.focus();
}

function toggleFocusRef() {
  const panel = document.getElementById('focus-ref-panel');
  const btn = document.getElementById('focus-ref-btn');
  const isHidden = panel.style.display === 'none' || panel.style.display === '';
  panel.style.display = isHidden ? 'flex' : 'none';
  panel.style.flexDirection = 'column';
  if (btn) {
    btn.style.background = isHidden ? 'var(--gold-light)' : '';
    btn.style.borderColor = isHidden ? 'var(--gold)' : '';
    btn.style.color = isHidden ? 'var(--gold)' : '';
  }
  if (isHidden) focusRefTab('overview');
}

let _focusRefTab = 'overview';
function focusRefTab(tab) {
  _focusRefTab = tab;
  const tabLabelMap = {
    overview:'개요', world:'세계관', plot:'플롯',
    characters:'인물', relations:'관계도', family:'가문', glossary:'용어', items:'아이템', memo:'메모'
  };
  const label = tabLabelMap[tab];
  document.querySelectorAll('#focus-ref-panel .split-tab').forEach(b => {
    b.classList.toggle('active', !!label && b.textContent.trim().includes(label));
  });

  const el = document.getElementById('focus-ref-content');
  if (!el) return;

  const prevTab = splitTab;
  splitTab = tab;

  // split-content가 있으면 임시로 id 변경, 없으면 그냥 진행
  const prevEl = document.getElementById('split-content');
  if (prevEl) prevEl.id = '__split_bak__';
  el.id = 'split-content';

  try {
    renderSplitContent();
  } catch(err) {
    console.warn('focusRefTab render error:', err);
  } finally {
    el.id = 'focus-ref-content';
    if (prevEl) prevEl.id = 'split-content';
    splitTab = prevTab;
  }
}

function enterFocusMode() {
  const ta = document.getElementById('prose-editor');
  if (!ta) { toast('집필기에서만 사용할 수 있어요.'); return; }

  // 현재 화 ID 가져오기
  focusChapterId = activeChapterId;
  const p = getProject();
  const ch = (p?.chapters||[]).find(c => c.id === focusChapterId);
  if (!ch) return;

  // 집중 모드 화별 메모 초기화
  const fTitle = document.getElementById('focus-ch-memo-title');
  const fInput = document.getElementById('focus-ch-memo-input');
  const fBody  = document.getElementById('focus-ch-memo-body');
  const fArrow = document.getElementById('focus-ch-memo-arrow');
  if (fTitle) fTitle.textContent = ch.title;
  if (fInput) {
    fInput.value = ch.memo || '';
    fInput.oninput = () => {
      const p2 = getProject();
      const ch2 = (p2?.chapters||[]).find(c => c.id === focusChapterId);
      if (ch2) { ch2.memo = fInput.value; autoSave(); }
    };
  }
  if (fBody)  fBody.style.display  = ch.memo ? 'block' : 'none';
  if (fArrow) fArrow.style.transform = ch.memo ? 'rotate(0deg)' : 'rotate(-90deg)';

  // 집중 모드 에디터에 내용 복사
  const focusEditor = document.getElementById('focus-editor');
  focusEditor.value = ch.content || '';

  // 글자 수 업데이트
  updateFocusWordCount();

  // 폰트 크기 표시 동기화
  const sizeDisplay = document.getElementById('focus-font-size');
  if (sizeDisplay) sizeDisplay.textContent = editorFontSize + 'px';
  focusEditor.style.fontSize = editorFontSize + 'px';

  // 집중 모드 단축키 바 초기화
  const focusShortcutBar = document.getElementById('focus-shortcut-bar');
  if (focusShortcutBar) {
    focusShortcutBar.innerHTML = '';
    const label = document.createElement('span');
    label.style.cssText = 'font-size:11px;color:var(--muted);font-weight:600;flex-shrink:0';
    label.textContent = '단축키';
    focusShortcutBar.appendChild(label);
    Object.entries(SHORTCUT_SYMBOLS).forEach(([k, sym]) => {
      if (!sym) return;
      const btn = document.createElement('button');
      btn.className = 'sym-btn';
      btn.style.cssText = 'font-size:13px;min-width:32px;height:32px;padding:0 6px';
      btn.title = `^${k}`;
      btn.textContent = sym;
      btn.onclick = () => {
        const fe = document.getElementById('focus-editor');
        if (!fe) return;
        const s = fe.selectionStart, e = fe.selectionEnd;
        const selected = fe.value.slice(s, e);
        const isPair = sym.length === 2;
        if (isPair) {
          const inner = selected || '';
          fe.value = fe.value.slice(0,s) + sym[0] + inner + sym[1] + fe.value.slice(e);
          fe.selectionStart = fe.selectionEnd = inner ? s+1 : s+1;
          if (inner) { fe.selectionStart = s+1; fe.selectionEnd = s+1+inner.length; }
        } else {
          fe.value = fe.value.slice(0,s) + sym + fe.value.slice(e);
          fe.selectionStart = fe.selectionEnd = s + sym.length;
        }
        fe.focus();
        fe.dispatchEvent(new Event('input', {bubbles:true}));
      };
      focusShortcutBar.appendChild(btn);
    });
  }

  // 오버레이 열기
  const overlay = document.getElementById('focus-overlay');
  overlay.classList.add('active');
  applyReaderStyle();
  focusEditor.focus();

  // 전체화면 요청
  if (document.documentElement.requestFullscreen) {
    document.documentElement.requestFullscreen().catch(() => {});
  }

  // 입력 이벤트
  focusEditor.oninput = event => {
    updateFocusWordCount();
    // 원본에도 즉시 반영
    const p2 = getProject();
    const ch2 = (p2?.chapters||[]).find(c => c.id === focusChapterId);
    if (ch2) {
      const diff = writtenCharDelta(ch2.content || '', focusEditor.value, event);
      ch2.content = focusEditor.value;
      if (diff > 0) { recordDailyWriting(diff); onTypingKey(); }
      autoSave();
    }
  };
}

function exitFocusMode() {
  const overlay = document.getElementById('focus-overlay');
  overlay.classList.remove('active');

  // 전체화면 해제
  if (document.fullscreenElement) {
    document.exitFullscreen().catch(() => {});
  }

  // 집필기 에디터도 동기화
  const mainEditor = document.getElementById('prose-editor');
  const focusEditor = document.getElementById('focus-editor');
  if (mainEditor && focusEditor) {
    mainEditor.value = focusEditor.value;
    // 글자 수 업데이트
    const wc = document.getElementById('wc-display');
    if (wc) wc.textContent = focusEditor.value.length.toLocaleString() + '자';
  }

  focusChapterId = null;
}

function updateFocusWordCount() {
  const fe = document.getElementById('focus-editor');
  const wc = document.getElementById('focus-wordcount');
  if (fe && wc) wc.textContent = (fe.value.length).toLocaleString() + '자';
}

// ESC로 나가기
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    const overlay = document.getElementById('focus-overlay');
    if (overlay && overlay.classList.contains('active')) {
      exitFocusMode();
      return;
    }
  }
});



// 폰트 크기 변경 시 집중 모드도 동기화
const _origChangeFontSize = changeFontSize;
function changeFontSize(delta) {
  _origChangeFontSize(delta);
  const fe = document.getElementById('focus-editor');
  const fd = document.getElementById('focus-font-size');
  if (fe) fe.style.fontSize = editorFontSize + 'px';
  if (fd) fd.textContent = editorFontSize + 'px';
}


function cleanEmptyProjects() {
  const before = state.projects.length;
  state.projects = state.projects.filter(p =>
    (p.title && p.title.trim() && p.title !== '제목 없음') ||
    (p.chapters && p.chapters.some(c => c.content && c.content.trim())) ||
    (p.characters && p.characters.length > 0)
  );
  const removed = before - state.projects.length;
  if (removed > 0) {
    saveToStorage();
    renderHome();
    toast('🧹 빈 작품 ' + removed + '개를 정리했어요!');
  } else {
    toast('정리할 빈 작품이 없어요.');
  }
}


// 소속 그룹 접힘 상태
let charGroupCollapsed = {};

function toggleCharGroup(groupName, prefix) {
  const key = (prefix || 'grp_') + groupName;
  charGroupCollapsed[key] = !charGroupCollapsed[key];
  renderCharacters();
}

function moveCharCard(idx, dir) {
  const p = getProject();
  const chars = p.characters;
  const newIdx = idx + dir;
  if (newIdx < 0 || newIdx >= chars.length) return;
  [chars[idx], chars[newIdx]] = [chars[newIdx], chars[idx]];
  autoSave();
  renderCharacters();
}

let _cDrag = null;

function initCharDrag() {
  document.querySelectorAll('.char-drag-handle').forEach(handle => {
    handle.addEventListener('mousedown', charMouseStart);
    handle.addEventListener('touchstart', charTouchStart, { passive: false });
  });
}

function charTouchStart(e) {
  e.preventDefault();
  const t = e.touches[0];
  charDragInit(e.currentTarget, t.clientX, t.clientY);
  document.addEventListener('touchmove', charTouchMove, { passive: false });
  document.addEventListener('touchend', charTouchEnd, { once: true });
}

function charMouseStart(e) {
  charDragInit(e.currentTarget, e.clientX, e.clientY);
  document.addEventListener('mousemove', charMouseMove);
  document.addEventListener('mouseup', charMouseEnd, { once: true });
}

function charDragInit(handle, x, y) {
  const charIdx = +handle.dataset.charIdx;
  const card = handle.closest('.char-card');
  const rect = card.getBoundingClientRect();

  // 고스트
  const name = card.querySelector('.font-serif')?.textContent || '';
  const ghost = document.createElement('div');
  ghost.style.cssText = `position:fixed;left:${rect.left}px;top:${rect.top}px;
    width:${rect.width}px;height:40px;z-index:9999;pointer-events:none;
    box-shadow:0 6px 24px rgba(0,0,0,.18);border-radius:10px;
    background:var(--gold-light);border:2px solid var(--gold);
    display:flex;align-items:center;padding:0 16px;gap:10px;opacity:.92;transition:none`;
  ghost.innerHTML = `<span style="font-size:18px;color:var(--gold)">⠿</span>
    <span style="font-weight:700;font-size:14px;color:var(--ink)">${name}</span>`;
  document.body.appendChild(ghost);

  card.style.opacity = '0.3';

  _cDrag = {
    charIdx,
    card,
    ghost,
    offsetX: x - rect.left,
    offsetY: y - rect.top,
    dropTarget: null,   // { beforeCardEl } or { roleEl }
  };
}

function charTouchMove(e) {
  e.preventDefault();
  if (!_cDrag) return;
  charDragMove(e.touches[0].clientX, e.touches[0].clientY);
}
function charMouseMove(e) {
  if (!_cDrag) return;
  charDragMove(e.clientX, e.clientY);
}

function charDragMove(cx, cy) {
  const { ghost, offsetX, offsetY, card } = _cDrag;

  // 고스트 자유 이동
  ghost.style.left = (cx - offsetX) + 'px';
  ghost.style.top  = (cy - offsetY) + 'px';

  // 이전 인디케이터 제거
  document.querySelectorAll('.char-drop-line').forEach(el => el.remove());
  document.querySelectorAll('.char-card').forEach(c => c.style.boxShadow = '');
  document.querySelectorAll('.char-group-folder').forEach(f => f.style.outline = '');

  // 전체 char-card 중 커서 위치 기준 삽입 위치 결정
  const allCards = [...document.querySelectorAll('.char-card')];
  let bestCard = null, bestBefore = true;

  for (const c of allCards) {
    if (c === card) continue;
    const r = c.getBoundingClientRect();
    if (cy >= r.top - 16 && cy <= r.bottom + 16) {
      bestCard = c;
      bestBefore = cy < r.top + r.height / 2;
      break;
    }
  }

  if (bestCard) {
    // 삽입선 표시
    const line = document.createElement('div');
    line.className = 'char-drop-line';
    line.style.cssText = 'position:fixed;left:0;right:0;height:3px;background:var(--gold);z-index:9998;pointer-events:none;border-radius:2px';
    const r = bestCard.getBoundingClientRect();
    line.style.top = (bestBefore ? r.top - 2 : r.bottom - 1) + 'px';
    line.style.left = r.left + 'px';
    line.style.width = r.width + 'px';
    document.body.appendChild(line);
    _cDrag.dropTarget = { cardEl: bestCard, before: bestBefore };
  } else {
    // 카드 사이가 아닌 경우 — 폴더 헤더 위에 있는지 확인
    const folders = [...document.querySelectorAll('.char-group-folder')];
    for (const folder of folders) {
      const r = folder.getBoundingClientRect();
      if (cy >= r.top && cy <= r.bottom) {
        folder.style.outline = '2px solid var(--gold)';
        _cDrag.dropTarget = { folderEl: folder };
        break;
      }
    }
    if (!_cDrag.dropTarget || !_cDrag.dropTarget.folderEl) {
      _cDrag.dropTarget = null;
    }
  }
}

function charTouchEnd() {
  document.removeEventListener('touchmove', charTouchMove);
  charDragCommit();
}
function charMouseEnd() {
  document.removeEventListener('mousemove', charMouseMove);
  charDragCommit();
}

function charDragCommit() {
  if (!_cDrag) return;
  const { charIdx, card, ghost, dropTarget } = _cDrag;
  _cDrag = null;

  // 정리
  ghost.remove();
  document.querySelectorAll('.char-drop-line').forEach(el => el.remove());
  document.querySelectorAll('.char-card').forEach(c => c.style.boxShadow = '');
  document.querySelectorAll('.char-group-folder').forEach(f => f.style.outline = '');
  if (card) card.style.opacity = '';

  if (!dropTarget) return;

  const p = getProject();
  const chars = p.characters;
  const item = chars[charIdx];

  if (dropTarget.cardEl) {
    // 다른 카드 앞/뒤에 삽입
    const targetCharIdx = +dropTarget.cardEl.dataset.charIdx;
    const targetRole = dropTarget.cardEl.dataset.charRole || item.role;

    // 역할 변경 (카테고리 간 이동)
    item.role = targetRole;

    // 배열에서 꺼내서 삽입
    chars.splice(charIdx, 1);
    // splice 후 인덱스 보정
    const adjustedTarget = targetCharIdx > charIdx ? targetCharIdx - 1 : targetCharIdx;
    const insertAt = dropTarget.before ? adjustedTarget : adjustedTarget + 1;
    chars.splice(Math.max(0, Math.min(insertAt, chars.length)), 0, item);

  } else if (dropTarget.folderEl) {
    // 폴더 헤더에 드롭 → 해당 역할의 마지막에 추가
    const newRole = dropTarget.folderEl.dataset.role;
    if (newRole && newRole !== item.role) {
      item.role = newRole;
    }
    // 같은 역할끼리 마지막으로 이동
    chars.splice(charIdx, 1);
    // 해당 역할의 마지막 위치 찾기
    let lastIdx = chars.length;
    for (let i = chars.length - 1; i >= 0; i--) {
      if ((chars[i].role || '기타') === item.role) { lastIdx = i + 1; break; }
    }
    chars.splice(lastIdx, 0, item);
  }

  autoSave();
  renderCharacters();
}


// 참고 패널 캐릭터 카드 접기 상태
let splitCharCollapsed = {};

function toggleSplitChar(idx) {
  // 값이 없으면 기본이 접힘(true)이므로, undefined → false(펼침)로 토글
  const cur = splitCharCollapsed['c'+idx];
  splitCharCollapsed['c'+idx] = cur === undefined ? false : !cur;
  refreshSplitPanel();
}

function refreshSplitPanel() {
  if (document.getElementById('focus-overlay')?.classList.contains('active')) {
    focusRefTab(_focusRefTab);
  } else {
    // 검색 input이 있는 탭은 내부 콘텐츠만 업데이트 (포커스 유지)
    if (splitTab === 'items' && splitElement('split-item-search')) {
      refreshSplitItems(); return;
    }
    if (splitTab === 'memo' && splitElement('split-memo-search')) {
      refreshSplitMemo(); return;
    }
    renderSplitContent();
  }
}

function refreshSplitItems() {
  const p = getProject();
  if (!p) return;
  const items = p.items || [];
  if (!window._splitItemCollapsed) window._splitItemCollapsed = {};
  const sq = (window._splitItemQ || '').trim().toLowerCase();
  const filtered = sq ? items.filter(it => it.name.toLowerCase().includes(sq) || (it.desc||'').toLowerCase().includes(sq)) : items;
  const usedCats = ITEM_CATS.filter(c => filtered.some(it => it.cat === c));
  const catGroups = usedCats.map(c => ({ cat: c, list: filtered.filter(it => it.cat === c) }));

  const inner = splitElement('split-items-inner');
  if (!inner) { refreshSplitPanel(); return; }

  // × 버튼 표시/숨김
  const clr = splitElement('split-item-clear');
  if (clr) clr.style.display = sq ? 'block' : 'none';

  inner.innerHTML = filtered.length === 0
    ? '<div style="color:var(--muted);text-align:center;padding:20px 0;font-size:13px">' + (items.length === 0 ? '아이템이 없어요' : '검색 결과 없음') + '</div>'
    : catGroups.map(({cat, list}) => {
        const col = window._splitItemCollapsed[cat] !== false ? true : false;
        let html = '<div style="margin-bottom:8px">'
          + '<div onclick="window._splitItemCollapsed[\''+cat+'\']=(window._splitItemCollapsed[\''+cat+'\']=== undefined?false:!window._splitItemCollapsed[\''+cat+'\']);refreshSplitItems()"'
          + ' style="display:flex;align-items:center;justify-content:space-between;padding:5px 8px;background:var(--cream);border-radius:7px;cursor:pointer;user-select:none;border:1px solid var(--border)">'
          + '<span style="font-size:11px;font-weight:700;color:var(--muted)">' + esc(cat) + ' <span style="opacity:.6">(' + list.length + ')</span></span>'
          + '<span style="font-size:10px;color:var(--muted);display:inline-block;transform:rotate(' + (col?'-90':'0') + 'deg)">▾</span></div>';
        if (!col) {
          html += list.map(it => {
            const rarity = ITEM_RARITIES.find(r=>r.label===it.rarity)||ITEM_RARITIES[0];
            const itIdEsc = esc(it.id||'');
            return '<div style="border:1px solid var(--border);border-radius:8px;margin-top:4px;overflow:hidden;border-left:3px solid ' + rarity.color + '">'
              + '<div style="padding:7px 10px"><div style="display:flex;align-items:flex-start;justify-content:space-between;gap:4px">'
              + '<div style="flex:1;min-width:0"><div style="display:flex;align-items:center;gap:5px;margin-bottom:2px;flex-wrap:wrap">'
              + '<span style="font-weight:700;font-size:13px">' + esc(it.name) + '</span>'
              + '<span style="font-size:10px;color:' + rarity.color + ';font-weight:700">' + (it.rarity||'일반') + '</span></div>'
              + (it.desc ? '<div style="font-size:12px;color:var(--muted);line-height:1.5;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">' + esc(it.desc) + '</div>' : '')
              + (it.chars ? '<div style="font-size:11px;color:var(--teal);margin-top:2px">👤 ' + esc(it.chars) + '</div>' : '')
              + '</div><button onclick="showItemModal(\'' + itIdEsc + '\');" style="flex-shrink:0;background:none;border:none;cursor:pointer;font-size:13px;color:var(--muted);padding:2px 4px;line-height:1">✏️</button>'
              + '</div></div></div>';
          }).join('');
        }
        return html + '</div>';
      }).join('');
}

function refreshSplitMemo() {
  const inner = splitElement('split-memo-inner');
  if (!inner) { refreshSplitPanel(); return; }
  const allMemos = getChapterMemos();
  if (!window._spMemoCol) window._spMemoCol = {};
  const mq = (window._spMemoQ || '').trim().toLowerCase();
  const memos = mq ? allMemos.filter(m => (m.title||'').toLowerCase().includes(mq) || (m.content||'').toLowerCase().includes(mq)) : allMemos;

  const clr = splitElement('split-memo-clear');
  if (clr) clr.style.display = mq ? 'block' : 'none';

  inner.innerHTML = memos.length === 0
    ? `<div style="color:var(--muted);text-align:center;padding:20px 0;font-size:13px">${allMemos.length === 0 ? '＋ 추가 버튼으로 메모를 만들어보세요' : '검색 결과 없음'}</div>`
    : memos.map(m => {
        const realIdx = allMemos.indexOf(m);
        const col = window._spMemoCol[realIdx] !== false ? true : false;
        const bg = m.color || '#fff8e1';
        return `<div style="border:1px solid rgba(0,0,0,.1);border-radius:10px;margin-bottom:8px;overflow:hidden;background:${bg} !important">
          <div style="display:flex;align-items:center;gap:6px;padding:8px 10px;cursor:pointer;user-select:none;background:${bg}"
            onclick="window._spMemoCol[${realIdx}]=window._spMemoCol[${realIdx}]===undefined?false:!window._spMemoCol[${realIdx}];refreshSplitMemo()">
            <span style="flex:1;font-weight:700;font-size:13px;color:#1a1208;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
              ${m.title ? esc(m.title) : '<span style="opacity:.4">제목 없음</span>'}
            </span>
            <span style="font-size:10px;color:rgba(0,0,0,.3);display:inline-block;transform:rotate(${col?'-90':'0'}deg);flex-shrink:0">▾</span>
            <button onclick="event.stopPropagation();deleteChapterMemo(${realIdx})" style="background:none;border:none;cursor:pointer;font-size:13px;color:#b5451b;flex-shrink:0">✕</button>
          </div>
          ${col ? '' : `<div style="border-top:1px solid rgba(0,0,0,.06);background:${bg}">
            <input value="${esc(m.title||'')}" oninput="updateChapterMemoTitle(${realIdx},this.value)" placeholder="제목 (선택)"
              style="width:100%;padding:6px 10px;border:none;outline:none;background:transparent;font-weight:700;font-size:12px;color:#1a1208;border-bottom:1px solid rgba(0,0,0,.06)">
            <textarea oninput="updateChapterMemoText(${realIdx},this.value)" rows="4" placeholder="메모를 입력하세요..."
              style="width:100%;padding:8px 10px;font-size:12px;line-height:1.8;background:transparent;border:none;outline:none;resize:vertical;font-family:'Noto Serif KR',serif;color:#1a1208">${esc(m.content||'')}</textarea>
          </div>`}
        </div>`;
      }).join('');
}


let splitFamilyCollapsed = {};
function toggleSplitFamily(idx) {
  const cur = splitFamilyCollapsed['f'+idx];
  splitFamilyCollapsed['f'+idx] = cur === undefined ? false : !cur;
  refreshSplitPanel();
}


function updateFmSubs(typeId, curSub) {
  const FM_TYPES = [
    {id:'family', subs:['직계','방계','사용인','동맹 가문','외척']},
    {id:'guild', subs:['마법사 길드','전사 길드','도적 길드','상인 길드','탐험가 길드','제작자 길드','연금술사 길드']},
    {id:'knight', subs:['근위대','원정대','용병단','반란군','저항군','혁명군','정규군','성기사단']},
    {id:'crime_f', subs:['마피아','도적단','암살단','밀수단','지하조직','비밀결사','사기단']},
    {id:'religion', subs:['교단','신전','이단','수도회','예언자 집단','사교단','성직자회']},
    {id:'academic', subs:['마법학회','연구소','학파','현자 집단','탐구회','마도연구원']},
    {id:'politics', subs:['왕당파','귀족파벌','혁명파','의회파','황실','원로원','추밀원']},
    {id:'corp', subs:['대기업','중소기업','스타트업','NGO','정부기관','공기업','재단','로펌']},
    {id:'school', subs:['초중고등학교','대학교','대학원','연구소','싱크탱크','학원','연구팀']},
    {id:'crime_m', subs:['갱단','카르텔','마약조직','해커 집단','테러 조직','조폭','사이비 종교','사기 집단']},
    {id:'media', subs:['방송국','언론사','연예기획사','스포츠팀','광고회사','출판사','영화사']},
    {id:'military', subs:['군대','특수부대','경찰서','정보기관','용병 회사','민간군사기업','자경단']},
    {id:'politics_m', subs:['정당','시민단체','압력단체','로비단체','지하운동','혁명조직','의회파벌']},
    {id:'korean', subs:['왕실/내명부','의금부/포도청','삼사(사헌부·사간원·홍문관)','훈련도감/어영청','금군/별기군','화랑도','의병단','보부상/객주','향약계/두레','동학교단','불사(절)','무속 집단','권번(기생조합)','의녀 집단','역관 집단','서얼 집단']},
    {id:'chinese', subs:['정파 문파','사파 문파','마교','검문','도문','권파','황실/조정','내각/어사대','금위군','환관 집단','표국','상회','비밀결사','도방','불문','도관','강호','녹림/흑도']},
    {id:'japanese', subs:['막부/쇼군','다이묘 가문','사무라이 집단','닌자 조직','로닌 집단','상인 길드(자)','신사/불교 집단','무사도 집단','이세력/반막부','마을 자경단','기녀(게이샤) 집단','학자 집단(난학)']},
    {id:'other', subs:['동호회','동아리','모험가 파티','용사 일행','온라인 커뮤니티','비공개 모임','기타 집단']},
  ];
  const sel = document.getElementById('fm-sub');
  if (!sel) return;
  const subs = (FM_TYPES.find(t=>t.id===typeId)||FM_TYPES[0]).subs;
  sel.innerHTML = subs.map(s=>`<option value="${s}" ${curSub===s?'selected':''}>${s}</option>`).join('');
}


let familyCollapsed = {};
function toggleFamilyCard(fi) {
  familyCollapsed['f'+fi] = !familyCollapsed['f'+fi];
  renderFamily();
}


let familyMemberCollapsed = {};
function toggleFamilyMembers(fi) {
  familyMemberCollapsed['f'+fi] = !familyMemberCollapsed['f'+fi];
  renderFamily();
}


// 구성원 순서 변경 (터치 드래그)
let _mDrag = null; // {fi, mi, el, ghost, startY, listEl}

function initMemberDrag() {
  document.querySelectorAll('.member-handle').forEach(handle => {
    handle.addEventListener('touchstart', memberTouchStart, {passive: false});
    handle.addEventListener('mousedown', memberMouseStart);
  });
}

function memberTouchStart(e) {
  e.preventDefault();
  const t = e.touches[0];
  memberDragInit(e.currentTarget, t.clientX, t.clientY);
  document.addEventListener('touchmove', memberTouchMove, {passive: false});
  document.addEventListener('touchend', memberTouchEnd, {once: true});
}

function memberMouseStart(e) {
  memberDragInit(e.currentTarget, e.clientX, e.clientY);
  document.addEventListener('mousemove', memberMouseMove);
  document.addEventListener('mouseup', memberMouseEnd, {once: true});
}

function memberDragInit(handle, x, y) {
  const fi = +handle.dataset.fi;
  const mi = +handle.dataset.mi;
  const row = handle.closest('.member-row');
  const listEl = row.parentElement;
  const rect = row.getBoundingClientRect();

  // 고스트 - 이름만 보이는 심플한 형태
  const memberName = row.querySelector('span[style*="font-weight:600"]')?.textContent || '';
  const ghost = document.createElement('div');
  ghost.style.cssText = `position:fixed;left:${rect.left}px;top:${rect.top}px;
    width:${rect.width}px;height:${rect.height}px;z-index:9999;pointer-events:none;
    box-shadow:0 4px 16px rgba(0,0,0,.2);border-radius:8px;
    background:var(--gold-light);border:1.5px solid var(--gold);
    display:flex;align-items:center;padding:0 12px;gap:8px;transition:none`;
  ghost.innerHTML = `<span style="font-size:18px;color:var(--muted)">⠿</span>
    <span style="font-weight:600;font-size:13px;color:var(--ink)">${memberName}</span>`;
  document.body.appendChild(ghost);

  row.style.opacity = '0.3';

  _mDrag = { fi, mi, el: row, ghost, startY: y, offsetY: y - rect.top, listEl };
}

function memberTouchMove(e) {
  e.preventDefault();
  if (!_mDrag) return;
  memberDragMove(e.touches[0].clientY);
}
function memberMouseMove(e) {
  if (!_mDrag) return;
  memberDragMove(e.clientY);
}

function memberDragMove(clientY) {
  const { ghost, listEl, offsetY } = _mDrag;
  const listRect = listEl.getBoundingClientRect();

  // 고스트 위치 업데이트 (세로만, 리스트 범위 내 클램핑)
  const newTop = Math.max(listRect.top, Math.min(clientY - offsetY, listRect.bottom - ghost.offsetHeight));
  ghost.style.top = newTop + 'px';

  // 드롭 위치 계산
  const rows = [...listEl.querySelectorAll('.member-row')];
  rows.forEach(r => r.style.borderTop = '');
  const midY = clientY;
  let targetIdx = rows.length;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const rRect = r.getBoundingClientRect();
    if (midY < rRect.top + rRect.height / 2) {
      targetIdx = i;
      if (r !== _mDrag.el) r.style.borderTop = '2px solid var(--gold)';
      break;
    }
  }
  _mDrag.targetIdx = targetIdx;
}

function memberTouchEnd() {
  document.removeEventListener('touchmove', memberTouchMove);
  memberDragCommit();
}
function memberMouseEnd() {
  document.removeEventListener('mousemove', memberMouseMove);
  memberDragCommit();
}

function memberDragCommit() {
  if (!_mDrag) return;
  const { fi, mi, el, ghost, listEl, targetIdx } = _mDrag;
  _mDrag = null;

  ghost.remove();
  el.style.opacity = '';
  listEl.querySelectorAll('.member-row').forEach(r => r.style.borderTop = '');

  if (targetIdx !== undefined && targetIdx !== mi && targetIdx !== mi + 1) {
    const p = getProject();
    const f = p.families[fi];
    const tab = familyActiveTab['f'+fi] || getFamilyTabNames(f)[0];
    const members = (f.groups && f.groups[tab]) || [];
    const item = members.splice(mi, 1)[0];
    const insertAt = targetIdx > mi ? targetIdx - 1 : targetIdx;
    members.splice(insertAt, 0, item);
    autoSave();
  }
  renderFamily();
  // 드래그 이벤트 재등록
  setTimeout(initMemberDrag, 50);
}


// ═══════════════════════════════════════════════════════════════
// 장면(씬) 드래그 앤 드롭 (아크 간 이동 포함)
// ═══════════════════════════════════════════════════════════════
let _sDrag = null;

function initSceneDrag() {
  document.querySelectorAll('.scene-handle').forEach(handle => {
    handle.addEventListener('touchstart', sceneTouchStart, {passive: false});
    handle.addEventListener('mousedown', sceneMouseStart);
  });
}

function sceneTouchStart(e) {
  e.preventDefault();
  const t = e.touches[0];
  sceneDragInit(e.currentTarget, t.clientX, t.clientY);
  document.addEventListener('touchmove', sceneTouchMove, {passive: false});
  document.addEventListener('touchend', sceneTouchEnd, {once: true});
}
function sceneMouseStart(e) {
  sceneDragInit(e.currentTarget, e.clientX, e.clientY);
  document.addEventListener('mousemove', sceneMouseMove);
  document.addEventListener('mouseup', sceneMouseEnd, {once: true});
}

function sceneDragInit(handle, clientX, clientY) {
  const ai = +handle.dataset.ai;
  const si = +handle.dataset.si;
  const row = handle.closest('.scene-row');
  const rect = row.getBoundingClientRect();

  const title = row.querySelector('.scene-card-title')?.textContent || '';
  const ghost = document.createElement('div');
  ghost.style.cssText = `position:fixed;left:${rect.left}px;top:${rect.top}px;
    width:${rect.width}px;height:${rect.height}px;z-index:9999;pointer-events:none;
    box-shadow:0 4px 16px rgba(0,0,0,.2);border-radius:8px;
    background:var(--gold-light);border:1.5px solid var(--gold);
    display:flex;align-items:center;padding:0 12px;gap:8px`;
  ghost.innerHTML = `<span style="font-size:16px;color:var(--muted)">⠿</span>
    <span style="font-weight:600;font-size:12px;color:var(--ink)">${title}</span>`;
  document.body.appendChild(ghost);
  row.style.opacity = '0.3';
  _sDrag = { ai, si, el: row, ghost, offsetX: clientX - rect.left, offsetY: clientY - rect.top };
}

function sceneTouchMove(e) { e.preventDefault(); if (_sDrag) sceneDragMove(e.touches[0].clientX, e.touches[0].clientY); }
function sceneMouseMove(e) { if (_sDrag) sceneDragMove(e.clientX, e.clientY); }

function sceneDragMove(clientX, clientY) {
  const { ghost, offsetX, offsetY } = _sDrag;
  ghost.style.left = (clientX - offsetX) + 'px';
  ghost.style.top  = (clientY - offsetY) + 'px';

  // 모든 하이라이트 초기화
  document.querySelectorAll('.scene-row').forEach(r => r.style.borderTop = '');
  document.querySelectorAll('.arc-col').forEach(c => c.style.outline = '');

  // 현재 커서가 어느 arc-col 위에 있는지
  const cols = [...document.querySelectorAll('.arc-col')];
  let targetAi = null;
  let targetSi = null;

  for (const col of cols) {
    const colRect = col.getBoundingClientRect();
    if (clientX >= colRect.left && clientX <= colRect.right &&
        clientY >= colRect.top  && clientY <= colRect.bottom) {
      targetAi = +col.dataset.ai;
      col.style.outline = '2px solid var(--gold)';
      col.style.borderRadius = '10px';

      // 해당 컬럼 내 scene-row 위치로 삽입 위치 계산
      const rows = [...col.querySelectorAll('.scene-row')];
      targetSi = rows.length;
      for (let i = 0; i < rows.length; i++) {
        const rRect = rows[i].getBoundingClientRect();
        if (clientY < rRect.top + rRect.height / 2) {
          targetSi = i;
          if (rows[i] !== _sDrag.el) rows[i].style.borderTop = '2px solid var(--gold)';
          break;
        }
      }
      break;
    }
  }
  _sDrag.targetAi = targetAi;
  _sDrag.targetSi = targetSi;
}

function sceneTouchEnd() { document.removeEventListener('touchmove', sceneTouchMove); sceneDragCommit(); }
function sceneMouseEnd() { document.removeEventListener('mousemove', sceneMouseMove); sceneDragCommit(); }

function sceneDragCommit() {
  if (!_sDrag) return;
  const { ai, si, el, ghost, targetAi, targetSi } = _sDrag;
  _sDrag = null;
  ghost.remove();
  el.style.opacity = '';
  document.querySelectorAll('.scene-row').forEach(r => r.style.borderTop = '');
  document.querySelectorAll('.arc-col').forEach(c => { c.style.outline = ''; c.style.borderRadius = ''; });

  if (targetAi !== null && targetSi !== null) {
    const p = getProject();
    const fromScenes = p.arcs[ai].scenes;
    const toScenes   = p.arcs[targetAi].scenes;
    const item = fromScenes.splice(si, 1)[0];

    if (ai === targetAi) {
      const insertAt = targetSi > si ? targetSi - 1 : targetSi;
      fromScenes.splice(insertAt, 0, item);
    } else {
      toScenes.splice(targetSi, 0, item);
    }
    autoSave();
  }
  renderPlot();
  setTimeout(initSceneDrag, 50);
}

// 가문 유형별 기본 탭 목록
function getFamilyTabNames(f) {
  const type = f.groupType || 'family';
  const tabMap = {
    family: ['직계','방계','사용인','동맹 가문'],
    guild: ['핵심 멤버','일반 멤버','수습'],
    knight: ['기사','병사','지원'],
    crime_f: ['간부','조원','협력자'],
    religion: ['성직자','신도','수련자'],
    academic: ['연구원','학생','자문'],
    politics: ['핵심 세력','지지자','협력자'],
    corp: ['임원','직원','파트너'],
    school: ['교직원','재학생','동문'],
    crime_m: ['간부','조원','협력자'],
    media: ['핵심 인물','구성원','관계자'],
    military: ['지휘관','병사','지원'],
    politics_m: ['핵심 당원','일반 당원','지지자'],
    korean: ['직계','방계','사용인','동맹'],
    chinese: ['장로','제자','협력자'],
    japanese: ['핵심','일반','수련생'],
    other: ['핵심','일반','기타'],
  };
  return tabMap[type] || ['핵심','일반','기타'];
}

function renderFamilyTabs(f, fi) {
  const p = getProject();
  const tabs = getFamilyTabNames(f);
  const groups = f.groups || {};
  const activeTab = familyActiveTab['f'+fi] || tabs[0];
  const members = groups[activeTab] || [];
  const totalCount = tabs.reduce((acc, t) => acc + (groups[t]||[]).length, 0);

  const tabBtns = tabs.map(t => {
    const cnt = (groups[t]||[]).length;
    const active = t === activeTab;
    return `<button onclick="setFamilyTab(${fi},'${t}')"
      style="padding:5px 12px;border:none;border-radius:20px;cursor:pointer;font-size:11px;
        font-family:'Noto Sans KR',sans-serif;font-weight:600;transition:all .15s;
        background:${active?'var(--gold)':'var(--cream)'};
        color:${active?'#fff':'var(--muted)'}">
      ${t}${cnt>0?` <span style="opacity:.8">(${cnt})</span>`:''}
    </button>`;
  }).join('');

  const memberRows = members.map((m, mi) => {
    const linked = !!(m.charId && (p.characters || []).some(x => x.id === m.charId));
    const linkBadge = linked
      ? `<span title="등장인물 수정으로 이동" style="font-size:10px;color:var(--gold);font-weight:700;padding:1px 5px;border-radius:6px;background:var(--gold-light);border:1px solid var(--gold);cursor:pointer" onclick="event.stopPropagation();openCharFromMember('${esc(m.charId)}')">🔗 인물 수정</span>`
      : '';
    return `
    <div class="member-row" data-fi="${fi}" data-mi="${mi}"
      style="display:flex;align-items:flex-start;gap:8px;padding:6px 10px;background:var(--cream);border-radius:8px;transition:opacity .15s${linked?';border:1px solid var(--gold-light)':''}">
      <span class="member-handle" data-fi="${fi}" data-mi="${mi}"
        style="color:var(--muted);font-size:18px;flex-shrink:0;cursor:grab;padding:4px;touch-action:none;user-select:none;margin-top:1px">⠿</span>
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
          <span style="font-weight:600;font-size:13px">${esc(m.name)}</span>
          ${m.relation?`<span style="font-size:11px;color:var(--muted)">${esc(m.relation)}</span>`:''}
          ${linkBadge}
        </div>
        ${m.note?`<div style="font-size:11px;color:var(--muted);margin-top:2px;line-height:1.5;word-break:break-all">${esc(m.note)}</div>`:''}
      </div>
      <div style="display:flex;flex-shrink:0;gap:0">
        <button onclick="showEditMemberModal(${fi},${mi})" style="background:none;border:none;cursor:pointer;color:var(--teal);font-size:13px;width:28px;height:28px">✏️</button>
        <button onclick="deleteFamilyMember(${fi},${mi})" style="background:none;border:none;cursor:pointer;color:var(--rust);font-size:14px;width:28px;height:28px">×</button>
      </div>
    </div>`;
  }).join('');

  return `
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">
      ${tabBtns}
    </div>
    <div style="display:flex;flex-direction:column;gap:4px;min-height:10px" id="member-list-${fi}">
      ${members.length===0
        ? `<div style="text-align:center;padding:12px;font-size:12px;color:var(--muted)">구성원 없음</div>`
        : memberRows}
    </div>
    <button class="btn btn-outline btn-sm" style="margin-top:8px;width:100%;justify-content:center"
      onclick="showAddMemberModal(${fi})">＋ ${activeTab} 구성원 추가</button>`;
}

let familyActiveTab = {};
function setFamilyTab(fi, tab) {
  familyActiveTab['f'+fi] = tab;
  renderFamily();
}

/** 가문 멤버에서 연결된 등장인물 편집 화면으로 이동 */
function openCharFromMember(charId) {
  if (!charId) return;
  const p = getProject();
  const idx = (p.characters || []).findIndex(c => c.id === charId);
  if (idx === -1) {
    toast('연결된 인물을 찾을 수 없어요.');
    return;
  }
  // 기존 모달 닫고 인물 편집 모달 열기
  if (typeof closeModal === 'function') closeModal();
  showCharModal(idx, 'basic');
}

/** 멤버 수정 모달에서 등장인물과 새로 연결 */
function linkMemberToChar(fi, mi) {
  const sel = document.getElementById('mb-link-sel');
  const charId = sel?.value;
  if (!charId) { toast('인물을 선택해주세요.'); return; }
  const p = getProject();
  const f = p.families[fi];
  const tab = familyActiveTab['f'+fi] || getFamilyTabNames(f)[0];
  const m = f.groups?.[tab]?.[mi];
  if (!m) return;
  const c = (p.characters || []).find(x => x.id === charId);
  if (!c) return;
  // 다른 가문에 속해 있었다면 그쪽에서 charId 멤버 제거
  if (c.familyId && c.familyId !== f.id) {
    const old = (p.families || []).find(x => x.id === c.familyId);
    if (old && old.groups) {
      Object.keys(old.groups).forEach(t => {
        const list = old.groups[t];
        if (Array.isArray(list)) old.groups[t] = list.filter(mm => !(mm && mm.charId === c.id));
      });
    }
  }
  m.charId = c.id;
  // 인물 정보로 폼 갱신 (이름/나이 등 등장인물 우선)
  m.name   = c.name   || m.name;
  m.age    = c.age    || m.age;
  m.gender = c.gender || m.gender;
  m.alive  = c.alive  || m.alive;
  c.familyId = f.id;
  autoSave();
  closeModal();
  renderFamily();
  toast('등장인물과 연결했어요.');
}

/** 멤버 수정 모달에서 등장인물 연결 해제 */
function unlinkMemberFromChar(fi, mi) {
  const p = getProject();
  const f = p.families[fi];
  const tab = familyActiveTab['f'+fi] || getFamilyTabNames(f)[0];
  const m = f.groups?.[tab]?.[mi];
  if (!m) return;
  const oldCharId = m.charId;
  m.charId = '';
  // 인물의 familyId 가 이 가문이었다면 비움
  if (oldCharId) {
    const c = (p.characters || []).find(x => x.id === oldCharId);
    if (c && c.familyId === f.id) c.familyId = '';
  }
  autoSave();
  closeModal();
  renderFamily();
  toast('연결을 해제했어요.');
}


function moveFamilyCard(fi, dir) {
  const p = getProject();
  const families = p.families;
  // 부모 없는 카드만 이동
  const roots = families.map((f,i)=>({f,i})).filter(({f})=>!f.parentName);
  const rootIdx = roots.findIndex(({i})=>i===fi);
  if (rootIdx === -1) return;
  const newRootIdx = rootIdx + dir;
  if (newRootIdx < 0 || newRootIdx >= roots.length) return;
  // swap
  const a = roots[rootIdx].i;
  const b = roots[newRootIdx].i;
  [families[a], families[b]] = [families[b], families[a]];
  autoSave(); renderFamily();
}

// ═══════════════════════════════════════════════════════════════
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
// 한글에서 편집 가능한 HWPX. 한컴 형식의 빈 문서를 서식 템플릿으로 사용한다.
const HWPX_NS = {
  hp: 'http://www.hancom.co.kr/hwpml/2011/paragraph',
  hh: 'http://www.hancom.co.kr/hwpml/2011/head',
  hc: 'http://www.hancom.co.kr/hwpml/2011/core',
  opf: 'http://www.idpf.org/2007/opf/'
};

const HWPX_STYLES = {
  default: { font: 1, color: '#302920', paper: '#FFFFFF', line: 200, margin: 8504 },
  kakao: { font: 0, color: '#2C2925', paper: '#FFFDF7', line: 190, margin: 5668 },
  ridi: { font: 1, color: '#302920', paper: '#F9F3E8', line: 205, margin: 5102 },
  naver: { font: 0, color: '#202A24', paper: '#FFFFFF', line: 185, margin: 5385 },
  forest: { font: 1, color: '#E5EDE6', paper: '#17382E', line: 200, margin: 5102 }
};

function hwpxParse(xml) {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('HWPX XML을 읽지 못했습니다.');
  return doc;
}

function hwpxFirst(node, ns, name) {
  const found = node.getElementsByTagNameNS(ns, name)[0];
  if (!found) throw new Error(`HWPX 서식이 없습니다: ${name}`);
  return found;
}

function hwpxCleanText(value) {
  return String(value || '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
}

function hwpxPrepareFiles(template, project, chapters) {
  const files = { ...template };
  const style = HWPX_STYLES[readerStyle] || HWPX_STYLES.default;
  const size = Math.max(12, Math.min(28, Number(editorFontSize) || 16));
  const header = hwpxParse(files['Contents/header.xml']);
  // 화면에서 쓰는 Noto 글꼴 이름을 문서에도 지정한다. 설치되지 않은 PC에서는 한글이 대체 글꼴을 사용한다.
  for (const fontface of header.getElementsByTagNameNS(HWPX_NS.hh, 'fontface')) {
    for (const font of fontface.getElementsByTagNameNS(HWPX_NS.hh, 'font')) {
      const id = font.getAttribute('id');
      if (id === '0') font.setAttribute('face', 'Noto Sans KR');
      if (id === '1') font.setAttribute('face', 'Noto Serif KR');
    }
  }
  const charProperties = hwpxFirst(header, HWPX_NS.hh, 'charProperties');
  const bodyChar = Array.from(charProperties.children).find(el => el.getAttribute('id') === '0');
  if (!bodyChar) throw new Error('HWPX 본문 서식이 없습니다.');
  bodyChar.setAttribute('height', String(Math.round(size * 75))); // CSS px → 1/100 pt
  bodyChar.setAttribute('textColor', style.color);
  const fontRef = hwpxFirst(bodyChar, HWPX_NS.hh, 'fontRef');
  for (const attr of fontRef.getAttributeNames()) fontRef.setAttribute(attr, String(style.font));

  const headingChar = bodyChar.cloneNode(true);
  const headingId = Math.max(...Array.from(charProperties.children).map(el => Number(el.getAttribute('id')) || 0)) + 1;
  headingChar.setAttribute('id', String(headingId));
  headingChar.setAttribute('height', String(Math.round(size * 75 * 1.3)));
  headingChar.appendChild(header.createElementNS(HWPX_NS.hh, 'hh:bold'));
  charProperties.appendChild(headingChar);
  charProperties.setAttribute('itemCnt', String(charProperties.children.length));

  const paraProperties = hwpxFirst(header, HWPX_NS.hh, 'paraProperties');
  const bodyPara = Array.from(paraProperties.children).find(el => el.getAttribute('id') === '0');
  if (!bodyPara) throw new Error('HWPX 문단 서식이 없습니다.');
  hwpxFirst(bodyPara, HWPX_NS.hh, 'lineSpacing').setAttribute('value', String(style.line));
  const headingPara = bodyPara.cloneNode(true);
  const headingParaId = Math.max(...Array.from(paraProperties.children).map(el => Number(el.getAttribute('id')) || 0)) + 1;
  headingPara.setAttribute('id', String(headingParaId));
  hwpxFirst(headingPara, HWPX_NS.hh, 'align').setAttribute('horizontal', 'LEFT');
  paraProperties.appendChild(headingPara);
  paraProperties.setAttribute('itemCnt', String(paraProperties.children.length));

  if (style.paper !== '#FFFFFF') {
    const borderFills = hwpxFirst(header, HWPX_NS.hh, 'borderFills');
    const pageFill = Array.from(borderFills.children).find(el => el.getAttribute('id') === '1');
    if (!pageFill) throw new Error('HWPX 용지 서식이 없습니다.');
    const tintedFill = pageFill.cloneNode(true);
    const fillId = Math.max(...Array.from(borderFills.children).map(el => Number(el.getAttribute('id')) || 0)) + 1;
    tintedFill.setAttribute('id', String(fillId));
    const brush = header.createElementNS(HWPX_NS.hc, 'hc:fillBrush');
    const color = header.createElementNS(HWPX_NS.hc, 'hc:winBrush');
    color.setAttribute('faceColor', style.paper);
    color.setAttribute('hatchColor', '#000000');
    color.setAttribute('alpha', '0');
    brush.appendChild(color);
    tintedFill.appendChild(brush);
    borderFills.appendChild(tintedFill);
    borderFills.setAttribute('itemCnt', String(borderFills.children.length));
    files._pageFillId = String(fillId);
  }
  files['Contents/header.xml'] = new XMLSerializer().serializeToString(header);

  const section = hwpxParse(files['Contents/section0.xml']);
  const root = section.documentElement;
  const firstPara = hwpxFirst(root, HWPX_NS.hp, 'p');
  const secPr = hwpxFirst(firstPara, HWPX_NS.hp, 'secPr');
  const pagePr = hwpxFirst(secPr, HWPX_NS.hp, 'pagePr');
  const margin = hwpxFirst(pagePr, HWPX_NS.hp, 'margin');
  margin.setAttribute('left', String(style.margin));
  margin.setAttribute('right', String(style.margin));
  if (files._pageFillId) {
    for (const fill of secPr.getElementsByTagNameNS(HWPX_NS.hp, 'pageBorderFill')) {
      fill.setAttribute('borderFillIDRef', files._pageFillId);
    }
    delete files._pageFillId;
  }
  for (const run of Array.from(firstPara.getElementsByTagNameNS(HWPX_NS.hp, 'run')).slice(1)) run.remove();
  for (const lineseg of Array.from(firstPara.getElementsByTagNameNS(HWPX_NS.hp, 'linesegarray'))) lineseg.remove();
  firstPara.setAttribute('paraPrIDRef', String(headingParaId));

  let nextId = 1;
  function addText(para, text, charId) {
    const run = section.createElementNS(HWPX_NS.hp, 'hp:run');
    run.setAttribute('charPrIDRef', String(charId));
    const t = section.createElementNS(HWPX_NS.hp, 'hp:t');
    t.setAttributeNS('http://www.w3.org/XML/1998/namespace', 'xml:space', 'preserve');
    t.textContent = hwpxCleanText(text);
    run.appendChild(t);
    para.appendChild(run);
  }
  function addPara(text, heading = false) {
    const para = section.createElementNS(HWPX_NS.hp, 'hp:p');
    para.setAttribute('id', String(nextId++));
    para.setAttribute('paraPrIDRef', String(heading ? headingParaId : 0));
    para.setAttribute('styleIDRef', '0');
    para.setAttribute('pageBreak', '0');
    para.setAttribute('columnBreak', '0');
    para.setAttribute('merged', '0');
    addText(para, text, heading ? headingId : 0);
    root.appendChild(para);
  }
  addText(firstPara, project.title || '제목 없음', headingId);
  for (const chapter of chapters) {
    addPara('', false);
    addPara(chapter.title || '제목 없음', true);
    for (const line of String(chapter.content || '').split(/\r\n|\n|\r/)) addPara(line, false);
  }
  files['Contents/section0.xml'] = new XMLSerializer().serializeToString(section);

  const content = hwpxParse(files['Contents/content.hpf']);
  hwpxFirst(content, HWPX_NS.opf, 'title').textContent = hwpxCleanText(project.title || '제목 없음');
  files['Contents/content.hpf'] = new XMLSerializer().serializeToString(content);
  return files;
}

// 저장 방식 ZIP 작성기. 외부 스크립트 없이 오프라인에서도 내보낼 수 있다.
function hwpxZip(files) {
  const encoder = new TextEncoder();
  const parts = [], directory = [];
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let crc = i;
    for (let j = 0; j < 8; j++) crc = crc & 1 ? (crc >>> 1) ^ 0xEDB88320 : crc >>> 1;
    table[i] = crc >>> 0;
  }
  function crc32(bytes) {
    let crc = 0xFFFFFFFF;
    for (const byte of bytes) crc = (crc >>> 8) ^ table[(crc ^ byte) & 0xFF];
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }
  function header(length) { return new DataView(new ArrayBuffer(length)); }
  function bytes(view) { return new Uint8Array(view.buffer); }
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const path = encoder.encode(name), data = encoder.encode(text);
    const crc = crc32(data);
    const local = header(30);
    local.setUint32(0, 0x04034B50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, data.length, true);
    local.setUint16(26, path.length, true);
    parts.push(bytes(local), path, data);
    directory.push({ path, data, crc, offset });
    offset += 30 + path.length + data.length;
  }
  const directoryOffset = offset;
  for (const entry of directory) {
    const central = header(46);
    central.setUint32(0, 0x02014B50, true);
    central.setUint16(4, 20, true);
    central.setUint16(6, 20, true);
    central.setUint16(8, 0x0800, true);
    central.setUint32(16, entry.crc, true);
    central.setUint32(20, entry.data.length, true);
    central.setUint32(24, entry.data.length, true);
    central.setUint16(28, entry.path.length, true);
    central.setUint32(42, entry.offset, true);
    parts.push(bytes(central), entry.path);
    offset += 46 + entry.path.length;
  }
  const end = header(22);
  end.setUint32(0, 0x06054B50, true);
  end.setUint16(8, directory.length, true);
  end.setUint16(10, directory.length, true);
  end.setUint32(12, offset - directoryOffset, true);
  end.setUint32(16, directoryOffset, true);
  parts.push(bytes(end));
  return new Blob(parts, { type: 'application/hwp+zip' });
}

async function exportHwpx(chId) {
  const project = getProject();
  const chapters = chId ? (project.chapters || []).filter(ch => ch.id === chId) : (project.chapters || []);
  if (!chapters.length) { toast('내보낼 화가 없습니다.'); return; }
  try {
    const response = await fetch('./assets/hwpx-template.json');
    if (!response.ok) throw new Error('서식 템플릿을 읽지 못했습니다.');
    const template = await response.json();
    const blob = hwpxZip(hwpxPrepareFiles(template, project, chapters));
    const filename = (project.title || '작품') + (chId ? '_' + chapters[0].title : '_전체') + '.hwpx';
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename.replace(/[\\/:*?"<>|]/g, '_');
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 60000);
    toast('화면 양식을 적용한 HWPX 파일이 저장됐어요! 📖');
  } catch (error) {
    console.error('HWPX export failed', error);
    toast('HWPX 저장에 실패했어요. 연결 상태를 확인하고 다시 시도해 주세요.');
  }
}
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
