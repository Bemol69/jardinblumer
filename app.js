// ===== CONFIGURACIÓN =====
// Datos de la tienda: los inserta scripts/build.mjs desde tienda.config.json y data/ajustes.json
const TIENDA = %%TIENDA_JSON%%;
const WHATSAPP_NUMBER = TIENDA.whatsapp;

const PAGOS = {
  transferencia: '🏦 *Pago:* Transferencia',
  efectivo: '💵 *Pago:* Efectivo',
  tarjeta: '💳 *Pago:* Débito o crédito',
};

// Buscadores oficiales de sucursales (ninguna de las 3 empresas tiene una API pública sin contrato)
const COURIERS = {
  Starken: 'https://www.starken.cl/sucursales',
  Chilexpress: 'https://centrodeayuda.chilexpress.cl/sucursales',
  'Blue Express': 'https://www.blue.cl/lockers-puntos/encuentra-tu-punto',
};
const EMPRESAS = (TIENDA.empresas_envio || []).filter((e) => COURIERS[e]);

// Productos y categorías se editan desde el panel /admin (data/productos, data/categorias)
// y se publican juntos en data/catalogo.json (lo genera scripts/build.mjs)
let PRODUCTS = [];
let FILTERS = [['todos', 'Todos']];
let REGIONES = [];
let CUPONES = [];

const SORTS = {
  destacados: null,
  'precio-asc': (a, b) => a.desde - b.desde,
  'precio-desc': (a, b) => b.desde - a.desde,
};
const MAX_QTY = 20;
const REDUCE = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ===== UTILIDADES =====
const clp = (n) => '$' + n.toLocaleString('es-CL');
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const findProduct = (id) => PRODUCTS.find((p) => p.id === id);
const priceText = (p) => (p.desde > 0 ? `${p.variants.length > 1 ? 'Desde ' : ''}${clp(p.desde)}` : 'Consultar precio');
// Se usa api.whatsapp.com y no wa.me: la redirección de wa.me rompe los emojis (llegan como �)
const waUrl = (text) =>
  `https://api.whatsapp.com/send?phone=${WHATSAPP_NUMBER}${text ? '&text=' + encodeURIComponent(text) : ''}`;

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('is-on');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove('is-on'), 2600);
}

function lockScroll() {
  const open = ['#productModal', '#bag'].some((s) => { const el = $(s); return el && el.classList.contains('is-open'); });
  document.body.style.overflow = open ? 'hidden' : '';
}

// ===== CATÁLOGO =====
const grid = $('#productGrid');
const filters = $('#filters');
let currentCat = 'todos';

function renderFilters(active) {
  const count = (k) => (k === 'todos' ? PRODUCTS.length : PRODUCTS.filter((p) => p.tags.includes(k)).length);
  filters.innerHTML = FILTERS
    .filter(([k]) => count(k) > 0) // oculta categorías vacías
    .map(([k, label]) => `<button class="tab ${k === active ? 'is-active' : ''}" role="tab" aria-selected="${k === active}" data-cat="${esc(k)}">${esc(label)}<span class="tab__n">${count(k)}</span></button>`)
    .join('');
}

// Misma tarjeta que escribe scripts/build.mjs en el HTML (para Google)
const card = (p, i = 0) => `
    <article class="tag${p.agotado ? ' is-soldout' : ''}" style="--i:${i}">
      <span class="tag__string" aria-hidden="true"></span>
      <button class="tag__photo" type="button" data-view="${esc(p.id)}" aria-label="Ver ${esc(p.name)}">
        ${p.agotado ? '<span class="badge badge--soldout">Agotado</span>' : p.badge ? `<span class="badge">${esc(p.badge)}</span>` : ''}
        <img src="${esc(p.thumb)}" alt="${esc(p.name)}" loading="lazy" decoding="async">
        ${p.thumbs[1] ? `<img class="alt" src="${esc(p.thumbs[1])}" alt="" loading="lazy" decoding="async">` : ''}
      </button>
      <div class="tag__body">
        <h3>${esc(p.name)}</h3>
        ${p.desc ? `<p class="tag__desc">${esc(p.desc)}</p>` : ''}
        <div class="tag__foot">
          <span class="price${p.desde > 0 ? '' : ' price--ask'}">${p.desde > 0 ? `${p.variants.length > 1 ? '<small>desde</small> ' : ''}${clp(p.desde)}` : 'Consultar precio'}</span>
          ${p.agotado
            ? `<a class="btn btn--ghost btn--sm" target="_blank" rel="noopener" href="${esc(waUrl(`Hola! ¿Tienen stock de ${p.name}?`))}">Consultar</a>`
            : `<button class="btn btn--primary btn--sm" type="button" data-view="${esc(p.id)}">${p.variants.length > 1 ? 'Elegir' : 'Agregar'}</button>`}
        </div>
      </div>
    </article>`;

