#!/usr/bin/env python3
"""
sync_push.py — Envia o banco SQLite local (desktop) para o Supabase via PostgREST.

SEGURANÇA: este arquivo NÃO contém nenhum segredo. As credenciais vêm, em
ordem de prioridade, de:
  1. variáveis de ambiente (SUPABASE_URL, SUPABASE_KEY, SUPABASE_SERVICE_ROLE_KEY,
     SUPABASE_ACCESS_TOKEN)
  2. do cofre criptografado em %APPDATA%/EstoqueTI/vault.enc, aberto com a
     senha guardada no vault.pw (protegida pelo DPAPI do Windows)

Este arquivo é copiado para todo backup diário — ele precisa ser seguro
para circular.

O que o script faz:
  1. confere se o projeto do Supabase está acessível
  2. limpa as tabelas (filhos primeiro, por causa das FKs)
  3. reenvia os dados
  4. repara as sequências (precisa da service_role)
"""
import base64
import json
import os
import socket
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path

# Tabelas na ordem de dependencia (pai -> filho)
ORDEM = [
    "lojas", "categorias", "fornecedores", "produtos", "usuarios",
    "movimentacoes", "solicitacoes", "solicitacao_itens",
    "pedidos", "pedido_itens", "alertas",
]


def log(msg: str) -> None:
    print(msg, flush=True)


# ---------------------------------------------------------------------------
#  Cofre
# ---------------------------------------------------------------------------
def _senha_dpapi() -> str:
    """Lê a senha mestra do vault.pw (protegido pelo DPAPI)."""
    pw_file = Path(os.environ["APPDATA"]) / "EstoqueTI" / "vault.pw"
    if not pw_file.exists():
        raise RuntimeError("vault.pw nao encontrado")
    ps = (
        f"$s = Get-Content '{pw_file}' | ConvertTo-SecureString; "
        "$p=[Runtime.InteropServices.Marshal]::PtrToStringAuto("
        "[Runtime.InteropServices.Marshal]::SecureStringToBSTR($s)); Write-Output $p"
    )
    out = subprocess.run(
        ["powershell", "-NoProfile", "-Command", ps],
        capture_output=True, text=True,
    )
    if out.returncode != 0 or not out.stdout.strip():
        raise RuntimeError("falha ao ler a senha do cofre")
    return out.stdout.strip()


def ler_cofre() -> dict:
    """Decifra o vault.enc. Devolve {} se nao houver cofre ou a senha falhar."""
    appdata = os.environ.get("APPDATA")
    if not appdata:
        return {}
    vault = Path(appdata) / "EstoqueTI" / "vault.enc"
    if not vault.exists():
        return {}
    try:
        from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
        from cryptography.hazmat.primitives import hashes
        from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    except BaseException as _e:
        import traceback as _tb; _tb.print_exc()
        log("AVISO: modulo 'cryptography' ausente — cofre ignorado")
        return {}
    try:
        pw = _senha_dpapi()
        blob = base64.b64decode(vault.read_text().strip())
        salt, iv, ct = blob[:16], blob[16:28], blob[28:]
        kdf = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt, iterations=100000)
        key = kdf.derive(pw.encode())
        return json.loads(AESGCM(key).decrypt(iv, ct, None).decode())
    except Exception as e:
        log(f"AVISO: nao foi possivel abrir o cofre ({type(e).__name__})")
        return {}


def carregar_segredos() -> dict:
    """Segredos do ambiente ou do cofre. Sem valor padrao embutido no codigo."""
    cofre = ler_cofre()
    return {
        "url":  os.environ.get("SUPABASE_URL") or cofre.get("cloud_url", ""),
        "key":  os.environ.get("SUPABASE_KEY") or os.environ.get("SUPABASE_ANON_KEY") or cofre.get("cloud_key", ""),
        "svc":  os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or cofre.get("cloud_svc_key", ""),
        "mgmt": os.environ.get("SUPABASE_ACCESS_TOKEN") or cofre.get("mgmt_token", ""),
    }


# ---------------------------------------------------------------------------
#  HTTP
# ---------------------------------------------------------------------------
def _req(url: str, headers: dict, method: str = "GET", body: bytes = None, timeout: int = 30):
    req = urllib.request.Request(url, data=body, method=method, headers=headers)
    return urllib.request.urlopen(req, timeout=timeout)


