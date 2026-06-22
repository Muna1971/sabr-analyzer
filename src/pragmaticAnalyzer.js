// Pragmatic Analyzer - Discourse markers, speech acts, and linguistic tools
// Bilingual: Arabic + English

import { normalizeArabic, detectLanguage } from './analyzer.js';

// ============ ARABIC PRAGMATIC CATEGORIES ============

const arabicCategories = {
    discourseMarkers: {
        nameAr: 'علامات الخطاب',
        nameEn: 'Discourse Markers',
        subcategories: {
            concession: {
                nameAr: 'الاستدراك',
                nameEn: 'Concession',
                items: ['لكن', 'لكنّ', 'غير أن', 'إلا أن', 'على الرغم', 'بالرغم', 'رغم', 'بيد أن', 'ومع ذلك', 'إلا أنه', 'إلا أنها', 'على أن', 'غير أنه', 'مع أن', 'مع أنه']
            },
            causation: {
                nameAr: 'التعليل',
                nameEn: 'Causation',
                items: ['لأن', 'لأنه', 'لأنها', 'بسبب', 'إذ', 'حيث إن', 'نظرا', 'نظراً', 'بحكم', 'بفضل', 'نتيجة', 'جراء', 'بفعل', 'علة', 'كون']
            },
            result: {
                nameAr: 'النتيجة',
                nameEn: 'Result',
                items: ['لذلك', 'لذا', 'وبالتالي', 'بالتالي', 'فإن', 'من ثم', 'إذن', 'وعليه', 'ومن هنا', 'وبناء على ذلك', 'تبعا لذلك', 'مما أدى', 'مما يعني']
            },
            addition: {
                nameAr: 'الإضافة',
                nameEn: 'Addition',
                items: ['فضلا عن', 'فضلاً عن', 'بالإضافة', 'إضافة إلى', 'علاوة على', 'كذلك', 'أيضا', 'أيضاً', 'فوق ذلك', 'إلى جانب', 'ناهيك عن', 'هذا فضلا']
            },
            emphasis: {
                nameAr: 'التأكيد',
                nameEn: 'Emphasis',
                items: ['بالفعل', 'حقا', 'حقاً', 'لا شك', 'بالتأكيد', 'فعلا', 'فعلاً', 'بلا ريب', 'يقينا', 'يقيناً', 'حتما', 'حتماً', 'بلا شك', 'من المؤكد']
            },
            exemplification: {
                nameAr: 'التمثيل',
                nameEn: 'Exemplification',
                items: ['مثل', 'مثلا', 'مثلاً', 'على سبيل المثال', 'من ذلك', 'من بينها', 'كقولنا', 'نحو', 'من قبيل', 'كما في']
            },
            sequence: {
                nameAr: 'الترتيب',
                nameEn: 'Sequence',
                items: ['أولا', 'أولاً', 'ثانيا', 'ثانياً', 'ثالثا', 'ثالثاً', 'أخيرا', 'أخيراً', 'في البداية', 'بعد ذلك', 'ثم إن', 'فيما بعد', 'في النهاية', 'بداية', 'ختاما', 'ختاماً']
            },
            conclusion: {
                nameAr: 'الخلاصة',
                nameEn: 'Conclusion',
                items: ['في الختام', 'خلاصة القول', 'إجمالا', 'إجمالاً', 'بصفة عامة', 'وفي النهاية', 'مجمل القول', 'خلاصته', 'نخلص إلى', 'يتضح مما سبق', 'مما تقدم']
            }
        }
    },
    speechActs: {
        nameAr: 'أفعال الكلام',
        nameEn: 'Speech Acts',
        subcategories: {
            assertives: {
                nameAr: 'الإخبار والتقرير',
                nameEn: 'Assertives',
                items: ['أخبر', 'أعلن', 'ذكر', 'أفاد', 'قال', 'صرح', 'صرّح', 'بين', 'بيّن', 'أوضح', 'أكد', 'أكّد', 'أشار', 'لاحظ', 'رأى', 'اعتبر', 'وصف', 'أبان', 'كشف', 'نوّه', 'نوه', 'أبدى']
            },
            directives: {
                nameAr: 'الطلب والتوجيه',
                nameEn: 'Directives',
                items: ['طلب', 'رجا', 'التمس', 'ناشد', 'دعا', 'حث', 'حثّ', 'أمر', 'نصح', 'أوصى', 'اقترح', 'نادى', 'استدعى', 'وجه', 'وجّه', 'طالب', 'ناشد']
            },
            commissives: {
                nameAr: 'الوعد والالتزام',
                nameEn: 'Commissives',
                items: ['وعد', 'تعهد', 'التزم', 'ضمن', 'تكفل', 'عاهد', 'آلى', 'أقسم', 'حلف', 'عزم']
            },
            expressives: {
                nameAr: 'التعبير الوجداني',
                nameEn: 'Expressives',
                items: ['شكر', 'قدر', 'قدّر', 'أثنى', 'اعتذر', 'أسف', 'تأسف', 'هنأ', 'بارك', 'رحب', 'أعرب', 'عبر', 'عبّر', 'امتن', 'سُر', 'فرح', 'حزن', 'أسِف']
            },
            declaratives: {
                nameAr: 'الإعلان والتصريح',
                nameEn: 'Declaratives',
                items: ['أعلن', 'صرح', 'صرّح', 'نطق', 'أصدر', 'أذاع', 'أفصح', 'باح', 'كرّس', 'أسس']
            },
            warnings: {
                nameAr: 'التحذير والإنذار',
                nameEn: 'Warnings',
                items: ['حذر', 'حذّر', 'نبه', 'نبّه', 'أنذر', 'خوف', 'خوّف', 'حاذر']
            },
            negation_acts: {
                nameAr: 'النفي والإنكار',
                nameEn: 'Denial',
                items: ['نفى', 'أنكر', 'رفض', 'جحد', 'استنكر', 'كذب', 'كذّب', 'دحض']
            }
        }
    },
    interrogatives: {
        nameAr: 'أدوات الاستفهام',
        nameEn: 'Interrogatives',
        subcategories: {
            tools: {
                nameAr: 'أدوات الاستفهام',
                nameEn: 'Question Words',
                items: ['هل', 'ما', 'ماذا', 'من', 'أين', 'متى', 'كيف', 'لماذا', 'أي', 'كم', 'أنى', 'أنّى', 'أيان']
            }
        }
    },
    negation: {
        nameAr: 'أدوات النفي',
        nameEn: 'Negation Tools',
        subcategories: {
            tools: {
                nameAr: 'أدوات النفي',
                nameEn: 'Negation Particles',
                items: ['لا', 'لم', 'لن', 'ما', 'ليس', 'ليست', 'ليسوا', 'غير', 'بدون', 'دون', 'عدم', 'لما', 'لمّا']
            }
        }
    },
    logicalConnectors: {
        nameAr: 'الروابط المنطقية',
        nameEn: 'Logical Connectors',
        subcategories: {
            conditional: {
                nameAr: 'الشرط',
                nameEn: 'Conditional',
                items: ['إذا', 'لو', 'إن', 'متى', 'كلما', 'حيثما', 'أينما', 'مهما', 'لولا', 'لوما', 'أما', 'إذا ما', 'حين', 'حينما']
            }
        }
    },
    assertionTools: {
        nameAr: 'أدوات التوكيد',
        nameEn: 'Assertion Tools',
        subcategories: {
            tools: {
                nameAr: 'أدوات التوكيد',
                nameEn: 'Emphatic Particles',
                items: ['إن', 'إنّ', 'أن', 'أنّ', 'قد', 'لقد', 'نعم', 'أجل', 'بلى', 'حقا', 'حقاً', 'فعلا', 'فعلاً', 'بالتأكيد', 'بالطبع', 'طبعا', 'طبعاً']
            }
        }
    }
};

