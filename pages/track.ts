type View = {
  id: string; createdAt: number; name: string; kind: string; budget: string; deadline: string; description: string; links?: string
  status: 'new' | 'quoted' | 'paid' | 'in_progress' | 'delivered' | 'declined' | 'archived'
  quote?: { amount: number; days: number; message: string; sentAt: number }
  payment?: { state: 'checkout' | 'crypto_pending' | 'paid'; method: 'card' | 'crypto'; coin?: string; txHash?: string; paidAt?: number }
  delivery?: { url: string; note: string; at: number }
  history: { at: number; text: string }[]
}
type Wallet = { coin: string; label: string; network: string; address: string; amount?: string }

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
const eur = (cents: number) => new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', maximumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100)
const when = (t: number) => new Date(t).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
const params = new URLSearchParams(location.search)
const token = params.get('t') ?? ''

let data: { request: View; pay: { card: boolean; crypto: Wallet[] } } | null = null
let coin = ''

async function load() {
  try {
    const res = await fetch(`/api/requests?t=${encodeURIComponent(token)}`, { cache: 'no-store' })
    const out = await res.json()
    if (!res.ok) throw new Error(out.error ?? 'Couldn’t load your request.')
    data = out
    render()
  } catch (e) {
    $('loading').hidden = true
    $('fail').textContent = (e as Error).message
    $('fail').hidden = false
  }
}

const STEPS = ['Received', 'Quote', 'Paid', 'Building', 'Delivered']
function stepOf(r: View) {
  if (r.status === 'delivered') return 5
  if (r.status === 'in_progress') return 3
  if (r.status === 'paid') return 3
  if (r.status === 'quoted') return r.payment?.state === 'crypto_pending' ? 2 : 1
  return r.status === 'new' ? 1 : 1
}

function copyBtn(text: string, label = 'Copy') {
  return `<button class="btn btn-sm btn-ink" data-copy="${esc(text)}">${label}</button>`
}

function render() {
  if (!data) return
  const r = data.request
  $('loading').hidden = true
  $('page').hidden = false
  $('ref').textContent = `Request #${r.id}`
  $('hello').innerHTML = `Hi ${esc(r.name.split(' ')[0])}<span class="px"></span>`
  const step = stepOf(r)
  $('progress').innerHTML = STEPS.map((s, i) => `<li class="${i < step ? 'done' : i === step ? 'now' : ''}"><i></i>${s}</li>`).join('')

  let html = ''
  const link = location.origin + location.pathname + '?t=' + encodeURIComponent(token)
  if (params.get('new')) html += `<div class="notice">Request sent. Bookmark this page: it’s your private link to follow it, see the price and get your site.</div>`
  if (params.get('paid') && r.payment?.state === 'paid') html += `<div class="notice">Payment received, thank you. I’m on it.</div>`

  if (r.status === 'new') {
    html += `<section class="card stack"><p class="big-state">I’m reading your request<span class="px live"></span></p>
      <p class="muted" style="margin:0">You’ll get a price and a delivery time here${' '}within 48 hours, and by email at the address you gave.</p>
      <div class="copyline"><code>${esc(link)}</code>${copyBtn(link, 'Copy link')}</div></section>`
  } else if (r.status === 'quoted' && r.quote && r.payment?.state === 'crypto_pending') {
    html += `<section class="card stack"><p class="big-state">Payment sent. I’m checking it<span class="px live"></span></p>
      <p class="muted" style="margin:0">${esc(r.payment.coin ?? '')} transaction <span class="mono" style="overflow-wrap:anywhere">${esc(r.payment.txHash ?? '')}</span>. Once it’s confirmed on the blockchain (usually within a few hours), I start building.</p></section>`
  } else if (r.status === 'quoted' && r.quote) {
    const q = r.quote
    html += `<section class="card stack">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap"><span class="label">Your quote</span><span class="badge signal">Ready in ${q.days} day${q.days > 1 ? 's' : ''}</span></div>
      <div class="price">${eur(q.amount)}</div>
      ${q.message ? `<p style="margin:0;white-space:pre-wrap">${esc(q.message)}</p>` : ''}
      <p class="hint" style="margin:0">Fixed price. Work starts as soon as the payment is in, and the site is delivered on this page.</p>
      <div class="actions">
        ${data.pay.card ? `<button class="btn btn-primary" id="payCard">Pay ${eur(q.amount)} by card <span class="arrow">→</span></button>` : ''}
        ${data.pay.crypto.length ? `<button class="btn btn-ink" id="payCrypto">Pay with crypto</button>` : ''}
        <button class="btn btn-ghost" id="decline">Decline</button>
      </div>
      <div id="payError" class="notice bad" hidden></div>
      <div id="crypto" class="stack" hidden></div>
    </section>`
  } else if (r.status === 'paid' || r.status === 'in_progress') {
    const ready = r.quote && r.payment?.paidAt ? new Date(r.payment.paidAt + r.quote.days * 864e5).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' }) : ''
    html += `<section class="card stack"><span class="badge good" style="justify-self:start">Paid</span>
      <p class="big-state">${r.status === 'paid' ? 'Paid. I’m starting' : 'I’m building your site'}<span class="px live"></span></p>
      <p class="muted" style="margin:0">${ready ? `Expected by <strong style="color:var(--ink)">${ready}</strong>. ` : ''}You’ll get an email and the download link right here when it’s ready.</p></section>`
  } else if (r.status === 'delivered' && r.delivery) {
    html += `<section class="card stack"><span class="badge flare" style="justify-self:start">Delivered</span>
      <p class="big-state">Your site is ready<span class="px"></span></p>
      ${r.delivery.note ? `<p style="margin:0;white-space:pre-wrap">${esc(r.delivery.note)}</p>` : ''}
      <div class="actions"><a class="btn btn-primary" href="${esc(r.delivery.url)}" target="_blank" rel="noreferrer">Get your site <span class="arrow">→</span></a></div>
      <p class="hint" style="margin:0">Need a change? Message me on Discord with your request number #${esc(r.id)}.</p></section>`
  } else if (r.status === 'declined') {
    html += `<section class="card stack"><p class="big-state">Quote declined</p><p class="muted" style="margin:0">No problem. If you change your mind or want to adjust the scope, message me on Discord.</p></section>`
  } else {
    html += `<section class="card stack"><p class="big-state">This request is closed</p></section>`
  }
  $('state').innerHTML = html

  $('brief').innerHTML = [['Type', r.kind], ['Budget', r.budget], ['When', r.deadline], ['Description', r.description], ...(r.links ? [['Inspiration', r.links]] : [])]
    .map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('')
  $('history').innerHTML = [...r.history].reverse().map((h) => `<li><time>${when(h.at)}</time><span>${esc(h.text)}</span></li>`).join('')
  wire()
}

