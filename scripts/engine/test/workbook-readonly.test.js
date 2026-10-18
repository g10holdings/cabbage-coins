// The workbook is the business's source of truth and the scripts must NEVER write to it (Tony, repeatedly).
// Two guards: reading leaves a workbook byte-for-byte unchanged, and no script contains code that writes one.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import * as XLSX from 'xlsx';
import { readInventory } from '../workbook.js';

const ENGINE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const hash = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');

test('reading a workbook leaves it exactly as it was', () => {
  const file = path.join(os.tmpdir(), `readonly-test-${process.pid}.xlsx`);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{ inventoryID: 59080489, Type: 'US Coins', itemDescription: '1895-O $10 Liberty Head Eagle PCGS MS62',
    Certification: 'PCGS', CAC: '', 'PCGS Num': 8711, Website: 'R', Status: 'Active', listPrice: 3500 }]), 'inventory');
  fs.writeFileSync(file, XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));   // the test's own throwaway file
  try {
    const before = { hash: hash(file), mtime: fs.statSync(file).mtimeMs };
    const { rows } = readInventory(file);
    assert.equal(rows.length, 1);
    assert.equal(hash(file), before.hash);
    assert.equal(fs.statSync(file).mtimeMs, before.mtime);
  } finally {
    fs.rmSync(file, { force: true });
  }
});

test('no script has code that could write a workbook', () => {
  const offenders = [];
  for (const f of fs.readdirSync(ENGINE).filter((n) => /\.(js|mjs|ps1|cs)$/.test(n))) {
    const src = fs.readFileSync(path.join(ENGINE, f), 'utf8');
    if (/XLSX\.(write|writeFile|writeFileXLSX)\b|book_append_sheet|\.SaveAs\(|Excel\.Application/.test(src)) offenders.push(`${f}: writes spreadsheets`);
    // only workbook.js (which reads a temp copy) and settings.js (which names it) may touch the workbook's path
    if (/settings\.workbook|WORKBOOK_PATH/.test(src) && !['workbook.js', 'settings.js'].includes(f)) offenders.push(`${f}: uses the workbook path`);
  }
  assert.deepEqual(offenders, []);
});
