# Estoque de T.I — notas operacionais

## Senha do administrador

| item | valor |
|---|---|
| usuário | `admin@empresa.com` |
| senha inicial | `Estoque@TI2026` |

> Troque em **Meu Perfil → Alterar Senha** assim que entrar.
> A senha é guardada como hash Argon2id (não em texto puro).

Se o login falhar depois de trocar a senha, o problema é quase sempre o
`vault.pw`: ele é protegido pelo DPAPI do Windows e vale **só para o usuário
que criou**. Restaurar o backup do banco em outra máquina exige recriar o
`vault.pw` naquela máquina.

## Sessão

- Timeout de **8 horas** (vale para desktop e web)
- No desktop, a sessão é validada no backend ao abrir o app
- Logout encerra a sessão no backend e limpa as sessões expiradas

## Estoque mínimo

Com `estoque_minimo = 0` o alerta de "estoque baixo" nunca disparava. Os
mínimos são derivados do consumo real de saídas:

```powershell
python scripts\calcula_estoque_minimo.py             # dry-run (só mostra)
python scripts\calcula_estoque_minimo.py --aplicar   # grava no banco
```

Regra: `mínimo = max(1, ceil((saídas / dias observados) × 30))` — 30 dias de
cobertura, com piso de 1 (item com 1 unidade já conta como "baixo"; 0 é
"sem estoque", tratado separadamente).

Rode de novo quando tiver mais histórico de saídas: os valores se ajustam.

## Sync com o Supabase (modo nuvem)

O projeto `fmtlmgonyaamijjcwncf` **não existe mais** (confirmado via NXDOMAIN
em 21/10/2026). Para religar:

1. Crie um projeto em <https://supabase.com>
2. Execute `supabase/schema.sql` inteiro no SQL Editor
3. Em *Project Settings → API*, copie a **publishable key** e a **secret key**
4. Configure:

```powershell
python scripts\configurar_supabase.py `
    --url https://SEU-PROJETO.supabase.co `
    --key sb_publishable_... `
    --secret sb_secret_...
```

As chaves vão para o cofre criptografado (`%APPDATA%\EstoqueTI\vault.enc`),
nunca para arquivo em texto puro. O script testa a conexão e roda o sync.

### Onde ficam as coisas

| item | caminho |
|---|---|
| Banco de dados | `%APPDATA%\EstoqueTI\almoxarifado.db` |
| Cofre (criptografado) | `%APPDATA%\EstoqueTI\vault.enc` |
| Senha do cofre (DPAPI) | `%APPDATA%\EstoqueTI\vault.pw` |
| Backup diário | `D:\Backups\EstoqueTI\<data>_<hora>\` (retenção: 7) |
| Código-fonte | `D:\Projetos em Andamentos\Projeto em Processo\Estoque de T.I` |
| Web (GitHub Pages) | branch `gh-pages` → `https://suporteti321.github.io/Estoque-de-T.I/` |

### Cofre

```powershell
python scripts\vault.py list --dpapi          # lista as chaves
python scripts\vault.py get cloud_url --dpapi # lê uma chave
python scripts\vault.py set cloud_key --stdin --dpapi   # grava (valor via stdin)
```

O modo `--dpapi` usa a senha guardada no `vault.pw` (protegida pelo Windows),
sem perguntar no terminal e sem expor nada no histórico do shell.

> O cofre original estava **corrompido** (`InvalidTag` ao decifrar) e foi
> reconstruído. Se voltar a dar "Senha mestra incorreta", o `vault.pw` e o
> `vault.enc` estão fora de sincronia.

## Builds

```powershell
npm run build                                  # só o frontend
npx tauri build                                # app + instaladores (NSIS + MSI)
npx tauri build --no-bundle                    # só o executável
```

Publicar a web (branch `gh-pages`):

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\publicar_web.ps1
```

Publicar os instaladores na pasta de Vídeos:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File %APPDATA%\EstoqueTI\publicar.ps1
```

## Backup

`backup_diario.ps1` roda pela Tarefa Agendada `EstoqueTI_BackupDiario` (diária,
12:00) e guarda 7 cópias. Cada backup leva o código-fonte e os dados
(banco + WAL + cofre).

> Para restaurar: feche o app, copie `almoxarifado.db` **e** o `-wal` para
> `%APPDATA%\EstoqueTI\`. Copiar só o `.db` perde as transações que ainda
> estavam no WAL.
