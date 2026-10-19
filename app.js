let PRODUCTS = [];
const STATIC_MODE = true; // This distribution is static-only and never calls a backend.
let CURRENT_USER = null;
let CURRENT_PROFILE = {};
let CABINET_ORDERS = [];
let CABINET_REQUESTS = [];
let API_READY = false;

// All product cards use the bundled local placeholder; no remote product photos are loaded.
document.addEventListener('error', event => {
  const image = event.target;
  if (!(image instanceof HTMLImageElement) || !image.dataset.fallback || image.dataset.fallbackUsed === '1') return;
  image.dataset.fallbackUsed = '1';
  image.src = image.dataset.fallback;
}, true);


/*
 * Static demo API. No network, backend, or database is used in STATIC_MODE.
 * All records stay in this browser's localStorage and are not shared with other devices.
 */
function staticApiError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  throw error;
}
function staticBody(options) {
  if (!options.body) return {};
  try { return typeof options.body === 'string' ? JSON.parse(options.body) : options.body; }
  catch { return {}; }
}
function staticSessionActive() { return readStorage('kucherStaticSession', null) === 'admin'; }
function staticUser() {
  if (!staticSessionActive()) return null;
  const profile = readStorage('kucherStaticProfile:admin', {});
  return { id: 'admin', identifier: 'admin', name: 'Администратор', email: '', phone: '', address: '', company: '', comment: '', ...profile, id: 'admin', identifier: 'admin' };
}
function staticRequireUser() {
  const user = staticUser();
  if (!user) staticApiError('Сначала войдите в личный кабинет.', 401);
  return user;
}
function staticCatalog() {
  const source = (Array.isArray(window.PRODUCTS) ? window.PRODUCTS : []).map(item => ({ ...item }));
  const stored = readStorage('kucherStaticCatalog', null);
  const version = 'catalog-100-placeholder-2026-10-19-v3';
  if (!Array.isArray(stored) || !stored.length) {
    writeStorage('kucherStaticCatalog', source);
    try { localStorage.setItem('kucherStaticCatalogVersion', version); } catch (_) {}
    return source;
  }
  let currentVersion = '';
  try { currentVersion = localStorage.getItem('kucherStaticCatalogVersion') || ''; } catch (_) {}
  if (currentVersion !== version || stored.length !== source.length) {
    const existingById = new Map(stored.map(item => [String(item.id), item]));
    const merged = source.map(product => {
      const previous = existingById.get(String(product.id));
      const oldStock = previous && Number.isFinite(Number(previous.stock)) ? Math.max(0, Number(previous.stock)) : Number(product.stock) || 0;
      return { ...product, stock: oldStock };
    });
    writeStorage('kucherStaticCatalog', merged);
    try { localStorage.setItem('kucherStaticCatalogVersion', version); } catch (_) {}
    return merged;
  }
  return stored;
}
function staticSaveCatalog(products) { writeStorage('kucherStaticCatalog', products); }
function staticUserOrders() { return readStorage('kucherStaticOrders:admin', []); }
function staticSaveUserOrders(value) { writeStorage('kucherStaticOrders:admin', value); }
function staticAllRequests() { return readStorage('kucherStaticRequests', []); }
function staticSaveRequests(value) { writeStorage('kucherStaticRequests', value); }
function staticNextId(key, initial = 1001) {
  const id = Number(readStorage(key, initial)) || initial;
  writeStorage(key, id + 1);
  return id;
}
function staticSnapshotItems(lines) {
  const catalog = staticCatalog();
  return (Array.isArray(lines) ? lines : []).map(line => {
    const productId = Number(line.productId ?? line.id);
    const qty = Math.max(1, Math.floor(Number(line.quantity ?? line.qty) || 1));
    const product = catalog.find(item => Number(item.id) === productId);
    if (!product) staticApiError('Один из товаров больше недоступен. Обновите корзину.', 409);
    if (!Number.isFinite(Number(product.stock)) || Number(product.stock) < qty) staticApiError(`Недостаточно товара «${product.name}» на складе. Обновите количество.`, 409);
    return { id: product.id, productId: product.id, name: product.name, sku: product.sku || `KUCHER-${product.id}`, qty, quantity: qty, price: Number(product.price) || 0, image: product.image || '', cat: product.cat || '' };
  });
}
async function staticApiRequest(path, options = {}) {
  const method = String(options.method || 'GET').toUpperCase();
  const body = staticBody(options);
  const route = String(path).split('?')[0];

  if (route === '/products' && method === 'GET') {
    return staticCatalog().map(product => ({
      id: product.id, sku: product.sku || `KUCHER-${product.id}`, stock: Math.max(0, Number(product.stock) || 0),
      category: { name: product.cat || '' }, name: product.name, price: Number(product.price) || 0,
      badge: product.badge || '', imageUrl: product.image || '', fallbackImageUrl: product.fallbackImage || '', description: product.description || '',
      specs: Array.isArray(product.specs) ? product.specs : [],
    }));
  }
  if (route === '/categories' && method === 'GET') {
    return [...new Set(staticCatalog().map(item => item.cat).filter(Boolean))].sort().map((name, id) => ({ id: id + 1, name }));
  }
  if (route === '/auth/me' && method === 'GET') {
    const user = staticUser();
    if (!user) staticApiError('Не выполнен вход.', 401);
    return { user };
  }
  if (route === '/auth/login' && method === 'POST') {
    const identifier = String(body.identifier || '').trim().toLowerCase();
    const password = String(body.password || '');
    const savedPassword = readStorage('kucherStaticAdminPassword', 'admin');
    if (identifier !== 'admin' || password !== savedPassword) staticApiError('Неверный логин или пароль. Для демонстрационного входа используйте admin / admin.', 401);
    writeStorage('kucherStaticSession', 'admin');
    return { user: staticUser() };
  }
  if (route === '/auth/logout' && method === 'POST') {
    localStorage.removeItem('kucherStaticSession');
    return { success: true };
  }
  if (route === '/auth/register' && method === 'POST') {
    staticApiError('Регистрация отключена в автономной демо-версии. Используйте вход admin / admin.', 403);
  }
  if (route === '/auth/profile' && method === 'PATCH') {
    staticRequireUser();
    const current = readStorage('kucherStaticProfile:admin', {});
    const profile = { ...current, name: String(body.name || '').trim(), email: String(body.email || '').trim(), phone: String(body.phone || '').trim(), address: String(body.address || '').trim(), company: String(body.company || '').trim(), comment: String(body.comment || '').trim() };
    writeStorage('kucherStaticProfile:admin', profile);
    return { user: staticUser() };
  }
  if (route === '/auth/password' && method === 'POST') {
    staticRequireUser();
    staticApiError('Смена пароля недоступна в автономной версии. Для демонстрации используются admin / admin.', 403);
  }
  if (route === '/orders' && method === 'GET') {
    staticRequireUser();
    return staticUserOrders().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }
  if (route === '/orders' && method === 'POST') {
    const user = staticRequireUser();
    const currentProfile = staticUser();
    if (!validPhone(currentProfile.phone)) staticApiError('Укажите корректный номер телефона в профиле.');
    const address = String(body.deliveryAddress || currentProfile.address || '').trim();
    if (!address) staticApiError('Укажите адрес доставки в профиле.');
    const items = staticSnapshotItems(body.items);
    if (!items.length) staticApiError('Добавьте товары и проверьте их количество.');
    const catalog = staticCatalog();
    for (const line of items) {
      const product = catalog.find(item => Number(item.id) === Number(line.productId));
      product.stock = Math.max(0, Number(product.stock) - line.qty);
    }
    staticSaveCatalog(catalog);
    const order = {
      id: staticNextId('kucherStaticNextOrderId', 1001), status: 'PENDING', total: items.reduce((sum, item) => sum + item.price * item.qty, 0),
      createdAt: new Date().toISOString(), name: user.name || 'Администратор', phone: user.phone || '', address,
      comment: String(body.comment || '').trim(), items,
    };
    const orders = staticUserOrders();
    orders.unshift(order); staticSaveUserOrders(orders);
    return order;
  }
  const cancelMatch = route.match(/^\/orders\/(\d+)\/cancel$/);
  if (cancelMatch && method === 'PATCH') {
    staticRequireUser();
    const orders = staticUserOrders();
    const order = orders.find(item => String(item.id) === cancelMatch[1]);
    if (!order) staticApiError('Заказ не найден.', 404);
    if (order.status !== 'PENDING') staticApiError('Этот заказ уже нельзя отменить.', 409);
    order.status = 'CANCELLED';
    const catalog = staticCatalog();
    for (const line of (order.items || [])) {
      const product = catalog.find(item => Number(item.id) === Number(line.productId ?? line.id));
      if (product) product.stock = Math.max(0, Number(product.stock) || 0) + Math.max(0, Number(line.qty ?? line.quantity) || 0);
    }
    staticSaveCatalog(catalog); staticSaveUserOrders(orders);
    return order;
  }
  if (route === '/manager-requests' && method === 'GET') {
    staticRequireUser();
    return staticAllRequests().filter(item => item.customerId === 'admin').sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }
  if (route === '/manager-requests' && method === 'POST') {
    const items = [];
    for (const line of (Array.isArray(body.items) ? body.items : [])) {
      const product = staticCatalog().find(item => Number(item.id) === Number(line.productId ?? line.id));
      if (!product) continue;
      const qty = Math.max(1, Math.floor(Number(line.quantity ?? line.qty) || 1));
      items.push({ id: product.id, productId: product.id, name: product.name, sku: product.sku || `KUCHER-${product.id}`, qty, quantity: qty, price: Number(product.price) || 0, image: product.image || '', cat: product.cat || '' });
    }
    const request = { id: staticNextId('kucherStaticNextRequestId', 2001), customerId: staticSessionActive() ? 'admin' : null, name: String(body.name || '').trim() || 'Покупатель', phone: String(body.phone || '').trim(), comment: String(body.comment || '').trim(), items, status: 'NEW', createdAt: new Date().toISOString() };
    if (!validPhone(request.phone)) staticApiError('Введите корректный телефон для связи.');
    const requests = staticAllRequests(); requests.unshift(request); staticSaveRequests(requests);
    return request;
  }
  if (route === '/admin/manager-requests' && method === 'GET') {
    const headers = new Headers(options.headers || {});
    if (headers.get('X-Manager-Api-Key') !== 'admin') staticApiError('Неверный код доступа. В автономной версии используйте admin.', 401);
    return staticAllRequests().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }
  const managerStatusMatch = route.match(/^\/admin\/manager-requests\/(\d+)$/);
  if (managerStatusMatch && method === 'PATCH') {
    const headers = new Headers(options.headers || {});
    if (headers.get('X-Manager-Api-Key') !== 'admin') staticApiError('Неверный код доступа. В автономной версии используйте admin.', 401);
    const statuses = new Set(['NEW', 'IN_PROGRESS', 'CONTACTED', 'CLOSED']);
    if (!statuses.has(body.status)) staticApiError('Неизвестный статус заявки.');
    const requests = staticAllRequests();
    const request = requests.find(item => String(item.id) === managerStatusMatch[1]);
    if (!request) staticApiError('Заявка не найдена.', 404);
    request.status = body.status; staticSaveRequests(requests);
    return request;
  }
  staticApiError(`Операция ${method} ${route} не реализована в автономной версии.`, 404);
}

