const PRODUCTS = window.PRODUCTS;
const CATEGORIES = ['Крепёж', 'Инструменты', 'Расходники', 'Хозтовары', 'Для ремонта'];
const descriptions = {'Крепёж':'Саморезы, дюбели, болты и другой крепёж.','Инструменты':'Ручной и электроинструмент для дома и стройки.','Расходники':'Биты, диски, свёрла и другие материалы.','Хозтовары':'Товары для дома, уборки и мастерской.','Для ремонта':'Герметики, кисти и малярные материалы.'};
const money = value => `${value.toLocaleString('ru-RU')} ₽`;
const cart = () => JSON.parse(localStorage.getItem('kucherCart') || '[]');
const saveCart = value => { localStorage.setItem('kucherCart', JSON.stringify(value)); updateCartCount(); };
const profile = () => JSON.parse(localStorage.getItem('kucherProfile') || '{}');
const saveProfile = value => localStorage.setItem('kucherProfile', JSON.stringify(value));
const users = () => JSON.parse(localStorage.getItem('kucherUsers') || '[]');
const saveUsers = value => localStorage.setItem('kucherUsers', JSON.stringify(value));
const currentUser = () => JSON.parse(localStorage.getItem('kucherCurrentUser') || 'null');
const setCurrentUser = value => value ? localStorage.setItem('kucherCurrentUser', JSON.stringify(value)) : localStorage.removeItem('kucherCurrentUser');
const normalizeIdentifier = value => String(value || '').trim().toLowerCase();
const validIdentifier = value => { const v = String(value || '').trim(); return /@/.test(v) ? /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) : /^\+?[0-9 ()-]{10,18}$/.test(v); };
const orders = () => JSON.parse(localStorage.getItem('kucherOrders') || '[]');
const saveOrders = value => localStorage.setItem('kucherOrders', JSON.stringify(value));
const managerRequests = () => JSON.parse(localStorage.getItem('kucherManagerRequests') || '[]');
const saveManagerRequests = value => localStorage.setItem('kucherManagerRequests', JSON.stringify(value));
const updateCartCount = () => { const el = document.querySelector('.cart-count'); if (el) el.textContent = cart().reduce((sum, item) => sum + item.qty, 0); };

