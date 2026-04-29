const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('BROWSER LOG:', msg.text()));
  
  page.on('dialog', async dialog => {
      console.log('Dialog opened:', dialog.message());
      await dialog.accept();
  });

  await page.goto('http://localhost:3000');
  
  await page.type('#login-email', 'Admin');
  await page.type('#login-password', 'Abc@12345');
  await page.click('#login-form button[type="submit"]');
  await new Promise(r => setTimeout(r, 1000));
  
  await page.click('a[data-target="inventory-view"]');
  await new Promise(r => setTimeout(r, 1000));
  
  // Expose the product array length before deleting
  const lengthBefore = await page.evaluate(() => products.length);
  console.log('Products length before:', lengthBefore);
  
  console.log('Clicking delete button...');
  // Find button by specific data-name or just the last one
  await page.evaluate(() => {
     const btns = document.querySelectorAll('.del-btn');
     if(btns.length > 0) btns[btns.length - 1].click();
  });
  
  await new Promise(r => setTimeout(r, 2000));
  
  const lengthAfter = await page.evaluate(() => products.length);
  console.log('Products length after:', lengthAfter);
  
  const html = await page.evaluate(() => document.querySelector('#inventory-table tbody').innerHTML);
  console.log('Final tbody html:', html);
  
  await browser.close();
})();
