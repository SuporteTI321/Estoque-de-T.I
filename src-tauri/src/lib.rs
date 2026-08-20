mod db;

use rusqlite::params;
use serde::{Deserialize, Serialize};
use argon2::{
    password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2, Algorithm, Version, Params,
};

// ============================================================================
//  PASSWORD HASHING (Argon2id — OWASP 2024 recommendation)
// ============================================================================

fn hash_password(password: &str) -> String {
    let salt = SaltString::generate(&mut OsRng);
    let argon2 = Argon2::new(Algorithm::Argon2id, Version::V0x13, Params::default());
    argon2.hash_password(password.as_bytes(), &salt)
        .expect("Falha ao gerar hash de senha")
        .to_string()
}

fn verify_password(password: &str, hash: &str) -> bool {
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
    #[serde(skip_serializing)]
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
    let conn = db::open_conn().map_err(|e| e.to_string())?;
    // Verificar se usuario e admin
    let perfil: String = conn
        .query_row("SELECT perfil FROM usuarios WHERE id=?1 AND ativo=1", params![usuario_id], |r| r.get(0))
        .map_err(|_| "Usuario nao encontrado".to_string())?;
    if perfil != "admin" {
        return Err("Apenas administradores podem excluir todos os produtos".to_string());
    }
    conn.execute("DELETE FROM produtos", []).map_err(|e| e.to_string())?;
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
        let _ = conn.execute("UPDATE produtos SET estoque = 0, custo_total = 0 WHERE id=?1", params![id]);
    }
    conn.execute("DELETE FROM movimentacoes WHERE produto_id=?1", params![id]).map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM produtos WHERE id=?1", params![id]).map_err(|e| e.to_string())?;
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
    let conn = db::open_conn().map_err(|e| e.to_string())?;
    if let Some(q) = quantidade {
        conn.execute("UPDATE movimentacoes SET quantidade=?1 WHERE id=?2", params![q, id]).map_err(|e| e.to_string())?;
    }
    if let Some(pc) = preco_compra {
        conn.execute("UPDATE movimentacoes SET preco_compra=?1 WHERE id=?2", params![pc, id]).map_err(|e| e.to_string())?;
    }
    if let Some(u) = unidade {
        conn.execute("UPDATE movimentacoes SET unidade=?1 WHERE id=?2", params![u, id]).map_err(|e| e.to_string())?;
    }
    if let Some(o) = observacao {
        conn.execute("UPDATE movimentacoes SET observacao=?1 WHERE id=?2", params![o, id]).map_err(|e| e.to_string())?;
    }
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
    let conn = db::open_conn().map_err(|e| e.to_string())?;
    // Buscar dados da movimentação antes de deletar
    let mov: Option<(String, i64, i64, Option<f64>)> = conn
        .query_row(
            "SELECT tipo, produto_id, quantidade, preco_compra FROM movimentacoes WHERE id=?1",
            params![id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        )
        .ok();
    if let Some((tipo, produto_id, quantidade, preco)) = mov {
        if tipo == "entrada" && produto_id > 0 {
            let preco_val = preco.unwrap_or(0.0);
            let qty = quantidade as f64;
            let _ = conn.execute(
                "UPDATE produtos SET estoque = MAX(0, estoque - ?1), custo_total = MAX(0, custo_total - (?2 * ?3)) WHERE id=?4",
                params![quantidade, preco_val, qty, produto_id],
            );
        } else if tipo == "saida" && produto_id > 0 {
            let _ = conn.execute(
                "UPDATE produtos SET estoque = estoque + ?1 WHERE id=?2",
                params![quantidade, produto_id],
            );
        }
    }
    conn.execute("DELETE FROM movimentacoes WHERE id=?1", params![id]).map_err(|e| e.to_string())?;
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
    Ok(Loja {
        id,
        nome,
        codigo,
        endereco,
        ativa: true,
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
    Ok(Categoria {
        id,
        nome,
        descricao,
        ativa: true,
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
                senha: row.get(3)?,
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
    // Busca usuario APENAS por email (senha verificada via Argon2)
    let mut stmt = conn
        .prepare(
            "SELECT u.id, u.nome, u.email, u.senha, u.perfil, u.loja_id, l.nome, u.ativo
             FROM usuarios u
             LEFT JOIN lojas l ON u.loja_id = l.id
             WHERE u.email=?1 AND u.ativo=1",
        )
        .map_err(|e| e.to_string())?;
    let mut rows = stmt
        .query(params![email])
        .map_err(|e| e.to_string())?;
    if let Some(row) = rows.next().map_err(|e| e.to_string())? {
        let stored_hash: String = row.get(3).map_err(|e| e.to_string())?;
        // Verifica senha com Argon2 (ou fallback para texto plano)
        if !verify_password(&senha, &stored_hash) {
            return Err("Credenciais inválidas".to_string());
        }
        // Migra senha de texto plano para Argon2 (lazy migration)
        if let Some(new_hash) = maybe_migrate_password(&senha, &stored_hash) {
            let uid: i64 = row.get(0).map_err(|e| e.to_string())?;
            let _ = conn.execute("UPDATE usuarios SET senha=?1 WHERE id=?2", params![new_hash, uid]);
        }
        Ok(Usuario {
            id: row.get(0).map_err(|e| e.to_string())?,
            nome: row.get(1).map_err(|e| e.to_string())?,
            email: row.get(2).map_err(|e| e.to_string())?,
            senha: String::new(), // Nunca retornar hash ao frontend
            perfil: row.get(4).map_err(|e| e.to_string())?,
            loja_id: row.get(5).map_err(|e| e.to_string())?,
            loja_nome: row.get(6).map_err(|e| e.to_string())?,
            ativo: row.get::<_, i64>(7).map_err(|e| e.to_string())? != 0,
        })
    } else {
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
    let senha_hash = hash_password(&senha);
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
        senha: senha_hash,
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
    let senha_hash = hash_password(&senha);
    conn.execute(
        "UPDATE usuarios SET nome=?1, email=?2, senha=?3, perfil=?4, loja_id=?5 WHERE id=?6",
        params![nome, email, senha_hash, perfil, loja_id, id],
    )
    .map_err(|e| e.to_string())?;
    Ok(Usuario {
        id,
        nome,
        email,
        senha: senha_hash,
        perfil,
        loja_id,
        loja_nome: None,
        ativo: true,
    })
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
    let conn = db::open_conn().map_err(|e| e.to_string())?;
    let now = chrono::Local::now().to_rfc3339();
    let dt = data_movimento.unwrap_or_else(|| now.clone());

    // Atualizar estoque apenas se produto existe no catálogo
    if tipo == "entrada" && produto_id > 0 {
        let preco = preco_compra.unwrap_or(0.0);
        let qty = quantidade as f64;
        conn.execute(
            "UPDATE produtos SET estoque = estoque + ?1, custo_total = custo_total + (?2 * ?3) WHERE id=?4",
            params![quantidade, preco, qty, produto_id],
        )
        .map_err(|e| e.to_string())?;
    } else if tipo == "saida" && produto_id > 0 {
        conn.execute(
            "UPDATE produtos SET estoque = MAX(0, estoque - ?1) WHERE id=?2",
            params![quantidade, produto_id],
        )
        .map_err(|e| e.to_string())?;
    } else if tipo == "transferencia" {
        if let Some(orig) = loja_origem_id {
            if produto_id > 0 {
                conn.execute(
                    "UPDATE produtos SET estoque = MAX(0, estoque - ?1) WHERE id=?2",
                    params![quantidade, produto_id],
                )
                .map_err(|e| e.to_string())?;
            }
            let _ = orig;
        }
    }

    // Desabilitar FK checks se produto_id = 0 (produto não cadastrado)
    if produto_id == 0 {
        conn.execute("PRAGMA foreign_keys = OFF", []).map_err(|e| e.to_string())?;
    }

    conn.execute(
        "INSERT INTO movimentacoes (tipo, produto_id, produto_nome, quantidade, loja_origem_id, loja_origem_nome, loja_destino_id, loja_destino_nome, usuario_id, observacao, preco_compra, unidade, data_movimento) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
        params![tipo, produto_id, produto_nome, quantidade, loja_origem_id, loja_origem_nome, loja_destino_id, loja_destino_nome, usuario_id, observacao, preco_compra, unidade, dt],
    )
    .map_err(|e| e.to_string())?;

    // Reabilitar FK checks
    if produto_id == 0 {
        conn.execute("PRAGMA foreign_keys = ON", []).map_err(|e| e.to_string())?;
    }

    let id = conn.last_insert_rowid();
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
            export_all_data,
            import_all_data,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

// ============================================================================
//  PRINT — ROMANEIO TÉRMICO (ESC/POS via Windows)
// ============================================================================

/// Abre um arquivo no navegador padrão do sistema (Windows).
/// Usa cmd /C start que aceita qualquer caminho, sem validação de scope do Tauri.
#[tauri::command(rename_all = "snake_case")]
fn open_in_browser(file_path: String) -> Result<(), String> {
    std::process::Command::new("cmd")
        .args(["/C", "start", "", &file_path])
        .status()
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ============================================================================
//  SYNC — EXPORT / IMPORT (Web <-> Desktop)
// ============================================================================

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ExportData {
    pub versao: String,
    pub data_exportacao: String,
    pub lojas: Vec<Loja>,
    pub categorias: Vec<Categoria>,
    pub fornecedores: Vec<Fornecedor>,
    pub produtos: Vec<Produto>,
    pub usuarios: Vec<Usuario>, // serde skip_serializing na senha
    pub movimentacoes: Vec<Movimentacao>,
    pub solicitacoes: Vec<Solicitacao>,
    pub solicitacao_itens: Vec<SolicitacaoItem>,
    pub pedidos: Vec<Pedido>,
    pub pedido_itens: Vec<PedidoItem>,
    pub alertas: Vec<Alerta>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct UsuarioSync {
    pub id: i64,
    pub nome: String,
    pub email: String,
    pub senha: String,
    pub perfil: String,
    pub loja_id: Option<i64>,
    pub loja_nome: Option<String>,
    pub ativo: bool,
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

    let mut stmt_usu = conn.prepare("SELECT u.id, u.nome, u.email, u.senha, u.perfil, u.loja_id, l.nome, u.ativo FROM usuarios u LEFT JOIN lojas l ON u.loja_id = l.id").map_err(|e| e.to_string())?;
    let usuarios: Vec<Usuario> = stmt_usu.query_map([], |r| Ok(Usuario {
        id: r.get(0)?, nome: r.get(1)?, email: r.get(2)?, senha: r.get(3)?, perfil: r.get(4)?,
        loja_id: r.get(5)?, loja_nome: r.get(6)?, ativo: r.get::<_, i64>(7)? != 0,
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
    let conn = db::open_conn().map_err(|e| e.to_string())?;
    let mut stats = std::collections::HashMap::new();

    // Lojas
    for item in &dados.lojas {
        conn.execute("INSERT OR REPLACE INTO lojas (id, nome, codigo, endereco, ativa) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![item.id, item.nome, item.codigo, item.endereco, item.ativa as i64]).map_err(|e| e.to_string())?;
        *stats.entry("lojas".to_string()).or_insert(0) += 1;
    }

    // Categorias
    for item in &dados.categorias {
        conn.execute("INSERT OR REPLACE INTO categorias (id, nome, descricao, ativa) VALUES (?1, ?2, ?3, ?4)",
            params![item.id, item.nome, item.descricao, item.ativa as i64]).map_err(|e| e.to_string())?;
        *stats.entry("categorias".to_string()).or_insert(0) += 1;
    }

    // Fornecedores
    for item in &dados.fornecedores {
        conn.execute("INSERT OR REPLACE INTO fornecedores (id, nome, cnpj, contato, email, telefone, ativo) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![item.id, item.nome, item.cnpj, item.contato, item.email, item.telefone, item.ativo as i64]).map_err(|e| e.to_string())?;
        *stats.entry("fornecedores".to_string()).or_insert(0) += 1;
    }

    // Produtos
    for item in &dados.produtos {
        conn.execute("INSERT OR REPLACE INTO produtos (id, codigo, nome, marca, modelo, descricao, categoria_id, fornecedor_id, unidade, preco_compra, preco_venda, estoque, estoque_minimo, custo_total, ativo) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)",
            params![item.id, item.codigo, item.nome, item.marca, item.modelo, item.descricao,
                item.categoria_id, item.fornecedor_id, item.unidade, item.preco_compra,
                item.preco_venda, item.estoque, item.estoque_minimo, item.custo_total, item.ativo as i64]).map_err(|e| e.to_string())?;
        *stats.entry("produtos".to_string()).or_insert(0) += 1;
    }

    // Usuarios (senhas sao exportadas apenas no import manual, nunca no sync GitHub)
    for item in &dados.usuarios {
        conn.execute("INSERT OR REPLACE INTO usuarios (id, nome, email, senha, perfil, loja_id, ativo) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![item.id, item.nome, item.email, item.senha, item.perfil, item.loja_id, item.ativo as i64]).map_err(|e| e.to_string())?;
        *stats.entry("usuarios".to_string()).or_insert(0) += 1;
    }

    // Movimentacoes
    for item in &dados.movimentacoes {
        conn.execute("INSERT OR REPLACE INTO movimentacoes (id, tipo, produto_id, produto_nome, quantidade, loja_origem_id, loja_origem_nome, loja_destino_id, loja_destino_nome, usuario_id, observacao, data_movimento, preco_compra, unidade) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
            params![item.id, item.tipo, item.produto_id, item.produto_nome, item.quantidade,
                item.loja_origem_id, item.loja_origem_nome, item.loja_destino_id, item.loja_destino_nome,
                item.usuario_id, item.observacao, item.data_movimento, item.preco_compra, item.unidade]).map_err(|e| e.to_string())?;
        *stats.entry("movimentacoes".to_string()).or_insert(0) += 1;
    }

    // Solicitacoes
    for item in &dados.solicitacoes {
        conn.execute("INSERT OR REPLACE INTO solicitacoes (id, loja_id, usuario_id, observacao, status, data_solicitacao) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![item.id, item.loja_id, item.usuario_id, item.observacao, item.status, item.data_solicitacao]).map_err(|e| e.to_string())?;
        *stats.entry("solicitacoes".to_string()).or_insert(0) += 1;
    }

    // Solicitacao Itens
    for item in &dados.solicitacao_itens {
        conn.execute("INSERT OR REPLACE INTO solicitacao_itens (id, solicitacao_id, produto_id, quantidade) VALUES (?1, ?2, ?3, ?4)",
            params![item.id, item.solicitacao_id, item.produto_id, item.quantidade]).map_err(|e| e.to_string())?;
        *stats.entry("solicitacao_itens".to_string()).or_insert(0) += 1;
    }

    // Pedidos
    for item in &dados.pedidos {
        conn.execute("INSERT OR REPLACE INTO pedidos (id, numero, loja_id, solicitante, origem, status, arquivo_pdf, data_pedido, setor) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![item.id, item.numero, item.loja_id, item.solicitante, item.origem, item.status, item.arquivo_pdf, item.data_pedido, item.setor]).map_err(|e| e.to_string())?;
        *stats.entry("pedidos".to_string()).or_insert(0) += 1;
    }

    // Pedido Itens
    for item in &dados.pedido_itens {
        conn.execute("INSERT OR REPLACE INTO pedido_itens (id, pedido_id, produto_id, produto_nome, unidade, quantidade) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![item.id, item.pedido_id, item.produto_id, item.produto_nome, item.unidade, item.quantidade]).map_err(|e| e.to_string())?;
        *stats.entry("pedido_itens".to_string()).or_insert(0) += 1;
    }

    // Alertas
    for item in &dados.alertas {
        conn.execute("INSERT OR REPLACE INTO alertas (id, tipo, titulo, mensagem, data_alerta, lido) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![item.id, item.tipo, item.titulo, item.mensagem, item.data_alerta, item.lido as i64]).map_err(|e| e.to_string())?;
        *stats.entry("alertas".to_string()).or_insert(0) += 1;
    }

    // Resetar sequences para evitar conflitos de ID futuro
    for tabela in &["lojas", "categorias", "fornecedores", "produtos", "usuarios", "movimentacoes", "solicitacoes", "solicitacao_itens", "pedidos", "pedido_itens", "alertas"] {
        let max_id: i64 = conn.query_row(&format!("SELECT COALESCE(MAX(id), 0) FROM {}", tabela), [], |r| r.get(0)).unwrap_or(0);
        let _ = conn.execute(&format!("INSERT OR REPLACE INTO sqlite_sequence (name, seq) VALUES ('{}', {})", tabela, max_id), []);
    }

    let total: i64 = stats.values().sum();
    let relatorio: String = stats.iter().map(|(k, v)| format!("{}: {}", k, v)).collect::<Vec<_>>().join(", ");
    Ok(format!("Importacao concluida! {} registros em: {}", total, relatorio))
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
