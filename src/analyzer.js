// Sabr Text Analyzer - سَبْر — محلل الخطاب التداولي
// Supports Arabic, English, and mixed texts

import { getDefaultStopwords, createStopwordSet } from './stopwords.js';

// Arabic normalization - ONLY safe normalizations
function normalizeArabic(text) {
    if (!/[\u0600-\u06FF]/.test(text)) return text;
    return text
        .replace(/[\u064B-\u065F\u0670]/g, '')  // Remove diacritics (tashkeel)
        .replace(/[إأآٱ]/g, 'ا');                // Normalize Alef variants only
    // NOTE: We do NOT normalize ة→ه or ى→ي as these change word meanings
}

// Detect language
function detectLanguage(text) {
    const arabicChars = (text.match(/[\u0600-\u06FF]/g) || []).length;
    const latinChars = (text.match(/[a-zA-Z]/g) || []).length;
    const total = arabicChars + latinChars;
    if (total === 0) return 'mixed';
    if (arabicChars / total > 0.5) return 'arabic';
    if (latinChars / total > 0.5) return 'english';
    return 'mixed';
}

// Tokenization - proper word extraction
function tokenize(text) {
    return text
        // Remove common punctuation (Arabic + English + symbols)
        .replace(/[.,،؛:!؟\-_()[\]{}"'«»;?…•·\/\\|@#$%^&*+=<>~`""''「」『』【】〈〉《》]/g, ' ')
        // Remove numbers (standalone)
        .replace(/\b\d+\b/g, ' ')
        // Split on whitespace
        .split(/\s+/)
        .filter(word => word.length > 1)  // Remove single characters
        .filter(word => !/^\d+$/.test(word));  // Remove pure numbers
}

// Analyze frequency with stopword filtering
function analyzeFrequency(text, customStopwords) {
    const language = detectLanguage(text);

    // Normalize based on language
    let normalized;
    if (language === 'arabic' || language === 'mixed') {
        normalized = normalizeArabic(text);
    } else {
        normalized = text.toLowerCase();
    }

    const words = tokenize(normalized);

    // Build stopword set
    let stopwords;
    if (customStopwords && customStopwords.length > 0) {
        stopwords = createStopwordSet(customStopwords);
    } else {
        const defaults = getDefaultStopwords(language);
        stopwords = createStopwordSet(defaults);
    }

    // Count frequencies, excluding stopwords
    const frequency = {};
    const totalBeforeFilter = words.length;
    let filteredCount = 0;

    words.forEach(word => {
        const normalizedWord = language === 'english' ? word.toLowerCase() : word;
        if (!stopwords.has(normalizedWord)) {
            frequency[normalizedWord] = (frequency[normalizedWord] || 0) + 1;
        } else {
            filteredCount++;
        }
    });

    // Sort by frequency
    const sorted = Object.entries(frequency)
        .sort((a, b) => b[1] - a[1])
        .map(([word, count]) => ({
            word,
            count,
            percentage: ((count / totalBeforeFilter) * 100).toFixed(2)
        }));

    return {
        frequencies: sorted,
        totalWords: totalBeforeFilter,
        filteredWords: filteredCount,
        contentWords: totalBeforeFilter - filteredCount
    };
}

// Context Analysis (KWIC - Key Word In Context)
function analyzeContext(text, targetWord, windowSize = 5) {
    const language = detectLanguage(text);
    const normalized = language === 'arabic' || language === 'mixed'
        ? normalizeArabic(text)
        : text.toLowerCase();
    const normalizedTarget = language === 'arabic' || language === 'mixed'
        ? normalizeArabic(targetWord)
        : targetWord.toLowerCase();

    // Split into sentences for better context
    const sentences = text.split(/[.!?؟。\n]+/).filter(s => s.trim().length > 0);
    const contexts = [];

    sentences.forEach(sentence => {
        const normalizedSentence = language === 'arabic' || language === 'mixed'
            ? normalizeArabic(sentence)
            : sentence.toLowerCase();

        if (normalizedSentence.includes(normalizedTarget)) {
            contexts.push(sentence.trim());
        }
    });

    // Also do word-level KWIC
    const words = tokenize(normalized);
    const kwicContexts = [];

    words.forEach((word, index) => {
        if (word === normalizedTarget) {
            const start = Math.max(0, index - windowSize);
            const end = Math.min(words.length, index + windowSize + 1);
            kwicContexts.push(words.slice(start, end).join(' '));
        }
    });

    return { sentences: contexts, kwic: kwicContexts };
}

// Statistical Analysis
function getStatistics(text, frequencyResult) {
    const words = tokenize(text);
    const uniqueWords = new Set(words);

    return {
        totalWords: frequencyResult.totalWords,
        contentWords: frequencyResult.contentWords,
        filteredWords: frequencyResult.filteredWords,
        uniqueWords: uniqueWords.size,
        uniqueContentWords: frequencyResult.frequencies.length,
        averageWordLength: words.length > 0
            ? (words.reduce((sum, word) => sum + word.length, 0) / words.length).toFixed(1)
            : 0,
        longestWord: words.reduce((longest, word) => word.length > longest.length ? word : longest, ''),
        language: detectLanguage(text)
    };
}

// Main Analysis Function
function analyzeText(text, customStopwords) {
    const frequencyResult = analyzeFrequency(text, customStopwords);
    const statistics = getStatistics(text, frequencyResult);

    return {
        statistics,
        allFrequencies: frequencyResult.frequencies, // ALL words, not just top 20
        topWords: frequencyResult.frequencies.slice(0, 50), // Top 50 for charts
    };
}

export {
    analyzeText,
    analyzeFrequency,
    analyzeContext,
    normalizeArabic,
    tokenize,
    detectLanguage,
    getStatistics
};
