# Monthly coin listings — how it works

Everything you double-click is in this folder, numbered in the order you use it each
month. The **`engine`** folder holds the code, settings and saved keys that make it
work. You never need to open it (except to edit `coin-designs.js`, below).

| Double-click | What it does |
|---|---|
| `1_Preview-Import` | Shows what the CSV import would create. Writes nothing. |
| `2_Run-Import` | Creates the draft listings in Sanity, then fills in PCGS population. |
| `3_Preview-Photo-Rename` | Shows how the photos in "waiting to post" would be renamed. Changes nothing. |
| `4_Rename-Photos` | Renames them to `<Folder>-1.jpg`, `-2` … |
| *(you)* | Upload the photos to the drafts in the Studio. |
| `5_Choose-Captions` | Suggests captions from the photos and opens the chooser. |
| *(you)* | Finish each draft in the Studio and **Publish**. |

The **`Extras`** folder has the occasional ones: `Undo-Import` (deletes the drafts from
the current CSV) and `Fill-PCGS-Pop` (finishes PCGS population another day).

---

## Your monthly routine

**Before step 1: update the CSV.** Export this month's coins from Excel over this file:

`D:\OneDrive\G10 Holdings LLC\listings-to-import.csv`

The name is deliberately generic — it's always "the batch I'm importing right now",
whatever the month or the count. Keep the name as-is and the tools just work; if you
want a dated record of a batch, *Save As* a copy alongside it (e.g.
`archive\18Listings_03Aug26.csv`) — the tool ignores anything but the file above.

Keep the **same column headers** — spelling matters, order doesn't. If a header is
renamed, misspelled, or deleted, the tool **stops before writing anything** and
tells you which column is wrong.

Two rules that matter:
- **`date`** = the plain year (e.g. `1900`).
- **`date shown`** = the year *with* the mint mark (e.g. `1900-S`). This is the one
  that shows on the website as "Issue".

**1. Preview the import.** Double-click **`1_Preview-Import`**.
It prints every coin with its alt text and writes **nothing** to Sanity.
Read it over — pay attention to any ⚠ warnings at the bottom. If something looks
off, fix the CSV and preview again.

**2. Import.** Double-click **`2_Run-Import`**.
It creates the drafts in Sanity (with alt text), then fills in PCGS population. Safe
to run twice — coins that already exist are skipped.

**3 and 4. Rename the photos.** Put each coin's photos in its own folder under
`D:\OneDrive\Cabbage Coins\Inventory Photos\waiting_website\waiting to post`.
Double-click **`3_Preview-Photo-Rename`** to check, then **`4_Rename-Photos`**. Each
folder's photos become `<FolderName>-1.jpg`, `-2` … in their current name order.
Folders already renamed are skipped.

**Upload the photos** to each draft in the Studio.

**5. Captions.** Double-click **`5_Choose-Captions`**. For every draft that has all 4
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

**Finish in the Studio:** click **Generate** on the slug, write the description, check
the alt text and caption, then **Publish**. To run the Studio on this computer:
```
cd "C:\Users\Tony Gryckiewicz\cabbage-coins\studio"
npm run dev
```
→ http://localhost:3333

---

## What gets filled in automatically

| From the CSV | Sanity field |
|---|---|
| name | Name |
| date | Date (plain year) |
| date shown | Date Shown (with mint mark — the "Issue" line on the site) |
| denomination | Denomination |
| Grade | Grade |
| grade number | Grade Number |
| Price | Price |
| Grading Company | Grading Company (blank / `N/A` → `Ungraded`) |
| PCGS Catalog Number | PCGS Catalog Number |
| Category | Category |

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

Imported a batch, then noticed a CSV error?

1. Double-click **`Extras\Undo-Import`** — it lists the drafts matching the current
   CSV and asks you to confirm before removing them.
2. Fix the CSV, then double-click **`2_Run-Import`** again.

Safety: undo only removes **drafts**. Anything you've already **published is never
touched**. (One catch: if you fixed a typo in a coin's *name*, undo won't recognize
the old draft — remove that one by hand in the Studio.)

---

## Good to know

- **Where the secrets live:** `engine\.env` holds your Sanity, PCGS and Anthropic keys.
  It persists, so you don't re-enter them. This file is kept out of git.
- **Cost:** the import and the photo rename are free. Only step 5 (captions) uses a
  paid service, about 10 cents per coin from your Anthropic credits. The import itself
  has no AI in it: alt text comes from the lookup table.
- **A different CSV:** the default path above is only a default — you can point the
  tool at any file: `node import-listings.js "D:\path\to\file.csv"`. Handy for
  re-running an archived batch.

### Command-line equivalents (if you prefer typing)

From the `engine` folder:
```
npm run import -- --dry-run     # preview (same as 1_Preview-Import)
npm run import                  # import (same as 2_Run-Import)
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

- **`2_Run-Import`** fills it in for the new listings right after creating them.
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
