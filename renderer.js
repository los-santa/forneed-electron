console.log('🚀 renderer.js - Final merged');

// 현재 편집중인 카드의 "옛 제목"(파일 rename 위해)
let currentEditTitle = null;

// 자동 저장을 위한 타이머 변수
let autoSaveTimer = null;
const AUTOSAVE_DELAY = 2000; // 2초 딜레이

// 카드 목록 관련 변수
let selectedCardIndex = -1;
let cardsList = [];

// DOM 요소 참조를 전역으로 관리
const DOM = {
  cardList: null,
  createModal: null,
  editModal: null,
  // ... 다른 DOM 요소들
};

// DOM 요소 초기화 함수
function initializeDOMReferences() {
  DOM.cardList = document.querySelector('.card-list');
  DOM.createModal = document.getElementById('createModalOverlay');
  DOM.editModal = document.getElementById('editModalOverlay');
  // ... 다른 DOM 요소들 초기화
  
  if (!DOM.cardList) {
    console.error('Card list element not found!');
    // 카드 리스트 요소 생성
    DOM.cardList = document.createElement('div');
    DOM.cardList.className = 'card-list';
    document.body.appendChild(DOM.cardList);
  }
}

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
  console.log('DOM Content Loaded');
  initialize();
  setupGlobalShortcuts();
  setupRefreshAndWatch();
  setupKeyboardNavigation();
  loadAndDisplayCards();
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
  // 메인 버튼들
  const createButton = document.getElementById('createCardButton');
  if (createButton) {
    createButton.addEventListener('click', () => {
      console.log('Create button clicked');
      openCreateModal();
    });
  }

  // 새 카드 생성 버튼
  const btnCreateConfirm = document.getElementById('btnCreateConfirm');
  if (btnCreateConfirm) {
    btnCreateConfirm.addEventListener('click', async () => {
      console.log('Create confirm clicked');
      await onCreateConfirm();
    });
  }

  const btnCreateCancel = document.getElementById('btnCreateCancel');
  if (btnCreateCancel) {
    btnCreateCancel.addEventListener('click', () => {
      document.getElementById('createModalOverlay').style.display = 'none';
    });
  }

  // 나머지 버튼들도 null 체크 추가
  const searchButton = document.getElementById('openSearchButton');
  if (searchButton) {
    searchButton.addEventListener('click', openSearchModal);
  }

  const graphButton = document.getElementById('graphViewButton');
  if (graphButton) {
    graphButton.addEventListener('click', openGraphModal);
  }

  const incompleteButton = document.getElementById('showIncompleteButton');
  if (incompleteButton) {
    incompleteButton.addEventListener('click', loadIncompleteCards);
  }

  // 태그 입력 설정
  setupTagInput('createForInput', 'createForContainer');
  setupTagInput('createNeedInput', 'createNeedContainer');
  setupTagInput('editForInput', 'editForContainer');
  setupTagInput('editNeedInput', 'editNeedContainer');
}

// ─────────────────────────────────────────────
// Dropdown 추천 (유사 검색) 공통 함수
// ─────────────────────────────────────────────
function setupValDropdown(inputId, dropdownId, containerId) {
  const inputEl = document.getElementById(inputId);
  const dropdownEl = document.getElementById(dropdownId);
  const container = document.getElementById(containerId);

  inputEl.addEventListener('input', async () => {
    const value = inputEl.value.trim();
    if (!value) {
      dropdownEl.style.display = 'none';
      return;
    }

    // IPC 검색
    const searchRes = await window.electron.ipcRenderer.invoke('search-cards', value);
    if (!searchRes.success) {
      dropdownEl.innerHTML = `<div style="color:red;padding:5px;">Error: ${searchRes.error}</div>`;
      dropdownEl.style.display = 'block';
      return;
    }

    let html = '';
    if (searchRes.results.length === 0) {
      html += `<div class="dropdown-item nonexistent" data-title="${value}">${value} (새 카드)</div>`;
    } else {
      searchRes.results.forEach(c => {
        html += `<div class="dropdown-item" data-title="${c.title}">${c.title}</div>`;
      });
    }
    dropdownEl.innerHTML = html;
    dropdownEl.style.display = 'block';

    // 클릭 로직 수정
    dropdownEl.querySelectorAll('.dropdown-item').forEach(div => {
      div.addEventListener('click', async () => {
        const chosen = div.getAttribute('data-title');
        
        // 현재 모달 닫기
        const currentModal = dropdownEl.closest('.modal-overlay');
        if (currentModal) {
          currentModal.style.display = 'none';
        }

        // 선택한 카드로 이동 (없으면 생성)
        await editCardByTitle(chosen);
        
        // 드롭다운 숨기기
        dropdownEl.style.display = 'none';
      });
    });
  });
}

