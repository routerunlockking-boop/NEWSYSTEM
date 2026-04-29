const http = require('http');

async function test() {
    try {
        const loginRes = await fetch('http://localhost:3000/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: 'Admin', password: 'Abc@12345' })
        });
        const loginData = await loginRes.json();
        console.log('Login:', loginData);

        const addRes = await fetch('http://localhost:3000/api/products', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${loginData.token}` },
            body: JSON.stringify({ name: 'TestDel', quantity: 1, price: 10 })
        });
        const addData = await addRes.json();
        console.log('Add:', addData);

        const delRes = await fetch(`http://localhost:3000/api/products/${addData.id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${loginData.token}` }
        });
        const delData = await delRes.text();
        console.log('Del Status:', delRes.status);
        console.log('Del Data:', delData);
    } catch (e) {
         console.error(e);
    }
}
test();
