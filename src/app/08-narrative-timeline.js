// 화 순서를 기준으로 이미 기록된 플롯·심리·복선을 함께 보여준다.
// 연결되지 않은 항목은 추측해서 배치하지 않고 별도로 모은다.
function buildNarrativeTimeline(project, foreshadowIndex) {
  const chapters = (project.chapters || []).filter(ch => !ch.isFolder);
  const makeLanes = () => ({ plot: [], psy: [], foreshadow: [] });
  const rows = chapters.map((chapter, index) => ({ chapter, number: index + 1, lanes: makeLanes() }));
  const byChapter = new Map(rows.map(row => [row.chapter.id, row]));
  const unlinked = makeLanes();

  function add(chapterId, lane, item) {
    const row = byChapter.get(chapterId);
    (row ? row.lanes : unlinked)[lane].push(item);
  }

  (project.arcs || []).forEach((arc, arcIndex) => {
    (arc.scenes || []).forEach((scene, itemIndex) => add(scene.chapterId, 'plot', {
      title: scene.title || '제목 없는 장면',
      detail: arc.title || '플롯 아크',
      sub: scene.type || '',
      source: 'plot', arcIndex, itemIndex
    }));
  });

  (project.psyArcs || []).forEach((arc, arcIndex) => {
    const character = getPsyArcCharacter(arc, project);
    const owner = character?.name || arc.charName || arc.title || '심리 아크';
    (arc.steps || []).forEach((step, itemIndex) => add(step.chapterId, 'psy', {
      title: step.title || '제목 없는 변화',
      detail: owner,
      sub: [step.beliefBefore && '변화 전', step.choiceAfter && '변화 후'].filter(Boolean).join(' → '),
      source: 'psy', arcIndex, itemIndex
    }));
  });

  (project.foreshadows || []).forEach((foreshadow, itemIndex) => {
    const classified = classifyForeshadowChapters(foreshadow, foreshadowIndex);
    const title = foreshadow.tagName || foreshadow.content || '제목 없는 복선';
    const base = { title, source: 'foreshadow', itemIndex };
    if (!classified.linked) {
      add(null, 'foreshadow', { ...base, detail: '본문 태그 미연결', sub: '' });
      return;
    }
    add(classified.planted, 'foreshadow', { ...base, detail: '🌱 첫 등장', sub: '' });
    classified.mentioned.forEach(chapterId => {
      add(chapterId, 'foreshadow', { ...base, detail: '💬 중간 언급', sub: '' });
    });
    if (classified.harvested) {
      add(classified.harvested, 'foreshadow', { ...base, detail: '✅ 회수', sub: '' });
    }
  });

  return { rows, unlinked };
}

function ntOpen(source, arcIndex, itemIndex) {
  if (source === 'plot') {
    navigate('plot');
    showSceneModal(arcIndex, itemIndex);
  } else if (source === 'psy') {
    navigate('psyarc');
    showPsyStepModal(arcIndex, itemIndex);
  } else if (source === 'foreshadow') {
    navigate('foreshadow');
    const item = getProject()?.foreshadows?.[arcIndex];
    if (item?.id) showForeshadowModal(item.id);
  }
}

function ntOpenChapter(index) {
  const chapter = (getProject()?.chapters || []).filter(ch => !ch.isFolder)[index];
  if (chapter) gotoChapterFromScene(chapter.id);
}

function renderNarrativeTimeline() {
  const project = getProject();
  if (!project) return;
  const { rows, unlinked } = buildNarrativeTimeline(project, buildForeshadowIndex());
  const laneDefs = [
    { key: 'plot', label: '플롯 장면' },
    { key: 'psy', label: '심리 변화' },
    { key: 'foreshadow', label: '복선' }
  ];
  const card = item => {
    const onclick = item.source === 'foreshadow'
      ? `ntOpen('foreshadow',${item.itemIndex})`
      : `ntOpen('${item.source}',${item.arcIndex},${item.itemIndex})`;
    return `<button class="nt-card nt-${item.source}" onclick="${onclick}" title="원본 기록 열기">
      <span class="nt-card-title">${esc(item.title)}</span>
      <span class="nt-card-detail">${esc(item.detail)}</span>
      ${item.sub ? `<span class="nt-card-sub">${esc(item.sub)}</span>` : ''}
    </button>`;
  };
  const lane = (items, definition) => `<div class="nt-lane nt-lane-${definition.key}">
    <div class="nt-mobile-label">${definition.label}</div>
    ${items.length ? items.map(card).join('') : '<span class="nt-empty">—</span>'}
  </div>`;
  const anyUnlinked = laneDefs.some(definition => unlinked[definition.key].length);

  document.getElementById('main').innerHTML = `<div class="nt-page">
    <div class="nt-heading">
      <div>
        <div class="font-display" style="font-size:22px">서사 타임라인</div>
        <p>회차별 플롯·심리 변화·복선의 흐름을 함께 확인하세요. 항목을 누르면 원본 기록이 열립니다.</p>
      </div>
    </div>
    ${rows.length ? `<div class="nt-grid-head"><span>회차</span>${laneDefs.map(definition => `<span>${definition.label}</span>`).join('')}</div>
      <div class="nt-rows">${rows.map(row => `<section class="nt-row">
        <div class="nt-chapter">
          <button onclick="ntOpenChapter(${row.number - 1})">${row.number}화 · ${esc(row.chapter.title || '(제목 없음)')}</button>
          <small>${laneDefs.reduce((sum, definition) => sum + row.lanes[definition.key].length, 0)}개 기록</small>
        </div>
        ${laneDefs.map(definition => lane(row.lanes[definition.key], definition)).join('')}
      </section>`).join('')}</div>`
      : `<div class="card empty-state"><div class="emoji">📖</div><p>회차를 만들면 서사 흐름을 확인할 수 있습니다.</p></div>`}
    ${anyUnlinked ? `<section class="nt-unlinked">
      <h3>회차에 연결되지 않은 기록</h3>
      <p>플롯·심리 단계는 원본에서 회차를 지정할 수 있습니다. 복선은 본문에 태그를 넣으면 회차가 연결됩니다.</p>
      <div class="nt-unlinked-grid">${laneDefs.map(definition => `<div>
        <h4>${definition.label} · ${unlinked[definition.key].length}</h4>
        ${unlinked[definition.key].length ? unlinked[definition.key].map(card).join('') : '<span class="nt-empty">—</span>'}
      </div>`).join('')}</div>
    </section>` : ''}
  </div>`;
}