// 태그 입력 함수 수정
function setupTagInput(inputId, containerId) {
  const input = document.getElementById(inputId);
  const container = document.getElementById(containerId);
  const dropdownId = inputId + 'Dropdown';

  // 드롭다운 설정
  setupValDropdown(inputId, dropdownId, containerId);
  
  input.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter' && input.value.trim()) {
      e.preventDefault();
      const value = input.value.trim();
      addTag(container, value);
      input.value = '';
      // 드롭다운 숨기기
      document.getElementById(dropdownId).style.display = 'none';
      
      // 태그가 추가될 때마다 자동 저장
      if (autoSaveTimer) {
        clearTimeout(autoSaveTimer);
      }
      
      autoSaveTimer = setTimeout(async () => {
        if (inputId.includes('edit')) {
          await saveEditChanges();
        } else if (inputId.includes('create')) {
          await saveNewCard();
        }
      }, AUTOSAVE_DELAY);
    }
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

  // 세부사항 접어두기
  const details = document.getElementById('createDetails');
  details.classList.remove('open');
  details.previousElementSibling.querySelector('.accordion-icon').classList.remove('open');
}

// ─────────────────────────────────────────────
// 새 카드 생성
// ─────────────────────────────────────────────
async function onCreateConfirm() {
  try {
    const titleInput = document.getElementById('createTitleInput');
    const title = titleInput.value.trim();
    
    if (!title) {
      showToast('제목을 입력해주세요', 'error');
      return;
    }

    const cardData = {
      title: title,
      content: '',
      forVal: [],
      needVal: [],
      complete: false,
      bookmarked: false
    };

    const result = await window.api.saveCard(cardData);
    if (!result.success) {
      throw new Error(result.error);
    }

    showToast('카드가 생성되었습니다');
    closeAllModals();
    await loadAndDisplayCards();
    
    // 새로 생성된 카드 편집 모드로 전환
    await editCardByTitle(title);
  } catch (err) {
    console.error('Failed to create card:', err);
    showToast('카드 생성 실패: ' + err.message, 'error');
  }
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

  document.getElementById('editTitleInput').value = data.title;
  setTagValues('editForContainer', data.forVal ? data.forVal.split(',').map(s => s.trim()) : []);
  setTagValues('editNeedContainer', data.needVal ? data.needVal.split(',').map(s => s.trim()) : []);
  document.getElementById('editContentInput').value = data.content || '';
  document.getElementById('editStartDate').value = data.startDate || '';
  document.getElementById('editEndDate').value = data.endDate || '';
  document.getElementById('editTotalTime').value = data.totalTime || '';
  document.getElementById('editDeadline').value = data.deadline || '';
  document.getElementById('editCompleteCheck').checked = !!data.complete;
  document.getElementById('editBookmarkCheck').checked = !!data.bookmarked;

  // For/Need 링크 표기
  renderReferenceLinks(data.forVal, 'editForLinks', 'For');
  renderReferenceLinks(data.needVal, 'editNeedLinks', 'Need');

  // 세부사항 접어두기
  const details = document.getElementById('editDetails');
  details.classList.remove('open');
  details.previousElementSibling.querySelector('.accordion-icon').classList.remove('open');
  
  document.getElementById('editModalOverlay').style.display = 'flex';
}

