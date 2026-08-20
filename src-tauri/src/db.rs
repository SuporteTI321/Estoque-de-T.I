use rusqlite::{params, Connection, Result};
use std::path::PathBuf;
use std::sync::{Mutex, MutexGuard, OnceLock};
use argon2::{
    password_hash::{rand_core::OsRng, PasswordHasher, SaltString},
    Argon2, Algorithm, Version, Params,
};

fn argon2_hash(password: &str) -> String {
    let salt = SaltString::generate(&mut OsRng);
    let argon2 = Argon2::new(Algorithm::Argon2id, Version::V0x13, Params::default());
    argon2.hash_password(password.as_bytes(), &salt)
        .expect("Falha ao gerar hash de senha")
        .to_string()
}

fn db_path() -> PathBuf {
    // %APPDATA%\EstoqueTI\almoxarifado.db — fora da pasta do projeto
    if let Ok(appdata) = std::env::var("APPDATA") {
        let dir = PathBuf::from(appdata).join("EstoqueTI");
        let _ = std::fs::create_dir_all(&dir);
        return dir.join("almoxarifado.db");
    }
    // Fallback: pasta do executavel
    if let Ok(exe) = std::env::current_exe() {
        let mut p = exe.parent().unwrap_or(std::path::Path::new("."));
        for _ in 0..3 {
            if let Some(parent) = p.parent() { p = parent; } else { break; }
        }
        return p.join("almoxarifado.db");
    }
    std::env::current_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join("almoxarifado.db")
}

static CONN: OnceLock<Mutex<Connection>> = OnceLock::new();

fn get_conn() -> &'static Mutex<Connection> {
    CONN.get_or_init(|| {
        let path = db_path();
        let c = Connection::open(&path).expect("Falha ao abrir banco de dados");
        c.pragma_update(None, "journal_mode", "WAL").ok();
        c.pragma_update(None, "foreign_keys", "ON").ok();
        Mutex::new(c)
    })
}

pub fn open_conn() -> Result<MutexGuard<'static, Connection>> {
    Ok(get_conn().lock().unwrap())
}

