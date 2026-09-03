mod db;

use rusqlite::params;
use serde::{Deserialize, Serialize};
use base64::Engine;
use argon2::{
    password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2, Algorithm, Version, Params,
};

// ============================================================================
//  SEGURANÇA: Rate Limiting Backend (persistente em SQLite)
// ============================================================================

const RATE_LIMIT_MAX_ATTEMPTS: i64 = 5;
const RATE_LIMIT_LOCKOUT_MS: i64 = 15 * 60 * 1000; // 15 minutos

fn rate_limit_check(conn: &rusqlite::Connection, chave: &str) -> Result<(bool, i64), String> {
    let now = chrono::Utc::now().timestamp_millis();
    let row: Option<(i64, i64, Option<i64>)> = conn
        .query_row(
            "SELECT tentativas, primeiro_attempt, bloqueado_ate FROM rate_limit WHERE chave=?1",
            params![chave],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .ok();

    if let Some((_tentativas, _primeiro, bloqueado_ate)) = row {
        if let Some(bloqueado) = bloqueado_ate {
            if now < bloqueado {
                let remaining = (bloqueado - now) / 1000;
                return Err(format!(
                    "Conta bloqueada. Tente novamente em {} segundos.",
                    remaining
                ));
            }
            // Lockout expirou — resetar
            conn.execute(
                "DELETE FROM rate_limit WHERE chave=?1",
                params![chave],
            )
            .map_err(|e| e.to_string())?;
            return Ok((false, 0));
        }
    }
    Ok((false, 0))
}

fn rate_limit_record_failure(conn: &rusqlite::Connection, chave: &str) -> Result<bool, String> {
    let now = chrono::Utc::now().timestamp_millis();
    let row: Option<(i64, i64)> = conn
        .query_row(
            "SELECT tentativas, primeiro_attempt FROM rate_limit WHERE chave=?1",
            params![chave],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .ok();

    let (tentativas, primeiro) = row.unwrap_or((0, now));
    let novas_tentativas = tentativas + 1;

    if novas_tentativas >= RATE_LIMIT_MAX_ATTEMPTS {
        let bloqueado_ate = now + RATE_LIMIT_LOCKOUT_MS;
        conn.execute(
            "INSERT OR REPLACE INTO rate_limit (chave, tentativas, primeiro_attempt, bloqueado_ate) VALUES (?1, ?2, ?3, ?4)",
            params![chave, novas_tentativas, primeiro, bloqueado_ate],
        )
        .map_err(|e| e.to_string())?;
        return Ok(true); // bloqueou
    }

    conn.execute(
        "INSERT OR REPLACE INTO rate_limit (chave, tentativas, primeiro_attempt, bloqueado_ate) VALUES (?1, ?2, ?3, NULL)",
        params![chave, novas_tentativas, primeiro],
    )
    .map_err(|e| e.to_string())?;
    Ok(false)
}

fn rate_limit_clear(conn: &rusqlite::Connection, chave: &str) -> Result<(), String> {
    conn.execute("DELETE FROM rate_limit WHERE chave=?1", params![chave])
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ============================================================================
//  SEGURANÇA: Audit Log
// ============================================================================

fn audit_log(
    conn: &rusqlite::Connection,
    usuario_id: Option<i64>,
    usuario_email: &str,
    acao: &str,
    tabela: Option<&str>,
    registro_id: Option<i64>,
    detalhes: Option<&str>,
) {
    let now = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string();
    let _ = conn.execute(
        "INSERT INTO audit_log (usuario_id, usuario_email, acao, tabela, registro_id, detalhes, data_hora) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![usuario_id, usuario_email, acao, tabela, registro_id, detalhes, now],
    );
}

// ============================================================================
//  SEGURANÇA: Validação de Senha Forte
// ============================================================================

fn validate_password_strength(senha: &str) -> Result<(), String> {
    if senha.len() < 8 {
        return Err("Senha deve ter no mínimo 8 caracteres".to_string());
    }
    if senha.len() > 128 {
        return Err("Senha deve ter no máximo 128 caracteres".to_string());
    }
    let has_upper = senha.chars().any(|c| c.is_uppercase());
    let has_lower = senha.chars().any(|c| c.is_lowercase());
    let has_digit = senha.chars().any(|c| c.is_ascii_digit());
    let has_special = senha.chars().any(|c| !c.is_alphanumeric());

    if !has_upper {
        return Err("Senha deve conter pelo menos 1 letra maiúscula".to_string());
    }
    if !has_lower {
        return Err("Senha deve conter pelo menos 1 letra minúscula".to_string());
    }
    if !has_digit {
        return Err("Senha deve conter pelo menos 1 número".to_string());
    }
    if !has_special {
        return Err("Senha deve conter pelo menos 1 caractere especial".to_string());
    }
    Ok(())
}

// ============================================================================
//  SEGURANÇA: Session Management
// ============================================================================

const SESSION_TIMEOUT_MS: i64 = 8 * 60 * 60 * 1000; // 8 horas

fn create_session(conn: &rusqlite::Connection, usuario_id: i64) -> Result<String, String> {
    let now = chrono::Utc::now().timestamp_millis();
    let expires = now + SESSION_TIMEOUT_MS;
    let session_id = format!("{}-{}", now, usuario_id);
    conn.execute(
        "INSERT INTO sessoes (id, usuario_id, criada_em, expira_em) VALUES (?1, ?2, ?3, ?4)",
        params![session_id, usuario_id, now, expires],
    )
    .map_err(|e| e.to_string())?;
    Ok(session_id)
}

fn validate_session(conn: &rusqlite::Connection, session_id: &str) -> Result<bool, String> {
    let now = chrono::Utc::now().timestamp_millis();
    let row: Option<(i64, i64)> = conn
        .query_row(
            "SELECT expira_em, ativa FROM sessoes WHERE id=?1",
            params![session_id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .ok();

    if let Some((expira_em, ativa)) = row {
        if ativa == 1 && now < expira_em {
            return Ok(true);
        }
    }
    Ok(false)
}

fn invalidate_session(conn: &rusqlite::Connection, session_id: &str) -> Result<(), String> {
    conn.execute(
        "UPDATE sessoes SET ativa=0 WHERE id=?1",
        params![session_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

// ============================================================================
//  PASSWORD HASHING (Argon2id — OWASP 2024 recommendation)
// ====================================================================

fn hash_password(password: &str) -> String {
    let salt = SaltString::generate(&mut OsRng);
    let argon2 = Argon2::new(Algorithm::Argon2id, Version::V0x13, Params::default());
    argon2.hash_password(password.as_bytes(), &salt)
        .expect("Falha ao gerar hash de senha")
        .to_string()
}

fn check_password_hash(password: &str, hash: &str) -> bool {
    // Tenta verificar como Argon2
    if let Ok(parsed) = PasswordHash::new(hash) {
        return Argon2::default().verify_password(password.as_bytes(), &parsed).is_ok();
    }
    // Hash invalido — recusar login (senhas em texto plano nao sao mais aceitas)
    false
}

/// Se a senha armazenada estiver em texto plano e bater, retorna Some(hash_novo).
/// Chamado apos login bem-sucedido para migrar automaticamente.
fn maybe_migrate_password(password: &str, stored_hash: &str) -> Option<String> {
    let is_plaintext = PasswordHash::new(stored_hash).is_err();
    if is_plaintext && password == stored_hash {
        Some(hash_password(password))
    } else {
        None
    }
}

// ============================================================================
//  MODELS
// ============================================================================

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Loja {
    pub id: i64,
    pub nome: String,
    pub codigo: String,
    pub endereco: Option<String>,
    pub ativa: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Categoria {
    pub id: i64,
    pub nome: String,
    pub descricao: Option<String>,
    pub ativa: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Fornecedor {
    pub id: i64,
    pub nome: String,
    pub cnpj: Option<String>,
    pub contato: Option<String>,
    pub email: Option<String>,
    pub telefone: Option<String>,
    pub ativo: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Produto {
    pub id: i64,
    pub codigo: String,
    pub nome: String,
    pub marca: Option<String>,
    pub modelo: Option<String>,
    pub descricao: Option<String>,
    pub categoria_id: Option<i64>,
    pub categoria_nome: Option<String>,
    pub fornecedor_id: Option<i64>,
    pub fornecedor_nome: Option<String>,
    pub unidade: String,
    pub preco_compra: f64,
    pub preco_venda: f64,
    pub estoque: i64,
    pub estoque_minimo: i64,
    pub custo_total: f64,
    pub ativo: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Usuario {
    pub id: i64,
    pub nome: String,
    pub email: String,
    // default: leitura tolera ausencia de senha em exports antigos.
    // A senha (hash Argon2) E serializada no export p/ sync; comandos ao frontend retornam senha vazia.
    #[serde(default)]
    pub senha: String,
    pub perfil: String,
    pub loja_id: Option<i64>,
    pub loja_nome: Option<String>,
    pub ativo: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Movimentacao {
    pub id: i64,
    pub tipo: String,
    pub produto_id: i64,
    pub produto_nome: Option<String>,
    pub quantidade: i64,
    pub loja_origem_id: Option<i64>,
    pub loja_origem_nome: Option<String>,
    pub loja_destino_id: Option<i64>,
    pub loja_destino_nome: Option<String>,
    pub usuario_id: Option<i64>,
    pub observacao: Option<String>,
    pub data_movimento: String,
    pub preco_compra: Option<f64>,
    pub unidade: Option<i64>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Solicitacao {
    pub id: i64,
    pub loja_id: i64,
    pub loja_nome: Option<String>,
    pub usuario_id: Option<i64>,
    pub usuario_nome: Option<String>,
    pub observacao: Option<String>,
    pub status: String,
    pub data_solicitacao: String,
    pub total_itens: Option<i64>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SolicitacaoItem {
    pub id: i64,
    pub solicitacao_id: i64,
    pub produto_id: i64,
    pub produto_nome: Option<String>,
    pub produto_codigo: Option<String>,
    pub unidade: Option<String>,
    pub quantidade: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Pedido {
    pub id: i64,
    pub numero: String,
    pub loja_id: i64,
    pub loja_nome: Option<String>,
    pub loja_codigo: Option<String>,
    pub solicitante: String,
    pub origem: Option<String>,
    pub status: String,
    pub arquivo_pdf: Option<String>,
    pub data_pedido: String,
    pub setor: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PedidoItem {
    pub id: i64,
    pub pedido_id: i64,
    pub produto_id: i64,
    pub produto_nome: String,
    pub unidade: Option<String>,
    pub quantidade: f64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Alerta {
    pub id: i64,
    pub tipo: String,
    pub titulo: String,
    pub mensagem: String,
    pub data_alerta: String,
    pub lido: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DashboardStats {
    pub total_produtos: i64,
    pub itens_estoque: i64,
    pub estoque_baixo: i64,
    pub itens_indisponiveis: i64,
    pub solicitacoes_pendentes: i64,
    pub entradas_mes: i64,
    pub saidas_mes: i64,
    pub valor_total_estoque: f64,
}

// ============================================================================
//  DASHBOARD
// ============================================================================

#[tauri::command(rename_all = "snake_case")]
fn delete_all_produtos(usuario_id: i64) -> Result<(), String> {
    let mut conn = db::open_conn().map_err(|e| e.to_string())?;
    // Verificar se usuario e admin
    let perfil: String = conn
        .query_row("SELECT perfil FROM usuarios WHERE id=?1 AND ativo=1", params![usuario_id], |r| r.get(0))
        .map_err(|_| "Usuario nao encontrado".to_string())?;
    if perfil != "admin" {
        return Err("Apenas administradores podem excluir todos os produtos".to_string());
    }
    // Excluir em transação, removendo antes os registros que referenciam produtos (FK)
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM movimentacoes WHERE produto_id IN (SELECT id FROM produtos)", [])
        .map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM pedido_itens WHERE produto_id IN (SELECT id FROM produtos)", [])
        .map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM solicitacao_itens WHERE produto_id IN (SELECT id FROM produtos)", [])
        .map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM produtos", []).map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
fn delete_all_movimentacoes(usuario_id: i64) -> Result<(), String> {
    let conn = db::open_conn().map_err(|e| e.to_string())?;
    // Verificar se usuario e admin
    let perfil: String = conn
        .query_row("SELECT perfil FROM usuarios WHERE id=?1 AND ativo=1", params![usuario_id], |r| r.get(0))
        .map_err(|_| "Usuario nao encontrado".to_string())?;
    if perfil != "admin" {
        return Err("Apenas administradores podem excluir todas as movimentacoes".to_string());
    }
    conn.execute("DELETE FROM movimentacoes", []).map_err(|e| e.to_string())?;
    Ok(())
}
#[tauri::command(rename_all = "snake_case")]
fn delete_produto(id: i64) -> Result<(), String> {
    let conn = db::open_conn().map_err(|e| e.to_string())?;
    // Reverter estoque: subtrair todas as entradas e somar todas as saídas
    let estoque: i64 = conn
        .query_row("SELECT COALESCE(estoque, 0) FROM produtos WHERE id=?1", params![id], |r| r.get(0))
        .unwrap_or(0);
    if estoque > 0 {
        conn.execute("UPDATE produtos SET estoque = 0, custo_total = 0 WHERE id=?1", params![id])
            .map_err(|e| e.to_string())?;
    }
    conn.execute("DELETE FROM movimentacoes WHERE produto_id=?1", params![id]).map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM produtos WHERE id=?1", params![id]).map_err(|e| e.to_string())?;
    Ok(())
}

/// Aplica o efeito de uma movimentação no estoque/custo do produto.
fn aplicar_efeito_estoque(
    conn: &rusqlite::Connection,
    tipo: &str,
    produto_id: i64,
    quantidade: i64,
    preco_compra: Option<f64>,
) -> Result<(), String> {
    if produto_id <= 0 {
        return Ok(());
    }
    match tipo {
        "entrada" => {
            let preco = preco_compra.unwrap_or(0.0);
            let qty = quantidade as f64;
            conn.execute(
                "UPDATE produtos SET estoque = estoque + ?1, custo_total = custo_total + (?2 * ?3) WHERE id=?4",
                params![quantidade, preco, qty, produto_id],
            )
            .map_err(|e| e.to_string())?;
        }
        "saida" | "transferencia" => {
            conn.execute(
                "UPDATE produtos SET estoque = MAX(0, estoque - ?1) WHERE id=?2",
                params![quantidade, produto_id],
            )
            .map_err(|e| e.to_string())?;
        }
        _ => {}
    }
    Ok(())
}

/// Reverte o efeito de uma movimentação no estoque/custo do produto.
fn reverter_efeito_estoque(
    conn: &rusqlite::Connection,
    tipo: &str,
    produto_id: i64,
    quantidade: i64,
    preco_compra: Option<f64>,
) -> Result<(), String> {
    if produto_id <= 0 {
        return Ok(());
    }
    match tipo {
        "entrada" => {
            let preco = preco_compra.unwrap_or(0.0);
            let qty = quantidade as f64;
            conn.execute(
                "UPDATE produtos SET estoque = MAX(0, estoque - ?1), custo_total = MAX(0, custo_total - (?2 * ?3)) WHERE id=?4",
                params![quantidade, preco, qty, produto_id],
            )
            .map_err(|e| e.to_string())?;
        }
        "saida" | "transferencia" => {
            conn.execute(
                "UPDATE produtos SET estoque = estoque + ?1 WHERE id=?2",
                params![quantidade, produto_id],
            )
            .map_err(|e| e.to_string())?;
        }
        _ => {}
    }
    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
fn update_movimentacao(
    id: i64,
    quantidade: Option<i64>,
    preco_compra: Option<f64>,
    unidade: Option<i64>,
    observacao: Option<String>,
) -> Result<Movimentacao, String> {
    let mut conn = db::open_conn().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    // Estado antigo para reverter o efeito no estoque
    let (tipo_antigo, prod_antigo, qtd_antiga, preco_antigo): (String, i64, i64, Option<f64>) = tx
        .query_row(
            "SELECT tipo, produto_id, quantidade, preco_compra FROM movimentacoes WHERE id=?1",
            params![id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        )
        .map_err(|_| "Movimentação não encontrada".to_string())?;
    if let Some(q) = quantidade {
        tx.execute("UPDATE movimentacoes SET quantidade=?1 WHERE id=?2", params![q, id]).map_err(|e| e.to_string())?;
    }
    if let Some(pc) = preco_compra {
        tx.execute("UPDATE movimentacoes SET preco_compra=?1 WHERE id=?2", params![pc, id]).map_err(|e| e.to_string())?;
    }
    if let Some(u) = unidade {
        tx.execute("UPDATE movimentacoes SET unidade=?1 WHERE id=?2", params![u, id]).map_err(|e| e.to_string())?;
    }
    if let Some(o) = observacao {
        tx.execute("UPDATE movimentacoes SET observacao=?1 WHERE id=?2", params![o, id]).map_err(|e| e.to_string())?;
    }
    // Estado novo após as alterações
    let (tipo_novo, prod_novo, qtd_nova, preco_novo): (String, i64, i64, Option<f64>) = tx
        .query_row(
            "SELECT tipo, produto_id, quantidade, preco_compra FROM movimentacoes WHERE id=?1",
            params![id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        )
        .map_err(|e| e.to_string())?;
    // Reverter efeito antigo e aplicar o novo
    reverter_efeito_estoque(&tx, &tipo_antigo, prod_antigo, qtd_antiga, preco_antigo)?;
    aplicar_efeito_estoque(&tx, &tipo_novo, prod_novo, qtd_nova, preco_novo)?;
    tx.commit().map_err(|e| e.to_string())?;
    // Retornar movimentação atualizada
    let mov = conn.query_row(
        "SELECT m.id, m.tipo, m.produto_id, COALESCE(m.produto_nome, p.nome), m.quantidade, m.loja_origem_id, COALESCE(m.loja_origem_nome, lo.nome), m.loja_destino_id, COALESCE(m.loja_destino_nome, ld.nome), m.usuario_id, m.observacao, m.data_movimento, m.preco_compra, m.unidade
         FROM movimentacoes m LEFT JOIN produtos p ON m.produto_id = p.id LEFT JOIN lojas lo ON m.loja_origem_id = lo.id LEFT JOIN lojas ld ON m.loja_destino_id = ld.id WHERE m.id=?1",
        params![id],
        |row| Ok(Movimentacao {
            id: row.get(0)?, tipo: row.get(1)?, produto_id: row.get(2)?, produto_nome: row.get(3)?,
            quantidade: row.get(4)?, loja_origem_id: row.get(5)?, loja_origem_nome: row.get(6)?,
            loja_destino_id: row.get(7)?, loja_destino_nome: row.get(8)?, usuario_id: row.get(9)?,
            observacao: row.get(10)?, data_movimento: row.get(11)?, preco_compra: row.get(12)?, unidade: row.get(13)?,
        }),
    ).map_err(|e| e.to_string())?;
    Ok(mov)
}

#[tauri::command(rename_all = "snake_case")]
fn delete_movimentacao(id: i64) -> Result<(), String> {
    let mut conn = db::open_conn().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    // Buscar dados da movimentação antes de deletar
    let mov: Option<(String, i64, i64, Option<f64>)> = tx
        .query_row(
            "SELECT tipo, produto_id, quantidade, preco_compra FROM movimentacoes WHERE id=?1",
            params![id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        )
        .ok();
    if let Some((tipo, produto_id, quantidade, preco)) = mov {
        reverter_efeito_estoque(&tx, &tipo, produto_id, quantidade, preco)?;
    }
    tx.execute("DELETE FROM movimentacoes WHERE id=?1", params![id]).map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}


#[tauri::command(rename_all = "snake_case")]
fn update_produto_categoria(id: i64, categoria_id: Option<i64>) -> Result<(), String> {
    let conn = db::open_conn().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE produtos SET categoria_id=?1 WHERE id=?2",
        params![categoria_id, id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
fn delete_pedido(id: i64) -> Result<(), String> {
    let conn = db::open_conn().map_err(|e| e.to_string())?;
    // Ignora se tabela pedido_itens nao existir
    let _ = conn.execute("DELETE FROM pedido_itens WHERE pedido_id = ?1", params![id]);
    conn.execute("DELETE FROM pedidos WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
fn update_pedido(id: i64, status: String) -> Result<(), String> {
    let conn = db::open_conn().map_err(|e| e.to_string())?;
    conn.execute("UPDATE pedidos SET status=?1 WHERE id=?2", params![status, id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
fn dashboard_stats() -> Result<DashboardStats, String> {
    let conn = db::open_conn().map_err(|e| e.to_string())?;
    let total_produtos: i64 = conn
        .query_row("SELECT COUNT(*) FROM produtos WHERE ativo=1", [], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    let itens_estoque: i64 = conn
        .query_row(
            "SELECT COALESCE(SUM(estoque),0) FROM produtos WHERE ativo=1",
            [],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    let estoque_baixo: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM produtos WHERE ativo=1 AND estoque <= estoque_minimo AND estoque > 0",
            [],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    let itens_indisponiveis: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM produtos WHERE ativo=1 AND estoque = 0",
            [],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    let solicitacoes_pendentes: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM solicitacoes WHERE status='pendente'",
            [],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    let entradas_mes: i64 = conn
        .query_row(
            "SELECT COALESCE(SUM(quantidade),0) FROM movimentacoes WHERE tipo='entrada' AND data_movimento >= date('now','start of month')",
            [],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    let saidas_mes: i64 = conn
        .query_row(
            "SELECT COALESCE(SUM(quantidade),0) FROM movimentacoes WHERE tipo='saida' AND data_movimento >= date('now','start of month')",
            [],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    let valor_total_estoque: f64 = conn
        .query_row(
            "SELECT COALESCE(SUM(estoque * preco_compra),0) FROM produtos WHERE ativo=1",
            [],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;

    Ok(DashboardStats {
        total_produtos,
        itens_estoque,
        estoque_baixo,
        itens_indisponiveis,
        solicitacoes_pendentes,
        entradas_mes,
        saidas_mes,
        valor_total_estoque,
    })
}

// ============================================================================
//  LOJAS
// ============================================================================

#[tauri::command(rename_all = "snake_case")]
fn list_lojas() -> Result<Vec<Loja>, String> {
    let conn = db::open_conn().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT id, nome, codigo, endereco, ativa FROM lojas ORDER BY nome")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(Loja {
                id: row.get(0)?,
                nome: row.get(1)?,
                codigo: row.get(2)?,
                endereco: row.get(3)?,
                ativa: row.get::<_, i64>(4)? != 0,
            })
        })
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r.map_err(|e| e.to_string())?);
    }
    Ok(out)
}

#[tauri::command(rename_all = "snake_case")]
fn create_loja(nome: String, codigo: String, endereco: Option<String>) -> Result<Loja, String> {
    let conn = db::open_conn().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO lojas (nome, codigo, endereco) VALUES (?1, ?2, ?3)",
        params![nome, codigo, endereco],
    )
    .map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();
    Ok(Loja {
        id,
        nome,
        codigo,
        endereco,
        ativa: true,
    })
}

#[tauri::command(rename_all = "snake_case")]
fn update_loja(id: i64, nome: String, codigo: String, endereco: Option<String>) -> Result<Loja, String> {
    let conn = db::open_conn().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE lojas SET nome=?1, codigo=?2, endereco=?3 WHERE id=?4",
        params![nome, codigo, endereco, id],
    )
    .map_err(|e| e.to_string())?;
    let ativa: bool = conn
        .query_row("SELECT ativa FROM lojas WHERE id=?1", params![id], |r| r.get::<_, i64>(0))
        .map_err(|_| "Loja não encontrada".to_string())?
        != 0;
    Ok(Loja {
        id,
        nome,
        codigo,
        endereco,
        ativa,
    })
}

#[tauri::command(rename_all = "snake_case")]
fn delete_loja(id: i64) -> Result<(), String> {
    let conn = db::open_conn().map_err(|e| e.to_string())?;
    // Deleta pedidos vinculados e seus itens
    let pedidos_ids: Vec<i64> = {
        let mut stmt = conn.prepare("SELECT id FROM pedidos WHERE loja_id=?1").map_err(|e| e.to_string())?;
        let rows = stmt.query_map(params![id], |r| r.get(0)).map_err(|e| e.to_string())?;
        rows.filter_map(|r| r.ok()).collect()
    };
    for pid in &pedidos_ids {
        let _ = conn.execute("DELETE FROM pedido_itens WHERE pedido_id=?1", params![pid]);
    }
    let _ = conn.execute("DELETE FROM pedidos WHERE loja_id=?1", params![id]);
    // Deleta solicitações vinculadas
    let _ = conn.execute("DELETE FROM solicitacao_itens WHERE solicitacao_id IN (SELECT id FROM solicitacoes WHERE loja_id=?1)", params![id]);
    let _ = conn.execute("DELETE FROM solicitacoes WHERE loja_id=?1", params![id]);
    // Nullifica referências antes de excluir
    conn.execute("UPDATE movimentacoes SET loja_origem_id=NULL WHERE loja_origem_id=?1", params![id])
        .map_err(|e| e.to_string())?;
    conn.execute("UPDATE movimentacoes SET loja_destino_id=NULL WHERE loja_destino_id=?1", params![id])
        .map_err(|e| e.to_string())?;
    conn.execute("UPDATE usuarios SET loja_id=NULL WHERE loja_id=?1", params![id])
        .map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM lojas WHERE id=?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ============================================================================
//  CATEGORIAS
// ============================================================================

#[tauri::command(rename_all = "snake_case")]
fn list_categorias() -> Result<Vec<Categoria>, String> {
    let conn = db::open_conn().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT id, nome, descricao, ativa FROM categorias ORDER BY nome")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(Categoria {
                id: row.get(0)?,
                nome: row.get(1)?,
                descricao: row.get(2)?,
                ativa: row.get::<_, i64>(3)? != 0,
            })
        })
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r.map_err(|e| e.to_string())?);
    }
    Ok(out)
}

#[tauri::command(rename_all = "snake_case")]
fn create_categoria(nome: String, descricao: Option<String>) -> Result<Categoria, String> {
    let conn = db::open_conn().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO categorias (nome, descricao) VALUES (?1, ?2)",
        params![nome, descricao],
    )
    .map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();
    Ok(Categoria {
        id,
        nome,
        descricao,
        ativa: true,
    })
}

#[tauri::command(rename_all = "snake_case")]
fn update_categoria(id: i64, nome: String, descricao: Option<String>) -> Result<Categoria, String> {
    let conn = db::open_conn().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE categorias SET nome=?1, descricao=?2 WHERE id=?3",
        params![nome, descricao, id],
    )
    .map_err(|e| e.to_string())?;
    let ativa: bool = conn
        .query_row("SELECT ativa FROM categorias WHERE id=?1", params![id], |r| r.get::<_, i64>(0))
        .map_err(|_| "Categoria não encontrada".to_string())?
        != 0;
    Ok(Categoria {
        id,
        nome,
        descricao,
        ativa,
    })
}

#[tauri::command(rename_all = "snake_case")]
fn delete_categoria(id: i64) -> Result<(), String> {
    let conn = db::open_conn().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM categorias WHERE id=?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ============================================================================
//  FORNECEDORES
// ============================================================================

#[tauri::command(rename_all = "snake_case")]
fn list_fornecedores() -> Result<Vec<Fornecedor>, String> {
    let conn = db::open_conn().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT id, nome, cnpj, contato, email, telefone, ativo FROM fornecedores ORDER BY nome")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(Fornecedor {
                id: row.get(0)?,
                nome: row.get(1)?,
                cnpj: row.get(2)?,
                contato: row.get(3)?,
                email: row.get(4)?,
                telefone: row.get(5)?,
                ativo: row.get::<_, i64>(6)? != 0,
            })
        })
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r.map_err(|e| e.to_string())?);
    }
    Ok(out)
}

#[tauri::command(rename_all = "snake_case")]
fn create_fornecedor(
    nome: String,
    cnpj: Option<String>,
    contato: Option<String>,
    email: Option<String>,
    telefone: Option<String>,
) -> Result<Fornecedor, String> {
    let conn = db::open_conn().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO fornecedores (nome, cnpj, contato, email, telefone) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![nome, cnpj, contato, email, telefone],
    )
    .map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();
    Ok(Fornecedor {
        id,
        nome,
        cnpj,
        contato,
        email,
        telefone,
        ativo: true,
    })
}

#[tauri::command(rename_all = "snake_case")]
fn update_fornecedor(
    id: i64,
    nome: String,
    cnpj: Option<String>,
    contato: Option<String>,
    email: Option<String>,
    telefone: Option<String>,
) -> Result<Fornecedor, String> {
    let conn = db::open_conn().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE fornecedores SET nome=?1, cnpj=?2, contato=?3, email=?4, telefone=?5 WHERE id=?6",
        params![nome, cnpj, contato, email, telefone, id],
    )
    .map_err(|e| e.to_string())?;
    let ativo: bool = conn
        .query_row("SELECT ativo FROM fornecedores WHERE id=?1", params![id], |r| r.get::<_, i64>(0))
        .map_err(|_| "Fornecedor não encontrado".to_string())?
        != 0;
    Ok(Fornecedor {
        id,
        nome,
        cnpj,
        contato,
        email,
        telefone,
        ativo,
    })
}

// ============================================================================
//  PRODUTOS
// ============================================================================

#[tauri::command(rename_all = "snake_case")]
fn list_produtos() -> Result<Vec<Produto>, String> {
    let conn = db::open_conn().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT p.id, p.codigo, p.nome, p.marca, p.modelo, p.descricao, p.categoria_id, c.nome, p.fornecedor_id, f.nome, p.unidade, p.preco_compra, p.preco_venda, p.estoque, p.estoque_minimo, p.custo_total, p.ativo
             FROM produtos p
             LEFT JOIN categorias c ON p.categoria_id = c.id
             LEFT JOIN fornecedores f ON p.fornecedor_id = f.id
             ORDER BY p.id",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(Produto {
                id: row.get(0)?,
                codigo: row.get(1)?,
                nome: row.get(2)?,
                marca: row.get(3)?,
                modelo: row.get(4)?,
                descricao: row.get(5)?,
                categoria_id: row.get(6)?,
                categoria_nome: row.get(7)?,
                fornecedor_id: row.get(8)?,
                fornecedor_nome: row.get(9)?,
                unidade: row.get(10)?,
                preco_compra: row.get(11)?,
                preco_venda: row.get(12)?,
                estoque: row.get(13)?,
                estoque_minimo: row.get(14)?,
                custo_total: row.get(15)?,
                ativo: row.get::<_, i64>(16)? != 0,
            })
        })
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r.map_err(|e| e.to_string())?);
    }
    Ok(out)
}

#[tauri::command(rename_all = "snake_case")]
fn create_produto(
    codigo: String,
    nome: String,
    marca: Option<String>,
    modelo: Option<String>,
    descricao: Option<String>,
    categoria_id: Option<i64>,
    fornecedor_id: Option<i64>,
    unidade: String,
    preco_compra: f64,
    preco_venda: f64,
    estoque: i64,
    estoque_minimo: i64,
    custo_total: f64,
) -> Result<Produto, String> {
    let conn = db::open_conn().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO produtos (codigo, nome, marca, modelo, descricao, categoria_id, fornecedor_id, unidade, preco_compra, preco_venda, estoque, estoque_minimo, custo_total) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
        params![codigo, nome, marca, modelo, descricao, categoria_id, fornecedor_id, unidade, preco_compra, preco_venda, estoque, estoque_minimo, custo_total],
    )
    .map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();
    let cat_nome: Option<String> = conn
        .query_row(
            "SELECT nome FROM categorias WHERE id = ?1",
            params![categoria_id],
            |r| r.get(0),
        )
        .ok();
    let forn_nome: Option<String> = conn
        .query_row(
            "SELECT nome FROM fornecedores WHERE id = ?1",
            params![fornecedor_id],
            |r| r.get(0),
        )
        .ok();
    Ok(Produto {
        id,
        codigo,
        nome,
        marca,
        modelo,
        descricao,
        categoria_id,
        categoria_nome: cat_nome,
        fornecedor_id,
        fornecedor_nome: forn_nome,
        unidade,
        preco_compra,
        preco_venda,
        estoque,
        estoque_minimo,
        custo_total,
        ativo: true,
    })
}

#[tauri::command(rename_all = "snake_case")]
fn update_produto(
    id: i64,
    codigo: String,
    nome: String,
    marca: Option<String>,
    modelo: Option<String>,
    descricao: Option<String>,
    categoria_id: Option<i64>,
    fornecedor_id: Option<i64>,
    unidade: String,
    preco_compra: f64,
    preco_venda: f64,
    estoque: i64,
    estoque_minimo: i64,
    custo_total: f64,
) -> Result<Produto, String> {
    let conn = db::open_conn().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE produtos SET codigo=?1, nome=?2, marca=?3, modelo=?4, descricao=?5, categoria_id=?6, fornecedor_id=?7, unidade=?8, preco_compra=?9, preco_venda=?10, estoque=?11, estoque_minimo=?12, custo_total=?13 WHERE id=?14",
        params![codigo, nome, marca, modelo, descricao, categoria_id, fornecedor_id, unidade, preco_compra, preco_venda, estoque, estoque_minimo, custo_total, id],
    )
    .map_err(|e| e.to_string())?;
    let cat_nome: Option<String> = conn
        .query_row(
            "SELECT nome FROM categorias WHERE id = ?1",
            params![categoria_id],
            |r| r.get(0),
        )
        .ok();
    let forn_nome: Option<String> = conn
        .query_row(
            "SELECT nome FROM fornecedores WHERE id = ?1",
            params![fornecedor_id],
            |r| r.get(0),
        )
        .ok();
    let ativo: bool = conn
        .query_row("SELECT ativo FROM produtos WHERE id=?1", params![id], |r| r.get::<_, i64>(0))
        .map_err(|_| "Produto não encontrado".to_string())?
        != 0;
    Ok(Produto {
        id,
        codigo,
        nome,
        marca,
        modelo,
        descricao,
        categoria_id,
        categoria_nome: cat_nome,
        fornecedor_id,
        fornecedor_nome: forn_nome,
        unidade,
        preco_compra,
        preco_venda,
        estoque,
        estoque_minimo,
        custo_total,
        ativo,
    })
}

// ============================================================================
//  USUARIOS / AUTH
// ============================================================================

#[tauri::command(rename_all = "snake_case")]
fn list_usuarios() -> Result<Vec<Usuario>, String> {
    let conn = db::open_conn().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT u.id, u.nome, u.email, u.senha, u.perfil, u.loja_id, l.nome, u.ativo
             FROM usuarios u
             LEFT JOIN lojas l ON u.loja_id = l.id
             ORDER BY u.nome",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(Usuario {
                id: row.get(0)?,
                nome: row.get(1)?,
                email: row.get(2)?,
                senha: String::new(), // Nunca expor hash ao frontend
                perfil: row.get(4)?,
                loja_id: row.get(5)?,
                loja_nome: row.get(6)?,
                ativo: row.get::<_, i64>(7)? != 0,
            })
        })
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r.map_err(|e| e.to_string())?);
    }
    Ok(out)
}

