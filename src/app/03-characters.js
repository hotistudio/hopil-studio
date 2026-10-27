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
  if ((inSplitPanel || inFocus) && splitTab === 'characters') {
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