function renderProducts(cat = currentCat) {
  currentCat = cat;
  let list = cat === 'todos' ? PRODUCTS : PRODUCTS.filter((p) => p.tags.includes(cat));
  const sort = SORTS[$('#sort').value];
  if (sort) list = [...list].sort(sort);
  $('#count').innerHTML = `Mostrando <strong>${list.length}</strong> ${list.length === 1 ? 'arreglo' : 'arreglos'}`;
  grid.classList.toggle('is-all', cat === 'todos');
  grid.innerHTML = list.map(card).join('');
  grid.querySelectorAll('.tag').forEach((el) => el.classList.add('is-in'));
}

filters.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-cat]');
  if (!btn) return;
  renderFilters(btn.dataset.cat);
  renderProducts(btn.dataset.cat);
});
$('#sort').addEventListener('change', () => renderProducts());

// ===== FICHA DE PRODUCTO =====
const pModal = $('#productModal');
let current = null;
let photo = 0;
let pick = { v: '', qty: 1 };
let lastFocus = null;

function showPhoto(i) {
  const g = current.gallery;
  photo = (i + g.length) % g.length;
  $('#pmImg').src = g[photo];
  $('#pmThumbs').querySelectorAll('button').forEach((b, k) => b.classList.toggle('is-active', k === photo));
}

const pickedVariant = () => (current ? current.variants.find((v) => v.name === pick.v) : null);

function renderVariants() {
  $('#pmSizes').innerHTML = current.variants
    .map((v) => `<button type="button" role="radio" aria-checked="${v.name === pick.v}" data-size="${esc(v.name)}"><span>${esc(v.name)}</span>${v.price ? `<b>${clp(v.price)}</b>` : ''}</button>`)
    .join('');
  const v = pickedVariant();
  $('#pmPrice').textContent = v ? clp(v.price) : priceText(current);
}

function openProduct(id) {
  const p = findProduct(id);
  if (!p) return;
  lastFocus = document.activeElement;
  current = p;
  pick = { v: p.variants.length === 1 ? p.variants[0].name : '', qty: 1 };

  $('#pmImg').alt = p.name;
  $('#pmThumbs').innerHTML = p.gallery.length > 1
    ? p.thumbs.map((src, i) => `<button type="button" data-photo="${i}" aria-label="Foto ${i + 1}"><img src="${esc(src)}" alt="" loading="lazy"></button>`).join('')
    : '';
  pModal.classList.toggle('has-gallery', p.gallery.length > 1);
  showPhoto(0);
  $('#pmCat').textContent = FILTERS.filter(([k]) => p.tags.includes(k)).map(([, l]) => l).join(' · ');
  $('#pmName').textContent = p.name;
  $('#pmDesc').textContent = p.desc + (p.cot ? ' Precio referencial: lo confirmamos contigo por WhatsApp.' : '');
  $('#pmSizesWrap').hidden = !p.variants.length;
  $('#pmSelLabel').textContent = p.selector;
  $('#pmSizeHint').textContent = p.variants.length === 1 ? '· opción única' : '';
  renderVariants();
  $('#pmQty').textContent = '1';
  $('#pmError').hidden = true;
  $('#pmAdd').hidden = p.agotado;
  document.querySelector('.pm__qty').hidden = p.agotado;
  $('#pmAsk').href = waUrl(`Hola! Quiero consultar por ${p.name} 🌸`);

  pModal.classList.add('is-open');
  pModal.setAttribute('aria-hidden', 'false');
  lockScroll();
  $('#pmAdd').hidden ? $('#pmAsk').focus() : pModal.querySelector('.modal__close').focus();
}

function closeProduct() {
  if (!pModal.classList.contains('is-open')) return;
  pModal.classList.remove('is-open');
  pModal.setAttribute('aria-hidden', 'true');
  lockScroll();
  if (lastFocus && !bagEl.classList.contains('is-open')) lastFocus.focus();
}

