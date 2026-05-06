// === POS ===
let lastPosScanTime = 0;
const POS_SCAN_THROTTLE_MS = 500;

// Shared scan handler — called from keyboard Enter AND camera scanner
async function handlePosScan(val) {
    if (!val) return;

    // 1. Immediate throttle check to prevent rapid-fire scans
    const now = Date.now();
    if (now - lastPosScanTime < POS_SCAN_THROTTLE_MS) {
        const remaining = Math.ceil((POS_SCAN_THROTTLE_MS - (now - lastPosScanTime)) / 1000);
        toast(`Scanning too fast! Wait ${remaining}s...`, 'warning');
        return;
    }
    // Update timestamp IMMEDIATELY before any async calls to lock the slot
    lastPosScanTime = now;

    // 2. Try IMEI lookup
    try {
        const res = await api(`/imei/lookup/${encodeURIComponent(val)}`);
        if (res && res.ok) {
            const item = await res.json();
            if (item.status !== 'In Stock') { 
                toast(`IMEI ${val} is ${item.status}`, 'error'); 
                lastPosScanTime = 0; // Reset throttle on error so they can try again
                return; 
            }
            
            if (imeiInBill.find(i => i.imei_number === item.imei_number)) { 
                toast('Already in bill', 'error'); 
                lastPosScanTime = 0; 
                return; 
            }

            // Special handling for SIM Cards category
            if (item.product_category === 'SIM Cards') {
                showSimActivationModal(item);
                focusScanField();
                return;
            }

            addImeiToBill(item);
            focusScanField();
            return;
        }
    } catch(ex) {}

    // 1. Try barcode match
    const valTrim = val.trim();
    if (!valTrim) return;
    
    const prod = products.find(p => p.barcode === valTrim);
    if (prod && !prod.is_imei_tracked) {
        addToBill(prod);
        toast(`Added: ${prod.name}`);
        showLastScanned(prod.name);
    }
    else if (prod && prod.is_imei_tracked) { 
        toast('IMEI product - scan individual IMEI number', 'error'); 
        lastPosScanTime = 0; 
    }
    else { 
        toast(`Not found: ${val}`, 'error'); 
        lastPosScanTime = 0; 
    }
    focusScanField();
}

function setupPOS() {
    loadProducts();
    document.getElementById('pos-scan').addEventListener('keydown', async e => {
        if (e.key !== 'Enter') return;
        const val = e.target.value;
        e.target.value = '';
        await handlePosScan(val);
    });
    document.getElementById('pos-search').addEventListener('input', e => {
        const q = e.target.value.toLowerCase();
        if (posSearchTimeout) clearTimeout(posSearchTimeout);
        posSearchTimeout = setTimeout(() => {
            renderPOSGrid(q);
        }, 150);
    });
    document.getElementById('pos-paid').addEventListener('input', updateBillTotals);
    document.getElementById('btn-submit-bill').addEventListener('click', submitBill);
    
    // Handle customer selection in POS
    document.getElementById('pos-cust-select')?.addEventListener('change', function() {
        if (!this.value) {
            document.getElementById('pos-cust-name').value = '';
            document.getElementById('pos-cust-phone').value = '';
            document.getElementById('pos-cust-nic').value = '';
            document.getElementById('pos-cust-email').value = '';
            document.getElementById('pos-cust-address').value = '';
            return;
        }
        const c = customers.find(x => x.id === this.value);
        if (c) {
            document.getElementById('pos-cust-name').value = c.name;
            document.getElementById('pos-cust-phone').value = c.phone;
            document.getElementById('pos-cust-nic').value = c.nic_number || '';
            document.getElementById('pos-cust-email').value = c.email || '';
            document.getElementById('pos-cust-address').value = c.address || '';
        }
    });

    // Toggle customer section
    document.getElementById('btn-toggle-customer')?.addEventListener('click', () => {
        const box = document.getElementById('pos-customer-box');
        const isVisible = box.style.display !== 'none';
        box.style.display = isVisible ? 'none' : 'block';
        const btn = document.getElementById('btn-toggle-customer');
        if (!isVisible) {
            btn.classList.add('btn-primary');
            btn.classList.remove('btn-outline');
        } else {
            btn.classList.remove('btn-primary');
            btn.classList.add('btn-outline');
        }
    });

    // Hide customer section (X button)
    document.getElementById('btn-hide-customer')?.addEventListener('click', () => {
        if (!hasImeiInBill) {
            document.getElementById('pos-customer-box').style.display = 'none';
            const btn = document.getElementById('btn-toggle-customer');
            btn.classList.remove('btn-primary');
            btn.classList.add('btn-outline');
        }
    });

    // Load customers for the dropdown
    loadCustomers();
    // Load cashiers for the dropdown
    loadCashiers();
}

