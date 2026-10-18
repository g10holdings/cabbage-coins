# Monthly coin listings — how it works

Everything you double-click is in this folder, numbered in the order you use it each
month. The **`engine`** folder holds the code, settings and saved keys that make it
work. You never need to open it (except to edit `coin-designs.js`, below).

| Double-click | What it does |
|---|---|
| *(you)* | Workbook up to date: each coin to list marked **Website = R** (ready), with its details and listPrice right. Save it. |
| *(you)* | Shoot the coins, pick the semi-finalists in Lightroom, export each coin to its own folder in `waiting_website` whose name **ends with the cert #**. |
| `1_Prep-Photos` | Names each folder from the workbook, then makes the coin's 4 website photos: crops, a window to check the coin's edge, logos, `-1` … `-4`. |
| `2_Preview-Import` | Shows the listings the import would create (Website = R coins) and whether each one's photos are ready. Writes nothing. |
| `3_Run-Import` | Creates the draft listings, puts the 4 photos on each, fills in PCGS population. |
| `4_Choose-Captions` | Suggests captions from the photos and opens the chooser. |
| *(you)* | Write the "Tony says…" description in the Studio and **Publish**. Then set the coin to **Website = Y** in the workbook. |
| `5_Preview-CAC-Marketplace` | Shows what would go to CAC's marketplace: new coins, changes, sold coins to take down. Sends nothing. |
| `6_Send-To-CAC-Marketplace` | Sends it. Run it after publishing a batch, and after marking coins **Sold**. |
| `7_Preview-eBay` | Shows what the eBay sync would do. Changes nothing. |
| `8_Send-To-eBay` | Does it. |
| `9_Check-Workbook-vs-Website` | Compares the website with the workbook: prices, sold coins, Website R/Y flags, grades. Changes nothing. |

The **`Extras`** folder has the occasional ones: `Undo-Import` (deletes the drafts the
import made), `Fill-PCGS-Pop` (finishes PCGS population another day), `Connect-eBay`, and
`Preview-Photo-Rename` / `Rename-Photos` (only for photos you made by hand in Photoshop).

---

## The workbook is the source

The tools read **`D:\OneDrive\G10 Holdings LLC\g10HoldingsLLC.xlsx`**, the **inventory**
sheet only. They **never change it**: they copy the file, read the copy, delete the copy,
and check that the original's size and save time didn't change. (Save in Excel first;
they read the last saved version.) The `listingsData` sheet and the CSV are no longer used.

How the inventory columns are read:
- **inventoryID** = the cert # (Grade Number). A `_2` / `_3` on the end is dropped.
- **itemDescription** = the listing name. The **date shown** (`1891-CC`, `328 BC`),
  **date** (`1891`, `-328`) and **grade**
  (`MS64DMPL CAC`, `PF70 UC`) are read out of it.
- **Certification** = the grading company (`N/A` → Ungraded).
- **CAC** = Y adds "CAC" to the grade (and so does a CACG holder).
- **PCGS Num** = the PCGS #. `97199/7199` means 97199 is the designation # (DMPL) and
  7199 the catalog #. The listing shows 97199; sorting by PCGS # uses 7199. A designation # written alone (e.g. `97129` on a
  DMPL coin) is noticed and flagged in the preview.
- **listPrice** = the website price.
- **Website**:
  - `R` = ready: the coin's photos and listing are to be made. An **Active** `R` coin with
    no listing yet is what the import creates.
  - `Y` = live on the website. You set this yourself once the listing is published, and
    `9_Check-Workbook-vs-Website` reminds you about any live coin still marked `R`.
  - `N/A` = never listed.
- **Category** isn't in the workbook, so it's worked out: ingots → Vintage Ingot,
  palladium/platinum → Other, gold denominations or "Gold" → Gold, cents and
  nickels → Copper/Bronze, everything else → Silver. Check it in the preview.

## Your monthly routine