pModal.addEventListener('click', (e) => {
  const t = e.target;
  if (t.closest('[data-close]')) { closeProduct(); return; }
  const thumb = t.closest('[data-photo]');
  if (thumb) showPhoto(Number(thumb.dataset.photo));
  const step = t.closest('[data-step-photo]');
  if (step) showPhoto(photo + Number(step.dataset.stepPhoto));
  const size = t.closest('[data-size]');
  if (size) {
    pick.v = size.dataset.size;
    $('#pmError').hidden = true;
    renderVariants();
  }
  const q = t.closest('[data-qty]');
  if (q) {
    pick.qty = Math.min(MAX_QTY, Math.max(1, pick.qty + Number(q.dataset.qty)));
    $('#pmQty').textContent = pick.qty;
  }
});

// Deslizar la foto con el dedo en el celular
let touchX = null;
$('#pmImg').addEventListener('touchstart', (e) => { touchX = e.touches[0].clientX; }, { passive: true });
$('#pmImg').addEventListener('touchend', (e) => {
  if (touchX === null || current.gallery.length < 2) return;
  const dx = e.changedTouches[0].clientX - touchX;
  if (Math.abs(dx) > 40) showPhoto(photo + (dx < 0 ? 1 : -1));
  touchX = null;
});

$('#pmAdd').addEventListener('click', () => {
  if (current.variants.length && !pick.v) {
    $('#pmError').textContent = `Elige ${current.selector === 'Tamaño' ? 'un tamaño' : current.selector === 'Formato' ? 'una opción' : 'la cantidad de varas'} para agregarlo a tu pedido.`;
    $('#pmError').hidden = false;
    return;
  }
  addToBag(current.id, pick.v, pick.qty);
  closeProduct();
  toast(`${current.name}${pick.v ? ` · ${pick.v}` : ''} agregado a tu pedido 🌸`);
});

// ===== PEDIDO (BOLSA) =====
// Se guarda en este navegador para no perderla al recargar la página
const bagEl = $('#bag');
const BAG_KEY = 'jbBag';
let BAG = [];
try { BAG = JSON.parse(localStorage.getItem(BAG_KEY) || '[]'); } catch (e) { BAG = []; }
if (!Array.isArray(BAG)) BAG = [];

function saveBag() {
  try { localStorage.setItem(BAG_KEY, JSON.stringify(BAG)); } catch (e) {}
}

function addToBag(id, v, qty) {
  const line = BAG.find((l) => l.id === id && l.v === v);
  if (line) line.qty = Math.min(MAX_QTY, line.qty + qty);
  else BAG.push({ id, v, qty });
  saveBag();
  renderBag(true);
}

// Productos borrados o agotados desde el panel se descartan solos. Si una opción dejó de existir, se marca.
const bagLines = () => BAG
  .map((l) => {
    const p = findProduct(l.id);
    const variant = p && p.variants.find((x) => x.name === l.v);
    return { ...l, p, price: variant ? variant.price : (p ? p.desde : 0), sinOpcion: !!l.v && !variant };
  })
  .filter((l) => l.p && !l.p.agotado);
const bagTotal = () => bagLines().reduce((s, l) => s + l.price * l.qty, 0);
const aCotizar = () => bagLines().some((l) => !l.price || l.p.cot);

// ===== CÓDIGOS DE DESCUENTO =====
// Se crean en /admin → Códigos de descuento. El catálogo trae solo su huella SHA-256 (no el código en texto):
// aquí se calcula la huella de lo que escribe el cliente y se compara. CUPON_SAL debe coincidir con scripts/build.mjs.
const CUPON_SAL = 'jardinblumer:';
const CUPON_KEY = 'jbCupon';
let CUPON = null; // { codigo, c } del código aplicado
const normCodigo = (c) => String(c || '').toUpperCase().replace(/\s+/g, '');
const hoyChile = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santiago' });
const fechaCL = (iso) => iso.split('-').reverse().join('-');

async function huella(codigo) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(CUPON_SAL + normCodigo(codigo)));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const cuponTexto = (c) => (c.tipo === 'monto' ? `${clp(c.valor)} de descuento` : `${c.valor}% de descuento`);
const aplicaA = (c, id) => !c.productos || c.productos.includes(id);

// Descuento del código aplicado sobre el pedido actual
function descuento() {
  if (!CUPON) return null;
  const c = CUPON.c;
  const base = bagLines().filter((l) => l.price && aplicaA(c, l.p.id)).reduce((s, l) => s + l.price * l.qty, 0);
  if (!base) return { c, monto: 0, motivo: 'no-aplica' };
  if (c.minimo && base < c.minimo) return { c, monto: 0, motivo: 'minimo', falta: c.minimo - base };
  const monto = c.tipo === 'monto' ? Math.min(c.valor, base) : Math.round((base * c.valor) / 100);
  return { c, monto, base };
}
const totalFinal = () => bagTotal() - ((descuento() || {}).monto || 0);

