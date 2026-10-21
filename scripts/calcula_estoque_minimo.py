#!/usr/bin/env python3
"""
calcula_estoque_minimo.py — deriva o estoque mínimo a partir do consumo real.

Por que: com `estoque_minimo = 0` em todos os produtos, o alerta de "estoque
baixo" nunca dispara e o card "Estoque baixo" do dashboard fica sempre em 0 —
o app não consegue dizer o que precisa de reposição.

Regra (30 dias de cobertura):
    estoque_minimo = max(1, ceil((saidas / dias_observados) * 30))

O piso de 1 garante que um item com 1 unidade restante já conte como "baixo"
(0 = pode zerar, que é o estado "sem estoque", tratado separadamente).

Uso:
  python scripts/calcula_estoque_minimo.py            # mostra o que seria feito
  python scripts/calcula_estoque_minimo.py --aplicar   # grava no banco
"""
import datetime
import math
import os
import sqlite3
import sys

DIAS_COBERTURA = 30
PISO = 1
DIAS_MINIMO_OBSERVACAO = 14  # abaixo disso o consumo é amostra pequena demais


def caminho_db() -> str:
    return os.path.join(os.environ["APPDATA"], "EstoqueTI", "almoxarifado.db")


def para_data(s: str) -> datetime.date:
    return datetime.datetime.fromisoformat(s.replace("Z", "+00:00")).date()


def main() -> int:
    aplicar = "--aplicar" in sys.argv
    db = caminho_db()
    if not os.path.exists(db):
        print("Banco nao encontrado:", db)
        return 1

    conn = sqlite3.connect(db)
    datas = [r[0] for r in conn.execute("SELECT data_movimento FROM movimentacoes")]
    if not datas:
        print("Sem movimentacoes: nao ha base para calcular.")
        return 1
    inicio, fim = min(map(para_data, datas)), max(map(para_data, datas))
    dias = (fim - inicio).days + 1

    print("periodo observado: %s -> %s (%d dias)" % (inicio, fim, dias))
    if dias < DIAS_MINIMO_OBSERVACAO:
        print("AVISO: periodo curto (%d dias); os minimos ficam pouco confiaveis." % dias)
    print()

    print("%-14s %-32s %5s %6s %8s %8s" % ("codigo", "produto", "estoq", "saida", "cons/dia", "minimo"))
    calc = []
    for cod, nome, est, saida in conn.execute("""
        SELECT pr.codigo, pr.nome, pr.estoque,
               COALESCE((SELECT SUM(m.quantidade) FROM movimentacoes m
                          WHERE m.produto_id = pr.id AND m.tipo='saida'), 0)
          FROM produtos pr ORDER BY pr.id"""):
        consumo = saida / dias
        minimo = max(PISO, math.ceil(consumo * DIAS_COBERTURA))
        calc.append((cod, nome, est, saida, consumo, minimo))
        print("%-14s %-32s %5d %6d %8.3f %8d" % (
            cod, (nome or "")[:32], est, saida, consumo, minimo))

    baixo = sum(1 for c in calc if 0 < c[2] <= c[5])
    zerado = sum(1 for c in calc if c[2] <= 0)
    print()
    print("resultado: %d produto(s) com estoque abaixo do minimo | %d zerado(s)" % (baixo, zerado))

    if not aplicar:
        print("\n(dry-run) use --aplicar para gravar no banco")
        conn.close()
        return 0

    conn.execute("BEGIN")
    for cod, nome, est, saida, consumo, minimo in calc:
        conn.execute("UPDATE produtos SET estoque_minimo=?1 WHERE codigo=?2", (minimo, cod))
    conn.execute("COMMIT")
    print("\naplicado: %d produto(s) com estoque_minimo definido" % len(calc))
    print("integridade:", conn.execute("PRAGMA integrity_check").fetchone()[0])
    conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
