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
            body: JSON.stringify({ 
                email: document.getElementById('reg-email').value, 
                password: document.getElementById('reg-password').value, 
                business_name: document.getElementById('reg-business').value,
                whatsapp_number: document.getElementById('reg-whatsapp').value
            })
        });
        const d = await res.json();
        if (!res.ok) throw new Error(d.error);
        toast(d.message); document.getElementById('switch-to-login').click();
    } catch(e) { toast(e.message,'error'); }
});

document.getElementById('forgot-password-form').addEventListener('submit', async e => {
    e.preventDefault();
    try {
        const res = await fetch(API+'/auth/reset-password', { method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({
                email: document.getElementById('forgot-email').value,
                business_name: document.getElementById('forgot-business').value,
                new_password: document.getElementById('forgot-password').value
            })
        });
        const d = await res.json();
        if (!res.ok) throw new Error(d.error);
        toast(d.message); document.getElementById('switch-to-login2').click();
        document.getElementById('forgot-password-form').reset();
    } catch(e) { toast(e.message, 'error'); }
});

document.getElementById('switch-to-register').onclick = () => { document.getElementById('login-form').classList.remove('active'); document.getElementById('forgot-password-form').classList.remove('active'); document.getElementById('register-form').classList.add('active'); };
document.getElementById('switch-to-login').onclick = () => { document.getElementById('register-form').classList.remove('active'); document.getElementById('forgot-password-form').classList.remove('active'); document.getElementById('login-form').classList.add('active'); };
document.getElementById('switch-to-forgot').onclick = (e) => { e.preventDefault(); document.getElementById('login-form').classList.remove('active'); document.getElementById('register-form').classList.remove('active'); document.getElementById('forgot-password-form').classList.add('active'); };
document.getElementById('switch-to-login2').onclick = () => { document.getElementById('forgot-password-form').classList.remove('active'); document.getElementById('login-form').classList.add('active'); };

function logout() { token=null; bizName=''; role='user'; localStorage.removeItem('pos_token'); localStorage.removeItem('pos_business'); localStorage.removeItem('pos_role'); checkAuth(); }
document.getElementById('btn-logout').onclick = logout;

// === PROFILE ===
document.getElementById('btn-profile').onclick = async () => {
    try {
        const res = await fetch(API + '/auth/profile', {
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
        });
        if (!res.ok) { toast('Failed to load profile', 'error'); return; }
        const p = await res.json();
        document.getElementById('profile-business').value = p.business_name || '';
        document.getElementById('profile-email').value = p.email || '';
        document.getElementById('profile-phone').value = p.whatsapp_number || '';
        document.getElementById('profile-role').value = p.role || 'user';
        document.getElementById('profile-password').value = '';
        openModal('modal-profile');
    } catch(e) { toast(e.message, 'error'); }
};

