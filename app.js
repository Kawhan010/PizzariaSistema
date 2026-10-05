import { SIZES, GROUPS, SOURCES, quotePizza as catalogPizza, quoteProduct as catalogProduct } from './catalog.js';
const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const TIMEZONE = 'America/Sao_Paulo';
const money = cents => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
const dateKey = date => new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(date));
const escapeHTML = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const icon = name => '<svg class="icon" aria-hidden="true"><use href="#i-' + name + '"/></svg>';
const todayKey = () => dateKey(new Date());
const normalizeSearch = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').trim();
const stages = {
  received: { label: 'Recebido', action: 'Preparar' }, preparing: { label: 'Em preparo', action: 'Pronto' },
  ready: { label: 'Pronto', action: 'Entregar' }, delivering: { label: 'Em entrega', action: 'Entregue' },
  served: { label: 'Servido · a pagar' }, completed: { label: 'Pago / concluído' }, cancelled: { label: 'Cancelado' }
};
const types = { table: { label: 'Mesa', icon: 'table' }, delivery: { label: 'Entrega', icon: 'truck' }, pickup: { label: 'Retirada', icon: 'bag' } };
const roleLabels = { owner: 'Proprietário', waiter: 'Garçom', kitchen: 'Cozinha', cashier: 'Caixa' };
const payments = { pix: 'Pix', card: 'Cartão', cash: 'Dinheiro' };
let state = { orders: [], users: [], settings: { name: 'Pizzaria Dominos', tableCount: 20 }, user: null };
let catalog = [];
const quotePizza = (ids, size) => catalogPizza(ids, size, catalog);
const quoteProduct = (id, variant) => catalogProduct(id, variant, catalog);
let stream, syncTimer, requestId, refreshInFlight, refreshAgain = false;
let lastRenderFingerprint = '';
let moduleView = '', selectedTable = null, submitting = false;
const canPrepare = () => ['owner', 'kitchen'].includes(state.user?.role);
const canServe = () => ['owner', 'waiter', 'cashier'].includes(state.user?.role);
const canPay = () => ['owner', 'cashier'].includes(state.user?.role);
const canCreate = () => ['owner', 'waiter', 'cashier'].includes(state.user?.role);

let activeType = 'all';
let search = '';
let draft = [];
let pickerKind = 'pizza';
let pickerGroup = 'all';
let pickerSearch = '';
let splitFlavors = [];
let catalogKind = 'pizza';
let catalogGroup = 'all';
let catalogSearch = '';
let toastTimer;


function renderStats() {
  const today = state.orders.filter(order => dateKey(order.createdAt) === todayKey());
  const completed = state.orders.filter(order => order.paymentStatus === 'paid' && dateKey(order.paidAt) === todayKey());
  const revenue = completed.reduce((sum, order) => sum + order.total, 0);
  const ongoing = activeOrders();
  const received = ongoing.filter(order => order.status === 'received');
  const stats = [
    { label: 'Pedidos de hoje', value: String(today.length).padStart(2, '0'), icon: 'order', note: `${completed.length} pedidos concluídos` },
    { label: 'Faturamento de hoje', value: money(revenue), icon: 'money', note: 'Pagamentos recebidos hoje' },
    { label: 'Ticket médio', value: money(completed.length ? Math.round(revenue / completed.length) : 0), icon: 'chart', note: 'Por pedido pago' },
    { label: 'Em andamento', value: String(ongoing.length).padStart(2, '0'), icon: 'clock', note: `${received.length} aguardando preparo` }
  ];
  $('#stats').innerHTML = stats.map(stat => `<article class="stat-card"><div class="stat-top"><span>${stat.label}</span><span class="stat-icon">${icon(stat.icon)}</span></div><div class="stat-value">${stat.value}</div><div class="stat-bottom">${icon('arrow')}<span>${stat.note}</span></div></article>`).join('');
}

function renderChart() {
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() - (6 - index));
    const key = dateKey(date);
    const value = state.orders.filter(order => order.paymentStatus === 'paid' && dateKey(order.paidAt) === key).reduce((sum, order) => sum + order.total, 0);
    const label = index === 6 ? 'Hoje' : new Intl.DateTimeFormat('pt-BR', { weekday: 'short', timeZone: TIMEZONE }).format(date).replace('.', '');
    return { label, value };
  });
  const maximum = Math.max(1, ...days.map(day => day.value));
  $('#week-total').textContent = money(days.reduce((sum, day) => sum + day.value, 0));
  $('#sales-chart').innerHTML = days.map(day => `<div class="chart-column" title="${day.label}: ${money(day.value)}"><div class="chart-bar" style="height:${Math.max(3, day.value / maximum * 100)}%"><span class="chart-value">${money(day.value)}</span></div><span class="chart-label">${day.label}</span></div>`).join('');
  $('#sales-chart').setAttribute('aria-label', `Pagamentos recebidos por dia: ${days.map(day => `${day.label}, ${money(day.value)}`).join('; ')}`);
}

function activeOrders() { return state.orders.filter(order => !['completed', 'cancelled'].includes(order.status)); }
function renderOperation() {
  const ongoing = activeOrders();
  $('#nav-order-count').textContent = ongoing.length;
  $('#active-order-count').textContent = ongoing.length;
  const labels = { received: 'Recebidos', preparing: 'Em preparo', ready: 'Prontos', served: 'Aguardando pagamento' };
  $('#operation-list').innerHTML = Object.entries(labels).map(([status, label]) => {
    const count = ongoing.filter(order => order.status === status).length;
    return `<div class="operation-row"><span class="stage-dot stage-${status}"></span><span class="stage-label">${label}</span><div class="operation-progress"><span style="width:${ongoing.length ? count / ongoing.length * 100 : 0}%"></span></div><strong>${count}</strong></div>`;
  }).join('');
  $('#operation-summary').textContent = `${ongoing.length} ${ongoing.length === 1 ? 'pedido em andamento' : 'pedidos em andamento'}`;
  $('#notification-dot').hidden = !ongoing.some(order => order.status === 'received');
}

