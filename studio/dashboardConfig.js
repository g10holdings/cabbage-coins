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
                  buildHookId: '621d6a0edf2ed4699c4c9b57',
                  title: 'Sanity Studio',
                  name: 'cabbage-coins-studio',
                  apiId: '767a8cb3-d0e2-4487-b026-99be758350e4'
                },
                {
                  buildHookId: '621d6a0efc88a2691c3ec9f6',
                  title: 'Blog Website',
                  name: 'cabbage-coins',
                  apiId: '7601c2c9-2348-44a0-832f-242580b1ee40'
                }
              ]
            }
          }
        ],
        data: [
          {
            title: 'GitHub repo',
            value: 'https://github.com/beatrixdrake/cabbage-coins',
            category: 'Code'
          },
          {title: 'Frontend', value: 'https://cabbage-coins.netlify.app', category: 'apps'}
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
