import Stripe from 'stripe'
import type { Coin } from './types.js'
import { cached } from './store.js'

/** STRIPE_SECRET_KEY: a restricted key (rk_…) with Checkout Sessions write, set as Sensitive on Vercel. */
let client: Stripe | null = null
export function stripe() {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) return null
  client ??= new Stripe(key, { httpClient: Stripe.createFetchHttpClient() })
  return client
}

/** Your public receiving addresses. Set the ones you accept; the others are hidden. */
export function wallets() {
  const w: { coin: Coin; label: string; network: string; address: string }[] = []
  const add = (coin: Coin, label: string, network: string, address?: string) => { if (address?.trim()) w.push({ coin, label, network, address: address.trim() }) }
  add('BTC', 'Bitcoin', 'Bitcoin', process.env.WALLET_BTC)
  add('ETH', 'Ether', 'Ethereum', process.env.WALLET_ETH)
  add('SOL', 'Solana', 'Solana', process.env.WALLET_SOL)
  add('USDT', 'Tether USDT', process.env.WALLET_USDT_NETWORK ?? 'Ethereum (ERC-20)', process.env.WALLET_USDT)
  return w
}

const GECKO: Record<Coin, string> = { BTC: 'bitcoin', ETH: 'ethereum', SOL: 'solana', USDT: 'tether' }
/** EUR price of each coin from CoinGecko (free, no key), cached 5 minutes. */
export async function rates(): Promise<Partial<Record<Coin, number>>> {
  try {
    return await cached('rates', 300, async () => {
      const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${Object.values(GECKO).join(',')}&vs_currencies=eur`)
      if (!res.ok) throw new Error(String(res.status))
      const j = (await res.json()) as Record<string, { eur: number }>
      return Object.fromEntries(Object.entries(GECKO).map(([c, id]) => [c, j[id]?.eur])) as Partial<Record<Coin, number>>
    })
  } catch { return {} }
}
export const DECIMALS: Record<Coin, number> = { BTC: 6, ETH: 5, SOL: 3, USDT: 2 }
