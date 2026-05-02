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
            if(target==='design-view') loadInvoiceDesigner();
            if(target==='reports-view') loadReports('sales');
            if(target==='admin-view') loadAdmin();
            if(target==='slt-view') { /* ready for generate */ }
            if(target==='barcode-view') loadBarcodeProducts();
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
        const res = await api(`/suppliers?search=${encodeURIComponent(search)}&_t=${Date.now()}`);
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

// === INVOICE DESIGNER ===
let invoiceTemplates = [];
const DEFAULT_ORDER = ['header', 'invoice_info', 'people_info', 'items', 'totals', 'footer'];
const DEFAULT_VIS = { header:true, invoice_info:true, people_info:true, items:true, totals:true, footer:true };
const DEFAULT_LABELS = {
    header_title: 'SMARTZONE', header_subtitle: 'New Town Padaviya, Anuradhapura', header_contact: 'Mobile: 078-68000 86', tax_text: 'Tax Invoice',
    label_bill: 'Bill No:', label_date: 'Date:',
    label_cashier: 'Cashier:', label_customer: 'Customer:', label_tel: 'Tel:',
    label_item: 'Item', label_qty: 'Qty', label_amount: 'Amount',
    label_subtotal: 'Subtotal', label_total: 'TOTAL', label_paid: 'Amount Paid', label_balance: 'Balance',
    footer_msg1: 'Thank You! Come Again', footer_msg2: 'Please keep this receipt for warranty claims.'
};

let currentOrder = [...DEFAULT_ORDER];
let currentVis = {...DEFAULT_VIS};
let currentLabels = {...DEFAULT_LABELS};

