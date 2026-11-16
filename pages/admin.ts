type C = {
  id: string; token: string; createdAt: number; name: string; email: string; discord?: string; kind: string; budget: string; deadline: string; description: string; links?: string
  status: 'new' | 'quoted' | 'paid' | 'in_progress' | 'delivered' | 'declined' | 'archived'
  quote?: { amount: number; days: number; message: string; sentAt: number }
  payment?: { state: 'checkout' | 'crypto_pending' | 'paid'; method: 'card' | 'crypto'; coin?: string; txHash?: string; paidAt?: number }
  delivery?: { url: string; note: string; at: number }
  history: { at: number; text: string }[]
}
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
const eur = (cents: number) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(cents / 100)
const ago = (t: number) => { const m = Math.round((Date.now() - t) / 60000); return m < 60 ? `il y a ${m} min` : m < 1440 ? `il y a ${Math.round(m / 60)} h` : new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) }

const KEY = 'mea.admin.token'
let token = ''
try { token = localStorage.getItem(KEY) ?? '' } catch { /* ignore */ }
let all: C[] = []
let filter = 'todo'
let current = location.hash.slice(1)

/** What needs me, in order: quote to write, crypto to check, work to do. */
const needs = (c: C) => c.status === 'new' || c.payment?.state === 'crypto_pending' || c.status === 'paid' || c.status === 'in_progress'
const FILTERS: [string, string, (c: C) => boolean][] = [
  ['todo', 'À faire', needs],
  ['new', 'À chiffrer', (c) => c.status === 'new'],
  ['quoted', 'Devis envoyé', (c) => c.status === 'quoted' && c.payment?.state !== 'crypto_pending'],
  ['check', 'Crypto à vérifier', (c) => c.payment?.state === 'crypto_pending'],
  ['work', 'En cours', (c) => c.status === 'paid' || c.status === 'in_progress'],
  ['done', 'Livrées', (c) => c.status === 'delivered'],
  ['all', 'Toutes', (c) => c.status !== 'archived'],
]
function badge(c: C) {
  if (c.payment?.state === 'crypto_pending') return '<span class="badge flare">Crypto à vérifier</span>'
  return ({ new: '<span class="badge signal">À chiffrer</span>', quoted: '<span class="badge">Devis envoyé</span>', paid: '<span class="badge good">Payée</span>', in_progress: '<span class="badge good">En cours</span>', delivered: '<span class="badge">Livrée</span>', declined: '<span class="badge">Refusée</span>', archived: '<span class="badge">Archivée</span>' })[c.status]
}

