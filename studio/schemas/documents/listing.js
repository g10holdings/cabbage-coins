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
        name: 'denomination',
        type: 'string',
        title: 'Denomination',
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
  title: 'PCGS Catalog Number'
},
{
  // Filled by scripts/fill-pcgs-pop.js from the PCGS API (one cert lookup + one call per nearby grade).
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
  