**Before you start:** mark each coin you're listing **Website = R** in the inventory sheet,
check its details and listPrice, and **save** the workbook.

**Photos.** Shoot each coin, obverse shots first, then the reverse. In Lightroom, pick the
semi-finalists for exposure and export each coin to its own folder under
`D:\OneDrive\Cabbage Coins\Inventory Photos\waiting_website`. **End the folder name with
the cert #**, after a dash: `1895-O-10-Dollar-MS62-59080489`. What comes before the cert
is up to you, since the script renames the folder anyway. Keep the camera file names
(`DSC….jpg`).

**1. Prep the photos.** Double-click **`1_Prep-Photos`**.

First it **names each folder from the workbook**. It finds the cert's row and renames the
folder to the row's itemDescription plus the cert:
`1895-O-10-Dollar-Liberty-Head-Eagle-PCGS-MS62-59080489`. The 4 photos get the same name
without the cert (`1895-O-10-Dollar-Liberty-Head-Eagle-PCGS-MS62-1.jpg` …), so the file
names always match the listing title. That matters for search engines, and a typo can't
reach the website.

Before renaming, it compares your folder name with the row:
- **A different year, mint mark or grade** means the cert # is probably mistyped. That
  folder is **left alone** and listed at the end. Fix the cert # and run it again.
- **A series word the workbook doesn't have** (say "Morgan" on a Peace dollar) is just
  corrected, and named in a note.
- **A folder with no cert # at the end**, or whose coin is Sold in the workbook, is skipped
  with a message.

Then, for each coin, it:
1. **Splits obverse from reverse** by the DSC numbers (the jump between the two runs).
2. **Turns and crops** each raw shot: stands the slab upright and crops to its edges plus
   20 px. Obverse shots get the label on top. Reverse shots get the coin on top for US coins
   (coin turn), and the label on top for world coins, which are medal turn: Reales, Pesos,
   Crowns, Thalers and so on, recognized from the workbook name. Shots you already cropped by
   hand (portrait) are left as they are.
3. **Picks the best exposure** of each side (the least blown-out coin) and guesses the
   coin's true edge.
4. **Opens a check window** for each side. Blue circle = the coin's edge. If it's right, press
   **Enter**. If not:
   - **Click 3 points** on the true edge. Right-click undoes a point.
   - **Arrow keys** move the circle; **+ / −** or the mouse wheel resize it (hold Shift for
     bigger steps).
   - **T** turns the shot 180° if the slab or coin is upside down.
   - **PgUp / PgDn** switches to another shot of the same side.
   - **[ / ]** makes the coin smaller or bigger inside the mask.
   - **Esc** stops for now. Finished coins are kept.
5. **Writes** `<Name>-1.jpg` (obverse slab), `-2` (obverse close-up), `-3` (reverse slab),
   `-4` (reverse close-up), all 1044 × 1044. The camera shots move into an `originals`
   subfolder, and your choices are saved there in `photo-prep.txt`.

**Nothing is brightened, sharpened or color-corrected.** The only changes are turning,
cropping, resizing, the black mask and the logos. Close-ups get the Cabbage Coins logo at 80%
bottom-left, plus the CAC oval bottom-right when the workbook grade has CAC (CACG holders too, as on the site). On most coins
the coin sits 10 px inside the 900 px mask, so the edge shows. **Small coins** (half dimes,
gold dollars, three-cent pieces) are capped at 50 px per mm, so the insert shows around them
instead of the coin being over-magnified.

The coin's size comes from the workbook name (`H10C`, `$10`, `G$1`, `Peace`…; the table is
`Get-CoinMM` in `engine\Prep-Photos.ps1`). If the name doesn't say, the window asks you to
click 3 points.

Coins that already have all 4 photos are skipped. To check one again, run from `engine`:
`powershell -File Prep-Photos.ps1 -Redo -Only 1895-O`. It starts from your saved choices.

