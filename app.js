const { ipcRenderer } = require('electron');
const ExcelJS = require('exceljs');
const Chart = require('chart.js/auto');
const translations = require('./translations');
const { getDefaultStopwords } = require('./stopwords');
const { defaultLexicons } = require('./defaultLexicons');

// ============ GLOBAL STATE ============
let currentAnalysis = null;
let currentPragmaticAnalysis = null;
let currentText = null;
let currentFileName = null;
let currentFileSize = 0;
let currentChart = null;
let lexiconChart = null;
let currentLang = 'ar';
let customStopwords = null; // null = use defaults
let lexiconCategories = []; // { name, words: [] }
let selectedDefaultLexicon = null; // key from defaultLexicons
let currentComparativeAnalysis = null;

// ============ INITIALIZATION ============
document.addEventListener('DOMContentLoaded', () => {
    loadSavedData();
    setupLanguage();
    setupNavigation();
    setupUpload();
    setupResults();
    setupPragmatic();
    setupLexicon();
    setupComparative();
    setupSettings();
    initParticles();
    initBackToTop();
    initWelcome();
    setupProject(); // v5.0
    setupDashboardActions(); // v5.0 dashboard
});

// ============ TOAST NOTIFICATIONS ============
function showToast(message, type = 'info', duration = 3000) {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const icons = { success: '\u2714', error: '\u2718', info: '\u2139', warning: '\u26A0' };
    toast.innerHTML = `<span class="toast-icon">${icons[type] || icons.info}</span><span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(-20px)';
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

// ============ PARTICLES BACKGROUND ============
function initParticles() {
    const canvas = document.getElementById('particlesCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let particles = [];
    let animId;

    function resize() {
        const parent = canvas.parentElement;
        canvas.width = parent.offsetWidth;
        canvas.height = parent.offsetHeight;
    }
    resize();
    window.addEventListener('resize', resize);

    // Arabic letters as particles
    const letters = ['س', 'ب', 'ر', 'خ', 'ط', 'ا', 'ب', 'ت', 'د', 'و', 'ل', 'ي', 'ن', 'م', 'ع', 'ق', 'ك', 'ح', 'ج', 'ف'];

    for (let i = 0; i < 40; i++) {
        particles.push({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height,
            vx: (Math.random() - 0.5) * 0.5,
            vy: (Math.random() - 0.5) * 0.3,
            letter: letters[Math.floor(Math.random() * letters.length)],
            size: Math.random() * 16 + 10,
            opacity: Math.random() * 0.15 + 0.05
        });
    }

    function animate() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        particles.forEach(p => {
            p.x += p.vx;
            p.y += p.vy;
            if (p.x < 0) p.x = canvas.width;
            if (p.x > canvas.width) p.x = 0;
            if (p.y < 0) p.y = canvas.height;
            if (p.y > canvas.height) p.y = 0;

            ctx.font = `${p.size}px Cairo, Tajawal, sans-serif`;
            ctx.fillStyle = `rgba(212, 168, 67, ${p.opacity})`;
            ctx.fillText(p.letter, p.x, p.y);
        });
        animId = requestAnimationFrame(animate);
    }
    animate();

    // Stop when leaving home page
    const observer = new MutationObserver(() => {
        const homePage = document.getElementById('homePage');
        if (homePage && !homePage.classList.contains('active')) {
            cancelAnimationFrame(animId);
        } else {
            animate();
        }
    });
}

// ============ BACK TO TOP ============
function initBackToTop() {
    const btn = document.getElementById('backToTop');
    const content = document.querySelector('.content-area');
    if (!content || !btn) return;

    content.addEventListener('scroll', () => {
        btn.classList.toggle('visible', content.scrollTop > 300);
    });
    btn.addEventListener('click', () => {
        content.scrollTo({ top: 0, behavior: 'smooth' });
    });
}

// ============ WORD CLOUD ============
function renderWordCloud(frequencies) {
    const container = document.getElementById('wordCloudContainer');
    if (!container || !frequencies || frequencies.length === 0) {
        if (container) container.innerHTML = '';
        return;
    }

    const top = frequencies.slice(0, 60);
    const maxCount = top[0].count;
    const minCount = top[top.length - 1].count;

    container.innerHTML = top.map(item => {
        const ratio = maxCount > minCount ? (item.count - minCount) / (maxCount - minCount) : 0.5;
        const size = 0.75 + ratio * 2.0;
        const opacity = 0.5 + ratio * 0.5;
        const hue = Math.floor(30 + ratio * 20); // gold range
        const colors = ['#1E4D4A', '#5B8F8D', '#C45A3E', '#2A6B67', '#5B7A78', '#8BABA9'];
        const color = colors[Math.floor(Math.random() * colors.length)];
        return `<span class="cloud-word" style="font-size:${size}rem; opacity:${opacity}; color:${color};" onclick="searchAndShowContexts('${item.word.replace(/'/g, "\\'")}')" title="${item.count}">${item.word}</span>`;
    }).join(' ');
}

// ============ COUNT-UP ANIMATION ============
function animateCountUp(element, target) {
    const duration = 800;
    const start = performance.now();
    const startVal = 0;

    function update(now) {
        const elapsed = now - start;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
        const current = Math.floor(startVal + (target - startVal) * eased);
        element.textContent = current.toLocaleString();
        if (progress < 1) requestAnimationFrame(update);
    }
    requestAnimationFrame(update);
}

// ============ RADAR CHART ============
let comparativeRadarChart = null;

function renderComparativeRadar(results) {
    const canvas = document.getElementById('comparativeRadar');
    if (!canvas || !results || results.length === 0) return;

    if (comparativeRadarChart) comparativeRadarChart.destroy();

    // Only show dimensions with data
    const withData = results.filter(d => d.sideA.count + d.sideB.count > 0);
    if (withData.length === 0) return;

    const labels = withData.map(d => currentLang === 'ar' ? d.nameAr : d.nameEn);
    const dataA = withData.map(d => {
        const total = d.sideA.count + d.sideB.count;
        return total > 0 ? ((d.sideA.count / total) * 100).toFixed(1) : 0;
    });
    const dataB = withData.map(d => {
        const total = d.sideA.count + d.sideB.count;
        return total > 0 ? ((d.sideB.count / total) * 100).toFixed(1) : 0;
    });

    const ctx = canvas.getContext('2d');
    comparativeRadarChart = new Chart(ctx, {
        type: 'radar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: currentLang === 'ar' ? 'الجانب أ' : 'Side A',
                    data: dataA,
                    backgroundColor: 'rgba(30, 77, 74, 0.15)',
                    borderColor: '#1E4D4A',
                    borderWidth: 2,
                    pointBackgroundColor: '#1E4D4A'
                },
                {
                    label: currentLang === 'ar' ? 'الجانب ب' : 'Side B',
                    data: dataB,
                    backgroundColor: 'rgba(196, 90, 62, 0.15)',
                    borderColor: '#C45A3E',
                    borderWidth: 2,
                    pointBackgroundColor: '#C45A3E'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                r: {
                    beginAtZero: true,
                    max: 100,
                    grid: { color: 'rgba(212, 207, 198, 0.6)' },
                    angleLines: { color: 'rgba(212, 207, 198, 0.6)' },
                    pointLabels: {
                        color: '#5B7A78',
                        font: { size: 10, family: 'Cairo, Tajawal' }
                    },
                    ticks: { display: false }
                }
            },
            plugins: {
                legend: {
                    labels: { color: '#1A3C3A', font: { family: 'Cairo, Tajawal' } }
                },
                title: {
                    display: true,
                    text: currentLang === 'ar' ? 'الخريطة الرادارية للتحليل المقارن' : 'Comparative Analysis Radar',
                    color: '#1E4D4A',
                    font: { size: 14, weight: 'bold', family: 'Cairo, Tajawal' }
                }
            }
        }
    });
}

function loadSavedData() {
    try {
        const saved = localStorage.getItem('sabr-stopwords');
        if (saved) customStopwords = JSON.parse(saved);

        const savedLexicon = localStorage.getItem('sabr-lexicon');
        if (savedLexicon) lexiconCategories = JSON.parse(savedLexicon);
    } catch (e) { /* ignore */ }
}

function saveLexicon() {
    localStorage.setItem('sabr-lexicon', JSON.stringify(lexiconCategories));
}

function saveStopwords() {
    localStorage.setItem('sabr-stopwords', JSON.stringify(customStopwords));
}

// ============ LANGUAGE ============
function setupLanguage() {
    document.querySelectorAll('.lang-btn').forEach(btn => {
        btn.addEventListener('click', () => switchLanguage(btn.dataset.lang));
    });
}

function switchLanguage(lang) {
    currentLang = lang;
    document.querySelectorAll('.lang-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.lang === lang);
    });
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = lang;
    updateAllText();
    updateBilingualAttrs(lang);
}

// Updates any element using data-ar/data-en attributes (founding modal, badge)
function updateBilingualAttrs(lang) {
    const attr = lang === 'ar' ? 'data-ar' : 'data-en';
    document.querySelectorAll('[data-ar][data-en]').forEach(el => {
        const val = el.getAttribute(attr);
        if (val !== null) el.textContent = val;
    });
    const placeholders = lang === 'en' ? {
        foundingName: 'Full Name',
        foundingEmail: 'Email Address',
        foundingOrg: 'Academic Institution (optional)',
    } : {
        foundingName: 'الاسم الكامل',
        foundingEmail: 'البريد الإلكتروني',
        foundingOrg: 'المؤسسة الأكاديمية (اختياري)',
    };
    Object.entries(placeholders).forEach(([id, ph]) => {
        const el = document.getElementById(id);
        if (el) el.placeholder = ph;
    });
}

function t(key) {
    return translations[currentLang][key] || key;
}

