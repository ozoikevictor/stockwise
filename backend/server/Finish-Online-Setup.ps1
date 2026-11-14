$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
$pgBin = 'C:\Program Files\PostgreSQL\17\bin'
Get-Content '.env' | ForEach-Object { if ($_ -match '^([^#=]+)=(.*)$') { [Environment]::SetEnvironmentVariable($matches[1], $matches[2], 'Process') } }
$databaseUri = [Uri]$env:DATABASE_URL
$env:PGPASSWORD = ($databaseUri.UserInfo -split ':',2)[1]
$cluster = Join-Path $PSScriptRoot '..\local-postgres\desktop-data'
if (!(Test-Path (Join-Path $cluster 'postgresql.conf'))) {
  $passwordFile = Join-Path $env:TEMP ('stockwise-' + [guid]::NewGuid() + '.txt')
  try {
    Set-Content $passwordFile $env:PGPASSWORD -NoNewline
    & "$pgBin\initdb.exe" -D $cluster -U stockwise_dev --encoding=UTF8 --auth=scram-sha-256 --pwfile=$passwordFile
    if ($LASTEXITCODE -ne 0) { throw 'Database initialization failed.' }
  } finally { Remove-Item $passwordFile -ErrorAction SilentlyContinue }
}
& "$pgBin\pg_isready.exe" -h 127.0.0.1 -p 5433
if ($LASTEXITCODE -ne 0) {
  & "$pgBin\pg_ctl.exe" -D $cluster -l (Join-Path $PSScriptRoot '..\local-postgres\desktop-server.log') -o '-h 127.0.0.1 -p 5433' start
  if ($LASTEXITCODE -ne 0) { throw 'Database startup failed.' }
}
$exists = & "$pgBin\psql.exe" -h 127.0.0.1 -p 5433 -U stockwise_dev -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='stockwise_dev'"
if ($LASTEXITCODE -ne 0) { throw 'Database connection failed.' }
if (($exists -join '').Trim() -ne '1') {
  & "$pgBin\createdb.exe" -h 127.0.0.1 -p 5433 -U stockwise_dev stockwise_dev
  if ($LASTEXITCODE -ne 0) { throw 'Database creation failed.' }
}
npm run migrate
if ($LASTEXITCODE -ne 0) { throw 'Database migration failed.' }
Write-Host 'Keep this window open while testing StockWise online.'
npm start


