import { useEffect, useMemo, useState } from "react";
import { Printer, Search, Tag } from "lucide-react";
import Layout from "../components/Layout";
import PageHeader from "../components/PageHeader";
import Button from "../components/Button";
import Barcode from "../components/Barcode";
import { Vazio } from "./shared";
import type { Produto } from "../lib/types";
import { api } from "../lib/api";
import { printHtml, montarHtmlEtiquetas, type TamanhoEtiqueta } from "../lib/printHtml";

const TAMANHOS: { valor: TamanhoEtiqueta; label: string; dims: string }[] = [
  { valor: "pequena", label: "Pequena", dims: "70×35mm" },
  { valor: "media", label: "Média", dims: "100×50mm" },
  { valor: "grande", label: "Grande", dims: "150×70mm" },
];

export default function Etiquetas() {
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [selecionados, setSelecionados] = useState<Set<number>>(new Set());
  const [quantidades, setQuantidades] = useState<Record<number, number>>({});
  const [empresa, setEmpresa] = useState("Controle de Estoque T.I");
  const [tamanho, setTamanho] = useState<TamanhoEtiqueta>("pequena");
  const [busca, setBusca] = useState("");
  const [imprimindo, setImprimindo] = useState(false);

  useEffect(() => {
    api.produtos.list().then(setProdutos).catch(() => setProdutos([]));
  }, []);

  const filtrados = useMemo(() => {
    const b = busca.trim().toLowerCase();
    if (!b) return produtos;
    return produtos.filter(p =>
      p.nome.toLowerCase().includes(b) ||
      p.codigo.toLowerCase().includes(b) ||
      (p.marca || "").toLowerCase().includes(b)
    );
  }, [produtos, busca]);

  const selecionadosLista = useMemo(
    () => produtos.filter(p => selecionados.has(p.id)),
    [produtos, selecionados]
  );

  const toggle = (id: number) => {
    const novo = new Set(selecionados);
    if (novo.has(id)) novo.delete(id);
    else novo.add(id);
    setSelecionados(novo);
  };

  const toggleTodosFiltrados = () => {
    const ids = filtrados.map(p => p.id);
    const todosMarcados = ids.every(id => selecionados.has(id));
    const novo = new Set(selecionados);
    if (todosMarcados) ids.forEach(id => novo.delete(id));
    else ids.forEach(id => novo.add(id));
    setSelecionados(novo);
  };

  const setQtd = (id: number, v: string) => {
    const q = Math.max(1, Number(v) || 1);
    setQuantidades(prev => ({ ...prev, [id]: q }));
  };

  const totalEtiquetas = selecionadosLista.reduce(
    (s, p) => s + (quantidades[p.id] ?? 1), 0
  );

  /** Imprime um produto individual via api.etiquetas.print (invoke print_product_label). */
  const imprimirUm = async (p: Produto) => {
    setImprimindo(true);
    try {
      await api.etiquetas.print(p.id, quantidades[p.id] ?? 1, empresa, tamanho);
    } catch (e) {
      console.error("[etiquetas] erro ao imprimir:", e);
      alert(`Falha ao imprimir etiqueta de "${p.nome}".`);
    } finally {
      setImprimindo(false);
    }
  };

  /** Imprime todos os selecionados de uma vez (HTML único via printHtml). */
  const imprimirTodos = async () => {
    if (selecionadosLista.length === 0) return;
    setImprimindo(true);
    try {
      const html = montarHtmlEtiquetas({
        produtos: selecionadosLista,
        quantidades,
        empresa,
        tamanho,
      });
      await printHtml(html, "Etiquetas");
    } catch (e) {
      console.error("[etiquetas] erro ao imprimir todos:", e);
      alert("Falha ao imprimir etiquetas.");
    } finally {
      setImprimindo(false);
    }
  };

  return (
    <Layout title="Etiquetas" subtitle="Impressão de etiquetas de produtos">
      <PageHeader
        title="Etiquetas de Produtos"
        subtitle="Selecione produtos e imprima etiquetas com código de barras"
        icon={<Tag className="h-5 w-5" />}
        action={
          <Button
            variant="primary"
            icon={<Printer className="h-4 w-4" />}
            disabled={selecionadosLista.length === 0 || imprimindo}
            onClick={imprimirTodos}
          >
            {imprimindo ? "Imprimindo..." : `Imprimir Todos (${totalEtiquetas})`}
          </Button>
        }
      />

      {/* Opções globais */}
      <div className="mb-4 grid gap-4 rounded-xl border border-gray-200 bg-white p-4 sm:grid-cols-3">
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-600">Empresa</label>
          <input
            value={empresa}
            onChange={e => setEmpresa(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-600">Tamanho da etiqueta</label>
          <div className="flex gap-2">
            {TAMANHOS.map(t => (
              <button
                key={t.valor}
                onClick={() => setTamanho(t.valor)}
                className={`flex-1 rounded-lg border px-2 py-2 text-xs font-medium transition ${
                  tamanho === t.valor
                    ? "border-blue-600 bg-blue-50 text-blue-700"
                    : "border-gray-300 text-gray-600 hover:bg-gray-50"
                }`}
              >
                <span className="block font-semibold">{t.label}</span>
                <span className="block text-[10px] text-gray-400">{t.dims}</span>
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-600">Buscar produto</label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
            <input
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder="Nome, código ou marca..."
              className="w-full rounded-lg border border-gray-300 py-2 pl-8 pr-3 text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Seleção de produtos */}
        <div className="rounded-xl border border-gray-200 bg-white">
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
            <h3 className="text-sm font-semibold text-gray-800">Produtos ({selecionados.size} selecionados)</h3>
            <button
              onClick={toggleTodosFiltrados}
              className="text-xs font-medium text-blue-600 hover:underline"
            >
              {filtrados.length > 0 && filtrados.every(p => selecionados.has(p.id))
                ? "Desmarcar todos"
                : "Marcar todos os filtrados"}
            </button>
          </div>
          <div className="max-h-[420px] overflow-y-auto p-2">
            {filtrados.length === 0 ? (
              <Vazio texto="Nenhum produto encontrado" />
            ) : (
              filtrados.map(p => (
                <label
                  key={p.id}
                  className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 hover:bg-gray-50"
                >
                  <input
                    type="checkbox"
                    checked={selecionados.has(p.id)}
                    onChange={() => toggle(p.id)}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-gray-800">{p.nome}</div>
                    <div className="text-[11px] text-gray-500">
                      {p.codigo} {p.marca ? `· ${p.marca}` : ""} {p.modelo ? `· ${p.modelo}` : ""}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min={1}
                      value={quantidades[p.id] ?? 1}
                      onChange={e => setQtd(p.id, e.target.value)}
                      onClick={e => e.stopPropagation()}
                      className="w-16 rounded-lg border border-gray-300 px-2 py-1 text-right text-sm focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                </label>
              ))
            )}
          </div>
        </div>

        {/* Preview */}
        <div className="rounded-xl border border-gray-200 bg-white">
          <div className="border-b border-gray-100 px-4 py-3">
            <h3 className="text-sm font-semibold text-gray-800">Preview</h3>
            <p className="text-[11px] text-gray-500">
              {selecionadosLista.length === 0
                ? "Selecione produtos para visualizar as etiquetas."
                : `${selecionadosLista.length} produto(s) · ${totalEtiquetas} etiqueta(s)`}
            </p>
          </div>
          <div className="max-h-[420px] overflow-y-auto bg-gray-100 p-3">
            {selecionadosLista.length === 0 ? (
              <Vazio texto="Nenhuma etiqueta para exibir" />
            ) : (
              <div className="flex flex-wrap gap-3">
                {selecionadosLista.flatMap(p => {
                  const qtd = quantidades[p.id] ?? 1;
                  return Array.from({ length: qtd }, (_, i) => (
                    <div
                      key={`${p.id}-${i}`}
                      className={`flex flex-col border border-gray-500 bg-white p-2 ${
                        tamanho === "pequena"
                          ? "w-40"
                          : tamanho === "media"
                            ? "w-56"
                            : "w-72"
                      }`}
                      style={{ fontFamily: "monospace" }}
                    >
                      <div className="text-center text-[10px] font-bold">{empresa}</div>
                      <div className="mt-0.5 truncate text-center text-[10px] font-bold">{p.nome}</div>
                      <div className="text-[9px]">Código: <b>{p.codigo}</b></div>
                      <div className="text-[9px]">Marca: <b>{p.marca || "—"}</b></div>
                      <div className="text-[9px]">Modelo: <b>{p.modelo || "—"}</b></div>
                      <div className="text-[9px]">Categoria: <b>{p.categoria_nome || "—"}</b></div>
                      <div className="mt-auto flex justify-center pt-1">
                        <Barcode value={p.codigo} width={1.2} height={24} fontSize={8} />
                      </div>
                    </div>
                  ));
                })}
              </div>
            )}
          </div>
          {selecionadosLista.length > 0 && (
            <div className="flex justify-end gap-2 border-t border-gray-100 p-3">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => imprimirTodos()}
                disabled={imprimindo}
              >
                Imprimir Todos
              </Button>
              {selecionadosLista.length === 1 && (
                <Button
                  variant="primary"
                  size="sm"
                  icon={<Printer className="h-3 w-3" />}
                  onClick={() => imprimirUm(selecionadosLista[0])}
                  disabled={imprimindo}
                >
                  Imprimir
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}