function updateAllText() {
    // Header
    const headerTitle = document.querySelector('.header-title h1');
    if (headerTitle) headerTitle.textContent = t('welcome');

    // Navigation
    const navBtns = document.querySelectorAll('.nav-btn');
    const navKeys = ['navHome', 'navAbout', 'navDeveloper', 'navResults'];
    navBtns.forEach((btn, i) => {
        if (navKeys[i]) btn.querySelector('.nav-label').textContent = t(navKeys[i]);
    });

    // Home
    updateEl('.welcome-title', t('homeTitle'));
    updateEl('.welcome-subtitle', t('homeSubtitle'));
    updateEl('.upload-title', t('uploadTitle'));
    updateEl('.upload-hint', t('uploadHint'));

    const featureCards = document.querySelectorAll('.feature-card');
    const featureKeys = ['featureFreq', 'featurePragmatic', 'featureLexicon', 'featureContext', 'featureCharts', 'featureExport'];
    featureCards.forEach((card, i) => {
        if (featureKeys[i]) {
            card.querySelector('.feature-title').textContent = t(featureKeys[i]);
            card.querySelector('.feature-desc').textContent = t(featureKeys[i] + 'Desc');
        }
    });

    const privacyText = document.querySelector('.privacy-notice span:last-child');
    if (privacyText) privacyText.textContent = t('privacyNotice');

    // Results
    const fileInfoTitle = document.querySelector('.file-info-card h3');
    if (fileInfoTitle) fileInfoTitle.textContent = t('fileInfoTitle');

    const labels = document.querySelectorAll('.detail-label');
    const labelKeys = ['fileName', 'fileSize', 'totalWords', 'contentWords', 'uniqueWords', 'textLanguage'];
    labels.forEach((el, i) => { if (labelKeys[i]) el.textContent = t(labelKeys[i]); });

    const searchTitle = document.querySelector('.search-card h3');
    if (searchTitle) searchTitle.textContent = t('searchTitle');

    const searchInput = document.getElementById('resultSearchInput');
    if (searchInput) searchInput.placeholder = t('searchPlaceholder');

    const searchBtn = document.getElementById('resultSearchBtn');
    if (searchBtn) searchBtn.textContent = t('searchButton');

    // Tabs
    const tabKeys = ['tabFrequencies', 'tabPragmatic', 'tabLexicon', 'tabComparative', 'tabContexts', 'tabCharts', 'tabSettings'];
    document.querySelectorAll('.tab-button').forEach((btn, i) => {
        if (tabKeys[i]) btn.textContent = t(tabKeys[i]);
    });

    // Table headers
    const ths = document.querySelectorAll('.results-table th');
    const thKeys = ['tableRank', 'tableWord', 'tableCount', 'tablePercentage'];
    ths.forEach((th, i) => { if (thKeys[i]) th.textContent = t(thKeys[i]); });

    // Filter
    const freqFilter = document.getElementById('freqFilter');
    if (freqFilter) freqFilter.placeholder = t('filterPlaceholder');

    // Export button
    const exportBtn = document.getElementById('exportBtn');
    if (exportBtn) exportBtn.querySelector('span:last-child').textContent = t('exportButton');

    // Update chart if exists
    if (currentChart) updateChart();
}

function updateEl(selector, text) {
    const el = document.querySelector(selector);
    if (el) el.textContent = text;
}

// ============ NAVIGATION ============
function setupNavigation() {
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const pageName = btn.dataset.page;
            const currentActive = document.querySelector('.page.active');
            const nextPage = document.getElementById(pageName + 'Page');

            if (currentActive === nextPage) return;

            // Update nav buttons
            document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // Animate transition
            if (currentActive) {
                currentActive.style.opacity = '0';
                currentActive.style.transform = 'translateY(-10px)';
                setTimeout(() => {
                    currentActive.classList.remove('active');
                    currentActive.style.opacity = '';
                    currentActive.style.transform = '';
                    nextPage.classList.add('active');
                    // Scroll to top
                    const contentArea = document.querySelector('.content-area');
                    if (contentArea) contentArea.scrollTop = 0;
                }, 250);
            } else {
                nextPage.classList.add('active');
            }
        });
    });
}

// ============ DASHBOARD QUICK ACTIONS ============
function setupDashboardActions() {
    // Quick action buttons that navigate to pages
    document.querySelectorAll('.dash-action-btn[data-page]').forEach(btn => {
        btn.addEventListener('click', () => {
            const pageName = btn.dataset.page;
            const navBtn = document.querySelector(`.nav-btn[data-page="${pageName}"]`);
            if (navBtn) navBtn.click();
        });
    });
    // Browse file action
    const browseBtn = document.getElementById('dashActionBrowse');
    if (browseBtn) {
        browseBtn.addEventListener('click', () => {
            const uploadZone = document.getElementById('uploadZone');
            if (uploadZone) uploadZone.click();
        });
    }
}

// ============ UPLOAD ============
function setupUpload() {
    const uploadZone = document.getElementById('uploadZone');
    uploadZone.addEventListener('click', handleUploadClick);
    uploadZone.addEventListener('dragover', (e) => {
        e.preventDefault(); e.stopPropagation();
        e.currentTarget.style.borderColor = '#667eea';
        e.currentTarget.style.background = '#f5f7ff';
    });
    uploadZone.addEventListener('dragleave', (e) => {
        e.preventDefault(); e.stopPropagation();
        e.currentTarget.style.borderColor = '#c7d2fe';
        e.currentTarget.style.background = 'white';
    });
    uploadZone.addEventListener('drop', async (e) => {
        e.preventDefault(); e.stopPropagation();
        e.currentTarget.style.borderColor = '#c7d2fe';
        e.currentTarget.style.background = 'white';
        const file = e.dataTransfer.files[0];
        if (file && file.path) await processFile(file.path);
    });
}

async function handleUploadClick(e) {
    e.stopPropagation();
    try {
        const filePath = await ipcRenderer.invoke('select-file');
        if (filePath) await processFile(filePath);
    } catch (error) {
        alert(t('processing') + ' ' + error.message);
    }
}

async function processFile(filePath) {
    const uploadZone = document.getElementById('uploadZone');
    try {
        uploadZone.innerHTML = `
            <div class="loading">
                <svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"></circle>
                    <path d="M12 6v6l4 2"></path>
                </svg>
                <h3 style="margin-top:1rem; color:#667eea;">${t('processing')}</h3>
                <p style="color:#666;">${t('pleaseWait')}</p>
            </div>
        `;

        const result = await ipcRenderer.invoke('process-file', filePath);

        if (result.success) {
            currentText = result.text;
            currentFileSize = result.fileSize;
            currentAnalysis = result.analysis;
            currentPragmaticAnalysis = result.pragmaticAnalysis;
            currentComparativeAnalysis = result.comparativeAnalysis;
            currentFileName = filePath.split(/[\\/]/).pop();
            showResults();
        } else {
            throw new Error(result.error);
        }
    } catch (error) {
        alert(error.message);
        resetUploadZone();
    }
}

function resetUploadZone() {
    const uploadZone = document.getElementById('uploadZone');
    uploadZone.innerHTML = `
        <div class="upload-icon">
            <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
                <line x1="12" y1="11" x2="12" y2="17"></line>
                <polyline points="9 14 12 11 15 14"></polyline>
            </svg>
        </div>
        <h3 class="upload-title">${t('uploadTitle')}</h3>
        <p class="upload-hint">${t('uploadHint')}</p>
    `;
}

function showResults() {
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('[data-page="results"]').classList.add('active');
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById('resultsPage').classList.add('active');

    displayFileInfo();
    displayFrequencies();
    displayPragmaticResults();
    displayComparativeResults();
    displayStopwords();
    displayLexiconCategories();
    updateChart();
    resetUploadZone();

    // Word cloud
    if (currentAnalysis) renderWordCloud(currentAnalysis.allFrequencies);
    // Radar
    if (currentComparativeAnalysis) {
        const dims = Array.isArray(currentComparativeAnalysis) ? currentComparativeAnalysis : currentComparativeAnalysis.dimensions || [];
        renderComparativeRadar(dims);
    }

    showToast(currentLang === 'ar' ? 'تم تحليل الملف بنجاح' : 'File analyzed successfully', 'success');
}

// ============ FILE INFO ============
function displayFileInfo() {
    document.getElementById('resultFileName').textContent = currentFileName;
    document.getElementById('resultFileSize').textContent = formatFileSize(currentFileSize);

    // Count-up animations for numbers
    animateCountUp(document.getElementById('resultTotalWords'), currentAnalysis.statistics.totalWords);
    animateCountUp(document.getElementById('resultContentWords'), currentAnalysis.statistics.contentWords);
    animateCountUp(document.getElementById('resultUniqueWords'), currentAnalysis.statistics.uniqueContentWords);

    const langMap = { arabic: t('langArabic'), english: t('langEnglish'), mixed: t('langMixed') };
    document.getElementById('resultLanguage').textContent = langMap[currentAnalysis.statistics.language] || '-';
}

function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// ============ FREQUENCIES ============
function setupResults() {
    // Search
    document.getElementById('resultSearchBtn').addEventListener('click', handleSearch);
    document.getElementById('resultSearchInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleSearch();
    });

    // Tabs
    document.querySelectorAll('.tab-button').forEach(btn => {
        btn.addEventListener('click', () => {
            const tabName = btn.dataset.tab;
            document.querySelectorAll('.tab-button').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
            document.getElementById(tabName + 'Panel').classList.add('active');
            if (tabName === 'charts') updateChart();
        });
    });

    // Export
    document.getElementById('exportBtn').addEventListener('click', showExportMenu);

    // Frequency filter
    document.getElementById('freqFilter').addEventListener('input', (e) => {
        displayFrequencies(e.target.value);
    });

    // Context search inside contexts tab
    document.getElementById('contextSearchBtn').addEventListener('click', () => {
        const query = document.getElementById('contextSearchInput').value.trim();
        if (query) searchAndShowContexts(query);
    });
    document.getElementById('contextSearchInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            const query = e.target.value.trim();
            if (query) searchAndShowContexts(query);
        }
    });

    // Chart controls
    document.getElementById('chartType').addEventListener('change', updateChart);
    document.getElementById('chartWordCount').addEventListener('change', updateChart);
    document.getElementById('downloadPNG').addEventListener('click', () => downloadChart('png'));
    document.getElementById('downloadJPG').addEventListener('click', () => downloadChart('jpg'));
}

function displayFrequencies(filter = '') {
    if (!currentAnalysis) return;

    let frequencies = currentAnalysis.allFrequencies;
    if (filter) {
        frequencies = frequencies.filter(item => item.word.includes(filter));
    }

    document.getElementById('freqCount').textContent = frequencies.length;

    const tbody = document.getElementById('frequenciesBody');
    if (frequencies.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="no-data">' + t('noData') + '</td></tr>';
        return;
    }

    tbody.innerHTML = frequencies.map((item, index) => `
        <tr>
            <td>${index + 1}</td>
            <td><span class="clickable-word" onclick="searchAndShowContexts('${item.word.replace(/'/g, "\\'")}')">${item.word}</span></td>
            <td>${item.count}</td>
            <td>${item.percentage}%</td>
        </tr>
    `).join('');
}

// ============ SEARCH / CONTEXTS ============
function handleSearch() {
    const query = document.getElementById('resultSearchInput').value.trim();
    if (!query || !currentText) return;
    searchAndShowContexts(query);
}

