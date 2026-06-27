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

        // Build criteria columns map
        const hasCriteria = this.project.analysis.results.length > 0;
        const criteriaNames = hasCriteria
            ? this.project.analysis.criteria.map(c => c.name)
            : [];

        // xlsx-data: return structured data for Excel generation
        return {
            projectName: this.project.name || 'مشروع سَبْر',

            // Sheet 1: Full corpus with criteria results and source file
            corpus: this.project.corpus.texts.map(t => {
                const row = {
                    '#': t.globalIndex,
                    'الجزء': t.partId,
                    'الجزء ': t.partName,
                    'النَّمط': t.discourseType || 'نص',
                    'عدد الكلمات': t.wordCount
                };

                // Add criteria results if analysis was done
                if (hasCriteria) {
                    const result = this.project.analysis.results.find(r => r.textIndex === t.globalIndex);
                    if (result) {
                        for (const criterion of this.project.analysis.criteria) {
                            row[criterion.name] = result.criteriaResults[criterion.id] ? 'نعم' : 'لا';
                        }
                        row['مُجتاز كاملاً'] = result.passedAll ? 'نعم' : 'لا';
                    } else {
                        for (const criterion of this.project.analysis.criteria) {
                            row[criterion.name] = '—';
                        }
                        row['مُجتاز كاملاً'] = '—';
                    }
                }

                row['عنوان النص'] = t.title;
                row['مَتن النص كاملاً'] = t.content;
                row['ملف المصدر'] = (t.metadata && t.metadata.source) || '';

                return row;
            }),

            // Sheet 2: Statistics
            statistics: this._generateStatistics(),

            // Sheet 3: Procedure guide
            procedureGuide: this._generateProcedureGuide(),

            // Sheet 4: Methodology
            methodology: this._generateMethodology(),

            // Sheet 5: Dashboard
            dashboard: this._generateDashboard()
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
        const corpus = this.project.corpus;
        const analysis = this.project.analysis;
        const projectName = this.project.name || 'مشروع سَبْر';
        const avgWords = corpus.totalTexts > 0 ? Math.round(corpus.totalWords / corpus.totalTexts) : 0;
        const numTypes = Object.keys(corpus.discourseTypes).length;

        // Structured sections for richer output
        return {
            title: `التحليل الإحصائي لمدونة "${projectName}"`,
            sections: [
                {
                    name: 'الإحصاء العام للمدونة',
                    rows: [
                        { indicator: 'إجمالي عدد النصوص', value: corpus.totalTexts.toLocaleString('ar-SA'), percentage: '100%' },
                        ...(analysis.statistics.passedTexts !== undefined ? [
                            { indicator: 'النصوص المُجتازة', value: String(analysis.statistics.passedTexts), percentage: analysis.statistics.passRate || '' },
                            { indicator: 'النصوص المستبعدة', value: String(analysis.statistics.excludedTexts || (corpus.totalTexts - analysis.statistics.passedTexts)), percentage: '' }
                        ] : []),
                        { indicator: 'إجمالي الكلمات', value: corpus.totalWords.toLocaleString('ar-SA'), percentage: '' },
                        { indicator: 'متوسط كلمات النص', value: avgWords.toLocaleString('ar-SA'), percentage: '' },
                        { indicator: 'عدد الأجزاء', value: String(this.project.totalParts), percentage: '' },
                        { indicator: 'الأنماط الخطابية', value: String(numTypes), percentage: '' }
                    ]
                },
                {
                    name: 'التوزيع حسب الجزء',
                    rows: this.project.parts.map(p => ({
                        indicator: p.name,
                        value: String(p.textsCount),
                        percentage: corpus.totalTexts > 0 ? ((p.textsCount / corpus.totalTexts) * 100).toFixed(2) + '%' : '0%',
                        words: p.wordsCount ? p.wordsCount.toLocaleString('ar-SA') : ''
                    }))
                },
                {
                    name: 'التوزيع حسب النمط الخطابي',
                    rows: Object.entries(corpus.discourseTypes)
                        .sort((a, b) => b[1] - a[1])
                        .map(([type, count]) => ({
                            indicator: type,
                            value: String(count),
                            percentage: corpus.totalTexts > 0 ? ((count / corpus.totalTexts) * 100).toFixed(2) + '%' : '0%'
                        }))
                },
                ...(analysis.criteria.length > 0 ? [{
                    name: 'أثر المعايير على الاستبعاد',
                    rows: analysis.criteria.map(c => {
                        const impact = analysis.statistics.criteriaImpact ? analysis.statistics.criteriaImpact[c.id] : null;
                        return {
                            indicator: c.name,
                            value: impact ? `اجتاز: ${impact.passed} | استُبعد: ${impact.excluded}` : '—',
                            percentage: impact && corpus.totalTexts > 0 ? ((impact.excluded / corpus.totalTexts) * 100).toFixed(2) + '% استبعاد' : ''
                        };
                    })
                }] : [])
            ]
        };
    }

    _generateDashboard() {
        const corpus = this.project.corpus;
        const analysis = this.project.analysis;
        const avgWords = corpus.totalTexts > 0 ? Math.round(corpus.totalWords / corpus.totalTexts) : 0;
        const numTypes = Object.keys(corpus.discourseTypes).length;

        return {
            title: `لوحة المعلومات — مدونة "${this.project.name || 'مشروع سَبْر'}"`,
            summary: {
                'إجمالي النصوص': String(corpus.totalTexts),
                'النصوص المُجتازة': analysis.statistics.passedTexts !== undefined ? String(analysis.statistics.passedTexts) : '—',
                'نسبة الاجتياز': analysis.statistics.passRate || '—',
                'إجمالي الكلمات': corpus.totalWords.toLocaleString('ar-SA'),
                'متوسط كلمات النص': avgWords.toLocaleString('ar-SA'),
                'الأنماط الخطابية': String(numTypes)
            },
            partsTable: this.project.parts.map(p => ({
                'الجزء': p.name,
                'عدد النصوص': p.textsCount,
                'عدد الكلمات': p.wordsCount ? p.wordsCount.toLocaleString('ar-SA') : '—',
                'الملف': p.fileName
            })),
            typesTable: Object.entries(corpus.discourseTypes)
                .sort((a, b) => b[1] - a[1])
                .map(([type, count]) => ({
                    'النمط': type,
                    'العدد': count,
                    'النسبة': corpus.totalTexts > 0 ? ((count / corpus.totalTexts) * 100).toFixed(2) + '%' : '0%'
                }))
        };
    }

    _generateProcedureGuide() {
        const criteria = this.project.analysis.criteria;

        if (criteria.length > 0) {
            return {
                title: `دليل الإجراء التفصيلي لتطبيق المعايير الانتقائية — "${this.project.name || 'مشروع سَبْر'}"`,
                steps: criteria.map((c, i) => ({
                    step: `${i + 1}.1`,
                    procedure: c.description || c.name,
                    application: this._describeCriterionApplication(c),
                    output: c.outputDescription || this._describeCriterionOutput(c)
                }))
            };
        }

        // Default procedure guide when no criteria configured
        return {
            title: `دليل الإجراء التفصيلي — "${this.project.name || 'مشروع سَبْر'}"`,
            steps: [
                { step: '1', procedure: 'جمع النصوص وتقسيمها إلى أجزاء', application: 'إضافة ملفات المصدر (PDF/TXT/MD) وتحديد أسماء الأجزاء', output: 'مدونة خام مقسّمة إلى نصوص فردية مع بيانات وصفية' },
                { step: '2', procedure: 'معالجة الملفات واستخلاص النصوص', application: 'استخراج النصوص تلقائيًا وتصنيف الأنماط الخطابية', output: 'نصوص مفهرسة بعدد الكلمات والنمط والعنوان' },
                { step: '3', procedure: 'تهيئة المعايير الانتقائية', application: 'تحديد معايير الاستبعاد والشمول (كلمات مفتاحية، أنماط، حدود دنيا)', output: 'قائمة معايير جاهزة للتطبيق' },
                { step: '4', procedure: 'تطبيق المعايير على المدونة', application: 'تشغيل المعايير على جميع النصوص وحساب نتائج الاجتياز', output: 'نتائج الاجتياز لكل نص وإحصائيات الاستبعاد' },
                { step: '5', procedure: 'مراجعة النتائج وتصدير المدونة', application: 'فحص الإحصائيات وتصدير المدونة المنقّحة كملف Excel', output: 'ملف Excel بخمس أوراق عمل شامل' }
            ]
        };
    }

    _describeCriterionApplication(c) {
        switch (c.type) {
            case 'keyword_exclusion': return `فحص عنوان النص بحثًا عن عبارات: ${(c.keywords || []).map(k => '«' + k + '»').join('، ')}`;
            case 'type_exclusion': return `استبعاد النصوص من الأنماط: ${(c.excludeTypes || []).join('، ')}`;
            case 'min_words': return `التحقق من أن عدد كلمات النص ≥ ${c.threshold || 30}`;
            case 'lexical_density': return `فحص الكثافة المعجمية (${c.densityMode === 'count' ? 'عدد' : 'نسبة'} ≥ ${c.threshold})`;
            case 'regex': return `تطبيق نمط تعبير منتظم: ${c.pattern || ''}`;
            case 'compound': return `معيار مُركّب (${c.logic || 'AND'}) من ${(c.subCriteria || []).length} معايير فرعية`;
            default: return c.description || '';
        }
    }

    _describeCriterionOutput(c) {
        switch (c.type) {
            case 'keyword_exclusion': return 'استبعاد النصوص التي تحتوي على الكلمات المفتاحية المحددة';
            case 'type_exclusion': return 'استبعاد أنماط خطابية بعينها';
            case 'min_words': return 'استبعاد النصوص الأقصر من الحد الأدنى';
            case 'lexical_density': return 'تقييم الكثافة المعجمية لكل نص';
            default: return 'تطبيق المعيار وتسجيل النتيجة';
        }
    }

    _generateMethodology() {
        const projectName = this.project.name || 'مشروع سَبْر';
        const corpus = this.project.corpus;
        const analysis = this.project.analysis;
        const avgWords = corpus.totalTexts > 0 ? Math.round(corpus.totalWords / corpus.totalTexts) : 0;

        const rows = [
            { element: 'المنهجية البحثية', details: `المنهجية البحثية لاختيار عيّنة "${projectName}"` },
            { element: '', details: '' },
            { element: '1. مصدر البيانات', details: `تَستند الدراسة إلى ${this.project.totalParts} ملف/ملفات مصدر تمثل "${projectName}".` },
            { element: '', details: `المدونة الأصليّة تضمّ ${corpus.totalTexts} نصًا موزّعة على ${this.project.totalParts} أجزاء بإجمالي ${corpus.totalWords.toLocaleString('ar-SA')} كلمة.` },
            { element: '', details: '' },
            { element: '2. أنماط الخطاب', details: `تم تصنيف النصوص إلى ${Object.keys(corpus.discourseTypes).length} أنماط خطابية:` },
        ];

        // Add discourse types
        for (const [type, count] of Object.entries(corpus.discourseTypes).sort((a, b) => b[1] - a[1])) {
            const pct = corpus.totalTexts > 0 ? ((count / corpus.totalTexts) * 100).toFixed(1) : '0';
            rows.push({ element: '', details: `• ${type}: ${count} نص (${pct}%)` });
        }

        rows.push({ element: '', details: '' });
        rows.push({ element: '3. حجم المدونة', details: `إجمالي الكلمات: ${corpus.totalWords.toLocaleString('ar-SA')} — متوسط الكلمات لكل نص: ${avgWords}` });

        if (analysis.criteria.length > 0) {
            rows.push({ element: '', details: '' });
            rows.push({ element: '4. المعايير الانتقائية', details: `تم تطبيق ${analysis.criteria.length} معيار/معايير لتنقيح المدونة:` });
            for (const c of analysis.criteria) {
                rows.push({ element: '', details: `• ${c.name}: ${c.description || this._describeCriterionApplication(c)}` });
            }
            if (analysis.statistics.passedTexts !== undefined) {
                rows.push({ element: '', details: '' });
                rows.push({ element: '5. نتائج التنقيح', details: `اجتازت ${analysis.statistics.passedTexts} نصًا جميع المعايير (${analysis.statistics.passRate}) من أصل ${corpus.totalTexts} نصًا.` });
            }
        }

        rows.push({ element: '', details: '' });
        rows.push({ element: analysis.criteria.length > 0 ? '6. أداة المعالجة' : '4. أداة المعالجة', details: 'تطبيق سَبْر (Sabr v5.0) — محلل الخطاب التداولي العربي' });
        rows.push({ element: '', details: `تاريخ التصدير: ${new Date().toLocaleDateString('ar-SA', { year: 'numeric', month: 'long', day: 'numeric' })}` });

        return rows;
    }
}

module.exports = { CorpusManager };
