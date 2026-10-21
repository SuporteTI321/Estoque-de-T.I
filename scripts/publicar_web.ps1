$ErrorActionPreference = "Continue"
# Raiz do projeto: quem chamou o script (…\Estoque de T.I\scripts) -> um nivel acima
$proj  = Split-Path -Parent $PSScriptRoot
$wt    = Join-Path $env:TEMP "estoque-ghpages-wt"
$dist  = Join-Path $proj "dist"

Write-Host "=== 1. Build da versao web ===" -ForegroundColor Cyan
Push-Location $proj
& npx vite build 2>&1 | Select-Object -Last 2
Pop-Location
if (-not (Test-Path $dist)) { Write-Host "ERRO: dist nao gerado" -ForegroundColor Red; exit 1 }

Write-Host "`n=== 2. Worktree da branch gh-pages (sem mexer no diretorio principal) ===" -ForegroundColor Cyan
if (Test-Path $wt) { git -C $proj worktree remove $wt --force 2>&1 | Out-Null }
git -C $proj worktree add $wt gh-pages 2>&1 | Select-Object -Last 1

Write-Host "`n=== 3. Limpando o conteudo antigo do site ===" -ForegroundColor Cyan
Get-ChildItem $wt -Force | Where-Object { $_.Name -ne '.git' -and $_.Name -notmatch '^\.git$' } | ForEach-Object {
  if ($_.PSIsContainer) {
    $gitdir = Join-Path $_.FullName ".git"
    if (Test-Path $gitdir) { Write-Host "  (mantendo $($_.Name) - worktree)" }
    else { Remove-Item $_.FullName -Recurse -Force }
  } else { Remove-Item $_.FullName -Force }
}

Write-Host "`n=== 4. Copiando o build ===" -ForegroundColor Cyan
Copy-Item (Join-Path $dist "*") $wt -Recurse -Force
Get-ChildItem $wt -Recurse -File -Force | Where-Object { $_.FullName -notmatch '\\\.git' } | ForEach-Object {
  "  {0,8:N1} KB  {1}" -f ($_.Length/1KB), $_.FullName.Replace("$wt\","")
}

Write-Host "`n=== 5. Commit + push ===" -ForegroundColor Cyan
Push-Location $wt
git add -A 2>&1 | Out-Null
git status --short | ForEach-Object { "  $_" }
git commit -q -m "build: publica a versao web (0.1.3)

- remove o modulo de custos (preco_compra, preco_venda, custo_total)
- move o icone de Retorno de Saida de Produtos para a tela Saida
- remove os arquivos de experimento de dashboard" 2>&1 | Select-Object -Last 1
git push origin gh-pages 2>&1 | Select-Object -Last 3
Pop-Location

Write-Host "`n=== 6. Limpando o worktree ===" -ForegroundColor Cyan
git -C $proj worktree remove $wt --force 2>&1 | Out-Null
git -C $proj worktree prune 2>&1 | Out-Null
Write-Host "  ok"
