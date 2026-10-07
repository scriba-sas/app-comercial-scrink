/* scrink · App comercial — frontend v2 */
'use strict';

const COLC = { Negro:'#1D1D1B', Rojo:'#E30613', Azul:'#0069B4', Verde:'#009640' };
const DESC_TIPO = { 'Minorista':10, 'Distribuidor mayorista':15, 'Institución Educativa':0, 'Empresa':0, 'Usuario final':0 };
const FAMILIAS = [
  { key:'W45', label:'Marcador borrable scrink W45', refs:['W45'] },
  { key:'tinta', label:'Tinta de recarga scrink', refs:['W30','W100','W500'] }
];
const ESTADOS_PEDIDO = ['Cotizado','Pedido confirmado','Despachado','Recibido por cliente','Facturado','Cobrado','Cancelado'];
const LISTA_LABEL = { general: 'Lista general', especial: 'Lista instituciones / usuario final' };
const MESES = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];

// Conexión por defecto al Google Sheet (Web App de Apps Script). Se puede cambiar en "Configurar conexión".
const DEFAULT_API_URL = 'https://script.google.com/macros/s/AKfycbz9pZsi4p_aHne5dLz3ZDgQz6X15wf6JpETs7MnX2rIiCHzmXrGt7gC3PqbapZadMKZ/exec';

const STATE = {
  apiUrl: localStorage.getItem('scrink_api_url') || DEFAULT_API_URL,
  freelance: localStorage.getItem('scrink_freelance') || '',
  pin: localStorage.getItem('scrink_pin') || '',
  catalogos: { general: [], especial: [] },
  listaPorTipo: {},
  listas: { canales: [], estados: [], productos: [] },
  comision: { base: 0.04, bono: 0.01, iva: 0.19, propias: {} },
  freelist: [],
  items: [],
  folio: '',
  saved: false,
  saving: false,
  currentView: 'dashboard',
  pedidosCache: [],
  clientesCache: [],
  visitasCache: [],
  comisionesCache: null,
  visitaCliente: null
};