function actionFor(order) {
  if ((['received', 'preparing'].includes(order.status) && !canPrepare()) || (['ready', 'delivering'].includes(order.status) && !canServe())) return null;
  if (order.status === 'ready' && order.type === 'table') return 'Servir';
  if (order.status === 'ready' && order.type === 'pickup') return 'Retirado';
  if (order.status === 'served' && canPay()) return order.type === 'table' ? 'Fechar mesa' : 'Receber';
  return stages[order.status].action;
}
function renderOrders() {
  const normalized = search.trim().toLocaleLowerCase('pt-BR');
  const orders = activeOrders().filter(order =>
    (activeType === 'all' || order.type === activeType) &&
    `${order.number} ${order.customer} ${order.table} ${order.items.map(item => item.name).join(' ')}`.toLocaleLowerCase('pt-BR').includes(normalized)
  ).sort((a, b) => b.number - a.number);
  $('#result-count').textContent = `${orders.length} ${orders.length === 1 ? 'pedido' : 'pedidos'}`;
  $('#empty-state').hidden = orders.length > 0;
  $('.table-wrap').hidden = !orders.length;
  $('#order-rows').innerHTML = orders.map(order => {
    const items = order.items.map(item => `${item.quantity}× ${item.name} (${item.variant})`).join(', ');
    const time = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: TIMEZONE }).format(new Date(order.createdAt));
    return `<tr><td><button class="order-id" type="button" data-details="${order.number}" aria-label="Ver detalhes do pedido ${order.number}">#${order.number}</button><span class="order-time">${time}</span></td><td><span class="customer-name">${escapeHTML(order.customer)}</span><span class="order-items" title="${escapeHTML(items)}">${escapeHTML(items)}</span></td><td><span class="type-label">${icon(types[order.type].icon)}${types[order.type].label}</span></td><td><span class="status status-${order.status}">${stages[order.status].label}</span></td><td class="order-money">${money(order.total)}</td><td>${actionFor(order) ? `<button class="advance-button" type="button" data-advance="${order.number}" aria-label="${actionFor(order)} pedido ${order.number}">${actionFor(order)}${icon('arrow')}</button>` : `<button class="text-button" type="button" data-details="${order.number}">Detalhes</button>`}</td></tr>`;
  }).join('');
  $$('.order-tab').forEach(button => {
    const active = button.dataset.type === activeType;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
}
function render() { renderStats(); renderChart(); renderOperation(); renderOrders(); renderKitchen(); if (moduleView && $('#module-dialog').open) renderModule(); }

function toast(message) {
  clearTimeout(toastTimer);
  $('#toast span').textContent = message;
  $('#toast').hidden = false;
  toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 4500);
}
function openNotice(title, content) {
  $('#notice-title').textContent = title;
  $('#notice-content').innerHTML = content;
  $('#notice-dialog').showModal();
  document.body.classList.add('modal-open');
}

$('#order-rows').addEventListener('click', async event => {
  const advance = event.target.closest('[data-advance]');
  if (advance) {
    const order = state.orders.find(item => item.number === Number(advance.dataset.advance));
    if (!order) return;
    if (order.status === 'served') { if (order.type === 'table') openTables(Number(order.table)); else openPayment(order); return; }
    await advanceOrder(order, advance); return;
  }
  const details = event.target.closest('[data-details]');
  if (details) showOrder(Number(details.dataset.details));
});

$$('.order-tab').forEach(button => button.addEventListener('click', () => { activeType = button.dataset.type; renderOrders(); }));
$('#global-search').addEventListener('input', event => { search = event.target.value; renderOrders(); });
$('#clear-search').addEventListener('click', () => { search = ''; activeType = 'all'; $('#global-search').value = ''; renderOrders(); });
document.addEventListener('keydown', event => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
    if ($$('dialog').some(dialog => dialog.open)) return;
    event.preventDefault(); $('#global-search').focus();
  }
});
$('#notifications').addEventListener('click', () => {
  const received = activeOrders().filter(order => order.status === 'received').length;
  const preparing = activeOrders().filter(order => order.status === 'preparing').length;
  openNotice('Resumo da operação', `<p><strong>${received} ${received === 1 ? 'pedido aguarda' : 'pedidos aguardam'} preparo.</strong></p><p>${preparing} ${preparing === 1 ? 'pedido está' : 'pedidos estão'} em preparo.</p><p>Confira a lista de pedidos em andamento para acompanhar as próximas etapas.</p>`);
});
$('.notice-close').addEventListener('click', () => $('#notice-dialog').close());

function closeSidebar() {
  $('#sidebar').classList.remove('open');
  $('#sidebar-scrim').hidden = true;
  $('#menu-toggle').setAttribute('aria-expanded', 'false');
  $('#menu-toggle').setAttribute('aria-label', 'Abrir menu');
}
$('#menu-toggle').addEventListener('click', () => {
  const open = !$('#sidebar').classList.contains('open');
  $('#sidebar').classList.toggle('open', open);
  $('#sidebar-scrim').hidden = !open;
  $('#menu-toggle').setAttribute('aria-expanded', String(open));
  $('#menu-toggle').setAttribute('aria-label', open ? 'Fechar menu' : 'Abrir menu');
});
$('#sidebar-scrim').addEventListener('click', closeSidebar);
$$('.sidebar a').forEach(link => link.addEventListener('click', closeSidebar));
window.matchMedia('(min-width: 801px)').addEventListener('change', event => { if (event.matches) closeSidebar(); });
document.addEventListener('keydown', event => { if (event.key === 'Escape' && $('#sidebar').classList.contains('open')) { closeSidebar(); $('#menu-toggle').focus(); } });

