import type { Commission } from './types.js'
import { euros } from './http.js'

/**
 * Pings you on Discord. Create a webhook in a private channel of your server
 * (Channel settings → Integrations → Webhooks) and set DISCORD_WEBHOOK_URL on Vercel.
 */
export async function tellOwner(title: string, c: Commission, extra?: string) {
  const hook = process.env.DISCORD_WEBHOOK_URL
  if (!hook) return
  const admin = `${process.env.SITE_URL ?? ''}/admin#${c.id}`
  await fetch(hook, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      username: 'mea · requests',
      embeds: [{
        title, url: admin.startsWith('http') ? admin : undefined, color: 0x2550f5,
        description: (extra ? `${extra}\n\n` : '') + c.description.slice(0, 600),
        fields: [
          { name: 'Client', value: `${c.name} · ${c.email}${c.discord ? ` · ${c.discord}` : ''}`.slice(0, 1000) },
          { name: 'Type', value: c.kind, inline: true }, { name: 'Budget', value: c.budget, inline: true }, { name: 'Délai', value: c.deadline, inline: true },
          ...(c.quote ? [{ name: 'Devis', value: euros(c.quote.amount), inline: true }] : []),
        ],
        footer: { text: `#${c.id}` },
      }],
    }),
  }).catch((e) => console.error('discord', (e as Error).message))
}

/** Emails the client through Resend if RESEND_API_KEY and MAIL_FROM are set; otherwise does nothing. */
export async function tellClient(c: Commission, subject: string, lines: string[], link: string) {
  const key = process.env.RESEND_API_KEY, from = process.env.MAIL_FROM
  if (!key || !from) return
  const esc = (s: string) => s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!)
  const html = `<div style="font-family:system-ui,sans-serif;font-size:16px;line-height:1.5;color:#0a0c10">${lines.map((l) => `<p>${esc(l)}</p>`).join('')}<p><a href="${esc(link)}" style="display:inline-block;background:#2550f5;color:#fff;padding:12px 20px;border-radius:999px;text-decoration:none">Open your request</a></p><p style="color:#5a6170;font-size:13px">mea · ${esc(link)}</p></div>`
  await fetch('https://api.resend.com/emails', {
    method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from, to: c.email, subject, html, text: `${lines.join('\n\n')}\n\n${link}` }),
  }).catch((e) => console.error('resend', (e as Error).message))
}
