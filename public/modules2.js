// === POS ===
let lastPosScanTime = 0;
const POS_SCAN_THROTTLE_MS = 3000;

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

            addImeiToBill(item);
            focusScanField();
            return;
        }
    } catch(ex) {}

    // 3. Try barcode
    const prod = products.find(p => p.barcode === val);
    if (prod && !prod.is_imei_tracked) {
        addToBill(prod);
        toast(`Added: ${prod.name}`);
    }
    else if (prod && prod.is_imei_tracked) { 
        showImeiSelector(prod.id, prod.name);
        lastPosScanTime = 0; 
    }
    else { 
        toast(`Not found: ${val}`, 'error'); 
        lastPosScanTime = 0; 
    }
    focusScanField();
}

let imeiSelectorList = [];
async function showImeiSelector(productId, productName) {
    document.getElementById('imei-selector-title').innerHTML = `<i class='bx bx-chip' style="color:var(--primary)"></i> ${productName}`;
    const listEl = document.getElementById('imei-selector-list');
    listEl.innerHTML = '<div style="text-align:center;padding:20px"><i class="bx bx-loader bx-spin" style="font-size:24px"></i><br>Loading items...</div>';
    
    const searchInput = document.getElementById('imei-selector-search');
    searchInput.value = '';
    
    openModal('modal-pos-imei-selector');
    setTimeout(() => searchInput.focus(), 300);

    try {
        const res = await api(`/imei?product_id=${productId}&status=In Stock`);
        if (!res) return;
        imeiSelectorList = await res.json();
        renderImeiSelectorList('');
        
        // Setup search
        searchInput.oninput = (e) => renderImeiSelectorList(e.target.value.toLowerCase());
        searchInput.onkeydown = (e) => {
            if (e.key === 'Enter') {
                const val = searchInput.value.trim();
                const found = imeiSelectorList.find(i => i.imei_number === val || i.sim_serial_number === val || i.slt_number === val);
                if (found) {
                    addImeiToBill(found);
                    closeModal('modal-pos-imei-selector');
                } else {
                    toast('Not found in stock for this product', 'error');
                }
            }
        };
    } catch(e) { console.error(e); listEl.innerHTML = 'Error loading items'; }
}

function renderImeiSelectorList(q) {
    const listEl = document.getElementById('imei-selector-list');
    const filtered = imeiSelectorList.filter(i => 
        !q || 
        i.imei_number.toLowerCase().includes(q) || 
        (i.sim_serial_number && i.sim_serial_number.toLowerCase().includes(q)) ||
        (i.slt_number && i.slt_number.toLowerCase().includes(q))
    );

    if (!filtered.length) {
        listEl.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-muted)">No matching items in stock</div>';
        return;
    }

    listEl.innerHTML = filtered.map(i => `
        <div class="imei-select-item" onclick="selectImeiFromList('${i.id}')" style="padding:12px; border:1px solid var(--border); border-radius:8px; cursor:pointer; transition: all 0.2s;">
            <div style="font-family:monospace; font-weight:700; color:var(--primary)">${i.imei_number}</div>
            ${(i.product_category && i.product_category.toLowerCase().includes('sim')) ? `
                <div style="font-size:12px; display:flex; gap:10px; margin-top:4px">
                    <span><i class='bx bx-hash'></i> SLT: ${i.slt_number || '-'}</span>
                    <span><i class='bx bx-barcode'></i> SIM: ${i.sim_serial_number || '-'}</span>
                </div>` : ''}
        </div>
    `).join('');
}

function selectImeiFromList(id) {
    const item = imeiSelectorList.find(i => i.id === id);
    if (item) {
        addImeiToBill(item);
        closeModal('modal-pos-imei-selector');
    }
}