async function aplicarCupon(codigo, silencioso) {
  const code = normCodigo(codigo);
  if (!code) return;
  let c = null;
  try {
    const h = await huella(code);
    c = CUPONES.find((x) => x.h === h && !(x.vence && x.vence < hoyChile())) || null;
  } catch (e) {
    console.error(e); // crypto.subtle solo existe en https o localhost
  }
  CUPON = c ? { codigo: code, c } : null;
  try { c ? localStorage.setItem(CUPON_KEY, code) : localStorage.removeItem(CUPON_KEY); } catch (e) {}
  if (!c && !silencioso) {
    const st = $('#cuponStatus');
    st.hidden = false;
    st.className = 'coupon__status is-bad';
    st.innerHTML = '<strong>Código no válido</strong><small>No existe o ya no está vigente. Revisa que esté bien escrito.</small>';
    return;
  }
  if (c && !silencioso) $('#fCupon').value = '';
  renderBag();
}

function quitarCupon() {
  CUPON = null;
  try { localStorage.removeItem(CUPON_KEY); } catch (e) {}
  $('#cuponStatus').hidden = true;
  renderBag();
}

function renderCupon() {
  const st = $('#cuponStatus');
  const d = descuento();
  $('#cuponForm').hidden = !!CUPON;
  if (!d) { if (!st.classList.contains('is-bad')) st.hidden = true; return; }
  const c = d.c;
  const detalle = [cuponTexto(c), c.aplica !== 'Toda la tienda' ? `en ${c.aplica}` : 'en toda la tienda', c.minimo ? `compra mínima ${clp(c.minimo)}` : '', c.vence ? `válido hasta el ${fechaCL(c.vence)}` : '']
    .filter(Boolean).join(' · ');
  const aviso = d.motivo === 'no-aplica'
    ? '<em>Este código no aplica a los productos de tu pedido.</em>'
    : d.motivo === 'minimo' ? `<em>Te faltan ${clp(d.falta)} en productos de esta promo para usarlo.</em>` : '';
  st.hidden = false;
  st.className = `coupon__status ${d.monto ? 'is-ok' : 'is-warn'}`;
  st.innerHTML = `
    <span class="coupon__badge"><svg class="ic"><use href="#i-check"/></svg>Código actualmente válido</span>
    <strong>${esc(CUPON.codigo)} · ${esc(c.titulo)}</strong>
    <small>${esc(detalle)}</small>
    ${aviso}
    <button type="button" class="coupon__rm" data-quitar-cupon>Quitar código</button>`;
}

function renderBag(bump) {
  const lines = bagLines();
  const units = lines.reduce((s, l) => s + l.qty, 0);
  const n = $('#bagCount');
  n.hidden = !units;
  n.textContent = units;
  if (bump) { n.classList.remove('bump'); void n.offsetWidth; n.classList.add('bump'); }
  const fab = $('.fab');
  fab.hidden = !units;
  $('#fabLabel').textContent = `Mi pedido (${units}) · ${clp(totalFinal())}`;

  $('#bagList').innerHTML = lines.map((l, i) => `
    <li class="bag-item">
      <img src="${esc(l.p.thumb)}" alt="">
      <div class="bag-item__main">
        <h4>${esc(l.p.name)}</h4>
        <small>${l.v ? `${esc(l.v)}${l.sinOpcion ? ' <em>(ya no disponible)</em>' : ''} · ` : ''}${l.price ? clp(l.price) : 'A cotizar'}</small>
        ${CUPON && l.price && aplicaA(CUPON.c, l.p.id) ? `<span class="tag-off">Código ${esc(CUPON.codigo)}</span>` : ''}
        <div class="qty">
          <button type="button" data-line="${i}" data-step="-1" aria-label="Menos">−</button>
          <span>${l.qty}</span>
          <button type="button" data-line="${i}" data-step="1" aria-label="Más">+</button>
        </div>
      </div>
      <div class="bag-item__side">
        <strong>${l.price ? clp(l.price * l.qty) : '—'}</strong>
        <button type="button" class="bag-item__rm" data-remove="${i}" aria-label="Quitar ${esc(l.p.name)}"><svg class="ic"><use href="#i-trash"/></svg></button>
      </div>
    </li>`).join('');
  $('#bagEmpty').hidden = !!lines.length;
  $('#couponBox').hidden = !lines.length || !CUPONES.length;
  renderCupon();
  $('#bagTitle').textContent = lines.length ? `Tu pedido (${units})` : 'Tu pedido';
  updateOrder();
}

