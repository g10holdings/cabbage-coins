# Cabbage Coins monthly listings: start here

Everything you double-click is in this folder, numbered in the order you use it. The
**`engine`** folder holds the code, settings and keys; you never need to open it.

| Read | For |
|---|---|
| **This page** | The monthly steps, on one page. |
| [`HOW-TO.md`](HOW-TO.md) | "How do I…": taking a coin off eBay, redoing photos, a coin that sold on eBay, undoing an import, and more. |
| [`REFERENCE.md`](REFERENCE.md) | How everything works: workbook rules, photos, CAC, eBay, PCGS, settings, safety. |

All three are also one shareable page, the **Cabbage Coins Playbook**:
https://claude.ai/artifact/2vwWo2HwdsRFDkm3qKaz1M (private until you share it from the page's
Share menu). It's built from these files by `engine\docs-page.js`, so when the docs change,
ask Claude to rebuild and republish it.

**Two promises the tools keep:**
- **They never write to your workbook.** They read a copy and check that the original didn't change. A rule check (`Extras\Check-Rules`) fails if any script ever contains code that could write a spreadsheet.
- **Anything that changes the website, CAC, eBay or your photo folders shows you what it will do first, and asks.** Answer `y` to go ahead; anything else changes nothing.

---

## The monthly steps

**Before you start: the workbook.** Make sure each coin you're listing is right in the
inventory sheet (description, grade, cert #, PCGS #, listPrice), mark it **Website = R**
(ready), and **save**.

**Photos.** Shoot each coin, obverse shots first, then the reverse. In Lightroom, pick the
semi-finalists for exposure and export each coin to its own folder in
`D:\OneDrive\Cabbage Coins\Inventory Photos\waiting_website`. **End the folder name with
the cert #**, e.g. `1895-O-10-Dollar-MS62-59080489`. The rest of the name can be anything.

| Step | Double-click | What happens |
|---|---|---|
| 1 | `1_Prep-Photos` | Renames each folder from the workbook (and stops if the name and cert disagree), crops and turns the camera shots, opens a window to check each coin's edge, and writes the 4 website photos `-1` to `-4`. |
| 2 | `2_Import-Listings` | Shows the new listings (Website = R coins) and whether each one's photos are ready, then asks. Yes: it creates the drafts, puts the 4 photos on each, and fills in PCGS population. |
| 3 | `3_Choose-Captions` | Suggests captions from the photos; you pick or write your own in the browser. |
| *you* | *the Studio* | Write the "Tony says…" description, click **Generate** on the slug, check alt text and caption, **Publish**. Then set the coin to **Website = Y** in the workbook. |
| 4 | `4_After-Publishing-or-Selling` | Marks coins Sold in the workbook as sold on the website (with their Sell Date) and rebuilds the site, files the published coins' photo folders (camera shots deleted, 4 photos to `doneUnsold`; sold coins to `doneSOLD`), then CAC and eBay. Each part shows what it would do and asks. |
| 5 | `5_Status-Report` | Any time: one page showing where every coin stands and its next step, plus the workbook check. Changes nothing. |
| 6 | `6_Check-Deals` | Any time, e.g. after a show: the **dealID** check. Lists rows with no dealID (and the number to type), deal numbers that look mistyped, deals that don't balance (unpaid, layaway, or something not entered yet), and the next free `D-YYMMDD-NN` for today. Changes nothing. |

**Deal numbers** (in the dealID column of sales, purchases, inflows and outflows): the Zoho number when the deal has
an invoice or PO (`INV-000123`, `PO-000045`); `EB-YYMMDD` for an eBay payout and the sales it covers; otherwise
`D-YYMMDD-NN`, the deal's date plus 01, 02… for that day. Every row of one deal (coins sold, coins taken in, money in,
money out) gets the same number. Expenses and transfers stay blank.

**Also run step 4** whenever you mark a coin **Sold**, change a price, or tick **Keep off
eBay** in the Studio. It takes sold coins down from CAC and eBay and files their photos.

**`Extras` folder:** `Redo-Photos`, `Undo-Import`, `Fill-PCGS-Pop`, `Fill-CAC-Pop`, `Check-Rules`,
`Connect-eBay`, `eBay-Only` (coins marked Website = E go straight to eBay, never the website or CAC),
`Make-Video-Graphics` (name banners and the thumbnail for YouTube videos), `YouTube-Shorts` (finishes the
Shorts you dragged into YouTube Studio and puts them on their listings), `Connect-YouTube`, and the old
hand-photo rename tools. See [`HOW-TO.md`](HOW-TO.md) for
when to use each.

**Running the Studio on this computer:**
```
cd "C:\Users\Tony Gryckiewicz\cabbage-coins\studio"
npm run dev
```
→ http://localhost:3333

**Costs:** everything is free except captions (about 10 cents a coin from your Anthropic
credits). PCGS allows 100 lookups a day; a big batch's population may finish the next day
(`Extras\Fill-PCGS-Pop`).