function renderBuilderBlocks() {
    const container = document.getElementById('builder-blocks');
    container.innerHTML = '';
    
    const blockNames = {
        header: 'Header (Store Info)',
        invoice_info: 'Invoice Meta (Bill No & Date)',
        people_info: 'People Info (Cashier & Customer)',
        items: 'Items Table',
        totals: 'Totals & Balance',
        footer: 'Footer Messages'
    };

    currentOrder.forEach((blockId, index) => {
        const isVis = currentVis[blockId] !== false;
        
        let settingsHtml = '';
        if (blockId === 'header') {
            settingsHtml = `
                <div class="form-group"><label>Title</label><input type="text" class="form-control" onchange="updateLabel('header_title', this.value)" value="${currentLabels.header_title}"></div>
                <div class="form-group"><label>Subtitle</label><input type="text" class="form-control" onchange="updateLabel('header_subtitle', this.value)" value="${currentLabels.header_subtitle}"></div>
                <div class="form-group"><label>Contact</label><input type="text" class="form-control" onchange="updateLabel('header_contact', this.value)" value="${currentLabels.header_contact}"></div>
                <div class="form-group"><label>Tax Text</label><input type="text" class="form-control" onchange="updateLabel('tax_text', this.value)" value="${currentLabels.tax_text}"></div>
            `;
        } else if (blockId === 'invoice_info') {
            settingsHtml = `
                <div class="form-group"><label>Bill No Label</label><input type="text" class="form-control" onchange="updateLabel('label_bill', this.value)" value="${currentLabels.label_bill}"></div>
                <div class="form-group"><label>Date Label</label><input type="text" class="form-control" onchange="updateLabel('label_date', this.value)" value="${currentLabels.label_date}"></div>
            `;
        } else if (blockId === 'people_info') {
            settingsHtml = `
                <div class="form-group"><label>Cashier Label</label><input type="text" class="form-control" onchange="updateLabel('label_cashier', this.value)" value="${currentLabels.label_cashier}"></div>
                <div class="form-group"><label>Customer Label</label><input type="text" class="form-control" onchange="updateLabel('label_customer', this.value)" value="${currentLabels.label_customer}"></div>
                <div class="form-group"><label>Tel Label</label><input type="text" class="form-control" onchange="updateLabel('label_tel', this.value)" value="${currentLabels.label_tel}"></div>
            `;
        } else if (blockId === 'items') {
            settingsHtml = `
                <div style="display:flex;gap:5px;">
                    <div class="form-group"><label>Item</label><input type="text" class="form-control" onchange="updateLabel('label_item', this.value)" value="${currentLabels.label_item}"></div>
                    <div class="form-group"><label>Qty</label><input type="text" class="form-control" onchange="updateLabel('label_qty', this.value)" value="${currentLabels.label_qty}"></div>
                    <div class="form-group"><label>Amount</label><input type="text" class="form-control" onchange="updateLabel('label_amount', this.value)" value="${currentLabels.label_amount}"></div>
                </div>
            `;
        } else if (blockId === 'totals') {
            settingsHtml = `
                <div style="display:flex;gap:5px;">
                    <div class="form-group"><label>Subtotal</label><input type="text" class="form-control" onchange="updateLabel('label_subtotal', this.value)" value="${currentLabels.label_subtotal}"></div>
                    <div class="form-group"><label>TOTAL</label><input type="text" class="form-control" onchange="updateLabel('label_total', this.value)" value="${currentLabels.label_total}"></div>
                </div>
                <div style="display:flex;gap:5px;">
                    <div class="form-group"><label>Paid</label><input type="text" class="form-control" onchange="updateLabel('label_paid', this.value)" value="${currentLabels.label_paid}"></div>
                    <div class="form-group"><label>Balance</label><input type="text" class="form-control" onchange="updateLabel('label_balance', this.value)" value="${currentLabels.label_balance}"></div>
                </div>
            `;
        } else if (blockId === 'footer') {
            settingsHtml = `
                <div class="form-group"><label>Message 1</label><input type="text" class="form-control" onchange="updateLabel('footer_msg1', this.value)" value="${currentLabels.footer_msg1}"></div>
                <div class="form-group"><label>Message 2</label><input type="text" class="form-control" onchange="updateLabel('footer_msg2', this.value)" value="${currentLabels.footer_msg2}"></div>
            `;
        }

        const blockEl = document.createElement('div');
        blockEl.style.border = '1px solid #eee';
        blockEl.style.borderRadius = '6px';
        blockEl.style.overflow = 'hidden';
        
        blockEl.innerHTML = `
            <div style="background:#f8fafc;padding:8px 10px;display:flex;align-items:center;justify-content:space-between;cursor:pointer">
                <div style="display:flex;align-items:center;gap:10px" onclick="toggleSettings('${blockId}')">
                    <i class='bx bx-dots-vertical-rounded' style="color:#aaa"></i>
                    <span style="font-weight:600;font-size:13px;color:${isVis?'#333':'#aaa'}">${blockNames[blockId]}</span>
                </div>
                <div style="display:flex;align-items:center;gap:5px">
                    <button class="btn btn-sm btn-outline" style="padding:2px 5px" onclick="moveBlock(${index}, -1)" ${index===0?'disabled':''}><i class='bx bx-up-arrow-alt'></i></button>
                    <button class="btn btn-sm btn-outline" style="padding:2px 5px" onclick="moveBlock(${index}, 1)" ${index===currentOrder.length-1?'disabled':''}><i class='bx bx-down-arrow-alt'></i></button>
                    <button class="btn btn-sm ${isVis?'btn-primary':'btn-outline'}" style="padding:2px 5px" onclick="toggleVis('${blockId}')"><i class='bx ${isVis?'bx-show':'bx-hide'}'></i></button>
                </div>
            </div>
            <div id="settings-${blockId}" style="display:none;padding:10px;background:#fff;border-top:1px solid #eee">
                ${settingsHtml}
            </div>
        `;
        container.appendChild(blockEl);
    });
}

window.toggleSettings = function(id) {
    const el = document.getElementById(`settings-${id}`);
    if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
};

window.updateLabel = function(key, val) {
    currentLabels[key] = val;
    updateLivePreview();
};

window.moveBlock = function(idx, dir) {
    if (idx + dir < 0 || idx + dir >= currentOrder.length) return;
    const temp = currentOrder[idx];
    currentOrder[idx] = currentOrder[idx + dir];
    currentOrder[idx + dir] = temp;
    renderBuilderBlocks();
    updateLivePreview();
};