window.searchAndShowContexts = function(query) {
    if (!query || !currentText) return;

    const contexts = extractContexts(currentText, query);
    document.getElementById('contextCount').textContent = contexts.length;

    // Also update context search input
    const ctxInput = document.getElementById('contextSearchInput');
    if (ctxInput) ctxInput.value = query;

    const container = document.getElementById('contextsList');
    if (contexts.length === 0) {
        container.innerHTML = '<div class="no-data">' + t('noSearchResults') + '</div>';
    } else {
        container.innerHTML = contexts.map(ctx => `<div class="context-item">${ctx}</div>`).join('');
    }

    // Switch to contexts tab
    document.querySelectorAll('.tab-button').forEach(b => b.classList.remove('active'));
    document.querySelector('[data-tab="contexts"]').classList.add('active');
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    document.getElementById('contextsPanel').classList.add('active');
};

function extractContexts(text, query, contextSize = 60) {
    const contexts = [];
    const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escapedQuery, 'gi');
    let match;

    while ((match = regex.exec(text)) !== null) {
        const start = Math.max(0, match.index - contextSize);
        const end = Math.min(text.length, match.index + query.length + contextSize);
        let context = text.substring(start, end);
        context = context.replace(new RegExp(escapedQuery, 'gi'), `<span class="keyword">${match[0]}</span>`);
        if (start > 0) context = '...' + context;
        if (end < text.length) context += '...';
        contexts.push(context);
    }

    return contexts;
}

// ============ PRAGMATIC ANALYSIS ============
function setupPragmatic() {
    document.getElementById('exportPragmaticBtn').addEventListener('click', exportPragmatic);
}

function displayPragmaticResults() {
    if (!currentPragmaticAnalysis) return;

    const container = document.getElementById('pragmaticResults');
    document.getElementById('pragmaticTotal').textContent = currentPragmaticAnalysis.totalPragmaticItems;

    const results = currentPragmaticAnalysis.results;
    let html = '';

    for (const [catKey, category] of Object.entries(results)) {
        if (category.totalCount === 0) continue;

        const catName = currentLang === 'ar' ? category.nameAr : category.nameEn;

        html += `<div class="pragmatic-category">
            <div class="pragmatic-category-header">
                <h4>${catName}</h4>
                <span class="count-badge">${category.totalCount}</span>
            </div>`;

        for (const [subKey, sub] of Object.entries(category.subcategories)) {
            if (sub.totalCount === 0) continue;
            const subName = currentLang === 'ar' ? sub.nameAr : sub.nameEn;

            html += `<div class="pragmatic-subcategory">
                <h5>${subName} <span class="sub-count">${sub.totalCount}</span></h5>
                <div class="pragmatic-items">`;

            sub.items.forEach((item, idx) => {
                const ctxId = `ctx-${catKey}-${subKey}-${idx}`;
                html += `<span class="pragmatic-item" onclick="togglePragmaticContext('${ctxId}')">
                    ${item.word} <span class="item-count">${item.count}</span>
                </span>`;
            });

            html += `</div>`;

            // Contexts for each item
            sub.items.forEach((item, idx) => {
                const ctxId = `ctx-${catKey}-${subKey}-${idx}`;
                html += `<div class="pragmatic-contexts" id="${ctxId}">`;
                item.contexts.forEach(ctx => {
                    html += `<p>${escapeHtml(ctx)}</p>`;
                });
                html += `</div>`;
            });

            html += `</div>`;
        }

        html += `</div>`;
    }

    container.innerHTML = html || '<div class="no-data">' + t('pragmaticNoData') + '</div>';
}

window.togglePragmaticContext = function(id) {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('show');
};

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

async function exportPragmatic() {
    if (!currentPragmaticAnalysis) return;
    const workbook = new ExcelJS.Workbook();

    for (const [catKey, category] of Object.entries(currentPragmaticAnalysis.results)) {
        if (category.totalCount === 0) continue;
        const sheetName = (currentLang === 'ar' ? category.nameAr : category.nameEn).substring(0, 31);
        const ws = workbook.addWorksheet(sheetName);

        ws.columns = [
            { header: t('tableWord'), key: 'word', width: 25 },
            { header: t('tableCount'), key: 'count', width: 12 },
            { header: currentLang === 'ar' ? 'الفئة الفرعية' : 'Subcategory', key: 'sub', width: 25 }
        ];

        ws.getRow(1).font = { bold: true };

        for (const [subKey, sub] of Object.entries(category.subcategories)) {
            const subName = currentLang === 'ar' ? sub.nameAr : sub.nameEn;
            sub.items.forEach(item => {
                ws.addRow({ word: item.word, count: item.count, sub: subName });
            });
        }
    }

    const buffer = await workbook.xlsx.writeBuffer();
    downloadBlob(buffer, 'pragmatic-analysis.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
}

// ============ COMPARATIVE ANALYSIS ============
function setupComparative() {
    document.getElementById('exportComparativeBtn').addEventListener('click', exportComparative);

    // Filter buttons
    document.querySelectorAll('.comp-filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.comp-filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            filterComparativeResults(btn.dataset.group);
        });
    });
}

function filterComparativeResults(group) {
    const cards = document.querySelectorAll('.comp-card');
    const groupTitles = document.querySelectorAll('.comp-group-title');

    cards.forEach(card => {
        card.style.display = (group === 'all' || card.dataset.group === group) ? 'block' : 'none';
    });
    groupTitles.forEach(title => {
        title.style.display = (group === 'all' || title.dataset.group === group) ? 'block' : 'none';
    });
}

function displayComparativeResults() {
    if (!currentComparativeAnalysis) return;

    const container = document.getElementById('comparativeResults');
    // Handle both array and { dimensions: [] } formats
    const results = Array.isArray(currentComparativeAnalysis)
        ? currentComparativeAnalysis
        : currentComparativeAnalysis.dimensions || [];

    if (!results || results.length === 0) {
        container.innerHTML = '<div class="no-data">لا توجد نتائج</div>';
        return;
    }

    // Group results
    const groups = {
        identity: { nameAr: 'هوية المتكلم والمخاطب', nameEn: 'Speaker & Addressee Identity', items: [] },
        temporal: { nameAr: 'الزمن والفعل', nameEn: 'Tense & Action', items: [] },
        epistemic: { nameAr: 'الموقف المعرفي والحجاجي', nameEn: 'Epistemic & Argumentative Stance', items: [] },
        strategy: { nameAr: 'الاستراتيجية الخطابية', nameEn: 'Discourse Strategy', items: [] }
    };

    results.forEach(dim => {
        if (groups[dim.group]) {
            groups[dim.group].items.push(dim);
        }
    });

    let html = '';

    for (const [groupKey, group] of Object.entries(groups)) {
        if (group.items.length === 0) continue;

        const groupName = currentLang === 'ar' ? group.nameAr : group.nameEn;
        html += `<div class="comp-group-title" data-group="${groupKey}">${groupName}</div>`;

        group.items.forEach((dim, idx) => {
            const total = dim.sideA.count + dim.sideB.count;
            if (total === 0) return;

            const pctA = total > 0 ? ((dim.sideA.count / total) * 100).toFixed(1) : 0;
            const pctB = total > 0 ? ((dim.sideB.count / total) * 100).toFixed(1) : 0;
            const dimName = currentLang === 'ar' ? dim.nameAr : dim.nameEn;
            const labelA = currentLang === 'ar' ? dim.sideA.label : dim.sideA.labelEn;
            const labelB = currentLang === 'ar' ? dim.sideB.label : dim.sideB.labelEn;
            const interp = currentLang === 'ar' ? dim.interpretation.ar : dim.interpretation.en;
            const detailId = `comp-detail-${groupKey}-${idx}`;

            html += `
            <div class="comp-card" data-group="${groupKey}">
                <div class="comp-card-header">
                    <span class="comp-card-title">${dimName}</span>
                    <span class="comp-ratio-badge">${dim.ratio}</span>
                </div>

                <div class="comp-bar-container">
                    <span class="comp-bar-label side-a">${labelA}<br><strong>${dim.sideA.count}</strong></span>
                    <div class="comp-bar-wrapper">
                        <div class="comp-bar-a" style="width: ${Math.max(pctA, 2)}%">${pctA}%</div>
                        <div class="comp-bar-b" style="width: ${Math.max(pctB, 2)}%">${pctB}%</div>
                    </div>
                    <span class="comp-bar-label side-b">${labelB}<br><strong>${dim.sideB.count}</strong></span>
                </div>

                <div class="comp-interpretation">${interp}</div>

                <span class="comp-details-toggle" onclick="toggleCompDetails('${detailId}')">
                    ${currentLang === 'ar' ? '🔍 عرض التفاصيل' : '🔍 Show details'}
                </span>
                <div class="comp-details" id="${detailId}">
                    <div><strong style="color:#3b82f6">${labelA}:</strong></div>
                    <div class="comp-detail-items">
                        ${dim.sideA.items.filter(i => i.count > 0).map(i =>
                            `<span class="comp-detail-item side-a">${i.word} (${i.count})</span>`
                        ).join('')}
                    </div>
                    <div style="margin-top:0.4rem"><strong style="color:#ef4444">${labelB}:</strong></div>
                    <div class="comp-detail-items">
                        ${dim.sideB.items.filter(i => i.count > 0).map(i =>
                            `<span class="comp-detail-item side-b">${i.word} (${i.count})</span>`
                        ).join('')}
                    </div>
                </div>
            </div>`;
        });
    }

    container.innerHTML = html || '<div class="no-data">لا توجد نتائج مقارنة</div>';
}

window.toggleCompDetails = function(id) {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('show');
};

