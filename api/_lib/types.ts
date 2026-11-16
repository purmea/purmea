export type Status = 'new' | 'quoted' | 'paid' | 'in_progress' | 'delivered' | 'declined' | 'archived'
export type Coin = 'BTC' | 'ETH' | 'SOL' | 'USDT'

export type Commission = {
  id: string
  token: string // the client's private link; never shown to anyone else
  createdAt: number
  updatedAt: number
  name: string
  email: string
  discord?: string
  kind: string
  budget: string
  deadline: string
  description: string
  links?: string
  status: Status
  quote?: { amount: number; days: number; message: string; sentAt: number } // amount in euro cents
  payment?: {
    state: 'checkout' | 'crypto_pending' | 'paid'
    method: 'card' | 'crypto'
    sessionId?: string
    coin?: Coin
    txHash?: string
    paidAt?: number
  }
  delivery?: { url: string; note: string; at: number }
  history: { at: number; text: string }[]
}

/** What the client sees on their tracking page. The delivery link only once paid. */
export function publicView(c: Commission) {
  const paid = c.payment?.state === 'paid'
  return {
    id: c.id,
    createdAt: c.createdAt,
    name: c.name,
    kind: c.kind,
    budget: c.budget,
    deadline: c.deadline,
    description: c.description,
    links: c.links,
    status: c.status,
    quote: c.status === 'new' ? undefined : c.quote,
    payment: c.payment ? { state: c.payment.state, method: c.payment.method, coin: c.payment.coin, txHash: c.payment.txHash, paidAt: c.payment.paidAt } : undefined,
    delivery: paid && c.status === 'delivered' ? c.delivery : undefined,
    history: c.history,
  }
}