window.toggleVis = function(id) {
    currentVis[id] = currentVis[id] === false ? true : false;
    renderBuilderBlocks();
    updateLivePreview();
};

function updateLivePreview() {
    let previewHtml = '';
    
    currentOrder.forEach(blockId => {
        if (currentVis[blockId] === false) return;
        
        if (blockId === 'header') {
            previewHtml += `
                <div style="text-align:center;margin-bottom:12px;">
                    <h1 style="margin:0;font-size:24px;font-weight:800;text-transform:uppercase;">${currentLabels.header_title}</h1>
                    <p style="margin:2px 0;font-size:11px;font-weight:500;">${currentLabels.header_subtitle}</p>
                    <p style="margin:0;font-size:11px;font-weight:500;">${currentLabels.header_contact}</p>
                    <div style="border-bottom:1.5px dashed #000;margin:8px 0;"></div>
                    <h2 style="margin:0;font-size:14px;font-weight:700;text-transform:uppercase;">${currentLabels.tax_text}</h2>
                </div>
            `;
        } else if (blockId === 'invoice_info') {
            previewHtml += `
                <div style="font-size:11px;font-weight:500;display:flex;justify-content:space-between;margin-bottom:4px;">
                    <span>${currentLabels.label_bill} INV-1001</span>
                    <span>${currentLabels.label_date} 2026-05-01</span>
                </div>
            `;
        } else if (blockId === 'people_info') {
            previewHtml += `
                <div style="font-size:11px;font-weight:500;margin-bottom:8px;">
                    <div style="margin-bottom:4px;">${currentLabels.label_cashier} <strong>John Doe</strong></div>
                    <div style="margin-top:6px;">
                        <div style="font-weight:700;">${currentLabels.label_customer} Jane Smith</div>
                        <div>${currentLabels.label_tel} 0712345678</div>
                    </div>
                </div>
            `;
        } else if (blockId === 'items') {
            previewHtml += `
                <div style="border-bottom:1.5px dashed #000;margin-bottom:8px;"></div>
                <div style="display:flex;justify-content:space-between;font-weight:700;font-size:11px;margin-bottom:8px;">
                    <span style="width:55%;">${currentLabels.label_item}</span>
                    <span style="width:15%;text-align:center">${currentLabels.label_qty}</span>
                    <span style="width:30%;text-align:right">${currentLabels.label_amount}</span>
                </div>
                <div style="border-bottom:1.5px dashed #000;margin-bottom:8px;"></div>
                <div style="font-size:11px;margin-bottom:10px;">
                    <div style="display:flex;justify-content:space-between;margin-bottom:4px">
                        <span style="width:55%;">Sample Router</span><span style="width:15%;text-align:center">1</span><span style="width:30%;text-align:right">15000.00</span>
                    </div>
                </div>
                <div style="border-bottom:1.5px dashed #000;margin-bottom:8px;"></div>
            `;
        } else if (blockId === 'totals') {
            previewHtml += `
                <div style="font-size:12px;margin-bottom:10px;">
                    <div style="display:flex;justify-content:space-between;margin-bottom:4px;"><span>${currentLabels.label_subtotal}</span><span>15000.00</span></div>
                    <div style="border-bottom:1.5px dashed #000;margin:6px 0;"></div>
                    <div style="display:flex;justify-content:space-between;font-weight:800;font-size:16px;margin:6px 0;"><span>${currentLabels.label_total}</span><span>15000.00</span></div>
                    <div style="border-bottom:1.5px dashed #000;margin:6px 0;"></div>
                    <div style="display:flex;justify-content:space-between;margin-top:8px;margin-bottom:4px;"><span>${currentLabels.label_paid}</span><span>15000.00</span></div>
                    <div style="display:flex;justify-content:space-between;font-weight:700;font-size:14px;"><span>${currentLabels.label_balance}</span><span>0.00</span></div>
                </div>
                <div style="border-bottom:1.5px dashed #000;margin:10px 0;"></div>
            `;
        } else if (blockId === 'footer') {
            previewHtml += `
                <div style="text-align:center;font-size:10px;margin-top:12px;">
                    <p style="font-weight:700;font-size:14px;margin:0 0 4px 0;">${currentLabels.footer_msg1}</p>
                    <p style="margin:0 0 8px 0;line-height:1.3;">${currentLabels.footer_msg2}</p>
                </div>
            `;
        }
    });

    previewHtml += `<div style="text-align:center;font-size:10px;margin-top:12px;border-top:1.5px dashed #000;padding-top:10px"><p style="margin:0;font-size:12px;font-family:monospace;color:#555;">Powered by SmartZone</p></div>`;
    document.getElementById('tpl-preview').innerHTML = `<div style="width:100%;max-width:80mm;margin:0 auto;font-family:sans-serif;color:#000">${previewHtml}</div>`;
}

