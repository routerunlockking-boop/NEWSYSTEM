// === DASHBOARD ===
async function loadDashboard() {
    try {
        const res = await api('/dashboard');
        if (!res) return;
        const d = await res.json();
        document.getElementById('dash-grid').innerHTML = `
            <div class="stat-card"><div class="stat-icon"><i class='bx bx-receipt'></i></div><div class="stat-info"><h3>Bills Today</h3><p>${d.totalBillsToday}</p></div></div>
            <div class="stat-card"><div class="stat-icon green"><i class='bx bx-money'></i></div><div class="stat-info"><h3>Daily Income</h3><p>Rs. ${(d.dailyIncome||0).toLocaleString()}</p></div></div>
            <div class="stat-card"><div class="stat-icon green"><i class='bx bx-trending-up'></i></div><div class="stat-info"><h3>Daily Profit</h3><p>Rs. ${(d.dailyProfit||0).toLocaleString()}</p></div></div>
            <div class="stat-card"><div class="stat-icon"><i class='bx bx-calendar'></i></div><div class="stat-info"><h3>Monthly Bills</h3><p>${d.totalBillsMonth}</p></div></div>
            <div class="stat-card"><div class="stat-icon green"><i class='bx bx-wallet'></i></div><div class="stat-info"><h3>Monthly Income</h3><p>Rs. ${(d.monthlyIncome||0).toLocaleString()}</p></div></div>
            <div class="stat-card"><div class="stat-icon blue"><i class='bx bx-chip'></i></div><div class="stat-info"><h3>IMEI In Stock</h3><p>${d.imeiInStock||0}</p></div></div>
            <div class="stat-card"><div class="stat-icon"><i class='bx bx-box'></i></div><div class="stat-info"><h3>Products</h3><p>${d.totalProducts}</p></div></div>
            <div class="stat-card"><div class="stat-icon red"><i class='bx bx-error'></i></div><div class="stat-info"><h3>Low Stock</h3><p>${d.lowStockProducts}</p></div></div>`;
        const lr = await api('/dashboard/low-stock');
        if (!lr) return;
        const low = await lr.json();
        const tb = document.querySelector('#low-stock-table tbody');
        tb.innerHTML = low.map(p => `<tr><td>${p.name}</td><td class="${p.quantity<=5?'text-danger':''}">${p.quantity}</td><td>${p.is_imei_tracked?'<span class="badge badge-blue">IMEI</span>':'Normal'}</td></tr>`).join('');
    } catch(e) { console.error(e); }
}

// === INVENTORY ===
async function loadInventory() {
    try {
        const res = await api('/products?lite=true');
        if (!res) return;
        products = await res.json();
        const tb = document.querySelector('#inv-table tbody');
        tb.innerHTML = products.map(p => `<tr>
            <td><strong>${p.name}</strong></td><td>${p.category||'General'}</td>
            <td class="${p.quantity<=10?'text-danger':''}"><strong>${p.quantity}</strong></td>
            <td>Rs. ${(p.cost_price||0).toLocaleString()}</td><td>Rs. ${p.price.toLocaleString()}</td>
            <td>${p.is_imei_tracked?'<span class="badge badge-blue"><i class="bx bx-chip"></i> IMEI</span>':'<span class="badge badge-gray">Normal</span>'}</td>
            <td><button class="btn btn-sm btn-outline" onclick="editProduct('${p.id}')"><i class='bx bx-edit'></i></button>
                <button class="btn btn-sm btn-danger" onclick="deleteProduct('${p.id}')"><i class='bx bx-trash'></i></button></td>
        </tr>`).join('');
    } catch(e) { console.error(e); }
}

async function loadCategories() {
    try {
        const res = await api('/products/categories');
        if (!res) return;
        const cats = await res.json();
        const sel = document.getElementById('prod-category');
        // Filter out duplicates if "General" is already in cats, though normally it's just user categories
        sel.innerHTML = '<option value="General">General</option>' + 
            cats.map(c => `<option value="${c.name}">${c.name}</option>`).join('') +
            '<option value="__new__">✏️ Add New Category...</option>';
        document.getElementById('prod-category-new').style.display = 'none';
        document.getElementById('prod-category-new').value = '';
    } catch(e) { console.error('Failed to load categories', e); }
}

