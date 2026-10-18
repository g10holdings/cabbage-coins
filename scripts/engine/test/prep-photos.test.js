// 1_Prep-Photos' rules (Prep-Photos.ps1), run through PowerShell: coin size from the name, medal turn, and the
// obverse/reverse split by DSC number runs.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MM = [
  ['1934-D $1 Peace Silver Dollar PCGS MS65 CAC (Toned)', 38.1],
  ['1837 H10C Capped Bust Half Dime PCGS MS65 CAC', 15.5],
  ['1851 Gold Dollar PCGS MS63', 13],
  ['1854 G$1 Princess Head Gold Dollar Type 2 NGC AU55', 15],
  ['1842-D $5 Liberty Head Half Eagle Small Date PCGS XF40', 21.6],
  ['1895-O $10 Liberty Head Eagle PCGS MS62', 27],
  ['1913-S $10 Indian Head Eagle PCGS MS62', 27],
  ['1924 $20 Saint-Gaudens Double Eagle PCGS MS65', 34],
  ['1926 $2.5 Sesquicentennial Gold Commemorative PCGS MS64', 18],
  ['1882 3CN 3 Cent Proof Nickel PCGS PR66CAM CAC', 17.9],
  ['1889 5C Liberty Head Proof Nickel PCGS PR65 CAC', 21.2],
  ['1920 25C Standing Liberty Quarter PCGS MS63FH', 24.3],
  ['1876-S 50C Liberty Seated Half Dollar PCGS MS65', 30.6],
  ['1776-PTS JR 8 Reales Bolivia PCGS MS61', 39],
  ['1878-S T$1 Trade Dollar CACG AU50', 38.1],
  ['9.99 ozs Mint of the United States at San Francisco (Type 2) 999.75 Fine #535', 0],
];
const MEDAL = [
  ['1776-PTS JR 8 Reales Bolivia PCGS MS61', true],
  ['1898 Mexico 8 Reales NGC AU58', true],
  ['1840 Great Britain Crown PCGS XF45', true],
  ['1880-S San Francisco Morgan Dollar', false],
  ['1934-D $1 Peace Silver Dollar PCGS MS65', false],
];
const SPLIT = [
  [['DSC00089-26.jpg', 'DSC00090-26.jpg', 'DSC00095-22.jpg', 'DSC00096-22.jpg'], ['DSC00089-26.jpg', 'DSC00090-26.jpg']],
  [['DSC00042-39.jpg', 'DSC00036-40.jpg', 'DSC00037-40.jpg', 'DSC00040-39.jpg', 'DSC00041-39.jpg'], ['DSC00036-40.jpg', 'DSC00037-40.jpg']],
];

test('coin sizes, medal turn and the obverse/reverse split', () => {
  const file = path.join(os.tmpdir(), `prep-cases-${process.pid}.json`);
  fs.writeFileSync(file, JSON.stringify({ mm: MM.map(([n]) => n), medal: MEDAL.map(([n]) => n), split: SPLIT.map(([f]) => f) }));
  try {
    const out = JSON.parse(execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(HERE, 'prep-rules.ps1'), '-Cases', file], { encoding: 'utf8' }));
    MM.forEach(([name, mm], i) => assert.equal(out.mm[i], mm, `size of ${name}`));
    MEDAL.forEach(([name, medal], i) => assert.equal(out.medal[i], medal, `medal turn of ${name}`));
    SPLIT.forEach(([, obv], i) => assert.deepEqual(out.split[i].obv, obv, `obverse shots of set ${i + 1}`));
  } finally {
    fs.rmSync(file, { force: true });
  }
});