async function apiRequest(path, options = {}) {
  return staticApiRequest(path, options);
}

function clearLegacyPrivateStorage() {
  try {
    // The previous prototype stored plaintext passwords and unowned order/request history.
    // Never import those records into a newly authenticated server account.
    ['kucherUsers', 'kucherCurrentUser', 'kucherProfile', 'kucherOrders', 'kucherManagerRequests'].forEach(key => localStorage.removeItem(key));
    Object.keys(localStorage).filter(key => key.startsWith('kucherProfile:')).forEach(key => localStorage.removeItem(key));
    if (!localStorage.getItem('kucherCart:guest') && localStorage.getItem('kucherCart')) {
      localStorage.setItem('kucherCart:guest', localStorage.getItem('kucherCart'));
    }
    localStorage.removeItem('kucherCart');
  } catch (error) {
    console.warn('[Kucher] Could not clean legacy browser data.', error);
  }
}

async function refreshSession() {
  try {
    const result = await apiRequest('/auth/me');
    CURRENT_USER = result.user || null;
    CURRENT_PROFILE = CURRENT_USER ? { ...CURRENT_USER } : {};
    API_READY = true;
  } catch (error) {
    CURRENT_USER = null;
    CURRENT_PROFILE = {};
    API_READY = false;
    console.warn('[Kucher] Local demo session is unavailable.', error.message);
  }
}

async function loadProducts() {
  try {
    const data = await apiRequest('/products');
    PRODUCTS = data.map(product => ({
      id: product.id,
      sku: product.sku || `KUCHER-${product.id}`,
      stock: Math.max(0, Number(product.stock) || 0),
      cat: product.category?.name || '',
      name: product.name,
      price: Number(product.price),
      badge: product.badge || '',
      image: product.imageUrl || '',
      fallbackImage: product.fallbackImageUrl || '',
      description: product.description || '',
      specs: Array.isArray(product.specs) ? product.specs : [],
    }));
  } catch (error) {
    const isLocalHost = ['localhost', '127.0.0.1'].includes(location.hostname);
    const allowDemo = window.KUCHER_CONFIG?.DEMO_MODE === true || isLocalHost;
    console.warn('[Kucher] API catalog unavailable.', error.message);
    PRODUCTS = allowDemo
      ? (window.PRODUCTS || []).map(product => ({ ...product, sku: product.sku || `KUCHER-${product.id}`, stock: Math.max(0, Number(product.stock) || 0) }))
      : [];
    if (!allowDemo) {
      const alert = document.createElement('div');
      alert.className = 'service-unavailable auth-error';
      alert.setAttribute('role', 'alert');
      alert.textContent = 'Не удалось загрузить демонстрационный каталог из локального хранилища браузера.';
      const target = document.querySelector('main') || document.querySelector('#products')?.parentElement;
      if (target && !document.querySelector('.service-unavailable')) target.prepend(alert);
    }
  }
  const apiCategories = [...new Set(PRODUCTS.map(product => String(product.cat || '').trim()).filter(Boolean))];
  CATEGORIES = apiCategories.length ? apiCategories : DEFAULT_CATEGORIES;
  const savedCart = cart();
  if (savedCart.length && PRODUCTS.length) {
    saveCart(savedCart.map(item => {
      const product = PRODUCTS.find(entry => String(entry.id) === String(item.id));
      if (!product) return item;
      const quantity = product.stock > 0 ? Math.min(item.qty, product.stock, 999) : item.qty;
      return { ...product, qty: quantity };
    }));
  }
  return PRODUCTS;
}

const DEFAULT_CATEGORIES = ['Крепёж', 'Инструменты', 'Расходники', 'Хозтовары', 'Для ремонта'];
let CATEGORIES = [...DEFAULT_CATEGORIES];
const descriptions = {'Крепёж':'Саморезы, дюбели, болты и другой крепёж.','Инструменты':'Ручной и электроинструмент для дома и стройки.','Расходники':'Биты, диски, свёрла и другие материалы.','Хозтовары':'Товары для дома, уборки и мастерской.','Для ремонта':'Герметики, кисти и малярные материалы.'};
const money = value => `${Number(value || 0).toLocaleString('ru-RU', { maximumFractionDigits: 2 })} ₽`;
function readStorage(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch (error) {
    console.warn(`[Kucher] Failed to parse localStorage key "${key}".`, error);
    return fallback;
  }
}
function writeStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    console.warn(`[Kucher] Failed to write localStorage key "${key}".`, error);
    return false;
  }
}
const cartStorageKey = () => CURRENT_USER?.id ? `kucherCart:user:${CURRENT_USER.id}` : 'kucherCart:guest';
const cartCheckoutReady = () => {
  const items = cart();
  return items.length > 0 && items.every(item => {
    const product = PRODUCTS.find(entry => String(entry.id) === String(item.id));
    return Boolean(product && product.stock > 0 && item.qty <= product.stock);
  });
};
const cart = () => {
  const value = readStorage(cartStorageKey(), []);
  if (!Array.isArray(value)) return [];
  return value.filter(item => item && Number.isSafeInteger(Number(item.id)) && Number(item.id) > 0 && Number(item.qty) > 0)
    .map(item => ({ ...item, id: Number(item.id), qty: Math.max(1, Math.min(999, Math.floor(Number(item.qty)))) }));
};
const saveCart = value => {
  const sanitized = (Array.isArray(value) ? value : []).filter(item => item && Number(item.id) > 0)
    .map(item => ({ ...item, qty: Math.max(1, Math.min(999, Math.floor(Number(item.qty) || 1))) }));
  const saved = writeStorage(cartStorageKey(), sanitized);
  updateCartCount();
  return saved;
};
const profile = () => CURRENT_PROFILE && typeof CURRENT_PROFILE === 'object' ? CURRENT_PROFILE : {};
const saveProfile = value => { CURRENT_PROFILE = value && typeof value === 'object' ? value : {}; };
const currentUser = () => CURRENT_USER;
const setCurrentUser = value => { CURRENT_USER = value || null; CURRENT_PROFILE = value ? { ...value } : {}; };
const orders = () => CABINET_ORDERS;
const saveOrders = value => { CABINET_ORDERS = Array.isArray(value) ? value : []; };
const managerRequests = () => CABINET_REQUESTS;
const saveManagerRequests = value => { CABINET_REQUESTS = Array.isArray(value) ? value : []; };
function escapeHTML(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
const getSafeNextPage = () => {
  const allowed = new Set(['cabinet.html', 'cart.html']);
  const raw = new URLSearchParams(window.location.search).get('next');
  if (!raw) return 'cabinet.html';
  try {
    const url = new URL(raw, window.location.href);
    const page = url.pathname.split('/').pop();
    if (url.origin === window.location.origin && !url.search && !url.hash && allowed.has(page)) return page;
  } catch {}
  return 'cabinet.html';
};
const normalizeIdentifier = value => {
  const raw = String(value || '').trim();
  if (raw.includes('@')) return raw.toLowerCase();
  let digits = raw.replace(/\D/g, '');
  if (digits.length === 10) digits = `7${digits}`;
  if (digits.length === 11 && digits.startsWith('8')) digits = `7${digits.slice(1)}`;
  return digits ? `+${digits}` : '';
};
const validIdentifier = value => {
  const v = normalizeIdentifier(value);
  return v.includes('@') ? /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) : /^\+\d{10,15}$/.test(v);
};
const validPhone = value => /^\+?[0-9 ()-]{10,22}$/.test(String(value || '').trim()) && String(value || '').replace(/\D/g, '').length >= 10;
const updateCartCount = () => {
  const el = document.querySelector('.cart-count');
  if (el) el.textContent = cart().reduce((sum, item) => sum + item.qty, 0);
};

function mergeGuestCartAfterAuth() {
  const guest = readStorage('kucherCart:guest', []);
  if (!Array.isArray(guest) || !guest.length || !CURRENT_USER) return;
  if (!window.confirm('В корзине гостя есть товары. Перенести их в корзину аккаунта?')) return;
  const merged = cart();
  guest.forEach(item => {
    const product = PRODUCTS.find(p => String(p.id) === String(item.id));
    if (!product || product.stock <= 0) return;
    const current = merged.find(row => String(row.id) === String(item.id));
    const requested = (current?.qty || 0) + (Number(item.qty) || 1);
    const qty = Math.min(product.stock, 999, requested);
    if (current) current.qty = qty;
    else merged.push({ ...product, qty });
  });
  saveCart(merged);
  writeStorage('kucherCart:guest', []);
}