function setupProductModal() {
    document.getElementById('prod-imei-tracked').onchange = function() {
        document.getElementById('prod-normal-fields').style.display = this.checked ? 'none' : 'block';
        document.getElementById('prod-imei-fields').style.display = this.checked ? 'block' : 'none';
    };
    document.getElementById('prod-category').addEventListener('change', function() {
        document.getElementById('prod-category-new').style.display = this.value === '__new__' ? 'block' : 'none';
        if (this.value === '__new__') document.getElementById('prod-category-new').focus();
    });
    document.getElementById('btn-add-product').onclick = async () => {
        document.getElementById('product-form').reset();
        document.getElementById('prod-id').value = '';
        await loadCategories();
        document.getElementById('product-modal-title').textContent = 'Add Product';
        document.getElementById('prod-normal-fields').style.display = 'block';
        document.getElementById('prod-imei-fields').style.display = 'none';
        openModal('modal-product');
    };
    document.getElementById('btn-save-product').onclick = async () => {
        const id = document.getElementById('prod-id').value;
        let categoryName = document.getElementById('prod-category').value;
        if (categoryName === '__new__') {
            categoryName = document.getElementById('prod-category-new').value.trim();
            if (!categoryName) return toast('Please enter a new category name', 'error');
            try {
                await api('/products/categories', { method: 'POST', body: JSON.stringify({ name: categoryName }) });
            } catch(e) { console.error('Failed to create new category', e); }
        }

        const data = {
            name: document.getElementById('prod-name').value,
            category: categoryName,
            cost_price: parseFloat(document.getElementById('prod-cost').value)||0,
            price: parseFloat(document.getElementById('prod-price').value)||0,
            is_imei_tracked: document.getElementById('prod-imei-tracked').checked,
            quantity: document.getElementById('prod-imei-tracked').checked ? 0 : (parseInt(document.getElementById('prod-qty').value)||0),
            warranty_months: parseInt(document.getElementById('prod-warranty').value)||12,
            barcode: document.getElementById('prod-barcode').value,
            supplier: document.getElementById('prod-supplier').value || ''
        };
        if (!data.name || !data.price) return toast('Name and price required','error');
        try {
            const res = await api(id ? `/products/${id}` : '/products', { method: id?'PUT':'POST', body: JSON.stringify(data) });
            if (!res) return;
            const d = await res.json();
            if (!res.ok) throw new Error(d.error);
            toast(id ? 'Product updated' : 'Product added');
            closeModal('modal-product'); loadInventory();
        } catch(e) { toast(e.message,'error'); }
    };
}

async function editProduct(id) {
    const p = products.find(x => x.id === id);
    if (!p) return;
    await loadCategories();
    document.getElementById('prod-id').value = p.id;
    document.getElementById('prod-name').value = p.name;
    document.getElementById('prod-category').value = p.category || 'General';
    if (p.supplier && Array.from(document.getElementById('prod-supplier').options).some(o => o.value === p.supplier)) {
        document.getElementById('prod-supplier').value = p.supplier;
    } else {
        document.getElementById('prod-supplier').value = '';
    }
    document.getElementById('prod-cost').value = p.cost_price;
    document.getElementById('prod-price').value = p.price;
    document.getElementById('prod-qty').value = p.quantity;
    document.getElementById('prod-barcode').value = p.barcode;
    document.getElementById('prod-imei-tracked').checked = p.is_imei_tracked;
    document.getElementById('prod-warranty').value = p.warranty_months || 12;
    document.getElementById('prod-normal-fields').style.display = p.is_imei_tracked ? 'none' : 'block';
    document.getElementById('prod-imei-fields').style.display = p.is_imei_tracked ? 'block' : 'none';
    document.getElementById('product-modal-title').textContent = 'Edit Product';
    openModal('modal-product');
}

async function deleteProduct(id) {
    if (!confirm('Delete this product?')) return;
    try {
        const res = await api(`/products/${id}`, { method:'DELETE' });
        if (res && res.ok) { toast('Product deleted'); loadInventory(); }
    } catch(e) { toast(e.message,'error'); }
}

