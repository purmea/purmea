import { body, clean, clientIp, euros, json, newId, newToken, siteOrigin } from './_lib/http.js'
import { tellClient, tellOwner } from './_lib/notify.js'
import { DECIMALS, rates, stripe, wallets } from './_lib/pay.js'
import { allow, byToken, create, save, storageReady } from './_lib/store.js'
import { publicView, type Commission } from './_lib/types.js'

export const KINDS = ['Portfolio', 'Landing page', 'Online store', 'Dashboard / web app', 'Something else']
export const BUDGETS = ['Under €300', '€300 – €800', '€800 – €2,000', '€2,000+', 'Not sure yet']
export const DEADLINES = ['No rush', 'Within a month', 'Within 2 weeks', 'ASAP']

type NewRequest = { name: string; email: string; discord: string; kind: string; budget: string; deadline: string; description: string; links: string; website: string }

/** POST /api/requests: a visitor asks for a website. Returns the private tracking token. */
export async function POST(request: Request) {
  const b = await body<NewRequest>(request)
  if (clean(b.website, 200)) return json({ token: newToken() }) // honeypot: bots fill every field
  const c = {
    name: clean(b.name, 80), email: clean(b.email, 160).toLowerCase(), discord: clean(b.discord, 60),
    kind: clean(b.kind, 40), budget: clean(b.budget, 40), deadline: clean(b.deadline, 40),
    description: clean(b.description, 4000), links: clean(b.links, 600),
  }
  const errors: Record<string, string> = {}
  if (!c.name) errors.name = 'Tell me your name.'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(c.email)) errors.email = 'This email doesn’t look right.'
  if (!KINDS.includes(c.kind)) errors.kind = 'Pick the kind of site.'
  if (!BUDGETS.includes(c.budget)) errors.budget = 'Pick a budget range.'
  if (!DEADLINES.includes(c.deadline)) errors.deadline = 'Pick a deadline.'
  if (c.description.length < 30) errors.description = 'Describe the site in a few sentences (30 characters minimum).'
  if (Object.keys(errors).length) return json({ error: 'Some fields need a fix.', errors }, 400)

  try {
    if (!(await allow(`create:${clientIp(request)}`, 5, 3600))) return json({ error: 'Too many requests from this network. Try again in an hour.' }, 429)
    const now = Date.now()
    const commission: Commission = {
      id: newId(), token: newToken(), createdAt: now, updatedAt: now, ...c,
      discord: c.discord || undefined, links: c.links || undefined,
      status: 'new', history: [{ at: now, text: 'Request received' }],
    }
    await create(commission)
    const link = `${siteOrigin(request)}/track?t=${commission.token}`
    await Promise.all([
      tellOwner('🆕 Nouvelle demande de site', commission),
      tellClient(commission, 'Your website request is in', [`Hi ${commission.name},`, 'Thanks, I got your request. I’ll read it and send you a price, usually within 48 hours.', 'Keep this link: it’s where you’ll see the quote, pay and get your site.'], link),
    ])
    return json({ token: commission.token })
  } catch (e) {
    console.error('create', (e as Error).message)
    return json({ error: 'Your request couldn’t be saved. Please try again in a minute.' }, 500)
  }
}

/** GET /api/requests?t=TOKEN: the client's tracking page data. Also settles a finished card payment. */
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams
  if (q.has('ready')) return json({ ready: storageReady() })
  const t = q.get('t') ?? ''
  try {
    const c = await byToken(t)
    if (!c) return json({ error: 'This link doesn’t match any request. Check that you copied it whole.' }, 404)

    // came back from Stripe Checkout: check the session and mark the request paid
    const s = stripe()
    if (s && c.payment?.state === 'checkout' && c.payment.sessionId) {
      const session = await s.checkout.sessions.retrieve(c.payment.sessionId)
      if (session.payment_status === 'paid') {
        c.payment = { ...c.payment, state: 'paid', paidAt: Date.now() }
        c.status = 'paid'
        c.history.push({ at: Date.now(), text: `Paid ${euros(c.quote!.amount)} by card` })
        await save(c)
        await tellOwner('💳 Paiement carte reçu', c, `${euros(c.quote!.amount)} payé par carte.`)
      }
    }

    const view = publicView(c)
    const awaitingPayment = c.status === 'quoted' && c.payment?.state !== 'crypto_pending'
    let crypto: { coin: string; label: string; network: string; address: string; amount?: string }[] = []
    if (awaitingPayment && c.quote) {
      const r = await rates()
      crypto = wallets().map((w) => ({ ...w, amount: r[w.coin] ? (c.quote!.amount / 100 / r[w.coin]!).toFixed(DECIMALS[w.coin]) : undefined }))
    }
    return json({ request: view, pay: { card: !!s, crypto } })
  } catch (e) {
    console.error('view', (e as Error).message)
    return json({ error: 'Couldn’t load your request. Please refresh in a minute.' }, 500)
  }
}
