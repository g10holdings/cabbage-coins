/**
 * Builds the shareable "Cabbage Coins Playbook" page from the three docs in scripts\ (README.md, HOW-TO.md,
 * REFERENCE.md), so the page never drifts from them. Writes .docs-page.html next to this file; Claude publishes it
 * to the same link whenever the docs change.
 *
 *   node docs-page.js
 */

import fs from 'node:fs';
import path from 'node:path';
import { marked } from 'marked';
import { ENGINE } from './settings.js';

const DOCS = path.join(ENGINE, '..');
const OUT = path.join(ENGINE, '.docs-page.html');
const PARTS = [
  { file: 'README.md', id: 'start', label: 'Monthly steps' },
  { file: 'HOW-TO.md', id: 'howto', label: 'How do I…' },
  { file: 'REFERENCE.md', id: 'ref', label: 'Reference' },
];
const PREFIX = Object.fromEntries(PARTS.map((p) => [p.file, p.id]));

// GitHub-style heading anchors, so the links written in the .md files work here too.
const slug = (s) => s.toLowerCase().replace(/<[^>]+>/g, '').replace(/&[a-z]+;/g, '').replace(/[^\p{L}\p{N}\s-]/gu, '').trim().replace(/\s/g, '-');

function render(part) {
  const md = fs.readFileSync(path.join(DOCS, part.file), 'utf8').replace(/\r\n/g, '\n');
  const renderer = new marked.Renderer();
  renderer.heading = (text, level) => {
    if (level === 1) return '';   // the part's own title comes from the page
    return `<h${level} id="${part.id}-${slug(text)}">${text}</h${level}>\n`;
  };
  renderer.link = (href, title, text) => {
    let h = href ?? '';
    const m = /^([A-Z-]+\.md)?(#.*)?$/.exec(h);
    if (m && (m[1] || m[2])) {
      const doc = m[1] ? PREFIX[m[1]] : part.id;
      h = m[2] ? `#${doc}-${m[2].slice(1)}` : `#${doc}`;
    }
    const ext = /^https?:/.test(h) ? ' target="_blank" rel="noopener"' : '';
    return `<a href="${h}"${title ? ` title="${title}"` : ''}${ext}>${text}</a>`;
  };
  renderer.table = (header, body) => `<div class="scroll"><table><thead>${header}</thead><tbody>${body}</tbody></table></div>\n`;
  renderer.code = (code) => `<div class="scroll"><pre><code>${code.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</code></pre></div>\n`;
  const title = (/^# (.+)$/m.exec(md) ?? [])[1] ?? part.label;
  return { ...part, title, html: marked.parse(md, { renderer, gfm: true }) };
}

const parts = PARTS.map(render);
const updated = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

const page = `<title>Cabbage Coins Playbook</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bitter:wght@500;700&family=Source+Sans+3:ital,wght@0,400;0,600;1,400&family=JetBrains+Mono:wght@400;600&display=swap">
<style>
/* Layout: a reading column with a sticky part switcher; three parts in order, tables and code scroll in place. */
:root {
  --paper: #f6f8f5; --ink: #1c2420; --muted: #5d6b63; --rule: #d6ded8; --panel: #ebf0ec;
  --leaf: #2f6b47; --brass: #9a6b12; --code: #e3eae5;
  --display: "Bitter", Georgia, "Times New Roman", serif;
  --body: "Source Sans 3", "Segoe UI", system-ui, sans-serif;
  --mono: "JetBrains Mono", Consolas, "Courier New", monospace;
}
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {
  --paper: #141a17; --ink: #e4ebe6; --muted: #9aaba1; --rule: #2c3631; --panel: #1b2420;
  --leaf: #79c095; --brass: #d8a64a; --code: #222c27; color-scheme: dark } }
:root[data-theme="dark"] {
  --paper: #141a17; --ink: #e4ebe6; --muted: #9aaba1; --rule: #2c3631; --panel: #1b2420;
  --leaf: #79c095; --brass: #d8a64a; --code: #222c27; color-scheme: dark }
html { scroll-padding-top: calc(64px + env(safe-area-inset-top, 0px)) }
body { background: var(--paper); color: var(--ink); font: 17px/1.6 var(--body); }
body::before { content: ""; position: fixed; inset: 0 0 auto; height: env(safe-area-inset-top, 0px); z-index: 10; background: var(--paper) }
.wrap { max-width: 860px; margin: 0 auto; padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); }
header.top { padding-block: 40px 20px; border-bottom: 1px solid var(--rule) }
.eyebrow { font: 600 12px/1 var(--body); letter-spacing: .14em; text-transform: uppercase; color: var(--brass) }
h1 { font: 700 clamp(30px, 6vw, 44px)/1.1 var(--display); margin: 10px 0 8px; text-wrap: balance }
.lede { color: var(--muted); margin: 0; max-width: 60ch }
nav.parts { position: sticky; top: env(safe-area-inset-top, 0px); z-index: 5; background: var(--paper); border-bottom: 1px solid var(--rule) }
nav.parts .wrap { display: flex; gap: 6px; flex-wrap: wrap; padding-block: 10px }
nav.parts a { font: 600 15px/1 var(--body); color: var(--ink); text-decoration: none; padding: 9px 14px; border-radius: 999px; border: 1px solid var(--rule) }
nav.parts a:hover, nav.parts a:focus-visible { border-color: var(--leaf); color: var(--leaf); outline: none }
section.part { padding-block: 36px 24px; border-bottom: 1px solid var(--rule) }
section.part > .wrap > h2.part-title { font: 700 30px/1.15 var(--display); margin: 0 0 18px; color: var(--leaf); text-wrap: balance }
h2 { font: 700 24px/1.2 var(--display); margin: 40px 0 10px; text-wrap: balance }
h3 { font: 700 19px/1.3 var(--display); margin: 28px 0 6px; text-wrap: balance }
p, li { max-width: 68ch }
a { color: var(--leaf); text-underline-offset: 2px }
a:focus-visible { outline: 2px solid var(--brass); outline-offset: 2px }
strong { font-weight: 600 }
code { font: 0.86em var(--mono); background: var(--code); padding: 1px 5px; border-radius: 4px; overflow-wrap: anywhere }
pre { margin: 0; padding: 14px 16px; background: var(--code); border-radius: 6px; font: 14px/1.5 var(--mono) }
pre code { background: none; padding: 0; overflow-wrap: normal }
.scroll { overflow-x: auto; margin: 14px 0 }
table { border-collapse: collapse; width: 100%; font-size: 15.5px; font-variant-numeric: tabular-nums }
th, td { text-align: left; vertical-align: top; padding: 8px 10px; border-bottom: 1px solid var(--rule) }
th { background: var(--panel); font-weight: 600; font-size: 13px; letter-spacing: .04em; text-transform: uppercase; color: var(--muted) }
td:first-child { white-space: nowrap }
hr { border: 0; border-top: 1px solid var(--rule); margin: 28px 0 }
ul, ol { padding-left: 22px } li { margin: 4px 0 } li > ul { margin: 4px 0 }
blockquote { margin: 0; padding-left: 14px; border-left: 3px solid var(--brass); color: var(--muted) }
footer { padding-block: 28px 48px; color: var(--muted); font-size: 14px }
@media (max-width: 520px) { body { font-size: 16px } td:first-child { white-space: normal } }
@media (prefers-reduced-motion: no-preference) { html { scroll-behavior: smooth } }
</style>

<header class="top"><div class="wrap">
  <div class="eyebrow">Cabbage Coins · listing tools</div>
  <h1>Cabbage Coins Playbook</h1>
  <p class="lede">How a coin goes from the workbook and the camera to the website, CAC and eBay: the monthly steps, what to do when something comes up, and how it all works.</p>
</div></header>
<nav class="parts" aria-label="Parts"><div class="wrap">
  ${parts.map((p) => `<a href="#${p.id}">${p.label}</a>`).join('\n  ')}
</div></nav>
${parts.map((p) => `<section class="part" id="${p.id}"><div class="wrap">
<h2 class="part-title">${{ start: 'Start here', howto: 'How do I…', ref: 'How it all works' }[p.id]}</h2>
${p.html}
</div></section>`).join('\n')}
<footer><div class="wrap">Made from README.md, HOW-TO.md and REFERENCE.md in the scripts folder · updated ${updated}.</div></footer>
`;

fs.writeFileSync(OUT, page);
console.log(`Wrote ${OUT}`);
