# Puts the deal-number proposal (.zoho\deal-proposal.json, from deal-numbers.js) into a TEST COPY of the workbook.
# NEVER point this at the real g10HoldingsLLC.xlsx: Tony reviews the copy and moves the numbers over himself.
#
# Works through Excel itself so the tables, ~55k formulas and pivot tables survive. In each of sales, purchases,
# inflows and outflows it adds two columns AT THE END of the table (the inventory sheet looks columns up in sales by
# position, so nothing may be inserted before them):
#   dealID     INV-…, PO-…, or a made-up D-YYMMDD-NN
#   dealMatch  how the row was matched (cert #, name + amount, made up…) — for review; can be deleted afterwards
# and a dealCheck sheet: one row per deal, live SUMIFS of each table by dealID, and whether the deal balances:
#   (sales collected + other invoiced - purchases) - (money in - money out) = 0
# dealType: Coin, or Grading / Services for Zoho invoices that are not coin sales (otherInvoiced = the invoice total;
# the deal balances when the customer has paid it).
# Before writing, every row is checked against the proposal (inventoryID, or person|amount); any mismatch stops it
# with nothing saved.
#
#   powershell -File write-deal-copy.ps1 -Workbook "D:\...\g10HoldingsLLC - DEAL NUMBERS TEST.xlsx"

param(
  [Parameter(Mandatory = $true)][string]$Workbook,
  [string]$Proposal,
  [switch]$LiveDealCheck,   # only (re)build the dealCheck sheet as ONE self-updating formula (dealcheck-formula.txt)
  [switch]$Final   # the copy that becomes the real workbook: no dealMatch review column
)
# (Windows PowerShell 5.1 has no $PSScriptRoot yet while reading param defaults, so the default is set here.)
if (-not $Proposal) { $Proposal = Join-Path $PSScriptRoot '.zoho\deal-proposal.json' }
$ErrorActionPreference = 'Stop'
# The ONE script allowed to write a spreadsheet (test\workbook-readonly.test.js checks these two refusals exist):
# never the real workbook (its path from settings.json, compared in full), and only a file named as a TEST copy.
$real = [IO.Path]::GetFullPath((Get-Content (Join-Path $PSScriptRoot 'settings.json') -Raw | ConvertFrom-Json).workbook)
$target = [IO.Path]::GetFullPath($Workbook)
if ($target -ieq $real -or (Split-Path $target -Leaf) -ieq (Split-Path $real -Leaf)) { throw "Refusing to write the real workbook ($real). Point this at a TEST copy." }
if ((Split-Path $target -Leaf) -notmatch 'TEST') { throw "Refusing: '$target' isn't named as a TEST copy." }

