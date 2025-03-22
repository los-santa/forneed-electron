const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');

let mainWindow;

// ─────────────────────────────────────────────
// createWindow
// ─────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'), // 필요하면
      contextIsolation: true,
      nodeIntegration: false,
      enableRemoteModule: false,
    },
  });
  mainWindow.loadFile('index.html');
}

app.whenReady().then(() => {
  setupIpcHandlers();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// ─────────────────────────────────────────────
// "cards" 폴더 설정
// ─────────────────────────────────────────────
const cardsDir = path.join(__dirname, 'cards');
if (!fs.existsSync(cardsDir)) {
  fs.mkdirSync(cardsDir);
}

// ─────────────────────────────────────────────
// 파일명 규칙: "제목.json"
// (실제로는 :/\*?"<>| 등 불법문자 처리 필요)
// ─────────────────────────────────────────────
function filenameFromTitle(title) {
  return `${title}.json`; 
}

// ─────────────────────────────────────────────
// IPC 핸들러들을 한 곳에 모아서 등록
// ─────────────────────────────────────────────
function setupIpcHandlers() {
  // 카드 로드
  ipcMain.handle('load-card', async (event, title) => {
    try {
      const card = await _loadCard(title);
      return { success: true, data: card };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // 모든 카드 로드
  ipcMain.handle('load-all-cards', async () => {
    try {
      const files = fs.readdirSync(cardsDir).filter(f => f.endsWith('.json'));
      const results = [];
      for (const file of files) {
        const cardPath = path.join(cardsDir, file);
        const data = JSON.parse(fs.readFileSync(cardPath, 'utf-8'));
        results.push({ title: data.title });
      }
      return { success: true, data: results };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // 카드 저장
  ipcMain.handle('save-card', async (event, cardData) => {
    try {
      if (!cardData.title || !cardData.title.trim()) {
        throw new Error('제목이 비어있습니다');
      }
      const trimmedTitle = cardData.title.trim();
      const fileName = filenameFromTitle(trimmedTitle);
      const filePath = path.join(cardsDir, fileName);

      if (fs.existsSync(filePath)) {
        throw new Error(`이미 같은 제목의 카드가 존재합니다: ${trimmedTitle}`);
      }

      const forVals = Array.isArray(cardData.forVal) ? cardData.forVal : cardData.forVal.split(', ').filter(v => v);
      const needVals = Array.isArray(cardData.needVal) ? cardData.needVal : cardData.needVal.split(', ').filter(v => v);

      const newCard = {
        title: trimmedTitle,
        content: cardData.content || '',
        forVal: forVals.join(', '),
        needVal: needVals.join(', '),
        complete: cardData.complete || false,
        bookmarked: cardData.bookmarked || false,
        startDate: cardData.startDate || '',
        endDate: cardData.endDate || '',
        totalTime: cardData.totalTime || '',
        deadline: cardData.deadline || '',
      };
      fs.writeFileSync(filePath, JSON.stringify(newCard, null, 2));
      
      // 관계 동기화
      await syncForNeedRelation(trimmedTitle, forVals, needVals);
      
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // 카드 업데이트
  ipcMain.handle('update-card', async (event, { oldTitle, newData }) => {
    try {
      if (!newData.title || !newData.title.trim()) {
        throw new Error('새 제목이 비어있습니다');
      }
      const oldFile = path.join(cardsDir, filenameFromTitle(oldTitle));
      if (!fs.existsSync(oldFile)) {
        throw new Error(`기존 카드 [${oldTitle}] 파일이 없습니다`);
      }
      const newTitle = newData.title.trim();
      const newFile = path.join(cardsDir, filenameFromTitle(newTitle));

      // 제목이 바뀌면 rename
      if (oldTitle !== newTitle) {
        if (fs.existsSync(newFile)) {
          throw new Error(`이미 같은 제목의 카드가 존재합니다: ${newTitle}`);
        }
        fs.renameSync(oldFile, newFile);
      }

      // 최종 내용 저장
      fs.writeFileSync(newFile, JSON.stringify(newData, null, 2));
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // 카드 삭제
  ipcMain.handle('delete-card', async (event, title) => {
    try {
      const targetFile = path.join(cardsDir, filenameFromTitle(title));
      if (!fs.existsSync(targetFile)) {
        throw new Error(`카드 [${title}] 파일이 존재하지 않습니다`);
      }

      // 삭제 전에 관계 제거
      const cardData = JSON.parse(fs.readFileSync(targetFile, 'utf-8'));
      const forVals = cardData.forVal.split(', ').filter(v => v);
      const needVals = cardData.needVal.split(', ').filter(v => v);
      await syncForNeedRelation(title, forVals, needVals, true);

      fs.unlinkSync(targetFile);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // 카드 검색
  ipcMain.handle('search-cards', async (event, query) => {
    try {
      const files = fs.readdirSync(cardsDir).filter(f => f.endsWith('.json'));
      const results = [];
      for (const file of files) {
        const data = JSON.parse(fs.readFileSync(path.join(cardsDir, file), 'utf-8'));
        const combined = [
          data.title, data.content, data.type, data.forVal, data.needVal, data.deadline
        ].join(' ').toLowerCase();
        if (combined.includes(query.toLowerCase())) {
          results.push({ title: data.title });
        }
      }
      return { success: true, results };
    } catch (err) {
      return { success: false, error: err.message, results: [] };
    }
  });

  // 미완성 카드 로드
  ipcMain.handle('load-incomplete-cards', async () => {
    try {
      const files = fs.readdirSync(cardsDir).filter(f => f.endsWith('.json'));
      const results = [];
      for (const file of files) {
        const data = JSON.parse(fs.readFileSync(path.join(cardsDir, file), 'utf-8'));
        if (!data.forVal || !data.needVal) {
          results.push({ title: data.title });
        }
      }
      return { success: true, results };
    } catch (err) {
      return { success: false, error: err.message, results: [] };
    }
  });

  // 관계 동기화
  ipcMain.handle('sync-all-relations', async () => {
    try {
      const files = fs.readdirSync(cardsDir).filter(f => f.endsWith('.json'));
      for (const file of files) {
        const cardData = JSON.parse(fs.readFileSync(path.join(cardsDir, file), 'utf-8'));
        const forVals = cardData.forVal ? cardData.forVal.split(', ').filter(v => v) : [];
        const needVals = cardData.needVal ? cardData.needVal.split(', ').filter(v => v) : [];
        await syncForNeedRelation(cardData.title, forVals, needVals);
      }
      return { success: true };
    } catch (err) {
      console.error('Sync all relations error:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('sync-relations', async (event, title, forVals, needVals) => {
    try {
      await syncForNeedRelation(title, forVals, needVals);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
}

// (1) save-card: 새 카드 생성
async function syncForNeedRelation(title, forVals, needVals, isDelete = false) {
  try {
    // 현재 카드의 for 값들에 대해
    for (const targetTitle of forVals) {
      const targetCard = await _loadCard(targetTitle);
      if (targetCard) {
        let targetNeedVals = targetCard.needVal.split(', ').filter(v => v);
        if (!isDelete) {
          if (!targetNeedVals.includes(title)) {
            targetNeedVals.push(title);
          }
        } else {
          targetNeedVals = targetNeedVals.filter(v => v !== title);
        }
        
        // updateCard 핸들러 직접 호출
        const result = await ipcMain.handle('update-card', null, {
          oldTitle: targetTitle,
          newData: { ...targetCard, needVal: targetNeedVals.join(', ') }
        });
        if (!result.success) {
          console.error('Failed to update need relation:', result.error);
        }
      }
    }

    // 현재 카드의 need 값들에 대해
    for (const targetTitle of needVals) {
      const targetCard = await _loadCard(targetTitle);
      if (targetCard) {
        let targetForVals = targetCard.forVal.split(', ').filter(v => v);
        if (!isDelete) {
          if (!targetForVals.includes(title)) {
            targetForVals.push(title);
          }
        } else {
          targetForVals = targetForVals.filter(v => v !== title);
        }
        
        // updateCard 핸들러 직접 호출
        const result = await ipcMain.handle('update-card', null, {
          oldTitle: targetTitle,
          newData: { ...targetCard, forVal: targetForVals.join(', ') }
        });
        if (!result.success) {
          console.error('Failed to update for relation:', result.error);
        }
      }
    }
  } catch (err) {
    console.error('Relation sync error:', err);
  }
}

// (3) load-card: 개별 로드
async function _loadCard(title) {
  try {
    const filePath = path.join(cardsDir, filenameFromTitle(title));
    if (!fs.existsSync(filePath)) {
      return null;
    }
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (err) {
    console.error('Load card error:', err);
    return null;
  }
}

// 파일 시스템 감시 추가
const cardWatcher = fs.watch(cardsDir, (eventType, filename) => {
  if (filename && filename.endsWith('.json')) {
    // 변경사항을 모든 윈도우에 알림
    BrowserWindow.getAllWindows().forEach(win => {
      win.webContents.send('cards-changed');
    });
  }
});

// 프로그램 종료 시 watcher 정리
app.on('window-all-closed', () => {
  cardWatcher.close();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