// ---------------------------------------------------------------------
// Helpers UI
// ---------------------------------------------------------------------
function money(x){ return (x < 0 ? '-$' : '$') + Math.abs(Math.round(x||0)).toLocaleString('es-CO'); }
function iva(){ return STATE.comision.iva; }
function escapeHtml(s){ return String(s==null?'':s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function initials(name){ return (name||'?').trim().split(/\s+/).slice(0,2).map(s => s[0]).join('').toUpperCase(); }
function firstName(n){ return (n||'').split(' ')[0]; }
function todayISO(){ const d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
function fmtFecha(s){ if(!s) return ''; const p = String(s).split('-'); return p.length < 3 ? s : Number(p[2]) + ' ' + MESES[Number(p[1])-1]; }
function byId(id){ return document.getElementById(id); }

function toast(msg, type){
  const box = byId('toasts');
  const t = document.createElement('div');
  t.className = 'toast' + (type ? ' ' + type : '');
  t.textContent = msg;
  box.appendChild(t);
  requestAnimationFrame(() => t.classList.add('on'));
  setTimeout(() => { t.classList.remove('on'); setTimeout(() => t.remove(), 300); }, 3000);
}
function openOverlay(id){ byId(id).classList.add('on'); }
function closeOverlay(id){ byId(id).classList.remove('on'); }

function openSettings(){ byId('set-url').value = STATE.apiUrl; openOverlay('ov-settings'); }
function saveSettings(){
  const url = byId('set-url').value.trim();
  if (!url) { toast('Pega la URL del Apps Script', 'err'); return; }
  STATE.apiUrl = url;
  localStorage.setItem('scrink_api_url', url);
  closeOverlay('ov-settings');
  toast('Conexión guardada', 'ok');
  boot();
}
function cambiarUsuario(){ localStorage.removeItem('scrink_freelance'); localStorage.removeItem('scrink_pin'); location.reload(); }

// ---------------------------------------------------------------------
// API
// ---------------------------------------------------------------------
async function apiGet(action, params){
  if (!STATE.apiUrl) throw new Error('NO_API_URL');
  const qs = new URLSearchParams(Object.assign({ action, pin: STATE.pin }, params || {}));
  const res = await fetch(STATE.apiUrl + '?' + qs.toString());
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
}
async function apiPost(action, body){
  if (!STATE.apiUrl) throw new Error('NO_API_URL');
  const res = await fetch(STATE.apiUrl, { method: 'POST', body: JSON.stringify(Object.assign({ action, pin: STATE.pin }, body || {})) });
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
}
function errMsg(err){ return String((err && err.message) || err).replace(/^Error:\s*/, ''); }

// ---------------------------------------------------------------------
// Arranque / login
// ---------------------------------------------------------------------
async function boot(){
  if (!STATE.apiUrl){
    byId('freelist').innerHTML = '<div class="empty"><div class="ic">🔌</div><b>Falta conectar</b><span>Toca "Configurar conexión" y pega la URL del Apps Script.</span></div>';
    return;
  }
  try {
    const data = await apiGet('bootstrap');
    STATE.catalogos = data.catalogos || { general: [], especial: [] };
    STATE.listaPorTipo = data.listaPorTipo || {};
    STATE.listas = data.listas || STATE.listas;
    STATE.comision = Object.assign(STATE.comision, data.comision || {});
  } catch (err){
    byId('freelist').innerHTML = '<div class="empty"><div class="ic">⚠️</div><b>No se pudo conectar</b><span>' + escapeHtml(errMsg(err)) + '</span></div>';
    return;
  }
  // Sesión guardada en este celular: se revalida el código (por si fue cambiado o retirado)
  if (STATE.pin){
    try {
      const r = await apiGet('login');
      STATE.freelance = r.nombre;
      localStorage.setItem('scrink_freelance', r.nombre);
      enterApp();
      return;
    } catch (err){
      if (/código incorrecto/i.test(errMsg(err))){ STATE.pin = ''; localStorage.removeItem('scrink_pin'); localStorage.removeItem('scrink_freelance'); }
      else if (STATE.freelance){ enterApp(); return; }   // sin conexión: entra con la sesión guardada
    }
  }
  renderLogin();
}
function renderLogin(){
  byId('freelist').innerHTML = '';
  byId('pin-form').classList.remove('hidden');
  setTimeout(() => byId('pin-input').focus(), 200);
}
async function entrarConPin(ev){
  ev.preventDefault();
  const pin = byId('pin-input').value.trim();
  if (pin.length < 4){ toast('El código tiene entre 4 y 6 números', 'err'); return; }
  const btn = byId('pin-btn');
  btn.disabled = true; btn.textContent = 'Verificando…';
  STATE.pin = pin;
  try {
    const r = await apiGet('login');
    STATE.freelance = r.nombre;
    localStorage.setItem('scrink_pin', pin);
    localStorage.setItem('scrink_freelance', r.nombre);
    toast('¡Hola, ' + firstName(r.nombre) + '!', 'ok');
    enterApp();
  } catch (err){
    STATE.pin = '';
    byId('pin-input').value = '';
    toast(errMsg(err), 'err');
  } finally {
    btn.disabled = false; btn.textContent = 'Entrar';
  }
}
function enterApp(){
  byId('view-login').classList.add('hidden');
  byId('app-shell').style.display = 'block';
  byId('who').textContent = STATE.freelance;
  buildProductSelect();
  goto('dashboard');
}

// ---------------------------------------------------------------------
// Navegación
// ---------------------------------------------------------------------
function goto(view){
  STATE.currentView = view;
  document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
  byId('view-' + view).classList.remove('hidden');
  document.querySelectorAll('.navbtn').forEach(b => b.classList.toggle('active', b.dataset.v === view));
  window.scrollTo(0, 0);

  if (view === 'cotizar' && (!STATE.folio || STATE.saved)) resetCotizador();
  const titles = {
    dashboard: ['Hola, ' + firstName(STATE.freelance), 'Este es tu resumen de hoy'],
    visitas: ['Visitas y agenda', 'Tu seguimiento comercial'],
    clientes: ['Mis clientes', 'Busca, revisa y da seguimiento'],
    cotizar: ['Nueva cotización', 'Folio ' + STATE.folio],
    pedidos: ['Mis pedidos', 'Cotización, despacho, cobro y novedades'],
    comision: ['Mi comisión', 'Sobre lo cobrado, sin IVA'],
    admin: ['Administración', 'Liquidación de comisiones']
  };
  const t = titles[view] || ['scrink', ''];
  byId('top-title').textContent = t[0];
  byId('top-sub').textContent = t[1];

  if (view === 'dashboard') loadDashboard();
  if (view === 'visitas') loadVisitas();
  if (view === 'clientes') loadClientes();
  if (view === 'pedidos') loadPedidos();
  if (view === 'comision') loadComision();
  if (view === 'admin') loadAdmin();
}

// ---------------------------------------------------------------------
// Administración: liquidación de comisiones
// ---------------------------------------------------------------------
function openAdminLogin(){ byId('ad-codigo').value = ''; byId('ad-btn').disabled = false; openOverlay('ov-adminlogin'); setTimeout(() => byId('ad-codigo').focus(), 200); }
async function entrarAdmin(){
  const codigo = byId('ad-codigo').value.trim();
  if (!codigo){ toast('Escribe el código', 'err'); return; }
  if (!STATE.apiUrl){ toast('Primero configura la conexión', 'err'); return; }
  byId('ad-btn').disabled = true;
  try {
    STATE.adminData = await apiGet('adminResumen', { codigo });
    STATE.adminCodigo = codigo;
    closeOverlay('ov-adminlogin');
    byId('view-login').classList.add('hidden');
    byId('app-shell').style.display = 'block';
    byId('who').textContent = 'Administración';
    document.querySelector('nav.bottom').style.display = 'none';
    goto('admin');
  } catch (err){
    toast(errMsg(err).replace(/^Error: /, ''), 'err');
    byId('ad-btn').disabled = false;
  }
}
async function loadAdmin(){
  try {
    const d = await apiGet('adminResumen', { codigo: STATE.adminCodigo });
    STATE.adminData = d;
    byId('ad-pend').textContent = money(d.totales.pendiente);
    byId('ad-pag').textContent = money(d.totales.pagada);
    byId('ad-list').innerHTML = d.freelance.map(f =>
      '<div class="fcard"><div class="avatar">' + escapeHtml(initials(f.freelance)) + '</div>' +
      '<div class="fm"><b>' + escapeHtml(f.freelance) + '</b><span>Pendiente ' + money(f.pendiente) + ' · Pagado ' + money(f.pagada) + '</span></div>' +
      '<button class="btn sm ' + (f.lineasPendientes ? 'primary' : '') + '" onclick="abrirLiquidar(\'' + f.freelance.replace(/'/g, "\\'") + '\')">' + (f.lineasPendientes ? 'Liquidar' : 'Ver') + '</button></div>').join('');
  } catch (err){
    toast(errMsg(err), 'err');
  }
}
async function abrirLiquidar(freelance){
  STATE.liqFreelance = freelance;
  byId('lq-titulo').textContent = freelance;
  byId('lq-pend').innerHTML = '<div class="skeleton" style="height:56px"></div>';
  byId('lq-pag').innerHTML = '';
  byId('lq-fecha').value = todayISO();
  byId('lq-ref').value = '';
  openOverlay('ov-liquidar');
  try {
    const d = await apiGet('adminLineas', { codigo: STATE.adminCodigo, freelance });
    STATE.liqLineas = d.lineas;
    renderLiquidar();
  } catch (err){ toast(errMsg(err), 'err'); }
}
function renderLiquidar(){
  const pend = STATE.liqLineas.filter(l => l.estado !== 'Pagada');
  const pag = STATE.liqLineas.filter(l => l.estado === 'Pagada').sort((a, b) => (b.fechaPago || '').localeCompare(a.fechaPago || '')).slice(0, 10);
  byId('lq-pend').innerHTML = pend.length ? pend.map(l =>
    '<label class="chk"><input type="checkbox" class="lq-chk" data-row="' + l.row + '" data-val="' + l.comision + '" checked onchange="actualizarTotalLiq()">' +
    '<div class="main"><b>' + escapeHtml(l.cliente) + '</b><span>' + l.folio + ' · ' + fmtFecha(l.fecha) + ' · ' + (l.tipo === 'Abono' ? 'Abono' : 'Devolución') + '</span></div>' +
    '<span class="amt ' + (l.comision < 0 ? 'neg' : '') + '">' + money(l.comision) + '</span></label>').join('') :
    '<div class="empty" style="padding:16px"><span>No hay comisiones pendientes</span></div>';
  byId('lq-pag').innerHTML = pag.length ? pag.map(l =>
    '<div class="chk"><div class="main"><b>' + escapeHtml(l.cliente) + ' · ' + money(l.comision) + '</b><span>Pagada ' + fmtFecha(l.fechaPago) + ' · ' + l.folio + '</span></div>' +
    '<button class="btn sm" onclick="deshacerPago(' + l.row + ')">Deshacer</button></div>').join('') :
    '<div class="empty" style="padding:16px"><span>Aún no hay pagos registrados</span></div>';
  actualizarTotalLiq();
}
function filasSeleccionadas(){ return Array.from(document.querySelectorAll('.lq-chk:checked')); }
function actualizarTotalLiq(){
  const sel = filasSeleccionadas();
  const total = sel.reduce((s, c) => s + Number(c.dataset.val), 0);
  const btn = byId('lq-btn');
  btn.textContent = sel.length ? 'Marcar como pagadas · ' + money(total) : 'Marcar como pagadas';
  btn.disabled = !sel.length;
}
async function pagarSeleccionadas(){
  const sel = filasSeleccionadas();
  if (!sel.length) return;
  byId('lq-btn').disabled = true;
  try {
    const r = await apiPost('adminPagarComisiones', { codigo: STATE.adminCodigo, freelance: STATE.liqFreelance,
      filas: sel.map(c => Number(c.dataset.row)), fecha: byId('lq-fecha').value, referencia: byId('lq-ref').value.trim() });
    toast('Pago registrado ✓ ' + money(r.total) + ' (' + r.n + ' movimientos)', 'ok');
    await abrirLiquidar(STATE.liqFreelance);
    loadAdmin();
  } catch (err){ toast(errMsg(err), 'err'); actualizarTotalLiq(); }
}
async function deshacerPago(row){
  if (!confirm('¿Deshacer este pago? La comisión vuelve a quedar pendiente.')) return;
  try {
    await apiPost('adminDeshacerPago', { codigo: STATE.adminCodigo, filas: [row] });
    toast('Pago deshecho', 'ok');
    await abrirLiquidar(STATE.liqFreelance);
    loadAdmin();
  } catch (err){ toast(errMsg(err), 'err'); }
}

// ---------------------------------------------------------------------
// Inicio
// ---------------------------------------------------------------------
function estadoClass(estado){
  const map = { 'Cotizado':'p-cotizado','Pedido confirmado':'p-confirmado','Despachado':'p-despachado',
    'Recibido por cliente':'p-recibido','Facturado':'p-facturado','Cobrado':'p-cobrado','Cancelado':'p-cancelado' };
  return map[estado] || 'p-cotizado';
}
function pedidoRowHtml(p){
  return '<div class="litem" onclick="goto(\'pedidos\')">' +
    '<div class="av">' + escapeHtml(initials(p.cliente || '?')) + '</div>' +
    '<div class="main"><b>' + escapeHtml(p.cliente || 'Cliente') + '</b><span>' + p.folio + ' · ' + money(p.total) + '</span></div>' +
    '<span class="pill ' + estadoClass(p.estado) + '">' + escapeHtml(p.estado) + '</span></div>';
}
async function loadDashboard(){
  try {
    const [ped, com, vis] = await Promise.all([
      apiGet('misPedidos', { freelance: STATE.freelance }),
      apiGet('misComisiones', { freelance: STATE.freelance }),
      apiGet('misVisitas', { freelance: STATE.freelance })
    ]);
    STATE.pedidosCache = ped.pedidos || [];
    STATE.comisionesCache = com;
    STATE.visitasCache = vis.visitas || [];
    const activos = STATE.pedidosCache.filter(p => p.estado !== 'Cancelado');
    byId('d-vendido').textContent = money(activos.reduce((s, p) => s + p.cobrado, 0));
    byId('d-porcobrar').textContent = money(activos.filter(p => p.estado !== 'Cotizado').reduce((s, p) => s + Math.max(0, p.saldo), 0));
    byId('d-compend').textContent = money(com.resumen.totalPendiente);
    byId('d-compag').textContent = money(com.resumen.totalPagado);

    const ag = agendaItems(STATE.visitasCache).slice(0, 4);
    byId('d-agenda').innerHTML = ag.length ? ag.map(agendaItemHtml).join('') :
      '<div class="empty" style="padding:20px"><div class="ic">📍</div><b>Sin visitas programadas</b><span>Registra una visita y agenda la siguiente</span></div>';
    const rec = STATE.pedidosCache.slice(0, 4);
    byId('d-recientes').innerHTML = rec.length ? rec.map(pedidoRowHtml).join('') :
      '<div class="empty"><div class="ic">🧾</div><b>Aún no tienes pedidos</b><span>Toca "Cotizar" para crear el primero</span></div>';
  } catch (err){
    toast('No se pudo cargar el resumen: ' + errMsg(err), 'err');
  }
}

// ---------------------------------------------------------------------
// Visitas y agenda
// ---------------------------------------------------------------------
/** Una entrada por cliente: la fila más reciente del Seguimiento define la próxima visita. */
function agendaItems(visitas){
  const last = {};
  visitas.forEach(v => { last[v.telefono] = v; });
  const hoy = todayISO();
  return Object.values(last)
    .filter(v => v.fechaProx && v.estado !== 'Perdido')
    .map(v => Object.assign({}, v, { tipo: v.fechaProx < hoy ? 'late' : (v.fechaProx === hoy ? 'today' : 'next') }))
    .sort((a, b) => a.fechaProx.localeCompare(b.fechaProx));
}
function agendaItemHtml(a){
  const p = a.fechaProx.split('-');
  return '<div class="agitem" onclick="abrirVisita(\'' + a.telefono + '\')">' +
    '<div class="agdate ' + (a.tipo === 'late' ? 'late' : a.tipo === 'today' ? 'today' : '') + '"><b>' + Number(p[2]) + '</b><small>' + MESES[Number(p[1])-1] + '</small></div>' +
    '<div class="agmain"><b>' + escapeHtml(a.cliente || a.telefono) + '</b><span>' +
      (a.tipo === 'late' ? '⚠ Vencida · ' : a.tipo === 'today' ? 'Hoy · ' : '') + escapeHtml(a.proximoPaso || 'Dar seguimiento') + '</span></div>' +
    '<span class="chev" style="color:var(--muted-2);font-size:18px">›</span></div>';
}
async function loadVisitas(){
  byId('vis-list').innerHTML = '<div class="skeleton" style="height:56px;margin-bottom:8px"></div><div class="skeleton" style="height:56px"></div>';
  try {
    const data = await apiGet('misVisitas', { freelance: STATE.freelance });
    STATE.visitasCache = data.visitas || [];
    renderVisitas();
  } catch (err){
    byId('vis-list').innerHTML = '<div class="empty"><div class="ic">⚠️</div><b>No se pudo cargar</b><span>' + escapeHtml(errMsg(err)) + '</span></div>';
  }
}
function renderVisitas(){
  const chip = document.querySelector('#vis-filtros .chip.on');
  const f = chip ? chip.dataset.f : 'agenda';
  const box = byId('vis-list');
  if (f === 'agenda'){
    const ag = agendaItems(STATE.visitasCache);
    box.innerHTML = ag.length ? ag.map(agendaItemHtml).join('') :
      '<div class="empty"><div class="ic">📍</div><b>Sin visitas programadas</b><span>Al registrar una visita, agenda la fecha de la próxima</span></div>';
  } else {
    const h = STATE.visitasCache.slice().reverse().slice(0, 40);
    box.innerHTML = h.length ? h.map(v =>
      '<div class="litem" onclick="abrirVisita(\'' + v.telefono + '\')"><div class="av">📍</div>' +
      '<div class="main"><b>' + escapeHtml(v.cliente || v.telefono) + '</b><span>' + fmtFecha(v.fecha) + ' · ' + escapeHtml(v.canal) + ' · ' + escapeHtml(v.estado) +
      (v.notas ? ' · ' + escapeHtml(v.notas.slice(0, 60)) : '') + '</span></div></div>').join('') :
      '<div class="empty"><div class="ic">🗂️</div><b>Sin historial</b><span>Aquí verás cada visita, llamada y cotización</span></div>';
  }
}
document.addEventListener('click', (e) => {
  const chip = e.target.closest('#vis-filtros .chip');
  if (chip){ document.querySelectorAll('#vis-filtros .chip').forEach(c => c.classList.remove('on')); chip.classList.add('on'); renderVisitas(); return; }
  const chip2 = e.target.closest('#ped-filtros .chip');
  if (chip2){ document.querySelectorAll('#ped-filtros .chip').forEach(c => c.classList.remove('on')); chip2.classList.add('on'); renderPedidos(); }
});

function fillSelect(id, values, blank){
  byId(id).innerHTML = (blank ? '<option value="">—</option>' : '') + values.map(v => '<option>' + escapeHtml(v) + '</option>').join('');
}
function abrirVisita(tel){
  fillSelect('vis-canal', (STATE.listas.canales || []).filter(c => c !== 'Cotizador app').length ? STATE.listas.canales.filter(c => c !== 'Cotizador app') : ['Visita','Llamada','WhatsApp']);
  fillSelect('vis-estado', STATE.listas.estados.length ? STATE.listas.estados : ['Contactado','Interesado','Cotizado']);
  fillSelect('vis-producto', STATE.listas.productos, true);
  hintEstadoVisita();
  byId('vis-tel').value = tel || '';
  ['vis-nombre','vis-ciudad','vis-notas','vis-paso','vis-prox'].forEach(id => byId(id).value = '');
  byId('vis-fecha').value = todayISO();
  byId('vis-found').textContent = '';
  byId('vis-nuevo').classList.add('hidden');
  STATE.visitaCliente = null;
  byId('vis-btn').disabled = false;
  openOverlay('ov-visita');
  if (tel) buscarClienteVisita();
}
let visTimer = null;
function buscarClienteVisita(){
  clearTimeout(visTimer);
  const tel = byId('vis-tel').value.trim();
  if (tel.length < 7){ byId('vis-found').textContent = ''; byId('vis-nuevo').classList.add('hidden'); return; }
  visTimer = setTimeout(async () => {
    try {
      const d = await apiGet('buscarCliente', { telefono: tel });
      STATE.visitaCliente = d.cliente;
      if (d.otroAsesor){
        byId('vis-found').textContent = '⚠ Este cliente ya está registrado con otro asesor';
        byId('vis-nuevo').classList.add('hidden');
      } else if (d.cliente){
        byId('vis-found').textContent = '✓ ' + d.cliente.cliente + (d.cliente.ciudad ? ' · ' + d.cliente.ciudad : '');
        byId('vis-nuevo').classList.add('hidden');
      } else {
        byId('vis-found').textContent = 'Cliente nuevo: completa el nombre del negocio';
        byId('vis-nuevo').classList.remove('hidden');
      }
    } catch (e) { /* sin conexión: se valida al guardar */ }
  }, 450);
}
async function guardarVisita(){
  const tel = byId('vis-tel').value.trim();
  if (!tel){ toast('Escribe el teléfono del cliente', 'err'); return; }
  if (!STATE.visitaCliente && !byId('vis-nombre').value.trim()){ toast('Escribe el nombre del negocio', 'err'); return; }
  const body = {
    telefono: tel, freelance: STATE.freelance, fecha: byId('vis-fecha').value,
    cliente: byId('vis-nombre').value.trim(), ciudad: byId('vis-ciudad').value.trim(), tipoCliente: byId('vis-tipo').value,
    canal: byId('vis-canal').value, estado: byId('vis-estado').value, producto: byId('vis-producto').value,
    notas: byId('vis-notas').value.trim(), proximoPaso: byId('vis-paso').value.trim(), fechaProx: byId('vis-prox').value
  };
  byId('vis-btn').disabled = true;
  try {
    await apiPost('registrarVisita', body);
    closeOverlay('ov-visita');
    toast('Visita registrada ✓', 'ok');
    if (STATE.currentView === 'visitas') loadVisitas(); else if (STATE.currentView === 'dashboard') loadDashboard();
  } catch (err){
    toast('No se pudo guardar: ' + errMsg(err), 'err');
    byId('vis-btn').disabled = false;
  }
}

// ---------------------------------------------------------------------
// Clientes
// ---------------------------------------------------------------------
async function loadClientes(){
  byId('cli-list').innerHTML = '<div class="skeleton" style="height:56px;margin-bottom:8px"></div><div class="skeleton" style="height:56px"></div>';
  try {
    const data = await apiGet('misClientes', { freelance: STATE.freelance });
    STATE.clientesCache = data.clientes || [];
    renderClientes();
  } catch (err){
    byId('cli-list').innerHTML = '<div class="empty"><div class="ic">⚠️</div><b>No se pudo cargar</b><span>' + escapeHtml(errMsg(err)) + '</span></div>';
  }
}
function renderClientes(){
  const q = (byId('cli-search').value || '').toLowerCase();
  const list = STATE.clientesCache.filter(c => !q || c.cliente.toLowerCase().includes(q) || c.telefono.includes(q));
  const box = byId('cli-list');
  if (!list.length){ box.innerHTML = '<div class="empty"><div class="ic">👥</div><b>Sin clientes</b><span>Los que registres al cotizar o visitar aparecerán aquí</span></div>'; return; }
  box.innerHTML = list.map(c =>
    '<div class="litem" onclick="abrirCliente360(\'' + c.telefono + '\')"><div class="av">' + escapeHtml(initials(c.cliente)) + '</div>' +
    '<div class="main"><b>' + escapeHtml(c.cliente) + '</b><span>' + escapeHtml(c.tipo) + ' · ' + escapeHtml(c.ciudad) + '</span></div><span class="chev">›</span></div>').join('');
}
async function abrirCliente360(telefono){
  byId('c360-nombre').textContent = 'Cargando…';
  byId('c360-body').innerHTML = '<div class="skeleton" style="height:80px"></div>';
  openOverlay('ov-cliente360');
  try {
    const d = await apiGet('clienteHistorial', { telefono });
    const c = d.cliente || {};
    byId('c360-nombre').textContent = c.cliente || 'Cliente';
    const peds = (d.pedidos || []).map(p =>
      '<div class="litem"><div class="av">📦</div><div class="main"><b>' + p.folio + '</b><span>' + fmtFecha(p.fecha) + ' · ' + money(p.total) +
      (p.saldo > 1 && p.estado !== 'Cotizado' ? ' · saldo ' + money(p.saldo) : '') + '</span></div>' +
      '<span class="pill ' + estadoClass(p.estado) + '">' + escapeHtml(p.estado) + '</span></div>').join('') ||
      '<div class="empty" style="padding:16px"><span>Sin pedidos aún</span></div>';
    const vis = (d.visitas || []).slice(0, 5).map(v =>
      '<div class="litem"><div class="av">📍</div><div class="main"><b>' + fmtFecha(v.fecha) + ' · ' + escapeHtml(v.canal) + '</b><span>' +
      escapeHtml(v.estado) + (v.notas ? ' · ' + escapeHtml(v.notas.slice(0, 70)) : '') + '</span></div></div>').join('') ||
      '<div class="empty" style="padding:16px"><span>Sin visitas registradas</span></div>';
    byId('c360-body').innerHTML =
      '<div class="card"><label style="margin-top:0">Contacto</label><div>' + escapeHtml(c.contacto || '—') + ' · ' + escapeHtml(c.telefono || '') + '</div>' +
      '<label>Ciudad / zona</label><div>' + escapeHtml(c.ciudad || '—') + ' · ' + escapeHtml(c.zona || '—') + '</div>' +
      '<label>Tipo</label><div>' + escapeHtml(c.tipo || '—') + '</div></div>' +
      '<div class="section-title">Pedidos</div><div class="card">' + peds + '</div>' +
      '<div class="section-title">Últimas visitas</div><div class="card">' + vis + '</div>' +
      '<div style="display:flex;gap:10px;margin-top:14px">' +
        '<button class="btn accent" style="flex:1" onclick="closeOverlay(\'ov-cliente360\');precargarCliente(\'' + telefono + '\')">Cotizar</button>' +
        '<button class="btn" style="flex:1" onclick="closeOverlay(\'ov-cliente360\');abrirVisita(\'' + telefono + '\')">Registrar visita</button></div>';
  } catch (err){
    byId('c360-body').innerHTML = '<div class="empty"><b>Error</b><span>' + escapeHtml(errMsg(err)) + '</span></div>';
  }
}
function precargarCliente(telefono){
  goto('cotizar');
  byId('q-tel').value = telefono;
  lookupCliente();
}

// ---------------------------------------------------------------------
// Cotizar
// ---------------------------------------------------------------------
function currentListKey(){ return STATE.listaPorTipo[byId('q-tipo').value] || 'general'; }
function currentCatalogoByRef(){
  const map = {};
  (STATE.catalogos[currentListKey()] || []).forEach(p => map[p.ref] = p);
  return map;
}
function actualizarListaBadge(){
  const badge = byId('q-listaBadge');
  if (!badge) return;
  const key = currentListKey();
  badge.textContent = LISTA_LABEL[key] || 'Lista general';
  badge.style.background = key === 'especial' ? 'var(--kraft-dark)' : 'var(--kraft-soft)';
  badge.style.color = key === 'especial' ? '#fff' : 'var(--kraft-dark)';
}
function buildProductSelect(){
  byId('q-fam').innerHTML = FAMILIAS.map(f => '<option value="' + f.key + '">' + f.label + '</option>').join('');
  onFamChange();
  actualizarListaBadge();
  byId('q-colores').innerHTML = Object.keys(COLC).map((c,i) =>
    '<div class="chip chip-color' + (i===0?' on':'') + '" data-color="' + c + '" onclick="pickColor(this)" style="' + (i===0?('background:'+COLC[c]+';border-color:'+COLC[c]):'') + '">' +
    '<span class="swatch" style="background:' + COLC[c] + '"></span>' + c + '</div>').join('');
}
function pickColor(el){
  document.querySelectorAll('#q-colores .chip').forEach(c => { c.classList.remove('on'); c.style.background=''; c.style.borderColor=''; });
  el.classList.add('on');
  el.style.background = COLC[el.dataset.color];
  el.style.borderColor = COLC[el.dataset.color];
}
function onFamChange(){
  const fam = FAMILIAS.find(f => f.key === byId('q-fam').value);
  const presWrap = byId('q-presWrap');
  const cat = currentCatalogoByRef();
  if (fam.refs.length > 1){
    presWrap.classList.remove('hidden');
    byId('q-pres').innerHTML = fam.refs.map(r => {
      const p = cat[r];
      return '<option value="' + r + '">' + (p ? p.nombre.replace('Tinta de recarga scrink ','') + ' · ' + p.pres : r) + '</option>';
    }).join('');
  } else presWrap.classList.add('hidden');
}
function nowFolio(){
  const d = new Date(), z = n => String(n).padStart(2,'0');
  return 'SCK-' + d.getFullYear() + z(d.getMonth()+1) + z(d.getDate()) + '-' + z(d.getHours()) + z(d.getMinutes());
}
function resetCotizador(){
  STATE.items = [];
  STATE.folio = nowFolio();
  STATE.saved = false;
  ['q-tel','q-cliente','q-contacto','q-ciudad','q-zona','q-correo'].forEach(id => byId(id).value = '');
  byId('q-desc').value = 0;
  byId('q-tipo').selectedIndex = 0;
  byId('q-qty').value = 1;
  const b = byId('q-btnGuardar'); b.disabled = false; b.textContent = '✓ Guardar pedido';
  actualizarListaBadge();
  renderItems();
  byId('top-sub').textContent = 'Folio ' + STATE.folio;
}
let lookupTimer = null;
function lookupCliente(){
  clearTimeout(lookupTimer);
  const tel = byId('q-tel').value.trim();
  if (tel.length < 7) return;
  lookupTimer = setTimeout(async () => {
    try {
      const d = await apiGet('buscarCliente', { telefono: tel });
      const c = d.cliente;
      if (d.otroAsesor){ toast('Este cliente ya está registrado con otro asesor', 'err'); return; }
      if (c){
        byId('q-cliente').value = c.cliente || '';
        byId('q-contacto').value = c.contacto || '';
        byId('q-ciudad').value = c.ciudad || '';
        byId('q-zona').value = c.zona || '';
        byId('q-correo').value = c.correo || '';
        const sel = byId('q-tipo');
        if (c.tipo && Array.from(sel.options).some(o => o.value === c.tipo)) sel.value = c.tipo;
        aplicaDescTipo();
        toast('Cliente encontrado: ' + c.cliente, 'ok');
      }
    } catch (e) { /* cliente nuevo */ }
  }, 550);
}
function aplicaDescTipo(){
  byId('q-desc').value = DESC_TIPO[byId('q-tipo').value] || 0;
  onFamChange();
  actualizarListaBadge();
  if (STATE.items.length){
    const cat = currentCatalogoByRef();
    let cambio = false;
    STATE.items.forEach(l => { const p = cat[l.ref]; if (p && p.precio !== l.precio){ l.precio = p.precio; cambio = true; } });
    if (cambio) toast('Precios actualizados a la ' + LISTA_LABEL[currentListKey()].toLowerCase(), 'ok');
    renderItems();
  }
  calc();
}
function addLine(){
  const fam = FAMILIAS.find(f => f.key === byId('q-fam').value);
  const ref = fam.refs.length > 1 ? byId('q-pres').value : fam.refs[0];
  const chip = document.querySelector('#q-colores .chip.on');
  const color = chip ? chip.dataset.color : 'Negro';
  let qty = parseInt(byId('q-qty').value) || 1;
  if (qty < 1) qty = 1;
  const cat = currentCatalogoByRef()[ref];
  if (!cat){ toast('Producto no disponible', 'err'); return; }
  const found = STATE.items.find(l => l.ref === ref && l.color === color);
  if (found) found.qty += qty; else STATE.items.push({ ref, color, qty, precio: cat.precio, nombre: cat.nombre, pres: cat.pres });
  byId('q-qty').value = 1;
  renderItems();
  toast('Agregado al pedido', 'ok');
}
function delLine(i){ STATE.items.splice(i,1); renderItems(); }
function setQty(i,v){ STATE.items[i].qty = parseInt(v)||0; calc(); const el = byId('lt_'+i); if (el) el.textContent = money(STATE.items[i].qty * STATE.items[i].precio); }
function renderItems(){
  const box = byId('q-items');
  if (!STATE.items.length){
    box.innerHTML = '<div class="empty"><div class="ic">🧾</div><b>Aún no has agregado productos</b><span>Elige uno arriba para empezar</span></div>';
    calc(); return;
  }
  box.innerHTML = STATE.items.map((l,i) =>
    '<div class="line-item"><span class="dot" style="background:' + (COLC[l.color]||'#333') + '"></span>' +
    '<div class="li-main"><b>' + l.nombre + '</b><span>' + l.color + ' · ' + l.pres + '</span></div>' +
    '<input class="li-qty" type="number" min="1" value="' + l.qty + '" oninput="setQty(' + i + ',this.value)">' +
    '<span class="li-tot" id="lt_' + i + '">' + money(l.qty * l.precio) + '</span>' +
    '<button class="del-x" onclick="delLine(' + i + ')">×</button></div>').join('');
  calc();
}
function calc(){
  const sub = STATE.items.reduce((s,l) => s + l.qty * l.precio, 0);
  let dp = parseFloat(byId('q-desc').value) || 0;
  if (dp < 0) dp = 0; if (dp > 100) dp = 100;
  const descV = sub * dp / 100, base = sub - descV, iv = base * iva(), tot = base + iv;
  byId('q-tSub').textContent = money(sub);
  byId('q-tDpct').textContent = dp;
  byId('q-tDesc').textContent = '-' + money(descV);
  byId('q-tBase').textContent = money(base);
  byId('q-tIva').textContent = money(iv);
  byId('q-tTot').textContent = money(tot);
  return { sub, dp, descV, base, iva: iv, tot };
}

async function guardarPedido(){
  if (STATE.saving || STATE.saved) return;
  const tel = byId('q-tel').value.trim();
  if (!tel){ toast('Escribe el teléfono del cliente', 'err'); return; }
  if (!byId('q-cliente').value.trim()){ toast('Escribe el nombre del cliente', 'err'); return; }
  if (!STATE.items.length){ toast('Agrega al menos un producto', 'err'); return; }
  const t = calc();
  const body = {
    telefono: tel, cliente: byId('q-cliente').value.trim(), contacto: byId('q-contacto').value.trim(),
    ciudad: byId('q-ciudad').value.trim(), tipoCliente: byId('q-tipo').value, zona: byId('q-zona').value.trim(),
    correo: byId('q-correo').value.trim(), freelance: STATE.freelance, items: STATE.items,
    subtotal: t.sub, descuentoPct: t.dp, formaPago: byId('q-pago').value, folio: STATE.folio
  };
  STATE.saving = true;
  const btn = byId('q-btnGuardar'); btn.disabled = true; btn.textContent = 'Guardando…';
  try {
    const res = await apiPost('guardarPedido', body);
    STATE.folio = res.folio;
    STATE.saved = true;
    btn.textContent = 'Guardado ✓';
    byId('top-sub').textContent = 'Folio ' + STATE.folio;
    byId('gd-folio').textContent = res.folio;
    byId('gd-total').textContent = money(res.total);
    openOverlay('ov-guardado');
  } catch (err){
    btn.disabled = false; btn.textContent = '✓ Guardar pedido';
    toast('No se pudo guardar: ' + errMsg(err), 'err');
  } finally { STATE.saving = false; }
}
function terminarCotizacion(dest){
  closeOverlay('ov-guardado');
  resetCotizador();
  goto(dest);
}

function enviarWhatsApp(){
  const t = calc();
  const cli = byId('q-cliente').value || 'cliente';
  const arr = STATE.items.map(l => '• ' + l.nombre + ' ' + l.color + ': ' + l.qty + ' x ' + money(l.precio));
  const msg = 'Cotización scrink ' + STATE.folio + '\n' + 'Cliente: ' + cli + '\n' +
    (arr.length ? arr.join('\n') + '\n' : '') +
    'Subtotal: ' + money(t.sub) + '\n' +
    (t.dp > 0 ? 'Descuento ' + t.dp + '%: -' + money(t.descV) + '\n' : '') +
    'IVA 19%: ' + money(t.iva) + '\n' + 'TOTAL: ' + money(t.tot) + '\n\n' + 'scrink · Sostenibilidad e identidad';
  const tel = (byId('q-tel').value || '').replace(/\D/g, '');
  const dest = tel.length === 10 ? '57' + tel : (tel.length === 12 && tel.indexOf('57') === 0 ? tel : '');
  window.open('https://wa.me/' + dest + '?text=' + encodeURIComponent(msg), '_blank');
}

// ---------------------------------------------------------------------
// PDF premium (jsPDF)
// ---------------------------------------------------------------------
function imgToDataURL(url){
  return fetch(url).then(r => r.blob()).then(blob => new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result);
    fr.onerror = rej;
    fr.readAsDataURL(blob);
  }));
}
function fechaLarga(){
  const n = new Date();
  return n.getDate() + ' ' + MESES[n.getMonth()] + ' ' + n.getFullYear();
}
async function descargarPDF(){
  if (!STATE.items.length){ toast('Agrega al menos un producto', 'err'); return; }
  toast('Generando PDF…');
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
  const INK = [29,29,27], KRAFT = [173,138,92], MUTED = [130,124,112];

  try {
    const wm = await imgToDataURL('assets/marcador_w45.png');
    const wmW = 380, wmH = wmW * (1024/1536);
    doc.saveGraphicsState();
    doc.setGState(new doc.GState({ opacity: 0.05 }));
    doc.addImage(wm, 'PNG', (W - wmW) / 2, H / 2 - wmH / 2, wmW, wmH);
    doc.restoreGraphicsState();
  } catch (e) {}

  doc.setFillColor(INK[0],INK[1],INK[2]);
  doc.rect(0, 0, W, 108, 'F');
  try { const logo = await imgToDataURL('assets/logo_scrink_light.png'); doc.addImage(logo, 'PNG', 40, 22, 140, 53.6); } catch(e){}
  try { const scriba = await imgToDataURL('assets/scriba_logo_light.png'); doc.addImage(scriba, 'PNG', 40, 80, 62, 11.4); } catch(e){}
  doc.setTextColor(207,200,187); doc.setFontSize(8); doc.setFont('helvetica','normal');
  doc.text('NIT 902.014.588', 108, 88.5);

  doc.setTextColor(255,255,255);
  doc.setFontSize(15); doc.setFont('helvetica','bold');
  doc.text('COTIZACIÓN', W-40, 40, { align:'right' });
  doc.setFontSize(9); doc.setFont('helvetica','normal'); doc.setTextColor(207,200,187);
  doc.text(STATE.folio, W-40, 56, { align:'right' });
  doc.text(fechaLarga(), W-40, 70, { align:'right' });
  doc.text('Vendedor: ' + STATE.freelance, W-40, 84, { align:'right' });

  let y = 140;
  doc.setTextColor(INK[0],INK[1],INK[2]);
  doc.setFontSize(10); doc.setFont('helvetica','bold');
  doc.text('CLIENTE', 40, y);
  doc.setDrawColor(KRAFT[0],KRAFT[1],KRAFT[2]); doc.setLineWidth(1.4); doc.line(40, y+4, 100, y+4);
  doc.setDrawColor(230,224,209); doc.setLineWidth(0.7); doc.line(102, y+4, W-40, y+4);
  y += 20;
  doc.setFont('helvetica','normal'); doc.setFontSize(11.5);
  doc.text(byId('q-cliente').value || '—', 40, y);
  doc.setFontSize(9.5); doc.setTextColor(MUTED[0],MUTED[1],MUTED[2]);
  doc.text('Contacto: ' + (byId('q-contacto').value||'—') + '   ·   Tel: ' + (byId('q-tel').value||'—') + '   ·   ' + (byId('q-ciudad').value||'—'), 40, y+15);

  y += 34;
  const rows = STATE.items.map(l => [l.nombre + ' (' + l.ref + ')', l.color, String(l.qty), money(l.precio), money(l.qty*l.precio)]);
  doc.autoTable({
    startY: y, head: [['Producto','Color','Cant.','V. unit.','Total']], body: rows, theme: 'plain',
    styles: { fontSize: 9.5, cellPadding: 7, textColor: INK },
    headStyles: { fillColor: INK, textColor: 255, fontStyle:'bold' },
    alternateRowStyles: { fillColor: [250,247,241] },
    columnStyles: { 2:{halign:'right'}, 3:{halign:'right'}, 4:{halign:'right'} },
    margin: { left: 40, right: 40 }
  });

  const t = calc();
  let ty = doc.lastAutoTable.finalY + 18;
  const tx = W - 220;
  function totLine(label, val, big){
    doc.setFontSize(big?12:9.5);
    doc.setFont('helvetica', big?'bold':'normal');
    doc.setTextColor(big?INK[0]:MUTED[0], big?INK[1]:MUTED[1], big?INK[2]:MUTED[2]);
    doc.text(label, tx, ty);
    doc.text(val, W-40, ty, { align:'right' });
    ty += big?18:14;
  }
  totLine('Subtotal', money(t.sub));
  if (t.dp>0) totLine('Descuento (' + t.dp + '%)', '-' + money(t.descV));
  totLine('Base gravable', money(t.base));
  totLine('IVA 19%', money(t.iva));
  doc.setDrawColor(KRAFT[0],KRAFT[1],KRAFT[2]); doc.setLineWidth(1.2);
  doc.line(tx, ty-4, W-40, ty-4);
  ty += 4;
  totLine('TOTAL', money(t.tot), true);

  ty += 26;
  doc.setFontSize(8.5); doc.setTextColor(MUTED[0],MUTED[1],MUTED[2]); doc.setFont('helvetica','normal');
  const cond = 'Forma de pago: ' + byId('q-pago').value + '. Validez de la oferta: 15 días. Precios en pesos colombianos. ' +
    'Oferta de lanzamiento: 1 caja x10 de muestra por cada 10 cajas compradas.';
  doc.text(doc.splitTextToSize(cond, W-80), 40, ty);

  ty += 46;
  doc.setDrawColor(210,205,192);
  doc.line(40, ty, 220, ty); doc.line(W-220, ty, W-40, ty);
  doc.setFontSize(8.5); doc.setTextColor(MUTED[0],MUTED[1],MUTED[2]);
  doc.text('Elaboró (scrink)', 130, ty+12, { align:'center' });
  doc.text('Recibí conforme (cliente)', W-130, ty+12, { align:'center' });

  const fileName = STATE.folio + '.pdf';
  const blob = doc.output('blob');
  if (navigator.canShare && navigator.canShare({ files: [new File([blob], fileName, { type:'application/pdf' })] })) {
    try {
      await navigator.share({ files: [new File([blob], fileName, { type:'application/pdf' })], title: 'Cotización scrink ' + STATE.folio });
      return;
    } catch(e){ /* canceló: se descarga */ }
  }
  doc.save(fileName);
}

// ---------------------------------------------------------------------
// Pedidos
// ---------------------------------------------------------------------
async function loadPedidos(){
  byId('ped-list').innerHTML = '<div class="card"><div class="skeleton" style="height:56px;margin-bottom:8px"></div><div class="skeleton" style="height:56px"></div></div>';
  try {
    const data = await apiGet('misPedidos', { freelance: STATE.freelance });
    STATE.pedidosCache = data.pedidos || [];
    renderPedidos();
  } catch (err){
    byId('ped-list').innerHTML = '<div class="card"><div class="empty"><div class="ic">⚠️</div><b>No se pudo cargar</b><span>' + escapeHtml(errMsg(err)) + '</span></div></div>';
  }
}
function pedidoById(folio){ return STATE.pedidosCache.find(p => p.folio === folio); }
function renderPedidos(){
  const chip = document.querySelector('#ped-filtros .chip.on');
  const f = chip ? chip.dataset.f : 'todos';
  let list = STATE.pedidosCache;
  if (f === 'cotizados') list = list.filter(p => p.estado === 'Cotizado');
  if (f === 'porcobrar') list = list.filter(p => p.saldo > 1 && p.estado !== 'Cancelado' && p.estado !== 'Cotizado');
  if (f === 'cobrados') list = list.filter(p => p.cobrado > 0 && p.saldo <= 1);
  const box = byId('ped-list');
  if (!list.length){ box.innerHTML = '<div class="card"><div class="empty"><div class="ic">📦</div><b>Sin pedidos aquí</b><span>Prueba otro filtro o crea una cotización</span></div></div>'; return; }
  box.innerHTML = list.map(pedidoCardHtml).join('');
}
function pedidoCardHtml(p){
  const neto = Math.max(0, p.total - p.credito);
  const pct = neto > 0 ? Math.min(100, Math.round((p.cobrado + p.ajustes) / neto * 100)) : 0;
  const cancelado = p.estado === 'Cancelado', cotizado = p.estado === 'Cotizado';
  const tags = [];
  if (p.despacho && p.despacho.guia) tags.push('<span class="tag">📦 ' + escapeHtml(p.despacho.guia) + '</span>');
  if (p.despacho && p.despacho.recibido === 'Sí') tags.push('<span class="tag good">Recibido</span>');
  if (p.novedades > 0) tags.push('<span class="tag warn" style="cursor:pointer" onclick="abrirNovedades(\'' + p.folio + '\')">⚠ ' + p.novedades + ' novedad' + (p.novedades > 1 ? 'es' : '') + ' · ver</span>');
  if (p.credito > 0) tags.push('<span class="tag bad">Nota crédito ' + money(-p.credito) + '</span>');
  if (p.ajustes > 0) tags.push('<span class="tag">Ajuste ' + money(p.ajustes) + '</span>');
  if (p.saldo > 1 && !cotizado && !cancelado) tags.push('<span class="tag warn">Saldo ' + money(p.saldo) + '</span>');
  const btnDesp = !cancelado ? '<button class="btn sm accent" onclick="abrirDespacho(\'' + p.folio + '\')">📦 ' + (p.despacho ? 'Otro envío' : 'Despacho') + '</button>' : '';
  const btnAbono = (!cancelado && p.saldo > 1) ? '<button class="btn sm primary" onclick="abrirAbono(\'' + p.folio + '\')">💵 Abono</button>' : '';
  const btnNov = (!cancelado && !cotizado) ? '<button class="btn sm" onclick="abrirNovedad(\'' + p.folio + '\')">⚠ Novedad</button>' : '';
  return '<div class="pcard">' +
    '<div class="ptop"><div><div class="pname">' + escapeHtml(p.cliente || 'Cliente') + '</div><div class="psub">' + p.folio + ' · ' + fmtFecha(p.fecha) + '</div></div>' +
    '<span class="pill ' + estadoClass(p.estado) + '">' + escapeHtml(p.estado) + '</span></div>' +
    '<div class="pres">' + escapeHtml(p.resumen) + '</div>' +
    '<div class="pmoney"><b>' + money(p.total) + '</b><span>Cobrado ' + money(p.cobrado) + '</span></div>' +
    (cotizado ? '' : '<div class="bar"><i style="width:' + pct + '%"></i></div>') +
    (tags.length ? '<div class="pmeta">' + tags.join('') + '</div>' : '') +
    '<div class="pactions">' + btnDesp + btnAbono + btnNov + '</div>' +
    '<div class="pactions"><select onchange="cambiarEstado(\'' + p.folio + '\', this.value)">' +
      ESTADOS_PEDIDO.filter(es => es !== 'Cobrado' || p.estado === 'Cobrado').map(es => '<option ' + (es === p.estado ? 'selected' : '') + '>' + es + '</option>').join('') + '</select></div>' +
    '</div>';
}
async function cambiarEstado(folio, estado){
  try { await apiPost('actualizarEstadoPedido', { folio, estado }); toast('Estado actualizado', 'ok'); loadPedidos(); }
  catch (err){ toast(errMsg(err).replace(/^Error: /, ''), 'err'); loadPedidos(); }
}
const HINT_ESTADO_VISITA = {
  'Nuevo': 'Prospecto identificado, aún sin contacto.',
  'Contactado': 'Ya hablaste con el cliente.',
  'Interesado': 'Mostró interés; falta enviar cotización.',
  'Cotizado': 'Ya recibió una cotización.',
  'Ganado': 'Venta cerrada: el cliente compró.',
  'Perdido': 'No compró o se descartó.',
  'En pausa': 'Retomar más adelante.'
};
function hintEstadoVisita(){ byId('vis-hint').textContent = HINT_ESTADO_VISITA[byId('vis-estado').value] || ''; }

// ---- Despacho ----
let SIG = null;
function abrirDespacho(folio){
  byId('desp-folio').textContent = 'Pedido ' + folio;
  byId('ov-despacho').dataset.folio = folio;
  byId('desp-fecha').value = todayISO();
  byId('desp-entrega').value = '';
  byId('desp-guia').value = '';
  byId('desp-reenvio').checked = !!(pedidoById(folio) && pedidoById(folio).despacho);
  byId('desp-recibido').value = 'Pendiente';
  byId('desp-notas').value = '';
  openOverlay('ov-despacho');
  setTimeout(initSig, 60);
}
function initSig(){
  const canvas = byId('sigpad');
  const ctx = canvas.getContext('2d');
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = rect.width * dpr; canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);
  ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.strokeStyle = '#1D1D1B';
  let drawing = false, hasDrawn = false;
  const pos = (e) => { const r = canvas.getBoundingClientRect(); const t = e.touches ? e.touches[0] : e; return { x: t.clientX - r.left, y: t.clientY - r.top }; };
  const start = (e) => { drawing = true; hasDrawn = true; byId('sig-hint').style.display = 'none'; const p = pos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); e.preventDefault(); };
  const move = (e) => { if (!drawing) return; const p = pos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); e.preventDefault(); };
  canvas.onpointerdown = start; canvas.onpointermove = move; window.addEventListener('pointerup', () => { drawing = false; });
  SIG = { canvas, hasDrawn: () => hasDrawn, dataURL: () => hasDrawn ? canvas.toDataURL('image/png') : null };
}
function clearSig(){
  if (!SIG) return;
  SIG.canvas.getContext('2d').clearRect(0, 0, SIG.canvas.width, SIG.canvas.height);
  byId('sig-hint').style.display = 'block';
  initSig();
}
async function guardarDespacho(){
  const folio = byId('ov-despacho').dataset.folio;
  const body = {
    folio, fechaDespacho: byId('desp-fecha').value, fechaEntrega: byId('desp-entrega').value, guia: byId('desp-guia').value.trim(),
    recibidoConforme: byId('desp-recibido').value, notas: byId('desp-notas').value.trim(), esReenvio: byId('desp-reenvio').checked
  };
  if (SIG && SIG.hasDrawn()) body.firmaBase64 = SIG.dataURL();
  try {
    toast('Guardando despacho…');
    await apiPost('registrarDespacho', body);
    closeOverlay('ov-despacho');
    toast('Despacho registrado ✓', 'ok');
    loadPedidos();
  } catch (err){ toast('Error al guardar: ' + errMsg(err), 'err'); }
}

