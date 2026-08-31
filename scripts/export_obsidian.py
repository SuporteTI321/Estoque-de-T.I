#!/usr/bin/env python3
"""
export_obsidian.py — Exporta dados do Estoque de T.I. como markdown para Obsidian.

Gera notas markdown com frontmatter YAML, wikilinks e tags compatíveis com Obsidian.

Uso:
    py scripts/export_obsidian.py                         # exporta para vault padrão
    py scripts/export_obsidian.py --vault "C:/Users/.../MyVault/Estoque"
    py scripts/export_obsidian.py --tabela produtos        # exporta só produtos
    py scripts/export_obsidian.py --tabelas produtos,categorias
    py scripts/export_obsidian.py --limpar                 # remove notas anteriores antes de exportar
"""

import sqlite3
import argparse
import os
import re
from pathlib import Path
from datetime import datetime

DB_PATH = Path(os.environ.get("APPDATA", ".")) / "EstoqueTI" / "almoxarifado.db"
DEFAULT_VAULT = Path(os.environ.get("USERPROFILE", ".")) / "Documents" / "EstoqueTI_Obsidian"

TABELAS = ["produtos", "categorias", "fornecedores", "lojas", "usuarios", "movimentacoes", "solicitacoes", "alertas"]

# ─── Helpers ───

def slug(s: str) -> str:
    """Gera slug seguro para nome de arquivo Obsidian."""
    s = re.sub(r'[^\w\s-]', '', s.lower())
    return re.sub(r'[\s]+', '-', s).strip('-')

def yaml_val(v) -> str:
    """Serializa valor para YAML (frontmatter)."""
    if v is None:
        return "null"
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, (int, float)):
        return str(v)
    s = str(v)
    if any(c in s for c in [':', '#', '{', '}', '[', ']', ',', '&', '*', '?', '|', '-', '<', '>', '=', '!', '%', '@', '`']):
        return f'"{s}"'
    return s

def frontmatter(d: dict) -> str:
    """Gera frontmatter YAML para Obsidian."""
    lines = ["---"]
    for k, v in d.items():
        lines.append(f"{k}: {yaml_val(v)}")
    lines.append("---")
    return "\n".join(lines)

def wikilink(nome: str, tipo: str = "") -> str:
    """Gera wikilink Obsidian."""
    if tipo:
        return f"[[{nome}|{tipo}]]"
    return f"[[{nome}]]"

# ─── Exportadores por tabela ───

def export_produtos(conn: sqlite3.Connection, out: Path):
    """Exporta produtos como notas individuais."""
    cur = conn.cursor()
    cur.execute("""
        SELECT p.id, p.codigo, p.nome, p.marca, p.modelo, p.descricao,
               p.unidade, p.preco_compra, p.preco_venda, p.estoque, p.estoque_minimo,
               c.nome as categoria, f.nome as fornecedor
        FROM produtos p
        LEFT JOIN categorias c ON p.categoria_id = c.id
        LEFT JOIN fornecedores f ON p.fornecedor_id = f.id
        WHERE p.ativo = 1
        ORDER BY p.codigo
    """)
    rows = cur.fetchall()
    pasta = out / "Produtos"
    pasta.mkdir(parents=True, exist_ok=True)
    count = 0
    for r in rows:
        pid, codigo, nome, marca, modelo, desc, unidade, pc, pv, est, est_min, cat, forn = r
        fm = frontmatter({
            "tipo": "produto",
            "id": pid,
            "codigo": codigo or "",
            "nome": nome,
            "marca": marca or "",
            "modelo": modelo or "",
            "categoria": cat or "Sem categoria",
            "fornecedor": forn or "Sem fornecedor",
            "unidade": unidade or "un",
            "preco_compra": pc or 0,
            "preco_venda": pv or 0,
            "estoque": est or 0,
            "estoque_minimo": est_min or 0,
            "status": "critico" if (est or 0) <= (est_min or 0) else "ok",
            "exportado": datetime.now().strftime("%Y-%m-%d %H:%M"),
        })
        md = f"""{fm}

# {nome}

{f"**Marca:** {marca}" if marca else ""}
{f"**Modelo:** {modelo}" if modelo else ""}
{f"**Descricao:** {desc}" if desc else ""}

## Estoque

| Campo | Valor |
|-------|-------|
| Codigo | `{codigo or 'S/C'}` |
| Unidade | {unidade or 'un'} |
| Estoque atual | **{est or 0}** |
| Estoque minimo | {est_min or 0} |
| Status | {'🔴 Critico' if (est or 0) <= (est_min or 0) else '🟢 OK'} |

## Precos

| Campo | Valor |
|-------|-------|
| Preco compra | R$ {pc or 0:.2f} |
| Preco venda | R$ {pv or 0:.2f} |
| Margem | {((pv or 0) - (pc or 0)):.2f} |

## Relacoes

{f"- Categoria: {wikilink(cat)}" if cat else ""}
{f"- Fornecedor: {wikilink(forn)}" if forn else ""}
"""
        arq = pasta / f"{codigo or pid}.md"
        arq.write_text(md.strip() + "\n", encoding="utf-8")
        count += 1
    print(f"  Produtos: {count} notas")

