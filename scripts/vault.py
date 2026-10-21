#!/usr/bin/env python3
"""
vault.py — Cofre local para API keys (desktop).
Criptografa %APPDATA%/EstoqueTI/sync_config.json e chaves Supabase.
Uso:
  python vault.py init                 # cria cofre com senha mestra
  python vault.py set <chave> <valor>  # ex: python vault.py set supabase_anon eyJ...
  python vault.py set <chave> --stdin  # lê o valor sem expor no histórico do shell
  python vault.py get <chave>
  python vault.py list
  python vault.py encrypt-file <arquivo>
  python vault.py decrypt-file <arquivo.enc>

  --dpapi  usa a senha do arquivo vault.pw (protegido pelo DPAPI do Windows)
           em vez de perguntar. Permite uso em scripts/automação sem que a
           senha apareça no código, no histórico do shell ou no prompt.
"""
import os, sys, json, base64, getpass, hashlib, subprocess
from pathlib import Path

try:
    from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
    from cryptography.hazmat.primitives import hashes
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    from cryptography.exceptions import InvalidTag
    HAS_CRYPTO = True
except ImportError:
    HAS_CRYPTO = False

if "APPDATA" in os.environ:
    VAULT = Path(os.environ["APPDATA"]) / "EstoqueTI" / "vault.enc"
else:
    VAULT = Path(".") / "EstoqueTI" / "vault.enc"
    print(f"AVISO: APPDATA ausente — cofre sendo criado/lido em {VAULT.resolve()}")
SALT_SIZE, IV_SIZE, ITER = 16, 12, 100000

def dpapi_password() -> str:
    """Lê a senha mestra do arquivo vault.pw (protegido pelo DPAPI).

    A senha nunca fica em texto puro: o vault.pw guarda um blob do DPAPI que
    só o usuário logado consegue converter de volta.
    """
    if "APPDATA" not in os.environ:
        raise RuntimeError("APPDATA ausente")
    pw_file = Path(os.environ["APPDATA"]) / "EstoqueTI" / "vault.pw"
    if not pw_file.exists():
        raise RuntimeError(f"vault.pw nao encontrado: {pw_file}")
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
        raise RuntimeError("falha ao ler a senha do cofre via DPAPI")
    return out.stdout.strip()

def ask_password(dpapi: bool) -> str:
    """Senha mestra: do DPAPI (--dpapi) ou digitada no prompt."""
    if dpapi:
        return dpapi_password()
    return getpass.getpass("Senha mestra: ")


def derive_key(pw: str, salt: bytes) -> bytes:
    kdf = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt, iterations=ITER)
    return kdf.derive(pw.encode())

def encrypt_obj(obj: dict, pw: str) -> str:
    salt = os.urandom(SALT_SIZE)
    iv = os.urandom(IV_SIZE)
    key = derive_key(pw, salt)
    aes = AESGCM(key)
    ct = aes.encrypt(iv, json.dumps(obj, ensure_ascii=False).encode(), None)
    blob = salt + iv + ct
    return base64.b64encode(blob).decode()

def decrypt_blob(b64: str, pw: str) -> dict:
    blob = base64.b64decode(b64)
    # formato: salt(16) + iv(12) + ciphertext + tag gcm(16)
    if len(blob) < SALT_SIZE + IV_SIZE + 16:
        raise ValueError(f"blob truncado ou corrompido ({len(blob)} bytes)")
    salt, iv, ct = blob[:SALT_SIZE], blob[SALT_SIZE:SALT_SIZE+IV_SIZE], blob[SALT_SIZE+IV_SIZE:]
    key = derive_key(pw, salt)
    aes = AESGCM(key)
    pt = aes.decrypt(iv, ct, None)
    return json.loads(pt.decode())

def load_vault(pw: str) -> dict:
    if not VAULT.exists():
        return {}
    try:
        return decrypt_blob(VAULT.read_text().strip(), pw)
    except InvalidTag:
        print("Senha mestra incorreta ou arquivo corrompido")
        sys.exit(1)
    except (ValueError, json.JSONDecodeError):
        print("Cofre corrompido ou incompleto")
        sys.exit(1)

def save_vault(obj: dict, pw: str):
    VAULT.parent.mkdir(parents=True, exist_ok=True)
    VAULT.write_text(encrypt_obj(obj, pw))

