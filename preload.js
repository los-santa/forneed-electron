const { contextBridge, ipcRenderer } = require('electron');

// IPC 통신을 위한 API 노출
contextBridge.exposeInMainWorld('api', {
  // 카드 관련 API
  loadCard: (title) => ipcRenderer.invoke('load-card', title),
  loadAllCards: () => ipcRenderer.invoke('load-all-cards'),
  saveCard: (cardData) => ipcRenderer.invoke('save-card', cardData),
  updateCard: (data) => ipcRenderer.invoke('update-card', data),
  deleteCard: (title) => ipcRenderer.invoke('delete-card', title),
  searchCards: (query) => ipcRenderer.invoke('search-cards', query),
  loadIncompleteCards: () => ipcRenderer.invoke('load-incomplete-cards'),
  
  // 관계 동기화 API
  syncAllRelations: () => ipcRenderer.invoke('sync-all-relations'),
  syncRelations: (title, forVals, needVals) => 
    ipcRenderer.invoke('sync-relations', title, forVals, needVals),
});

// 이벤트 리스너 API
contextBridge.exposeInMainWorld('events', {
  onCardsChanged: (callback) => {
    ipcRenderer.on('cards-changed', (event) => callback());
    // 클린업 함수 반환
    return () => {
      ipcRenderer.removeListener('cards-changed', callback);
    };
  }
});
