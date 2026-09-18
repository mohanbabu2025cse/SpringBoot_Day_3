// Run against the isolated test server, never a production database.
// PLAYWRIGHT_PACKAGE may point to an existing Playwright package directory.
const { chromium } = require(process.env.PLAYWRIGHT_PACKAGE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const baseURL = process.env.MENU_TEST_URL || 'http://localhost:8082';
const output = path.resolve('target/ui-check');
fs.mkdirSync(output, { recursive: true });

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chromium' });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const createdIds = new Set();
  const dishes = [
    ['Burrata & roasted tomatoes', '325', 'Starters', 'Creamy burrata, slow-roasted tomatoes and fresh basil.'],
    ['Wild mushroom risotto', '395', 'Main course', 'Arborio rice, forest mushrooms and shaved parmesan.'],
    ['Dark chocolate fondant', '245', 'Desserts', 'A warm chocolate center with a delicate cocoa finish.'],
    ['Peach & basil cooler', '165', 'Beverages', 'Summer peach, hand-torn basil and a splash of soda.'],
    ['Herb-roasted potatoes', '185', 'Sides', 'Crisp golden potatoes, rosemary and flaky sea salt.'],
    ['Roasted pumpkin ravioli', '365', 'Main course', 'Pillowy pasta, sweet pumpkin and a brown butter sauce.']
  ];
  const api = async (method, route, data) => {
    const response = await page.request.fetch(baseURL + '/api/order' + route, { method, data });
    assert.ok(response.ok(), 'API ' + method + ' ' + route + ': ' + response.status());
    return response.status() === 204 ? null : response.json();
  };
  try {
    await page.goto(baseURL);
    await page.locator('#sync-status').filter({ hasText: 'Up to date' }).waitFor();
    assert.equal((await api('GET', '/foods')).length, 0, 'Run this suite against an empty, isolated test database.');
    for (const [name, price, category, description] of dishes) {
      await page.locator('#add-top').click();
      await page.locator('#foodname').fill(name);
      await page.locator('#price').fill(price);
      await page.locator('#category').selectOption(category);
      await page.locator('#description').fill(description);
      const saved = page.waitForResponse(response => response.url().endsWith('/api/order/addFood') && response.request().method() === 'POST');
      await page.locator('#save-button').click();
      const record = await (await saved).json();
      createdIds.add(record.id);
      await page.locator('#food-dialog').waitFor({ state: 'hidden' });
      await page.locator('#food-list .food-card').filter({ hasText: name }).waitFor();
    }
    console.log('PASS: Insert six dishes through the form and display returned records.');
    await page.reload();
    await page.locator('#sync-status').filter({ hasText: 'Up to date' }).waitFor();
    assert.equal(await page.locator('#food-list .food-card').count(), 6);
    console.log('PASS: Saved dishes persist across reload.');

    const target = page.locator('#food-list .food-card').filter({ hasText: 'Wild mushroom risotto' });
    await target.getByRole('button', { name: 'Edit Wild mushroom risotto', exact: true }).click();
    assert.equal(await page.locator('#price').inputValue(), '395');
    await page.locator('#foodname').fill('Truffle mushroom risotto');
    await page.locator('#price').fill('425.50');
    await page.locator('#description').fill('Creamy arborio rice, wild mushrooms and fragrant truffle.');
    await page.locator('#available').uncheck();
    await page.locator('#save-button').click();
    await page.locator('#food-dialog').waitFor({ state: 'hidden' });
    const changed = page.locator('#food-list .food-card').filter({ hasText: 'Truffle mushroom risotto' });
    await changed.waitFor();
    assert.ok((await changed.textContent()).includes('425.50'));
    assert.equal(await changed.getByRole('switch').getAttribute('aria-checked'), 'false');
    await page.reload();
    await page.locator('#sync-status').filter({ hasText: 'Up to date' }).waitFor();
    assert.equal(await changed.count(), 1);
    console.log('PASS: Update name, price, description and availability, including persistence.');

    await page.locator('[data-filter="unavailable"]').click();
    assert.equal(await page.locator('#food-list .food-card').count(), 1);
    await page.locator('[data-filter="all"]').click();
    await page.locator('#category-filter').selectOption('Desserts');
    assert.equal(await page.locator('#food-list .food-card').count(), 1);
    await page.locator('#search').fill('no such dish');
    assert.equal(await page.locator('#empty').isVisible(), true);
    await page.locator('#clear-filters').click();
    await page.locator('#search').fill('truffle');
    assert.equal(await page.locator('#food-list .food-card').count(), 1);
    await page.locator('#search').fill('');
    await page.locator('#sort').selectOption('price');
    assert.ok((await page.locator('#food-list .food-card').first().textContent()).includes('Peach & basil cooler'));
    console.log('PASS: Search, availability/category filters, clearing filters and price sort.');

    await page.locator('#table-view').click();
    assert.equal(await page.locator('#food-table tr').count(), 6);
    const truffleRow = page.locator('#food-table tr').filter({ hasText: 'Truffle mushroom risotto' });
    await truffleRow.getByRole('switch').click();
    await page.waitForFunction(() => document.querySelector('#available-count').textContent === '6');
    await page.reload();
    await page.locator('#sync-status').filter({ hasText: 'Up to date' }).waitFor();
    assert.equal(await page.locator('#table-wrapper').isVisible(), true);
    assert.equal(await truffleRow.getByRole('switch').getAttribute('aria-checked'), 'true');
    await page.screenshot({ path: path.join(output, 'table-desktop.png'), fullPage: true });
    console.log('PASS: Table view and inline availability update persist.');

    const download = page.waitForEvent('download');
    await page.locator('#export').click();
    const downloaded = await download;
    await downloaded.saveAs(path.join(output, downloaded.suggestedFilename()));
    const csv = fs.readFileSync(path.join(output, 'food-studio-menu.csv'), 'utf8');
    assert.ok(csv.includes('Truffle mushroom risotto'));
    assert.ok(csv.includes('425.5'));
    console.log('PASS: CSV export contains saved menu data.');

    await page.locator('#grid-view').click();
    await page.locator('#sort').selectOption('newest');
    await page.locator('.dismiss-notice').click();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: path.join(output, 'menu-desktop.png'), fullPage: true });
    await page.locator('#add-top').click();
    await page.screenshot({ path: path.join(output, 'create-dialog.png'), fullPage: true });
    await page.locator('#foodname').fill('   ');
    await page.locator('#price').fill('10');
    await page.locator('#save-button').click();
    assert.equal(await page.locator('#foodname').evaluate(input => input.validity.valid), false);
    await page.locator('#cancel-dialog').click();
    console.log('PASS: Whitespace-only names rejected in browser.');

    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: path.join(output, 'menu-mobile.png'), fullPage: true });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'Mobile page should not overflow horizontally');
    await page.locator('#add-top').click();
    await page.screenshot({ path: path.join(output, 'create-mobile.png'), fullPage: true });
    await page.locator('#cancel-dialog').click();
    console.log('PASS: Mobile layout fits viewport and dish dialog opens.');

    await page.setViewportSize({ width: 1440, height: 1100 });
    const deleteTarget = page.locator('#food-list .food-card').filter({ hasText: 'Dark chocolate fondant' });
    await deleteTarget.getByRole('button', { name: 'Delete Dark chocolate fondant', exact: true }).click();
    await page.locator('#cancel-delete').click();
    assert.equal(await deleteTarget.count(), 1);
    await deleteTarget.getByRole('button', { name: 'Delete Dark chocolate fondant', exact: true }).click();
    await page.locator('#confirm-delete').click();
    await page.locator('#delete-dialog').waitFor({ state: 'hidden' });
    assert.equal(await deleteTarget.count(), 0);
    await page.reload();
    await page.locator('#sync-status').filter({ hasText: 'Up to date' }).waitFor();
    assert.equal(await deleteTarget.count(), 0);
    const remaining = await api('GET', '/foods');
    const remainingIds = new Set(remaining.map(item => item.id));
    for (const id of createdIds) if (!remainingIds.has(id)) createdIds.delete(id);
    console.log('PASS: Delete confirmation, cancellation and persistent deletion.');

    await page.route('**/api/order/foods', route => route.fulfill({ status: 503, body: '{}' }));
    await page.locator('#refresh').click();
    await page.locator('#load-error').waitFor();
    await page.unroute('**/api/order/foods');
    await page.locator('#retry').click();
    await page.locator('#sync-status').filter({ hasText: 'Up to date' }).waitFor();
    assert.equal(await page.locator('#load-error').isVisible(), false);
    console.log('PASS: Failed load has a working retry.');
    assert.deepEqual(errors, [], 'No browser JavaScript errors');
    console.log('PASS: No JavaScript runtime errors. Screenshots: ' + output);
  } finally {
    for (const id of createdIds) await page.request.delete(baseURL + '/api/order/foods/' + id);
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
