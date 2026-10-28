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
    const data = { projects: state.projects, version: '2.0', savedAt: new Date().toISOString() };
    void writeToFileHandle(fileHandles.all, data);
  }
  // 활성 작품 파일 핸들이 연결되어 있으면 덮어쓰기
  if (state.activeProjectId && fileHandles.projects[state.activeProjectId]) {
    const p = getProject();
    if (p) void writeToFileHandle(fileHandles.projects[state.activeProjectId], p);
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