function updateType() {
  const table = $('#order-type').value === 'table';
  $('#table-field').hidden = !table;
  $('#table-number').required = table;
  $('#table-number').disabled = !table;
  $('#customer-field').hidden = table;
  $('#customer-name').required = !table;
  $('#customer-name').disabled = table;
  $('.product-list-title').textContent = table ? 'O que vai para a mesa?' : 'Adicione os sabores';
}

function updateDraft() {
  $('#draft-items').innerHTML = draft.length ? draft.map(line => `<div class="draft-row"><div class="draft-info"><strong>${escapeHTML(line.name)}</strong><small>${escapeHTML(line.variant)} · ${money(line.unitPrice)} cada</small></div><div class="quantity-control"><button type="button" data-line="${escapeHTML(line.key)}" data-delta="-1" aria-label="Diminuir ${escapeHTML(line.name)}">${icon('minus')}</button><output aria-label="Quantidade de ${escapeHTML(line.name)}">${line.quantity}</output><button type="button" data-line="${escapeHTML(line.key)}" data-delta="1" aria-label="Aumentar ${escapeHTML(line.name)}" ${line.quantity >= 99 ? 'disabled' : ''}>${icon('plus')}</button></div><strong class="draft-price">${money(line.quantity * line.unitPrice)}</strong></div>`).join('') : '<p class="draft-empty">Escolha os produtos acima para montar o pedido.</p>';
  const count = draft.reduce((sum, line) => sum + line.quantity, 0);
  $('#draft-count').textContent = `${count} ${count === 1 ? 'item' : 'itens'}`;
  $('#order-total').textContent = money(draft.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0));
}

function filteredCatalog(kind, group, query) {
  const normalized = normalizeSearch(query);
  return catalog.filter(product => product.available !== false && product.kind === kind && (group === 'all' || product.group === group) && normalizeSearch(`${product.name} ${product.description}`).includes(normalized));
}
function renderGroups(selector, kind, selected, attribute) {
  const groups = [...new Set(catalog.filter(product => product.kind === kind).map(product => product.group))];
  $(selector).innerHTML = [{ id: 'all', label: 'Todos' }, ...groups.map(id => ({ id, label: GROUPS[id] }))].map(group => `<button type="button" data-${attribute}="${group.id}" class="${group.id === selected ? 'active' : ''}" aria-pressed="${group.id === selected}">${group.label}</button>`).join('');
}
function renderPicker() {
  $$('[data-picker-kind]').forEach(button => {
    const selected = button.dataset.pickerKind === pickerKind;
    button.classList.toggle('active', selected); button.setAttribute('aria-pressed', String(selected));
  });
  renderGroups('#picker-groups', pickerKind, pickerGroup, 'picker-group');
  $('#pizza-options').hidden = pickerKind !== 'pizza';
  const split = pickerKind === 'pizza' && $('#split-pizza').checked;
  $('#split-summary').hidden = !split;
  if (split) {
    const chosen = splitFlavors.map(id => catalog.find(product => product.id === id));
    $('#split-selection').textContent = chosen.length === 0 ? 'Escolha o primeiro sabor abaixo.' : chosen.length === 1 ? `1º sabor: ${chosen[0].name}. Agora escolha o segundo.` : `${quotePizza(splitFlavors, $('#pizza-size').value).name} · ${money(quotePizza(splitFlavors, $('#pizza-size').value).unitPrice)}`;
    $('#add-split').disabled = splitFlavors.length !== 2;
  }
  const visible = filteredCatalog(pickerKind, pickerGroup, pickerSearch);
  $('#picker-empty').hidden = visible.length > 0;
  $('#product-picker').innerHTML = visible.map(product => {
    const size = $('#pizza-size').value;
    const price = product.kind === 'pizza' ? product.prices[size] : product.variants[0].price;
    const selected = split && splitFlavors.includes(product.id);
    const options = product.kind === 'pizza' ? `<span class="product-variant-label">${SIZES[size].label} · ${SIZES[size].slices} fatias</span>` : product.variants.length === 1 ? `<span class="product-variant-label">${escapeHTML(product.variants[0].label)}</span>` : `<select id="variant-${product.id}" data-variant-price="${product.id}" aria-label="Opção de ${escapeHTML(product.name)}">${product.variants.map(variant => `<option value="${variant.id}">${escapeHTML(variant.label)} · ${money(variant.price)}</option>`).join('')}</select>`;
    return `<div class="catalog-product ${selected ? 'selected' : ''}"><span class="product-symbol">${icon(product.kind === 'pizza' ? 'pizza' : 'bag')}</span><div class="catalog-product-info"><strong>${escapeHTML(product.name)}</strong><small>${escapeHTML(product.description || GROUPS[product.group])}</small>${options}</div><div class="catalog-product-action"><strong id="price-${product.id}">${money(price)}</strong><button type="button" data-add="${product.id}" class="product-add ${selected ? 'selected' : ''}" aria-label="${split ? 'Selecionar sabor' : 'Adicionar'} ${escapeHTML(product.name)}">${icon(selected ? 'check' : 'plus')}</button></div></div>`;
  }).join('');
}
function addLine(quote) {
  const line = draft.find(item => item.key === quote.key);
  if (line) line.quantity = Math.min(99, line.quantity + 1);
  else draft.push({ ...quote, quantity: 1 });
  $('#form-error').hidden = true;
  updateDraft();
}

