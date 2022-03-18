const { DateTime } = require("luxon");
const util = require('util')
const CleanCSS = require("clean-css");
const eleventyNavigationPlugin = require("@11ty/eleventy-navigation");

module.exports = function(eleventyConfig) {

  eleventyConfig.addPlugin(eleventyNavigationPlugin)
  
  eleventyConfig.addPassthroughCopy('assets')

  // https://www.11ty.io/docs/quicktips/inline-css/
  eleventyConfig.addFilter("cssmin", function(code) {
    return new CleanCSS({}).minify(code).styles;
  });

  eleventyConfig.addFilter("debug", function(value) {
    return util.inspect(value, {compact: false})
   });

   eleventyConfig.addFilter("readableDate", dateObj => {
    return new Date(dateObj).toDateString()
  }); 

  // https://html.spec.whatwg.org/multipage/common-microsyntaxes.html#valid-date-string
  eleventyConfig.addFilter('htmlDateString', (dateObj) => {
    return DateTime.fromJSDate(dateObj, {zone: 'utc'}).toFormat('yyyy-LL-dd');
  });

  eleventyConfig.addCollection("listingsByPrice", (collection) => {
    const allItems = collection.getAll()[0].data.listings_price;
  
    // Filter or use another method to select the items you want
    // for the collection
    return allItems
  });

  eleventyConfig.addCollection("listingsByDate", (collection) => {
    const allItems = collection.getAll()[0].data.listings_date;
    // Filter or use another method to select the items you want
    // for the collection
    return allItems
  });

  eleventyConfig.addCollection("listingsByName", (collection) => {
    const allItems = collection.getAll()[0].data.listings_alpha;
    // Filter or use another method to select the items you want
    // for the collection
    return allItems
  });

  eleventyConfig.addCollection("listingsNewest", (collection) => {
    const allItems = collection.getAll()[0].data.listings_newest;
  
    // Filter or use another method to select the items you want
    // for the collection
    return allItems
  });

  const slugify = require("slugify");
  eleventyConfig.addFilter("slug", (input) => {
    const options = {
      replacement: "-",
      remove: /[&,+()$~%.'":*?<>{}]/g,
      lower: true
    };
    var inputNoPeriods = input.replace(".","-")
    var slugInput = slugify(inputNoPeriods, options);
    var finalSlug = slugInput.replace("dollar", "usd");
    return finalSlug;
  });

  let markdownIt = require("markdown-it");
  let markdownItAnchor = require("markdown-it-anchor");
  let options = {
    html: true,
    breaks: true,
    linkify: true
  };
  let opts = {
    permalink: true,
    permalinkClass: "direct-link",
    permalinkSymbol: "#"
  };

  eleventyConfig.setLibrary("md", markdownIt(options)
    .use(markdownItAnchor, opts)
  );

  eleventyConfig.addFilter("markdownify", function(value) {
    const md = new markdownIt(options)
    return md.render(value)
  })


  return {
    templateFormats: [
      "md",
      "njk",
      "html",
      "liquid"
    ],

    // If your site lives in a different subdirectory, change this.
    // Leading or trailing slashes are all normalized away, so don’t worry about it.
    // If you don’t have a subdirectory, use "" or "/" (they do the same thing)
    // This is only used for URLs (it does not affect your file structure)
    pathPrefix: "/",

    markdownTemplateEngine: "liquid",
    htmlTemplateEngine: "njk",
    dataTemplateEngine: "njk",
    passthroughFileCopy: true,
    dir: {
      input: ".",
      includes: "_includes",
      data: "_data",
      output: "_site"
    }
  };
}
