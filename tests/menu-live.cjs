// Live checks use only a newly created temporary record for update/delete.
// Pass --add-dishes to retain the sample menu requested by the user.
const { chromium } = require(process.env.PLAYWRIGHT_PACKAGE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const base = process.env.MENU_TEST_URL || 'http://localhost:8080';
const output = path.resolve('target/live-verification');
const retainDishes = process.argv.includes('--add-dishes');
fs.mkdirSync(output, { recursive: true });
const sampleDishes = [
  { foodname: 'Paneer Tikka', price: 229, category: 'Starters', description: 'Smoky paneer cubes marinated in yogurt and spices, served with mint chutney.' },
  { foodname: 'Crispy Chilli Corn', price: 169, category: 'Starters', description: 'Golden sweet corn tossed with peppers, spring onions and a tangy chilli glaze.' },
  { foodname: 'Paneer Butter Masala', price: 279, category: 'Main course', description: 'Soft paneer in a creamy tomato gravy, finished with butter and kasuri methi.' },
  { foodname: 'Vegetable Dum Biryani', price: 249, category: 'Main course', description: 'Fragrant basmati rice layered with seasonal vegetables, herbs and aromatic spices.' },
  { foodname: 'Garlic Butter Naan', price: 69, category: 'Sides', description: 'Soft tandoor-style flatbread brushed with garlic butter and fresh coriander.' },
  { foodname: 'Peri Peri Fries', price: 129, category: 'Sides', description: 'Crispy potato fries dusted with peri peri seasoning, served with a creamy dip.' },
  { foodname: 'Gulab Jamun', price: 99, category: 'Desserts', description: 'Two soft golden dumplings soaked in warm cardamom and rose syrup.' },
  { foodname: 'Chocolate Brownie', price: 159, category: 'Desserts', description: 'A rich chocolate brownie with a fudgy center and a crisp, delicate top.' },
  { foodname: 'Mango Lassi', price: 119, category: 'Beverages', description: 'A chilled blend of ripe mango and creamy yogurt with a touch of cardamom.' },
  { foodname: 'Classic Cold Coffee', price: 139, category: 'Beverages', description: 'Smooth coffee blended with chilled milk and ice, finished with a light foam.' }
].map(item => ({ ...item, available: true }));

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chromium' });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [], passed = [], added = [], temporaryIds = new Set();
  page.on('pageerror', error => errors.push(error.message));
  const pass = message => { passed.push(message); console.log('PASS: ' + message); };
  async function list() {
    const response = await page.request.get(base + '/api/order/foods');
    assert.equal(response.status(), 200);
    return response.json();
  }
  async function ready() {
    await page.locator('#sync-status').filter({ hasText: 'Up to date' }).waitFor();
  }
  const card = id => page.locator('#food-list .food-card[data-id="' + id + '"]');
  const row = id => page.locator('#food-table tr[data-id="' + id + '"]');
  async function create(item, temporary = false) {
    await page.locator('#add-top').click();
    await page.locator('#foodname').fill(item.foodname);
    await page.locator('#price').fill(String(item.price));
    await page.locator('#category').selectOption(item.category);
    await page.locator('#description').fill(item.description);
    await page.locator('#available').setChecked(item.available);
    const response = page.waitForResponse(r => r.url().endsWith('/api/order/addFood') && r.request().method() === 'POST');
    await page.locator('#save-button').click();
    const result = await response;
    assert.equal(result.status(), 200);
    const record = await result.json();
    if (temporary) temporaryIds.add(record.id); else added.push(record);
    await page.locator('#food-dialog').waitFor({ state: 'hidden' });
    assert.equal(await card(record.id).count(), 1);
    return record;
  }
  try {
    await page.goto(base);
    await ready();
    const original = await list();
    assert.equal(await page.locator('#food-list .food-card').count(), original.length);
    pass('Live list matches the database');
    const name = 'Verification dish ' + Date.now();
    const temp = await create({ foodname: name, price: 123.45, category: 'Starters', description: 'Temporary verification record', available: true }, true);
    await page.reload(); await ready();
    assert.equal(await card(temp.id).count(), 1);
    assert.equal((await list()).find(item => item.id === temp.id).price, 123.45);
    pass('Insert through the form persists after reload');

    await card(temp.id).getByRole('button', { name: 'Edit ' + name, exact: true }).click();
    await page.locator('#foodname').fill(name + ' updated');
    await page.locator('#price').fill('234.56');
    await page.locator('#category').selectOption('Desserts');
    await page.locator('#description').fill('Updated verification description');
    await page.locator('#available').uncheck();
    await page.route('**/api/order/foods/' + temp.id, route => route.fulfill({ status: 503, body: '{}' }));
    await page.locator('#save-button').click();
    await page.waitForFunction(() => document.querySelector('#form-status').textContent.length > 0);
    assert.equal(await page.locator('#food-dialog').isVisible(), true);
    assert.equal(await page.locator('#price').inputValue(), '234.56');
    assert.equal((await list()).find(item => item.id === temp.id).price, 123.45);
    await page.unroute('**/api/order/foods/' + temp.id);
    await page.locator('#save-button').click();
    await page.locator('#food-dialog').waitFor({ state: 'hidden' });
    await page.reload(); await ready();
    let saved = (await list()).find(item => item.id === temp.id);
    assert.equal(saved.foodname, name + ' updated');
    assert.equal(saved.price, 234.56);
    assert.equal(saved.category, 'Desserts');
    assert.equal(saved.description, 'Updated verification description');
    assert.equal(saved.available, false);
    pass('Update all fields, retain edits on server error, retry, and verify persistence');

    await page.locator('#search').fill('Updated verification description');
    assert.equal(await page.locator('#food-list .food-card').count(), 1);
    await page.locator('#category-filter').selectOption('Desserts');
    await page.locator('[data-filter="unavailable"]').click();
    assert.equal(await card(temp.id).isVisible(), true);
    await page.locator('[data-filter="available"]').click();
    assert.equal(await page.locator('#empty').isVisible(), true);
    await page.locator('#clear-filters').click();
    for (const sort of ['price', 'price-desc', 'name', 'newest']) {
      await page.locator('#sort').selectOption(sort);
      const ids = await page.locator('#food-list .food-card').evaluateAll(nodes => nodes.map(n => Number(n.dataset.id)));
      const comparator = { price: (a,b) => a.price-b.price, 'price-desc': (a,b) => b.price-a.price, name: (a,b) => a.foodname.localeCompare(b.foodname), newest: (a,b) => b.id-a.id }[sort];
      assert.deepEqual(ids, (await list()).sort(comparator).map(item => item.id));
    }
    pass('Search, category/availability filters, empty state, and all four sort options');

    await page.locator('#table-view').click();
    await row(temp.id).getByRole('switch').click();
    await page.waitForFunction(id => document.querySelector('#food-table tr[data-id="' + id + '"] [role="switch"]').getAttribute('aria-checked') === 'true', temp.id);
    await page.reload(); await ready();
    assert.equal(await page.locator('#table-wrapper').isVisible(), true);
    assert.equal((await list()).find(item => item.id === temp.id).available, true);
    const all = await list();
    assert.equal(await page.locator('#total').textContent(), String(all.length));
    assert.equal(await page.locator('#available-count').textContent(), String(all.filter(i => i.available).length));
    pass('Table view preference, availability switch, and live dashboard totals');

    const downloadPromise = page.waitForEvent('download');
    await page.locator('#export').click();
    const download = await downloadPromise;
    await download.saveAs(path.join(output, 'menu-export.csv'));
    assert.ok(fs.readFileSync(path.join(output, 'menu-export.csv'), 'utf8').includes(name + ' updated'));
    pass('CSV export contains saved data');
    await page.locator('#grid-view').click();
    await page.locator('#add-top').click();
    await page.locator('#foodname').fill('   ');
    await page.locator('#price').fill('10');
    await page.locator('#save-button').click();
    assert.equal(await page.locator('#foodname').evaluate(el => el.validity.valid), false);
    await page.locator('#foodname').fill('Invalid price');
    await page.locator('#price').fill('-1');
    assert.equal(await page.locator('#price').evaluate(el => el.validity.valid), false);
    await page.locator('#cancel-dialog').click();
    pass('Blank-name and negative-price validation');

    await card(temp.id).getByRole('button', { name: 'Delete ' + name + ' updated', exact: true }).click();
    await page.locator('#cancel-delete').click();
    assert.ok((await list()).some(item => item.id === temp.id));
    await card(temp.id).getByRole('button', { name: 'Delete ' + name + ' updated', exact: true }).click();
    await page.route('**/api/order/foods/' + temp.id, route => route.fulfill({ status: 503, body: '{}' }));
    await page.locator('#confirm-delete').click();
    await page.waitForFunction(() => document.querySelector('#delete-status').textContent.length > 0);
    assert.equal(await page.locator('#delete-dialog').isVisible(), true);
    assert.ok((await list()).some(item => item.id === temp.id));
    await page.unroute('**/api/order/foods/' + temp.id);
    await page.locator('#confirm-delete').click();
    await page.locator('#delete-dialog').waitFor({ state: 'hidden' });
    await page.reload(); await ready();
    assert.ok(!(await list()).some(item => item.id === temp.id));
    assert.equal(await card(temp.id).count(), 0);
    temporaryIds.delete(temp.id);
    pass('Delete cancellation, failed-delete recovery, confirmed deletion and reload');

    await page.route('**/api/order/foods', route => route.fulfill({ status: 503, body: '{}' }));
    await page.locator('#refresh').click();
    await page.locator('#load-error').waitFor();
    await page.unroute('**/api/order/foods');
    await page.locator('#retry').click(); await ready();
    pass('Refresh and failed-load retry');

    if (retainDishes) {
      const names = new Set((await list()).map(item => item.foodname.trim().toLowerCase()));
      for (const dish of sampleDishes) if (!names.has(dish.foodname.toLowerCase())) {
        await create(dish); names.add(dish.foodname.toLowerCase());
      }
      await page.reload(); await ready();
      const persisted = await list();
      for (const item of added) assert.deepEqual(persisted.find(dish => dish.id === item.id), item);
      console.log('ADDED: ' + added.map(dish => dish.foodname).join(', '));
    }
    const finalItems = await list();
    for (const item of original) assert.deepEqual(finalItems.find(dish => dish.id === item.id), item, 'Existing dish preserved: ' + item.id);
    pass('Existing dishes preserved; new dishes verified in database after reload');
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: path.join(output, 'menu-desktop.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: path.join(output, 'menu-mobile.png'), fullPage: true });
    await page.locator('#add-top').click();
    assert.equal(await page.locator('#food-dialog').isVisible(), true);
    await page.locator('#cancel-dialog').click();
    pass('Mobile layout and dialog');
    assert.deepEqual(errors, []);
    pass('No browser JavaScript errors');
    fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({ verifiedAt: new Date().toISOString(), base, passed, added, totalDishes: finalItems.length }, null, 2));
    console.log('COMPLETE: ' + passed.length + ' checks passed; ' + added.length + ' dishes added; total ' + finalItems.length);
  } catch (error) {
    await page.screenshot({ path: path.join(output, 'failure.png'), fullPage: true }).catch(() => {});
    throw error;
  } finally {
    for (const id of temporaryIds) {
      const response = await page.request.delete(base + '/api/order/foods/' + id);
      if (![204,404].includes(response.status())) console.error('Temporary dish requires cleanup:', id);
    }
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
