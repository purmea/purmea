import { body, clean, euros, isAdmin, json, siteOrigin } from './_lib/http.js'
import { tellClient } from './_lib/notify.js'
import { get, list, save } from './_lib/store.js'

const deny = () => json({ error: 'Jeton admin invalide.' }, 401)

/** GET /api/admin: every request, newest first (owner only). */
export async function GET(request: Request) {
  if (!isAdmin(request)) return deny()
  try { return json({ requests: await list() }) } catch (e) { return json({ error: (e as Error).message }, 500) }
}

type Act = { id: string; action: 'quote' | 'confirm_payment' | 'start' | 'deliver' | 'archive'; amount: number; days: number; message: string; url: string; note: string }

/** POST /api/admin: move a request forward (owner only). */
export async function POST(request: Request) {
  if (!isAdmin(request)) return deny()
  const b = await body<Act>(request)
  const c = await get(clean(b.id, 20))
  if (!c) return json({ error: 'Demande introuvable.' }, 404)
  const now = Date.now(), link = `${siteOrigin(request)}/track?t=${c.token}`
  const paid = c.payment?.state === 'paid'

  switch (b.action) {
    case 'quote': {
      const amount = Math.round(Number(b.amount) * 100), days = Math.round(Number(b.days))
      if (!(amount >= 100 && amount <= 10_000_000)) return json({ error: 'Prix entre 1 € et 100 000 €.' }, 400)
      if (!(days >= 1 && days <= 365)) return json({ error: 'Délai entre 1 et 365 jours.' }, 400)
      if (paid) return json({ error: 'Déjà payée : le prix ne peut plus changer.' }, 409)
      c.quote = { amount, days, message: clean(b.message, 2000), sentAt: now }
      c.status = 'quoted'
      if (c.payment?.state !== 'crypto_pending') c.payment = undefined
      c.history.push({ at: now, text: `Quote sent: ${euros(amount)}, ready in ${days} day${days > 1 ? 's' : ''}` })
      await save(c)
      await tellClient(c, `Your quote: ${euros(amount)}`, [`Hi ${c.name},`, `Here’s my price for your ${c.kind.toLowerCase()}: ${euros(amount)}, ready ${days} day${days > 1 ? 's' : ''} after payment.`, ...(c.quote.message ? [c.quote.message] : []), 'You can pay by card or crypto from your request page.'], link)
      break
    }
    case 'confirm_payment':
      if (!c.quote || paid) return json({ error: 'Rien à confirmer.' }, 409)
      c.payment = { ...(c.payment ?? { method: 'crypto' }), state: 'paid', paidAt: now }
      c.status = 'paid'
      c.history.push({ at: now, text: `Payment confirmed (${euros(c.quote.amount)})` })
      await save(c)
      await tellClient(c, 'Payment received', [`Hi ${c.name},`, 'Your payment is confirmed. I’m starting on your site.'], link)
      break
    case 'start':
      if (!paid) return json({ error: 'Pas encore payée.' }, 409)
      c.status = 'in_progress'
      c.history.push({ at: now, text: 'Work started' })
      await save(c)
      break
    case 'deliver': {
      if (!paid) return json({ error: 'La livraison se débloque une fois payée.' }, 409)
      const url = clean(b.url, 600)
      if (!/^https:\/\/\S+$/.test(url)) return json({ error: 'Lien de livraison en https:// (Drive, GitHub, Vercel…).' }, 400)
      c.delivery = { url, note: clean(b.note, 2000), at: now }
      c.status = 'delivered'
      c.history.push({ at: now, text: 'Site delivered' })
      await save(c)
      await tellClient(c, 'Your website is ready', [`Hi ${c.name},`, 'Your site is done. The download link is on your request page.', ...(c.delivery.note ? [c.delivery.note] : [])], link)
      break
    }
    case 'archive':
      c.status = 'archived'
      await save(c)
      break
    default:
      return json({ error: 'Action inconnue.' }, 400)
  }
  return json({ request: c })
}
