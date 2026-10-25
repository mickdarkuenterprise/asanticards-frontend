const IMG_LOGO = 'images/logo.webp';
const IMG_BAMMO = 'images/suit-bammo.svg';
const IMG_AHABAN = 'images/suit-ahaban.svg';
const IMG_AHENNIE = 'images/suit-ahennie.svg';
// ══════════════════════════════════════════════════
// CONFIG
// ══════════════════════════════════════════════════
const API_BASE = 'https://asanticards-production.up.railway.app';
const PAYSTACK_PUBLIC_KEY = 'pk_live_ec1ec560fc23b6f40264e23c7782d27fad86171b';
// Ad pixels — paste the IDs from Meta Events Manager and TikTok Ads Manager. Left empty, nothing loads.
const META_PIXEL_ID = '';
const TIKTOK_PIXEL_ID = '';


// ── Ad pixels (Meta + TikTok) ──
(function loadAdPixels() {
  if (META_PIXEL_ID) {
    !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
    n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
    n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
    t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
    document,'script','https://connect.facebook.net/en_US/fbevents.js');
    fbq('init', META_PIXEL_ID);
    fbq('track', 'PageView');
  }
  if (TIKTOK_PIXEL_ID) {
    !function (w, d, t) {
      w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie","holdConsent","revokeConsent","grantConsent"],ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e},ttq.load=function(e,n){var r="https://analytics.tiktok.com/i18n/pixel/events.js";ttq._i=ttq._i||{},ttq._i[e]=[],ttq._i[e]._u=r,ttq._t=ttq._t||{},ttq._t[e]=+new Date,ttq._o=ttq._o||{},ttq._o[e]=n||{};var o=d.createElement("script");o.type="text/javascript",o.async=!0,o.src=r+"?sdkid="+e+"&lib="+t;var a=d.getElementsByTagName("script")[0];a.parentNode.insertBefore(o,a)};
      ttq.load(TIKTOK_PIXEL_ID);
      ttq.page();
    }(window, document, 'ttq');
  }
})();

// Send one shopping event to both pixels. Events: AddToCart, InitiateCheckout, Purchase.
function trackAd(event, { value, ids = [], orderRef } = {}) {
  try {
    if (window.fbq) {
      fbq('track', event, { value, currency: 'GHS', content_ids: ids, content_type: 'product' },
        orderRef ? { eventID: orderRef } : undefined);
    }
    if (window.ttq) {
      const tiktokEvent = event === 'Purchase' ? 'CompletePayment' : event;
      ttq.track(tiktokEvent, { value, currency: 'GHS', contents: ids.map(id => ({ content_id: id, content_type: 'product' })) },
        orderRef ? { event_id: orderRef } : undefined);
    }
  } catch (err) {
    console.warn('Ad pixel event failed:', err.message);
  }
}