function header() {
  const current = document.querySelector('.site-header');
  current.outerHTML = `<div class="topbar"><div class="wrap"><span>Зеленоград • корпус 338Б</span><span>Ежедневно 9:00–20:00</span></div></div><header class="site-header"><div class="wrap head"><a class="logo" href="index.html" aria-label="Кучер Строй — на главную"><img src="images/kucher-logo.jpg" alt="КУЧЕР СТРОЙ — крепеж, инструменты, расходники"></a><form class="search" id="search-form"><input name="search" aria-label="Поиск товаров" placeholder="Поиск по названию или артикулу"><button aria-label="Найти">Найти</button></form><span class="availability">Ежедневно 9:00–20:00</span><a class="account-link" href="cabinet.html">Личный кабинет</a><a class="cart-link" href="cart.html"><svg class="cart-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 4h2l2.2 10.2a2 2 0 0 0 2 1.6h7.9a2 2 0 0 0 1.9-1.4L21 8H7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="10" cy="19" r="1.5"/><circle cx="18" cy="19" r="1.5"/></svg><span>Корзина</span> <span class="cart-count">0</span></a></div></header><nav class="wrap nav"><a href="catalog.html">Каталог</a>${CATEGORIES.map(c => `<a href="catalog.html?category=${encodeURIComponent(c)}">${escapeHTML(c)}</a>`).join('')}<a href="delivery.html">Доставка</a><a href="offers.html">Акции и опт</a></nav>`;
  const currentFile = location.pathname.split('/').pop() || 'index.html';
  const navLinks = document.querySelectorAll('.nav a');
  const currentCategory = new URLSearchParams(window.location.search).get('category');
  navLinks.forEach(link => {
    const href = link.getAttribute('href') || '';
    const [path, query] = href.split('?');
    if (path !== currentFile) return;
    if (path === 'catalog.html') {
      const linkCategory = new URLSearchParams(query || '').get('category');
      if (linkCategory ? linkCategory === currentCategory : !currentCategory) {
        link.classList.add('active');
      }
    } else {
      link.classList.add('active');
    }
  });
  document.querySelector('#search-form').addEventListener('submit', e => { e.preventDefault(); const q = String(new FormData(e.currentTarget).get('search') || '').trim(); location.href = `catalog.html${q ? `?search=${encodeURIComponent(q)}` : ''}`; });
}
function requireAuth(){ if(!currentUser()){ location.href='auth.html?next=cabinet.html'; return false; } return true; }
function renderAuth() {
  const loginTab = document.querySelector('[data-auth-tab="login"]');
  const registerTab = document.querySelector('[data-auth-tab="register"]');
  const loginForm = document.querySelector('#login-form');
  const registerForm = document.querySelector('#register-form');
  const isStatic = STATIC_MODE;
  if (isStatic) {
    registerTab.hidden = true;
    registerForm.hidden = true;
    loginForm.hidden = false;
    const note = document.querySelector('.auth-note');
    if (note) note.textContent = 'Автономная демонстрационная версия. Логин: admin, пароль: admin. Данные сохраняются только в этом браузере; это не защищённая система реальных пользователей.';
    document.querySelector('.auth-tabs').hidden = true;
    loginForm.querySelector('[name="identifier"]').placeholder = 'admin';
  }
  const switchTab = tab => {
    const login = isStatic || tab === 'login';
    loginTab.classList.toggle('active', login);
    registerTab.classList.toggle('active', !login);
    loginTab.setAttribute('aria-pressed', String(login));
    registerTab.setAttribute('aria-pressed', String(!login));
    loginForm.hidden = !login;
    registerForm.hidden = login;
  };
  document.querySelectorAll('[data-auth-tab]').forEach(button => button.addEventListener('click', () => switchTab(button.dataset.authTab)));
  if (new URLSearchParams(location.search).get('mode') === 'register') switchTab('register');

  loginForm.addEventListener('submit', async event => {
    event.preventDefault();
    const error = document.querySelector('#login-error');
    const submit = loginForm.querySelector('[type="submit"]');
    error.hidden = true;
    submit.disabled = true;
    submit.textContent = 'Входим…';
    const data = new FormData(loginForm);
    try {
      const result = await apiRequest('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ identifier: STATIC_MODE ? String(data.get('identifier') || '').trim() : normalizeIdentifier(data.get('identifier')), password: String(data.get('password') || '') }),
      });
      setCurrentUser(result.user);
      mergeGuestCartAfterAuth();
      location.href = getSafeNextPage();
    } catch (requestError) {
      error.textContent = requestError.message || 'Не удалось выполнить вход.';
      error.hidden = false;
    } finally {
      submit.disabled = false;
      submit.textContent = 'Войти';
    }
  });

  registerForm.addEventListener('submit', async event => {
    event.preventDefault();
    const data = new FormData(registerForm);
    const name = String(data.get('name') || '').trim();
    const identifier = normalizeIdentifier(data.get('identifier'));
    const password = String(data.get('password') || '');
    const password2 = String(data.get('password2') || '');
    const error = document.querySelector('#register-error');
    const success = document.querySelector('#register-success');
    const submit = registerForm.querySelector('[type="submit"]');
    error.hidden = true; success.hidden = true;
    if (!validIdentifier(identifier)) { error.textContent = 'Введите корректный email или номер телефона.'; error.hidden = false; return; }
    if (password.length < 8 || /\s/.test(password)) { error.textContent = 'Пароль должен содержать не менее 8 символов без пробелов.'; error.hidden = false; return; }
    if (password !== password2) { error.textContent = 'Пароли не совпадают.'; error.hidden = false; return; }
    submit.disabled = true;
    submit.textContent = 'Создаём аккаунт…';
    try {
      const result = await apiRequest('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ name, identifier, password }),
      });
      setCurrentUser(result.user);
      mergeGuestCartAfterAuth();
      success.textContent = 'Аккаунт создан. Открываем личный кабинет…';
      success.hidden = false;
      location.href = getSafeNextPage();
    } catch (requestError) {
      error.textContent = requestError.message || 'Не удалось создать аккаунт.';
      error.hidden = false;
    } finally {
      submit.disabled = false;
      submit.textContent = 'Создать аккаунт';
    }
  });
}
function footer() { document.querySelector('.site-footer').innerHTML = `<div class="wrap footer-content"><div><b>КУЧЕР СТРОЙ</b><p>Крепёж, инструменты и хозтовары для дома и строительства.</p></div><div><p><b>Магазин:</b> Зеленоград, корпус 338Б</p><p><a href="delivery.html">Доставка в радиусе 5 км</a></p></div></div>`; }
function addToCart(id, qty = 1) { const p = PRODUCTS.find(item => String(item.id) === String(id)); if (!p || Number(p.stock) <= 0) return false; const items = cart(); const current = items.find(item => String(item.id) === String(id)); const currentQty = Math.max(0, Number(current?.qty) || 0); const nextQty = Math.min(Number(p.stock), 999, currentQty + Math.max(1, Math.floor(Number(qty) || 1))); if (nextQty <= currentQty) { alert(`На складе доступно ${p.stock} шт. товара «${p.name}».`); return false; } if (current) { current.qty = nextQty; Object.assign(current, p); } else items.push({ ...p, qty: nextQty }); saveCart(items); return true; }
function animateAddToCart(source, imageSrc) { const cartLink = document.querySelector('.cart-link'); if (!cartLink) return Promise.resolve(); const rect = source.getBoundingClientRect(); const cartRect = cartLink.getBoundingClientRect(); const ghost = document.createElement('div'); ghost.className = 'cart-flyer'; const flyerImage = document.createElement('img'); flyerImage.alt = ''; flyerImage.src = imageSrc; ghost.appendChild(flyerImage); Object.assign(ghost.style, { left: `${rect.left + rect.width / 2 - 35}px`, top: `${rect.top + rect.height / 2 - 35}px` }); document.body.appendChild(ghost); requestAnimationFrame(() => { ghost.style.transform = `translate(${cartRect.left + cartRect.width / 2 - (rect.left + rect.width / 2) }px, ${cartRect.top + cartRect.height / 2 - (rect.top + rect.height / 2)}px) scale(.18)`; ghost.style.opacity = '0.15'; }); setTimeout(() => ghost.remove(), 650); return Promise.resolve(); }

