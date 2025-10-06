param(
  [string]$Name = "FilesystemForCodex",
  [string]$Dir = "$PSScriptRoot\.."
)
Set-Location $Dir
npm i
npm run build
npm i -g pm2
pm2 start dist/server.js --name $Name
pm2 save
pm2 startup | Out-String | Write-Host
Write-Host "Service installed. Review above output for final step if required."
