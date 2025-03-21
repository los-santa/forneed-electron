console.log('🚀 renderer.js - Final merged');

// 현재 편집중인 카드의 "옛 제목"(파일 rename 위해)
let currentEditTitle = null;

// ─────────────────────────────────────────────
// 전역 ESC 키
// ─────────────────────────────────────────────
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-overlay').forEach(m => {
      m.style.display = 'none';
    });
  }
  if (e.ctrlKey && e.code === 'KeyN') {
    e.preventDefault();
    openCreateModal();
  }
  if (e.ctrlKey && e.code === 'KeyO') {
    e.preventDefault();
    openSearchModal();
  }
});

// ─────────────────────────────────────────────
// DOMContentLoaded
// ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  setupUI();
  loadCardList();
  setupGlobalShortcuts();
});

// ─────────────────────────────────────────────
// Ctrl+N, Ctrl+O
// ─────────────────────────────────────────────
function setupGlobalShortcuts() {
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.code === 'KeyN') {
      e.preventDefault();
      openCreateModal();
    }
    if (e.ctrlKey && e.code === 'KeyO') {
      e.preventDefault();
      openSearchModal();
    }
  });
}

// ─────────────────────────────────────────────
// UI 버튼 세팅
// ─────────────────────────────────────────────
function setupUI() {
  // 메인 버튼
  document.getElementById('createCardButton').addEventListener('click', openCreateModal);
  document.getElementById('openSearchButton').addEventListener('click', openSearchModal);
  document.getElementById('graphViewButton').addEventListener('click', openGraphModal);
  document.getElementById('showIncompleteButton').addEventListener('click', loadIncompleteCards);
  document.getElementById('exportPlanButton').addEventListener('click', async () => {
    const res = await window.electron.ipcRenderer.invoke('export-cards');
    if (!res.success) {
      alert('내보내기 실패: ' + res.error);
    }
  });

  // 새 카드
  document.getElementById('btnCreateConfirm').addEventListener('click', onCreateConfirm);
  document.getElementById('btnCreateCancel').addEventListener('click', () => {
    document.getElementById('createModalOverlay').style.display = 'none';
  });

  // 편집
  document.getElementById('btnEditConfirm').addEventListener('click', onEditConfirm);
  document.getElementById('btnEditCancel').addEventListener('click', () => {
    document.getElementById('editModalOverlay').style.display = 'none';
  });
  document.getElementById('btnDeleteCard').addEventListener('click', onDeleteCard);

  // 검색
  document.getElementById('btnSearchClose').addEventListener('click', () => {
    document.getElementById('searchModalOverlay').style.display = 'none';
  });
  document.getElementById('searchInput').addEventListener('input', onSearchInput);

  // 그래프
  document.getElementById('btnGraphClose').addEventListener('click', () => {
    document.getElementById('graphModalOverlay').style.display = 'none';
  });

  // 불완전 카드
  document.getElementById('btnIncompleteClose').addEventListener('click', () => {
    document.getElementById('incompleteModalOverlay').style.display = 'none';
  });

  // Dropdown (For/Need) in create modal
  setupValDropdown('createForInput', 'createForDropdown');
  setupValDropdown('createNeedInput','createNeedDropdown');
  // Dropdown (For/Need) in edit modal
  setupValDropdown('editForInput', 'editForDropdown');
  setupValDropdown('editNeedInput','editNeedDropdown');
}

// ─────────────────────────────────────────────
// Dropdown 추천 (유사 검색) 공통 함수
// ─────────────────────────────────────────────
function setupValDropdown(inputId, dropdownId) {
  const inputEl = document.getElementById(inputId);
  const dropdownEl = document.getElementById(dropdownId);

  inputEl.addEventListener('input', async () => {
    // 쉼표로 구분된 마지막 토큰만 검색
    const rawVal = inputEl.value;
    const splitted = rawVal.split(',').map(s => s.trim());
    const lastToken = splitted[splitted.length - 1] || '';
    if (!lastToken) {
      dropdownEl.style.display = 'none';
      return;
    }

    // IPC 검색
    const searchRes = await window.electron.ipcRenderer.invoke('search-cards', lastToken);
    if (!searchRes.success) {
      dropdownEl.innerHTML = `<div style="color:red;padding:5px;">Error: ${searchRes.error}</div>`;
      dropdownEl.style.display = 'block';
      return;
    }

    let html = '';
    if (searchRes.results.length === 0) {
      // 존재하지 않는 카드 => 새 카드
      html += `<div class="dropdown-item nonexistent" data-title="${lastToken}">${lastToken} (새 카드)</div>`;
    } else {
      // 이미 존재하는 카드들
      searchRes.results.forEach(c => {
        html += `<div class="dropdown-item" data-title="${c.title}">${c.title}</div>`;
      });
      // 중복해서 새 카드도 추가하고 싶다면 추가 가능
      // 여기서는 간단히 생략
    }
    dropdownEl.innerHTML = html;
    dropdownEl.style.display = 'block';

    // 클릭 로직
    dropdownEl.querySelectorAll('.dropdown-item').forEach(div => {
      div.addEventListener('click', () => {
        const chosen = div.getAttribute('data-title');
        // 기존 것 (splitted)에서 마지막을 치환
        const newList = splitted.slice(0, splitted.length - 1);
        newList.push(chosen);
        inputEl.value = newList.join(', ') + ', ';
        dropdownEl.style.display = 'none';
      });
    });
  });
}

