import { BrowserManager } from './automation/browserManager.js';

async function testScrape5M() {
  const { page } = await BrowserManager.getPage(true, true);
  
  console.log('Navigating to https://polymarket.com/crypto/5M via BrowserManager...');
  await page.goto('https://polymarket.com/crypto/5M', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(4000);

  const links = await page.evaluate(() => {
    const anchors = Array.from(document.querySelectorAll('a[href]'));
    return anchors
      .map(a => ({
        text: a.textContent?.trim() || '',
        href: a.getAttribute('href') || ''
      }))
      .filter(item => item.href.includes('/event/') || item.href.includes('/market/') || item.text.toLowerCase().includes('btc') || item.text.toLowerCase().includes('up'));
  });

  console.log('FOUND LINKS ON /crypto/5M:', JSON.stringify(links, null, 2));

  await BrowserManager.close();
}

testScrape5M().catch(console.error);
