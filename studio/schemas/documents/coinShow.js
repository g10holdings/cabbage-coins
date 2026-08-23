import { MdEvent } from 'react-icons/md'

/**
 * A single coin show on the public "Coin Show Schedule" page (/coinshows/).
 *
 * Retention rule (agreed with Tony, 2026-08-23): a show stays on the page until
 * the end of the calendar month AFTER the month it ends in — so on Aug 23 the
 * June shows are gone, July and August are still listed. Whole month sections
 * drop off together rather than thinning out one show at a time. The filtering
 * itself lives in `web/_data/coinshows.js`; nothing needs unpublishing here.
 */
export default {
  name: 'coinShow',
  type: 'document',
  title: 'Coin Show',
  icon: MdEvent,
  fields: [
    {
      name: 'name',
      type: 'string',
      title: 'Show name',
      description: 'e.g. "Whitman Summer Expo"',
      validation: Rule => Rule.required()
    },
    {
      name: 'startDate',
      type: 'date',
      title: 'Start date',
      options: { dateFormat: 'YYYY-MM-DD' },
      validation: Rule => Rule.required()
    },
    {
      name: 'endDate',
      type: 'date',
      title: 'End date',
      description: 'For a one-day show, use the same date as the start date.',
      options: { dateFormat: 'YYYY-MM-DD' },
      validation: Rule =>
        Rule.required().custom((endDate, context) => {
          const start = (context.parent || context.document || {}).startDate
          if (!endDate || !start) return true
          return endDate < start ? 'End date cannot be before the start date' : true
        })
    },
    {
      name: 'city',
      type: 'string',
      title: 'City',
      description: 'e.g. "Baltimore"',
      validation: Rule => Rule.required()
    },
    {
      name: 'state',
      type: 'string',
      title: 'State',
      description: 'Two-letter abbreviation, e.g. "MD"',
      validation: Rule => Rule.required()
    },
    {
      name: 'tableNumber',
      type: 'string',
      title: 'Table number',
      description: 'Leave blank if you do not know it yet — the page shows "TBD" automatically.'
    },
    {
      name: 'url',
      type: 'url',
      title: 'Show website',
      description: 'Optional. When set, the show name links here.'
    }
  ],

  orderings: [
    {
      title: 'Start date, soonest first',
      name: 'startDateAsc',
      by: [{ field: 'startDate', direction: 'asc' }]
    },
    {
      title: 'Start date, newest first',
      name: 'startDateDesc',
      by: [{ field: 'startDate', direction: 'desc' }]
    }
  ],

  preview: {
    select: {
      title: 'name',
      startDate: 'startDate',
      endDate: 'endDate',
      city: 'city',
      state: 'state',
      tableNumber: 'tableNumber'
    },
    prepare ({ title, startDate, endDate, city, state, tableNumber }) {
      const where = [city, state].filter(Boolean).join(', ')
      const when = startDate === endDate ? startDate : `${startDate || '?'} → ${endDate || '?'}`
      const table = tableNumber ? `Table ${tableNumber}` : 'Table TBD'
      return {
        title: title || 'Untitled show',
        subtitle: [when, where, table].filter(Boolean).join('  ·  ')
      }
    }
  }
}
