/**
 * Site-wide settings. Only fields that the website actually reads belong here.
 *
 * Six fields were removed on 2026-08-23 — keywords, author, frontpagemessage,
 * aboutustext, aboutusbio, aboutusbioimage. All were leftovers from the Sanity
 * eleventy-blog starter template and none were rendered anywhere: `keywords`
 * still held "sanity.io, blog, webperf, sapper, svelte", `author` pointed at
 * "My name", and `aboutusbio` claimed "since 2020" while the live site says
 * 2021 in two places. `aboutustext` was referenced in aboutus.njk but sat
 * inside an HTML comment, so it rendered nothing.
 *
 * The About page copy is deliberately still hardcoded in `web/aboutus.njk`:
 * it is formatted markup (bullet list, bold, links, two call-to-action
 * buttons) that a plain-text field cannot represent. Moving it into Studio
 * would mean Portable Text, which is a bigger change than it is worth for
 * copy that changes once a year.
 *
 * Before adding a field here, make sure something in `web/` actually reads it
 * via `metadata.<field>` — an unread field is worse than no field, because it
 * looks editable and silently is not.
 */
export default {
  name: 'siteSettings',
  type: 'document',
  title: 'Site Settings',
  __experimental_actions: ['update', /* 'create', 'delete', */ 'publish'],
  fields: [
    {
      name: 'title',
      type: 'string',
      title: 'Title',
      description: 'Fallback browser-tab title and og:title. Pages that set their own title win.'
    },
    {
      name: 'description',
      type: 'text',
      title: 'Description',
      description: 'Fallback meta description for search engines and social media.'
    }
  ]
}