// ---- Abono ----
function tasaComision(p){
  const c = STATE.comision;
  const propia = c.propias && c.propias[STATE.freelance];
  return (propia !== undefined ? propia : c.base) + (p.nPedido === 1 ? c.bono : 0);
}
function abrirAbono(folio){
  const p = pedidoById(folio);
  if (!p) return;
  byId('ov-abono').dataset.folio = folio;
  byId('ab-folio').textContent = p.cliente + ' · ' + folio;
  byId('ab-resumen').innerHTML = '<div><small>Total</small><b>' + money(p.total - p.credito) + '</b></div><div><small>Cobrado</small><b>' + money(p.cobrado) + '</b></div><div><small>Saldo</small><b>' + money(p.saldo) + '</b></div>';
  byId('ab-valor').value = Math.max(0, p.saldo);
  byId('ab-fecha').value = todayISO();
  byId('ab-medio').selectedIndex = 0;
  byId('ab-cerrar').checked = false;
  byId('ab-motivo').value = '';
  byId('ab-notas').value = '';
  byId('ab-btn').disabled = false;
  actualizarAbonoPreview();
  openOverlay('ov-abono');
}
function actualizarAbonoPreview(){
  const p = pedidoById(byId('ov-abono').dataset.folio);
  if (!p) return;
  const v = Math.round(parseFloat(byId('ab-valor').value) || 0);
  const parcial = v > 0 && v < p.saldo - 1;
  byId('ab-cerrarWrap').classList.toggle('hidden', !parcial);
  if (!parcial) byId('ab-cerrar').checked = false;
  byId('ab-motivo').classList.toggle('hidden', !byId('ab-cerrar').checked);
  const rate = tasaComision(p), base = v / (1 + iva());
  let html;
  if (v > p.saldo + 1) html = '<b class="neg">El abono supera el saldo (' + money(p.saldo) + ')</b>';
  else if (v <= 0) html = 'Escribe el valor que recibiste del cliente.';
  else {
    html = 'Comisión de este abono: <b>' + money(base * rate) + '</b><br>Base sin IVA ' + money(base) + ' × ' + (rate * 100).toFixed(0) + '%' + (p.nPedido === 1 ? ' (incluye bono de primer pedido)' : '');
    if (byId('ab-cerrar').checked) html += '<br>Se cierra el saldo restante de ' + money(p.saldo - v) + ' como ajuste (no genera comisión).';
    else if (parcial) html += '<br>Queda un saldo de ' + money(p.saldo - v) + ': su comisión se genera cuando el cliente lo pague.';
  }
  byId('ab-preview').innerHTML = html;
}
async function guardarAbono(){
  const folio = byId('ov-abono').dataset.folio;
  const cerrar = byId('ab-cerrar').checked;
  const body = { folio, valor: byId('ab-valor').value, fecha: byId('ab-fecha').value, medio: byId('ab-medio').value,
    notas: byId('ab-notas').value.trim(), cerrarSaldo: cerrar, motivo: byId('ab-motivo').value.trim() };
  byId('ab-btn').disabled = true;
  try {
    const r = await apiPost('registrarAbono', body);
    closeOverlay('ov-abono');
    toast('Abono registrado ✓ Comisión generada ' + money(r.comision), 'ok');
    STATE.comisionesCache = null;
    loadPedidos();
  } catch (err){
    toast(errMsg(err), 'err');
    byId('ab-btn').disabled = false;
  }
}