function renderOfficialCatalog() {
  $$('[data-catalog-kind]').forEach(button => {
    const selected = button.dataset.catalogKind === catalogKind;
    button.classList.toggle('active', selected); button.setAttribute('aria-pressed', String(selected));
  });
  renderGroups('#catalog-groups', catalogKind, catalogGroup, 'catalog-group');
  $('#catalog-rule').hidden = catalogKind !== 'pizza';
  const visible = filteredCatalog(catalogKind, catalogGroup, catalogSearch);
  $('#catalog-empty').hidden = visible.length > 0;
  $('#catalog-list').innerHTML = visible.map(product => {
    const prices = product.kind === 'pizza' ? Object.entries(SIZES).map(([size, info]) => ({ label: info.label, price: product.prices[size] })) : product.variants;
    return `<article class="catalog-entry"><div class="catalog-entry-heading"><h3>${escapeHTML(product.name)}</h3><span>${GROUPS[product.group]}</span></div>${product.description ? `<p>${escapeHTML(product.description)}</p>` : ''}<div class="catalog-price-list">${prices.map(option => `<span><small>${escapeHTML(option.label)}</small><strong>${money(option.price)}</strong></span>`).join('')}</div></article>`;
  }).join('');
}
$('#catalog-nav').addEventListener('click', () => {
  closeSidebar(); catalogKind = 'pizza'; catalogGroup = 'all'; catalogSearch = ''; $('#catalog-search').value = '';
  renderOfficialCatalog(); $('#catalog-dialog').showModal(); document.body.classList.add('modal-open');
});
$('.catalog-close').addEventListener('click', () => $('#catalog-dialog').close());
$$('[data-catalog-kind]').forEach(button => button.addEventListener('click', () => { catalogKind = button.dataset.catalogKind; catalogGroup = 'all'; catalogSearch = ''; $('#catalog-search').value = ''; renderOfficialCatalog(); }));
$('#catalog-groups').addEventListener('click', event => { const button = event.target.closest('[data-catalog-group]'); if (button) { catalogGroup = button.dataset.catalogGroup; renderOfficialCatalog(); } });
$('#catalog-search').addEventListener('input', event => { catalogSearch = event.target.value; renderOfficialCatalog(); });

function openOrder(waiter = false) {
  if (!canCreate()) return;
  closeSidebar();
  $('#order-form').reset();
  requestId = newId();
  $('#order-type').disabled = waiter || state.user.role === 'waiter';
  $('#table-number').max = state.settings.tableCount;
  draft = []; pickerKind = 'pizza'; pickerGroup = 'all'; pickerSearch = ''; splitFlavors = [];
  $('#picker-search').value = ''; $('#pizza-size').value = 'large'; $('#split-pizza').checked = false;
  $('#form-error').hidden = true;
  $('#order-dialog-title').textContent = waiter || state.user.role === 'waiter' ? 'Pedido de mesa' : 'Novo pedido';
  updateType(); renderPicker(); updateDraft();
  $('#order-dialog').showModal();
  document.body.classList.add('modal-open');
  $('#table-number').focus();
}
$('#new-order').addEventListener('click', () => openOrder());
$('#waiter-nav').addEventListener('click', () => openOrder(true));
$('#waiter-quick').addEventListener('click', () => openOrder(true));
$('#order-type').addEventListener('change', updateType);
$('.dialog-close').addEventListener('click', () => $('#order-dialog').close());
$('#product-picker').addEventListener('click', event => {
  const button = event.target.closest('[data-add]');
  if (!button) return;
  const product = catalog.find(item => item.id === button.dataset.add);
  if (!product) return;
  if (product.kind === 'pizza' && $('#split-pizza').checked) {
    if (splitFlavors.includes(product.id)) splitFlavors = splitFlavors.filter(id => id !== product.id);
    else if (splitFlavors.length < 2) splitFlavors.push(product.id);
    else { $('#split-selection').textContent = 'Já há dois sabores selecionados. Desmarque um para trocar.'; return; }
    renderPicker(); $(`[data-add="${product.id}"]`)?.focus(); return;
  }
  const quote = product.kind === 'pizza' ? quotePizza([product.id], $('#pizza-size').value) : quoteProduct(product.id, $(`#variant-${product.id}`)?.value || product.variants[0].id);
  addLine(quote);
  button.classList.add('just-added'); button.setAttribute('aria-label', `Adicionar mais ${product.name}`);
  button.innerHTML = icon('check');
  setTimeout(() => { if (button.isConnected) { button.classList.remove('just-added'); button.innerHTML = icon('plus'); button.setAttribute('aria-label', `Adicionar ${product.name}`); } }, 800);
});
$('#product-picker').addEventListener('change', event => {
  const id = event.target.dataset.variantPrice;
  if (id) $(`#price-${id}`).textContent = money(quoteProduct(id, event.target.value).unitPrice);
});
$$('[data-picker-kind]').forEach(button => button.addEventListener('click', () => { pickerKind = button.dataset.pickerKind; pickerGroup = 'all'; pickerSearch = ''; $('#picker-search').value = ''; if (pickerKind !== 'pizza') { splitFlavors = []; $('#split-pizza').checked = false; } renderPicker(); }));
$('#picker-groups').addEventListener('click', event => { const button = event.target.closest('[data-picker-group]'); if (button) { pickerGroup = button.dataset.pickerGroup; renderPicker(); } });
$('#picker-search').addEventListener('input', event => { pickerSearch = event.target.value; renderPicker(); });
$('#pizza-size').addEventListener('change', renderPicker);
$('#split-pizza').addEventListener('change', () => { splitFlavors = []; renderPicker(); });
$('#clear-split').addEventListener('click', () => { splitFlavors = []; renderPicker(); });
$('#add-split').addEventListener('click', () => { if (splitFlavors.length === 2) { addLine(quotePizza(splitFlavors, $('#pizza-size').value)); splitFlavors = []; renderPicker(); } });
$('#draft-items').addEventListener('click', event => {
  const button = event.target.closest('[data-line]');
  if (!button) return;
  const line = draft.find(item => item.key === button.dataset.line);
  if (!line) return;
  line.quantity = Math.min(99, line.quantity + Number(button.dataset.delta));
  draft = draft.filter(item => item.quantity > 0); updateDraft();
  const replacement = [...$('#draft-items').querySelectorAll('[data-line]')].find(item => item.dataset.line === button.dataset.line && item.dataset.delta === button.dataset.delta);
  if (replacement && !replacement.disabled) replacement.focus();
});