// ============ ENGLISH PRAGMATIC CATEGORIES ============

const englishCategories = {
    discourseMarkers: {
        nameAr: 'علامات الخطاب',
        nameEn: 'Discourse Markers',
        subcategories: {
            contrast: {
                nameAr: 'التناقض',
                nameEn: 'Contrast',
                items: ['however', 'although', 'nevertheless', 'nonetheless', 'yet', 'on the other hand', 'conversely', 'in contrast', 'on the contrary', 'whereas', 'while', 'despite', 'in spite of', 'notwithstanding']
            },
            cause: {
                nameAr: 'السبب',
                nameEn: 'Cause',
                items: ['because', 'since', 'due to', 'as a result of', 'owing to', 'on account of', 'thanks to', 'given that', 'seeing that', 'inasmuch as']
            },
            result: {
                nameAr: 'النتيجة',
                nameEn: 'Result',
                items: ['therefore', 'consequently', 'thus', 'hence', 'as a result', 'accordingly', 'so', 'for this reason', 'it follows that', 'that is why']
            },
            addition: {
                nameAr: 'الإضافة',
                nameEn: 'Addition',
                items: ['furthermore', 'moreover', 'in addition', 'additionally', 'besides', 'what is more', 'not only', 'also', 'equally', 'likewise', 'similarly']
            },
            emphasis: {
                nameAr: 'التأكيد',
                nameEn: 'Emphasis',
                items: ['indeed', 'certainly', 'in fact', 'of course', 'undoubtedly', 'without doubt', 'clearly', 'obviously', 'evidently', 'notably', 'significantly']
            },
            example: {
                nameAr: 'التمثيل',
                nameEn: 'Example',
                items: ['for example', 'such as', 'for instance', 'namely', 'specifically', 'in particular', 'to illustrate', 'that is', 'i.e.', 'e.g.']
            },
            sequence: {
                nameAr: 'الترتيب',
                nameEn: 'Sequence',
                items: ['firstly', 'secondly', 'thirdly', 'finally', 'then', 'next', 'subsequently', 'afterwards', 'meanwhile', 'in the first place', 'to begin with', 'lastly']
            },
            conclusion: {
                nameAr: 'الخلاصة',
                nameEn: 'Conclusion',
                items: ['in conclusion', 'to sum up', 'overall', 'in summary', 'to conclude', 'all in all', 'on the whole', 'in brief', 'ultimately', 'in short']
            }
        }
    },
    speechActs: {
        nameAr: 'أفعال الكلام',
        nameEn: 'Speech Acts',
        subcategories: {
            assertives: {
                nameAr: 'الإخبار',
                nameEn: 'Assertives',
                items: ['state', 'states', 'stated', 'claim', 'claims', 'claimed', 'assert', 'asserts', 'asserted', 'declare', 'declares', 'declared', 'report', 'reports', 'reported', 'inform', 'informs', 'informed', 'mention', 'mentions', 'mentioned', 'note', 'notes', 'noted', 'observe', 'observes', 'observed', 'describe', 'describes', 'described', 'explain', 'explains', 'explained']
            },
            directives: {
                nameAr: 'التوجيه',
                nameEn: 'Directives',
                items: ['request', 'requests', 'requested', 'command', 'commands', 'commanded', 'ask', 'asks', 'asked', 'advise', 'advises', 'advised', 'recommend', 'recommends', 'recommended', 'order', 'orders', 'ordered', 'suggest', 'suggests', 'suggested', 'urge', 'urges', 'urged', 'instruct', 'instructs', 'instructed']
            },
            commissives: {
                nameAr: 'الوعد',
                nameEn: 'Commissives',
                items: ['promise', 'promises', 'promised', 'pledge', 'pledges', 'pledged', 'guarantee', 'guarantees', 'guaranteed', 'vow', 'vows', 'vowed', 'commit', 'commits', 'committed', 'swear', 'swears', 'swore', 'sworn']
            },
            expressives: {
                nameAr: 'التعبير',
                nameEn: 'Expressives',
                items: ['thank', 'thanks', 'thanked', 'apologize', 'apologizes', 'apologized', 'congratulate', 'congratulates', 'congratulated', 'welcome', 'welcomes', 'welcomed', 'praise', 'praises', 'praised', 'regret', 'regrets', 'regretted', 'appreciate', 'appreciates', 'appreciated']
            },
            declaratives: {
                nameAr: 'الإعلان',
                nameEn: 'Declaratives',
                items: ['declare', 'declares', 'declared', 'announce', 'announces', 'announced', 'pronounce', 'pronounces', 'pronounced', 'decree', 'decrees', 'decreed', 'proclaim', 'proclaims', 'proclaimed']
            }
        }
    },
    interrogatives: {
        nameAr: 'الاستفهام',
        nameEn: 'Interrogatives',
        subcategories: {
            tools: {
                nameAr: 'أدوات الاستفهام',
                nameEn: 'Question Words',
                items: ['what', 'who', 'where', 'when', 'why', 'how', 'which', 'whose', 'whom']
            }
        }
    },
    negation: {
        nameAr: 'النفي',
        nameEn: 'Negation',
        subcategories: {
            tools: {
                nameAr: 'أدوات النفي',
                nameEn: 'Negation Words',
                items: ['not', 'no', 'never', 'neither', 'nor', 'nothing', 'none', 'nobody', 'nowhere', 'hardly', 'scarcely', 'barely', 'seldom', 'rarely']
            }
        }
    },
    logicalConnectors: {
        nameAr: 'الروابط المنطقية',
        nameEn: 'Logical Connectors',
        subcategories: {
            conditional: {
                nameAr: 'الشرط',
                nameEn: 'Conditional',
                items: ['if', 'unless', 'provided that', 'as long as', 'whether', 'whenever', 'wherever', 'in case', 'even if', 'only if', 'supposing']
            }
        }
    },
    assertionTools: {
        nameAr: 'التوكيد',
        nameEn: 'Assertion',
        subcategories: {
            tools: {
                nameAr: 'أدوات التوكيد',
                nameEn: 'Emphatic Words',
                items: ['indeed', 'certainly', 'surely', 'definitely', 'absolutely', 'of course', 'undoubtedly', 'clearly', 'obviously', 'truly', 'really', 'actually']
            }
        }
    }
};

