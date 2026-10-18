<#
  Makes the 4 website photos for every coin folder in waiting_website, from the camera shots (DSC*.jpg).
  Tony ends each folder name with the cert number. photo-folders.js (run first) renames the folder from the
  workbook, as "<item description>-<cert number>", and the photos are named from the description alone:

    <Name>-1.jpg  obverse slab        <Name>-3.jpg  reverse slab
    <Name>-2.jpg  obverse close-up    <Name>-4.jpg  reverse close-up

  3_Run-Import finds a listing's photos by that cert number and puts them on its draft.

  All 1044 x 1044. NO post-processing: no brightening, sharpening or colour changes - only turning, cropping,
  resizing, the black mask and the logos.

  For each coin:
   1. Obverse vs reverse: Tony shoots the obverse first, then the reverse, so the DSC numbers form two runs.
   2. Raw camera frames (landscape) are turned upright and cropped to the slab's edges plus a small margin.
      Which way to turn comes from where the coin sits: obverse = coin low (label on top); reverse = coin high for
      US coins (coin turn), coin low for medal-turn world coins. Tony's own hand-cropped shots are left as they are.
   3. The best-exposed shot of each side (least blown out) and a guess at the coin's true edge.
   4. A window to check the edge (click 3 points / nudge), turn a shot 180 degrees, or change the coin's size.
   5. The 4 photos are written, the camera shots move into an "originals" subfolder, and the choices are saved
      in originals\photo-prep.txt so a re-run (-Redo) starts from them.

  .\Prep-Photos.ps1                 every coin folder that doesn't have its 4 photos yet
  .\Prep-Photos.ps1 -Only 1895-O    just folders whose name contains "1895-O"
  .\Prep-Photos.ps1 -Redo           check finished coins again too (starts from the saved choices)
#>
param(
  [string]$Root = '',          # the in-progress photo folder; default from settings.json
  [string]$Only = '',
  [switch]$Redo,
  [string]$TestSnapshots = ''   # testing only: accept every guess and save a picture of each window here instead
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing, System.Windows.Forms
Add-Type -Path "$PSScriptRoot\CoinPhoto.cs", "$PSScriptRoot\CoinReview.cs" -ReferencedAssemblies System.Drawing, System.Windows.Forms, System.Core

# Paths come from settings.json (shared with the Node scripts); relative ones are relative to this folder.
$Settings = Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot 'settings.json') | ConvertFrom-Json
function Resolve-Setting([string]$p) { if ([IO.Path]::IsPathRooted($p)) { [IO.Path]::GetFullPath($p) } else { [IO.Path]::GetFullPath((Join-Path $PSScriptRoot $p)) } }
if (-not $Root) { $Root = Resolve-Setting $Settings.photos.inProgress }
$Emblem = Resolve-Setting $Settings.photos.logo
$CacLogo = Resolve-Setting $Settings.photos.cacLogo
$PX_PER_MM = 66.3      # the copy stand's fixed scale, camera px per mm of coin
$MAX_PX_PER_MM = 50    # close-up cap so small coins aren't over-magnified (Tony's half dimes / gold dollars, 2026-10)
$SLAB_MARGIN = 20      # px of background kept around the slab when cropping a raw frame
$Work = Join-Path $env:TEMP 'CabbagePhotoPrep'

