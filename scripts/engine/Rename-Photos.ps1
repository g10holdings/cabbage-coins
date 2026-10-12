<#
  Renames the photos in each listing folder to <FolderName>-1.jpg, -2, -3 ...

  Order: the files' current name order, as File Explorer sorts them
  (1.jpg, 2.jpg ... 10.jpg).

  Preview only (changes nothing):   .\Rename-Photos.ps1
  Actually rename:                  .\Rename-Photos.ps1 -Apply
#>
param(
    [string]$Root = "D:\OneDrive\Cabbage Coins\Inventory Photos\waiting_website\waiting to post",
    [switch]$Apply
)

$imageExts = '.jpg', '.jpeg', '.png', '.webp', '.heic', '.tif', '.tiff'

function Get-SortKey($name) {
    # Zero-pad digits so "10" sorts after "9"
    [regex]::Replace($name.ToLower(), '\d+', { $args[0].Value.PadLeft(10, '0') })
}

$renamed = 0; $skipped = 0
foreach ($dir in Get-ChildItem -LiteralPath $Root -Directory | Sort-Object Name) {
    $files = @(Get-ChildItem -LiteralPath $dir.FullName -File |
        Where-Object { $imageExts -contains $_.Extension.ToLower() } |
        Sort-Object { Get-SortKey $_.Name })
    if ($files.Count -eq 0) { continue }

    $plan = for ($i = 0; $i -lt $files.Count; $i++) {
        [pscustomobject]@{ File = $files[$i]; NewName = "$($dir.Name)-$($i + 1)$($files[$i].Extension.ToLower())" }
    }

    if (-not ($plan | Where-Object { $_.File.Name -ne $_.NewName })) {
        Write-Host "[done already] $($dir.Name)" -ForegroundColor DarkGray
        $skipped++
        continue
    }

    Write-Host "`n$($dir.Name)  ($($files.Count) files)" -ForegroundColor Cyan
    foreach ($p in $plan) { Write-Host ("   {0,-50} -> {1}" -f $p.File.Name, $p.NewName) }

    if ($Apply) {
        # Two passes via temp names so e.g. "2.jpg" -> "...-1.jpg" can't collide mid-rename
        $temps = foreach ($p in $plan) {
            $tmp = "__tmp_$([guid]::NewGuid().ToString('N'))$($p.File.Extension)"
            Rename-Item -LiteralPath $p.File.FullName -NewName $tmp
            [pscustomobject]@{ Tmp = Join-Path $dir.FullName $tmp; NewName = $p.NewName }
        }
        foreach ($t in $temps) { Rename-Item -LiteralPath $t.Tmp -NewName $t.NewName }
        $renamed++
    }
}

if ($Apply) { Write-Host "`nRenamed $renamed folder(s); $skipped already done." -ForegroundColor Green }
else        { Write-Host "`nPREVIEW ONLY - nothing changed. Run with -Apply to rename." -ForegroundColor Yellow }
