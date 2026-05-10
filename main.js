const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { processFile } = require('./fileProcessor');
const { analyzeText, analyzeFrequency, tokenize, normalizeArabic, detectLanguage } = require('./analyzer');
const { analyzePragmatics } = require('./pragmaticAnalyzer');
const { analyzeCustomLexicon, analyzeCollocation } = require('./customLexicon');
const { analyzeComparative } = require('./comparativeAnalyzer');

let mainWindow;

function createMainWindow() {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        },
        title: 'Sabr - سَبْر — محلل الخطاب التداولي'
    });

    mainWindow.loadFile('index.html');
    // mainWindow.webContents.openDevTools();
}

app.whenReady().then(() => {
    createMainWindow();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createMainWindow();
    }
});

// ============ File Handlers ============

ipcMain.handle('select-file', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile'],
        filters: [
            { name: 'Documents', extensions: ['pdf', 'docx', 'txt'] },
            { name: 'PDF Files', extensions: ['pdf'] },
            { name: 'Word Documents', extensions: ['docx'] },
            { name: 'Text Files', extensions: ['txt'] }
        ]
    });

    if (!result.canceled && result.filePaths.length > 0) {
        return result.filePaths[0];
    }
    return null;
});

ipcMain.handle('process-file', async (event, filePath) => {
    try {
        const result = await processFile(filePath);
        const text = result.text;
        const fileSize = result.fileSize;

        // Analyze text with stopwords
        const analysis = analyzeText(text);

        // Pragmatic analysis
        const pragmaticAnalysis = analyzePragmatics(text);

        // Comparative analysis
        const comparativeAnalysis = analyzeComparative(text);

        return {
            success: true,
            text: text,
            fileSize: fileSize,
            analysis: analysis,
            pragmaticAnalysis: pragmaticAnalysis,
            comparativeAnalysis: comparativeAnalysis
        };
    } catch (error) {
        console.error('Processing error:', error);
        return {
            success: false,
            error: error.message
        };
    }
});

// ============ Custom Lexicon Handlers ============

ipcMain.handle('analyze-lexicon', async (event, { text, categories }) => {
    try {
        return analyzeCustomLexicon(text, categories);
    } catch (error) {
        return { error: error.message };
    }
});

ipcMain.handle('analyze-collocation', async (event, { text, targetWord, windowSize }) => {
    try {
        return analyzeCollocation(text, targetWord, windowSize || 5);
    } catch (error) {
        return { error: error.message };
    }
});

// ============ Lexicon File Handlers ============

ipcMain.handle('export-lexicon', async (event, lexiconData) => {
    const result = await dialog.showSaveDialog(mainWindow, {
        defaultPath: 'lexicon.json',
        filters: [{ name: 'JSON', extensions: ['json'] }]
    });

    if (!result.canceled && result.filePath) {
        fs.writeFileSync(result.filePath, JSON.stringify(lexiconData, null, 2), 'utf-8');
        return { success: true };
    }
    return { success: false };
});

ipcMain.handle('import-lexicon', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile'],
        filters: [{ name: 'JSON', extensions: ['json'] }]
    });

    if (!result.canceled && result.filePaths.length > 0) {
        try {
            const data = fs.readFileSync(result.filePaths[0], 'utf-8');
            return { success: true, data: JSON.parse(data) };
        } catch (error) {
            return { success: false, error: 'ملف JSON غير صالح' };
        }
    }
    return { success: false };
});
