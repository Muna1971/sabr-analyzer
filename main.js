const { app, BrowserWindow, ipcMain, dialog, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const { processFile } = require('./fileProcessor');
const { analyzeText, analyzeFrequency, tokenize, normalizeArabic, detectLanguage } = require('./analyzer');
const { analyzePragmatics } = require('./pragmaticAnalyzer');
const { analyzeCustomLexicon, analyzeCollocation } = require('./customLexicon');
const { analyzeComparative } = require('./comparativeAnalyzer');
const { CorpusManager } = require('./corpusManager');
const ExcelJS = require('exceljs');

let mainWindow;
const corpusManager = new CorpusManager();

function createMainWindow() {
    // Load icon using nativeImage for proper Windows support
    const iconPath = path.join(__dirname, 'assets', 'icon.ico');
    let appIcon;
    try {
        appIcon = nativeImage.createFromPath(iconPath);
        if (appIcon.isEmpty()) {
            // Fallback to PNG
            appIcon = nativeImage.createFromPath(path.join(__dirname, 'assets', 'icon.png'));
        }
    } catch (e) {
        appIcon = undefined;
    }

    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        icon: appIcon || iconPath,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        },
        title: 'Sabr - سَبْر — محلل الخطاب التداولي'
    });

    // Set window icon explicitly (Windows fix)
    if (appIcon && !appIcon.isEmpty()) {
        mainWindow.setIcon(appIcon);
    }

    mainWindow.loadFile('index.html');
    // mainWindow.webContents.openDevTools();
}

// Windows: set AppUserModelId for proper taskbar icon
if (process.platform === 'win32') {
    app.setAppUserModelId('com.sabr.analyzer');
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
        const result = await processFile(filePath, (progress) => {
            // Send progress to renderer
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('file-progress', progress);
            }
        });
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

// ============ Analyze Corpus Text (for project → analysis flow) ============