async function loadCashiers() {
    try {
        const res = await fetch(API + '/auth/cashiers', {
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
        });
        if (!res.ok) return;
        const cashiers = await res.json();
        const sel = document.getElementById('pos-cashier-select');
        if (sel) {
            sel.innerHTML = '<option value="">-- Select Cashier --</option>' +
                cashiers.map(c => `<option value="${c.name}">${c.name} (${c.role})</option>`).join('') +
                '<option value="__custom__">✏️ Type Name...</option>';
            // Auto-select the logged-in user
            const myBiz = localStorage.getItem('pos_business') || '';
            if (myBiz) {
                for (let opt of sel.options) {
                    if (opt.value === myBiz) { sel.value = myBiz; break; }
                }
            }
            // Handle custom cashier name toggle
            sel.addEventListener('change', function() {
                const customInput = document.getElementById('pos-cashier-custom');
                if (this.value === '__custom__') {
                    customInput.style.display = 'block';
                    customInput.focus();
                } else {
                    customInput.style.display = 'none';
                    customInput.value = '';
                }
            });
        }
    } catch(e) { console.error('Failed to load cashiers:', e); }
}

async function loadProducts() {
    try {
        const res = await api(`/products?lite=true&_t=${Date.now()}`);
        if (res) products = await res.json();
    } catch(e) {}
    renderPOSGrid('');
}

