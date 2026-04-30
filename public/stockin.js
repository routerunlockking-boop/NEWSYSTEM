// ===== STOCK IN (RECEIVE IMEI STOCK) =====
// Dedicated full-page stock receiving with optimized scanner workflow

let stockinQueue = []; // Array of { imei, product_name, product_id, price, cost, warranty }
let stockinFocusLock = false;
let stockinFocusInterval = null;
let stockinScanBuffer = '';
let stockinScanTimer = null;
const SCAN_SPEED_THRESHOLD = 80; // ms between keystrokes — scanner is <50ms, human is >150ms

// === INIT ===
function setupStockIn() {
    const scanInput = document.getElementById('stockin-scan');
    const productSel = document.getElementById('stockin-product');

    // ---- SCANNER INPUT HANDLER ----
    // Strategy: Use keydown to catch Enter, use input event for value processing.
    // Barcode scanners type chars very fast then send Enter.
    // We detect "fast input" (scanner) vs "slow input" (human typing).

    scanInput.addEventListener('keydown', (e) => {
        // Block Enter from submitting any form or causing navigation
        if (e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();
            const val = scanInput.value.trim();
            if (val) {
                processStockinScan(val);
                scanInput.value = '';
            }
            return false;
        }
        // Escape clears input
        if (e.key === 'Escape') {
            e.preventDefault();
            scanInput.value = '';
            updateStockinStatus('Ready to scan', 'muted');
        }
    });

    // Prevent form submission if input is inside a form
    scanInput.closest('form')?.addEventListener('submit', e => e.preventDefault());

    // Product dropdown change — auto-fill prices
    productSel.addEventListener('change', () => {
        const opt = productSel.selectedOptions[0];
        if (opt) {
            document.getElementById('stockin-cost').value = opt.dataset.cost || '';
            document.getElementById('stockin-price').value = opt.dataset.price || '';
            if (opt.dataset.warranty) document.getElementById('stockin-warranty').value = opt.dataset.warranty;
        }
    });

    // Focus lock button
    document.getElementById('btn-stockin-focus').addEventListener('click', () => {
        stockinFocusLock = !stockinFocusLock;
        const btn = document.getElementById('btn-stockin-focus');
        if (stockinFocusLock) {
            btn.classList.add('btn-danger');
            btn.classList.remove('btn-primary');
            btn.innerHTML = '<i class="bx bx-target-lock"></i> Locked';
            startStockinFocusLock();
        } else {
            btn.classList.remove('btn-danger');
            btn.classList.add('btn-primary');
            btn.innerHTML = '<i class="bx bx-target-lock"></i> Focus';
            stopStockinFocusLock();
        }
        focusStockinScan();
    });

    // Clear all button
    document.getElementById('btn-stockin-clear').addEventListener('click', () => {
        if (!stockinQueue.length) return;
        if (!confirm(`Clear all ${stockinQueue.length} scanned items?`)) return;
        stockinQueue = [];
        renderStockinTable();
        focusStockinScan();
    });

    // Save all button
    document.getElementById('btn-stockin-save').addEventListener('click', saveStockinBatch);

    // Global Escape key handler when on Stock In view
    document.addEventListener('keydown', (e) => {
        if (currentView !== 'stockin-view') return;
        if (e.key === 'Escape' && document.activeElement !== scanInput) {
            focusStockinScan();
        }
    });
}

// === LOAD STOCK IN VIEW ===
async function loadStockIn() {
    // Load IMEI-tracked products into dropdown
    const res = await api('/products?lite=true');
    if (!res) return;
    const prods = await res.json();
    const tracked = prods.filter(p => p.is_imei_tracked);
    const sel = document.getElementById('stockin-product');
    sel.innerHTML = tracked.length
        ? tracked.map(p => `<option value="${p.id}" data-cost="${p.cost_price||0}" data-price="${p.price}" data-warranty="${p.warranty_months||12}">${p.name}</option>`).join('')
        : '<option disabled>No IMEI-tracked products found</option>';
    // Trigger change to fill prices
    sel.dispatchEvent(new Event('change'));
    // Auto-focus scan field
    focusStockinScan();
    // Auto-enable focus lock
    if (!stockinFocusLock) {
        document.getElementById('btn-stockin-focus').click();
    }
}

