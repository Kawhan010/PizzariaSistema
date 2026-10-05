export const STATUS = {
  received: { label: 'Recebido', color: 'orange', next: 'preparing', action: 'Iniciar preparo' },
  preparing: { label: 'Em preparo', color: 'purple', next: 'ready', action: 'Marcar como pronto' },
  ready: { label: 'Pronto', color: 'blue', next: 'delivering', action: 'Saiu para entrega' },
  delivering: { label: 'Em entrega', color: 'blue', next: 'completed', action: 'Concluir pedido' },
  completed: { label: 'Concluído', color: 'green' },
  cancelled: { label: 'Cancelado', color: 'gray' }
};
export const CATEGORIES = { classic: 'Pizzas clássicas', special: 'Pizzas especiais', sweet: 'Pizzas doces', drink: 'Bebidas' };
export const PAYMENT = { pix: 'Pix', card: 'Cartão', cash: 'Dinheiro' };
export const TYPES = { delivery: 'Delivery', pickup: 'Retirada', table: 'Mesa' };
export const STORAGE_KEY = 'forno-management-v1';
export const money = value => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value / 100);
export const dayKey = date => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(date));
export const digits = value => String(value || '').replace(/\D/g, '');

export function createSeed(now = new Date()) {
  const products = [
    { id: 'p1', name: 'Margherita', category: 'classic', description: 'Molho de tomate, muçarela, manjericão fresco e azeite.', prices: { medium: 3900, large: 4900, family: 5900 }, image: 'assets/pizza-margherita.jpg', available: true },
    { id: 'p2', name: 'Calabresa', category: 'classic', description: 'Muçarela, calabresa artesanal, cebola e orégano.', prices: { medium: 4200, large: 5200, family: 6200 }, image: 'assets/pizza-calabresa.jpg', available: true },
    { id: 'p3', name: 'Quatro queijos', category: 'classic', description: 'Muçarela, provolone, parmesão e queijo cremoso.', prices: { medium: 4600, large: 5600, family: 6600 }, image: 'assets/pizza-especial.jpg', available: true },
    { id: 'p4', name: 'Especial da casa', category: 'special', description: 'Muçarela, presunto, cogumelos, tomate e azeitonas.', prices: { medium: 4900, large: 5900, family: 6900 }, image: 'assets/pizza-forno.jpg', available: true },
    { id: 'p5', name: 'Frango com catupiry', category: 'classic', description: 'Frango desfiado, catupiry, milho e orégano.', prices: { medium: 4500, large: 5500, family: 6500 }, image: 'assets/pizza-especial.jpg', available: true },
    { id: 'p6', name: 'Pepperoni', category: 'special', description: 'Muçarela, pepperoni e molho de tomate da casa.', prices: { medium: 4800, large: 5800, family: 6800 }, image: 'assets/pizza-calabresa.jpg', available: true },
    { id: 'p7', name: 'Chocolate', category: 'sweet', description: 'Chocolate ao leite, granulado e massa artesanal.', prices: { medium: 3600, large: 4600, family: 5600 }, image: '', available: true },
    { id: 'p8', name: 'Banana com canela', category: 'sweet', description: 'Banana, açúcar, canela e leite condensado.', prices: { medium: 3400, large: 4400, family: 5400 }, image: '', available: false },
    { id: 'p9', name: 'Coca-Cola 2 L', category: 'drink', description: 'Refrigerante, garrafa de 2 litros.', prices: { single: 1400 }, image: '', available: true },
    { id: 'p10', name: 'Guaraná 2 L', category: 'drink', description: 'Refrigerante, garrafa de 2 litros.', prices: { single: 1200 }, image: '', available: true },
    { id: 'p11', name: 'Água mineral 500 ml', category: 'drink', description: 'Água mineral sem gás.', prices: { single: 500 }, image: '', available: true },
    { id: 'p12', name: 'Suco de laranja 1 L', category: 'drink', description: 'Suco de laranja, garrafa de 1 litro.', prices: { single: 1800 }, image: '', available: true }
  ];
  const names = ['Ana Oliveira', 'Lucas Santos', 'Mariana Costa', 'Pedro Almeida', 'Juliana Lima', 'Rafael Souza', 'Camila Ferreira', 'Bruno Martins'];
  const customers = names.map((name, i) => ({ id: `c${i + 1}`, name, phone: `1198765000${i}`, address: `Rua das Flores, ${40 + i * 15} — Centro`, notes: '' }));
  const orders = [];
  let number = 1000;
  for (let day = 6; day >= 0; day--) {
    const count = day === 0 ? 14 : 6 + (day % 4);
    for (let i = 0; i < count; i++) {
      number++;
      const createdAt = new Date(now);
      createdAt.setDate(createdAt.getDate() - day);
      if (day === 0) createdAt.setMinutes(createdAt.getMinutes() - (count - 1 - i) * 8);
      else createdAt.setHours(18 + i % 4, i * 6 % 60, 0, 0);
      const product = products[(i + day) % 6];
      const customer = customers[(i + day) % customers.length];
      const type = i % 4 === 0 ? 'pickup' : 'delivery';
      const items = [{ productId: product.id, name: product.name, size: 'large', quantity: i % 5 === 0 ? 2 : 1, unitPrice: product.prices.large }];
      if (i % 3 === 0) items.push({ productId: 'p9', name: 'Coca-Cola 2 L', size: 'single', quantity: 1, unitPrice: 1400 });
      const deliveryFee = type === 'delivery' ? 600 : 0;
      const status = day > 0 || i < 8 ? 'completed' : ['delivering', 'ready', 'preparing', 'preparing', 'received', 'received'][i - 8];
      orders.push({ id: `o${number}`, number, createdAt: createdAt.toISOString(), customerId: customer.id, customerName: customer.name, phone: customer.phone, address: type === 'delivery' ? customer.address : '', type, table: '', items, deliveryFee, total: items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0) + deliveryFee, payment: ['pix', 'card', 'cash'][i % 3], paid: status === 'completed' || i % 3 === 0, status, notes: i === 11 ? 'Sem cebola, por favor.' : '' });
    }
  }
  return { version: 1, products, customers, orders, settings: { name: 'Pizzaria Forno', phone: '(11) 3333-0000', address: 'Rua das Flores, 100 — Centro', hours: 'Terça a domingo, das 18h às 23h', deliveryFee: 600, admin: 'Administrador' } };
}

