/**
 * comparativeAnalyzer.js
 * Pragmatic Comparative Analysis Module for Arabic/English Discourse
 * Analyzes text across 17 dimensions, comparing opposing pragmatic categories.
 *
 * NOTE: Dimension 7 (nominal_verbal) is intentionally skipped because
 * distinguishing nominal vs verbal sentences in Arabic requires deep
 * syntactic parsing that cannot be reliably done with regex alone.
 */

'use strict';

// ---------------------------------------------------------------------------
// Arabic-safe word-boundary helpers (JS \b does not work with Arabic script)
// ---------------------------------------------------------------------------
const AR_BOUND_B = '(?:^|[\\s\\u060C\\u061B\\u061F\\u0021-\\u002F\\u003A-\\u0040\\u005B-\\u0060\\u007B-\\u007E\u00AB\u00BB\u201C\u201D.,!?\u061F\u060C\u061B:()\\[\\]{}])';
const AR_BOUND_A = '(?=$|[\\s\\u060C\\u061B\\u061F\\u0021-\\u002F\\u003A-\\u0040\\u005B-\\u0060\\u007B-\\u007E\u00AB\u00BB\u201C\u201D.,!?\u061F\u060C\u061B:()\\[\\]{}])';

// Diacritics removal regex
const DIACRITICS = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06DC\u06DF-\u06E4\u06E7\u06E8\u06EA-\u06ED]/g;

// ---------------------------------------------------------------------------
// Language detection
// ---------------------------------------------------------------------------
function detectLanguage(text) {
    const ar = (text.match(/[\u0600-\u06FF]/g) || []).length;
    const la = (text.match(/[A-Za-z]/g) || []).length;
    return ar >= la ? 'ar' : 'en';
}

// ---------------------------------------------------------------------------
// Counting helpers
// ---------------------------------------------------------------------------

/**
 * Strip Arabic diacritics from text for reliable matching.
 */
function stripDiacritics(text) {
    return text.replace(DIACRITICS, '');
}

/**
 * Count occurrences of an Arabic phrase/word in text using safe boundaries.
 * For multi-word phrases (like "تمّ تحقيق") we match the whole phrase.
 */
function countArabic(cleanText, word) {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(AR_BOUND_B + escaped + AR_BOUND_A, 'g');
    const matches = cleanText.match(re);
    return matches ? matches.length : 0;
}

/**
 * Count occurrences of an English phrase/word using standard \b boundaries.
 */
function countEnglish(text, word) {
    // For multi-word phrases use lookaround-free approach
    if (/\s/.test(word)) {
        const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const re = new RegExp('\\b' + escaped + '\\b', 'gi');
        const matches = text.match(re);
        return matches ? matches.length : 0;
    }
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp('\\b' + escaped + '\\b', 'gi');
    const matches = text.match(re);
    return matches ? matches.length : 0;
}

/**
 * Count all words in a side's word list and return { total, items }.
 * Deduplicates words that become identical after diacritics removal to prevent double-counting.
 */
function countSide(text, words, lang) {
    const counter = lang === 'ar' ? countArabic : countEnglish;
    const processedText = lang === 'ar' ? stripDiacritics(text) : text.toLowerCase();
    const items = [];
    let total = 0;

    // Deduplicate: after stripping diacritics, some words become identical (e.g. إنني = إنّني)
    const seen = new Set();

    for (const w of words) {
        const processedWord = lang === 'ar' ? stripDiacritics(w) : w.toLowerCase();

        // Skip if we already counted this normalized form
        if (seen.has(processedWord)) continue;
        seen.add(processedWord);

        const c = counter(processedText, processedWord);
        if (c > 0) {
            items.push({ word: w, count: c });
            total += c;
        }
    }
    items.sort((a, b) => b.count - a.count);
    return { total, items };
}

// ---------------------------------------------------------------------------
// Ratio & interpretation helpers
// ---------------------------------------------------------------------------
function computeRatio(a, b) {
    if (a === 0 && b === 0) return '0:0';
    if (a === 0) return '0:1';
    if (b === 0) return '1:0';
    if (a >= b) {
        return '1:' + (b / a).toFixed(1).replace(/\.0$/, '');
    }
    return (a / b).toFixed(1).replace(/\.0$/, '') + ':1';
}

function generateInterpretation(sideACount, sideBCount, labelA_ar, labelB_ar, labelA_en, labelB_en) {
    const ar = interpretAr(sideACount, sideBCount, labelA_ar, labelB_ar);
    const en = interpretEn(sideACount, sideBCount, labelA_en, labelB_en);
    return { ar, en };
}

function interpretAr(a, b, labelA, labelB) {
    if (a === 0 && b === 0) return '\u0644\u0627 \u062A\u0648\u062C\u062F \u0645\u0624\u0634\u0631\u0627\u062A \u0643\u0627\u0641\u064A\u0629 \u0644\u0647\u0630\u0627 \u0627\u0644\u0628\u0639\u062F';
    const ratio = a / (b || 1);
    if (ratio > 2) return '\u0627\u0644\u062E\u0637\u0627\u0628 \u064A\u0645\u064A\u0644 \u0628\u0648\u0636\u0648\u062D \u0625\u0644\u0649 ' + labelA;
    if (ratio >= 0.8 && ratio <= 1.25) return '\u0627\u0644\u062E\u0637\u0627\u0628 \u0645\u062A\u0648\u0627\u0632\u0646 \u0628\u064A\u0646 ' + labelA + ' \u0648' + labelB;
    if (ratio >= 0.5) return '\u0627\u0644\u062E\u0637\u0627\u0628 \u064A\u0645\u064A\u0644 \u0642\u0644\u064A\u0644\u0627\u064B \u0625\u0644\u0649 ' + labelB;
    return '\u0627\u0644\u062E\u0637\u0627\u0628 \u064A\u0645\u064A\u0644 \u0628\u0648\u0636\u0648\u062D \u0625\u0644\u0649 ' + labelB;
}

function interpretEn(a, b, labelA, labelB) {
    if (a === 0 && b === 0) return 'Insufficient indicators for this dimension';
    const ratio = a / (b || 1);
    if (ratio > 2) return 'Discourse clearly leans toward ' + labelA;
    if (ratio >= 0.8 && ratio <= 1.25) return 'Discourse is balanced between ' + labelA + ' and ' + labelB;
    if (ratio >= 0.5) return 'Discourse slightly leans toward ' + labelB;
    return 'Discourse clearly leans toward ' + labelB;
}

// ---------------------------------------------------------------------------
// Dimension definitions
// ---------------------------------------------------------------------------

function getDimensions(lang) {
    if (lang === 'ar') return getArabicDimensions();
    return getEnglishDimensions();
}

