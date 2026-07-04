const { DateTime } = require("luxon");

// Evaluated on every Eleventy build. `lastUpdated` reflects the date the
// site was last built/deployed (Eastern time), which is a good proxy for
// when inventory was last refreshed.
module.exports = function () {
  return {
    lastUpdated: DateTime.now().setZone("America/New_York").toFormat("MM/dd/yyyy"),
  };
};