#[tauri::command(rename_all = "snake_case")]
fn login(email: String, senha: String) -> Result<Usuario, String> {
    let conn = db::open_conn().map_err(|e| e.to_string())?;
    let chave_rate = format!("login:{}", email.to_lowercase());

    // SEGURANÇA: Verificar rate limiting (persistente em SQLite)
    let (bloqueado, _) = rate_limit_check(&conn, &chave_rate)?;
    if bloqueado {
        return Err("Conta bloqueada por muitas tentativas. Aguarde 15 minutos.".to_string());
    }

    // Busca usuario APENAS por email (senha verificada via Argon2), case-insensitive
    let mut stmt = conn
        .prepare(
            "SELECT u.id, u.nome, u.email, u.senha, u.perfil, u.loja_id, l.nome, u.ativo
             FROM usuarios u
             LEFT JOIN lojas l ON u.loja_id = l.id
             WHERE LOWER(u.email)=LOWER(?1) AND u.ativo=1",
        )
        .map_err(|e| e.to_string())?;
    let mut rows = stmt
        .query(params![email])
        .map_err(|e| e.to_string())?;
    if let Some(row) = rows.next().map_err(|e| e.to_string())? {
        let stored_hash: String = row.get(3).map_err(|e| e.to_string())?;
        // Verifica senha com Argon2 (ou fallback para texto plano)
        if !check_password_hash(&senha, &stored_hash) {
            // SEGURANÇA: Registrar falha no rate limiting
            let bloqueou = rate_limit_record_failure(&conn, &chave_rate)?;
            audit_log(&conn, None, &email, "login_falha", Some("usuarios"), None, Some("Senha inválida"));
            if bloqueou {
                return Err("Conta bloqueada por muitas tentativas. Aguarde 15 minutos.".to_string());
            }
            return Err("Credenciais inválidas".to_string());
        }
        // SEGURANÇA: Login bem-sucedido — limpar rate limiting
        rate_limit_clear(&conn, &chave_rate)?;
        let usuario_id: i64 = row.get(0).map_err(|e| e.to_string())?;
        audit_log(&conn, Some(usuario_id), &email, "login_sucesso", Some("usuarios"), Some(usuario_id), None);

        // Criar sessão
        let _session_id = create_session(&conn, usuario_id)?;

        // Migra senha de texto plano para Argon2 (lazy migration)
        if let Some(new_hash) = maybe_migrate_password(&senha, &stored_hash) {
            let _ = conn.execute("UPDATE usuarios SET senha=?1 WHERE id=?2", params![new_hash, usuario_id]);
        }
        Ok(Usuario {
            id: usuario_id,
            nome: row.get(1).map_err(|e| e.to_string())?,
            email: row.get(2).map_err(|e| e.to_string())?,
            senha: String::new(), // Nunca retornar hash ao frontend
            perfil: row.get(4).map_err(|e| e.to_string())?,
            loja_id: row.get(5).map_err(|e| e.to_string())?,
            loja_nome: row.get(6).map_err(|e| e.to_string())?,
            ativo: row.get::<_, i64>(7).map_err(|e| e.to_string())? != 0,
        })
    } else {
        // SEGURANÇA: Registrar falha
        rate_limit_record_failure(&conn, &chave_rate)?;
        audit_log(&conn, None, &email, "login_falha", Some("usuarios"), None, Some("Usuário não encontrado"));
        Err("Credenciais inválidas".to_string())
    }
}