// ============ ANALYSIS ENGINE ============

// Arabic-aware word boundary: \b doesn't work with Arabic characters in JS regex
// We use lookahead/lookbehind with whitespace, punctuation, and string boundaries
const AR_BOUNDARY_BEFORE = '(?:^|[\\s\\u060C\\u061B\\u061F\\u0021-\\u002F\\u003A-\\u0040\\u005B-\\u0060\\u007B-\\u007E\\u00AB\\u00BB\\u2018-\\u201F\\u2026\\u0964\\u0965«»""\\.\\,\\!\\?\\؟\\،\\؛\\:\\(\\)\\[\\]\\{\\}])';
const AR_BOUNDARY_AFTER = '(?=$|[\\s\\u060C\\u061B\\u061F\\u0021-\\u002F\\u003A-\\u0040\\u005B-\\u0060\\u007B-\\u007E\\u00AB\\u00BB\\u2018-\\u201F\\u2026\\u0964\\u0965«»""\\.\\,\\!\\?\\؟\\،\\؛\\:\\(\\)\\[\\]\\{\\}])';

function isArabic(text) {
    return /[\u0600-\u06FF]/.test(text);
}

function findInText(text, phrase) {
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    let regex;
    if (isArabic(phrase)) {
        // For Arabic: use custom boundaries (spaces, punctuation, start/end)
        // Also strip diacritics from both text and phrase for matching
        const diacriticsRegex = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06DC\u06DF-\u06E4\u06E7\u06E8\u06EA-\u06ED]/g;
        const cleanText = text.replace(diacriticsRegex, '');
        const cleanPhrase = phrase.replace(diacriticsRegex, '');
        const cleanEscaped = cleanPhrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

        regex = new RegExp(AR_BOUNDARY_BEFORE + cleanEscaped + AR_BOUNDARY_AFTER, 'gi');

        const matches = [];
        let match;
        while ((match = regex.exec(cleanText)) !== null) {
            matches.push({
                index: match.index,
                matched: match[0]
            });
        }
        return matches;
    } else {
        // For English: \b works fine
        regex = new RegExp('\\b' + escaped + '\\b', 'gi');
    }

    const matches = [];
    let match;

    while ((match = regex.exec(text)) !== null) {
        matches.push({
            index: match.index,
            matched: match[0]
        });
    }

    return matches;
}

