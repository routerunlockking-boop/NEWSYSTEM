const API = '/api';
let token = localStorage.getItem('pos_token') || null;
let bizName = localStorage.getItem('pos_business') || '';
let role = localStorage.getItem('pos_role') || 'user';
let products = [], customers = [], currentBill = [], imeiInBill = [];
let hasImeiInBill = false;
let scanModeActive = false;
let voucherDiscount = 0;
let voucherCode = '';

// === UTILITY ===
function toast(msg, type='success') {
    const c = document.getElementById('toast-container');
    const t = document.createElement('div');
    t.style.cssText = `padding:12px 18px;border-radius:10px;color:#fff;font-weight:500;font-size:13px;
        box-shadow:0 8px 24px rgba(0,0,0,0.18);opacity:0;transform:translateY(-20px);
        transition:all 0.4s ease;display:flex;align-items:center;gap:8px;max-width:360px;
        background:${type==='success'?'linear-gradient(135deg,#10b981,#059669)':type==='scan'?'linear-gradient(135deg,#3b82f6,#2563eb)':'linear-gradient(135deg,#ef4444,#dc2626)'}`;
    const icon = type==='success'?'bx-check-circle':type==='scan'?'bx-barcode':'bx-error-circle';
    t.innerHTML = `<i class='bx ${icon}'></i>${msg}`;
    c.appendChild(t);
    requestAnimationFrame(() => { t.style.opacity='1'; t.style.transform='translateY(0)'; });
    setTimeout(() => { t.style.opacity='0'; setTimeout(() => t.remove(), 400); }, 3500);
}

async function api(url, opts={}) {
    const h = opts.headers || {};
    if (token) h['Authorization'] = `Bearer ${token}`;
    h['Content-Type'] = h['Content-Type'] || 'application/json';
    opts.headers = h;
    const res = await fetch(API + url, opts);
    if (res.status === 401) { logout(); return null; }
    return res;
}

function openModal(id) { document.getElementById(id).classList.add('active'); }
function closeModal(id) { document.getElementById(id).classList.remove('active'); }

function formatDate(d) {
    if (!d) return '-';
    return new Intl.DateTimeFormat('en-CA', { timeZone:'Asia/Colombo' }).format(new Date(d));
}

function statusBadge(s) {
    const m = {'In Stock':'green','Sold':'blue','Returned':'yellow','Under Repair':'yellow',
        'Sent to SLT':'yellow','Received from SLT':'blue','Delivered to Customer':'green',
        'Replaced':'gray','Rejected':'red','Cancelled':'red'};
    return `<span class="badge badge-${m[s]||'gray'}">${s}</span>`;
}

// Sanitize barcode scanner input
function sanitizeBarcode(raw) {
    return raw.replace(/[\r\n\t]/g, '').replace(/^[^0-9]*/,'').replace(/[^0-9]*$/,'').trim();
}

// === AUTH ===
document.getElementById('login-form').addEventListener('submit', async e => {
    e.preventDefault();
    try {
        const res = await fetch(API+'/auth/login', { method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({ email:document.getElementById('login-email').value, password:document.getElementById('login-password').value })
        });
        const d = await res.json();
        if (!res.ok) throw new Error(d.error);
        token=d.token; bizName=d.business_name; role=d.role;
        localStorage.setItem('pos_token',token); localStorage.setItem('pos_business',bizName); localStorage.setItem('pos_role',role);
        checkAuth();
    } catch(e) { toast(e.message,'error'); }
});

document.getElementById('register-form').addEventListener('submit', async e => {
    e.preventDefault();
    try {
        const res = await fetch(API+'/auth/register', { method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({ email:document.getElementById('reg-email').value, password:document.getElementById('reg-password').value, business_name:document.getElementById('reg-business').value })
        });
        const d = await res.json();
        if (!res.ok) throw new Error(d.error);
        toast(d.message); document.getElementById('switch-to-login').click();
    } catch(e) { toast(e.message,'error'); }
});

