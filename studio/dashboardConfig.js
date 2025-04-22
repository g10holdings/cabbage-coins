export default {
  widgets: [
    {
      name: 'sanity-tutorials',
      options: {
        templateRepoId: 'sanity-io/sanity-template-eleventy-blog'
      }
    },
    {name: 'structure-menu'},
    {
      name: 'project-info',
      options: {
        __experimental_before: [
          { 
            name: 'netlify',
            options: {
              description:
                'NOTE: Because these sites are static builds, they need to be re-deployed to see the changes when documents are published.',
              sites: [
                {
                  buildHookId: '6806eb500ee8a89c51bbb9d0',
                  title: 'Sanity Studio',
                  name: 'sanitystudio2',
                  apiId: '792d8212-5128-4c3f-9df4-582c73b8860e'
                },
                {
                  buildHookId: '6806e68d445f3c8169b5d7d9',
                  title: 'Blog Website',
                  name: 'cabbage-coins2',
                  apiId: 'cb6571b6-a8a7-4db5-b71c-687c4f9117db'
                }
              ]
            }
          }
        ],
        data: [
          {
            title: 'GitHub repo',
            value: 'https://github.com/g10holdings/cabbage-coins',
            category: 'Code'
          },
          {title: 'Frontend', value: 'https://cabbage-coins2.netlify.app', category: 'apps'}
        ]
      }
    },
    {name: 'project-users', layout: {height: 'auto'}},
    {
      name: 'document-list',
      options: {title: 'Recent blog posts', order: '_createdAt desc', types: ['post']},
      layout: {width: 'medium'}
    }
  ]
}