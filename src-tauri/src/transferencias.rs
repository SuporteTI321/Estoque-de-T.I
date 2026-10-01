//! ============================================================================
//!  TRANSFERÊNCIAS ENTRE LOJAS — base de produtos interligada
//! ============================================================================
//!
//! Tabelas envolvidas (criadas em `db::init`):
//! - `transferencias`      — cabeçalho + status (pendente → em_transito → concluida | cancelada)
//! - `transferencia_itens` — produtos da transferência (com snapshot de nome/código/unidade)
//! - `estoque_loja`        — saldo produto × loja (o estoque global de `produtos`
//!                           continua sendo a soma de todas as lojas)
//!
//! Regras de estoque:
//! - Somente CONCLUIR movimenta saldo (origem → destino), em transação e com
//!   revalidação do saldo da origem (pode ter mudado desde a criação).
//! - Cancelar/excluir não mexe em saldo.
//! - Entradas/saídas fora deste módulo crediam/debitam a loja informada (ou a
//!   principal) via `aplicar_efeito_estoque` / `reverter_efeito_estoque`.

use std::collections::HashMap;

use rusqlite::params;
use serde::{Deserialize, Serialize};

use crate::db;

// ============================================================================
//  ESTRUTURAS (formato JSON preservado para o frontend)
// ============================================================================

/// Cabeçalho de uma transferência entre lojas (status + totais calculados).
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Transferencia {
    pub id: i64,
    pub loja_origem_id: i64,
    pub loja_origem_nome: Option<String>,
    pub loja_destino_id: i64,
    pub loja_destino_nome: Option<String>,
    pub usuario_id: Option<i64>,
    pub usuario_nome: Option<String>,
    pub observacao: Option<String>,
    pub status: String,
    pub total_itens: i64,
    pub total_quantidade: i64,
    pub data_criacao: String,
    pub data_atualizacao: Option<String>,
}

/// Item (produto + quantidade) de uma transferência.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TransferenciaItem {
    pub id: i64,
    pub transferencia_id: i64,
    pub produto_id: i64,
    pub produto_nome: Option<String>,
    pub produto_codigo: Option<String>,
    pub unidade: Option<String>,
    pub quantidade: i64,
}

/// Entrada de criação de item (produto_id + quantidade).
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TransferenciaItemInput {
    pub produto_id: i64,
    pub quantidade: i64,
}

/// Saldo de um produto em uma loja específica.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct EstoqueLojaItem {
    pub produto_id: i64,
    pub produto_nome: String,
    pub produto_codigo: Option<String>,
    pub unidade: Option<String>,
    pub estoque_minimo: i64,
    pub loja_id: i64,
    pub loja_nome: Option<String>,
    pub quantidade: i64,
}

// ============================================================================
//  HELPERS — ESTOQUE POR LOJA (usados também pelo restante do backend)
// ============================================================================