function getArabicDimensions() {
    return [
        // ── GROUP 1: هوية المتكلم والمخاطب (identity) ──
        {
            id: 'pronouns_i_we',
            nameAr: '\u0623\u0646\u0627 \u0645\u0642\u0627\u0628\u0644 \u0646\u062D\u0646',
            nameEn: 'I vs We',
            group: 'identity',
            groupNameAr: '\u0647\u0648\u064A\u0629 \u0627\u0644\u0645\u062A\u0643\u0644\u0645',
            groupNameEn: 'Speaker Identity',
            sideA: {
                label: '\u0623\u0646\u0627',
                labelEn: 'I (singular)',
                // Removed: بي (\u0628\u064A) matches preposition بـ; فيّ (\u0641\u064A\u0651) matches preposition في after diacritics removal
                words: ['\u0623\u0646\u0627', '\u0625\u0646\u0646\u064A', '\u0625\u0646\u0651\u0646\u064A', '\u0644\u064A', '\u0639\u0646\u062F\u064A', '\u0645\u0639\u064A', '\u0646\u0641\u0633\u064A', '\u0631\u0623\u064A\u064A', '\u0623\u0631\u0649', '\u0623\u0639\u062A\u0642\u062F', '\u0623\u0624\u0645\u0646', '\u0623\u0642\u0648\u0644']
            },
            sideB: {
                label: '\u0646\u062D\u0646',
                labelEn: 'We (plural)',
                words: ['\u0646\u062D\u0646', '\u0625\u0646\u0646\u0627', '\u0625\u0646\u0651\u0646\u0627', '\u0644\u0646\u0627', '\u0639\u0646\u062F\u0646\u0627', '\u0628\u0646\u0627', '\u0645\u0639\u0646\u0627', '\u0641\u064A\u0646\u0627', '\u0623\u0646\u0641\u0633\u0646\u0627', '\u0646\u0631\u0649', '\u0646\u0639\u062A\u0642\u062F', '\u0646\u0624\u0645\u0646', '\u0646\u0642\u0648\u0644', '\u0639\u0644\u064A\u0646\u0627', '\u0644\u062F\u064A\u0646\u0627', '\u0628\u0644\u0627\u062F\u0646\u0627', '\u0648\u0637\u0646\u0646\u0627', '\u0634\u0639\u0628\u0646\u0627', '\u062F\u0648\u0644\u062A\u0646\u0627', '\u0623\u0645\u062A\u0646\u0627']
            }
        },
        {
            id: 'pronouns_you',
            nameAr: '\u0623\u0646\u062A\u064E \u0645\u0642\u0627\u0628\u0644 \u0623\u0646\u062A\u0645',
            nameEn: 'You (singular) vs You (plural)',
            group: 'identity',
            groupNameAr: '\u0647\u0648\u064A\u0629 \u0627\u0644\u0645\u062A\u0643\u0644\u0645',
            groupNameEn: 'Speaker Identity',
            sideA: {
                label: '\u0645\u0641\u0631\u062F',
                labelEn: 'Singular you',
                words: ['\u0623\u0646\u062A\u064E', '\u0623\u0646\u062A\u0650', '\u0644\u0643\u064E', '\u0644\u0643\u0650', '\u0639\u0646\u062F\u0643\u064E', '\u0628\u0643\u064E', '\u0625\u0646\u0643\u064E']
            },
            sideB: {
                label: '\u062C\u0645\u0639',
                labelEn: 'Plural you',
                words: ['\u0623\u0646\u062A\u0645', '\u0644\u0643\u0645', '\u0639\u0646\u062F\u0643\u0645', '\u0628\u0643\u0645', '\u0625\u0646\u0643\u0645', '\u0639\u0644\u064A\u0643\u0645', '\u0623\u064A\u0647\u0627']
            }
        },
        {
            id: 'we_vs_they',
            nameAr: '\u0646\u062D\u0646 \u0645\u0642\u0627\u0628\u0644 \u0647\u0645 (\u0627\u0644\u0645\u0631\u0628\u0639 \u0627\u0644\u0623\u064A\u062F\u064A\u0648\u0644\u0648\u062C\u064A)',
            nameEn: 'We vs They (Ideological Square)',
            group: 'identity',
            groupNameAr: '\u0647\u0648\u064A\u0629 \u0627\u0644\u0645\u062A\u0643\u0644\u0645',
            groupNameEn: 'Speaker Identity',
            sideA: {
                label: '\u0646\u062D\u0646',
                labelEn: 'We (in-group)',
                words: ['\u0646\u062D\u0646', '\u0644\u0646\u0627', '\u0639\u0646\u062F\u0646\u0627', '\u0628\u0646\u0627', '\u0648\u0637\u0646\u0646\u0627', '\u0634\u0639\u0628\u0646\u0627', '\u062F\u0648\u0644\u062A\u0646\u0627', '\u0628\u0644\u0627\u062F\u0646\u0627', '\u0623\u0645\u062A\u0646\u0627']
            },
            sideB: {
                label: '\u0647\u0645',
                labelEn: 'They (out-group)',
                words: ['\u0647\u0645', '\u0644\u0647\u0645', '\u0639\u0646\u062F\u0647\u0645', '\u0628\u0647\u0645', '\u0625\u0646\u0647\u0645', '\u0639\u0644\u064A\u0647\u0645', '\u0623\u0648\u0644\u0626\u0643', '\u0627\u0644\u0622\u062E\u0631\u0648\u0646', '\u0627\u0644\u0622\u062E\u0631', '\u063A\u064A\u0631\u0646\u0627']
            }
        },
        {
            id: 'inclusive_exclusive',
            nameAr: '\u0627\u0644\u0634\u0645\u0648\u0644 \u0645\u0642\u0627\u0628\u0644 \u0627\u0644\u0625\u0642\u0635\u0627\u0621',
            nameEn: 'Inclusion vs Exclusion',
            group: 'identity',
            groupNameAr: '\u0647\u0648\u064A\u0629 \u0627\u0644\u0645\u062A\u0643\u0644\u0645',
            groupNameEn: 'Speaker Identity',
            sideA: {
                label: '\u0634\u0645\u0648\u0644',
                labelEn: 'Inclusion',
                words: ['\u0643\u0644\u0646\u0627', '\u062C\u0645\u064A\u0639\u0646\u0627', '\u062C\u0645\u064A\u0639\u0627\u064B', '\u0627\u0644\u062C\u0645\u064A\u0639', '\u0645\u0639\u0627\u064B', '\u0633\u0648\u064A\u0627\u064B', '\u0643\u0644 \u0645\u0648\u0627\u0637\u0646', '\u0643\u0644 \u0641\u0631\u062F', '\u0628\u0644\u0627 \u0627\u0633\u062A\u062B\u0646\u0627\u0621', '\u064A\u062F\u0627\u064B \u0628\u064A\u062F', '\u0627\u0644\u0625\u0646\u0633\u0627\u0646', '\u0627\u0644\u0625\u0646\u0633\u0627\u0646\u064A\u0629', '\u0627\u0644\u0628\u0634\u0631\u064A\u0629', '\u0643\u0644 \u0625\u0646\u0633\u0627\u0646', '\u0628\u0623\u0633\u0631\u0647', '\u0639\u0627\u0645\u0629']
            },
            sideB: {
                label: '\u0625\u0642\u0635\u0627\u0621',
                labelEn: 'Exclusion',
                words: ['\u0641\u0642\u0637', '\u062D\u0635\u0631\u0627\u064B', '\u062F\u0648\u0646 \u063A\u064A\u0631\u0647\u0645', '\u0625\u0644\u0627', '\u0645\u0627 \u0639\u062F\u0627', '\u0628\u0627\u0633\u062A\u062B\u0646\u0627\u0621', '\u062E\u0627\u0635\u0629', '\u0628\u0639\u0636 \u0627\u0644\u0646\u0627\u0633', '\u0641\u0626\u0629', '\u0637\u0627\u0626\u0641\u0629']
            }
        },

        // ── GROUP 2: الزمن والفعل (temporal) ──
        {
            id: 'tense_past_future',
            nameAr: '\u0627\u0644\u0645\u0627\u0636\u064A \u0645\u0642\u0627\u0628\u0644 \u0627\u0644\u0645\u0633\u062A\u0642\u0628\u0644',
            nameEn: 'Past vs Future',
            group: 'temporal',
            groupNameAr: '\u0627\u0644\u0632\u0645\u0646 \u0648\u0627\u0644\u0641\u0639\u0644',
            groupNameEn: 'Tense & Action',
            sideA: {
                label: '\u0645\u0627\u0636\u064A',
                labelEn: 'Past tense',
                words: ['\u062D\u0642\u0642\u0646\u0627', '\u0623\u0646\u062C\u0632\u0646\u0627', '\u0628\u0646\u064A\u0646\u0627', '\u0623\u0633\u0633\u0646\u0627', '\u0639\u0645\u0644\u0646\u0627', '\u0642\u062F\u0645\u0646\u0627', '\u0641\u0639\u0644\u0646\u0627', '\u0646\u062C\u062D\u0646\u0627', '\u062A\u0645\u0643\u0646\u0627', '\u0627\u0633\u062A\u0637\u0639\u0646\u0627', '\u0648\u0635\u0644\u0646\u0627', '\u0637\u0648\u0631\u0646\u0627', '\u0623\u0642\u0645\u0646\u0627', '\u0623\u0637\u0644\u0642\u0646\u0627', '\u0648\u0641\u0631\u0646\u0627', '\u0635\u0646\u0639\u0646\u0627', '\u0631\u0633\u062E\u0646\u0627', '\u0643\u0631\u0633\u0646\u0627']
            },
            sideB: {
                label: '\u0645\u0633\u062A\u0642\u0628\u0644',
                labelEn: 'Future tense',
                words: ['\u0633\u0646\u062D\u0642\u0642', '\u0633\u0646\u0628\u0646\u064A', '\u0633\u0646\u0639\u0645\u0644', '\u0633\u0646\u0648\u0627\u0635\u0644', '\u0633\u0646\u0633\u0639\u0649', '\u0633\u0646\u0637\u0648\u0631', '\u0633\u0648\u0641 \u0646\u062D\u0642\u0642', '\u0633\u0648\u0641 \u0646\u0628\u0646\u064A', '\u0633\u0648\u0641 \u0646\u0639\u0645\u0644', '\u0633\u0646\u0642\u062F\u0645', '\u0633\u0646\u0646\u062C\u0632', '\u0633\u0646\u0648\u0641\u0631', '\u0633\u0646\u0635\u0646\u0639', '\u0633\u0646\u0637\u0644\u0642', '\u0633\u0646\u0631\u0633\u062E', '\u0633\u0646\u0643\u0631\u0633']
            }
        },
        {
            id: 'voice_active_passive',
            nameAr: '\u0627\u0644\u0645\u0639\u0644\u0648\u0645 \u0645\u0642\u0627\u0628\u0644 \u0627\u0644\u0645\u062C\u0647\u0648\u0644',
            nameEn: 'Active vs Passive Voice',
            group: 'temporal',
            groupNameAr: '\u0627\u0644\u0632\u0645\u0646 \u0648\u0627\u0644\u0641\u0639\u0644',
            groupNameEn: 'Tense & Action',
            sideA: {
                label: '\u0645\u0639\u0644\u0648\u0645',
                labelEn: 'Active voice',
                words: ['\u0641\u0639\u0644\u0646\u0627', '\u062D\u0642\u0642\u0646\u0627', '\u0628\u0646\u064A\u0646\u0627', '\u0623\u0633\u0633\u0646\u0627', '\u0623\u0646\u062C\u0632\u0646\u0627', '\u0642\u0631\u0631\u0646\u0627', '\u0623\u0639\u0644\u0646\u0627', '\u0623\u0637\u0644\u0642\u0646\u0627']
            },
            sideB: {
                label: '\u0645\u062C\u0647\u0648\u0644',
                labelEn: 'Passive voice',
                words: ['\u062A\u0645\u0651 \u062A\u062D\u0642\u064A\u0642', '\u062A\u0645\u0651 \u0628\u0646\u0627\u0621', '\u062A\u0645\u0651 \u0625\u0646\u062C\u0627\u0632', '\u062A\u0645\u0651 \u062A\u0623\u0633\u064A\u0633', '\u062A\u0645\u0651 \u0625\u0637\u0644\u0627\u0642', '\u062A\u0645\u0651 \u0625\u0639\u0644\u0627\u0646', '\u062A\u0645\u0651 \u062A\u0642\u062F\u064A\u0645', '\u062A\u0645\u0651 \u0627\u062A\u062E\u0627\u0630', '\u062A\u0645\u0651 \u062A\u0648\u0641\u064A\u0631', '\u062A\u0645\u0651 \u062A\u0637\u0648\u064A\u0631', '\u0623\u064F\u0646\u062C\u0632', '\u0623\u064F\u0633\u0633', '\u0623\u064F\u0642\u064A\u0645', '\u0628\u064F\u0646\u064A', '\u0641\u064F\u062A\u062D', '\u0623\u064F\u0637\u0644\u0642']
            }
        },
        // NOTE: Dimension 7 (nominal_verbal) is intentionally omitted.
        // Distinguishing nominal (جملة اسمية) from verbal (جملة فعلية)
        // sentences requires syntactic parsing beyond regex capability.

        // ── GROUP 3: الموقف المعرفي والحجاجي (epistemic) ──
        {
            id: 'obligation_possibility',
            nameAr: '\u0627\u0644\u0648\u062C\u0648\u0628 \u0645\u0642\u0627\u0628\u0644 \u0627\u0644\u0625\u0645\u0643\u0627\u0646',
            nameEn: 'Obligation vs Possibility',
            group: 'epistemic',
            groupNameAr: '\u0627\u0644\u0645\u0648\u0642\u0641 \u0627\u0644\u0645\u0639\u0631\u0641\u064A \u0648\u0627\u0644\u062D\u062C\u0627\u062C\u064A',
            groupNameEn: 'Epistemic & Argumentative Stance',
            sideA: {
                label: '\u0648\u062C\u0648\u0628',
                labelEn: 'Obligation',
                words: ['\u064A\u062C\u0628', '\u064A\u0646\u0628\u063A\u064A', '\u0644\u0627 \u0628\u062F', '\u0645\u0646 \u0627\u0644\u0648\u0627\u062C\u0628', '\u0645\u0646 \u0627\u0644\u0644\u0627\u0632\u0645', '\u064A\u062A\u0639\u064A\u0646', '\u064A\u062A\u0648\u062C\u0628', '\u0641\u0631\u0636', '\u0648\u0627\u062C\u0628 \u0639\u0644\u064A\u0646\u0627', '\u064A\u0644\u0632\u0645', '\u0636\u0631\u0648\u0631\u064A', '\u0645\u0646 \u0627\u0644\u0636\u0631\u0648\u0631\u064A', '\u062D\u062A\u0645\u064A', '\u0644\u0627\u0632\u0645']
            },
            sideB: {
                label: '\u0625\u0645\u0643\u0627\u0646',
                labelEn: 'Possibility',
                words: ['\u064A\u0645\u0643\u0646', '\u064A\u0633\u062A\u0637\u064A\u0639', '\u0645\u0646 \u0627\u0644\u0645\u0645\u0643\u0646', '\u0628\u0625\u0645\u0643\u0627\u0646\u0646\u0627', '\u0642\u0627\u062F\u0631\u0648\u0646', '\u0641\u064A \u0648\u0633\u0639\u0646\u0627', '\u0641\u064A \u0627\u0633\u062A\u0637\u0627\u0639\u062A\u0646\u0627', '\u0646\u0633\u062A\u0637\u064A\u0639', '\u064A\u0645\u0643\u0646\u0646\u0627', '\u0628\u0627\u0633\u062A\u0637\u0627\u0639\u062A\u0646\u0627', '\u0642\u0627\u062F\u0631\u064A\u0646']
            }
        },
        {
            id: 'certainty_doubt',
            nameAr: '\u0627\u0644\u064A\u0642\u064A\u0646 \u0645\u0642\u0627\u0628\u0644 \u0627\u0644\u0627\u062D\u062A\u0645\u0627\u0644',
            nameEn: 'Certainty vs Doubt',
            group: 'epistemic',
            groupNameAr: '\u0627\u0644\u0645\u0648\u0642\u0641 \u0627\u0644\u0645\u0639\u0631\u0641\u064A \u0648\u0627\u0644\u062D\u062C\u0627\u062C\u064A',
            groupNameEn: 'Epistemic & Argumentative Stance',
            sideA: {
                label: '\u064A\u0642\u064A\u0646',
                labelEn: 'Certainty',
                words: ['\u0628\u0627\u0644\u062A\u0623\u0643\u064A\u062F', '\u0644\u0627 \u0634\u0643', '\u0645\u0646 \u0627\u0644\u0645\u0624\u0643\u062F', '\u062D\u062A\u0645\u0627\u064B', '\u064A\u0642\u064A\u0646\u0627\u064B', '\u0644\u0627 \u0631\u064A\u0628', '\u0628\u0644\u0627 \u0634\u0643', '\u0642\u0637\u0639\u0627\u064B', '\u0623\u062C\u0632\u0645', '\u062C\u0644\u064A', '\u0648\u0627\u0636\u062D', '\u0628\u0643\u0644 \u062A\u0623\u0643\u064A\u062F', '\u0645\u0645\u0627 \u0644\u0627 \u0634\u0643 \u0641\u064A\u0647']
            },
            sideB: {
                label: '\u0627\u062D\u062A\u0645\u0627\u0644',
                labelEn: 'Doubt / Probability',
                words: ['\u0631\u0628\u0645\u0627', '\u0644\u0639\u0644', '\u0642\u062F', '\u0645\u0646 \u0627\u0644\u0645\u062D\u062A\u0645\u0644', '\u064A\u0628\u062F\u0648', '\u0623\u0638\u0646', '\u0623\u0639\u062A\u0642\u062F', '\u0623\u062D\u0633\u0628', '\u0639\u0644\u0649 \u0627\u0644\u0623\u0631\u062C\u062D', '\u0645\u0646 \u0627\u0644\u0645\u0631\u062C\u062D', '\u0645\u0645\u0643\u0646', '\u0645\u062D\u062A\u0645\u0644']
            }
        },
        {
            id: 'affirmation_negation',
            nameAr: '\u0627\u0644\u0625\u062B\u0628\u0627\u062A \u0645\u0642\u0627\u0628\u0644 \u0627\u0644\u0646\u0641\u064A',
            nameEn: 'Affirmation vs Negation',
            group: 'epistemic',
            groupNameAr: '\u0627\u0644\u0645\u0648\u0642\u0641 \u0627\u0644\u0645\u0639\u0631\u0641\u064A \u0648\u0627\u0644\u062D\u062C\u0627\u062C\u064A',
            groupNameEn: 'Epistemic & Argumentative Stance',
            sideA: {
                label: '\u0625\u062B\u0628\u0627\u062A',
                labelEn: 'Affirmation',
                words: ['\u0625\u0646\u0651', '\u0625\u0646\u0651\u0646\u0627', '\u0623\u0646\u0651', '\u0646\u0639\u0645', '\u0628\u0644\u0649', '\u0623\u062C\u0644', '\u0628\u0627\u0644\u0641\u0639\u0644', '\u062D\u0642\u0627\u064B', '\u0641\u0639\u0644\u0627\u064B', '\u0628\u0627\u0644\u0637\u0628\u0639', '\u0637\u0628\u0639\u0627\u064B', '\u0635\u062D\u064A\u062D', '\u0644\u0642\u062F']
            },
            sideB: {
                label: '\u0646\u0641\u064A',
                labelEn: 'Negation',
                words: ['\u0644\u0627', '\u0644\u0645', '\u0644\u0646', '\u0645\u0627', '\u0644\u064A\u0633', '\u0644\u064A\u0633\u062A', '\u063A\u064A\u0631', '\u0639\u062F\u0645', '\u0628\u062F\u0648\u0646', '\u062F\u0648\u0646', '\u0644\u0627 \u064A\u0645\u0643\u0646', '\u0644\u0646 \u0646\u0642\u0628\u0644', '\u0644\u0627 \u0646\u0631\u0636\u0649', '\u0645\u0633\u062A\u062D\u064A\u0644', '\u0644\u0645 \u064A\u0643\u0646']
            }
        },
        {
            id: 'conditional_absolute',
            nameAr: '\u0627\u0644\u0634\u0631\u0637 \u0645\u0642\u0627\u0628\u0644 \u0627\u0644\u0645\u0637\u0644\u0642',
            nameEn: 'Conditional vs Absolute',
            group: 'epistemic',
            groupNameAr: '\u0627\u0644\u0645\u0648\u0642\u0641 \u0627\u0644\u0645\u0639\u0631\u0641\u064A \u0648\u0627\u0644\u062D\u062C\u0627\u062C\u064A',
            groupNameEn: 'Epistemic & Argumentative Stance',
            sideA: {
                label: '\u0634\u0631\u0637',
                labelEn: 'Conditional',
                words: ['\u0625\u0630\u0627', '\u0644\u0648', '\u0625\u0646', '\u0645\u062A\u0649 \u0645\u0627', '\u0645\u0647\u0645\u0627', '\u062D\u064A\u062B\u0645\u0627', '\u0628\u0634\u0631\u0637', '\u0634\u0631\u064A\u0637\u0629', '\u0641\u064A \u062D\u0627\u0644', '\u0639\u0644\u0649 \u0623\u0646']
            },
            sideB: {
                label: '\u0645\u0637\u0644\u0642',
                labelEn: 'Absolute',
                words: ['\u062F\u0627\u0626\u0645\u0627\u064B', '\u0623\u0628\u062F\u0627\u064B', '\u0645\u0647\u0645\u0627 \u0643\u0627\u0646', '\u0641\u064A \u0643\u0644 \u0627\u0644\u0623\u062D\u0648\u0627\u0644', '\u0628\u0644\u0627 \u0642\u064A\u062F', '\u0628\u0644\u0627 \u0634\u0631\u0637', '\u0639\u0644\u0649 \u0627\u0644\u062F\u0648\u0627\u0645', '\u0645\u0637\u0644\u0642\u0627\u064B', '\u0642\u0637\u0639\u064A\u0627\u064B', '\u062D\u062A\u0645\u064A\u0627\u064B']
            }
        },
        {
            id: 'intensification_mitigation',
            nameAr: '\u0627\u0644\u062A\u0635\u0639\u064A\u062F \u0645\u0642\u0627\u0628\u0644 \u0627\u0644\u062A\u062E\u0641\u064A\u0641',
            nameEn: 'Intensification vs Mitigation',
            group: 'epistemic',
            groupNameAr: '\u0627\u0644\u0645\u0648\u0642\u0641 \u0627\u0644\u0645\u0639\u0631\u0641\u064A \u0648\u0627\u0644\u062D\u062C\u0627\u062C\u064A',
            groupNameEn: 'Epistemic & Argumentative Stance',
            sideA: {
                label: '\u062A\u0635\u0639\u064A\u062F',
                labelEn: 'Intensification (boosters)',
                words: ['\u062C\u062F\u0627\u064B', '\u0644\u0644\u063A\u0627\u064A\u0629', '\u0623\u0634\u062F', '\u0623\u0639\u0638\u0645', '\u0623\u0643\u0628\u0631', '\u0623\u0647\u0645', '\u062A\u0645\u0627\u0645\u0627\u064B', '\u0645\u0637\u0644\u0642\u0627\u064B', '\u0643\u0644\u064A\u0627\u064B', '\u0628\u0627\u0644\u0643\u0627\u0645\u0644', '\u0623\u0628\u062F\u0627\u064B']
            },
            sideB: {
                label: '\u062A\u062E\u0641\u064A\u0641',
                labelEn: 'Mitigation (hedges)',
                words: ['\u0642\u0644\u064A\u0644\u0627\u064B', '\u0628\u0639\u0636 \u0627\u0644\u0634\u064A\u0621', '\u0625\u0644\u0649 \u062D\u062F \u0645\u0627', '\u0646\u0633\u0628\u064A\u0627\u064B', '\u0646\u0648\u0639\u0627\u064B \u0645\u0627', '\u062A\u0642\u0631\u064A\u0628\u0627\u064B', '\u0628\u0634\u0643\u0644 \u0639\u0627\u0645', '\u0641\u064A \u0627\u0644\u063A\u0627\u0644\u0628']
            }
        },

        // ── GROUP 4: الاستراتيجية الخطابية (strategy) ──
        {
            id: 'direct_indirect',
            nameAr: '\u0627\u0644\u0645\u0628\u0627\u0634\u0631 \u0645\u0642\u0627\u0628\u0644 \u063A\u064A\u0631 \u0627\u0644\u0645\u0628\u0627\u0634\u0631',
            nameEn: 'Direct vs Indirect',
            group: 'strategy',
            groupNameAr: '\u0627\u0644\u0627\u0633\u062A\u0631\u0627\u062A\u064A\u062C\u064A\u0629 \u0627\u0644\u062E\u0637\u0627\u0628\u064A\u0629',
            groupNameEn: 'Discursive Strategy',
            sideA: {
                label: '\u0645\u0628\u0627\u0634\u0631',
                labelEn: 'Direct',
                words: ['\u0623\u0637\u0627\u0644\u0628', '\u0623\u0645\u0631', '\u0623\u0637\u0644\u0628', '\u064A\u062C\u0628 \u0623\u0646', '\u0623\u062F\u0639\u0648 \u0625\u0644\u0649', '\u0623\u0648\u062C\u0647']
            },
            sideB: {
                label: '\u063A\u064A\u0631 \u0645\u0628\u0627\u0634\u0631',
                labelEn: 'Indirect',
                words: ['\u0623\u0644\u0627 \u062A\u0639\u062A\u0642\u062F\u0648\u0646', '\u0623\u0644\u0627 \u062A\u0631\u0648\u0646', '\u0647\u0644 \u064A\u0645\u0643\u0646', '\u0644\u064A\u062A', '\u062D\u0628\u0630\u0627 \u0644\u0648', '\u0623\u062A\u0645\u0646\u0649 \u0644\u0648', '\u0623\u0644\u0627 \u064A\u062C\u062F\u0631', '\u0623\u0644\u064A\u0633 \u0645\u0646 \u0627\u0644\u0623\u0641\u0636\u0644', '\u0644\u0648 \u062A\u0643\u0631\u0645\u062A\u0645']
            }
        },
        {
            id: 'pathos_logos',
            nameAr: '\u0627\u0644\u0639\u0627\u0637\u0641\u0629 \u0645\u0642\u0627\u0628\u0644 \u0627\u0644\u0639\u0642\u0644',
            nameEn: 'Pathos vs Logos',
            group: 'strategy',
            groupNameAr: '\u0627\u0644\u0627\u0633\u062A\u0631\u0627\u062A\u064A\u062C\u064A\u0629 \u0627\u0644\u062E\u0637\u0627\u0628\u064A\u0629',
            groupNameEn: 'Discursive Strategy',
            sideA: {
                label: '\u0639\u0627\u0637\u0641\u0629',
                labelEn: 'Pathos (emotion)',
                words: ['\u0625\u062E\u0648\u062A\u064A', '\u0623\u0628\u0646\u0627\u0626\u064A', '\u0623\u062E\u0648\u0627\u062A\u064A', '\u062F\u0645\u0627\u0621', '\u062A\u0636\u062D\u064A\u0627\u062A', '\u0622\u0644\u0627\u0645', '\u0622\u0645\u0627\u0644', '\u0623\u062D\u0644\u0627\u0645', '\u0643\u0631\u0627\u0645\u0629', '\u0639\u0632\u0629', '\u0634\u0631\u0641', '\u0642\u0644\u0648\u0628', '\u0623\u0631\u0648\u0627\u062D', '\u062D\u0628', '\u0648\u0644\u0627\u0621', '\u0641\u062F\u0627\u0621', '\u0628\u0637\u0648\u0644\u0629']
            },
            sideB: {
                label: '\u0639\u0642\u0644',
                labelEn: 'Logos (reason)',
                words: ['\u0623\u0631\u0642\u0627\u0645', '\u0625\u062D\u0635\u0627\u0626\u064A\u0627\u062A', '\u0646\u0633\u0628\u0629', '\u0648\u0641\u0642\u0627\u064B', '\u062F\u0631\u0627\u0633\u0627\u062A', '\u0628\u064A\u0627\u0646\u0627\u062A', '\u0645\u0624\u0634\u0631\u0627\u062A', '\u062A\u0642\u0627\u0631\u064A\u0631', '\u062D\u0642\u0627\u0626\u0642', '\u0645\u0639\u0637\u064A\u0627\u062A', '\u062E\u0637\u0629', '\u0627\u0633\u062A\u0631\u0627\u062A\u064A\u062C\u064A\u0629', '\u0645\u0646\u0647\u062C', '\u0628\u0631\u0646\u0627\u0645\u062C', '\u0645\u0634\u0631\u0648\u0639']
            }
        },
        {
            id: 'intertextuality',
            nameAr: '\u0627\u0644\u0645\u0631\u062C\u0639\u064A\u0629 \u0627\u0644\u062F\u064A\u0646\u064A\u0629 \u0645\u0642\u0627\u0628\u0644 \u0627\u0644\u062D\u062F\u0627\u062B\u064A\u0629',
            nameEn: 'Religious vs Modern References',
            group: 'strategy',
            groupNameAr: '\u0627\u0644\u0627\u0633\u062A\u0631\u0627\u062A\u064A\u062C\u064A\u0629 \u0627\u0644\u062E\u0637\u0627\u0628\u064A\u0629',
            groupNameEn: 'Discursive Strategy',
            sideA: {
                label: '\u062F\u064A\u0646\u064A\u0629',
                labelEn: 'Religious references',
                words: ['\u0642\u0627\u0644 \u062A\u0639\u0627\u0644\u0649', '\u0628\u0633\u0645 \u0627\u0644\u0644\u0647', '\u0625\u0646 \u0634\u0627\u0621 \u0627\u0644\u0644\u0647', '\u0627\u0644\u062D\u0645\u062F \u0644\u0644\u0647', '\u0633\u0628\u062D\u0627\u0646\u0647 \u0648\u062A\u0639\u0627\u0644\u0649', '\u0635\u0644\u0649 \u0627\u0644\u0644\u0647 \u0639\u0644\u064A\u0647 \u0648\u0633\u0644\u0645', '\u0631\u0636\u064A \u0627\u0644\u0644\u0647 \u0639\u0646\u0647', '\u0642\u0627\u0644 \u0627\u0644\u0631\u0633\u0648\u0644', '\u0627\u0644\u0642\u0631\u0622\u0646', '\u0627\u0644\u0622\u064A\u0629', '\u0627\u0644\u062D\u062F\u064A\u062B', '\u0627\u0644\u0634\u0631\u064A\u0639\u0629']
            },
            sideB: {
                label: '\u062D\u062F\u0627\u062B\u064A\u0629',
                labelEn: 'Modern / international references',
                words: ['\u0627\u0644\u0642\u0627\u0646\u0648\u0646 \u0627\u0644\u062F\u0648\u0644\u064A', '\u062D\u0642\u0648\u0642 \u0627\u0644\u0625\u0646\u0633\u0627\u0646', '\u0627\u0644\u0623\u0645\u0645 \u0627\u0644\u0645\u062A\u062D\u062F\u0629', '\u0627\u0644\u0645\u062C\u062A\u0645\u0639 \u0627\u0644\u062F\u0648\u0644\u064A', '\u0627\u0644\u062A\u0646\u0645\u064A\u0629 \u0627\u0644\u0645\u0633\u062A\u062F\u0627\u0645\u0629', '\u0627\u0644\u0645\u064A\u062B\u0627\u0642', '\u0627\u0644\u0645\u0639\u0627\u0647\u062F\u0629', '\u0627\u0644\u0627\u062A\u0641\u0627\u0642\u064A\u0629', '\u0627\u0644\u062F\u0633\u062A\u0648\u0631']
            }
        },
        {
            id: 'positive_negative_expressives',
            nameAr: '\u0627\u0644\u062A\u0639\u0628\u064A\u0631\u064A\u0627\u062A \u0627\u0644\u0625\u064A\u062C\u0627\u0628\u064A\u0629 \u0645\u0642\u0627\u0628\u0644 \u0627\u0644\u0633\u0644\u0628\u064A\u0629',
            nameEn: 'Positive vs Negative Expressives',
            group: 'strategy',
            groupNameAr: '\u0627\u0644\u0627\u0633\u062A\u0631\u0627\u062A\u064A\u062C\u064A\u0629 \u0627\u0644\u062E\u0637\u0627\u0628\u064A\u0629',
            groupNameEn: 'Discursive Strategy',
            sideA: {
                label: '\u0625\u064A\u062C\u0627\u0628\u064A\u0629',
                labelEn: 'Positive expressives',
                words: ['\u0646\u0641\u062A\u062E\u0631', '\u0646\u0639\u062A\u0632', '\u0646\u0642\u062F\u0631', '\u0646\u062B\u0645\u0646', '\u0646\u0634\u064A\u062F', '\u0646\u062D\u062A\u0641\u0644', '\u0646\u0628\u0627\u0631\u0643', '\u0646\u0647\u0646\u0626', '\u064A\u0633\u0639\u062F\u0646\u0627', '\u064A\u0634\u0631\u0641\u0646\u0627', '\u0628\u0641\u0636\u0644', '\u0627\u0644\u062D\u0645\u062F \u0644\u0644\u0647', '\u0646\u0634\u0643\u0631']
            },
            sideB: {
                label: '\u0633\u0644\u0628\u064A\u0629',
                labelEn: 'Negative expressives',
                words: ['\u0646\u0623\u0633\u0641', '\u0646\u0633\u062A\u0646\u0643\u0631', '\u0646\u062F\u064A\u0646', '\u0646\u0631\u0641\u0636', '\u0646\u0634\u062C\u0628', '\u064A\u0624\u0644\u0645\u0646\u0627', '\u064A\u0624\u0633\u0641\u0646\u0627', '\u0645\u0639 \u0627\u0644\u0623\u0633\u0641', '\u0644\u0644\u0623\u0633\u0641', '\u0646\u062D\u0630\u0631', '\u0646\u062A\u0623\u0644\u0645']
            }
        },
        {
            id: 'argumentation_connectors',
            nameAr: '\u0627\u0644\u062A\u0628\u0631\u064A\u0631 \u0645\u0642\u0627\u0628\u0644 \u0627\u0644\u0627\u0633\u062A\u062F\u0631\u0627\u0643',
            nameEn: 'Justification vs Concession Connectors',
            group: 'strategy',
            groupNameAr: '\u0627\u0644\u0627\u0633\u062A\u0631\u0627\u062A\u064A\u062C\u064A\u0629 \u0627\u0644\u062E\u0637\u0627\u0628\u064A\u0629',
            groupNameEn: 'Discursive Strategy',
            sideA: {
                label: '\u062A\u0628\u0631\u064A\u0631',
                labelEn: 'Justification / Causal',
                words: ['\u0644\u0623\u0646', '\u0644\u0623\u0646\u0647', '\u0644\u0623\u0646\u0647\u0627', '\u0628\u0633\u0628\u0628', '\u0625\u0630', '\u062D\u064A\u062B \u0625\u0646', '\u0646\u0638\u0631\u0627\u064B', '\u0628\u0645\u0627 \u0623\u0646', '\u0644\u0630\u0644\u0643', '\u0648\u0645\u0646 \u062B\u0645', '\u0648\u0628\u0627\u0644\u062A\u0627\u0644\u064A', '\u0625\u0630\u0646', '\u0645\u0646 \u0623\u062C\u0644']
            },
            sideB: {
                label: '\u0627\u0633\u062A\u062F\u0631\u0627\u0643',
                labelEn: 'Concession / Contrast',
                words: ['\u0644\u0643\u0646', '\u0644\u0643\u0646\u0651', '\u0625\u0644\u0627 \u0623\u0646', '\u063A\u064A\u0631 \u0623\u0646', '\u0628\u064A\u062F \u0623\u0646', '\u0631\u063A\u0645', '\u0639\u0644\u0649 \u0627\u0644\u0631\u063A\u0645', '\u0628\u0627\u0644\u0631\u063A\u0645', '\u0645\u0639 \u0630\u0644\u0643', '\u0648\u0645\u0639 \u0647\u0630\u0627', '\u0628\u0644', '\u0625\u0646\u0645\u0627']
            }
        }
    ];
}