$('#bagList').addEventListener('click', (e) => {
  const lines = bagLines();
  const step = e.target.closest('[data-step]');
  const rm = e.target.closest('[data-remove]');
  const line = step ? lines[step.dataset.line] : rm ? lines[rm.dataset.remove] : null;
  if (!line) return;
  const idx = BAG.findIndex((l) => l.id === line.id && l.v === line.v);
  if (rm || BAG[idx].qty + Number(step.dataset.step) < 1) BAG.splice(idx, 1);
  else BAG[idx].qty = Math.min(MAX_QTY, BAG[idx].qty + Number(step.dataset.step));
  saveBag();
  renderBag();
});

function openBag(encargo) {
  closeProduct();
  renderBag();
  if (encargo) $('#encargoBox').open = true;
  bagEl.classList.add('is-open');
  bagEl.setAttribute('aria-hidden', 'false');
  lockScroll();
  (encargo ? $('#fEncargo') : bagEl.querySelector('.modal__close')).focus();
}
function closeBag() {
  bagEl.classList.remove('is-open');
  bagEl.setAttribute('aria-hidden', 'true');
  lockScroll();
}

// ===== CHECKOUT =====
const form = $('#orderForm');
const fRegion = $('#fRegion');
const fComuna = $('#fComuna');
const radio = (name) => (form.querySelector(`input[name="${name}"]:checked`) || {}).value || '';

// Empresas de envío (las elige el dueño en /admin → Ajustes)
$('#fCourier').innerHTML = EMPRESAS
  .map((e, i) => `<label><input type="radio" name="courier" value="${esc(e)}"${i ? '' : ' checked'}><span>${esc(e)}</span></label>`)
  .join('');
$('#fCourier').style.setProperty('--n', Math.max(1, EMPRESAS.length));

function fillRegiones() {
  fRegion.innerHTML = '<option value="">Elige tu región</option>' +
    REGIONES.map((r, i) => `<option value="${i}">${esc(r.region)}</option>`).join('');
}
fRegion.addEventListener('change', () => {
  const r = REGIONES[fRegion.value];
  fComuna.disabled = !r;
  fComuna.innerHTML = r
    ? '<option value="">Elige tu comuna</option>' + r.comunas.map((c) => `<option>${esc(c)}</option>`).join('')
    : '<option value="">Primero la región</option>';
});

function readOrder() {
  const entrega = radio('entrega');
  const r = REGIONES[fRegion.value];
  return {
    entrega,
    envio: entrega === 'envio',
    domicilio: entrega === 'domicilio',
    nombre: $('#fNombre').value.trim(),
    para: $('#fPara').value.trim(),
    tarjeta: $('#fTarjeta').value.trim(),
    fecha: $('#fFecha').value.trim(),
    region: r ? r.region : '',
    comuna: fComuna.value,
    courier: radio('courier'),
    modo: radio('modo'),
    sucursal: $('#fSucursal').value.trim(),
    direccion: entrega === 'envio' ? $('#fDireccion2').value.trim() : $('#fDireccion').value.trim(),
    pago: radio('pago'),
    nota: $('#fNota').value.trim(),
    encargo: $('#fEncargo').value.trim(),
  };
}

// Código corto para identificar el pedido en el chat (ej: JB-4K7Q)
const orderCode = () => 'JB-' + Date.now().toString(36).slice(-4).toUpperCase();
let CODE = orderCode();