function renderCrypto() {
  if (!data) return
  const ws = data.pay.crypto
  coin ||= ws[0]?.coin ?? ''
  const w = ws.find((x) => x.coin === coin)!
  $('crypto').innerHTML = `
    <div class="tabs">${ws.map((x) => `<button data-coin="${x.coin}" aria-pressed="${x.coin === coin}">${esc(x.label)}</button>`).join('')}</div>
    <div class="field"><span class="label">Send${w.amount ? ` about <span style="color:var(--ink)">${w.amount} ${w.coin}</span>` : ''} to</span>
      <div class="copyline"><code>${esc(w.address)}</code>${copyBtn(w.address)}</div>
      <span class="hint">Network: <strong style="color:var(--ink)">${esc(w.network)}</strong>. Sending on another network loses the funds.${w.amount ? ' Amount at today’s rate; a little over is fine.' : ''}</span></div>
    <div class="field"><label class="label" for="tx">Transaction ID</label>
      <input class="input mono" id="tx" placeholder="Paste the hash from your wallet once it’s sent" autocomplete="off" spellcheck="false" /></div>
    <div><button class="btn btn-ink" id="sent">I’ve sent it</button></div>`
  document.querySelectorAll<HTMLButtonElement>('[data-coin]').forEach((b) => b.addEventListener('click', () => { coin = b.dataset.coin!; renderCrypto() }))
  $('sent').addEventListener('click', () => act({ action: 'crypto', coin, txHash: $<HTMLInputElement>('tx').value.trim() }, $('sent') as HTMLButtonElement))
  wireCopy()
}

async function act(body: Record<string, string>, btn: HTMLButtonElement) {
  const label = btn.innerHTML
  btn.disabled = true; btn.innerHTML = '<span class="px live"></span>'
  try {
    const res = await fetch('/api/pay', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ t: token, ...body }) })
    const out = await res.json()
    if (!res.ok) throw new Error(out.error ?? 'Something went wrong.')
    if (out.url) { location.href = out.url; return }
    await load()
  } catch (e) {
    const box = $('payError'); box.textContent = (e as Error).message; box.hidden = false
    btn.disabled = false; btn.innerHTML = label
  }
}

function wireCopy() {
  document.querySelectorAll<HTMLButtonElement>('[data-copy]').forEach((b) => {
    if (b.dataset.wired) return
    b.dataset.wired = '1'
    b.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(b.dataset.copy!); const t = b.textContent; b.textContent = 'Copied'; setTimeout(() => (b.textContent = t), 1400) } catch { /* select manually */ }
    })
  })
}

function wire() {
  wireCopy()
  $('payCard')?.addEventListener('click', (e) => act({ action: 'card' }, e.currentTarget as HTMLButtonElement))
  $('payCrypto')?.addEventListener('click', () => { const box = $('crypto'); box.hidden = !box.hidden; if (!box.hidden) renderCrypto() })
  const decline = $('decline')
  decline?.addEventListener('click', () => {
    if (decline.dataset.sure) return act({ action: 'decline' }, decline as HTMLButtonElement)
    decline.dataset.sure = '1'; decline.textContent = 'Sure? Click again to decline'
  })
}

if (!token) { $('loading').hidden = true; $('fail').textContent = 'This link is missing its code. Open the full link from your email.'; $('fail').hidden = false }
else load()
// keep the page fresh while you wait
setInterval(() => { if (document.visibilityState === 'visible' && data && ['new', 'quoted', 'paid', 'in_progress'].includes(data.request.status) && !document.activeElement?.matches('input') && document.getElementById('crypto')?.hidden !== false) load() }, 30000)

export {}