/// Ajusta o saldo de um produto em uma loja (positivo soma, negativo subtrai,
/// nunca abaixo de zero). Não faz nada se produto/loja inválidos.
pub(crate) fn ajustar_estoque_loja(
    conn: &rusqlite::Connection,
    loja_id: i64,
    produto_id: i64,
    delta: i64,
) -> Result<(), String> {
    if produto_id <= 0 || loja_id <= 0 || delta == 0 {
        return Ok(());
    }
    conn.execute(
        "INSERT INTO estoque_loja (loja_id, produto_id, quantidade) VALUES (?1, ?2, MAX(0, ?3))
         ON CONFLICT(loja_id, produto_id) DO UPDATE SET quantidade = MAX(0, quantidade + ?3)",
        params![loja_id, produto_id, delta],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Move saldo de uma transferência entre lojas (estoque global inalterado).
fn mover_saldo_transferencia(
    conn: &rusqlite::Connection,
    produto_id: i64,
    quantidade: i64,
    loja_origem_id: Option<i64>,
    loja_destino_id: Option<i64>,
) -> Result<(), String> {
    if produto_id <= 0 {
        return Ok(());
    }
    if let Some(lo) = loja_origem_id {
        ajustar_estoque_loja(conn, lo, produto_id, -quantidade)?;
    }
    if let Some(ld) = loja_destino_id {
        ajustar_estoque_loja(conn, ld, produto_id, quantidade)?;
    }
    Ok(())
}

/// Aplica o efeito de uma movimentação no estoque global e no estoque por loja.
/// - `entrada`: soma no global e credita na loja `loja_destino_id`
/// - `saida`: subtrai do global e debita a loja `loja_origem_id`
/// - `transferencia`: apenas move o saldo entre lojas (global inalterado)
///
/// Sem loja informada, o estoque global é alterado mas o saldo por loja não é
/// tocado — não existe mais loja "principal" receiving estoque automático.
pub(crate) fn aplicar_efeito_estoque(
    conn: &rusqlite::Connection,
    tipo: &str,
    produto_id: i64,
    quantidade: i64,
    preco_compra: Option<f64>,
    loja_origem_id: Option<i64>,
    loja_destino_id: Option<i64>,
) -> Result<(), String> {
    if produto_id <= 0 {
        return Ok(());
    }
    match tipo {
        "entrada" => {
            let preco = preco_compra.unwrap_or(0.0);
            conn.execute(
                "UPDATE produtos SET estoque = estoque + ?1, custo_total = custo_total + (?2 * ?3) WHERE id=?4",
                params![quantidade, preco, quantidade as f64, produto_id],
            )
            .map_err(|e| e.to_string())?;
            if let Some(loja) = loja_destino_id {
                ajustar_estoque_loja(conn, loja, produto_id, quantidade)?;
            }
        }
        "saida" => {
            conn.execute(
                "UPDATE produtos SET estoque = MAX(0, estoque - ?1) WHERE id=?2",
                params![quantidade, produto_id],
            )
            .map_err(|e| e.to_string())?;
            if let Some(loja) = loja_origem_id {
                ajustar_estoque_loja(conn, loja, produto_id, -quantidade)?;
            }
        }
        "transferencia" => {
            mover_saldo_transferencia(conn, produto_id, quantidade, loja_origem_id, loja_destino_id)?;
        }
        _ => {}
    }
    Ok(())
}

/// Reverte o efeito de uma movimentação no estoque global e no estoque por loja.
pub(crate) fn reverter_efeito_estoque(
    conn: &rusqlite::Connection,
    tipo: &str,
    produto_id: i64,
    quantidade: i64,
    preco_compra: Option<f64>,
    loja_origem_id: Option<i64>,
    loja_destino_id: Option<i64>,
) -> Result<(), String> {
    if produto_id <= 0 {
        return Ok(());
    }
    match tipo {
        "entrada" => {
            let preco = preco_compra.unwrap_or(0.0);
            conn.execute(
                "UPDATE produtos SET estoque = MAX(0, estoque - ?1), custo_total = MAX(0, custo_total - (?2 * ?3)) WHERE id=?4",
                params![quantidade, preco, quantidade as f64, produto_id],
            )
            .map_err(|e| e.to_string())?;
            if let Some(loja) = loja_destino_id {
                ajustar_estoque_loja(conn, loja, produto_id, -quantidade)?;
            }
        }
        "saida" => {
            conn.execute(
                "UPDATE produtos SET estoque = estoque + ?1 WHERE id=?2",
                params![quantidade, produto_id],
            )
            .map_err(|e| e.to_string())?;
            if let Some(loja) = loja_origem_id {
                ajustar_estoque_loja(conn, loja, produto_id, quantidade)?;
            }
        }
        "transferencia" => {
            // Reverte o movimento: devolve na origem e remove do destino.
            if let Some(loja_o) = loja_origem_id {
                ajustar_estoque_loja(conn, loja_o, produto_id, quantidade)?;
            }
            if let Some(ld) = loja_destino_id {
                ajustar_estoque_loja(conn, ld, produto_id, -quantidade)?;
            }
        }
        _ => {}
    }
    Ok(())
}

// ============================================================================
//  LEITURA (cabeçalho)
// ============================================================================

/// SQL base do cabeçalho com totais calculados e joins de nomes.
const SQL_CABECALHO: &str = "SELECT t.id, t.loja_origem_id, lo.nome, t.loja_destino_id, ld.nome,
        t.usuario_id, u.nome, t.observacao, t.status,
        COALESCE((SELECT COUNT(*) FROM transferencia_itens ti WHERE ti.transferencia_id = t.id), 0),
        COALESCE((SELECT SUM(ti.quantidade) FROM transferencia_itens ti WHERE ti.transferencia_id = t.id), 0),
        t.data_criacao, t.data_atualizacao
   FROM transferencias t
   LEFT JOIN lojas lo ON t.loja_origem_id = lo.id
   LEFT JOIN lojas ld ON t.loja_destino_id = ld.id
   LEFT JOIN usuarios u ON t.usuario_id = u.id";

/// Converte uma linha do SQL base em `Transferencia`.
fn ler_cabecalho(row: &rusqlite::Row) -> rusqlite::Result<Transferencia> {
    Ok(Transferencia {
        id: row.get(0)?,
        loja_origem_id: row.get(1)?,
        loja_origem_nome: row.get(2)?,
        loja_destino_id: row.get(3)?,
        loja_destino_nome: row.get(4)?,
        usuario_id: row.get(5)?,
        usuario_nome: row.get(6)?,
        observacao: row.get(7)?,
        status: row.get(8)?,
        total_itens: row.get(9)?,
        total_quantidade: row.get(10)?,
        data_criacao: row.get(11)?,
        data_atualizacao: row.get(12)?,
    })
}

/// Lê uma transferência pelo id (após criação/alteração).
fn carregar_transferencia(conn: &rusqlite::Connection, id: i64) -> Result<Transferencia, String> {
    let sql = format!("{} WHERE t.id = ?1", SQL_CABECALHO);
    conn.query_row(&sql, params![id], ler_cabecalho)
        .map_err(|e| format!("Transferência não encontrada: {}", e))
}

// ============================================================================
//  COMANDOS TAURI (nomes inalterados — frontend não muda)
// ============================================================================

/// Lista transferências com totais de itens/quantidade calculados.
#[tauri::command(rename_all = "snake_case")]
pub fn list_transferencias() -> Result<Vec<Transferencia>, String> {
    let conn = db::open_conn().map_err(|e| e.to_string())?;
    let sql = format!("{} ORDER BY t.data_criacao DESC", SQL_CABECALHO);
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], ler_cabecalho).map_err(|e| e.to_string())?;
    rows.collect::<rusqlite::Result<Vec<_>>>().map_err(|e| e.to_string())
}

