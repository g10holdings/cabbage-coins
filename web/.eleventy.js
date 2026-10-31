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

  // "51354567_2" → "51354567": Tony adds _2, _3 to a Grade Number when a coin he sold comes back, to keep his
  // spreadsheet rows unique. Customers see the real cert number.
  eleventyConfig.addFilter("certNumber", (n) => String(n ?? "").trim().replace(/_\d+$/, ""));

  // "https://youtube.com/shorts/bb1NfTabfZ8" → "bb1NfTabfZ8" (also watch?v= and youtu.be links); "" if it isn't one.
  eleventyConfig.addFilter("youtubeId", (url) => {
    const m = /(?:youtube\.com\/(?:shorts\/|embed\/|watch\?(?:.*&)?v=)|youtu\.be\/)([\w-]{11})/.exec(String(url ?? ""));
    return m ? m[1] : "";
  });

  // "2026-10-10" → "Oct 2026" (the PCGS population "as of" date on listings).
  eleventyConfig.addFilter("monthYear", (iso) => {
    const d = new Date(String(iso).slice(0, 10) + "T12:00:00Z");
    return isNaN(d) ? "" : d.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
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

  eleventyConfig.addCollection("listingsNewest", (collection) => {
    const allItems = collection.getAll()[0].data.listings_newest;
  
    // Filter or use another method to select the items you want
    // for the collection
    return allItems
  });

  eleventyConfig.addCollection("listingsByCatalog", (collection) => {
  const allItems = collection.getAll()[0].data.listings_catalog;
  return allItems
});

  eleventyConfig.addCollection("listingsNotsold", (collection) => {
    const allItems = collection.getAll()[0].data.listings_notsold;
  
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
