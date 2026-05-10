// Browser-compatible File Processing Module
import * as pdfjsLib from 'pdfjs-dist';
import mammoth from 'mammoth';

/**
 * Read a browser File object as an ArrayBuffer.
 * @param {File} file - Browser File object
 * @returns {Promise<ArrayBuffer>}
 */
async function readFileAsArrayBuffer(file) {
    // Prefer the modern file.arrayBuffer() API when available
    if (typeof file.arrayBuffer === 'function') {
        return await file.arrayBuffer();
    }

    // Fallback to FileReader for older browsers
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('فشل في قراءة الملف'));
        reader.readAsArrayBuffer(file);
    });
}

/**
 * Extract text from a PDF file using pdfjs-dist.
 * @param {ArrayBuffer} arrayBuffer
 * @returns {Promise<string>}
 */
async function processPDF(arrayBuffer) {
    try {
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        const textParts = [];

        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const content = await page.getTextContent();
            const pageText = content.items.map(item => item.str).join(' ');
            textParts.push(pageText);
        }

        return textParts.join('\n');
    } catch (error) {
        console.error('PDF processing error:', error);
        throw new Error('فشل في قراءة ملف PDF. تأكد من أن الملف غير محمي بكلمة سر.');
    }
}

/**
 * Extract text from a DOCX file using mammoth.
 * @param {ArrayBuffer} arrayBuffer
 * @returns {Promise<string>}
 */
async function processDOCX(arrayBuffer) {
    try {
        const result = await mammoth.extractRawText({ arrayBuffer });
        return result.value;
    } catch (error) {
        console.error('DOCX processing error:', error);
        throw new Error('فشل في قراءة ملف DOCX. تأكد من أن الملف بصيغة .docx وليس .doc');
    }
}

/**
 * Extract text from a TXT file with Arabic text support.
 * Tries UTF-8 first, then falls back to Windows-1256 (common Arabic encoding).
 * @param {ArrayBuffer} arrayBuffer
 * @returns {string}
 */
function processTXT(arrayBuffer) {
    try {
        // Try UTF-8 first (handles Arabic and most modern text files)
        const utf8Decoder = new TextDecoder('utf-8', { fatal: true });
        return utf8Decoder.decode(arrayBuffer);
    } catch {
        try {
            // Fallback to Windows-1256 for legacy Arabic text files
            const arabicDecoder = new TextDecoder('windows-1256');
            return arabicDecoder.decode(arrayBuffer);
        } catch (error) {
            console.error('TXT processing error:', error);
            throw new Error('فشل في قراءة ملف TXT');
        }
    }
}

/**
 * Get the file extension from a File object's name.
 * @param {File} file
 * @returns {string} lowercase extension including the dot (e.g. ".pdf")
 */
function getExtension(file) {
    const name = file.name || '';
    const dotIndex = name.lastIndexOf('.');
    if (dotIndex === -1) return '';
    return name.slice(dotIndex).toLowerCase();
}

/**
 * Process a browser File object and extract its text content.
 * Supports PDF, DOCX, and TXT files.
 *
 * @param {File} file - Browser File object
 * @returns {Promise<{ text: string, fileSize: number }>}
 */
export async function processFile(file) {
    if (!file || !(file instanceof File)) {
        throw new Error('مسار الملف غير صحيح');
    }

    const fileSize = file.size;
    const ext = getExtension(file);
    const arrayBuffer = await readFileAsArrayBuffer(file);

    let text;

    switch (ext) {
        case '.pdf':
            text = await processPDF(arrayBuffer);
            break;
        case '.docx':
            text = await processDOCX(arrayBuffer);
            break;
        case '.txt':
            text = processTXT(arrayBuffer);
            break;
        default:
            throw new Error('نوع الملف غير مدعوم. الصيغ المدعومة: PDF, DOCX, TXT');
    }

    return {
        text,
        fileSize
    };
}