def projeto_acessivel(url: str, key: str):
    """Checa se o projeto do Supabase existe e responde.

    Devolve (ok, mensagem).
    """
    if not url or not key:
        return False, "sem configuracao de nuvem (url/key ausente)"
    host = url.split("//", 1)[-1].split("/", 1)[0]
    try:
        socket.getaddrinfo(host, 443)
    except socket.gaierror:
        return False, f"projeto '{host}' nao resolve no DNS (projeto removido ou renomeado?)"
    try:
        with _req(url + "/rest/v1/lojas?select=id&limit=1",
                  {"apikey": key, "Authorization": "Bearer " + key}, timeout=20) as r:
            r.read()
        return True, "ok"
    except urllib.error.HTTPError as e:
        return False, f"projeto respondeu HTTP {e.code} ({host})"
    except Exception as e:
        return False, f"projeto inacessivel: {type(e).__name__}: {e}"


def main() -> int:
    appdata = os.environ.get("APPDATA")
    if not appdata:
        log("ERRO: APPDATA ausente")
        return 1
    db = Path(appdata) / "EstoqueTI" / "almoxarifado.db"
    if not db.exists():
        log(f"ERRO: banco nao encontrado em {db}")
        return 1

    seg = carregar_segredos()
    url = seg["url"].rstrip("/")
    key = seg["key"]
    svc = seg["svc"]

    if not url or not key:
        log("SYNC: sem configuracao de nuvem — nada a fazer.")
        log("      configure com: python scripts\\vault.py set cloud_url <url> --dpapi")
        log("                    python scripts\\vault.py set cloud_key <chave> --dpapi")
        return 0

    ok, msg = projeto_acessivel(url, key)
    if not ok:
        log(f"SYNC: {msg}")
        log("      sync desativado ate a nuvem voltar a existir. Banco local intacto.")
        return 0

    headers = {
        "apikey": svc or key,
        "Authorization": "Bearer " + (svc or key),
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }

    import sqlite3
    conn = sqlite3.connect(db)
    conn.row_factory = sqlite3.Row

    # 1. Limpar (filhos primeiro, por causa das FKs)
    for t in reversed(ORDEM):
        try:
            with _req(f"{url}/rest/v1/{t}?id=gt.0",
                      {**headers, "Prefer": "return=minimal"}, "DELETE") as r:
                r.read()
            log(f"  clear {t}: ok")
        except urllib.error.HTTPError as e:
            log(f"  clear {t}: {e.code}")
        except Exception as e:
            log(f"  clear {t}: {type(e).__name__}")

    # 2. Reenviar
    total = 0
    for t in ORDEM:
        try:
            rows = [dict(r) for r in conn.execute(f"SELECT * FROM {t}")]
        except sqlite3.OperationalError:
            continue
        if not rows:
            continue
        for r in rows:
            for k in list(r.keys()):
                if k in ("ativo", "ativa", "lido") and isinstance(r[k], int):
                    r[k] = bool(r[k])
        if t == "lojas":
            for r in rows:
                if "ativa" in r:
                    r["ativo"] = r.pop("ativa")
        if t == "usuarios":
            for r in rows:
                if r.get("senha") is None:
                    r["senha"] = ""
        data = json.dumps(rows).encode()
        try:
            with _req(f"{url}/rest/v1/{t}", data, headers, "POST") as r:
                r.read()
            log(f"  push {t}: {len(rows)} registros")
            total += len(rows)
        except urllib.error.HTTPError as e:
            log(f"  push {t} ERRO {e.code}: {e.read().decode()[:300]}")
        except Exception as e:
            log(f"  push {t} ERRO: {type(e).__name__}: {e}")

    # 3. Reparar as sequencias (exige service_role)
    if svc:
        try:
            with _req(f"{url}/rest/v1/rpc/repair_sequences", b"{}",
                      {"apikey": svc, "Authorization": "Bearer " + svc,
                       "Content-Type": "application/json"}, "POST") as r:
                r.read()
            log("  repair_sequences: ok")
        except Exception as e:
            log(f"  repair_sequences: {type(e).__name__}")
    else:
        log("  repair_sequences: pulado (sem service_role no cofre)")

    log(f"--- Total enviado: {total}")
    conn.close()
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as e:
        # Nunca stacktrace: o log do sync e lido por gente, nao por maquina.
        log(f"SYNC: falhou ({type(e).__name__}: {e})")
        sys.exit(0)