function getEnglishDimensions() {
    return [
        // ── GROUP 1: Speaker Identity (identity) ──
        {
            id: 'pronouns_i_we',
            nameAr: '\u0623\u0646\u0627 \u0645\u0642\u0627\u0628\u0644 \u0646\u062D\u0646',
            nameEn: 'I vs We',
            group: 'identity',
            groupNameAr: '\u0647\u0648\u064A\u0629 \u0627\u0644\u0645\u062A\u0643\u0644\u0645',
            groupNameEn: 'Speaker Identity',
            sideA: {
                label: '\u0623\u0646\u0627',
                labelEn: 'I (singular)',
                words: ['I', 'me', 'my', 'mine', 'myself']
            },
            sideB: {
                label: '\u0646\u062D\u0646',
                labelEn: 'We (plural)',
                words: ['we', 'us', 'our', 'ours', 'ourselves']
            }
        },
        {
            id: 'pronouns_you',
            nameAr: '\u0623\u0646\u062A\u064E \u0645\u0642\u0627\u0628\u0644 \u0623\u0646\u062A\u0645',
            nameEn: 'You (singular) vs You (plural)',
            group: 'identity',
            groupNameAr: '\u0647\u0648\u064A\u0629 \u0627\u0644\u0645\u062A\u0643\u0644\u0645',
            groupNameEn: 'Speaker Identity',
            sideA: {
                label: '\u0645\u0641\u0631\u062F',
                labelEn: 'Singular you',
                words: ['you', 'your', 'yours', 'yourself']
            },
            sideB: {
                label: '\u062C\u0645\u0639',
                labelEn: 'Plural you',
                words: ['yourselves', 'you all', "y'all"]
            }
        },
        {
            id: 'we_vs_they',
            nameAr: '\u0646\u062D\u0646 \u0645\u0642\u0627\u0628\u0644 \u0647\u0645',
            nameEn: 'We vs They (Ideological Square)',
            group: 'identity',
            groupNameAr: '\u0647\u0648\u064A\u0629 \u0627\u0644\u0645\u062A\u0643\u0644\u0645',
            groupNameEn: 'Speaker Identity',
            sideA: {
                label: '\u0646\u062D\u0646',
                labelEn: 'We (in-group)',
                words: ['we', 'us', 'our', 'ours', 'ourselves', 'our country', 'our people', 'our nation']
            },
            sideB: {
                label: '\u0647\u0645',
                labelEn: 'They (out-group)',
                words: ['they', 'them', 'their', 'theirs', 'themselves', 'those', 'the others', 'the other']
            }
        },
        {
            id: 'inclusive_exclusive',
            nameAr: '\u0627\u0644\u0634\u0645\u0648\u0644 \u0645\u0642\u0627\u0628\u0644 \u0627\u0644\u0625\u0642\u0635\u0627\u0621',
            nameEn: 'Inclusion vs Exclusion',
            group: 'identity',
            groupNameAr: '\u0647\u0648\u064A\u0629 \u0627\u0644\u0645\u062A\u0643\u0644\u0645',
            groupNameEn: 'Speaker Identity',
            sideA: {
                label: '\u0634\u0645\u0648\u0644',
                labelEn: 'Inclusion',
                words: ['all of us', 'everyone', 'together', 'every citizen', 'every person', 'without exception', 'hand in hand', 'humanity', 'humankind', 'all people', 'collectively']
            },
            sideB: {
                label: '\u0625\u0642\u0635\u0627\u0621',
                labelEn: 'Exclusion',
                words: ['only', 'exclusively', 'except', 'apart from', 'other than', 'especially', 'some people', 'certain groups', 'a faction']
            }
        },

        // ── GROUP 2: Tense & Action (temporal) ──
        {
            id: 'tense_past_future',
            nameAr: '\u0627\u0644\u0645\u0627\u0636\u064A \u0645\u0642\u0627\u0628\u0644 \u0627\u0644\u0645\u0633\u062A\u0642\u0628\u0644',
            nameEn: 'Past vs Future',
            group: 'temporal',
            groupNameAr: '\u0627\u0644\u0632\u0645\u0646 \u0648\u0627\u0644\u0641\u0639\u0644',
            groupNameEn: 'Tense & Action',
            sideA: {
                label: '\u0645\u0627\u0636\u064A',
                labelEn: 'Past tense',
                words: ['achieved', 'accomplished', 'built', 'established', 'delivered', 'succeeded', 'completed', 'developed', 'launched', 'created', 'implemented', 'realized']
            },
            sideB: {
                label: '\u0645\u0633\u062A\u0642\u0628\u0644',
                labelEn: 'Future tense',
                words: ['will achieve', 'will build', 'will work', 'will continue', 'will strive', 'will develop', 'will deliver', 'will create', 'will launch', 'will implement', 'going to', 'shall']
            }
        },
        {
            id: 'voice_active_passive',
            nameAr: '\u0627\u0644\u0645\u0639\u0644\u0648\u0645 \u0645\u0642\u0627\u0628\u0644 \u0627\u0644\u0645\u062C\u0647\u0648\u0644',
            nameEn: 'Active vs Passive Voice',
            group: 'temporal',
            groupNameAr: '\u0627\u0644\u0632\u0645\u0646 \u0648\u0627\u0644\u0641\u0639\u0644',
            groupNameEn: 'Tense & Action',
            sideA: {
                label: '\u0645\u0639\u0644\u0648\u0645',
                labelEn: 'Active voice',
                words: ['we achieved', 'we built', 'we established', 'we decided', 'we announced', 'we launched', 'we delivered', 'we created']
            },
            sideB: {
                label: '\u0645\u062C\u0647\u0648\u0644',
                labelEn: 'Passive voice',
                words: ['was achieved', 'was built', 'was established', 'was launched', 'was announced', 'was delivered', 'was created', 'were made', 'has been', 'have been', 'been achieved', 'been established']
            }
        },

        // ── GROUP 3: Epistemic & Argumentative Stance (epistemic) ──
        {
            id: 'obligation_possibility',
            nameAr: '\u0627\u0644\u0648\u062C\u0648\u0628 \u0645\u0642\u0627\u0628\u0644 \u0627\u0644\u0625\u0645\u0643\u0627\u0646',
            nameEn: 'Obligation vs Possibility',
            group: 'epistemic',
            groupNameAr: '\u0627\u0644\u0645\u0648\u0642\u0641 \u0627\u0644\u0645\u0639\u0631\u0641\u064A \u0648\u0627\u0644\u062D\u062C\u0627\u062C\u064A',
            groupNameEn: 'Epistemic & Argumentative Stance',
            sideA: {
                label: '\u0648\u062C\u0648\u0628',
                labelEn: 'Obligation',
                words: ['must', 'should', 'ought to', 'have to', 'need to', 'obliged', 'required', 'necessary', 'essential', 'imperative']
            },
            sideB: {
                label: '\u0625\u0645\u0643\u0627\u0646',
                labelEn: 'Possibility',
                words: ['can', 'could', 'may', 'might', 'able to', 'possible', 'capable', 'potentially']
            }
        },
        {
            id: 'certainty_doubt',
            nameAr: '\u0627\u0644\u064A\u0642\u064A\u0646 \u0645\u0642\u0627\u0628\u0644 \u0627\u0644\u0627\u062D\u062A\u0645\u0627\u0644',
            nameEn: 'Certainty vs Doubt',
            group: 'epistemic',
            groupNameAr: '\u0627\u0644\u0645\u0648\u0642\u0641 \u0627\u0644\u0645\u0639\u0631\u0641\u064A \u0648\u0627\u0644\u062D\u062C\u0627\u062C\u064A',
            groupNameEn: 'Epistemic & Argumentative Stance',
            sideA: {
                label: '\u064A\u0642\u064A\u0646',
                labelEn: 'Certainty',
                words: ['certainly', 'definitely', 'undoubtedly', 'clearly', 'obviously', 'without doubt', 'no doubt', 'surely', 'absolutely', 'indeed']
            },
            sideB: {
                label: '\u0627\u062D\u062A\u0645\u0627\u0644',
                labelEn: 'Doubt / Probability',
                words: ['perhaps', 'maybe', 'possibly', 'probably', 'might', 'it seems', 'I think', 'I believe', 'likely', 'presumably']
            }
        },
        {
            id: 'affirmation_negation',
            nameAr: '\u0627\u0644\u0625\u062B\u0628\u0627\u062A \u0645\u0642\u0627\u0628\u0644 \u0627\u0644\u0646\u0641\u064A',
            nameEn: 'Affirmation vs Negation',
            group: 'epistemic',
            groupNameAr: '\u0627\u0644\u0645\u0648\u0642\u0641 \u0627\u0644\u0645\u0639\u0631\u0641\u064A \u0648\u0627\u0644\u062D\u062C\u0627\u062C\u064A',
            groupNameEn: 'Epistemic & Argumentative Stance',
            sideA: {
                label: '\u0625\u062B\u0628\u0627\u062A',
                labelEn: 'Affirmation',
                words: ['yes', 'indeed', 'truly', 'in fact', 'actually', 'of course', 'certainly', 'correct', 'right']
            },
            sideB: {
                label: '\u0646\u0641\u064A',
                labelEn: 'Negation',
                words: ['no', 'not', 'never', 'neither', 'nor', 'cannot', 'impossible', 'without', 'none', "won't", "don't", "doesn't", "didn't", "isn't", "aren't", "wasn't", "weren't"]
            }
        },
        {
            id: 'conditional_absolute',
            nameAr: '\u0627\u0644\u0634\u0631\u0637 \u0645\u0642\u0627\u0628\u0644 \u0627\u0644\u0645\u0637\u0644\u0642',
            nameEn: 'Conditional vs Absolute',
            group: 'epistemic',
            groupNameAr: '\u0627\u0644\u0645\u0648\u0642\u0641 \u0627\u0644\u0645\u0639\u0631\u0641\u064A \u0648\u0627\u0644\u062D\u062C\u0627\u062C\u064A',
            groupNameEn: 'Epistemic & Argumentative Stance',
            sideA: {
                label: '\u0634\u0631\u0637',
                labelEn: 'Conditional',
                words: ['if', 'unless', 'provided that', 'on condition', 'assuming', 'in case', 'whether', 'supposing']
            },
            sideB: {
                label: '\u0645\u0637\u0644\u0642',
                labelEn: 'Absolute',
                words: ['always', 'never', 'forever', 'in all cases', 'unconditionally', 'without exception', 'absolutely', 'categorically']
            }
        },
        {
            id: 'intensification_mitigation',
            nameAr: '\u0627\u0644\u062A\u0635\u0639\u064A\u062F \u0645\u0642\u0627\u0628\u0644 \u0627\u0644\u062A\u062E\u0641\u064A\u0641',
            nameEn: 'Intensification vs Mitigation',
            group: 'epistemic',
            groupNameAr: '\u0627\u0644\u0645\u0648\u0642\u0641 \u0627\u0644\u0645\u0639\u0631\u0641\u064A \u0648\u0627\u0644\u062D\u062C\u0627\u062C\u064A',
            groupNameEn: 'Epistemic & Argumentative Stance',
            sideA: {
                label: '\u062A\u0635\u0639\u064A\u062F',
                labelEn: 'Intensification (boosters)',
                words: ['very', 'extremely', 'absolutely', 'completely', 'entirely', 'totally', 'utterly', 'most', 'greatest', 'highest']
            },
            sideB: {
                label: '\u062A\u062E\u0641\u064A\u0641',
                labelEn: 'Mitigation (hedges)',
                words: ['somewhat', 'relatively', 'approximately', 'tends to', 'slightly', 'to some extent', 'in general', 'more or less', 'broadly', 'partly']
            }
        },

        // ── GROUP 4: Discursive Strategy (strategy) ──
        {
            id: 'direct_indirect',
            nameAr: '\u0627\u0644\u0645\u0628\u0627\u0634\u0631 \u0645\u0642\u0627\u0628\u0644 \u063A\u064A\u0631 \u0627\u0644\u0645\u0628\u0627\u0634\u0631',
            nameEn: 'Direct vs Indirect',
            group: 'strategy',
            groupNameAr: '\u0627\u0644\u0627\u0633\u062A\u0631\u0627\u062A\u064A\u062C\u064A\u0629 \u0627\u0644\u062E\u0637\u0627\u0628\u064A\u0629',
            groupNameEn: 'Discursive Strategy',
            sideA: {
                label: '\u0645\u0628\u0627\u0634\u0631',
                labelEn: 'Direct',
                words: ['I demand', 'I order', 'I request', 'must', 'I call for', 'I urge', 'I insist', 'I direct']
            },
            sideB: {
                label: '\u063A\u064A\u0631 \u0645\u0628\u0627\u0634\u0631',
                labelEn: 'Indirect',
                words: ["don't you think", "wouldn't it be", 'could we perhaps', 'I wish', 'if only', 'it would be nice', "isn't it better", 'I wonder if', 'might we consider']
            }
        },
        {
            id: 'pathos_logos',
            nameAr: '\u0627\u0644\u0639\u0627\u0637\u0641\u0629 \u0645\u0642\u0627\u0628\u0644 \u0627\u0644\u0639\u0642\u0644',
            nameEn: 'Pathos vs Logos',
            group: 'strategy',
            groupNameAr: '\u0627\u0644\u0627\u0633\u062A\u0631\u0627\u062A\u064A\u062C\u064A\u0629 \u0627\u0644\u062E\u0637\u0627\u0628\u064A\u0629',
            groupNameEn: 'Discursive Strategy',
            sideA: {
                label: '\u0639\u0627\u0637\u0641\u0629',
                labelEn: 'Pathos (emotion)',
                words: ['brothers', 'sisters', 'blood', 'sacrifice', 'pain', 'hope', 'dreams', 'dignity', 'honor', 'hearts', 'souls', 'love', 'loyalty', 'heroism', 'suffering']
            },
            sideB: {
                label: '\u0639\u0642\u0644',
                labelEn: 'Logos (reason)',
                words: ['numbers', 'statistics', 'percentage', 'according to', 'studies', 'data', 'indicators', 'reports', 'facts', 'evidence', 'plan', 'strategy', 'methodology', 'program', 'project']
            }
        },
        {
            id: 'intertextuality',
            nameAr: '\u0627\u0644\u0645\u0631\u062C\u0639\u064A\u0629 \u0627\u0644\u062F\u064A\u0646\u064A\u0629 \u0645\u0642\u0627\u0628\u0644 \u0627\u0644\u062D\u062F\u0627\u062B\u064A\u0629',
            nameEn: 'Religious vs Modern References',
            group: 'strategy',
            groupNameAr: '\u0627\u0644\u0627\u0633\u062A\u0631\u0627\u062A\u064A\u062C\u064A\u0629 \u0627\u0644\u062E\u0637\u0627\u0628\u064A\u0629',
            groupNameEn: 'Discursive Strategy',
            sideA: {
                label: '\u062F\u064A\u0646\u064A\u0629',
                labelEn: 'Religious references',
                words: ['God said', 'in the name of God', 'God willing', 'praise be to God', 'the Quran', 'the Bible', 'scripture', 'divine', 'blessed', 'sacred', 'holy']
            },
            sideB: {
                label: '\u062D\u062F\u0627\u062B\u064A\u0629',
                labelEn: 'Modern / international references',
                words: ['international law', 'human rights', 'United Nations', 'international community', 'sustainable development', 'charter', 'treaty', 'convention', 'constitution', 'democratic']
            }
        },
        {
            id: 'positive_negative_expressives',
            nameAr: '\u0627\u0644\u062A\u0639\u0628\u064A\u0631\u064A\u0627\u062A \u0627\u0644\u0625\u064A\u062C\u0627\u0628\u064A\u0629 \u0645\u0642\u0627\u0628\u0644 \u0627\u0644\u0633\u0644\u0628\u064A\u0629',
            nameEn: 'Positive vs Negative Expressives',
            group: 'strategy',
            groupNameAr: '\u0627\u0644\u0627\u0633\u062A\u0631\u0627\u062A\u064A\u062C\u064A\u0629 \u0627\u0644\u062E\u0637\u0627\u0628\u064A\u0629',
            groupNameEn: 'Discursive Strategy',
            sideA: {
                label: '\u0625\u064A\u062C\u0627\u0628\u064A\u0629',
                labelEn: 'Positive expressives',
                words: ['affirm', 'praise', 'commend', 'appreciate', 'celebrate', 'congratulate', 'proud', 'honored', 'grateful', 'thankful', 'pleased', 'delighted']
            },
            sideB: {
                label: '\u0633\u0644\u0628\u064A\u0629',
                labelEn: 'Negative expressives',
                words: ['condemn', 'denounce', 'reject', 'deplore', 'regret', 'unfortunately', 'sadly', 'warn', 'lament', 'grieve']
            }
        },
        {
            id: 'argumentation_connectors',
            nameAr: '\u0627\u0644\u062A\u0628\u0631\u064A\u0631 \u0645\u0642\u0627\u0628\u0644 \u0627\u0644\u0627\u0633\u062A\u062F\u0631\u0627\u0643',
            nameEn: 'Justification vs Concession Connectors',
            group: 'strategy',
            groupNameAr: '\u0627\u0644\u0627\u0633\u062A\u0631\u0627\u062A\u064A\u062C\u064A\u0629 \u0627\u0644\u062E\u0637\u0627\u0628\u064A\u0629',
            groupNameEn: 'Discursive Strategy',
            sideA: {
                label: '\u062A\u0628\u0631\u064A\u0631',
                labelEn: 'Justification / Causal',
                words: ['because', 'since', 'due to', 'given that', 'therefore', 'consequently', 'thus', 'hence', 'as a result', 'in order to', 'so that']
            },
            sideB: {
                label: '\u0627\u0633\u062A\u062F\u0631\u0627\u0643',
                labelEn: 'Concession / Contrast',
                words: ['but', 'however', 'although', 'though', 'despite', 'in spite of', 'nevertheless', 'nonetheless', 'yet', 'on the other hand', 'rather']
            }
        }
    ];
}

