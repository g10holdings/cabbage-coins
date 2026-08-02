# Monthly coin listing import — how it works

This folder holds a small tool that takes a CSV of coins and creates **draft**
listings in Sanity for you — filling in all the data fields and writing the image
**Alternative Text** automatically with AI. The drafts show up unpublished in the
Studio, where you add photos, generate the slug, write the caption/description,
and publish.

You run this about once a month. Setup is already done (your tokens are saved,
the tools are installed), so each month is just three steps.

---

## Your monthly routine

**1. Update the CSV.** Open it in Excel and replace it with this month's coins:

`D:\OneDrive\G10 Holdings LLC\35Listings_22Jul26.csv`

Keep the **same column headers**. Two rules that matter:
- **`date`** = the plain year (e.g. `1900`).
- **`date shown`** = the year *with* the mint mark (e.g. `1900-S`). This is the one
  that shows on the website as "Issue".

Save it (as CSV).

**2. Preview.** Double-click **`preview-import.cmd`**.
It prints every coin with its AI-written alt text and writes **nothing** to Sanity.
Read it over. If something looks off, fix the CSV and preview again.

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
- **Alternative Text** — written by AI from the coin's name.

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

- **Where the secrets live:** `scripts\.env` holds your Sanity token and Anthropic
  API key. They persist, so you don't re-enter them. This file is kept out of git.
- **Cost:** the AI alt text costs a few cents per batch (Anthropic API). If you ever
  want to skip it, double-click nothing — instead run `run-import.cmd`'s command with
  `--no-alt` (see below).
- **A different CSV:** drag the CSV onto a terminal, or run
  `node import-listings.js "D:\path\to\file.csv"`.

### Command-line equivalents (if you prefer typing)

From this folder:
```
npm run import -- --dry-run     # preview (same as preview-import.cmd)
npm run import                  # import (same as run-import.cmd)
node import-listings.js --delete            # delete drafts (asks to confirm)
node import-listings.js --no-alt            # import without AI alt text
node import-listings.js --limit 3 --dry-run # preview just the first 3 rows
```