async function exportComparative() {
    if (!currentComparativeAnalysis) return;
    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet(currentLang === 'ar' ? 'التحليل المقارن' : 'Comparative Analysis');

    ws.columns = [
        { header: currentLang === 'ar' ? 'البُعد' : 'Dimension', key: 'dim', width: 30 },
        { header: currentLang === 'ar' ? 'المجموعة' : 'Group', key: 'group', width: 20 },
        { header: currentLang === 'ar' ? 'الجانب أ' : 'Side A', key: 'sideALabel', width: 15 },
        { header: currentLang === 'ar' ? 'عدد أ' : 'Count A', key: 'countA', width: 10 },
        { header: currentLang === 'ar' ? 'الجانب ب' : 'Side B', key: 'sideBLabel', width: 15 },
        { header: currentLang === 'ar' ? 'عدد ب' : 'Count B', key: 'countB', width: 10 },
        { header: currentLang === 'ar' ? 'النسبة' : 'Ratio', key: 'ratio', width: 12 },
        { header: currentLang === 'ar' ? 'التفسير' : 'Interpretation', key: 'interp', width: 50 }
    ];

    ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF667eea' } };

    currentComparativeAnalysis.forEach(dim => {
        ws.addRow({
            dim: currentLang === 'ar' ? dim.nameAr : dim.nameEn,
            group: currentLang === 'ar' ? dim.groupNameAr : dim.groupNameEn,
            sideALabel: currentLang === 'ar' ? dim.sideA.label : dim.sideA.labelEn,
            countA: dim.sideA.count,
            sideBLabel: currentLang === 'ar' ? dim.sideB.label : dim.sideB.labelEn,
            countB: dim.sideB.count,
            ratio: dim.ratio,
            interp: currentLang === 'ar' ? dim.interpretation.ar : dim.interpretation.en
        });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    downloadBlob(buffer, `comparative-analysis-${Date.now()}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
}

// ============ CUSTOM LEXICON ============
function setupLexicon() {
    document.getElementById('addCategoryBtn').addEventListener('click', addLexiconCategory);
    document.getElementById('addWordsBtn').addEventListener('click', addLexiconWords);
    document.getElementById('analyzeLexiconBtn').addEventListener('click', analyzeLexicon);
    document.getElementById('exportLexiconBtn').addEventListener('click', exportLexiconFile);
    document.getElementById('importLexiconBtn').addEventListener('click', importLexiconFile);
    document.getElementById('clearLexiconBtn').addEventListener('click', () => {
        lexiconCategories = [];
        saveLexicon();
        displayLexiconCategories();
        document.getElementById('lexiconResults').style.display = 'none';
    });
    document.getElementById('analyzeCollocationBtn').addEventListener('click', runCollocation);
    document.getElementById('loadDefaultLexiconBtn').addEventListener('click', loadSelectedDefaultLexicon);
    document.getElementById('analyzeDefaultLexiconBtn').addEventListener('click', analyzeDefaultLexiconDirectly);

    displayDefaultLexicons();
    displayLexiconCategories();
}

// ============ DEFAULT LEXICONS ============
function displayDefaultLexicons() {
    const grid = document.getElementById('defaultLexiconsGrid');
    const icons = {
        humanitarian: '🤝',
        political: '🏛️',
        religious: '🕌',
        economic: '💰',
        emotional: '❤️',
        softPower: '🌍'
    };

    grid.innerHTML = Object.entries(defaultLexicons).map(([key, lex]) => `
        <div class="default-lexicon-card" data-lexicon="${key}" onclick="selectDefaultLexicon('${key}')">
            <div class="lexicon-icon">${icons[key] || '📚'}</div>
            <div class="lexicon-name">${currentLang === 'ar' ? lex.nameAr : lex.nameEn}</div>
            <div class="lexicon-count">${lex.words.length} ${currentLang === 'ar' ? 'كلمة' : 'words'}</div>
        </div>
    `).join('');
}

window.selectDefaultLexicon = function(key) {
    selectedDefaultLexicon = key;
    document.querySelectorAll('.default-lexicon-card').forEach(card => {
        card.classList.toggle('selected', card.dataset.lexicon === key);
    });
};

function loadSelectedDefaultLexicon() {
    if (!selectedDefaultLexicon) {
        alert(currentLang === 'ar' ? 'اختر معجمًا أولاً' : 'Select a lexicon first');
        return;
    }

    const lex = defaultLexicons[selectedDefaultLexicon];
    if (!lex) return;

    // Check if category already exists
    const existingIdx = lexiconCategories.findIndex(c => c.name === lex.nameAr);
    if (existingIdx >= 0) {
        // Merge words
        const existing = new Set(lexiconCategories[existingIdx].words);
        lex.words.forEach(w => existing.add(w));
        lexiconCategories[existingIdx].words = [...existing];
    } else {
        lexiconCategories.push({ name: lex.nameAr, words: [...lex.words] });
    }

    saveLexicon();
    displayLexiconCategories();
    alert(currentLang === 'ar'
        ? `تم تحميل "${lex.nameAr}" (${lex.words.length} كلمة)`
        : `Loaded "${lex.nameEn}" (${lex.words.length} words)`);
}

async function analyzeDefaultLexiconDirectly() {
    if (!selectedDefaultLexicon) {
        alert(currentLang === 'ar' ? 'اختر معجمًا أولاً' : 'Select a lexicon first');
        return;
    }
    if (!currentText) {
        alert(currentLang === 'ar' ? 'قم بتحميل ملف أولاً' : 'Load a file first');
        return;
    }

    const lex = defaultLexicons[selectedDefaultLexicon];
    const categories = [{ name: lex.nameAr, words: lex.words }];

    const result = await ipcRenderer.invoke('analyze-lexicon', {
        text: currentText,
        categories: categories
    });

    if (result.error) {
        alert(result.error);
        return;
    }

    displayLexiconResults(result);
}

function addLexiconCategory() {
    const name = document.getElementById('lexiconCategoryName').value.trim();
    if (!name) return;

    if (lexiconCategories.find(c => c.name === name)) {
        alert(currentLang === 'ar' ? 'الفئة موجودة مسبقاً' : 'Category already exists');
        return;
    }

    lexiconCategories.push({ name, words: [] });
    saveLexicon();
    document.getElementById('lexiconCategoryName').value = '';
    displayLexiconCategories();
}

function addLexiconWords() {
    const wordsInput = document.getElementById('lexiconWords').value.trim();
    const categoryName = document.getElementById('lexiconCategorySelect').value;

    if (!wordsInput || !categoryName) return;

    const category = lexiconCategories.find(c => c.name === categoryName);
    if (!category) return;

    const newWords = wordsInput.split(/[,،]+/).map(w => w.trim()).filter(w => w.length > 0);
    const existingSet = new Set(category.words);
    newWords.forEach(w => existingSet.add(w));
    category.words = [...existingSet];

    saveLexicon();
    document.getElementById('lexiconWords').value = '';
    displayLexiconCategories();
}

function displayLexiconCategories() {
    const container = document.getElementById('lexiconCategories');
    const select = document.getElementById('lexiconCategorySelect');

    // Update select
    select.innerHTML = '<option value="">' + t('selectCategory') + '</option>';
    lexiconCategories.forEach(cat => {
        select.innerHTML += `<option value="${cat.name}">${cat.name}</option>`;
    });

    // Display categories
    if (lexiconCategories.length === 0) {
        container.innerHTML = '';
        return;
    }

    container.innerHTML = lexiconCategories.map((cat, catIdx) => `
        <div class="lexicon-category-card">
            <h4>
                ${cat.name} (${cat.words.length})
                <button class="remove-category" onclick="removeLexiconCategory(${catIdx})">حذف</button>
            </h4>
            <div class="word-tags">
                ${cat.words.map((word, wordIdx) => `
                    <span class="word-tag">
                        ${word}
                        <span class="remove-word" onclick="removeLexiconWord(${catIdx}, ${wordIdx})">x</span>
                    </span>
                `).join('')}
            </div>
        </div>
    `).join('');
}

window.removeLexiconCategory = function(catIdx) {
    lexiconCategories.splice(catIdx, 1);
    saveLexicon();
    displayLexiconCategories();
};

window.removeLexiconWord = function(catIdx, wordIdx) {
    lexiconCategories[catIdx].words.splice(wordIdx, 1);
    saveLexicon();
    displayLexiconCategories();
};

async function analyzeLexicon() {
    if (!currentText || lexiconCategories.length === 0) {
        alert(currentLang === 'ar' ? 'قم بتحميل ملف وإنشاء فئات معجمية أولاً' : 'Load a file and create lexicon categories first');
        return;
    }

    const result = await ipcRenderer.invoke('analyze-lexicon', {
        text: currentText,
        categories: lexiconCategories
    });

    if (result.error) {
        alert(result.error);
        return;
    }

    displayLexiconResults(result);
}

function displayLexiconResults(result) {
    const container = document.getElementById('lexiconResults');
    const detailedContainer = document.getElementById('lexiconDetailedResults');
    container.style.display = 'block';

    // Summary chart
    if (lexiconChart) lexiconChart.destroy();
    const canvas = document.getElementById('lexiconChart');
    const ctx = canvas.getContext('2d');

    lexiconChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: result.summary.map(s => s.name),
            datasets: [{
                label: currentLang === 'ar' ? 'النسبة %' : 'Percentage %',
                data: result.summary.map(s => parseFloat(s.percentage)),
                backgroundColor: generateColors(result.summary.length, 0.7),
                borderColor: generateColors(result.summary.length, 1),
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: {
                    display: true,
                    text: currentLang === 'ar' ? 'مقارنة فئات المعجم المخصص' : 'Custom Lexicon Categories Comparison',
                    font: { size: 16, weight: 'bold' },
                    color: '#667eea'
                }
            },
            scales: { y: { beginAtZero: true, title: { display: true, text: '%' } } }
        }
    });

    // Detailed results
    detailedContainer.innerHTML = result.categories.map(cat => `
        <div class="lexicon-result-card">
            <h4>${cat.name} <span style="color:#10b981;">${cat.percentage}%</span></h4>
            <div class="stat">${currentLang === 'ar' ? 'إجمالي التكرارات' : 'Total occurrences'}: ${cat.totalCount} | ${currentLang === 'ar' ? 'كلمات وُجدت' : 'Words found'}: ${cat.foundCount}/${cat.wordCount}</div>
            <div class="table-container" style="max-height:200px;">
                <table class="results-table">
                    <thead><tr>
                        <th>${t('tableWord')}</th>
                        <th>${t('tableCount')}</th>
                        <th>${t('tablePercentage')}</th>
                    </tr></thead>
                    <tbody>
                        ${cat.words.map(w => `<tr>
                            <td><span class="pragmatic-item" onclick="showLexiconContexts('${escapeHtml(w.word)}', ${JSON.stringify(w.contexts).replace(/'/g, "\\'")})">${w.originalWord || w.word}</span></td>
                            <td>${w.count}</td>
                            <td>${w.percentage}%</td>
                        </tr>`).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `).join('');
}

window.showLexiconContexts = function(word, contexts) {
    if (!contexts || contexts.length === 0) return;
    const html = contexts.map(c => `<p>${escapeHtml(c)}</p>`).join('');
    const popup = document.createElement('div');
    popup.className = 'export-modal';
    popup.innerHTML = `
        <h3>${currentLang === 'ar' ? 'سياقات' : 'Contexts'}: ${word}</h3>
        <div style="max-height:300px; overflow-y:auto; font-size:0.85rem; line-height:1.8; text-align:right;">${html}</div>
        <button onclick="this.parentElement.remove()" style="background:#ef4444; margin-top:0.5rem;">${t('exportCancel')}</button>
    `;
    document.body.appendChild(popup);
};

async function runCollocation() {
    const word = document.getElementById('collocationWord').value.trim();
    const windowSize = parseInt(document.getElementById('collocationWindow').value);

    if (!word || !currentText) {
        alert(currentLang === 'ar' ? 'أدخل كلمة وتأكد من تحميل ملف' : 'Enter a word and make sure a file is loaded');
        return;
    }

    const result = await ipcRenderer.invoke('analyze-collocation', {
        text: currentText,
        targetWord: word,
        windowSize
    });

    if (result.error) {
        alert(result.error);
        return;
    }

    const container = document.getElementById('collocationResults');
    if (result.totalOccurrences === 0) {
        container.innerHTML = `<div class="no-data">${t('noSearchResults')}</div>`;
        return;
    }

    container.innerHTML = `
        <p style="margin-bottom:0.5rem; font-size:0.85rem; color:#666;">
            "${word}" ${currentLang === 'ar' ? 'ظهرت' : 'appeared'} ${result.totalOccurrences} ${currentLang === 'ar' ? 'مرة' : 'times'}
        </p>
        <div class="table-container" style="max-height:300px;">
            <table class="results-table">
                <thead><tr>
                    <th>${t('colWord')}</th>
                    <th>${t('colCount')}</th>
                    <th>${t('colFreq')}</th>
                    <th>${t('colMI')}</th>
                    <th>${t('colPercent')}</th>
                </tr></thead>
                <tbody>
                    ${result.collocations.map(c => `<tr>
                        <td>${c.word}</td>
                        <td>${c.coOccurrences}</td>
                        <td>${c.frequency}</td>
                        <td>${c.miScore}</td>
                        <td>${c.percentage}%</td>
                    </tr>`).join('')}
                </tbody>
            </table>
        </div>
    `;
}

async function exportLexiconFile() {
    if (lexiconCategories.length === 0) return;
    await ipcRenderer.invoke('export-lexicon', lexiconCategories);
}

async function importLexiconFile() {
    const result = await ipcRenderer.invoke('import-lexicon');
    if (result.success && result.data) {
        lexiconCategories = result.data;
        saveLexicon();
        displayLexiconCategories();
    } else if (result.error) {
        alert(result.error);
    }
}

// ============ SETTINGS ============
function setupSettings() {
    document.getElementById('addStopwordBtn').addEventListener('click', addStopword);
    document.getElementById('addStopwordInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') addStopword();
    });
    document.getElementById('resetStopwordsBtn').addEventListener('click', resetStopwords);
    document.getElementById('reanalyzeBtn').addEventListener('click', reanalyze);
}

function displayStopwords() {
    const container = document.getElementById('stopwordsDisplay');
    const list = customStopwords || getDefaultStopwords('mixed');

    container.innerHTML = list.map((word, idx) => `
        <span class="stopword-tag">
            ${word}
            <span class="remove-stopword" onclick="removeStopword(${idx})">x</span>
        </span>
    `).join('');
}

function addStopword() {
    const input = document.getElementById('addStopwordInput');
    const word = input.value.trim();
    if (!word) return;

    if (!customStopwords) {
        customStopwords = [...getDefaultStopwords('mixed')];
    }

    if (!customStopwords.includes(word)) {
        customStopwords.push(word);
        saveStopwords();
        displayStopwords();
    }

    input.value = '';
}

window.removeStopword = function(idx) {
    if (!customStopwords) {
        customStopwords = [...getDefaultStopwords('mixed')];
    }
    customStopwords.splice(idx, 1);
    saveStopwords();
    displayStopwords();
};

function resetStopwords() {
    customStopwords = null;
    localStorage.removeItem('sabr-stopwords');
    displayStopwords();
}

async function reanalyze() {
    if (!currentText) return;
    // Re-process with current stopwords
    const filePath = currentFileName; // We'll re-analyze the existing text
    const { analyzeText } = require('./analyzer');
    currentAnalysis = analyzeText(currentText, customStopwords);
    displayFileInfo();
    displayFrequencies();
    updateChart();
}

// ============ CHARTS ============
function updateChart() {
    if (!currentAnalysis) return;

    const type = document.getElementById('chartType').value;
    const count = parseInt(document.getElementById('chartWordCount').value);
    const data = currentAnalysis.allFrequencies.slice(0, count);

    if (currentChart) currentChart.destroy();

    const canvas = document.getElementById('frequencyChart');
    const ctx = canvas.getContext('2d');

    currentChart = new Chart(ctx, {
        type: type === 'horizontalBar' ? 'bar' : type,
        data: {
            labels: data.map(item => item.word),
            datasets: [{
                label: t('tableCount'),
                data: data.map(item => item.count),
                backgroundColor: generateColors(data.length, 0.7),
                borderColor: generateColors(data.length, 1),
                borderWidth: 2
            }]
        },
        options: {
            indexAxis: type === 'horizontalBar' ? 'y' : 'x',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: type === 'pie' || type === 'doughnut', position: 'right' },
                title: {
                    display: true,
                    text: t('chartTitle').replace('{count}', count),
                    font: { size: 16, weight: 'bold' },
                    color: '#667eea'
                }
            },
            scales: type !== 'pie' && type !== 'doughnut' ? { y: { beginAtZero: true } } : {}
        }
    });
}

function generateColors(count, alpha = 0.7) {
    const colors = [];
    for (let i = 0; i < count; i++) {
        const hue = (i * 360 / count) % 360;
        colors.push(`hsla(${hue}, 70%, 60%, ${alpha})`);
    }
    return colors;
}

function downloadChart(format) {
    if (!currentChart) return;
    const canvas = document.getElementById('frequencyChart');
    const url = canvas.toDataURL(`image/${format === 'jpg' ? 'jpeg' : 'png'}`);
    const link = document.createElement('a');
    link.download = `chart-${Date.now()}.${format}`;
    link.href = url;
    link.click();
}

// ============ EXPORT ============
function showExportMenu() {
    const menu = document.createElement('div');
    menu.className = 'export-modal';
    menu.innerHTML = `
        <h3>${t('exportTitle')}</h3>
        <button onclick="exportExcel()" style="background:#10b981;">${t('exportExcel')}</button>
        <button onclick="exportCSV()" style="background:#3b82f6;">${t('exportCSV')}</button>
        <button onclick="exportJSON()" style="background:#8b5cf6;">${t('exportJSON')}</button>
        <button onclick="this.parentElement.remove()" style="background:#ef4444;">${t('exportCancel')}</button>
    `;
    document.body.appendChild(menu);
}

async function exportExcel() {
    if (!currentAnalysis) return;
    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet(currentLang === 'ar' ? 'التكرارات' : 'Frequencies');

    ws.columns = [
        { header: t('tableRank'), key: 'rank', width: 10 },
        { header: t('tableWord'), key: 'word', width: 25 },
        { header: t('tableCount'), key: 'count', width: 12 },
        { header: t('tablePercentage'), key: 'pct', width: 12 }
    ];

    ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF667eea' } };

    currentAnalysis.allFrequencies.forEach((item, index) => {
        ws.addRow({ rank: index + 1, word: item.word, count: item.count, pct: item.percentage + '%' });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    downloadBlob(buffer, `analysis-${Date.now()}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    document.querySelector('.export-modal')?.remove();
}

function exportCSV() {
    if (!currentAnalysis) return;
    let csv = '\uFEFF';
    csv += `${t('tableRank')},${t('tableWord')},${t('tableCount')},${t('tablePercentage')}\n`;
    currentAnalysis.allFrequencies.forEach((item, index) => {
        csv += `${index + 1},"${item.word}",${item.count},${item.percentage}%\n`;
    });

    downloadBlob(csv, `analysis-${Date.now()}.csv`, 'text/csv;charset=utf-8;');
    document.querySelector('.export-modal')?.remove();
}

function exportJSON() {
    if (!currentAnalysis) return;
    const json = JSON.stringify({
        statistics: currentAnalysis.statistics,
        frequencies: currentAnalysis.allFrequencies,
        pragmatic: currentPragmaticAnalysis
    }, null, 2);

    downloadBlob(json, `analysis-${Date.now()}.json`, 'application/json');
    document.querySelector('.export-modal')?.remove();
}

function downloadBlob(data, filename, type) {
    const blob = new Blob([data], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
}

// Make functions global for inline onclick
window.exportExcel = exportExcel;
window.exportCSV = exportCSV;
window.exportJSON = exportJSON;

// ============================================================
// FOUNDING MEMBERS — Welcome Modal Logic (Desktop / Electron)
// ============================================================

// Google Form configuration. Replace after creating your form
// (see SETUP-GOOGLE-FORM.md for instructions).
const GOOGLE_FORM_CONFIG = {
    formActionUrl: '',
    fields: {
        name: 'entry.NAME_ID_HERE',
        email: 'entry.EMAIL_ID_HERE',
        organization: 'entry.ORG_ID_HERE',
        timestamp: 'entry.TIMESTAMP_ID_HERE',
    },
};

const FOUNDING_KEYS = {
    visited: 'sabr_first_visit_done',
    foundingMember: 'sabr_founding_member',
    memberData: 'sabr_member_data',
    skipped: 'sabr_welcome_skipped',
};

function isFoundingMember() {
    try { return localStorage.getItem(FOUNDING_KEYS.foundingMember) === 'true'; }
    catch { return false; }
}

// ============ SPLASH SCREEN ============
function initSplash() {
    const splash = document.getElementById('splashScreen');
    if (!splash) return;

    // Create floating particles
    const particlesEl = document.getElementById('splashParticles');
    const letters = ['س', 'ب', 'ر', 'خ', 'ط', 'ا', 'ب', 'ت', 'د', 'و', 'ل', 'ي', 'ن', 'م', 'ع', 'ق'];
    if (particlesEl) {
        for (let i = 0; i < 25; i++) {
            const p = document.createElement('span');
            p.className = 'splash-particle';
            p.textContent = letters[Math.floor(Math.random() * letters.length)];
            p.style.left = Math.random() * 100 + '%';
            p.style.fontSize = (Math.random() * 24 + 12) + 'px';
            p.style.animationDuration = (Math.random() * 8 + 6) + 's';
            p.style.animationDelay = (Math.random() * 4) + 's';
            particlesEl.appendChild(p);
        }
    }

    // Animate loading bar
    const fill = document.getElementById('splashLoadingFill');
    const text = document.getElementById('splashLoadingText');
    const messages = ['جارٍ التحميل...', 'تهيئة المحللات...', 'تحميل المعايير...', 'جاهز!'];
    let progress = 0;
    const interval = setInterval(() => {
        progress += Math.random() * 15 + 5;
        if (progress >= 100) progress = 100;
        if (fill) fill.style.width = progress + '%';
        if (text) {
            const idx = progress < 30 ? 0 : progress < 60 ? 1 : progress < 90 ? 2 : 3;
            text.textContent = messages[idx];
        }
        if (progress >= 100) {
            clearInterval(interval);
            setTimeout(() => {
                splash.classList.add('fade-out');
                setTimeout(() => {
                    splash.style.display = 'none';
                }, 800);
            }, 500);
        }
    }, 200);
}

function initWelcome() {
    initSplash();
    refreshFoundingBadge();
    // Re-apply bilingual text once on load (default is Arabic)
    if (typeof updateBilingualAttrs === 'function') {
        updateBilingualAttrs(currentLang || 'ar');
    }

    let alreadyVisited = false;
    try { alreadyVisited = localStorage.getItem(FOUNDING_KEYS.visited) === 'true'; } catch {}

    if (!alreadyVisited) {
        setTimeout(showFoundingModal, 350);
    }

    wireFoundingEvents();
}

function showFoundingModal() {
    const overlay = document.getElementById('foundingOverlay');
    if (!overlay) return;
    overlay.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    const firstInput = overlay.querySelector('input[type=text]');
    if (firstInput) setTimeout(() => firstInput.focus(), 200);
}

function hideFoundingModal() {
    const overlay = document.getElementById('foundingOverlay');
    if (!overlay) return;
    overlay.style.display = 'none';
    document.body.style.overflow = '';
    try { localStorage.setItem(FOUNDING_KEYS.visited, 'true'); } catch {}
}

function wireFoundingEvents() {
    const closeBtn = document.getElementById('foundingClose');
    const skipBtn = document.getElementById('foundingSkip');
    const form = document.getElementById('foundingForm');
    const overlay = document.getElementById('foundingOverlay');

    if (closeBtn) closeBtn.addEventListener('click', handleFoundingSkip);
    if (skipBtn) skipBtn.addEventListener('click', handleFoundingSkip);
    if (form) form.addEventListener('submit', handleFoundingSubmit);

    if (overlay) {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) handleFoundingSkip();
        });
    }
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && overlay && overlay.style.display === 'flex') {
            handleFoundingSkip();
        }
    });
}

