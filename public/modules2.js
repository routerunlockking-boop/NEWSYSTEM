// === POS ===
// Shared scan handler — called from keyboard Enter AND camera scanner
async function handlePosScan(val) {
    if (!val) return;
    // Try IMEI lookup first
    try {
        const res = await api(`/imei/lookup/${encodeURIComponent(val)}`);
        if (res && res.ok) {
            const item = await res.json();
            if (item.status !== 'In Stock') { toast(`IMEI ${val} is ${item.status}`, 'error'); return; }
            addImeiToBill(item);
            focusScanField();
            return;
        }
    } catch(ex) {}
    // Try barcode
    const prod = products.find(p => p.barcode === val);
    if (prod && !prod.is_imei_tracked) { addToBill(prod); toast(`Added: ${prod.name}`); }
    else if (prod && prod.is_imei_tracked) { toast('IMEI product - scan individual IMEI number', 'error'); }
    else { toast(`Not found: ${val}`, 'error'); }
    focusScanField();
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

    // Load customers for the dropdown
    loadCustomers();
}

async function loadPOS() {
    if (!products.length) {
        const res = await api('/products?lite=true');
        if (res) products = await res.json();
    }
    renderPOSGrid('');
}

function renderPOSGrid(q) {
    const grid = document.getElementById('pos-products');
    const filtered = products.filter(p => !q || p.name.toLowerCase().includes(q));
    grid.innerHTML = filtered.map(p => `
        <div class="pos-item-card" onclick="${p.is_imei_tracked ? `toast('Scan IMEI for this product','error')` : `addToBill({id:'${p.id}',name:'${p.name.replace(/'/g,"\\'")}',price:${p.price},quantity:${p.quantity},is_imei_tracked:false})`}">
            <h4>${p.name}</h4>
            <div class="price">Rs. ${p.price.toLocaleString()}</div>
            <div class="stock">Stock: ${p.quantity}</div>
            ${p.is_imei_tracked ? '<div class="imei-badge">IMEI Tracked</div>' : ''}
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
    currentBill.push({ name: item.product_name, price: item.selling_price, quantity: 1, is_imei_item: true, imei_number: item.imei_number, imei_id: item.id });
    imeiInBill.push(item);
    hasImeiInBill = true;
    document.getElementById('pos-customer-box').style.display = 'block';
    toast(`IMEI added: ${item.imei_number}`);
    renderBill();
}

function renderBill() {
    const el = document.getElementById('bill-items');
    el.innerHTML = currentBill.map((b, i) => `
        <div class="bill-item">
            <div class="bill-item-info"><h4>${b.name}</h4>
                <p>Rs. ${b.price.toLocaleString()} ${b.is_imei_item ? `<span class="imei-tag">${b.imei_number}</span>` : `x ${b.quantity}`}</p></div>
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
    if (hasImeiInBill) {
        const cn = document.getElementById('pos-cust-name').value.trim();
        const cp = document.getElementById('pos-cust-phone').value.trim();
        const cnic = document.getElementById('pos-cust-nic').value.trim();
        const caddr = document.getElementById('pos-cust-address').value.trim();
        if (!cn || !cp || !cnic || !caddr) { toast('Customer details required for IMEI items', 'error'); return; }
    }
    const total = currentBill.reduce((s, b) => s + b.price * b.quantity, 0);
    const data = {
        items: currentBill.map(b => ({ name: b.name, price: b.price, quantity: b.quantity, is_imei_item: b.is_imei_item, imei_number: b.imei_number || '', imei_id: b.imei_id || '' })),
        imei_items: imeiInBill.map(i => ({ imei_id: i.id, selling_price: i.selling_price })),
        total_amount: total,
        amount_paid: parseFloat(document.getElementById('pos-paid').value) || 0,
        payment_method: document.getElementById('pos-payment').value,
        customer_name: document.getElementById('pos-cust-name').value || 'Walk-in',
        customer_phone: document.getElementById('pos-cust-phone').value || '',
        customer_nic: document.getElementById('pos-cust-nic').value || '',
        customer_address: document.getElementById('pos-cust-address').value || ''
    };
    try {
        const res = await api('/invoices', { method: 'POST', body: JSON.stringify(data) });
        if (!res) return;
        const d = await res.json();
        if (!res.ok) throw new Error(d.error);
        toast('Bill created successfully!');
        printReceipt(d.invoice);
        currentBill = []; imeiInBill = []; hasImeiInBill = false;
        document.getElementById('pos-customer-box').style.display = 'none';
        document.getElementById('pos-cust-select').value = '';
        document.getElementById('pos-paid').value = '';
        document.getElementById('pos-cust-name').value = '';
        document.getElementById('pos-cust-phone').value = '';
        document.getElementById('pos-cust-nic').value = '';
        document.getElementById('pos-cust-email').value = '';
        document.getElementById('pos-cust-address').value = '';
        renderBill(); loadPOS();
        loadCustomers(); // Reload customers to show any newly added one
    } catch(e) { toast(e.message, 'error'); }
}

function printReceipt(inv) {
    const pa = document.getElementById('print-area');
    pa.innerHTML = `<div style="font-family:monospace;width:80mm;padding:10px">
        <div style="text-align:center"><h2 style="margin:0">SMART ZONE</h2><p style="font-size:12px">info@smartzonelk.lk</p><hr></div>
        <p><strong>${inv.invoice_number}</strong><br>${inv.date} ${inv.time}</p>
        ${inv.customer_name?`<p>Customer: ${inv.customer_name}</p>`:''}
        <table style="width:100%;border-collapse:collapse;margin:10px 0">
            <tr style="border-bottom:1px solid #000"><th style="text-align:left">Item</th><th>Qty</th><th style="text-align:right">Total</th></tr>
            ${inv.items.map(i=>`<tr><td>${i.product_name}${i.imei_number?`<br><small>IMEI: ${i.imei_number}</small>`:''}</td><td style="text-align:center">${i.quantity}</td><td style="text-align:right">${i.subtotal.toLocaleString()}</td></tr>`).join('')}
        </table>
        <hr><div style="display:flex;justify-content:space-between;font-size:18px;font-weight:900"><span>TOTAL</span><span>Rs. ${inv.total_amount.toLocaleString()}</span></div>
        <div style="text-align:center;margin-top:15px;font-size:11px"><p>Thank you for your purchase!</p></div></div>`;
    pa.style.display = 'block';
    setTimeout(() => { window.print(); pa.style.display = 'none'; }, 300);
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
            <td>${i.customer_name||'-'}</td><td>Rs. ${i.total_amount.toLocaleString()}</td>
            <td style="color:var(--success)">Rs. ${(i.total_profit||0).toLocaleString()}</td>
            <td><button class="btn btn-sm btn-outline" onclick="viewInvoice('${i.id}')"><i class='bx bx-show'></i></button>
                <button class="btn btn-sm btn-danger" onclick="deleteInvoice('${i.id}')"><i class='bx bx-trash'></i></button></td>
        </tr>`).join('');
    } catch(e) { console.error(e); }
}

