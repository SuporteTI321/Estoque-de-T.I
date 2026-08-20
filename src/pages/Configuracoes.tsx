import { useEffect, useState, useRef } from "react";
import { Settings, Palette, Download, Upload, Trash2, RotateCcw, Users, User, X, Plus, Package } from "lucide-react";
import Layout from "../components/Layout";
import PageHeader from "../components/PageHeader";
import DataTable, { type Column } from "../components/DataTable";
import Button from "../components/Button";
import Window from "../components/Window";
import type { Categoria, Produto, Movimentacao, Usuario } from "../lib/types";
import { api, store } from "../lib/api";
import { useAuth } from "../lib/useAuth";

type Tab = "categorias" | "usuarios" | "perfil" | "geral";

export default function Configuracoes() {
  const [tab, setTab] = useState<Tab>((localStorage.getItem("almox_active_tab") as Tab) || "categorias");

  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [importando, setImportando] = useState(false);
  const [progImp, setProgImp] = useState({ atual: 0, total: 0 });
  const [logoUrl, setLogoUrl] = useState(() => localStorage.getItem("almox_logo") || "");
  const fileLogoRef = useRef<HTMLInputElement>(null);
  const [dbStats, setDbStats] = useState<{ key: string; label: string; count: number }[]>([
    { key: "almox_categorias", label: "Categorias", count: 0 },
    { key: "almox_produtos", label: "Produtos", count: 0 },
    { key: "almox_usuarios", label: "Usuários", count: 0 },
    { key: "almox_movimentacoes", label: "Movimentações", count: 0 },
    { key: "almox_pedidos", label: "Pedidos", count: 0 },
    { key: "almox_alertas", label: "Alertas", count: 0 },
  ]);
  // Carrega contagens do SQLite + localStorage
  useEffect(() => {
    const carregar = async () => {
      try {
        const [lojas, categorias, produtos, usuarios, movimentacoes, pedidos, alertas] = await Promise.all([
          api.lojas.list().then(r => Array.isArray(r) ? r.length : 0).catch(() => 0),
          Promise.resolve().then(() => { try { const d = JSON.parse(localStorage.getItem("almox_categorias") || "[]"); return Array.isArray(d) ? d.length : 0; } catch { return 0; } }),
          api.produtos.list().then(r => Array.isArray(r) ? r.length : 0).catch(() => 0),
          api.usuarios.list().then(r => Array.isArray(r) ? r.length : 0).catch(() => 0),
          api.movimentacoes.list().then(r => Array.isArray(r) ? r.length : 0).catch(() => 0),
          api.pedidos.list().then(r => Array.isArray(r) ? r.length : 0).catch(() => 0),
          Promise.resolve(localStorage.getItem("almox_alertas")).then((r) => { try { return JSON.parse(r || "[]").length; } catch { return 0; } }),
        ]);
        setDbStats([
          { key: "almox_categorias", label: "Categorias", count: categorias },
          { key: "almox_produtos", label: "Produtos", count: produtos },
          { key: "almox_usuarios", label: "Usuários", count: usuarios },
          { key: "almox_movimentacoes", label: "Movimentações", count: movimentacoes },
          { key: "almox_pedidos", label: "Pedidos", count: pedidos },
          { key: "almox_alertas", label: "Alertas", count: alertas },
        ]);
      } catch {}
    };
    carregar();
  }, []);

  const resetTargetsState = {
    almox_movimentacoes: true,
    almox_alertas: true,
  };
  const [resetTargets, setResetTargets] = useState<Record<string, boolean>>(resetTargetsState);

  const RESET_OPTIONS = [
    { key: "almox_movimentacoes", label: "Movimentações", desc: "Remove entradas, saídas e transferências" },
    { key: "almox_alertas", label: "Alertas", desc: "Remove alertas de estoque" },
  ];

  async function resetAll() {
    const selected = Object.entries(resetTargets).filter(([, v]) => v).map(([k]) => k);
    if (selected.length === 0) { alert("Selecione pelo menos um item para resetar."); return; }
    const nomes = selected.map(k => RESET_OPTIONS.find(o => o.key === k)?.label || k).join(", ");
    if (!confirm(`Resetar ${nomes}? Esta ação não pode ser desfeita.`)) return;
    try {
      selected.forEach(k => localStorage.removeItem(k));
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        if (selected.includes("almox_produtos")) await invoke("delete_all_produtos").catch(() => {});
        if (selected.includes("almox_movimentacoes")) await invoke("delete_all_movimentacoes").catch(() => {});
      } catch {}
      localStorage.setItem("almox_reset_done", "1");
      localStorage.setItem("almox_active_tab", "geral");
      setMsg({ ok: true, text: `${nomes} limpos! Recarregando...` });
      setTimeout(() => window.location.reload(), 1500);
    } catch (e) {
      alert("Erro ao resetar: " + String(e));
    }
  }

  function getStats() {
    const keys = ["almox_categorias","almox_produtos","almox_usuarios","almox_movimentacoes","almox_pedidos","almox_alertas"];
    const labels: Record<string,string> = {almox_categorias:"Categorias",almox_produtos:"Produtos",almox_usuarios:"Usuários",almox_movimentacoes:"Movimentações",almox_pedidos:"Pedidos",almox_alertas:"Alertas"};
    return keys.map(k => ({ key: k, label: labels[k] || k, count: (() => { try { return JSON.parse(localStorage.getItem(k) || "[]").length; } catch { return 0; }})() }));
  }

  function exportData() {
    try {
      const map: Record<string, any> = {};
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith("almox_")) {
          try { map[key] = JSON.parse(localStorage.getItem(key) || ""); } catch { map[key] = localStorage.getItem(key); }
        }
      }
      const json = JSON.stringify(map, null, 2);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = "almoxarifado_" + new Date().toISOString().slice(0, 10) + ".json";
      document.body.appendChild(a); a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setMsg({ ok: true, text: "Dados exportados com sucesso!" });
    } catch (e) {
      setMsg({ ok: false, text: "Erro ao exportar: " + String(e) });
    }
  }

  function importData() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async (e: any) => {
      try {
        const file = e.target?.files?.[0];
        if (!file) return;
        const text = await file.text();
        const map = JSON.parse(text);
        for (const key of Object.keys(map)) {
          localStorage.setItem(key, JSON.stringify(map[key]));
        }
        setMsg({ ok: true, text: "Dados importados! Recarregando..." });
        setTimeout(() => window.location.reload(), 1000);
      } catch (err) {
        setMsg({ ok: false, text: "Erro ao importar: " + String(err) });
      }
    };
    input.click();
  }

  function exportCSV() {
    const chaves: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith("almox_")) chaves.push(key);
    }
    setCsvKeys(chaves);
    setCsvSelected(Object.fromEntries(chaves.map(k => [k, true])));
    setShowCsvModal(true);
  }

  const [showCsvModal, setShowCsvModal] = useState(false);
  const [csvKeys, setCsvKeys] = useState<string[]>([]);
  const [csvSelected, setCsvSelected] = useState<Record<string, boolean>>({});

  function doExportCSV() {
    setShowCsvModal(false);
    const selected = Object.entries(csvSelected).filter(([, v]) => v).map(([k]) => k);
    if (selected.length === 0) { setMsg({ ok: false, text: "Nenhuma tabela selecionada." }); return; }
    try {
      const rows: string[][] = [];
      const headers = ["Tabela", "Chave", "Valor"];
      rows.push(headers);
      for (const key of selected) {
        try {
          const raw = localStorage.getItem(key) || "";
          const data = JSON.parse(raw);
          if (Array.isArray(data)) {
            for (const item of data) {
              rows.push([key, String(item.id || ""), JSON.stringify(item)]);
            }
          } else if (typeof data === "object" && data !== null) {
            for (const k of Object.keys(data)) {
              rows.push([key, k, JSON.stringify(data[k])]);
            }
          }
        } catch { /* skip */ }
      }
      if (rows.length === 1) { setMsg({ ok: false, text: "Nenhum dado encontrado." }); return; }
      const csv = rows.map(r => r.map(c => '"' + String(c).replace(/"/g, '""') + '"').join(",")).join("\n");
      const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = "almoxarifado_" + new Date().toISOString().slice(0, 10) + ".csv";
      document.body.appendChild(a); a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setMsg({ ok: true, text: "CSV exportado com sucesso!" });
    } catch (e) {
      setMsg({ ok: false, text: "Erro ao exportar CSV: " + String(e) });
    }
  }

  function importCSV() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".csv";
    input.onchange = async (e: any) => {
      try {
        const file = e.target?.files?.[0];
        if (!file) return;
        const text = await file.text();
        const lines = text.split("\n").filter((l: string) => l.trim());
        if (lines.length < 2) throw new Error("CSV vazio");
        const map: Record<string, any[]> = {};
        for (let i = 1; i < lines.length; i++) {
          try {
            const parts = parseCSVLine(lines[i]);
            if (parts.length < 3) continue;
            const table = parts[0];
            const val = JSON.parse(parts[2]);
            if (!map[table]) map[table] = [];
            map[table].push(val);
          } catch {}
        }
        for (const key of Object.keys(map)) {
          localStorage.setItem(key, JSON.stringify(map[key]));
        }
        setMsg({ ok: true, text: `Importados dados de ${Object.keys(map).length} tabela(s)! Recarregando...` });
        setTimeout(() => window.location.reload(), 1000);
      } catch (err) {
        setMsg({ ok: false, text: "Erro ao importar CSV: " + String(err) });
      }
    };
    input.click();
  }

  function exportProdutosCSV() {
    try {
      const raw = localStorage.getItem("almox_produtos");
      const produtos: any[] = raw ? JSON.parse(raw) : [];
      const colunas = [
        { header: "produto", key: "nome" },
        { header: "categoria_nome", key: "categoria_nome" },
        { header: "unidade", key: "unidade" },
        { header: "preco_compra", key: "preco_compra" },
        { header: "estoque", key: "estoque" },
        { header: "estoque_minimo", key: "estoque_minimo" },
      ];
      const csv = [colunas.map(c => c.header).join(",")];
      for (const p of produtos) {
        csv.push(colunas.map(c => {
          const v = p[c.key] ?? "";
          return `"${String(v).replace(/"/g, '""')}"`;
        }).join(","));
      }
      const blob = new Blob(["\ufeff" + csv.join("\n")], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = "produtos_" + new Date().toISOString().slice(0, 10) + ".csv";
      document.body.appendChild(a); a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setMsg({ ok: true, text: "Produtos exportados com sucesso!" });
    } catch (e) { setMsg({ ok: false, text: "Erro ao exportar: " + String(e) }); }
  }

  function importProdutosCSV() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".csv";
    input.onchange = async (e: any) => {
      try {
        const file = e.target?.files?.[0];
        if (!file) return;
        setImportando(true);
        setProgImp({ atual: 0, total: 0 });
        const text = await file.text();
        const lines = text.split("\n").filter((l: string) => l.trim());
        if (lines.length < 2) throw new Error("CSV vazio");
        const raw = lines[0];
        const sep = raw.includes(";") ? ";" : ",";
        const headers = raw.split(sep).map((h: string) => h.replace(/^["']|["']$/g, "").replace(/^\uFEFF/, "").trim().toLowerCase());
        const colunas = [
          { key: "nome", aliases: ["produto", "nome", "descricao", "descrição", "prod"] },
          { key: "categoria_nome", aliases: ["categoria_nome", "categoria", "cat"] },
          { key: "unidade", aliases: ["unidade", "un", "und"] },
          { key: "preco_compra", aliases: ["preco_compra", "preco", "preço", "preço compra", "preco compra", "valor", "custo"] },
          { key: "estoque", aliases: ["estoque", "qtd", "quantidade", "saldo"] },
          { key: "estoque_minimo", aliases: ["estoque_minimo", "estoque minimo", "estoque mínimo", "min", "minimo", "mínimo"] },
        ];
        const colMap = colunas.map(c => {
          const hdr = c.aliases.find(a => headers.includes(a));
          return { key: c.key, idx: hdr ? headers.indexOf(hdr) : -1 };
        });
        const faltando = colMap.filter(c => c.idx === -1).map(c => c.key);
        if (faltando.length > 0) throw new Error("Coluna(s) não encontrada(s): " + faltando.join(", ") + ". Cabeçalhos do arquivo: " + headers.join(", "));
        const produtos: any[] = JSON.parse(localStorage.getItem("almox_produtos") || "[]");
        const maxCodExistente = produtos.reduce((max: number, p: any) => {
          const m = (p.codigo || "").match(/PRD-(\d+)/i);
          return m ? Math.max(max, parseInt(m[1])) : max;
        }, 0);
        let seq = 0;
        let importados = 0;
        const novos: any[] = [];
        for (let i = 1; i < lines.length; i++) {
          const parts = lines[i].split(sep).map((p: string) => p.replace(/^["']|["']$/g, "").trim());
          if (parts.length < headers.length) continue;
          const prod: any = {};
          colMap.forEach(c => {
            let v: any = parts[c.idx] || "";
            if (["preco_compra","estoque","estoque_minimo"].includes(c.key)) v = Number(v) || 0;
            if (c.key === "ativo") v = v === "true" || v === "1" || v === true;
            if (c.key === "codigo" && !v) v = null;
            prod[c.key] = v;
          });
          if (!prod.nome) continue;
          // Gera código automático se não veio no CSV
          if (!prod.codigo) {
            prod.codigo = `PRD-${String(maxCodExistente + (++seq)).padStart(3, "0")}`;
          }
          // Merge por código ou nome
          const existente = produtos.find((p: any) => (p.codigo && p.codigo === prod.codigo) || (p.nome?.toLowerCase() === prod.nome?.toLowerCase()));
          if (existente) {
            Object.assign(existente, prod);
          } else {
            prod.id = produtos.length > 0 ? Math.max(...produtos.map((p: any) => p.id)) + 1 + importados : 1 + importados;
            produtos.push(prod);
            novos.push(prod);
          }
          importados++;
        }
        localStorage.setItem("almox_produtos", JSON.stringify(produtos));
        setProgImp({ atual: 0, total: novos.length || 1 });
        // Cria categorias primeiro via API
        const catsNovas: string[] = [];
        for (const p of novos) {
          if (p.categoria_nome && !catsNovas.includes(p.categoria_nome.toLowerCase())) {
            catsNovas.push(p.categoria_nome.toLowerCase());
          }
        }
        for (const nome of catsNovas) {
          try { await api.categorias.create({ nome, descricao: null, ativa: true }); } catch {}
        }
        // Recarrega lista de categorias para obter IDs
        const cats = await api.categorias.list().catch(() => [] as any[]);
        // Cria produtos via API
        let criados = 0;
        for (const p of novos) {
          let catId: number | null = null;
          if (p.categoria_nome) {
            const cat = cats.find((c: any) => c.nome?.toLowerCase() === p.categoria_nome.toLowerCase());
            if (cat) catId = cat.id;
          }
          try {
            await api.produtos.create({
              codigo: p.codigo || "",
              nome: p.nome,
              descricao: null,
              categoria_id: catId,
              categoria_nome: p.categoria_nome || null,
              fornecedor_id: null,
              fornecedor_nome: null,
              unidade: p.unidade || "un",
              preco_compra: Number(p.preco_compra) || 0,
              preco_venda: 0,
              estoque: Number(p.estoque) || 0,
              estoque_minimo: Number(p.estoque_minimo) || 0,
              custo_total: 0,
              ativo: true,
            } as any);
            criados++;
          } catch (err) { console.warn("Falha ao criar produto:", p.nome, err); }
          setProgImp({ atual: criados, total: novos.length });
        }
        setImportando(false);
        setMsg({ ok: true, text: `${criados} de ${novos.length} produto(s) importados! Recarregando...` });
        setTimeout(() => window.location.reload(), 1000);
      } catch (err) { setImportando(false); setMsg({ ok: false, text: "Erro ao importar: " + String(err) }); }
    };
    input.click();
  }

function parseCSVLine(line: string): string[] {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"' && line[i + 1] === '"') { current += '"'; i++; }
        else if (ch === '"') { inQuotes = false; }
        else { current += ch; }
      } else {
        if (ch === '"') { inQuotes = true; }
        else if (ch === ",") { result.push(current); current = ""; }
        else { current += ch; }
      }
    }
    result.push(current);
    return result;
  }

  return (
    <Layout title="Configurações" subtitle="Configuração da aplicação">
      <PageHeader
        title="Configuração da Aplicação"
        subtitle="Gerencie lojas, categorias e preferências do sistema"
        icon={<Settings className="h-5 w-5" />}
      />

      {/* Abas */}
      <div className="mb-6 flex gap-2 border-b border-gray-200">
        {[
          { key: "perfil" as Tab, label: "Perfil", icon: User },
          { key: "usuarios" as Tab, label: "Usuários", icon: Users },
          { key: "categorias" as Tab, label: "Categorias", icon: Settings },
          { key: "geral" as Tab, label: "Geral", icon: Palette },
        ].map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              onClick={() => { setTab(t.key); localStorage.setItem("almox_active_tab", t.key); }}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition ${
                tab === t.key
                  ? "border-blue-600 text-blue-700"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              <Icon className="h-4 w-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === "categorias" && <CategoriasTab />}
      {tab === "usuarios" && <UsuariosTab />}
      {tab === "perfil" && <PerfilTab />}
      {tab === "geral" && (() => {
  const stats = dbStats;
  const total = stats.reduce((s, x) => s + x.count, 0);

  return (
    <div className="space-y-6 max-w-2xl">
      {msg && (
        <div className={`rounded-lg p-3 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
          {msg.text}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">📦 Banco de Dados</h3>
          <div className="space-y-1.5 mb-3">
            {stats.map(s => (
              <div key={s.key} className="flex items-center justify-between rounded bg-gray-50 px-2.5 py-1.5 text-sm">
                <span className="text-gray-600">{s.label}</span>
                <span className="font-semibold text-gray-900">{s.count}</span>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between border-t border-gray-100 pt-2 text-sm">
            <span className="text-gray-600 font-medium">Total</span>
            <span className="font-bold text-blue-700">{total}</span>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-1">💾 Backup dos Dados</h3>
          <p className="text-xs text-gray-500 mb-3">Exporte ou importe todos os dados do sistema</p>
          <div className="mb-3 rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-700 flex items-center gap-2">
            <span className="font-mono font-bold">{ }</span>
            Arquivo <strong>.json</strong> — compatível com qualquer sistema
          </div>
          <div className="space-y-2">
            <div className="flex gap-2">
              <Button variant="secondary" icon={<Download className="h-4 w-4" />} onClick={exportData} className="flex-1 justify-center text-xs">Exportar JSON</Button>
              <Button variant="secondary" icon={<Upload className="h-4 w-4" />} onClick={importData} className="flex-1 justify-center text-xs">Importar JSON</Button>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" icon={<Download className="h-4 w-4" />} onClick={exportCSV} className="flex-1 justify-center text-xs">Exportar CSV</Button>
              <Button variant="secondary" icon={<Upload className="h-4 w-4" />} onClick={importCSV} className="flex-1 justify-center text-xs">Importar CSV</Button>
            </div>
          </div>
        </div>
      </div>
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-gray-900 mb-1">📦 Produtos</h3>
      <p className="text-xs text-gray-500 mb-3">Exporte ou importe a lista de produtos em CSV</p>
      <div className="flex gap-2">
        <Button variant="secondary" icon={<Download className="h-4 w-4" />} onClick={exportProdutosCSV} className="flex-1 justify-center text-xs">Exportar CSV</Button>
        <Button variant="secondary" icon={<Upload className="h-4 w-4" />} onClick={importProdutosCSV} disabled={importando} className="flex-1 justify-center text-xs">{importando ? "Importando..." : "Importar CSV"}</Button>
      </div>
      {importando && (
        <div className="mt-3">
          <div className="flex justify-between text-xs text-gray-500 mb-1"><span>Salvando produtos...</span><span>{progImp.atual}/{progImp.total}</span></div>
          <div className="h-2 w-full rounded-full bg-gray-200 overflow-hidden"><div className="h-full rounded-full bg-blue-600 transition-all duration-300" style={{ width: progImp.total > 0 ? `${Math.round((progImp.atual / progImp.total) * 100)}%` : "0%" }} /></div>
        </div>
      )}
      </div>
      <div className="rounded-xl border border-red-200 bg-white p-5">
        <h3 className="text-sm font-semibold text-red-700 mb-1">Zona de Perigo</h3>
        <p className="text-xs text-gray-500 mb-4">Selecione os dados que deseja limpar e clique em Resetar.</p>
        <div className="space-y-2 mb-4">
          {RESET_OPTIONS.map(opt => (
            <label key={opt.key} className="flex items-start gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 cursor-pointer hover:bg-red-50 hover:border-red-200 transition">
              <input type="checkbox" checked={resetTargets[opt.key]} onChange={(e) => setResetTargets(prev => ({ ...prev, [opt.key]: e.target.checked }))}
                className="mt-0.5 h-4 w-4 rounded border-gray-300 text-red-600 focus:ring-red-500" />
              <div>
                <div className="text-sm font-medium text-gray-900">{opt.label}</div>
                <div className="text-xs text-gray-500">{opt.desc}</div>
              </div>
            </label>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => setResetTargets(Object.fromEntries(RESET_OPTIONS.map(o => [o.key, true])))}>Selecionar Todos</Button>
          <Button variant="secondary" size="sm" onClick={() => setResetTargets(Object.fromEntries(RESET_OPTIONS.map(o => [o.key, false])))}>Limpar Seleção</Button>
          <Button variant="danger" icon={<RotateCcw className="h-4 w-4" />} onClick={resetAll} className="ml-auto">Resetar Selecionados</Button>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Logo do Sistema</h3>
        <div className="flex items-center gap-4">
          <div className="h-16 w-16 rounded-xl border border-gray-200 overflow-hidden bg-gray-50 flex items-center justify-center">
            {logoUrl ? (
              <img src={logoUrl} alt="Logo" className="h-full w-full object-cover" />
            ) : (
              <Package className="h-8 w-8 text-gray-300" />
            )}
          </div>
          <div className="flex-1">
            <input ref={fileLogoRef} type="file" accept="image/*" className="hidden" onChange={(e) => {
              const f = e.target?.files?.[0];
              if (f) {
                const reader = new FileReader();
                reader.onload = () => {
                  const dataUrl = reader.result as string;
                  localStorage.setItem("almox_logo", dataUrl);
                  setLogoUrl(dataUrl);
                  setMsg({ ok: true, text: "Logo atualizada!" });
                  setTimeout(() => setMsg(null), 2000);
                };
                reader.readAsDataURL(f);
              }
            }} />
            <Button variant="secondary" size="sm" onClick={() => fileLogoRef.current?.click()}><Upload className="h-3.5 w-3.5 mr-1" /> Carregar Logo</Button>
            {logoUrl && <Button variant="ghost" size="sm" className="ml-2 text-red-500" onClick={() => { localStorage.removeItem("almox_logo"); setLogoUrl(""); setMsg({ ok: true, text: "Logo removida." }); setTimeout(() => setMsg(null), 2000); }}><X className="h-3.5 w-3.5 mr-1" /> Remover</Button>}
            <p className="text-xs text-gray-400 mt-1">PNG ou JPG, até 200KB. Recomendado: quadrado.</p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-1">Sobre</h3>
        <div className="text-xs text-gray-500 space-y-1">
          <p><strong>Estoque de T.I</strong> v0.1.0</p>
          <p>Sistema de controle de estoque e pedidos.</p>
          <p>Dados armazenados localmente no navegador.</p>
          <p className="mt-3 pt-3 border-t border-gray-100">
            <strong>Criado por:</strong> Henrique<br />
            <strong>IA Assistente:</strong> J.A.R.V.I.S.
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-1">Termos de Uso</h3>
        <div className="text-xs text-gray-500 space-y-1">
          <p><strong>Licença de Uso Restrito</strong></p>
          <p>O <strong>Estoque de T.I</strong> é um software proprietário desenvolvido exclusivamente para uso interno da organização licenciada.</p>
          <p><strong>1. Titularidade:</strong> Todos os direitos de propriedade intelectual pertencem ao criador. O J.A.R.V.I.S. atua como assistente técnico de desenvolvimento, não como titular de direitos.</p>
          <p><strong>2. Uso Permitido:</strong> O software destina-se exclusivamente ao controle de estoque, pedidos e almoxarifado da organização licenciada. É proibida a redistribuição, revenda ou sublicenciamento sem autorização expressa.</p>
          <p><strong>3. Limitação de Responsabilidade:</strong> O software é fornecido "como está". O criador e o assistente J.A.R.V.I.S. não se responsabilizam por perdas de dados, decisões operacionais baseadas nos relatórios ou danos indiretos decorrentes do uso.</p>
          <p><strong>4. Confidencialidade:</strong> Os dados armazenados são de propriedade exclusiva da organização. Nenhuma informação é transmitida a terceiros sem consentimento.</p>
          <p><strong>5. Vigência:</strong> Esta licença é válida por tempo indeterminado enquanto o software estiver em uso pela organização licenciada.</p>
          <p className="mt-3 italic text-gray-400">Última atualização: Agosto de 2026.</p>
        </div>
      </div>

      {/* Modal seleção CSV */}
      {showCsvModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowCsvModal(false)}>
          <div className="w-full max-w-md rounded-xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
              <h2 className="text-base font-semibold text-gray-900">Exportar CSV</h2>
              <button onClick={() => setShowCsvModal(false)} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100"><X className="h-4 w-4" /></button>
            </div>
            <div className="px-5 py-4 space-y-2 max-h-64 overflow-y-auto">
              <p className="text-xs text-gray-500 mb-2">Selecione as tabelas para exportar:</p>
              {csvKeys.map(key => (
                <label key={key} className="flex items-center gap-3 rounded-lg border border-gray-200 px-3 py-2 cursor-pointer hover:bg-gray-50 text-sm">
                  <input type="checkbox" checked={csvSelected[key] ?? false}
                    onChange={(e) => setCsvSelected(p => ({ ...p, [key]: e.target.checked }))}
                    className="rounded border-gray-300 accent-blue-600 w-4 h-4" />
                  <span className="font-medium text-gray-800">{key.replace("almox_", "")}</span>
                </label>
              ))}
            </div>
            <div className="flex justify-end gap-2 border-t border-gray-200 px-5 py-3">
              <button onClick={() => setShowCsvModal(false)} className="rounded-lg border border-gray-300 px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50">Cancelar</button>
              <button onClick={doExportCSV} className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700">Exportar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
})()}
    </Layout>
  );
}

/* ==================== CATEGORIAS ==================== */
function CategoriasTab() {
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<{ nome: string; descricao: string }>({ nome: "", descricao: "" });

  const EXCLUIDAS_KEY = "almox_categorias_excluidas";
  function getExcluidas(): string[] {
    try { return JSON.parse(localStorage.getItem(EXCLUIDAS_KEY) || "[]"); } catch { return []; }
  }
  function marcarExcluida(nome: string) {
    const lista = getExcluidas();
    if (!lista.includes(nome.toLowerCase().trim())) lista.push(nome.toLowerCase().trim());
    localStorage.setItem(EXCLUIDAS_KEY, JSON.stringify(lista));
  }

  useEffect(() => { loadCats(); }, []);

  async function handleSave() {
    if (!form.nome.trim()) return;
    const nome = form.nome.trim().toUpperCase();
    // Verificar duplicata
    if (categorias.some(c => c.nome.toLowerCase() === nome.toLowerCase())) {
      alert(`Categoria "${nome}" já existe.`);
      return;
    }
    const autoDesc: Record<string, string> = {
      "Material de Escritório": "Papelaria e materiais administrativos",
      "Material de Limpeza": "Produtos de higiene e limpeza",
      "Ferramentas": "Ferramentas manuais e elétricas",
      "Material Elétrico": "Cabos, disjuntores e componentes elétricos",
      "EPI": "Equipamentos de proteção individual",
      "Informática": "Suprimentos e acessórios de informática",
      "Móveis": "Móveis e utensílios para escritório",
      "Alimentos": "Alimentos e bebidas em geral",
      "Vestuário": "Uniformes e vestuário profissional",
      "Higiene": "Produtos de higiene pessoal",
      "Áudio e Vídeo": "Equipamentos, cabos, microfones e materiais de áudio e vídeo",
      "Eletrônicos": "Componentes, dispositivos e equipamentos eletrônicos",
      "Cabo de Força de PC": "Cabos de força, fontes de alimentação e periféricos de PC",
      "Cabo de Força de Impressora": "Cabos de força e fontes de alimentação para impressoras",
      "Fonte Colmeia": "Fontes de alimentação tipo colmeia para computadores",
      "Produto Fonte Colmeia": "Produtos relacionados a fontes de alimentação colmeia",
    };
    const descricao = form.descricao.trim() || autoDesc[nome] || nome;
    // Reativar categoria que tinha sido excluída (remove da lista de excluídas)
    const lista = getExcluidas().filter(n => n !== nome.toLowerCase().trim());
    localStorage.setItem(EXCLUIDAS_KEY, JSON.stringify(lista));
    await api.categorias.create({ nome, descricao, ativa: true });
    setOpen(false);
    setForm({ nome: "", descricao: "" });
    loadCats();
  }

  async function handleDelete(id: number) {
    if (!confirm("Excluir categoria?")) return;
    // Marca como excluída voluntariamente para o sync padrão não recriar
    const alvo = categorias.find(c => c.id === id);
    if (alvo) marcarExcluida(alvo.nome);
    // Remove do localStorage primeiro
    const cats = JSON.parse(localStorage.getItem("almox_categorias") || "[]");
    const novaLista = cats.filter((c: any) => c.id !== id);
    localStorage.setItem("almox_categorias", JSON.stringify(novaLista));
    // Tenta remover do SQLite via Tauri
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("delete_categoria", { id }).catch(() => {});
    } catch {}
    loadCats();
  }

  function loadCats() {
  api.categorias.list().then(async (sqliteCats) => {
  const excluidas = getExcluidas();
  const existentes = sqliteCats && sqliteCats.length > 0 ? sqliteCats : [];
  // 26 categorias padrão
  const padrao: Categoria[] = [
    { id: 1, nome: "Material de Escritório", descricao: "Papelaria e materiais administrativos", ativa: true },
    { id: 2, nome: "Material de Limpeza", descricao: "Produtos de higiene e limpeza", ativa: true },
    { id: 3, nome: "Ferramentas", descricao: "Ferramentas manuais e elétricas", ativa: true },
    { id: 4, nome: "Material Elétrico", descricao: "Cabos, disjuntores e componentes elétricos", ativa: true },
    { id: 5, nome: "EPI", descricao: "Equipamentos de proteção individual", ativa: true },
    { id: 6, nome: "Informática", descricao: "Suprimentos e acessórios de informática", ativa: true },
    { id: 7, nome: "Serviços", descricao: "Prestação de serviços terceirizados", ativa: true },
    { id: 8, nome: "Decoração", descricao: "Itens de decoração e ambientação", ativa: true },
    { id: 9, nome: "Utilidades", descricao: "Utensílios e itens diversos", ativa: true },
    { id: 10, nome: "Construção", descricao: "Materiais de construção e reparos", ativa: true },
    { id: 11, nome: "Descartáveis", descricao: "Produtos descartáveis em geral", ativa: true },
    { id: 12, nome: "Diversos", descricao: "Itens não classificados", ativa: true },
    { id: 13, nome: "Automotivo", descricao: "Peças e acessórios automotivos", ativa: true },
    { id: 14, nome: "Móveis", descricao: "Móveis e utensílios para escritório", ativa: true },
    { id: 15, nome: "Vestuário", descricao: "Uniformes e vestuário profissional", ativa: true },
    { id: 16, nome: "Alimentos", descricao: "Alimentos e bebidas em geral", ativa: true },
    { id: 17, nome: "Hidráulico", descricao: "Conexões, tubos, registros e materiais hidráulicos", ativa: true },
    { id: 18, nome: "Embalagem", descricao: "Sacos, fitas, caixas e materiais para embalagem", ativa: true },
    { id: 19, nome: "Copa / Cozinha", descricao: "Utensílios e descartáveis para copa e cozinha", ativa: true },
    { id: 20, nome: "Sinalização", descricao: "Placas, fitas, cones e materiais de sinalização", ativa: true },
    { id: 21, nome: "Manutenção Predial", descricao: "Tintas, massas, cimentos e materiais para manutenção", ativa: true },
    { id: 22, nome: "Proteção e Segurança", descricao: "Extintores, câmeras, alarmes e materiais de segurança patrimonial", ativa: true },
    { id: 23, nome: "Esporte e Lazer", descricao: "Bolas, redes, jogos e materiais esportivos", ativa: true },
    { id: 24, nome: "Didático / Cultural", descricao: "Livros, revistas e material pedagógico", ativa: true },
    { id: 25, nome: "Jardinagem", descricao: "Sementes, adubos, ferramentas e materiais para jardim", ativa: true },
    { id: 26, nome: "Primeiros Socorros", descricao: "Curativos, medicamentos básicos e materiais hospitalares", ativa: true },
    { id: 27, nome: "Fonte Colmeia", descricao: "Fontes de alimentação tipo colmeia para computadores", ativa: true },
    { id: 28, nome: "Produto Fonte Colmeia", descricao: "Produtos relacionados a fontes de alimentação colmeia", ativa: true },
    { id: 29, nome: "Áudio e Vídeo", descricao: "Equipamentos, cabos, microfones e materiais de áudio e vídeo", ativa: true },
    { id: 30, nome: "Eletrônicos", descricao: "Componentes, dispositivos e equipamentos eletrônicos", ativa: true },
    { id: 31, nome: "Cabo de Força de PC", descricao: "Cabos de força, fontes de alimentação e periféricos de PC", ativa: true },
    { id: 32, nome: "Cabo de Força de Impressora", descricao: "Cabos de força e fontes de alimentação para impressoras", ativa: true },
  ];
  // Sincroniza padrão → SQLite (cria as que faltam)
  const sqlNomes = new Set(existentes.map((c: any) => c.nome.toLowerCase().trim()));
  const { invoke } = await import("@tauri-apps/api/core");
  for (const p of padrao) {
    if (!sqlNomes.has(p.nome.toLowerCase().trim()) && !excluidas.includes(p.nome.toLowerCase().trim())) {
      try {
        const created = await invoke<any>("create_categoria", { nome: p.nome, descricao: p.descricao });
        if (created?.id) existentes.push(created);
      } catch (e) {
        console.error(`[sync] Erro ao criar ${p.nome}:`, e);
      }
    }
  }
  // Merge final: padrao + SQLite (por nome, SQLite sobrescreve), ignorando excluídas
  const porNome = new Map<string, Categoria>();
  for (const c of [...padrao, ...existentes]) {
    if (!excluidas.includes(c.nome.toLowerCase().trim())) {
      porNome.set(c.nome.toLowerCase(), c);
    }
  }
  const finalList = Array.from(porNome.values());
  setCategorias(finalList);
  localStorage.setItem("almox_categorias", JSON.stringify(finalList));
  });
  }

  const columns: Column<Categoria>[] = [
    { key: "nome", label: "CATEGORIA", render: (row) => String(row.nome).toUpperCase() },
    { key: "descricao", label: "DESCRIÇÃO", render: (row) => {
      if (row.descricao) return String(row.descricao);
      const auto: Record<string, string> = {
        "Material de Escritório": "Papelaria e materiais administrativos",
        "Material de Limpeza": "Produtos de higiene e limpeza",
        "Ferramentas": "Ferramentas manuais e elétricas",
        "Material Elétrico": "Cabos, disjuntores e componentes elétricos",
        "EPI": "Equipamentos de proteção individual",
        "Informática": "Suprimentos e acessórios de informática",
        "Móveis": "Móveis e utensílios para escritório",
        "Alimentos": "Alimentos e bebidas em geral",
        "Vestuário": "Uniformes e vestuário profissional",
        "Higiene": "Produtos de higiene pessoal",
        "Áudio e Vídeo": "Equipamentos, cabos, microfones e materiais de áudio e vídeo",
        "Eletrônicos": "Componentes, dispositivos e equipamentos eletrônicos",
        "Cabo de Força de PC": "Cabos de força, fontes de alimentação e periféricos de PC",
        "Cabo de Força de Impressora": "Cabos de força e fontes de alimentação para impressoras",
      };
      return String(auto[row.nome] || `${row.nome}`).toUpperCase();
    } },
    { key: "acoes", label: "Ações", render: (row) => (
      <button onClick={() => handleDelete(row.id)}
        className="p-1 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded transition">
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    ) },
  ];

  return (
    <div className="space-y-3">
      <div className="flex justify-end"><Button icon={<Plus className="h-4 w-4" />} onClick={() => setOpen(true)}>Nova Categoria</Button></div>
      <DataTable columns={columns} data={categorias} />
      {open && (
        <Window title="Nova Categoria" onClose={() => setOpen(false)} open={open}>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-600">NOME</label>
              <input value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value.toUpperCase() }))}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-uppercase text-sm" placeholder="EX: MATERIAL DE ESCRITÓRIO" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600">DESCRIÇÃO</label>
              <textarea value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" rows={2} placeholder="Descrição automática se vazia" />
            </div>
            <Button className="w-full" onClick={handleSave}>Salvar</Button>
          </div>
        </Window>
      )}
    </div>
  );
}

/* ==================== USUÁRIOS ==================== */
function UsuariosTab() {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);

  useEffect(() => { api.usuarios.list().then(setUsuarios); }, []);

  const columns: Column<Usuario>[] = [
    { key: "nome", label: "Nome" },
    { key: "email", label: "Email" },
    { key: "perfil", label: "Perfil" },
  ];

  return <DataTable columns={columns} data={usuarios} />;
}

/* ==================== PERFIL ==================== */
function PerfilTab() {
  const { user } = useAuth();
  if (!user) return <p className="text-sm text-gray-500">Usuário não encontrado</p>;
  return (
    <div className="pt-4">
      <div className="w-full max-w-md overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg">
        <div className="bg-blue-600 px-5 py-4 text-white">
          <h2 className="text-base font-semibold">Meu Perfil</h2>
        </div>
        <div className="p-5 space-y-4">
          <div className="flex items-center gap-4 pb-4 border-b border-gray-100">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-100 text-lg font-bold text-blue-600">
              {user.nome.charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="text-base font-semibold text-gray-900">{user.nome}</div>
              <div className="text-sm text-gray-500">{user.email || "—"}</div>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3 text-sm">
            <div className="rounded-lg bg-gray-50 p-3">
              <div className="text-xs text-gray-500">Status</div>
              <div className="mt-0.5 font-semibold text-green-600">{user.ativo ? "Ativo" : "Inativo"}</div>
            </div>
            <div className="rounded-lg bg-gray-50 p-3">
              <div className="text-xs text-gray-500">Usuario</div>
              <div className="mt-0.5 font-semibold text-gray-900">Admin</div>
            </div>
            <div className="rounded-lg bg-gray-50 p-3">
              <div className="text-xs text-gray-500">Permissão</div>
              <div className="mt-0.5 font-semibold text-gray-900">{({ admin: "Administrador", filial: "Filial", operador: "Operador" } as Record<string, string>)[user.perfil] || user.perfil}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