function setupPOS() {
    document.getElementById('pos-scan').addEventListener('keydown', async e => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        const val = e.target.value.trim();
        e.target.value = '';
        await handlePosScan(val);
    });
    document.getElementById('pos-search').addEventListener('input', e => {
        const q = e.target.value.toLowerCase();
        renderPOSGrid(q);
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

async function loadPOS() {
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
        <div class="pos-item-card" onclick="${p.is_imei_tracked ? `showImeiSelector('${p.id}', '${p.name.replace(/'/g,"\\'")}')` : `addToBill({id:'${p.id}',name:'${p.name.replace(/'/g,"\\'")}',price:${p.price},quantity:${p.quantity},is_imei_tracked:false,category:'${(p.category||"").replace(/'/g,"\\'")}'})`}">
            <h4>${p.name}</h4>
            <div class="price">Rs. ${p.price.toLocaleString()}</div>
            <div class="stock">Stock: ${p.quantity}</div>
            ${p.is_imei_tracked ? '<div class="imei-badge">IMEI Tracked</div>' : ''}
        </div>`).join('');
}

function addToBill(prod) {
    const existing = currentBill.find(b => b.name === prod.name && !b.is_imei_item);
    if (existing) { existing.quantity++; } 
    else { 
        let price = prod.price;
        const isSim = prod.category && prod.category.toLowerCase().includes('sim');
        if (isSim) {
            const p = prompt(`Enter price for SIM (${prod.name}):`, price);
            if (p !== null && !isNaN(parseFloat(p))) {
                price = parseFloat(p);
            }
        }
        currentBill.push({ name: prod.name, price: price, quantity: 1, is_imei_item: false, category: prod.category }); 
    }
    renderBill();
}

function addImeiToBill(item) {
    if (imeiInBill.find(i => i.imei_number === item.imei_number)) { toast('Already in bill', 'error'); return; }
    
    let price = item.selling_price;
    const isSim = item.product_category && item.product_category.toLowerCase().includes('sim');
    
    if (isSim) {
        const p = prompt(`Enter price for SIM (${item.imei_number}):`, price);
        if (p !== null && !isNaN(parseFloat(p))) {
            price = parseFloat(p);
        }
    }

    currentBill.push({ 
        name: item.product_name, 
        price: price, 
        quantity: 1, 
        is_imei_item: true, 
        imei_number: item.imei_number, 
        imei_id: item.id,
        category: item.product_category,
        sim_type: item.sim_type || 'SLT',
        sim_payment_type: item.sim_payment_type || 'POSTPAID',
        router_model: item.router_model || item.product_name,
        slt_number: item.slt_number || ''
    });
    imeiInBill.push(item);
    hasImeiInBill = true;
    // Show customer box and highlight button
    document.getElementById('pos-customer-box').style.display = 'block';
    const custBtn = document.getElementById('btn-toggle-customer');
    custBtn.classList.add('btn-primary');
    custBtn.classList.remove('btn-outline');
    toast(`Added: ${item.imei_number}`);
    renderBill();
}

function renderBill() {
    const el = document.getElementById('bill-items');
    el.innerHTML = currentBill.map((b, i) => {
        const isSim = b.category && b.category.toLowerCase().includes('sim');
        return `
        <div class="bill-item" style="${isSim ? 'border-left: 4px solid var(--primary); background: rgba(59, 130, 246, 0.05);' : ''}">
            <div class="bill-item-info">
                <h4>${b.name}</h4>
                <p>
                    ${isSim ? 
                        `<span style="font-size:11px;font-weight:600;color:var(--primary);margin-right:4px">Price:</span><input type="number" step="0.01" class="form-control form-control-sm" style="width:100px; display:inline-block; font-weight:800; border:1px solid var(--primary); padding:2px 6px; height:28px" value="${b.price}" oninput="updateBillPrice(${i}, this.value)">` 
                        : `<span class="price-edit" onclick="editBillPrice(${i})" title="Click to edit price" style="cursor:pointer;border-bottom:1px dashed var(--primary)">Rs. ${b.price.toLocaleString()}</span>`
                    }
                    ${b.is_imei_item ? `<span class="imei-tag">${b.imei_number}</span>` : `x ${b.quantity}`}
                </p>
                ${isSim ? `
                <div class="sim-bill-fields" style="margin-top:10px; display:grid; grid-template-columns: 1fr 1fr; gap:8px;">
                    <div class="form-group" style="margin-bottom:0">
                        <label style="font-size:10px">SIM Type</label>
                        <select class="form-control form-control-sm" onchange="updateBillSimField(${i}, 'sim_type', this.value)">
                            <option value="SLT" ${b.sim_type==='SLT'?'selected':''}>SLT</option>
                            <option value="Mobitel" ${b.sim_type==='Mobitel'?'selected':''}>Mobitel</option>
                            <option value="Dialog" ${b.sim_type==='Dialog'?'selected':''}>Dialog</option>
                            <option value="Hutch" ${b.sim_type==='Hutch'?'selected':''}>Hutch</option>
                            <option value="Airtel" ${b.sim_type==='Airtel'?'selected':''}>Airtel</option>
                        </select>
                    </div>
                    <div class="form-group" style="margin-bottom:0">
                        <label style="font-size:10px">Payment</label>
                        <select class="form-control form-control-sm" onchange="updateBillSimField(${i}, 'sim_payment_type', this.value)">
                            <option value="POSTPAID" ${b.sim_payment_type==='POSTPAID'?'selected':''}>POSTPAID</option>
                            <option value="PREPAID" ${b.sim_payment_type==='PREPAID'?'selected':''}>PREPAID</option>
                        </select>
                    </div>
                    <div class="form-group" style="margin-bottom:0; grid-column: span 2">
                        <label style="font-size:10px">Router Model</label>
                        <input type="text" class="form-control form-control-sm" value="${b.router_model}" placeholder="Router Model" oninput="updateBillSimField(${i}, 'router_model', this.value)">
                    </div>
                </div>` : ''}
            </div>
            <div class="bill-item-actions">
                ${!b.is_imei_item ? `<div class="qty-ctrl">
                    <button class="qty-btn" onclick="changeBillQty(${i},-1)">-</button><span>${b.quantity}</span>
                    <button class="qty-btn" onclick="changeBillQty(${i},1)">+</button></div>` : ''}
                <span class="item-total">Rs. ${(b.price * b.quantity).toLocaleString()}</span>
                <button class="btn-ghost" onclick="removeBillItem(${i})"><i class='bx bx-x' style="font-size:18px;color:var(--danger)"></i></button>
            </div>
        </div>`;
    }).join('');
    updateBillTotals();
}

function updateBillSimField(i, field, val) {
    currentBill[i][field] = val;
}

function updateBillPrice(i, val) {
    const p = parseFloat(val);
    if (!isNaN(p)) {
        currentBill[i].price = p;
        updateBillTotals();
    }
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
    // Validate cashier selection
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
            is_imei_item: b.is_imei_item, imei_number: b.imei_number || '', imei_id: b.imei_id || '',
            sim_serial_number: (b.category && b.category.toLowerCase().includes('sim')) ? b.imei_number : '',
            slt_number: b.slt_number || '',
            sim_type: b.sim_type || '',
            sim_payment_type: b.sim_payment_type || '',
            router_model: b.router_model || ''
        })),
        imei_items: imeiInBill.map(i => ({ imei_id: i.id, selling_price: i.selling_price })),
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
        loadCustomers(); // Reload customers to show any newly added one
        loadInventory(); // Update stock in the inventory UI
    } catch(e) { toast(e.message, 'error'); }
}

async function printReceipt(inv) {
    const pa = document.getElementById('print-area');
    
    // Fetch custom invoice settings
    let invSettings = {
        header_title: 'SMARTZONE',
        header_subtitle: 'New Town Padaviya, Anuradhapura',
        header_contact: 'Mobile: 078-68000 86',
        tax_invoice_text: 'Tax Invoice',
        label_bill_no: 'Bill No:',
        label_cashier: 'Cashier:',
        label_customer: 'Customer:',
        label_tel: 'Tel:',
        label_item: 'Item',
        label_qty: 'Qty',
        label_amount: 'Amount',
        label_subtotal: 'Subtotal',
        label_total: 'TOTAL',
        label_amount_paid: 'Amount Paid',
        label_balance: 'Balance',
        footer_message1: 'Thank You! Come Again',
        footer_message2: 'Please keep this receipt for warranty claims.<br>Items with IMEI are subject to warranty conditions.',
        footer_powered_by: 'Powered by SmartZone'
    };
    let activeTemplate = null;
    try {
        const res = await api('/auth/profile');
        if (res && res.ok) {
            const p = await res.json();
            if (p.invoice_settings) invSettings = { ...invSettings, ...p.invoice_settings };
            if (p.invoice_templates) {
                activeTemplate = p.invoice_templates.find(t => t.is_active);
            }
        }
    } catch(e) { console.warn('Could not load profile settings', e); }

    const paid = inv.amount_paid || 0;
    const balance = paid > 0 ? (paid - inv.total_amount) : 0;

    let itemsHtml = inv.items.map(i => `
        <div style="margin-bottom:6px;">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;">
                <span style="width:55%;word-break:break-word;padding-right:4px">${i.product_name}</span>
                <span style="width:15%;text-align:center">${i.quantity}</span>
                <span style="width:30%;text-align:right">${i.subtotal.toFixed(2)}</span>
            </div>
            ${i.imei_number ? `<div style="font-size:10px;color:#333;margin-top:2px;font-family:monospace">IMEI: ${i.imei_number}</div>` : ''}
        </div>
    `).join('');

    let finalHtml = '';
    
    if (activeTemplate) {
        const order = activeTemplate.order || ['header', 'invoice_info', 'people_info', 'items', 'totals', 'footer'];
        const vis = activeTemplate.visibility || {};
        const labels = activeTemplate.labels || {};
        
        order.forEach(blockId => {
            if (vis[blockId] === false) return;
            
            if (blockId === 'header') {
                finalHtml += `
                    <div style="text-align:center;margin-bottom:12px;">
                        <h1 style="margin:0;font-size:24px;font-weight:800;text-transform:uppercase;">${labels.header_title || ''}</h1>
                        <p style="margin:2px 0;font-size:11px;font-weight:500;">${labels.header_subtitle || ''}</p>
                        <p style="margin:0;font-size:11px;font-weight:500;">${labels.header_contact || ''}</p>
                        <div style="border-bottom:1.5px dashed #000;margin:8px 0;"></div>
                        <h2 style="margin:0;font-size:14px;font-weight:700;text-transform:uppercase;">${labels.tax_text || ''}</h2>
                    </div>
                `;
            } else if (blockId === 'invoice_info') {
                finalHtml += `
                    <div style="font-size:11px;font-weight:500;display:flex;justify-content:space-between;margin-bottom:4px;">
                        <span>${labels.label_bill || ''} ${inv.invoice_number}</span>
                        <span>${labels.label_date || ''} ${inv.date}</span>
                    </div>
                `;
            } else if (blockId === 'people_info') {
                finalHtml += `<div style="font-size:11px;font-weight:500;margin-bottom:8px;">`;
                if (inv.cashier_name && inv.cashier_name !== 'System') {
                    finalHtml += `<div style="margin-bottom:4px;">${labels.label_cashier || ''} <strong>${inv.cashier_name}</strong></div>`;
                }
                if (inv.customer_name && inv.customer_name !== 'Walk-in') {
                    finalHtml += `<div style="margin-top:6px;"><div style="font-weight:700;">${labels.label_customer || ''} ${inv.customer_name}</div>`;
                    if (inv.customer_phone) finalHtml += `<div>${labels.label_tel || ''} ${inv.customer_phone}</div>`;
                    finalHtml += `</div>`;
                }
                finalHtml += `</div>`;
            } else if (blockId === 'items') {
                finalHtml += `
                    <div style="border-bottom:1.5px dashed #000;margin-bottom:8px;"></div>
                    <div style="display:flex;justify-content:space-between;font-weight:700;font-size:11px;margin-bottom:8px;">
                        <span style="width:55%;text-align:left">${labels.label_item || ''}</span>
                        <span style="width:15%;text-align:center">${labels.label_qty || ''}</span>
                        <span style="width:30%;text-align:right">${labels.label_amount || ''}</span>
                    </div>
                    <div style="border-bottom:1.5px dashed #000;margin-bottom:8px;"></div>
                    <div style="font-size:11px;margin-bottom:10px;">${itemsHtml}</div>
                    <div style="border-bottom:1.5px dashed #000;margin-bottom:8px;"></div>
                `;
            } else if (blockId === 'totals') {
                finalHtml += `
                    <div style="font-size:12px;margin-bottom:10px;">
                        <div style="display:flex;justify-content:space-between;margin-bottom:4px;"><span>${labels.label_subtotal || ''}</span><span>${inv.total_amount.toFixed(2)}</span></div>
                        <div style="border-bottom:1.5px dashed #000;margin:6px 0;"></div>
                        <div style="display:flex;justify-content:space-between;font-weight:800;font-size:16px;margin:6px 0;"><span>${labels.label_total || ''}</span><span>${inv.total_amount.toFixed(2)}</span></div>
                        <div style="border-bottom:1.5px dashed #000;margin:6px 0;"></div>
                        <div style="display:flex;justify-content:space-between;margin-top:8px;margin-bottom:4px;"><span>${labels.label_paid || ''}</span><span>${paid.toFixed(2)}</span></div>
                        <div style="display:flex;justify-content:space-between;font-weight:700;font-size:14px;"><span>${labels.label_balance || ''}</span><span>${balance.toFixed(2)}</span></div>
                    </div>
                    <div style="border-bottom:1.5px dashed #000;margin:10px 0;"></div>
                `;
            } else if (blockId === 'footer') {
                finalHtml += `
                    <div style="text-align:center;font-size:10px;margin-top:12px;">
                        <p style="font-weight:700;font-size:14px;margin:0 0 4px 0;">${labels.footer_msg1 || ''}</p>
                        <p style="margin:0 0 8px 0;line-height:1.3;">${labels.footer_msg2 || ''}</p>
                    </div>
                `;
            }
        });
            
        finalHtml += `<div style="text-align:center;font-size:10px;margin-top:12px;border-top:1.5px dashed #000;padding-top:10px"><p style="margin:0;font-size:12px;font-family:monospace;color:#555;">Powered by SmartZone</p></div>`;
        pa.innerHTML = `<div style="width:100%;max-width:80mm;font-family:sans-serif;color:#000;">${finalHtml}</div>`;
    } else {
        pa.innerHTML = `
            <div style="width:100%;max-width:80mm;">
                <div style="text-align:center;margin-bottom:12px;">
                    <h1 style="margin:0;font-size:24px;font-weight:800;text-transform:uppercase;letter-spacing:1px;">${invSettings.header_title}</h1>
                    <p style="margin:2px 0;font-size:11px;font-weight:500;">${invSettings.header_subtitle}</p>
                    <p style="margin:0;font-size:11px;font-weight:500;">${invSettings.header_contact}</p>
                    <div style="border-bottom:1.5px dashed #000;margin:8px 0;"></div>
                    <h2 style="margin:0;font-size:14px;font-weight:700;text-transform:uppercase;">${invSettings.tax_invoice_text}</h2>
                </div>
                
                <div style="font-size:11px;font-weight:500;margin-bottom:10px;">
                    <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
                        <span>${invSettings.label_bill_no} ${inv.invoice_number}</span>
                        <span>${inv.date}</span>
                    </div>
                    ${inv.cashier_name && inv.cashier_name !== 'System' ? `
                    <div style="margin-bottom:4px;">${invSettings.label_cashier} <strong>${inv.cashier_name}</strong></div>` : ''}
                    ${inv.customer_name && inv.customer_name !== 'Walk-in' ? `
                    <div style="margin-top:6px;">
                        <div style="font-weight:700;">${invSettings.label_customer} ${inv.customer_name}</div>
                        ${inv.customer_phone ? `<div>${invSettings.label_tel} ${inv.customer_phone}</div>` : ''}
                    </div>` : ''}
                </div>
                
                <div style="border-bottom:1.5px dashed #000;margin-bottom:8px;"></div>
                
                <div style="display:flex;justify-content:space-between;font-weight:700;font-size:11px;margin-bottom:8px;">
                    <span style="width:55%;text-align:left">${invSettings.label_item}</span>
                    <span style="width:15%;text-align:center">${invSettings.label_qty}</span>
                    <span style="width:30%;text-align:right">${invSettings.label_amount}</span>
                </div>
                
                <div style="border-bottom:1.5px dashed #000;margin-bottom:8px;"></div>
                
                <div style="font-size:11px;margin-bottom:10px;">
                    ${itemsHtml}
                </div>
                
                <div style="border-bottom:1.5px dashed #000;margin-bottom:8px;"></div>
                
                <div style="font-size:12px;margin-bottom:10px;">
                    <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
                        <span>${invSettings.label_subtotal}</span>
                        <span>${inv.total_amount.toFixed(2)}</span>
                    </div>
                    <div style="border-bottom:1.5px dashed #000;margin:6px 0;"></div>
                    <div style="display:flex;justify-content:space-between;font-weight:800;font-size:16px;margin:6px 0;">
                        <span>${invSettings.label_total}</span>
                        <span>${inv.total_amount.toFixed(2)}</span>
                    </div>
                    <div style="border-bottom:1.5px dashed #000;margin:6px 0;"></div>
                    <div style="display:flex;justify-content:space-between;margin-top:8px;margin-bottom:4px;">
                        <span>${invSettings.label_amount_paid}</span>
                        <span>${paid.toFixed(2)}</span>
                    </div>
                    <div style="display:flex;justify-content:space-between;font-weight:700;font-size:14px;">
                        <span>${invSettings.label_balance}</span>
                        <span>${balance.toFixed(2)}</span>
                    </div>
                </div>
                
                <div style="border-bottom:1.5px dashed #000;margin:10px 0;"></div>
                
                <div style="text-align:center;font-size:10px;margin-top:12px;">
                    <p style="font-weight:700;font-size:14px;margin:0 0 4px 0;">${invSettings.footer_message1}</p>
                    <p style="margin:0 0 8px 0;line-height:1.3;">${invSettings.footer_message2}</p>
                    <p style="margin:0;font-size:12px;font-family:monospace;color:#555;">Powered by SmartZone</p>
                </div>
            </div>
        `;
    }

    pa.style.display = 'block';
    
    // window.print blocks the thread. Once the print dialog closes, we hide the area and refocus scanner.
    setTimeout(() => { 
        window.print(); 
        pa.style.display = 'none'; 
        const scanInput = document.getElementById('pos-scan');
        if (scanInput) scanInput.focus();
    }, 300);
}

// === WARRANTY ===
function setupWarranty() {
    document.getElementById('btn-warranty-lookup').onclick = async () => {
        const imei = document.getElementById('warranty-scan').value.trim();
        if (!imei) return toast('Enter IMEI number', 'error');
        try {
            const res = await api(`/imei/lookup/${encodeURIComponent(imei)}`);
            if (!res || !res.ok) { toast('IMEI not found', 'error'); document.getElementById('warranty-result').style.display='none'; return; }
            const item = await res.json();
            const isValid = item.warranty_expiry_date && new Date(item.warranty_expiry_date) > new Date();
            const el = document.getElementById('warranty-result');
            el.style.display = 'block';
            el.innerHTML = `<div class="table-card" style="padding:28px;max-width:800px;margin:0 auto">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
                    <h3>${item.product_name}</h3>${isValid?'<span class="badge badge-green" style="font-size:14px;padding:6px 14px">WARRANTY ACTIVE</span>':'<span class="badge badge-red" style="font-size:14px;padding:6px 14px">WARRANTY EXPIRED</span>'}
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px">
                    <div><label style="font-size:12px;color:var(--text-muted)">IMEI</label><p style="font-weight:700;font-family:monospace">${item.imei_number}</p></div>
                    <div><label style="font-size:12px;color:var(--text-muted)">Status</label><p>${statusBadge(item.status)}</p></div>
                    <div><label style="font-size:12px;color:var(--text-muted)">Customer</label><p>${item.customer_name||'-'}</p></div>
                    <div><label style="font-size:12px;color:var(--text-muted)">Phone</label><p>${item.customer_phone||'-'}</p></div>
                    <div><label style="font-size:12px;color:var(--text-muted)">NIC</label><p>${item.customer_nic||'-'}</p></div>
                    <div><label style="font-size:12px;color:var(--text-muted)">Purchase Date</label><p>${item.sold_date?formatDate(item.sold_date):'-'}</p></div>
                    <div><label style="font-size:12px;color:var(--text-muted)">Warranty Period</label><p>${item.warranty_months} months</p></div>
                    <div><label style="font-size:12px;color:var(--text-muted)">Expiry</label><p>${item.warranty_expiry_date?formatDate(item.warranty_expiry_date):'-'}</p></div>
                </div>
                ${item.status==='Sold'?`<button class="btn btn-warning" onclick="openStatusModal('${item.id}')"><i class='bx bx-refresh'></i> Process Return / Warranty Claim</button>`:''}
                <h4 style="margin:20px 0 12px"><i class='bx bx-history'></i> History</h4>
                <div class="timeline">${(item.status_history||[]).map(h=>`<div class="timeline-item"><div class="timeline-date">${new Date(h.date).toLocaleString()}</div><div class="timeline-status">${h.status}</div><div class="timeline-note">${h.notes||''}</div></div>`).join('')}</div>
            </div>`;
        } catch(e) { toast(e.message, 'error'); }
    };
    document.getElementById('warranty-scan').addEventListener('keydown', e => { if(e.key==='Enter') document.getElementById('btn-warranty-lookup').click(); });
}

// === CUSTOMERS ===
function setupCustomerModal() {
    document.getElementById('btn-add-customer').onclick = () => {
        document.getElementById('customer-form').reset();
        document.getElementById('cust-id').value = '';
        document.getElementById('cust-modal-title').textContent = 'Add Customer';
        openModal('modal-customer');
    };
    document.getElementById('btn-save-customer').onclick = async () => {
        const id = document.getElementById('cust-id').value;
        const data = { name: document.getElementById('cust-name').value, phone: document.getElementById('cust-phone').value,
            nic_number: document.getElementById('cust-nic').value, email: document.getElementById('cust-email').value,
            address: document.getElementById('cust-addr').value };
        if (!data.name || !data.phone) return toast('Name and phone required', 'error');
        try {
            const res = await api(id?`/customers/${id}`:'/customers', { method:id?'PUT':'POST', body:JSON.stringify(data) });
            if (!res) return; const d = await res.json();
            if (!res.ok) throw new Error(d.error);
            toast(id?'Customer updated':'Customer added');
            closeModal('modal-customer'); loadCustomers();
        } catch(e) { toast(e.message,'error'); }
    };
    document.getElementById('cust-search').addEventListener('input', debounce(loadCustomers, 400));
}

async function loadCustomers() {
    try {
        const search = document.getElementById('cust-search')?.value || '';
        const res = await api(`/customers?search=${encodeURIComponent(search)}`);
        if (!res) return;
        customers = await res.json();
        
        const tb = document.querySelector('#cust-table tbody');
        if (tb) {
            tb.innerHTML = customers.map(c => `<tr>
                <td><strong>${c.name}</strong></td><td>${c.phone}</td><td>${c.nic_number||'-'}</td>
                <td>${c.email||'-'}</td><td>${c.address||'-'}</td>
                <td><button class="btn btn-sm btn-outline" onclick="editCustomer('${c.id}')"><i class='bx bx-edit'></i></button>
                    <button class="btn btn-sm btn-danger" onclick="deleteCustomer('${c.id}')"><i class='bx bx-trash'></i></button></td>
            </tr>`).join('');
        }
        
        const sel = document.getElementById('pos-cust-select');
        if (sel) {
            sel.innerHTML = '<option value="">+ New Customer (Type below)</option>' + 
                customers.map(c => `<option value="${c.id}">${c.name} - ${c.phone}</option>`).join('');
        }
    } catch(e) { console.error(e); }
}

function editCustomer(id) {
    const c = customers.find(x=>x.id===id); if(!c) return;
    document.getElementById('cust-id').value = c.id;
    document.getElementById('cust-name').value = c.name;
    document.getElementById('cust-phone').value = c.phone;
    document.getElementById('cust-nic').value = c.nic_number||'';
    document.getElementById('cust-email').value = c.email||'';
    document.getElementById('cust-addr').value = c.address||'';
    document.getElementById('cust-modal-title').textContent = 'Edit Customer';
    openModal('modal-customer');
}

async function deleteCustomer(id) {
    if(!confirm('Delete customer?')) return;
    try { const res = await api(`/customers/${id}`,{method:'DELETE'}); if(res&&res.ok){toast('Deleted');loadCustomers();} } catch(e){toast(e.message,'error');}
}

// === INVOICES ===
function setupInvoiceFilters() {
    document.getElementById('inv-filter-date').addEventListener('change', loadInvoices);
    document.getElementById('inv-filter-month').addEventListener('change', loadInvoices);
    document.getElementById('btn-clear-inv-filter').onclick = () => {
        document.getElementById('inv-filter-date').value = '';
        document.getElementById('inv-filter-month').value = '';
        loadInvoices();
    };
}

async function loadInvoices() {
    try {
        let url = '/invoices?';
        const d = document.getElementById('inv-filter-date').value;
        const m = document.getElementById('inv-filter-month').value;
        if (d) url += `date=${d}`; else if (m) url += `month=${m}`;
        const res = await api(url);
        if (!res) return;
        const invs = await res.json();
        const tb = document.querySelector('#invoices-table tbody');
        tb.innerHTML = invs.map(i => `<tr>
            <td><strong>${i.invoice_number}</strong></td><td>${i.date} ${i.time||''}</td>
            <td>${i.customer_name||'-'}</td><td>${i.cashier_name||'-'}</td><td>Rs. ${i.total_amount.toLocaleString()}</td>
            <td style="color:var(--success)">Rs. ${(i.total_profit||0).toLocaleString()}</td>
            <td><button class="btn btn-sm btn-outline" onclick="viewInvoice('${i.id}')"><i class='bx bx-show'></i></button>
                <button class="btn btn-sm btn-danger" onclick="deleteInvoice('${i.id}')"><i class='bx bx-trash'></i></button></td>
        </tr>`).join('');
    } catch(e) { console.error(e); }
}

let currentInvoiceData = null; // Store for reprinting

async function viewInvoice(id) {
    try {
        const res = await api(`/invoices/${id}`); if(!res) return;
        const inv = await res.json();
        currentInvoiceData = inv; // Store for reprint
        document.getElementById('invoice-detail-body').innerHTML = `
            <div style="display:flex;justify-content:space-between;margin-bottom:10px">
                <div><strong>Bill No:</strong> ${inv.invoice_number}<br><strong>Date:</strong> ${new Date(inv.date).toLocaleString()}</div>
                <div style="text-align:right"><strong>Cashier:</strong> ${inv.cashier_name}<br><strong>Customer:</strong> ${inv.customer_name}</div>
            </div>
            <table class="data-table"><thead><tr><th>Item</th><th>Qty</th><th>Price</th><th>Total</th></tr></thead><tbody>
                ${inv.items.map(i => `<tr><td>${i.product_name}${i.imei_number?`<br><small>IMEI: ${i.imei_number}</small>`:''}</td><td>${i.quantity}</td><td>${i.price.toFixed(2)}</td><td>${i.subtotal.toFixed(2)}</td></tr>`).join('')}
            </tbody></table>
            <div style="text-align:right;margin-top:10px;font-size:16px"><strong>Total: Rs. ${inv.total_amount.toFixed(2)}</strong></div>
            <div style="text-align:right;color:var(--text-muted)">Paid: Rs. ${(inv.amount_paid||0).toFixed(2)} | Method: ${inv.payment_method||'Cash'}</div>
        `;
        document.getElementById('btn-reprint-invoice').onclick = () => printReceipt(inv);
        openModal('modal-invoice');
    } catch(e) { console.error(e); }
}

async function deleteInvoice(id) {
    if(!confirm('Delete invoice? Stock will be restocked.')) return;
    try { const res = await api(`/invoices/${id}`,{method:'DELETE'}); if(res&&res.ok){toast('Invoice deleted');loadInvoices();} } catch(e){toast(e.message,'error');}
}

// === SLT REPORTS ===
function setupSLT() {
    const now = new Date();
    document.getElementById('slt-month').value = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
    document.getElementById('btn-slt-generate').onclick = loadSLTReport;
    document.getElementById('btn-slt-export').onclick = exportSLT;
}

async function loadSLTReport() {
    const month = document.getElementById('slt-month').value;
    if (!month) return toast('Select month','error');
    try {
        const res = await api(`/reports/slt?month=${month}`);
        if (!res) return;
        const items = await res.json();
        const tb = document.querySelector('#slt-table tbody');
        tb.innerHTML = items.map((i,idx) => `<tr>
            <td>${idx+1}</td>
            <td>${i.purchase_date ? formatDate(i.purchase_date) : '-'}</td>
            <td><strong>${i.customer_name||'-'}</strong></td>
            <td>${i.customer_phone||'-'}</td>
            <td>${i.customer_nic||'-'}</td>
            <td>${i.sim_type || '-'}</td>
            <td><code>${i.sim_serial_number || '-'}</code></td>
            <td>${i.slt_number || '-'}</td>
            <td>${i.router_model || '-'}</td>
            <td><code>${i.imei_number}</code></td>
        </tr>`).join('') || '<tr><td colspan="10" style="text-align:center;padding:40px;color:var(--text-muted)">No records for this month</td></tr>';
    } catch(e) { console.error(e); }
}

function exportSLT() {
    const month = document.getElementById('slt-month').value;
    if (!month) return toast('Select month','error');
    window.open(`${API}/reports/slt/export?month=${month}`, '_blank');
}

// === REPORTS ===
function setupReportTabs() {
    document.querySelectorAll('[data-report]').forEach(btn => {
        btn.onclick = () => {
            document.querySelectorAll('[data-report]').forEach(b => { b.classList.remove('btn-primary'); b.classList.add('btn-outline'); });
            btn.classList.add('btn-primary'); btn.classList.remove('btn-outline');
            loadReports(btn.dataset.report);
        };
    });
}

async function loadReports(type='sales') {
    try {
        const url = type === 'sales' ? '/reports/sales' : '/reports/product-sales';
        const res = await api(url); if (!res) return;
        const data = await res.json();
        const table = document.getElementById('reports-table');
        if (type === 'sales') {
            table.querySelector('thead').innerHTML = '<tr><th>Date</th><th>Sales</th><th>Profit</th></tr>';
            table.querySelector('tbody').innerHTML = data.map(r => `<tr><td>${r.date}</td><td>Rs. ${r.total_sales.toLocaleString()}</td><td style="color:var(--success)">Rs. ${r.total_profit.toLocaleString()}</td></tr>`).join('');
        } else {
            table.querySelector('thead').innerHTML = '<tr><th>Product</th><th>Qty Sold</th><th>Revenue</th><th>Profit</th></tr>';
            table.querySelector('tbody').innerHTML = data.map(r => `<tr><td>${r.product_name}</td><td>${r.quantity_sold}</td><td>Rs. ${r.revenue.toLocaleString()}</td><td style="color:var(--success)">Rs. ${(r.profit||0).toLocaleString()}</td></tr>`).join('');
        }
    } catch(e) { console.error(e); }
}

// === ADMIN ===
let adminUsers = [];

async function loadAdmin() {
    try {
        const res = await api('/admin/users'); if (!res) return;
        adminUsers = await res.json();
        document.querySelector('#admin-table tbody').innerHTML = adminUsers.map(u => `<tr>
            <td><strong>${u.business_name}</strong></td><td>${u.email}</td>
            <td>${u.whatsapp_number||'-'}</td>
            <td>${u.role}</td>
            <td>${u.is_active?'<span class="badge badge-green">Active</span>':'<span class="badge badge-red">Pending</span>'}</td>
            <td><button class="btn btn-sm btn-outline" onclick="editAdminUser('${u.id}')"><i class='bx bx-edit'></i></button>
                <button class="btn btn-sm ${u.is_active?'btn-warning':'btn-success'}" onclick="toggleUser('${u.id}',${!u.is_active})">${u.is_active?'Deactivate':'Activate'}</button>
                <button class="btn btn-sm btn-danger" onclick="deleteUser('${u.id}')"><i class='bx bx-trash'></i></button></td>
        </tr>`).join('');
    } catch(e) { console.error(e); }
}

function editAdminUser(id) {
    const u = adminUsers.find(x => x.id === id);
    if (!u) return;
    document.getElementById('admin-edit-id').value = u.id;
    document.getElementById('admin-edit-business').value = u.business_name;
    document.getElementById('admin-edit-email').value = u.email;
    document.getElementById('admin-edit-phone').value = u.whatsapp_number || '';
    document.getElementById('admin-edit-role').value = u.role;
    document.getElementById('admin-edit-password').value = '';
    document.getElementById('admin-edit-active').checked = u.is_active;
    openModal('modal-admin-edit');
}

async function saveAdminEdit() {
    const id = document.getElementById('admin-edit-id').value;
    const data = {
        business_name: document.getElementById('admin-edit-business').value,
        email: document.getElementById('admin-edit-email').value,
        whatsapp_number: document.getElementById('admin-edit-phone').value,
        role: document.getElementById('admin-edit-role').value,
        is_active: document.getElementById('admin-edit-active').checked
    };
    const pw = document.getElementById('admin-edit-password').value;
    if (pw.trim()) data.password = pw;
    if (!data.business_name || !data.email) return toast('Business name and email required', 'error');
    try {
        const res = await api(`/admin/users/${id}`, { method: 'PUT', body: JSON.stringify(data) });
        if (!res) return;
        const d = await res.json();
        if (!res.ok) throw new Error(d.error);
        toast('Account updated');
        closeModal('modal-admin-edit');
        loadAdmin();
    } catch(e) { toast(e.message, 'error'); }
}

async function toggleUser(id, activate) {
    try { await api(`/admin/users/${id}`,{method:'PUT',body:JSON.stringify({is_active:activate})}); toast('Updated'); loadAdmin(); } catch(e){toast(e.message,'error');}
}

async function deleteUser(id) {
    if(!confirm('Delete user and all data?')) return;
    try { const res = await api(`/admin/users/${id}`,{method:'DELETE'}); if(res&&res.ok){toast('Deleted');loadAdmin();} } catch(e){toast(e.message,'error');}
}
