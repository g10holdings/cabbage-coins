const groq = require('groq')
const client = require('../utils/sanityClient')

// Only `title` and `description` are actually read, both as fallbacks in
// _includes/layouts/base.njk. The other siteSettings fields were removed from
// the schema on 2026-08-23 because nothing rendered them.
module.exports =  async function() {
  return await client.fetch(groq`
    *[_id == "siteSettings"]{
      ...
    }[0]
  `)
}
