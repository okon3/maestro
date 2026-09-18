# Lists the frontier: open, unassigned tickets whose blockers are all closed.
param([string]$Dir = (Join-Path $PSScriptRoot 'tickets'))

$tickets = @{}
Get-ChildItem $Dir -Filter '*.md' | ForEach-Object {
  $fm = (Get-Content $_.FullName -Raw) -split '(?m)^---\s*$' | Select-Object -Index 1
  $t = @{ file = $_.Name }
  foreach ($line in $fm -split "`n") {
    if ($line -match '^(\w+):\s*(.*)$') { $t[$Matches[1]] = $Matches[2].Trim().Trim('"') }
  }
  $t.blocked_by = @(($t.blocked_by -replace '[\[\]]', '') -split ',' |
    ForEach-Object { $_.Trim() } | Where-Object { $_ })
  $tickets[[int]$t.id] = $t
}

$tickets.Values |
  Where-Object {
    $_.status -eq 'open' -and -not $_.assignee -and
    -not ($_.blocked_by | Where-Object { $tickets[[int]$_].status -ne 'closed' })
  } |
  Sort-Object { [int]$_.id } |
  ForEach-Object { '{0,3}  {1,-9} {2}  ({3})' -f $_.id, $_.type, $_.title, $_.file }
