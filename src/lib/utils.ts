import type { Produto } from "./types";
import { getSigla } from "./regrasCodigo";

/**
 * Gera a sigla vigente de uma categoria.
 * Fonte única: Centro de Regras (Configurações > Regras).
 * Mantido aqui por compatibilidade com Produtos/Entradas/Saídas.
 */
export function siglaCategoria(catNome?: string | null, catId?: number | null): string {
  return getSigla(catNome, catId);
}

/**
 * Gera codigo sequencial para cada produto: XXXXX-SIGLA
 * onde SIGLA = sigla oficial da categoria (ou "PROD").
 * Retorna a lista com o campo `codigo` atualizado.
 */
export function renumerar(lista: Produto[]): Produto[] {
  // Usa max+1 (não índice) para nunca colidir com códigos existentes após exclusões
  let max = 0;
  for (const p of lista) {
    const m = p.codigo?.match(/^(\d+)-/);
    if (m) { const n = parseInt(m[1], 10); if (n > max) max = n; }
  }
  let next = max + 1;
  return [...lista]
    .sort((a, b) => a.id - b.id)
    .map((p) => {
      // Preserva o codigo real vindo do banco
      if (p.codigo) return p;
      const sigla = siglaCategoria(p.categoria_nome, p.categoria_id);
      return {
        ...p,
        codigo: `${String(next++).padStart(5, "0")}-${sigla}`,
      };
    });
}

/**
 * Mapa inverso: sigla antiga → sigla nova (para migração).
 * Usado para atualizar códigos que ainda usam siglas antigas.
 */
const MIGRACAO_SIGLAS: Record<string, string> = {
  'CABO': 'CFPC',  // Cabo de Força de PC
  'SEGU': 'PSEG',  // Proteção e Segurança
  'AVID': 'AAVI',  // Áudio e Vídeo
  'MATE': 'MESC',  // Material de Escritório (fallback antigo)
};

/**
 * Verifica se a sigla de um código está desatualizada.
 * Retorna a nova sigla se precisar migrar, ou null se já está correta.
 */
export function migrarSigla(codigoAtual: string, catNome?: string | null, catId?: number | null): string | null {
  const match = codigoAtual.match(/^(\d+)-([A-Z_]{4})$/);
  if (!match) return null;
  const [, num, siglaAntiga] = match;
  // Se a sigla antiga está no mapa de migração, retorna a nova
  if (MIGRACAO_SIGLAS[siglaAntiga]) {
    const novaSigla = MIGRACAO_SIGLAS[siglaAntiga];
    return `${num}-${novaSigla}`;
  }
  // Se a sigla não bate com a categoria atual, corrige
  const siglaEsperada = siglaCategoria(catNome, catId);
  if (siglaAntiga !== siglaEsperada) {
    return `${num}-${siglaEsperada}`;
  }
  return null;
}

/**
 * Atualiza códigos com siglas desatualizadas para as oficiais.
 * Retorna a lista com códigos corrigidos + flag de alteração.
 */
export function migrarCodigos(lista: Produto[]): { lista: Produto[]; alterados: number } {
  let alterados = 0;
  const listaAtualizada = lista.map(p => {
    if (!p.codigo) return p;
    const novoCodigo = migrarSigla(p.codigo, p.categoria_nome, p.categoria_id);
    if (novoCodigo && novoCodigo !== p.codigo) {
      alterados++;
      return { ...p, codigo: novoCodigo };
    }
    return p;
  });
  return { lista: listaAtualizada, alterados };
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