async function viewInvoice(id) {
    try {
        const res = await api(`/invoices/${id}`); if(!res) return;
        const inv = await res.json();
        document.getElementById('invoice-detail-body').innerHTML = `
            <div style="margin-bottom:16px"><strong>${inv.invoice_number}</strong> · ${inv.date}</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px;font-size:13px">
                <div>Customer: <strong>${inv.customer_name||'-'}</strong></div><div>Phone: ${inv.customer_phone||'-'}</div>
                <div>NIC: ${inv.customer_nic||'-'}</div><div>Payment: ${inv.payment_method}</div></div>
            <table class="data-table" style="margin-bottom:16px"><thead><tr><th>Item</th><th>Qty</th><th>Price</th><th>Total</th></tr></thead>
            <tbody>${inv.items.map(i=>`<tr><td>${i.product_name}${i.imei_number?` <span class="imei-tag">${i.imei_number}</span>`:''}</td><td>${i.quantity}</td><td>Rs.${i.price.toLocaleString()}</td><td>Rs.${i.subtotal.toLocaleString()}</td></tr>`).join('')}</tbody></table>
            <div style="text-align:right;font-size:20px;font-weight:800;color:var(--primary)">Total: Rs. ${inv.total_amount.toLocaleString()}</div>`;
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
            <td>${idx+1}</td><td><code>${i.imei_number}</code></td><td>${i.product_name}</td>
            <td>${i.customer_name||'-'}</td><td>${i.customer_phone||'-'}</td><td>${i.customer_nic||'-'}</td>
            <td>${i.purchase_date?formatDate(i.purchase_date):'-'}</td><td>${i.warranty_months}m</td>
        </tr>`).join('') || '<tr><td colspan="8" style="text-align:center;padding:40px;color:var(--text-muted)">No records for this month</td></tr>';
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
async function loadAdmin() {
    try {
        const res = await api('/admin/users'); if (!res) return;
        const users = await res.json();
        document.querySelector('#admin-table tbody').innerHTML = users.map(u => `<tr>
            <td><strong>${u.business_name}</strong></td><td>${u.email}</td><td>${u.role}</td>
            <td>${u.is_active?'<span class="badge badge-green">Active</span>':'<span class="badge badge-red">Pending</span>'}</td>
            <td><button class="btn btn-sm ${u.is_active?'btn-warning':'btn-success'}" onclick="toggleUser('${u.id}',${!u.is_active})">${u.is_active?'Deactivate':'Activate'}</button>
                <button class="btn btn-sm btn-danger" onclick="deleteUser('${u.id}')"><i class='bx bx-trash'></i></button></td>
        </tr>`).join('');
    } catch(e) { console.error(e); }
}

async function toggleUser(id, activate) {
    try { await api(`/admin/users/${id}`,{method:'PUT',body:JSON.stringify({is_active:activate})}); toast('Updated'); loadAdmin(); } catch(e){toast(e.message,'error');}
}

async function deleteUser(id) {
    if(!confirm('Delete user and all data?')) return;
    try { const res = await api(`/admin/users/${id}`,{method:'DELETE'}); if(res&&res.ok){toast('Deleted');loadAdmin();} } catch(e){toast(e.message,'error');}
}