// *texto* = negrita y _texto_ = cursiva en WhatsApp
function buildMessage(o) {
  const lines = bagLines();
  const d = descuento();
  const L = [`🌸 *PEDIDO ${TIENDA.nombre.toUpperCase()} · ${CODE}* 🌸`, '━━━━━━━━━━━━━━━'];
  if (lines.length) {
    L.push('💐 *Arreglos*');
    lines.forEach((l, i) => {
      const detalle = [l.v, `x${l.qty}`].filter(Boolean).join(' · ');
      const off = d && d.monto && l.price && aplicaA(d.c, l.p.id) ? ' 🏷️' : '';
      const monto = l.price ? `${clp(l.price * l.qty)}${l.p.cot ? ' _(a confirmar)_' : ''}` : '_a cotizar_';
      L.push(`${i + 1}. *${l.p.name}* · ${detalle} — ${monto}${off}`);
    });
  }
  if (o.encargo) L.push(`📝 *Mi idea:* _${o.encargo}_`);
  L.push('━━━━━━━━━━━━━━━');
  L.push(`🙋 *Nombre:* ${o.nombre || '_(por completar)_'}`);
  if (o.para) L.push(`🎁 *Para:* ${o.para}`);
  if (o.tarjeta) L.push(`💌 *Tarjeta:* _${o.tarjeta}_`);
  if (o.envio) {
    L.push(`🚚 *Entrega:* Envío por ${o.courier || '_(por definir)_'} · ${o.modo === 'domicilio' ? 'a domicilio' : 'retiro en sucursal'}`);
    L.push(`📍 *Destino:* ${o.comuna ? `${o.comuna}, ${o.region}` : '_(por completar)_'}`);
    if (o.modo === 'domicilio') L.push(`🏠 *Dirección:* ${o.direccion || '_(por completar)_'}`);
    else L.push(`🏢 *Sucursal:* ${o.sucursal || '_(por completar)_'}`);
  } else if (o.domicilio) {
    L.push(`🚗 *Entrega:* Despacho a domicilio en ${TIENDA.ciudad}`);
    L.push(`🏠 *Dirección:* ${o.direccion || '_(por completar)_'}`);
  } else {
    L.push('🏡 *Entrega:* Retiro en tienda (Bombero Villalobos #01231, local 03)');
  }
  if (o.fecha) L.push(`📅 *Día y hora:* ${o.fecha}`);
  L.push(PAGOS[o.pago] || PAGOS.transferencia);
  if (o.nota) L.push(`💬 *Comentario:* _${o.nota}_`);
  L.push('━━━━━━━━━━━━━━━');
  if (lines.length) {
    if (d && d.monto) {
      L.push(`🧾 *Subtotal:* ${clp(bagTotal())}`);
      L.push(`🎟️ *Código ${CUPON.codigo}* _(${d.c.titulo} · ${d.c.tipo === 'monto' ? clp(d.c.valor) : d.c.valor + '%'})_: −${clp(d.monto)}`);
    }
    L.push(`💰 *TOTAL: ${clp(totalFinal())}*`);
    const extras = [aCotizar() && 'precios a confirmar', (o.envio || o.domicilio) && 'despacho a coordinar'].filter(Boolean);
    if (extras.length) L.push(`_(+ ${extras.join(' y ')})_`);
    L.push('');
    L.push('¡Hola! Quiero confirmar disponibilidad de este pedido 🙌');
  } else {
    L.push('¡Hola! Quiero cotizar este arreglo 🙌');
  }
  return L.join('\n');
}

// Vista previa con el formato de WhatsApp
const formatPreview = (text) => esc(text)
  .replace(/\*([^*\n]+)\*/g, '<strong>$1</strong>')
  .replace(/(^|\s|\(|—\s)_([^_\n]+)_/g, '$1<em>$2</em>');

function updateOrder() {
  const o = readOrder();
  const lines = bagLines();
  document.querySelectorAll('[data-envio]').forEach((el) => { el.hidden = !o.envio; });
  document.querySelectorAll('[data-domicilio]').forEach((el) => { el.hidden = !o.domicilio; });
  document.querySelectorAll('[data-modo]').forEach((el) => { el.hidden = el.dataset.modo !== o.modo; });
  // efectivo solo se puede en retiro o despacho local
  if (o.envio && o.pago === 'efectivo') form.querySelector('input[name="pago"][value="transferencia"]').checked = true;
  document.querySelectorAll('[data-local]').forEach((el) => { el.hidden = o.envio; });

  const loc = $('#fLocator');
  loc.hidden = !o.envio || o.modo !== 'sucursal' || !COURIERS[o.courier];
  if (COURIERS[o.courier]) {
    loc.href = COURIERS[o.courier];
    loc.innerHTML = `<svg class="ic"><use href="#i-ext"/></svg> Ver sucursales de ${esc(o.courier)}${o.comuna ? ` en ${esc(o.comuna)}` : ''}`;
  }

  $('#bagTotal').textContent = lines.length ? clp(totalFinal()) : '—';
  const d = descuento();
  $('#bagSums').hidden = !(d && d.monto);
  if (d && d.monto) {
    $('#bagSums').innerHTML = `<span>Subtotal</span><span>${clp(bagTotal())}</span><span>Código ${esc(CUPON.codigo)}</span><span class="off">−${clp(d.monto)}</span>`;
  }
  $('#bagTotalLabel').textContent = aCotizar() ? 'Total referencial' : 'Total';
  $('#bagHint').textContent = o.envio
    ? 'El costo del envío se cotiza por WhatsApp según tu comuna y la empresa que elijas.'
    : o.domicilio
      ? 'El valor del despacho depende de la comuna: te lo confirmamos por WhatsApp.'
      : 'Coordinamos contigo por WhatsApp el día y la hora para retirar en tienda.';
  $('#msgPreview').innerHTML = formatPreview(buildMessage(readOrder()));
}

form.addEventListener('input', updateOrder);
form.addEventListener('change', updateOrder);

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const o = readOrder();
  const missing = [];
  if (!bagLines().length && !o.encargo) missing.push('agrega un arreglo o cuéntanos tu idea');
  if (!o.nombre) missing.push('tu nombre');
  if (o.domicilio && !o.direccion) missing.push('la dirección de entrega');
  if (o.envio) {
    if (!o.comuna) missing.push('región y comuna');
    if (!o.courier) missing.push('la empresa de envío');
    if (o.modo === 'domicilio' && !o.direccion) missing.push('la dirección');
    if (o.modo === 'sucursal' && !o.sucursal) missing.push('la sucursal donde retiras');
  }
  const err = $('#formError');
  if (missing.length) {
    err.textContent = 'Falta: ' + missing.join(', ') + '.';
    err.hidden = false;
    return;
  }
  err.hidden = true;
  window.open(waUrl(buildMessage(o)), '_blank', 'noopener');
  CODE = orderCode(); // el próximo pedido lleva otro código
  updateOrder();
});