// === IMEI MANAGEMENT ===
async function loadImeiList() {
    try {
        const search = document.getElementById('imei-search').value;
        const status = document.getElementById('imei-status-filter').value;
        let url = '/imei?';
        if (search) url += `search=${encodeURIComponent(search)}&`;
        if (status) url += `status=${encodeURIComponent(status)}`;
        const res = await api(url);
        if (!res) return;
        const items = await res.json();
        const tb = document.querySelector('#imei-table tbody');
        tb.innerHTML = items.map(i => `<tr>
            <td><code style="font-size:13px;font-weight:600">${i.imei_number}</code></td>
            <td>${i.product_name}</td>
            <td>${statusBadge(i.status)}</td>
            <td>${i.customer_name||'-'}<br><small style="color:var(--text-muted)">${i.customer_phone||''}</small></td>
            <td>${i.warranty_expiry_date ? formatDate(i.warranty_expiry_date) : '-'}</td>
            <td><button class="btn btn-sm btn-outline" onclick="viewImeiDetail('${i.id}')"><i class='bx bx-show'></i></button>
                ${i.status!=='Sold'?`<button class="btn btn-sm btn-danger" onclick="deleteImei('${i.id}')"><i class='bx bx-trash'></i></button>`:''}</td>
        </tr>`).join('') || '<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--text-muted)">No IMEI items found</td></tr>';
    } catch(e) { console.error(e); }
}

// Search/filter listeners
document.getElementById('imei-search').addEventListener('input', debounce(loadImeiList, 400));
document.getElementById('imei-status-filter').addEventListener('change', loadImeiList);

function debounce(fn, ms) { let t; return function(...a) { clearTimeout(t); t = setTimeout(()=>fn.apply(this,a), ms); }; }

// ===== IMEI STOCK RECEIVING WITH SCANNER =====
let scannedImeiQueue = [];

// Shared handler — called from keyboard Enter AND camera scanner
let isProcessingImei = {}; // Prevent rapid concurrent scans of the same IMEI
async function handleImeiStockScan(rawValue) {
    const imei = sanitizeBarcode(rawValue);
    if (!imei) return;

    // Prevent race condition if scanner sends same IMEI multiple times instantly
    if (isProcessingImei[imei]) return;
    isProcessingImei[imei] = true;

    try {
        const bulkText = document.getElementById('imei-numbers').value.split('\n').map(s=>s.trim()).filter(Boolean);

        // Check duplicate in current queue
        if (scannedImeiQueue.includes(imei) || bulkText.includes(imei)) {
            toast(`Duplicate in queue: ${imei}`, 'error');
            addToScannedQueueUI(imei, true, 'Already in queue');
            return;
        }

        // Add to queue immediately to block other rapid scans of the same barcode
        scannedImeiQueue.push(imei);

        // Quick duplicate check against DB
        try {
            const res = await api(`/imei/lookup/${encodeURIComponent(imei)}`);
            if (res && res.ok) {
                // Oops, it's in the DB. Remove from queue.
                scannedImeiQueue = scannedImeiQueue.filter(i => i !== imei);
                toast(`IMEI already exists in database: ${imei}`, 'error');
                addToScannedQueueUI(imei, true, 'Exists in DB');
                return;
            }
        } catch(ex) {}

        // Success UI update
        addToScannedQueueUI(imei, false);
        updateScanCount();
        toast(`IMEI scanned: ${imei}`, 'scan');

        // Auto-focus back for next scan
        document.getElementById('imei-scan-input')?.focus();
    } finally {
        // Unlock
        setTimeout(() => { isProcessingImei[imei] = false; }, 1000); // Lock for 1 second to prevent bounce
    }
}