// ---------------------------------------------------------------------------
// Main analysis function
// ---------------------------------------------------------------------------

/**
 * Analyze text across 17 pragmatic dimensions (16 implemented + 1 skipped).
 * Auto-detects language (Arabic vs English) and applies appropriate word lists.
 *
 * @param {string} text - The discourse text to analyze.
 * @returns {Object} Analysis results with `language`, `dimensions` array, and `groups` summary.
 */
function analyzeComparative(text) {
    if (!text || typeof text !== 'string') {
        return { language: 'unknown', dimensions: [], groups: {} };
    }

    const lang = detectLanguage(text);
    const dimensions = getDimensions(lang);
    const results = [];

    for (const dim of dimensions) {
        const sideAResult = countSide(text, dim.sideA.words, lang);
        const sideBResult = countSide(text, dim.sideB.words, lang);

        const ratio = computeRatio(sideAResult.total, sideBResult.total);
        const interpretation = generateInterpretation(
            sideAResult.total,
            sideBResult.total,
            dim.sideA.label,
            dim.sideB.label,
            dim.sideA.labelEn,
            dim.sideB.labelEn
        );

        results.push({
            id: dim.id,
            nameAr: dim.nameAr,
            nameEn: dim.nameEn,
            group: dim.group,
            groupNameAr: dim.groupNameAr,
            groupNameEn: dim.groupNameEn,
            sideA: {
                label: dim.sideA.label,
                labelEn: dim.sideA.labelEn,
                count: sideAResult.total,
                items: sideAResult.items
            },
            sideB: {
                label: dim.sideB.label,
                labelEn: dim.sideB.labelEn,
                count: sideBResult.total,
                items: sideBResult.items
            },
            ratio: ratio,
            interpretation: interpretation
        });
    }

    // Build group summary
    const groups = {};
    for (const r of results) {
        if (!groups[r.group]) {
            groups[r.group] = {
                nameAr: r.groupNameAr,
                nameEn: r.groupNameEn,
                dimensions: []
            };
        }
        groups[r.group].dimensions.push(r.id);
    }

    return {
        language: lang,
        dimensions: results,
        groups: groups,
        // NOTE: Dimension 7 (nominal_verbal / الجملة الاسمية مقابل الفعلية)
        // is intentionally omitted. Reliable detection of nominal vs verbal
        // Arabic sentence structure requires morpho-syntactic parsing that
        // exceeds what regex-based analysis can accomplish accurately.
        skippedDimensions: [{
            id: 'nominal_verbal',
            nameAr: '\u0627\u0644\u062C\u0645\u0644\u0629 \u0627\u0644\u0627\u0633\u0645\u064A\u0629 \u0645\u0642\u0627\u0628\u0644 \u0627\u0644\u0641\u0639\u0644\u064A\u0629',
            nameEn: 'Nominal vs Verbal Sentences',
            reason: 'Requires syntactic parsing beyond regex capability'
        }]
    };
}

export { analyzeComparative };
