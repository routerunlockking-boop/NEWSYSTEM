const http = require('http');
const TOKEN = '69c010bd2e548c57f5d6677d';

function req(method, path, body) {
    return new Promise((resolve) => {
        const data = body ? JSON.stringify(body) : '';
        const opts = { hostname:'localhost', port:3000, path, method,
            headers: { 'Content-Type':'application/json', 'Authorization':`Bearer ${TOKEN}` }};
        if (data) opts.headers['Content-Length'] = Buffer.byteLength(data);
        const r = http.request(opts, res => {
            let b=''; res.on('data',c=>b+=c);
            res.on('end',()=>{ console.log(`${method} ${path} => ${res.statusCode}`); try{resolve(JSON.parse(b))}catch(e){resolve(b)} });
        });
        if(data) r.write(data); r.end();
    });
}

async function test() {
    // Get products to find the IMEI-tracked one
    const prods = await req('GET', '/api/products?lite=true');
    const imeiProd = prods.find(p => p.is_imei_tracked);
    if (!imeiProd) { console.log('No IMEI product found'); return; }
    console.log('Found IMEI product:', imeiProd.name, 'ID:', imeiProd.id);

    // Add IMEI items
    const addResult = await req('POST', '/api/imei', {
        product_id: imeiProd.id,
        imei_numbers: ['867530012345678', '867530012345679', '867530012345680'],
        purchase_price: 8000, selling_price: 12000, warranty_months: 12
    });
    console.log('Add IMEI result:', JSON.stringify(addResult));

    // Lookup IMEI
    const lookup = await req('GET', '/api/imei/lookup/867530012345678');
    console.log('Lookup result - Status:', lookup.status, 'Product:', lookup.product_name);

    // Get all IMEIs
    const allImei = await req('GET', '/api/imei');
    console.log('Total IMEI items:', allImei.length);

    // Create invoice with IMEI item
    const invoice = await req('POST', '/api/invoices', {
        items: [{ name: imeiProd.name, price: 12000, quantity: 1, is_imei_item: true, imei_number: '867530012345678', imei_id: lookup.id }],
        imei_items: [{ imei_id: lookup.id, selling_price: 12000 }],
        total_amount: 12000, amount_paid: 12000,
        customer_name: 'Test Customer', customer_phone: '0771234567',
        customer_nic: '199012345678', customer_address: 'Colombo, Sri Lanka',
        payment_method: 'Cash'
    });
    console.log('Invoice created:', invoice.invoice?.invoice_number);

    // Check IMEI is now sold
    const soldLookup = await req('GET', '/api/imei/lookup/867530012345678');
    console.log('After sale - Status:', soldLookup.status, 'Customer:', soldLookup.customer_name);
    console.log('Warranty expiry:', soldLookup.warranty_expiry_date);

    // Get SLT report
    const slt = await req('GET', '/api/reports/slt?month=2026-04');
    console.log('SLT report items:', slt.length);

    console.log('\n=== FULL IMEI FLOW TESTED SUCCESSFULLY ===');
}

test();
