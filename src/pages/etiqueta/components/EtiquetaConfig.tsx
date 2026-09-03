/**
 * EtiquetaConfig — Painel lateral de configuração
 * Extraído e convertido de: controle-estoque-tauri (Next.js) → React/Vite/Tauri
 */
import { ChevronDown, ChevronRight } from 'lucide-react'

interface SecaoProps {
  titulo: string
  aberta: boolean
  aoToggle: () => void
  children: React.ReactNode
}
function Secao({ titulo, aberta, aoToggle, children }: SecaoProps) {
  return (
    <div className="border-b border-slate-100">
      <button onClick={aoToggle} className="flex w-full items-center justify-between px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
        <span>{titulo}</span>{aberta ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
      </button>
      {aberta && <div className="px-3 pb-3 space-y-2">{children}</div>}
    </div>
  )
}

interface CampoProps {
  value: number
  onChange: (v: number) => void
  min?: number
  step?: number
  className?: string
}
function Campo({ value, onChange, min, step, className = '' }: CampoProps) {
  return (
    <input type="number" value={value} min={min} step={step}
      onChange={e => onChange(Number(e.target.value))}
      className={`rounded-md border border-slate-200 px-2 py-1 text-xs focus:border-blue-500 focus:outline-none bg-white ${className}`} />
  )
}

interface EtiquetaConfigProps {
  secoesAbertas: Record<string, boolean>; toggleSecao: (key: string) => void
  mostrarConfig: boolean; setMostrarConfig: (v: boolean) => void
  cfg: any; papel: string; setPapel: (v: string) => void
  formato: string; setFormato: (v: string) => void
  largura: number; setLargura: (v: number) => void; altura: number; setAltura: (v: number) => void
  margemSup: number; setMargemSup: (v: number) => void; margemEsq: number; setMargemEsq: (v: number) => void
  margemDir: number; setMargemDir: (v: number) => void; margemInf: number; setMargemInf: (v: number) => void
  colunas: number; setColunas: (v: number) => void; espacoH: number; setEspacoH: (v: number) => void
  espacoV: number; setEspacoV: (v: number) => void; inicioLinha: number; setInicioLinha: (v: number) => void
  campos: string[]; toggleCampo: (c: string) => void
  mostrarBarra: boolean; setMostrarBarra: (v: boolean) => void
  borda: any; setBorda: (v: any) => void
  tamanhoProd: number; setTamanhoProd: (v: number) => void
  tamanhoCod: number; setTamanhoCod: (v: number) => void
  tamanhoMarca: number; setTamanhoMarca: (v: number) => void
  tamanhoModelo: number; setTamanhoModelo: (v: number) => void
  alturaBarra: number; setAlturaBarra: (v: number) => void
  posicoes: any; setPosicoes: (v: any) => void
  alinhamentoH: string; setAlinhamentoH: (v: string) => void
  alinhamentoV: string; setAlinhamentoV: (v: string) => void
  etqPorPagina: number; totalPaginas: number
  PRESETS: any[]; copiadoPreset: string | null; aplicarPreset: (p: any) => void
  selecionados: number[]; setMostrarModalProdutos: (v: boolean) => void
  limpar: () => void
}

export default function EtiquetaConfig(props: EtiquetaConfigProps) {
  const {
    secoesAbertas, toggleSecao, cfg,
    largura, setLargura, altura, setAltura,
    margemSup, setMargemSup, margemEsq, setMargemEsq, margemDir, setMargemDir, margemInf, setMargemInf,
    colunas, setColunas, espacoH, setEspacoH, espacoV, setEspacoV, inicioLinha, setInicioLinha,
    campos, toggleCampo, mostrarBarra, setMostrarBarra, borda, setBorda,
    tamanhoProd, setTamanhoProd, tamanhoCod, setTamanhoCod, tamanhoMarca, setTamanhoMarca,
    tamanhoModelo, setTamanhoModelo, alturaBarra, setAlturaBarra,
    posicoes, setPosicoes, alinhamentoH, setAlinhamentoH,
    alinhamentoV, setAlinhamentoV, etqPorPagina, totalPaginas,
    PRESETS, copiadoPreset, aplicarPreset,
    selecionados, setMostrarModalProdutos, limpar,
  } = props

  return (
    <div className="w-80 border-r border-slate-200 bg-white flex flex-col overflow-hidden flex-shrink-0">
      {/* Selecionar Produtos (topo) */}
      <div className="px-3 py-3 border-b border-slate-100 bg-slate-50/50">
        <div className="text-[10px] text-slate-500 mb-1">{selecionados.length} produto(s) selecionados</div>
        <button onClick={() => setMostrarModalProdutos(true)} className="w-full rounded-lg border border-blue-300 bg-blue-50 px-3 py-2 text-[11px] font-medium text-blue-700 hover:bg-blue-100">📋 Selecionar Produtos</button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Presets */}
        <Secao titulo="Presets" aberta={secoesAbertas.presets} aoToggle={() => toggleSecao('presets')}>
          <div className="grid grid-cols-2 gap-1.5">
            {PRESETS.map(pr => (
              <button key={pr.nome} onClick={() => aplicarPreset(pr)}
                className={`flex flex-col items-center gap-0.5 rounded-lg border px-2 py-2 text-[10px] hover:border-blue-400 hover:bg-blue-50 ${copiadoPreset === pr.nome ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-300' : 'border-slate-200'}`}>
                <span className="text-base">{pr.icone}</span><span className="font-medium">{pr.nome}</span>
              </button>
            ))}
          </div>
        </Secao>

        {/* Papel e Formato */}
        <Secao titulo="Papel e Formato" aberta={secoesAbertas.papelFormato} aoToggle={() => toggleSecao('papelFormato')}>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-2.5 text-center">
            <div className="text-[11px] font-bold text-blue-700">📄 Folha A4</div>
            <div className="text-[9px] text-blue-600">210 × 297 mm</div>
          </div>
          <div className="grid grid-cols-2 gap-2 mt-2">
            <div><label className="text-[10px] font-medium text-slate-500">Largura</label>
              <Campo value={largura} onChange={setLargura} className="w-full mt-1" /></div>
            <div><label className="text-[10px] font-medium text-slate-500">Altura</label>
              <Campo value={altura} onChange={setAltura} className="w-full mt-1" /></div>
          </div>
          <div className="text-[10px] font-semibold text-blue-700 bg-blue-50 rounded-lg px-3 py-1.5 text-center">{cfg.largura}×{cfg.altura}mm · {etqPorPagina}/folha</div>
        </Secao>

        {/* Layout */}
        <Secao titulo="Layout" aberta={secoesAbertas.layout} aoToggle={() => toggleSecao('layout')}>
          <div className="grid grid-cols-2 gap-2">
            <div><label className="text-[10px] font-medium text-slate-500">Colunas</label>
              <Campo value={colunas} onChange={setColunas} min={1} className="w-full mt-1" /></div>
            <div><label className="text-[10px] font-medium text-slate-500">Início</label>
              <Campo value={inicioLinha} onChange={setInicioLinha} min={1} className="w-full mt-1" /></div>
            <div><label className="text-[10px] font-medium text-slate-500">Espaço H</label>
              <Campo value={espacoH} onChange={setEspacoH} className="w-full mt-1" /></div>
            <div><label className="text-[10px] font-medium text-slate-500">Espaço V</label>
              <Campo value={espacoV} onChange={setEspacoV} className="w-full mt-1" /></div>
          </div>
          <div className="text-[10px] font-semibold text-indigo-700 bg-indigo-50 rounded-lg px-3 py-1.5 text-center">{etqPorPagina} etq · {totalPaginas} pág</div>
        </Secao>

        {/* Margens */}
        <Secao titulo="Margens" aberta={secoesAbertas.posicaoFolha} aoToggle={() => toggleSecao('posicaoFolha')}>
          <div className="grid grid-cols-2 gap-2">
            <div><label className="text-[10px] font-medium text-slate-500">Sup</label>
              <Campo value={margemSup} onChange={setMargemSup} className="w-full mt-1" /></div>
            <div><label className="text-[10px] font-medium text-slate-500">Inf</label>
              <Campo value={margemInf} onChange={setMargemInf} className="w-full mt-1" /></div>
            <div><label className="text-[10px] font-medium text-slate-500">Esq</label>
              <Campo value={margemEsq} onChange={setMargemEsq} className="w-full mt-1" /></div>
            <div><label className="text-[10px] font-medium text-slate-500">Dir</label>
              <Campo value={margemDir} onChange={setMargemDir} className="w-full mt-1" /></div>
          </div>
        </Secao>

        {/* Campos */}
        <Secao titulo="Campos" aberta={secoesAbertas.campos} aoToggle={() => toggleSecao('campos')}>
          {['codigo', 'produto', 'marca', 'modelo', 'marcaEtiqueta'].map(c => (
            <label key={c} className="flex items-center gap-2 py-0.5">
              <input type="checkbox" checked={campos.includes(c)} onChange={() => toggleCampo(c)} className="rounded w-3.5 h-3.5" />
              <span className="text-xs capitalize">{c}</span>
            </label>
          ))}
          <label className="flex items-center gap-2 py-0.5">
            <input type="checkbox" checked={mostrarBarra} onChange={e => setMostrarBarra(e.target.checked)} className="rounded w-3.5 h-3.5" />
            <span className="text-xs">Barcode</span>
          </label>
        </Secao>

        {/* Posições */}
        <Secao titulo="Posições" aberta={secoesAbertas.posicoes} aoToggle={() => toggleSecao('posicoes')}>
          <div className="space-y-1.5">
            {['codigo', 'produto', 'marca', 'modelo', 'barra'].map(c => (
              <div key={c} className="flex items-center gap-1">
                <span className="text-[10px] font-semibold w-14 shrink-0 capitalize">{c}</span>
                <div className="flex items-center gap-0.5 flex-1">
                  <span className="text-[8px] text-slate-400 font-medium w-3 text-center">Y</span>
                  <Campo value={posicoes[c]?.top ?? 0} onChange={v => setPosicoes({ ...posicoes, [c]: { ...posicoes[c], top: v } })} className="w-full text-center" />
                </div>
                <div className="flex items-center gap-0.5 flex-1">
                  <span className="text-[8px] text-slate-400 font-medium w-3 text-center">X</span>
                  <Campo value={posicoes[c]?.left ?? 0} onChange={v => setPosicoes({ ...posicoes, [c]: { ...posicoes[c], left: v } })} className="w-full text-center" />
                </div>
                <span className="text-[8px] text-slate-400 font-medium w-5 text-center shrink-0">mm</span>
              </div>
            ))}
          </div>
        </Secao>

        {/* Tamanhos */}
        <Secao titulo="Tamanhos" aberta={secoesAbertas.tamanhos} aoToggle={() => toggleSecao('tamanhos')}>
          <div className="space-y-1.5">
            {[
              { c: 'codigo', size: tamanhoCod, set: setTamanhoCod },
              { c: 'produto', size: tamanhoProd, set: setTamanhoProd },
              { c: 'marca', size: tamanhoMarca, set: setTamanhoMarca },
              { c: 'modelo', size: tamanhoModelo, set: setTamanhoModelo },
            ].map(({ c, size, set }) => (
              <div key={c} className="flex items-center gap-2">
                <span className="text-[11px] text-slate-600 w-16 font-medium capitalize">{c}</span>
                <Campo value={size} onChange={set} className="w-16" />
                <span className="text-[10px] text-slate-400 w-5">mm</span>
              </div>
            ))}
            <div className="border-t border-slate-100 pt-2 mt-1">
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-slate-600 w-16 font-medium">Alt barra</span>
                <Campo value={alturaBarra} onChange={setAlturaBarra} className="w-16" />
                <span className="text-[10px] text-slate-400 w-5">mm</span>
              </div>
            </div>
          </div>
        </Secao>

        {/* Borda */}
        <Secao titulo="Borda" aberta={secoesAbertas.borda} aoToggle={() => toggleSecao('borda')}>
          <label className="flex items-center gap-2"><input type="checkbox" checked={borda.ativa} onChange={e => setBorda({ ...borda, ativa: e.target.checked })} className="rounded" /><span className="text-xs">Ativar borda</span></label>
          {borda.ativa && (
            <div className="grid grid-cols-2 gap-2 mt-2">
              <div><label className="text-[10px] font-medium text-slate-500">Espessura</label>
                <Campo value={borda.largura} onChange={v => setBorda({ ...borda, largura: v })} min={0.1} step={0.1} className="w-full mt-1" /></div>
              <div><label className="text-[10px] font-medium text-slate-500">Cor</label>
                <input type="color" value={borda.cor} onChange={e => setBorda({ ...borda, cor: e.target.value })} className="w-full h-8 rounded border mt-1" /></div>
            </div>
          )}
        </Secao>

        {/* Alinhamento */}
        <Secao titulo="Alinhamento" aberta={secoesAbertas.posicaoFolha} aoToggle={() => toggleSecao('posicaoFolha')}>
          <div className="flex gap-1">
            {[['left', 'Esq'], ['center', 'Centro'], ['right', 'Dir']].map(([v, l]) => (
              <button key={v} onClick={() => setAlinhamentoH(v)}
                className={`flex-1 py-1.5 text-[10px] rounded-lg font-semibold ${alinhamentoH === v ? 'bg-indigo-100 text-indigo-700 border border-indigo-200' : 'bg-slate-50 text-slate-500 border border-slate-200'}`}>{l}</button>
            ))}
          </div>
          <div className="flex gap-1 mt-1">
            {[['start', 'Topo'], ['center', 'Meio'], ['end', 'Fundo']].map(([v, l]) => (
              <button key={v} onClick={() => setAlinhamentoV(v)}
                className={`flex-1 py-1.5 text-[10px] rounded-lg font-semibold ${alinhamentoV === v ? 'bg-indigo-100 text-indigo-700 border border-indigo-200' : 'bg-slate-50 text-slate-500 border border-slate-200'}`}>{l}</button>
            ))}
          </div>
        </Secao>
      </div>

      {/* Footer */}
      <div className="border-t border-slate-200 px-3 py-2 flex items-center justify-between">
        <button onClick={limpar} className="text-[9px] text-slate-400 hover:text-slate-600">Limpar tudo</button>
      </div>
    </div>
  )
}