**2. Preview the import.** Double-click **`2_Preview-Import`**.
It prints every coin it would create, with what it worked out (grade, dates,
denomination, PCGS #, category, alt text), and writes **nothing** to Sanity.
At the end, **Photos** lists each coin and its folder:
- **✓** means the 4 photos are ready.
- **·** means the folder isn't found or the photos aren't made yet. That's expected for
  ingots and other one-offs: add their photos in the Studio yourself.

Read the ⚠ warnings: they name anything it couldn't work out. If something is wrong, fix
the row in the workbook (or tell Claude, if a rule is wrong), save, and preview again.

**3. Import.** Double-click **`3_Run-Import`**.
It creates the drafts in Sanity (with alt text), puts each coin's 4 photos on its draft,
then fills in PCGS population. The photos go in the same slots as on every listing: the
obverse close-up is the main image, then the reverse close-up, obverse slab and reverse
slab. Safe to run again:
- Coins that already exist are skipped.
- A draft that's still missing photos gets them once they're made.
- A draft that already has photos is never touched, and neither is a published listing.

**4. Captions.** Double-click **`4_Choose-Captions`**. For every draft that has all 4
photos and no caption, Claude looks at the photos (slab label and CAC sticker
included) and suggests captions. A page then opens in your browser:

- Pick one of the three suggestions, or type your own in the fourth box.
- Press **⚑** on any suggestion you'd never publish.
- Press **Save to Studio**. Your picks go into each draft's **Caption** field.
  Nothing is published, and a draft that already has a caption is never overwritten.

You can skip coins. They'll be waiting next time, and their suggestions are kept, so
you aren't charged twice. Expect about 10 cents per coin.

The suggester learns from you. What you flag, pick and write is saved in
`engine\caption-feedback.json` and shapes the next batch. Its built-in rules:

- **Colors:** broad words only (gray, gold, brown, white, silver, black).
- **Numbers:** population figures only from the PCGS data. No mintages or prices.
- **No repeats:** nothing that starts like, or reuses a phrase from, a caption already
  on the site or waiting in a draft.

A **"Check:"** note under a suggestion means it states a fact you should confirm first.
A **"Label check"** warning means the slab label disagrees with the listing's data.

**Finish in the Studio:**
1. Click **Generate** on the slug.
2. Write the "Tony says…" description.
3. Check the alt text and caption.
4. **Publish**.
5. Set the coin to **Website = Y** in the workbook.

To run the Studio on this computer:
```
cd "C:\Users\Tony Gryckiewicz\cabbage-coins\studio"
npm run dev
```
→ http://localhost:3333

**5–8. Marketplaces.** After publishing, run `5_Preview-CAC-Marketplace` and then
`6_Send-To-CAC-Marketplace`, then `7_Preview-eBay` and then `8_Send-To-eBay`. Details are below.

**9. Check.** `9_Check-Workbook-vs-Website` any time. It changes nothing.

---

## What gets filled in automatically

| From the workbook (inventory) | Sanity field |
|---|---|
| itemDescription | Name |
| itemDescription (year) | Date (plain year; `-328` for 328 BC) |
| itemDescription (first word) | Date Shown (with mint mark — the "Issue" line on the site) |
| itemDescription + CAC | Grade |
| inventoryID (without `_2`) | Grade Number |
| listPrice | Price |
| Certification | Grading Company (`N/A` → `Ungraded`) |
| PCGS Num, the part after `/` (or the only number) | PCGS Catalog Number (sorting) |
| PCGS Num, the part before `/` | PCGS # with designation (shown on the listing) |
| *(worked out)* | Category |

(A CSV with the old column headers still works: `node import-listings.js "D:\path\to\file.csv"`.)

Also automatic:
- **CAC** checkbox — ticked when the Grade contains "CAC".
- **Alternative Text** — looked up from the coin's series in `engine\coin-designs.js`.

### About the alt text

A coin's artwork is fixed by its **series**, not its date — every Barber dime looks
the same whether it's 1892 or 1916. So the tool looks the design up in a table
(`coin-designs.js`) rather than guessing at it. That table is exact.

The lookup reads the coin's **name, denomination and year** together, so the wording of
the name doesn't matter: "Peace Dollar", "Peace Silver Dollar", "Seated Liberty",
"Liberty Seated" and plain "Seated" all work. The denomination column can say `1`,
`2.5`, `$1` or `50C`. The year is a check too: a coin named "Capped Bust" but dated
1857 (that design ended in 1837) is left blank with a warning, because the name and
date disagree. Fix the name in that case.

If a coin's series isn't in the table yet, the alt text is **left blank on purpose**
and the tool **prints a warning naming that coin**. Nothing guesses: a wrong reverse
design would read as authoritative to someone using a screen reader, and blank is
honest. Write those few by hand in the Studio.

To fix one for good, add a line to `engine\coin-designs.js` (instructions are at the
top of the file) — then that coin and every future one in the same series fills
itself in.

The preview tells you the split, e.g. `Alternative Text: 18/18 from the known-design
table.` When that number is the full count, every coin got its text and there's
nothing to write by hand.

---

## If you make a mistake

Imported a batch, then noticed an error in the workbook?

1. Double-click **`Extras\Undo-Import`** — it lists the drafts it made for the
   Website = R coins and asks you to confirm before removing them.
2. Fix the rows in the workbook, save, then double-click **`3_Run-Import`** again.

Safety: undo only removes **drafts**. Anything you've already **published is never
touched**. (One catch: undo finds a draft by its name, so do the undo *before* fixing
a coin's itemDescription — or remove that one draft by hand in the Studio.)

---

## Good to know

- **Where the secrets live:** `engine\.env` holds your Sanity, PCGS and Anthropic keys.
  It persists, so you don't re-enter them. This file is kept out of git.
- **Cost:** the import and the photo rename are free. Only step 5 (captions) uses a
  paid service, about 10 cents per coin from your Anthropic credits. The import itself
  has no AI in it: alt text comes from the lookup table.
- **A CSV instead of the workbook:** `node import-listings.js "D:\path\to\file.csv"`
  (old column headers). Handy for re-running an archived batch.
- **The workbook moved?** Put `WORKBOOK_PATH=D:\new\path\file.xlsx` in `engine\.env`.

### Command-line equivalents (if you prefer typing)

From the `engine` folder:
```
npm run import -- --dry-run     # preview (same as 2_Preview-Import)
npm run import                  # import (same as 3_Run-Import)
node import-listings.js --delete            # delete drafts (asks to confirm)
node import-listings.js --limit 3 --dry-run # preview just the first 3 rows
node choose-captions.js --fresh             # throw away saved caption suggestions and ask again
```

---

## PCGS population on listings

Unsold **PCGS** listings show a small **PCGS Population** grid on their page: the
coin's grade ±2 steps, with the **+** grades, the coin's own cell highlighted, and a
line like *"This coin is 1 of 9 graded MS64 by PCGS, with 18 graded higher."* NGC and
CACG listings don't get one, and it disappears when a coin is marked **Sold**.

The numbers come from the PCGS API and are saved on the listing (read-only field
**PCGS Population** in the Studio), so visitors never cause PCGS calls.

- **`3_Run-Import`** fills it in for the new listings right after creating them.
- **`Extras\Fill-PCGS-Pop`** fills in whatever is still missing. PCGS allows
  **100 calls a day** for your account (shared with The Cabbage Patch), and each coin
  takes about **6 calls**, so a big batch takes a few days: when it hits the limit it
  stops and says so — double-click it again the next day and it carries on. Answers
  are saved in `engine\.pcgs-cache.json`, so stopping part-way wastes nothing.
- **Refreshing** stale numbers (every few months): open a terminal in `scripts\engine`
  and run `node fill-pcgs-pop.js --refresh-days 120`.
- `node fill-pcgs-pop.js --dry-run` lists what it would do without any calls or writes.

Needs `PCGS_API_TOKEN` in `engine\.env` (the same token The Cabbage Patch uses). The
**Grade Number** must be the PCGS cert number; anything else is skipped with a warning.

**PCGS's license** (PCGS API End User Agreement) allows this "in support of specific
sales you offer" and requires on each page: a link to PCGS (CoinFacts), the PCGS logo,
and their credit line in at least 10-point type. The listing page shows all three —
don't remove them.

---

## CAC marketplace

Your coins are also listed on **CAC's marketplace**, and each one links back to its page on
cabbagecoins.com. CAC takes PCGS, NGC and CACG coins, so every graded, unsold coin goes up.
Ungraded items, like the ingot, are left out.

**When to run it:** after you **publish** a batch, and after you mark coins **Sold**. Run
`5_Preview-CAC-Marketplace` first, then `6_Send-To-CAC-Marketplace`. Running it more often
does no harm.

**What one send does.** It sends CAC the whole list in a single call. A coin it sent
before is updated, never duplicated, because each coin carries its own fixed ID.

- **+ new:** coins CAC doesn't have yet. They get added.
- **~ changed:** a coin whose price, photos, title or grade changed since the last send.
  It gets updated, and the preview names what changed.
- **− take down:** a coin that was sent before but has since been marked **Sold**, or deleted
  from the Studio. It goes to CAC with quantity 0, which removes it.

**How it knows what's on CAC:** each send is remembered in Sanity (a hidden record named
`cac-marketplace-ledger`). Even a deleted listing can still be taken down, and this works
from any computer.

**If CAC doesn't confirm a take-down**, the send ends with a ⚠ list of those coins. They'll
be tried again on every send. Meanwhile, delete them by hand on CAC's site: CAC's dealer
page has a delete button for uploaded items.

**Safety catch:** if one send would take down more than 10 coins, it stops and asks you to
run `node cac-marketplace.js --send --allow-mass-removal` from `engine`. A glitch that
made the inventory look empty can't wipe your marketplace listings.

CAC allows 1,000 calls a day, and one send uses one call. It needs `CAC_API_KEY` and
`CAC_API_TOKEN` in `engine\.env`. CAC's full reply to the last send is saved in
`engine\cac-marketplace-last-response.json`.

---

## eBay (cabbage_coins store)

| Double-click | What it does |
|---|---|
| `7_Preview-eBay` | Shows what the sync would do: new listings (eBay checks each one, nothing is posted), price/shipping updates, coins to end, coins that sold on eBay. Changes nothing. |
| `8_Send-To-eBay` | Does it. Run it after publishing coins, changing prices, or marking coins **Sold**. |

Every unsold website coin goes on eBay. eBay follows the website (Sanity), not the workbook.

- **Price:** worked out so you net the website price after eBay's fees (9% up to $4,000, 2.35% above, $0.40 an order, figured on price + 8% sales tax, since eBay charges its fee on the tax too) **plus** the shipping cost, because shipping is free to the buyer.
- **Shipping** (by website price): under $1,000 USPS Ground Advantage ($6); $1,000–$4,999 USPS Priority ($20); $5,000+ FedEx 2Day ($40). Insurance included.
- **Always:** Buy It Now, Good 'Til Cancelled, no returns (final sale), your promo card as the last photo, and the description = the title + your standard paragraph.
- **Category:** chosen automatically (bullion and commemoratives by rule; everything else must sit under its denomination, e.g. Dollars > Morgan). The preview shows each one.

Per coin, in the Studio:
- **Keep off eBay**: tick it to keep a coin off eBay (and end its listing).
- **Accept offers on eBay**: tick it to turn on Best Offer.
- **eBay price (fixed)**: fill it in to use your own eBay price instead of the formula.
- **eBay category #**: only to correct a category.

When a coin **sells on eBay**, the preview lists it under "SOLD ON EBAY": mark it Sold on the website. When you mark a coin **Sold** on the website, the next send ends its eBay listing.