function extractSentenceContext(text, index, matchLength) {
    // Find sentence boundaries
    const before = text.substring(Math.max(0, index - 150), index);
    const after = text.substring(index + matchLength, Math.min(text.length, index + matchLength + 150));

    const sentenceStart = before.lastIndexOf('.') !== -1 ? before.lastIndexOf('.') + 1 :
        before.lastIndexOf('؟') !== -1 ? before.lastIndexOf('؟') + 1 :
        before.lastIndexOf('!') !== -1 ? before.lastIndexOf('!') + 1 :
        before.lastIndexOf('\n') !== -1 ? before.lastIndexOf('\n') + 1 : 0;

    const sentenceEnd = ['.', '؟', '!', '\n'].reduce((min, char) => {
        const idx = after.indexOf(char);
        return idx !== -1 && idx < min ? idx : min;
    }, after.length);

    const contextBefore = before.substring(sentenceStart).trim();
    const contextAfter = after.substring(0, sentenceEnd).trim();
    const matched = text.substring(index, index + matchLength);

    return `${contextBefore} [${matched}] ${contextAfter}`;
}

function analyzeCategory(text, categories) {
    const results = {};
    // For context extraction, use original text; for matching, findInText handles diacritics internally
    const diacriticsRegex = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06DC\u06DF-\u06E4\u06E7\u06E8\u06EA-\u06ED]/g;
    const cleanText = text.replace(diacriticsRegex, '');

    for (const [catKey, category] of Object.entries(categories)) {
        const catResult = {
            nameAr: category.nameAr,
            nameEn: category.nameEn,
            totalCount: 0,
            subcategories: {}
        };

        for (const [subKey, subcategory] of Object.entries(category.subcategories)) {
            const subResult = {
                nameAr: subcategory.nameAr,
                nameEn: subcategory.nameEn,
                totalCount: 0,
                items: []
            };

            for (const item of subcategory.items) {
                const matches = findInText(text, item);
                if (matches.length > 0) {
                    const contexts = matches.slice(0, 5).map(m =>
                        extractSentenceContext(cleanText, m.index, m.matched.length)
                    );

                    subResult.items.push({
                        word: item,
                        count: matches.length,
                        contexts: contexts
                    });
                    subResult.totalCount += matches.length;
                }
            }

            // Sort items by count
            subResult.items.sort((a, b) => b.count - a.count);
            catResult.subcategories[subKey] = subResult;
            catResult.totalCount += subResult.totalCount;
        }

        results[catKey] = catResult;
    }

    return results;
}