#[tauri::command(rename_all = "snake_case")]
fn create_usuario(
    nome: String,
    email: String,
    senha: String,
    perfil: String,
    loja_id: Option<i64>,
) -> Result<Usuario, String> {
    let conn = db::open_conn().map_err(|e| e.to_string())?;
    // SEGURANÇA: Validar força da senha
    validate_password_strength(&senha)?;
    // Normaliza email para minúsculas (login é case-insensitive, evita duplicados)
    let email = email.to_lowercase();
    let senha_hash = hash_password(&senha);
    audit_log(&conn, None, &email, "create_usuario", Some("usuarios"), None, Some(&format!("Email: {}", email)));
    conn.execute(
        "INSERT INTO usuarios (nome, email, senha, perfil, loja_id) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![nome, email, senha_hash, perfil, loja_id],
    )
    .map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();
    Ok(Usuario {
        id,
        nome,
        email,
        senha: String::new(), // Nunca retornar hash ao frontend
        perfil,
        loja_id,
        loja_nome: None,
        ativo: true,
    })
}

#[tauri::command(rename_all = "snake_case")]
fn update_usuario(
    id: i64,
    nome: String,
    email: String,
    senha: String,
    perfil: String,
    loja_id: Option<i64>,
) -> Result<Usuario, String> {
    let conn = db::open_conn().map_err(|e| e.to_string())?;
    // Normaliza email para minúsculas (login é case-insensitive)
    let email = email.to_lowercase();
    // Senha vazia = não alterar a senha atual
    let senha_hash = if senha.is_empty() {
        conn.query_row("SELECT senha FROM usuarios WHERE id=?1", params![id], |r| r.get(0))
            .map_err(|_| "Usuário não encontrado".to_string())?
    } else {
        // SEGURANÇA: Validar força da senha quando alterada
        validate_password_strength(&senha)?;
        hash_password(&senha)
    };
    audit_log(&conn, Some(id), &email, "update_usuario", Some("usuarios"), Some(id), None);
    conn.execute(
        "UPDATE usuarios SET nome=?1, email=?2, senha=?3, perfil=?4, loja_id=?5 WHERE id=?6",
        params![nome, email, senha_hash, perfil, loja_id, id],
    )
    .map_err(|e| e.to_string())?;
    Ok(Usuario {
        id,
        nome,
        email,
        senha: String::new(), // Nunca retornar hash ao frontend
        perfil,
        loja_id,
        loja_nome: None,
        ativo: true,
    })
}

