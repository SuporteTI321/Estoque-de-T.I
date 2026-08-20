import type { Produto } from "./types";

/**
 * Gera codigo sequencial para cada produto: 00001-SIGLA
 * onde SIGLA = primeiras 4 letras da categoria (ou "PROD").
 * Retorna a lista com o campo `codigo` atualizado.
 */
export function renumerar(lista: Produto[]): Produto[] {
  return [...lista]
    .sort((a, b) => a.id - b.id)
    .map((p, i) => {
      const cat = (p.categoria_nome || "PROD")
        .toUpperCase()
        .replace(/\s+/g, "");
      const sigla = cat.substring(0, 4);
      return {
        ...p,
        codigo: `${String(i + 1).padStart(5, "0")}-${sigla}`,
      };
    });
}

/**
 * Monta um Map<produto_id, codigo> a partir de uma lista de produtos.
 * Uso: const mapa = mapCodigo(produtos); const cod = mapa.get(id);
 */
export function mapCodigo(produtos: Produto[]): Map<number, string> {
  const mapa = new Map<number, string>();
  for (const p of produtos) {
    mapa.set(p.id, p.codigo);
  }
  return mapa;
}
