#!/usr/bin/env python3
"""
configurar_supabase.py — deixa o sync pronto em um comando.

O projeto Supabase fmtlmgonyaamijjcwncf NAO EXISTE MAIS (NXDOMAIN em
21/10/2026). Para religar o modo nuvem:

  1. Crie um projeto novo em https://supabase.com
  2. Copie o SQL de supabase/schema.sql e execute no SQL Editor
  3. Em Project Settings > API, copie a publishable key e a secret key
  4. Rode este script com a URL e as chaves:

       python scripts/configurar_supabase.py \
           --url https://SEU-PROJETO.supabase.co \
           --key sb_publishable_... \
           --secret sb_secret_...

As credenciais vao para o cofre criptografado (%APPDATA%/EstoqueTI/vault.enc),
nunca para um arquivo em texto puro. O script tambem testa a conexao.

Depois disso o sync (que roda a cada 5 minutos) volta a funcionar sozinho.
"""
import argparse
import json
import os
import subprocess
import sys
import urllib.error
import urllib.request

PROJECT = r"D:\Projetos em Andamentos\Projeto em Processo\Estoque de T.I"
VAULT_PY = os.path.join(PROJECT, "scripts", "vault.py")


def guardar_cofre(chave: str, valor: str) -> bool:
    """Grava no cofre via vault.py --dpapi (senha vinda do DPAPI, sem prompt)."""
    if not os.path.exists(VAULT_PY):
        print("  ERRO: vault.py nao encontrado em", VAULT_PY)
        return False
    # --stdin evita que o valor apareca no historico do shell
    r = subprocess.run(
        [sys.executable, VAULT_PY, "set", chave, "--stdin", "--dpapi"],
        input=valor, capture_output=True, text=True,
    )
    if r.returncode != 0:
        print("  ERRO ao gravar '%s':" % chave, (r.stderr or r.stdout).strip()[:200])
        return False
    print("  %s -> cofre OK" % chave)
    return True


def testar(url: str, key: str) -> bool:
    url = url.rstrip("/")
    req = urllib.request.Request(
        url + "/rest/v1/lojas?select=id&limit=1",
        headers={"apikey": key, "Authorization": "Bearer " + key},
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            r.read()
        print("  conexao OK:", url)
        return True
    except urllib.error.HTTPError as e:
        print("  o projeto respondeu HTTP %d" % e.code)
        print("  401/403 = chave invalida ou RLS bloqueando | 404 = tabela 'lojas' ainda nao existe")
        return False
    except Exception as e:
        print("  falha:", type(e).__name__, e)
        return False


def main() -> int:
    ap = argparse.ArgumentParser(description="Configura o sync com o Supabase")
    ap.add_argument("--url", help="URL do projeto (https://xxx.supabase.co)")
    ap.add_argument("--key", help="publishable key (sb_publishable_...)")
    ap.add_argument("--secret", help="secret key (sb_secret_...) — para DELETE/POST com service_role")
    ap.add_argument("--testar", action="store_true", help="so testa a conexao")
    args = ap.parse_args()

    if args.url and args.key:
        print("=== gravando no cofre ===")
        guardar_cofre("cloud_url", args.url.rstrip("/"))
        guardar_cofre("cloud_key", args.key)
        if args.secret:
            guardar_cofre("cloud_svc_key", args.secret)
        else:
            print("  (sem --secret: o sync vai funcionar, mas repair_sequences e as")
            print("   escritas privileged ficarão de fora)")
    elif not args.testar:
        ap.print_help()
        print("\nPasso 1: crie o projeto em https://supabase.com")
        print("Passo 2: execute supabase/schema.sql no SQL Editor")
        print("Passo 3: Project Settings > API -> copie as chaves")
        print("Passo 4: python scripts/configurar_supabase.py --url ... --key ... --secret ...")
        return 1

    print("\n=== testando ===")
    if args.url and args.key:
        if not testar(args.url, args.key):
            return 2

    print("\n=== sync ===")
    r = subprocess.run(
        [sys.executable, os.path.join(PROJECT, "scripts", "sync_push.py")],
        capture_output=True, text=True,
    )
    print(r.stdout.strip() or r.stderr.strip()[:400])
    return 0


if __name__ == "__main__":
    sys.exit(main())