/// Valida a senha atual de um usuário (usado no Perfil antes de trocar a senha).
#[tauri::command(rename_all = "snake_case")]
fn verify_password(usuario_id: i64, senha: String) -> Result<bool, String> {
    let conn = db::open_conn().map_err(|e| e.to_string())?;
    let hash: String = conn
        .query_row("SELECT senha FROM usuarios WHERE id=?1", params![usuario_id], |r| r.get(0))
        .map_err(|_| "Usuário não encontrado".to_string())?;
    Ok(check_password_hash(&senha, &hash))
}

// ============================================================================
//  MOVIMENTACOES
// ============================================================================

#[tauri::command(rename_all = "snake_case")]
fn list_movimentacoes() -> Result<Vec<Movimentacao>, String> {
    let conn = db::open_conn().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT m.id, m.tipo, m.produto_id, COALESCE(m.produto_nome, p.nome), m.quantidade, m.loja_origem_id, COALESCE(m.loja_origem_nome, lo.nome), m.loja_destino_id, COALESCE(m.loja_destino_nome, ld.nome), m.usuario_id, m.observacao, m.data_movimento, m.preco_compra, m.unidade
             FROM movimentacoes m
             LEFT JOIN produtos p ON m.produto_id = p.id
             LEFT JOIN lojas lo ON m.loja_origem_id = lo.id
             LEFT JOIN lojas ld ON m.loja_destino_id = ld.id
             ORDER BY m.data_movimento DESC LIMIT 200",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(Movimentacao {
                id: row.get(0)?,
                tipo: row.get(1)?,
                produto_id: row.get(2)?,
                produto_nome: row.get(3)?,
                quantidade: row.get(4)?,
                loja_origem_id: row.get(5)?,
                loja_origem_nome: row.get(6)?,
                loja_destino_id: row.get(7)?,
                loja_destino_nome: row.get(8)?,
                usuario_id: row.get(9)?,
                observacao: row.get(10)?,
                data_movimento: row.get(11)?,
                preco_compra: row.get(12)?,
                unidade: row.get(13)?,
            })
        })
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r.map_err(|e| e.to_string())?);
    }
    Ok(out)
}

#[tauri::command(rename_all = "snake_case")]
fn create_movimentacao(
    tipo: String,
    produto_id: i64,
    produto_nome: Option<String>,
    quantidade: i64,
    loja_origem_id: Option<i64>,
    loja_origem_nome: Option<String>,
    loja_destino_id: Option<i64>,
    loja_destino_nome: Option<String>,
    usuario_id: Option<i64>,
    observacao: Option<String>,
    preco_compra: Option<f64>,
    unidade: Option<i64>,
    data_movimento: Option<String>,
) -> Result<Movimentacao, String> {
    // DEBUG LOG removido por segurança — não logar dados de movimentação em produção
    let conn = db::open_conn().map_err(|e| e.to_string())?;
    let now = chrono::Local::now().to_rfc3339();
    let dt = data_movimento.unwrap_or_else(|| now.clone());

    // Desabilitar FK checks se produto_id = 0 (produto não cadastrado).
    // A FK é religada mesmo em caso de erro (guard abaixo), dentro de transação.
    if produto_id == 0 {
        conn.execute("PRAGMA foreign_keys = OFF", []).map_err(|e| e.to_string())?;
    }
    let result = (|| -> Result<Movimentacao, String> {
        let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;

        // Atualizar estoque apenas se produto existe no catálogo.
        // Nota: o estoque do produto é único/global (não há estoque por loja no schema),
        // portanto "transferencia" registra a saída da loja de origem; a loja de destino
        // fica registrada na própria movimentação (loja_destino_id/nome) para rastreio,
        // sem gerar movimentação de entrada (o que dobraria a contagem de entradas).
        if tipo == "entrada" && produto_id > 0 {
            let preco = preco_compra.unwrap_or(0.0);
            let qty = quantidade as f64;
            tx.execute(
                "UPDATE produtos SET estoque = estoque + ?1, custo_total = custo_total + (?2 * ?3) WHERE id=?4",
                params![quantidade, preco, qty, produto_id],
            )
            .map_err(|e| e.to_string())?;
        } else if tipo == "saida" && produto_id > 0 {
            tx.execute(
                "UPDATE produtos SET estoque = MAX(0, estoque - ?1) WHERE id=?2",
                params![quantidade, produto_id],
            )
            .map_err(|e| e.to_string())?;
        } else if tipo == "transferencia" && produto_id > 0 {
            // Saída global: origem → destino registrados nos campos da movimentação
            tx.execute(
                "UPDATE produtos SET estoque = MAX(0, estoque - ?1) WHERE id=?2",
                params![quantidade, produto_id],
            )
            .map_err(|e| e.to_string())?;
        }

        tx.execute(
            "INSERT INTO movimentacoes (tipo, produto_id, produto_nome, quantidade, loja_origem_id, loja_origem_nome, loja_destino_id, loja_destino_nome, usuario_id, observacao, preco_compra, unidade, data_movimento) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
            params![tipo, produto_id, produto_nome, quantidade, loja_origem_id, loja_origem_nome, loja_destino_id, loja_destino_nome, usuario_id, observacao, preco_compra, unidade, dt],
        )
        .map_err(|e| e.to_string())?;
        let id = tx.last_insert_rowid();
        tx.commit().map_err(|e| { e.to_string() })?;
        // Sucesso — log removido por segurança
        Ok(Movimentacao {
            id,
            tipo,
            produto_id,
            produto_nome,
            quantidade,
            loja_origem_id,
            loja_origem_nome,
            loja_destino_id,
            loja_destino_nome,
            usuario_id,
            observacao,
            data_movimento: dt,
            preco_compra,
            unidade,
        })
    })();
    // Reabilitar FK checks sempre, mesmo se o INSERT falhou
    if produto_id == 0 {
        conn.execute("PRAGMA foreign_keys = ON", []).map_err(|e| e.to_string())?;
    }
    result
}

// ============================================================================
//  SOLICITACOES
// ============================================================================

