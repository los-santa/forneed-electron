const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');

let mainWindow;

app.on('ready', () => {
    mainWindow = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
            nodeIntegration: true,
        },
    });
    mainWindow.loadFile('index.html');
});

ipcMain.handle('save-card', async (event, cardData) => {
    const filePath = path.join(__dirname, 'data/cards.json');
    try {
        if (!fs.existsSync(path.join(__dirname, 'data'))) {
            fs.mkdirSync(path.join(__dirname, 'data')); // 데이터 폴더 생성
        }
        let existingData = [];
        if (fs.existsSync(filePath)) {
            const rawData = fs.readFileSync(filePath, 'utf-8');
            existingData = JSON.parse(rawData);
        }
        existingData.push(cardData);
        fs.writeFileSync(filePath, JSON.stringify(existingData, null, 2)); // 데이터 저장
        return { success: true };
    } catch (error) {
        console.error('Error saving card:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('load-cards', async () => {
    const filePath = path.join(__dirname, 'data/cards.json');
    try {
        if (fs.existsSync(filePath)) {
            const data = fs.readFileSync(filePath, 'utf-8');
            return JSON.parse(data); // 저장된 카드 데이터 반환
        } else {
            return []; // 파일이 없을 경우 빈 배열 반환
        }
    } catch (error) {
        console.error('Error loading cards:', error);
        return [];
    }
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        mainWindow = new BrowserWindow({
            width: 800,
            height: 600,
            webPreferences: {
                nodeIntegration: true,
            },
        });
        mainWindow.loadFile('index.html');
    }
});
