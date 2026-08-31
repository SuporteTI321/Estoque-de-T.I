import { useEffect, useState } from "react";
import { BarChart3, Download, FileText } from "lucide-react";
import Layout from "../components/Layout";
import PageHeader from "../components/PageHeader";
import Button from "../components/Button";
import type { Movimentacao, Produto } from "../lib/types";
import { api } from "../lib/api";
import { csvSafe } from "./shared";

function exportCSV(produtos: Produto[], title: string) {
  const headers = "Código,Produto,Categoria,Unidade,Estoque,Estoque Mínimo,Preço Compra";
  const rows = produtos.map(p =>
    `"${csvSafe(p.codigo)}","${csvSafe(p.nome)}","${csvSafe(p.categoria_nome || "")}","${csvSafe(p.unidade || "")}",${p.estoque},${p.estoque_minimo},"${csvSafe((p.preco_compra || 0).toFixed(2))}"`
  );
  const bom = "\uFEFF";
  const csv = bom + headers + "\n" + rows.join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${title}_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

import { printHtml } from "../lib/printHtml";

const TIPO_LABEL: Record<string, string> = { entrada: "Entrada", saida: "Saída", transferencia: "Transferência" };

/** Formata "YYYY-MM-DD[...]" como DD/MM/AAAA (fuso local, sem deslocamento de UTC). */
function fmtData(d: string) {
  const p = (d || "").slice(0, 10).split("-");
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : d;
}

function downloadCsv(csv: string, title: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${title}_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function exportMovsCSV(movs: Movimentacao[], title: string) {
  const headers = "Data,Tipo,Código,Produto,Quantidade,Loja Origem,Loja Destino";
  const rows = movs.map(m =>
    `"${fmtData(m.data_movimento)}","${TIPO_LABEL[m.tipo] || m.tipo}","${csvSafe(m.produto_codigo || "")}","${csvSafe(m.produto_nome || "")}",${m.quantidade},"${csvSafe(m.loja_origem_nome || "")}","${csvSafe(m.loja_destino_nome || "")}"`
  );
  downloadCsv("\uFEFF" + headers + "\n" + rows.join("\n"), title);
}

function exportMovsPDF(movs: Movimentacao[], title: string) {
  const agora = new Date().toLocaleString("pt-BR");
  let html = `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
    <style>
      body{font-family:Arial,sans-serif;font-size:12px;margin:20px;}
      h1{font-size:18px;margin-bottom:4px;}
      .sub{color:#666;font-size:11px;margin-bottom:16px;}
      table{width:100%;border-collapse:collapse;}
      th{background:#f3f4f6;text-align:left;padding:6px 8px;font-size:11px;text-transform:uppercase;border:1px solid #e5e7eb;}
      td{padding:5px 8px;border:1px solid #e5e7eb;font-size:11px;}
      .r{text-align:right;}
      @media print{body{margin:0;}}
    </style></head><body>
    <h1>${title}</h1>
    <div class="sub">Gerado em ${agora} — ${movs.length} movimentação(ões)</div>
    <table>
      <tr><th>Data</th><th>Tipo</th><th>Código</th><th>Produto</th><th class="r">Qtd</th><th>Loja Origem</th><th>Loja Destino</th></tr>`;
  for (const m of movs) {
    html += `<tr>
      <td>${fmtData(m.data_movimento)}</td><td>${TIPO_LABEL[m.tipo] || m.tipo}</td>
      <td>${m.produto_codigo || ""}</td><td>${m.produto_nome || ""}</td>
      <td class="r">${m.quantidade}</td>
      <td>${m.loja_origem_nome || "—"}</td><td>${m.loja_destino_nome || "—"}</td>
    </tr>`;
  }
  html += `</table></body></html>`;

  printHtml(html, title);
}

function exportPDF(produtos: Produto[], title: string) {
  const agora = new Date().toLocaleString("pt-BR");
  let html = `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
    <style>
      body{font-family:Arial,sans-serif;font-size:12px;margin:20px;}
      h1{font-size:18px;margin-bottom:4px;}
      .sub{color:#666;font-size:11px;margin-bottom:16px;}
      table{width:100%;border-collapse:collapse;}
      th{background:#f3f4f6;text-align:left;padding:6px 8px;font-size:11px;text-transform:uppercase;border:1px solid #e5e7eb;}
      td{padding:5px 8px;border:1px solid #e5e7eb;font-size:11px;}
      .r{text-align:right;}
      @media print{body{margin:0;}}
    </style></head><body>
    <h1>${title}</h1>
    <div class="sub">Gerado em ${agora} — ${produtos.length} produto(s)</div>
    <table>
      <tr><th>Código</th><th>Produto</th><th>Categoria</th><th>Unidade</th><th class="r">Estoque</th><th class="r">Mínimo</th><th class="r">Preço</th></tr>`;
  for (const p of produtos) {
    html += `<tr>
      <td>${p.codigo}</td><td>${p.nome}</td><td>${p.categoria_nome || ""}</td>
      <td>${p.unidade || ""}</td>
      <td class="r">${p.estoque}</td><td class="r">${p.estoque_minimo}</td>
      <td class="r">R$ ${(p.preco_compra || 0).toFixed(2).replace(".", ",")}</td>
    </tr>`;
  }
  html += `</table></body></html>`;

  printHtml(html, title);
}

export default function Relatorios() {
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [movimentacoes, setMovimentacoes] = useState<Movimentacao[]>([]);
  useEffect(() => { api.produtos.list().then(setProdutos).catch(() => setProdutos([])); }, []);
  useEffect(() => { api.movimentacoes.list().then(setMovimentacoes).catch(() => setMovimentacoes([])); }, []);

  const relatorios = [
    {
      title: "Estoque Atual",
      desc: "Posição consolidada do estoque por produto, categoria e loja.",
      onPDF: () => exportPDF(produtos, "Estoque Atual"),
      onExcel: () => exportCSV(produtos, "Estoque_Atual"),
    },
    {
      title: "Movimentações",
      desc: "Entradas, saídas e transferências por período.",
      onPDF: () => exportMovsPDF(movimentacoes, "Movimentações"),
      onExcel: () => exportMovsCSV(movimentacoes, "Movimentacoes"),
    },
    {
      title: "Estoque Crítico",
      desc: "Produtos abaixo do mínimo ou sem estoque.",
      onPDF: () => exportPDF(produtos.filter(p => p.estoque <= p.estoque_minimo), "Estoque Crítico"),
      onExcel: () => exportCSV(produtos.filter(p => p.estoque <= p.estoque_minimo), "Estoque_Critico"),
    },
  ];

  return (
    <Layout title="Relatórios" subtitle="Gere relatórios detalhados do sistema">
      <PageHeader
        title="Relatórios"
        subtitle="Exporte dados e analises do estoque"
        icon={<BarChart3 className="h-5 w-5" />}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {relatorios.map((r) => (
          <div key={r.title} className="rounded-xl border border-gray-200 bg-white p-5">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <BarChart3 className="h-5 w-5" />
            </div>
            <h3 className="mt-3 text-sm font-semibold text-gray-900">{r.title}</h3>
            <p className="mt-1 text-xs text-gray-500">{r.desc}</p>
            <div className="mt-3 flex gap-2">
              <Button size="sm" variant="primary" icon={<FileText className="h-3 w-3" />} onClick={r.onPDF}>PDF</Button>
              <Button size="sm" variant="secondary" icon={<Download className="h-3 w-3" />} onClick={r.onExcel}>Excel</Button>
            </div>
          </div>
        ))}
      </div>
    </Layout>
  );
}
