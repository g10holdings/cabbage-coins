export default {
    name: 'listing',
    type: 'document',
    title: 'Listing',
    fields: [
      {
        name: 'name',
        type: 'string',
        title: 'Name'
      },
      {
        name: 'slug',
        type: 'slug', 
        title: 'Slug',
        description: 'Some frontends will require a slug to be set to be able to show the person',
        options: {
          source: 'name',
          maxLength: 96
        }
      },
      {
        name: 'image',
        type: 'mainImage',
        title: 'Image'
      },
      {
        name: 'imagesGallery',
        title: 'Images gallery',
        type: 'array',
        type: 'array',
        of: [
          {
            type: 'image'
          },
          {
            title: 'URL',
            name: 'urlObject',
            type: 'object',
            fields: [
              {
                title: 'URL',
                name: 'urlField',
                type: 'url'
              }
            ]
          }
        ]
       },
      {
        name: 'date',
        type: 'string',
        title: 'Date',
      },
      {
        name: 'dateshown',
        type: 'string',
        title: 'Date Shown',
      },
      {
        name: 'featured',
        type: 'boolean',
        title: "Featured"
      },
      {
          name: 'sold',
          type: 'boolean',
          title: "Sold"
      },
      {
        name: 'cac',
        type: 'boolean',
        title: "CAC"
      },
      {
        name: 'grade',
        type: 'string',
        title: 'Grade',
      },
      {
        name: 'gradenumber',
        type: 'string',
        title: 'Grade Number',
      },
      {
        name: 'price',
        type: 'number',
        title: 'Price',
      },
      {
        name: 'description',
        type: 'bodyPortableText',
        title: 'Description'
      },
      {
  name: 'gradingCompany',
  type: 'string',
  title: 'Grading Company',
  options: {
    list: [
      {title: 'PCGS', value: 'PCGS'},
      {title: 'NGC', value: 'NGC'},
      {title: 'CACG', value: 'CACG'},
      {title: 'Ungraded', value: 'Ungraded'}
    ]
  }
},
{
  name: 'pcgsCatalogNumber',
  type: 'number',
  title: 'PCGS Catalog Number',
  description: 'The plain catalog # (7199). Used for sorting by PCGS #.'
},
{
  // From the workbook's "97199/7199" (the part before the slash). The listing page shows this when set.
  name: 'pcgsDesignationNumber',
  type: 'number',
  title: 'PCGS # with designation',
  description: 'Only when the coin has a designation or variety # (97199 for a DMPL 1890-CC). Shown on the listing instead of the catalog #; sorting still uses the catalog #. Leave blank otherwise.'
},
{
  // Filled by scripts/engine/fill-pcgs-pop.js from the PCGS API (one cert lookup + one call per nearby grade).
  // The listing page shows it as a grid on unsold PCGS listings. Read-only: re-run the script to refresh.
  name: 'pcgsPop',
  type: 'object',
  title: 'PCGS Population (filled automatically)',
  description: 'Saved from the PCGS API by fill-pcgs-pop. Shown on the listing page while the coin is unsold. To refresh, re-run the script.',
  readOnly: true,
  options: {collapsible: true, collapsed: true},
  fields: [
    {name: 'asOf', type: 'date', title: 'As of'},
    {name: 'v', type: 'number', title: 'Format version'},
    {name: 'cert', type: 'string', title: 'From cert #'},
    {name: 'grade', type: 'string', title: 'PCGS grade'},
    {name: 'pcgsNumber', type: 'number', title: 'PCGS #'},
    {name: 'thisPop', type: 'number', title: 'Population at this grade'},
    {name: 'thisHigher', type: 'number', title: 'Graded higher'},
    {name: 'higherThanTop', type: 'number', title: 'Graded above the grid'},
    {name: 'maxPop', type: 'number', title: 'Largest cell'},
    {name: 'coinFactsUrl', type: 'url', title: 'PCGS CoinFacts link'},
    {
      name: 'cells',
      type: 'array',
      title: 'Grid (±2 grades, with + grades)',
      of: [{
        type: 'object',
        name: 'pcgsPopCell',
        fields: [
          {name: 'label', type: 'string'},
          {name: 'num', type: 'number'},
          {name: 'plus', type: 'boolean'},
          {name: 'pop', type: 'number'},
          {name: 'isThisGrade', type: 'boolean'}
        ],
        preview: {
          select: {label: 'label', pop: 'pop', mine: 'isThisGrade'},
          prepare: ({label, pop, mine}) => ({title: `${label}: ${pop}${mine ? '  (this coin)' : ''}`})
        }
      }]
    }
  ]
},
{
  name: 'cacPop',
  type: 'object',
  title: 'CAC Population (filled automatically)',
  description: 'Saved from the CAC API. Shown on the listing page, under the PCGS box, while the coin is unsold.',
  readOnly: true,
  options: {collapsible: true, collapsed: true},
  fields: [
    {name: 'asOf', type: 'date', title: 'As of'},
    {name: 'v', type: 'number', title: 'Format version'},
    {name: 'cert', type: 'string', title: 'From cert #'},
    {name: 'gsId', type: 'number', title: 'CAC catalog # (gsId)'},
    {name: 'grade', type: 'string', title: 'Grade'},
    {name: 'held', type: 'string', title: 'Stickered or CACG holder', options: {list: ['stickered', 'cacg']}},
    {name: 'thisStickered', type: 'number', title: 'Stickered at this grade'},
    {name: 'higherStickered', type: 'number', title: 'Stickered higher'},
    {name: 'thisGraded', type: 'number', title: 'CACG at this grade'},
    {name: 'higherGraded', type: 'number', title: 'CACG higher'},
    {
      name: 'cells',
      type: 'array',
      title: 'Grid (±2 grades)',
      of: [{
        type: 'object',
        name: 'cacPopCell',
        fields: [
          {name: 'label', type: 'string'},
          {name: 'num', type: 'number'},
          {name: 'stickered', type: 'number'},
          {name: 'graded', type: 'number'},
          {name: 'isThisGrade', type: 'boolean'}
        ],
        preview: {
          select: {label: 'label', s: 'stickered', g: 'graded', mine: 'isThisGrade'},
          prepare: ({label, s, g, mine}) => ({title: `${label}: ${s} stickered, ${g} CACG${mine ? '  (this coin)' : ''}`})
        }
      }]
    }
  ]
},
{
  name: 'category',
  type: 'string',
  title: 'Category',
  options: {
    list: [
      {title: 'Copper/Bronze', value: 'Copper/Bronze'},
      {title: 'Silver', value: 'Silver'},
      {title: 'Gold', value: 'Gold'},
      {title: 'Vintage Ingot', value: 'Vintage Ingot'},
      {title: 'Paper Currency', value: 'Paper Currency'},
      {title: 'Foreign', value: 'Foreign'},
      {title: 'Other', value: 'Other'}
    ]
  }
}
    ],
    orderings: [
      {
        name: 'publishingDateAsc',
        title: 'Publishing date new–>old',
        by: [
          {
            field: 'publishedAt',
            direction: 'asc'
          },
          {
            field: 'title',
            direction: 'asc'
          }
        ]
      },
      {
        name: 'publishingDateDesc',
        title: 'Publishing date old->new',
        by: [
          {
            field: 'publishedAt',
            direction: 'desc'
          },
          {
            field: 'title',
            direction: 'asc'
          }
        ]
      }
    ],
    preview: {
      select: {
        title: 'title',
        publishedAt: 'publishedAt',
        slug: 'slug',
        media: 'mainImage'
      },
    },
    preview: {
      select: {
        title: 'name',
        subtitle: 'slug.current',
        media: 'image',
        price: 'price',
      }
    },
    prepare ({title = 'No title', publishedAt, slug = {}, media}) {
      const dateSegment = format(publishedAt, 'YYYY/MM')
      const path = `/${dateSegment}/${slug.current}/`
      return {
        title,
        media,
        subtitle: publishedAt ? path : 'Missing publishing date'
      }
    }
  }
  