// Stopwords Module - Arabic & English
// Comprehensive lists for linguistic analysis

const arabicStopwords = [
    // حروف الجر
    'في', 'من', 'إلى', 'الى', 'على', 'عن', 'مع', 'بين', 'حتى', 'منذ', 'خلال', 'عند', 'لدى',
    'نحو', 'ضد', 'عبر', 'دون', 'بدون', 'سوى', 'عدا', 'حول', 'تحت', 'فوق', 'ضمن', 'بعد', 'قبل',
    // حروف العطف
    'أو', 'ثم', 'بل', 'أم', 'لا',
    // الضمائر المنفصلة
    'هو', 'هي', 'هم', 'هن', 'أنا', 'نحن', 'أنت', 'أنتم', 'أنتِ', 'أنتن', 'أنتما', 'هما',
    // أدوات الإشارة
    'هذا', 'هذه', 'ذلك', 'تلك', 'هؤلاء', 'أولئك', 'هذان', 'هاتان',
    // الأسماء الموصولة
    'الذي', 'التي', 'الذين', 'اللاتي', 'اللواتي', 'اللذان', 'اللتان',
    // أفعال الكون والكينونة
    'كان', 'كانت', 'كانوا', 'يكون', 'تكون', 'يكونون', 'ليس', 'ليست', 'ليسوا',
    'أصبح', 'أصبحت', 'أمسى', 'أمست', 'بات', 'باتت', 'صار', 'صارت', 'ظل', 'ظلت',
    // أدوات متنوعة
    'إن', 'أن', 'ما', 'كما', 'أيضا', 'أيضاً', 'ذات', 'كل', 'كذلك', 'غير',
    'كأن', 'حيث', 'إذ', 'أما', 'هنا', 'هناك', 'الآن', 'فقط', 'أي',
    'بعض', 'كثير', 'جدا', 'جداً', 'أكثر', 'أقل', 'حوالي', 'سواء', 'إما',
    'لو', 'لولا', 'مثل', 'مما', 'مع', 'عليه', 'عليها', 'عنه', 'عنها',
    'فيه', 'فيها', 'منه', 'منها', 'به', 'بها', 'له', 'لها', 'لهم', 'لهن',
    'إلا', 'لكن', 'لكنه', 'لكنها', 'حين', 'حينما', 'عندما',
    'كيف', 'أين', 'متى', 'كم',
    'ذا', 'ذي', 'تلكم', 'ثمة',
    'قد', 'لقد', 'سوف',
    'يا', 'أيها', 'أيتها',
    'الذ', 'وهو', 'وهي', 'وهم', 'وأن', 'وإن', 'ومن', 'وفي', 'وعلى',
    'ولا', 'ولم', 'ولن', 'بأن', 'بما', 'فإن', 'فلا',
    'هل', 'ماذا', 'لماذا', 'أنّى',
    // أدوات النفي
    'لم', 'لن', 'عدم',
    // كلمات وظيفية شائعة
    'ذلكم', 'هكذا', 'أولا', 'أولاً', 'ثانيا', 'ثانياً', 'أخيرا', 'أخيراً',
    'كانا', 'كنت', 'كنا', 'كنتم',
    'يمكن', 'ينبغي', 'يجب',
    'تم', 'تمت', 'يتم',
    'وقد', 'فقد', 'وكان', 'وكانت',
    'التي', 'الذين', 'اللذين', 'اللتين',
    'هناك', 'ثمّ', 'ثمّة',
    'لدي', 'لديه', 'لديها', 'لديهم', 'لدينا'
];

const englishStopwords = [
    // Articles
    'a', 'an', 'the',
    // Pronouns
    'i', 'me', 'my', 'myself', 'we', 'our', 'ours', 'ourselves',
    'you', 'your', 'yours', 'yourself', 'yourselves',
    'he', 'him', 'his', 'himself', 'she', 'her', 'hers', 'herself',
    'it', 'its', 'itself', 'they', 'them', 'their', 'theirs', 'themselves',
    // Prepositions
    'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'up', 'about',
    'into', 'through', 'during', 'before', 'after', 'above', 'below', 'between',
    'out', 'off', 'over', 'under', 'again', 'further', 'against', 'around',
    'among', 'within', 'without', 'along', 'across', 'behind', 'beyond',
    // Conjunctions
    'and', 'but', 'or', 'nor', 'so', 'yet', 'both', 'either', 'neither',
    // Be verbs
    'is', 'am', 'are', 'was', 'were', 'be', 'been', 'being',
    // Have verbs
    'have', 'has', 'had', 'having',
    // Do verbs
    'do', 'does', 'did', 'doing',
    // Modal verbs
    'will', 'would', 'shall', 'should', 'may', 'might', 'must', 'can', 'could',
    // Other common
    'that', 'which', 'who', 'whom', 'this', 'these', 'those',
    'what', 'where', 'when', 'why', 'how',
    'all', 'each', 'every', 'both', 'few', 'more', 'most', 'other', 'some', 'such',
    'no', 'not', 'only', 'own', 'same', 'than', 'too', 'very',
    'just', 'because', 'as', 'until', 'while', 'if', 'then', 'once',
    'here', 'there', 'when', 'where', 'why', 'how', 'any',
    'also', 'still', 'even', 'now', 'already', 'always', 'never',
    'often', 'sometimes', 'usually', 'quite', 'rather', 'well',
    'much', 'many', 'several', 'enough', 'less', 'least',
    'since', 'whether', 'although', 'though', 'unless',
    'however', 'therefore', 'thus', 'hence', 'moreover', 'furthermore',
    'its', 'it', 'itself', 'themselves',
    'get', 'gets', 'got', 'getting',
    'let', 'lets',
    'said', 'say', 'says', 'saying',
    'go', 'goes', 'going', 'went', 'gone',
    'come', 'comes', 'coming', 'came',
    'make', 'makes', 'making', 'made',
    'take', 'takes', 'taking', 'took', 'taken',
    'know', 'knows', 'knowing', 'knew', 'known',
    'think', 'thinks', 'thinking', 'thought',
    'see', 'sees', 'seeing', 'saw', 'seen',
    'want', 'wants', 'wanting', 'wanted',
    'use', 'uses', 'using', 'used',
    'find', 'finds', 'finding', 'found',
    'give', 'gives', 'giving', 'gave', 'given',
    'tell', 'tells', 'telling', 'told',
    'become', 'becomes', 'becoming', 'became',
    'leave', 'leaves', 'leaving', 'left',
    'put', 'puts', 'putting',
    'keep', 'keeps', 'keeping', 'kept',
    'begin', 'begins', 'beginning', 'began', 'begun',
    'seem', 'seems', 'seeming', 'seemed',
    'help', 'helps', 'helping', 'helped',
    'show', 'shows', 'showing', 'showed', 'shown',
    'try', 'tries', 'trying', 'tried',
    'need', 'needs', 'needing', 'needed',
    'etc', 'eg', 'ie'
];

function getDefaultStopwords(language) {
    if (language === 'arabic') return [...arabicStopwords];
    if (language === 'english') return [...englishStopwords];
    return [...arabicStopwords, ...englishStopwords];
}

function isStopword(word, stopwordSet) {
    return stopwordSet.has(word);
}

function createStopwordSet(customList) {
    return new Set(customList.map(w => w.trim()).filter(w => w.length > 0));
}

export {
    arabicStopwords,
    englishStopwords,
    getDefaultStopwords,
    isStopword,
    createStopwordSet
};