function categoryIcon(name) { const icons = {
  'Крепёж':'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4h8M7 7h10M9 7v12m6-12v12M6 19h12M10 4v3m4-3v3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M8 12h8M9 15h6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  'Инструменты':'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 6.5a4.5 4.5 0 0 0 3.9 6.7L12 19.6a2 2 0 0 1-2.8-2.8l6.4-6.4A4.5 4.5 0 0 0 14.5 6.5Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="m15.5 5.5 3-3 3 3-3 3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
  'Расходники':'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="2.5" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>',
  'Хозтовары':'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10h16M6 10v9h12v-9M8 10V6h8v4M9 6V4h6v2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
  'Для ремонта':'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19h16M7 15h10M9 5h6l2 4-5 6-5-6 2-4Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>'
}; return icons[name] || icons['Хозтовары']; }
function categories(active) { return CATEGORIES.map(c => `<button class="category ${active === c ? 'active' : ''}" data-category="${escapeHTML(c)}"><span class="category-icon" aria-hidden="true">${categoryIcon(c)}</span><strong>${escapeHTML(c)}</strong><span>${escapeHTML(descriptions[c] || `Товары категории «${c}».`)}</span></button>`).join(''); }
function galleryImages(product) { return product.images?.length ? product.images : [product.image]; }
function card(p) {
  const images = galleryImages(p);
  const stock = Math.max(0, Number(p.stock) || 0);
  return `<article class="product-card"><a class="product-image" href="product.html?id=${encodeURIComponent(p.id)}"><img src="${escapeHTML(images[0])}" data-fallback="${escapeHTML(p.fallbackImage || '')}" alt="${escapeHTML(p.name)}" loading="lazy">${images.length > 1 ? `<span class="photo-count">${images.length} фото</span>` : ''}</a><div class="product-body"><span class="badge">${escapeHTML(p.badge || '')}</span><a class="product-name" href="product.html?id=${encodeURIComponent(p.id)}">${escapeHTML(p.name)}</a><div class="product-meta"><span>Арт. ${escapeHTML(p.sku || `KUCHER-${p.id}`)}</span><span class="stock-label ${stock > 0 ? 'in-stock' : 'out-of-stock'}">${stock > 0 ? `В наличии: ${stock} шт.` : 'Нет в наличии'}</span></div><div class="price">${money(p.price)}</div><button class="button card-action" data-add="${escapeHTML(p.id)}" ${stock <= 0 ? 'disabled aria-disabled="true"' : ''}>${stock > 0 ? 'В корзину' : 'Нет в наличии'}</button></div></article>`;
}
function openOrderChoice(productName = '') {
  // One prompt per tab keeps shopping uninterrupted; the cart always has a permanent contact form.
  if (sessionStorage.getItem('kucherOrderChoiceShown')) return;
  sessionStorage.setItem('kucherOrderChoiceShown', '1');
  document.querySelector('.order-choice-modal')?.remove();
  const modal = document.createElement('div');
  modal.className = 'order-choice-modal';
  modal.innerHTML = `<div class="order-choice-backdrop"></div><div class="order-choice-card" role="dialog" aria-modal="true" aria-labelledby="order-choice-title"><button class="order-choice-close" type="button" aria-label="Закрыть">×</button><span class="eyebrow eyebrow-dark">Товар добавлен</span><h2 id="order-choice-title">${productName ? `«${escapeHTML(productName)}» добавлен в корзину` : 'Товар добавлен в корзину'}</h2><p>Как хотите оформить заказ?</p><div class="order-choice-actions"><button class="button button-primary" type="button" data-manager-choice>Оставить номер — свяжется менеджер</button><a class="button choice-secondary" href="cabinet.html">Оформить самому</a></div><form class="manager-form" hidden><label>Ваш номер телефона<input name="phone" type="tel" autocomplete="tel" placeholder="+7 (___) ___-__-__" required></label><label>Имя <span class="optional">необязательно</span><input name="name" type="text" autocomplete="name" maxlength="100" placeholder="Как к вам обращаться"></label><label>Комментарий <span class="optional">необязательно</span><textarea name="comment" maxlength="500" placeholder="Что нужно уточнить менеджеру"></textarea></label><button class="button button-primary" type="submit">Оставить заявку</button><p class="manager-success" role="status" hidden>Заявка будет сохранена в этом браузере.</p><p class="manager-error" role="alert" hidden></p></form></div>`;
  document.body.appendChild(modal);
  if (!currentUser()) {
    modal.querySelector('.order-choice-card > p').textContent = 'Заказ можно оформить после входа. Заявку менеджеру можно оставить без аккаунта.';
    modal.querySelector('.order-choice-actions').innerHTML = '<a class="button button-primary" href="auth.html?next=cabinet.html">Войти</a><a class="button choice-secondary" href="auth.html?mode=register&next=cabinet.html">Зарегистрироваться</a><button class="button choice-secondary" type="button" data-manager-choice>Оставить номер — свяжется менеджер</button>';
  }
  const close = () => modal.remove();
  modal.querySelector('.order-choice-close').onclick = close;
  modal.querySelector('.order-choice-backdrop').onclick = close;
  modal.querySelector('[data-manager-choice]').onclick = () => {
    modal.querySelector('.manager-form').hidden = false;
    modal.querySelector('[data-manager-choice]').hidden = true;
    modal.querySelector('[name="phone"]').focus();
  };
  modal.querySelector('.manager-form').onsubmit = async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const submit = form.querySelector('[type="submit"]');
    const success = form.querySelector('.manager-success');
    const error = form.querySelector('.manager-error');
    success.hidden = true; error.hidden = true;
    const phone = String(data.get('phone') || '').trim();
    if (!validPhone(phone)) { error.textContent = 'Введите корректный телефон для связи.'; error.hidden = false; return; }
    submit.disabled = true; submit.textContent = 'Отправляем…';
    try {
      const result = await apiRequest('/manager-requests', {
        method: 'POST',
        body: JSON.stringify({ name: String(data.get('name') || '').trim(), phone, comment: String(data.get('comment') || '').trim(), items: cart().map(item => ({ productId: item.id, quantity: item.qty })) }),
      });
      success.textContent = `Заявка №${result.id} сохранена в этом браузере. В автономной версии она доступна только на этом устройстве.`;
      success.hidden = false;
      form.querySelectorAll('input,textarea').forEach(field => field.disabled = true);
    } catch (requestError) {
      error.textContent = requestError.message || 'Заявка не отправлена. Проверьте соединение и повторите попытку.';
      error.hidden = false;
    } finally {
      submit.disabled = false; submit.textContent = 'Оставить заявку';
    }
  };
}
function bindAddButtons() { document.querySelectorAll('[data-add]').forEach(button => button.addEventListener('click', () => { const id = Number(button.dataset.add); const p = PRODUCTS.find(item => item.id === id); if (!p || !addToCart(id)) return; button.textContent = 'Добавлено'; animateAddToCart(button.closest('.product-card')?.querySelector('.product-image') || button, galleryImages(p)[0]); openOrderChoice(p.name); })); }
function bindCategories() { document.querySelectorAll('[data-category]').forEach(button => button.addEventListener('click', () => location.href = `catalog.html?category=${encodeURIComponent(button.dataset.category)}`)); }
function initDeliveryMap() {
  const mapElement = document.querySelector('#delivery-map');
  if (!mapElement || mapElement.dataset.mapInitialized === '1') return;
  mapElement.dataset.mapInitialized = '1';
  const center = [55.993872, 37.214714];
  const deliveryRadius = 5000;
  const showFallback = (message = '') => {
    mapElement.innerHTML = `<div class="map-api-placeholder"><strong>Зона доставки — 5 км</strong><span>Зеленоград, корпус 338Б</span>${message ? `<p>${escapeHTML(message)}</p>` : ''}<a class="map-fallback-link" target="_blank" rel="noopener noreferrer" href="https://yandex.ru/maps/?text=${encodeURIComponent('Зеленоград корпус 338Б')}">Открыть в Яндекс Картах</a></div>`;
  };
  const createMap = () => {
    if (!window.ymaps || mapElement.dataset.mapReady === '1') return;
    const target = document.createElement('div');
    target.id = 'yandex-map';
    target.style.cssText = 'width:100%;height:100%';
    mapElement.replaceChildren(target);
    mapElement.dataset.mapReady = '1';
    const map = new ymaps.Map(target, { center, zoom: 11, controls: ['zoomControl', 'fullscreenControl'] }, { suppressMapOpenBlock: true });
    const circle = new ymaps.Circle([center, deliveryRadius], {
      hintContent: 'Зона доставки — 5 км',
      balloonContent: '<b>Зона доставки</b><br>Радиус 5 км от корпуса 338Б',
    }, { fillColor: '#F36C2126', strokeColor: '#F36C21', strokeOpacity: 0.9, strokeWidth: 3, draggable: false });
    const placemark = new ymaps.Placemark(center, {
      hintContent: 'КУЧЕР СТРОЙ — корпус 338Б',
      balloonContent: '<b>КУЧЕР СТРОЙ</b><br>Зеленоград, корпус 338Б<br>Радиус доставки: 5 км',
    }, { preset: 'islands#orangeDotIcon' });
    map.geoObjects.add(circle);
    map.geoObjects.add(placemark);
    map.setBounds(circle.geometry.getBounds(), { checkZoomRange: true, zoomMargin: 24 });
  };
  const key = String(window.KUCHER_CONFIG?.YANDEX_MAPS_API_KEY || '').trim();
  if (!key) {
    showFallback('Интерактивная карта не настроена. Добавьте ограниченный по домену ключ в config.js.');
    return;
  }
  if (window.ymaps) { window.ymaps.ready(createMap); return; }
  const script = document.createElement('script');
  script.src = `https://api-maps.yandex.ru/2.1/?apikey=${encodeURIComponent(key)}&lang=ru_RU`;
  script.async = true;
  script.onload = () => { if (window.ymaps) window.ymaps.ready(createMap); else showFallback('Яндекс Карты загрузились некорректно. Проверьте ключ API.'); };
  script.onerror = () => showFallback('Не удалось загрузить Яндекс Карты.');
  document.head.appendChild(script);
}
function renderHome() { document.querySelector('#categories').innerHTML = categories(); document.querySelector('#products').innerHTML = PRODUCTS.slice(0, 8).map(card).join(''); const count = document.querySelector('#product-count-stat'); if (count) count.textContent = String(PRODUCTS.length); bindCategories(); bindAddButtons(); initDeliveryMap(); }
function renderDelivery() { initDeliveryMap(); }
function renderCatalog() {
  const params = new URLSearchParams(location.search);
  const category = params.get('category') || '';
  const query = (params.get('search') || '').toLowerCase().trim();
  const selectedSpec = params.get('spec') || '';
  const sort = params.get('sort') || 'default';
  const specOptions = [...new Set(PRODUCTS.flatMap(product => (Array.isArray(product.specs) ? product.specs : []).map(spec => `${spec[0]}: ${spec[1]}`)))];
  const categoryFilter = document.querySelector('#category-filter');
  const specFilter = document.querySelector('#spec-filter');
  const sortFilter = document.querySelector('#sort-filter');
  categoryFilter.replaceChildren(new Option('Все категории', ''));
  CATEGORIES.forEach(value => categoryFilter.add(new Option(value, value)));
  specFilter.replaceChildren(new Option('Все характеристики', ''));
  specOptions.forEach(value => specFilter.add(new Option(value, value)));
  categoryFilter.value = CATEGORIES.includes(category) ? category : '';
  specFilter.value = selectedSpec;
  sortFilter.value = ['default', 'price-asc', 'price-desc', 'name'].includes(sort) ? sort : 'default';
  let list = PRODUCTS.filter(product => {
    const specifications = (Array.isArray(product.specs) ? product.specs.flat() : []).join(' ');
    const searchable = `${product.name} ${product.sku || ''} ${product.cat || ''} ${specifications}`.toLowerCase();
    return (!category || product.cat === category) && (!query || searchable.includes(query)) && (!selectedSpec || (product.specs || []).some(([name, value]) => `${name}: ${value}` === selectedSpec));
  });
  if (sortFilter.value === 'price-asc') list.sort((a, b) => a.price - b.price);
  if (sortFilter.value === 'price-desc') list.sort((a, b) => b.price - a.price);
  if (sortFilter.value === 'name') list.sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  const updateUrl = () => {
    const next = new URLSearchParams();
    if (categoryFilter.value) next.set('category', categoryFilter.value);
    if (query) next.set('search', query);
    if (specFilter.value) next.set('spec', specFilter.value);
    if (sortFilter.value !== 'default') next.set('sort', sortFilter.value);
    location.href = `catalog.html${next.toString() ? `?${next}` : ''}`;
  };
  [categoryFilter, specFilter, sortFilter].forEach(el => el.addEventListener('change', updateUrl));
  document.querySelector('#categories').innerHTML = categories(category);
  document.querySelector('#catalog-title').textContent = category || (query ? `Поиск: ${query}` : 'Каталог товаров');
  document.querySelector('#catalog-description').textContent = category ? (descriptions[category] || `Товары категории «${category}».`) : 'Отфильтруйте товары по категории, артикулу и характеристикам.';
  document.querySelector('#result').textContent = `${list.length} товаров`;
  document.querySelector('#products').innerHTML = list.map(card).join('');
  document.querySelector('#empty').hidden = Boolean(list.length);
  bindCategories(); bindAddButtons();
}
function renderGallery(product) { const images = galleryImages(product), controls = images.length > 1; return `<div class="gallery"><div class="gallery-main"><img id="gallery-image" src="${escapeHTML(images[0])}" data-fallback="${escapeHTML(product.fallbackImage || '')}" alt="${escapeHTML(product.name)}">${controls ? '<button class="gallery-control gallery-prev" type="button" aria-label="Предыдущее фото">‹</button><button class="gallery-control gallery-next" type="button" aria-label="Следующее фото">›</button>' : ''}</div><div class="gallery-thumbnails">${images.map((image,index) => `<button type="button" class="gallery-thumbnail ${index === 0 ? 'active' : ''}" data-gallery-index="${index}" aria-label="Фото ${index + 1}"><img src="${escapeHTML(image)}" data-fallback="${escapeHTML(product.fallbackImage || '')}" alt=""></button>`).join('')}</div><p class="gallery-status" id="gallery-status">Фото 1 из ${images.length}</p></div>`; }
function bindGallery(product) { const images = galleryImages(product); let selected = 0; const show = index => { selected = (index + images.length) % images.length; document.querySelector('#gallery-image').src = images[selected]; document.querySelector('#gallery-status').textContent = `Фото ${selected + 1} из ${images.length}`; document.querySelectorAll('[data-gallery-index]').forEach(button => button.classList.toggle('active', Number(button.dataset.galleryIndex) === selected)); }; document.querySelectorAll('[data-gallery-index]').forEach(button => button.addEventListener('click', () => show(Number(button.dataset.galleryIndex)))); document.querySelector('.gallery-prev')?.addEventListener('click', () => show(selected - 1)); document.querySelector('.gallery-next')?.addEventListener('click', () => show(selected + 1)); }
function renderProduct() {
  if (!PRODUCTS.length) {
    document.querySelector('#product-detail').innerHTML = '<p class="empty">Каталог пока недоступен. Попробуйте обновить страницу.</p>';
    return;
  }
  const id = Number(new URLSearchParams(location.search).get('id'));
  const product = PRODUCTS.find(item => item.id === id) || PRODUCTS[0];
  const stock = Math.max(0, Number(product.stock) || 0);
  document.title = `${product.name} — Кучер строй`;
  document.querySelector('#product-detail').innerHTML = `<div class="detail-image">${renderGallery(product)}</div><article class="detail-info"><span class="badge">${escapeHTML(product.badge || '')}</span><p>${escapeHTML(product.cat)}</p><h1>${escapeHTML(product.name)}</h1><p class="product-sku">Артикул: <strong>${escapeHTML(product.sku || `KUCHER-${product.id}`)}</strong></p><p class="stock-label ${stock > 0 ? 'in-stock' : 'out-of-stock'}">${stock > 0 ? `В наличии: ${stock} шт.` : 'Нет в наличии'}</p><p class="description">${escapeHTML(product.description)}</p><div class="detail-price">${money(product.price)}</div><div class="add-row"><input id="product-quantity" class="quantity" type="number" min="1" max="${stock}" value="1" ${stock <= 0 ? 'disabled' : ''} aria-label="Количество товара"><button id="add-product" class="button button-primary" ${stock <= 0 ? 'disabled' : ''}>${stock > 0 ? 'Добавить в корзину' : 'Нет в наличии'}</button></div><div class="specs">${(Array.isArray(product.specs) ? product.specs : []).map(spec => `<div class="spec"><span>${escapeHTML(spec[0])}</span><b>${escapeHTML(spec[1])}</b></div>`).join('')}</div></article>`;
  bindGallery(product);
  document.querySelector('#add-product').addEventListener('click', () => {
    const quantityInput = document.querySelector('#product-quantity');
    const qty = Math.max(1, Math.min(stock, Math.floor(Number(quantityInput.value) || 1)));
    if (!addToCart(product.id, qty)) return;
    const button = document.querySelector('#add-product');
    button.textContent = 'Добавлено';
    animateAddToCart(document.querySelector('.gallery-main') || button, galleryImages(product)[0]);
    openOrderChoice(product.name);
    setTimeout(() => { if (button.isConnected) button.textContent = 'Добавить в корзину'; }, 900);
  });
}
function renderCart() {
  const empty = document.querySelector('#cart-empty');
  const content = document.querySelector('#cart-content');
  const itemsEl = document.querySelector('#cart-items');
  const clearButton = document.querySelector('#clear-cart');
  const items = cart();
  empty.hidden = Boolean(items.length);
  content.hidden = !items.length;
  if (clearButton) clearButton.disabled = !items.length;
  if (!items.length) {
    itemsEl.innerHTML = '';
    const total = document.querySelector('#cart-total');
    if (total) total.textContent = money(0);
  } else {
    itemsEl.innerHTML = items.map(item => {
      const product = PRODUCTS.find(p => String(p.id) === String(item.id));
      const stock = Math.max(0, Number(product?.stock ?? item.stock) || 0);
      const qty = Math.max(1, Number(item.qty) || 1);
      return `<article class="cart-item"><img src="${escapeHTML(product?.image || item.image || '')}" data-fallback="${escapeHTML(product?.fallbackImage || item.fallbackImage || '')}" alt="${escapeHTML(product?.name || item.name)}"><div><span class="badge">${escapeHTML(product?.cat || item.cat || '')}</span><h3>${escapeHTML(product?.name || item.name)}</h3><small>Артикул: ${escapeHTML(product?.sku || item.sku || `KUCHER-${item.id}`)}</small><b>${money(product?.price ?? item.price)}</b><p class="stock-label ${stock > 0 ? 'in-stock' : 'out-of-stock'}">${stock > 0 ? `В наличии: ${stock} шт.` : 'Нет в наличии — удалите товар или обратитесь к менеджеру'}</p></div><div class="item-actions"><label>Количество<input aria-label="Количество ${escapeHTML(product?.name || item.name)}" type="number" min="1" max="${Math.max(1, stock)}" value="${Math.min(qty, Math.max(1, stock))}" data-quantity="${item.id}" ${stock <= 0 ? 'disabled' : ''}></label><div><b>${stock > 0 && product ? money((Number(product.price) || 0) * Math.min(qty, stock)) : '—'}</b></div><button class="remove" type="button" data-remove="${item.id}">Удалить</button></div></article>`;
    }).join('');
    document.querySelector('#cart-total').textContent = money(items.reduce((sum, item) => {
      const product = PRODUCTS.find(p => String(p.id) === String(item.id));
      return product && Number(product.stock) > 0 ? sum + (Number(product.price) || 0) * Math.min(item.qty, product.stock) : sum;
    }, 0));
  }
  const stockNotice = document.querySelector('.order-summary .notice');
  if (stockNotice) stockNotice.textContent = items.length && !cartCheckoutReady()
    ? 'В корзине есть недоступные товары или количество превышает остаток. Удалите их или обратитесь к менеджеру перед оформлением.'
    : 'Демонстрационные цены и остатки хранятся в локальном браузере.';

  itemsEl.querySelectorAll('[data-quantity]').forEach(input => input.addEventListener('change', () => {
    const updated = cart();
    const item = updated.find(row => String(row.id) === String(input.dataset.quantity));
    const product = PRODUCTS.find(p => String(p.id) === String(input.dataset.quantity));
    if (!item || !product) return;
    const requested = Math.max(1, Math.floor(Number(input.value) || 1));
    item.qty = Math.min(Math.max(1, Number(product.stock) || 1), requested, 999);
    Object.assign(item, product);
    saveCart(updated); renderCart();
  }));
  itemsEl.querySelectorAll('[data-remove]').forEach(button => button.addEventListener('click', () => {
    saveCart(cart().filter(item => String(item.id) !== String(button.dataset.remove)));
    renderCart();
  }));
  if (clearButton) clearButton.onclick = () => { if (cart().length && window.confirm('Удалить все товары из корзины?')) { saveCart([]); renderCart(); } };

  const managerPanel = document.querySelector('#cart-manager-contact');
  const managerToggle = document.querySelector('#show-cart-manager-form');
  const managerForm = document.querySelector('#cart-manager-form');
  if (managerToggle && managerForm && managerForm.dataset.bound !== '1') {
    managerToggle.addEventListener('click', () => {
      managerForm.hidden = !managerForm.hidden;
      if (!managerForm.hidden) managerForm.querySelector('[name="phone"]').focus();
    });
    managerForm.addEventListener('submit', async event => {
      event.preventDefault();
      const data = new FormData(managerForm);
      const phone = String(data.get('phone') || '').trim();
      const name = String(data.get('name') || '').trim();
      const comment = String(data.get('comment') || '').trim();
      const error = managerForm.querySelector('[data-manager-error]');
      const success = managerForm.querySelector('[data-manager-success]');
      const submit = managerForm.querySelector('[type="submit"]');
      error.hidden = true; success.hidden = true;
      if (!validPhone(phone)) { error.textContent = 'Введите корректный телефон для связи.'; error.hidden = false; return; }
      submit.disabled = true; submit.textContent = 'Отправляем…';
      try {
        const result = await apiRequest('/manager-requests', { method: 'POST', body: JSON.stringify({ phone, name, comment, items: cart().map(item => ({ productId: item.id, quantity: item.qty })) }) });
        success.textContent = `Заявка №${result.id} сохранена в этом браузере. В автономной версии она доступна только на этом устройстве.`;
        success.hidden = false;
        managerForm.reset();
      } catch (requestError) {
        error.textContent = requestError.message || 'Не удалось отправить заявку. Попробуйте ещё раз.';
        error.hidden = false;
      } finally {
        submit.disabled = false; submit.textContent = 'Отправить заявку';
      }
    });
    managerForm.dataset.bound = '1';
  }
  if (managerPanel && new URLSearchParams(location.search).get('contact') === 'manager' && managerForm) managerForm.hidden = false;
}

