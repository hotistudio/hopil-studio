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
              ${c.lineageStatus?`<span class="tag" style="background:var(--gold-light);color:var(--gold)">${esc(c.lineageStatus)}</span>`:''}
              ${c.alive&&c.alive!=='생존'?`<span class="tag" style="background:${c.alive==='사망'?'var(--rust-light)':'var(--cream)'};color:${c.alive==='사망'?'var(--rust)':'var(--muted)'};border-color:${c.alive==='사망'?'var(--rust)':'var(--border)'}">${esc(c.alive)}</span>`:''}
            </div>
            ${c.appearance?`<div style="font-size:12px;color:var(--muted);margin-bottom:3px">외모: ${esc(c.appearance)}</div>`:''}
            ${c.personality?`<div style="font-size:13px;color:var(--ink);line-height:1.6;margin-bottom:4px">${esc(c.personality)}</div>`:''}
            ${c.background?`<div style="font-size:12px;color:var(--muted);margin-bottom:4px">배경: ${esc(c.background)}</div>`:''}
            ${c.speech?`<div style="font-size:12px;color:var(--teal)">특징/능력: ${esc(c.speech)}</div>`:''}
            ${c.likes?`<div style="font-size:12px;color:var(--muted)">좋아하는 것: ${esc(c.likes)}</div>`:''}
            ${c.dislikes?`<div style="font-size:12px;color:var(--muted)">싫어하는 것: ${esc(c.dislikes)}</div>`:''}
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


let charEditSession = null;
function getCharEditProject() { return charEditSession?.draft || getProject(); }
function cancelCharEdit() { charEditSession = null; closeModal(); }
function commitCharEdit() {
  if (!charEditSession) return;
  const { original, draft } = charEditSession;
  for (const key of ['characters', 'families', 'relations', 'psyArcs']) {
    if (draft[key] !== undefined) original[key] = draft[key];
  }
  charEditSession = null;
}
function captureCharBasicDraft(idx) {
  if (!document.getElementById('cm-name')) return;
  if (!charEditSession) return;
  const c = charEditSession.basic || (charEditSession.basic = {});
  const fields = {name:'name',role:'role',age:'age',gender:'gender',alive:'alive',appearance:'app',personality:'per',background:'bg',speech:'sp',likes:'likes',dislikes:'dislikes',honorific:'title',goal:'goal'};
  Object.entries(fields).forEach(([key, suffix]) => {
    const input = document.getElementById('cm-' + suffix);
    if (input) c[key] = input.value;
  });
  c.color = document.querySelector('#cm-color-group [data-selected]')?.dataset?.val || '';
}