// ─────────────────────────────────────────────
// 새 카드 모달 열기
// ─────────────────────────────────────────────
function openCreateModal() {
  // 초기화
  document.getElementById('createTitleInput').value = '';
  document.getElementById('createForInput').value  = '';
  document.getElementById('createNeedInput').value = '';
  document.getElementById('createContentInput').value = '';
  document.getElementById('createStartDate').value  = '';
  document.getElementById('createEndDate').value    = '';
  document.getElementById('createTotalTime').value  = '';
  document.getElementById('createDeadline').value   = '';

  const overlay = document.getElementById('createModalOverlay');
  overlay.style.display = 'flex';
  // 제목 입력란에 포커스
  document.getElementById('createTitleInput').focus();
}

// ─────────────────────────────────────────────
// 새 카드 생성
// ─────────────────────────────────────────────
async function onCreateConfirm() {
  const title = document.getElementById('createTitleInput').value.trim();
  if (!title) {
    alert('제목은 필수');
    return;
  }
  const forVal  = document.getElementById('createForInput').value.trim();
  const needVal = document.getElementById('createNeedInput').value.trim();
  const content = document.getElementById('createContentInput').value.trim();
  const type    = document.getElementById('createTypeSelect').value;
  const start   = document.getElementById('createStartDate').value;
  const end     = document.getElementById('createEndDate').value;
  const total   = document.getElementById('createTotalTime').value;
  const dl      = document.getElementById('createDeadline').value;

  const payload = {
    title, content,
    forVal, needVal,
    startDate: start,
    endDate: end,
    totalTime: total,
    deadline: dl,
    complete: false,
    bookmarked: false
  };
  const res = await window.electron.ipcRenderer.invoke('save-card', payload);
  if (!res.success) {
    alert('에러: ' + res.error);
    return;
  }
  console.log('새 카드 생성 완료');
  document.getElementById('createModalOverlay').style.display = 'none';
  loadCardList();
}

// ─────────────────────────────────────────────
// 카드 목록 불러오기
// ─────────────────────────────────────────────
async function loadCardList() {
  const container = document.getElementById('cardList');
  container.innerHTML = '';
  const cards = await window.electron.ipcRenderer.invoke('load-all-cards');
  if (!cards || cards.length === 0) {
    container.innerHTML = '<p>등록된 카드가 없습니다.</p>';
    return;
  }
  cards.forEach(c => {
    const div = document.createElement('div');
    div.className = 'card-item';
    div.textContent = c.title;
    div.addEventListener('click', () => {
      editCard(c.title);
    });
    container.appendChild(div);
  });
}

// ─────────────────────────────────────────────
// 편집 모달 열기
// ─────────────────────────────────────────────
async function editCard(title) {
  const data = await window.electron.ipcRenderer.invoke('load-card', title);
  if (!data) {
    alert(`[${title}] 카드 없음`);
    return;
  }
  currentEditTitle = data.title;

  document.getElementById('editTitleInput').value   = data.title;
  document.getElementById('editForInput').value     = data.forVal || '';
  document.getElementById('editNeedInput').value    = data.needVal|| '';
  document.getElementById('editContentInput').value = data.content|| '';
  document.getElementById('editTypeSelect').value   = data.type|| 'noun';
  document.getElementById('editStartDate').value    = data.startDate|| '';
  document.getElementById('editEndDate').value      = data.endDate|| '';
  document.getElementById('editTotalTime').value    = data.totalTime|| '';
  document.getElementById('editDeadline').value     = data.deadline|| '';
  document.getElementById('editCompleteCheck').checked = !!data.complete;
  document.getElementById('editBookmarkCheck').checked = !!data.bookmarked;

  // For/Need 링크 표기
  renderReferenceLinks(data.forVal, 'editForLinks', 'For');
  renderReferenceLinks(data.needVal,'editNeedLinks','Need');

  document.getElementById('editModalOverlay').style.display = 'flex';
}