// ── API helpers ──
async function apiFetch(path, options = {}) {
  const res = await fetch(API_BASE + path, {
    ...options,
    // merged AFTER ...options so passing extra headers (e.g. Authorization) keeps Content-Type
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });
  if (!res.ok) {
    // Surface the server's own message (e.g. "Insufficient stock…") when there is one
    let message = `API ${res.status}: ${path}`;
    try {
      const body = await res.json();
      if (body.error) message = body.error;
      else if (Array.isArray(body.errors) && body.errors.length) {
        message = 'Please check: ' + [...new Set(body.errors.map(e => e.path))].join(', ');
      }
    } catch {}
    const err = new Error(message);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

// ══════════════════════════════════════════════════
// PRODUCT CATALOGUE
// ══════════════════════════════════════════════════
const PRODUCTS_DEFAULT = [
  {id:'collectors', name:"ASA NTI — Collector's Edition", price:350, category:'game',  stock:50, active:true,  sort_order:1},
  {id:'bundle2',    name:'Two-Box Bundle',                price:650, category:'bundle', stock:20, active:true,  sort_order:2},
  {id:'tote',       name:'ASA NTI Tote Bag',              price:200, category:'merch',  stock:35, active:true,  sort_order:3},
  {id:'poster',     name:'Three Suits Art Poster',        price:200, category:'merch',  stock:30, active:true,  sort_order:4},
  {id:'giftset',    name:'Premium Gift Set',              price:195, category:'bundle', stock:15, active:false, sort_order:5},
];

// Product photos by product id. Tote and poster have no photo yet and show a styled placeholder.
const PRODUCT_IMAGES = {
  collectors: 'images/box-front-800.webp',
  bundle2:    'images/box-angle-800.webp',
};
function productImage(p) {
  return (p && (p.image || PRODUCT_IMAGES[p.id])) || null;
}

// Update any [data-product-price="id"] spans on the page with live prices
function updatePriceSpans(products) {
  products.forEach(p => {
    document.querySelectorAll(`[data-product-price="${p.id}"]`).forEach(el => {
      el.textContent = `GH\u20B5 ${parseFloat(p.price).toLocaleString('en-GH', {minimumFractionDigits:2})}`;
    });
  });
}

// Get live price for a product id (used in addToCart onclick calls)
function getProductPrice(id) {
  const products = loadProducts();
  const p = products.find(prod => prod.id == id);
  return p ? parseFloat(p.price) : 0;
}

// ══════════════════════════════════════════════════
// STATE — API-backed, localStorage as cache/fallback
// ══════════════════════════════════════════════════

// Products: fetched from the API on load; localStorage is only a cache
let _productsCache = null;

function loadProducts() {
  if (_productsCache) return _productsCache;
  // Synchronous fallback from localStorage cache while API loads
  try {
    const cached = JSON.parse(localStorage.getItem('asanti_products'));
    _productsCache = cached || PRODUCTS_DEFAULT;
  } catch { _productsCache = PRODUCTS_DEFAULT; }
  return _productsCache;
}
async function fetchProductsFromAPI() {
  try {
    const data = await apiFetch('/api/products');
    
    // Unwraps the backend object whether it uses { products: [...] } or direct [...]
    let products = [];
    if (data && Array.isArray(data.products)) {
      products = data.products;
    } else if (Array.isArray(data)) {
      products = data;
    } else {
      throw new Error("Unknown data format received from API");
    }

    _productsCache = products;
    localStorage.setItem('asanti_products', JSON.stringify(products));
    syncCartWithProducts(products);

    if (document.getElementById('productsGrid')) renderStoreProducts();
    updatePriceSpans(products);

  } catch (err) {
    console.warn('Could not load products from API, using local cache:', err.message);
    updatePriceSpans(loadProducts());
  }
}


// Newsletter
async function subscribeNewsletter(email) {
  try {
    await apiFetch('/api/newsletter', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
    return true;
  } catch {
    return false;
  }
}

// Contact form
async function submitContact(name, email, message) {
  try {
    await apiFetch('/api/contact', {
      method: 'POST',
      body: JSON.stringify({ name, email, message }),
    });
    return true;
  } catch {
    return false;
  }
}

let cart = (function(){
  try {
    return JSON.parse(localStorage.getItem('asanti_cart') || '[]');
  } catch {
    return [];
  }
})();
function saveCart(){
  try { localStorage.setItem('asanti_cart', JSON.stringify(cart)); } catch {}
}

// A saved cart can hold old prices/names, or products that were removed.
// Refresh it from the live catalogue so the totals shown match what is charged.
function syncCartWithProducts(products){
  const before = JSON.stringify(cart);
  cart = cart
    .map(item => {
      const prod = products.find(p => String(p.id) === String(item.id) && p.active !== false);
      return prod ? { ...item, name: prod.name, price: parseFloat(prod.price) } : null;
    })
    .filter(Boolean);
  if (JSON.stringify(cart) !== before && document.getElementById('cartBadge')) updateCartUI();
}

// Shipping for the selected method — same as the server: every order pays the method's price (no free shipping)
function refreshShippingTilePrices(){
  const el = document.getElementById('ship_standard_price');
  if (el) el.textContent = `GH₵ ${Number(shippingTiers.standard).toLocaleString()}`;
}
function currentShippingCost(){
  const base = shippingTiers[shippingMethod];
  if (base === undefined) return shippingCost;
  return base;
}
// Base price per shipping method; matches the server (lib/shipping.js) and is refreshed from the API when available
let shippingTiers = { standard: 50, express: 80, diaspora: 200 };
let shippingCost = 0;
let shippingMethod = 'standard';

// ══════════════════════════════════════════════════
// PAGE NAVIGATION
// ══════════════════════════════════════════════════
function showPage(id){
  document.querySelectorAll('.page-section').forEach(s=>s.classList.remove('active'));
  const t=document.getElementById(id);
  if(t){t.classList.add('active');window.scrollTo({top:0,behavior:'smooth'});setTimeout(observeReveal,100)}
  document.querySelectorAll('.nav-links a').forEach(a=>{
    a.classList.toggle('active',a.dataset.page===id)
  });
}
window.addEventListener('scroll',()=>{
  const nav=document.getElementById('mainNav');
  nav.classList.toggle('scrolled',window.scrollY>60);
});
function toggleAcc(btn){
  const body=btn.nextElementSibling;
  const isOpen=body.classList.contains('open');
  document.querySelectorAll('.acc-body').forEach(b=>b.classList.remove('open'));
  document.querySelectorAll('.acc-header').forEach(h=>h.classList.remove('active'));
  if(!isOpen){body.classList.add('open');btn.classList.add('active')}
}
function switchTab(btn,panelId){
  // scope to the parent page section
  const page = btn.closest('.page-section') || document;
  page.querySelectorAll('.gp-tab').forEach(t=>t.classList.remove('active'));
  page.querySelectorAll('.gp-panel').forEach(p=>p.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById(panelId).classList.add('active');
}
let qty=1;
function changeQty(d){qty=Math.max(1,qty+d);document.getElementById('qtyNum').textContent=qty}
function toggleMobile() {
  var menu = document.getElementById('mobileMenu');
  var toggleBtn = document.querySelector('.nav-toggle');
  var cartBtn = document.querySelector('.cart-nav-btn');
  var isOpen = menu.classList.contains('open');

  if (isOpen) {
    // Close the menu
    menu.classList.remove('open');
    if (toggleBtn) toggleBtn.classList.remove('active');
    if (cartBtn) cartBtn.style.display = '';
  } else {
    // Open the menu
    menu.classList.add('open');
    if (toggleBtn) toggleBtn.classList.add('active');
    if (cartBtn) cartBtn.style.display = 'none';
  }
}
// "Save GH₵60" on the Two-Box Bundle, worked out from the live prices
function bundleSavingBadge(p){
  if (p.id !== 'bundle2') return null;
  const single = loadProducts().find(x => x.id === 'collectors');
  const save = single ? Math.round(2 * parseFloat(single.price) - parseFloat(p.price)) : 0;
  return save > 0 ? `Save GH₵${save}` : null;
}
function renderStoreProducts(){
  const grid = document.getElementById('productsGrid');
  if(!grid) return;
  const products = loadProducts().filter(p=> p.active !== false && p.visible !== false);
  const catBadgeClass = {'NEW':'badge-new','LIMITED':'badge-limited','COMING SOON':'badge-soon','SAVE 15%':'badge-sale','BESTSELLER':'badge-new'};
  grid.innerHTML = products.map(p=>{
    const stockLabel = p.stock===0?'Out of Stock':p.stock<=5?`Only ${p.stock} left`:'In Stock';
    const stockColor = p.stock===0?'color:#e87a7a':p.stock<=5?'color:#f0a040':'color:#8eba80';
    const photo = productImage(p);
    const imgHtml = photo
      ? `<img src="${photo}" alt="${p.name.replace(/"/g,'&quot;')}" loading="lazy" width="800" height="533" style="width:100%;height:100%;object-fit:cover;position:absolute;inset:0;border-radius:var(--r) var(--r) 0 0">`
      : `<div class="adinkra-dots"></div><div class="product-img-text"><span style="font-size:1.6rem;color:rgba(217,164,65,0.22);display:block">${p.name.split(' ').slice(0,2).join(' ')}</span></div>`;
    const badge = p.badge || bundleSavingBadge(p);
    const badgeCls = catBadgeClass[badge] || (/^save/i.test(badge || '') ? 'badge-sale' : 'badge-new');
    const badgeHtml = badge ? `<span class="product-badge ${badgeCls}">${badge}</span>` : '';
    const soldOut = p.stock===0;
    return `<div class="product-card" data-cat="${p.category}">
      <div class="product-img" style="background:linear-gradient(145deg,#1A0709,#2E1009);position:relative">
        ${imgHtml}${badgeHtml}
      </div>
      <div class="product-body">
        <div class="product-title">${p.name}</div>
        ${p.desc?`<div class="product-subtitle">${p.desc}</div>`:''}
        <div class="product-price-row">
          <div class="product-price">GH₵ ${parseFloat(p.price).toLocaleString('en-GH',{minimumFractionDigits:0})}</div>
          <button class="btn ${soldOut?'btn-outline':'btn-gold'} btn-sm" ${soldOut?'disabled':''} onclick="addToCart('${p.id}','${p.name.replace(/'/g,"\\'")}',${parseFloat(p.price)},1)">
            ${soldOut?'Out of Stock':'Add to Cart'}
          </button>
        </div>
        <div style="font-size:0.75rem;${stockColor};margin-top:6px">${stockLabel}</div>
      </div>
    </div>`;
  }).join('');
}

function filterProducts(btn,cat){
  document.querySelectorAll('.filter-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  document.querySelectorAll('.product-card').forEach(c=>{
    c.style.display=(cat==='all'||c.dataset.cat===cat)?'block':'none';
  });
}
function observeReveal(){
  const els=document.querySelectorAll('.reveal:not(.visible),.reveal-left:not(.visible),.reveal-right:not(.visible)');
  // Content already on screen shows straight away — only content further down fades in as you scroll
  els.forEach(el=>{
    const r=el.getBoundingClientRect();
    if(r.top<window.innerHeight && r.bottom>0 && el.offsetParent!==null) el.classList.add('visible');
  });
  if('IntersectionObserver' in window){
    const obs=new IntersectionObserver(entries=>{
      entries.forEach(e=>{if(e.isIntersecting){e.target.classList.add('visible');obs.unobserve(e.target)}});
    },{threshold:0.08});
    els.forEach(el=>obs.observe(el));
  } else {
    els.forEach(el=>el.classList.add('visible'));
  }
}
document.addEventListener('DOMContentLoaded', () => {
  // 1. Clear stale cache on version change
  const CACHE_VERSION = 'v5';
  if (localStorage.getItem('asanti_cache_version') !== CACHE_VERSION) {
    localStorage.removeItem('asanti_products');
    localStorage.removeItem('asanti_shipping');
    localStorage.setItem('asanti_cache_version', CACHE_VERSION);
  }

  // Keep the footer copyright year current
  document.querySelectorAll('.footer-year').forEach(el => { el.textContent = new Date().getFullYear(); });

  // 3. Run animation and image initializers once
  initImages();
  observeReveal();
  setTimeout(observeReveal, 400);

  // 2. Set up layout and UI elements
  if (document.getElementById('productsGrid')) {
    renderStoreProducts();
  }
  updatePriceSpans(loadProducts());

  // 3. Fetch fresh product data from your Railway backend API
  fetchProductsFromAPI();

  // 4. Fetch shipping tiers from backend so prices are live
  fetchShippingTiersFromAPI();
});



function initImages(){
  // Set all brand logo images
  document.querySelectorAll('#nav-logo-img, .brand-logo-img').forEach(img => img.src = IMG_LOGO);
  // Set all suit images by class
  document.querySelectorAll('.suit-img-ahennie').forEach(img => img.src = IMG_AHENNIE);
  document.querySelectorAll('.suit-img-bammo').forEach(img => img.src = IMG_BAMMO);
  document.querySelectorAll('.suit-img-ahaban').forEach(img => img.src = IMG_AHABAN);

  // Nav logos — the header shows the name beside the logo; the footer keeps the logo alone
  document.querySelectorAll('.nav-logo').forEach(el=>{
    const inHeader = !!el.closest('#mainNav');
    el.innerHTML = inHeader
      ? `<img src="${IMG_LOGO}" alt="" style="height:40px;width:auto;object-fit:contain;display:block"><span class="nav-logo-text">ASA NTI</span>`
      : `<img src="${IMG_LOGO}" alt="ASA NTI" style="height:40px;width:auto;object-fit:contain;display:block">`;
  });

  // Story chapter symbols
  document.querySelectorAll('.story-symbol.sym-gold').forEach(el=>{
    el.innerHTML=`<img src="${IMG_AHENNIE}" alt="AHENNIE" style="width:110px;height:110px;object-fit:contain">`;
  });
  document.querySelectorAll('.story-symbol.sym-red').forEach(el=>{
    el.innerHTML=`<img src="${IMG_BAMMO}" alt="BAMMƆ" style="width:110px;height:110px;object-fit:contain">`;
  });
  document.querySelectorAll('.story-symbol.sym-green').forEach(el=>{
    el.innerHTML=`<img src="${IMG_AHABAN}" alt="AHABAN ANIWA" style="width:110px;height:110px;object-fit:contain">`;
  });


  // Rules power cards
  document.querySelectorAll('.power-card').forEach(card=>{
    const title=(card.querySelector('.power-title')||{}).textContent||'';
    const svgEl=card.querySelector('svg');
    if(!svgEl) return;
    let src=null;
    if(title.includes('AHENNIE')) src=IMG_AHENNIE;
    else if(title.includes('BAMMƆ')||title.includes('BAMMO')) src=IMG_BAMMO;
    else if(title.includes('AHABAN')) src=IMG_AHABAN;
    if(src){
      const img=document.createElement('img');
      img.src=src; img.alt=title;
      img.style.cssText='width:56px;height:56px;object-fit:contain';
      svgEl.replaceWith(img);
    }
  });

  // Store featured product box logo
  const box=document.querySelector('.product-box-main');
  if(box) box.innerHTML=`<img src="${IMG_LOGO}" alt="ASA NTI" style="width:130px;height:auto;object-fit:contain;margin-bottom:10px"><span class="sub">Premium Card Game</span><span class="tag">Collector's Edition</span>`;

  // Footer brand logo
  document.querySelectorAll('.footer-brand .nav-logo, footer .nav-logo').forEach(el=>{
    el.innerHTML=`<img src="${IMG_LOGO}" alt="ASA NTI" style="height:36px;width:auto;object-fit:contain;display:block">`;
  });
}

// ══════════════════════════════════════════════════
// CART
// ══════════════════════════════════════════════════
function addToCart(id, name, price, rawQty){
  const products = loadProducts();
  const prod = products.find(p=>p.id===id);
  const reqQty = parseInt(rawQty)||1;

  if(prod && prod.stock !== undefined && prod.stock < reqQty){
    showToast('⚠', `Only ${prod.stock} left in stock`, 'toast-red'); return;
  }
  if(prod && prod.stock === 0){
    showToast('✕', 'This item is out of stock', 'toast-red'); return;
  }

  const existing = cart.find(i=>i.id===id);
  if(existing){
    const newQty = existing.qty + reqQty;
    if(prod && prod.stock < newQty){ showToast('⚠',`Only ${prod.stock} in stock`,'toast-red'); return; }
    existing.qty = newQty;
  } else {
    cart.push({id, name, price, qty: reqQty});
  }
  updateCartUI();
  trackAd('AddToCart', { value: price * reqQty, ids: [id] });
  showToast('✦', `${name} added to cart`, 'toast-gold');
  // bump badge animation
  const badge = document.getElementById('cartBadge');
  badge.classList.remove('bump');
  requestAnimationFrame(()=>{ badge.classList.add('bump'); setTimeout(()=>badge.classList.remove('bump'),300); });
}

function removeFromCart(id){
  cart = cart.filter(i=>String(i.id)!==String(id));
  updateCartUI();
}

function changeCartQty(id, delta){
  const item = cart.find(i=>String(i.id)===String(id));
  if(!item) return;
  const products = loadProducts();
  const prod = products.find(p=>String(p.id)===String(id));
  const newQty = Number(item.qty) + Number(delta);
  if(newQty < 1){ removeFromCart(id); return; }
  if(prod && Number(prod.stock) < newQty){ showToast('⚠',`Only ${prod.stock} in stock`,'toast-red'); return; }
  item.qty = newQty;
  updateCartUI();
}

function cartSubtotal(){
  return cart.reduce((sum, item) => {
    return sum + (item.price * (item.qty || item.quantity || 0));
  }, 0);
}

function updateCartUI(){
  saveCart();
  // Support both item.qty or item.quantity safely to prevent NaN errors
  const count = cart.reduce((sum, item) => {
    return sum + (item.qty || item.quantity || 0);
  }, 0);
  const badge = document.getElementById('cartBadge');
  if(count > 0){ badge.textContent=count; badge.classList.add('show'); }
  else { badge.classList.remove('show'); }

  const body = document.getElementById('cartBody');
  const foot = document.getElementById('cartFoot');
  if(!body) return;

  // Clear only cart-item rows — preserve cartEmpty node
  body.querySelectorAll('.cart-item').forEach(el=>el.remove());

  if(cart.length === 0){
    const empty = document.getElementById('cartEmpty');
    if(empty) empty.style.display='';
    if(foot) foot.style.display='none';
    return;
  }

  const empty = document.getElementById('cartEmpty');
  if(empty) empty.style.display='none';
  if(foot) foot.style.display='';

  cart.forEach(item=>{
    const itemQty = item.qty || item.quantity || 1;
    const initials = item.name.split(' ').slice(0,2).map(w=>w[0]).join('');
    const cartPhoto = productImage(loadProducts().find(p => String(p.id) === String(item.id)) || { id: item.id });
    const div = document.createElement('div');
    div.className = 'cart-item';
    div.innerHTML = `
      <div class="cart-item-img">${cartPhoto ? `<img src="${cartPhoto}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:8px">` : initials}</div>
      <div class="cart-item-info">
        <div class="cart-item-name">${item.name}</div>
        <div class="cart-item-price">GH₵ ${(item.price * itemQty).toLocaleString()}</div>
        <div class="cart-item-qty">
          <button class="ciq-btn">−</button>
          <span class="ciq-num">${itemQty}</span>
          <button class="ciq-btn">+</button>
        </div>
      </div>
      <button class="cart-item-remove"><svg viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg></button>`;
    
    const btns = div.querySelectorAll('.ciq-btn');
    btns[0].addEventListener('click', ()=>changeCartQty(item.id, -1));
    btns[1].addEventListener('click', ()=>changeCartQty(item.id,  1));
    div.querySelector('.cart-item-remove').addEventListener('click', ()=>removeFromCart(item.id));
    body.appendChild(div);
  });

  const sub = cartSubtotal();

  // Recalculate on every cart change (e.g. after the shipping list loads)
  shippingCost = currentShippingCost();
  refreshShippingTilePrices();
  const actualShipping = shippingCost;
  const grandTotal = sub + actualShipping;

  // ── UPDATE CART DRAWER ELEMENTS ──
  const cartSubtotalEl = document.getElementById('cartSubtotal');
  if (cartSubtotalEl) cartSubtotalEl.textContent = `GH₵ ${sub.toLocaleString()}`;
  
  const cartShippingEl = document.getElementById('cartShippingDisplay');
  if (cartShippingEl) cartShippingEl.textContent = actualShipping === 0 ? 'Free' : `GH₵ ${actualShipping}`;
  
  const cartTotalEl = document.getElementById('cartTotal');
  if (cartTotalEl) cartTotalEl.textContent = `GH₵ ${grandTotal.toLocaleString()}`;

  // ── FIX 2: UPDATE CHECKOUT SCREEN SUMMARY ELEMENTS AUTOMATICALLY ──
  const checkoutShippingEl = document.getElementById('coShippingLine');
  if (checkoutShippingEl) {
    checkoutShippingEl.textContent = actualShipping === 0 ? 'Free' : `GH₵ ${actualShipping}`;
  }

  const checkoutTotalEl = document.getElementById('coTotal');
  if (checkoutTotalEl) {
    checkoutTotalEl.textContent = `GH₵ ${grandTotal.toLocaleString()}`;
  }

  // Sync structural items lines if checkout workspace is rendering
  if (typeof updateCheckoutSummary === 'function') {
    updateCheckoutSummary();
  }
}


function openCart(){
  document.getElementById('cartOverlay').classList.add('open');
  document.getElementById('cartDrawer').classList.add('open');
  document.body.style.overflow='hidden';
}
function closeCart(){
  document.getElementById('cartOverlay').classList.remove('open');
  document.getElementById('cartDrawer').classList.remove('open');
  document.body.style.overflow='';
}

// ══════════════════════════════════════════════════
// CHECKOUT
// ══════════════════════════════════════════════════
function selectShipping(method, cost) {
  shippingMethod = method;

  // 1. Calculate cost using the backend-loaded base price
  if (shippingTiers[method] === undefined) shippingTiers[method] = cost; // fallback tiles before the API loads
  shippingCost = currentShippingCost();

  // Update the displayed price on the shipping option tile
  const priceEl = document.getElementById('ship_' + method + '_price');
  if (priceEl) priceEl.textContent = shippingCost === 0 ? 'Free' : `GH₵ ${shippingCost.toLocaleString()}`;

  // 2. Update the UI active states
  document.querySelectorAll('.ship-opt').forEach(el => el.classList.remove('selected'));
  const targetOpt = document.getElementById('ship_' + method);
  if (targetOpt) targetOpt.classList.add('selected');

  // 3. Update calculations and totals ONCE
  updateCartUI();
  updateCheckoutSummary();
}

// Standard and Express deliver within Ghana only; every other country ships Diaspora.
// The server enforces the same rule (lib/shipping.js) when the order is created.
function applyCountryShipping() {
  const sel = document.getElementById('co_country');
  if (!sel) return;
  const allowed = sel.value === 'GH' ? ['standard', 'express'] : ['diaspora'];
  document.querySelectorAll('.ship-opt').forEach(el => {
    el.style.display = allowed.includes(el.id.replace('ship_', '')) ? '' : 'none';
  });
  if (!allowed.includes(shippingMethod)) selectShipping(allowed[0], shippingTiers[allowed[0]]);
}
document.addEventListener('change', e => {
  if (e.target.id === 'co_country') applyCountryShipping();
});


// ══════════════════════════════════════════════════
// DYNAMIC SHIPPING TIERS FROM BACKEND
// ══════════════════════════════════════════════════
async function fetchShippingTiersFromAPI() {
  const container = document.getElementById('dynamicShippingOptions');
  if (!container) return;

  try {
    // 1. Grab shipping tier configurations from your Railway backend
    const data = await apiFetch('/api/shipping_methods');
    const tiers = Array.isArray(data) ? data : data.shipping_methods || [];
    
    if (!tiers.length) throw new Error("No shipping profiles configured");

    // 2. Generate HTML items dynamically using actual rows from Supabase
    // Store base prices keyed by tier ID so selectShipping can price each method
    shippingTiers = {};
    tiers.forEach(tier => {
      shippingTiers[tier.id] = parseFloat(tier.price);
    });

    container.innerHTML = tiers.map((tier, index) => {
      const basePrice = parseFloat(tier.price);
      const sub = cartSubtotal();
      const effectivePrice = basePrice;
      const displayPrice = effectivePrice === 0 ? 'Free' : `GH₵ ${effectivePrice.toLocaleString()}`;
      const isSelectedClass = index === 0 ? 'selected' : '';

      if (index === 0) {
        shippingMethod = tier.id;
        shippingCost = effectivePrice;
      }

      return `
        <div class="ship-opt ${isSelectedClass}" id="ship_${tier.id}" onclick="selectShipping('${tier.id}', ${basePrice})">
          <div class="ship-opt-name">${tier.name}</div>
          <div class="ship-opt-days">${tier.delivery_time || tier.days || ''}</div>
          <div class="ship-opt-price" id="ship_${tier.id}_price">${displayPrice}</div>
        </div>
      `;
    }).join('');

    updateCartUI();
    applyCountryShipping();

  } catch (err) {
    console.warn('Backend shipping endpoint missing or down. Loading safety fallbacks:', err.message);
    
    // Safety net layout matches your exact 50 / 80 / 200 numbers if the API fails
    container.innerHTML = `
      <div class="ship-opt selected" id="ship_standard" onclick="selectShipping('standard',50)">
        <div class="ship-opt-name">Standard</div><div class="ship-opt-days">3–5 business days</div><div class="ship-opt-price">GH₵ 50</div>
      </div>
      <div class="ship-opt" id="ship_express" onclick="selectShipping('express',80)">
        <div class="ship-opt-name">Express</div><div class="ship-opt-days">1–2 business days</div><div class="ship-opt-price">GH₵ 80</div>
      </div>
      <div class="ship-opt" id="ship_diaspora" onclick="selectShipping('diaspora',200)">
        <div class="ship-opt-name">Diaspora</div><div class="ship-opt-days">7–14 business days</div><div class="ship-opt-price">GH₵ 200</div>
      </div>
    `;
    selectShipping('standard', 50);
    applyCountryShipping();
  }
}



function updateCheckoutSummary(){
  const lines = document.getElementById('coOrderLines');
  if(!lines) return;
  let html = '';
  cart.forEach(item => {
  const qty = item.qty || item.quantity || 1;
  html += `
    <div class="co-order-line">
      <span>${item.name} × ${qty}</span>
      <span>GH₵ ${(item.price * qty).toLocaleString()}</span>
    </div>
  `;
  });
  lines.innerHTML = html;
  document.getElementById('coShippingLine').textContent = shippingCost===0 ? 'Free' : `GH₵ ${shippingCost}`;
  refreshShippingTilePrices();
  const total = cartSubtotal() + shippingCost;
  document.getElementById('coTotal').textContent = `GH₵ ${total.toLocaleString()}`;
}

function openCheckout(){
  if(cart.length===0){ showToast('!','Your cart is empty','toast-red'); return; }
  closeCart();
  trackAd('InitiateCheckout', { value: cartSubtotal(), ids: cart.map(i => i.id) });
  document.getElementById('checkoutContent').innerHTML = getCheckoutFormHTML();
  updateCheckoutSummary();
  applyCountryShipping();
  fetchShippingTiersFromAPI();
  document.getElementById('checkoutOverlay').classList.add('open');
  document.getElementById('checkoutModalTitle').textContent = 'Checkout';
  document.body.style.overflow='hidden';
}

function getCheckoutFormHTML(){
  return `<div class="checkout-body">
    <div class="checkout-grid">
      <div class="co-section-title">Contact Details</div>
      <div class="co-field"><label class="co-label">First Name</label><input class="co-input" id="co_first" placeholder="Kwame" autocomplete="given-name"></div>
      <div class="co-field"><label class="co-label">Last Name</label><input class="co-input" id="co_last" placeholder="Mensah" autocomplete="family-name"></div>
      <div class="co-field full"><label class="co-label">Email Address</label><input class="co-input" id="co_email" type="email" placeholder="you@email.com" autocomplete="email"></div>
      <div class="co-field full"><label class="co-label">Phone Number</label><input class="co-input" id="co_phone" type="tel" placeholder="+233 24 000 0000" autocomplete="tel"></div>
      <div class="co-section-title">Delivery Address</div>
      <div class="co-field full"><label class="co-label">Street Address</label><input class="co-input" id="co_addr" placeholder="123 Independence Ave" autocomplete="street-address"></div>
      <div class="co-field"><label class="co-label">City</label><input class="co-input" id="co_city" placeholder="Accra" autocomplete="address-level2"></div>
      <div class="co-field"><label class="co-label">Country</label>
        <select class="co-input" id="co_country">
          <option value="GH">Ghana</option><option value="NG">Nigeria</option><option value="UK">United Kingdom</option><option value="US">United States</option><option value="CA">Canada</option><option value="other">Other</option>
        </select>
      </div>
      <div class="co-section-title">Shipping Method</div>
      <div class="shipping-options">
        <!-- Standard - GH₵ 50 -->
        <div class="ship-opt selected" id="ship_standard" onclick="selectShipping('standard', 50)">
          <div class="ship-opt-name">Standard</div>
          <div class="ship-opt-days">3–5 business days</div>
          <div class="ship-opt-price" id="ship_standard_price">GH₵ 50</div>
        </div>

        <!-- Express - GH₵ 80 -->
        <div class="ship-opt" id="ship_express" onclick="selectShipping('express', 80)">
          <div class="ship-opt-name">Express</div>
          <div class="ship-opt-days">1–2 business days</div>
          <div class="ship-opt-price" id="ship_express_price">GH₵ 80</div>
        </div>

        <!-- Diaspora - GH₵ 200 -->
        <div class="ship-opt" id="ship_diaspora" onclick="selectShipping('diaspora', 200)">
          <div class="ship-opt-name">Diaspora</div>
          <div class="ship-opt-days">7–14 business days</div>
          <div class="ship-opt-price" id="ship_diaspora_price">GH₵ 200</div>
        </div>
      </div>
      <div class="co-section-title">Order Summary</div>
      <div class="co-order-summary"><div id="coOrderLines"></div><div class="co-order-line"><span>Shipping</span><span id="coShippingLine">GH₵ 50</span></div><div class="co-order-line total"><span>Total</span><span id="coTotal">GH₵ 0</span></div></div>
      <button class="paystack-btn" id="paystackBtn" onclick="initiatePaystack()"><span>Pay Securely</span><span class="paystack-logo">via PAYSTACK</span></button>
      <p style="grid-column:1/-1;text-align:center;font-size:0.75rem;color:rgba(233,208,162,0.73);margin-top:-6px">256-bit SSL encryption · Your data is always protected</p>
    </div>
  </div>`;
}

function closeCheckout(){
  // 1. Hide the modal overlay using your existing structure
  const overlay = document.getElementById('checkoutOverlay');
  if (overlay) overlay.classList.remove('open');
  
  // 2. Re-enable page scrolling
  document.body.style.overflow = '';

  // 3. Clear the form inputs so they are fresh for the next order
  const fields = ['co_first', 'co_last', 'co_email', 'co_phone', 'co_addr', 'co_city'];
  fields.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });

  // 4. Force a page refresh or clear out the success HTML content box
  // This prevents the old "Order Confirmed" template from lingering around
  setTimeout(() => {
    window.location.reload(); 
  }, 300);
}


// ══════════════════════════════════════════════════
// PAYSTACK INTEGRATION (API-backed)
// ══════════════════════════════════════════════════
async function initiatePaystack(){
  const first = document.getElementById('co_first')?.value?.trim();
  const last  = document.getElementById('co_last')?.value?.trim();
  const email = document.getElementById('co_email')?.value?.trim();
  const phone = document.getElementById('co_phone')?.value?.trim();
  const addr  = document.getElementById('co_addr')?.value?.trim();
  const city  = document.getElementById('co_city')?.value?.trim();
  const countrySel = document.getElementById('co_country');
  const country = countrySel ? countrySel.options[countrySel.selectedIndex].text : '';

  if(!first||!last){ showToast('!','Please enter your name','toast-red'); return; }
  if(!email||!email.includes('@')){ showToast('!','Please enter a valid email','toast-red'); return; }
  if(!phone){ showToast('!','Please enter your phone number','toast-red'); return; }
  if(!addr||!city){ showToast('!','Please enter your delivery address','toast-red'); return; }

  if(typeof PaystackPop === 'undefined'){
    showToast('!','Payment system not loaded - please refresh','toast-red');
    return;
  }

  const btn = document.getElementById('paystackBtn');
  const resetBtn = () => {
    btn.disabled = false;
    btn.innerHTML = '<span>Pay Securely</span><span class="paystack-logo">via PAYSTACK</span>';
  };
  btn.disabled = true;
  btn.innerHTML = '<span>Processing…</span>';

  const deliveryAddress = [addr, city, country].filter(Boolean).join(', ');

  // Step 1: Create the order on the backend. The server checks stock and
  // calculates the total from its own prices — we charge exactly that amount.
  // If this fails, stop: never take a payment without an order behind it.
  let order;
  try {
    order = await apiFetch('/api/orders', {
      method: 'POST',
      body: JSON.stringify({
        customer_name: `${first} ${last}`,
        customer_email: email,
        customer_phone: phone,
        delivery_address: deliveryAddress,
        shipping_method: shippingMethod,
        country: countrySel ? countrySel.value : '',
        items: cart.map(i => ({ product_id: i.id, qty: Number(i.qty || i.quantity || 1) })),
      }),
    });
  } catch (err) {
    console.error('Order creation failed:', err.message);
    showToast('!', err.status === 429 || err.status === 400 ? err.message : 'Could not start checkout — please try again', 'toast-red');
    fetchProductsFromAPI(); // refresh stock/prices in case they changed
    resetBtn();
    return;
  }

  const ref = order.order_ref;

  // Show the server's total in case it differs from the cart (e.g. a price changed)
  const totalEl = document.getElementById('coTotal');
  if (totalEl) totalEl.textContent = `GH₵ ${Number(order.total_ghs).toLocaleString()}`;

  // Step 2: Open Paystack for the server-calculated amount
  try {
    const handler = PaystackPop.setup({
      key: PAYSTACK_PUBLIC_KEY,
      email: email,
      amount: order.total_pesewas,
      currency: 'GHS',
      ref: ref,
      firstname: first,
      lastname: last,
      phone: phone,
      metadata: {
        custom_fields: [
          // order_ref is how the server's webhook finds this order — required
          {display_name:'Order Ref', variable_name:'order_ref', value: ref},
          {display_name:'Customer Name', variable_name:'customer_name', value:`${first} ${last}`},
          {display_name:'Delivery Address', variable_name:'address', value: deliveryAddress},
          {display_name:'Shipping Method', variable_name:'shipping', value:shippingMethod},
          {display_name:'Cart Items', variable_name:'cart', value: cart.map(i=>`${i.name} x${i.qty}`).join(', ')},
        ]
      },
      onClose: function(){
        resetBtn();
        showToast('!','Payment cancelled','toast-red');
      },
      callback: function(response){
        onPaymentSuccess(response, {first, last, email, phone, addr, city, ref, total: Number(order.total_ghs)});
      }
    });
    handler.openIframe();
  } catch(err) {
    console.error('Paystack error:', err);
    resetBtn();
    showToast('!','Payment error - please try again','toast-red');
  }
}


function onPaymentSuccess(response, customer){
  // The server's Paystack webhook confirms the order, deducts stock and
  // sends the confirmation email — nothing to record in the browser.

  // Clear cart
  const orderRef = customer.ref;
  trackAd('Purchase', { value: customer.total, ids: cart.map(i => i.id), orderRef });
  cart = [];
  localStorage.removeItem('asanti_cart');
  updateCartUI();

  // Show success modal overlay contents dynamically
  document.getElementById('checkoutModalTitle').textContent = 'Order Confirmed';
  document.getElementById('checkoutContent').innerHTML = `
    <div class="order-success">
      <div class="success-icon"><svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg></div>
      <div class="success-title">Payment Successful!</div>
      <div class="success-ref">Order Ref: ${orderRef}</div>
      <p class="success-msg">Thank you for your order! A confirmation has been sent to <strong style="color:var(--gold)">${customer.email}</strong>. Your order will be dispatched within 1–2 business days.</p>
      <button class="btn btn-gold" style="margin-top:28px" onclick="closeCheckout()">Continue Shopping</button>
    </div>`;
  showToast('✓', 'Order placed successfully!', 'toast-green');
}


// ══════════════════════════════════════════════════
// TOAST NOTIFICATIONS
// ══════════════════════════════════════════════════
function showToast(icon, msg, type='toast-gold'){
  const wrap = document.getElementById('toastWrap');
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.innerHTML = `<span class="toast-icon">${icon}</span><span>${msg}</span>`;
  wrap.appendChild(t);
  requestAnimationFrame(()=>{ t.classList.add('show'); });
  setTimeout(()=>{ t.classList.remove('show'); setTimeout(()=>t.remove(),400); }, 3000);
}

// ══════════════════════════════════════════════════
// ── Newsletter ──
async function handleNewsletterSubmit(el){
  const form = el && (el.closest ? el.closest('.nl-form') : null);
  const input = (form && form.querySelector('.nl-input')) || document.getElementById('nlEmailInput');
  const email = input?.value?.trim();
  if(!email || !email.includes('@')){ showToast('!','Enter a valid email','toast-red'); return; }
  const ok = await subscribeNewsletter(email);
  if(ok){
    showToast('✓','You\'re on the list!','toast-green');
    if(input) input.value = '';
  } else {
    showToast('!','Could not subscribe right now — try again','toast-red');
  }
}

// ── Review form (store page) — emailed to the team, published only after approval ──
async function handleReviewSubmit(form){
  const data = Object.fromEntries(new FormData(form));
  if (!data.rating) { showToast('!','Please choose a star rating','toast-red'); return; }
  const btn = form.querySelector('.review-submit');
  if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }
  try {
    await apiFetch('/api/reviews', {
      method: 'POST',
      body: JSON.stringify({
        name: data.name, city: data.city, email: data.email, rating: Number(data.rating),
        review: data.review, video_link: data.video_link || '', consent: data.consent ? 'true' : 'false',
      }),
    });
    form.reset();
    showToast('✓','Thank you! We read every review and may feature yours here soon.','toast-green');
  } catch (err) {
    showToast('!', err.status === 400 || err.status === 429 ? err.message : 'Could not send your review — please try again','toast-red');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Send Review'; }
  }
}