function header() {
  document.querySelector('.site-header').innerHTML = `<div class="topbar"><div class="wrap"><span>Крепёж • Инструмент • Расходники • Хозтовары</span><span>Ежедневно 9:00–20:00</span></div></div><div class="wrap head"><a class="logo" href="index.html">КУЧЕР <b>СТРОЙ</b></a><span class="tag">Всё для ремонта<br>и строительства</span><form class="search" id="search-form"><input name="search" aria-label="Поиск товаров" placeholder="Поиск: саморезы, дрель, перчатки..."><button>Найти</button></form><span class="phone">+7 (000) 000-00-00</span><a class="account-link" href="cabinet.html">Личный кабинет</a><a class="cart-link" href="cart.html"><svg class="cart-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 4h2l2.2 10.2a2 2 0 0 0 2 1.6h7.9a2 2 0 0 0 1.9-1.4L21 8H7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="10" cy="19" r="1.5"/><circle cx="18" cy="19" r="1.5"/></svg><span>Корзина</span> <span class="cart-count">0</span></a></div><nav class="wrap nav"><a href="catalog.html">Каталог</a>${CATEGORIES.map(c => `<a href="catalog.html?category=${encodeURIComponent(c)}">${c}</a>`).join('')}<a href="delivery.html">Доставка</a></nav>`;
  document.querySelector('#search-form').addEventListener('submit', e => { e.preventDefault(); const q = new FormData(e.currentTarget).get('search').trim(); location.href = `catalog.html${q ? `?search=${encodeURIComponent(q)}` : ''}`; });
}
function requireAuth(){ if(!currentUser()){ location.href='auth.html?next=cabinet.html'; return false; } return true; }
function renderAuth(){
  const loginTab=document.querySelector('[data-auth-tab=login]'), registerTab=document.querySelector('[data-auth-tab=register]');
  const loginForm=document.querySelector('#login-form'), registerForm=document.querySelector('#register-form');
  const switchTab=(tab)=>{ const login=tab==='login'; loginTab.classList.toggle('active',login); registerTab.classList.toggle('active',!login); loginForm.hidden=!login; registerForm.hidden=login; };
  document.querySelectorAll('[data-auth-tab]').forEach(btn=>btn.onclick=()=>switchTab(btn.dataset.authTab));
  loginForm.onsubmit=e=>{ e.preventDefault(); const id=normalizeIdentifier(new FormData(loginForm).get('identifier')); const pass=String(new FormData(loginForm).get('password')||''); const user=users().find(u=>u.identifier===id && u.password===pass); const err=document.querySelector('#login-error'); if(!user){ err.textContent='Неверный email/телефон или пароль.'; err.hidden=false; return; } setCurrentUser({id:user.id,identifier:user.identifier}); saveProfile({...profile(),name:user.name||'',...(user.type==='email'?{email:user.identifier}:{phone:user.identifier})}); location.href=new URLSearchParams(location.search).get('next')||'cabinet.html'; };
  registerForm.onsubmit=e=>{ e.preventDefault(); const data=new FormData(registerForm); const name=String(data.get('name')||'').trim(); const identifier=normalizeIdentifier(data.get('identifier')); const password=String(data.get('password')||''); const password2=String(data.get('password2')||''); const err=document.querySelector('#register-error'); const ok=document.querySelector('#register-success'); err.hidden=true; ok.hidden=true; if(!validIdentifier(identifier)){err.textContent='Введите корректный email или номер телефона.';err.hidden=false;return;} if(password.length<6){err.textContent='Пароль должен содержать минимум 6 символов.';err.hidden=false;return;} if(password!==password2){err.textContent='Пароли не совпадают.';err.hidden=false;return;} const list=users(); if(list.some(u=>u.identifier===identifier)){err.textContent='Этот email или номер телефона уже зарегистрирован.';err.hidden=false;return;} const type=identifier.includes('@')?'email':'phone'; const user={id:Date.now().toString(),name,identifier,password,type,createdAt:new Date().toISOString()}; list.unshift(user); saveUsers(list); setCurrentUser({id:user.id,identifier}); saveProfile({...profile(),name,...(type==='email'?{email:identifier}:{phone:identifier})}); ok.hidden=false; setTimeout(()=>{location.href='cabinet.html';},500); };
}
function footer() { document.querySelector('.site-footer').innerHTML = `<div class="wrap footer-content"><div><b>КУЧЕР СТРОЙ</b><p>Крепёж, инструменты и хозтовары для дома и строительства.</p></div><div><p><b>Магазин:</b> Зеленоград, корпус 338Б</p><p><a href="delivery.html">Доставка в радиусе 5 км</a></p></div></div>`; }
function addToCart(id, qty = 1) { const p = PRODUCTS.find(item => item.id === id); const items = cart(); const current = items.find(item => item.id === id); if (current) current.qty += qty; else items.push({ ...p, qty }); saveCart(items); }
function animateAddToCart(source, imageSrc) { const cartLink = document.querySelector('.cart-link'); if (!cartLink) return Promise.resolve(); const rect = source.getBoundingClientRect(); const cartRect = cartLink.getBoundingClientRect(); const ghost = document.createElement('div'); ghost.className = 'cart-flyer'; ghost.innerHTML = `<img src="${imageSrc}" alt="">`; Object.assign(ghost.style, { left: `${rect.left + rect.width / 2 - 35}px`, top: `${rect.top + rect.height / 2 - 35}px` }); document.body.appendChild(ghost); requestAnimationFrame(() => { ghost.style.transform = `translate(${cartRect.left + cartRect.width / 2 - (rect.left + rect.width / 2) }px, ${cartRect.top + cartRect.height / 2 - (rect.top + rect.height / 2)}px) scale(.18)`; ghost.style.opacity = '0.15'; }); setTimeout(() => ghost.remove(), 650); return Promise.resolve(); }