function handleFoundingSkip() {
    try { localStorage.setItem(FOUNDING_KEYS.skipped, 'true'); } catch {}
    hideFoundingModal();
}

async function handleFoundingSubmit(e) {
    e.preventDefault();

    const nameEl = document.getElementById('foundingName');
    const emailEl = document.getElementById('foundingEmail');
    const orgEl = document.getElementById('foundingOrg');
    const submitBtn = document.getElementById('foundingSubmit');
    const submitText = submitBtn && submitBtn.querySelector('.founding-submit-text');
    const submitSpinner = submitBtn && submitBtn.querySelector('.founding-submit-spinner');

    [nameEl, emailEl].forEach(el => el && el.classList.remove('error'));
    const name = (nameEl && nameEl.value || '').trim();
    const email = (emailEl && emailEl.value || '').trim();
    const org = (orgEl && orgEl.value || '').trim();

    if (!name) {
        if (nameEl) nameEl.classList.add('error');
        showToast('الرجاء إدخال الاسم', 'error');
        return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        if (emailEl) emailEl.classList.add('error');
        showToast('الرجاء إدخال بريد إلكتروني صحيح', 'error');
        return;
    }

    if (submitBtn) submitBtn.disabled = true;
    if (submitText) submitText.style.display = 'none';
    if (submitSpinner) submitSpinner.style.display = 'inline-block';

    const memberData = {
        name, email, organization: org,
        joinedAt: new Date().toISOString(),
    };
    try {
        localStorage.setItem(FOUNDING_KEYS.memberData, JSON.stringify(memberData));
        localStorage.setItem(FOUNDING_KEYS.foundingMember, 'true');
    } catch {}

    try { await submitFoundingToGoogleForm(memberData); }
    catch (err) { console.warn('Form submission failed silently:', err); }

    if (submitBtn) submitBtn.disabled = false;
    if (submitText) submitText.style.display = '';
    if (submitSpinner) submitSpinner.style.display = 'none';

    refreshFoundingBadge();
    hideFoundingModal();
    showToast('🎉 مرحباً بك يا عضو مؤسس!', 'success', 4500);
}

