#!/usr/bin/env python3
"""
vault.py — Cofre local para API keys (desktop).
Criptografa %APPDATA%/EstoqueTI/sync_config.json e chaves Supabase.
Uso:
  py vault.py init                 # cria cofre com senha mestra
  py vault.py set <chave> <valor>  # ex: py vault.py set supabase_anon eyJ...
  py vault.py set <chave> --stdin  # lê o valor sem expor no histórico do shell
  py vault.py get <chave>
  py vault.py list
  py vault.py encrypt-file <arquivo>
  py vault.py decrypt-file <arquivo.enc>
"""
import os, sys, json, base64, getpass, hashlib
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

def cmd_init():
    if not HAS_CRYPTO:
        print("Instale: pip install cryptography"); sys.exit(1)
    pw = getpass.getpass("Senha mestra (só você saberá): ")
    pw2 = getpass.getpass("Confirme: ")
    if pw != pw2:
        print("Senhas não conferem"); sys.exit(1)
    save_vault({}, pw)
    print(f"Cofre criado em {VAULT}")

def cmd_set(key, val):
    pw = getpass.getpass("Senha mestra: ")
    obj = load_vault(pw)
    obj[key] = val
    save_vault(obj, pw)
    # Remove arquivo legado em texto puro se existir
    for legacy in [Path(os.environ.get("APPDATA","."))/ "EstoqueTI"/"sync_config.json", Path("supabase_url.txt"), Path("supabase_anon.txt")]:
        if legacy.exists() and legacy.name != "vault.enc":
            print(f"AVISO: segredo em texto puro encontrado (remova manualmente): {legacy.resolve()}")
    print(f"{key} salvo no cofre (criptografado)")

def cmd_get(key):
    pw = getpass.getpass("Senha mestra: ")
    obj = load_vault(pw)
    print(obj.get(key, "(não encontrado)"))

def cmd_list():
    pw = getpass.getpass("Senha mestra: ")
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
    c = sys.argv[1]
    if c == "init": cmd_init()
    elif c == "set" and len(sys.argv)==4 and sys.argv[3]=="--stdin":
        cmd_set(sys.argv[2], getpass.getpass(f"Valor de '{sys.argv[2]}': "))
    elif c == "set" and len(sys.argv)==4: cmd_set(sys.argv[2], sys.argv[3])
    elif c == "get" and len(sys.argv)==3: cmd_get(sys.argv[2])
    elif c == "list": cmd_list()
    elif c == "encrypt-file" and len(sys.argv)==3: cmd_encrypt_file(sys.argv[2])
    elif c == "decrypt-file" and len(sys.argv)==3: cmd_decrypt_file(sys.argv[2])
    else: print(__doc__)
