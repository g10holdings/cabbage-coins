# Puts the deal-number proposal (.zoho\deal-proposal.json, from deal-numbers.js) into a TEST COPY of the workbook.
# NEVER point this at the real g10HoldingsLLC.xlsx: Tony reviews the copy and moves the numbers over himself.
#
# Works through Excel itself so the tables, ~55k formulas and pivot tables survive. In each of sales, purchases,
# inflows and outflows it adds two columns AT THE END of the table (the inventory sheet looks columns up in sales by
# position, so nothing may be inserted before them):
#   dealID     INV-…, PO-…, or a made-up D-YYMMDD-NN
#   dealMatch  how the row was matched (cert #, name + amount, made up…) — for review; can be deleted afterwards
# and a dealCheck sheet: one row per deal, live SUMIFS of each table by dealID, and whether the deal balances:
#   (sales collected - purchases) - (money in - money out) = 0
# Before writing, every row is checked against the proposal (inventoryID, or person|amount); any mismatch stops it
# with nothing saved.
#
#   powershell -File write-deal-copy.ps1 -Workbook "D:\...\g10HoldingsLLC - DEAL NUMBERS TEST.xlsx"

param(
  [Parameter(Mandatory = $true)][string]$Workbook,
  [string]$Proposal = (Join-Path $PSScriptRoot '.zoho\deal-proposal.json')
)
$ErrorActionPreference = 'Stop'
# The ONE script allowed to write a spreadsheet (test\workbook-readonly.test.js checks these two refusals exist):
# never the real workbook (its path from settings.json, compared in full), and only a file named as a TEST copy.
$real = [IO.Path]::GetFullPath((Get-Content (Join-Path $PSScriptRoot 'settings.json') -Raw | ConvertFrom-Json).workbook)
$target = [IO.Path]::GetFullPath($Workbook)
if ($target -ieq $real -or (Split-Path $target -Leaf) -ieq (Split-Path $real -Leaf)) { throw "Refusing to write the real workbook ($real). Point this at a TEST copy." }
if ((Split-Path $target -Leaf) -notmatch 'TEST') { throw "Refusing: '$target' isn't named as a TEST copy." }

$p = Get-Content $Proposal -Raw -Encoding UTF8 | ConvertFrom-Json
$keyCols = @{
  sales     = @('inventoryID')
  purchases = @('inventoryID')
  inflows   = @('inflowCounterparty', 'inflowAmount')
  outflows  = @('outflowCounterparty', 'outflowAmount')
}

function CellText($v) {
  if ($null -eq $v) { return '' }
  if ($v -is [double]) { return ([decimal]$v).ToString([Globalization.CultureInfo]::InvariantCulture) }
  return [string]$v
}

function Ensure-Column($lo, $name) {
  foreach ($c in $lo.ListColumns) { if ($c.Name -eq $name) { return $c } }
  $c = $lo.ListColumns.Add()
  $c.Name = $name
  return $c
}

