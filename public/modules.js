// === UTILS ===
async function api(path, options = {}) {
    if (!token) return;
    const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
    try {
        const res = await fetch(API + path, { ...options, headers });
        if (res.status === 401) { localStorage.clear(); location.reload(); return; }
        return res;
    } catch(e) { toast(e.message, 'error'); }
}
function toast(msg, type='success') {
    const t = document.createElement('div');
    t.className = `toast toast-${type}`;
    t.innerHTML = `<i class='bx ${type==='error'?'bx-error-circle':type==='scan'?'bx-barcode-reader':'bx-check-circle'}'></i> ${msg}`;
    document.body.appendChild(t);
    setTimeout(() => t.classList.add('show'), 10);
    setTimeout(() => { t.classList.remove('show'); setTimeout(()=>t.remove(), 300); }, 3000);
}
function openModal(id) { document.getElementById(id).classList.add('active'); }
function closeModal(id) { document.getElementById(id).classList.remove('active'); }
function formatDate(d) { return new Date(d).toLocaleDateString(); }
function sanitizeBarcode(s) { return s.trim().replace(/[^a-zA-Z0-9]/g, ''); }
function statusBadge(s) {
    const colors = { 'In Stock': 'badge-green', 'Sold': 'badge-blue', 'Returned': 'badge-red', 'Under Repair': 'badge-warning' };
    return `<span class="badge ${colors[s] || 'badge-outline'}">${s}</span>`;
}

// === INVENTORY ===
let products = [];
async function loadInventory() {
    try {
        const res = await api('/products?_t=' + Date.now());
        if (!res) return;
        products = await res.json();
        const tb = document.querySelector('#inventory-table tbody');
        tb.innerHTML = products.map(p => `<tr>
            <td><strong>${p.name}</strong><br><small style="color:var(--text-muted)">${p.category}</small></td>
            <td><code style="font-size:12px">${p.barcode || '-'}</code></td>
            <td><span class="badge ${p.quantity<=5?'badge-red':'badge-outline'}">${p.quantity}</span></td>
            <td>Rs. ${p.price.toLocaleString()}</td>
            <td>${p.is_imei_tracked ? `<span class="badge badge-info"><i class='bx bx-chip'></i> IMEI</span>` : `<span class="badge badge-outline">General</span>`}</td>
            <td><button class="btn btn-sm btn-outline" onclick="editProduct('${p.id}')"><i class='bx bx-edit'></i></button>
                <button class="btn btn-sm btn-danger" onclick="deleteProduct('${p.id}')"><i class='bx bx-trash'></i></button></td>
        </tr>`).join('') || '<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--text-muted)">No products found</td></tr>';
    } catch(e) { console.error(e); }
}

function setupProductModal() {
    document.getElementById('btn-add-product').onclick = () => {
        document.getElementById('product-form').reset();
        document.getElementById('prod-id').value = '';
        document.getElementById('product-modal-title').textContent = 'Add Product';
        openModal('modal-product');
    };
    document.getElementById('btn-save-product').onclick = async () => {
        const id = document.getElementById('prod-id').value;
        const data = {
            name: document.getElementById('prod-name').value,
            barcode: document.getElementById('prod-barcode').value,
            category: document.getElementById('prod-category').value,
            quantity: parseInt(document.getElementById('prod-qty').value)||0,
            cost_price: parseFloat(document.getElementById('prod-cost').value)||0,
            price: parseFloat(document.getElementById('prod-price').value)||0,
            is_imei_tracked: document.getElementById('prod-imei').checked,
            warranty_months: parseInt(document.getElementById('prod-warranty').value)||12,
            supplier: document.getElementById('prod-supplier').value
        };
        if (!data.name || !data.price) return toast('Name and price required', 'error');
        try {
            const res = await api(id ? `/products/${id}` : '/products', { method: id?'PUT':'POST', body: JSON.stringify(data) });
            if (!res) return;
            if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
            toast(id ? 'Product updated' : 'Product added');
            closeModal('modal-product'); loadInventory();
        } catch(e) { toast(e.message, 'error'); }
    };
}

