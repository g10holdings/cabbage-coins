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

### A coin sold (anywhere: eBay, the website, a show)
1. **Workbook:** Status = Sold and the **Sell Date**, as you normally do. **Save it** (step 4 reads the saved file).
2. **`4_After-Publishing-or-Selling`:** answer `y` to each part. The **website** part ticks Sold on the listing,
   copies the Sell Date into its **Sale date**, and starts a site build. Then the photo folder moves to `doneSOLD`,
   CAC takes it down, and eBay ends it (or, if it sold on eBay, just notes it).

You no longer need to tick Sold in the Studio yourself (it still works if you do). A coin ticked Sold in the
Studio that the workbook still calls Active is named on screen and left alone.

**Past sales:** a sold coin stays on Inventory (faded, SOLD tag) for **10 days after its Sell Date**, then moves to
the **Past sales** page (small link at the bottom right of Inventory). Its listing keeps the same address but shows
only the photos and the coin's details: no price, caption, "Tony says" or video. The move happens on its own on
the right day; no rebuild needed.

**Layaway:** mark it Sold with a **future** Sell Date, as you do now. The website treats it as sold from the day
step 4 first sees it (shown as "layaway"), and keeps that date when you later enter the real final-payment date.

### A coin sold at a show while it was on eBay
If you end the eBay listing yourself, mark the coin **Sold in the workbook** before the next step 4.
Step 4 never lists a coin again just because you ended it on eBay. While the coin is still for sale
on the website it shows under **"Ended on eBay by hand"** and asks *"list … again? (y/N)"*. Answer
`n` (or just Enter) and it stays off eBay.

### A coin sold on eBay
Same as above: mark it Sold in the workbook (with the Sell Date), save, and run step 4. Its eBay part lists the
coin under **"SOLD ON EBAY"**, and the website and CAC parts take care of the rest in the same run.

### Change a price
The **workbook's listPrice drives the price everywhere** (since 2026-11-14): workbook → website → CAC and eBay.
1. **Workbook:** change **listPrice** and **save**.
2. **`4_After-Publishing-or-Selling`:** the website part's **WORKBOOK CHECK** shows `PRICE CHANGE … $old -> $new`.
   Answer `y`: it sets the website price (an open Studio draft of that coin too) and rebuilds the site. The CAC and eBay
   parts in the same run then pick up the new price. eBay's price is recalculated so you still net the website price;
   see [`REFERENCE.md`](REFERENCE.md#ebay).

There's no need to change the price in the Studio. If you do change it only there, the next step 4 sets it back to
the workbook's listPrice.

### WORKBOOK CHECK lists a coin as not "Y"
The coin is live on the website, but its **Active** row in the workbook doesn't say `Y` in the Website column
(common after a buyback: the new `_2` row starts blank). Put `Y` in that row and save. Nothing on the website changes.
"No Active row in the workbook" means step 4 couldn't find the coin at all: check the cert # in the Studio against the
workbook's inventoryID (or, for an item without a cert, that the names match exactly).

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
Folders filed before October 2026 (in `doneUnsold`) have no cert # at the end. Step 4
matches those to the workbook by **year + mint + grade** (`1881S_1_P66CAC` = 1881-S MS66),
then by denomination and shared words, and shows "matched by year, mint and grade" on each.
If a folder could be two coins, one sold and one not, it stays put and is named on screen
("could be … or …"). Move that one by hand, or add the cert # to the end of its name.

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

Only PCGS coins get it. NGC and CACG have no PCGS grid.

### Add a YouTube video to a listing
**Several at once (the normal way):**
1. Save each Short in `D:\YouTube\Shorts\DJI_Recordings` named by its cert (`45673714.MP4`; no `_2`; an ingot by its workbook ID, `SF_213.MP4`), and put **R** in the workbook's **Video** column. Save the workbook.
2. In YouTube Studio, click **Create → Upload videos** and drag in all the files (up to 15 at a time). Don't rename them: the script finds each by its file name (Studio's dashes-to-spaces change is fine). They show as Private drafts. You can close the upload window once they're uploaded.
3. Run `Extras\YouTube-Shorts`. It shows each coin's title, link and tags; answer **y**. It sets the title (the description without the denomination, then " - cert"; ingots without the serial), the description (with the coin's listing link and your email), 5–6 tags, **Unlisted** and **Not made for kids**, and adds it to the **Inventory Highlights** playlist. Then it waits for YouTube to finish processing (a live timer shows it's still working), sets each video's thumbnail to its opening frame, puts the link on each listing, rebuilds the site, and moves the files into `Uploaded`.
4. In YouTube Studio, click **Edit draft → Save** on each of those videos. Studio keeps calling them "Draft" (because the upload window was closed early) until you do, even though they're already Unlisted and playing on the website; the script can't clear that label. Save keeps everything the script set.
5. Change **R** to **Y** in the Video column for the coins it lists at the end.

A coin whose video is still processing after an hour, or isn't on YouTube yet, is simply done next time. A listing that already has a video is left alone (`node youtube-shorts.js --ask --replace` replaces it).

**Just one, by hand:** in the Studio, paste the Short's link into **YouTube video** on the listing and Publish. It shows under "Tony says" after the next site build. Clear the field to remove it.

**Why you upload in YouTube Studio instead of the script:** Google locks videos uploaded through its API to Private until the app passes an audit. Changing a video's details through the API has no such lock.

### CAC population is missing or old
Step 4 fills it and refreshes anything over 30 days old; `Extras\Fill-CAC-Pop` does the same on its own. Either way the site needs a build to show it. A stickered coin needs its CAC catalog # in `engine\cac-catalog.json` (PCGS # to CAC catalog #, the PCGS # with designation if the coin has one). A coin that isn't there is listed on screen and shows no CAC box. **Don't use the GSID from the marketplace:** it's a different number and gives another coin's population.

### A coin came back into stock (`51354567_2`)
All in the workbook, nothing in the Studio: give the `_2` row its listPrice and set its Website to **Y** (or
**R**), then run step 4. The `_2` is dropped, so the row matches the coin's old listing (marked sold, in Past
Sales). Step 4 shows it under **BACK IN STOCK** and, on your yes, puts that listing back on sale: Sold unticked,
sale date cleared, price = the `_2` row's listPrice. It leaves Past Sales, and the eBay and CAC parts list it again.
While the `_2` row's Website is still blank, step 4 only names the coin and changes nothing.