// ─────────────────────────────────────────────
// 편집 저장
// ─────────────────────────────────────────────
async function onEditConfirm() {
  const newTitle = document.getElementById('editTitleInput').value.trim();
  if (!newTitle) {
    alert('제목은 비울 수 없음');
    return;
  }
  const newFor = getTagValues('editForContainer');
  const newNeed = getTagValues('editNeedContainer');
  const newContent = document.getElementById('editContentInput').value.trim();
  const newStart = document.getElementById('editStartDate').value;
  const newEnd = document.getElementById('editEndDate').value;
  const newTotal = document.getElementById('editTotalTime').value;
  const newDead = document.getElementById('editDeadline').value;
  const newComp = document.getElementById('editCompleteCheck').checked;
  const newBook = document.getElementById('editBookmarkCheck').checked;

  const newData = {
    title: newTitle,
    forVal: newFor,  // 이제 배열
    needVal: newNeed, // 이제 배열
    content: newContent,
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
  try {
    const response = await window.api.loadCard(title);
    if (!response.success) {
      throw new Error(response.error);
    }
    
    const card = response.data;
    if (!card) {
      // 새 카드 생성 시
      const result = await window.electron.ipcRenderer.invoke('save-card', {
        title: title,
        content: '',
        forVal: [],
        needVal: [],
        complete: false,
        bookmarked: false
      });
      
      if (!result.success) {
        throw new Error(result.error);
      }
      
      card = await window.electron.ipcRenderer.invoke('load-card', title);
    }

    // 현재 열려있는 모달 닫기
    closeAllModals();
    
    // 편집 모달 열기
    const editModal = document.getElementById('editModalOverlay');
    editModal.style.display = 'flex';
    
    // 기본 필드 설정
    document.getElementById('editTitleInput').value = card.title;
    document.getElementById('editContentInput').value = card.content || '';
    
    // For/Need 값 설정
    const forVals = card.forVal ? card.forVal.split(', ').filter(v => v) : [];
    const needVals = card.needVal ? card.needVal.split(', ').filter(v => v) : [];
    
    // For/Need 컨테이너 초기화
    setupTagsFromArray('editForContainer', 'editForInput', forVals);
    setupTagsFromArray('editNeedContainer', 'editNeedInput', needVals);
    
    // 자동으로 관계 동기화 실행
    await window.electron.ipcRenderer.invoke('sync-relations', card.title, forVals, needVals);
    
    // 변경사항 즉시 저장
    await saveEditChanges();
    
  } catch (err) {
    console.error('Edit card error:', err);
    showToast('카드 편집 중 오류 발생: ' + err.message, 'error');
  }
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

// ─────────────────────────────────────────────
// 검색 모달 열기
// ─────────────────────────────────────────────
function openSearchModal() {
  document.getElementById('searchInput').value = '';
  document.getElementById('searchResultList').innerHTML = '';
  document.getElementById('searchModalOverlay').style.display = 'flex';
  document.getElementById('searchInput').focus();
}

// ─────────────────────────────────────────────
// 태그 관리 함수들
// ─────────────────────────────────────────────
function addTag(container, text) {
  // 이미 존재하는 태그인지 확인
  const existingTags = Array.from(container.querySelectorAll('.tag'))
    .map(tag => tag.getAttribute('data-value'));
  
  if (existingTags.includes(text)) {
    return; // 중복된 태그는 추가하지 않음
  }

  const tag = document.createElement('div');
  tag.className = 'tag';
  tag.setAttribute('data-value', text);
  tag.innerHTML = `
    ${text}
    <span class="tag-remove">&times;</span>
  `;
  
  tag.querySelector('.tag-remove').addEventListener('click', () => {
    container.removeChild(tag);
  });
  
  // 입력 필드 앞에 태그 추가
  container.insertBefore(tag, container.querySelector('.tag-input'));
}

// 태그 값들을 배열로 가져오기
function getTagValues(containerId) {
  const tags = document.getElementById(containerId).querySelectorAll('.tag');
  return Array.from(tags).map(tag => tag.getAttribute('data-value'));
}

// 태그 값들 설정하기
function setTagValues(containerId, values) {
  const container = document.getElementById(containerId);
  // 기존 태그들 제거 (입력 필드 제외)
  Array.from(container.querySelectorAll('.tag')).forEach(tag => tag.remove());
  
  // 새 태그들 추가
  if (Array.isArray(values)) {
    values.forEach(value => {
      if (value) addTag(container, value);
    });
  }
}

// ─────────────────────────────────────────────
// 아코디언 토글 함수
// ─────────────────────────────────────────────
function toggleAccordion(contentId) {
  const content = document.getElementById(contentId);
  const header = content.previousElementSibling;
  const icon = header.querySelector('.accordion-icon');
  
  content.classList.toggle('open');
  icon.classList.toggle('open');
}

// 입력 필드의 변경사항을 감지하고 자동 저장하는 함수
function setupAutoSave(modalId) {
  const inputs = document.querySelectorAll(`#${modalId} input, #${modalId} textarea`);
  
  inputs.forEach(input => {
    input.addEventListener('input', () => {
      // 이전 타이머가 있다면 취소
      if (autoSaveTimer) {
        clearTimeout(autoSaveTimer);
      }
      
      // 새로운 타이머 설정
      autoSaveTimer = setTimeout(async () => {
        if (modalId === 'editModalOverlay') {
          await saveEditChanges();
        } else if (modalId === 'createModalOverlay') {
          await saveNewCard();
        }
      }, AUTOSAVE_DELAY);
    });
  });
}

// 저장 함수 수정
async function saveEditChanges() {
  try {
    // ... 기존 저장 로직 ...
    
    // 성공 메시지를 토스트로 표시
    showToast('자동 저장됨');
  } catch (err) {
    showToast('저장 실패: ' + err.message, 'error');
  }
}

async function saveNewCard() {
  try {
    // ... 기존 저장 로직 ...
    
    // 성공 메시지를 토스트로 표시
    showToast('자동 저장됨');
  } catch (err) {
    showToast('저장 실패: ' + err.message, 'error');
  }
}

// 토스트 메시지 표시 함수
function showToast(message, type = 'success') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  
  // 3초 후 사라짐
  setTimeout(() => {
    toast.remove();
  }, 3000);
}

// 새로고침 버튼 추가 및 파일 시스템 변경 감지
function setupRefreshAndWatch() {
  // container 요소 찾기
  const container = document.querySelector('.container');
  if (!container) {
    console.error('Container element not found!');
    return;
  }

  // 새로고침 버튼 추가
  const refreshButton = document.createElement('button');
  refreshButton.innerHTML = '🔄 새로고침';
  refreshButton.className = 'refresh-button';
  
  // 버튼을 container의 첫 번째 자식으로 추가
  container.insertBefore(refreshButton, container.firstChild);

  // 새로고침 함수
  async function refreshCards() {
    await window.api.syncAllRelations();
    await loadAndDisplayCards();
    showToast('카드 목록이 새로고침되었습니다');
  }

  // 새로고침 버튼 클릭 이벤트
  refreshButton.addEventListener('click', refreshCards);

  // 파일 시스템 변경 감지
  window.events.onCardsChanged(() => {
    loadAndDisplayCards();
  });

  // F5 키로도 새로고침
  document.addEventListener('keydown', (e) => {
    if (e.key === 'F5') {
      e.preventDefault();
      refreshCards();
    }
  });
}

// 카드 목록 키보드 네비게이션
function setupKeyboardNavigation() {
  document.addEventListener('keydown', async (e) => {
    if (!cardsList.length) return;

    // 방향키 위/아래로 카드 선택
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      
      if (selectedCardIndex === -1) {
        selectedCardIndex = 0;
      } else {
        selectedCardIndex += e.key === 'ArrowUp' ? -1 : 1;
        selectedCardIndex = Math.max(0, Math.min(cardsList.length - 1, selectedCardIndex));
      }

      // 선택된 카드 하이라이트
      document.querySelectorAll('.card-item').forEach((item, index) => {
        item.classList.toggle('selected', index === selectedCardIndex);
      });
    }

    // Ctrl + X로 선택된 카드 삭제
    if (e.ctrlKey && e.key === 'x' && selectedCardIndex !== -1) {
      e.preventDefault();
      const cardTitle = cardsList[selectedCardIndex].title;
      
      if (confirm(`"${cardTitle}" 카드를 삭제하시겠습니까?`)) {
        await window.api.deleteCard(cardTitle);
        await loadAndDisplayCards();
        showToast(`"${cardTitle}" 카드가 삭제되었습니다`);
        selectedCardIndex = Math.min(selectedCardIndex, cardsList.length - 1);
      }
    }
  });
}