/// Itens (produtos) de uma transferência.
#[tauri::command(rename_all = "snake_case")]
pub fn list_transferencia_itens(transferencia_id: i64) -> Result<Vec<TransferenciaItem>, String> {
    let conn = db::open_conn().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT ti.id, ti.transferencia_id, ti.produto_id,
                    COALESCE(ti.produto_nome, p.nome), COALESCE(ti.produto_codigo, p.codigo),
                    COALESCE(ti.unidade, p.unidade), ti.quantidade
             FROM transferencia_itens ti
             LEFT JOIN produtos p ON ti.produto_id = p.id
             WHERE ti.transferencia_id = ?1
             ORDER BY ti.id",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![transferencia_id], |row| {
            Ok(TransferenciaItem {
                id: row.get(0)?,
                transferencia_id: row.get(1)?,
                produto_id: row.get(2)?,
                produto_nome: row.get(3)?,
                produto_codigo: row.get(4)?,
                unidade: row.get(5)?,
                quantidade: row.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<rusqlite::Result<Vec<_>>>().map_err(|e| e.to_string())
}

/// Cria uma transferência (status "pendente") validando o saldo da origem.
#[tauri::command(rename_all = "snake_case")]
pub fn create_transferencia(
    loja_origem_id: i64,
    loja_destino_id: i64,
    observacao: Option<String>,
    usuario_id: Option<i64>,
    itens: Vec<TransferenciaItemInput>,
) -> Result<Transferencia, String> {
    if loja_origem_id <= 0 || loja_destino_id <= 0 {
        return Err("Selecione as lojas de origem e destino.".to_string());
    }
    if loja_origem_id == loja_destino_id {
        return Err("A loja de origem e a de destino devem ser diferentes.".to_string());
    }
    if itens.is_empty() {
        return Err("Adicione ao menos um item à transferência.".to_string());
    }

    let conn = db::open_conn().map_err(|e| e.to_string())?;
    let now = chrono::Local::now().to_rfc3339();
    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;

    // As duas lojas precisam existir
    for lid in [loja_origem_id, loja_destino_id] {
        let existe: bool = tx
            .query_row("SELECT COUNT(*) > 0 FROM lojas WHERE id=?1", params![lid], |r| r.get(0))
            .map_err(|e| e.to_string())?;
        if !existe {
            return Err("Loja não encontrada. Verifique o cadastro de lojas.".to_string());
        }
    }

    // Consolidar quantidades por produto (mesmo produto pode repetir na lista)
    let mut exigido: HashMap<i64, i64> = HashMap::new();
    for item in &itens {
        if item.produto_id <= 0 {
            return Err("Item inválido: produto não informado.".to_string());
        }
        if item.quantidade <= 0 {
            return Err("Quantidade deve ser maior que zero em todos os itens.".to_string());
        }
        *exigido.entry(item.produto_id).or_insert(0) += item.quantidade;
    }

    // Validar saldo da loja de origem (estoque por loja)
    for (produto_id, qtd) in &exigido {
        let saldo: i64 = tx
            .query_row(
                "SELECT COALESCE(quantidade, 0) FROM estoque_loja WHERE loja_id=?1 AND produto_id=?2",
                params![loja_origem_id, produto_id],
                |r| r.get(0),
            )
            .unwrap_or(0);
        if saldo < *qtd {
            let nome: String = tx
                .query_row("SELECT nome FROM produtos WHERE id=?1", params![produto_id], |r| r.get(0))
                .unwrap_or_else(|_| format!("produto #{}", produto_id));
            return Err(format!(
                "Saldo insuficiente na loja de origem para \"{}\": disponível {}, solicitado {}.",
                nome, saldo, qtd
            ));
        }
    }

    tx.execute(
        "INSERT INTO transferencias (loja_origem_id, loja_destino_id, usuario_id, observacao, status, data_criacao)
         VALUES (?1, ?2, ?3, ?4, 'pendente', ?5)",
        params![loja_origem_id, loja_destino_id, usuario_id, observacao, now],
    )
    .map_err(|e| e.to_string())?;
    let id = tx.last_insert_rowid();

    // Snapshot de nome/código/unidade no momento da criação
    for item in &itens {
        let (nome, codigo, unidade): (Option<String>, Option<String>, Option<String>) = tx
            .query_row(
                "SELECT nome, codigo, unidade FROM produtos WHERE id=?1",
                params![item.produto_id],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
            )
            .unwrap_or((None, None, None));
        tx.execute(
            "INSERT INTO transferencia_itens (transferencia_id, produto_id, produto_nome, produto_codigo, unidade, quantidade)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![id, item.produto_id, nome, codigo, unidade, item.quantidade],
        )
        .map_err(|e| e.to_string())?;
    }

    tx.commit().map_err(|e| e.to_string())?;
    carregar_transferencia(&conn, id)
}

/// Avança/altera o status da transferência.
/// Transições: pendente → em_transito | concluida | cancelada;
///              em_transito → concluida | cancelada.
/// Ao concluir, move o saldo no estoque por loja (origem → destino).
#[tauri::command(rename_all = "snake_case")]
pub fn update_transferencia_status(id: i64, status: String) -> Result<Transferencia, String> {
    let permitido = matches!(
        status.as_str(),
        "pendente" | "em_transito" | "concluida" | "cancelada"
    );
    if !permitido {
        return Err(format!("Status inválido: {}", status));
    }

    let conn = db::open_conn().map_err(|e| e.to_string())?;
    let now = chrono::Local::now().to_rfc3339();
    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;

    let atual: String = tx
        .query_row("SELECT status FROM transferencias WHERE id=?1", params![id], |r| r.get(0))
        .map_err(|_| "Transferência não encontrada".to_string())?;

    let transicao_ok = matches!(
        (atual.as_str(), status.as_str()),
        ("pendente", "em_transito")
            | ("pendente", "concluida")
            | ("pendente", "cancelada")
            | ("em_transito", "concluida")
            | ("em_transito", "cancelada")
            | ("pendente", "pendente")
    );
    if !transicao_ok {
        return Err(format!(
            "Transição de status inválida: \"{}\" → \"{}\".",
            atual, status
        ));
    }

    // Ao concluir: mover saldo no estoque por loja (revalida saldo da origem)
    // e REGISTRAR A BAIXA no histórico de movimentações.
    if status == "concluida" && atual != "concluida" {
        // Os nomes das lojas vêm por JOIN: a tabela `transferencias` guarda
        // apenas os IDs (não tem colunas de nome). Consultar `loja_origem_nome`
        // aqui quebrava com "no such column" e o erro era mascarado como
        // "Transferência não encontrada" — por isso Concluir não funcionava.
        let (origem, destino, nome_origem, nome_destino, usuario_id): (i64, i64, Option<String>, Option<String>, Option<i64>) = tx
            .query_row(
                "SELECT t.loja_origem_id, t.loja_destino_id, lo.nome, ld.nome, t.usuario_id
                 FROM transferencias t
                 LEFT JOIN lojas lo ON lo.id = t.loja_origem_id
                 LEFT JOIN lojas ld ON ld.id = t.loja_destino_id
                 WHERE t.id = ?1",
                params![id],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?)),
            )
            .map_err(|e| format!("Falha ao ler a transferência #{}: {}", id, e))?;

        // Traz nome e unidade (snapshot do item) para a movimentação ficar legível
        let itens: Vec<(i64, i64, Option<String>, Option<String>)> = {
            let mut stmt = tx
                .prepare(
                    "SELECT produto_id, COALESCE(SUM(quantidade), 0), MAX(produto_nome), MAX(unidade)
                     FROM transferencia_itens WHERE transferencia_id=?1
                     GROUP BY produto_id",
                )
                .map_err(|e| e.to_string())?;
            let rows = stmt
                .query_map(params![id], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)))
                .map_err(|e| e.to_string())?;
            rows.filter_map(|r| r.ok()).collect()
        };

        for (produto_id, qtd, _, _) in &itens {
            let saldo: i64 = tx
                .query_row(
                    "SELECT COALESCE(quantidade, 0) FROM estoque_loja WHERE loja_id=?1 AND produto_id=?2",
                    params![origem, produto_id],
                    |r| r.get(0),
                )
                .unwrap_or(0);
            if saldo < *qtd {
                let nome: String = tx
                    .query_row("SELECT nome FROM produtos WHERE id=?1", params![produto_id], |r| r.get(0))
                    .unwrap_or_else(|_| format!("produto #{}", produto_id));
                return Err(format!(
                    "Não foi possível concluir: saldo da origem em \"{}\" ficou insuficiente ({} {}).",
                    nome,
                    saldo,
                    if saldo == 1 { "unidade" } else { "unidades" }
                ));
            }
            ajustar_estoque_loja(&tx, origem, *produto_id, -*qtd)?;
            ajustar_estoque_loja(&tx, destino, *produto_id, *qtd)?;
        }

        // Baixa no histórico: uma movimentação do tipo "transferencia" por item.
        // O saldo NÃO é aplicado de novo aqui (o movimento por loja já foi feito
        // acima) — o registro serve para a saída da origem aparecer no histórico
        // e nos relatórios, com a loja de destino ligada.
        for (produto_id, qtd, nome_item, unidade_item) in &itens {
            let nome_produto: Option<String> = match nome_item {
                Some(n) if !n.trim().is_empty() => Some(n.clone()),
                _ => tx
                    .query_row("SELECT nome FROM produtos WHERE id=?1", params![produto_id], |r| r.get(0))
                    .ok(),
            };
            let preco: Option<f64> = tx
                .query_row("SELECT preco_compra FROM produtos WHERE id=?1", params![produto_id], |r| r.get(0))
                .unwrap_or(None);
            // A unidade do item é texto ("CX / 12"); o campo `unidade` da
            // movimentação é multiplicador, então fica nulo e a unidade vai no
            // texto da observação, para a leitura não ficar ambígua.
            let unid_txt = match unidade_item {
                Some(u) if !u.trim().is_empty() => format!(" em {}", u.trim()),
                _ => String::new(),
            };
            tx.execute(
                "INSERT INTO movimentacoes (tipo, produto_id, produto_nome, quantidade, loja_origem_id, loja_origem_nome, loja_destino_id, loja_destino_nome, usuario_id, observacao, preco_compra, unidade, data_movimento)
                 VALUES ('transferencia', ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, NULL, ?11)",
                params![
                    produto_id,
                    nome_produto,
                    qtd,
                    origem,
                    nome_origem,
                    destino,
                    nome_destino,
                    usuario_id,
                    format!("Transferência #{} concluída{}", id, unid_txt),
                    preco,
                    now,
                ],
            )
            .map_err(|e| format!("Erro ao registrar a baixa da transferência: {}", e))?;
        }
    }

    tx.execute(
        "UPDATE transferencias SET status=?1, data_atualizacao=?2 WHERE id=?3",
        params![status, now, id],
    )
    .map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;

    carregar_transferencia(&conn, id)
}

