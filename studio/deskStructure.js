import S from '@sanity/desk-tool/structure-builder'
import { MdSettings } from "react-icons/md";
import { MdPerson } from "react-icons/md";
import { MdEvent } from "react-icons/md";
import { MdFlightTakeoff } from "react-icons/md";
import { MdArchive } from "react-icons/md";

const hiddenDocTypes = listItem =>
  !['category', 'author', 'post', 'siteSettings', 'coinShow', 'awayNotice', 'listing'].includes(listItem.getId())

export default () =>
  S.list()
    .title('Content')
    .items([
      S.listItem()
        .title('Settings')
        .icon(MdSettings)
        .child(
          S.editor()
            .id('siteSettings')
            .schemaType('siteSettings')
            .documentId('siteSettings')
        ),
      S.listItem()
        .title('Away Message')
        .icon(MdFlightTakeoff)
        .child(
          S.editor()
            .id('awayNotice')
            .schemaType('awayNotice')
            .documentId('awayNotice')
        ),
      S.listItem()
        .title('Coin Shows')
        .icon(MdEvent)
        .schemaType('coinShow')
        .child(
          S.documentTypeList('coinShow')
            .title('Coin Shows')
            .defaultOrdering([{ field: 'startDate', direction: 'asc' }])
        ),
      S.listItem()
        .title('Blog posts')
        .schemaType('post')
        .child(S.documentTypeList('post').title('Blog posts')),
      S.listItem()
        .title('Authors')
        .icon(MdPerson)
        .schemaType('author')
        .child(S.documentTypeList('author').title('Authors')),
      S.listItem()
        .title('Categories')
        .schemaType('category')
        .child(S.documentTypeList('category').title('Categories')),
      // Listings split in two: coins for sale, and sold coins in their own Past Sales folder.
      // Checking "Sold" moves a coin to Past Sales; unchecking it (a buyback) moves it back.
      // `sold != true`, not `!sold`: a listing whose Sold box was never touched has no sold field at all.
      S.listItem()
        .title('Listings')
        .schemaType('listing')
        .child(
          S.documentList()
            .id('listingsForSale')
            .title('Listings (for sale)')
            .schemaType('listing')
            .filter('_type == "listing" && sold != true')
            .defaultOrdering([{ field: '_createdAt', direction: 'desc' }])
        ),
      S.listItem()
        .title('Past Sales')
        .icon(MdArchive)
        .schemaType('listing')
        .child(
          S.documentList()
            .id('listingsPastSales')
            .title('Past Sales (newest sale first)')
            .schemaType('listing')
            .filter('_type == "listing" && sold == true')
            .defaultOrdering([{ field: 'soldDate', direction: 'desc' }])
        ),
      // This returns an array of all the document types
      // defined in schema.js. We filter out those that we have
      // defined the structure above
      ...S.documentTypeListItems().filter(hiddenDocTypes)
    ])