pub fn init_schema(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS lojas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT NOT NULL,
            codigo TEXT NOT NULL UNIQUE,
            endereco TEXT,
            ativa INTEGER NOT NULL DEFAULT 1
        );

        CREATE TABLE IF NOT EXISTS categorias (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT NOT NULL UNIQUE,
            descricao TEXT,
            ativa INTEGER NOT NULL DEFAULT 1
        );

        CREATE TABLE IF NOT EXISTS fornecedores (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT NOT NULL,
            cnpj TEXT,
            contato TEXT,
            email TEXT,
            telefone TEXT,
            ativo INTEGER NOT NULL DEFAULT 1
        );

        CREATE TABLE IF NOT EXISTS produtos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            codigo TEXT NOT NULL UNIQUE,
            nome TEXT NOT NULL,
            marca TEXT,
            modelo TEXT,
            descricao TEXT,
            categoria_id INTEGER,
            fornecedor_id INTEGER,
            unidade TEXT NOT NULL DEFAULT 'un',
            preco_compra REAL NOT NULL DEFAULT 0,
            preco_venda REAL NOT NULL DEFAULT 0,
            estoque INTEGER NOT NULL DEFAULT 0,
            estoque_minimo INTEGER NOT NULL DEFAULT 0,
            custo_total REAL NOT NULL DEFAULT 0,
            ativo INTEGER NOT NULL DEFAULT 1,
            FOREIGN KEY (categoria_id) REFERENCES categorias(id),
            FOREIGN KEY (fornecedor_id) REFERENCES fornecedores(id)
        );

        CREATE TABLE IF NOT EXISTS usuarios (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT NOT NULL,
            email TEXT NOT NULL UNIQUE,
            senha TEXT NOT NULL,
            perfil TEXT NOT NULL DEFAULT 'operador',
            loja_id INTEGER,
            ativo INTEGER NOT NULL DEFAULT 1,
            FOREIGN KEY (loja_id) REFERENCES lojas(id)
        );

        CREATE TABLE IF NOT EXISTS movimentacoes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tipo TEXT NOT NULL,
            produto_id INTEGER NOT NULL,
            produto_nome TEXT,
            quantidade INTEGER NOT NULL,
            loja_origem_id INTEGER,
            loja_origem_nome TEXT,
            loja_destino_id INTEGER,
            loja_destino_nome TEXT,
            usuario_id INTEGER,
            observacao TEXT,
            preco_compra REAL,
            unidade INTEGER,
            data_movimento TEXT NOT NULL,
            FOREIGN KEY (produto_id) REFERENCES produtos(id),
            FOREIGN KEY (loja_origem_id) REFERENCES lojas(id),
            FOREIGN KEY (loja_destino_id) REFERENCES lojas(id),
            FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
        );

        CREATE TABLE IF NOT EXISTS solicitacoes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            loja_id INTEGER NOT NULL,
            usuario_id INTEGER,
            observacao TEXT,
            status TEXT NOT NULL DEFAULT 'pendente',
            data_solicitacao TEXT NOT NULL,
            FOREIGN KEY (loja_id) REFERENCES lojas(id),
            FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
        );

        CREATE TABLE IF NOT EXISTS solicitacao_itens (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            solicitacao_id INTEGER NOT NULL,
            produto_id INTEGER NOT NULL,
            quantidade INTEGER NOT NULL,
            FOREIGN KEY (solicitacao_id) REFERENCES solicitacoes(id) ON DELETE CASCADE,
            FOREIGN KEY (produto_id) REFERENCES produtos(id)
        );

        CREATE TABLE IF NOT EXISTS pedidos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            numero TEXT NOT NULL UNIQUE,
            loja_id INTEGER NOT NULL,
            solicitante TEXT NOT NULL,
            origem TEXT,
            status TEXT NOT NULL DEFAULT 'pendente',
            arquivo_pdf TEXT,
            setor TEXT,
            data_pedido TEXT NOT NULL,
            FOREIGN KEY (loja_id) REFERENCES lojas(id)
        );

        CREATE TABLE IF NOT EXISTS pedido_itens (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            pedido_id INTEGER NOT NULL,
            produto_id INTEGER NOT NULL DEFAULT 0,
            produto_nome TEXT NOT NULL,
            unidade TEXT,
            quantidade REAL NOT NULL DEFAULT 0,
            FOREIGN KEY (pedido_id) REFERENCES pedidos(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS alertas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tipo TEXT NOT NULL,
            titulo TEXT NOT NULL,
            mensagem TEXT NOT NULL,
            data_alerta TEXT NOT NULL,
            lido INTEGER NOT NULL DEFAULT 0
        );
        "#,
    )?;
    // Migration: adiciona coluna custo_total se não existir
    let _ = conn.execute("ALTER TABLE produtos ADD COLUMN custo_total REAL NOT NULL DEFAULT 0", []);
    // Migration: adiciona colunas marca e modelo se não existirem (bancos antigos)
    if conn.prepare("SELECT marca FROM produtos LIMIT 1").is_err() {
        let _ = conn.execute("ALTER TABLE produtos ADD COLUMN marca TEXT", []);
    }
    if conn.prepare("SELECT modelo FROM produtos LIMIT 1").is_err() {
        let _ = conn.execute("ALTER TABLE produtos ADD COLUMN modelo TEXT", []);
    }
    // Migration: adiciona coluna setor se não existir
    let _ = conn.execute("ALTER TABLE pedidos ADD COLUMN setor TEXT", []);
    Ok(())
}

// ============================================================================
//  SEED DATA
// ============================================================================

