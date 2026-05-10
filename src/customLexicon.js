// Custom Lexicon & Collocation Analysis Module
// Allows researchers to create domain-specific vocabulary categories

import { normalizeArabic, detectLanguage, tokenize } from './analyzer.js';

/**
 * Analyze text against custom lexicon categories
 * @param {string} text - The full text to analyze
 * @param {Array} categories - Array of { name, words: string[] }
 * @returns {Object} Analysis results per category
 */
function analyzeCustomLexicon(text, categories) {
    const language = detectLanguage(text);
    const normalized = language === 'arabic' || language === 'mixed'
        ? normalizeArabic(text)
        : text.toLowerCase();

    const allWords = tokenize(normalized);
    const totalWords = allWords.length;

    const results = categories.map(category => {
        const categoryWords = category.words.map(w => {
            const normalizedWord = language === 'arabic' || language === 'mixed'
                ? normalizeArabic(w.trim())
                : w.trim().toLowerCase();
            return normalizedWord;
        }).filter(w => w.length > 0);

        let categoryTotal = 0;
        const wordResults = [];

        categoryWords.forEach(word => {
            // Count occurrences
            let count = 0;
            const contexts = [];

            // Word-level matching
            allWords.forEach((w, idx) => {
                if (w === word) {
                    count++;
                    // Extract context (5 words before and after)
                    const start = Math.max(0, idx - 5);
                    const end = Math.min(allWords.length, idx + 6);
                    const ctx = allWords.slice(start, end);
                    ctx[idx - start] = `[${ctx[idx - start]}]`;
                    if (contexts.length < 10) {
                        contexts.push(ctx.join(' '));
                    }
                }
            });

            // Also check for phrase-level matching in original text
            if (word.includes(' ')) {
                const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const regex = new RegExp(escaped, 'gi');
                let match;
                let phraseCount = 0;
                while ((match = regex.exec(normalized)) !== null) {
                    phraseCount++;
                    if (contexts.length < 10) {
                        const before = normalized.substring(Math.max(0, match.index - 50), match.index).trim();
                        const after = normalized.substring(match.index + word.length, Math.min(normalized.length, match.index + word.length + 50)).trim();
                        contexts.push(`${before} [${word}] ${after}`);
                    }
                }
                if (phraseCount > count) count = phraseCount;
            }

            if (count > 0) {
                wordResults.push({
                    word: word,
                    originalWord: category.words[categoryWords.indexOf(word)] || word,
                    count,
                    percentage: totalWords > 0 ? ((count / totalWords) * 100).toFixed(3) : '0',
                    contexts
                });
            }

            categoryTotal += count;
        });

        // Sort by count
        wordResults.sort((a, b) => b.count - a.count);

        return {
            name: category.name,
            totalCount: categoryTotal,
            percentage: totalWords > 0 ? ((categoryTotal / totalWords) * 100).toFixed(2) : '0',
            words: wordResults,
            wordCount: categoryWords.length,
            foundCount: wordResults.length
        };
    });

    return {
        totalWords,
        categories: results,
        summary: results.map(r => ({
            name: r.name,
            total: r.totalCount,
            percentage: r.percentage
        }))
    };
}

/**
 * Collocation Analysis - find words that frequently appear near a target word
 * @param {string} text - The full text
 * @param {string} targetWord - The word to analyze collocations for
 * @param {number} windowSize - Number of words before/after to check (default 5)
 * @returns {Object} Collocation results
 */
function analyzeCollocation(text, targetWord, windowSize = 5) {
    const language = detectLanguage(text);
    const normalized = language === 'arabic' || language === 'mixed'
        ? normalizeArabic(text)
        : text.toLowerCase();
    const normalizedTarget = language === 'arabic' || language === 'mixed'
        ? normalizeArabic(targetWord)
        : targetWord.toLowerCase();

    const words = tokenize(normalized);
    const totalOccurrences = words.filter(w => w === normalizedTarget).length;

    if (totalOccurrences === 0) {
        return {
            targetWord,
            totalOccurrences: 0,
            collocations: [],
            windowSize
        };
    }

    // Count co-occurrences within window
    const coOccurrences = {};

    words.forEach((word, index) => {
        if (word === normalizedTarget) {
            const start = Math.max(0, index - windowSize);
            const end = Math.min(words.length, index + windowSize + 1);

            for (let i = start; i < end; i++) {
                if (i !== index) {
                    const neighbor = words[i];
                    if (neighbor !== normalizedTarget && neighbor.length > 1) {
                        coOccurrences[neighbor] = (coOccurrences[neighbor] || 0) + 1;
                    }
                }
            }
        }
    });

    // Calculate frequency of each word in the whole text
    const wordFreq = {};
    words.forEach(w => {
        wordFreq[w] = (wordFreq[w] || 0) + 1;
    });

    // Calculate MI (Mutual Information) score for statistical strength
    const N = words.length;
    const collocations = Object.entries(coOccurrences)
        .map(([word, coCount]) => {
            const freqWord = wordFreq[word] || 0;
            const freqTarget = totalOccurrences;

            // MI Score: log2(N * coCount / (freqWord * freqTarget))
            const mi = Math.log2((N * coCount) / (freqWord * freqTarget));

            return {
                word,
                coOccurrences: coCount,
                frequency: freqWord,
                miScore: mi.toFixed(2),
                percentage: ((coCount / totalOccurrences) * 100).toFixed(1)
            };
        })
        .filter(item => item.coOccurrences >= 2) // Minimum 2 co-occurrences
        .sort((a, b) => b.coOccurrences - a.coOccurrences);

    return {
        targetWord,
        totalOccurrences,
        collocations: collocations.slice(0, 50), // Top 50
        windowSize
    };
}

export {
    analyzeCustomLexicon,
    analyzeCollocation
};
