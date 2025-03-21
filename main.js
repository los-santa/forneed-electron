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
// IPC 핸들러들
// ─────────────────────────────────────────────

// (1) save-card: 새 카드 생성
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

    const newCard = {
      title: trimmedTitle,
      content: cardData.content || '', // 비어도 OK
      forVal: cardData.forVal || '',
      needVal: cardData.needVal || '',
      complete: cardData.complete || false,
      bookmarked: cardData.bookmarked || false,
      startDate: cardData.startDate || '',
      endDate: cardData.endDate || '',
      totalTime: cardData.totalTime || '',
      deadline: cardData.deadline || '',
    };
    fs.writeFileSync(filePath, JSON.stringify(newCard, null, 2));
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// (2) load-all-cards: 목록
ipcMain.handle('load-all-cards', async () => {
  try {
    const files = fs.readdirSync(cardsDir).filter(f => f.endsWith('.json'));
    const results = [];
    for (const file of files) {
      const cardPath = path.join(cardsDir, file);
      const data = JSON.parse(fs.readFileSync(cardPath, 'utf-8'));
      results.push({ title: data.title });
    }
    return results;
  } catch (err) {
    console.error('load-all-cards error', err);
    return [];
  }
});

// (3) load-card: 개별 로드
ipcMain.handle('load-card', async (event, title) => {
  try {
    const filePath = path.join(cardsDir, filenameFromTitle(title));
    if (!fs.existsSync(filePath)) {
      return null;
    }
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (err) {
    console.error(err);
    return null;
  }
});

// (4) update-card: 수정
// { oldTitle, newData }
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
    const finalCard = {
      title: newTitle,
      content: newData.content || '',
      forVal: newData.forVal || '',
      needVal: newData.needVal || '',
      complete: !!newData.complete,
      bookmarked: !!newData.bookmarked,
      startDate: newData.startDate || '',
      endDate: newData.endDate || '',
      totalTime: newData.totalTime || '',
      deadline: newData.deadline || '',
    };
    fs.writeFileSync(newFile, JSON.stringify(finalCard, null, 2));
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// (5) delete-card: 삭제
ipcMain.handle('delete-card', async (event, title) => {
  try {
    const targetFile = path.join(cardsDir, filenameFromTitle(title));
    if (!fs.existsSync(targetFile)) {
      throw new Error(`카드 [${title}] 파일이 존재하지 않습니다`);
    }
    fs.unlinkSync(targetFile);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// (6) search-cards: 부분 검색
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

// (7) load-incomplete-cards: forVal/needVal 비어있는 카드
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

// (8) export-cards (미구현)
ipcMain.handle('export-cards', async () => {
  return { success: false, error: 'export not implemented' };
});