#[tauri::command(rename_all = "snake_case")]
fn list_solicitacoes() -> Result<Vec<Solicitacao>, String> {
    let conn = db::open_conn().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT s.id, s.loja_id, l.nome, s.usuario_id, u.nome, s.observacao, s.status, s.data_solicitacao, (SELECT COUNT(*) FROM solicitacao_itens WHERE solicitacao_id = s.id)
             FROM solicitacoes s
             LEFT JOIN lojas l ON s.loja_id = l.id
             LEFT JOIN usuarios u ON s.usuario_id = u.id
             ORDER BY s.data_solicitacao DESC",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(Solicitacao {
                id: row.get(0)?,
                loja_id: row.get(1)?,
                loja_nome: row.get(2)?,
                usuario_id: row.get(3)?,
                usuario_nome: row.get(4)?,
                observacao: row.get(5)?,
                status: row.get(6)?,
                data_solicitacao: row.get(7)?,
                total_itens: row.get(8)?,
            })
        })
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r.map_err(|e| e.to_string())?);
    }
    Ok(out)
}

#[tauri::command(rename_all = "snake_case")]
fn create_solicitacao(
    loja_id: i64,
    usuario_id: Option<i64>,
    observacao: Option<String>,
) -> Result<Solicitacao, String> {
    let conn = db::open_conn().map_err(|e| e.to_string())?;
    let now = chrono::Local::now().to_rfc3339();
    conn.execute(
        "INSERT INTO solicitacoes (loja_id, usuario_id, observacao, status, data_solicitacao) VALUES (?1, ?2, ?3, 'pendente', ?4)",
        params![loja_id, usuario_id, observacao, now],
    )
    .map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();
    Ok(Solicitacao {
        id,
        loja_id,
        loja_nome: None,
        usuario_id,
        usuario_nome: None,
        observacao,
        status: "pendente".to_string(),
        data_solicitacao: now,
        total_itens: Some(0),
    })
}

#[tauri::command(rename_all = "snake_case")]
fn update_solicitacao_status(id: i64, status: String) -> Result<(), String> {
    let conn = db::open_conn().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE solicitacoes SET status=?1 WHERE id=?2",
        params![status, id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
fn update_solicitacao_observacao(id: i64, observacao: String) -> Result<(), String> {
    let conn = db::open_conn().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE solicitacoes SET observacao=?1 WHERE id=?2",
        params![observacao, id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
fn list_solicitacao_itens(solicitacao_id: i64) -> Result<Vec<SolicitacaoItem>, String> {
    let conn = db::open_conn().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT si.id, si.solicitacao_id, si.produto_id, p.nome, p.codigo, p.unidade, si.quantidade
             FROM solicitacao_itens si
             LEFT JOIN produtos p ON si.produto_id = p.id
             WHERE si.solicitacao_id = ?1
             ORDER BY si.id",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![solicitacao_id], |row| {
            Ok(SolicitacaoItem {
                id: row.get(0)?,
                solicitacao_id: row.get(1)?,
                produto_id: row.get(2)?,
                produto_nome: row.get(3)?,
                produto_codigo: row.get(4)?,
                unidade: row.get(5)?,
                quantidade: row.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r.map_err(|e| e.to_string())?);
    }
    Ok(out)
}

#[tauri::command(rename_all = "snake_case")]
fn add_solicitacao_item(
    solicitacao_id: i64,
    produto_id: i64,
    quantidade: i64,
) -> Result<SolicitacaoItem, String> {
    let conn = db::open_conn().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO solicitacao_itens (solicitacao_id, produto_id, quantidade) VALUES (?1, ?2, ?3)",
        params![solicitacao_id, produto_id, quantidade],
    )
    .map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();
    // Refresh denormalized fields
    let mut stmt = conn
        .prepare(
            "SELECT p.nome, p.codigo, p.unidade FROM produtos p WHERE p.id = ?1",
        )
        .map_err(|e| e.to_string())?;
    let mut rows = stmt
        .query(params![produto_id])
        .map_err(|e| e.to_string())?;
    let (nome, codigo, unidade) = if let Some(row) = rows.next().map_err(|e| e.to_string())? {
        (
            row.get::<_, Option<String>>(0).map_err(|e| e.to_string())?,
            row.get::<_, Option<String>>(1).map_err(|e| e.to_string())?,
            row.get::<_, Option<String>>(2).map_err(|e| e.to_string())?,
        )
    } else {
        (None, None, None)
    };
    Ok(SolicitacaoItem {
        id,
        solicitacao_id,
        produto_id,
        produto_nome: nome,
        produto_codigo: codigo,
        unidade,
        quantidade,
    })
}

#[tauri::command(rename_all = "snake_case")]
fn remove_solicitacao_item(id: i64) -> Result<(), String> {
    let conn = db::open_conn().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM solicitacao_itens WHERE id=?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
fn delete_solicitacao(id: i64) -> Result<(), String> {
    let conn = db::open_conn().map_err(|e| e.to_string())?;
    // Itens são removidos em cascata pelo ON DELETE CASCADE do schema
    conn.execute("DELETE FROM solicitacoes WHERE id=?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ============================================================================
//  PEDIDOS
// ============================================================================

#[tauri::command(rename_all = "snake_case")]
fn set_pedido_itens(pedido_id: i64, itens: Vec<serde_json::Value>) -> Result<(), String> {
    let conn = db::open_conn().map_err(|e| e.to_string())?;
    // Remove itens antigos
    conn.execute("DELETE FROM pedido_itens WHERE pedido_id=?1", params![pedido_id])
        .map_err(|e| e.to_string())?;
    for item in itens {
        let produto_id = item.get("produto_id").and_then(|v| v.as_i64()).unwrap_or(0);
        let produto_nome = item.get("produto_nome").and_then(|v| v.as_str()).unwrap_or("").to_string();
        let unidade = item.get("unidade").and_then(|v| v.as_str()).map(|s| s.to_string());
        let quantidade = item.get("quantidade").and_then(|v| v.as_f64()).unwrap_or(0.0);
        conn.execute(
            "INSERT INTO pedido_itens (pedido_id, produto_id, produto_nome, unidade, quantidade) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![pedido_id, produto_id, produto_nome, unidade, quantidade],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
fn list_pedido_itens(pedido_id: i64) -> Result<Vec<PedidoItem>, String> {
    let conn = db::open_conn().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT id, pedido_id, produto_id, produto_nome, unidade, quantidade FROM pedido_itens WHERE pedido_id=?1 ORDER BY id")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![pedido_id], |row| {
            Ok(PedidoItem {
                id: row.get(0)?,
                pedido_id: row.get(1)?,
                produto_id: row.get(2)?,
                produto_nome: row.get(3)?,
                unidade: row.get(4)?,
                quantidade: row.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r.map_err(|e| e.to_string())?);
    }
    Ok(out)
}

#[tauri::command(rename_all = "snake_case")]
fn list_pedidos() -> Result<Vec<Pedido>, String> {
    let conn = db::open_conn().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT p.id, p.numero, p.loja_id, l.nome, l.codigo, p.solicitante, p.origem, p.status, p.arquivo_pdf, p.data_pedido, p.setor
             FROM pedidos p
             LEFT JOIN lojas l ON p.loja_id = l.id
             ORDER BY p.data_pedido DESC",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(Pedido {
                id: row.get(0)?,
                numero: row.get(1)?,
                loja_id: row.get(2)?,
                loja_nome: row.get(3)?,
                loja_codigo: row.get(4)?,
                solicitante: row.get(5)?,
                origem: row.get(6)?,
                status: row.get(7)?,
                arquivo_pdf: row.get(8)?,
                data_pedido: row.get(9)?,
                setor: row.get(10)?,
            })
        })
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r.map_err(|e| e.to_string())?);
    }
    Ok(out)
}

#[tauri::command(rename_all = "snake_case")]
fn create_pedido(
    numero: String,
    loja_id: i64,
    solicitante: String,
    origem: Option<String>,
    arquivo_pdf: Option<String>,
    setor: Option<String>,
    data_pedido: Option<String>,
) -> Result<Pedido, String> {
    let conn = db::open_conn().map_err(|e| e.to_string())?;
    let dp = data_pedido.unwrap_or_else(|| chrono::Local::now().to_rfc3339());
    conn.execute(
        "INSERT INTO pedidos (numero, loja_id, solicitante, origem, status, arquivo_pdf, data_pedido, setor) VALUES (?1, ?2, ?3, ?4, 'importado', ?5, ?6, ?7)",
        params![numero, loja_id, solicitante, origem, arquivo_pdf, dp, setor],
    )
    .map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();
    // resolve loja_nome e loja_codigo
    let (loja_nome, loja_codigo) = conn.query_row(
        "SELECT nome, codigo FROM lojas WHERE id=?1",
        params![loja_id],
        |row| Ok((row.get(0)?, row.get(1)?))
    ).ok().unwrap_or((None, None));
    Ok(Pedido {
        id,
        numero,
        loja_id,
        loja_nome,
        loja_codigo,
        solicitante,
        origem,
        status: "importado".to_string(),
        arquivo_pdf,
        data_pedido: dp,
        setor,
    })
}

// ============================================================================
//  ALERTAS
// ============================================================================

#[tauri::command(rename_all = "snake_case")]
fn list_alertas() -> Result<Vec<Alerta>, String> {
    let conn = db::open_conn().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT id, tipo, titulo, mensagem, data_alerta, lido FROM alertas ORDER BY data_alerta DESC")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(Alerta {
                id: row.get(0)?,
                tipo: row.get(1)?,
                titulo: row.get(2)?,
                mensagem: row.get(3)?,
                data_alerta: row.get(4)?,
                lido: row.get::<_, i64>(5)? != 0,
            })
        })
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r.map_err(|e| e.to_string())?);
    }
    Ok(out)
}