// ─────────────────────────────────────────────
// 편집 저장
// ─────────────────────────────────────────────
async function onEditConfirm() {
  const newTitle   = document.getElementById('editTitleInput').value.trim();
  if (!newTitle) {
    alert('제목은 비울 수 없음');
    return;
  }
  const newFor   = document.getElementById('editForInput').value.trim();
  const newNeed  = document.getElementById('editNeedInput').value.trim();
  const newContent = document.getElementById('editContentInput').value.trim();
  const newType    = document.getElementById('editTypeSelect').value;
  const newStart   = document.getElementById('editStartDate').value;
  const newEnd     = document.getElementById('editEndDate').value;
  const newTotal   = document.getElementById('editTotalTime').value;
  const newDead    = document.getElementById('editDeadline').value;
  const newComp    = document.getElementById('editCompleteCheck').checked;
  const newBook    = document.getElementById('editBookmarkCheck').checked;

  const newData = {
    title: newTitle,
    forVal: newFor,
    needVal: newNeed,
    content: newContent,
    type: newType,
    startDate: newStart,
    endDate: newEnd,
    totalTime: newTotal,
    deadline: newDead,
    complete: newComp,
    bookmarked: newBook
  };

  const res = await window.electron.ipcRenderer.invoke('update-card', {
    oldTitle: currentEditTitle,
    newData
  });
  if (!res.success) {
    alert('에러: ' + res.error);
    return;
  }
  console.log('카드 수정 완료');
  document.getElementById('editModalOverlay').style.display = 'none';
  loadCardList();
}

// ─────────────────────────────────────────────
// 카드 삭제
// ─────────────────────────────────────────────
async function onDeleteCard() {
  if (!currentEditTitle) return;
  if (!confirm('정말 이 카드를 삭제하시겠습니까?')) return;
  const res = await window.electron.ipcRenderer.invoke('delete-card', currentEditTitle);
  if (!res.success) {
    alert('에러: ' + res.error);
    return;
  }
  console.log('카드 삭제됨');
  document.getElementById('editModalOverlay').style.display = 'none';
  loadCardList();
}

// ─────────────────────────────────────────────
// 검색 기능
// ─────────────────────────────────────────────
let searchTimer = null;
async function onSearchInput(e) {
  const query = e.target.value.trim();
  const list = document.getElementById('searchResultList');
  list.innerHTML = '';

  if (!query) return;
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(async () => {
    const res = await window.electron.ipcRenderer.invoke('search-cards', query);
    if (!res.success) {
      list.innerHTML = `<div style="color:red;">Error: ${res.error}</div>`;
      return;
    }
    if (res.results.length === 0) {
      list.innerHTML = `<div>검색 결과 없음</div>`;
      return;
    }
    res.results.forEach(c => {
      const div = document.createElement('div');
      div.className = 'card-item';
      div.textContent = c.title;
      div.addEventListener('click', () => {
        document.getElementById('searchModalOverlay').style.display = 'none';
        editCard(c.title);
      });
      list.appendChild(div);
    });
  }, 300);
}

// ─────────────────────────────────────────────
// 불완전(For/Need 둘 중 하나 비어있는) 카드
// ─────────────────────────────────────────────
async function loadIncompleteCards() {
  const listEl = document.getElementById('incompleteList');
  listEl.innerHTML = '';
  const res = await window.electron.ipcRenderer.invoke('load-incomplete-cards');
  if (!res.success) {
    listEl.innerHTML = `<p style="color:red;">에러: ${res.error}</p>`;
  } else if (res.results.length === 0) {
    listEl.innerHTML = `<p>모두 For/Need가 채워져 있음</p>`;
  } else {
    res.results.forEach(c => {
      const div = document.createElement('div');
      div.className = 'card-item';
      div.textContent = c.title;
      div.addEventListener('click', () => {
        document.getElementById('incompleteModalOverlay').style.display = 'none';
        editCard(c.title);
      });
      listEl.appendChild(div);
    });
  }
  document.getElementById('incompleteModalOverlay').style.display = 'flex';
}