$('#cuponBtn').addEventListener('click', () => aplicarCupon($('#fCupon').value));
$('#fCupon').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); aplicarCupon($('#fCupon').value); } });
$('#fCupon').addEventListener('input', () => { const st = $('#cuponStatus'); if (st.classList.contains('is-bad')) st.hidden = true; });
$('#couponBox').addEventListener('click', (e) => { if (e.target.closest('[data-quitar-cupon]')) quitarCupon(); });

// ===== EVENTOS GENERALES =====
document.addEventListener('click', (e) => {
  const view = e.target.closest('[data-view]');
  if (view) { openProduct(view.dataset.view); return; }
  if (e.target.closest('[data-encargo]')) { openBag(true); return; }
  if (e.target.closest('[data-open-bag]')) { openBag(); return; }
  if (e.target.closest('[data-close-bag]')) closeBag();
});
document.addEventListener('keydown', (e) => {
  if (pModal.classList.contains('is-open') && current && current.gallery.length > 1) {
    if (e.key === 'ArrowLeft') showPhoto(photo - 1);
    if (e.key === 'ArrowRight') showPhoto(photo + 1);
  }
  if (e.key !== 'Escape') return;
  if (pModal.classList.contains('is-open')) closeProduct();
  else closeBag();
});

['#footerWa', '#contactWa', '#contactWaBtn', '#floatWa', '#heroWa'].forEach((s) => { const el = $(s); if (el) el.href = waUrl('Hola! Quiero consultar por unas flores 🌸'); });
const evWa = $('#eventWa');
if (evWa) evWa.href = waUrl('Hola! Quiero cotizar flores para un evento / matrimonio 💍');

// ===== «ABIERTO AHORA» (hora de Chile) =====
function horario() {
  const pill = $('#openPill');
  if (!pill) return;
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Santiago' }));
  const min = now.getHours() * 60 + now.getMinutes();
  const hm = (s) => { const [h, m] = String(s || '').split(':').map(Number); return Number.isFinite(h) ? h * 60 + (m || 0) : NaN; };
  const dom = now.getDay() === 0;
  const abre = dom ? hm(TIENDA.dom_abre) : hm(TIENDA.hora_abre);
  const cierra = dom ? hm(TIENDA.dom_cierra) : hm(TIENDA.hora_cierra);
  if (!Number.isFinite(abre) || !Number.isFinite(cierra)) return;
  const open = min >= abre && min < cierra;
  pill.hidden = false;
  pill.classList.toggle('is-open', open);
  $('#openText').textContent = open ? 'Abierto ahora' : 'Cerrado ahora';
}
horario();

