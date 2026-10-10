param([ValidateSet('start','stop','status')] [string]$Action = 'start')
$ErrorActionPreference = 'Stop'
$Root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$Data = Join-Path $Root '.demo-postgres'
$Bin = 'C:\Program Files\PostgreSQL\18\bin'
if (!(Test-Path (Join-Path $Bin 'pg_ctl.exe'))) { throw 'Install PostgreSQL 18 or adjust $Bin in this script.' }
if ($Action -eq 'stop') { & "$Bin\pg_ctl.exe" -D $Data -m fast -w stop; exit $LASTEXITCODE }
if ($Action -eq 'status') { & "$Bin\pg_ctl.exe" -D $Data status; exit $LASTEXITCODE }
if (!(Test-Path (Join-Path $Data 'PG_VERSION'))) {
    & "$Bin\initdb.exe" -D $Data -U land_demo --auth-local=trust --auth-host=trust --encoding=UTF8
    if ($LASTEXITCODE -ne 0) { throw 'initdb failed.' }
}
& "$Bin\pg_isready.exe" -h 127.0.0.1 -p 55432 -q
if ($LASTEXITCODE -ne 0) {
    & "$Bin\pg_ctl.exe" -D $Data -l (Join-Path $Data 'server.log') -o '-p 55432 -h 127.0.0.1' -w start
    if ($LASTEXITCODE -ne 0) { throw 'Demo PostgreSQL startup failed.' }
}
foreach ($Name in @('land_demo', 'land_demo_test')) {
    $Exists = & "$Bin\psql.exe" -h 127.0.0.1 -p 55432 -U land_demo -d postgres -w -tAc "SELECT 1 FROM pg_database WHERE datname='$Name'"
    if ($Exists -ne '1') {
        & "$Bin\createdb.exe" -h 127.0.0.1 -p 55432 -U land_demo $Name
        if ($LASTEXITCODE -ne 0) { throw "Cannot create $Name." }
    }
}
Write-Output 'Synthetic demo PostgreSQL: 127.0.0.1:55432. Local trust only; never expose this cluster.'