### The 2020-W Palladium Eagle
A stand-in listing: you have several and show one at a time (`STAND_INS` in `engine\sold.js`).
Step 4 never marks it sold, but it does take its **price** from your other Palladium Eagle rows that are
still Active: change their listPrice in the workbook and step 4 updates the website (then eBay and CAC).
If those rows have different listPrices, or none is left Active, step 4 lists it and changes nothing.

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

### Connect (or reconnect) YouTube
`Extras\Connect-YouTube` opens Google's sign-in. Pick the Cabbage Coins channel. "Google hasn't verified this app" is expected: **Advanced → Go to Cabbage Coins Scripts**. It needs `engine\.youtube-client.json`, the Desktop-app client from Google Cloud (project "Cabbage Coins Scripts" → Google Auth Platform → Clients). Run it again if YouTube-Shorts says the sign-in failed.

### Sell a coin on eBay only (never on the website)
1. **Workbook:** set its Website column to `E` (Active, with a listPrice).
2. Shoot it as usual and run **`1_Prep-Photos`** (the folder name ends with the cert #, like any coin).
3. Double-click **`Extras\eBay-Only`**. It shows each new listing (price, category, photos) with eBay's check, then asks.
   Yes: the photos go straight to eBay, the listing goes up, and the photo folder moves to doneUnsold (camera shots deleted).

It's built like the website coins' eBay listings: the same price formula on listPrice, free shipping, no returns, offers
off, slab shots first, then close-ups, then the promo card. When several E coins share a name (the six Trump dollars),
each title ends with its cert #, so eBay doesn't treat them as duplicates.

**Later:** change listPrice and run it again to update the price. Mark a coin **Sold** in the workbook and run it again:
it ends the eBay listing (step 4 files the photos in doneSOLD). If it **sold on eBay**, it tells you to mark it Sold in
the workbook. Step 4 never touches E coins, and they never reach Sanity, the website or CAC.

### Check that everything still works by the rules
**`Extras\Check-Rules`** runs the rule checks:
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

**The YouTube thumbnail** is the last question. Answer `y`, then give:
- the big words, e.g. `PAN Show` or `Whitman Expo`;
- the second line (Enter = `Inventory Preview`);
- the date tag (Enter = this month; `-` = none).

It then lists the video's coins with the photos each one has. Pick **3 slab shots**, then **3
close-ups**; the first close-up is the big one. Enter picks the priciest. Website photos are used,
obverses only, or the prepped photos in `waiting_website` for coins not on the website yet.

You get **4 thumbnails** (1280×720 JPEG), each in a different color theme and layout; use the
one you like. Answer `y` to "Make more" for 4 more. The looks already made are remembered
(`engine\.thumbnail-history.json`), so each video gets ones not used before. There are 9 themes
and 4 layouts, and they're listed at the top of `engine\video-thumbnail.js`.

### What can be deleted
- **Camera shots:** step 4 deletes them for you when it files a published coin. OneDrive keeps deleted files in its online Recycle Bin for about 30 days.
- **Ready photo folders:** leave folders in `waiting_website` until step 4 files them.
- **Old folders:** `waiting to post` and `On Hold` belong to the old way. The tools ignore them.