function refreshFoundingBadge() {
    const badge = document.getElementById('foundingMemberBadge');
    if (!badge) return;
    badge.style.display = isFoundingMember() ? 'inline-flex' : 'none';
}

async function submitFoundingToGoogleForm(data) {
    const cfg = GOOGLE_FORM_CONFIG;
    if (!cfg.formActionUrl || cfg.formActionUrl.indexOf('docs.google.com') === -1) {
        return;
    }
    const formData = new FormData();
    if (cfg.fields.name) formData.append(cfg.fields.name, data.name || '');
    if (cfg.fields.email) formData.append(cfg.fields.email, data.email || '');
    if (cfg.fields.organization) formData.append(cfg.fields.organization, data.organization || '');
    if (cfg.fields.timestamp) formData.append(cfg.fields.timestamp, data.joinedAt || '');
    await fetch(cfg.formActionUrl, {
        method: 'POST',
        mode: 'no-cors',
        body: formData,
    });
}

// ============================================================
// PROJECT MANAGER — v5.0 Dual Track (Corpus + Analysis)
// ============================================================

let selectedTrack = null;
let projectParts = []; // Local list before project creation

function setupProject() {
    // Track card selection
    document.querySelectorAll('.track-card').forEach(card => {
        card.addEventListener('click', () => {
            document.querySelectorAll('.track-card').forEach(c => c.classList.remove('selected'));
            card.classList.add('selected');
            selectedTrack = card.dataset.track;
            // Auto-advance to step 2
            setTimeout(() => showProjectStep(2), 400);
        });
    });

    // Open existing project
    const btnOpen = document.getElementById('btnOpenProject');
    if (btnOpen) {
        btnOpen.addEventListener('click', async () => {
            const result = await ipcRenderer.invoke('open-project');
            if (result.success) {
                showToast('تم فتح المشروع بنجاح', 'success');
                showProjectDashboard(result.project);
            }
        });
    }

    // Back button
    const btnBack = document.getElementById('btnBackToStep1');
    if (btnBack) {
        btnBack.addEventListener('click', () => {
            showProjectStep(1);
        });
    }

    // Parts upload zone
    const partsZone = document.getElementById('partsUploadZone');
    if (partsZone) {
        partsZone.addEventListener('click', handleAddParts);
        partsZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            partsZone.style.borderColor = 'var(--gold)';
            partsZone.style.background = 'rgba(212, 168, 67, 0.06)';
        });
        partsZone.addEventListener('dragleave', (e) => {
            e.preventDefault();
            partsZone.style.borderColor = '';
            partsZone.style.background = '';
        });
        partsZone.addEventListener('drop', (e) => {
            e.preventDefault();
            partsZone.style.borderColor = '';
            partsZone.style.background = '';
            // Handle dropped files
            const files = Array.from(e.dataTransfer.files);
            for (const file of files) {
                addPartToList({
                    path: file.path,
                    name: file.name,
                    size: file.size
                });
            }
        });
    }

    // Create project button
    const btnCreate = document.getElementById('btnCreateProject');
    if (btnCreate) {
        btnCreate.addEventListener('click', handleCreateProject);
    }

    // Export corpus button
    const btnExport = document.getElementById('btnExportCorpus');
    if (btnExport) {
        btnExport.addEventListener('click', handleExportCorpus);
    }

    // Listen for processing progress from main process
    if (typeof ipcRenderer !== 'undefined') {
        ipcRenderer.on('corpus-progress', (event, data) => {
            updateProcessingProgress(data);
        });
    }
}

function showProjectStep(step) {
    document.querySelectorAll('.project-step').forEach(s => s.style.display = 'none');
    const stepEl = document.getElementById(`projectStep${step}`);
    if (stepEl) {
        stepEl.style.display = 'block';
        stepEl.style.animation = 'fadeInUp 0.4s ease';
    }

    // Update badge when entering step 2
    if (step === 2) {
        const badge = document.getElementById('selectedTrackBadge');
        const trackNames = {
            'corpus': '📚 بناء مدوّنة لغوية',
            'analysis': '🔬 تحليل تداولي',
            'both': '⭐ بناء + تحليل'
        };
        if (badge) badge.textContent = trackNames[selectedTrack] || '';
    }

    // Initialize criteria list when entering step 5
    if (step === 5) {
        renderActiveCriteria();
    }

    // Load texts when entering step 6
    if (step === 6) {
        populateTextBrowserFilters();
        filterTexts();
    }
}

async function handleAddParts() {
    const files = await ipcRenderer.invoke('select-corpus-files');
    if (!files) return;
    for (const file of files) {
        addPartToList(file);
    }
}

function addPartToList(file) {
    // Avoid duplicates
    if (projectParts.some(p => p.path === file.path)) return;

    const partNum = projectParts.length + 1;
    projectParts.push(file);

    const listEl = document.getElementById('partsList');
    const item = document.createElement('div');
    item.className = 'part-item';
    item.dataset.path = file.path;

    const sizeStr = formatFileSize(file.size);
    item.innerHTML = `
        <div class="part-number">${partNum}</div>
        <div class="part-info">
            <div class="part-name">${file.name}</div>
            <div class="part-meta">${sizeStr}</div>
        </div>
        <span class="part-status pending">في الانتظار</span>
        <button class="part-remove" title="إزالة">×</button>
    `;

    item.querySelector('.part-remove').addEventListener('click', () => {
        projectParts = projectParts.filter(p => p.path !== file.path);
        item.remove();
        updatePartsUI();
    });

    listEl.appendChild(item);
    updatePartsUI();
}

function updatePartsUI() {
    const count = projectParts.length;
    const summaryEl = document.getElementById('partsSummary');
    const btnCreate = document.getElementById('btnCreateProject');

    if (count > 0) {
        summaryEl.style.display = 'flex';
        document.getElementById('partsCount').textContent = count;
        const totalBytes = projectParts.reduce((sum, p) => sum + (p.size || 0), 0);
        document.getElementById('totalSize').textContent = formatFileSize(totalBytes);
        btnCreate.disabled = false;
    } else {
        summaryEl.style.display = 'none';
        btnCreate.disabled = true;
    }

    // Renumber parts
    document.querySelectorAll('.part-item .part-number').forEach((el, i) => {
        el.textContent = i + 1;
    });
}