function setupDesigner() {
    document.getElementById('template-select').addEventListener('change', (e) => {
        const t = invoiceTemplates.find(x => x._id === e.target.value);
        if (t) {
            document.getElementById('tpl-id').value = t._id;
            document.getElementById('tpl-name').value = t.name;
            currentOrder = Array.isArray(t.order) && t.order.length ? [...t.order] : [...DEFAULT_ORDER];
            currentVis = t.visibility ? {...t.visibility} : {...DEFAULT_VIS};
            currentLabels = t.labels ? {...DEFAULT_LABELS, ...t.labels} : {...DEFAULT_LABELS};
            renderBuilderBlocks();
            updateLivePreview();
        } else {
            document.getElementById('tpl-id').value = '';
            document.getElementById('tpl-name').value = '';
            currentOrder = [...DEFAULT_ORDER];
            currentVis = {...DEFAULT_VIS};
            currentLabels = {...DEFAULT_LABELS};
            renderBuilderBlocks();
            updateLivePreview();
        }
    });

    document.getElementById('btn-new-template').onclick = () => {
        document.getElementById('template-select').value = '';
        document.getElementById('tpl-id').value = '';
        document.getElementById('tpl-name').value = '';
        currentOrder = [...DEFAULT_ORDER];
        currentVis = {...DEFAULT_VIS};
        currentLabels = {...DEFAULT_LABELS};
        renderBuilderBlocks();
        updateLivePreview();
    };

    document.getElementById('btn-save-template').onclick = async () => {
        const id = document.getElementById('tpl-id').value;
        const name = document.getElementById('tpl-name').value.trim();
        if (!name) return toast('Template name required', 'error');
        
        let newTemplates = [...invoiceTemplates];
        if (id) {
            const idx = newTemplates.findIndex(t => t._id === id);
            if (idx > -1) {
                newTemplates[idx].name = name;
                newTemplates[idx].order = [...currentOrder];
                newTemplates[idx].visibility = {...currentVis};
                newTemplates[idx].labels = {...currentLabels};
            }
        } else {
            newTemplates.push({ 
                name, 
                order: [...currentOrder], 
                visibility: {...currentVis}, 
                labels: {...currentLabels},
                is_active: newTemplates.length === 0 
            });
        }
        
        try {
            const res = await api('/auth/profile', { method: 'PUT', body: JSON.stringify({ invoice_templates: newTemplates }) });
            if (!res.ok) throw new Error('Save failed');
            toast('Template saved');
            await loadInvoiceDesigner();
        } catch(e) { toast(e.message, 'error'); }
    };

    document.getElementById('btn-delete-template').onclick = async () => {
        const id = document.getElementById('tpl-id').value;
        if (!id) return toast('Select a template first', 'error');
        if (!confirm('Delete this template?')) return;
        
        let newTemplates = invoiceTemplates.filter(t => t._id !== id);
        try {
            const res = await api('/auth/profile', { method: 'PUT', body: JSON.stringify({ invoice_templates: newTemplates }) });
            if (!res.ok) throw new Error('Delete failed');
            toast('Template deleted');
            await loadInvoiceDesigner();
        } catch(e) { toast(e.message, 'error'); }
    };

    document.getElementById('btn-activate-template').onclick = async () => {
        const id = document.getElementById('tpl-id').value;
        if (!id) return toast('Select a template first', 'error');
        
        let newTemplates = invoiceTemplates.map(t => ({ ...t, is_active: t._id === id }));
        try {
            const res = await api('/auth/profile', { method: 'PUT', body: JSON.stringify({ invoice_templates: newTemplates }) });
            if (!res.ok) throw new Error('Activation failed');
            toast('Template activated');
            await loadInvoiceDesigner();
        } catch(e) { toast(e.message, 'error'); }
    };
}

