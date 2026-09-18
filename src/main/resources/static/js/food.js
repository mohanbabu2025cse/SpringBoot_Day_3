'use strict';

const $ = id => document.getElementById(id);
const currency = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 });
const categories = { 'Main course': 'dish', Starters: 'leaf', Desserts: 'cake', Beverages: 'cup', Sides: 'leaf' };
const state = { items: [], filter: 'all', view: 'grid', loaded: false, loading: false, mutating: false, editingId: null, deletingId: null };
const dialog = $('food-dialog');
const form = $('food-form');
let lastTrigger = null;
try { state.view = localStorage.getItem('food-studio-view') === 'table' ? 'table' : 'grid'; } catch { /* Storage is optional. */ }

function element(tag, className, text = '') {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  return node;
}
function icon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'icon');
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', '#i-' + name);
  svg.append(use);
  return svg;
}
function actionButton(label, iconName, className, handler) {
  const button = element('button', className);
  button.type = 'button';
  button.append(icon(iconName), document.createTextNode(label));
  button.addEventListener('click', handler);
  return button;
}
async function request(path, options = {}) {
  let response;
  try { response = await fetch('/api/order' + path, { ...options, signal: AbortSignal.timeout(20000) }); }
  catch (error) {
    if (error.name === 'TimeoutError') throw new Error('The request timed out. Refresh the menu to check whether your change was saved before trying again.');
    throw new Error('Could not connect to the server. Check that the application and its database are running, then try again.');
  }
  if (!response.ok) {
    if (response.status === 404) throw new Error('This dish no longer exists. Refresh the collection to see the latest menu.');
    if (response.status === 400) throw new Error('Check the dish name, category, and price. Use a price between ₹0.01 and ₹999,999.99 with at most two decimal places.');
    throw new Error('Your request could not be completed. Please try again in a moment.');
  }
  return response.status === 204 ? null : response.json();
}
function normalize(item) {
  return { ...item, category: categories[item.category] ? item.category : 'Main course', description: item.description || '' };
}
function notice(message, error = false) {
  const region = $('notice');
  region.replaceChildren();
  region.className = 'notice' + (error ? ' error' : '');
  if (!message) return;
  const dismiss = actionButton('', 'close', 'dismiss-notice', () => notice(''));
  dismiss.setAttribute('aria-label', 'Dismiss message');
  region.append(icon(error ? 'clock' : 'check'), element('span', '', message), dismiss);
}
function setBusy(busy) {
  state.mutating = busy;
  document.querySelectorAll('.card-actions button, .availability-button').forEach(button => button.disabled = busy);
  $('refresh').disabled = busy || state.loading;
  $('export').disabled = busy || !state.loaded || state.items.length === 0;
}
function matches() {
  const term = $('search').value.trim().toLowerCase();
  const category = $('category-filter').value;
  const result = state.items.filter(item =>
    (item.foodname + ' ' + item.description).toLowerCase().includes(term)
    && (category === 'all' || item.category === category)
    && (state.filter === 'all' || (state.filter === 'available' ? item.available : !item.available)));
  const comparators = {
    newest: (a, b) => b.id - a.id,
    name: (a, b) => a.foodname.localeCompare(b.foodname),
    price: (a, b) => a.price - b.price,
    'price-desc': (a, b) => b.price - a.price
  };
  return result.sort(comparators[$('sort').value]);
}
function availabilityControl(item) {
  const button = element('button', 'availability-button' + (item.available ? '' : ' off'));
  button.type = 'button';
  button.setAttribute('role', 'switch');
  button.setAttribute('aria-checked', String(item.available));
  button.setAttribute('aria-label', 'Availability of ' + item.foodname);
  const track = element('span', 'mini-switch');
  track.setAttribute('aria-hidden', 'true');
  button.append(track, document.createTextNode(item.available ? 'Available' : 'Unavailable'));
  button.disabled = state.mutating;
  button.addEventListener('click', () => toggleAvailability(item));
  return button;
}
function actions(item) {
  const group = element('div', 'card-actions');
  const edit = actionButton('Edit', 'edit', 'edit-button', event => openForm(item, event.currentTarget));
  edit.setAttribute('aria-label', 'Edit ' + item.foodname);
  const remove = actionButton('Delete', 'trash', 'delete-button', event => openDelete(item, event.currentTarget));
  remove.setAttribute('aria-label', 'Delete ' + item.foodname);
  edit.disabled = remove.disabled = state.mutating;
  group.append(edit, remove);
  return group;
}
function card(item) {
  const article = element('article', 'food-card');
  article.dataset.id = item.id;
  const art = element('div', 'card-art category-' + item.category.replaceAll(' ', '-'));
  art.setAttribute('aria-hidden', 'true');
  const emblem = element('span', 'dish-emblem');
  emblem.append(icon(categories[item.category]));
  art.append(element('span', 'card-number', 'NO. ' + String(item.id).padStart(3, '0')), emblem, element('span', 'card-category', item.category));
  const body = element('div', 'card-body');
  const title = element('h3', '', item.foodname);
  const description = element('p', 'card-description', item.description || 'A little something from your kitchen, made with care.');
  description.title = item.description;
  const price = element('p', 'card-price', currency.format(item.price));
  price.append(element('small', '', '/ serving'));
  const bottom = element('div', 'card-bottom');
  bottom.append(availabilityControl(item), actions(item));
  body.append(title, description, price, bottom);
  article.append(art, body);
  return article;
}
function tableRow(item) {
  const row = document.createElement('tr');
  row.dataset.id = item.id;
  const nameCell = document.createElement('td');
  const dish = element('div', 'table-dish');
  const emblem = element('span', 'table-dish-icon');
  emblem.append(icon(categories[item.category]));
  const text = element('div', '');
  text.append(element('strong', '', item.foodname), element('small', '', item.description || 'Dish #' + item.id));
  dish.append(emblem, text); nameCell.append(dish);
  const categoryCell = document.createElement('td'); categoryCell.append(element('span', 'category-tag', item.category));
  const priceCell = element('td', 'table-price', currency.format(item.price));
  const availabilityCell = document.createElement('td'); availabilityCell.append(availabilityControl(item));
  const actionCell = document.createElement('td'); actionCell.append(actions(item));
  row.append(nameCell, categoryCell, priceCell, availabilityCell, actionCell);
  return row;
}
function render() {
  const count = state.items.length;
  const available = state.items.filter(item => item.available).length;
  $('total').textContent = state.loaded ? count : '—';
  $('available-count').textContent = state.loaded ? available : '—';
  $('unavailable-count').textContent = state.loaded ? count - available : '—';
  $('average-price').textContent = state.loaded ? currency.format(count ? state.items.reduce((sum, item) => sum + item.price, 0) / count : 0) : '—';
  $('nav-count').textContent = count;
  $('menu-count').textContent = count + (count === 1 ? ' dish' : ' dishes');
  $('all-tab-count').textContent = count;
  $('available-tab-count').textContent = available;
  $('unavailable-tab-count').textContent = count - available;
  const visible = matches();
  $('food-list').replaceChildren(...visible.map(card));
  $('food-table').replaceChildren(...visible.map(tableRow));
  $('food-list').hidden = state.view !== 'grid' || !state.loaded || state.loading;
  $('table-wrapper').hidden = state.view !== 'table' || !state.loaded || state.loading || visible.length === 0;
  $('empty').hidden = !state.loaded || state.loading || visible.length > 0;
  const filtered = $('search').value.trim() || state.filter !== 'all' || $('category-filter').value !== 'all';
  $('empty-title').textContent = filtered ? 'Nothing on this part of the menu.' : 'Your first signature dish awaits.';
  $('empty-copy').textContent = filtered ? 'Try another search or clear your filters to see the full collection.' : 'Turn a good idea into something delicious. Add your first dish to get your collection started.';
  $('empty-add').hidden = Boolean(filtered);
  $('clear-filters').hidden = !filtered;
  $('results-count').textContent = state.loaded ? 'Showing ' + visible.length + ' of ' + count + (count === 1 ? ' dish' : ' dishes') : 'Menu not loaded';
  for (const view of ['grid', 'table']) {
    $(view + '-view').classList.toggle('selected', state.view === view);
    $(view + '-view').setAttribute('aria-pressed', String(state.view === view));
  }
  document.querySelectorAll('[data-filter]').forEach(button => {
    button.classList.toggle('selected', button.dataset.filter === state.filter);
    button.setAttribute('aria-pressed', String(button.dataset.filter === state.filter));
  });
  for (const [id, filter] of [['nav-menu', 'all'], ['nav-available', 'available'], ['nav-unavailable', 'unavailable']]) {
    $(id).classList.toggle('active', state.filter === filter);
  }
  $('export').disabled = !state.loaded || count === 0 || state.mutating;
}
async function load() {
  if (state.loading || state.mutating) return;
  state.loading = true;
  $('refresh').disabled = true;
  $('loading').hidden = false;
  $('load-error').hidden = true;
  $('empty').hidden = true;
  $('food-list').hidden = $('table-wrapper').hidden = true;
  $('sync-status').textContent = 'Syncing menu…';
  try {
    state.items = (await request('/foods')).map(normalize);
    state.loaded = true;
    $('sync-status').replaceChildren(element('i', 'status-dot'), document.createTextNode('Up to date'));
  } catch (error) {
    state.loaded = false;
    $('load-error').hidden = false;
    $('load-error-copy').textContent = error.message;
    $('sync-status').textContent = 'Connection unavailable';
  } finally {
    state.loading = false;
    $('loading').hidden = true;
    $('refresh').disabled = false;
    render();
  }
}
function setFilter(filter, scroll = false) {
  state.filter = filter;
  render();
  if (scroll) $('collection').scrollIntoView({ behavior: 'smooth' });
}
function resetFilters() {
  state.filter = 'all';
  $('search').value = '';
  $('category-filter').value = 'all';
}
function openForm(item, trigger) {
  if (state.mutating) return;
  lastTrigger = trigger || document.activeElement;
  form.reset();
  state.editingId = item ? item.id : null;
  $('form-title').textContent = item ? 'Make it even better.' : 'Create a new dish.';
  $('form-intro').textContent = item ? 'Update the details, then save your changes.' : 'The details that make something delicious.';
  $('save-button').replaceChildren(document.createTextNode(item ? 'Save changes' : 'Create dish'), icon('arrow'));
  $('form-status').textContent = '';
  $('foodname').setCustomValidity('');
  if (item) {
    $('foodname').value = item.foodname;
    $('price').value = item.price;
    $('category').value = item.category;
    $('description').value = item.description;
    $('available').checked = item.available;
  }
  updateDescriptionCount();
  dialog.showModal();
  $('foodname').focus();
}
function updateDescriptionCount() { $('description-count').textContent = $('description').value.length + ' / 500'; }
function restoreFocus() { if (lastTrigger && lastTrigger.isConnected) lastTrigger.focus(); else $('add-top').focus(); }
function closeForm() { if (!state.mutating) { dialog.close(); restoreFocus(); } }
function openDelete(item, trigger) {
  if (state.mutating) return;
  lastTrigger = trigger;
  state.deletingId = item.id;
  $('delete-copy').textContent = '“' + item.foodname + '” will be removed from your menu.';
  $('delete-status').textContent = '';
  $('delete-dialog').showModal();
  $('cancel-delete').focus();
}
async function toggleAvailability(item) {
  if (state.mutating || state.loading) return;
  setBusy(true);
  try {
    const saved = normalize(await request('/foods/' + item.id, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...item, available: !item.available })
    }));
    state.items = state.items.map(existing => existing.id === saved.id ? saved : existing);
    render();
    notice(saved.foodname + (saved.available ? ' is ready to serve.' : ' is now marked unavailable.'));
  } catch (error) { notice(error.message, true); }
  finally { setBusy(false); }
}
form.addEventListener('submit', async event => {
  event.preventDefault();
  if (state.mutating) return;
  if (state.loading) { $('form-status').textContent = 'Please wait until the menu finishes loading.'; return; }
  const foodname = $('foodname').value.trim();
  if (!foodname) { $('foodname').setCustomValidity('Please enter a dish name.'); $('foodname').reportValidity(); return; }
  const payload = { foodname, price: Number($('price').value), category: $('category').value, description: $('description').value.trim(), available: $('available').checked };
  const editing = state.editingId !== null;
  setBusy(true);
  Array.from(form.elements).forEach(control => control.disabled = true);
  $('close-dialog').disabled = true;
  $('save-button').textContent = 'Saving…';
  $('form-status').textContent = '';
  try {
    const saved = normalize(await request(editing ? '/foods/' + state.editingId : '/addFood', {
      method: editing ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
    }));
    if (editing) state.items = state.items.map(item => item.id === saved.id ? saved : item);
    else state.items.push(saved);
    resetFilters();
    $('sort').value = 'newest';
    dialog.close();
    // Re-fetch the full collection if the initial load failed, rather than showing a partial list.
    setBusy(false);
    if (!state.loaded) await load(); else render();
    notice(foodname + (editing ? ' has been updated.' : ' has been added to your collection.'));
    $('collection').scrollIntoView({ behavior: 'smooth' });
    restoreFocus();
  } catch (error) { $('form-status').textContent = error.message; }
  finally {
    setBusy(false);
    Array.from(form.elements).forEach(control => control.disabled = false);
    $('close-dialog').disabled = false;
    $('save-button').replaceChildren(document.createTextNode(editing ? 'Save changes' : 'Create dish'), icon('arrow'));
  }
});
$('confirm-delete').addEventListener('click', async () => {
  if (state.mutating || state.loading) return;
  setBusy(true);
  $('confirm-delete').disabled = $('cancel-delete').disabled = true;
  $('confirm-delete').textContent = 'Deleting…';
  $('delete-status').textContent = '';
  try {
    await request('/foods/' + state.deletingId, { method: 'DELETE' });
    state.items = state.items.filter(item => item.id !== state.deletingId);
    render();
    $('delete-dialog').close();
    notice('Dish deleted. Your collection is up to date.');
    restoreFocus();
  } catch (error) { $('delete-status').textContent = error.message; }
  finally { setBusy(false); $('confirm-delete').disabled = $('cancel-delete').disabled = false; $('confirm-delete').textContent = 'Yes, delete dish'; }
});
$('export').addEventListener('click', () => {
  const csvCell = value => {
    let text = String(value);
    if (/^[\s]*[=+@-]/.test(text)) text = "'" + text;
    return '"' + text.replaceAll('"', '""') + '"';
  };
  const rows = [['ID', 'Dish', 'Category', 'Price (INR)', 'Available', 'Description'], ...state.items.map(item => [item.id, item.foodname, item.category, item.price, item.available ? 'Yes' : 'No', item.description])];
  const url = URL.createObjectURL(new Blob(['\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = 'food-studio-menu.csv'; document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  notice('Your menu has been exported.');
});
for (const id of ['add-top', 'sidebar-add', 'tip-add', 'hero-add', 'empty-add']) $(id).addEventListener('click', event => openForm(null, event.currentTarget));
for (const id of ['close-dialog', 'cancel-dialog']) $(id).addEventListener('click', closeForm);
$('cancel-delete').addEventListener('click', () => { if (!state.mutating) { $('delete-dialog').close(); restoreFocus(); } });
for (const modal of [dialog, $('delete-dialog')]) modal.addEventListener('cancel', event => { if (state.mutating) event.preventDefault(); });
$('foodname').addEventListener('input', () => $('foodname').setCustomValidity(''));
$('description').addEventListener('input', updateDescriptionCount);
for (const id of ['search', 'category-filter', 'sort']) $(id).addEventListener(id === 'search' ? 'input' : 'change', render);
for (const id of ['refresh', 'retry']) $(id).addEventListener('click', load);
$('clear-filters').addEventListener('click', () => { resetFilters(); render(); });
document.querySelectorAll('[data-filter]').forEach(button => button.addEventListener('click', () => setFilter(button.dataset.filter)));
$('nav-menu').addEventListener('click', event => { event.preventDefault(); resetFilters(); setFilter('all', true); });
$('nav-available').addEventListener('click', () => { resetFilters(); setFilter('available', true); });
$('nav-unavailable').addEventListener('click', () => { resetFilters(); setFilter('unavailable', true); });
for (const view of ['grid', 'table']) $(view + '-view').addEventListener('click', () => {
  state.view = view;
  try { localStorage.setItem('food-studio-view', view); } catch { /* Storage is optional. */ }
  render();
});
document.addEventListener('keydown', event => {
  if (event.key === '/' && !event.ctrlKey && !event.metaKey && !dialog.open && !$('delete-dialog').open && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) {
    event.preventDefault(); $('search').focus(); $('collection').scrollIntoView({ behavior: 'smooth' });
  }
});
$('today').textContent = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date());
render();
load();
