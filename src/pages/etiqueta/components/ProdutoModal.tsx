/**
 * ProdutoModal — Modal de seleção de produtos
 * Extraído e convertido de: controle-estoque-tauri (Next.js) → React/Vite/Tauri
 */
import { useState, useMemo } from 'react'
import { Package, X, Search } from 'lucide-react'

interface ProdutoModalProps {
  produtos: any[]
  selecionados: number[]
  setSelecionados: (v: number[] | ((prev: number[]) => number[])) => void
  quantidades: Record<number, number>
  setQuantidades: (v: Record<number, number> | ((prev: Record<number, number>) => Record<number, number>)) => void
  cfg: any
  campos: string[]
  mostrarBarra: boolean
  onClose: () => void
}

export default function ProdutoModal({ produtos, selecionados, setSelecionados, quantidades, setQuantidades, cfg, campos, onClose }: ProdutoModalProps) {
  const [busca, setBusca] = useState('')

  const filtrados = useMemo(() => {
    if (!busca.trim()) return produtos
    const q = busca.toLowerCase()
    return produtos.filter(p =>
      (p.nome?.toLowerCase() || '').includes(q) ||
      (p.codigo?.toLowerCase() || '').includes(q) ||
      (p.marca?.toLowerCase() || '').includes(q)
    )
  }, [produtos, busca])

  const todosMarcados = filtrados.every(p => selecionados.includes(p.id))

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-[600px] max-h-[85vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between bg-gradient-to-r from-violet-50 to-white">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-violet-100 flex items-center justify-center"><Package size={16} className="text-violet-600" /></div>
            <div>
              <h2 className="text-sm font-bold text-slate-800">Galeria de Produtos</h2>
              <p className="text-[10px] text-slate-500">{selecionados.length} selecionado(s)</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100"><X size={18} /></button>
        </div>

        {/* Busca */}
        <div className="px-4 py-2.5 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between gap-3">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input type="text" value={busca} onChange={e => setBusca(e.target.value)}
              placeholder="Buscar por nome, código ou marca..."
              className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-xl focus:border-violet-400 focus:ring-2 focus:ring-violet-100 outline-none bg-white" />
          </div>
          <button onClick={() => {
            if (todosMarcados) {
              setSelecionados(prev => prev.filter(id => !filtrados.find(p => p.id === id)))
              setQuantidades(prev => { const n = { ...prev }; filtrados.forEach(p => delete n[p.id]); return n })
            } else {
              setSelecionados(prev => [...new Set([...prev, ...filtrados.map(p => p.id)])])
            }
          }} className="text-[10px] font-semibold text-violet-600 hover:text-violet-800 whitespace-nowrap px-2.5 py-1.5 rounded-lg hover:bg-violet-50">
            {todosMarcados ? 'Desmarcar todos' : 'Selecionar todos'}
          </button>
        </div>

        {/* Lista */}
        <div className="flex-1 overflow-y-auto p-3">
          <div className="grid grid-cols-2 gap-2">
            {filtrados.map(produto => {
              const sel = selecionados.includes(produto.id)
              const qtd = quantidades[produto.id] || 1
              return (
                <div key={produto.id}
                  className={`rounded-xl border overflow-hidden transition-all ${sel ? 'bg-violet-50/50 border-violet-200 shadow-sm ring-1 ring-violet-200' : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-sm'}`}>
                  <div className="p-2.5 border-b border-slate-100 bg-white">
                    <div className="flex items-center gap-2">
                      <input type="checkbox" checked={sel}
                        onChange={e => setSelecionados(prev => e.target.checked ? [...prev, produto.id] : prev.filter(id => id !== produto.id))}
                        className="rounded w-3.5 h-3.5 text-violet-600 border-slate-300" />
                      <div className="flex-1 min-w-0">
                        <div className={`text-[11px] font-semibold truncate ${sel ? 'text-violet-800' : 'text-slate-700'}`}>{produto.nome}</div>
                        <div className="text-[9px] text-slate-400">{produto.marca}{produto.modelo ? ` · ${produto.modelo}` : ''}</div>
                      </div>
                    </div>
                  </div>
                  <div className="px-2.5 py-2 bg-gradient-to-b from-slate-50 to-white">
                    <div className="bg-white rounded border border-slate-200 shadow-sm overflow-hidden"
                      style={{ width: '100%', aspectRatio: `${cfg.largura}/${cfg.altura}` }}>
                      <div className="p-1.5 space-y-0.5">
                        {campos.includes('codigo') && <div className="text-[7px] text-slate-600 truncate font-mono">{produto.codigo || '---'}</div>}
                        {campos.includes('produto') && <div className="text-[8px] text-slate-800 truncate font-bold">{produto.nome}</div>}
                        {campos.includes('marca') && <div className="text-[7px] text-slate-500 truncate">{produto.marca || '---'}</div>}
                        {campos.includes('modelo') && <div className="text-[7px] text-slate-500 truncate">{produto.modelo || '---'}</div>}
                      </div>
                    </div>
                  </div>
                  {sel && (
                    <div className="flex items-center gap-1.5 px-2.5 py-1.5 border-t border-violet-100 bg-violet-50/30">
                      <span className="text-[9px] text-slate-500 font-medium">Qtd:</span>
                      <button onClick={() => setQuantidades(prev => ({ ...prev, [produto.id]: Math.max(1, (prev[produto.id] || 1) - 1) }))}
                        className="w-5 h-5 flex items-center justify-center rounded bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-bold">−</button>
                      <span className="text-[10px] font-bold text-violet-700 min-w-[14px] text-center">{qtd}</span>
                      <button onClick={() => setQuantidades(prev => ({ ...prev, [produto.id]: (prev[produto.id] || 1) + 1 }))}
                        className="w-5 h-5 flex items-center justify-center rounded bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-bold">+</button>
                      <button onClick={e => { e.stopPropagation(); setSelecionados(prev => prev.filter(id => id !== produto.id)); setQuantidades(prev => { const n = { ...prev }; delete n[produto.id]; return n }) }}
                        className="ml-auto w-5 h-5 flex items-center justify-center rounded text-red-400 hover:text-red-600 hover:bg-red-50" title="Remover"><X size={12} /></button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          {filtrados.length === 0 && (
            <div className="text-center py-12 text-slate-400">
              <div className="text-xs font-medium">Nenhum produto encontrado</div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-slate-200 bg-slate-50/50 flex items-center justify-between">
          <button onClick={() => { setSelecionados([]); setQuantidades({}) }}
            className="text-xs text-slate-500 hover:text-red-600 font-medium">Limpar seleção</button>
          <button onClick={onClose}
            className="px-5 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-xs font-semibold shadow-sm">
            Confirmar ({selecionados.length})
          </button>
        </div>
      </div>
    </div>
  )
}
