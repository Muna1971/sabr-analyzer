// File Processing Module
const fs = require('fs');
const path = require('path');

// PDF processing with pdfjs-dist for better Arabic support
async function processPDF(filePath, progressCallback) {
    try {
        // Try pdfjs-dist first for text-based PDFs
        const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');

        const data = new Uint8Array(fs.readFileSync(filePath));
        const loadingTask = pdfjsLib.getDocument({ data });
        const pdf = await loadingTask.promise;

        let fullText = '';
        const totalPages = pdf.numPages;

        for (let i = 1; i <= totalPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();

            // Extract text items and handle Arabic RTL properly
            const items = textContent.items;
            let pageText = '';
            let lastY = null;

            for (const item of items) {
                // Add newline when Y position changes significantly
                if (lastY !== null && Math.abs(item.transform[5] - lastY) > 5) {
                    pageText += '\n';
                }
                pageText += item.str;
                lastY = item.transform[5];
            }

            fullText += pageText + '\n\n';

            if (progressCallback) {
                progressCallback({
                    stage: 'extracting',
                    current: i,
                    total: totalPages,
                    message: `استخراج النص: صفحة ${i} من ${totalPages}`
                });
            }
        }

        // Clean up the text
        fullText = fullText.replace(/\n{3,}/g, '\n\n').trim();

        // Check if we actually got meaningful text
        const meaningfulText = fullText.replace(/[\s\n\r\t]/g, '');

        if (meaningfulText.length < 50) {
            // Very little text extracted - likely a scanned PDF, try OCR
            console.log('Minimal text extracted, attempting OCR...');
            return await processPDFWithOCR(filePath, progressCallback);
        }

        return fullText;

    } catch (error) {
        console.error('PDF text extraction error:', error);
        // Fallback: try OCR
        try {
            return await processPDFWithOCR(filePath, progressCallback);
        } catch (ocrError) {
            console.error('OCR also failed:', ocrError);
            throw new Error('فشل في قراءة ملف PDF. تأكد من أن الملف غير محمي بكلمة سر.\nخطأ: ' + error.message);
        }
    }
}

// OCR processing for scanned PDFs
async function processPDFWithOCR(filePath, progressCallback) {
    try {
        const { createWorker } = require('tesseract.js');
        const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
        const { createCanvas } = require('canvas');

        if (progressCallback) {
            progressCallback({
                stage: 'ocr_init',
                message: 'تهيئة محرك التعرف الضوئي على النصوص (OCR)...'
            });
        }

        // Create Tesseract worker with Arabic + English
        const worker = await createWorker('ara+eng', 1, {
            logger: m => {
                if (progressCallback && m.status === 'recognizing text') {
                    progressCallback({
                        stage: 'ocr_recognizing',
                        progress: Math.round(m.progress * 100),
                        message: `التعرف على النص: ${Math.round(m.progress * 100)}%`
                    });
                }
            }
        });

        // Load PDF and render pages as images
        const data = new Uint8Array(fs.readFileSync(filePath));
        const loadingTask = pdfjsLib.getDocument({ data });
        const pdf = await loadingTask.promise;

        let fullText = '';
        const totalPages = pdf.numPages;

        for (let i = 1; i <= totalPages; i++) {
            if (progressCallback) {
                progressCallback({
                    stage: 'ocr_page',
                    current: i,
                    total: totalPages,
                    message: `معالجة OCR: صفحة ${i} من ${totalPages}`
                });
            }

            const page = await pdf.getPage(i);
            const viewport = page.getViewport({ scale: 2.0 }); // Higher scale for better OCR

            const canvas = createCanvas(viewport.width, viewport.height);
            const context = canvas.getContext('2d');

            await page.render({
                canvasContext: context,
                viewport: viewport
            }).promise;

            // Convert canvas to buffer
            const imageBuffer = canvas.toBuffer('image/png');

            // OCR the page
            const { data: { text } } = await worker.recognize(imageBuffer);
            fullText += text + '\n\n';
        }

        await worker.terminate();

        fullText = fullText.replace(/\n{3,}/g, '\n\n').trim();

        if (progressCallback) {
            progressCallback({
                stage: 'complete',
                message: 'اكتمل التعرف الضوئي على النصوص'
            });
        }

        return fullText;

    } catch (error) {
        console.error('OCR processing error:', error);
        throw new Error('فشل في التعرف الضوئي (OCR) على ملف PDF.\nتأكد من تثبيت المكتبات المطلوبة.\nخطأ: ' + error.message);
    }
}

async function processDOCX(filePath) {
    try {
        const mammoth = require('mammoth');
        const buffer = fs.readFileSync(filePath);
        const result = await mammoth.extractRawText({ buffer });
        return result.value;
    } catch (error) {
        console.error('DOCX processing error:', error);
        throw new Error('فشل في قراءة ملف DOCX. تأكد من أن الملف بصيغة .docx وليس .doc');
    }
}

function processTXT(filePath) {
    try {
        return fs.readFileSync(filePath, 'utf-8');
    } catch (error) {
        console.error('TXT processing error:', error);
        throw new Error('فشل في قراءة ملف TXT');
    }
}

// Main File Processor - returns text AND real file size
async function processFile(filePath, progressCallback) {
    if (!filePath || typeof filePath !== 'string') {
        throw new Error('مسار الملف غير صحيح');
    }

    if (!fs.existsSync(filePath)) {
        throw new Error('الملف غير موجود');
    }

    // Get real file size in bytes
    const stats = fs.statSync(filePath);
    const fileSize = stats.size;

    const ext = path.extname(filePath).toLowerCase();
    let text;

    switch (ext) {
        case '.pdf':
            text = await processPDF(filePath, progressCallback);
            break;
        case '.docx':
            text = await processDOCX(filePath);
            break;
        case '.txt':
            text = processTXT(filePath);
            break;
        default:
            throw new Error('نوع الملف غير مدعوم. الصيغ المدعومة: PDF, DOCX, TXT');
    }

    return {
        text,
        fileSize
    };
}

module.exports = { processFile };