$('#order-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (submitting) return;
  const type = $('#order-type').value, table = $('#table-number').value.trim();
  const customer = type === 'table' ? 'Mesa ' + table : $('#customer-name').value.trim();
  const error = message => { $('#form-error').textContent = message; $('#form-error').hidden = false; };
  if (type === 'table' && (!/^[1-9]\d{0,2}$/.test(table) || Number(table) > state.settings.tableCount)) return error('Informe uma mesa de 1 a ' + state.settings.tableCount + '.');
  if (!customer || customer.length > 80) return error('Informe o nome do cliente.');
  if (!draft.length) return error('Adicione pelo menos um produto ao pedido.');
  if ($('#split-pizza').checked && splitFlavors.length) return error('Adicione ou limpe a pizza de dois sabores antes de registrar o pedido.');
  const button = $('#order-form button[type="submit"]'); button.disabled = true; submitting = true;
  try {
    const { order } = await api('/api/orders', 'POST', { type, table, customer, notes: $('#order-notes').value.trim(), requestId, items: draft.map(line => ({ productIds: line.productIds, size: line.size, variantId: line.variantId, quantity: line.quantity })) });
    search = ''; activeType = 'all'; $('#global-search').value = ''; $('#order-dialog').close();
    await refresh(); toast('Pedido #' + order.number + ' enviado à cozinha. ' + customer);
  } catch (failure) { error(failure.message); }
  finally { button.disabled = false; submitting = false; }
});

$$('dialog').forEach(dialog => {
  dialog.addEventListener('close', () => {
    if (!$$('dialog').some(item => item.open)) document.body.classList.remove('modal-open');
  });
  dialog.addEventListener('click', event => {
    const rect = dialog.getBoundingClientRect();
    if (event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) dialog.close();
  });
});

$('#today-label').textContent = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: TIMEZONE }).format(new Date());
$('#pizza-size').innerHTML = Object.entries(SIZES).map(([size, info]) => `<option value="${size}" ${size === 'large' ? 'selected' : ''}>${info.label} · ${info.slices} fatias</option>`).join('');

$('#menu-sources').innerHTML = SOURCES.map(source => `<a href="${source.image}" target="_blank" rel="noopener">${source.label}${icon('arrow')}</a>`).join('');
boot();

function newId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
  const hex = [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
async function api(path, method = 'GET', body) {
  let response;
  try { response = await fetch(path, { method, credentials: 'same-origin', headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15000) }); }
  catch { throw new Error('Sem conexão com o servidor. Confira a rede e tente novamente.'); }
  const data = await response.json();
  if (!response.ok) {
    if (response.status === 401 && state.user) showAuth(false);
    throw new Error(data.error || 'Não foi possível concluir a ação.');
  }
  return data;
}
function showAuth(setup, requiresSetupKey = false) {
  lastRenderFingerprint = '';
  stream?.close(); clearInterval(syncTimer); state.user = null;
  $$('dialog[open]').forEach(dialog => dialog.close()); closeSidebar();
  $('#app-shell').hidden = true; $('#auth-screen').hidden = false;
  $('#auth-form').hidden = false; $('#auth-retry').hidden = true;
  $('#auth-form').dataset.setup = String(setup);
  $('#auth-title').textContent = setup ? 'Vamos abrir a pizzaria.' : 'Bom ter você por aqui.';
  $('#auth-copy').textContent = setup ? 'Cadastre o primeiro acesso do proprietário. Depois, crie as contas da equipe.' : 'Entre com o usuário cadastrado pelo proprietário.';
  $('#setup-name-field').hidden = $('#setup-tables-field').hidden = !setup;
  $('#setup-key-field').hidden = !setup || !requiresSetupKey;
  $('#auth-setup-key').required = setup && requiresSetupKey;
  $('#auth-setup-key').value = '';
  $('#auth-name').required = setup;
  $('#auth-password').minLength = setup ? 6 : 1;
  $('#auth-password').autocomplete = setup ? 'new-password' : 'current-password';
  $('#auth-password').value = ''; $('#auth-error').hidden = true;
  $('#auth-submit').textContent = setup ? 'Cadastrar e começar' : 'Entrar no sistema';
}
async function boot() {
  try {
    const info = await api('/api/bootstrap');
    if (info.user) await enterApp(); else showAuth(info.needsSetup, info.requiresSetupKey);
  } catch (error) {
    $('#auth-title').textContent = 'Servidor indisponível'; $('#auth-copy').textContent = error.message;
    $('#auth-retry').hidden = false;
  }
}
async function enterApp() {
  await refresh();
  $('#auth-screen').hidden = true; $('#app-shell').hidden = false;
  clearInterval(syncTimer); stream?.close();
  if (state.syncMode === 'polling') {
    syncTimer = setInterval(() => { if (!document.hidden) refresh().catch(() => setConnection(false)); }, 3000);
    return;
  }
  stream?.close(); stream = new EventSource('/api/events');
  stream.addEventListener('change', () => { setConnection(true); refresh().catch(() => setConnection(false)); });
  stream.addEventListener('expired', () => { showAuth(false); toast('Sua sessão terminou. Entre novamente.'); });
  stream.onerror = () => setConnection(false);
  clearInterval(syncTimer); syncTimer = setInterval(() => { refresh().catch(() => setConnection(false)); }, 20000);
}
function setConnection(connected) {
  $('#connection-status').textContent = connected ? 'Equipe conectada' : 'Reconectando…';
  $('.demo-note').classList.toggle('disconnected', !connected);
}
async function refresh() {
  if (refreshInFlight) { refreshAgain = true; return refreshInFlight; }
  refreshInFlight = (async () => {
    do {
      refreshAgain = false;
      state = await api('/api/state'); catalog = state.catalog;
      const fingerprint = JSON.stringify({ ...state, revision: undefined, syncMode: undefined, day: todayKey() });
      if (fingerprint !== lastRenderFingerprint) { applyProfile(); render(); lastRenderFingerprint = fingerprint; }
      setConnection(true);
    } while (refreshAgain && state.user);
  })();
  try { await refreshInFlight; } finally { refreshInFlight = null; }
}
function applyProfile() {
  const role = state.user.role;
  $('#profile-name').textContent = state.user.name; $('#profile-role').textContent = roleLabels[role];
  $$('.avatar').forEach(avatar => { avatar.textContent = state.user.name.slice(0,1).toUpperCase(); avatar.setAttribute('aria-label', state.user.name); });
  $('.workspace strong').textContent = state.settings.name;
  $('.breadcrumb').innerHTML = `${escapeHTML(state.settings.name)} <span>/</span> <strong>${roleLabels[role]}</strong>`;
  $('#staff-nav').hidden = $('#settings-nav').hidden = role !== 'owner';
  $('#finance-nav').hidden = !canPay(); $('#waiter-nav').hidden = !canCreate();
  $('#new-order').hidden = !canCreate(); $('.waiter-banner').hidden = !canCreate();
  $('#kitchen-nav').hidden = $('#cozinha').hidden = !canPrepare();
  if (role === 'kitchen') $('.page-heading').after($('#cozinha'));
  else $('.overview-grid').after($('#cozinha'));
  $('#catalog-nav-count').textContent = catalog.length;
  $('#catalog-summary').textContent = `${catalog.filter(product => product.kind === 'pizza').length} pizzas · ${catalog.filter(product => product.kind === 'drink').length} bebidas · ${catalog.filter(product => product.kind === 'cocktail').length} coquetéis`;
  $('.page-heading h1').innerHTML = `${role === 'kitchen' ? 'Cozinha' : role === 'waiter' ? 'Atendimento' : 'Visão geral'}<span class="heading-dot">.</span>`;
}
$('#auth-retry').addEventListener('click', boot);
$('#auth-form').addEventListener('submit', async event => {
  event.preventDefault(); const button = $('#auth-submit'); button.disabled = true; $('#auth-error').hidden = true;
  try {
    const setup = $('#auth-form').dataset.setup === 'true';
    await api(setup ? '/api/setup' : '/api/login', 'POST', { name: $('#auth-name').value, username: $('#auth-username').value, password: $('#auth-password').value, tableCount: Number($('#auth-tables').value), setupKey: $('#auth-setup-key').value });
    await enterApp(); $('#auth-password').value = '';
  } catch (error) { $('#auth-error').textContent = error.message; $('#auth-error').hidden = false; }
  finally { button.disabled = false; }
});
$('#logout').addEventListener('click', async () => { try { await api('/api/logout', 'POST', {}); showAuth(false); } catch (error) { toast(error.message); } });

