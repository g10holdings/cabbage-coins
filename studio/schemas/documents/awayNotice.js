import { MdFlightTakeoff } from 'react-icons/md'

/**
 * The away / vacation pop-up on the homepage and inventory page.
 *
 * One document only (id "awayNotice"), opened from "Away Message" in the
 * Studio sidebar. Read by `web/_data/awaynotice.js`; the markup is in
 * `web/_includes/awaynotice.njk`.
 *
 * The site is a static build, so publishing here does nothing until the
 * website is redeployed. The dates are checked in the visitor's browser,
 * though, so it is safe to switch it on weeks early and deploy once: it
 * appears on the first day away and disappears after the last day by itself.
 * Switching it off early (before the last day) needs a redeploy.
 *
 * The smaller bits of copy (eyebrow, sign-off, button labels) stay as
 * defaults in the data file. Add a field here only if something reads it.
 */
export default {
  name: 'awayNotice',
  type: 'document',
  title: 'Away Message',
  icon: MdFlightTakeoff,
  __experimental_actions: ['update', /* 'create', 'delete', */ 'publish'],
  fields: [
    {
      name: 'enabled',
      type: 'boolean',
      title: 'Show the away message',
      description:
        'Turn on, set the dates, Publish, then deploy the website (Dashboard → "Blog Website"). ' +
        'It only appears between the two dates, so you can switch it on early.'
    },
    {
      name: 'firstDay',
      type: 'date',
      title: 'First day away',
      description: 'The message starts showing on this day.',
      options: { dateFormat: 'YYYY-MM-DD' },
      validation: Rule =>
        Rule.custom((value, context) =>
          (context.document || {}).enabled && !value ? 'Needed when the away message is on' : true
        )
    },
    {
      name: 'lastDay',
      type: 'date',
      title: 'Last day away',
      description: 'The message stops showing after this day. Shipping resumes the next day.',
      options: { dateFormat: 'YYYY-MM-DD' },
      validation: Rule =>
        Rule.custom((value, context) => {
          const doc = context.document || {}
          if (doc.enabled && !value) return 'Needed when the away message is on'
          if (value && doc.firstDay && value < doc.firstDay) return 'Cannot be before the first day away'
          return true
        })
    },
    {
      name: 'heading',
      type: 'string',
      title: 'Heading'
    },
    {
      name: 'body',
      type: 'text',
      rows: 4,
      title: 'Message',
      description:
        'Type [back] where the day you return should appear. It is filled in automatically ' +
        '(the day after your last day away, e.g. "September 25th, 2026").'
    }
  ],

  preview: {
    select: { enabled: 'enabled', firstDay: 'firstDay', lastDay: 'lastDay' },
    prepare ({ enabled, firstDay, lastDay }) {
      return {
        title: 'Away Message',
        subtitle: enabled ? `ON  ·  ${firstDay || '?'} → ${lastDay || '?'}` : 'Off'
      }
    }
  }
}