// ── Contact form ──
async function handleContactSubmit(){
  const first = document.getElementById('cf_first')?.value?.trim();
  const last  = document.getElementById('cf_last')?.value?.trim();
  const email = document.getElementById('cf_email')?.value?.trim();
  const message = document.getElementById('cf_message')?.value?.trim();
  if(!first||!last){ showToast('!','Enter your name','toast-red'); return; }
  if(!email||!email.includes('@')){ showToast('!','Enter a valid email','toast-red'); return; }
  if(!message){ showToast('!','Enter your message','toast-red'); return; }
  const btn = document.getElementById('cfSendBtn');
  if(btn){ btn.disabled=true; btn.textContent='Sending…'; }
  const ok = await submitContact(`${first} ${last}`, email, message);
  if(btn){ btn.disabled=false; btn.textContent='Send Message'; }
  if(ok){
    showToast('✓','Message sent! We\'ll reply within 2 business days.','toast-green');
    ['cf_first','cf_last','cf_email','cf_message'].forEach(id=>{
      const el=document.getElementById(id); if(el) el.value='';
    });
  } else {
    showToast('!','Could not send — please email us directly','toast-red');
  }
}

// ══════════════════════════════════════════════════
// CARD GALLERY & VIEWER (Game Play page)
// ══════════════════════════════════════════════════
const CARD_RANKS = [
  ['na', 'Nana'], ['qm', 'Queen Mother'], ['dc', 'Divisional Chief'], ['sc', 'Sub-Chief'],
  ['lc', 'Local Chief'], ['oy', 'Okyeame'], ['10', '10'], ['9', '9'], ['8', '8'], ['7', '7'], ['6', '6'], ['5', '5'],
];
const SUIT_NAMES = { gold: 'Gold (Ahennie)', red: 'Red (Bammɔ)', green: 'Green (Ahaban Aniwa)' };
const DECK = {
  gold:  CARD_RANKS.map(([r, n]) => ({ id: 'gold_' + r,  name: n, suit: SUIT_NAMES.gold })),
  red:   CARD_RANKS.map(([r, n]) => ({ id: 'red_' + r,   name: n, suit: SUIT_NAMES.red })),
  green: CARD_RANKS.map(([r, n]) => ({ id: 'green_' + r, name: n, suit: SUIT_NAMES.green })),
  sacred: [
    { id: 'fourth_gs',   name: 'Golden Stool', suit: 'Fourth suit' },
    { id: 'fourth_ok_1', name: 'Okomfo',       suit: 'Fourth suit' },
    { id: 'fourth_ok_2', name: 'Okomfo',       suit: 'Fourth suit' },
  ],
};
const ALL_CARDS = [...DECK.gold, ...DECK.red, ...DECK.green, ...DECK.sacred];
let viewerList = ALL_CARDS, viewerIndex = 0;