async function loadInvoiceDesigner() {
    try {
        const res = await api('/auth/profile');
        if (!res) return;
        const p = await res.json();
        invoiceTemplates = p.invoice_templates || [];
        
        const sel = document.getElementById('template-select');
        sel.innerHTML = '<option value="">-- Select Template --</option>' + 
            invoiceTemplates.map(t => `<option value="${t._id}">${t.name} ${t.is_active ? '(Active)' : ''}</option>`).join('');
            
        const active = invoiceTemplates.find(t => t.is_active);
        if (active && !document.getElementById('tpl-id').value) {
            sel.value = active._id;
            sel.dispatchEvent(new Event('change'));
        } else {
            renderBuilderBlocks();
            updateLivePreview();
        }
    } catch(e) { console.error(e); }
}

// === INIT ===
document.addEventListener('DOMContentLoaded', () => {
    initTheme(); checkAuth(); updateClock(); setInterval(updateClock, 1000);
    setupNav(); setupProductModal(); setupImeiModal(); setupCustomerModal(); setupSupplierModal(); setupDesigner();
    setupPOS(); setupWarranty(); setupSLT(); setupStatusModal(); setupInvoiceFilters(); setupReportTabs();
    setupBarcodePrinting();
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

// === BARCODE PRINTING ===
let barcodeQueue = [];
function setupBarcodePrinting() {
    const searchInput = document.getElementById('barcode-prod-search');
    if (searchInput) searchInput.onkeyup = loadBarcodeProducts;
    
    const clearBtn = document.getElementById('btn-clear-barcode-queue');
    if (clearBtn) clearBtn.onclick = clearBarcodeQueue;
    
    const printBtn = document.getElementById('btn-print-barcodes');
    if (printBtn) printBtn.onclick = printBarcodes;

    // Load preferences
    if (localStorage.getItem('barcode_cfg_size')) document.getElementById('barcode-cfg-size').value = localStorage.getItem('barcode_cfg_size');

    const scanInput = document.getElementById('barcode-scan-input');
    if (scanInput) {
        scanInput.onkeydown = async e => {
            if (e.key === 'Enter') {
                const barcode = sanitizeBarcode(scanInput.value);
                scanInput.value = '';
                if (products.length === 0) await loadInventory();
                const p = products.find(x => x.barcode === barcode);
                if (p) {
                    if (p.is_imei_tracked) return toast('Cannot print barcodes for IMEI items', 'error');
                    addToBarcodeQueue(p.id);
                } else {
                    toast('Product not found with this barcode', 'error');
                }
            }
        };
    }
}

async function loadBarcodeProducts() {
    const search = (document.getElementById('barcode-prod-search')?.value || '').toLowerCase();
    const tb = document.querySelector('#barcode-selection-table tbody');
    if (!tb) return;

    if (products.length === 0) await loadInventory(); 

    const filtered = products.filter(p => 
        !p.is_imei_tracked && (
            p.name.toLowerCase().includes(search) || 
            (p.barcode && p.barcode.toLowerCase().includes(search))
        )
    );

    tb.innerHTML = filtered.map(p => `<tr>
        <td><strong>${p.name}</strong></td>
        <td>${p.barcode || '<span style="color:var(--text-muted)">No Barcode</span>'}</td>
        <td>${(p.price || 0).toFixed(2)}</td>
        <td><button class="btn btn-sm btn-primary" onclick="addToBarcodeQueue('${p.id}')"><i class='bx bx-plus'></i> Add</button></td>
    </tr>`).join('');
}

window.addToBarcodeQueue = function(id) {
    const p = products.find(x => x.id === id);
    if (!p) return;
    if (!p.barcode) return toast('Product has no barcode. Edit product to add one.', 'error');

    const existing = barcodeQueue.find(x => x.id === id);
    if (existing) {
        existing.copies++;
    } else {
        barcodeQueue.push({ ...p, copies: 1 });
    }
    renderBarcodeQueue();
    toast(`Added ${p.name} to queue`);
}

window.removeFromBarcodeQueue = function(id) {
    barcodeQueue = barcodeQueue.filter(x => x.id !== id);
    renderBarcodeQueue();
}

window.updateBarcodeCopies = function(id, copies) {
    const item = barcodeQueue.find(x => x.id === id);
    if (item) item.copies = parseInt(copies) || 1;
}

function clearBarcodeQueue() {
    if (barcodeQueue.length === 0) return;
    if (confirm('Clear the printing queue?')) {
        barcodeQueue = [];
        renderBarcodeQueue();
    }
}

function renderBarcodeQueue() {
    const tb = document.querySelector('#barcode-queue-table tbody');
    if (!tb) return;
    tb.innerHTML = barcodeQueue.map(p => `<tr>
        <td><strong>${p.name}</strong></td>
        <td>${p.barcode}</td>
        <td><input type="number" class="form-control copies-input" value="${p.copies}" min="1" onchange="updateBarcodeCopies('${p.id}', this.value)"></td>
        <td><button class="btn btn-sm btn-danger" onclick="removeFromBarcodeQueue('${p.id}')"><i class='bx bx-trash'></i></button></td>
    </tr>`).join('');
}

function printBarcodes() {
    if (barcodeQueue.length === 0) return toast('Queue is empty', 'error');

    const size = document.getElementById('barcode-cfg-size').value;
    localStorage.setItem('barcode_cfg_size', size);

    // Map presets to dimensions for perfect scannability
    const presets = {
        small:  { w: 48, h: 28, scale: 1.4, font: 9, svgH: 55 },
        medium: { w: 48, h: 38, scale: 1.6, font: 10, svgH: 80 },
        large:  { w: 65, h: 48, scale: 1.9, font: 12, svgH: 100 }
    };
    const cfg = presets[size];

    const printArea = document.getElementById('print-area');
    printArea.innerHTML = '';
    
    const renderTasks = [];

    barcodeQueue.forEach(item => {
        for (let i = 0; i < item.copies; i++) {
            const sticker = document.createElement('div');
            sticker.className = 'barcode-sticker';
            sticker.style.width = `${cfg.w}mm`;
            sticker.style.height = `${cfg.h}mm`;
            
            const svgId = `barcode-print-${item.id}-${i}-${Math.random().toString(36).substr(2, 5)}`;
            
            sticker.innerHTML = `
                <div class="sticker-name" style="font-size:${cfg.font}pt; margin-bottom:1mm">${item.name}</div>
                <svg id="${svgId}"></svg>
                <div class="sticker-price" style="font-size:${cfg.font - 1}pt; margin-top:1mm">Rs. ${(item.price || 0).toFixed(2)}</div>
            `;
            
            printArea.appendChild(sticker);
            renderTasks.push({ id: svgId, code: item.barcode });
        }
    });

    // Render all barcodes
    setTimeout(() => {
        renderTasks.forEach(task => {
            try {
                JsBarcode(`#${task.id}`, task.code, {
                    format: "CODE128",
                    width: cfg.scale,
                    height: cfg.svgH,
                    displayValue: true,
                    fontSize: 14,
                    margin: 4, // Essential "Quiet Zone" for scanners
                    background: "#ffffff",
                    lineColor: "#000000"
                });
            } catch(e) { console.error("Barcode generation failed", e); }
        });

        setTimeout(() => {
            document.body.classList.add('printing-barcodes');
            if (size === 'large') document.body.classList.add('size-large');
            window.print();
            setTimeout(() => {
                document.body.classList.remove('printing-barcodes');
                document.body.classList.remove('size-large');
            }, 1000);
        }, 500);
    }, 100);
}