// ---- Novedad ----
function abrirNovedad(folio){
  const p = pedidoById(folio);
  if (!p) return;
  byId('ov-novedad').dataset.folio = folio;
  byId('nov-folio').textContent = p.cliente + ' · ' + folio;
  byId('nov-resumen').innerHTML = '<div><small>Total</small><b>' + money(p.total - p.credito) + '</b></div><div><small>Cobrado</small><b>' + money(p.cobrado) + '</b></div><div><small>Saldo</small><b>' + money(p.saldo) + '</b></div>';
  byId('nov-tipo').selectedIndex = 0;
  byId('nov-detalle').value = '';
  byId('nov-valor').value = 0;
  byId('nov-resolucion').selectedIndex = 0;
  byId('nov-btn').disabled = false;
  STATE.novFotos = [];
  renderFotos();
  actualizarNovedadTipo();
  openOverlay('ov-novedad');
}
function comprimirFoto(file){
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => {
      const max = 1280, k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      res(c.toDataURL('image/jpeg', 0.72));
    };
    img.onerror = rej;
    img.src = URL.createObjectURL(file);
  });
}
async function agregarFotos(input){
  const files = Array.from(input.files || []);
  for (const f of files){
    if (STATE.novFotos.length >= 4){ toast('Máximo 4 fotos', 'err'); break; }
    try { STATE.novFotos.push(await comprimirFoto(f)); } catch (e) { toast('No se pudo leer una foto', 'err'); }
  }
  input.value = '';
  renderFotos();
}
function quitarFoto(i){ STATE.novFotos.splice(i, 1); renderFotos(); }
function renderFotos(){
  byId('nov-fotos').innerHTML = (STATE.novFotos || []).map((f, i) =>
    '<div class="foto"><img src="' + f + '" alt="Evidencia"><button onclick="quitarFoto(' + i + ')">×</button></div>').join('');
}
function driveId(url){ const m = String(url).match(/\/d\/([^/]+)/); return m ? m[1] : ''; }
async function abrirNovedades(folio){
  byId('nvl-folio').textContent = folio;
  byId('nvl-body').innerHTML = '<div class="skeleton" style="height:70px;margin-top:10px"></div>';
  openOverlay('ov-novedades');
  try {
    const d = await apiGet('misNovedades', { folio });
    byId('nvl-body').innerHTML = d.novedades.length ? d.novedades.map(n =>
      '<div class="nvitem"><div class="nvh"><b style="color:var(--ink)">' + escapeHtml(n.tipo) + '</b><span>' + fmtFecha(n.fecha) + ' · ' + escapeHtml(n.estado) + '</span></div>' +
      '<div class="nvd">' + escapeHtml(n.detalle || '—') + '</div>' +
      '<div class="nvh"><span>' + escapeHtml(n.resolucion) + '</span><span>' + (n.valor ? 'Crédito ' + money(n.valor) : 'Sin valor') + '</span></div>' +
      (n.fotos.length ? '<div class="nvfotos">' + n.fotos.map(u => {
        const id = driveId(u);
        return '<a href="' + escapeHtml(u) + '" target="_blank" rel="noopener">' +
          (id ? '<img src="https://drive.google.com/thumbnail?id=' + id + '&sz=w300" alt="Foto" onerror="this.remove()">' : '') + '📷</a>';
      }).join('') + '</div>' : '') + '</div>').join('') :
      '<div class="empty"><div class="ic">✅</div><b>Sin novedades</b></div>';
  } catch (err){
    byId('nvl-body').innerHTML = '<div class="empty"><b>Error</b><span>' + escapeHtml(errMsg(err)) + '</span></div>';
  }
}
function actualizarNovedadTipo(){
  const t = byId('nov-tipo').value;
  byId('nov-valorWrap').classList.toggle('hidden', !(t === 'Devolución' || t === 'Nota crédito'));
  if (t === 'Faltante (reenvío)') byId('nov-resolucion').value = 'Reenviar producto';
  if (t === 'Devolución') byId('nov-resolucion').value = 'Nota crédito';
}
async function guardarNovedad(){
  const folio = byId('ov-novedad').dataset.folio;
  const t = byId('nov-tipo').value;
  const conValor = (t === 'Devolución' || t === 'Nota crédito');
  if (!byId('nov-detalle').value.trim()){ toast('Cuenta brevemente qué pasó', 'err'); return; }
  const valor = conValor ? (parseFloat(byId('nov-valor').value) || 0) : 0;
  if (conValor && valor <= 0){ toast('Escribe el valor a acreditar', 'err'); return; }
  byId('nov-btn').disabled = true;
  try {
    if (STATE.novFotos.length) toast('Subiendo evidencia…');
    const r = await apiPost('registrarNovedad', { folio, tipo: t, detalle: byId('nov-detalle').value.trim(), valor, resolucion: byId('nov-resolucion').value, fotos: STATE.novFotos });
    closeOverlay('ov-novedad');
    toast(r.ajusteComision ? 'Novedad registrada · ajuste de comisión ' + money(r.ajusteComision) : 'Novedad registrada ✓', 'ok');
    STATE.comisionesCache = null;
    loadPedidos();
    if (t === 'Faltante (reenvío)') setTimeout(() => abrirDespacho(folio), 500);
  } catch (err){
    toast(errMsg(err), 'err');
    byId('nov-btn').disabled = false;
  }
}

