# How do I…

Situations beyond the monthly steps in [`README.md`](README.md). When in doubt, run
**`5_Status-Report`**: it shows every coin's next step and changes nothing.

**Contents**
- [Selling and pricing](#selling-and-pricing): a coin sold on the site; a coin sold on eBay; a price change; taking a coin off the website without selling it
- [eBay and CAC](#ebay-and-cac): keeping a coin off eBay; offers, a fixed eBay price, a category; running only CAC or only eBay; CAC "too many requests"
- [Photos](#photos): redoing a coin's photos; a folder skipped; ingots and one-offs; folders without a cert #; an Explorer warning
- [Listings and the workbook](#listings-and-the-workbook): undoing an import; blank alt text; missing or old PCGS population; a coin back in stock; the stand-in palladium listing
- [Setup and housekeeping](#setup-and-housekeeping): a moved workbook or photo folder; a new computer or keys; checking the rules; what's safe to delete

---

## Selling and pricing

### A coin sold (on the website, at a show, anywhere but eBay)
1. **Studio:** tick **Sold** on the listing and Publish.
2. **Workbook:** update the row as you normally do (Status = Sold). The scripts only read it.
3. **`4_After-Publishing-or-Selling`:** answer `y` to each part. It moves the coin's photo folder to `doneSOLD`, takes it off CAC, and ends it on eBay.

### A coin sold on eBay
Step 4's eBay part lists it under **"SOLD ON EBAY: mark these sold on the website"**.
1. **Studio:** tick **Sold** and Publish. **Workbook:** Status = Sold.
2. Run **`4_After-Publishing-or-Selling`** again: CAC takes it down and the photos move to `doneSOLD`.

### Change a price
1. **Studio:** change **Price** and Publish. The website, CAC and eBay all follow the Studio.
2. **Workbook:** change **listPrice** too, so the two agree. `5_Status-Report` flags any coin whose prices differ.
3. **`4_After-Publishing-or-Selling`:** CAC and eBay pick up the new price. eBay's price is recalculated so you still net the website price; see [`REFERENCE.md`](REFERENCE.md#ebay).

### Take a coin off the website without selling it
1. **Studio:** unpublish the listing (or delete it).
2. **`4_After-Publishing-or-Selling`:** CAC takes it down and eBay ends it ("no longer on the website").
3. **Workbook:** set Website back to `R` (to list again later) or `N/A`.

---

## eBay and CAC

### Keep a coin off eBay (but on the website)
In the Studio, tick **Keep off eBay** and Publish, then run `4_After-Publishing-or-Selling`.
Its eBay part ends the listing. Untick it later and step 4 lists the coin again.

### Offers, a fixed eBay price, or a category fix
In the Studio, on the listing:
- **Accept offers on eBay**: turns on Best Offer.
- **eBay price (fixed)**: your own eBay price instead of the formula.
- **eBay category #**: only to correct a category the preview got wrong.

Publish, then run `4_After-Publishing-or-Selling`.

### Run only CAC, or only eBay
Run `4_After-Publishing-or-Selling` and answer `n` to the parts you don't want. Each part
asks separately, and a "no" changes nothing for that part.

### CAC says "too many requests"
CAC allows one marketplace upload per short period. Nothing changed on our side. Wait a
while, run step 4 again, and answer `y` only to CAC.

---

## Photos

### Redo a coin's photos (different exposure, edge, coin size, turn)
Double-click **`Extras\Redo-Photos`** and type part of the coin's folder name, or its cert #.
The check window opens where you left off:
- **PgDn**: switch to your other exposure.
- **Click 3 points / arrows**: fix the edge.
- **[ / ]**: change the coin's size.
- **T**: turn the shot 180°.

**Enter** rewrites the 4 photos. It keeps asking for another coin; press Enter on an empty line to finish.

- **If the draft already has photos**, the import won't replace them, since it never overwrites photos. Swap them in the Studio, or ask Claude to replace them.
- **Once a coin is published and filed by step 4**, its camera shots are deleted. A redo then means a new shoot.

### A folder was skipped ("Is cert … right?")
`1_Prep-Photos` compares your folder name with the cert's workbook row. A different
**year, mint mark or grade** usually means the cert # is mistyped, so the folder is left
alone. Fix the cert # at the end of the folder name (or the workbook row, if that's what's
wrong) and run step 1 again. A wrong **series word** (Morgan on a Peace dollar) doesn't
stop it; the folder is just renamed from the workbook.

### Ingots and other one-offs
Mark them **R** like any coin. With no photo folder they still get a draft. Upload your own
photos in the Studio, then run `3_Choose-Captions` (it covers drafts with 4 photos) or
write the caption yourself.

### Older photo folders without a cert #
Folders filed before October 2026 (in `doneUnsold` / `doneSOLD`) have no cert # at the
end, so step 4 can't match them to listings. It leaves them alone. Move those by hand
when a coin sells, or add the cert # to the end of their names so step 4 can take over.

### "The photo paths are over 240 characters"
Windows Explorer struggles past 260 characters. The names come from the workbook's
description, so shorten that description (it's also the listing title), then run step 1 again.

---

## Listings and the workbook

### Undo an import (a mistake in the workbook)
1. Double-click **`Extras\Undo-Import`**. It lists the drafts it made for Website = R coins and asks before deleting. Published listings are never touched.
2. Fix the rows in the workbook, save, and run `2_Import-Listings` again.

Do the undo **before** changing a coin's description; undo finds drafts by their name.

### Alt text is blank
The import fills alt text only from the design table (`engine\coin-designs.js`), never by
guessing. Write it in the Studio, or add the series to `coin-designs.js` (instructions at
its top) so every future coin of that series fills in itself.

### PCGS population is missing or old
- **Missing** (a big batch hit PCGS's 100-a-day limit): `Extras\Fill-PCGS-Pop`, again the next day if needed.
- **Refresh every few months:** in `scripts\engine`, run `node fill-pcgs-pop.js --refresh-days 120`.

Only PCGS coins get it. NGC and CACG have no population grid.

### A coin came back into stock (`51354567_2`)
Nothing special to do: the `_2` is dropped, so it matches its cert. Mark it **R** to list it again.

### The 2020-W Palladium Eagle
A stand-in listing: you have several and show one at a time. The workbook check skips it
on purpose (`IGNORE` in `engine\status-report.js`).

---

## Setup and housekeeping

### The workbook or the photo folders moved
Edit **`engine\settings.json`**: every script reads its paths from there (forward
slashes). `photos.inProgress`, `listed` and `sold` are `waiting_website`, `doneUnsold`
and `doneSOLD`.

### A new computer, or new keys
1. Install Node.js, copy the `cabbage-coins` folder (or clone it), and run `npm install` in `scripts\engine`.
2. Recreate **`engine\.env`**, which isn't in git, with: `SANITY_WRITE_TOKEN`, `PCGS_API_TOKEN`, `ANTHROPIC_API_KEY`, `CAC_API_KEY`, `CAC_API_TOKEN`, `EBAY_APP_ID`, `EBAY_CERT_ID`, `EBAY_RUNAME`, `EBAY_REFRESH_TOKEN`.
3. For eBay, double-click **`Extras\Connect-eBay`**. It walks you through signing in and saves the token.

### Check that everything still works by the rules
**`Extras\Check-Rules`** runs 16 checks:
- the workbook rules against every live listing;
- that nothing can write the workbook;
- photo naming, the folder checks, the importer, the status report's next steps, and the photo rules.

All should say **pass**. Run it after any change to the scripts.

### Make name banners for a YouTube video
**`Extras\Make-Video-Graphics`** lists every coin for sale on the website (newest first), then the
Website = R coins that aren't up yet. Type the numbers of the coins in the video, in the order they
appear, e.g. `12 3 7-9`. You get one 3840×2160 (4K) transparent PNG per coin, with the banner in the top
left, in `D:\OneDrive\Cabbage Coins\Video Graphics\<today>`. Drop each one on the timeline above the
footage.

The name is shortened from the listing name, and long names shrink to fit. To word one yourself, add
it to `engine\video-titles.json` by cert (or by the full listing name for an item with no cert):
`"2625432-001": { "title": "1796 Draped Bust Dollar" }`. A `subtitle` (the grade line) and `price`
can be set the same way.

### What can be deleted
- **Camera shots:** step 4 deletes them for you when it files a published coin. OneDrive keeps deleted files in its online Recycle Bin for about 30 days.
- **Ready photo folders:** leave folders in `waiting_website` until step 4 files them.
- **Old folders:** `waiting to post` and `On Hold` belong to the old way. The tools ignore them.
