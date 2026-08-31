#!/usr/bin/env python3
"""
Migra o token GitHub do sync_config.json para o cofre (vault.enc).
Uso: python migrate_token.py
"""
import os
import sys
import json
import base64
from pathlib import Path

try:
    from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
    from cryptography.hazmat.primitives import hashes
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    HAS_CRYPTO = True
except ImportError:
    HAS_CRYPTO = False
    print("ERRO: pip install cryptography")
    sys.exit(1)

# Configurações
APPDATA = os.environ.get("APPDATA", ".")
ESTOQUE_TI = Path(APPDATA) / "EstoqueTI"
SYNC_CONFIG = ESTOQUE_TI / "sync_config.json"
VAULT_ENC = ESTOQUE_TI / "vault.enc"
VAULT_PW = ESTOQUE_TI / "vault.pw"

SALT_SIZE = 16
IV_SIZE = 12
ITER = 100000

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

def main():
    print("=== Migração de Token GitHub para Cofre ===")
    print()
    
    # Verificar se sync_config.json existe
    if not SYNC_CONFIG.exists():
        print(f"ERRO: {SYNC_CONFIG} não encontrado")
        sys.exit(1)
    
    # Ler sync_config.json
    try:
        with open(SYNC_CONFIG, 'r', encoding='utf-8-sig') as f:
            config = json.load(f)
    except Exception as e:
        print(f"ERRO ao ler sync_config.json: {e}")
        sys.exit(1)
    
    token = config.get('token', '')
    if not token:
        print("AVISO: Nenhum token encontrado em sync_config.json")
        sys.exit(0)
    
    print(f"Token encontrado: {token[:10]}...{token[-4:]}")
    print()
    
    # Verificar se cofre já existe
    if VAULT_ENC.exists():
        print("AVISO: Cofre já existe. Sobrescrever? (s/n): ", end='')
        resp = input().strip().lower()
        if resp != 's':
            print("Operação cancelada")
            sys.exit(0)
    
    # Criar senha para o cofre
    print("Crie uma senha para o cofre (será usada para descriptografar):")
    import getpass
    pw = getpass.getpass("Senha: ")
    pw2 = getpass.getpass("Confirme: ")
    
    if pw != pw2:
        print("ERRO: Senhas não conferem")
        sys.exit(1)
    
    # Dados para salvar no cofre
    vault_data = {
        'github_token': token,
        'owner': config.get('owner', ''),
        'repo': config.get('repo', ''),
        'path': config.get('path', ''),
        'auto_enabled': config.get('auto_enabled', True)
    }
    
    # Criptografar e salvar
    try:
        encrypted = encrypt_obj(vault_data, pw)
        VAULT_ENC.write_text(encrypted)
        
        # Salvar senha do cofre (para o app ler)
        VAULT_PW.write_text(pw)
        
        print()
        print(f"Cofre criado: {VAULT_ENC}")
        print(f"Token migrado com sucesso!")
        print()
        
        # Perguntar se deve remover o token do sync_config.json
        print("Deseja remover o token do sync_config.json? (s/n): ", end='')
        resp = input().strip().lower()
        if resp == 's':
            config['token'] = ''
            with open(SYNC_CONFIG, 'w', encoding='utf-8') as f:
                json.dump(config, f, indent=2)
            print("Token removido do sync_config.json")
        
        print()
        print("Migração concluída!")
        print("O aplicativo agora lerá o token do cofre.")
        
    except Exception as e:
        print(f"ERRO ao criar cofre: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
