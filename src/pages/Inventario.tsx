import { useEffect, useState } from "react";
import { BarChart3, Download, AlertTriangle } from "lucide-react";
import Layout from "../components/Layout";
import PageHeader from "../components/PageHeader";
import Button from "../components/Button";
import type { Produto } from "../lib/types";
import { api } from "../lib/api";
import { csvSafe } from "./shared";

function exportCSV(produtos: Produto[]) {
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
  a.download = `Inventario_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function Inventario() {
  const [produtos, setProdutos] = useState<Produto[]>([]);

  useEffect(() => { api.produtos.list().then(setProdutos).catch(() => setProdutos([])); }, []);

  const total = produtos.length;
  const baixo = produtos.filter((p) => p.estoque > 0 && p.estoque <= p.estoque_minimo).length;
  const zerado = produtos.filter((p) => p.estoque === 0).length;
  return (
    <Layout title="Inventário" subtitle="Visão geral consolidada do estoque">
      <PageHeader
        title="Inventário"
        subtitle="Relatório consolidado de inventário"
        icon={<BarChart3 className="h-5 w-5" />}
        action={<Button variant="secondary" icon={<Download className="h-4 w-4" />} onClick={() => exportCSV(produtos)}>Exportar</Button>}
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <KPI label="Total de Produtos" value={total} iconBg="bg-blue-50 text-blue-600" />
        <KPI label="Estoque Baixo" value={baixo} iconBg="bg-orange-50 text-orange-600" />
        <KPI label="Sem Estoque" value={zerado} iconBg="bg-red-50 text-red-600" />
      </div>

      <div className="rounded-xl border border-gray-200 bg-white">
        <div className="border-b border-gray-200 px-5 py-3">
          <h3 className="text-sm font-semibold text-gray-900">Produtos que precisam de atenção</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 text-left text-xs font-semibold uppercase text-gray-600">
              <tr>
                <th className="px-5 py-3">Código</th>
                <th className="px-5 py-3">Produto</th>
                <th className="px-5 py-3 text-right">Estoque</th>
                <th className="px-5 py-3 text-right">Mínimo</th>
                <th className="px-5 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {produtos
                .filter((p) => p.estoque <= p.estoque_minimo)
                .map((p) => (
                  <tr key={p.id} className="border-t border-gray-100">
                    <td className="px-5 py-3 text-sm text-gray-700">{p.codigo}</td>
                    <td className="px-5 py-3 text-sm font-medium text-gray-900">{p.nome}</td>
                    <td className="px-5 py-3 text-right text-sm font-semibold text-orange-600">{p.estoque}</td>
                    <td className="px-5 py-3 text-right text-sm text-gray-500">{p.estoque_minimo}</td>
                    <td className="px-5 py-3">
                      {p.estoque === 0 ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
                          <AlertTriangle className="h-3 w-3" />Sem estoque
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-orange-50 px-2 py-0.5 text-xs font-medium text-orange-700">
                          <AlertTriangle className="h-3 w-3" />Estoque baixo
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  );
}

function KPI({ label, value, iconBg }: { label: string; value: any; iconBg: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className={`inline-flex h-8 w-8 items-center justify-center rounded-md ${iconBg}`}>
        <BarChart3 className="h-4 w-4" />
      </div>
      <div className="mt-2 text-xs font-medium uppercase text-gray-500">{label}</div>
      <div className="mt-0.5 text-xl font-bold text-gray-900">{value}</div>
    </div>
  );
}