function categories(active) { return CATEGORIES.map(c => `<button class="category ${active === c ? 'active' : ''}" data-category="${c}">${c}<span>${descriptions[c]}</span></button>`).join(''); }
function galleryImages(product) { return product.images?.length ? product.images : [product.image]; }
function card(p) { const images = galleryImages(p); return `<article class="product-card"><a class="product-image" href="product.html?id=${p.id}"><img src="${images[0]}" alt="${p.name}" loading="lazy">${images.length > 1 ? `<span class="photo-count">${images.length} фото</span>` : ''}</a><div class="product-body"><span class="badge">${p.badge}</span><a class="product-name" href="product.html?id=${p.id}">${p.name}</a><div class="price">${money(p.price)}</div><button class="button card-action" data-add="${p.id}">В корзину</button></div></article>`; }
function openOrderChoice(productName = '') {
  document.querySelector('.order-choice-modal')?.remove();
  const modal = document.createElement('div');
  modal.className = 'order-choice-modal';
  modal.innerHTML = `<div class="order-choice-backdrop"></div><div class="order-choice-card" role="dialog" aria-modal="true" aria-labelledby="order-choice-title"><button class="order-choice-close" type="button" aria-label="Закрыть">×</button><span class="eyebrow eyebrow-dark">Товар добавлен</span><h2 id="order-choice-title">${productName ? `«${productName}» добавлен в корзину` : 'Товар добавлен в корзину'}</h2><p>Как хотите оформить заказ?</p><div class="order-choice-actions"><button class="button button-primary" type="button" data-manager-choice>📞 Оставить номер — свяжется менеджер</button><a class="button choice-secondary" href="cabinet.html">👤 Оформить самому</a></div><form class="manager-form" hidden><label>Ваш номер телефона<input name="phone" type="tel" placeholder="+7 (___) ___-__-__" required></label><label>Имя <span class="optional">необязательно</span><input name="name" type="text" placeholder="Как к вам обращаться"></label><button class="button button-primary" type="submit">Оставить заявку</button><p class="manager-success" hidden>Заявка принята. Менеджер свяжется с вами.</p></form></div>`;
  document.body.appendChild(modal);
  const close = () => modal.remove();
  modal.querySelector('.order-choice-close').onclick = close;
  modal.querySelector('.order-choice-backdrop').onclick = close;
  modal.querySelector('[data-manager-choice]').onclick = () => { modal.querySelector('.manager-form').hidden = false; modal.querySelector('[data-manager-choice]').hidden = true; };
  modal.querySelector('.manager-form').onsubmit = e => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const currentProfile = { ...profile(), phone: String(data.get('phone') || '').trim(), name: String(data.get('name') || '').trim() };
    saveProfile(currentProfile);
    const list = managerRequests();
    list.unshift({ id: Date.now(), createdAt: new Date().toISOString(), phone: currentProfile.phone, name: currentProfile.name, items: cart() });
    saveManagerRequests(list);
    e.currentTarget.querySelectorAll('input,button').forEach(el => el.disabled = true);
    e.currentTarget.querySelector('.manager-success').hidden = false;
  };
}
function bindAddButtons() { document.querySelectorAll('[data-add]').forEach(button => button.addEventListener('click', () => { const id = Number(button.dataset.add); const p = PRODUCTS.find(item => item.id === id); if (!p) return; addToCart(id); button.textContent = 'Добавлено'; animateAddToCart(button.closest('.product-card')?.querySelector('.product-image') || button, galleryImages(p)[0]); openOrderChoice(p.name); })); }
function bindCategories() { document.querySelectorAll('[data-category]').forEach(button => button.addEventListener('click', () => location.href = `catalog.html?category=${encodeURIComponent(button.dataset.category)}`)); }
function initDeliveryMap() {
  const mapElement = document.querySelector('#delivery-map');
  if (!mapElement) return;

  const center = [55.993872, 37.214714];
  const deliveryRadius = 5000;

  mapElement.innerHTML = '<div id="yandex-map" style="width:100%;height:100%"></div>';

  const createMap = () => {
    if (mapElement.dataset.mapReady === '1') return;
    if (!window.ymaps) return;
    mapElement.dataset.mapReady = '1';

    const map = new ymaps.Map('yandex-map', {
      center,
      zoom: 11,
      controls: ['zoomControl', 'fullscreenControl']
    }, {
      suppressMapOpenBlock: true
    });

    const circle = new ymaps.Circle([center, deliveryRadius], {
      hintContent: 'Зона доставки — 5 км',
      balloonContent: '<b>Зона доставки</b><br>Радиус 5 км от корпуса 338Б'
    }, {
      fillColor: '#F36C2126',
      strokeColor: '#F36C21',
      strokeOpacity: 0.9,
      strokeWidth: 3,
      draggable: false
    });

    const placemark = new ymaps.Placemark(center, {
      hintContent: 'КУЧЕР СТРОЙ — корпус 338Б',
      balloonContent: '<b>КУЧЕР СТРОЙ</b><br>Зеленоград, корпус 338Б<br>Радиус доставки: 5 км'
    }, {
      preset: 'islands#orangeDotIcon'
    });

    map.geoObjects.add(circle);
    map.geoObjects.add(placemark);
    map.setBounds(circle.geometry.getBounds(), {
      checkZoomRange: true,
      zoomMargin: 24
    });
  };

  if (window.ymaps && typeof window.ymaps.ready === 'function') {
    window.ymaps.ready(createMap);
  } else {
    mapElement.innerHTML = '<div class="map-api-placeholder">Для отображения карты нужен API-ключ Яндекс Карт.</div>';
  }
}
function renderHome() { document.querySelector('#categories').innerHTML = categories(); document.querySelector('#products').innerHTML = PRODUCTS.slice(0, 8).map(card).join(''); bindCategories(); bindAddButtons(); initDeliveryMap(); }
function renderDelivery() { initDeliveryMap(); }
function renderCatalog() { const params = new URLSearchParams(location.search), category = params.get('category'), query = (params.get('search') || '').toLowerCase().trim(); const list = PRODUCTS.filter(p => (!category || p.cat === category) && (!query || `${p.name} ${p.cat}`.toLowerCase().includes(query))); document.querySelector('#categories').innerHTML = categories(category); document.querySelector('#catalog-title').textContent = category || (query ? `Поиск: ${query}` : 'Каталог товаров'); document.querySelector('#catalog-description').textContent = category ? descriptions[category] : 'Выберите нужный товар и добавьте его в корзину.'; document.querySelector('#result').textContent = `${list.length} товаров`; document.querySelector('#products').innerHTML = list.map(card).join(''); document.querySelector('#empty').hidden = Boolean(list.length); bindCategories(); bindAddButtons(); }
function renderGallery(product) { const images = galleryImages(product), controls = images.length > 1; return `<div class="gallery"><div class="gallery-main"><img id="gallery-image" src="${images[0]}" alt="${product.name}">${controls ? '<button class="gallery-control gallery-prev" type="button" aria-label="Предыдущее фото">‹</button><button class="gallery-control gallery-next" type="button" aria-label="Следующее фото">›</button>' : ''}</div><div class="gallery-thumbnails">${images.map((image,index) => `<button type="button" class="gallery-thumbnail ${index === 0 ? 'active' : ''}" data-gallery-index="${index}" aria-label="Фото ${index + 1}"><img src="${image}" alt=""></button>`).join('')}</div><p class="gallery-status" id="gallery-status">Фото 1 из ${images.length}</p></div>`; }
function bindGallery(product) { const images = galleryImages(product); let selected = 0; const show = index => { selected = (index + images.length) % images.length; document.querySelector('#gallery-image').src = images[selected]; document.querySelector('#gallery-status').textContent = `Фото ${selected + 1} из ${images.length}`; document.querySelectorAll('[data-gallery-index]').forEach(button => button.classList.toggle('active', Number(button.dataset.galleryIndex) === selected)); }; document.querySelectorAll('[data-gallery-index]').forEach(button => button.addEventListener('click', () => show(Number(button.dataset.galleryIndex)))); document.querySelector('.gallery-prev')?.addEventListener('click', () => show(selected - 1)); document.querySelector('.gallery-next')?.addEventListener('click', () => show(selected + 1)); }
function renderProduct() { const id = Number(new URLSearchParams(location.search).get('id')), p = PRODUCTS.find(item => item.id === id) || PRODUCTS[0]; document.title = `${p.name} — Кучер строй`; document.querySelector('#product-detail').innerHTML = `<div class="detail-image">${renderGallery(p)}</div><article class="detail-info"><span class="badge">${p.badge}</span><p>${p.cat}</p><h1>${p.name}</h1><p class="description">${p.description}</p><div class="detail-price">${money(p.price)}</div><div class="add-row"><input id="product-quantity" class="quantity" type="number" min="1" value="1"><button id="add-product" class="button button-primary">Добавить в корзину</button></div><div class="specs">${p.specs.map(s => `<div class="spec"><span>${s[0]}</span><b>${s[1]}</b></div>`).join('')}</div></article>`; bindGallery(p); document.querySelector('#add-product').addEventListener('click', () => { const qty = Math.max(1, Number(document.querySelector('#product-quantity').value) || 1); addToCart(p.id, qty); const button = document.querySelector('#add-product'); button.textContent = 'Добавлено'; animateAddToCart(document.querySelector('.gallery-main') || button, galleryImages(p)[0]); openOrderChoice(p.name); setTimeout(() => { button.textContent = 'Добавить в корзину'; }, 900); }); }
function renderCart() {
  const empty = document.querySelector('#cart-empty');
  const content = document.querySelector('#cart-content');
  const itemsEl = document.querySelector('#cart-items');
  const clearButton = document.querySelector('#clear-cart');
  const items = cart();
  empty.hidden = Boolean(items.length);
  content.hidden = !items.length;
  if (clearButton) clearButton.disabled = !items.length;
  if (!items.length) { itemsEl.innerHTML = ''; return; }

  itemsEl.innerHTML = items.map(item => `<article class="cart-item"><img src="${item.image}" alt="${item.name}"><div><span class="badge">${item.cat}</span><h3>${item.name}</h3><b>${money(item.price)}</b></div><div class="item-actions"><input aria-label="Количество ${item.name}" type="number" min="1" value="${item.qty}" data-quantity="${item.id}"><div><b>${money(item.price * item.qty)}</b></div><button class="remove" type="button" data-remove="${item.id}">Удалить</button></div></article>`).join('');
  document.querySelector('#cart-total').textContent = money(items.reduce((sum, item) => sum + item.price * item.qty, 0));

  itemsEl.querySelectorAll('[data-quantity]').forEach(input => input.addEventListener('change', () => {
    const updated = cart();
    const item = updated.find(i => i.id === Number(input.dataset.quantity));
    if (!item) return;
    item.qty = Math.max(1, Number(input.value) || 1);
    saveCart(updated);
    renderCart();
  }));

  itemsEl.querySelectorAll('[data-remove]').forEach(button => button.addEventListener('click', () => {
    const id = Number(button.dataset.remove);
    const updated = cart().filter(item => item.id !== id);
    saveCart(updated);
    renderCart();
  }));

  if (clearButton) clearButton.onclick = () => { saveCart([]); renderCart(); };
}