// Main pragmatic analysis function
function analyzePragmatics(text) {
    const language = detectLanguage(text);

    let categories;
    if (language === 'arabic') {
        categories = arabicCategories;
    } else if (language === 'english') {
        categories = englishCategories;
    } else {
        // Mixed: analyze both
        const arabicResults = analyzeCategory(text, arabicCategories);
        const englishResults = analyzeCategory(text, englishCategories);

        // Merge results
        const merged = {};
        for (const key of Object.keys(arabicCategories)) {
            merged[key] = {
                nameAr: arabicCategories[key].nameAr,
                nameEn: arabicCategories[key].nameEn,
                totalCount: (arabicResults[key]?.totalCount || 0) + (englishResults[key]?.totalCount || 0),
                subcategories: {
                    ...arabicResults[key]?.subcategories,
                    ...englishResults[key]?.subcategories
                }
            };
        }

        return {
            language,
            results: merged,
            totalPragmaticItems: Object.values(merged).reduce((sum, cat) => sum + cat.totalCount, 0)
        };
    }

    const results = analyzeCategory(text, categories);

    return {
        language,
        results,
        totalPragmaticItems: Object.values(results).reduce((sum, cat) => sum + cat.totalCount, 0)
    };
}

export {
    analyzePragmatics,
    arabicCategories,
    englishCategories
};