function editProduct(id) {
    const p = products.find(x => x.id === id);
    if (!p) return;
    document.getElementById('prod-id').value = p.id;
    document.getElementById('prod-name').value = p.name;
    document.getElementById('prod-barcode').value = p.barcode || '';
    document.getElementById('prod-category').value = p.category;
    document.getElementById('prod-qty').value = p.quantity;
    document.getElementById('prod-cost').value = p.cost_price;
    document.getElementById('prod-price').value = p.price;
    document.getElementById('prod-imei').checked = p.is_imei_tracked;
    document.getElementById('prod-warranty').value = p.warranty_months;
    document.getElementById('prod-supplier').value = p.supplier || '';
    document.getElementById('product-modal-title').textContent = 'Edit Product';
    openModal('modal-product');
}

async function deleteProduct(id) {
    if (!confirm('Delete product? All related data will be lost.')) return;
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
        if (status) url += `status=${encodeURIComponent(status)}&`;
        url += `_t=${Date.now()}`;
        const res = await api(url);
        if (!res) return;
        const items = await res.json();
        const tb = document.querySelector('#imei-table tbody');
        tb.innerHTML = items.map(i => `<tr>
            <td><code style="font-size:13px;font-weight:600">${i.imei_number || i.sim_serial || '-'}</code></td>
            <td>${i.product_name}</td>
            <td>${statusBadge(i.status)}</td>
            <td>${i.customer_name||'-'}<br><small style="color:var(--text-muted)">${i.customer_phone||''}</small></td>
            <td>${i.warranty_expiry_date ? formatDate(i.warranty_expiry_date) : '-'}</td>
            <td><button class="btn btn-sm btn-outline" onclick="viewImeiDetail('${i.id}')"><i class='bx bx-show'></i></button>
                ${i.status!=='Sold'?`<button class="btn btn-sm btn-danger" onclick="deleteImei('${i.id}')"><i class='bx bx-trash'></i></button>`:''}</td>
        </tr>`).join('') || '<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--text-muted)">No items found</td></tr>';
    } catch(e) { console.error(e); }
}

document.getElementById('imei-search').addEventListener('input', debounce(loadImeiList, 400));
document.getElementById('imei-status-filter').addEventListener('change', loadImeiList);
function debounce(fn, ms) { let t; return function(...a) { clearTimeout(t); t = setTimeout(()=>fn.apply(this,a), ms); }; }

// ===== IMEI STOCK RECEIVING =====
let scannedImeiQueue = [];
let isProcessingImei = {};

async function handleImeiStockScan(rawValue) {
    const imei = sanitizeBarcode(rawValue);
    if (!imei) return;
    if (isProcessingImei[imei]) return;
    isProcessingImei[imei] = true;
    try {
        const bulkText = document.getElementById('imei-numbers').value.split('\n').map(s=>s.trim()).filter(Boolean);
        if (scannedImeiQueue.includes(imei) || bulkText.includes(imei)) { toast(`Duplicate: ${imei}`, 'error'); return; }
        
        scannedImeiQueue.push(imei);
        const prodSel = document.getElementById('imei-product');
        const isSim = prodSel.selectedOptions[0]?.dataset.category === 'SIM Cards';
        
        addToScannedQueueUI(imei, false, '', isSim);
        updateScanCount();
        toast(`Scanned: ${imei}`, 'scan');
        document.getElementById('imei-scan-input')?.focus();
    } finally { setTimeout(() => { isProcessingImei[imei] = false; }, 1000); }
}

