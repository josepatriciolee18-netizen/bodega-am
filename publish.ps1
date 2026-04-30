# Script de publicación automática para Bodega A&M
# Lee la versión actual del package.json y la incrementa automáticamente

$packageJson = Get-Content "package.json" -Raw | ConvertFrom-Json
$versionParts = $packageJson.version.Split(".")
$major = [int]$versionParts[0]
$minor = [int]$versionParts[1]
$patch = [int]$versionParts[2]

# Incrementar patch version (1.1.0 -> 1.1.1 -> 1.1.2...)
$patch++
$newVersion = "$major.$minor.$patch"

# Actualizar version en package.json
$content = Get-Content "package.json" -Raw
$content = $content -replace """version"": ""$($packageJson.version)""", """version"": ""$newVersion"""
$content | Set-Content "package.json" -NoNewline

Write-Host "Version actualizada: $($packageJson.version) -> $newVersion"

# Git commit y push
git add -A
git commit -m "v$newVersion - actualizacion automatica"
git push

# Publicar
$env:GH_TOKEN = Get-Content "$PSScriptRoot\.gh-token" -ErrorAction SilentlyContinue
if (-not $env:GH_TOKEN) {
    Write-Host "ERROR: No se encontro el token. Crea el archivo .gh-token con tu token de GitHub"
    exit 1
}

npm run publish

Write-Host ""
Write-Host "Publicado v$newVersion exitosamente!"