// === FOCUS MANAGEMENT ===
function focusStockinScan() {
    const el = document.getElementById('stockin-scan');
    if (el) { el.focus(); el.select(); }
}

function startStockinFocusLock() {
    stopStockinFocusLock(); // Clear any existing
    stockinFocusInterval = setInterval(() => {
        if (currentView !== 'stockin-view' || !stockinFocusLock) {
            stopStockinFocusLock();
            return;
        }
        const active = document.activeElement;
        const scanField = document.getElementById('stockin-scan');
        // Only refocus if we're not in another important input (product, price, etc.)
        const isConfigInput = active && active.closest('.stockin-config');
        const isModal = active && active.closest('.modal-bg');
        if (!isConfigInput && !isModal && active !== scanField) {
            scanField?.focus();
        }
    }, 500);
}

function stopStockinFocusLock() {
    if (stockinFocusInterval) { clearInterval(stockinFocusInterval); stockinFocusInterval = null; }
}

// === PROCESS SCANNED IMEI ===
async function processStockinScan(rawValue) {
    const imei = sanitizeBarcode(rawValue);
    if (!imei) {
        flashStockinScan('err');
        updateStockinStatus('Invalid input', 'err');
        focusStockinScan();
        return;
    }

    const productSel = document.getElementById('stockin-product');
    if (!productSel.value) {
        flashStockinScan('err');
        toast('Select a product model first!', 'error');
        updateStockinStatus('Select product first', 'err');
        focusStockinScan();
        return;
    }

    // Check duplicate in current session
    if (stockinQueue.find(q => q.imei === imei)) {
        flashStockinScan('err');
        toast(`Duplicate: ${imei} already in this batch`, 'error');
        updateStockinStatus(`Duplicate: ${imei}`, 'err');
        focusStockinScan();
        return;
    }

    // Check duplicate in database
    try {
        const res = await api(`/imei/lookup/${encodeURIComponent(imei)}`);
        if (res && res.ok) {
            const existing = await res.json();
            flashStockinScan('err');
            toast(`IMEI ${imei} already exists in DB (${existing.status})`, 'error');
            updateStockinStatus(`Exists in DB: ${imei}`, 'err');
            focusStockinScan();
            return;
        }
    } catch(ex) { /* 404 = not found = good */ }

    // SUCCESS — Add to queue
    const opt = productSel.selectedOptions[0];
    const item = {
        imei: imei,
        product_id: productSel.value,
        product_name: opt.textContent,
        cost: parseFloat(document.getElementById('stockin-cost').value) || 0,
        price: parseFloat(document.getElementById('stockin-price').value) || 0,
        warranty: parseInt(document.getElementById('stockin-warranty').value) || 12
    };
    stockinQueue.unshift(item); // Add to top

    flashStockinScan('ok');
    toast(`✓ ${imei}`, 'scan');
    updateStockinStatus(`Added: ${imei}`, 'ok');
    renderStockinTable();
    focusStockinScan();
}

// Camera scanner handler for stockin
function handleStockinCameraScan(barcode) {
    processStockinScan(barcode);
}

// === VISUAL FEEDBACK ===
function flashStockinScan(type) {
    const wrap = document.getElementById('stockin-scan-wrap');
    wrap.classList.remove('scan-ok', 'scan-err');
    void wrap.offsetWidth; // Force reflow for re-trigger
    wrap.classList.add(type === 'ok' ? 'scan-ok' : 'scan-err');
    setTimeout(() => wrap.classList.remove('scan-ok', 'scan-err'), 600);
}