function showDeckSuit(suit, tab){
  const grid = document.getElementById('deckGrid');
  if (!grid) return;
  document.querySelectorAll('.deck-tab').forEach(t => {
    const on = t.dataset.suit === suit;
    t.classList.toggle('active', on);
    t.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  grid.innerHTML = DECK[suit].map(c =>
    `<button type="button" class="real-card" onclick="openCardViewer('${c.id}','${suit}')" aria-label="View the ${c.name} card">` +
    `<img src="images/cards/${c.id}-240.webp" width="240" height="336" loading="lazy" decoding="async" alt="${c.suit ? c.suit + ' ' : ''}${c.name} card">` +
    `<span>${c.name}</span></button>`).join('');
  const note = document.getElementById('deckNote');
  if (note) note.style.display = suit === 'sacred' ? 'none' : '';
}

function openCardViewer(id, suit){
  viewerList = suit && DECK[suit] ? DECK[suit] : ALL_CARDS;
  viewerIndex = Math.max(0, viewerList.findIndex(c => c.id === id));
  renderCardViewer();
  const v = document.getElementById('cardViewer');
  if (!v) return;
  v.classList.add('open');
  document.body.style.overflow = 'hidden';
  v.querySelector('.cv-close').focus();
}
function renderCardViewer(){
  const c = viewerList[viewerIndex];
  const img = document.getElementById('cardViewerImg');
  img.src = `images/cards/${c.id}-600.webp`;
  img.alt = `${c.suit ? c.suit + ' ' : ''}${c.name} card`;
  document.getElementById('cardViewerCaption').textContent = c.suit ? `${c.name} · ${c.suit}` : c.name;
}
function stepCardViewer(delta){
  viewerIndex = (viewerIndex + delta + viewerList.length) % viewerList.length;
  renderCardViewer();
}
function closeCardViewer(){
  const v = document.getElementById('cardViewer');
  if (v) v.classList.remove('open');
  document.body.style.overflow = '';
}
document.addEventListener('keydown', e => {
  const v = document.getElementById('cardViewer');
  if (!v || !v.classList.contains('open')) return;
  if (e.key === 'Escape') closeCardViewer();
  if (e.key === 'ArrowRight') stepCardViewer(1);
  if (e.key === 'ArrowLeft') stepCardViewer(-1);
});
document.addEventListener('DOMContentLoaded', () => showDeckSuit('gold'));