function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

async function handleCreateProject() {
    const name = document.getElementById('projectName').value || 'مشروع سَبْر';
    const desc = document.getElementById('projectDesc').value || '';

    // Create project
    const result = await ipcRenderer.invoke('create-project', {
        name,
        description: desc,
        track: selectedTrack
    });

    if (!result.success) {
        showToast('لم يتم إنشاء المشروع', 'error');
        return;
    }

    showToast('تم إنشاء المشروع', 'success');

    // Add parts to the project
    for (const file of projectParts) {
        await ipcRenderer.invoke('add-corpus-part', {
            filePath: file.path,
            partName: file.name.replace(/\.[^.]+$/, '')
        });
    }

    // Show processing step
    showProjectStep(3);

    // Process all parts
    const processResult = await ipcRenderer.invoke('process-all-parts');

    if (processResult.success) {
        showToast(`تمت معالجة ${processResult.summary.totalTexts} نصاً بنجاح`, 'success');
        showProjectDashboard(processResult.summary);
    } else {
        showToast('حدث خطأ أثناء المعالجة: ' + processResult.error, 'error');
    }
}

function updateProcessingProgress(data) {
    const pct = Math.round((data.completed / data.total) * 100);
    const bar = document.getElementById('corpusProgressBar');
    const text = document.getElementById('progressText');
    const log = document.getElementById('processingLog');

    if (bar) bar.style.width = pct + '%';
    if (text) text.textContent = `جارٍ معالجة: ${data.partName} (${data.completed} / ${data.total})`;

    if (log) {
        const entry = document.createElement('div');
        entry.className = 'log-entry success';
        entry.textContent = `✓ ${data.partName} — تم`;
        log.appendChild(entry);
        log.scrollTop = log.scrollHeight;
    }
}

function showProjectDashboard(summary) {
    showProjectStep(4);

    // Update dashboard numbers
    const el = (id) => document.getElementById(id);
    if (el('dashTotalTexts')) el('dashTotalTexts').textContent = (summary.totalTexts || 0).toLocaleString('ar');
    if (el('dashTotalWords')) el('dashTotalWords').textContent = (summary.totalWords || 0).toLocaleString('ar');
    if (el('dashTotalParts')) el('dashTotalParts').textContent = summary.totalParts || summary.parts?.length || 0;

    // Show passed texts if analysis was done
    if (summary.analysisStats && summary.analysisStats.passedTexts !== undefined) {
        const passedCard = el('dashPassedCard');
        if (passedCard) passedCard.style.display = '';
        if (el('dashPassedTexts')) el('dashPassedTexts').textContent = summary.analysisStats.passedTexts;
    }

    // Show/hide analyze button based on track
    const btnAnalyze = el('btnAnalyzeCorpus');
    if (btnAnalyze && (selectedTrack === 'analysis' || selectedTrack === 'both')) {
        btnAnalyze.style.display = '';
    }

    // Populate parts table
    const tbody = el('dashPartsBody');
    if (tbody && summary.parts) {
        tbody.innerHTML = '';
        for (const part of summary.parts) {
            const tr = document.createElement('tr');
            const statusLabels = {
                'pending': 'في الانتظار',
                'completed': 'مكتمل ✓',
                'processing': 'قيد المعالجة...',
                'error': 'خطأ ✗'
            };
            tr.innerHTML = `
                <td>${part.id}</td>
                <td>${part.name}</td>
                <td>${(part.textsCount || 0).toLocaleString('ar')}</td>
                <td>${(part.wordsCount || 0).toLocaleString('ar')}</td>
                <td><span class="part-status ${part.status}">${statusLabels[part.status] || part.status}</span></td>
            `;
            tbody.appendChild(tr);
        }
    }
}

async function handleExportCorpus() {
    showToast('جارٍ تصدير المدوّنة...', 'info');
    const result = await ipcRenderer.invoke('export-corpus', 'json');
    if (result.success) {
        // Export as JSON file via IPC
        const exportResult = await ipcRenderer.invoke('export-lexicon', result.data);
        if (exportResult.success) {
            showToast('تم تصدير المدوّنة بنجاح', 'success');
        }
    } else {
        showToast('خطأ في التصدير: ' + result.error, 'error');
    }
}

// ============================================
// CRITERIA CONFIGURATION (Step 5)
// ============================================

let activeCriteria = [];
const builtInCriteria = {
    searle: {
        id: 'searle-1969',
        name: 'القصدية (Searle 1969)',
        type: 'keyword_exclusion',
        theory: 'نظرية الأفعال الكلامية - القصدية',
        description: 'استبعاد النصوص التي تحتوي على أنماط غير قصدية (رسائل، برقيات، تهاني، تعازي)',
        keywords: ['رسالة', 'برقية', 'تهنئة', 'تعزية', 'تهاني', 'تعازي'],
        references: ['Searle, J.R. (1969). Speech Acts. Cambridge University Press.'],
        outputDescription: 'استبعاد النصوص غير القصدية'
    },
    grice: {
        id: 'grice-1975',
        name: 'التعاون (Grice 1975)',
        type: 'min_words',
        theory: 'مبدأ التعاون ومسلّمات المحادثة',
        description: 'استبعاد النصوص القصيرة جداً التي لا تحقق مبدأ الكم الكافي',
        threshold: 30,
        references: ['Grice, H.P. (1975). Logic and Conversation. In Cole & Morgan (Eds.), Syntax and Semantics 3.'],
        outputDescription: 'استبعاد النصوص الأقل من 30 كلمة'
    },
    thomas: {
        id: 'thomas-1995',
        name: 'اكتمال النص (Thomas 1995)',
        type: 'min_words',
        theory: 'اكتمال البنية النصية',
        description: 'التأكد من اكتمال النص بوجود بنية سردية كافية',
        threshold: 50,
        references: ['Thomas, J. (1995). Meaning in Interaction. Longman.'],
        outputDescription: 'استبعاد النصوص غير المكتملة'
    },
    austin: {
        id: 'austin-1962',
        name: 'الأفعال الكلامية (Austin 1962)',
        type: 'lexical_density',
        theory: 'نظرية الأفعال الكلامية',
        description: 'التحقق من وجود أفعال كلامية في النص (أمر، وعد، طلب، إعلان، تحذير)',
        lexicon: ['أمر', 'وعد', 'طلب', 'أعلن', 'حذّر', 'نصح', 'اقترح', 'أكد', 'نفى', 'وافق', 'رفض', 'دعا', 'شكر', 'اعتذر'],
        threshold: 1,
        densityMode: 'count',
        references: ['Austin, J.L. (1962). How to Do Things with Words. Oxford University Press.'],
        outputDescription: 'استبعاد النصوص بدون أفعال كلامية'
    },
    brownLevinson: {
        id: 'brown-levinson-1987',
        name: 'التأدب (Brown & Levinson 1987)',
        type: 'lexical_density',
        theory: 'نظرية التأدب اللغوي',
        description: 'التحقق من وجود علامات التأدب اللغوي في النص',
        lexicon: ['من فضلك', 'لو سمحت', 'أرجو', 'يرجى', 'نأمل', 'بارك الله', 'جزاك', 'حفظك', 'رعاك', 'أخي', 'إخواني', 'أبنائي'],
        threshold: 1,
        densityMode: 'count',
        references: ['Brown, P. & Levinson, S.C. (1987). Politeness. Cambridge University Press.'],
        outputDescription: 'استبعاد النصوص بدون علامات تأدب'
    }
};

function setupCriteria() {
    // Built-in criteria toggles
    document.querySelectorAll('.criteria-card').forEach(card => {
        const toggle = card.querySelector('.criteria-toggle input');
        const key = card.dataset.criterion;
        if (toggle && key && builtInCriteria[key]) {
            // Initialize: if checkbox is checked, add criterion to active list
            if (toggle.checked) {
                if (!activeCriteria.find(c => c.id === builtInCriteria[key].id)) {
                    activeCriteria.push({...builtInCriteria[key]});
                }
            }
            // Listen for future changes
            toggle.addEventListener('change', () => {
                if (toggle.checked) {
                    if (!activeCriteria.find(c => c.id === builtInCriteria[key].id)) {
                        activeCriteria.push({...builtInCriteria[key]});
                    }
                } else {
                    activeCriteria = activeCriteria.filter(c => c.id !== builtInCriteria[key].id);
                }
                renderActiveCriteria();
            });
        }
    });

    // Custom criterion type selector - show/hide dynamic fields
    const typeSelect = document.getElementById('customCriterionType');
    if (typeSelect) {
        typeSelect.addEventListener('change', () => {
            const type = typeSelect.value;
            document.querySelectorAll('.custom-field-group').forEach(g => g.style.display = 'none');
            const target = document.getElementById('customField_' + type);
            if (target) target.style.display = 'block';
        });
        // Trigger initial state
        typeSelect.dispatchEvent(new Event('change'));
    }

    // Add custom criterion button
    const btnAdd = document.getElementById('btnAddCustomCriterion');
    if (btnAdd) {
        btnAdd.addEventListener('click', addCustomCriterion);
    }

    // Navigation buttons
    const btnBack = document.getElementById('btnBackToStep4FromCriteria');
    if (btnBack) {
        btnBack.addEventListener('click', () => showProjectStep(4));
    }

    // Apply criteria button
    const btnApply = document.getElementById('btnApplyCriteria');
    if (btnApply) {
        btnApply.addEventListener('click', handleApplyCriteria);
    }

    // Step 4 analyze button -> go to Step 5
    const btnAnalyze = document.getElementById('btnAnalyzeCorpus');
    if (btnAnalyze) {
        btnAnalyze.addEventListener('click', () => showProjectStep(5));
    }

    // Text browser navigation
    const btnBackBrowser = document.getElementById('btnBackToStep4FromBrowser');
    if (btnBackBrowser) {
        btnBackBrowser.addEventListener('click', () => showProjectStep(4));
    }

    // Text browser export
    const btnExportBrowser = document.getElementById('btnExportTextBrowser');
    if (btnExportBrowser) {
        btnExportBrowser.addEventListener('click', handleExportCorpus);
    }

    // Text browser filters
    const searchInput = document.getElementById('textSearchInput');
    if (searchInput) {
        searchInput.addEventListener('input', debounce(filterTexts, 300));
    }
    ['textTypeFilter', 'textPartFilter', 'textStatusFilter'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', filterTexts);
    });

    // Text browser pagination
    const btnPrev = document.getElementById('btnPrevPage');
    const btnNext = document.getElementById('btnNextPage');
    if (btnPrev) btnPrev.addEventListener('click', () => { currentTextPage--; renderTextsTable(); });
    if (btnNext) btnNext.addEventListener('click', () => { currentTextPage++; renderTextsTable(); });

    // Browse texts button in Step 4
    // We'll add this dynamically or check if it exists
}