async function api(method: 'GET' | 'POST', body?: unknown) {
  const res = await fetch('/api/admin', { method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' })
  const out = await res.json().catch(() => ({}))
  if (res.status === 401) { logout(); throw new Error('Jeton refusé.') }
  if (!res.ok) throw new Error(out.error ?? `Erreur ${res.status}`)
  return out
}

async function refresh() {
  const out = await api('GET')
  all = out.requests
  $('sync').textContent = `À jour · ${new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`
  renderList(); renderDetail()
}

function renderList() {
  const live = all.filter((c) => c.status !== 'archived')
  const paid = all.filter((c) => c.payment?.state === 'paid')
  const month = paid.filter((c) => new Date(c.payment!.paidAt ?? 0).getMonth() === new Date().getMonth())
  $('stats').innerHTML = [
    ['À faire', String(all.filter(needs).length)],
    ['Demandes', String(live.length)],
    ['Encaissé ce mois', eur(month.reduce((s, c) => s + (c.quote?.amount ?? 0), 0))],
    ['Total encaissé', eur(paid.reduce((s, c) => s + (c.quote?.amount ?? 0), 0))],
  ].map(([l, v]) => `<div class="card"><div class="label">${l}</div><div class="v">${v}</div></div>`).join('')
  $('filters').innerHTML = FILTERS.map(([k, l, f]) => `<button data-f="${k}" aria-pressed="${k === filter}">${l} <b>${all.filter(f).length}</b></button>`).join('')
  document.querySelectorAll<HTMLButtonElement>('[data-f]').forEach((b) => b.addEventListener('click', () => { filter = b.dataset.f!; renderList() }))
  const shown = all.filter(FILTERS.find(([k]) => k === filter)![2])
  $('list').innerHTML = shown.length
    ? shown.map((c) => `<button class="item" data-id="${c.id}" aria-current="${c.id === current}"><span class="l1"><span class="who">${esc(c.name)}</span>${badge(c)}</span><span class="what">${esc(c.kind)} · ${esc(c.budget)} · ${ago(c.createdAt)}</span><span class="what">${esc(c.description)}</span></button>`).join('')
    : '<p class="muted">Rien ici.</p>'
  document.querySelectorAll<HTMLButtonElement>('.item').forEach((b) => b.addEventListener('click', () => { current = b.dataset.id!; history.replaceState(null, '', '#' + current); renderList(); renderDetail(); if (innerWidth < 860) $('detail').scrollIntoView({ behavior: 'smooth' }) }))
}

const EXPLORER: Record<string, string> = { BTC: 'https://mempool.space/tx/', ETH: 'https://etherscan.io/tx/', USDT: 'https://etherscan.io/tx/', SOL: 'https://solscan.io/tx/' }

function renderDetail() {
  const c = all.find((x) => x.id === current)
  if (!c) { $('detail').innerHTML = '<p class="muted" style="margin:0">Choisis une demande.</p>'; return }
  const link = `${location.origin}/track?t=${c.token}`
  const p = c.payment
  let act = ''
  if (c.status === 'new' || c.status === 'quoted' || c.status === 'declined') {
    if (p?.state === 'crypto_pending') {
      act += `<div class="notice">Paiement ${esc(p.coin ?? '')} déclaré pour ${c.quote ? eur(c.quote.amount) : '?'}. Vérifie la transaction avant de confirmer.<br><a href="${(EXPLORER[p.coin ?? ''] ?? '') + encodeURIComponent(p.txHash ?? '')}" target="_blank" rel="noreferrer" class="mono" style="overflow-wrap:anywhere">${esc(p.txHash ?? '')}</a></div>
        <div class="actions"><button class="btn btn-primary" data-act="confirm_payment">Paiement reçu, confirmer</button></div>`
    }
    act += `<form class="stack" id="quote" style="gap:14px">
      <div class="label">${c.quote ? 'Modifier le devis' : 'Envoyer un devis'}</div>
      <div class="row2"><div class="field"><label class="label" for="amount">Prix (€)</label><input class="input" id="amount" type="number" min="1" step="1" inputmode="numeric" value="${c.quote ? c.quote.amount / 100 : ''}" placeholder="450" /></div>
      <div class="field"><label class="label" for="days">Délai (jours)</label><input class="input" id="days" type="number" min="1" step="1" inputmode="numeric" value="${c.quote?.days ?? ''}" placeholder="7" /></div></div>
      <div class="field"><label class="label" for="msg">Message au client</label><textarea class="input" id="msg" style="min-height:110px" placeholder="Ce qui est inclus : 1 page, responsive, formulaire de contact, mise en ligne sur Vercel…">${esc(c.quote?.message ?? '')}</textarea></div>
      <div class="actions"><button class="btn btn-primary" type="submit">${c.quote ? 'Mettre à jour le devis' : 'Envoyer le devis'}</button><span class="hint">Le client le voit sur sa page${''} et reçoit un email si Resend est configuré.</span></div></form>`
  }
  if (c.status === 'paid') act += `<div class="actions"><button class="btn btn-ink" data-act="start">Je commence</button></div>`
  if (c.status === 'paid' || c.status === 'in_progress' || c.status === 'delivered') {
    act += `<form class="stack" id="deliver" style="gap:14px"><div class="label">${c.status === 'delivered' ? 'Livraison (modifier)' : 'Livrer'}</div>
      <div class="field"><label class="label" for="url">Lien du site (zip, GitHub, Drive, Vercel…)</label><input class="input" id="url" type="url" value="${esc(c.delivery?.url ?? '')}" placeholder="https://…" /></div>
      <div class="field"><label class="label" for="note">Mot pour le client</label><textarea class="input" id="note" style="min-height:90px" placeholder="Comment le mettre en ligne, ce qui est inclus…">${esc(c.delivery?.note ?? '')}</textarea></div>
      <div class="actions"><button class="btn btn-primary" type="submit">${c.status === 'delivered' ? 'Mettre à jour' : 'Livrer le site'}</button></div></form>`
  }
  $('detail').innerHTML = `
    <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap"><div><span class="label">#${c.id} · ${ago(c.createdAt)}</span><h2>${esc(c.name)}</h2></div>${badge(c)}</div>
    <dl class="kv">
      <dt>Email</dt><dd><a href="mailto:${esc(c.email)}">${esc(c.email)}</a></dd>
      ${c.discord ? `<dt>Discord</dt><dd class="mono">${esc(c.discord)}</dd>` : ''}
      <dt>Type</dt><dd>${esc(c.kind)}</dd><dt>Budget</dt><dd>${esc(c.budget)}</dd><dt>Délai</dt><dd>${esc(c.deadline)}</dd>
      <dt>Demande</dt><dd>${esc(c.description)}</dd>
      ${c.links ? `<dt>Inspiration</dt><dd>${esc(c.links)}</dd>` : ''}
      ${c.quote ? `<dt>Devis</dt><dd><strong>${eur(c.quote.amount)}</strong> · ${c.quote.days} j</dd>` : ''}
      ${p?.state === 'paid' ? `<dt>Payé</dt><dd>${p.method === 'card' ? 'Carte (Stripe)' : `Crypto ${esc(p.coin ?? '')}`}${p.paidAt ? ' · ' + new Date(p.paidAt).toLocaleDateString('fr-FR') : ''}</dd>` : ''}
    </dl>
    <div class="field"><span class="label">Lien du client</span><div class="copyline"><code>${esc(link)}</code><button class="btn btn-sm btn-ink" id="copyLink">Copier</button></div></div>
    <div id="err" class="notice bad" hidden></div>
    ${act}
    <div class="actions" style="border-top:1px solid var(--line);padding-top:16px">${c.status !== 'archived' ? '<button class="btn btn-sm btn-ghost" data-act="archive">Archiver</button>' : ''}<span class="hint">${esc(c.history.map((h) => h.text).slice(-1)[0] ?? '')}</span></div>`

  $('copyLink').addEventListener('click', async (e) => { try { await navigator.clipboard.writeText(link); (e.currentTarget as HTMLElement).textContent = 'Copié' } catch { /* ignore */ } })
  document.querySelectorAll<HTMLButtonElement>('[data-act]').forEach((b) => b.addEventListener('click', () => send({ action: b.dataset.act! }, b)))
  $('quote')?.addEventListener('submit', (e) => { e.preventDefault(); send({ action: 'quote', amount: $<HTMLInputElement>('amount').value, days: $<HTMLInputElement>('days').value, message: $<HTMLTextAreaElement>('msg').value }, (e.currentTarget as HTMLFormElement).querySelector('button')!) })
  $('deliver')?.addEventListener('submit', (e) => { e.preventDefault(); send({ action: 'deliver', url: $<HTMLInputElement>('url').value.trim(), note: $<HTMLTextAreaElement>('note').value }, (e.currentTarget as HTMLFormElement).querySelector('button')!) })
}

async function send(body: Record<string, string>, btn: HTMLButtonElement) {
  const label = btn.innerHTML
  btn.disabled = true; btn.innerHTML = '<span class="px live"></span>'
  try {
    const out = await api('POST', { id: current, ...body })
    all = all.map((c) => (c.id === current ? out.request : c))
    renderList(); renderDetail()
  } catch (e) {
    const box = $('err'); box.textContent = (e as Error).message; box.hidden = false
    btn.disabled = false; btn.innerHTML = label
  }
}

function logout() {
  token = ''
  try { localStorage.removeItem(KEY) } catch { /* ignore */ }
  $('app').hidden = true; $('logout').hidden = true; $('login').hidden = false
}
async function enter() {
  try {
    await refresh()
    $('login').hidden = true; $('app').hidden = false; $('logout').hidden = false
    try { localStorage.setItem(KEY, token) } catch { /* ignore */ }
  } catch (e) {
    $('loginErr').textContent = (e as Error).message; $('loginErr').hidden = false
  }
}
$('login').addEventListener('submit', (e) => { e.preventDefault(); token = $<HTMLInputElement>('token').value.trim(); enter() })
$('logout').addEventListener('click', logout)
if (token) enter()
setInterval(() => { if (token && document.visibilityState === 'visible' && !document.activeElement?.matches('input, textarea')) refresh().catch(() => {}) }, 30000)

export {}
