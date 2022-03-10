export default {
  name: 'siteSettings',
  type: 'document',
  title: 'Site Settings',
  __experimental_actions: ['update', /* 'create', 'delete', */ 'publish'],
  fields: [
    {
      name: 'title',
      type: 'string',
      title: 'Title'
    },
    {
      name: 'description',
      type: 'text',
      title: 'Description',
      description: 'Describe your blog for search engines and social media.'
    },
    {
      name: 'keywords',
      type: 'array',
      title: 'Keywords',
      description: 'Add keywords that describes your blog.',
      of: [{type: 'string'}],
      options: {
        layout: 'tags'
      }
    },
    {
      name: 'author',
      type: 'reference',
      description: 'Publish an author and set a reference to them here.',
      title: 'Author',
      to: [{type: 'author'}]
    },
    {
      name: 'frontpagemessage',
      type: 'text',
      description: 'Message in the top section of the homepage.',
      title: 'Front Page Message'
    },
    {
      name: 'aboutustext',
      type: 'text',
      description: 'Text for the About Cabbage Coins page',
      title: 'About Cabbage Coins Text'
    },
    {
      name: 'aboutusbio',
      type: 'text',
      description: 'Bio for the About Cabbage Coins page',
      title: 'About Cabbage Coins Bio'
    },
    {
      name: 'aboutusbioimage',
      type: 'image',
      description: 'Image for the About Us Bio',
      title: 'About Us Bio Image'
    }
  ]
}