// ---------------------------------------------------------------------
// Comisión
// ---------------------------------------------------------------------
async function loadComision(){
  byId('c-list').innerHTML = '<div class="skeleton" style="height:56px"></div>';
  const c = STATE.comision;
  byId('c-regla').textContent = 'Comisión ' + Math.round(c.base * 100) + '% sobre lo cobrado sin IVA, más ' + Math.round(c.bono * 100) + '% en el primer pedido de cada cliente. Se causa con cada abono.';
  try {
    const data = await apiGet('misComisiones', { freelance: STATE.freelance });
    STATE.comisionesCache = data;
    byId('c-gen').textContent = money(data.resumen.totalGenerado);
    byId('c-pag').textContent = money(data.resumen.totalPagado);
    byId('c-pend').textContent = money(data.resumen.totalPendiente);
    const list = data.lineas || [];
    byId('c-list').innerHTML = list.length ? list.map(l => {
      const ajuste = l.tipo !== 'Abono';
      return '<div class="litem" style="cursor:default"><div class="av">' + (ajuste ? '↩️' : (l.primer === 'Sí' ? '⭐' : '💰')) + '</div>' +
        '<div class="main"><b>' + escapeHtml(l.cliente) + '</b><span>' + l.folio + ' · ' + fmtFecha(l.fecha) + ' · ' + (ajuste ? 'Devolución' : 'Abono') + ' · base ' + money(l.base) + ' × ' + Math.round(l.pct * 100) + '%</span></div>' +
        '<div style="text-align:right"><b class="' + (l.comision < 0 ? 'neg' : '') + '">' + money(l.comision) + '</b><div style="font-size:11px;color:' + (l.estado === 'Pagada' ? 'var(--green)' : 'var(--muted)') + '">' + escapeHtml(l.estado || 'Pendiente') + '</div></div></div>';
    }).join('') : '<div class="empty"><div class="ic">💰</div><b>Aún no hay comisión</b><span>Se genera con cada abono que registres</span></div>';
  } catch (err){
    byId('c-list').innerHTML = '<div class="empty"><b>Error</b><span>' + escapeHtml(errMsg(err)) + '</span></div>';
  }
}

// ---------------------------------------------------------------------
// Inicio
// ---------------------------------------------------------------------
if ('serviceWorker' in navigator){
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(()=>{}));
}
boot();
