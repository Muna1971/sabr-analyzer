/**
 * Founding Members Welcome Modal
 * --------------------------------
 * Shows a one-time welcome dialog inviting the first 50 users
 * to register as Founding Members. Submits to a Google Form
 * (no backend required) and stores membership locally.
 *
 * Replace GOOGLE_FORM_CONFIG with the values you get from your form
 * (see SETUP-GOOGLE-FORM.md for instructions).
 */

// ============ CONFIG ============
// TODO: Replace with your real Google Form values after creating it.
// Instructions are in SETUP-GOOGLE-FORM.md (root of project).
const GOOGLE_FORM_CONFIG = {
    // Example: 'https://docs.google.com/forms/d/e/1FAIpQLSc.../formResponse'
    formActionUrl: '',
    // Each Google Form field has an entry ID like 'entry.123456789'
    fields: {
        name: 'entry.NAME_ID_HERE',
        email: 'entry.EMAIL_ID_HERE',
        organization: 'entry.ORG_ID_HERE',
        timestamp: 'entry.TIMESTAMP_ID_HERE',
    },
};

// ============ STORAGE KEYS ============
const KEYS = {
    visited: 'sabr_first_visit_done',
    foundingMember: 'sabr_founding_member',
    memberData: 'sabr_member_data',
    skipped: 'sabr_welcome_skipped',
};

// ============ PUBLIC API ============

export function isFoundingMember() {
    try {
        return localStorage.getItem(KEYS.foundingMember) === 'true';
    } catch {
        return false;
    }
}

export function getMemberData() {
    try {
        const raw = localStorage.getItem(KEYS.memberData);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

export function shouldShowWelcome() {
    try {
        // Show only on first ever visit
        if (localStorage.getItem(KEYS.visited) === 'true') return false;
        return true;
    } catch {
        return false;
    }
}

export function markVisited() {
    try { localStorage.setItem(KEYS.visited, 'true'); } catch {}
}

// ============ INIT ============
export function initWelcome() {
    // Always render the badge if the user is already a founding member
    refreshBadge();

    // Show the welcome modal on first visit
    if (shouldShowWelcome()) {
        // Tiny delay so the main UI paints first
        setTimeout(showWelcomeModal, 350);
    }

    wireUpEvents();
}

// ============ MODAL CONTROL ============

function showWelcomeModal() {
    const overlay = document.getElementById('foundingOverlay');
    if (!overlay) return;
    overlay.style.display = 'flex';
    document.body.style.overflow = 'hidden';

    // Focus the first input for accessibility
    const firstInput = overlay.querySelector('input[type=text]');
    if (firstInput) setTimeout(() => firstInput.focus(), 200);
}

function hideWelcomeModal() {
    const overlay = document.getElementById('foundingOverlay');
    if (!overlay) return;
    overlay.style.display = 'none';
    document.body.style.overflow = '';
    markVisited();
}

// ============ EVENT WIRING ============

function wireUpEvents() {
    const closeBtn = document.getElementById('foundingClose');
    const skipBtn = document.getElementById('foundingSkip');
    const form = document.getElementById('foundingForm');
    const overlay = document.getElementById('foundingOverlay');

    if (closeBtn) closeBtn.addEventListener('click', handleSkip);
    if (skipBtn) skipBtn.addEventListener('click', handleSkip);
    if (form) form.addEventListener('submit', handleSubmit);

    // Close on overlay click (but not modal click)
    if (overlay) {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) handleSkip();
        });
    }

    // ESC to close
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && overlay && overlay.style.display === 'flex') {
            handleSkip();
        }
    });
}

function handleSkip() {
    try { localStorage.setItem(KEYS.skipped, 'true'); } catch {}
    hideWelcomeModal();
}

async function handleSubmit(e) {
    e.preventDefault();

    const nameEl = document.getElementById('foundingName');
    const emailEl = document.getElementById('foundingEmail');
    const orgEl = document.getElementById('foundingOrg');
    const submitBtn = document.getElementById('foundingSubmit');
    const submitText = submitBtn?.querySelector('.founding-submit-text');
    const submitSpinner = submitBtn?.querySelector('.founding-submit-spinner');

    // Validate
    [nameEl, emailEl].forEach((el) => el && el.classList.remove('error'));
    const name = (nameEl?.value || '').trim();
    const email = (emailEl?.value || '').trim();
    const org = (orgEl?.value || '').trim();

    if (!name) {
        nameEl?.classList.add('error');
        toast('الرجاء إدخال الاسم', 'error');
        return;
    }
    if (!isValidEmail(email)) {
        emailEl?.classList.add('error');
        toast('الرجاء إدخال بريد إلكتروني صحيح', 'error');
        return;
    }

    // UI: loading state
    if (submitBtn) submitBtn.disabled = true;
    if (submitText) submitText.style.display = 'none';
    if (submitSpinner) submitSpinner.style.display = 'inline-block';

    // Save locally regardless of network outcome — we still grant founding member
    // status so the user gets a smooth experience on flaky connections.
    const memberData = {
        name,
        email,
        organization: org,
        joinedAt: new Date().toISOString(),
    };
    try {
        localStorage.setItem(KEYS.memberData, JSON.stringify(memberData));
        localStorage.setItem(KEYS.foundingMember, 'true');
    } catch {}

    // Best-effort submit to Google Form (no-cors, can't read response)
    try {
        await submitToGoogleForm(memberData);
    } catch (err) {
        console.warn('Founding form submission failed silently:', err);
    }

    // Reset UI state
    if (submitBtn) submitBtn.disabled = false;
    if (submitText) submitText.style.display = '';
    if (submitSpinner) submitSpinner.style.display = 'none';

    refreshBadge();
    hideWelcomeModal();
    toast('🎉 مرحباً بك يا عضو مؤسس!', 'success', 4500);
}

// ============ HELPERS ============

function isValidEmail(s) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

function toast(msg, type = 'info', duration = 3000) {
    // Use the app's existing toast system if present, otherwise fallback
    const container = document.getElementById('toastContainer');
    if (!container) { console.log('[toast]', msg); return; }
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    const icons = { success: '✓', error: '✘', info: 'ℹ', warning: '⚠' };
    t.innerHTML = `<span class="toast-icon">${icons[type] || icons.info}</span><span>${msg}</span>`;
    container.appendChild(t);
    setTimeout(() => {
        t.style.opacity = '0';
        t.style.transform = 'translateY(-20px)';
        setTimeout(() => t.remove(), 300);
    }, duration);
}

function refreshBadge() {
    const badge = document.getElementById('foundingMemberBadge');
    if (!badge) return;
    badge.style.display = isFoundingMember() ? 'inline-flex' : 'none';
}

async function submitToGoogleForm(data) {
    const cfg = GOOGLE_FORM_CONFIG;
    if (!cfg.formActionUrl || cfg.formActionUrl.indexOf('docs.google.com') === -1) {
        // Form not configured yet — store locally and exit silently.
        // Once you wire up the Google Form, real submissions will start working.
        return;
    }

    const formData = new FormData();
    if (cfg.fields.name) formData.append(cfg.fields.name, data.name || '');
    if (cfg.fields.email) formData.append(cfg.fields.email, data.email || '');
    if (cfg.fields.organization) formData.append(cfg.fields.organization, data.organization || '');
    if (cfg.fields.timestamp) formData.append(cfg.fields.timestamp, data.joinedAt || '');

    // Google Forms requires no-cors; we can't read the response, but the row
    // gets created in the linked spreadsheet.
    await fetch(cfg.formActionUrl, {
        method: 'POST',
        mode: 'no-cors',
        body: formData,
    });
}
