# Runs Prep-Photos.ps1's rule functions (coin size, medal turn, obverse/reverse split) on the cases in the JSON
# file given, and prints the answers as JSON, for prep-photos.test.js. Loads only the functions; runs nothing.
param([string]$Cases)
$t = $null; $e = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot '..\Prep-Photos.ps1'), [ref]$t, [ref]$e)
if ($e.Count) { throw "Prep-Photos.ps1 doesn't parse: $($e[0].Message)" }
foreach ($fn in $ast.FindAll({ $args[0] -is [System.Management.Automation.Language.FunctionDefinitionAst] }, $true)) { . ([scriptblock]::Create($fn.Extent.Text)) }
$c = Get-Content -Raw $Cases | ConvertFrom-Json
$out = [ordered]@{
  mm = @($c.mm | ForEach-Object { Get-CoinMM $_ })
  medal = @($c.medal | ForEach-Object { [bool](Test-MedalTurn $_) })
  split = @($c.split | ForEach-Object {
    $s = Split-Sides @($_ | ForEach-Object { [pscustomobject]@{ Name = $_ } })
    [ordered]@{ obv = @($s.obv | ForEach-Object { $_.Name }); rev = @($s.rev | ForEach-Object { $_.Name }) }
  })
}
$out | ConvertTo-Json -Depth 5 -Compress
