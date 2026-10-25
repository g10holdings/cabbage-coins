# Reference: how it all works

The monthly steps are in [`README.md`](README.md); situations are in [`HOW-TO.md`](HOW-TO.md).
This page explains the rules behind them.

**Contents:** [The flow](#the-flow) · [Safety](#safety) · [The workbook](#the-workbook) ·
[Photos](#photos) · [Listings](#listings) · [Captions](#captions) ·
[PCGS population](#pcgs-population) · [CAC marketplace](#cac-marketplace) · [eBay](#ebay) ·
[Status report](#status-report) · [Settings and files](#settings-and-files)

---

## The flow

```
Workbook: Website = R
   │
   ▼
Lightroom export → waiting_website\<anything>-<cert #>\DSC….jpg
   │
   ▼ 1_Prep-Photos
<description>-<cert #>\<description>-1..4.jpg   (camera shots in originals\)
   │
   ▼ 2_Import-Listings
Sanity draft + 4 photos + PCGS population
   │
   ▼ 3_Choose-Captions
caption
   │
   ▼ you, in the Studio
"Tony says…" description, Publish; then Website = Y in the workbook
   │
   ▼ 4_After-Publishing-or-Selling
photos → doneUnsold (camera shots deleted); CAC; eBay
   │
   ▼ later: Sold, then step 4 again
photos → doneSOLD; off CAC; off eBay
```

## Safety

- **The workbook is never written.** `engine\workbook.js` copies it to a temp file, reads the copy, deletes the copy, and checks that the original's size and save time didn't change. If Excel or OneDrive saves it mid-read, the read stops and says to run again. The rule checks fail if any script contains spreadsheet-writing code, or touches the workbook's path outside `workbook.js`.
- **Every change asks first.** The import, photo filing, CAC and eBay each show a preview and then ask "(y/N)". Anything but `y` changes nothing.
- **Published listings are never touched** by the import or Undo-Import; only drafts.
- **Safety catches:** when CAC or eBay would take down more than 10 coins in one run, step 4 warns ("more than usual, are they all sold?") and the y/N covers it. Run by hand with `--send`, they refuse instead, unless you add `--allow-mass-removal`. CAC also refuses an empty feed, which would wipe the marketplace. eBay never lists a coin again after you ended it there by hand unless you say yes (`--relist` with `--send`).
- **Sold** means Sold in the workbook **or** the Studio's Sold box (`engine\sold.js`), for all three parts of step 4. The Palladium stand-in is the exception.
- **Deleting:** the only automatic deletion is a published coin's camera shots (`originals\`), when step 4 files its folder, after you say yes. Anything else in a folder moves with it and is named on screen.

## The workbook

`D:\OneDrive\G10 Holdings LLC\g10HoldingsLLC.xlsx`, **inventory** sheet only. Save in
Excel first; the tools read the last saved version.

| Column | How it's read |
|---|---|
| inventoryID | The cert # (the listing's Grade Number). A trailing `_2`/`_3` (back in stock) is dropped; `SF_535` stays whole. |
| itemDescription | The listing name. Date shown (`1891-CC`, `328 BC`), date (`1891`, `-328`), grade (`MS64DMPL CAC`, `PF70 UC`, `SP70`) and denomination are read out of it. |
| Certification | Grading company: PCGS / NGC / CACG; `CAC` means CACG; `N/A` means Ungraded. |
| CAC | `Y` adds "CAC" to the grade. A CACG holder counts as CAC too, as on the site. |
| PCGS Num | `97199/7199` = designation # (shown on the listing, used for DMPL/CAM populations) / catalog # (sorting). A lone 8xxxx/9xxxx on a CAM/PL coin is taken as a designation #, and the preview warns. |
| listPrice | The website price. |
| Website | `R` = ready: the import takes Active R coins with no listing. `Y` = live, set by you once published. `N/A` = never. |
| Status | Active or Sold. |

**Category** isn't in the workbook, so it's worked out:
- ingots → Vintage Ingot;
- palladium/platinum → Other;
- gold denominations or "Gold" → Gold;
- cents, half cents and nickels → Copper/Bronze;
- everything else → Silver.

These rules reproduce all 86 live listings as of 2026-10-18. The rule checks hold them to that.

## Photos

**Folder names.** End the folder name with the cert #. `1_Prep-Photos` looks up that
cert's row and renames the folder to `<description>-<cert #>`. The 4 photos are named
`<description>-1.jpg` to `-4.jpg`, without the cert, so the image names match the listing
title, which helps search engines. Example:
`1934-D-1-Dollar-Peace-Silver-Dollar-PCGS-MS65-CAC-Toned-37425568\1934-D-1-Dollar-Peace-Silver-Dollar-PCGS-MS65-CAC-Toned-1.jpg`.

**Name check.** Before renaming, step 1 compares what you typed with the row:
- a different year, mint mark or grade → that folder is skipped (likely a mistyped cert);
- a series word the row lacks (e.g. Morgan on a Peace dollar) → just corrected, with a note;
- a folder with no cert # at the end, or whose coin is Sold in the workbook → skipped with a message.

**The 4 photos** (1044 × 1044 JPEG):

| File | Photo | On the listing |
|---|---|---|
| `-1` | obverse slab | gallery 2 |
| `-2` | obverse close-up | **main image** |
| `-3` | reverse slab | gallery 3 |
| `-4` | reverse close-up | gallery 1 |

**No post-processing, ever.** No brightening, sharpening or color work. The only changes:
- turning (exact 90°/180°);
- cropping;
- resizing;
- the black mask;
- the logos.

**How step 1 makes them:**
1. **Obverse vs. reverse:** obverse shots are taken first, so the camera's DSC numbers form two runs; it splits at the biggest jump.
2. **Turning and cropping:** a raw frame (landscape) is turned so the slab stands upright: obverse with the label on top; reverse with the coin on top for US coins (coin turn), or the label on top for world coins (medal turn, recognized by words like Reales, Peso, Crown, Thaler). It's then cropped to the slab's edges plus 20 px. Shots you already cropped by hand (portrait) are used as they are. **T** in the window turns a shot 180°, redone from the raw file.
3. **Best exposure:** the shot with the least blown-out coin (any channel ≥ 250), then the brighter one. **PgUp/PgDn** picks another.
4. **The coin's edge:** a guess from the coin's known size (66.3 camera px per mm, from the denomination; table `Get-CoinMM` in `engine\Prep-Photos.ps1`). It's reliable on gold and less so on silver and proofs, which is why the window exists: click 3 points on the true edge, or nudge with the arrows and + / −. The guess only looks within 5% of the table's size, so a coin the
   table gets wrong (a new kind of coin) comes up with no sensible circle: click its edge, and add it to `Get-CoinMM`.
5. **Close-up:** a 900 px round mask, black outside. Most coins sit 10 px inside the mask so the edge and reeding show. **Small coins** are capped at 50 px per mm (half dime ≈ 775 px, gold dollar ≈ 750 px), so the insert shows around them instead of over-magnifying; **[ / ]** adjusts. Logos: `CabbageCoins_Main_White.png` at 80% bottom-left; the CAC oval bottom-right on CAC coins (CACG included).
6. **Slab shot:** the whole cropped photo fit to the canvas height, on black.
7. **Saving:** the 4 photos are written; the camera shots move to `originals\`; your choices (shot, turn, circle, size) are saved in `originals\photo-prep.txt`, so `Extras\Redo-Photos` starts from them.

**Filing (step 4).** Matched by the cert # at the end of the folder name:
- **Published listing** with its photos on it → the folder moves to `doneUnsold`; `originals\` and any loose camera shots are deleted.
- **Sold** (workbook or Studio) → moves to `doneSOLD`, from either place.
- **Drafts** stay put.
- **Older `doneUnsold` folders with no cert #** are matched to workbook rows by year + mint + grade number, with denomination and shared words to break ties. Rows whose listing was deleted still count. If the candidates disagree (some sold, some not) and none fits best, the folder stays and is named on screen. A tie that includes a coin still for sale on the site stays quietly.

## Listings

`2_Import-Listings` creates a draft for each Active **R** coin with no listing (by cert #,
or by name for items without one).

| From the workbook | Sanity field |
|---|---|
| itemDescription | Name |
| (year) | Date (`-328` for 328 BC) |
| (first word) | Date Shown (with mint mark: the "Issue" line) |
| itemDescription + CAC | Grade; the **CAC** box is ticked when the grade has CAC |
| inventoryID | Grade Number |
| listPrice | Price |
| Certification | Grading Company |
| PCGS Num | PCGS Catalog Number (sorting) and PCGS # with designation (shown) |
| (worked out) | Category |
| series → `coin-designs.js` | Alternative Text, from the table only; blank (with a warning) if the series isn't there |

Then it puts the 4 photos on every draft that has none, found by cert #; a draft whose
photos aren't made yet gets them on a later run. Then PCGS population. The slug, caption
and description are left for you (caption: step 3).

## Captions

`3_Choose-Captions` covers drafts with all 4 photos and no caption. Claude looks at the
photos (slab label and CAC sticker too) and suggests options; you pick one or write your
own in the browser, and **Save to Studio** fills empty captions only. Built-in rules:
- six words at most;
- color praised without naming a hue;
- no die varieties unless they're on the label;
- population figures only from PCGS data;
- nothing that starts like, or repeats a phrase from, another caption on the site.

Your picks and ⚑ flags are saved in `engine\caption-feedback.json` and steer the next
batch. It costs about 10 cents a coin. `node choose-captions.js --fresh` asks again from scratch.

## PCGS population

Unsold PCGS listings show a population grid: the grade ±2 steps, + grades included, the
coin's cell highlighted, and a line like "1 of 9 graded MS64 by PCGS, with 18 graded
higher". NGC/CACG coins don't get one, and it disappears when a coin sells.
- **When it's filled:** step 2 fills it right after creating drafts. `Extras\Fill-PCGS-Pop` fills whatever is missing; `--refresh-days 120` refreshes old numbers.
- **The daily limit:** 100 PCGS calls a day, shared with The Cabbage Patch, at about 6 a coin. A run stops at the limit and carries on the next day; answers are cached in `engine\.pcgs-cache.json`.
- **Which PCGS # it uses:** the designation # for DMPL/PL/CAM and similar, and the plain catalog # for die varieties.
- **PCGS's license** requires a CoinFacts link, the PCGS logo and their credit line on the page. Don't remove them.

## CAC marketplace

Every unsold, published PCGS/NGC/CACG coin with a PCGS #, price, slug and photo goes to
CAC's marketplace, linking back to its page. Ungraded items (ingots) are left out.
- **One send = the whole list.** Coins already there are updated, never duplicated, since each carries its listing ID.
- **Taking a coin down:** a coin is taken down by being **left out** of the list. CAC rejects quantity 0, and leaving it out removes it.
- **Photos:** the slab shots go first, then the close-ups (4 photos).
- **The record of what's on CAC** is kept in Sanity (`cac-marketplace-ledger`), so even a deleted listing can be taken down.
- **Unconfirmed take-downs:** if CAC doesn't confirm one, the run says so; delete it by hand on CAC's dealer page.
- **Limits:** CAC allows one upload per short period ("too many requests" means wait). Its last reply is saved in `engine\cac-marketplace-last-response.json`.

## eBay

Every unsold website coin goes on eBay (the cabbage_coins store) unless **Keep off eBay**
is ticked. eBay follows the Studio, not the workbook.

**Price:** worked out so you net the website price after eBay's fees, **plus** shipping,
since shipping is free to the buyer. The fees:
- 9% up to $4,000, then 2.35% above that;
- $0.40 an order;
- charged on the price + 8% sales tax, since eBay takes its fee on the tax too.

A price in the Studio's **eBay price (fixed)** field overrides the formula.

**Shipping** (by website price, insurance included):

| Website price | Service | Package (fills in eBay's label form) |
|---|---|---|
| under $1,000 | USPS Ground Advantage ($6) | 4 oz, 9×6×1 |
| $1,000–$4,999 | USPS Priority ($20) | 6 oz, 9×6×1 |
| $5,000+ | FedEx 2Day ($40) | 8 oz, 13×11×2 |

Ingots are the exception: the sync never touches their package, so set it by hand on eBay.

**Always the same on every listing:**
- Buy It Now, Good 'Til Cancelled;
- no returns (final sale);
- slab photos first, your promo card last;
- the description is the title plus your standard paragraph.

**Category:** chosen automatically under the coin's denomination, or by rule for bullion
and commemoratives. **eBay category #** in the Studio corrects it.

**Coins sold on eBay** are listed under "SOLD ON EBAY" for you to mark Sold on the website.
The record of what's on eBay is in Sanity (`ebay-ledger`). Listings that already sold or
ended on eBay are cleared from it on the next run.

**Ended on eBay by hand** while the coin is still for sale on the website: it is listed under
"Ended on eBay by hand" and NOT listed again unless you answer `y` to "list … again?". Once the
coin is Sold in the workbook, its record is just cleared.

## Status report

`5_Status-Report` opens a page in your browser. It changes nothing anywhere. It shows:
- **In progress** (R coins and drafts): photo folder, listing, photos on it, caption, description, PCGS population, and the next step.
- **Live coins with something to do:** Website still R, waiting for CAC or eBay, photos not filed, unpublished edits, missing population. Everything else is in a collapsed "all in order" list.
- **Sold coins with loose ends:** still on CAC/eBay, or photos not in `doneSOLD`.
- **Workbook mismatches:** for sale on the site but sold in the workbook; live but the Website column isn't Y/R; Y with no listing; price, grade, grading company, date or PCGS # differences. Names worded differently are listed as FYI.

CAC and eBay are shown as of each one's last send (their records in Sanity), not by asking
CAC or eBay.

## Settings and files

**`engine\settings.json`**: where everything lives (the workbook, `waiting_website`,
`doneUnsold`, `doneSOLD`, the logos, the Sanity project). Change a path there and every
script follows. **`engine\.env`**: keys and tokens, not in git.

| In `engine` | Does |
|---|---|
| `Prep-Photos.ps1`, `CoinPhoto.cs`, `CoinReview.cs` | Step 1: photo prep, the image work, the check window |
| `photo-folders.js` | Step 1's first part: folder names from the workbook |
| `import-listings.js`, `listing-photos.js` | Step 2: drafts and their photos |
| `fill-pcgs-pop.js`, `pcgs-pop.js` | PCGS population |
| `choose-captions.js` / `.html` | Step 3 |
| `file-photos.js`, `cac-marketplace.js`, `ebay-sync.js` | Step 4 |
| `sold.js` | What counts as sold (workbook or Studio), shared by step 4 and the status report |
| `status-report.js` | Step 5 |
| `workbook.js` | Reads the workbook (read-only) and its column rules |
| `coin-designs.js` | The alt-text design table |
| `photo-order.js` | Slab-shots-first ordering for CAC/eBay |
| `settings.js`, `ask.js` | Shared settings and the y/N question |
| `connect-ebay.js` | One-time eBay sign-in (`Extras\Connect-eBay`) |
| `Rename-Photos.ps1` | The old hand-photo renamer (`Extras`) |
| `test\` | The rule checks (`Extras\Check-Rules`, or `npm test`) |
| `docs-page.js` | Builds the shareable Playbook page from README, HOW-TO and REFERENCE |
| `video-graphics.js`, `video-titles.json` | 4K name banners for YouTube videos (`Extras\Make-Video-Graphics`), and your own wording for them |
| `video-thumbnail.js` | The video's YouTube thumbnails: color themes, layouts, and which looks were used last |
| `clean-sitesettings.js`, `seed-coinshows.js` | One-off maintenance scripts |