function addCustomCriterion() {
    const name = document.getElementById('customCriterionName').value.trim();
    const type = document.getElementById('customCriterionType').value;

    if (!name) {
        alert('الرجاء إدخال اسم المعيار');
        return;
    }

    const criterion = {
        id: 'custom-' + Date.now(),
        name: name,
        type: type,
        theory: 'معيار مخصص',
        description: name,
        references: [],
        outputDescription: ''
    };

    // Get type-specific values
    switch (type) {
        case 'keyword_exclusion':
            const keywords = document.getElementById('customKeywords');
            if (keywords) {
                criterion.keywords = keywords.value.split('\n').map(k => k.trim()).filter(k => k);
            }
            break;
        case 'min_words':
            const threshold = document.getElementById('customMinWords');
            if (threshold) criterion.threshold = parseInt(threshold.value) || 30;
            break;
        case 'regex':
            const pattern = document.getElementById('customRegex');
            if (pattern) {
                criterion.pattern = pattern.value;
                criterion.flags = 'g';
                criterion.minMatches = 1;
                criterion.exclude = false;
            }
            break;
        case 'lexical_density':
            const lexicon = document.getElementById('customLexicon');
            const densityThreshold = document.getElementById('customDensityThreshold');
            if (lexicon) {
                criterion.lexicon = lexicon.value.split('\n').map(k => k.trim()).filter(k => k);
            }
            criterion.threshold = densityThreshold ? parseFloat(densityThreshold.value) || 0.5 : 0.5;
            criterion.densityMode = 'percentage';
            break;
        case 'type_exclusion':
            const types = document.getElementById('customExcludeTypes');
            if (types) {
                criterion.excludeTypes = types.value.split('\n').map(t => t.trim()).filter(t => t);
            }
            break;
    }

    activeCriteria.push(criterion);
    renderActiveCriteria();

    // Clear form
    document.getElementById('customCriterionName').value = '';
}

function renderActiveCriteria() {
    const list = document.getElementById('activeCriteriaList');
    if (!list) return;

    if (activeCriteria.length === 0) {
        list.innerHTML = '<div class="no-criteria">لم يتم إضافة أي معايير بعد</div>';
        return;
    }

    list.innerHTML = activeCriteria.map((c, i) => `
        <div class="active-criterion-item">
            <div class="criterion-info">
                <span class="criterion-name">${c.name}</span>
                <span class="criterion-type-badge">${getCriterionTypeLabel(c.type)}</span>
            </div>
            <button class="criterion-remove" onclick="removeCriterion(${i})" title="إزالة">✕</button>
        </div>
    `).join('');
}

function removeCriterion(index) {
    const removed = activeCriteria[index];
    activeCriteria.splice(index, 1);

    // Uncheck built-in toggle if applicable
    for (const [key, val] of Object.entries(builtInCriteria)) {
        if (val.id === removed.id) {
            const card = document.querySelector(`.criteria-card[data-criterion="${key}"]`);
            if (card) {
                const toggle = card.querySelector('.criteria-toggle input');
                if (toggle) toggle.checked = false;
            }
        }
    }

    renderActiveCriteria();
}

function getCriterionTypeLabel(type) {
    const labels = {
        'keyword_exclusion': 'استبعاد كلمات',
        'type_exclusion': 'استبعاد أنماط',
        'min_words': 'حد أدنى كلمات',
        'lexical_density': 'كثافة معجمية',
        'regex': 'نمط Regex',
        'compound': 'معيار مركّب'
    };
    return labels[type] || type;
}

async function handleApplyCriteria() {
    if (activeCriteria.length === 0) {
        alert('الرجاء إضافة معيار واحد على الأقل');
        return;
    }

    const btn = document.getElementById('btnApplyCriteria');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span>⏳</span> جارٍ التطبيق...';
    }

    try {
        const result = await window.require('electron').ipcRenderer.invoke('apply-criteria', activeCriteria);

        if (result.success) {
            // Update dashboard with analysis results
            const summary = await window.require('electron').ipcRenderer.invoke('get-project-summary');
            showProjectDashboard(summary);

            // Show passed texts card
            const passedCard = document.getElementById('dashPassedCard');
            if (passedCard) passedCard.style.display = 'block';

            const dashPassed = document.getElementById('dashPassedTexts');
            if (dashPassed) dashPassed.textContent = result.statistics.passedTexts;

            // Show success notification and go to dashboard
            showProjectStep(4);

            // Add browse texts button if not exists
            addBrowseTextsButton();

        } else {
            alert('حدث خطأ: ' + (result.error || 'خطأ غير معروف'));
        }
    } catch (error) {
        alert('حدث خطأ: ' + error.message);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<span>🔬</span> تطبيق المعايير';
        }
    }
}

function addBrowseTextsButton() {
    const actions = document.querySelector('#projectStep4 .dashboard-actions');
    if (actions && !document.getElementById('btnBrowseTexts')) {
        const btn = document.createElement('button');
        btn.id = 'btnBrowseTexts';
        btn.className = 'btn-secondary';
        btn.innerHTML = '<span>📋</span> تصفح النصوص';
        btn.addEventListener('click', () => {
            populateTextBrowserFilters();
            showProjectStep(6);
            filterTexts();
        });
        actions.insertBefore(btn, actions.firstChild);
    }
}

// ============================================
// TEXT BROWSER (Step 6)
// ============================================

let allTextsData = [];
let filteredTexts = [];
let currentTextPage = 1;
const textsPerPage = 50;

function populateTextBrowserFilters() {
    // Get project summary for filter options
    const summary = window.require('electron').ipcRenderer.invoke('get-project-summary');
    summary.then(data => {
        if (!data) return;

        // Populate type filter
        const typeFilter = document.getElementById('textTypeFilter');
        if (typeFilter && data.discourseTypes) {
            typeFilter.innerHTML = '<option value="all">جميع الأنماط</option>';
            for (const type of Object.keys(data.discourseTypes)) {
                typeFilter.innerHTML += `<option value="${type}">${type} (${data.discourseTypes[type]})</option>`;
            }
        }

        // Populate part filter
        const partFilter = document.getElementById('textPartFilter');
        if (partFilter && data.parts) {
            partFilter.innerHTML = '<option value="all">جميع الأجزاء</option>';
            for (const part of data.parts) {
                partFilter.innerHTML += `<option value="${part.id}">${part.name} (${part.textsCount})</option>`;
            }
        }
    });

    // Get all texts data
    window.require('electron').ipcRenderer.invoke('export-corpus', 'json').then(result => {
        if (result.success && result.data) {
            allTextsData = result.data.texts || [];
        } else if (result.texts) {
            allTextsData = result.texts || [];
        }
    });
}

function filterTexts() {
    const search = (document.getElementById('textSearchInput')?.value || '').trim().toLowerCase();
    const typeFilter = document.getElementById('textTypeFilter')?.value || 'all';
    const partFilter = document.getElementById('textPartFilter')?.value || 'all';
    const statusFilter = document.getElementById('textStatusFilter')?.value || 'all';

    filteredTexts = allTextsData.filter(text => {
        // Search filter
        if (search && !text.title?.toLowerCase().includes(search) && !text.content?.toLowerCase().includes(search)) {
            return false;
        }
        // Type filter
        if (typeFilter !== 'all' && text.type !== typeFilter) return false;
        // Part filter
        if (partFilter !== 'all' && text.part != partFilter) return false;
        // Status filter (needs analysis results)
        // We'll handle this based on the analysis results
        return true;
    });

    currentTextPage = 1;
    renderTextsTable();
}

function renderTextsTable() {
    const tbody = document.getElementById('textBrowserBody');
    const countEl = document.getElementById('textResultsCount');
    const pageInfo = document.getElementById('textPageInfo');
    const btnPrev = document.getElementById('btnPrevPage');
    const btnNext = document.getElementById('btnNextPage');

    if (!tbody) return;

    const total = filteredTexts.length;
    const totalPages = Math.ceil(total / textsPerPage) || 1;
    currentTextPage = Math.max(1, Math.min(currentTextPage, totalPages));

    const start = (currentTextPage - 1) * textsPerPage;
    const end = Math.min(start + textsPerPage, total);
    const pageTexts = filteredTexts.slice(start, end);

    if (countEl) countEl.textContent = total;
    if (pageInfo) pageInfo.textContent = `صفحة ${currentTextPage} من ${totalPages}`;
    if (btnPrev) btnPrev.disabled = currentTextPage <= 1;
    if (btnNext) btnNext.disabled = currentTextPage >= totalPages;

    if (pageTexts.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="no-data-cell">لا توجد نصوص مطابقة</td></tr>';
        return;
    }

    tbody.innerHTML = pageTexts.map(text => `
        <tr class="text-row" onclick="toggleTextExpand(this, ${JSON.stringify(text).replace(/"/g, '&quot;')})">
            <td>${text.index || text.globalIndex || ''}</td>
            <td>${text.partName || text.part || ''}</td>
            <td><span class="type-badge">${text.type || text.discourseType || 'نص'}</span></td>
            <td>${text.wordCount || 0}</td>
            <td class="text-title-cell">${(text.title || '').substring(0, 80)}${text.title?.length > 80 ? '...' : ''}</td>
            <td><span class="status-badge status-passed">—</span></td>
        </tr>
    `).join('');
}

function toggleTextExpand(row, textData) {
    const expandView = document.getElementById('textExpandedView');
    const titleEl = document.getElementById('expandedTextTitle');
    const contentEl = document.getElementById('expandedTextContent');

    if (!expandView) return;

    // Parse textData if it's a string
    let text = typeof textData === 'string' ? JSON.parse(textData) : textData;

    if (titleEl) titleEl.textContent = text.title || '';
    if (contentEl) contentEl.textContent = text.content || '';

    expandView.style.display = 'block';
    expandView.scrollIntoView({ behavior: 'smooth' });

    // Close button
    const closeBtn = document.getElementById('btnCloseExpanded');
    if (closeBtn) {
        closeBtn.onclick = () => { expandView.style.display = 'none'; };
    }
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

// Initialize criteria and text browser when DOM is ready
setupCriteria();