if ($LiveDealCheck) {
  # The workbook already has its dealID columns: the sheet lists every dealID in the four tables by itself (Excel 365).
  $formula = (Get-Content (Join-Path $PSScriptRoot 'dealcheck-formula.txt') -Raw -Encoding UTF8).Trim()
  $xl = New-Object -ComObject Excel.Application
  $xl.Visible = $false; $xl.DisplayAlerts = $false; $xl.AskToUpdateLinks = $false
  try {
    $wb = $xl.Workbooks.Open($Workbook, 0, $false)
    foreach ($ws in @($wb.Worksheets)) { if ($ws.Name -eq 'dealCheck') { $ws.Delete() } }
    $ws = $wb.Worksheets.Add([Type]::Missing, $wb.Worksheets.Item($wb.Worksheets.Count))
    $ws.Name = 'dealCheck'
    $ws.Range('A1').Formula2 = '=LET(s, INDEX(A3#, , 11), "Deals: " & (ROWS(s) - 1) & "   balanced: " & SUM(--(s = "balanced")) & "   settled with person: " & SUM(--(s = "settled with person")) & "   OPEN: " & SUM(--(s = "OPEN")) & "   (updates by itself; unpaid grading invoices and rows missing a dealID: run 6_Check-Deals)")'
    $ws.Range('A3').Formula2 = $formula
    $xl.Calculate()
    $n = $ws.Range('A3').SpillingToRange.Rows.Count
    $ws.Range("B4:B$($n + 2)").NumberFormat = 'yyyy-mm-dd'
    $ws.Range("D4:J$($n + 2)").NumberFormat = '#,##0.00;[Red]-#,##0.00'
    $ws.Range('A3:K3').Font.Bold = $true
    $fc = $ws.Range('K4:K5000').FormatConditions.Add(1, 3, '="OPEN"')   # cell value = "OPEN"
    $fc.Font.Color = 255; $fc.Font.Bold = $true
    $ws.Columns.Item('A:K').AutoFit() | Out-Null
    $ws.Range('A4').Select() | Out-Null
    $xl.ActiveWindow.FreezePanes = $true
    Write-Output $ws.Range('A1').Text
    $wb.Save(); $wb.Close($false)
    Write-Output "Saved $Workbook"
  } finally {
    $xl.Quit()
    [System.Runtime.InteropServices.Marshal]::ReleaseComObject($xl) | Out-Null
  }
  return
}

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
    # A filtered table takes values only into its VISIBLE rows (learned 2026-11-15: purchases was filtered to 2 rows
    # and got no deal numbers). Show every row in the copy first.
    if ($lo.AutoFilter -and $lo.AutoFilter.FilterMode) { $lo.AutoFilter.ShowAllData(); Write-Output "${sheet}: filter cleared in the copy" }
    $dc = Ensure-Column $lo 'dealID'
    if ($Final) { foreach ($c in @($lo.ListColumns)) { if ($c.Name -eq 'dealMatch') { $c.Delete() } } }
    else { $hc = Ensure-Column $lo 'dealMatch' }
    $dc.DataBodyRange.NumberFormat = '@'
    $dc.DataBodyRange.Value2 = $dealArr
    if (-not $Final) { $hc.DataBodyRange.Value2 = $howArr }
    # Read it all back: every proposed deal number must be in its row.
    $back = $dc.DataBodyRange.Value2
    foreach ($r in $rows) {
      $i = $r.row - $first + 1
      if ([string]$back[$i, 1] -ne [string]$r.deal) { throw "${sheet} row $($r.row): wrote '$($r.deal)' but the cell holds '$($back[$i, 1])'. Nothing saved." }
    }
    Write-Output ("{0}: {1} rows, {2} with a deal" -f $sheet, $n, @($rows | Where-Object { $_.deal }).Count)
  }

  # dealCheck sheet: one row per deal with live totals.
  $old = $null
  foreach ($ws in $wb.Worksheets) { if ($ws.Name -eq 'dealCheck') { $old = $ws } }
  if ($old) { $old.Delete() }
  $ws = $wb.Worksheets.Add([Type]::Missing, $wb.Worksheets.Item($wb.Worksheets.Count))
  $ws.Name = 'dealCheck'
  $deals = @($p.deals | Sort-Object date, id)
  $heads = 'dealID', 'dealType', 'source', 'person', 'date', 'salesCollected', 'otherInvoiced', 'purchases', 'moneyIn', 'moneyOut', 'off', 'status', 'zohoLinesNotInWorkbook', 'personOff'
  $data = New-Object 'object[,]' ($deals.Count + 1), $heads.Count
  for ($c = 0; $c -lt $heads.Count; $c++) { $data[0, $c] = $heads[$c] }
  for ($i = 0; $i -lt $deals.Count; $i++) {
    $d = $deals[$i]
    $r = $i + 1   # (not inline: in $data[$i + 1, 0] PowerShell reads "1, 0" as a list first)
    $data[$r, 0] = [string]$d.id
    $data[$r, 1] = [string]$d.type
    $data[$r, 2] = if ($d.linked) { "$($d.source) + $($d.linked)" } else { [string]$d.source }   # a trade's second Zoho record
    $data[$r, 3] = [string]$d.who
    $data[$r, 4] = [string]$d.date
    $data[$r, 6] = [double]$d.invoiced   # Zoho total of a Grading/Services invoice (0 for coin deals)
    $data[$r, 12] = (@($d.unmatchedLines) -join ' ; ')
  }
  $last = $deals.Count + 1
  $ws.Range($ws.Cells.Item(1, 1), $ws.Cells.Item($last, $heads.Count)).Value2 = $data
  $ws.Range("A2:A$last").NumberFormat = '@'
  $ws.Range("E2:E$last").Value2 = $ws.Range("E2:E$last").Value2   # date text -> real dates
  $ws.Range("E2:E$last").NumberFormat = 'yyyy-mm-dd'
  $t = $ws.ListObjects.Add(1, $ws.Range("A1:N$last"), $null, 1)
  $t.Name = 'dealCheck'
  $t.ListColumns.Item('salesCollected').DataBodyRange.Formula = '=SUMIFS(sales[totalCollected],sales[dealID],[@dealID])'
  $t.ListColumns.Item('purchases').DataBodyRange.Formula = '=SUMIFS(purchases[purchaseAmount],purchases[dealID],[@dealID])'
  $t.ListColumns.Item('moneyIn').DataBodyRange.Formula = '=SUMIFS(inflows[inflowAmount],inflows[dealID],[@dealID])'
  # Money out also counts purchases paid with foreign cash on hand (transMedium "FX Cash": the FX tab, not outflows).
  $t.ListColumns.Item('moneyOut').DataBodyRange.Formula = '=SUMIFS(outflows[outflowAmount],outflows[dealID],[@dealID])+SUMIFS(purchases[purchaseAmount],purchases[dealID],[@dealID],purchases[transMedium],"FX*")'
  $t.ListColumns.Item('off').DataBodyRange.Formula = '=ROUND(([@salesCollected]+[@otherInvoiced]-[@purchases])-([@moneyIn]-[@moneyOut]),2)'
  # Dealers with a running account: one invoice's payment often lands on another, so "off" amounts cancel out
  # across their deals. personOff = all of that person's deals together; 0 means they're settled overall.
  $t.ListColumns.Item('personOff').DataBodyRange.Formula = '=ROUND(SUMIFS([off],[person],[@person]),2)'
  $t.ListColumns.Item('status').DataBodyRange.Formula = '=IF(ABS([@off])<0.5,"balanced",IF(ABS([@personOff])<0.5,"balanced with person''s other deals","CHECK"))'
  $ws.Range("F2:K$last").NumberFormat = '#,##0.00;[Red]-#,##0.00'
  $ws.Range("N2:N$last").NumberFormat = '#,##0.00;[Red]-#,##0.00'
  $ws.Columns.Item('A:L').AutoFit() | Out-Null
  $ws.Columns.Item('M').ColumnWidth = 60
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