function showCharModal(idx, activeTab, keepDraft = false) {
  if (!keepDraft) charEditSession = { original: getProject(), draft: JSON.parse(JSON.stringify(getProject())) };
  const p = getCharEditProject();
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
      <button class="btn btn-outline" onclick="cancelCharEdit()">취소</button>
      <button class="btn btn-gold" onclick="${tab==='relation'?`saveCharRelation(${idx})`:`saveChar(${idx===undefined?'undefined':idx})`}">저장</button>
    </div>
  `, false);
  if (tab === 'basic') {
    setTimeout(() => document.getElementById('cm-name')?.focus(), 100);
  }
}

function switchCharModalTab(idx, tab) {
  captureCharBasicDraft(idx);
  showCharModal(idx, tab, true);
}

function renderCharBasicTab(idx) {
  const p = getCharEditProject();
  const c = { ...(idx !== undefined ? p.characters[idx] : {}), ...(charEditSession?.basic || {}) };
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
      <div><label class="label" for="cm-likes">좋아하는 것</label><textarea id="cm-likes" rows="2" placeholder="예: 비 오는 날, 오래된 책">${esc(c.likes||'')}</textarea></div>
      <div><label class="label" for="cm-dislikes">싫어하는 것</label><textarea id="cm-dislikes" rows="2" placeholder="예: 거짓말, 시끄러운 장소">${esc(c.dislikes||'')}</textarea></div>
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
// RELATION TAB — 편집 사본에 반영 후 저장
// ═══════════════════════════════════════════════════════════════
// 관계 변경은 편집 사본에만 반영한다. 저장 시 작품에 적용하며 취소 시 버린다.

function renderCharRelationTab(idx) {
  const p = getCharEditProject();
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
    return `<div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:8px;border:1px solid var(--border);border-radius:8px;margin-bottom:6px">
      <div style="flex:1;min-width:0">
        <div style="font-weight:700;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(spouse.name)}</div>
        <div style="font-size:11px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(spouse.role||'')}</div>
      </div>
      <select aria-label="가족관계 종류" onchange="setCrPartnerKind(${idx}, ${si}, this.value)" style="font-size:12px;width:auto">
        ${partnerKindOptions(sp, c.id)}
      </select>
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

  const narrativeRelations = (p.relations || []).map((r, i) => ({ r, i }))
    .filter(({ r }) => String(r.fromId) === String(c.id) || String(r.toId) === String(c.id));

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
        <label class="label" for="cr-lineage-status">자녀 출생 표기</label>
        <select id="cr-lineage-status" onchange="setCrLineageStatus(${idx}, this.value)" style="width:100%">
          ${[['','표시 없음'],['서자','서자'],['서녀','서녀']].map(([value, label]) => `<option value="${value}" ${c.lineageStatus === value ? 'selected' : ''}>${label}</option>`).join('')}
        </select>
        <div style="font-size:11px;color:var(--muted);margin-top:4px">부모 관계와 별도로 직접 지정합니다. 자동으로 추정하지 않습니다.</div>
      </div>

      <div>
        <label class="label">배우자 · 첩 · 후궁</label>
        <div>
          ${spouseRows || '<div style="color:var(--muted);font-size:12px;padding:4px 0">등록된 배우자·첩·후궁 관계가 없습니다.</div>'}
        </div>
        ${spouseCandidates.length>0?`
        <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px">
          <select id="cr-spouse-add" style="flex:1;min-width:120px">
            <option value="">— 관계 상대 추가 —</option>
            ${spouseCandidates.map(x => `<option value="${x.id}">${esc(x.name)}</option>`).join('')}
          </select>
          <select id="cr-partner-kind" aria-label="추가할 가족관계 종류" style="flex:1">${partnerKindOptions({}, c.id)}</select>
          <button class="btn btn-outline btn-sm" onclick="addCrSpouse(${idx})">＋ 추가</button>
        </div>`:''}
      </div>

      <div>
        <label class="label">추가 관계</label>
        <div style="font-size:11px;color:var(--muted);margin-bottom:8px">이 관계는 인물 관계망에도 표시되며 가계도 배치는 바꾸지 않습니다. 스승·주군·짝사랑은 앞 사람에서 뒤 사람 방향입니다.</div>
        ${narrativeRelations.length ? narrativeRelations.map(({ r, i }) => `
          <div style="display:flex;align-items:center;gap:6px;padding:7px 0;border-bottom:1px solid var(--border);font-size:12px">
            <span style="min-width:0;overflow-wrap:anywhere">${esc(relationName(p, r, 'from'))} → ${esc(r.type)} → ${esc(relationName(p, r, 'to'))}</span>
            <button class="btn-icon" onclick="removeCrRelation(${idx}, ${i})" aria-label="관계 삭제" style="margin-left:auto;color:var(--rust);flex:none">✕</button>
          </div>`).join('') : '<div style="color:var(--muted);font-size:12px;padding:4px 0">등록된 추가 관계가 없습니다.</div>'}
        ${others.length ? `
          <div style="display:grid;gap:6px;margin-top:8px">
            <select id="cr-rel-to" aria-label="관계 상대"><option value="">— 관계 상대 선택 —</option>${relationCharacterOptions(others)}</select>
            <select id="cr-rel-direction" aria-label="관계 방향"><option value="forward">이 인물 → 관계 상대</option><option value="reverse">관계 상대 → 이 인물</option></select>
            <input id="cr-rel-type" aria-label="관계 유형" placeholder="관계 유형 직접 입력">
            <div class="relation-presets">${RELATION_TYPES.map(type => `<button type="button" class="btn btn-outline btn-sm" onclick="setCrRelationType(${jsArg(type)})">${esc(type)}</button>`).join('')}</div>
            <button class="btn btn-outline btn-sm" onclick="addCrRelation(${idx})">＋ 관계 추가</button>
          </div>` : ''}
      </div>

    </div>
  `;
}

// 편집 중 같은 인물의 모달 내에서 재렌더가 필요할 때 사용
function crRerender(idx) {
  const el = document.getElementById('cm-tab-content');
  if (el) el.innerHTML = renderCharRelationTab(idx);
}

function setCrLineageStatus(idx, value) {
  const c = getCharEditProject()?.characters?.[idx];
  if (!c || !['', '서자', '서녀'].includes(value)) return;
  c.lineageStatus = value;
  if (!charEditSession) autoSave();
}

function setCrRelationType(type) {
  const input = document.getElementById('cr-rel-type');
  if (input) input.value = type;
}

function addCrRelation(idx) {
  const p = getCharEditProject();
  const c = p.characters[idx];
  if (!c) return;
  const toId = document.getElementById('cr-rel-to')?.value || '';
  const reverse = document.getElementById('cr-rel-direction')?.value === 'reverse';
  const type = document.getElementById('cr-rel-type')?.value || '';
  const error = saveRelationData(p, reverse ? toId : c.id, reverse ? c.id : toId, type);
  if (error) { toast(error); return; }
  if (!charEditSession) autoSave();
  crRerender(idx);
}

function removeCrRelation(idx, relationIndex) {
  confirmDialog('이 관계를 삭제할까요?', () => {
    const p = getCharEditProject();
    if (!Array.isArray(p.relations) || !p.relations[relationIndex]) return;
    p.relations.splice(relationIndex, 1);
    if (!charEditSession) autoSave();
    crRerender(idx);
  });
}

function setCrFamily(idx, familyId) {
  const p = getCharEditProject();
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
  if (!charEditSession) autoSave();
}

function addCrParent(idx) {
  const p = getCharEditProject();
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
  if (!charEditSession) autoSave();
  crRerender(idx);
}

function removeCrParent(idx, parentId) {
  const p = getCharEditProject();
  const c = p.characters[idx];
  if (!c || !Array.isArray(c.parents)) return;
  c.parents = c.parents.filter(x => x !== parentId);
  if (!charEditSession) autoSave();
  crRerender(idx);
}

function addCrSpouse(idx) {
  const p = getCharEditProject();
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

  const selection = document.getElementById('cr-partner-kind')?.value || 'marriage';
  const [kind, side] = selection.split(':');
  const nextSpouses = [...c.spouses, { id: uid(), charId: id, status: 'current', note: '', kind,
    secondaryId: kind === 'marriage' ? '' : side === 'self' ? c.id : id }];
  syncSpouseLinks(p, c.id, nextSpouses);
  if (!charEditSession) autoSave();
  crRerender(idx);
}

function removeCrSpouse(idx, si) {
  const p = getCharEditProject();
  const c = p.characters[idx];
  if (!c || !Array.isArray(c.spouses)) return;
  const nextSpouses = c.spouses.filter((_, i) => i !== si);
  syncSpouseLinks(p, c.id, nextSpouses);
  if (!charEditSession) autoSave();
  crRerender(idx);
}

function partnerKindOptions(sp, selfId) {
  const value = !sp.kind || sp.kind === 'marriage' ? 'marriage' : `${sp.kind}:${sp.secondaryId === selfId ? 'self' : 'other'}`;
  return [['marriage','배우자'],['concubine:other','상대가 첩'],['concubine:self','이 인물이 첩'],['consort:other','상대가 후궁'],['consort:self','이 인물이 후궁']]
    .map(([v,label]) => `<option value="${v}" ${value === v ? 'selected' : ''}>${label}</option>`).join('');
}

function setCrPartnerKind(idx, si, value) {
  if (!['marriage','concubine:other','concubine:self','consort:other','consort:self'].includes(value)) return;
  const p = getCharEditProject(), c = p.characters[idx], sp = c?.spouses?.[si];
  if (!sp) return;
  const [kind, side] = value.split(':');
  sp.kind = kind;
  sp.secondaryId = kind === 'marriage' ? '' : side === 'self' ? c.id : sp.charId;
  syncSpouseLinks(p, c.id, c.spouses);
  if (!charEditSession) autoSave();
  crRerender(idx);
}

function setCrSpouseStatus(idx, si, status) {
  const p = getCharEditProject();
  const c = p.characters[idx];
  if (!c || !Array.isArray(c.spouses) || !c.spouses[si]) return;
  c.spouses[si].status = status;
  const other = p.characters.find(x => x.id === c.spouses[si].charId);
  const reciprocal = other?.spouses?.find(sp => sp.charId === c.id);
  if (reciprocal) reciprocal.status = status;
  if (!charEditSession) autoSave();
}

function saveCharRelation(idx) {
  showCharModal(idx, 'basic', true);
  saveChar(idx);
}

function saveChar(idx) {
  const name = document.getElementById('cm-name').value.trim();
  if (!name) { toast('이름을 입력해주세요.'); return; }
  const existing = idx !== undefined ? getCharEditProject().characters[idx] : null;
  if (existing) migrateRelationIds(getCharEditProject());
  const c = {
    id: existing ? existing.id : uid(),
    name, role: document.getElementById('cm-role').value,
    group: '',
    age: document.getElementById('cm-age').value,
    appearance: document.getElementById('cm-app').value,
    personality: document.getElementById('cm-per').value,
    background: document.getElementById('cm-bg').value,
    speech: document.getElementById('cm-sp').value,
    likes: document.getElementById('cm-likes').value,
    dislikes: document.getElementById('cm-dislikes').value,
    honorific: document.getElementById('cm-title')?.value || '',
    gender: document.getElementById('cm-gender')?.value || '',
    alive: document.getElementById('cm-alive')?.value || '생존',
    goal: document.getElementById('cm-goal')?.value || '',
    color: document.querySelector('#cm-color-group [data-selected]')?.dataset?.val || '',
    // 관계 필드는 "관계" 탭에서만 수정됨 → 기본 정보 저장 시 기존 값 보존
    parents:  existing && Array.isArray(existing.parents)  ? existing.parents  : [],
    spouses:  existing && Array.isArray(existing.spouses)  ? existing.spouses  : [],
    familyId: existing && typeof existing.familyId === 'string' ? existing.familyId : '',
    lineageStatus: existing && ['서자', '서녀'].includes(existing.lineageStatus) ? existing.lineageStatus : '',
  };
  const p = getCharEditProject();
  // 기존 이름 기반 심리 아크도 인물 이름이 바뀌기 전에 ID로 연결한다.
  if (existing && Array.isArray(p.psyArcs)) {
    const uniqueOldName = (p.characters || []).filter(character => character.name === existing.name).length === 1;
    p.psyArcs.forEach(arc => {
      if (arc.charId === c.id || (!arc.charId && uniqueOldName && arc.charName === existing.name)) {
        arc.charId = c.id;
        arc.charName = c.name;
      }
    });
  }
  if (idx !== undefined) p.characters[idx] = c;
  else p.characters.push(c);
  if (existing && Array.isArray(p.relations)) {
    p.relations.forEach(r => {
      if (r.fromId != null && String(r.fromId) === String(c.id)) r.from = c.name;
      if (r.toId != null && String(r.toId) === String(c.id)) r.to = c.name;
    });
  }
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
  commitCharEdit();
  if (!charEditSession) autoSave(); closeModal();
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
    migrateRelationIds(p);
    relationEditIndex = -1;
    p.characters.splice(idx, 1);
    if (removedId && Array.isArray(p.relations)) {
      p.relations = p.relations.filter(r =>
        String(r.fromId) !== String(removedId) && String(r.toId) !== String(removedId));
    }
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
let relationEditIndex = -1;
const RELATION_TYPES = ['사촌', '스승→제자', '내연 상대', '약혼자', '이복형제', '주군→가신', '원수', '짝사랑→상대'];

function migrateRelationIds(p) {
  if (!Array.isArray(p?.relations)) return false;
  let changed = false;
  p.relations.forEach(r => {
    for (const side of ['from', 'to']) {
      const key = side + 'Id';
      if (Object.prototype.hasOwnProperty.call(r, key) || !r[side]) continue;
      const matches = (p.characters || []).filter(c => c.id != null && c.id !== '' && c.name === r[side]);
      if (matches.length === 1) {
        r[key] = String(matches[0].id);
      } else {
        // 애매하거나 사라진 이름은 이후 인물 목록이 변해도 자동 연결하지 않는다.
        r[key] = null;
      }
      changed = true;
    }
  });
  return changed;
}

function relationCharacter(p, id) {
  if (id == null || id === '') return null;
  return (p.characters || []).find(c => c.id != null && String(c.id) === String(id));
}

function relationName(p, r, side) {
  return relationCharacter(p, r[side + 'Id'])?.name || r[side] || '알 수 없음';
}

function relationCharacterOptions(chars, selectedId = '') {
  return chars.map((c, i) => {
    const duplicate = chars.some((other, j) => j !== i && other.name === c.name);
    const label = duplicate ? `${c.name} · ${c.role || '역할 없음'} (${i + 1})` : c.name;
    return `<option value="${esc(c.id)}" ${String(c.id) === String(selectedId) ? 'selected' : ''}>${esc(label)}</option>`;
  }).join('');
}

function filterRelationSelect(searchId, selectId) {
  const search = document.getElementById(searchId);
  const select = document.getElementById(selectId);
  if (!search || !select) return;
  const p = getProject();
  const query = search.value.trim().toLocaleLowerCase();
  const selectedId = select.value;
  const chars = (p.characters || []).filter(c =>
    !query || `${c.name} ${c.role || ''}`.toLocaleLowerCase().includes(query) || String(c.id) === selectedId
  );
  select.innerHTML = `<option value="">인물 선택</option>${relationCharacterOptions(chars, selectedId)}`;
  select.value = selectedId;
}

function setRelationType(type) {
  const input = document.getElementById('rel-type');
  if (input) { input.value = type; input.focus(); }
}

function swapRelationCharacters() {
  const from = document.getElementById('rel-from');
  const to = document.getElementById('rel-to');
  if (!from || !to) return;
  const previous = from.value;
  const next = to.value;
  const fromSearch = document.getElementById('rel-from-search');
  const toSearch = document.getElementById('rel-to-search');
  if (fromSearch) fromSearch.value = '';
  if (toSearch) toSearch.value = '';
  const options = relationCharacterOptions(getProject().characters || []);
  from.innerHTML = `<option value="">인물 선택</option>${options}`;
  to.innerHTML = `<option value="">인물 선택</option>${options}`;
  from.value = next;
  to.value = previous;
}

function saveRelationData(p, fromId, toId, type, editIndex = -1) {
  const from = relationCharacter(p, fromId);
  const to = relationCharacter(p, toId);
  const label = type.trim();
  if (!from || !to || !label) return '인물과 관계 유형을 모두 입력해주세요.';
  if (String(fromId) === String(toId)) return '같은 인물은 선택할 수 없습니다.';
  if (!Array.isArray(p.relations)) p.relations = [];
  const duplicate = p.relations.some((r, i) => i !== editIndex &&
    String(r.fromId) === String(fromId) && String(r.toId) === String(toId) && (r.type || '').trim() === label);
  if (duplicate) return '이미 같은 관계가 있습니다.';
  const previous = editIndex >= 0 ? p.relations[editIndex] : null;
  const next = { ...previous, fromId, toId, from: from.name, to: to.name, type: label };
  if (editIndex >= 0) p.relations[editIndex] = next;
  else p.relations.push(next);
  return '';
}

const relationNetworkState = {
  showFamily: true, showExtra: true, showIsolated: false, showLabels: false, type: '', selectedId: null,
  focusOnly: false, zoom: 1, panX: 0, panY: 0, layoutKey: '', layout: null,
};

function relationNetworkEdges(p) {
  const chars = p.characters || [];
  const ids = new Set(chars.map(c => String(c.id)));
  const edges = [];
  const spousePairs = new Set();
  chars.forEach(c => {
    (c.parents || []).forEach(parentId => {
      if (ids.has(String(parentId))) edges.push({ from: String(parentId), to: String(c.id), type: '부모', group: 'family', directed: true });
    });
    (c.spouses || []).forEach(sp => {
      if (!ids.has(String(sp.charId))) return;
      const pair = [String(c.id), String(sp.charId)].sort().join('|');
      if (spousePairs.has(pair)) return;
      spousePairs.add(pair);
      const kind = sp.kind === 'concubine' ? '첩' : sp.kind === 'consort' ? '후궁' : '배우자';
      const secondary = kind !== '배우자' && [String(c.id), String(sp.charId)].includes(String(sp.secondaryId)) ? String(sp.secondaryId) : null;
      edges.push({ from: secondary === String(c.id) ? String(sp.charId) : String(c.id),
        to: secondary || String(sp.charId), type: kind + (sp.status === 'past' ? ' · 이별' : sp.status === 'deceased' ? ' · 사별' : ''), group: 'family', directed: !!secondary });
    });
  });
  (p.relations || []).forEach(r => {
    if (ids.has(String(r.fromId)) && ids.has(String(r.toId))) {
      edges.push({ from: String(r.fromId), to: String(r.toId), type: r.type || '관계', group: 'extra', directed: (r.type || '').includes('→') });
    }
  });
  return edges;
}

function relationNetworkLayout(chars, edges, width, height) {
  const positions = new Map();
  if (!chars.length) return positions;
  if (chars.length === 1) { positions.set(String(chars[0].id), { x: width / 2, y: height / 2 }); return positions; }
  const ids = chars.map(c => String(c.id));
  const adjacent = new Map(ids.map(id => [id, new Set()]));
  edges.forEach(e => {
    if (!adjacent.has(e.from) || !adjacent.has(e.to)) return;
    adjacent.get(e.from).add(e.to); adjacent.get(e.to).add(e.from);
  });
  const seen = new Set(), components = [];
  ids.forEach(id => {
    if (seen.has(id)) return;
    const group = [], queue = [id]; seen.add(id);
    for (let i=0; i<queue.length; i++) {
      const current = queue[i]; group.push(current);
      adjacent.get(current).forEach(next => { if (!seen.has(next)) { seen.add(next); queue.push(next); } });
    }
    components.push(group);
  });
  components.sort((a,b) => b.length - a.length);
  const boxes = components.map(group => {
    const local = new Map();
    const radius = Math.max(100, Math.sqrt(group.length) * 65);
    group.forEach((id,i) => {
      const angle = i * Math.PI * 2 / group.length;
      local.set(id, {x: radius*Math.cos(angle), y: radius*Math.sin(angle)});
    });
    // 화면 경계 없이 관계가 있는 인물끼리 모으고 카드 간 충돌을 해소한다.
    for (let step=0; step<160; step++) {
      edges.forEach(e => {
        const p=local.get(e.from), q=local.get(e.to); if (!p || !q) return;
        const dx=q.x-p.x, dy=q.y-p.y, dist=Math.max(1,Math.hypot(dx,dy));
        const pull=Math.max(-4,Math.min(4,(dist-195)*.025));
        p.x+=dx/dist*pull; p.y+=dy/dist*pull; q.x-=dx/dist*pull; q.y-=dy/dist*pull;
      });
      for (let i=0;i<group.length;i++) for(let j=i+1;j<group.length;j++) {
        const p=local.get(group[i]),q=local.get(group[j]);
        const dx=q.x-p.x,dy=q.y-p.y;
        const overlapX=152-Math.abs(dx),overlapY=100-Math.abs(dy);
        if(overlapX>0 && overlapY>0) {
          if(overlapX<overlapY) {const shift=(overlapX/2+.1)*(dx<0?-1:1);p.x-=shift;q.x+=shift;}
          else {const shift=(overlapY/2+.1)*(dy<0?-1:1);p.y-=shift;q.y+=shift;}
        }
      }
    }
    // 남은 겹침은 빈 행으로 옮겨 카드 사이 간격을 확보한다.
    const placed=[];
    group.forEach(id => {
      const p=local.get(id);
      while(placed.some(q=>Math.abs(p.x-q.x)<140 && Math.abs(p.y-q.y)<84)) p.y+=84;
      placed.push(p);
    });
    const minX=Math.min(...placed.map(p=>p.x))-74, minY=Math.min(...placed.map(p=>p.y))-50;
    const w=Math.max(...placed.map(p=>p.x))+74-minX, h=Math.max(...placed.map(p=>p.y))+50-minY;
    return {group,local,minX,minY,w,h};
  });
  const targetWidth=Math.max(width,Math.sqrt(boxes.reduce((sum,b)=>sum+b.w*b.h,0)*1.7));
  let x=24,y=24,rowHeight=0;
  boxes.forEach(box=>{
    if(x>24 && x+box.w>targetWidth){x=24;y+=rowHeight+64;rowHeight=0;}
    box.group.forEach(id=>{const p=box.local.get(id);positions.set(id,{x:x+p.x-box.minX,y:y+p.y-box.minY});});
    x+=box.w+64;rowHeight=Math.max(rowHeight,box.h);
  });

  return positions;
}

function setRelationNetworkFilter(name, value) {
  if (name === 'type') relationNetworkState.type = value;
  else if (name === 'family') relationNetworkState.showFamily = value;
  else if (name === 'focus') relationNetworkState.focusOnly = value;
  else if (name === 'person') relationNetworkState.selectedId = value || null;
  else if (name === 'extra') relationNetworkState.showExtra = value;
  else if (name === 'isolated') relationNetworkState.showIsolated = value;
  else if (name === 'labels') relationNetworkState.showLabels = value;
  drawRelationNetwork();
}

function selectRelationNetworkNode(id) {
  relationNetworkState.selectedId = relationNetworkState.selectedId === id ? null : id;
  drawRelationNetwork();
}

function zoomRelationNetwork(factor) {
  const svg = document.getElementById('rn-svg');
  const previous = relationNetworkState.zoom;
  const next = Math.max(.55, Math.min(2.5, previous * factor));
  if (svg) {
    const ratio = next / previous;
    relationNetworkState.panX = (svg.clientWidth || 800) / 2 * (1 - ratio) + relationNetworkState.panX * ratio;
    relationNetworkState.panY = (svg.clientHeight || 480) / 2 * (1 - ratio) + relationNetworkState.panY * ratio;
  }
  relationNetworkState.zoom = next;
  drawRelationNetwork();
}

function resetRelationNetworkView() {
  relationNetworkState.zoom = 1;
  relationNetworkState.panX = relationNetworkState.panY = 0;
  drawRelationNetwork();
}

function placeRelationLabel(x, y, width, bounds, occupied) {
  for (let ring = 0; ring < 18; ring++) {
    const count = ring ? 12 : 1;
    for (let i = 0; i < count; i++) {
      const angle = i * Math.PI * 2 / count;
      const px = x + Math.cos(angle) * ring * 18;
      const py = y + Math.sin(angle) * ring * 18;
      const box = { x: px - width / 2, y: py - 12, w: width, h: 24 };
      if (box.x < 2 || box.y < 2 || box.x + box.w > bounds.width - 2 || box.y + box.h > bounds.height - 2) continue;
      if (occupied.some(b => box.x < b.x + b.w + 4 && box.x + box.w + 4 > b.x && box.y < b.y + b.h + 4 && box.y + box.h + 4 > b.y)) continue;
      occupied.push(box);
      return { x: px, y: py };
    }
  }
  return null;
}

// 선분이 카드의 여유 영역 내부를 통과하는지 검사한다.
function relationSegmentBlocked(a, b, boxes) {
  return boxes.some(r => {
    let lo=0, hi=1;
    for (const axis of ['x','y']) {
      const min=r[axis]+.01, max=r[axis]+r[axis==='x'?'w':'h']-.01;
      const delta=b[axis]-a[axis];
      if(Math.abs(delta)<1e-9){if(a[axis]<=min || a[axis]>=max)return false;}
      else {const t1=(min-a[axis])/delta,t2=(max-a[axis])/delta;lo=Math.max(lo,Math.min(t1,t2));hi=Math.min(hi,Math.max(t1,t2));}
    }
    return lo<hi && hi>0 && lo<1;
  });
}

function routeRelationEdge(a, b, positions, index=0) {
  const boxes=[...positions.values()].map(p=>({x:p.x-66,y:p.y-37,w:132,h:74}));
  const angle=Math.atan2(b.y-a.y,b.x-a.x);
  const offset=index ? Math.ceil(index/2)*.22*(index%2?1:-1) : 0;
  const port=(p,theta)=>{const dx=Math.cos(theta),dy=Math.sin(theta),t=Math.min(66/Math.max(1e-9,Math.abs(dx)),37/Math.max(1e-9,Math.abs(dy)));return {x:p.x+dx*t,y:p.y+dy*t};};
  const start=port(a,angle+offset),end=port(b,angle+Math.PI-offset);
  if(!relationSegmentBlocked(start,end,boxes))return [start,end];
  const vertices=[start,end,...boxes.flatMap(r=>[{x:r.x,y:r.y},{x:r.x+r.w,y:r.y},{x:r.x,y:r.y+r.h},{x:r.x+r.w,y:r.y+r.h}])];
  const costs=vertices.map(()=>Infinity),prev=vertices.map(()=>-1),seen=new Set();costs[0]=0;
  for(let step=0;step<vertices.length;step++){
    let u=-1;for(let i=0;i<vertices.length;i++)if(!seen.has(i)&&(u<0||costs[i]<costs[u]))u=i;
    if(u<0 || !Number.isFinite(costs[u]))break;
    if(u===1){const path=[];for(let i=1;i!==-1;i=prev[i])path.unshift(vertices[i]);return path;}
    seen.add(u);
    for(let v=0;v<vertices.length;v++){
      if(seen.has(v))continue;
      const cost=costs[u]+Math.hypot(vertices[v].x-vertices[u].x,vertices[v].y-vertices[u].y);
      if(cost>=costs[v] || relationSegmentBlocked(vertices[u],vertices[v],boxes))continue;
      costs[v]=cost;prev[v]=u;
    }
  }
  return []; // 통과 경로가 없으면 카드 뒤로 잘못된 선을 그리지 않는다.
}

function drawRelationNetwork() {
  const svg = document.getElementById('rn-svg');
  const detail = document.getElementById('rn-detail');
  if (!svg || !detail) return;
  const p = getProject();
  let chars = p.characters || [];
  const allEdges = relationNetworkEdges(p);
  let edges = allEdges.filter(e => e.group === 'family' ? relationNetworkState.showFamily : relationNetworkState.showExtra && (!relationNetworkState.type || e.type === relationNetworkState.type));
  if (relationNetworkState.focusOnly && relationNetworkState.selectedId) {
    edges = edges.filter(e => e.from === relationNetworkState.selectedId || e.to === relationNetworkState.selectedId);
    const ids = new Set([relationNetworkState.selectedId, ...edges.flatMap(e => [e.from, e.to])]);
    chars = chars.filter(c => ids.has(String(c.id)));
  }
  const connectedIds = new Set(edges.flatMap(e => [e.from,e.to]));
  const isolatedCount = chars.filter(c => !connectedIds.has(String(c.id))).length;
  if (!relationNetworkState.showIsolated && edges.length) chars = chars.filter(c => connectedIds.has(String(c.id)) || String(c.id) === relationNetworkState.selectedId);
  const width = Math.max(280, svg.clientWidth || 800), height = Math.max(360, svg.clientHeight || 480);
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  if (!chars.length) {
    svg.innerHTML = `<text x="50%" y="50%" text-anchor="middle" fill="var(--muted)">등장인물을 추가하면 관계망이 나타납니다.</text>`;
    detail.innerHTML = '';
    return;
  }
  const layoutKey = `${width}:${height}:${chars.map(c => c.id).join(',')}:${edges.map(e => `${e.from}-${e.to}-${e.type}`).join(',')}`;
  if (relationNetworkState.layoutKey !== layoutKey) {
    relationNetworkState.layout = relationNetworkLayout(chars, edges, width, height);
    relationNetworkState.layoutKey = layoutKey;
    relationNetworkState.routes = new Map();
  }
  const positions = relationNetworkState.layout;
  const selected = relationNetworkState.selectedId;
  const points = [...positions.values()];
  const bounds = {width: Math.max(width, ...points.map(p=>p.x+80)), height: Math.max(height,...points.map(p=>p.y+55))};
  const fit = Math.min(1,width/bounds.width,height/bounds.height);
  const scale = fit * relationNetworkState.zoom;
  const occupied = [...positions.values()].map(p => ({x:p.x-58,y:p.y-29,w:116,h:58}));
  const pairCounts = new Map();
  const paths = edges.map(e => {
    const a = positions.get(e.from), b = positions.get(e.to);
    if (!a || !b) return '';
    const key = [e.from, e.to].sort().join('|');
    const index = pairCounts.get(key) || 0;
    pairCounts.set(key, index + 1);
    const routeKey=key+':'+e.from+':'+index;
    if(!relationNetworkState.routes.has(routeKey))relationNetworkState.routes.set(routeKey,routeRelationEdge(a,b,positions,index));
    const route=relationNetworkState.routes.get(routeKey);
    if(route.length<2)return '';
    const segment=Math.floor((route.length-1)/2);
    const midX=(route[segment].x+route[segment+1].x)/2,midY=(route[segment].y+route[segment+1].y)/2;
    const pathData=route.map((point,i)=>(i?'L':'M')+' '+point.x+' '+point.y).join(' ');
    const active = !selected || selected === e.from || selected === e.to;
    const color = e.group === 'family' ? 'var(--gold)' : 'var(--teal)';
    const shortLabel = e.type.length > 16 ? e.type.slice(0, 15) + '…' : e.type;
    const labelWidth = Math.max(44, shortLabel.length * 12 + 14);
    const label = active && (selected || relationNetworkState.showLabels || chars.length <= 12) ? placeRelationLabel(midX, midY, labelWidth, bounds, occupied) : null;
    const labelMarkup = label ? `<line x1="${midX}" y1="${midY}" x2="${label.x}" y2="${label.y}" stroke="var(--muted)" stroke-width="1"/><rect x="${label.x-labelWidth/2}" y="${label.y-11}" width="${labelWidth}" height="22" rx="10" class="rn-edge-label-bg"/><text x="${label.x}" y="${label.y+4}" text-anchor="middle" class="rn-edge-label">${esc(shortLabel)}</text>` : '';

    return `<g class="rn-edge${active ? '' : ' dim'}"><path d="${pathData}" stroke-linejoin="round" stroke-linecap="round" ${e.directed ? 'marker-end="url(#rn-arrow)"' : ''} fill="none" stroke="${color}" stroke-width="${active ? 2.4 : 1.4}" ${e.group === 'extra' ? 'stroke-dasharray="6 4"' : ''}/>${labelMarkup}<title>${esc(e.type)}</title></g>`;
  }).join('');
  const nodes = chars.map(c => {
    const pos = positions.get(String(c.id));
    const active = !selected || selected === String(c.id) || edges.some(e => (e.from === selected && e.to === String(c.id)) || (e.to === selected && e.from === String(c.id)));
    const description = [c.lineageStatus, c.role].filter(Boolean).join(' · ');
    return `<g class="rn-node${selected === String(c.id) ? ' selected' : ''}${active ? '' : ' dim'}" data-id="${esc(c.id)}" transform="translate(${pos.x},${pos.y})" tabindex="0" role="button" aria-label="${esc(c.name)}${c.lineageStatus ? `, ${esc(c.lineageStatus)}` : ''} 관계 보기"><rect x="-54" y="-25" width="108" height="50" rx="12"/><text text-anchor="middle" y="-1" class="rn-node-name">${esc(c.name.length > 9 ? c.name.slice(0, 8) + '…' : c.name)}</text><text text-anchor="middle" y="16" class="rn-node-role">${esc(description.length > 12 ? description.slice(0, 11) + '…' : description)}</text></g>`;
  }).join('');
  svg.innerHTML = `<defs><marker id="rn-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerUnits="userSpaceOnUse" markerWidth="12" markerHeight="12" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="var(--ink)"/></marker></defs><g transform="translate(${relationNetworkState.panX},${relationNetworkState.panY}) scale(${scale})">${paths}${nodes}</g>`;
  const person = chars.find(c => String(c.id) === selected);
  if (!person) {
    detail.innerHTML = `<span>인물을 누르면 해당 관계 이름과 목록을 볼 수 있습니다. 드래그로 이동하고 ＋로 확대하세요.</span><span>${chars.length}명 · 연결 ${edges.length}개${!relationNetworkState.showIsolated && isolatedCount ? ` · 연결 없는 인물 ${isolatedCount}명 숨김` : ''}</span>`;
  } else {
    const connected = edges.filter(e => e.from === selected || e.to === selected);
    detail.innerHTML = `<strong>${esc(person.name)}${person.lineageStatus ? ` · ${esc(person.lineageStatus)}` : ''}</strong>${connected.length ? connected.map(e => {
      const other = chars.find(c => String(c.id) === (e.from === selected ? e.to : e.from));
      return `<span class="rn-detail-chip">${e.from === selected ? '→' : '←'} ${esc(e.type)} · ${esc(other?.name || '알 수 없음')}</span>`;
    }).join('') : '<span>표시된 관계가 없습니다.</span>'}`;
  }
}