# Coin diameter (mm, Red Book) from the folder name. 0 = unknown: the window then asks for 3 clicks.
function Get-CoinMM([string]$name) {
  $n = ' ' + ($name -replace '[-_]+', ' ') + ' '
  $year = if ($n -match '\b(1[5-9]\d\d|20\d\d)\b') { [int]$Matches[1] } else { 0 }   # the folder starts with the cert #
  switch -Regex ($n) {
    '\bH10C\b|half dime'                             { return 15.5 }
    '\b3CS\b|three cent silver|trime'                { return 14.0 }
    '\b3CN\b|three cent nickel'                      { return 17.9 }
    '\b2C\b|two cent'                                { return 23.0 }
    '\b20C\b|twenty cent'                            { return 22.0 }
    'G\$1\b|gold dollar|\$1 gold|one dollar gold'      { if ($n -match 'type 1' -or ($year -ge 1849 -and $year -le 1853)) { return 13.0 } return 15.0 }
    '\$2\.5|2\.5 dollar|quarter eagle'               { return 18.0 }
    '\$3\b|three dollar|3 dollar'                    { return 20.5 }
    '\$20|twenty dollar|20 dollar|double eagle'      { return 34.0 }
    '\$10|ten dollar|10 dollar|\beagle\b(?!.*half)'  { if ($n -notmatch 'half eagle') { return 27.0 } }
    '\$5|five dollar|5 dollar|half eagle'            { return 21.6 }
    '8 reales'                                       { return 39.0 }
    'trade dollar|\bT\$1'                            { return 38.1 }
    'half dollar|\b50C\b'                            { return 30.6 }
    'silver dollar|morgan|peace|\$1\b|\bS\$1'        { return 38.1 }
    '\b25C\b|quarter'                                { return 24.3 }
    '\b10C\b|\bdime\b'                               { return 17.9 }
    '\b5C\b|nickel'                                  { return 21.2 }
    'large cent'                                     { return 28.5 }
    '\b1C\b|\bcent\b|penny'                          { return 19.0 }
  }
  return 0
}

# World coins are struck medal turn: their reverse stands the same way up as the obverse.
function Test-MedalTurn([string]$name) {
  $name -match '\b(reales|escudos?|pesos?|thaler|taler|crowns?|pounds?|shillings?|sovereigns?|guineas?|francs?|marks?|ducats?|florins?|gulden|kronen?|kopeks?|r[o]?ubles?|lira|lire|rupees?|yen|medal|bolivia|mexico|peru|potosi|PTS)\b'
}

# Obverse shots come first, then the reverse: two runs of DSC numbers. Split at the biggest jump.
function Split-Sides($files) {
  $num = { [int]([regex]::Match($_.Name, 'DSC0*(\d+)').Groups[1].Value) }
  $sorted = @($files | Sort-Object $num)
  $nums = @($sorted | ForEach-Object $num)
  $cut = 1; $gap = -1
  for ($i = 1; $i -lt $nums.Count; $i++) { if ($nums[$i] - $nums[$i - 1] -gt $gap) { $gap = $nums[$i] - $nums[$i - 1]; $cut = $i } }
  @{ obv = @($sorted[0..($cut - 1)]); rev = @($sorted[$cut..($sorted.Count - 1)]) }
}

# First, name every folder from the workbook (photo-folders.js). It checks each name against its cert's row,
# renames, and lists the folders to work on, with their file names, CAC flag and workbook name.
Write-Host 'Checking the folder names against the workbook...' -ForegroundColor Cyan
Push-Location $PSScriptRoot
try { & node photo-folders.js --apply --root $Root; $nodeOk = $LASTEXITCODE -eq 0 } finally { Pop-Location }
if (-not $nodeOk) { throw 'Could not check the folders against the workbook (see above).' }
# (the parentheses unwrap the list: Windows PowerShell's ConvertFrom-Json hands it over as one item otherwise)
$coins = @((Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot '.photo-folders.json') | ConvertFrom-Json) | ForEach-Object { $_ })