function updateStockinStatus(msg, type) {
    const el = document.getElementById('stockin-scan-status');
    const colors = { ok: 'var(--success)', err: 'var(--danger)', muted: 'var(--text-muted)' };
    el.style.color = colors[type] || colors.muted;
    el.innerHTML = type === 'ok'
        ? `<i class='bx bx-check-circle'></i> ${msg}`
        : type === 'err'
        ? `<i class='bx bx-error-circle'></i> ${msg}`
        : msg;
    // Reset after 5 seconds
    if (type !== 'muted') {
        setTimeout(() => {
            el.style.color = colors.muted;
            el.innerHTML = 'Ready to scan';
        }, 5000);
    }
}

// === RENDER TABLE ===
function renderStockinTable() {
    const tb = document.querySelector('#stockin-table tbody');
    const count = stockinQueue.length;

    tb.innerHTML = stockinQueue.map((item, i) => `
        <tr class="${i === 0 ? 'new-row' : ''}">
            <td style="font-weight:600;color:var(--text-muted)">${count - i}</td>
            <td><code style="font-size:14px;font-weight:700;letter-spacing:0.5px">${item.imei}</code></td>
            <td>${item.product_name}</td>
            <td>Rs. ${item.price.toLocaleString()}</td>
            <td>${item.warranty}m</td>
            <td><button class="btn btn-ghost" onclick="removeStockinItem(${i})" title="Remove"><i class='bx bx-x' style="font-size:18px;color:var(--danger)"></i></button></td>
        </tr>`).join('') || `<tr><td colspan="6" style="text-align:center;padding:50px;color:var(--text-muted)">
            <i class='bx bx-barcode' style="font-size:40px;display:block;margin-bottom:8px;opacity:0.3"></i>
            Scan your first router barcode to begin
        </td></tr>`;

    // Update counts
    document.getElementById('stockin-count').textContent = `${count} item${count !== 1 ? 's' : ''}`;
    document.getElementById('stockin-total-label').textContent = `${count} item${count !== 1 ? 's' : ''} ready to save`;
    document.getElementById('stockin-batch-info').textContent = count
        ? `${count} item${count !== 1 ? 's' : ''} · ${stockinQueue[0]?.product_name || ''}`
        : 'No items yet';

    // Show/hide footer and clear button
    document.getElementById('stockin-footer').style.display = count ? 'flex' : 'none';
    document.getElementById('btn-stockin-clear').style.display = count ? 'inline-flex' : 'none';
}

function removeStockinItem(index) {
    const removed = stockinQueue.splice(index, 1)[0];
    toast(`Removed: ${removed.imei}`, 'error');
    renderStockinTable();
    focusStockinScan();
}

// === SAVE BATCH TO DATABASE ===
async function saveStockinBatch() {
    if (!stockinQueue.length) return toast('No items to save', 'error');

    const productId = stockinQueue[0].product_id;
    const data = {
        product_id: productId,
        imei_numbers: stockinQueue.map(q => q.imei),
        purchase_price: stockinQueue[0].cost,
        selling_price: stockinQueue[0].price,
        warranty_months: stockinQueue[0].warranty
    };

    try {
        const res = await api('/imei', { method: 'POST', body: JSON.stringify(data) });
        if (!res) return;
        const d = await res.json();
        if (!res.ok) throw new Error(d.error);

        const msg = `${d.added || stockinQueue.length} items saved to stock!`;
        toast(msg);
        if (d.errors && d.errors.length) {
            d.errors.forEach(err => toast(err, 'error'));
        }

        // Clear queue
        stockinQueue = [];
        renderStockinTable();
        updateStockinStatus('Batch saved successfully!', 'ok');
        focusStockinScan();
    } catch(e) {
        toast(e.message, 'error');
        updateStockinStatus('Save failed: ' + e.message, 'err');
    }
}

// === CLEANUP on view change ===
function cleanupStockIn() {
    stopStockinFocusLock();
    stockinFocusLock = false;
    const btn = document.getElementById('btn-stockin-focus');
    if (btn) {
        btn.classList.remove('btn-danger');
        btn.classList.add('btn-primary');
        btn.innerHTML = '<i class="bx bx-target-lock"></i> Focus';
    }
}