function setupRelationNetwork() {
  const svg = document.getElementById('rn-svg');
  if (!svg) return;
  let drag = null;
  svg.addEventListener('pointerdown', e => {
    if (e.target.closest('.rn-node')) return;
    drag = { x: e.clientX, y: e.clientY, panX: relationNetworkState.panX, panY: relationNetworkState.panY };
    svg.setPointerCapture(e.pointerId);
  });
  svg.addEventListener('pointermove', e => {
    if (!drag) return;
    relationNetworkState.panX = drag.panX + e.clientX - drag.x;
    relationNetworkState.panY = drag.panY + e.clientY - drag.y;
    drawRelationNetwork();
  });
  svg.addEventListener('pointerup', () => { drag = null; });
  svg.addEventListener('pointercancel', () => { drag = null; });
  svg.addEventListener('lostpointercapture', () => { drag = null; });
  svg.addEventListener('click', e => {
    const node = e.target.closest('.rn-node');
    if (node) selectRelationNetworkNode(node.dataset.id);
  });
  svg.addEventListener('keydown', e => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const node = e.target.closest('.rn-node');
    if (node) { e.preventDefault(); selectRelationNetworkNode(node.dataset.id); }
  });
  svg.addEventListener('wheel', e => {
    e.preventDefault();
    zoomRelationNetwork(e.deltaY < 0 ? 1.1 : 1 / 1.1);
  }, { passive: false });
  drawRelationNetwork();
}