#[tauri::command(rename_all = "snake_case")]
fn mark_alerta_lido(id: i64) -> Result<(), String> {
    let conn = db::open_conn().map_err(|e| e.to_string())?;
    conn.execute("UPDATE alertas SET lido=1 WHERE id=?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ============================================================================
//  SYNC CONFIG — Leitura de sync_config.json do %APPDATA%
// ============================================================================

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SyncConfig {
    pub owner: String,
    pub repo: String,
    pub path: String,
    pub token: String,
    pub auto_enabled: bool,
}

/// Lê o token do cofre (vault.enc) — Rust puro, sem dependência de Python.
fn read_token_from_vault() -> Option<String> {
    use aes_gcm::{aead::Aead, Aes256Gcm, KeyInit, Nonce};
    use pbkdf2::pbkdf2_hmac;
    use sha2::Sha256;

    let appdata = std::env::var("APPDATA").ok()?;
    let vault_dir = std::path::PathBuf::from(&appdata).join("EstoqueTI");
    let vault_path = vault_dir.join("vault.enc");

    if !vault_path.exists() {
        return None;
    }

    // Ler e decodificar base64
    let raw_b64 = std::fs::read_to_string(&vault_path).ok()?;
    let blob = base64::engine::general_purpose::STANDARD
        .decode(raw_b64.trim())
        .ok()?;

    // Formato: salt(16) + iv(12) + ciphertext+tag
    if blob.len() < 16 + 12 + 16 {
        return None;
    }
    let salt = &blob[..16];
    let iv = &blob[16..28];
    let ct = &blob[28..];

    // Ler senha do vault.pw
    let pw_path = vault_dir.join("vault.pw");
    let pw = if pw_path.exists() {
        std::fs::read_to_string(&pw_path)
            .map(|s| s.trim().to_string())
            .unwrap_or_default()
    } else {
        String::new()
    };

    // Derivar chave: PBKDF2-HMAC-SHA256, 32 bytes, 100000 iterações
    let mut key = [0u8; 32];
    pbkdf2_hmac::<Sha256>(pw.as_bytes(), salt, 100_000, &mut key);

    // Decriptar AES-256-GCM
    let cipher = Aes256Gcm::new_from_slice(&key).ok()?;
    let nonce = Nonce::from_slice(iv);
    let pt = cipher.decrypt(nonce, ct).ok()?;

    // Parse JSON e extrair token
    let data: serde_json::Value = serde_json::from_slice(&pt).ok()?;
    let token = data
        .get("github_token")
        .or_else(|| data.get("token"))
        .or_else(|| data.get("sync_token"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    token.filter(|s| !s.is_empty())
}

#[tauri::command(rename_all = "snake_case")]
fn read_sync_config() -> Result<SyncConfig, String> {
    let appdata = std::env::var("APPDATA").map_err(|e| e.to_string())?;
    let appdata_path = std::path::PathBuf::from(&appdata);
    
    // 1. Tentar ler do cofre (vault.enc) se existir
    let vault_token = read_token_from_vault();
    
    // 2. Ler configuração base do sync_config.json
    let config_path = appdata_path.join("EstoqueTI").join("sync_config.json");
    let mut content = std::fs::read_to_string(&config_path)
        .map_err(|e| format!("Arquivo sync_config.json nao encontrado: {}", e))?;
    
    // Remover BOM UTF-8 se presente
    if content.starts_with('\u{FEFF}') {
        content = content[3..].to_string();
    }
    
    let mut config: SyncConfig = serde_json::from_str(&content)
        .map_err(|e| format!("Erro ao ler sync_config.json: {}", e))?;
    
    // 3. Se token do cofre existe, usar ele (mais seguro)
    if let Some(token) = vault_token {
        config.token = token;
    }
    
    Ok(config)
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SyncConfigStatus {
    pub owner: String,
    pub repo: String,
    pub path: String,
    pub auto_enabled: bool,
    pub has_token: bool,
}

/// Retorna a configuração de sync SEM expor o PAT ao frontend.
#[tauri::command(rename_all = "snake_case")]
fn read_sync_config_status() -> Result<SyncConfigStatus, String> {
    let config = read_sync_config()?;
    Ok(SyncConfigStatus {
        owner: config.owner,
        repo: config.repo,
        path: config.path,
        auto_enabled: config.auto_enabled,
        has_token: !config.token.is_empty(),
    })
}

// ============================================================================
//  SYNC — PUSH/PULL GITHUB (Desktop)
// ============================================================================

#[tauri::command(rename_all = "snake_case")]
async fn push_to_github() -> Result<String, String> {
    let config = read_sync_config()?;
    let dados = export_all_data()?;
    let json = serde_json::to_string_pretty(&dados).map_err(|e| e.to_string())?;
    let encoded = base64::engine::general_purpose::STANDARD.encode(json.as_bytes());

    let client = reqwest::Client::builder()
        .user_agent("EstoqueTI/1.0")
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("Erro ao criar cliente HTTP: {}", e))?;

    let url = format!("https://api.github.com/repos/{}/{}/contents/{}", config.owner, config.repo, config.path);
    let mut sha: Option<String> = None;
    let get_res = client.get(&url)
        .header("Authorization", format!("token {}", config.token))
        .header("Accept", "application/vnd.github.v3+json")
        .send().await;
    if let Ok(resp) = get_res {
        if resp.status().is_success() {
            if let Ok(file_data) = resp.json::<serde_json::Value>().await {
                sha = file_data.get("sha").and_then(|s| s.as_str()).map(|s| s.to_string());
            }
        }
    }

    let mut body = serde_json::json!({
        "message": format!("sync: atualizacao desktop {}", chrono::Utc::now().format("%Y-%m-%dT%H:%M:%SZ")),
        "content": encoded,
    });
    if let Some(sha_val) = sha {
        body["sha"] = serde_json::json!(sha_val);
    }

    let put_res = client.put(&url)
        .header("Authorization", format!("token {}", config.token))
        .header("Accept", "application/vnd.github.v3+json")
        .header("Content-Type", "application/json")
        .json(&body)
        .send().await
        .map_err(|e| format!("Erro de rede: {}", e))?;

    if put_res.status().is_success() {
        Ok("Dados enviados ao GitHub com sucesso".to_string())
    } else {
        let status = put_res.status();
        let text = put_res.text().await.unwrap_or_default();
        Err(format!("Erro HTTP {}: {}", status, text))
    }
}

#[tauri::command(rename_all = "snake_case")]
async fn pull_from_github() -> Result<String, String> {
    let config = read_sync_config()?;

    let client = reqwest::Client::builder()
        .user_agent("EstoqueTI/1.0")
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("Erro ao criar cliente HTTP: {}", e))?;

    let url = format!("https://api.github.com/repos/{}/{}/contents/{}", config.owner, config.repo, config.path);
    let res = client.get(&url)
        .header("Authorization", format!("token {}", config.token))
        .header("Accept", "application/vnd.github.v3+json")
        .send().await
        .map_err(|e| format!("Erro de rede: {}", e))?;

    if res.status().as_u16() == 404 {
        return Ok("Nenhum dado no GitHub ainda".to_string());
    }
    if !res.status().is_success() {
        return Err(format!("Erro HTTP {}", res.status()));
    }

    let file_data: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
    let content_b64 = file_data.get("content").and_then(|c| c.as_str()).unwrap_or("");
    let decoded = base64::engine::general_purpose::STANDARD.decode(content_b64.replace('\n', "")).map_err(|e| e.to_string())?;
    let json_str = String::from_utf8(decoded).map_err(|e| e.to_string())?;
    let dados: ExportData = serde_json::from_str(&json_str).map_err(|e| e.to_string())?;

    import_all_data(dados)
}

// ============================================================================
//  INIT
// ============================================================================

fn init_database() -> Result<(), String> {
    let conn = db::open_conn().map_err(|e| e.to_string())?;
    db::init_schema(&conn).map_err(|e| e.to_string())?;
    db::seed_data(&conn).map_err(|e| e.to_string())?;
    Ok(())
}

// ============================================================================
//  ENTRY POINT
// ============================================================================

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    init_database().expect("Falha ao inicializar banco de dados");

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            dashboard_stats,
            list_lojas,
            create_loja,
            update_loja,
            delete_loja,
            list_categorias,
            create_categoria,
            update_categoria,
            delete_categoria,
            list_fornecedores,
            create_fornecedor,
            update_fornecedor,
            list_produtos,
            create_produto,
            update_produto,
            update_produto_categoria,
            list_usuarios,
            login,
            create_usuario,
            update_usuario,
            verify_password,
            list_movimentacoes,
            create_movimentacao,
            list_solicitacoes,
            create_solicitacao,
            update_solicitacao_status,
            update_solicitacao_observacao,
            list_solicitacao_itens,
            add_solicitacao_item,
            remove_solicitacao_item,
            delete_solicitacao,
            list_pedidos,
            set_pedido_itens,
            list_pedido_itens,
            create_pedido,
            list_alertas,
            mark_alerta_lido,
            delete_all_produtos,
            delete_produto,
            update_movimentacao,
            delete_movimentacao,
            delete_pedido,
            update_pedido,
            delete_all_movimentacoes,
            print_romaneio,
            save_romaneio_html,
            open_in_browser,
            save_and_open_html,
            print_product_label,
            export_all_data,
            import_all_data,
            read_sync_config,
            read_sync_config_status,
            push_to_github,
            pull_from_github,

        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

// ============================================================================
//  PRINT — ROMANEIO TÉRMICO (ESC/POS via Windows)
// ============================================================================

/// Abre um arquivo .html gerado pelo app no navegador padrão (Windows).
/// Valida o caminho por segurança antes de executar.
#[tauri::command(rename_all = "snake_case")]
fn open_in_browser(file_path: String) -> Result<(), String> {
    let path = std::path::Path::new(&file_path);
    if !path.is_absolute() {
        return Err("Caminho inválido: o caminho deve ser absoluto".to_string());
    }
    if !path.exists() {
        return Err(format!("Arquivo não encontrado: {}", file_path));
    }
    let eh_html = path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.eq_ignore_ascii_case("html"))
        .unwrap_or(false);
    if !eh_html {
        return Err("Apenas arquivos .html podem ser abertos".to_string());
    }
    // Deve estar dentro do diretório de dados do app (%APPDATA%\EstoqueTI) ou da pasta temporária
    let canon = path.canonicalize().map_err(|e| format!("Caminho inválido: {}", e))?;
    let mut bases: Vec<std::path::PathBuf> = Vec::new();
    if let Ok(appdata) = std::env::var("APPDATA") {
        bases.push(std::path::PathBuf::from(appdata).join("EstoqueTI"));
    }
    bases.push(std::env::temp_dir());
    let permitido = bases
        .iter()
        .any(|b| b.canonicalize().map(|cb| canon.starts_with(cb)).unwrap_or(false));
    if !permitido {
        return Err("Acesso negado: arquivo fora do diretório de dados do aplicativo".to_string());
    }
    std::process::Command::new("cmd")
        .args(["/C", "start", "", &file_path])
        .status()
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Salva HTML em arquivo temporario e abre no navegador em uma unica chamada.
#[tauri::command(rename_all = "snake_case")]
fn save_and_open_html(html: String, titulo: String) -> Result<(), String> {
    let name = format!("{}.html", titulo.replace(|c: char| !c.is_alphanumeric(), "_"));
    let tmp = std::env::temp_dir().join(&name);
    std::fs::write(&tmp, &html).map_err(|e| e.to_string())?;
    let path_str = tmp.to_string_lossy().to_string();
    std::process::Command::new("cmd")
        .args(["/C", "start", "", &path_str])
        .status()
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ============================================================================
//  PRINT — ETIQUETA DE PRODUTO (A4, grid dinamico)
// ============================================================================

/// Escapa texto para interpolacao segura em HTML.
fn esc_html(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#39;")
}

/// Gera HTML de etiquetas A4 (JsBarcode CODE128 via CDN) e abre no navegador.
/// - pequena: 70x35mm | media: 100x50mm | grande: 150x70mm
#[tauri::command(rename_all = "snake_case")]
fn print_product_label(
    produto_id: i64,
    quantidade: i32,
    empresa: String,
    tamanho: String,
) -> Result<(), String> {
    let conn = db::open_conn().map_err(|e| e.to_string())?;

    // Busca dados do produto (nome, codigo, marca, modelo, categoria)
    let produto: (String, String, Option<String>, Option<String>, Option<String>) = conn
        .query_row(
            "SELECT p.nome, p.codigo, p.marca, p.modelo, c.nome
             FROM produtos p
             LEFT JOIN categorias c ON p.categoria_id = c.id
             WHERE p.id = ?1",
            params![produto_id],
            |r| {
                Ok((
                    r.get(0)?,
                    r.get(1)?,
                    r.get(2)?,
                    r.get(3)?,
                    r.get(4)?,
                ))
            },
        )
        .map_err(|e| format!("Produto nao encontrado: {}", e))?;

    let (nome, codigo, marca, modelo, categoria) = produto;
    let qtd = quantidade.max(1);

    // Dimensoes por tamanho (A4, grid dinamico)
    let (largura, altura, fs) = match tamanho.as_str() {
        "media" => ("100mm", "50mm", "10px"),
        "grande" => ("150mm", "70mm", "12px"),
        _ => ("70mm", "35mm", "8px"), // pequena (padrao)
    };

    // Gera N etiquetas (uma por unidade)
    let mut etiquetas = String::new();
    for _ in 0..qtd {
        etiquetas.push_str(&format!(
            r#"<div class="etiq">
  <div class="emp"><b>{empresa}</b></div>
  <div class="nome"><b>{nome}</b></div>
  <div class="linha"><b>Código:</b> {codigo}</div>
  <div class="linha"><b>Marca:</b> {marca}</div>
  <div class="linha"><b>Modelo:</b> {modelo}</div>
  <div class="linha"><b>Categoria:</b> {categoria}</div>
  <svg class="bc" data-val="{codigo}"></svg>
</div>"#,
            empresa = esc_html(&empresa),
            nome = esc_html(&nome),
            codigo = esc_html(&codigo),
            marca = esc_html(marca.as_deref().unwrap_or("—")),
            modelo = esc_html(modelo.as_deref().unwrap_or("—")),
            categoria = esc_html(categoria.as_deref().unwrap_or("—")),
        ));
    }

    let html = format!(
        r#"<!doctype html>
<html><head><meta charset="utf-8"><title>Etiquetas {nome}</title>
<script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.12.3/dist/JsBarcode.all.min.js"></script>
<style>
  @page {{ size: A4; margin: 10mm; }}
  body {{ font-family: monospace; margin: 0; padding: 3mm; color: #000; background: #fff;
         -webkit-print-color-adjust: exact; print-color-adjust: exact; color-adjust: exact; }}
  .grid {{ display: flex; flex-wrap: wrap; gap: 3mm; }}
  .etiq {{ width: {largura}; height: {altura}; border: 1px solid #333; padding: 3mm;
          box-sizing: border-box; overflow: hidden; display: flex; flex-direction: column; background: #fff; }}
  .emp {{ text-align: center; font-size: {fs}; }}
  .nome {{ text-align: center; font-size: {fs}; font-weight: bold; }}
  .linha {{ font-size: {fs}; }}
  .bc {{ margin-top: auto; max-width: 100%; background: #FFFFFF !important; shape-rendering: crispEdges; image-rendering: crisp-edges; }}
  svg rect {{ shape-rendering: crispEdges; }}
  @media print {{ .etiq {{ page-break-inside: avoid; }} svg{{ background: #fff !important; }} }}

</style></head>
<body>
  <div class="grid">{etiquetas}</div>
  <script>
    window.onload = function () {{
      setTimeout(function () {{
        document.querySelectorAll('.bc').forEach(function (el) {{
          try {{
            JsBarcode(el, el.getAttribute('data-val'), {{
              format: 'CODE128', displayValue: true,
              fontSize: {fs_num}, height: 44, width: 2, background: '#FFFFFF', lineColor: '#000000', margin: 10, flat: true
            }});
            el.style.background = '#FFFFFF';
            el.style.shapeRendering = 'crispEdges';
          }} catch (e) {{}}
        }});
        window.print();
      }}, 100);
    }};
  </script>
</body></html>"#,
        nome = esc_html(&nome),
        largura = largura,
        altura = altura,
        fs = fs,
        fs_num = if tamanho == "grande" { "14" } else if tamanho == "media" { "11" } else { "9" },
        etiquetas = etiquetas,
    );

    save_and_open_html(html, format!("etiqueta_{}", nome))
}

// ============================================================================
//  SYNC — EXPORT / IMPORT (Web <-> Desktop)
// ============================================================================

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ExportData {
    pub versao: String,
    pub data_exportacao: String,
    #[serde(default)]
    pub lojas: Vec<Loja>,
    #[serde(default)]
    pub categorias: Vec<Categoria>,
    #[serde(default)]
    pub fornecedores: Vec<Fornecedor>,
    #[serde(default)]
    pub produtos: Vec<Produto>,
    #[serde(default)]
    pub usuarios: Vec<Usuario>,
    #[serde(default)]
    pub movimentacoes: Vec<Movimentacao>,
    #[serde(default)]
    pub solicitacoes: Vec<Solicitacao>,
    #[serde(default)]
    pub solicitacao_itens: Vec<SolicitacaoItem>,
    #[serde(default)]
    pub pedidos: Vec<Pedido>,
    #[serde(default)]
    pub pedido_itens: Vec<PedidoItem>,
    #[serde(default)]
    pub alertas: Vec<Alerta>,
}

#[tauri::command(rename_all = "snake_case")]
fn export_all_data() -> Result<ExportData, String> {
    let conn = db::open_conn().map_err(|e| e.to_string())?;
    let now = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string();

    let mut stmt_lojas = conn.prepare("SELECT id, nome, codigo, endereco, ativa FROM lojas").map_err(|e| e.to_string())?;
    let lojas: Vec<Loja> = stmt_lojas.query_map([], |r| Ok(Loja { id: r.get(0)?, nome: r.get(1)?, codigo: r.get(2)?, endereco: r.get(3)?, ativa: r.get::<_, i64>(4)? != 0 }))
        .map_err(|e| e.to_string())?.filter_map(|r| r.ok()).collect();

    let mut stmt_cats = conn.prepare("SELECT id, nome, descricao, ativa FROM categorias").map_err(|e| e.to_string())?;
    let categorias: Vec<Categoria> = stmt_cats.query_map([], |r| Ok(Categoria { id: r.get(0)?, nome: r.get(1)?, descricao: r.get(2)?, ativa: r.get::<_, i64>(3)? != 0 }))
        .map_err(|e| e.to_string())?.filter_map(|r| r.ok()).collect();

    let mut stmt_forn = conn.prepare("SELECT id, nome, cnpj, contato, email, telefone, ativo FROM fornecedores").map_err(|e| e.to_string())?;
    let fornecedores: Vec<Fornecedor> = stmt_forn.query_map([], |r| Ok(Fornecedor { id: r.get(0)?, nome: r.get(1)?, cnpj: r.get(2)?, contato: r.get(3)?, email: r.get(4)?, telefone: r.get(5)?, ativo: r.get::<_, i64>(6)? != 0 }))
        .map_err(|e| e.to_string())?.filter_map(|r| r.ok()).collect();

    let mut stmt_prod = conn.prepare("SELECT p.id, p.codigo, p.nome, p.marca, p.modelo, p.descricao, p.categoria_id, c.nome, p.fornecedor_id, f.nome, p.unidade, p.preco_compra, p.preco_venda, p.estoque, p.estoque_minimo, p.custo_total, p.ativo FROM produtos p LEFT JOIN categorias c ON p.categoria_id = c.id LEFT JOIN fornecedores f ON p.fornecedor_id = f.id").map_err(|e| e.to_string())?;
    let produtos: Vec<Produto> = stmt_prod.query_map([], |r| Ok(Produto {
        id: r.get(0)?, codigo: r.get(1)?, nome: r.get(2)?, marca: r.get(3)?, modelo: r.get(4)?,
        descricao: r.get(5)?, categoria_id: r.get(6)?, categoria_nome: r.get(7)?,
        fornecedor_id: r.get(8)?, fornecedor_nome: r.get(9)?, unidade: r.get(10)?,
        preco_compra: r.get(11)?, preco_venda: r.get(12)?, estoque: r.get(13)?,
        estoque_minimo: r.get(14)?, custo_total: r.get(15)?, ativo: r.get::<_, i64>(16)? != 0,
    })).map_err(|e| e.to_string())?.filter_map(|r| r.ok()).collect();

    // SEGURANÇA: Senha (hash Argon2) NUNCA é exportada no JSON de sync.
    // O campo `senha` é preenchido vazio — senhas só existem no banco local.
    let mut stmt_usu = conn.prepare("SELECT u.id, u.nome, u.email, u.perfil, u.loja_id, l.nome, u.ativo FROM usuarios u LEFT JOIN lojas l ON u.loja_id = l.id").map_err(|e| e.to_string())?;
    let usuarios: Vec<Usuario> = stmt_usu.query_map([], |r| Ok(Usuario {
        id: r.get(0)?, nome: r.get(1)?, email: r.get(2)?, senha: String::new(), perfil: r.get(3)?,
        loja_id: r.get(4)?, loja_nome: r.get(5)?, ativo: r.get::<_, i64>(6)? != 0,
    })).map_err(|e| e.to_string())?.filter_map(|r| r.ok()).collect();

    let mut stmt_mov = conn.prepare("SELECT id, tipo, produto_id, produto_nome, quantidade, loja_origem_id, loja_origem_nome, loja_destino_id, loja_destino_nome, usuario_id, observacao, data_movimento, preco_compra, unidade FROM movimentacoes").map_err(|e| e.to_string())?;
    let movimentacoes: Vec<Movimentacao> = stmt_mov.query_map([], |r| Ok(Movimentacao {
        id: r.get(0)?, tipo: r.get(1)?, produto_id: r.get(2)?, produto_nome: r.get(3)?,
        quantidade: r.get(4)?, loja_origem_id: r.get(5)?, loja_origem_nome: r.get(6)?,
        loja_destino_id: r.get(7)?, loja_destino_nome: r.get(8)?, usuario_id: r.get(9)?,
        observacao: r.get(10)?, data_movimento: r.get(11)?, preco_compra: r.get(12)?, unidade: r.get(13)?,
    })).map_err(|e| e.to_string())?.filter_map(|r| r.ok()).collect();

    let mut stmt_sol = conn.prepare("SELECT s.id, s.loja_id, l.nome, s.usuario_id, u.nome, s.observacao, s.status, s.data_solicitacao, (SELECT COUNT(*) FROM solicitacao_itens si WHERE si.solicitacao_id = s.id) FROM solicitacoes s LEFT JOIN lojas l ON s.loja_id = l.id LEFT JOIN usuarios u ON s.usuario_id = u.id").map_err(|e| e.to_string())?;
    let solicitacoes: Vec<Solicitacao> = stmt_sol.query_map([], |r| Ok(Solicitacao {
        id: r.get(0)?, loja_id: r.get(1)?, loja_nome: r.get(2)?, usuario_id: r.get(3)?,
        usuario_nome: r.get(4)?, observacao: r.get(5)?, status: r.get(6)?,
        data_solicitacao: r.get(7)?, total_itens: r.get(8)?,
    })).map_err(|e| e.to_string())?.filter_map(|r| r.ok()).collect();

    let mut stmt_si = conn.prepare("SELECT si.id, si.solicitacao_id, si.produto_id, p.nome, p.codigo, p.unidade, si.quantidade FROM solicitacao_itens si LEFT JOIN produtos p ON si.produto_id = p.id").map_err(|e| e.to_string())?;
    let solicitacao_itens: Vec<SolicitacaoItem> = stmt_si.query_map([], |r| Ok(SolicitacaoItem {
        id: r.get(0)?, solicitacao_id: r.get(1)?, produto_id: r.get(2)?,
        produto_nome: r.get(3)?, produto_codigo: r.get(4)?, unidade: r.get(5)?, quantidade: r.get(6)?,
    })).map_err(|e| e.to_string())?.filter_map(|r| r.ok()).collect();

    let mut stmt_ped = conn.prepare("SELECT p.id, p.numero, p.loja_id, l.nome, l.codigo, p.solicitante, p.origem, p.status, p.arquivo_pdf, p.data_pedido, p.setor FROM pedidos p LEFT JOIN lojas l ON p.loja_id = l.id").map_err(|e| e.to_string())?;
    let pedidos: Vec<Pedido> = stmt_ped.query_map([], |r| Ok(Pedido {
        id: r.get(0)?, numero: r.get(1)?, loja_id: r.get(2)?, loja_nome: r.get(3)?,
        loja_codigo: r.get(4)?, solicitante: r.get(5)?, origem: r.get(6)?, status: r.get(7)?,
        arquivo_pdf: r.get(8)?, data_pedido: r.get(9)?, setor: r.get(10)?,
    })).map_err(|e| e.to_string())?.filter_map(|r| r.ok()).collect();

    let mut stmt_pi = conn.prepare("SELECT id, pedido_id, produto_id, produto_nome, unidade, quantidade FROM pedido_itens").map_err(|e| e.to_string())?;
    let pedido_itens: Vec<PedidoItem> = stmt_pi.query_map([], |r| Ok(PedidoItem {
        id: r.get(0)?, pedido_id: r.get(1)?, produto_id: r.get(2)?,
        produto_nome: r.get(3)?, unidade: r.get(4)?, quantidade: r.get(5)?,
    })).map_err(|e| e.to_string())?.filter_map(|r| r.ok()).collect();

    let mut stmt_ale = conn.prepare("SELECT id, tipo, titulo, mensagem, data_alerta, lido FROM alertas").map_err(|e| e.to_string())?;
    let alertas: Vec<Alerta> = stmt_ale.query_map([], |r| Ok(Alerta {
        id: r.get(0)?, tipo: r.get(1)?, titulo: r.get(2)?, mensagem: r.get(3)?,
        data_alerta: r.get(4)?, lido: r.get::<_, i64>(5)? != 0,
    })).map_err(|e| e.to_string())?.filter_map(|r| r.ok()).collect();

    Ok(ExportData {
        versao: "1.0".to_string(),
        data_exportacao: now,
        lojas, categorias, fornecedores, produtos, usuarios,
        movimentacoes, solicitacoes, solicitacao_itens,
        pedidos, pedido_itens, alertas,
    })
}

#[tauri::command(rename_all = "snake_case")]
fn import_all_data(dados: ExportData) -> Result<String, String> {
    // Se todos os arrays estiverem vazios, nao sobrescrever dados locais
    let total = dados.lojas.len() + dados.categorias.len() + dados.produtos.len()
        + dados.usuarios.len() + dados.movimentacoes.len() + dados.pedidos.len();
    if total == 0 {
        return Ok("Nada para importar — dados remotos estao vazios".to_string());
    }

    let conn = db::open_conn().map_err(|e| e.to_string())?;
    // Desligar FKs durante a importação (INSERT OR REPLACE pode violar ordem de referências).
    // A FK é religada sempre, mesmo em erro, e tudo roda em transação (commit/rollback garantido).
    conn.execute("PRAGMA foreign_keys = OFF", []).map_err(|e| e.to_string())?;
    let result = (|| -> Result<String, String> {
        let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
        let mut stats = std::collections::HashMap::new();

        // DELETE ordenado (filhas antes de mães) para importação limpa
        for tabela in &["pedido_itens", "pedidos", "solicitacao_itens", "solicitacoes", "movimentacoes", "alertas", "usuarios", "produtos", "fornecedores", "categorias", "lojas"] {
            tx.execute(&format!("DELETE FROM {}", tabela), []).map_err(|e| e.to_string())?;
        }

    // Lojas
    for item in &dados.lojas {
        tx.execute("INSERT OR REPLACE INTO lojas (id, nome, codigo, endereco, ativa) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![item.id, item.nome, item.codigo, item.endereco, item.ativa as i64]).map_err(|e| e.to_string())?;
        *stats.entry("lojas".to_string()).or_insert(0) += 1;
    }

    // Categorias
    for item in &dados.categorias {
        tx.execute("INSERT OR REPLACE INTO categorias (id, nome, descricao, ativa) VALUES (?1, ?2, ?3, ?4)",
            params![item.id, item.nome, item.descricao, item.ativa as i64]).map_err(|e| e.to_string())?;
        *stats.entry("categorias".to_string()).or_insert(0) += 1;
    }

    // Fornecedores
    for item in &dados.fornecedores {
        tx.execute("INSERT OR REPLACE INTO fornecedores (id, nome, cnpj, contato, email, telefone, ativo) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![item.id, item.nome, item.cnpj, item.contato, item.email, item.telefone, item.ativo as i64]).map_err(|e| e.to_string())?;
        *stats.entry("fornecedores".to_string()).or_insert(0) += 1;
    }

    // Produtos
    for item in &dados.produtos {
        tx.execute("INSERT OR REPLACE INTO produtos (id, codigo, nome, marca, modelo, descricao, categoria_id, fornecedor_id, unidade, preco_compra, preco_venda, estoque, estoque_minimo, custo_total, ativo) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)",
            params![item.id, item.codigo, item.nome, item.marca, item.modelo, item.descricao,
                item.categoria_id, item.fornecedor_id, item.unidade, item.preco_compra,
                item.preco_venda, item.estoque, item.estoque_minimo, item.custo_total, item.ativo as i64]).map_err(|e| e.to_string())?;
        *stats.entry("produtos".to_string()).or_insert(0) += 1;
    }

    // Usuarios — NUNCA sobrescrever senha local com dado importado.
    // O export não contém senhas (proteção de credenciais), então preservamos
    // sempre a senha local. Se o usuário não existe localmente, cria sem senha
    // (o admin precisará redefinir a senha manualmente).
    for item in &dados.usuarios {
        let senha_local: String = tx.query_row("SELECT COALESCE(senha, '') FROM usuarios WHERE id=?1", params![item.id], |r| r.get(0))
            .unwrap_or_default();
        let senha_final = if senha_local.is_empty() { String::new() } else { senha_local };
        tx.execute("INSERT OR REPLACE INTO usuarios (id, nome, email, senha, perfil, loja_id, ativo) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![item.id, item.nome, item.email, senha_final, item.perfil, item.loja_id, item.ativo as i64]).map_err(|e| e.to_string())?;
        *stats.entry("usuarios".to_string()).or_insert(0) += 1;
    }

    // Movimentacoes
    for item in &dados.movimentacoes {
        tx.execute("INSERT OR REPLACE INTO movimentacoes (id, tipo, produto_id, produto_nome, quantidade, loja_origem_id, loja_origem_nome, loja_destino_id, loja_destino_nome, usuario_id, observacao, data_movimento, preco_compra, unidade) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
            params![item.id, item.tipo, item.produto_id, item.produto_nome, item.quantidade,
                item.loja_origem_id, item.loja_origem_nome, item.loja_destino_id, item.loja_destino_nome,
                item.usuario_id, item.observacao, item.data_movimento, item.preco_compra, item.unidade]).map_err(|e| e.to_string())?;
        *stats.entry("movimentacoes".to_string()).or_insert(0) += 1;
    }

    // Solicitacoes
    for item in &dados.solicitacoes {
        tx.execute("INSERT OR REPLACE INTO solicitacoes (id, loja_id, usuario_id, observacao, status, data_solicitacao) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![item.id, item.loja_id, item.usuario_id, item.observacao, item.status, item.data_solicitacao]).map_err(|e| e.to_string())?;
        *stats.entry("solicitacoes".to_string()).or_insert(0) += 1;
    }

    // Solicitacao Itens
    for item in &dados.solicitacao_itens {
        tx.execute("INSERT OR REPLACE INTO solicitacao_itens (id, solicitacao_id, produto_id, quantidade) VALUES (?1, ?2, ?3, ?4)",
            params![item.id, item.solicitacao_id, item.produto_id, item.quantidade]).map_err(|e| e.to_string())?;
        *stats.entry("solicitacao_itens".to_string()).or_insert(0) += 1;
    }

    // Pedidos
    for item in &dados.pedidos {
        tx.execute("INSERT OR REPLACE INTO pedidos (id, numero, loja_id, solicitante, origem, status, arquivo_pdf, data_pedido, setor) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![item.id, item.numero, item.loja_id, item.solicitante, item.origem, item.status, item.arquivo_pdf, item.data_pedido, item.setor]).map_err(|e| e.to_string())?;
        *stats.entry("pedidos".to_string()).or_insert(0) += 1;
    }

    // Pedido Itens
    for item in &dados.pedido_itens {
        tx.execute("INSERT OR REPLACE INTO pedido_itens (id, pedido_id, produto_id, produto_nome, unidade, quantidade) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![item.id, item.pedido_id, item.produto_id, item.produto_nome, item.unidade, item.quantidade]).map_err(|e| e.to_string())?;
        *stats.entry("pedido_itens".to_string()).or_insert(0) += 1;
    }

    // Alertas
    for item in &dados.alertas {
        tx.execute("INSERT OR REPLACE INTO alertas (id, tipo, titulo, mensagem, data_alerta, lido) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![item.id, item.tipo, item.titulo, item.mensagem, item.data_alerta, item.lido as i64]).map_err(|e| e.to_string())?;
        *stats.entry("alertas".to_string()).or_insert(0) += 1;
    }

    // Resetar sequences para evitar conflitos de ID futuro
    // SEGURANÇA: Usa allowlist de tabelas conhecidas em vez de format! direto
    const TABELAS_VALIDAS: &[&str] = &["lojas", "categorias", "fornecedores", "produtos", "usuarios", "movimentacoes", "solicitacoes", "solicitacao_itens", "pedidos", "pedido_itens", "alertas"];
    for tabela in TABELAS_VALIDAS {
        // Validação extra: só aceita nomes alfanuméricos + underscore
        if !tabela.chars().all(|c| c.is_alphanumeric() || c == '_') {
            continue;
        }
        let max_id: i64 = tx.query_row(&format!("SELECT COALESCE(MAX(id), 0) FROM {}", tabela), [], |r| r.get(0)).unwrap_or(0);
        if max_id > 0 {
            let _ = tx.execute(&format!("INSERT OR REPLACE INTO sqlite_sequence (name, seq) VALUES ('{}', {})", tabela, max_id), []);
        }
    }

    let total: i64 = stats.values().sum();
    let relatorio: String = stats.iter().map(|(k, v)| format!("{}: {}", k, v)).collect::<Vec<_>>().join(", ");
    tx.commit().map_err(|e| e.to_string())?;
    Ok(format!("Importacao concluida! {} registros em: {}", total, relatorio))
    })();
    // Reabilitar FK checks sempre, mesmo se a importação falhou
    conn.execute("PRAGMA foreign_keys = ON", []).map_err(|e| e.to_string())?;
    result
}
#[tauri::command(rename_all = "snake_case")]
fn save_romaneio_html(html: String, numero: String) -> Result<String, String> {
    let name = format!("romaneio_{}.html", numero.replace(|c: char| !c.is_alphanumeric(), "_"));
    let tmp = std::env::temp_dir().join(&name);
    std::fs::write(&tmp, &html).map_err(|e| e.to_string())?;
    Ok(tmp.to_string_lossy().to_string())
}

/// Usa Out-Printer (PowerShell) para enviar raw ESC/POS — ideal para Epson térmica 80mm.
#[tauri::command(rename_all = "snake_case")]
fn print_romaneio(texto: String) -> Result<(), String> {
    // ESC/POS commands: reset + bold + emphasized + double-strike + cut
    let esc: &[u8] = &[
        0x1B, 0x40,       // ESC @  — reset
        0x1D, 0x62, 0x09, // GS b n — bold on (n=9, max density)
        0x1B, 0x45, 0x01, // ESC E n — emphasized on
        0x1B, 0x47, 0x01, // ESC G n — double-strike on
    ];
    let cut: &[u8] = &[0x1D, 0x56, 0x00]; // GS V 0 — paper cut
    let mut raw = Vec::new();
    raw.extend_from_slice(esc);
    raw.extend_from_slice(texto.as_bytes());
    raw.extend_from_slice(cut);

    let tmp = tempfile::NamedTempFile::new().map_err(|e| e.to_string())?;
    let path = tmp.path().to_string_lossy().to_string();
    std::fs::write(&path, &raw).map_err(|e| e.to_string())?;

    // Tenta 3 métodos, do mais direto ao fallback
    let methods: &[&[&str]] = &[
        // 1. PowerShell Out-Printer (raw binário → melhor para ESC/POS)
        &["powershell", "-NoProfile", "-Command",
          &format!("Get-Content -Encoding Byte '{}' | Out-Printer", &path)],
        // 2. copy /b para porta USB da impressora
        &["cmd", "/C", &format!("copy /b \"{}\" \\\\.\\USB001", &path)],
        // 3. Fallback: print clássico do Windows
        &["cmd", "/C", &format!("print /D:\"\" \"{}\"", &path)],
    ];

    for args in methods {
        let status = std::process::Command::new(args[0])
            .args(&args[1..])
            .status()
            .map_err(|e| e.to_string())?;
        if status.success() {
            return Ok(());
        }
    }

    Err("Falha ao imprimir. Verifique se a impressora Epson está ligada e configurada como padrão.".to_string())
}


