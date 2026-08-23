const groq = require('groq')
const client = require('../utils/sanityClient.js')
const overlayDrafts = require('../utils/overlayDrafts')
const hasToken = !!client.config().token

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']

/**
 * Parses a Sanity `date` value ("2026-06-11") into a LOCAL midnight Date.
 *
 * `new Date('2026-06-11')` parses as UTC midnight, which renders as the 10th
 * for anyone west of Greenwich — the badge would read "10–12" for a show that
 * runs the 11th–13th. Splitting the parts avoids that entirely.
 */
function parseYMD (value) {
  if (!value) return null
  const [y, m, d] = String(value).slice(0, 10).split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d)
}

function toISO (date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('-')
}

/**
 * Retention cutoff (agreed with Tony, 2026-08-23): keep any show that ended on
 * or after the FIRST DAY OF LAST MONTH. On Aug 23 that cutoff is Jul 1, so the
 * June shows drop off while July and August still list. Every show in a month
 * expires together on the 1st, so a heading never lingers over one stale show.
 *
 * Deliberately calendar-based rather than "30 days after the show ends": that
 * literal version would have dropped the Jul 9–11 FUN show on Aug 10 while
 * leaving Jul 23–25 behind, hollowing out the July section mid-month.
 */
function retentionCutoff (today) {
  return new Date(today.getFullYear(), today.getMonth() - 1, 1)
}

/** "11–13", "6–8", "30–Aug 2" when a show straddles a month, or "14" for one day. */
function formatDayRange (start, end) {
  if (!end || start.getTime() === end.getTime()) return String(start.getDate())
  if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) {
    return `${start.getDate()}–${end.getDate()}`
  }
  return `${start.getDate()}–${MONTHS[end.getMonth()].slice(0, 3)} ${end.getDate()}`
}

async function getCoinShows () {
  const query = groq`*[_type == "coinShow"]{
    _id,
    name,
    startDate,
    endDate,
    city,
    state,
    tableNumber,
    url
  } | order(startDate asc)`

  const fetched = await client.fetch(query).catch(err => { console.error(err); return [] })
  const docs = overlayDrafts(hasToken, fetched) || []

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const cutoff = retentionCutoff(today)

  const shows = docs
    .map(doc => {
      const start = parseYMD(doc.startDate)
      return { doc, start, end: parseYMD(doc.endDate) || start }
    })
    // A show with no usable start date can't be placed on the page at all.
    // Warn rather than crash the build on a half-filled draft.
    .filter(({ doc, start }) => {
      if (!start) {
        console.warn(`⚠  Coin show "${doc.name || doc._id}" has no valid start date — skipped.`)
        return false
      }
      return true
    })
    .filter(({ end }) => end >= cutoff)
    .sort((a, b) => a.start - b.start || a.end - b.end)
    .map(({ doc, start, end }) => ({
      id: doc._id,
      name: doc.name,
      url: doc.url || null,
      location: [doc.city, doc.state].filter(Boolean).join(', '),
      // Blank in Studio means "not booked yet" — say so on the page for Tony.
      tableNumber: (doc.tableNumber || '').trim() || 'TBD',
      endISO: toISO(end),
      monthKey: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`,
      monthLabel: `${MONTHS[start.getMonth()]} ${start.getFullYear()}`,
      monthShort: MONTHS[start.getMonth()].slice(0, 3).toUpperCase(),
      dayRange: formatDayRange(start, end),
      isPast: end < today
    }))

  // Group under "July 2026"-style headings, keyed on the month the show STARTS
  // in. Insertion order is already chronological from the sort above.
  const groups = new Map()
  shows.forEach(show => {
    if (!groups.has(show.monthKey)) {
      groups.set(show.monthKey, { key: show.monthKey, label: show.monthLabel, shows: [] })
    }
    groups.get(show.monthKey).shows.push(show)
  })

  return Array.from(groups.values())
}

module.exports = getCoinShows
