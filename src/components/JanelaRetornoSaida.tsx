import { useEffect, useMemo, useRef, useState } from "react";
import { RotateCcw, ScanBarcode, Search } from "lucide-react";
import Window from "./Window";
import Button from "./Button";
import type { Movimentacao } from "../lib/types";
import { api } from "../lib/api";
import { useAuth } from "../lib/useAuth";

/**
 * Janela de "Retorno de Saída" — devolve ao estoque produtos que já saíram.
 *
 * Vive num componente próprio para poder ser aberta de qualquer tela que
 * liste saídas (hoje: a tela Saída, na coluna Ação).
 */

// Linha da janela de retorno: uma saída registrada ainda não devolvida (integralmente)
type LinhaRetorno = {
  mov: Movimentacao;
  codigo: string;
  solicitante: string;
  devolvido: number;
  saldo: number;
};

// Monta a lista de saídas com saldo pendente de retorno.
// Saldo = quantidade da saída original menos o que já foi devolvido:
// cada devolução é uma movimentação tipo "entrada" com saida_ref:<id> na observação.
export function calcularLinhas(retMovs: Movimentacao[], retProdFiltro: number | null, retBusca: string): LinhaRetorno[] {
  const devolvidos = new Map<number, number>();
  for (const m of retMovs) {
    if (m.tipo !== "entrada") continue;
    const ref = m.observacao?.match(/saida_ref:\s*(\d+)/)?.[1];
    if (!ref) continue;
    const id = Number(ref);
    devolvidos.set(id, (devolvidos.get(id) || 0) + Number(m.quantidade || 0));
  }
  const termo = retBusca.trim().toLowerCase();
  const saidas: LinhaRetorno[] = [];
  for (const m of retMovs) {
    if (m.tipo !== "saida") continue;
    if (retProdFiltro !== null && m.produto_id !== retProdFiltro) continue;
    const total = Number(m.quantidade || 0);
    const devolvido = Math.min(devolvidos.get(m.id) || 0, total);
    const saldo = total - devolvido;
    if (saldo <= 0) continue;
    const codigo = m.observacao?.match(/^cod_produto:(.+)$/m)?.[1]?.trim() || "";
    const solicitante = m.observacao?.match(/por ([^-]+) - /)?.[1]?.trim() || "";
    const nome = m.produto_nome || "";
    if (termo && !(
      nome.toLowerCase().includes(termo) ||
      codigo.toLowerCase().includes(termo) ||
      solicitante.toLowerCase().includes(termo)
    )) continue;
    saidas.push({ mov: m, codigo, solicitante, devolvido, saldo });
  }
  return saidas.sort((a, b) =>
    new Date(b.mov.data_movimento).getTime() - new Date(a.mov.data_movimento).getTime()
  );
}

function hojeISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

interface JanelaRetornoSaidaProps {
  open: boolean;
  onClose: () => void;
  /** Filtra a lista pelas saídas deste produto (null = todas). */
  produtoFiltro?: number | null;
  /** Nome do produto filtrado, usado no subtítulo. */
  produtoNome?: string | null;
  /** Chamado depois de gravar as devoluções, para a tela pai recarregar a lista. */
  onDevolver?: () => void;
}