def export_categorias(conn: sqlite3.Connection, out: Path):
    """Exporta categorias como notas."""
    cur = conn.cursor()
    cur.execute("SELECT id, nome, descricao FROM categorias WHERE ativa=1 ORDER BY nome")
    rows = cur.fetchall()
    pasta = out / "Categorias"
    pasta.mkdir(parents=True, exist_ok=True)
    count = 0
    for r in rows:
        cid, nome, desc = r
        # Conta produtos na categoria
        cur2 = conn.cursor()
        cur2.execute("SELECT COUNT(*) FROM produtos WHERE categoria_id=? AND ativo=1", (cid,))
        total = cur2.fetchone()[0]
        cur2.execute("SELECT codigo, nome FROM produtos WHERE categoria_id=? AND ativo=1 ORDER BY codigo LIMIT 20", (cid,))
        prods = cur2.fetchall()
        fm = frontmatter({
            "tipo": "categoria",
            "id": cid,
            "nome": nome,
            "total_produtos": total,
            "exportado": datetime.now().strftime("%Y-%m-%d %H:%M"),
        })
        links = "\n".join(f"- {wikilink(p[1], p[0])}" for p in prods)
        md = f"""{fm}

# {nome}

{desc or "Sem descricao"}

**Total de produtos:** {total}

## Produtos

{links if links else "_Nenhum produto nesta categoria_"}
"""
        arq = pasta / f"{slug(nome)}.md"
        arq.write_text(md.strip() + "\n", encoding="utf-8")
        count += 1
    print(f"  Categorias: {count} notas")

def export_fornecedores(conn: sqlite3.Connection, out: Path):
    """Exporta fornecedores como notas."""
    cur = conn.cursor()
    cur.execute("SELECT id, nome, cnpj, contato, email, telefone FROM fornecedores WHERE ativo=1 ORDER BY nome")
    rows = cur.fetchall()
    pasta = out / "Fornecedores"
    pasta.mkdir(parents=True, exist_ok=True)
    count = 0
    for r in rows:
        fid, nome, cnpj, contato, email, tel = r
        fm = frontmatter({
            "tipo": "fornecedor",
            "id": fid,
            "nome": nome,
            "cnpj": cnpj or "",
            "exportado": datetime.now().strftime("%Y-%m-%d %H:%M"),
        })
        md = f"""{fm}

# {nome}

| Campo | Valor |
|-------|-------|
| CNPJ | {cnpj or 'S/C'} |
| Contato | {contato or '-'} |
| Email | {email or '-'} |
| Telefone | {tel or '-'} |
"""
        arq = pasta / f"{slug(nome)}.md"
        arq.write_text(md.strip() + "\n", encoding="utf-8")
        count += 1
    print(f"  Fornecedores: {count} notas")