function setupImeiModal() {
    const scanInput = document.getElementById('imei-scan-input');
    const form = document.getElementById('imei-form');
    if (form) form.addEventListener('submit', e => e.preventDefault());

    // Scanner input handler — works with both keyboard typing and barcode scanner
    scanInput.addEventListener('keydown', async (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();
            const raw = scanInput.value;
            scanInput.value = '';
            await handleImeiStockScan(raw);
        }
    });

    document.getElementById('btn-add-imei').onclick = async () => {
        const res = await api('/products?lite=true');
        if (!res) return;
        const prods = await res.json();
        const tracked = prods.filter(p => p.is_imei_tracked);
        const sel = document.getElementById('imei-product');
        sel.innerHTML = tracked.map(p => `<option value="${p.id}" data-cost="${p.cost_price}" data-price="${p.price}" data-warranty="${p.warranty_months}">${p.name}</option>`).join('');
        if (!tracked.length) { toast('No IMEI-tracked products. Add a product first.','error'); return; }
        sel.onchange = () => {
            const opt = sel.selectedOptions[0];
            document.getElementById('imei-purchase-price').value = opt.dataset.cost;
            document.getElementById('imei-selling-price').value = opt.dataset.price;
            document.getElementById('imei-warranty').value = opt.dataset.warranty || 12;
        };
        sel.dispatchEvent(new Event('change'));
        // Reset
        scannedImeiQueue = [];
        document.getElementById('imei-scanned-queue').innerHTML = '';
        document.getElementById('imei-numbers').value = '';
        updateScanCount();
        openModal('modal-imei');
        // Auto-focus scan field
        setTimeout(() => scanInput.focus(), 300);
    };

    document.getElementById('btn-save-imei').onclick = async function() {
        const btn = this;
        // Merge scanned queue + bulk textarea
        const bulkText = document.getElementById('imei-numbers').value.split('\n').map(s=>s.trim()).filter(Boolean);
        const allImeis = [...new Set([...scannedImeiQueue, ...bulkText])];
        if (!allImeis.length) return toast('Scan or enter at least one IMEI','error');

        btn.disabled = true;
        const origHtml = btn.innerHTML;
        btn.innerHTML = '<i class="bx bx-loader bx-spin"></i> Saving...';

        const data = {
            product_id: document.getElementById('imei-product').value,
            imei_numbers: allImeis,
            purchase_price: parseFloat(document.getElementById('imei-purchase-price').value)||0,
            selling_price: parseFloat(document.getElementById('imei-selling-price').value)||0,
            warranty_months: parseInt(document.getElementById('imei-warranty').value)||12
        };
        try {
            const res = await api('/imei', { method:'POST', body: JSON.stringify(data) });
            if (!res) throw new Error('Network error');
            const d = await res.json();
            if (!res.ok) throw new Error(d.error || 'Failed to save');
            toast(`${d.added} IMEI items added successfully`);
            if (d.errors && d.errors.length) toast(d.errors.join(', '),'error');
            closeModal('modal-imei'); loadImeiList(); loadInventory();
        } catch(e) { 
            toast(e.message,'error'); 
        } finally {
            btn.disabled = false;
            btn.innerHTML = origHtml;
        }
    };
}

function addToScannedQueueUI(imei, isError, errorMsg) {
    const queue = document.getElementById('imei-scanned-queue');
    const div = document.createElement('div');
    div.className = `scanned-item ${isError ? 'error' : ''}`;
    div.innerHTML = `<span>${imei} ${isError ? `<small>(${errorMsg})</small>` : '<i class="bx bx-check" style="color:var(--success)"></i>'}</span>
        ${!isError ? `<button class="remove-scan" onclick="removeFromQueue('${imei}',this)">&times;</button>` : ''}`;
    queue.insertBefore(div, queue.firstChild);
    // Flash effect
    if (!isError) div.style.animation = 'fadeIn 0.3s ease';
}

function removeFromQueue(imei, btn) {
    scannedImeiQueue = scannedImeiQueue.filter(i => i !== imei);
    btn.parentElement.remove();
    updateScanCount();
}

function updateScanCount() {
    document.getElementById('imei-scan-count').textContent = `${scannedImeiQueue.length} scanned`;
}