/// Exclui uma transferência.
///
/// - `pendente`, `em_transito` e `cancelada`: nada foi movido, então é só
///   apagar o registro.
/// - `concluida`: ESTORNA — devolve as unidades à loja de origem, debita da loja
///   de destino e apaga a baixa registrada no histórico. Tudo em uma transação:
///   ou volta inteiro, ou nada muda.
#[tauri::command(rename_all = "snake_case")]
pub fn delete_transferencia(id: i64) -> Result<(), String> {
    let conn = db::open_conn().map_err(|e| e.to_string())?;
    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;

    let (status, origem, destino): (String, i64, i64) = match tx.query_row(
        "SELECT status, loja_origem_id, loja_destino_id FROM transferencias WHERE id=?1",
        params![id],
        |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
    ) {
        Ok(v) => v,
        Err(_) => {
            let _ = tx.rollback();
            return Err("Transferência não encontrada".to_string());
        }
    };

    let result: Result<(), String> = (|| {
        if status == "concluida" {
            let itens: Vec<(i64, i64)> = {
                let mut stmt = tx
                    .prepare(
                        "SELECT produto_id, COALESCE(SUM(quantidade), 0)
                         FROM transferencia_itens WHERE transferencia_id=?1 GROUP BY produto_id",
                    )
                    .map_err(|e| e.to_string())?;
                let rows = stmt
                    .query_map(params![id], |r| Ok((r.get(0)?, r.get(1)?)))
                    .map_err(|e| e.to_string())?;
                rows.filter_map(|r| r.ok()).collect()
            };
            for (produto_id, qtd) in &itens {
                // Devolve à origem e debita do destino (nunca fica negativo).
                ajustar_estoque_loja(&tx, origem, *produto_id, *qtd)?;
                ajustar_estoque_loja(&tx, destino, *produto_id, -*qtd)?;
            }
            // Apaga a baixa que a conclusão gravou, para o histórico não ficar
            // com uma saída que não aconteceu mais.
            tx.execute(
                "DELETE FROM movimentacoes
                 WHERE tipo = 'transferencia' AND observacao LIKE ?1",
                params![format!("Transferência #{} concluída%", id)],
            )
            .map_err(|e| e.to_string())?;
        }

        tx.execute("DELETE FROM transferencia_itens WHERE transferencia_id=?1", params![id])
            .map_err(|e| e.to_string())?;
        tx.execute("DELETE FROM transferencias WHERE id=?1", params![id])
            .map_err(|e| e.to_string())?;
        Ok(())
    })();

    match result {
        Ok(()) => {
            tx.commit().map_err(|e| e.to_string())?;
            Ok(())
        }
        Err(e) => {
            let _ = tx.rollback();
            Err(e)
        }
    }
}

