// File Processing Module
const fs = require('fs');
const path = require('path');

async function processPDF(filePath) {
    try {
        const pdfParse = require('pdf-parse');
        const dataBuffer = fs.readFileSync(filePath);
        const data = await pdfParse(dataBuffer);
        return data.text;
    } catch (error) {
        console.error('PDF processing error:', error);
        throw new Error('فشل في قراءة ملف PDF. تأكد من أن الملف غير محمي بكلمة سر.');
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
async function processFile(filePath) {
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
            text = await processPDF(filePath);
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