function renderCabinet() {
  if(!requireAuth()) return;
  const p = profile();
  const items = cart();
  const history = orders();
  const requests = managerRequests();
  const cartEl = document.querySelector('#cabinet-cart');
  const historyEl = document.querySelector('#order-history');
  const profileForm = document.querySelector('#profile-form');
  document.querySelector('#cabinet-phone').value = p.phone || '';
  document.querySelector('#cabinet-name').value = p.name || '';
  document.querySelector('#cabinet-address').value = p.address || '';
  if (!items.length) cartEl.innerHTML = '<p class="empty">Корзина пуста. <a href="catalog.html">Выбрать товары</a></p>';
  else cartEl.innerHTML = `<div class="cabinet-cart-list">${items.map(item => `<article class="cabinet-cart-item"><img src="${item.image}" alt="${item.name}"><div><b>${item.name}</b><span>${item.qty} × ${money(item.price)}</span></div><strong>${money(item.price * item.qty)}</strong></article>`).join('')}</div><div class="cabinet-total"><span>Итого</span><b>${money(items.reduce((s,i)=>s+i.price*i.qty,0))}</b></div>`;
  historyEl.innerHTML = history.length ? history.map(order => `<article class="history-item"><div><b>Заказ №${order.id}</b><span>${new Date(order.createdAt).toLocaleString('ru-RU')}</span></div><strong>${money(order.total)}</strong><details><summary>Товары (${order.items.reduce((s,i)=>s+i.qty,0)})</summary><div>${order.items.map(i => `<p>${i.name} — ${i.qty} × ${money(i.price)}</p>`).join('')}</div></details></article>`).join('') : '<p class="empty">Прошлых заказов пока нет.</p>';
  document.querySelector('#request-history').innerHTML = requests.length ? requests.slice(0,5).map(r => `<div class="request-item"><b>Заявка от ${new Date(r.createdAt).toLocaleDateString('ru-RU')}</b><span>${r.phone}</span></div>`).join('') : '<p class="notice">Заявок менеджеру пока нет.</p>';
  profileForm.onsubmit = e => { e.preventDefault(); saveProfile({name: document.querySelector('#cabinet-name').value.trim(), phone: document.querySelector('#cabinet-phone').value.trim(), address: document.querySelector('#cabinet-address').value.trim()}); document.querySelector('#profile-saved').hidden = false; setTimeout(() => document.querySelector('#profile-saved').hidden = true, 1600); };
  const checkout = document.querySelector('#self-checkout');
  checkout.disabled = !items.length;
  checkout.onclick = () => {
    const current = cart(); if (!current.length) return;
    const currentProfile = profile();
    if (!currentProfile.phone || !currentProfile.address) {
      document.querySelector('#cabinet-phone').focus();
      alert('Для оформления заказа укажите номер телефона и адрес доставки в разделе «Мои данные».');
      return;
    }
    const orderList = orders(); const total = current.reduce((s,i)=>s+i.price*i.qty,0);
    orderList.unshift({ id: Date.now().toString().slice(-6), createdAt: new Date().toISOString(), items: current, total, phone: currentProfile.phone, name: currentProfile.name || '', address: currentProfile.address });
    saveOrders(orderList); saveCart([]); renderCabinet();
    const ok = document.querySelector('#checkout-success'); ok.hidden = false; setTimeout(() => ok.hidden = true, 2200);
  };
}

header(); footer(); updateCartCount(); ({home:renderHome,catalog:renderCatalog,product:renderProduct,cart:renderCart,delivery:renderDelivery,cabinet:renderCabinet,auth:renderAuth}[document.body.dataset.page])();