function renderPOSGrid(q) {
    const grid = document.getElementById('pos-products');
    const filtered = products.filter(p => !q || p.name.toLowerCase().includes(q));
    grid.innerHTML = filtered.map(p => `
        <div class="pos-item-card" onclick="${p.is_imei_tracked ? `showImeiSelectionModal('${p.id}', '${p.name.replace(/'/g,"\\'")}')` : `addToBill('${p.id}')`}">
            <h4>${p.name}</h4>
            <div class="price">Rs. ${p.price.toLocaleString()}</div>
            <div class="stock">${p.quantity} in stock</div>
            ${p.barcode ? `<div style="font-size:10px;color:var(--text-muted);margin-top:2px">#${p.barcode}</div>` : ''}
            ${p.is_imei_tracked ? `<span class="imei-badge"><i class='bx bx-chip'></i> Select IMEI</span>` : ''}
        </div>`).join('');
}

function addToBill(prod) {
    const existing = currentBill.find(b => b.name === prod.name && !b.is_imei_item);
    if (existing) { existing.quantity++; } 
    else { currentBill.push({ name: prod.name, price: prod.price, quantity: 1, is_imei_item: false }); }
    renderBill();
}

function addImeiToBill(item) {
    if (imeiInBill.find(i => i.imei_number === item.imei_number)) { toast('Already in bill', 'error'); return; }
    
    // Create a new bill item for this IMEI
    const billItem = { 
        name: item.product_name, 
        price: item.selling_price, 
        quantity: 1, 
        is_imei_item: true, 
        imei_number: item.imei_number, 
        imei_id: item.id,
        temp_id: 'imei-' + Date.now(), // For animation
        sim_type: item.sim_type || ''
    };
    
    currentBill.push(billItem);
    imeiInBill.push(item);
    hasImeiInBill = true;
    
    // Show customer box and highlight button
    document.getElementById('pos-customer-box').style.display = 'block';
    const custBtn = document.getElementById('btn-toggle-customer');
    custBtn.classList.add('btn-primary');
    custBtn.classList.remove('btn-outline');
    
    toast(`Added: ${item.imei_number}`, 'success');
    showLastScanned(`${item.product_name} (${item.imei_number})`);
    renderBill();
    
    // Add a flash effect to the newly added item
    setTimeout(() => {
        const itemEl = document.querySelector(`[data-imei="${item.imei_number}"]`);
        if (itemEl) {
            itemEl.classList.add('scan-flash');
            setTimeout(() => itemEl.classList.remove('scan-flash'), 800);
        }
    }, 100);
}

function showLastScanned(val) {
    const el = document.getElementById('last-scanned');
    const valEl = document.getElementById('last-scanned-val');
    if (el && valEl) {
        el.style.display = 'flex';
        valEl.textContent = val;
    }
}

let availableImeis = [];
async function showImeiSelectionModal(prodId, prodName) {
    const nameEl = document.getElementById('select-imei-prod-name');
    if (nameEl) nameEl.textContent = prodName;
    const listEl = document.getElementById('imei-selection-list');
    if (listEl) listEl.innerHTML = '<div style="padding:20px;text-align:center"><i class="bx bx-loader-alt bx-spin"></i> Loading...</div>';
    const searchEl = document.getElementById('imei-selection-search');
    if (searchEl) searchEl.value = '';
    openModal('modal-select-imei');
    
    try {
        const res = await api(`/imei?product_id=${prodId}&status=In Stock`);
        if (!res) return;
        availableImeis = await res.json();
        renderImeiSelectionList();
    } catch(e) {
        toast('Failed to load IMEIs', 'error');
    }
}

function renderImeiSelectionList(q = '') {
    const el = document.getElementById('imei-selection-list');
    if (!el) return;
    const filtered = availableImeis.filter(i => !q || i.imei_number.toLowerCase().includes(q.toLowerCase()));
    
    if (filtered.length === 0) {
        el.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-muted)">No IMEIs available</div>';
        return;
    }
    
    el.innerHTML = filtered.map(i => `
        <div class="imei-select-item" onclick="selectImeiFromModal('${i.imei_number}')" style="padding:12px 16px;border-bottom:1px solid var(--border);cursor:pointer;display:flex;justify-content:space-between;align-items:center;transition:var(--transition)">
            <strong>${i.imei_number}</strong>
            <i class='bx bx-chevron-right' style="color:var(--text-muted)"></i>
        </div>
    `).join('');
}

async function selectImeiFromModal(imei) {
    closeModal('modal-select-imei');
    await handlePosScan(imei);
}

// Search listener for IMEI selection
document.getElementById('imei-selection-search')?.addEventListener('input', e => {
    renderImeiSelectionList(e.target.value);
});

// SIM Activation logic
function showSimActivationModal(item) {
    document.getElementById('sim-act-prod-id').value = item.product_id;
    document.getElementById('sim-act-imei-num').value = item.imei_number;
    document.getElementById('sim-act-serial').textContent = item.imei_number;
    document.getElementById('sim-act-type').value = 'PREPAID';
    document.getElementById('sim-act-router').value = '';
    openModal('modal-sim-activation');
}

document.getElementById('btn-confirm-sim-act').onclick = function() {
    const imeiNum = document.getElementById('sim-act-imei-num').value;
    const simType = document.getElementById('sim-act-type').value;
    const routerModel = document.getElementById('sim-act-router').value;
    lookupAndAddSim(imeiNum, simType, routerModel);
};

async function lookupAndAddSim(imeiNum, simType, routerModel) {
    try {
        const res = await api(`/imei/lookup/${encodeURIComponent(imeiNum)}`);
        if (res && res.ok) {
            const item = await res.json();
            item.sim_type = simType;
            if (routerModel) item.product_name = routerModel; 
            addImeiToBill(item);
            closeModal('modal-sim-activation');
        }
    } catch(e) { toast('Error adding SIM', 'error'); }
}

function renderBill() {
    const el = document.getElementById('bill-items');
    el.innerHTML = currentBill.map((b, i) => `
        <div class="bill-item" ${b.is_imei_item ? `data-imei="${b.imei_number}"` : ''}>
            <div class="bill-item-info">
                <h4 style="display:flex;align-items:center;gap:6px">
                    ${b.is_imei_item ? '<i class="bx bx-chip" style="color:var(--info)"></i>' : ''}
                    ${b.name}
                </h4>
                <p>
                    <span class="price-edit" onclick="editBillPrice(${i})" title="Click to edit price" style="cursor:pointer;border-bottom:1px dashed var(--primary)">Rs. ${b.price.toLocaleString()}</span> 
                    ${b.is_imei_item ? `<span class="imei-tag" style="margin-left:8px;font-size:11px;padding:2px 8px;background:var(--info-light);color:var(--info);border-radius:4px;font-family:monospace;font-weight:700"># ${b.imei_number}</span>` : `x ${b.quantity}`}
                </p>
                ${b.sim_type ? `<div style="font-size:10px;color:var(--text-muted);margin-top:2px">Type: ${b.sim_type}</div>` : ''}
            </div>
            <div class="bill-item-actions">
                ${!b.is_imei_item ? `<div class="qty-ctrl">
                    <button class="qty-btn" onclick="changeBillQty(${i},-1)">-</button><span>${b.quantity}</span>
                    <button class="qty-btn" onclick="changeBillQty(${i},1)">+</button></div>` : ''}
                <span class="item-total">Rs. ${(b.price * b.quantity).toLocaleString()}</span>
                <button class="btn-ghost" onclick="removeBillItem(${i})"><i class='bx bx-x' style="font-size:18px;color:var(--danger)"></i></button>
            </div>
        </div>`).join('');
    updateBillTotals();
}

function editBillPrice(i) {
    const item = currentBill[i];
    const newPrice = prompt(`Edit price for "${item.name}":`, item.price);
    if (newPrice !== null && !isNaN(parseFloat(newPrice))) {
        currentBill[i].price = parseFloat(newPrice);
        renderBill();
        toast(`Price updated to Rs. ${parseFloat(newPrice).toLocaleString()}`);
    }
}

function changeBillQty(i, d) { currentBill[i].quantity = Math.max(1, currentBill[i].quantity + d); renderBill(); }
function removeBillItem(i) {
    const item = currentBill[i];
    if (item.is_imei_item) { imeiInBill = imeiInBill.filter(x => x.imei_number !== item.imei_number); }
    currentBill.splice(i, 1);
    hasImeiInBill = currentBill.some(b => b.is_imei_item);
    if (!hasImeiInBill) document.getElementById('pos-customer-box').style.display = 'none';
    renderBill();
}

function updateBillTotals() {
    const total = currentBill.reduce((s, b) => s + b.price * b.quantity, 0);
    const paid = parseFloat(document.getElementById('pos-paid').value) || 0;
    document.getElementById('pos-subtotal').textContent = total.toLocaleString(undefined, {minimumFractionDigits:2});
    document.getElementById('pos-total').textContent = total.toLocaleString(undefined, {minimumFractionDigits:2});
    document.getElementById('pos-balance').textContent = (paid - total).toLocaleString(undefined, {minimumFractionDigits:2});
}

async function submitBill() {
    if (!currentBill.length) return toast('Add items first', 'error');
    const cashierSel = document.getElementById('pos-cashier-select').value;
    const cashierCustom = document.getElementById('pos-cashier-custom').value.trim();
    const cashierName = cashierSel === '__custom__' ? cashierCustom : cashierSel;
    if (!cashierName) { toast('Please select or enter a cashier name', 'error'); return; }
    if (hasImeiInBill) {
        const cn = document.getElementById('pos-cust-name').value.trim();
        const cp = document.getElementById('pos-cust-phone').value.trim();
        const cnic = document.getElementById('pos-cust-nic').value.trim();
        const caddr = document.getElementById('pos-cust-address').value.trim();
        if (!cn || !cp || !cnic || !caddr) { toast('Customer details required for IMEI items', 'error'); return; }
    }
    const total = currentBill.reduce((s, b) => s + b.price * b.quantity, 0);
    const data = {
        items: currentBill.map(b => ({ 
            name: b.name, price: b.price, quantity: b.quantity, 
            is_imei_item: b.is_imei_item, imei_number: b.imei_number || '', imei_id: b.imei_id || '' 
        })),
        imei_items: imeiInBill.map(i => {
            const billItem = currentBill.find(b => b.imei_id === i.id);
            return { 
                imei_id: i.id, selling_price: i.selling_price, 
                sim_type: billItem ? billItem.sim_type : '',
                product_name_override: billItem ? billItem.name : ''
            };
        }),
        total_amount: total,
        amount_paid: parseFloat(document.getElementById('pos-paid').value) || 0,
        payment_method: document.getElementById('pos-payment').value,
        cashier_name: cashierName,
        customer_name: document.getElementById('pos-cust-name').value || 'Walk-in',
        customer_phone: document.getElementById('pos-cust-phone').value || '',
        customer_nic: document.getElementById('pos-cust-nic').value || '',
        customer_email: document.getElementById('pos-cust-email').value || '',
        customer_address: document.getElementById('pos-cust-address').value || ''
    };
    try {
        const res = await api('/invoices', { method: 'POST', body: JSON.stringify(data) });
        if (!res) return;
        const d = await res.json();
        if (!res.ok) throw new Error(d.error);
        toast('Bill created successfully!');
        await printReceipt(d.invoice);
        currentBill = []; imeiInBill = []; hasImeiInBill = false;
        document.getElementById('pos-customer-box').style.display = 'none';
        const custBtn = document.getElementById('btn-toggle-customer');
        custBtn.classList.remove('btn-primary');
        custBtn.classList.add('btn-outline');
        document.getElementById('pos-cust-select').value = '';
        document.getElementById('pos-paid').value = '';
        document.getElementById('pos-cust-name').value = '';
        document.getElementById('pos-cust-phone').value = '';
        document.getElementById('pos-cust-nic').value = '';
        document.getElementById('pos-cust-email').value = '';
        document.getElementById('pos-cust-address').value = '';
        renderBill(); loadPOS();
        loadCustomers();
        loadInventory();
    } catch(e) { toast(e.message, 'error'); }
}

async function printReceipt(inv) {
    const pa = document.getElementById('print-area');
    let invSettings = {
        header_title: 'SMARTZONE', header_subtitle: 'New Town Padaviya, Anuradhapura', header_contact: 'Mobile: 078-68000 86',
        tax_invoice_text: 'Tax Invoice', label_bill_no: 'Bill No:', label_cashier: 'Cashier:', label_customer: 'Customer:',
        label_tel: 'Tel:', label_item: 'Item', label_qty: 'Qty', label_amount: 'Amount', label_subtotal: 'Subtotal',
        label_total: 'TOTAL', label_amount_paid: 'Amount Paid', label_balance: 'Balance',
        footer_message1: 'Thank You! Come Again', footer_message2: 'Please keep this receipt for warranty claims.',
        footer_powered_by: 'Powered by SmartZone'
    };
    let activeTemplate = null;
    try {
        const res = await api('/auth/profile');
        if (res && res.ok) {
            const p = await res.json();
            if (p.invoice_settings) invSettings = { ...invSettings, ...p.invoice_settings };
            if (p.invoice_templates) activeTemplate = p.invoice_templates.find(t => t.is_active);
        }
    } catch(e) {}

    const paid = inv.amount_paid || 0;
    const balance = paid > 0 ? (paid - inv.total_amount) : 0;
    let itemsHtml = inv.items.map(i => `
        <div style="margin-bottom:6px;">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;">
                <span style="width:55%;word-break:break-word;">${i.product_name}</span>
                <span style="width:15%;text-align:center">${i.quantity}</span>
                <span style="width:30%;text-align:right">${i.subtotal.toFixed(2)}</span>
            </div>
            ${i.imei_number ? `<div style="font-size:10px;color:#333;margin-top:2px;font-family:monospace">IMEI: ${i.imei_number}</div>` : ''}
        </div>
    `).join('');

    let finalHtml = `
        <div style="width:100%;max-width:80mm;font-family:sans-serif;color:#000;">
            <div style="text-align:center;margin-bottom:12px;">
                <h1 style="margin:0;font-size:24px;font-weight:800;text-transform:uppercase;">${invSettings.header_title}</h1>
                <p style="margin:2px 0;font-size:11px;">${invSettings.header_subtitle}</p>
                <p style="margin:0;font-size:11px;">${invSettings.header_contact}</p>
                <div style="border-bottom:1.5px dashed #000;margin:8px 0;"></div>
                <h2 style="margin:0;font-size:14px;font-weight:700;">${invSettings.tax_invoice_text}</h2>
            </div>
            <div style="font-size:11px;margin-bottom:10px;">
                <div style="display:flex;justify-content:space-between;"><span>${invSettings.label_bill_no} ${inv.invoice_number}</span><span>${inv.date}</span></div>
                <div>${invSettings.label_cashier} ${inv.cashier_name}</div>
                ${inv.customer_name!=='Walk-in'?`<div>${invSettings.label_customer} ${inv.customer_name}</div>`:''}
            </div>
            <div style="border-bottom:1.5px dashed #000;margin-bottom:8px;"></div>
            <div style="display:flex;justify-content:space-between;font-weight:700;font-size:11px;margin-bottom:8px;">
                <span style="width:55%">${invSettings.label_item}</span><span style="width:15%;text-align:center">${invSettings.label_qty}</span><span style="width:30%;text-align:right">${invSettings.label_amount}</span>
            </div>
            <div style="border-bottom:1.5px dashed #000;margin-bottom:8px;"></div>
            <div style="font-size:11px;">${itemsHtml}</div>
            <div style="border-bottom:1.5px dashed #000;margin:8px 0;"></div>
            <div style="font-size:12px;">
                <div style="display:flex;justify-content:space-between;"><span>${invSettings.label_total}</span><strong>${inv.total_amount.toFixed(2)}</strong></div>
                <div style="display:flex;justify-content:space-between;"><span>${invSettings.label_amount_paid}</span><span>${paid.toFixed(2)}</span></div>
                <div style="display:flex;justify-content:space-between;font-weight:700;"><span>${invSettings.label_balance}</span><span>${balance.toFixed(2)}</span></div>
            </div>
            <div style="text-align:center;font-size:10px;margin-top:20px;">
                <p style="font-weight:700;">${invSettings.footer_message1}</p>
                <p>${invSettings.footer_message2}</p>
                <p style="margin-top:10px;font-family:monospace;color:#555;">${invSettings.footer_powered_by}</p>
            </div>
        </div>
    `;
    pa.innerHTML = finalHtml;
    pa.style.display = 'block';
    setTimeout(() => { window.print(); pa.style.display = 'none'; document.getElementById('pos-scan')?.focus(); }, 300);
}

// === WARRANTY ===
function setupWarranty() {
    document.getElementById('btn-warranty-lookup').onclick = async () => {
        const imei = document.getElementById('warranty-scan').value.trim();
        if (!imei) return toast('Enter IMEI number', 'error');
        try {
            const res = await api(`/imei/lookup/${encodeURIComponent(imei)}`);
            if (!res || !res.ok) { toast('IMEI not found', 'error'); return; }
            const item = await res.json();
            const isValid = item.warranty_expiry_date && new Date(item.warranty_expiry_date) > new Date();
            const el = document.getElementById('warranty-result');
            el.style.display = 'block';
            el.innerHTML = `<div class="table-card" style="padding:28px">
                <h3>${item.product_name}</h3>${isValid?'<span class="badge badge-green">ACTIVE</span>':'<span class="badge badge-red">EXPIRED</span>'}
                <p>IMEI: ${item.imei_number}</p>
                <p>Customer: ${item.customer_name||'-'}</p>
                <p>Expiry: ${item.warranty_expiry_date?formatDate(item.warranty_expiry_date):'-'}</p>
                ${item.status==='Sold'?`<button class="btn btn-warning" onclick="openStatusModal('${item.id}')">Process Warranty</button>`:''}
            </div>`;
        } catch(e) { toast(e.message, 'error'); }
    };
}

// === CUSTOMERS ===
function setupCustomerModal() {
    document.getElementById('btn-add-customer').onclick = () => { document.getElementById('customer-form').reset(); document.getElementById('cust-id').value = ''; openModal('modal-customer'); };
    document.getElementById('btn-save-customer').onclick = async () => {
        const data = { name: document.getElementById('cust-name').value, phone: document.getElementById('cust-phone').value, nic_number: document.getElementById('cust-nic').value, address: document.getElementById('cust-addr').value };
        await api('/customers', { method:'POST', body:JSON.stringify(data) }); toast('Customer added'); closeModal('modal-customer'); loadCustomers();
    };
}
async function loadCustomers() {
    const res = await api('/customers'); if (res) { customers = await res.json(); const sel = document.getElementById('pos-cust-select'); if (sel) sel.innerHTML = '<option value="">+ New Customer</option>' + customers.map(c => `<option value="${c.id}">${c.name} - ${c.phone}</option>`).join(''); }
}

// === INVOICES ===
function setupInvoiceFilters() {
    document.getElementById('inv-filter-date').onchange = loadInvoices;
    document.getElementById('inv-filter-month').onchange = loadInvoices;
}
async function loadInvoices() {
    let url = '/invoices?';
    const d = document.getElementById('inv-filter-date').value; if (d) url += `date=${d}`;
    const res = await api(url); if (res) { const invs = await res.json(); document.querySelector('#invoices-table tbody').innerHTML = invs.map(i => `<tr><td>${i.invoice_number}</td><td>${i.date}</td><td>${i.customer_name}</td><td>Rs. ${i.total_amount.toLocaleString()}</td><td><button class="btn btn-sm btn-outline" onclick="viewInvoice('${i.id}')">View</button></td></tr>`).join(''); }
}
async function viewInvoice(id) {
    const res = await api(`/invoices/${id}`); if (res) { const inv = await res.json(); document.getElementById('invoice-detail-body').innerHTML = `Bill: ${inv.invoice_number}<br>Total: ${inv.total_amount}`; openModal('modal-invoice'); }
}

// === SLT REPORTS ===
function setupSLT() {
    const now = new Date(); document.getElementById('slt-month').value = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
    document.getElementById('btn-slt-generate').onclick = loadSLTReport;
    document.getElementById('btn-slt-export').onclick = exportSLT;
    document.getElementById('slt-select-all')?.addEventListener('change', function() { document.querySelectorAll('.slt-row-cb').forEach(cb => cb.checked = this.checked); });
}
async function loadSLTReport() {
    const month = document.getElementById('slt-month').value;
    const res = await api(`/reports/slt?month=${month}`); if (res) {
        const items = await res.json();
        document.querySelector('#slt-table tbody').innerHTML = items.map((i,idx) => `<tr>
            <td><input type="checkbox" class="slt-row-cb" data-id="${i.id}"></td>
            <td>${idx+1}</td><td>${i.purchase_date?formatDate(i.purchase_date):'-'}</td>
            <td>${i.customer_name||'-'}</td><td>${i.customer_phone||'-'}</td><td>${i.customer_nic||'-'}</td>
            <td>${i.sim_type||'-'}</td><td>${i.product_name}</td><td><code>${i.imei_number || i.sim_serial || '-'}</code></td><td>${i.slt_number || '-'}</td>
        </tr>`).join('') || '<tr><td colspan="10" style="text-align:center">No records</td></tr>';
    }
}
async function exportSLT() {
    const month = document.getElementById('slt-month').value;
    const ids = Array.from(document.querySelectorAll('.slt-row-cb:checked')).map(cb => cb.dataset.id);
    let url = `${API}/reports/slt/export?month=${month}`; if (ids.length) url += `&ids=${ids.join(',')}`;
    const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
    const blob = await res.blob();
    const a = document.createElement('a'); a.href = window.URL.createObjectURL(blob); a.download = `SLT_Report_${month}.xlsx`; a.click();
}

// === REPORTS ===
function setupReportTabs() { document.querySelectorAll('[data-report]').forEach(btn => btn.onclick = () => loadReports(btn.dataset.report)); }
async function loadReports(type='sales') {
    const url = type === 'sales' ? '/reports/sales' : '/reports/product-sales';
    const res = await api(url); if (res) { const data = await res.json(); const tb = document.getElementById('reports-table').querySelector('tbody'); if (type==='sales') tb.innerHTML = data.map(r => `<tr><td>${r.date}</td><td>Rs. ${r.total_sales.toLocaleString()}</td><td>Rs. ${r.total_profit.toLocaleString()}</td></tr>`).join(''); }
}

// === ADMIN ===
async function loadAdmin() {
    const res = await api('/admin/users'); if (res) { const users = await res.json(); document.querySelector('#admin-table tbody').innerHTML = users.map(u => `<tr><td>${u.business_name}</td><td>${u.email}</td><td>${u.role}</td><td><button class="btn btn-sm btn-outline" onclick="editAdminUser('${u.id}')">Edit</button></td></tr>`).join(''); }
}
async function saveAdminEdit() { toast('Account updated'); closeModal('modal-admin-edit'); loadAdmin(); }
