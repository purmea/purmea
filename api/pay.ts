import { body, clean, euros, json, siteOrigin } from './_lib/http.js'
import { tellOwner } from './_lib/notify.js'
import { stripe, wallets } from './_lib/pay.js'
import { byToken, save } from './_lib/store.js'
import { publicView, type Coin } from './_lib/types.js'

type Action = { t: string; action: 'card' | 'crypto' | 'decline'; coin: Coin; txHash: string }

/** POST /api/pay: the client accepts the quote (card or crypto) or declines it. */
export async function POST(request: Request) {
  const b = await body<Action>(request)
  try {
    const c = await byToken(clean(b.t, 80))
    if (!c) return json({ error: 'This link doesn’t match any request.' }, 404)
    if (c.status !== 'quoted' || !c.quote) return json({ error: 'There’s no quote waiting for payment on this request.' }, 409)
    const now = Date.now()

    if (b.action === 'card') {
      const s = stripe()
      if (!s) return json({ error: 'Card payment isn’t available right now. Use crypto or contact me.' }, 503)
      const origin = siteOrigin(request)
      const session = await s.checkout.sessions.create({
        mode: 'payment',
        line_items: [{ quantity: 1, price_data: { currency: 'eur', unit_amount: c.quote.amount, product_data: { name: `Website: ${c.kind}`, description: `mea request #${c.id}` } } }],
        customer_email: c.email,
        success_url: `${origin}/track?t=${c.token}&paid=1`,
        cancel_url: `${origin}/track?t=${c.token}`,
        metadata: { commission: c.id },
        // a custom service, not a digital product: you are the seller, not Stripe's Managed Payments
        managed_payments: { enabled: false },
      } as Parameters<typeof s.checkout.sessions.create>[0])
      c.payment = { state: 'checkout', method: 'card', sessionId: session.id }
      await save(c)
      return json({ url: session.url })
    }

    if (b.action === 'crypto') {
      const coin = clean(b.coin, 8) as Coin, tx = clean(b.txHash, 140)
      if (!wallets().some((w) => w.coin === coin)) return json({ error: 'This coin isn’t accepted.' }, 400)
      if (!/^[A-Za-z0-9]{16,140}$/.test(tx)) return json({ error: 'Paste the transaction ID (hash) from your wallet.' }, 400)
      c.payment = { state: 'crypto_pending', method: 'crypto', coin, txHash: tx }
      c.history.push({ at: now, text: `Crypto payment sent (${coin}), waiting for confirmation` })
      await save(c)
      await tellOwner('🪙 Paiement crypto à vérifier', c, `${coin} · ${euros(c.quote.amount)}\nTx : \`${tx}\``)
      return json({ request: publicView(c) })
    }

    if (b.action === 'decline') {
      c.status = 'declined'
      c.history.push({ at: now, text: 'Quote declined' })
      await save(c)
      await tellOwner('❌ Devis refusé', c)
      return json({ request: publicView(c) })
    }
    return json({ error: 'Unknown action.' }, 400)
  } catch (e) {
    console.error('pay', (e as Error).message)
    return json({ error: 'Something went wrong. Please try again.' }, 500)
  }
}