async function advanceOrder(order, button) {
  button.disabled = true;
  try {
    const result = await api(`/api/orders/${order.number}/advance`, 'POST', { expectedStatus: order.status });
    await refresh(); toast(`Pedido #${order.number}: ${stages[result.order.status].label.toLowerCase()}.`);
  } catch (error) { toast(error.message); await refresh().catch(() => {}); }
  finally { if (button.isConnected) button.disabled = false; }
}
function showOrder(number) {
  const order = state.orders.find(item => item.number === number); if (!order) return;
  openNotice(`Pedido #${order.number}`, `<span class="status status-${order.status}">${stages[order.status].label}</span><p><strong>${escapeHTML(order.customer)}</strong> · ${types[order.type].label}</p><ul>${order.items.map(item => `<li>${item.quantity}× ${escapeHTML(item.name)} (${escapeHTML(item.variant)}) — ${money(item.quantity * item.unitPrice)}</li>`).join('')}</ul><p><strong>Total: ${money(order.total)}</strong></p><p class="order-note">Observações: ${escapeHTML(order.notes || 'Nenhuma observação.')}</p><p>Registrado por ${escapeHTML(order.authorName)}.</p><p>${order.paymentStatus === 'paid' ? `Pago por ${payments[order.payment]}.` : 'Pagamento pendente.'}</p>${canPay() && order.paymentStatus !== 'paid' && order.status !== 'cancelled' ? `<div class="cancel-area"><label><input type="checkbox" id="cancel-confirm"> Confirmo o cancelamento deste pedido</label><button class="button button-navy" data-cancel="${order.number}" type="button">Cancelar pedido</button><p class="form-error" id="cancel-error" role="alert" hidden></p></div>` : ''}`);
}
$('#notice-content').addEventListener('click', async event => {
  const button = event.target.closest('[data-cancel]'); if (!button) return;
  if (!$('#cancel-confirm').checked) { $('#cancel-error').textContent = 'Marque a confirmação para cancelar.'; $('#cancel-error').hidden = false; return; }
  button.disabled = true;
  try { await api(`/api/orders/${button.dataset.cancel}/cancel`, 'POST', {}); $('#notice-dialog').close(); await refresh(); toast('Pedido cancelado.'); }
  catch (error) { $('#cancel-error').textContent = error.message; $('#cancel-error').hidden = false; button.disabled = false; }
});
function renderKitchen() {
  if (!canPrepare()) return;
  const orders = activeOrders().filter(order => ['received','preparing','ready'].includes(order.status)).sort((a,b) => a.number - b.number);
  $('#kitchen-list').innerHTML = orders.length ? orders.map(order => `<article class="kitchen-card"><div class="kitchen-card-top"><strong>#${order.number} · ${escapeHTML(order.customer)}</strong><span class="status status-${order.status}">${stages[order.status].label}</span></div><ul>${order.items.map(item => `<li><strong>${item.quantity}× ${escapeHTML(item.name)}</strong><small>${escapeHTML(item.variant)}</small><p>${escapeHTML(item.productIds.map(id => catalog.find(product => product.id === id)?.description || '').filter(Boolean).join(' / '))}</p></li>`).join('')}</ul>${order.notes ? `<p class="kitchen-note">${escapeHTML(order.notes)}</p>` : ''}<div class="kitchen-card-footer"><small>${escapeHTML(order.authorName)}</small>${['received','preparing'].includes(order.status) ? `<button class="button button-navy" data-kitchen-advance="${order.number}" type="button">${actionFor(order)}${icon('arrow')}</button>` : '<span class="small-tag tag-soft">AGUARDANDO GARÇOM</span>'}</div></article>`).join('') : '<p class="module-empty">Nenhum pedido aguardando preparo. Novos pedidos aparecem aqui automaticamente.</p>';
}
$('#kitchen-list').addEventListener('click', async event => {
  const button = event.target.closest('[data-kitchen-advance]'); if (!button) return;
  const order = state.orders.find(item => item.number === Number(button.dataset.kitchenAdvance));
  if (order) await advanceOrder(order, button);
});
function openModule(view) {
  closeSidebar(); moduleView = view; $('#module-content').innerHTML = ''; renderModule();
  $('#module-dialog').showModal(); document.body.classList.add('modal-open');
}
function openTables(table = null) { selectedTable = table; openModule('tables'); }
function openPayment(order) { selectedTable = order.number; openModule('payment'); }
$('#tables-nav').addEventListener('click', () => openTables());
$('#staff-nav').addEventListener('click', () => openModule('staff'));
$('#finance-nav').addEventListener('click', () => openModule('finance'));
$('#settings-nav').addEventListener('click', () => openModule('settings'));
$('#module-close').addEventListener('click', () => $('#module-dialog').close());
$('#module-dialog').addEventListener('close', () => { moduleView = ''; });
const tableOrders = table => activeOrders().filter(order => order.type === 'table' && Number(order.table) === table && order.paymentStatus === 'pending');
const paymentSelect = value => `<label>Forma de pagamento<select name="payment" id="payment-method" required>${Object.entries(payments).map(([id,label]) => `<option value="${id}" ${value === id ? 'selected' : ''}>${label}</option>`).join('')}</select></label>`;
function renderModule() {
  if (!state.user) return;
  const content = $('#module-content'), oldPayment = $('#payment-method')?.value || 'pix';
  if (moduleView === 'tables') {
    $('#module-title').textContent = selectedTable ? `Mesa ${selectedTable} · Conta` : 'Mesas e contas';
    if (selectedTable) {
      const orders = tableOrders(selectedTable), total = orders.reduce((sum,order) => sum + order.total, 0);
      const allServed = orders.length && orders.every(order => order.status === 'served');
      content.innerHTML = `<button type="button" class="text-button" data-tables-back>← Todas as mesas</button><div class="account-total"><span>Total em aberto</span><strong>${money(total)}</strong></div>${orders.length ? orders.map(order => `<article class="account-order"><div><button class="order-id" type="button" data-module-details="${order.number}">Pedido #${order.number}</button><span class="status status-${order.status}">${stages[order.status].label}</span></div><ul>${order.items.map(item => `<li><span>${item.quantity}× ${escapeHTML(item.name)} <small>${escapeHTML(item.variant)}</small></span><strong>${money(item.quantity * item.unitPrice)}</strong></li>`).join('')}</ul>${order.notes ? `<p>${escapeHTML(order.notes)}</p>` : ''}</article>`).join('') : '<p class="module-empty">Mesa livre. Abra um pedido para começar o atendimento.</p>'}${canCreate() ? `<button type="button" class="button button-navy" data-table-order="${selectedTable}">${icon('plus')}Adicionar pedido à mesa</button>` : ''}${canPay() && orders.length ? `<form id="close-table-form" class="payment-form">${paymentSelect(oldPayment)}<p>${allServed ? 'Todos os pedidos foram servidos. Registre o pagamento para liberar a mesa.' : 'Aguarde todos os pedidos serem servidos antes de fechar a conta.'}</p><p class="form-error" id="module-error" role="alert" hidden></p><button type="submit" class="button button-yellow" ${allServed ? '' : 'disabled'}>Receber ${money(total)} e fechar mesa</button></form>` : orders.length ? '<p class="module-help">O proprietário ou o caixa registra o pagamento e fecha a mesa.</p>' : ''}`;
    } else content.innerHTML = `<p class="module-help">Escolha uma mesa para acompanhar os pedidos e a conta.</p><div class="tables-grid">${Array.from({length: state.settings.tableCount}, (_,index) => {
      const table = index + 1, orders = tableOrders(table), total = orders.reduce((sum,order) => sum + order.total,0);
      return `<button type="button" class="table-card ${orders.length ? 'occupied' : ''}" data-table="${table}">${icon('table')}<strong>Mesa ${table}</strong><span>${orders.length ? `${orders.length} pedido(s)` : 'Livre'}</span><b>${orders.length ? money(total) : 'Abrir atendimento'}</b></button>`;
    }).join('')}</div>`;
  } else if (moduleView === 'staff') {
    $('#module-title').textContent = 'Funcionários';
    if (!$('#staff-form')) content.innerHTML = '<p class="module-help">Cada pessoa usa seu próprio acesso. Escolha o perfil conforme a função.</p><div id="staff-list"></div><form id="staff-form" class="module-form"><h3>Cadastrar funcionário</h3><div class="form-grid"><label>Nome<input name="name" maxlength="80" required autocomplete="off"></label><label>Perfil<select name="role"><option value="waiter">Garçom · pedidos e atendimento</option><option value="kitchen">Cozinha · preparo dos pedidos</option><option value="cashier">Caixa · atendimento e pagamento</option></select></label><label>Usuário<input name="username" minlength="3" maxlength="40" pattern="[A-Za-z0-9._-]{3,40}" required autocomplete="off"></label><label>Senha inicial<input name="password" type="password" minlength="6" maxlength="128" required autocomplete="new-password"></label></div><p class="form-error" id="module-error" role="alert" hidden></p><button type="submit" class="button button-yellow">Cadastrar funcionário</button></form>';
    $('#staff-list').innerHTML = state.users.map(user => `<div class="staff-row"><span class="avatar">${escapeHTML(user.name.slice(0,1).toUpperCase())}</span><div><strong>${escapeHTML(user.name)}</strong><small>${escapeHTML(user.username)} · ${roleLabels[user.role]} · ${user.active ? 'Ativo' : 'Inativo'}</small></div>${user.role !== 'owner' ? `<button type="button" class="text-button" data-toggle-user="${user.id}" data-active="${!user.active}">${user.active ? 'Desativar' : 'Ativar'}</button>` : ''}</div>`).join('');
  } else if (moduleView === 'finance') {
    $('#module-title').textContent = 'Recebimentos';
    const paid = state.orders.filter(order => order.paymentStatus === 'paid').sort((a,b) => new Date(b.paidAt) - new Date(a.paidAt));
    const today = paid.filter(order => dateKey(order.paidAt) === todayKey());
    content.innerHTML = `<p class="module-help">Histórico de pagamentos dos últimos 31 dias.</p><div class="account-total"><span>Recebido hoje</span><strong>${money(today.reduce((sum,order) => sum + order.total,0))}</strong></div><div class="payment-totals">${Object.entries(payments).map(([key,label]) => `<span>${label}<strong>${money(today.filter(order => order.payment === key).reduce((sum,order) => sum + order.total,0))}</strong></span>`).join('')}</div>${paid.length ? `<div class="receipts">${paid.map(order => `<button type="button" class="receipt-row" data-module-details="${order.number}"><span><strong>#${order.number} · ${escapeHTML(order.customer)}</strong><small>${new Intl.DateTimeFormat('pt-BR', {dateStyle:'short',timeStyle:'short',timeZone:TIMEZONE}).format(new Date(order.paidAt))} · ${payments[order.payment]}</small></span><b>${money(order.total)}</b></button>`).join('')}</div>` : '<p class="module-empty">Nenhum pagamento registrado ainda.</p>'}`;
  } else if (moduleView === 'settings') {
    $('#module-title').textContent = 'Configurações';
    if (!$('#settings-form')) content.innerHTML = `<form id="settings-form" class="module-form"><label>Nome da pizzaria<input name="name" maxlength="80" required value="${escapeHTML(state.settings.name)}"></label><label>Quantidade de mesas<input name="tableCount" type="number" min="1" max="999" required value="${state.settings.tableCount}"></label><p class="module-help">Os números das mesas vão de 1 até a quantidade cadastrada.</p><p class="form-error" id="module-error" role="alert" hidden></p><button class="button button-yellow" type="submit">Salvar configurações</button></form>`;
  } else if (moduleView === 'payment') {
    const order = state.orders.find(item => item.number === selectedTable);
    if (!order || order.paymentStatus === 'paid') { $('#module-dialog').close(); return; }
    $('#module-title').textContent = `Receber pedido #${order.number}`;
    content.innerHTML = `<div class="account-total"><span>${escapeHTML(order.customer)}</span><strong>${money(order.total)}</strong></div><form id="pay-order-form" class="payment-form">${paymentSelect(oldPayment)}<p class="form-error" id="module-error" role="alert" hidden></p><button type="submit" class="button button-yellow">Registrar pagamento</button></form>`;
  }
}
$('#module-content').addEventListener('click', async event => {
  const table = event.target.closest('[data-table]');
  if (table) { selectedTable = Number(table.dataset.table); renderModule(); return; }
  if (event.target.closest('[data-tables-back]')) { selectedTable = null; renderModule(); return; }
  const create = event.target.closest('[data-table-order]');
  if (create) { const table = create.dataset.tableOrder; $('#module-dialog').close(); openOrder(true); $('#table-number').value = table; return; }
  const details = event.target.closest('[data-module-details]');
  if (details) { showOrder(Number(details.dataset.moduleDetails)); return; }
  const toggle = event.target.closest('[data-toggle-user]');
  if (toggle) {
    toggle.disabled = true;
    try { await api(`/api/users/${toggle.dataset.toggleUser}`, 'PATCH', {active: toggle.dataset.active === 'true'}); await refresh(); toast('Acesso do funcionário atualizado.'); }
    catch (error) { toast(error.message); toggle.disabled = false; }
  }
});
$('#module-content').addEventListener('submit', async event => {
  event.preventDefault(); const form = event.target;
  if (submitting) return;
  const button = form.querySelector('button[type="submit"]'), data = Object.fromEntries(new FormData(form));
  button.disabled = true; submitting = true; $('#module-error').hidden = true;
  try {
    if (form.id === 'staff-form') { await api('/api/users', 'POST', data); form.reset(); toast('Funcionário cadastrado. Ele já pode entrar com seu usuário e senha.'); }
    if (form.id === 'settings-form') { await api('/api/settings', 'PATCH', {...data,tableCount:Number(data.tableCount)}); toast('Configurações salvas.'); }
    if (form.id === 'close-table-form') {
      const {receipt} = await api(`/api/tables/${selectedTable}/close`, 'POST', data);
      $('#module-dialog').close(); openNotice(`Mesa ${receipt.table} fechada`, `<p class="account-total"><span>Pagamento registrado</span><strong>${money(receipt.total)}</strong></p><p>Forma de pagamento: <strong>${payments[receipt.payment]}</strong></p><p>Pedidos: ${receipt.orders.map(number => `#${number}`).join(', ')}.</p><p>A mesa está livre para um novo atendimento.</p>`);
    }
    if (form.id === 'pay-order-form') { await api(`/api/orders/${selectedTable}/pay`, 'POST', data); $('#module-dialog').close(); toast('Pagamento registrado.'); }
    await refresh();
  } catch (error) { const output = $('#module-error'); if (output) { output.textContent = error.message; output.hidden = false; } else toast(error.message); }
  finally { submitting = false; if (button.isConnected) button.disabled = false; }
});