async function renderCabinet() {
  if (!requireAuth()) return;
  const profileForm = document.querySelector('#profile-form');
  const historyEl = document.querySelector('#order-history');
  const requestsEl = document.querySelector('#request-history');
  const cartEl = document.querySelector('#cabinet-cart');
  const searchInput = document.querySelector('#order-search');
  const filterSelect = document.querySelector('#order-filter');
  const dateLabel = value => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'Дата не указана' : date.toLocaleString('ru-RU', { dateStyle: 'medium', timeStyle: 'short' });
  };
  const requestStatusLabels = { NEW: 'Новая заявка', IN_PROGRESS: 'В работе', CONTACTED: 'Связались', CLOSED: 'Закрыта' };
  const statusMeta = {
    PENDING: { label: 'Ожидает подтверждения', className: 'pending' },
    CONFIRMED: { label: 'Подтверждён', className: 'confirmed' },
    PROCESSING: { label: 'Собирается', className: 'processing' },
    SHIPPED: { label: 'Передан в доставку', className: 'shipped' },
    DELIVERED: { label: 'Доставлен', className: 'delivered' },
    CANCELLED: { label: 'Отменён', className: 'cancelled' },
  };
  const safeStatus = order => statusMeta[order.status] || statusMeta.PENDING;
  const quantityOf = list => (Array.isArray(list) ? list : []).reduce((sum, item) => sum + Math.max(0, Number(item.qty ?? item.quantity) || 0), 0);
  const getTotal = list => (Array.isArray(list) ? list : []).reduce((sum, item) => sum + (Number(item.price) || 0) * Math.max(0, Number(item.qty ?? item.quantity) || 0), 0);
  let history = [];
  let requests = [];
  const initialUser = currentUser();

  const logoutButton = document.querySelector('#cabinet-logout');
  logoutButton.onclick = async () => {
    logoutButton.disabled = true;
    try {
      await apiRequest('/auth/logout', { method: 'POST' });
      setCurrentUser(null);
      location.href = 'index.html';
    } catch (error) {
      alert(error.message || 'Не удалось завершить сеанс. Проверьте соединение и повторите попытку.');
      logoutButton.disabled = false;
    }
  };

  const refreshProfileSummary = () => {
    const p = profile();
    document.querySelector('#cabinet-greeting').textContent = p.name ? p.name.split(/\s+/)[0] : 'покупатель';
    document.querySelector('#cabinet-identity').textContent = p.identifier || initialUser.identifier || p.email || p.phone || 'Ваш аккаунт Kucher';
    const fields = [
      ['Имя', p.name], ['Email', p.email], ['Телефон', p.phone], ['Адрес', p.address], ['Организация', p.company],
    ].filter(([, value]) => String(value || '').trim());
    const summary = document.querySelector('#cabinet-profile-summary');
    summary.innerHTML = fields.length
      ? fields.map(([label, value]) => `<div class="cabinet-profile-summary-row"><span>${escapeHTML(label)}</span><strong>${escapeHTML(value)}</strong></div>`).join('')
      : '<p class="cabinet-empty-note">Добавьте контактные данные и адрес доставки, чтобы быстрее оформлять покупки.</p>';
  };

  const renderMetrics = () => {
    const cartItems = cart();
    const spend = history.filter(order => order.status !== 'CANCELLED').reduce((sum, order) => sum + (Number(order.total) || getTotal(order.items)), 0);
    document.querySelector('#cabinet-stat-orders').textContent = String(history.length);
    document.querySelector('#cabinet-stat-spent').textContent = money(spend);
    document.querySelector('#cabinet-stat-cart').textContent = String(quantityOf(cartItems));
    document.querySelector('#cabinet-stat-requests').textContent = String(requests.length);
    document.querySelector('#cabinet-orders-count').textContent = String(history.length);
    document.querySelector('#cabinet-cart-count').textContent = String(quantityOf(cartItems));
    document.querySelector('#cabinet-requests-count').textContent = String(requests.length);
  };

  const renderRecentOrders = () => {
    const recentEl = document.querySelector('#cabinet-recent-orders');
    if (!history.length) {
      recentEl.innerHTML = '<div class="cabinet-empty-state compact"><span class="cabinet-empty-symbol" aria-hidden="true">▤</span><strong>Заказов пока нет</strong><p>Оформленные покупки будут отображаться здесь.</p><a class="button button-secondary" href="catalog.html">Перейти в каталог</a></div>';
      return;
    }
    const order = history[0];
    const status = safeStatus(order);
    const total = Number(order.total) || getTotal(order.items);
    recentEl.innerHTML = `<article class="cabinet-recent-order"><div class="cabinet-recent-order-top"><strong>Заказ №${escapeHTML(order.id)}</strong><span class="cabinet-status ${status.className}">${status.label}</span></div><p>${escapeHTML(dateLabel(order.createdAt))} · ${quantityOf(order.items)} шт.</p><div class="cabinet-recent-order-bottom"><b>${money(total)}</b><button class="cabinet-text-button" type="button" data-cabinet-tab="orders">Открыть заказ →</button></div></article>`;
  };

  const renderOrderList = () => {
    const query = String(searchInput?.value || '').trim().toLowerCase();
    const statusFilter = filterSelect?.value || 'all';
    const filtered = history.filter(order => {
      const status = order.status || 'PENDING';
      const haystack = [order.id, ...(Array.isArray(order.items) ? order.items.flatMap(item => [item.name, item.sku]) : [])].join(' ').toLowerCase();
      return (statusFilter === 'all' || status === statusFilter) && (!query || haystack.includes(query));
    });
    if (!history.length) {
      historyEl.innerHTML = '<div class="cabinet-empty-state"><span class="cabinet-empty-symbol" aria-hidden="true">▤</span><h3>История заказов пока пуста</h3><p>После оформления заказа он появится здесь со статусом, составом и данными доставки.</p><a class="button button-primary" href="catalog.html">Начать покупки</a></div>';
      return;
    }
    if (!filtered.length) {
      historyEl.innerHTML = '<div class="cabinet-empty-state"><h3>Заказы не найдены</h3><p>Измените поисковый запрос или выберите другой статус.</p><button class="button button-secondary" type="button" id="cabinet-reset-order-filter">Сбросить фильтры</button></div>';
      document.querySelector('#cabinet-reset-order-filter').onclick = () => { searchInput.value = ''; filterSelect.value = 'all'; renderOrderList(); };
      return;
    }
    historyEl.innerHTML = filtered.map(order => {
      const status = safeStatus(order);
      const items = Array.isArray(order.items) ? order.items : [];
      const total = Number(order.total) || getTotal(items);
      const itemSummary = items.map(item => `<li><span>${escapeHTML(item.name || 'Товар')}<small>${item.sku ? ` · арт. ${escapeHTML(item.sku)}` : ''}</small></span><span>${Math.max(0, Number(item.qty ?? item.quantity) || 0)} × ${money(item.price)}</span><strong>${money((Number(item.price) || 0) * (Number(item.qty ?? item.quantity) || 0))}</strong></li>`).join('');
      const canCancel = order.status === 'PENDING';
      return `<article class="cabinet-order-card"><div class="cabinet-order-top"><div><span class="cabinet-order-number">ЗАКАЗ №${escapeHTML(order.id)}</span><p>${escapeHTML(dateLabel(order.createdAt))}</p></div><span class="cabinet-status ${status.className}">${status.label}</span></div><div class="cabinet-order-summary"><div><span>Товары</span><strong>${quantityOf(items)} шт.</strong></div><div><span>Сумма</span><strong>${money(total)}</strong></div><div><span>Получатель</span><strong>${escapeHTML(order.name || profile().name || 'Покупатель')}</strong></div></div><details class="cabinet-order-details"><summary>Состав и доставка</summary><ul class="cabinet-order-items">${itemSummary || '<li><span>Состав заказа не сохранён</span></li>'}</ul><div class="cabinet-order-delivery"><span>Телефон</span><strong>${escapeHTML(order.phone || profile().phone || 'Не указан')}</strong><span>Адрес доставки</span><strong>${escapeHTML(order.address || 'Не указан')}</strong>${order.comment ? `<span>Комментарий</span><strong>${escapeHTML(order.comment)}</strong>` : ''}</div></details><div class="cabinet-order-actions"><button class="button button-secondary" type="button" data-repeat-order="${escapeHTML(order.id)}">Повторить заказ</button>${canCancel ? `<button class="cabinet-danger-button" type="button" data-cancel-order="${escapeHTML(order.id)}">Отменить заказ</button>` : ''}</div></article>`;
    }).join('');

    historyEl.querySelectorAll('[data-repeat-order]').forEach(button => {
      button.onclick = () => {
        const order = history.find(item => String(item.id) === String(button.dataset.repeatOrder));
        if (!order || !Array.isArray(order.items) || !order.items.length) return;
        const nextCart = cart();
        for (const item of order.items) {
          const productId = item.productId ?? item.id;
          const product = PRODUCTS.find(entry => String(entry.id) === String(productId));
          if (!product || Number(product.stock) <= 0) continue;
          const requestedQty = Math.max(1, Number(item.qty ?? item.quantity) || 1);
          const existing = nextCart.find(entry => String(entry.id) === String(productId));
          if (existing) existing.qty = Math.min(product.stock, 999, existing.qty + requestedQty);
          else nextCart.push({ ...product, qty: Math.min(product.stock, 999, requestedQty) });
        }
        saveCart(nextCart); switchCabinetTab('cart'); renderCabinetCart(); renderMetrics();
      };
    });
    historyEl.querySelectorAll('[data-cancel-order]').forEach(button => {
      button.onclick = async () => {
        if (!window.confirm('Отменить этот заказ?')) return;
        button.disabled = true;
        try {
          const updated = await apiRequest(`/orders/${encodeURIComponent(button.dataset.cancelOrder)}/cancel`, { method: 'PATCH' });
          history = history.map(item => String(item.id) === String(updated.id) ? updated : item);
          saveOrders(history); renderOrderList(); renderRecentOrders(); renderMetrics();
          await loadProducts();
        } catch (error) {
          alert(error.message || 'Не удалось отменить заказ.');
          button.disabled = false;
        }
      };
    });
  };

  const renderCabinetCart = () => {
    const items = cart();
    if (!items.length) {
      cartEl.innerHTML = '<div class="cabinet-empty-state"><span class="cabinet-empty-symbol" aria-hidden="true">▣</span><h3>Корзина пуста</h3><p>Добавьте товары в каталоге, чтобы оформить заказ.</p><a class="button button-primary" href="catalog.html">Перейти в каталог</a></div>';
    } else {
      cartEl.innerHTML = `<div class="cabinet-cart-list">${items.map(item => {
        const product = PRODUCTS.find(p => String(p.id) === String(item.id));
        const stock = Math.max(0, Number(product?.stock) || 0);
        const name = product?.name || item.name || 'Товар';
        const price = Number(product?.price ?? item.price) || 0;
        return `<article class="cabinet-cart-line"><img src="${escapeHTML(product?.image || item.image || '')}" data-fallback="${escapeHTML(product?.fallbackImage || item.fallbackImage || '')}" alt="${escapeHTML(name)}"><div class="cabinet-cart-line-info"><a href="product.html?id=${encodeURIComponent(item.id)}">${escapeHTML(name)}</a><span>Арт. ${escapeHTML(product?.sku || item.sku || `KUCHER-${item.id}`)}</span><span class="stock-label ${stock > 0 ? 'in-stock' : 'out-of-stock'}">${stock > 0 ? `В наличии: ${stock} шт.` : 'Нет в наличии'}</span><b>${money(price)}</b><button class="cabinet-text-button cabinet-remove-item" type="button" data-cabinet-remove="${escapeHTML(item.id)}">Удалить</button></div><label class="cabinet-qty-label">Кол-во<input type="number" min="1" max="${Math.max(1, stock)}" value="${Math.min(Math.max(1, Number(item.qty) || 1), Math.max(1, stock))}" aria-label="Количество ${escapeHTML(name)}" data-cabinet-quantity="${escapeHTML(item.id)}" ${stock <= 0 ? 'disabled' : ''}></label><strong class="cabinet-cart-line-total">${stock > 0 ? money(price * Math.min(Number(item.qty) || 1, stock)) : '—'}</strong></article>`;
      }).join('')}</div>${!cartCheckoutReady() ? '<p class="auth-error" role="alert">В корзине есть недоступные товары или количество превышает остаток. Удалите проблемные позиции либо <a href="cart.html?contact=manager">оставьте заявку менеджеру</a>.</p>' : ''}<div class="cabinet-total"><span>Итого по доступным товарам</span><b>${money(items.reduce((sum, item) => { const product = PRODUCTS.find(p => String(p.id) === String(item.id)); return product && product.stock > 0 ? sum + (Number(product.price) || 0) * Math.min(item.qty, product.stock) : sum; }, 0))}</b></div>`;
    }
    const validItems = cartCheckoutReady();
    const clearButton = document.querySelector('#cabinet-clear-cart');
    clearButton.hidden = !items.length; clearButton.disabled = !items.length;
    document.querySelector('#self-checkout').disabled = !validItems;
    cartEl.querySelectorAll('[data-cabinet-remove]').forEach(button => button.onclick = () => { saveCart(cart().filter(item => String(item.id) !== String(button.dataset.cabinetRemove))); renderCabinetCart(); renderMetrics(); });
    cartEl.querySelectorAll('[data-cabinet-quantity]').forEach(input => input.onchange = () => {
      const id = input.dataset.cabinetQuantity;
      const product = PRODUCTS.find(p => String(p.id) === String(id));
      if (!product || product.stock <= 0) return;
      const qty = Math.min(product.stock, 999, Math.max(1, Math.floor(Number(input.value) || 1)));
      saveCart(cart().map(item => String(item.id) === String(id) ? { ...product, qty } : item));
      renderCabinetCart(); renderMetrics();
    });
    renderMetrics();
  };

  const renderRequests = () => {
    if (!requests.length) {
      requestsEl.innerHTML = '<div class="cabinet-empty-state"><span class="cabinet-empty-symbol" aria-hidden="true">☏</span><h3>Заявок пока нет</h3><p>Заявки, созданные после входа, появятся здесь. В автономной версии история доступна только в текущем браузере.</p><a class="button button-secondary" href="cart.html?contact=manager">Оставить заявку</a></div>';
      return;
    }
    requestsEl.innerHTML = requests.map(request => {
      const items = Array.isArray(request.items) ? request.items : [];
      return `<article class="cabinet-request-card"><div class="cabinet-request-top"><div><span class="cabinet-order-number">ЗАЯВКА №${escapeHTML(request.id)}</span><p>${escapeHTML(dateLabel(request.createdAt))}</p></div><span class="cabinet-status ${request.status === 'CLOSED' ? 'delivered' : 'processing'}">${escapeHTML(requestStatusLabels[request.status] || request.status || 'Принята')}</span></div><div class="cabinet-request-details"><span>Контактное лицо</span><strong>${escapeHTML(request.name || 'Не указано')}</strong><span>Телефон для связи</span><strong>${escapeHTML(request.phone || 'Не указан')}</strong></div>${request.comment ? `<p>${escapeHTML(request.comment)}</p>` : ''}${items.length ? `<details class="cabinet-order-details"><summary>Товары в заявке (${quantityOf(items)})</summary><ul class="cabinet-order-items">${items.map(item => `<li><span>${escapeHTML(item.name || 'Товар')}<small>${item.sku ? ` · арт. ${escapeHTML(item.sku)}` : ''}</small></span><span>${Math.max(0, Number(item.qty ?? item.quantity) || 0)} шт.</span><strong>${money((Number(item.price) || 0) * (Number(item.qty ?? item.quantity) || 0))}</strong></li>`).join('')}</ul></details>` : '<p class="cabinet-empty-note">В заявке нет товарного списка.</p>'}</article>`;
    }).join('');
  };

  const switchCabinetTab = name => {
    const allowed = new Set(['overview', 'orders', 'cart', 'profile', 'requests', 'security']);
    const active = allowed.has(name) ? name : 'overview';
    document.querySelectorAll('[data-cabinet-view]').forEach(view => { view.hidden = view.dataset.cabinetView !== active; });
    document.querySelectorAll('[data-cabinet-tab]').forEach(button => {
      const selected = button.dataset.cabinetTab === active;
      if (button.classList.contains('cabinet-tab')) button.classList.toggle('active', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
    if (active === 'orders') renderOrderList();
  };
  document.querySelector('.cabinet-page').addEventListener('click', event => {
    const button = event.target.closest('[data-cabinet-tab]');
    if (button) switchCabinetTab(button.dataset.cabinetTab);
  });

  const p = profile();
  document.querySelector('#cabinet-name').value = p.name || '';
  document.querySelector('#cabinet-email').value = p.email || '';
  document.querySelector('#cabinet-phone').value = p.phone || '';
  document.querySelector('#cabinet-address').value = p.address || '';
  document.querySelector('#cabinet-company').value = p.company || '';
  document.querySelector('#cabinet-comment').value = p.comment || '';

  profileForm.onsubmit = async event => {
    event.preventDefault();
    const name = document.querySelector('#cabinet-name').value.trim();
    const email = document.querySelector('#cabinet-email').value.trim();
    const phone = document.querySelector('#cabinet-phone').value.trim();
    const address = document.querySelector('#cabinet-address').value.trim();
    const company = document.querySelector('#cabinet-company').value.trim();
    const comment = document.querySelector('#cabinet-comment').value.trim();
    const error = document.querySelector('#profile-error');
    const saved = document.querySelector('#profile-saved');
    const submit = profileForm.querySelector('[type="submit"]');
    error.hidden = true; saved.hidden = true;
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { error.textContent = 'Проверьте формат email.'; error.hidden = false; document.querySelector('#cabinet-email').focus(); return; }
    if (phone && !validPhone(phone)) { error.textContent = 'Введите корректный номер телефона.'; error.hidden = false; document.querySelector('#cabinet-phone').focus(); return; }
    submit.disabled = true;
    try {
      const result = await apiRequest('/auth/profile', { method: 'PATCH', body: JSON.stringify({ name, email, phone, address, company, comment }) });
      saveProfile(result.user);
      refreshProfileSummary(); saved.hidden = false;
    } catch (requestError) {
      error.textContent = requestError.message || 'Не удалось сохранить данные.'; error.hidden = false;
    } finally { submit.disabled = false; }
  };

  const passwordForm = document.querySelector('#password-form');
  if (STATIC_MODE) {
    passwordForm.querySelectorAll('input,button').forEach(element => { element.disabled = true; });
    const securityNote = document.querySelector('.cabinet-security-note');
    if (securityNote) securityNote.innerHTML = '<strong>Демонстрационный режим</strong><p>Вход admin / admin предназначен только для локальной демонстрации. Не храните здесь реальные персональные данные: весь профиль, заказы и заявки доступны в локальном хранилище браузера. Смена пароля отключена.</p>';
  }
  passwordForm.onsubmit = async event => {
    event.preventDefault();
    const error = document.querySelector('#password-error');
    const saved = document.querySelector('#password-saved');
    const submit = passwordForm.querySelector('[type="submit"]');
    error.hidden = true; saved.hidden = true;
    const currentPassword = document.querySelector('#cabinet-current-password').value;
    const newPassword = document.querySelector('#cabinet-new-password').value;
    const confirmPassword = document.querySelector('#cabinet-confirm-password').value;
    if (newPassword.length < 8 || /\s/.test(newPassword)) { error.textContent = 'Новый пароль должен содержать не менее 8 символов без пробелов.'; error.hidden = false; return; }
    if (newPassword !== confirmPassword) { error.textContent = 'Новые пароли не совпадают.'; error.hidden = false; document.querySelector('#cabinet-confirm-password').focus(); return; }
    if (newPassword === currentPassword) { error.textContent = 'Новый пароль должен отличаться от текущего.'; error.hidden = false; return; }
    submit.disabled = true;
    try {
      await apiRequest('/auth/password', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) });
      passwordForm.reset(); saved.hidden = false;
    } catch (requestError) {
      error.textContent = requestError.message || 'Не удалось изменить пароль.'; error.hidden = false;
    } finally { submit.disabled = false; }
  };

  searchInput.oninput = renderOrderList;
  filterSelect.onchange = renderOrderList;
  document.querySelector('#cabinet-clear-cart').onclick = () => {
    if (!cart().length || !window.confirm('Очистить всю корзину?')) return;
    saveCart([]); renderCabinetCart(); renderMetrics();
  };
  document.querySelector('#self-checkout').onclick = async () => {
    const current = cart();
    if (!current.length) return;
    const currentProfile = profile();
    if (!currentProfile.phone || !currentProfile.address) {
      switchCabinetTab('profile');
      const missing = !currentProfile.phone ? document.querySelector('#cabinet-phone') : document.querySelector('#cabinet-address');
      missing.focus();
      alert('Для оформления заказа укажите телефон и адрес доставки в разделе «Мои данные», затем сохраните изменения.');
      return;
    }
    const button = document.querySelector('#self-checkout');
    const success = document.querySelector('#checkout-success');
    const error = document.querySelector('#checkout-error');
    button.disabled = true; button.textContent = 'Оформляем…';
    if (error) error.hidden = true;
    try {
      const order = await apiRequest('/orders', {
        method: 'POST',
        body: JSON.stringify({ items: current.map(item => ({ productId: Number(item.id), quantity: Number(item.qty) })), deliveryAddress: currentProfile.address, comment: currentProfile.comment || '' }),
      });
      history = [order, ...history.filter(item => String(item.id) !== String(order.id))].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      saveOrders(history);
      saveCart([]);
      await loadProducts();
      renderCabinetCart(); renderOrderList(); renderRecentOrders(); renderMetrics();
      switchCabinetTab('orders');
      success.hidden = false;
    } catch (requestError) {
      if (error) { error.textContent = requestError.message || 'Не удалось оформить заказ.'; error.hidden = false; }
      else alert(requestError.message || 'Не удалось оформить заказ.');
      await loadProducts();
      renderCabinetCart();
    } finally {
      button.disabled = !cartCheckoutReady();
      button.textContent = 'Оформить заказ';
    }
  };

  refreshProfileSummary();
  try {
    const [orderData, requestData] = await Promise.all([apiRequest('/orders'), apiRequest('/manager-requests')]);
    history = Array.isArray(orderData) ? orderData : [];
    requests = Array.isArray(requestData) ? requestData : [];
    saveOrders(history); saveManagerRequests(requests);
  } catch (error) {
    if (error.status === 401) { location.href = 'auth.html?next=cabinet.html'; return; }
    const historyError = document.createElement('p');
    historyError.className = 'auth-error'; historyError.setAttribute('role', 'alert');
    historyError.textContent = `Не удалось загрузить локальную историю: ${error.message}`;
    historyEl.replaceChildren(historyError);
  }
  renderRecentOrders(); renderOrderList(); renderCabinetCart(); renderRequests(); renderMetrics();
  switchCabinetTab(new URLSearchParams(location.search).get('section') || 'overview');
}