export default function JanelaRetornoSaida({
  open,
  onClose,
  produtoFiltro = null,
  produtoNome = null,
  onDevolver,
}: JanelaRetornoSaidaProps) {
  const { user } = useAuth();
  const [movs, setMovs] = useState<Movimentacao[]>([]);
  const [busca, setBusca] = useState("");
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [qtd, setQtd] = useState<Record<number, number>>({});
  const [data, setData] = useState<string>(() => hojeISO());
  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  // Leitura de código de barras
  const [barcode, setBarcode] = useState("");
  const [barcodeMsg, setBarcodeMsg] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const barcodeRef = useRef<HTMLInputElement>(null);

  const linhas = useMemo<LinhaRetorno[]>(
    () => calcularLinhas(movs, produtoFiltro, busca),
    [movs, produtoFiltro, busca]
  );

  async function carregar() {
    setCarregando(true);
    try {
      setMovs(await api.movimentacoes.list());
    } catch (e) {
      console.error("[Retorno] falha ao carregar movimentações:", e);
      setMovs([]);
    } finally {
      setCarregando(false);
    }
  }

  // Carrega as saídas ao abrir a janela
  useEffect(() => {
    if (!open) return;
    setBusca("");
    setSel(new Set());
    setQtd({});
    setData(hojeISO());
    setBarcode("");
    setBarcodeMsg(null);
    carregar();
    // Leitor de código de barras já pronto para a primeira leitura
    const t = setTimeout(() => barcodeRef.current?.focus(), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, produtoFiltro]);

  function toggle(id: number) {
    setSel(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
    setQtd(prev => {
      if (id in prev) return prev;
      const l = linhas.find(x => x.mov.id === id);
      return l ? { ...prev, [id]: l.saldo } : prev;
    });
  }

  // Marca/desmarca todas as linhas (inclusive as filtradas pela busca)
  function alternarTodos() {
    const todos = linhas.map(l => l.mov.id);
    const todosMarcados = todos.length > 0 && todos.every(id => sel.has(id));
    if (todosMarcados) {
      setSel(new Set());
      setQtd({});
      return;
    }
    setSel(new Set(todos));
    const qtds: Record<number, number> = {};
    for (const l of linhas) qtds[l.mov.id] = l.saldo;
    setQtd(prev => ({ ...qtds, ...prev }));
  }

  // ── Leitura por código de barras ──────────────────────────────
  // Localiza a saída pendente daquele código e a auto-seleciona.
  // Cada leitura soma 1 unidade (ler de novo incrementa até o saldo).
  function processarCodigo(bruto: string) {
    const cod = bruto.trim().toUpperCase();
    if (!cod) return;

    // 1) Procura entre as linhas visíveis (com os filtros atuais)
    let alvo = linhas.find(l => (l.codigo || "").trim().toUpperCase() === cod);
    // 2) Não achou: procura ignorando o texto de busca digitado e limpa esse filtro
    if (!alvo) {
      const semFiltroTexto = calcularLinhas(movs, produtoFiltro, "");
      alvo = semFiltroTexto.find(l => (l.codigo || "").trim().toUpperCase() === cod);
      if (alvo) setBusca("");
    }

    if (!alvo) {
      setBarcodeMsg({ tipo: "erro", texto: `Código ${cod} não encontrado entre as saídas pendentes de retorno.` });
      setBarcode("");
      barcodeRef.current?.focus();
      return;
    }

    const alvoFinal: LinhaRetorno = alvo;
    const id = alvoFinal.mov.id;
    const atual = Number(qtd[id] ?? 0);
    const nova = Math.max(1, Math.min(alvoFinal.saldo, atual + 1));
    setSel(prev => new Set(prev).add(id));
    setQtd(prev => ({ ...prev, [id]: nova }));
    setBarcodeMsg({
      tipo: "ok",
      texto: `✓ ${alvoFinal.codigo || "s/ código"} — ${alvoFinal.mov.produto_nome} · ${nova} de ${alvoFinal.saldo} unidade(s) a devolver`,
    });
    setBarcode("");
    barcodeRef.current?.focus();
  }

  // Leitores que não enviam Enter: dispara quando o valor digitado/lido
  // bater exatamente com um código de produto já cadastrado na saída.
  useEffect(() => {
    if (!open) return;
    const v = barcode.trim().toUpperCase();
    if (!v) return;
    const existe = calcularLinhas(movs, produtoFiltro, "")
      .some(l => (l.codigo || "").trim().toUpperCase() === v);
    if (existe) processarCodigo(v);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [barcode, open, movs, produtoFiltro]);

  // A confirmação de leitura bem-sucedida some sozinha
  useEffect(() => {
    if (barcodeMsg?.tipo !== "ok") return;
    const t = setTimeout(() => setBarcodeMsg(null), 4000);
    return () => clearTimeout(t);
  }, [barcodeMsg]);

  async function devolver() {
    const alvos = linhas.filter(l => sel.has(l.mov.id));
    if (alvos.length === 0) { alert("Selecione ao menos uma saída para devolver."); return; }

    const qtds = alvos.map(l => Number(qtd[l.mov.id] ?? l.saldo));
    if (qtds.some(q => !Number.isFinite(q) || q <= 0)) {
      alert("Quantidades devem ser números maiores que zero."); return;
    }
    const acimaDoSaldo = alvos.filter((l, i) => qtds[i] > l.saldo);
    if (acimaDoSaldo.length > 0) {
      alert("Quantidade maior que a saída registrada em:\n" +
        acimaDoSaldo.map(l => `• ${l.mov.produto_nome}${l.codigo ? ` (${l.codigo})` : ""} — saldo ${l.saldo}`).join("\n"));
      return;
    }
    const totalUn = qtds.reduce((s, q) => s + q, 0);
    if (!confirm(
      `Confirmar retorno de ${alvos.length} saída(s), totalizando ${totalUn} unidade(s)?\n\n` +
      `O estoque dos produtos será atualizado.`
    )) return;

    setSalvando(true);
    const falhas: string[] = [];
    let gravados = 0;
    for (let i = 0; i < alvos.length; i++) {
      const l = alvos[i];
      try {
        await api.movimentacoes.create({
          tipo: "entrada",
          produto_id: l.mov.produto_id,
          produto_nome: l.mov.produto_nome,
          quantidade: qtds[i],
          loja_origem_id: null,
          loja_origem_nome: null,
          loja_destino_id: null,
          loja_destino_nome: null,
          usuario_id: user?.id ?? null,
          observacao: [
            `Retorno de saida - ${l.mov.produto_nome || ""}`,
            `solicitante:${l.solicitante || "desconhecido"}`,
            l.codigo ? `cod_produto:${l.codigo}` : null,
            `saida_ref:${l.mov.id}`,
          ].filter(Boolean).join("\n"),
          unidade: l.mov.unidade ?? 1,
          data_movimento: `${data || hojeISO()}T12:00:00`,
        });
        gravados++;
      } catch (e) {
        falhas.push(`${l.mov.produto_nome}${l.codigo ? ` (${l.codigo})` : ""}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    setSalvando(false);

    if (falhas.length > 0) {
      alert(`Retorno concluído parcialmente.\n\nGravados: ${gravados}\nFalhas: ${falhas.length}\n\n${falhas.join("\n").slice(0, 800)}`);
    }

    setSel(new Set());
    setQtd({});
    await carregar(); // linhas totalmente devolvidas somem da lista
    onDevolver?.();    // a tela pai recarrega a própria lista de saídas
  }

  return (
    <Window
      open={open}
      onClose={onClose}
      title="Retorno de Saída"
      subtitle={produtoFiltro !== null && produtoFiltro !== undefined
        ? `Produto: ${produtoNome || "—"}`
        : "Devolva ao estoque produtos que já tiveram saída"}
      size="xl"
      footer={<>
        <span className="mr-auto text-xs text-gray-500">
          {sel.size > 0
            ? `${sel.size} saída(s) selecionada(s) · ${linhas.filter(l => sel.has(l.mov.id)).reduce((s, l) => s + Number(qtd[l.mov.id] ?? l.saldo), 0)} unidade(s)`
            : "Selecione as saídas para devolver"}
        </span>
        <Button variant="secondary" onClick={onClose}>Fechar</Button>
        <Button variant="success" icon={<RotateCcw className="h-4 w-4" />} onClick={devolver}
          disabled={salvando || carregando || sel.size === 0}>
          {salvando ? "Devolvendo..." : `Devolver${sel.size > 0 ? ` (${sel.size})` : ""}`}
        </Button>
      </>}
    >
      <div className="space-y-3">
        {/* Barra de ferramentas: código de barras, busca, data e seleção em lote */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Leitura por código de barras — auto-seleciona o produto */}
          <div className="flex min-w-[230px] flex-1 items-center gap-2 rounded-lg border-2 border-teal-500/70 bg-teal-50/60 px-3 py-1.5 focus-within:border-teal-600 focus-within:bg-white">
            <ScanBarcode className="h-4 w-4 shrink-0 text-teal-600" />
            <input
              ref={barcodeRef}
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); processarCodigo(barcode); } }}
              placeholder="Leia o código de barras do produto..."
              autoFocus
              className="w-full min-w-0 bg-transparent font-mono text-sm text-gray-900 outline-none placeholder:font-sans placeholder:text-teal-700/70"
              title="Aproxime o leitor: ao ler o código, a saída correspondente é selecionada automaticamente (cada leitura soma 1 unidade)"
            />
          </div>
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por produto, código ou solicitante..."
              className="w-full rounded-lg border border-gray-300 bg-gray-50 py-2 pl-9 pr-3 text-sm outline-none focus:border-blue-400 focus:bg-white"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-gray-500">Data do retorno</label>
            <input
              type="date"
              value={data}
              onChange={(e) => setData(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <button
            onClick={alternarTodos}
            disabled={linhas.length === 0}
            className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {linhas.length > 0 && linhas.every(l => sel.has(l.mov.id)) ? "Desmarcar todos" : "Marcar todos"}
          </button>
        </div>

        {/* Feedback da leitura do código de barras */}
        {barcodeMsg && (
          <div role="status" className={`rounded-lg border px-3 py-2 text-xs font-medium ${
            barcodeMsg.tipo === "ok"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-red-200 bg-red-50 text-red-700"
          }`}>
            {barcodeMsg.texto}
          </div>
        )}

        {/* Resumo */}
        <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
          <span>{linhas.length} saída(s) disponível(is) para retorno</span>
        </div>

        {/* Lista de saídas pendentes */}
        {carregando ? (
          <div className="py-10 text-center text-sm text-gray-400">Carregando saídas...</div>
        ) : linhas.length === 0 ? (
          <div className="py-10 text-center">
            <p className="text-sm font-medium text-gray-500">Nenhuma saída pendente de retorno</p>
            <p className="mt-1 text-xs text-gray-400">
              {produtoFiltro !== null && produtoFiltro !== undefined
                ? "Este produto não tem saídas em aberto."
                : "Todas as saídas já foram devolvidas."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-[11px] font-semibold uppercase text-gray-500">
                <tr>
                  <th className="w-10 px-3 py-2.5 text-center">
                    <input
                      type="checkbox"
                      checked={linhas.every(l => sel.has(l.mov.id))}
                      onChange={alternarTodos}
                      className="h-4 w-4 cursor-pointer accent-teal-600"
                      title="Marcar todas as linhas listadas"
                    />
                  </th>
                  <th className="px-3 py-2.5 text-left">Código</th>
                  <th className="px-3 py-2.5 text-left">Produto</th>
                  <th className="px-3 py-2.5 text-left">Solicitante</th>
                  <th className="px-3 py-2.5 text-left">Data Saída</th>
                  <th className="px-3 py-2.5 text-center">Saída</th>
                  <th className="px-3 py-2.5 text-center">Devolvido</th>
                  <th className="px-3 py-2.5 text-center">Saldo</th>
                  <th className="px-3 py-2.5 text-center">Devolver</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {linhas.map((l) => {
                  const marcado = sel.has(l.mov.id);
                  const q = qtd[l.mov.id] ?? l.saldo;
                  return (
                    <tr key={l.mov.id} className={marcado ? "bg-teal-50/70" : "transition hover:bg-gray-50"}>
                      <td className="px-3 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={marcado}
                          onChange={() => toggle(l.mov.id)}
                          className="h-4 w-4 cursor-pointer accent-teal-600"
                        />
                      </td>
                      <td className="whitespace-nowrap px-3 py-2">
                        <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-xs font-semibold text-slate-700">
                          {l.codigo || "—"}
                        </span>
                      </td>
                      <td className="max-w-[220px] truncate px-3 py-2" title={l.mov.produto_nome || ""}>
                        {l.mov.produto_nome || "—"}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-gray-600">{l.solicitante || "—"}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-gray-500">
                        {l.mov.data_movimento ? new Date(l.mov.data_movimento).toLocaleDateString("pt-BR") : "—"}
                      </td>
                      <td className="px-3 py-2 text-center text-gray-600">{l.mov.quantidade}</td>
                      <td className="px-3 py-2 text-center text-gray-400">{l.devolvido}</td>
                      <td className="px-3 py-2 text-center font-semibold text-gray-900">{l.saldo}</td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min={1}
                          max={l.saldo}
                          value={q}
                          disabled={!marcado}
                          onChange={(e) => setQtd(prev => ({
                            ...prev,
                            [l.mov.id]: Math.max(1, Math.min(l.saldo, Number(e.target.value) || 1)),
                          }))}
                          title={marcado ? "Quantidade a devolver" : "Marque a linha para informar a quantidade"}
                          className="w-20 rounded border border-gray-300 px-2 py-1 text-center text-sm disabled:cursor-not-allowed disabled:border-gray-200 disabled:bg-gray-50 disabled:text-gray-400"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <p className="text-[11px] leading-relaxed text-gray-400">
          Cada retorno é gravado como uma <strong>entrada</strong> ligada à saída original
          (campo <span className="font-mono">saida_ref</span>), atualizando o estoque do produto.
          Saídas com todo o saldo devolvido deixam de aparecer nesta lista.
        </p>
      </div>
    </Window>
  );
}