/// Define o saldo de um produto numa loja e mantém o estoque global
/// (soma dos saldos por loja) consistente.
///
/// Usado no cadastro de equipamento feito dentro da Transferência: o produto
/// pode nascer com saldo na loja de origem para já poder ser transferido.
#[tauri::command(rename_all = "snake_case")]
pub fn definir_saldo_inicial_loja(
    produto_id: i64,
    loja_id: i64,
    quantidade: i64,
) -> Result<(), String> {
    if produto_id <= 0 || loja_id <= 0 || quantidade < 0 {
        return Err("Produto, loja ou quantidade inválidos.".to_string());
    }
    let conn = db::open_conn().map_err(|e| e.to_string())?;
    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
    tx.execute(
        "INSERT INTO estoque_loja (loja_id, produto_id, quantidade) VALUES (?1, ?2, ?3)
         ON CONFLICT(loja_id, produto_id) DO UPDATE SET quantidade = ?3",
        params![loja_id, produto_id, quantidade],
    )
    .map_err(|e| e.to_string())?;
    tx.execute(
        "UPDATE produtos SET estoque = (SELECT COALESCE(SUM(quantidade), 0) FROM estoque_loja WHERE produto_id = ?1) WHERE id = ?1",
        params![produto_id],
    )
    .map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

/// Saldo de todos os produtos ativos em uma loja (base interligada de produtos).
#[tauri::command(rename_all = "snake_case")]
pub fn list_estoque_loja(loja_id: i64) -> Result<Vec<EstoqueLojaItem>, String> {
    let conn = db::open_conn().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT p.id, p.nome, p.codigo, p.unidade, p.estoque_minimo, ?1, l.nome, COALESCE(e.quantidade, 0)
             FROM produtos p
             LEFT JOIN estoque_loja e ON e.produto_id = p.id AND e.loja_id = ?1
             LEFT JOIN lojas l ON l.id = ?1
             WHERE p.ativo = 1
             ORDER BY p.nome",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![loja_id], |row| {
            Ok(EstoqueLojaItem {
                produto_id: row.get(0)?,
                produto_nome: row.get(1)?,
                produto_codigo: row.get(2)?,
                unidade: row.get(3)?,
                estoque_minimo: row.get(4)?,
                loja_id: row.get(5)?,
                loja_nome: row.get(6)?,
                quantidade: row.get(7)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<rusqlite::Result<Vec<_>>>().map_err(|e| e.to_string())
}

/// Saldo de um produto em uma loja, para a listagem "onde está o estoque".
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SaldoProdutoLoja {
    pub produto_id: i64,
    pub loja_id: i64,
    pub loja_nome: String,
    pub quantidade: i64,
}

/// Saldo de TODOS os produtos em TODAS as lojas (somente o que tem saldo).
///
/// Usado pela tela de Produtos para mostrar onde o item está: em transferência o
/// total global não muda, então sem esta leitura não dá para ver que o item
/// saiu da loja de origem e chegou na de destino.
#[tauri::command(rename_all = "snake_case")]
pub fn list_saldos_produto_loja() -> Result<Vec<SaldoProdutoLoja>, String> {
    let conn = db::open_conn().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT e.produto_id, e.loja_id, l.nome, e.quantidade
             FROM estoque_loja e
             JOIN lojas l ON l.id = e.loja_id
             WHERE COALESCE(e.quantidade, 0) > 0
             ORDER BY l.nome, e.produto_id",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(SaldoProdutoLoja {
                produto_id: row.get(0)?,
                loja_id: row.get(1)?,
                loja_nome: row.get(2)?,
                quantidade: row.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<rusqlite::Result<Vec<_>>>().map_err(|e| e.to_string())
}