async function viewImeiDetail(id) {
    try {
        const res = await api('/imei');
        if (!res) return;
        const items = await res.json();
        const item = items.find(i => i.id === id);
        if (!item) return toast('Item not found','error');
        const isWarrantyValid = item.warranty_expiry_date && new Date(item.warranty_expiry_date) > new Date();
        const body = document.getElementById('imei-detail-body');
        body.innerHTML = `
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:20px">
                <div><label style="font-size:12px;color:var(--text-muted)">IMEI Number</label><p style="font-weight:700;font-family:monospace;font-size:15px">${item.imei_number}</p></div>
                <div><label style="font-size:12px;color:var(--text-muted)">Product</label><p style="font-weight:600">${item.product_name}</p></div>
                <div><label style="font-size:12px;color:var(--text-muted)">Status</label><p>${statusBadge(item.status)}</p></div>
                <div><label style="font-size:12px;color:var(--text-muted)">Warranty</label><p>${isWarrantyValid?'<span class="badge badge-green">Active</span>':'<span class="badge badge-red">Expired</span>'} ${item.warranty_months}m</p></div>
                <div><label style="font-size:12px;color:var(--text-muted)">Purchase Price</label><p>Rs. ${(item.purchase_price||0).toLocaleString()}</p></div>
                <div><label style="font-size:12px;color:var(--text-muted)">Selling Price</label><p>Rs. ${(item.selling_price||0).toLocaleString()}</p></div>
                <div><label style="font-size:12px;color:var(--text-muted)">Received</label><p>${formatDate(item.received_date)}</p></div>
                <div><label style="font-size:12px;color:var(--text-muted)">Sold Date</label><p>${item.sold_date?formatDate(item.sold_date):'-'}</p></div>
            </div>
            ${item.customer_name ? `<div style="background:var(--secondary);border-radius:10px;padding:16px;margin-bottom:20px">
                <h4 style="font-size:13px;color:var(--text-muted);margin-bottom:10px"><i class='bx bx-user'></i> Customer</h4>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:13px">
                    <div><strong>Name:</strong> ${item.customer_name}</div><div><strong>Phone:</strong> ${item.customer_phone}</div>
                    <div><strong>NIC:</strong> ${item.customer_nic||'-'}</div><div><strong>Email:</strong> ${item.customer_email||'-'}</div>
                    <div style="grid-column:span 2"><strong>Address:</strong> ${item.customer_address||'-'}</div>
                </div>
            </div>` : ''}
            <h4 style="font-size:14px;margin-bottom:12px"><i class='bx bx-history'></i> Status History</h4>
            <div class="timeline">${(item.status_history||[]).map(h => `
                <div class="timeline-item"><div class="timeline-date">${new Date(h.date).toLocaleString()}</div>
                <div class="timeline-status">${h.status}</div>
                <div class="timeline-note">${h.notes||''}</div>
                <div class="timeline-by">by ${h.changed_by||'System'}</div></div>`).join('')}
            </div>`;
        const foot = document.getElementById('imei-detail-foot');
        foot.innerHTML = item.status !== 'In Stock' ? `<button class="btn btn-warning" onclick="openStatusModal('${item.id}')"><i class='bx bx-refresh'></i> Change Status</button>` : '';
        openModal('modal-imei-detail');
    } catch(e) { console.error(e); }
}

async function deleteImei(id) {
    if (!confirm('Delete this IMEI item?')) return;
    try {
        const res = await api(`/imei/${id}`, { method:'DELETE' });
        if (res&&res.ok) { toast('IMEI deleted'); loadImeiList(); }
    } catch(e) { toast(e.message,'error'); }
}

// === STATUS CHANGE ===
function setupStatusModal() {
    document.getElementById('btn-save-status').onclick = async () => {
        const id = document.getElementById('status-imei-id').value;
        const data = {
            status: document.getElementById('status-new').value,
            notes: document.getElementById('status-notes').value,
            send_email: document.getElementById('status-send-email').checked,
            send_sms: document.getElementById('status-send-sms').checked
        };
        try {
            const res = await api(`/imei/${id}/status`, { method:'PUT', body: JSON.stringify(data) });
            if (!res) return;
            const d = await res.json();
            if (!res.ok) throw new Error(d.error);
            toast('Status updated'); closeModal('modal-status'); closeModal('modal-imei-detail');
            loadImeiList();
        } catch(e) { toast(e.message,'error'); }
    };
}

function openStatusModal(id) {
    document.getElementById('status-imei-id').value = id;
    document.getElementById('status-notes').value = '';
    document.getElementById('status-send-email').checked = true;
    const smsCb = document.getElementById('status-send-sms');
    if (smsCb) smsCb.checked = true;
    openModal('modal-status');
}