// ─────────────────────────────────────────────
// For/Need -> 링크로 표시 (Obsidian 유사)
/// 존재여부 체크해서 연한색 or 파란색
// ─────────────────────────────────────────────
function renderReferenceLinks(value, containerId, label) {
  const cont = document.getElementById(containerId);
  cont.innerHTML = '';
  if (!value || !value.trim()) {
    cont.textContent = `${label} 없음`;
    return;
  }
  const splitted = value.split(',').map(s => s.trim()).filter(Boolean);
  if (splitted.length === 0) {
    cont.textContent = `${label} 없음`;
    return;
  }

  const info = document.createElement('div');
  info.innerHTML = `<b>${label} 참조:</b>`;
  cont.appendChild(info);

  splitted.forEach(async (t) => {
    const span = document.createElement('span');
    span.style.cursor = 'pointer';
    span.style.textDecoration = 'underline';
    span.style.marginRight = '8px';

    // 존재여부 확인
    const syncRes = await window.electron.ipcRenderer.invoke('load-card', t);
    if (!syncRes) {
      // 연한색
      span.style.color = '#999';
      span.textContent = `${t}(새카드)`;
    } else {
      span.style.color = 'blue';
      span.textContent = t;
    }
    span.addEventListener('click', () => {
      editCardByTitle(t);
    });
    cont.appendChild(span);
  });
}

// ─────────────────────────────────────────────
// 제목으로 카드 열기 (없으면 자동 생성)
/// (연한 색 카드 클릭 시)
/// content 비워두고 새로 생성
// ─────────────────────────────────────────────
async function editCardByTitle(title) {
  const card = await window.electron.ipcRenderer.invoke('load-card', title);
  if (!card) {
    // 자동 생성
    const createRes = await window.electron.ipcRenderer.invoke('save-card', {
      title,
      content: '',
      forVal: '',
      needVal: '',
      complete: false,
      bookmarked: false
    });
    if (!createRes.success) {
      alert('새 카드 생성 실패: ' + createRes.error);
      return;
    }
  }
  editCard(title);
}

// ─────────────────────────────────────────────
// 그래프 뷰: For => A->B, Need => A->B
// ─────────────────────────────────────────────
function openGraphModal() {
  document.getElementById('graphModalOverlay').style.display = 'flex';
  loadGraph();
}
async function loadGraph() {
  const allCards = await window.electron.ipcRenderer.invoke('load-all-cards');
  if (!allCards || allCards.length === 0) {
    alert('등록된 카드가 없습니다.');
    return;
  }

  // 상세
  const details = [];
  for (const c of allCards) {
    const d = await window.electron.ipcRenderer.invoke('load-card', c.title);
    if (d) details.push(d);
  }

  const elements = [];
  // 노드
  details.forEach(card => {
    elements.push({ data: { id: card.title, label: card.title }});
  });
  // 에지 (A.forVal=>B, A.needVal=>B)
  details.forEach(card => {
    if (card.forVal) {
      card.forVal.split(',').map(s=>s.trim()).filter(Boolean).forEach(t => {
        const target = details.find(x => x.title === t);
        if (target) {
          elements.push({
            data: { id: card.title+'_for_'+t, source: card.title, target: t }
          });
        }
      });
    }
    if (card.needVal) {
      card.needVal.split(',').map(s=>s.trim()).filter(Boolean).forEach(t => {
        const target = details.find(x => x.title === t);
        if (target) {
          elements.push({
            data: { id: card.title+'_need_'+t, source: card.title, target: t }
          });
        }
      });
    }
  });

  const cy = cytoscape({
    container: document.getElementById('graphContainer'),
    elements,
    style: [
      {
        selector: 'node',
        style: {
          'background-color': '#888',
          'label': 'data(label)',
          'color': '#fff',
          'text-valign': 'center'
        }
      },
      {
        selector: 'edge',
        style: {
          'width': 2,
          'line-color': '#666',
          'target-arrow-color': '#666',
          'target-arrow-shape': 'triangle'
        }
      }
    ],
    layout: {
      name: 'cose',
      animate: true
    }
  });

  cy.on('tap', 'node', (evt) => {
    const nodeTitle = evt.target.id();
    editCard(nodeTitle);
    document.getElementById('graphModalOverlay').style.display = 'none';
  });
}
