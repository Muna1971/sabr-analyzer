/**
 * corpusManager.js — Sabr v5.0 Corpus Manager
 * Manages multi-part corpus projects with incremental processing
 * Supports two tracks: Corpus Building & Pragmatic Analysis
 */

const fs = require('fs');
const path = require('path');

class CorpusManager {
    constructor() {
        this.project = null;
        this.projectPath = null;
    }

    /**
     * Create a new project
     * @param {Object} config
     * @param {string} config.name - Project name
     * @param {string} config.track - 'corpus' | 'analysis' | 'both'
     * @param {string} config.description - Project description
     * @param {string} config.savePath - Where to save project file
     * @param {Object} config.criteria - Analysis criteria configuration
     */
    createProject(config) {
        this.project = {
            version: '5.0',
            name: config.name || 'مشروع جديد',
            track: config.track || 'both',
            description: config.description || '',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),

            // Parts management
            parts: [],
            totalParts: 0,

            // Corpus data (Track 1)
            corpus: {
                texts: [],
                totalTexts: 0,
                totalWords: 0,
                discourseTypes: {},
                metadata: {
                    source: '',
                    language: 'ar',
                    dateRange: '',
                    author: ''
                }
            },

            // Analysis configuration (Track 2)
            analysis: {
                criteria: config.criteria || [],
                customLexicons: [],
                results: [],
                statistics: {
                    totalTexts: 0,
                    passedTexts: 0,
                    excludedTexts: 0,
                    criteriaImpact: {}
                }
            }
        };

