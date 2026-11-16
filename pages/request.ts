const KINDS = ['Portfolio', 'Landing page', 'Online store', 'Dashboard / web app', 'Something else']
const BUDGETS = ['Under €300', '€300 – €800', '€800 – €2,000', '€2,000+', 'Not sure yet']
const DEADLINES = ['No rush', 'Within a month', 'Within 2 weeks', 'ASAP']

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
const chips = (id: string, values: string[]) => {
  $(id).innerHTML = values.map((v, i) => `<label class="chip"><input type="radio" name="${id}" value="${v}" id="${id}-${i}"><span>${v}</span></label>`).join('')
}
// not set up yet on the server: point people to Discord instead of letting them type for nothing
fetch('/api/requests?ready').then((r) => r.json()).then((r: { ready?: boolean }) => {
  if (r.ready === false) {
    $('formError').innerHTML = 'Requests open very soon. For now, message me on Discord: <span class="mono">qb_f</span>.'
    $('formError').hidden = false
    $<HTMLButtonElement>('send').disabled = true
  }
}).catch(() => {})

chips('kind', KINDS); chips('budget', BUDGETS); chips('deadline', DEADLINES)

const desc = $<HTMLTextAreaElement>('description')
const count = () => { $('count').textContent = `${desc.value.length} / 4000` }
desc.addEventListener('input', count); count()

// keep an unsent draft if the page is closed
const KEY = 'mea.request.draft'
const form = $<HTMLFormElement>('form')
try {
  const draft = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, string>
  for (const [k, v] of Object.entries(draft)) {
    const el = form.elements.namedItem(k)
    if (el instanceof RadioNodeList) el.value = v
    else if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) el.value = v
  }
  count()
} catch { /* storage unavailable */ }
form.addEventListener('input', () => {
  try { localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(new FormData(form)))) } catch { /* ignore */ }
})

form.addEventListener('submit', async (e) => {
  e.preventDefault()
  const data = Object.fromEntries(new FormData(form)) as Record<string, string>
  document.querySelectorAll<HTMLElement>('.field').forEach((f) => { f.classList.remove('bad'); const err = f.querySelector<HTMLElement>('.err'); if (err) err.hidden = true })
  $('formError').hidden = true
  const send = $<HTMLButtonElement>('send')
  send.disabled = true
  send.innerHTML = 'Sending<span class="px live"></span>'
  try {
    const res = await fetch('/api/requests', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) })
    const out = (await res.json()) as { token?: string; error?: string; errors?: Record<string, string> }
    if (!res.ok || !out.token) {
      for (const [k, msg] of Object.entries(out.errors ?? {})) {
        const f = document.querySelector<HTMLElement>(`.field[data-f="${k}"]`)
        const err = f?.querySelector<HTMLElement>('.err')
        if (f && err) { f.classList.add('bad'); err.textContent = msg; err.hidden = false }
      }
      $('formError').textContent = out.error ?? 'Something went wrong. Please try again.'
      $('formError').hidden = false
      document.querySelector('.field.bad')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
    try { localStorage.removeItem(KEY) } catch { /* ignore */ }
    location.href = `/track?t=${encodeURIComponent(out.token)}&new=1`
  } catch {
    $('formError').textContent = 'No connection. Check your internet and send again; your text is kept.'
    $('formError').hidden = false
  } finally {
    send.disabled = false
    send.innerHTML = 'Send request <span class="arrow">→</span>'
  }
})

export {}