pub fn seed_data(conn: &Connection) -> Result<()> {
    let count: i64 = conn.query_row("SELECT COUNT(*) FROM produtos", [], |r| r.get(0))?;
    if count > 0 {
        return Ok(());
    }

    // Apenas 1 loja base para o Admin
    conn.execute(
        "INSERT OR IGNORE INTO lojas (nome, codigo, endereco) VALUES (?1, ?2, ?3)",
        params!["Almoxarifado Central", "ALM-001", "Matriz"],
    )?;

    let categorias: &[(&str, &str)] = &[
        ("Material de Escritório", "Papelaria e materiais administrativos"),
        ("Material de Limpeza", "Produtos de higiene e limpeza"),
        ("Ferramentas", "Ferramentas manuais e elétricas"),
        ("Material Elétrico", "Cabos, disjuntores e componentes"),
        ("EPIs", "Equipamentos de Proteção Individual"),
        ("Outros", "Demais itens"),
        ("Cabo de Força de PC", "Cabos de força, fontes de alimentação e periféricos de PC"),
        ("Cabo de Força de Impressora", "Cabos de força e fontes de alimentação para impressoras"),
    ];
    for c in categorias {
        conn.execute(
            "INSERT OR IGNORE INTO categorias (nome, descricao) VALUES (?1, ?2)",
            params![c.0, c.1],
        )?;
    }

    let fornecedores: &[(&str, &str, &str, &str, &str)] = &[
        ("Distribuidora ABC Ltda", "12.345.678/0001-90", "João Silva", "contato@abc.com", "(11) 3333-4444"),
        ("Papelaria Central", "23.456.789/0001-12", "Maria Souza", "vendas@papelaria.com", "(11) 2222-3333"),
        ("Elétrica Brasil", "34.567.890/0001-34", "Carlos Lima", "contato@eletrica.com", "(11) 4444-5555"),
        ("Limpeza Total", "45.678.901/0001-56", "Ana Costa", "vendas@limpezatotal.com", "(11) 5555-6666"),
    ];
    for f in fornecedores {
        conn.execute(
            "INSERT OR IGNORE INTO fornecedores (nome, cnpj, contato, email, telefone) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![f.0, f.1, f.2, f.3, f.4],
        )?;
    }

    let produtos: &[(&str, &str, i64, i64, &str, f64, f64, i64, i64)] = &[
        ("PRD-001", "Caneta Esferográfica Azul", 1, 1, "un", 0.50, 1.00, 853, 100),
        ("PRD-002", "Papel A4 75g Resma 500fls", 1, 2, "un", 22.00, 35.00, 156, 50),
        ("PRD-003", "Detergente Neutro 500ml", 2, 4, "un", 3.50, 6.00, 87, 100),
        ("PRD-004", "Cabo Flexível 2,5mm 100m", 4, 3, "rl", 180.00, 280.00, 23, 10),
        ("PRD-005", "Capacete de Segurança Branco", 5, 1, "un", 28.00, 45.00, 47, 20),
        ("PRD-006", "Martelo Unha 25mm", 3, 1, "un", 35.00, 55.00, 18, 10),
        ("PRD-007", "Luva de Proteção Nitrilo", 5, 4, "cx", 45.00, 72.00, 12, 30),
        ("PRD-008", "Furadeira de Bancada 1/2 HP", 3, 1, "un", 580.00, 890.00, 4, 5),
        ("PRD-009", "Disjuntor 20A Mono", 4, 3, "un", 14.00, 22.00, 67, 30),
        ("PRD-010", "Álcool em Gel 70% 1L", 2, 4, "un", 12.00, 19.00, 134, 50),
        ("PRD-011", "Grampeador Metálico", 1, 2, "un", 24.00, 38.00, 56, 20),
        ("PRD-012", "Óculos de Proteção Ampla Visão", 5, 1, "un", 8.50, 14.00, 89, 30),
    ];
    for p in produtos {
        conn.execute(
            "INSERT OR IGNORE INTO produtos (codigo, nome, categoria_id, fornecedor_id, unidade, preco_compra, preco_venda, estoque, estoque_minimo) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![p.0, p.1, p.2, p.3, p.4, p.5, p.6, p.7, p.8],
        )?;
    }

    // Seed com senha hasheada (Argon2id)
    let default_senha = argon2_hash("admin123");
    let usuarios: &[(&str, &str, &str, &str, i64)] = &[
        ("Administrador", "admin@empresa.com", &default_senha, "admin", 1),
    ];
    for u in usuarios {
        conn.execute(
            "INSERT OR IGNORE INTO usuarios (nome, email, senha, perfil, loja_id) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![u.0, u.1, u.2, u.3, u.4],
        )?;
    }

    // Sem seed de solicitacoes e pedidos — gerenciados pelo usuário

    let now = chrono::Local::now().to_rfc3339();

    let alertas: &[(&str, &str, &str)] = &[
        ("estoque_baixo", "87 itens com estoque abaixo do mínimo", "Verifique e reabasteça os itens."),
        ("solicitacao", "12 solicitações de pedido pendentes", "Acesse para analisar e aprovar."),
        ("vencimento", "5 itens próximos do vencimento", "Verifique itens com validade próxima."),
    ];
    for a in alertas {
        conn.execute(
            "INSERT OR IGNORE INTO alertas (tipo, titulo, mensagem, data_alerta) VALUES (?1, ?2, ?3, ?4)",
            params![a.0, a.1, a.2, &now],
        )?;
    }

    Ok(())
}