$done = @(); $skipped = @(); $stop = $false
foreach ($coin in $coins) {
  $folder = Get-Item -LiteralPath (Join-Path $Root $coin.folder)
  if ($Only -and $folder.Name -notlike "*$Only*") { continue }
  $origDir = Join-Path $folder.FullName 'originals'
  $stateFile = Join-Path $origDir 'photo-prep.txt'
  $outs = 1..4 | ForEach-Object { Join-Path $folder.FullName "$($coin.base)-$_.jpg" }
  $finished = -not ($outs | Where-Object { -not (Test-Path -LiteralPath $_) })
  $shotsHere = @(Get-ChildItem -LiteralPath $folder.FullName -File -Filter 'DSC*.jpg')
  if ($finished -and -not $Redo) { Write-Host "  (done already: $($folder.Name) - use -Redo to check it again)" -ForegroundColor DarkGray; continue }
  $sources = if ($shotsHere) { $shotsHere } elseif (Test-Path -LiteralPath $origDir) { @(Get-ChildItem -LiteralPath $origDir -File -Filter 'DSC*.jpg') } else { @() }
  if ($sources.Count -lt 2) { if ($sources.Count -eq 1) { Write-Host "  ! $($folder.Name): only one camera shot - needs an obverse and a reverse" -ForegroundColor Yellow }; continue }

  if ($outs[0].Length -gt 240) { Write-Host "   ! $($folder.Name): the photo paths are over 240 characters - Windows Explorer has trouble past 260" -ForegroundColor Yellow }
  # size, CAC sticker (CACG holders too) and medal turn all come from the workbook's description
  $mm = Get-CoinMM $coin.name
  $isCac = [bool]$coin.cac
  $medal = Test-MedalTurn $coin.name
  $coinPx = if ($mm -gt 0) { [math]::Min(880, $mm * $MAX_PX_PER_MM) } else { 880 }
  $defaultGap = [int][math]::Round(450 - $coinPx / 2)
  Write-Host ''
  Write-Host "== $($folder.Name)" -ForegroundColor Cyan
  Write-Host ("   {0}{1}{2}" -f $(if ($mm) { "$mm mm" } else { 'coin size unknown (add it to Get-CoinMM)' }), $(if ($isCac) { ', CAC logo' }), $(if ($medal) { ', medal turn' }))
  $saved = @{}
  if (Test-Path -LiteralPath $stateFile) { foreach ($l in Get-Content -LiteralPath $stateFile) { $p = $l -split "`t"; if ($p.Count -ge 6) { $saved[$p[0]] = $p } } }

  $wdir = Join-Path $Work ([guid]::NewGuid().ToString('N').Substring(0, 8))
  New-Item -ItemType Directory -Force $wdir | Out-Null
  $sides = Split-Sides $sources
  $results = @{}; $action = 'ok'
  foreach ($side in 'obv', 'rev') {
    $shots = $sides[$side]
    $coinLow = ($side -eq 'obv') -or $medal
    $sv = $saved[$side]
    $preps = @(for ($k = 0; $k -lt $shots.Count; $k++) {
      $f = $shots[$k]
      Write-Host ("   {0}: finding the slab and coin in {1} ({2} of {3})..." -f $(if ($side -eq 'obv') { 'obverse' } else { 'reverse' }), $f.Name, ($k + 1), $shots.Count)
      $turn = if ($sv -and $sv[1] -eq $f.Name) { [int]$sv[2] } else { -1 }
      [CoinPhoto]::Prepare($f.FullName, (Join-Path $wdir $f.Name), $SLAB_MARGIN, $mm * $PX_PER_MM, $coinLow, $turn)
    })
    $fits = @($preps | ForEach-Object { $_.Fit })
    $pick = @(0..($shots.Count - 1) | Sort-Object { [math]::Round($fits[$_].ClipPct) }, { - $fits[$_].MeanLum })[0]
    $gap = $defaultGap
    if ($sv) {
      $k = [array]::IndexOf(@($shots.Name), $sv[1])
      if ($k -ge 0) {
        $pick = $k; $fits[$k].Cx = [double]$sv[3]; $fits[$k].Cy = [double]$sv[4]; $fits[$k].R = [double]$sv[5]; $fits[$k].Note = 'saved'
        if ($sv.Count -ge 7 -and $sv[6] -ne '') { $gap = [int]$sv[6] }
      }
    }
    foreach ($p in $preps) { if ($p.Cropped -and [math]::Abs($p.TiltDeg) -gt 1) { Write-Host ("   ! {0} sits {1:0.0} degrees crooked on the stand" -f (Split-Path $p.Path -Leaf), $p.TiltDeg) -ForegroundColor Yellow } }
    $label = if ($side -eq 'obv') { 'Obverse' } else { 'Reverse' }
    while ($true) {
      if ($TestSnapshots) {
        [ReviewForm]::Snapshot($folder.Name, $label, [string[]]@($preps | ForEach-Object { $_.Path }), [CoinFit[]]$fits, $pick, $gap,
          $Emblem, $(if ($isCac) { $CacLogo } else { '' }), 1920, 1040, $null, (Join-Path $TestSnapshots "$($folder.Name.Substring(0, 12))-$side.png"))
        $r = [pscustomobject]@{ Action = 'ok'; Pick = $pick; Fit = $fits[$pick]; Gap = $gap }
        break
      }
      $r = [ReviewForm]::Ask($folder.Name, $label, [string[]]@($preps | ForEach-Object { $_.Path }), [CoinFit[]]$fits, $pick, $gap,
        $Emblem, $(if ($isCac) { $CacLogo } else { '' }))
      $pick = $r.Pick; $gap = $r.Gap
      if ($r.Action -ne 'turn') { break }
      # turn that shot 180 degrees: redone from the camera file, so the photo is still only saved once
      $f = $shots[$pick]
      Write-Host "   turning $($f.Name)..."
      $preps[$pick] = [CoinPhoto]::Prepare($f.FullName, (Join-Path $wdir $f.Name), $SLAB_MARGIN, $mm * $PX_PER_MM, $coinLow, 1 - $preps[$pick].Turn)
      $fits[$pick] = $preps[$pick].Fit
    }
    $action = $r.Action
    if ($action -ne 'ok') { break }
    $results[$side] = @{ Shot = $shots[$pick]; Prep = $preps[$pick]; Fit = $r.Fit; Gap = $gap }
  }
  if ($action -eq 'quit') { Write-Host '   stopped.'; Remove-Item -Recurse -Force $wdir; $stop = $true; break }
  if ($action -eq 'skip') { Write-Host '   skipped.'; Remove-Item -Recurse -Force $wdir; $skipped += $folder.Name; continue }

  # write the 4 photos, then tidy the camera shots away
  $n = 1; $lines = @()
  foreach ($side in 'obv', 'rev') {
    $x = $results[$side]
    [CoinPhoto]::Slab($x.Prep.Path, $outs[$n - 1], 1044, 95)
    [CoinPhoto]::Close($x.Prep.Path, $outs[$n], $x.Fit, 1044, 900, $x.Gap,
      $Emblem, (New-Object System.Drawing.Rectangle(75, 869, 124, 124)), 0.8,
      $(if ($isCac) { $CacLogo } else { '' }), (New-Object System.Drawing.Rectangle(816, 890, 131, 78)), 95)
    $lines += ($side, $x.Shot.Name, $x.Prep.Turn, $x.Fit.Cx, $x.Fit.Cy, $x.Fit.R, $x.Gap) -join "`t"
    $n += 2
  }
  New-Item -ItemType Directory -Force $origDir | Out-Null
  foreach ($f in $shotsHere) { Move-Item -LiteralPath $f.FullName -Destination $origDir }
  Set-Content -LiteralPath $stateFile $lines
  Remove-Item -Recurse -Force $wdir
  Write-Host "   saved $($coin.base)-1.jpg ... -4.jpg (camera shots moved to originals\)" -ForegroundColor Green
  $done += $folder.Name
}
Write-Host ''
Write-Host "Done: $($done.Count) coin(s)$(if ($skipped) { "; skipped: $($skipped -join ', ')" })$(if ($stop) { '; stopped early' })"
if ($done) { Invoke-Item $Root }