$xl = New-Object -ComObject Excel.Application
$xl.Visible = $false; $xl.DisplayAlerts = $false; $xl.AskToUpdateLinks = $false
try {
  $wb = $xl.Workbooks.Open($Workbook, 0, $false)
  foreach ($sheet in 'sales', 'purchases', 'inflows', 'outflows') {
    $lo = $wb.Worksheets.Item($sheet).ListObjects.Item(1)
    $first = $lo.HeaderRowRange.Row + 1
    $n = $lo.ListRows.Count
    $rows = $p.rows.$sheet

    # Check every proposed row against the copy before touching anything.
    $keys = New-Object System.Collections.ArrayList   # one 2-D value array per key column (not unrolled)
    foreach ($k in $keyCols[$sheet]) { [void]$keys.Add($lo.ListColumns.Item($k).DataBodyRange.Value2) }
    foreach ($r in $rows) {
      $i = $r.row - $first + 1
      if ($i -lt 1 -or $i -gt $n) { throw "${sheet}: proposal row $($r.row) is outside the table" }
      $parts = foreach ($kv in $keys) { CellText $kv[$i, 1] }
      $have = $parts -join '|'
      $want = [string]$r.key
      if ($have -ne $want) {
        # amounts can differ only in how the number was printed (370 vs 370.0)
        $hp = $have -split '\|'; $wp = $want -split '\|'
        $ok = ($hp.Count -eq $wp.Count)
        for ($j = 0; $ok -and $j -lt $hp.Count; $j++) {
          $a = 0.0; $b = 0.0
          if ($hp[$j] -ne $wp[$j] -and -not ([double]::TryParse($hp[$j], [ref]$a) -and [double]::TryParse($wp[$j], [ref]$b) -and [math]::Abs($a - $b) -lt 0.005)) { $ok = $false }
        }
        if (-not $ok) { throw "${sheet} row $($r.row): the copy has '$have' but the proposal expected '$want'. Re-run deal-numbers.js on this copy." }
      }
    }

    $dealArr = New-Object 'object[,]' $n, 1
    $howArr = New-Object 'object[,]' $n, 1
    foreach ($r in $rows) {
      $i = $r.row - $first
      $dealArr[$i, 0] = [string]$r.deal
      $howArr[$i, 0] = [string]$r.how
    }
    $dc = Ensure-Column $lo 'dealID'
    $hc = Ensure-Column $lo 'dealMatch'
    $dc.DataBodyRange.NumberFormat = '@'
    $dc.DataBodyRange.Value2 = $dealArr
    $hc.DataBodyRange.Value2 = $howArr
    Write-Output ("{0}: {1} rows, {2} with a deal" -f $sheet, $n, @($rows | Where-Object { $_.deal }).Count)
  }

  # dealCheck sheet: one row per deal with live totals.
  $old = $null
  foreach ($ws in $wb.Worksheets) { if ($ws.Name -eq 'dealCheck') { $old = $ws } }
  if ($old) { $old.Delete() }
  $ws = $wb.Worksheets.Add([Type]::Missing, $wb.Worksheets.Item($wb.Worksheets.Count))
  $ws.Name = 'dealCheck'
  $deals = @($p.deals | Sort-Object date, id)
  $heads = 'dealID', 'source', 'person', 'date', 'salesCollected', 'purchases', 'moneyIn', 'moneyOut', 'off', 'status', 'zohoLinesNotInWorkbook', 'personOff'
  $data = New-Object 'object[,]' ($deals.Count + 1), $heads.Count
  for ($c = 0; $c -lt $heads.Count; $c++) { $data[0, $c] = $heads[$c] }
  for ($i = 0; $i -lt $deals.Count; $i++) {
    $d = $deals[$i]
    $r = $i + 1   # (not inline: in $data[$i + 1, 0] PowerShell reads "1, 0" as a list first)
    $data[$r, 0] = [string]$d.id
    $data[$r, 1] = [string]$d.source
    $data[$r, 2] = [string]$d.who
    $data[$r, 3] = [string]$d.date
    $data[$r, 10] = (@($d.unmatchedLines) -join ' ; ')
  }
  $last = $deals.Count + 1
  $ws.Range($ws.Cells.Item(1, 1), $ws.Cells.Item($last, $heads.Count)).Value2 = $data
  $ws.Range("A2:A$last").NumberFormat = '@'
  $ws.Range("D2:D$last").Value2 = $ws.Range("D2:D$last").Value2   # date text -> real dates
  $ws.Range("D2:D$last").NumberFormat = 'yyyy-mm-dd'
  $t = $ws.ListObjects.Add(1, $ws.Range("A1:L$last"), $null, 1)
  $t.Name = 'dealCheck'
  $t.ListColumns.Item('salesCollected').DataBodyRange.Formula = '=SUMIFS(sales[totalCollected],sales[dealID],[@dealID])'
  $t.ListColumns.Item('purchases').DataBodyRange.Formula = '=SUMIFS(purchases[purchaseAmount],purchases[dealID],[@dealID])'
  $t.ListColumns.Item('moneyIn').DataBodyRange.Formula = '=SUMIFS(inflows[inflowAmount],inflows[dealID],[@dealID])'
  $t.ListColumns.Item('moneyOut').DataBodyRange.Formula = '=SUMIFS(outflows[outflowAmount],outflows[dealID],[@dealID])'
  $t.ListColumns.Item('off').DataBodyRange.Formula = '=ROUND(([@salesCollected]-[@purchases])-([@moneyIn]-[@moneyOut]),2)'
  # Dealers with a running account: one invoice's payment often lands on another, so "off" amounts cancel out
  # across their deals. personOff = all of that person's deals together; 0 means they're settled overall.
  $t.ListColumns.Item('personOff').DataBodyRange.Formula = '=ROUND(SUMIFS([off],[person],[@person]),2)'
  $t.ListColumns.Item('status').DataBodyRange.Formula = '=IF(ABS([@off])<0.5,"balanced",IF(ABS([@personOff])<0.5,"balanced with person''s other deals","CHECK"))'
  $ws.Range("E2:I$last").NumberFormat = '#,##0.00;[Red]-#,##0.00'
  $ws.Range("L2:L$last").NumberFormat = '#,##0.00;[Red]-#,##0.00'
  $ws.Columns.Item('A:J').AutoFit() | Out-Null
  $ws.Columns.Item('K').ColumnWidth = 60
  $xl.Calculate()
  $st = $t.ListColumns.Item('status').DataBodyRange
  $bal = $xl.WorksheetFunction.CountIf($st, 'balanced')
  $chk = $xl.WorksheetFunction.CountIf($st, 'CHECK')
  Write-Output ("dealCheck: {0} deals: {1} balanced, {2} balanced with the person's other deals, {3} CHECK" -f $deals.Count, $bal, ($deals.Count - $bal - $chk), $chk)

  $wb.Save()
  $wb.Close($false)
  Write-Output "Saved $Workbook"
} finally {
  $xl.Quit()
  [System.Runtime.InteropServices.Marshal]::ReleaseComObject($xl) | Out-Null
}