def export_lojas(conn: sqlite3.Connection, out: Path):
    """Exporta lojas como notas."""
    cur = conn.cursor()
    cur.execute("SELECT id, nome, codigo, endereco FROM lojas WHERE ativa=1 ORDER BY nome")
    rows = cur.fetchall()
    pasta = out / "Lojas"
    pasta.mkdir(parents=True, exist_ok=True)
    count = 0
    for r in rows:
        lid, nome, codigo, end = r
        fm = frontmatter({
            "tipo": "loja",
            "id": lid,
            "nome": nome,
            "codigo": codigo or "",
            "exportado": datetime.now().strftime("%Y-%m-%d %H:%M"),
        })
        md = f"""{fm}

# {nome}

| Campo | Valor |
|-------|-------|
| Codigo | `{codigo or 'S/C'}` |
| Endereco | {end or '-'} |
"""
        arq = pasta / f"{slug(nome)}.md"
        arq.write_text(md.strip() + "\n", encoding="utf-8")
        count += 1
    print(f"  Lojas: {count} notas")

def export_movimentacoes(conn: sqlite3.Connection, out: Path):
    """Exporta movimentacoes recentes (ultimas 200)."""
    cur = conn.cursor()
    cur.execute("""
        SELECT m.id, m.tipo, m.data_movimento, m.quantidade, m.observacao,
               p.codigo, p.nome
        FROM movimentacoes m
        LEFT JOIN produtos p ON m.produto_id = p.id
        ORDER BY m.data_movimento DESC
        LIMIT 200
    """)
    rows = cur.fetchall()
    pasta = out / "Movimentacoes"
    pasta.mkdir(parents=True, exist_ok=True)
    # Agrupar por mes
    por_mes: dict[str, list] = {}
    for r in rows:
        mid, tipo, data, qtd, obs, codigo, nome = r
        mes = (data or "")[:7] or "sem-data"
        if mes not in por_mes:
            por_mes[mes] = []
        por_mes[mes].append((mid, tipo, data, qtd, obs, codigo, nome))
    count = 0
    for mes, items in sorted(por_mes.items(), reverse=True):
        fm = frontmatter({
            "tipo": "movimentacoes",
            "periodo": mes,
            "total": len(items),
            "exportado": datetime.now().strftime("%Y-%m-%d %H:%M"),
        })
        linhas = []
        for mid, tipo, data, qtd, obs, codigo, nome in items:
            emoji = "📥" if tipo == "entrada" else "📤"
            linhas.append(f"| {data or '-'} | {emoji} {tipo} | {wikilink(nome, codigo)} | {qtd} | {obs or '-'} |")
        tabela = "\n".join(linhas)
        md = f"""{fm}

# Movimentacoes {mes}

| Data | Tipo | Produto | Qtd | Obs |
|------|------|---------|-----|-----|
{tabela}
"""
        arq = pasta / f"movimentacoes-{mes}.md"
        arq.write_text(md.strip() + "\n", encoding="utf-8")
        count += 1
    print(f"  Movimentacoes: {count} notas (ultimas 200)")

def export_alertas(conn: sqlite3.Connection, out: Path):
    """Exporta alertas ativos."""
    cur = conn.cursor()
    cur.execute("SELECT id, tipo, titulo, mensagem, data_alerta, lido FROM alertas WHERE lido=0 ORDER BY data_alerta DESC")
    rows = cur.fetchall()
    pasta = out / "Alertas"
    pasta.mkdir(parents=True, exist_ok=True)
    if not rows:
        print("  Alertas: 0 (nenhum ativo)")
        return
    fm = frontmatter({
        "tipo": "alertas",
        "total": len(rows),
        "exportado": datetime.now().strftime("%Y-%m-%d %H:%M"),
    })
    linhas = []
    for aid, tipo, titulo, msg, data, lido in rows:
        linhas.append(f"- **{titulo}** ({tipo}): {msg} _{data or '-'}_")
    md = f"""{fm}

# Alertas Ativos

{chr(10).join(linhas)}
"""
    arq = pasta / "alertas-ativos.md"
    arq.write_text(md.strip() + "\n", encoding="utf-8")
    print(f"  Alertas: {len(rows)} ativos")