export class Store {
  constructor(storage, now = new Date()) {
    this.storage = storage;
    try {
      const saved = JSON.parse(storage?.getItem(STORAGE_KEY) || 'null');
      this.data = saved?.version === 1 && Array.isArray(saved.orders) && Array.isArray(saved.products) && Array.isArray(saved.customers) && saved.settings ? saved : createSeed(now);
    } catch { this.data = createSeed(now); }
  }
  commit(next) {
    // Save before changing in-memory state so a failed write cannot masquerade as success.
    this.storage?.setItem(STORAGE_KEY, JSON.stringify(next));
    this.data = next;
  }
  change(update) { const next = structuredClone(this.data); const result = update(next); this.commit(next); return result; }
  saveCustomer(input, id) {
    const phone = digits(input.phone);
    const name = String(input.name || '').trim();
    if (!name || name.length > 80 || !/^\d{10,11}$/.test(phone)) throw new Error('Informe um nome e um telefone com DDD (10 ou 11 dígitos).');
    if (this.data.customers.some(c => c.phone === phone && c.id !== id)) throw new Error('Já existe um cliente com esse telefone.');
    return this.change(data => {
      const customer = { id: id || crypto.randomUUID(), name, phone, address: String(input.address || '').trim().slice(0, 200), notes: String(input.notes || '').trim().slice(0, 300) };
      if (id) { const index = data.customers.findIndex(c => c.id === id); if (index < 0) throw new Error('Cliente não encontrado.'); data.customers[index] = customer; }
      else data.customers.push(customer);
      return customer;
    });
  }
  saveProduct(input, id) {
    const name = String(input.name || '').trim();
    if (!name || name.length > 80 || !CATEGORIES[input.category]) throw new Error('Confira o nome e a categoria do produto.');
    const sizes = input.category === 'drink' ? ['single'] : ['medium', 'large', 'family'];
    const prices = Object.fromEntries(sizes.map(size => [size, Number(input.prices[size])]));
    if (Object.values(prices).some(p => !Number.isSafeInteger(p) || p < 1 || p > 1000000)) throw new Error('Informe preços válidos, maiores que zero.');
    return this.change(data => {
      const old = data.products.find(p => p.id === id);
      if (id && !old) throw new Error('Produto não encontrado.');
      const product = { id: id || crypto.randomUUID(), name, category: input.category, description: String(input.description || '').trim().slice(0, 300), prices, available: Boolean(input.available), image: old?.image || '' };
      if (old) data.products[data.products.findIndex(p => p.id === id)] = product;
      else data.products.push(product);
      return product;
    });
  }
  toggleProduct(id) { this.change(data => { const product = data.products.find(p => p.id === id); if (!product) throw new Error('Produto não encontrado.'); product.available = !product.available; }); }
  quote(items, type) {
    if (!TYPES[type] || !Array.isArray(items) || !items.length) throw new Error('Adicione pelo menos um produto ao pedido.');
    const lines = items.map(line => {
      const product = this.data.products.find(p => p.id === line.productId);
      if (!product?.available) throw new Error('Um produto selecionado está indisponível.');
      const unitPrice = product.prices[line.size];
      const quantity = Number(line.quantity);
      if (!unitPrice || !Number.isInteger(quantity) || quantity < 1 || quantity > 99) throw new Error('Confira o tamanho e a quantidade dos produtos.');
      return { productId: product.id, name: product.name, size: line.size, quantity, unitPrice };
    });
    const deliveryFee = type === 'delivery' ? this.data.settings.deliveryFee : 0;
    const subtotal = lines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0);
    return { items: lines, subtotal, deliveryFee, total: subtotal + deliveryFee };
  }
  createOrder(input, now = new Date()) {
    const quote = this.quote(input.items, input.type);
    const name = String(input.customerName || '').trim();
    const phone = digits(input.phone);
    if (!name || name.length > 80 || !/^\d{10,11}$/.test(phone)) throw new Error('Informe o nome do cliente e um telefone válido com DDD.');
    if (!PAYMENT[input.payment]) throw new Error('Selecione uma forma de pagamento.');
    if (input.type === 'delivery' && !String(input.address || '').trim()) throw new Error('Informe o endereço de entrega.');
    if (input.type === 'table' && !/^\d{1,3}$/.test(String(input.table || ''))) throw new Error('Informe um número de mesa válido.');
    return this.change(data => {
      let customer = data.customers.find(c => c.phone === phone);
      if (!customer) { customer = { id: crypto.randomUUID(), name, phone, address: String(input.address || '').trim().slice(0, 200), notes: '' }; data.customers.push(customer); }
      const number = Math.max(1000, ...data.orders.map(o => o.number)) + 1;
      const order = { id: crypto.randomUUID(), number, createdAt: now.toISOString(), customerId: customer.id, customerName: name, phone, address: String(input.address || '').trim().slice(0, 200), table: String(input.table || ''), type: input.type, items: quote.items, deliveryFee: quote.deliveryFee, total: quote.total, payment: input.payment, paid: Boolean(input.paid), status: 'received', notes: String(input.notes || '').trim().slice(0, 300) };
      data.orders.push(order); return order;
    });
  }
  advanceOrder(id) {
    this.change(data => {
      const order = data.orders.find(o => o.id === id);
      if (!order || !STATUS[order.status].next) throw new Error('Este pedido não pode avançar.');
      order.status = order.status === 'ready' && order.type !== 'delivery' ? 'completed' : STATUS[order.status].next;
    });
  }
  cancelOrder(id) {
    this.change(data => {
      const order = data.orders.find(o => o.id === id);
      if (!order || ['completed', 'cancelled'].includes(order.status)) throw new Error('Este pedido não pode ser cancelado.');
      order.status = 'cancelled';
    });
  }
  markPaid(id) { this.change(data => { const order = data.orders.find(o => o.id === id); if (!order || order.status === 'cancelled') throw new Error('Pedido indisponível para recebimento.'); order.paid = true; }); }
  saveSettings(input) {
    if (!String(input.name || '').trim() || !String(input.admin || '').trim() || !Number.isSafeInteger(input.deliveryFee) || input.deliveryFee < 0 || input.deliveryFee > 100000) throw new Error('Confira o nome da pizzaria, o responsável e a taxa de entrega.');
    this.change(data => { data.settings = { name: String(input.name).trim().slice(0, 80), admin: String(input.admin).trim().slice(0, 80), phone: String(input.phone || '').slice(0, 30), address: String(input.address || '').slice(0, 200), hours: String(input.hours || '').slice(0, 150), deliveryFee: input.deliveryFee }; });
  }
}