document.getElementById('switch-to-register').onclick = () => { document.getElementById('login-form').classList.remove('active'); document.getElementById('register-form').classList.add('active'); };
document.getElementById('switch-to-login').onclick = () => { document.getElementById('register-form').classList.remove('active'); document.getElementById('login-form').classList.add('active'); };

function logout() { token=null; bizName=''; role='user'; localStorage.removeItem('pos_token'); localStorage.removeItem('pos_business'); localStorage.removeItem('pos_role'); checkAuth(); }
document.getElementById('btn-logout').onclick = logout;

function checkAuth() {
    if (token) {
        document.getElementById('auth-overlay').classList.remove('active');
        document.getElementById('biz-name').textContent = bizName;
        if (role==='admin') { document.getElementById('nav-admin-item').style.display='block'; document.getElementById('nav-admin-divider').style.display='block'; }
        loadDashboard();
    } else { document.getElementById('auth-overlay').classList.add('active'); }
}

// === THEME ===
function initTheme() {
    const saved = localStorage.getItem('pos_theme') || 'light';
    if (saved==='dark') { document.body.classList.add('dark-mode'); document.querySelector('#btn-theme i').classList.replace('bx-moon','bx-sun'); }
    document.getElementById('btn-theme').onclick = () => {
        const dark = document.body.classList.toggle('dark-mode');
        localStorage.setItem('pos_theme', dark?'dark':'light');
        document.querySelector('#btn-theme i').classList.replace(dark?'bx-moon':'bx-sun', dark?'bx-sun':'bx-moon');
    };
}

// === CLOCK ===
function updateClock() { document.getElementById('clock').textContent = new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})+' · '+new Date().toLocaleDateString(); }

// === NAVIGATION ===
let currentView = 'dashboard-view';
function setupNav() {
    document.querySelectorAll('.nav-link').forEach(link => {
        link.onclick = e => {
            e.preventDefault();
            document.querySelectorAll('.nav-link').forEach(l=>l.classList.remove('active'));
            link.classList.add('active');
            const target = link.dataset.target;
            document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
            document.getElementById(target).classList.add('active');
            document.getElementById('page-title').textContent = link.dataset.title;
            currentView = target;
            if(target==='dashboard-view') loadDashboard();
            if(target==='inventory-view') loadInventory();
            if(target==='pos-view') { loadPOS(); focusScanField(); }
            if(target==='imei-view') loadImeiList();
            if(target==='customers-view') loadCustomers();
            if(target==='invoices-view') loadInvoices();
            if(target==='reports-view') loadReports('sales');
            if(target==='admin-view') loadAdmin();
            if(target==='slt-view') { /* ready for generate */ }
        };
    });
}

// === SCAN MODE ===
function toggleScanMode() {
    scanModeActive = !scanModeActive;
    const bar = document.getElementById('scan-mode-bar');
    const btn = document.getElementById('btn-scan-mode');
    if (scanModeActive) {
        bar.classList.add('active');
        btn.innerHTML = '<i class="bx bx-stop"></i> Stop';
        btn.classList.add('btn-danger');
        btn.classList.remove('btn-primary');
        document.getElementById('pos-view').classList.add('scan-mode-active');
        focusScanField();
    } else {
        bar.classList.remove('active');
        btn.innerHTML = '<i class="bx bx-broadcast"></i> Scan';
        btn.classList.remove('btn-danger');
        btn.classList.add('btn-primary');
        document.getElementById('pos-view').classList.remove('scan-mode-active');
    }
}

function focusScanField() {
    setTimeout(() => { const el = document.getElementById('pos-scan'); if(el) el.focus(); }, 100);
}

// === CAMERA BARCODE SCANNER ===
let html5QrScanner = null;
let cameraScanTarget = ''; // 'pos', 'warranty', 'imei-stock'