// 카드 목록 로드 및 표시 함수 수정
async function loadAndDisplayCards() {
  try {
    if (!DOM.cardList) {
      console.error('Card list element not found during display!');
      return;
    }

    const response = await window.api.loadAllCards();
    if (!response.success) {
      throw new Error(response.error);
    }

    const cards = response.data || [];
    cardsList = cards; // 전역 변수 업데이트

    DOM.cardList.innerHTML = '';
    cards.forEach((card, index) => {
      const cardElement = document.createElement('div');
      cardElement.className = 'card-item';
      if (index === selectedCardIndex) {
        cardElement.classList.add('selected');
      }
      cardElement.textContent = card.title;
      cardElement.addEventListener('click', () => editCardByTitle(card.title));
      DOM.cardList.appendChild(cardElement);
    });
  } catch (err) {
    console.error('Failed to load cards:', err);
    showToast('카드 목록 로드 실패: ' + err.message, 'error');
  }
}

// 초기화 함수 수정
function initialize() {
  // DOM 요소 참조 초기화
  initializeDOMReferences();
  
  // UI 설정 추가
  setupUI();
  
  // 기본 HTML 구조가 없다면 생성
  if (!document.querySelector('.container')) {
    const container = document.createElement('div');
    container.className = 'container';
    document.body.appendChild(container);
  }

  // 새로고침 버튼 설정
  setupRefreshAndWatch();
  
  // 키보드 네비게이션 설정
  setupKeyboardNavigation();
  
  // 초기 카드 목록 로드
  loadAndDisplayCards();
}
