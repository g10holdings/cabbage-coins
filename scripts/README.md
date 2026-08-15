# Monthly coin listing import — how it works

This folder holds a small tool that takes a CSV of coins and creates **draft**
listings in Sanity for you — filling in all the data fields and writing the image
**Alternative Text** automatically. The drafts show up unpublished in the
Studio, where you add photos, generate the slug, write the caption/description,
and publish.

You run this about once a month. Setup is already done (your tokens are saved,
the tools are installed), so each month is just three steps.

---

## Your monthly routine

**1. Update the CSV.** Export this month's coins from Excel over this file:

`D:\OneDrive\G10 Holdings LLC\listings-to-import.csv`

The name is deliberately generic — it's always "the batch I'm importing right now",
whatever the month or the count. Keep the name as-is and the tools just work; if you
want a dated record of a batch, *Save As* a copy alongside it (e.g.
`archive\18Listings_03Aug26.csv`) — the tool ignores anything but the file above.

Keep the **same column headers** — spelling matters, order doesn't. If a header is
renamed, misspelled, or deleted, the tool now **stops before writing anything** and
tells you which column is wrong. (Without that check a renamed header imported
silently, leaving that field blank on all your listings.)

Two rules that matter:
- **`date`** = the plain year (e.g. `1900`).
- **`date shown`** = the year *with* the mint mark (e.g. `1900-S`). This is the one
  that shows on the website as "Issue".

Save it (as CSV).

**2. Preview.** Double-click **`preview-import.cmd`**.
It prints every coin with its alt text and writes **nothing** to Sanity.
Read it over — pay attention to any ⚠ warnings at the bottom. If something looks
off, fix the CSV and preview again.

**3. Import.** Double-click **`run-import.cmd`**.
It creates the drafts in Sanity (with alt text). The window stays open so you can
see the results. Safe to run twice — coins that already exist are skipped.

Then open the Studio to finish each listing:
```
cd "C:\Users\Tony Gryckiewicz\cabbage-coins\studio"
npm run dev
```
→ http://localhost:3333 → add photos, click **Generate** on the slug, write the
caption + description, check the alt text, then **Publish**.

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
- **Alternative Text** — looked up from the coin's series in `coin-designs.js`.

### About the alt text

A coin's artwork is fixed by its **series**, not its date — every Barber dime looks
the same whether it's 1892 or 1916. So the tool looks the design up in a table
(`coin-designs.js`) rather than guessing at it. That table is exact.

If a coin's series isn't in the table yet, the alt text is **left blank on purpose**
and the tool **prints a warning naming that coin**. Nothing guesses: a wrong reverse
design would read as authoritative to someone using a screen reader, and blank is
honest. Write those few by hand in the Studio.

To fix one for good, add a line to `coin-designs.js` (instructions are at the top of
the file) — then that coin and every future one in the same series fills itself in.

The preview tells you the split, e.g. `Alternative Text: 18/18 from the known-design
table.` When that number is the full count, every coin got its text and there's
nothing to write by hand.

Left blank for you to do in the Studio: **photos, slug, caption, description**.

---

## If you make a mistake

Imported a batch, then noticed a CSV error?

1. Double-click **`delete-import.cmd`** — it lists the drafts matching the current
   CSV and asks you to confirm before removing them.
2. Fix the CSV, then double-click **`run-import.cmd`** again.

Safety: delete only removes **drafts**. Anything you've already **published is never
touched**. (One catch: if you fixed a typo in a coin's *name*, delete won't recognize
the old draft — remove that one by hand in the Studio.)

---

## Good to know

- **Where the secrets live:** `scripts\.env` holds your Sanity token. It persists, so
  you don't re-enter it. This file is kept out of git.
- **Cost: nothing.** The tool only talks to Sanity. There is no AI service behind it
  and no per-run charge.
- **A different CSV:** the default path above is only a default — you can point the
  tool at any file: `node import-listings.js "D:\path\to\file.csv"`. Handy for
  re-running an archived batch.

### Command-line equivalents (if you prefer typing)

From this folder:
```
npm run import -- --dry-run     # preview (same as preview-import.cmd)
npm run import                  # import (same as run-import.cmd)
node import-listings.js --delete            # delete drafts (asks to confirm)
node import-listings.js --limit 3 --dry-run # preview just the first 3 rows
```