function openCameraScanner(target) {
    cameraScanTarget = target;
    openModal('modal-camera-scanner');
    document.getElementById('camera-scan-result').textContent = 'Starting camera...';
    document.getElementById('camera-scan-result').style.color = 'var(--text-muted)';

    setTimeout(() => {
        if (html5QrScanner) {
            try { html5QrScanner.clear(); } catch(e) {}
        }
        html5QrScanner = new Html5QrcodeScanner("camera-scanner-region", {
            fps: 15,
            qrbox: { width: 280, height: 120 },
            rememberLastUsedCamera: true,
            supportedScanTypes: [Html5QrcodeScanType.SCAN_TYPE_CAMERA],
            formatsToSupport: [
                Html5QrcodeSupportedFormats.CODE_128,
                Html5QrcodeSupportedFormats.CODE_39,
                Html5QrcodeSupportedFormats.EAN_13,
                Html5QrcodeSupportedFormats.EAN_8,
                Html5QrcodeSupportedFormats.UPC_A,
                Html5QrcodeSupportedFormats.UPC_E,
                Html5QrcodeSupportedFormats.ITF,
                Html5QrcodeSupportedFormats.CODE_93,
                Html5QrcodeSupportedFormats.CODABAR,
                Html5QrcodeSupportedFormats.QR_CODE
            ]
        }, false);

        html5QrScanner.render(onCameraScanSuccess, onCameraScanFailure);
        document.getElementById('camera-scan-result').textContent = 'Point camera at barcode...';
    }, 400);
}

function onCameraScanSuccess(decodedText) {
    const barcode = sanitizeBarcode(decodedText);
    if (!barcode) return;

    // Show scanned result
    const resultEl = document.getElementById('camera-scan-result');
    resultEl.innerHTML = `<span style="color:var(--success);font-weight:700"><i class='bx bx-check-circle'></i> Scanned: ${barcode}</span>`;

    // Route to the right target using direct function calls
    if (cameraScanTarget === 'pos') {
        handlePosScan(barcode);
    } else if (cameraScanTarget === 'warranty') {
        document.getElementById('warranty-scan').value = barcode;
        document.getElementById('btn-warranty-lookup').click();
    } else if (cameraScanTarget === 'imei-stock') {
        handleImeiStockScan(barcode);
    } else if (cameraScanTarget === 'imei-tracker') {
        document.getElementById('imei-search').value = barcode;
        loadImeiList();
    }

    toast(`Scanned: ${barcode}`, 'scan');

    // Close after short delay so user sees the result
    setTimeout(() => closeCameraScanner(), 800);
}

function onCameraScanFailure(error) {
    // Ignore — continuous scanning errors are expected until a barcode is found
}

function closeCameraScanner() {
    if (html5QrScanner) {
        try { html5QrScanner.clear(); } catch(e) {}
        html5QrScanner = null;
    }
    closeModal('modal-camera-scanner');
    // Refocus the right field after closing
    if (cameraScanTarget === 'pos') focusScanField();
    else if (cameraScanTarget === 'imei-stock') {
        setTimeout(() => document.getElementById('imei-scan-input')?.focus(), 200);
    } else if (cameraScanTarget === 'imei-tracker') {
        setTimeout(() => document.getElementById('imei-search')?.focus(), 200);
    }
}

// === INIT ===
document.addEventListener('DOMContentLoaded', () => {
    initTheme(); checkAuth(); updateClock(); setInterval(updateClock, 1000);
    setupNav(); setupProductModal(); setupImeiModal(); setupCustomerModal();
    setupPOS(); setupWarranty(); setupSLT(); setupStatusModal(); setupInvoiceFilters(); setupReportTabs();
    // Scan mode toggle
    document.getElementById('btn-scan-mode').onclick = toggleScanMode;
    // Clear bill button
    document.getElementById('btn-clear-bill').onclick = () => {
        if (currentBill.length && !confirm('Clear the current bill?')) return;
        currentBill = []; imeiInBill = []; hasImeiInBill = false;
        voucherDiscount = 0; voucherCode = '';
        document.getElementById('pos-customer-box').style.display = 'none';
        document.getElementById('voucher-discount-row').style.display = 'none';
        document.getElementById('pos-voucher').value = '';
        renderBill();
    };
});