def export_dashboard(conn: sqlite3.Connection, out: Path):
    """Exporta dashboard resumido como nota principal."""
    cur = conn.cursor()
    cur.execute("SELECT COUNT(*) FROM produtos WHERE ativo=1")
    total_prod = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM produtos WHERE ativo=1 AND estoque <= estoque_minimo")
    criticos = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM categorias WHERE ativa=1")
    total_cat = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM fornecedores WHERE ativo=1")
    total_forn = cur.fetchone()[0]
    cur.execute("SELECT SUM(estoque * preco_compra) FROM produtos WHERE ativo=1")
    valor_total = cur.fetchone()[0] or 0
    fm = frontmatter({
        "tipo": "dashboard",
        "total_produtos": total_prod,
        "estoque_critico": criticos,
        "total_categorias": total_cat,
        "total_fornecedores": total_forn,
        "valor_estoque": round(valor_total, 2),
        "exportado": datetime.now().strftime("%Y-%m-%d %H:%M"),
    })
    md = f"""{fm}

# Dashboard do Estoque

## Resumo

| Metrica | Valor |
|---------|-------|
| Total de produtos | {total_prod} |
| Categorias | {total_cat} |
| Fornecedores | {total_forn} |
| Estoque critico | {criticos} |
| Valor total em estoque | R$ {valor_total:,.2f} |

## Links Rapidos

- [[Categorias/]] — Todas as categorias
- [[Fornecedores/]] — Todos os fornecedores
- [[Produtos/]] — Todos os produtos
- [[Alertas/alertas-ativos]] — Alertas ativos
"""
    arq = out / "Dashboard.md"
    arq.write_text(md.strip() + "\n", encoding="utf-8")
    print(f"  Dashboard: 1 nota")

# ─── Mapa de exportadores ───

EXPORTADORES = {
    "produtos": export_produtos,
    "categorias": export_categorias,
    "fornecedores": export_fornecedores,
    "lojas": export_lojas,
    "movimentacoes": export_movimentacoes,
    "alertas": export_alertas,
    "dashboard": export_dashboard,
}

# ─── Main ───

def main():
    parser = argparse.ArgumentParser(description="Exporta Estoque de T.I. para Obsidian")
    parser.add_argument("--vault", type=str, default=str(DEFAULT_VAULT), help="Pasta do vault Obsidian")
    parser.add_argument("--tabela", type=str, help="Exportar apenas uma tabela")
    parser.add_argument("--tabelas", type=str, help="Exportar tabelas especificas (separadas por virgula)")
    parser.add_argument("--limpar", action="store_true", help="Remover notas anteriores antes de exportar")
    parser.add_argument("--db", type=str, default=str(DB_PATH), help="Caminho do banco SQLite")
    args = parser.parse_args()

    db = Path(args.db)
    if not db.exists():
        print(f"Banco nao encontrado: {db}")
        return 1

    vault = Path(args.vault)
    print(f"Banco: {db}")
    print(f"Vault: {vault}")

    conn = sqlite3.connect(str(db))

    # Determinar tabelas a exportar
    if args.tabela:
        tabelas = [args.tabela]
    elif args.tabelas:
        tabelas = [t.strip() for t in args.tabelas.split(",")]
    else:
        tabelas = list(EXPORTADORES.keys())

    # Limpar se solicitado
    if args.limpar:
        import shutil
        for t in tabelas:
            pasta = vault / t.capitalize()
            if pasta.exists():
                shutil.rmtree(pasta)
                print(f"  Removido: {pasta}")
        dashboard = vault / "Dashboard.md"
        if dashboard.exists():
            dashboard.unlink()
            print(f"  Removido: {dashboard}")

    print(f"\nExportando {len(tabelas)} tabela(s)...")
    for t in tabelas:
        if t in EXPORTADORES:
            EXPORTADORES[t](conn, vault)
        else:
            print(f"  Tabela desconhecida: {t}")

    conn.close()
    print(f"\nExportacao concluida em: {vault}")
    print(f"Abra o vault no Obsidian para visualizar as notas.")
    return 0

if __name__ == "__main__":
    exit(main())