function renderRelations(preserveEdit = false) {
  const p = getProject();
  if (!preserveEdit || relationEditIndex >= (p.relations || []).length) relationEditIndex = -1;
  if (migrateRelationIds(p)) autoSave();
  const chars = p.characters || [];
  const rels = p.relations || [];
  const editing = rels[relationEditIndex];
  const charOpts = selectedId => relationCharacterOptions(chars, selectedId);
  const networkTypes = [...new Set(rels.map(r => r.type).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ko'));
  if (relationNetworkState.type && !networkTypes.includes(relationNetworkState.type)) relationNetworkState.type = '';

  const relList = rels.length === 0
    ? `<div style="text-align:center;padding:32px;color:var(--muted)">관계를 추가해보세요.</div>`
    : rels.map((r,i) => `
      <div class="rel-row">
        <span class="rel-from">${esc(relationName(p, r, 'from'))}</span>
        <span class="rel-arrow">${esc(r.type)}</span>
        <span class="rel-to">${esc(relationName(p, r, 'to'))}</span>
        ${!relationCharacter(p, r.fromId) || !relationCharacter(p, r.toId) ? '<span class="tag" title="인물을 자동 연결하지 못했습니다">연결 확인 필요</span>' : ''}
        <button class="btn btn-outline btn-sm" onclick="editRelation(${i})" style="margin-left:auto">수정</button>
        <button class="btn-icon" onclick="deleteRelation(${i})" aria-label="관계 삭제" style="color:var(--rust)">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>`).join('');

  document.getElementById('main').innerHTML = `
    <div style="max-width:1100px;margin:0 auto">
      <div class="font-display" style="font-size:22px;margin-bottom:16px">인물 관계망</div>
      <div class="card rn-card">
        <div class="rn-toolbar">
          <select aria-label="중심 인물" onchange="setRelationNetworkFilter('person',this.value)"><option value="">인물 선택</option>${relationCharacterOptions(chars, relationNetworkState.selectedId)}</select>
          <label><input type="checkbox" ${relationNetworkState.focusOnly ? 'checked' : ''} onchange="setRelationNetworkFilter('focus',this.checked)"> 선택 인물 주변만</label>
          <label><input type="checkbox" ${relationNetworkState.showIsolated ? 'checked' : ''} onchange="setRelationNetworkFilter('isolated',this.checked)"> 연결 없는 인물</label>
          <label><input type="checkbox" ${relationNetworkState.showLabels ? 'checked' : ''} onchange="setRelationNetworkFilter('labels',this.checked)"> 모든 관계 이름</label>
          <label><input type="checkbox" ${relationNetworkState.showFamily ? 'checked' : ''} onchange="setRelationNetworkFilter('family',this.checked)"> 가족 연결</label>
          <label><input type="checkbox" ${relationNetworkState.showExtra ? 'checked' : ''} onchange="setRelationNetworkFilter('extra',this.checked)"> 추가 관계</label>
          <select aria-label="추가 관계 유형" onchange="setRelationNetworkFilter('type',this.value)"><option value="">모든 추가 관계</option>${networkTypes.map(type => `<option value="${esc(type)}" ${relationNetworkState.type === type ? 'selected' : ''}>${esc(type)}</option>`).join('')}</select>
          <div class="rn-zoom"><button class="btn btn-outline btn-sm" onclick="zoomRelationNetwork(1/1.2)" aria-label="축소">−</button><button class="btn btn-outline btn-sm" onclick="resetRelationNetworkView()">화면 맞춤</button><button class="btn btn-outline btn-sm" onclick="zoomRelationNetwork(1.2)" aria-label="확대">＋</button></div>
        </div>
        <svg id="rn-svg" class="rn-svg" aria-label="인물 관계망"></svg>
        <div id="rn-detail" class="rn-detail" aria-live="polite"></div>
      </div>
      ${chars.length < 2
        ? `<div class="card empty-state"><div class="emoji">🔗</div><p>등장인물을 2명 이상 추가하면<br>관계를 설정할 수 있습니다.</p></div>`
        : `
        <div class="card" style="margin-bottom:16px">
          <div class="sec-title">${editing ? '관계 수정' : '관계 추가'}</div>
          <div style="font-size:11px;color:var(--muted);margin:-8px 0 12px">추가 관계는 가계도 배치와 별도로 관리됩니다. 관계망에는 가족 연결과 함께 표시됩니다.</div>
          <div class="form-grid" style="align-items:end">
            <div><label class="label" for="rel-from-search">인물 A</label><input id="rel-from-search" type="search" placeholder="이름 검색" oninput="filterRelationSelect('rel-from-search','rel-from')"><select id="rel-from" aria-label="인물 A"><option value="">인물 선택</option>${charOpts(editing?.fromId)}</select></div>
            <div><label class="label" for="rel-to-search">인물 B</label><input id="rel-to-search" type="search" placeholder="이름 검색" oninput="filterRelationSelect('rel-to-search','rel-to')"><select id="rel-to" aria-label="인물 B"><option value="">인물 선택</option>${charOpts(editing?.toId)}</select></div>
            <div><label class="label" for="rel-type">관계 유형</label><input id="rel-type" value="${esc(editing?.type || '')}" placeholder="관계 유형 직접 입력"><div class="relation-presets">${RELATION_TYPES.map(type => `<button type="button" class="btn btn-outline btn-sm" onclick="setRelationType(${jsArg(type)})">${esc(type)}</button>`).join('')}</div><div style="font-size:11px;color:var(--muted);margin-top:6px">스승→제자, 주군→가신, 짝사랑→상대는 인물 A에서 B 방향입니다.</div></div>
            <div class="relation-actions"><button class="btn btn-outline" onclick="swapRelationCharacters()" title="인물 A와 B 바꾸기">⇄ 바꾸기</button><button class="btn btn-gold" onclick="addRelation()">${editing ? '변경 저장' : '추가'}</button>${editing ? '<button class="btn btn-outline" onclick="cancelRelationEdit()">취소</button>' : ''}</div>
          </div>
        </div>
        <div class="card">
          <div class="sec-title">관계 목록</div>
          <div class="rel-map">${relList}</div>
        </div>`}
    </div>`;
  setupRelationNetwork();
}

function addRelation() {
  const from = document.getElementById('rel-from').value;
  const to = document.getElementById('rel-to').value;
  const type = document.getElementById('rel-type').value.trim();
  const p = getProject();
  const error = saveRelationData(p, from, to, type, relationEditIndex);
  if (error) { toast(error); return; }
  relationEditIndex = -1;
  autoSave(); renderRelations();
}
function editRelation(i) {
  relationEditIndex = i;
  renderRelations(true);
  document.getElementById('rel-type')?.focus();
}
function cancelRelationEdit() {
  relationEditIndex = -1;
  renderRelations();
}
function deleteRelation(i) {
  confirmDialog('이 관계를 삭제할까요?', () => {
    getProject().relations.splice(i, 1);
    relationEditIndex = -1;
    autoSave(); renderRelations();
    toast('관계를 삭제했어요.');
  });
}

// ═══════════════════════════════════════════════════════════════
