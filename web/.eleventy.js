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
  // monthYear("long") → "November 2026" (sale dates on archived listings).
  eleventyConfig.addFilter("monthYear", (iso, style) => {
    const d = new Date(String(iso).slice(0, 10) + "T12:00:00Z");
    return isNaN(d) ? "" : d.toLocaleDateString("en-US", { month: style || "short", year: "numeric", timeZone: "UTC" });
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

  // ---- 2026 homepage helpers ----
  // Listings still for sale, newest first. listingsNewest is oldest-first, hence the reverse.
  eleventyConfig.addFilter("inStockNewest", (list) =>
    (list || []).filter((l) => !l.sold).slice().reverse());

  // The homepage hero ROTATION: every coin Tony switched on in Studio ("Homepage hero") plus the
  // n priciest items in stock, ingots included (not the featured one). The page picks a different one on
  // each visit (see the script under the hero in index.njk), so nobody has to pick one by hand.
  eleventyConfig.addFilter("heroPool", (list, picked, featured, n) => {
    const skip = featured && featured._id;
    const ok = (l) => l && !l.sold && l._id !== skip && l.imageUrl;
    const pool = (picked || []).filter(ok);
    const auto = (list || [])
      .filter(ok)
      .sort((a, b) => (Number(b.price) || 0) - (Number(a.price) || 0));
    for (const l of auto) {
      if (pool.length >= (n || 16) + (picked || []).length) break;
      if (!pool.some((p) => p._id === l._id)) pool.push(l);
    }
    return pool;
  });

  // The next n coin shows that haven't ended, flattened out of coinshows' month groups.
  eleventyConfig.addFilter("upcomingShows", (groups, n) =>
    (groups || []).flatMap((g) => g.shows).filter((s) => !s.isPast).slice(0, n || 3));

  // The full listing record (with its markdown description) for a given _id.
  eleventyConfig.addFilter("findListing", (list, id) =>
    (list || []).find((l) => l._id === id) || null);

  // A listing's photos in page order: main image (obverse), then the gallery (reverse, holder shots).
  eleventyConfig.addFilter("listingPhotos", (l) =>
    [l && l.imageUrl].concat((l && l.galleryImageUrl) || []).filter(Boolean));

  // The list minus one listing (by _id), e.g. "more from the inventory" without the coin you're on.
  eleventyConfig.addFilter("withoutId", (list, id) => (list || []).filter((l) => l._id !== id));

  // "Keep browsing" on a listing: the n in-stock coins most like this one. Scores the series words in the
  // name (Morgan, Indian Head, Seated…), denomination ($1, 50C, $2.50), metal category, grading company,
  // CAC, and how close the price is. Ties go to the newer listing.
  const STOP = new Set(['pcgs', 'ngc', 'cacg', 'cac', 'anacs', 'icg', 'the', 'of', 'at', 'and', 'a', 'gold', 'silver',
    'usd', 'type', 'coin', 'proof', 'ms', 'pr', 'pf', 'au', 'xf', 'vf', 'bn', 'rd', 'rb', 'pl', 'dmpl', 'cam', 'dcam', 'fine']);
  const words = (name) => new Set(String(name || '').toLowerCase().replace(/[()#,]/g, ' ').split(/\s+/)
    .filter((w) => w && !/\d/.test(w) && !STOP.has(w)));
  const denom = (name) => ((String(name || '').match(/(\$\s?[\d.]+|\b\d+\s?c\b|\b\d\/\d\s?c?\b)/i) || [])[0] || '').toLowerCase().replace(/\s/g, '');
  eleventyConfig.addFilter("similarListings", (list, me, n) => {
    if (!me) return [];
    const myWords = words(me.name), myDenom = denom(me.name), myPrice = Number(me.price) || 0;
    const pool = (list || []).filter((l) => !l.sold && l._id !== me._id && l.imageUrl);
    return pool.map((l, i) => {
      const w = words(l.name);
      const shared = [...w].filter((x) => myWords.has(x)).length;
      const union = new Set([...w, ...myWords]).size || 1;
      const p = Number(l.price) || 0;
      const priceScore = myPrice && p ? 1 - Math.min(1, Math.abs(Math.log(p / myPrice)) / Math.log(4)) : 0;
      const score = 3 * (shared / union)
        + (myDenom && denom(l.name) === myDenom ? 1.5 : 0)
        + (l.category && l.category === me.category ? 1 : 0)
        + (l.gradingCompany === me.gradingCompany ? 0.3 : 0)
        + (l.cac && me.cac ? 0.3 : 0)
        + priceScore;
      return { l, score, i };
    }).sort((a, b) => b.score - a.score || b.i - a.i).slice(0, n || 6).map((x) => x.l);
  });

  // ---- Past Sales archive ----
  // A sold coin stays on /inventory/ for ARCHIVE_DAYS after its sale date (soldDate, filled from the workbook by
  // scripts/engine/site-sold.js), then shows on /past-sales/ instead, and its listing page drops the price,
  // "Tony says", pop boxes and video. The build decides with today's date in Lancaster; the pages also re-check in
  // the browser (data-archive-on), so a coin moves on the right day even when the site hasn't been rebuilt.
  const ARCHIVE_DAYS = 10;
  const todayET = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });   // "2026-11-11"
  const archiveOn = (soldDate) => {
    if (!soldDate) return "";
    const d = new Date(String(soldDate).slice(0, 10) + "T12:00:00Z");
    if (isNaN(d)) return "";
    d.setUTCDate(d.getUTCDate() + ARCHIVE_DAYS);
    return d.toISOString().slice(0, 10);
  };
  // A sold coin with no sale date yet stays on Inventory until step 4 gives it one.
  const isArchived = (l) => !!(l && l.sold && l.soldDate && archiveOn(l.soldDate) <= todayET());
  eleventyConfig.addFilter("archiveOn", (l) => (l && l.sold ? archiveOn(l.soldDate) : ""));
  eleventyConfig.addFilter("isArchived", isArchived);
  eleventyConfig.addFilter("notArchived", (list) => (list || []).filter((l) => !isArchived(l)));
  eleventyConfig.addFilter("onlyArchived", (list) => (list || []).filter(isArchived));
  // Every sold coin with a sale date, most recent sale first. /past-sales/ shows the archived ones and keeps the
  // rest hidden until their day comes.
  eleventyConfig.addFilter("pastSales", (list) => (list || [])
    .filter((l) => l.sold && l.soldDate && l.imageUrl)
    .slice().sort((a, b) => String(b.soldDate).localeCompare(String(a.soldDate))));

  // 1350 → "1,350"
  eleventyConfig.addFilter("money", (n) =>
    Number(n) ? Number(n).toLocaleString("en-US") : String(n ?? ""));


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