def cmd_init(dpapi=False):
    if not HAS_CRYPTO: 
        print("Instale: pip install cryptography"); sys.exit(1)
    if dpapi:
        # Senha vinda do DPAPI: grava tambem o vault.pw para uso em automacao
        pw = dpapi_password()
    else:
        pw = getpass.getpass("Senha mestra (só você saberá): ")
        pw2 = getpass.getpass("Confirme: ")
        if pw != pw2:
            print("Senhas não conferem"); sys.exit(1)
        if "APPDATA" in os.environ:
            pw_file = Path(os.environ["APPDATA"]) / "EstoqueTI" / "vault.pw"
            pw_file.parent.mkdir(parents=True, exist_ok=True)
            ps = (
                f"$s = ConvertTo-SecureString '{pw}' -AsPlainText -Force; "
                f"ConvertFrom-SecureString -SecureString $s | Set-Content '{pw_file}'"
            )
            subprocess.run(["powershell", "-NoProfile", "-Command", ps], capture_output=True)
            print(f"Senha protegida por DPAPI em: {pw_file}")
    save_vault({}, pw)
    print(f"Cofre criado em {VAULT}")

def cmd_set(key, val, dpapi=False):
    if not HAS_CRYPTO: 
        print("Instale: pip install cryptography"); sys.exit(1)
    pw = ask_password(dpapi)
    obj = load_vault(pw)
    obj[key] = val
    save_vault(obj, pw)
    # Remove arquivo legado em texto puro se existir
    for legacy in [Path(os.environ.get("APPDATA","."))/ "EstoqueTI"/"sync_config.json", Path("supabase_url.txt"), Path("supabase_anon.txt")]:
        if legacy.exists() and legacy.name != "vault.enc":
            print(f"AVISO: segredo em texto puro encontrado (remova manualmente): {legacy.resolve()}")
    print(f"{key} salvo no cofre (criptografado)")

def cmd_get(key, dpapi=False):
    pw = ask_password(dpapi)
    obj = load_vault(pw)
    print(obj.get(key, "(não encontrado)"))

def cmd_list(dpapi=False):
    pw = ask_password(dpapi)
    obj = load_vault(pw)
    for k in obj:
        print(f"  {k}: ({len(str(obj[k]))} caracteres)")

def cmd_encrypt_file(arquivo):
    p = Path(arquivo)
    if not p.exists():
        print(f"Arquivo não encontrado: {p}"); sys.exit(1)
    pw = getpass.getpass("Senha mestra: ")
    salt, iv = os.urandom(SALT_SIZE), os.urandom(IV_SIZE)
    key = derive_key(pw, salt)
    ct = AESGCM(key).encrypt(iv, p.read_bytes(), None)
    out = p.with_suffix(p.suffix + ".enc")
    out.write_text(base64.b64encode(salt + iv + ct).decode())
    print(f"Arquivo criptografado: {out}")

def cmd_decrypt_file(arquivo):
    p = Path(arquivo)
    if not p.exists():
        print(f"Arquivo não encontrado: {p}"); sys.exit(1)
    pw = getpass.getpass("Senha mestra: ")
    try:
        blob = base64.b64decode(p.read_text().strip())
        # formato: salt(16) + iv(12) + ciphertext + tag gcm(16)
        if len(blob) < SALT_SIZE + IV_SIZE + 16:
            raise ValueError("arquivo truncado")
        salt, iv, ct = blob[:SALT_SIZE], blob[SALT_SIZE:SALT_SIZE+IV_SIZE], blob[SALT_SIZE+IV_SIZE:]
        pt = AESGCM(derive_key(pw, salt)).decrypt(iv, ct, None)
    except InvalidTag:
        print("Senha mestra incorreta ou arquivo corrompido"); sys.exit(1)
    except (ValueError, UnicodeDecodeError):
        print("Arquivo corrompido ou incompleto"); sys.exit(1)
    out = p.with_name(p.name[:-4]) if p.suffix == ".enc" else p.with_suffix(".dec")
    out.write_bytes(pt)
    print(f"Arquivo descriptografado: {out}")

if __name__ == "__main__":
    if not HAS_CRYPTO and len(sys.argv) > 1 and sys.argv[1] in ("init","set","get","list","encrypt-file","decrypt-file"):
        print("pip install cryptography"); sys.exit(1)
    if len(sys.argv) < 2:
        print(__doc__); sys.exit(0)
    args = sys.argv[1:]
    dpapi = "--dpapi" in args
    args = [a for a in args if a != "--dpapi"]
    c = args[0]
    if c == "init": cmd_init(dpapi)
    elif c == "set" and len(args)==3 and args[2]=="--stdin":
        cmd_set(args[1], getpass.getpass(f"Valor de '{args[1]}': "), dpapi)
    elif c == "set" and len(args)==3: cmd_set(args[1], args[2], dpapi)
    elif c == "get" and len(args)==2: cmd_get(args[1], dpapi)
    elif c == "list": cmd_list(dpapi)
    elif c == "encrypt-file" and len(args)==2: cmd_encrypt_file(args[1])
    elif c == "decrypt-file" and len(args)==2: cmd_decrypt_file(args[1])
    else: print(__doc__)