document.getElementById('btn-save-profile').onclick = async () => {
    const data = {
        business_name: document.getElementById('profile-business').value,
        email: document.getElementById('profile-email').value,
        whatsapp_number: document.getElementById('profile-phone').value
    };
    const pw = document.getElementById('profile-password').value;
    if (pw.trim()) data.password = pw;
    if (!data.business_name || !data.email) return toast('Business name and email required', 'error');
    try {
        const res = await fetch(API + '/auth/profile', {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        const d = await res.json();
        if (!res.ok) throw new Error(d.error);
        bizName = d.business_name;
        localStorage.setItem('pos_business', bizName);
        document.getElementById('biz-name').textContent = bizName;
        toast('Profile updated');
        closeModal('modal-profile');
    } catch(e) { toast(e.message, 'error'); }
};

// === INVOICE SETTINGS ===
window.openInvoiceSettingsModal = async function() {
    try {
        const res = await fetch(API + '/auth/profile', {
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
        });
        if (!res.ok) { toast('Failed to load profile settings', 'error'); return; }
        const p = await res.json();
        const inv = p.invoice_settings || {};
        document.getElementById('inv-set-title').value = inv.header_title || 'SMARTZONE';
        document.getElementById('inv-set-subtitle').value = inv.header_subtitle || 'New Town Padaviya, Anuradhapura';
        document.getElementById('inv-set-contact').value = inv.header_contact || 'Mobile: 078-68000 86';
        
        document.getElementById('inv-set-tax').value = inv.tax_invoice_text || 'Tax Invoice';
        document.getElementById('inv-set-billno').value = inv.label_bill_no || 'Bill No:';
        document.getElementById('inv-set-cashier').value = inv.label_cashier || 'Cashier:';
        document.getElementById('inv-set-customer').value = inv.label_customer || 'Customer:';
        document.getElementById('inv-set-tel').value = inv.label_tel || 'Tel:';
        
        document.getElementById('inv-set-item').value = inv.label_item || 'Item';
        document.getElementById('inv-set-qty').value = inv.label_qty || 'Qty';
        document.getElementById('inv-set-amt').value = inv.label_amt || 'Amount'; // Assuming amt was used, wait schema says label_amount
        document.getElementById('inv-set-subtotal').value = inv.label_subtotal || 'Subtotal';
        document.getElementById('inv-set-total').value = inv.label_total || 'TOTAL';
        document.getElementById('inv-set-paid').value = inv.label_amount_paid || 'Amount Paid';
        document.getElementById('inv-set-bal').value = inv.label_balance || 'Balance';
        
        document.getElementById('inv-set-msg1').value = inv.footer_message1 || 'Thank You! Come Again';
        document.getElementById('inv-set-msg2').value = inv.footer_message2 || 'Please keep this receipt for warranty claims.<br>Items with IMEI are subject to warranty conditions.';
        document.getElementById('inv-set-powered').value = inv.footer_powered_by || 'Powered by SmartZone';
        
        closeModal('modal-profile');
        openModal('modal-invoice-settings');
    } catch(e) { toast(e.message, 'error'); }
};

document.getElementById('btn-save-invoice-settings').onclick = async () => {
    const data = {
        invoice_settings: {
            header_title: document.getElementById('inv-set-title').value,
            header_subtitle: document.getElementById('inv-set-subtitle').value,
            header_contact: document.getElementById('inv-set-contact').value,
            tax_invoice_text: document.getElementById('inv-set-tax').value,
            label_bill_no: document.getElementById('inv-set-billno').value,
            label_cashier: document.getElementById('inv-set-cashier').value,
            label_customer: document.getElementById('inv-set-customer').value,
            label_tel: document.getElementById('inv-set-tel').value,
            label_item: document.getElementById('inv-set-item').value,
            label_qty: document.getElementById('inv-set-qty').value,
            label_amount: document.getElementById('inv-set-amt').value,
            label_subtotal: document.getElementById('inv-set-subtotal').value,
            label_total: document.getElementById('inv-set-total').value,
            label_amount_paid: document.getElementById('inv-set-paid').value,
            label_balance: document.getElementById('inv-set-bal').value,
            footer_message1: document.getElementById('inv-set-msg1').value,
            footer_message2: document.getElementById('inv-set-msg2').value,
            footer_powered_by: document.getElementById('inv-set-powered').value
        }
    };
    try {
        const res = await fetch(API + '/auth/profile', {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        if (!res.ok) throw new Error('Failed to update invoice settings');
        toast('Invoice settings saved successfully');
        closeModal('modal-invoice-settings');
    } catch(e) { toast(e.message, 'error'); }
};

function checkAuth() {
    if (token) {
        document.getElementById('auth-overlay').classList.remove('active');
        document.getElementById('biz-name').textContent = bizName;
        if (role === 'admin') { 
            document.getElementById('nav-admin-item').style.display='block'; 
            document.getElementById('nav-admin-divider').style.display='block'; 
        } else {
            document.getElementById('nav-admin-item').style.display='none'; 
            document.getElementById('nav-admin-divider').style.display='none'; 
        }
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
            if(target==='suppliers-view') loadSuppliers();
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

// === SUPPLIERS ===
let suppliers = [];
async function loadSuppliers() {
    const search = document.getElementById('sup-search')?.value || '';
    try {
        const res = await api(`/suppliers?search=${encodeURIComponent(search)}`);
        if (!res) return;
        suppliers = await res.json();
        
        // Populate supplier table
        const tb = document.querySelector('#sup-table tbody');
        if (tb) {
            tb.innerHTML = suppliers.map(c => `<tr>
                <td><strong>${c.name}</strong></td><td>${c.phone}</td>
                <td>${c.nic_number||'-'}</td><td>${c.email||'-'}</td><td>${c.address||'-'}</td>
                <td><button class="btn btn-sm btn-outline" onclick="editSupplier('${c.id}')"><i class='bx bx-edit'></i></button>
                    <button class="btn btn-sm btn-danger" onclick="deleteSupplier('${c.id}')"><i class='bx bx-trash'></i></button></td>
            </tr>`).join('');
        }

        // Populate product modal supplier dropdown
        const prodSup = document.getElementById('prod-supplier');
        if (prodSup) {
            const currentVal = prodSup.value;
            prodSup.innerHTML = '<option value="">-- No Supplier --</option>' +
                suppliers.map(c => `<option value="${c.name}">${c.name}</option>`).join('');
            if (currentVal && suppliers.some(s => s.name === currentVal)) prodSup.value = currentVal;
        }
    } catch(e) { console.error(e); }
}

function setupSupplierModal() {
    document.getElementById('btn-add-supplier').onclick = () => {
        document.getElementById('supplier-form').reset();
        document.getElementById('sup-id').value = '';
        document.getElementById('supplier-modal-title').textContent = 'Add Supplier';
        openModal('modal-supplier');
    };
    document.getElementById('sup-search').onkeyup = loadSuppliers;
    
    document.getElementById('btn-save-supplier').onclick = async () => {
        const id = document.getElementById('sup-id').value;
        const data = {
            name: document.getElementById('sup-name').value,
            phone: document.getElementById('sup-phone').value,
            nic_number: document.getElementById('sup-nic').value,
            email: document.getElementById('sup-email').value,
            address: document.getElementById('sup-addr').value
        };
        if (!data.name || !data.phone) return toast('Name and phone required', 'error');
        try {
            const res = await api(id ? `/suppliers/${id}` : '/suppliers', { method: id?'PUT':'POST', body: JSON.stringify(data) });
            if (!res) return;
            const d = await res.json();
            if (!res.ok) throw new Error(d.error);
            toast(id ? 'Supplier updated' : 'Supplier added');
            closeModal('modal-supplier'); loadSuppliers();
        } catch(e) { toast(e.message, 'error'); }
    };
}

async function editSupplier(id) {
    const s = suppliers.find(x => x.id === id);
    if (!s) return;
    document.getElementById('sup-id').value = s.id;
    document.getElementById('sup-name').value = s.name;
    document.getElementById('sup-phone').value = s.phone;
    document.getElementById('sup-nic').value = s.nic_number || '';
    document.getElementById('sup-email').value = s.email || '';
    document.getElementById('sup-addr').value = s.address || '';
    document.getElementById('supplier-modal-title').textContent = 'Edit Supplier';
    openModal('modal-supplier');
}

async function deleteSupplier(id) {
    if (!confirm('Delete this supplier?')) return;
    try {
        const res = await api(`/suppliers/${id}`, { method:'DELETE' });
        if (!res) return;
        if (!res.ok) throw new Error('Failed to delete');
        toast('Supplier deleted'); loadSuppliers();
    } catch(e) { toast(e.message, 'error'); }
}

// === INIT ===
document.addEventListener('DOMContentLoaded', () => {
    initTheme(); checkAuth(); updateClock(); setInterval(updateClock, 1000);
    setupNav(); setupProductModal(); setupImeiModal(); setupCustomerModal(); setupSupplierModal();
    setupPOS(); setupWarranty(); setupSLT(); setupStatusModal(); setupInvoiceFilters(); setupReportTabs();
    // Scan mode toggle
    document.getElementById('btn-scan-mode').onclick = toggleScanMode;
    // Admin edit save button
    document.getElementById('btn-save-admin-edit').onclick = saveAdminEdit;
    // Clear bill button
    document.getElementById('btn-clear-bill').onclick = () => {
        if (currentBill.length && !confirm('Clear the current bill?')) return;
        currentBill = []; imeiInBill = []; hasImeiInBill = false;
        voucherDiscount = 0; voucherCode = '';
        document.getElementById('pos-customer-box').style.display = 'none';
        const custBtn = document.getElementById('btn-toggle-customer');
        if (custBtn) { custBtn.classList.remove('btn-primary'); custBtn.classList.add('btn-outline'); }
        document.getElementById('voucher-discount-row').style.display = 'none';
        document.getElementById('pos-voucher').value = '';
        document.getElementById('pos-cust-name').value = '';
        document.getElementById('pos-cust-phone').value = '';
        document.getElementById('pos-cust-nic').value = '';
        document.getElementById('pos-cust-email').value = '';
        document.getElementById('pos-cust-address').value = '';
        document.getElementById('pos-cust-select').value = '';
        renderBill();
    };
});
