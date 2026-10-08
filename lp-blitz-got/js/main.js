/* ============ CONFIGURAÇÃO — ajuste aqui ============ */
const CONFIG = {
  // Webhook do n8n. Teste = /webhook-test/ · Produção = /webhook/
  webhookUrl:  webhookUrl: 'https://n8n.srv1339289.hstgr.cloud/webhook/lp-acao-vendas',
  // Número da Suri (DDI 55 + DDD + número)
  whatsapp: '5571900000000',
  // Início do evento (horário de Salvador)
  eventoInicio: '2026-10-23T09:00:00-03:00',
  campanha: 'evento-2026-10-23-analise-credito'
};
/* ==================================================== */

const $ = (s, el = document) => el.querySelector(s);
const digits = s => (s || '').replace(/\D/g, '');
const waLink = msg => 'https://wa.me/' + CONFIG.whatsapp + '?text=' + encodeURIComponent(msg);

// UTMs (para saber de qual disparo veio o lead)
const params = new URLSearchParams(location.search);
const utm = {};
['utm_source','utm_medium','utm_campaign','utm_content','utm_term'].forEach(k => { if (params.get(k)) utm[k] = params.get(k); });

// Links de WhatsApp
document.querySelectorAll('.js-wa').forEach(a => { a.href = waLink(a.dataset.msg); a.target = '_blank'; a.rel = 'noopener'; });

// Entrada suave das seções
const io = 'IntersectionObserver' in window ? new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: .15 }) : null;
document.querySelectorAll('.reveal').forEach(el => io ? io.observe(el) : el.classList.add('in'));


// Reels: som e pausa fora da tela
const rv = $('#reels-video'), rs = $('#reels-sound');
if (rv && rs) {
  rs.addEventListener('click', () => {
    rv.muted = !rv.muted;
    if (!rv.muted) { rv.play().catch(() => {}); }
    rs.setAttribute('aria-pressed', String(!rv.muted));
    rs.querySelector('span').textContent = rv.muted ? 'Ativar som' : 'Desativar som';
  });
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(es => es.forEach(e => {
      if (e.isIntersecting) rv.play().catch(() => {}); else rv.pause();
    }), { threshold: .25 }).observe(rv);
  }
}

// Contagem regressiva até o início do evento
const inicio = new Date(CONFIG.eventoInicio).getTime();
const pad = n => String(n).padStart(2, '0');
let timerId;
function tick() {
  let diff = inicio - Date.now();
  if (diff <= 0) { $('#countdown').hidden = true; $('#live-now').hidden = false; clearInterval(timerId); return; }
  const d = Math.floor(diff / 864e5); diff -= d * 864e5;
  const h = Math.floor(diff / 36e5);  diff -= h * 36e5;
  const m = Math.floor(diff / 6e4);   diff -= m * 6e4;
  const s = Math.floor(diff / 1e3);
  $('#t-d').textContent = pad(d); $('#t-h').textContent = pad(h);
  $('#t-m').textContent = pad(m); $('#t-s').textContent = pad(s);
}
tick(); timerId = setInterval(tick, 1000);

// ===== Formulário =====
const form = $('#lead-form');
const CONTATO_LABEL = { whatsapp: 'WhatsApp', ligacao: 'Ligação', email: 'E-mail' };

form.whatsapp.addEventListener('input', e => {
  let d = digits(e.target.value).slice(0, 11);
  if (d.length > 6) e.target.value = '(' + d.slice(0,2) + ') ' + d.slice(2, d.length - 4) + '-' + d.slice(-4);
  else if (d.length > 2) e.target.value = '(' + d.slice(0,2) + ') ' + d.slice(2);
  else e.target.value = d;
});

function setErr(name, msg) {
  const input = form[name]; const small = input.closest('.field')?.querySelector('small');
  input.setAttribute('aria-invalid', msg ? 'true' : 'false');
  if (small) small.textContent = msg || '';
}
function showFormError(msg) { const el = $('#form-error'); el.textContent = msg; el.hidden = !msg; }

function validate() {
  let ok = true;
  const v = n => form[n].value.trim();
  const check = (n, cond, msg) => { if (!cond) { setErr(n, msg); ok = false; } else setErr(n, ''); };
  check('nome', v('nome').length >= 3, 'Informe seu nome.');
  const w = digits(v('whatsapp'));
  check('whatsapp', w.length === 10 || w.length === 11, 'Telefone com DDD.');
  const contato = form.querySelector('input[name="contato"]:checked');
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v('email'));
  if (contato && contato.value === 'email') check('email', emailOk, 'Informe o e-mail para contato.');
  else check('email', !v('email') || emailOk, 'E-mail inválido.');
  $('#prazo').setAttribute('aria-invalid', contato ? 'false' : 'true');
  $('.prazo-err').textContent = contato ? '' : 'Escolha uma opção.';
  if (!contato) ok = false;
  if (!form.consentimento.checked) { ok = false; showFormError('Marque a autorização de contato para continuar.'); }
  return ok;
}
form.addEventListener('change', e => {
  if (e.target.name === 'contato') { $('#prazo').setAttribute('aria-invalid', 'false'); $('.prazo-err').textContent = ''; }
});

form.addEventListener('submit', async e => {
  e.preventDefault();
  showFormError('');
  if (!validate()) { form.querySelector('input[aria-invalid="true"]')?.focus(); return; }

  const btn = $('#submit-btn');
  btn.disabled = true; btn.textContent = 'Enviando…';

  const contato = form.querySelector('input[name="contato"]:checked').value;
  const payload = {
    nome: form.nome.value.trim(),
    whatsapp: '55' + digits(form.whatsapp.value),
    email: form.email.value.trim() || null,
    preferenciaContato: contato,
    preferenciaContatoLabel: CONTATO_LABEL[contato],
    objetivo: 'analise_de_credito',
    evento: '2026-10-23 09:00',
    consentimento: true,
    website: form.website.value,   // honeypot
    campanha: CONFIG.campanha,
    origem: location.href,
    utm,
    enviadoEm: new Date().toISOString()
  };

  try {
    const ctrl = new AbortController(); const to = setTimeout(() => ctrl.abort(), 15000);
    const res = await fetch(CONFIG.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: ctrl.signal
    });
    clearTimeout(to);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    form.hidden = true; $('#form-head').hidden = true;
    const t = $('#thanks'); t.hidden = false; t.focus();
    if (window.dataLayer) window.dataLayer.push({ event: 'lead_enviado', contato });
  } catch (err) {
    showFormError('Não conseguimos enviar agora. Tente de novo ou chame no WhatsApp.');
    btn.disabled = false; btn.textContent = 'Quero minha análise de crédito';
  }
});