ipcMain.handle('analyze-corpus-text', async () => {
    try {
        if (!corpusManager.project || !corpusManager.project.corpus.texts.length) {
            return { success: false, error: 'لا توجد نصوص معالَجة في المشروع' };
        }

        // Combine all corpus texts into one
        const allTexts = corpusManager.project.corpus.texts.map(t => t.content).join('\n\n');
        const totalWords = corpusManager.project.corpus.totalWords;
        const projectName = corpusManager.project.name || 'مشروع سبر';

        // Run all analyses
        const analysis = analyzeText(allTexts);
        const pragmaticAnalysis = analyzePragmatics(allTexts);
        const comparativeAnalysis = analyzeComparative(allTexts);

        return {
            success: true,
            text: allTexts,
            fileSize: Buffer.byteLength(allTexts, 'utf8'),
            fileName: projectName,
            analysis: analysis,
            pragmaticAnalysis: pragmaticAnalysis,
            comparativeAnalysis: comparativeAnalysis
        };
    } catch (error) {
        console.error('Corpus analysis error:', error);
        return { success: false, error: error.message };
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

// ============ Corpus Project Handlers (v5.0) ============

ipcMain.handle('create-project', async (event, config) => {
    try {
        const saveResult = await dialog.showSaveDialog(mainWindow, {
            defaultPath: `${config.name || 'sabr-project'}.sabr`,
            filters: [{ name: 'Sabr Project', extensions: ['sabr'] }]
        });
        if (saveResult.canceled || !saveResult.filePath) return { success: false };
        config.savePath = saveResult.filePath;
        const project = corpusManager.createProject(config);
        return { success: true, project, path: saveResult.filePath };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('open-project', async () => {
    try {
        const result = await dialog.showOpenDialog(mainWindow, {
            properties: ['openFile'],
            filters: [{ name: 'Sabr Project', extensions: ['sabr'] }]
        });
        if (result.canceled || !result.filePaths.length) return { success: false };
        return corpusManager.loadProject(result.filePaths[0]);
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('select-corpus-files', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile', 'multiSelections'],
        filters: [
            { name: 'Documents', extensions: ['pdf', 'docx', 'txt', 'md'] },
            { name: 'PDF Files', extensions: ['pdf'] },
            { name: 'Word Documents', extensions: ['docx'] },
            { name: 'Text Files', extensions: ['txt', 'md'] }
        ]
    });
    if (!result.canceled && result.filePaths.length > 0) {
        return result.filePaths.map(fp => ({
            path: fp,
            name: path.basename(fp),
            size: fs.statSync(fp).size
        }));
    }
    return null;
});

ipcMain.handle('add-corpus-part', async (event, { filePath, partName }) => {
    try {
        const stats = fs.statSync(filePath);
        const part = corpusManager.addPart({
            name: partName || path.basename(filePath, path.extname(filePath)),
            filePath,
            fileSize: stats.size
        });
        return { success: true, part };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('process-corpus-part', async (event, partId) => {
    try {
        const part = corpusManager.project.parts.find(p => p.id === partId);
        if (!part) return { success: false, error: 'الجزء غير موجود' };

        const fileResult = await processFile(part.filePath, (progress) => {
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('file-progress', progress);
            }
        });
        const result = corpusManager.processPart(partId, fileResult.text);
        return result;
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('process-all-parts', async () => {
    try {
        const results = [];
        const pendingParts = corpusManager.project.parts.filter(p => p.status === 'pending');
        for (const part of pendingParts) {
            const fileResult = await processFile(part.filePath, (progress) => {
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('file-progress', { ...progress, partId: part.id, partName: part.name });
                }
            });
            const result = corpusManager.processPart(part.id, fileResult.text);
            results.push({ partId: part.id, ...result });
            // Send progress to renderer
            mainWindow.webContents.send('corpus-progress', {
                partId: part.id,
                partName: part.name,
                completed: results.length,
                total: pendingParts.length
            });
        }
        return { success: true, results, summary: corpusManager.getSummary() };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('remove-corpus-part', async (event, partId) => {
    const removed = corpusManager.removePart(partId);
    return { success: removed, summary: corpusManager.getSummary() };
});

ipcMain.handle('apply-criteria', async (event, criteria) => {
    try {
        const stats = corpusManager.applyCriteria(criteria);
        return { success: true, statistics: stats };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('get-project-summary', async () => {
    return corpusManager.getSummary();
});

ipcMain.handle('export-corpus', async (event, format) => {
    try {
        // JSON format for text browser - return data directly
        if (format === 'json') {
            const jsonData = corpusManager.exportCorpus('json');
            return { success: true, data: jsonData };
        }

        const data = corpusManager.exportCorpus('xlsx-data');
        const projectName = data.projectName || 'مشروع سَبْر';

        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'Sabr v5.0 — سَبْر';
        workbook.created = new Date();

        // ── Color palette matching reference ──
        const gold = 'FFD4A843';
        const teal = 'FF1E4D4A';
        const tealLight = 'FF4ECDC4';
        const cream = 'FFF5F0EA';
        const lightGray = 'FFF8F9FA';
        const white = 'FFFFFFFF';
        const darkText = 'FF2C3E50';

        // ── Helper: add title row spanning full width ──
        function addTitleRow(sheet, text, colSpan) {
            const titleRow = sheet.getRow(1);
            titleRow.getCell(1).value = text;
            if (colSpan > 1) sheet.mergeCells(1, 1, 1, colSpan);
            titleRow.height = 35;
            titleRow.getCell(1).font = { name: 'Cairo', size: 16, bold: true, color: { argb: teal } };
            titleRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: cream } };
            titleRow.getCell(1).alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
            // Blank separator row
            sheet.getRow(2).height = 8;
        }

        // ── Helper: style a header row ──
        function styleHeaderRow(sheet, row, bgColor) {
            row.height = 28;
            row.eachCell((cell) => {
                cell.font = { name: 'Cairo', size: 12, bold: true, color: { argb: 'FFFFFFFF' } };
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
                cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
                cell.border = {
                    top: { style: 'thin', color: { argb: 'FFE0E0E0' } },
                    bottom: { style: 'thin', color: { argb: 'FFE0E0E0' } },
                    left: { style: 'thin', color: { argb: 'FFE0E0E0' } },
                    right: { style: 'thin', color: { argb: 'FFE0E0E0' } }
                };
            });
        }

        // ── Helper: style a section header row ──
        function addSectionHeader(sheet, rowNum, text, colSpan, bgColor) {
            const row = sheet.getRow(rowNum);
            row.getCell(1).value = text;
            if (colSpan > 1) sheet.mergeCells(rowNum, 1, rowNum, colSpan);
            row.height = 28;
            row.getCell(1).font = { name: 'Cairo', size: 13, bold: true, color: { argb: 'FFFFFFFF' } };
            row.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor || teal } };
            row.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
        }

        // ── Helper: apply alternating row colors ──
        function applyAlternatingRows(sheet, startRow, endRow) {
            for (let i = startRow; i <= endRow; i++) {
                const row = sheet.getRow(i);
                const bgColor = (i - startRow) % 2 === 0 ? white : lightGray;
                row.eachCell((cell) => {
                    if (!cell.fill || !cell.fill.fgColor || cell.fill.fgColor.argb === 'FFFFFFFF' || !cell.fill.fgColor.argb) {
                        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
                    }
                    cell.alignment = { vertical: 'middle', wrapText: true };
                    cell.border = {
                        top: { style: 'thin', color: { argb: 'FFE0E0E0' } },
                        bottom: { style: 'thin', color: { argb: 'FFE0E0E0' } },
                        left: { style: 'thin', color: { argb: 'FFE0E0E0' } },
                        right: { style: 'thin', color: { argb: 'FFE0E0E0' } }
                    };
                    if (!cell.font || !cell.font.color) {
                        cell.font = { name: 'Cairo', size: 11, color: { argb: darkText } };
                    }
                });
            }
        }

        // ════════════════════════════════════════════════════
        // Sheet 1: المدونة الكاملة
        // ════════════════════════════════════════════════════
        const corpusSheet = workbook.addWorksheet('1- المدونة الكاملة', {
            views: [{ rightToLeft: true, state: 'frozen', ySplit: 3 }]
        });

        if (data.corpus && data.corpus.length > 0) {
            const sampleRow = data.corpus[0];
            const columnKeys = Object.keys(sampleRow);
            const numCols = columnKeys.length;
            const minWidths = { '#': 6, 'الجزء': 8, 'الجزء ': 18, 'النَّمط': 14, 'عدد الكلمات': 14, 'عنوان النص': 30, 'مَتن النص كاملاً': 50, 'ملف المصدر': 22, 'مُجتاز كاملاً': 14 };

            // Title row
            addTitleRow(corpusSheet, `مدونة "${projectName}" الكاملة`, numCols);

            // Header row at row 3
            corpusSheet.columns = columnKeys.map((key) => ({
                header: '',
                key: key,
                width: minWidths[key] || 16
            }));

            const headerRow = corpusSheet.getRow(3);
            columnKeys.forEach((key, idx) => {
                headerRow.getCell(idx + 1).value = key;
            });
            styleHeaderRow(corpusSheet, headerRow, gold);

            corpusSheet.autoFilter = {
                from: { row: 3, column: 1 },
                to: { row: 3, column: numCols }
            };

            // Data rows starting at row 4
            data.corpus.forEach((item) => {
                const row = corpusSheet.addRow(Object.values(item));
            });

            applyAlternatingRows(corpusSheet, 4, data.corpus.length + 3);
        }

        // ════════════════════════════════════════════════════
        // Sheet 2: الإحصائيات
        // ════════════════════════════════════════════════════
        const statsSheet = workbook.addWorksheet('2- الإحصائيات', {
            views: [{ rightToLeft: true }]
        });

        // Set column widths
        statsSheet.getColumn(1).width = 30;
        statsSheet.getColumn(2).width = 30;
        statsSheet.getColumn(3).width = 20;
        statsSheet.getColumn(4).width = 18;
        statsSheet.getColumn(5).width = 18;
        statsSheet.getColumn(6).width = 18;

        if (data.statistics) {
            const stats = data.statistics;
            // Title
            addTitleRow(statsSheet, stats.title, 6);

            let rowNum = 4; // after title + blank + 1 more blank

            for (const section of stats.sections) {
                // Section header
                addSectionHeader(statsSheet, rowNum, section.name, 6, teal);
                rowNum++;

                // Column headers for this section
                const hRow = statsSheet.getRow(rowNum);
                hRow.getCell(1).value = 'المؤشر';
                hRow.getCell(2).value = 'القيمة';
                hRow.getCell(3).value = 'النسبة';
                if (section.rows[0] && section.rows[0].words !== undefined) {
                    hRow.getCell(4).value = 'عدد الكلمات';
                }
                styleHeaderRow(statsSheet, hRow, gold);
                rowNum++;

                // Data rows
                const startDataRow = rowNum;
                for (const item of section.rows) {
                    const r = statsSheet.getRow(rowNum);
                    r.getCell(1).value = item.indicator;
                    r.getCell(2).value = item.value;
                    r.getCell(3).value = item.percentage || '';
                    if (item.words !== undefined) {
                        r.getCell(4).value = item.words;
                    }
                    r.height = 24;
                    rowNum++;
                }
                applyAlternatingRows(statsSheet, startDataRow, rowNum - 1);

                // Blank row between sections
                rowNum++;
            }
        }

        // ════════════════════════════════════════════════════
        // Sheet 3: دليل الإجراء
        // ════════════════════════════════════════════════════
        const procSheet = workbook.addWorksheet('3- دليل الإجراء', {
            views: [{ rightToLeft: true }]
        });

        procSheet.getColumn(1).width = 10;
        procSheet.getColumn(2).width = 35;
        procSheet.getColumn(3).width = 40;
        procSheet.getColumn(4).width = 35;

        if (data.procedureGuide) {
            const proc = data.procedureGuide;
            addTitleRow(procSheet, proc.title, 4);

            // Headers at row 3
            const hRow = procSheet.getRow(3);
            hRow.getCell(1).value = 'الخطوة';
            hRow.getCell(2).value = 'الإجراء';
            hRow.getCell(3).value = 'التطبيق الفني';
            hRow.getCell(4).value = 'المخرج';
            styleHeaderRow(procSheet, hRow, teal);

            // Steps
            let rowNum = 4;
            for (const step of proc.steps) {
                const r = procSheet.getRow(rowNum);
                r.getCell(1).value = step.step;
                r.getCell(2).value = step.procedure;
                r.getCell(3).value = step.application || '';
                r.getCell(4).value = step.output || '';
                r.height = 30;
                rowNum++;
            }
            applyAlternatingRows(procSheet, 4, rowNum - 1);
        }

        // ════════════════════════════════════════════════════
        // Sheet 4: المنهجية
        // ════════════════════════════════════════════════════
        const methSheet = workbook.addWorksheet('4- المنهجية', {
            views: [{ rightToLeft: true }]
        });

        methSheet.getColumn(1).width = 28;
        methSheet.getColumn(2).width = 70;

        if (data.methodology && data.methodology.length > 0) {
            // Title from first row
            const titleText = data.methodology[0].details || data.methodology[0].element || `المنهجية — ${projectName}`;
            addTitleRow(methSheet, titleText, 2);

            let rowNum = 3;
            // Skip first row (title) and write rest
            for (let i = 1; i < data.methodology.length; i++) {
                const item = data.methodology[i];
                const r = methSheet.getRow(rowNum);

                // Section headers (start with number)
                if (item.element && /^\d+\./.test(item.element)) {
                    r.getCell(1).value = item.element;
                    r.getCell(2).value = item.details || '';
                    r.getCell(1).font = { name: 'Cairo', size: 12, bold: true, color: { argb: teal } };
                    r.getCell(2).font = { name: 'Cairo', size: 11, color: { argb: darkText } };
                    r.height = 28;
                } else {
                    r.getCell(1).value = item.element || '';
                    r.getCell(2).value = item.details || '';
                    r.getCell(1).font = { name: 'Cairo', size: 11, color: { argb: darkText } };
                    r.getCell(2).font = { name: 'Cairo', size: 11, color: { argb: darkText } };
                }
                r.getCell(2).alignment = { vertical: 'middle', wrapText: true };
                rowNum++;
            }
        }

        // ════════════════════════════════════════════════════
        // Sheet 5: لوحة المعلومات
        // ════════════════════════════════════════════════════
        const dashSheet = workbook.addWorksheet('5- لوحة المعلومات', {
            views: [{ rightToLeft: true }]
        });

        // Wide enough for 8 columns
        for (let i = 1; i <= 8; i++) dashSheet.getColumn(i).width = 18;

        if (data.dashboard) {
            const d = data.dashboard;
            addTitleRow(dashSheet, d.title, 8);

            // Summary metrics row (like reference file)
            const metricsHeaderRow = dashSheet.getRow(3);
            const metricsValueRow = dashSheet.getRow(4);
            const summaryKeys = Object.keys(d.summary);
            summaryKeys.forEach((key, idx) => {
                metricsHeaderRow.getCell(idx + 1).value = key;
                metricsHeaderRow.getCell(idx + 1).font = { name: 'Cairo', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
                metricsHeaderRow.getCell(idx + 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: teal } };
                metricsHeaderRow.getCell(idx + 1).alignment = { horizontal: 'center', vertical: 'middle' };

                metricsValueRow.getCell(idx + 1).value = d.summary[key];
                metricsValueRow.getCell(idx + 1).font = { name: 'Cairo', size: 14, bold: true, color: { argb: gold } };
                metricsValueRow.getCell(idx + 1).alignment = { horizontal: 'center', vertical: 'middle' };
                metricsValueRow.getCell(idx + 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: cream } };
            });
            metricsHeaderRow.height = 28;
            metricsValueRow.height = 32;

            // Blank row
            let rowNum = 6;

            // Parts table
            if (d.partsTable && d.partsTable.length > 0) {
                addSectionHeader(dashSheet, rowNum, 'التوزيع حسب الجزء', 4, teal);
                rowNum++;
                const ptHeaders = Object.keys(d.partsTable[0]);
                const ptHRow = dashSheet.getRow(rowNum);
                ptHeaders.forEach((h, idx) => {
                    ptHRow.getCell(idx + 1).value = h;
                });
                styleHeaderRow(dashSheet, ptHRow, gold);
                rowNum++;
                const ptStart = rowNum;
                d.partsTable.forEach(pt => {
                    const r = dashSheet.getRow(rowNum);
                    Object.values(pt).forEach((v, idx) => {
                        r.getCell(idx + 1).value = v;
                    });
                    r.height = 24;
                    rowNum++;
                });
                applyAlternatingRows(dashSheet, ptStart, rowNum - 1);
                rowNum++;
            }

            // Types table
            if (d.typesTable && d.typesTable.length > 0) {
                addSectionHeader(dashSheet, rowNum, 'التوزيع حسب النمط الخطابي', 3, teal);
                rowNum++;
                const ttHeaders = Object.keys(d.typesTable[0]);
                const ttHRow = dashSheet.getRow(rowNum);
                ttHeaders.forEach((h, idx) => {
                    ttHRow.getCell(idx + 1).value = h;
                });
                styleHeaderRow(dashSheet, ttHRow, gold);
                rowNum++;
                const ttStart = rowNum;
                d.typesTable.forEach(tt => {
                    const r = dashSheet.getRow(rowNum);
                    Object.values(tt).forEach((v, idx) => {
                        r.getCell(idx + 1).value = v;
                    });
                    r.height = 24;
                    rowNum++;
                });
                applyAlternatingRows(dashSheet, ttStart, rowNum - 1);
            }
        }

        // ── Save file dialog ──
        const saveResult = await dialog.showSaveDialog(mainWindow, {
            title: 'تصدير المدونة — Export Corpus',
            defaultPath: path.join(app.getPath('documents'), 'sabr-corpus-export.xlsx'),
            filters: [{ name: 'Excel Workbook', extensions: ['xlsx'] }]
        });

        if (saveResult.canceled || !saveResult.filePath) {
            return { success: false, error: 'Export cancelled by user.' };
        }

        await workbook.xlsx.writeFile(saveResult.filePath);
        return { success: true, filePath: saveResult.filePath };

    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('save-project', async () => {
    try {
        corpusManager.saveProject();
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
});