        this.projectPath = config.savePath;
        this.saveProject();
        return this.project;
    }

    /**
     * Load existing project
     */
    loadProject(filePath) {
        try {
            const data = fs.readFileSync(filePath, 'utf-8');
            this.project = JSON.parse(data);
            this.projectPath = filePath;
            return { success: true, project: this.project };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    /**
     * Save current project
     */
    saveProject() {
        if (!this.project || !this.projectPath) return false;
        this.project.updatedAt = new Date().toISOString();
        fs.writeFileSync(this.projectPath, JSON.stringify(this.project, null, 2), 'utf-8');
        return true;
    }

    /**
     * Add a part to the project
     * @param {Object} part
     * @param {string} part.name - Part name (e.g., "الجزء الأول")
     * @param {string} part.filePath - Source file path
     * @param {number} part.fileSize - File size in bytes
     */
    addPart(part) {
        if (!this.project) return null;

        const partEntry = {
            id: this.project.parts.length + 1,
            name: part.name || `الجزء ${this.project.parts.length + 1}`,
            filePath: part.filePath,
            fileName: path.basename(part.filePath),
            fileSize: part.fileSize || 0,
            addedAt: new Date().toISOString(),
            status: 'pending', // pending | processing | completed | error
            textsCount: 0,
            wordsCount: 0,
            error: null
        };

        this.project.parts.push(partEntry);
        this.project.totalParts = this.project.parts.length;
        this.saveProject();
        return partEntry;
    }

    /**
     * Remove a part from the project
     */
    removePart(partId) {
        if (!this.project) return false;

        const partIndex = this.project.parts.findIndex(p => p.id === partId);
        if (partIndex === -1) return false;

        // Remove associated texts
        this.project.corpus.texts = this.project.corpus.texts.filter(t => t.partId !== partId);
        this.project.parts.splice(partIndex, 1);

        // Recalculate
        this._recalculateStats();
        this.saveProject();
        return true;
    }

    /**
     * Process a part — extract texts and add to corpus
     * @param {number} partId
     * @param {string} rawText - Extracted text from file
     * @param {Object} options - Processing options
     */
    processPart(partId, rawText, options = {}) {
        if (!this.project) return null;

        const part = this.project.parts.find(p => p.id === partId);
        if (!part) return null;

        part.status = 'processing';
        this.saveProject();

        try {
            // Segment text into units
            const texts = this._segmentText(rawText, partId, options);

            // Add texts to corpus
            const startIndex = this.project.corpus.texts.length;
            for (const text of texts) {
                text.globalIndex = startIndex + texts.indexOf(text) + 1;
                this.project.corpus.texts.push(text);
            }

            // Update part stats
            part.textsCount = texts.length;
            part.wordsCount = texts.reduce((sum, t) => sum + t.wordCount, 0);
            part.status = 'completed';

            // Recalculate global stats
            this._recalculateStats();
            this.saveProject();

            return {
                success: true,
                textsAdded: texts.length,
                wordsAdded: part.wordsCount,
                totalTexts: this.project.corpus.totalTexts,
                totalWords: this.project.corpus.totalWords
            };
        } catch (error) {
            part.status = 'error';
            part.error = error.message;
            this.saveProject();
            return { success: false, error: error.message };
        }
    }

    /**
     * Apply analysis criteria to all corpus texts (Track 2)
     * @param {Array} criteria - Array of criterion objects
     */
    applyCriteria(criteria) {
        if (!this.project || !this.project.corpus.texts.length) return null;

        this.project.analysis.criteria = criteria;
        this.project.analysis.results = [];

        let passedCount = 0;
        const criteriaImpact = {};
        criteria.forEach(c => { criteriaImpact[c.id] = { passed: 0, excluded: 0 }; });

        for (const text of this.project.corpus.texts) {
            const textResult = {
                textIndex: text.globalIndex,
                partId: text.partId,
                title: text.title,
                criteriaResults: {},
                passedAll: true
            };

            for (const criterion of criteria) {
                const passed = this._evaluateCriterion(text, criterion);
                textResult.criteriaResults[criterion.id] = passed;

                if (passed) {
                    criteriaImpact[criterion.id].passed++;
                } else {
                    criteriaImpact[criterion.id].excluded++;
                    textResult.passedAll = false;
                }
            }

            if (textResult.passedAll) passedCount++;
            this.project.analysis.results.push(textResult);
        }

        this.project.analysis.statistics = {
            totalTexts: this.project.corpus.totalTexts,
            passedTexts: passedCount,
            excludedTexts: this.project.corpus.totalTexts - passedCount,
            passRate: this.project.corpus.totalTexts > 0
                ? ((passedCount / this.project.corpus.totalTexts) * 100).toFixed(2) + '%'
                : '0%',
            criteriaImpact
        };

        this.saveProject();
        return this.project.analysis.statistics;
    }

    /**
     * Get project summary for dashboard
     */
    getSummary() {
        if (!this.project) return null;

        return {
            name: this.project.name,
            track: this.project.track,
            totalParts: this.project.totalParts,
            partsCompleted: this.project.parts.filter(p => p.status === 'completed').length,
            partsPending: this.project.parts.filter(p => p.status === 'pending').length,
            totalTexts: this.project.corpus.totalTexts,
            totalWords: this.project.corpus.totalWords,
            discourseTypes: this.project.corpus.discourseTypes,
            analysisStats: this.project.analysis.statistics,
            parts: this.project.parts.map(p => ({
                id: p.id,
                name: p.name,
                fileName: p.fileName,
                status: p.status,
                textsCount: p.textsCount,
                wordsCount: p.wordsCount
            }))
        };
    }

    /**
     * Export corpus to structured format
     * @param {string} format - 'json' | 'xlsx-data'
     */
    exportCorpus(format = 'xlsx-data') {
        if (!this.project) return null;

        if (format === 'json') {
            return {
                metadata: this.project.corpus.metadata,
                statistics: {
                    totalTexts: this.project.corpus.totalTexts,
                    totalWords: this.project.corpus.totalWords,
                    discourseTypes: this.project.corpus.discourseTypes
                },
                texts: this.project.corpus.texts.map(t => ({
                    index: t.globalIndex,
                    part: t.partId,
                    partName: t.partName,
                    title: t.title,
                    type: t.discourseType,
                    wordCount: t.wordCount,
                    content: t.content,
                    metadata: t.metadata
                }))
            };
        }

        // xlsx-data: return structured data for Excel generation
        return {
            // Sheet 1: Full corpus
            corpus: this.project.corpus.texts.map(t => ({
                '#': t.globalIndex,
                'الجزء': t.partId,
                'اسم الجزء': t.partName,
                'النمط': t.discourseType || '',
                'عدد الكلمات': t.wordCount,
                'عنوان النص': t.title,
                'المتن': t.content,
                // Add criteria results if analysis was done
                ...(this.project.analysis.results.length > 0 ? (() => {
                    const result = this.project.analysis.results.find(r => r.textIndex === t.globalIndex);
                    if (!result) return {};
                    const obj = {};
                    for (const [criterionId, passed] of Object.entries(result.criteriaResults)) {
                        const criterion = this.project.analysis.criteria.find(c => c.id === criterionId);
                        obj[criterion ? criterion.name : criterionId] = passed ? 'نعم' : 'لا';
                    }
                    obj['مُجتاز كاملاً'] = result.passedAll ? 'نعم' : 'لا';
                    return obj;
                })() : {})
            })),

            // Sheet 2: Statistics
            statistics: this._generateStatistics(),

            // Sheet 3: Dashboard
            dashboard: this._generateDashboard(),

            // Sheet 4: Procedure guide (auto-generated from criteria)
            procedureGuide: this._generateProcedureGuide(),

            // Sheet 5: Methodology
            methodology: this._generateMethodology()
        };
    }

    // ═══════════ Private Methods ═══════════

    /**
     * Segment raw text into individual text units
     */
    _segmentText(rawText, partId, options = {}) {
        const part = this.project.parts.find(p => p.id === partId);
        const partName = part ? part.name : `الجزء ${partId}`;
        const separator = options.separator || /\n{2,}/;
        const minWords = options.minWords || 10;

        const segments = rawText.split(separator).filter(s => s.trim().length > 0);
        const texts = [];

        for (let i = 0; i < segments.length; i++) {
            const content = segments[i].trim();
            const words = content.split(/\s+/).filter(w => w.length > 0);

            if (words.length < minWords) continue;

            // Extract title (first line or first 100 chars)
            const lines = content.split('\n');
            const title = lines[0].substring(0, 150).trim();

            // Detect discourse type from title keywords
            const discourseType = this._detectDiscourseType(title);

            texts.push({
                partId,
                partName,
                localIndex: i + 1,
                globalIndex: 0, // Set later
                title,
                content,
                wordCount: words.length,
                discourseType,
                metadata: {
                    source: part ? part.fileName : '',
                    page: null
                }
            });
        }

        return texts;
    }

    /**
     * Detect discourse type from title
     */
    _detectDiscourseType(title) {
        const types = {
            'خطاب': /خطاب|خُطبة|خطب/,
            'كلمة': /كلمة|كَلمة/,
            'تصريح': /تصريح|صرّح|تَصريح/,
            'حديث': /حديث|تحدث|حَديث/,
            'رسالة': /رسالة|رِسالة/,
            'مؤتمر': /مؤتمر|مُؤتمر/,
            'برقية': /برقية|بَرقية/,
            'بيان': /بيان|بَيان/,
            'حوار': /حوار|حِوار/,
            'مقابلة': /مقابلة|مُقابلة/,
            'بحث': /بحث|دراسة|ورقة/,
            'مقال': /مقال|مَقال/
        };

        for (const [type, regex] of Object.entries(types)) {
            if (regex.test(title)) return type;
        }
        return 'نص';
    }

    /**
     * Evaluate a single criterion against a text
     */
    _evaluateCriterion(text, criterion) {
        switch (criterion.type) {
            case 'keyword_exclusion':
                // Exclude if title contains any of the keywords
                return !criterion.keywords.some(kw =>
                    new RegExp(kw, 'i').test(text.title)
                );

            case 'type_exclusion':
                // Exclude specific discourse types
                return !criterion.excludeTypes.includes(text.discourseType);

            case 'min_words':
                // Minimum word count
                return text.wordCount >= (criterion.threshold || 30);

            case 'lexical_density':
                // Check lexical density of specific word lists
                return this._checkLexicalDensity(text, criterion);

            case 'compound':
                // Compound criterion (AND/OR of sub-criteria)
                if (criterion.logic === 'AND') {
                    return criterion.subCriteria.every(sub =>
                        this._evaluateCriterion(text, sub)
                    );
                } else {
                    return criterion.subCriteria.some(sub =>
                        this._evaluateCriterion(text, sub)
                    );
                }

            case 'regex':
                // Custom regex pattern
                const regex = new RegExp(criterion.pattern, criterion.flags || 'g');
                const matches = (text.content.match(regex) || []).length;
                return criterion.exclude
                    ? matches === 0
                    : matches >= (criterion.minMatches || 1);

            default:
                return true;
        }
    }

    /**
     * Check lexical density for a criterion
     */
    _checkLexicalDensity(text, criterion) {
        const words = text.content.split(/\s+/);
        const totalWords = words.length;
        if (totalWords === 0) return false;

        let matchCount = 0;
        for (const term of criterion.lexicon) {
            const regex = new RegExp(`(^|\\s)${term}(\\s|$|[،.؟!])`, 'g');
            const matches = text.content.match(regex);
            if (matches) matchCount += matches.length;
        }

        if (criterion.densityMode === 'count') {
            return matchCount >= (criterion.threshold || 2);
        } else {
            const density = (matchCount / totalWords) * 100;
            return density >= (criterion.threshold || 0.5);
        }
    }

    /**
     * Recalculate global statistics
     */
    _recalculateStats() {
        const texts = this.project.corpus.texts;
        this.project.corpus.totalTexts = texts.length;
        this.project.corpus.totalWords = texts.reduce((sum, t) => sum + t.wordCount, 0);

        // Discourse type distribution
        const types = {};
        for (const t of texts) {
            const type = t.discourseType || 'غير محدد';
            types[type] = (types[type] || 0) + 1;
        }
        this.project.corpus.discourseTypes = types;
    }

    /**
     * Generate statistics data for Excel export
     */
    _generateStatistics() {
        const stats = [];
        const corpus = this.project.corpus;
        const analysis = this.project.analysis;

        stats.push({ section: 'الإحصاء العام', indicator: 'إجمالي عدد النصوص', value: corpus.totalTexts, percentage: '100%' });
        if (analysis.statistics.passedTexts !== undefined) {
            stats.push({ section: '', indicator: 'النصوص المُجتازة', value: analysis.statistics.passedTexts, percentage: analysis.statistics.passRate });
            stats.push({ section: '', indicator: 'النصوص المستبعدة', value: analysis.statistics.excludedTexts, percentage: '' });
        }
        stats.push({ section: '', indicator: 'إجمالي الكلمات', value: corpus.totalWords, percentage: '' });
        stats.push({ section: '', indicator: 'متوسط كلمات النص', value: corpus.totalTexts > 0 ? Math.round(corpus.totalWords / corpus.totalTexts) : 0, percentage: '' });

        // Per-part distribution
        stats.push({ section: 'التوزيع حسب الجزء', indicator: '', value: '', percentage: '' });
        for (const part of this.project.parts) {
            stats.push({
                section: '',
                indicator: part.name,
                value: part.textsCount,
                percentage: corpus.totalTexts > 0 ? ((part.textsCount / corpus.totalTexts) * 100).toFixed(1) + '%' : '0%'
            });
        }

        // Discourse type distribution
        stats.push({ section: 'التوزيع حسب النمط', indicator: '', value: '', percentage: '' });
        for (const [type, count] of Object.entries(corpus.discourseTypes)) {
            stats.push({
                section: '',
                indicator: type,
                value: count,
                percentage: corpus.totalTexts > 0 ? ((count / corpus.totalTexts) * 100).toFixed(1) + '%' : '0%'
            });
        }

        return stats;
    }

    _generateDashboard() {
        const corpus = this.project.corpus;
        const analysis = this.project.analysis;
        return {
            totalTexts: corpus.totalTexts,
            passedTexts: analysis.statistics.passedTexts || 0,
            passRate: analysis.statistics.passRate || '—',
            totalWords: corpus.totalWords,
            avgWordsPerText: corpus.totalTexts > 0 ? Math.round(corpus.totalWords / corpus.totalTexts) : 0,
            discourseTypes: Object.keys(corpus.discourseTypes).length,
            partsCount: this.project.totalParts,
            criteriaCount: analysis.criteria.length
        };
    }

    _generateProcedureGuide() {
        return this.project.analysis.criteria.map((c, i) => ({
            step: `${i + 1}`,
            criterion: c.name,
            theory: c.theory || '',
            procedure: c.description || '',
            output: c.outputDescription || ''
        }));
    }

    _generateMethodology() {
        const refs = new Set();
        for (const c of this.project.analysis.criteria) {
            if (c.references) {
                c.references.forEach(r => refs.add(r));
            }
        }
        return {
            source: this.project.corpus.metadata.source || this.project.name,
            criteria: this.project.analysis.criteria.map(c => ({
                name: c.name,
                theory: c.theory || '',
                description: c.description || ''
            })),
            references: Array.from(refs)
        };
    }
}

module.exports = { CorpusManager };