function renderManagerConsole() {
  const form = document.querySelector('#manager-auth-form');
  const keyInput = document.querySelector('#manager-api-key');
  const error = document.querySelector('#manager-page-error');
  const statusMessage = document.querySelector('#manager-page-status');
  const queue = document.querySelector('#manager-queue');
  const refreshButton = document.querySelector('#manager-refresh');
  if (!form || !keyInput || !queue) return;

  let managerKey = '';
  let requests = [];
  const statusOptions = [
    ['NEW', 'Новая'],
    ['IN_PROGRESS', 'В работе'],
    ['CONTACTED', 'Связались'],
    ['CLOSED', 'Закрыта'],
  ];
  const requestDate = value => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'Дата не указана' : date.toLocaleString('ru-RU', { dateStyle: 'medium', timeStyle: 'short' });
  };
  const renderQueue = () => {
    if (!requests.length) {
      queue.innerHTML = '<div class="cabinet-empty-state"><h3>Новых обращений пока нет</h3><p>Новые заявки клиентов появятся здесь после отправки.</p></div>';
      return;
    }
    queue.innerHTML = requests.map(request => {
      const items = Array.isArray(request.items) ? request.items : [];
      const currentStatus = statusOptions.some(([value]) => value === request.status) ? request.status : 'NEW';
      const itemList = items.length
        ? `<ul class="manager-request-items">${items.map(item => {
            const qty = Math.max(0, Number(item.qty ?? item.quantity) || 0);
            return `<li><span>${escapeHTML(item.name || 'Товар')}<small>${item.sku ? ` · арт. ${escapeHTML(item.sku)}` : ''}</small></span><span>${qty} шт.</span><strong>${money((Number(item.price) || 0) * qty)}</strong></li>`;
          }).join('')}</ul>`
        : '<p class="cabinet-empty-note">Заявка без списка товаров.</p>';
      return `<article class="manager-request-card" data-manager-request-card="${escapeHTML(request.id)}">
        <div class="manager-request-heading"><div><span class="cabinet-order-number">ЗАЯВКА №${escapeHTML(request.id)}</span><p>${escapeHTML(requestDate(request.createdAt))}</p></div>
        <label>Статус<select class="manager-status-select" data-manager-status="${escapeHTML(request.id)}">${statusOptions.map(([value, label]) => `<option value="${value}" ${currentStatus === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label></div>
        <div class="manager-request-contact"><div><span>Имя</span><strong>${escapeHTML(request.name || 'Покупатель')}</strong></div><div><span>Телефон</span><strong><a href="tel:${escapeHTML(String(request.phone || '').replace(/[^+\d]/g, ''))}">${escapeHTML(request.phone || 'Не указан')}</a></strong></div>${request.customer?.email ? `<div><span>Email аккаунта</span><strong>${escapeHTML(request.customer.email)}</strong></div>` : ''}</div>
        ${request.comment ? `<p class="manager-request-comment">${escapeHTML(request.comment)}</p>` : ''}${itemList}
      </article>`;
    }).join('');

    queue.querySelectorAll('[data-manager-status]').forEach(select => {
      select.addEventListener('change', async () => {
        const request = requests.find(item => String(item.id) === String(select.dataset.managerStatus));
        if (!request) return;
        const previousStatus = request.status;
        const nextStatus = select.value;
        select.disabled = true;
        if (error) error.hidden = true;
        if (statusMessage) statusMessage.hidden = true;
        try {
          const result = await apiRequest(`/admin/manager-requests/${encodeURIComponent(request.id)}`, {
            method: 'PATCH',
            headers: { 'X-Manager-Api-Key': managerKey },
            body: JSON.stringify({ status: nextStatus }),
          });
          request.status = result.status;
          if (statusMessage) {
            statusMessage.textContent = `Статус заявки №${request.id} изменён.`;
            statusMessage.hidden = false;
          }
        } catch (requestError) {
          select.value = previousStatus;
          if (error) { error.textContent = requestError.message || 'Не удалось обновить статус.'; error.hidden = false; }
        } finally {
          select.disabled = false;
        }
      });
    });
  };

  const loadRequests = async () => {
    error.hidden = true;
    statusMessage.hidden = true;
    if (!managerKey) {
      error.textContent = 'Введите ключ менеджера.';
      error.hidden = false;
      return;
    }
    const submit = form.querySelector('[type="submit"]');
    if (submit) { submit.disabled = true; submit.textContent = 'Загружаем…'; }
    if (refreshButton) refreshButton.disabled = true;
    try {
      const result = await apiRequest('/admin/manager-requests', { headers: { 'X-Manager-Api-Key': managerKey } });
      requests = Array.isArray(result) ? result : [];
      renderQueue();
      if (refreshButton) refreshButton.hidden = false;
      statusMessage.textContent = `Загружено заявок: ${requests.length}.`;
      statusMessage.hidden = false;
      keyInput.value = '';
      keyInput.placeholder = 'Ключ принят; для повторного входа обновите страницу';
    } catch (requestError) {
      managerKey = '';
      requests = [];
      renderQueue();
      if (error) { error.textContent = requestError.message || 'Не удалось загрузить заявки.'; error.hidden = false; }
      if (refreshButton) refreshButton.hidden = true;
    } finally {
      if (submit) { submit.disabled = false; submit.textContent = 'Войти / загрузить'; }
      if (refreshButton) refreshButton.disabled = false;
    }
  };

  form.addEventListener('submit', async event => {
    event.preventDefault();
    managerKey = keyInput.value.trim();
    await loadRequests();
  });
  if (refreshButton) refreshButton.addEventListener('click', loadRequests);
}

async function initApp() {
  clearLegacyPrivateStorage();
  await refreshSession();
  await loadProducts();

  header();
  footer();
  updateCartCount();

  const pageRenderers = {
    home: renderHome,
    catalog: renderCatalog,
    product: renderProduct,
    cart: renderCart,
    delivery: renderDelivery,
    cabinet: renderCabinet,
    auth: renderAuth,
    manager: renderManagerConsole,
    offers: () => {},
  };

  const renderer = pageRenderers[document.body.dataset.page];

  if (renderer) {
    renderer();
  }
}

initApp().catch(error => {
  console.error("Ошибка запуска Kucher:", error);
});