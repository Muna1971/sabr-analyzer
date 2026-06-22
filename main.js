const { app, BrowserWindow, ipcMain, dialog } = require('electron');
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

        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'Sabr v5.0 — سَبْر';
        workbook.created = new Date();

        // ── Color palette ──
        const gold = 'FFD4A843';
        const teal = 'FF4ECDC4';
        const lightGray = 'FFF8F9FA';
        const white = 'FFFFFFFF';
        const darkText = 'FF2C3E50';

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

        // ── Helper: apply alternating row colors ──
        function applyAlternatingRows(sheet, startRow, endRow) {
            for (let i = startRow; i <= endRow; i++) {
                const row = sheet.getRow(i);
                const bgColor = (i - startRow) % 2 === 0 ? white : lightGray;
                row.eachCell((cell) => {
                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
                    cell.alignment = { vertical: 'middle', wrapText: true };
                    cell.border = {
                        top: { style: 'thin', color: { argb: 'FFE0E0E0' } },
                        bottom: { style: 'thin', color: { argb: 'FFE0E0E0' } },
                        left: { style: 'thin', color: { argb: 'FFE0E0E0' } },
                        right: { style: 'thin', color: { argb: 'FFE0E0E0' } }
                    };
                    cell.font = { name: 'Cairo', size: 11, color: { argb: darkText } };
                });
            }
        }

        // ════════════════════════════════════════════
        // Sheet 1: المدونة (Corpus)
        // ════════════════════════════════════════════
        const corpusSheet = workbook.addWorksheet('المدونة', {
            views: [{ rightToLeft: true, state: 'frozen', ySplit: 1 }]
        });

        if (data.corpus && data.corpus.length > 0) {
            const sampleRow = data.corpus[0];
            const columnKeys = Object.keys(sampleRow);
            const minWidths = { '#': 6, 'الجزء': 8, 'اسم الجزء': 20, 'النمط': 14, 'عدد الكلمات': 14, 'عنوان النص': 25, 'المتن': 50 };

            corpusSheet.columns = columnKeys.map((key) => ({
                header: key,
                key: key,
                width: minWidths[key] || 18
            }));

            data.corpus.forEach((item) => {
                corpusSheet.addRow(item);
            });

            styleHeaderRow(corpusSheet, corpusSheet.getRow(1), gold);
            corpusSheet.autoFilter = {
                from: { row: 1, column: 1 },
                to: { row: 1, column: columnKeys.length }
            };
            applyAlternatingRows(corpusSheet, 2, data.corpus.length + 1);

            // Auto-fit: widen columns if header or content is wider than minimum
            columnKeys.forEach((key, idx) => {
                const col = corpusSheet.getColumn(idx + 1);
                let maxLen = key.length;
                data.corpus.forEach((row) => {
                    const val = row[key];
                    if (val != null) {
                        const len = String(val).length;
                        if (len > maxLen) maxLen = len;
                    }
                });
                const desiredWidth = Math.min(Math.max(maxLen + 2, minWidths[key] || 10), 60);
                if (desiredWidth > col.width) {
                    col.width = desiredWidth;
                }
            });
        }

        // ════════════════════════════════════════════
        // Sheet 2: الإحصائيات (Statistics)
        // ════════════════════════════════════════════
        const statsSheet = workbook.addWorksheet('الإحصائيات', {
            views: [{ rightToLeft: true }]
        });

        statsSheet.columns = [
            { header: 'القسم', key: 'section', width: 25 },
            { header: 'المؤشر', key: 'indicator', width: 30 },
            { header: 'القيمة', key: 'value', width: 18 },
            { header: 'النسبة', key: 'percentage', width: 15 }
        ];

        styleHeaderRow(statsSheet, statsSheet.getRow(1), teal);

        if (data.statistics && data.statistics.length > 0) {
            let currentSection = null;
            let rowNum = 2;

            data.statistics.forEach((stat) => {
                if (stat.section && stat.section !== currentSection) {
                    currentSection = stat.section;
                    const sectionRow = statsSheet.getRow(rowNum);
                    sectionRow.getCell(1).value = currentSection;
                    statsSheet.mergeCells(rowNum, 1, rowNum, 4);
                    sectionRow.getCell(1).font = { name: 'Cairo', size: 12, bold: true, color: { argb: 'FFFFFFFF' } };
                    sectionRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: teal } };
                    sectionRow.getCell(1).alignment = { vertical: 'middle', horizontal: 'center' };
                    sectionRow.height = 26;
                    rowNum++;
                }

                const dataRow = statsSheet.getRow(rowNum);
                dataRow.getCell(1).value = stat.section || '';
                dataRow.getCell(2).value = stat.indicator || '';
                dataRow.getCell(3).value = stat.value != null ? stat.value : '';
                dataRow.getCell(4).value = stat.percentage || '';
                rowNum++;
            });

            applyAlternatingRows(statsSheet, 2, rowNum - 1);
        }

        // ════════════════════════════════════════════
        // Sheet 3: لوحة القياس (Dashboard)
        // ════════════════════════════════════════════
        const dashSheet = workbook.addWorksheet('لوحة القياس', {
            views: [{ rightToLeft: true }]
        });

        dashSheet.columns = [
            { header: 'المؤشر', key: 'label', width: 30 },
            { header: 'القيمة', key: 'value', width: 25 }
        ];

        styleHeaderRow(dashSheet, dashSheet.getRow(1), gold);

        if (data.dashboard) {
            const d = data.dashboard;
            const metrics = [
                { label: 'إجمالي النصوص', value: d.totalTexts },
                { label: 'النصوص المجتازة', value: d.passedTexts },
                { label: 'نسبة الاجتياز', value: d.passRate },
                { label: 'إجمالي الكلمات', value: d.totalWords },
                { label: 'متوسط الكلمات لكل نص', value: d.avgWordsPerText },
                { label: 'أنماط الخطاب', value: d.discourseTypes },
                { label: 'عدد الأجزاء', value: d.partsCount },
                { label: 'عدد المعايير', value: d.criteriaCount }
            ];

            metrics.forEach((m, idx) => {
                const row = dashSheet.getRow(idx + 2);
                row.getCell(1).value = m.label;
                row.getCell(2).value = m.value != null ? m.value : '—';
                row.height = 30;
                row.getCell(1).font = { name: 'Cairo', size: 13, bold: true, color: { argb: darkText } };
                row.getCell(2).font = { name: 'Cairo', size: 14, bold: true, color: { argb: 'FF' + 'D4A843' } };
                row.getCell(1).alignment = { vertical: 'middle' };
                row.getCell(2).alignment = { vertical: 'middle', horizontal: 'center' };
                const bgColor = idx % 2 === 0 ? white : lightGray;
                row.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
                row.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
            });
        }

        // ════════════════════════════════════════════
        // Sheet 4: دليل الإجراء (Procedure Guide)
        // ════════════════════════════════════════════
        const procSheet = workbook.addWorksheet('دليل الإجراء', {
            views: [{ rightToLeft: true }]
        });

        procSheet.columns = [
            { header: 'الخطوة', key: 'step', width: 10 },
            { header: 'المعيار', key: 'criterion', width: 25 },
            { header: 'النظرية', key: 'theory', width: 30 },
            { header: 'الإجراء', key: 'procedure', width: 35 },
            { header: 'المخرج', key: 'output', width: 30 }
        ];

        styleHeaderRow(procSheet, procSheet.getRow(1), teal);

        if (data.procedureGuide && data.procedureGuide.length > 0) {
            data.procedureGuide.forEach((step, idx) => {
                const row = procSheet.addRow({
                    step: step.step || (idx + 1),
                    criterion: step.criterion || '',
                    theory: step.theory || '',
                    procedure: step.procedure || '',
                    output: step.output || ''
                });
                row.height = 24;
            });
            applyAlternatingRows(procSheet, 2, data.procedureGuide.length + 1);
        }

        // ════════════════════════════════════════════
        // Sheet 5: المنهجية (Methodology)
        // ════════════════════════════════════════════
        const methSheet = workbook.addWorksheet('المنهجية', {
            views: [{ rightToLeft: true }]
        });

        methSheet.columns = [
            { header: 'العنصر', key: 'element', width: 25 },
            { header: 'التفاصيل', key: 'details', width: 60 }
        ];

        styleHeaderRow(methSheet, methSheet.getRow(1), gold);

        if (data.methodology) {
            const m = data.methodology;
            let rowNum = 2;

            if (m.source) {
                const row = methSheet.getRow(rowNum++);
                row.getCell(1).value = 'المصدر';
                row.getCell(2).value = m.source;
                row.getCell(1).font = { name: 'Cairo', size: 11, bold: true, color: { argb: darkText } };
                row.getCell(2).font = { name: 'Cairo', size: 11, color: { argb: darkText } };
            }

            if (m.criteria && m.criteria.length > 0) {
                // Section header for criteria
                const secRow = methSheet.getRow(rowNum++);
                secRow.getCell(1).value = 'المعايير المطبّقة';
                methSheet.mergeCells(rowNum - 1, 1, rowNum - 1, 2);
                secRow.getCell(1).font = { name: 'Cairo', size: 12, bold: true, color: { argb: 'FFFFFFFF' } };
                secRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: teal } };
                secRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
                secRow.height = 26;

                m.criteria.forEach((c) => {
                    const row = methSheet.getRow(rowNum++);
                    if (typeof c === 'string') {
                        row.getCell(1).value = c;
                    } else {
                        row.getCell(1).value = c.name || c.criterion || '';
                        row.getCell(2).value = c.description || c.details || '';
                    }
                    row.getCell(1).font = { name: 'Cairo', size: 11, color: { argb: darkText } };
                    row.getCell(2).font = { name: 'Cairo', size: 11, color: { argb: darkText } };
                });
            }

            if (m.references && m.references.length > 0) {
                // Section header for references
                const refSecRow = methSheet.getRow(rowNum++);
                refSecRow.getCell(1).value = 'المراجع';
                methSheet.mergeCells(rowNum - 1, 1, rowNum - 1, 2);
                refSecRow.getCell(1).font = { name: 'Cairo', size: 12, bold: true, color: { argb: 'FFFFFFFF' } };
                refSecRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: teal } };
                refSecRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
                refSecRow.height = 26;

                m.references.forEach((ref) => {
                    const row = methSheet.getRow(rowNum++);
                    row.getCell(1).value = typeof ref === 'string' ? ref : (ref.title || ref.name || '');
                    row.getCell(2).value = typeof ref === 'string' ? '' : (ref.details || ref.url || '');
                    row.getCell(1).font = { name: 'Cairo', size: 11, color: { argb: darkText } };
                    row.getCell(2).font = { name: 'Cairo', size: 11, color: { argb: darkText } };
                });
            }

            applyAlternatingRows(methSheet, 2, rowNum - 1);
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