function setupImeiModal() {
    const scanInput = document.getElementById('imei-scan-input');
    scanInput.addEventListener('keydown', async (e) => { if (e.key === 'Enter') { e.preventDefault(); const raw = scanInput.value; scanInput.value = ''; await handleImeiStockScan(raw); } });

    document.getElementById('btn-add-imei').onclick = async () => {
        const res = await api('/products?lite=true');
        if (!res) return;
        const prods = await res.json();
        const tracked = prods.filter(p => p.is_imei_tracked);
        const sel = document.getElementById('imei-product');
        sel.innerHTML = tracked.map(p => `<option value="${p.id}" data-category="${p.category}" data-cost="${p.cost_price}" data-price="${p.price}" data-warranty="${p.warranty_months}">${p.name}</option>`).join('');
        sel.onchange = () => {
            const opt = sel.selectedOptions[0];
            document.getElementById('imei-purchase-price').value = opt.dataset.cost;
            document.getElementById('imei-selling-price').value = opt.dataset.price;
            document.getElementById('imei-warranty').value = opt.dataset.warranty || 12;
            // Refresh queue UI if category changes
            document.getElementById('imei-scanned-queue').innerHTML = '';
            scannedImeiQueue.forEach(i => addToScannedQueueUI(i, false, '', opt.dataset.category === 'SIM Cards'));
        };
        sel.dispatchEvent(new Event('change'));
        scannedImeiQueue = []; document.getElementById('imei-scanned-queue').innerHTML = ''; document.getElementById('imei-numbers').value = ''; updateScanCount();
        openModal('modal-imei'); setTimeout(() => scanInput.focus(), 300);
    };

    document.getElementById('btn-save-imei').onclick = async function() {
        const btn = this;
        const bulkText = document.getElementById('imei-numbers').value.split('\n').map(s=>s.trim()).filter(Boolean);
        const allImeis = [...new Set([...scannedImeiQueue, ...bulkText])];
        if (!allImeis.length) return toast('Add at least one item','error');

        const isSim = document.getElementById('imei-product').selectedOptions[0]?.dataset.category === 'SIM Cards';
        const itemsData = allImeis.map(imei => {
            const item = { imei_number: imei };
            if (isSim) {
                const sltInput = document.querySelector(`.slt-num-input[data-imei="${imei}"]`);
                if (sltInput) item.slt_number = sltInput.value.trim();
                item.sim_serial_number = imei; // Use imei field for serial
            }
            return item;
        });

        btn.disabled = true;
        const data = {
            product_id: document.getElementById('imei-product').value,
            items: itemsData,
            purchase_price: parseFloat(document.getElementById('imei-purchase-price').value)||0,
            selling_price: parseFloat(document.getElementById('imei-selling-price').value)||0,
            warranty_months: parseInt(document.getElementById('imei-warranty').value)||12
        };
        try {
            const res = await api('/imei/bulk', { method:'POST', body: JSON.stringify(data) });
            const d = await res.json();
            if (!res.ok) throw new Error(d.error);
            toast('Items added successfully');
            closeModal('modal-imei'); loadImeiList(); loadInventory();
        } catch(e) { toast(e.message,'error'); } finally { btn.disabled = false; }
    };
}

function addToScannedQueueUI(imei, isError, errorMsg, isSim) {
    const queue = document.getElementById('imei-scanned-queue');
    const div = document.createElement('div');
    div.className = `scanned-item ${isError ? 'error' : ''}`;
    div.style.display = 'flex'; div.style.alignItems = 'center'; div.style.gap = '10px'; div.style.padding = '8px'; div.style.borderBottom = '1px solid var(--border)';
    div.innerHTML = `<span style="flex:1">${imei} ${isError ? `<small>(${errorMsg})</small>` : ''}</span>
        ${isSim && !isError ? `<input type="text" placeholder="SLT Number" class="form-control slt-num-input" data-imei="${imei}" style="width:140px;height:30px;font-size:12px">` : ''}
        ${!isError ? `<button class="remove-scan" onclick="removeFromQueue('${imei}',this)">&times;</button>` : ''}`;
    queue.insertBefore(div, queue.firstChild);
}
function removeFromQueue(imei, btn) { scannedImeiQueue = scannedImeiQueue.filter(i => i !== imei); btn.parentElement.remove(); updateScanCount(); }
function updateScanCount() { document.getElementById('imei-scan-count').textContent = `${scannedImeiQueue.length} scanned`; }

async function viewImeiDetail(id) {
    try {
        const res = await api('/imei'); if (!res) return;
        const items = await res.json(); const item = items.find(i => i.id === id); if (!item) return;
        const body = document.getElementById('imei-detail-body');
        body.innerHTML = `<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
            <div><label>IMEI / Serial</label><p>${item.imei_number || item.sim_serial || '-'}</p></div>
            ${item.slt_number?`<div><label>SLT Number</label><p>${item.slt_number}</p></div>`:''}
            <div><label>Product</label><p>${item.product_name}</p></div>
            <div><label>Status</label><p>${statusBadge(item.status)}</p></div>
        </div>`;
        openModal('modal-imei-detail');
    } catch(e) {}
}
async function deleteImei(id) { if (confirm('Delete?')) { await api(`/imei/${id}`, { method:'DELETE' }); loadImeiList(); } }