// ===== ANIMACIONES (solo si el navegador lo permite y sin «reducir movimiento») =====
(function motion() {
  const root = document.documentElement;
  if (REDUCE || !('IntersectionObserver' in window)) { root.classList.remove('js'); return; }

  // revelado al hacer scroll, con cascada
  const io = new IntersectionObserver((entries) => entries.forEach((en) => {
    if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); }
  }), { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
  document.querySelectorAll('.section__head, .step, .events__copy, .events__art, .shop__photo, .shop__info, .season__copy, .chips, .facts, .tag').forEach((el, i) => {
    el.classList.add('reveal');
    el.style.setProperty('--d', `${(i % 4) * 80}ms`);
    io.observe(el);
  });

  // título de la portada: palabra por palabra
  const h1 = document.querySelector('.hero h1 .split');
  if (h1) {
    h1.innerHTML = h1.textContent.trim().split(/\s+/).map((w, i) => `<span class="w" style="--w:${i}"><span>${esc(w)}</span></span>`).join(' ');
  }

  // contador de seguidores
  const cnt = document.querySelector('[data-count]');
  if (cnt) {
    const target = Number(cnt.dataset.count);
    const label = cnt.textContent;
    new IntersectionObserver(([en], ob) => {
      if (!en.isIntersecting) return;
      ob.disconnect();
      const t0 = performance.now();
      const tick = (t) => {
        const k = Math.min(1, (t - t0) / 1400);
        const v = Math.round(target * (1 - Math.pow(1 - k, 3)));
        cnt.textContent = k < 1 ? `${(v / 1000).toLocaleString('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} mil` : label;
        if (k < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }).observe(cnt);
  }

  // menú de vidrio al bajar + parallax suave del jarrón (scroll pasivo con rAF)
  const nav = $('#nav');
  const art = document.querySelector('.hero__art');
  let ticking = false;
  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      const y = window.scrollY;
      nav.classList.toggle('is-glass', y > 24);
      if (art && y < 900) art.style.setProperty('--py', `${Math.round(y * -0.06)}px`);
      ticking = false;
    });
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // inclinación 3D de las etiquetas (solo con mouse)
  if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    grid.addEventListener('pointermove', (e) => {
      const el = e.target.closest('.tag');
      if (!el) return;
      const r = el.getBoundingClientRect();
      el.style.setProperty('--rx', `${(((e.clientY - r.top) / r.height) - 0.5) * -5}deg`);
      el.style.setProperty('--ry', `${(((e.clientX - r.left) / r.width) - 0.5) * 6}deg`);
    });
    grid.addEventListener('pointerout', (e) => {
      const el = e.target.closest('.tag');
      if (el) { el.style.removeProperty('--rx'); el.style.removeProperty('--ry'); }
    });
  }
})();

// ===== CARGA DEL CATÁLOGO =====
async function loadProducts() {
  fetch('data/regiones.json')
    .then((r) => r.json())
    .then((d) => { REGIONES = Array.isArray(d.regiones) ? d.regiones : []; fillRegiones(); })
    .catch((e) => console.error(e));
  try {
    const res = await fetch('data/catalogo.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const categorias = Array.isArray(data.categorias) ? data.categorias : [];

    // producto -> categorías a las que pertenece (la categoría es la que dice qué productos tiene)
    const tagsOf = {};
    categorias.forEach((c) => (c.productos || []).forEach((id) => (tagsOf[id] = tagsOf[id] || []).push(c.id)));

    const path = (s) => String(s).replace(/^\//, '');
    FILTERS = [['todos', 'Todos'], ...categorias.map((c) => [c.id, c.nombre])];
    CUPONES = Array.isArray(data.cupones) ? data.cupones : [];
    PRODUCTS = (data.productos || []).map((p) => {
      const img = path(p.foto || 'img/logo.jpg');
      const fotos = Array.isArray(p.fotos) ? p.fotos.map(path) : [];
      // versiones livianas que genera el build (si faltan, se usan las originales)
      const minis = Array.isArray(p.minis) && p.minis.length === fotos.length ? p.minis.map(path) : fotos;
      const thumb = p.mini ? path(p.mini) : img;
      return {
        id: p.id,
        name: p.nombre,
        selector: p.selector || 'Tamaño',
        variants: (p.variantes || []).map((v) => ({ name: String(v.nombre), price: Number(v.precio) || 0 })),
        desde: Number(p.desde) || 0,
        cot: !!p.a_cotizar,
        img,
        gallery: [img, ...fotos],
        thumb,
        thumbs: [thumb, ...minis],
        desc: p.descripcion || '',
        tags: tagsOf[p.id] || [],
        badge: p.etiqueta || '',
        agotado: !!p.agotado,
      };
    });
  } catch (e) {
    console.error(e);
    return; // conserva el HTML que ya escribió el build
  }
  // sin precios cargados, ordenar por precio no tiene sentido
  if (!PRODUCTS.some((p) => p.desde > 0)) document.querySelector('.sort').hidden = true;
  renderFilters('todos');
  renderProducts('todos');
  renderBag();
  // vuelve a validar el código que quedó guardado (pudo vencer o apagarse en /admin)
  let guardado = '';
  try { guardado = localStorage.getItem(CUPON_KEY) || ''; } catch (e) {}
  if (guardado && CUPONES.length) aplicarCupon(guardado, true);
}

updateOrder();
loadProducts();
