const groq = require('groq')
const client = require('../utils/sanityClient.js')

/**
 * Away / vacation notice, edited in Studio under "Away Message" (the single
 * `awayNotice` document). Rendered by _includes/awaynotice.njk on the
 * homepage and inventory page only.
 *
 * The page script checks showFrom/showUntil in the visitor's browser, so the
 * notice can be switched on early and schedules itself. Both are inclusive.
 *
 * Studio holds the switch, the dates, the heading and the message. The rest
 * of the copy is fixed here; move a field to Studio only if Tony asks.
 */
const DEFAULTS = {
  eyebrow: 'A note from Tony',
  heading: 'Cabbage Coins is away',
  signoff: 'Thanks for your patience,<br>Tony Gryckiewicz',
  buttonText: 'Browse the inventory',
  secondaryText: 'Email Tony directly',
  secondaryHref: 'mailto:tony@cabbagecoins.com',
  showAgainAfterHours: 24
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']

/** "2026-09-24" → local Date, avoiding the UTC shift of new Date('2026-09-24'). */
function parseYMD (value) {
  if (!value) return null
  const [y, m, d] = String(value).slice(0, 10).split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d)
}

function ordinal (n) {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

/** "August 24 – September 24"; the year is added only when the trip crosses one. */
function formatDateline (first, last) {
  const md = d => `${MONTHS[d.getMonth()]} ${d.getDate()}`
  if (!first || !last) return ''
  if (first.getTime() === last.getTime()) return md(first)
  if (first.getFullYear() !== last.getFullYear()) {
    return `${md(first)}, ${first.getFullYear()} – ${md(last)}, ${last.getFullYear()}`
  }
  return `${md(first)} – ${md(last)}`
}

module.exports = async function () {
  const doc = await client
    .fetch(groq`*[_id == "awayNotice"][0]{ enabled, firstDay, lastDay, heading, body }`)
    .catch(err => { console.error('⚠  Away notice: could not read from Sanity —', err.message); return null })

  if (!doc || !doc.enabled) return { ...DEFAULTS, enabled: false }

  const first = parseYMD(doc.firstDay)
  const last = parseYMD(doc.lastDay)
  if (!first || !last) {
    console.warn('⚠  Away notice is switched on but its dates are missing — not shown.')
    return { ...DEFAULTS, enabled: false }
  }

  const back = new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1)
  const backText = `${MONTHS[back.getMonth()]} ${ordinal(back.getDate())}, ${back.getFullYear()}`

  return {
    ...DEFAULTS,
    enabled: true,
    showFrom: doc.firstDay,
    showUntil: doc.lastDay,
    heading: (doc.heading || '').trim() || DEFAULTS.heading,
    dateline: formatDateline(first, last),
    body: (doc.body || '').replace(/\[back\]/gi, backText)
  }
}
