/**
 * Etiquetas — Página principal de impressão de etiquetas
 * Copiado e convertido de: controle-estoque-tauri (Next.js) → React/Vite/Tauri
 * Fonte: D:\Projetos em Andamentos\Controle de Estoque TI\controle-estoque-tauri - Projeto
 */
import { useState, useEffect, useMemo, useCallback } from 'react'
import { Printer, Settings } from 'lucide-react'
import Layout from '../components/Layout'
import EtiquetaConfig from './etiqueta/components/EtiquetaConfig'
import EtiquetaPreview from './etiqueta/components/EtiquetaPreview'
import ProdutoModal from './etiqueta/components/ProdutoModal'
import { api } from '../lib/api'

const TAMANHO_PAPEL = {
  a4: { nome: 'A4', largura: 210, altura: 297 },
}

const TAMANHO_ETIQUETA = {
  pequeno: { largura: 50, altura: 25 },
  medio: { largura: 70, altura: 35 },
  grande: { largura: 100, altura: 50 },
  custom: { largura: 50, altura: 25 },
}

const PRESETS = [
  { nome: 'Etiqueta Padrão', icone: '📦', formato: 'medio', papel: 'a4', colunas: 3, margemSup: 5, margemEsq: 5, margemDir: 5, margemInf: 5, espacoH: 0, espacoV: 0, campos: ['codigo', 'produto', 'marca', 'modelo', 'marcaEtiqueta'], mostrarBarra: false, borda: { ativa: false, estilo: 'dashed', largura: 0.2, cor: '#ccc' }, posicoes: { codigo: { top: 2, left: 1 }, produto: { top: 6, left: 1 }, marca: { top: 14, left: 1 }, modelo: { top: 18, left: 1 }, marcaEtiqueta: { top: 22, left: 1 }, barra: { top: 60, left: 1 } }, negritos: { codigo: false, produto: true, marca: false, modelo: false, marcaEtiqueta: false }, tamanhos: { codigo: 2.1, produto: 2.8, marca: 1.8, modelo: 1.4, marcaEtiqueta: 1.4, alturaBarra: 10 } },
  { nome: 'Com Código de Barras', icone: '📊', formato: 'medio', papel: 'a4', colunas: 2, margemSup: 5, margemEsq: 8, margemDir: 8, margemInf: 5, espacoH: 5, espacoV: 3, campos: ['codigo', 'produto', 'marca', 'modelo', 'marcaEtiqueta'], mostrarBarra: true, borda: { ativa: true, estilo: 'solid', largura: 0.2, cor: '#333' }, posicoes: { codigo: { top: 2, left: 1 }, produto: { top: 5, left: 1 }, marca: { top: 10, left: 1 }, modelo: { top: 14, left: 1 }, marcaEtiqueta: { top: 18, left: 1 }, barra: { top: 20, left: 1 } }, negritos: { codigo: true, produto: true, marca: false, modelo: false, marcaEtiqueta: false }, tamanhos: { codigo: 2.5, produto: 2.8, marca: 1.8, modelo: 1.4, marcaEtiqueta: 1.4, alturaBarra: 8 } },
  { nome: 'Etiqueta Grande', icone: '🏷️', formato: 'grande', papel: 'a4', colunas: 2, margemSup: 8, margemEsq: 8, margemDir: 8, margemInf: 8, espacoH: 5, espacoV: 5, campos: ['codigo', 'produto', 'marca', 'modelo', 'marcaEtiqueta'], mostrarBarra: true, borda: { ativa: true, estilo: 'dashed', largura: 0.2, cor: '#666' }, posicoes: { codigo: { top: 3, left: 2 }, produto: { top: 8, left: 2 }, marca: { top: 18, left: 2 }, modelo: { top: 24, left: 2 }, marcaEtiqueta: { top: 30, left: 2 }, barra: { top: 35, left: 2 } }, negritos: { codigo: false, produto: true, marca: false, modelo: false, marcaEtiqueta: false }, tamanhos: { codigo: 2.8, produto: 4.2, marca: 2.5, modelo: 2.1, marcaEtiqueta: 1.8, alturaBarra: 12 } },
  { nome: 'Rolo Térmico', icone: '🧾', formato: 'medio', papel: 'a4', colunas: 1, margemSup: 2, margemEsq: 2, margemDir: 2, margemInf: 2, espacoH: 0, espacoV: 0, campos: ['codigo', 'produto', 'marca', 'modelo', 'marcaEtiqueta'], mostrarBarra: true, borda: { ativa: false, estilo: 'solid', largura: 0.2, cor: '#ccc' }, posicoes: { codigo: { top: 2, left: 1 }, produto: { top: 6, left: 1 }, marca: { top: 12, left: 1 }, modelo: { top: 16, left: 1 }, marcaEtiqueta: { top: 20, left: 1 }, barra: { top: 22, left: 1 } }, negritos: { codigo: false, produto: true, marca: false, modelo: false, marcaEtiqueta: false }, tamanhos: { codigo: 2.1, produto: 2.8, marca: 1.8, modelo: 1.4, marcaEtiqueta: 1.4, alturaBarra: 10 } },
]

function loadAutosave() {
  try { const a = localStorage.getItem('etq_autosave'); return a ? JSON.parse(a) : null } catch { return null }
}

export default function Etiquetas() {
  const saved = loadAutosave()

  const [produtos, setProdutos] = useState([] as any[])
  const [selecionados, setSelecionados] = useState([] as number[])
  const [quantidades, setQuantidades] = useState({} as Record<number, number>)

  const [papel, setPapel] = useState(saved?.papel ?? 'a4')
  const [formato, setFormato] = useState(saved?.formato ?? 'medio')
  const [largura, setLargura] = useState(saved?.largura ?? 70)
  const [altura, setAltura] = useState(saved?.altura ?? 35)
  const [margemSup, setMargemSup] = useState(saved?.margemSup ?? 5)
  const [margemEsq, setMargemEsq] = useState(saved?.margemEsq ?? 5)
  const [margemDir, setMargemDir] = useState(saved?.margemDir ?? 5)
  const [margemInf, setMargemInf] = useState(saved?.margemInf ?? 5)
  const [colunas, setColunas] = useState(saved?.colunas ?? 3)
  const [espacoH, setEspacoH] = useState(saved?.espacoH ?? 0)
  const [espacoV, setEspacoV] = useState(saved?.espacoV ?? 0)
  const [inicioLinha, setInicioLinha] = useState(saved?.inicioLinha ?? 1)

  const [campos, setCampos] = useState(saved?.campos ?? ['codigo', 'produto', 'marca', 'modelo', 'marcaEtiqueta'])
  const [mostrarBarra, setMostrarBarra] = useState(saved?.mostrarBarra ?? false)
  const [borda, setBorda] = useState(saved?.borda ?? { ativa: false, estilo: 'dashed', largura: 0.2, cor: '#ccc' })

  const [tamanhoProd, setTamanhoProd] = useState(saved?.tamanhoProd ?? 2.8)
  const [tamanhoCod, setTamanhoCod] = useState(saved?.tamanhoCod ?? 2.1)
  const [tamanhoMarca, setTamanhoMarca] = useState(saved?.tamanhoMarca ?? 1.8)
  const [tamanhoModelo, setTamanhoModelo] = useState(saved?.tamanhoModelo ?? 1.4)
  const [tamanhoMarcaEtq, setTamanhoMarcaEtq] = useState(saved?.tamanhoMarcaEtq ?? 1.4)
  const [alturaBarra, setAlturaBarra] = useState(saved?.alturaBarra ?? 10)
  const [posicoes, setPosicoes] = useState(saved?.posicoes ?? {
    codigo: { top: 2, left: 1 }, produto: { top: 6, left: 1 }, marca: { top: 14, left: 1 },
    modelo: { top: 18, left: 1 }, marcaEtiqueta: { top: 22, left: 1 }, barra: { top: 60, left: 1 },
  })
  const [negritos, setNegritos] = useState(saved?.negritos ?? {
    codigo: false, produto: true, marca: false, modelo: false, marcaEtiqueta: false,
  })
  const [alinhamentoH, setAlinhamentoH] = useState(saved?.alinhamentoH ?? 'center')
  const [alinhamentoV, setAlinhamentoV] = useState(saved?.alinhamentoV ?? 'start')
  const [pagina, setPagina] = useState(1)
  const [folhaUnica, setFolhaUnica] = useState(saved?.folhaUnica ?? true)
  const [etiquetasIndividuais, setEtiquetasIndividuais] = useState(saved?.etiquetasIndividuais ?? {})
  const [_expandedIndividual, setExpandedIndividual] = useState(new Set<number>())

  const [carregando, setCarregando] = useState(true)
  const [buscaPreview, setBuscaPreview] = useState('')
  const [_perfis, setPerfis] = useState<any[]>([])
  const [_nomePerfil, _setNomePerfil] = useState('')
  const [mostrarConfig, setMostrarConfig] = useState(true)
  const [copiadoPreset, setCopiadoPreset] = useState<string | null>(null)
  const [zoom, setZoom] = useState(1)
  const [mostrarModalProdutos, setMostrarModalProdutos] = useState(false)

  const [secoesAbertas, setSecoesAbertas] = useState<Record<string, boolean>>({
    presets: false, perfis: false, papelFormato: false,
    layout: false, campos: false, posicaoFolha: false, posicoes: false, tamanhos: false, individual: false,
  })
  const toggleSecao = useCallback((key: string) => {
    setSecoesAbertas(prev => ({ ...prev, [key]: !prev[key] }))
  }, [])

  // Auto-save
  useEffect(() => {
    if (carregando) return
    const t = setTimeout(() => {
      localStorage.setItem('etq_autosave', JSON.stringify({
        papel, formato, largura, altura, margemSup, margemEsq, margemDir, margemInf,
        colunas, espacoH, espacoV, inicioLinha, campos, mostrarBarra, borda,
        tamanhoProd, tamanhoCod, tamanhoMarca, tamanhoModelo, tamanhoMarcaEtq, alturaBarra,
        posicoes, negritos, alinhamentoH, alinhamentoV, folhaUnica, etiquetasIndividuais,
      }))
    }, 300)
    return () => clearTimeout(t)
  }, [papel, formato, largura, altura, margemSup, margemEsq, margemDir, margemInf,
      colunas, espacoH, espacoV, inicioLinha, campos, mostrarBarra, borda,
      tamanhoProd, tamanhoCod, tamanhoMarca, tamanhoModelo, tamanhoMarcaEtq, alturaBarra,
      posicoes, negritos, alinhamentoH, alinhamentoV, folhaUnica, carregando, etiquetasIndividuais])

  // Load data
  useEffect(() => {
    Promise.all([
      api.produtos.list(),
      Promise.resolve(localStorage.getItem('etq_perfis'))
    ]).then(([d, salvos]) => {
      setProdutos(d)
      setSelecionados([])
      if (salvos) setPerfis(JSON.parse(salvos))
      setCarregando(false)
    }).catch(() => setCarregando(false))
  }, [])

  // Derived
  const cfg = useMemo(() => {
    const base = formato === 'custom' ? { largura, altura } : (TAMANHO_ETIQUETA as any)[formato]
    const papelCfg = (TAMANHO_PAPEL as any)[papel]
    return { ...base, papelLargura: papelCfg.largura, papelAltura: papelCfg.altura }
  }, [formato, largura, altura, papel])

  const listaEtq = useMemo(() => {
    const lista: any[] = []
    let uid = 0
    selecionados.forEach(id => {
      const prod = produtos.find(p => p.id === id)
      if (prod) {
        const qtd = quantidades[id] || 1
        for (let i = 0; i < qtd; i++) lista.push({ ...prod, uid: uid++, quantidade: qtd, idx: i })
      }
    })
    return lista
  }, [selecionados, produtos, quantidades])

  const etqPorPagina = useMemo(() => {
    if (papel === 'rollo') return 1
    const areaUtil = cfg.papelAltura - margemSup - margemInf
    const linhas = Math.floor(areaUtil / (cfg.altura + espacoV))
    return Math.max(1, linhas * colunas - (inicioLinha - 1) * colunas)
  }, [papel, cfg, margemSup, margemInf, espacoV, colunas, inicioLinha])

  const totalPaginas = Math.max(1, Math.ceil(listaEtq.length / etqPorPagina))

  const toggleCampo = (c: string) => setCampos((p: string[]) => p.includes(c) ? p.filter((x: string) => x !== c) : [...p, c])

  // Presets
  const aplicarPreset = (preset: typeof PRESETS[number]) => {
    setFormato(preset.formato); setPapel(preset.papel); setColunas(preset.colunas)
    setMargemSup(preset.margemSup); setMargemEsq(preset.margemEsq); setMargemDir(preset.margemDir); setMargemInf(preset.margemInf)
    setEspacoH(preset.espacoH); setEspacoV(preset.espacoV); setCampos([...preset.campos])
    setMostrarBarra(preset.mostrarBarra); setBorda({ ...preset.borda }); setPosicoes({ ...preset.posicoes })
    setNegritos({ ...preset.negritos }); setTamanhoProd(preset.tamanhos.produto); setTamanhoCod(preset.tamanhos.codigo)
    setTamanhoMarca(preset.tamanhos.marca); setTamanhoModelo(preset.tamanhos.modelo); setAlturaBarra(preset.tamanhos.alturaBarra)
    setCopiadoPreset(preset.nome); setTimeout(() => setCopiadoPreset(null), 1500)
  }

  // Limpar
  const limpar = () => {
    setSelecionados([]); setQuantidades({})
    setFormato('medio'); setLargura(70); setAltura(35); setMargemSup(5); setMargemEsq(5); setMargemDir(5); setMargemInf(5)
    setColunas(3); setEspacoH(0); setEspacoV(0); setInicioLinha(1); setCampos(['codigo', 'produto', 'marca', 'modelo', 'marcaEtiqueta'])
    setMostrarBarra(false); setBorda({ ativa: false, estilo: 'dashed', largura: 0.2, cor: '#ccc' }); setTamanhoProd(2.8); setTamanhoCod(2.1)
    setTamanhoMarca(1.8); setTamanhoModelo(1.4); setTamanhoMarcaEtq(1.4); setAlturaBarra(10)
    setPosicoes({ codigo: { top: 2, left: 1 }, produto: { top: 6, left: 1 }, marca: { top: 14, left: 1 }, modelo: { top: 18, left: 1 }, marcaEtiqueta: { top: 22, left: 1 }, barra: { top: 60, left: 1 } })
    setNegritos({ codigo: false, produto: true, marca: false, modelo: false, marcaEtiqueta: false })
    setAlinhamentoH('center'); setAlinhamentoV('start')
    setEtiquetasIndividuais({}); setExpandedIndividual(new Set())
  }

  // Etiquetas por página
  const etiquetasPagina = useMemo(() => {
    const slice = listaEtq.slice((pagina - 1) * etqPorPagina, pagina * etqPorPagina)
    if (!buscaPreview.trim()) return slice
    const q = buscaPreview.toLowerCase()
    return slice.filter((p: any) => (p.nome?.toLowerCase() || '').includes(q) || (p.codigo?.toLowerCase() || '').includes(q) || (p.marca?.toLowerCase() || '').includes(q) || (p.modelo?.toLowerCase() || '').includes(q))
  }, [listaEtq, pagina, etqPorPagina, buscaPreview])

  const todasPaginas = useMemo(() => {
    const paginas: any[][] = []
    for (let i = 0; i < totalPaginas; i++) paginas.push(listaEtq.slice(i * etqPorPagina, (i + 1) * etqPorPagina))
    return paginas
  }, [listaEtq, totalPaginas, etqPorPagina])

  // Print
  const handlePrint = () => {
    const area = document.getElementById('area')
    if (!area) return
    const html = area.innerHTML
    const bordaPrint = borda.ativa ? `${borda.largura}mm ${borda.estilo} ${borda.cor}` : '0.05mm solid #e2e8f0'
    const css = `
      @page{margin:0;size:A4 portrait}
      *{-webkit-print-color-adjust:exact;print-color-adjust:exact;color-adjust:exact}
      body{margin:0;padding:0}
      .folha{page-break-after:${folhaUnica ? 'always' : 'auto'};position:relative;background:#fff}
      .folha:last-child{page-break-after:auto}
      .folha .info-label{position:absolute;top:1mm;right:2mm;font-size:8px;color:#94a3b8;font-family:sans-serif}
      .etq-grid{display:grid;grid-template-columns:repeat(${colunas},${cfg.largura}mm);grid-template-rows:repeat(auto,${cfg.altura}mm);gap:${espacoV}mm ${espacoH}mm;
        padding:${margemSup}mm ${margemDir}mm ${margemInf}mm ${margemEsq}mm;
        box-sizing:border-box;width:${cfg.papelLargura}mm;height:${cfg.papelAltura}mm;margin:0 auto;
        justify-content:${alinhamentoH === 'center' ? 'center' : alinhamentoH === 'right' ? 'end' : 'start'};
        align-content:${alinhamentoV === 'center' ? 'center' : alinhamentoV === 'end' ? 'end' : 'start'}}
      .etq-item{width:${cfg.largura}mm;height:${cfg.altura}mm;position:relative;background:#fff;border:${bordaPrint};box-sizing:border-box;overflow:hidden}
      .etq-item p{margin:0;padding:0;line-height:1.3;letter-spacing:0.02em;font-family:sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .etq-item svg{display:block}
    `
    const fullHtml = `<!DOCTYPE html><html><head><style>${css}</style></head><body>${html}</body></html>`
    const iframe = document.createElement('iframe')
    iframe.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;border:none;z-index:999999;background:transparent'
    document.body.appendChild(iframe)
    const d = iframe.contentWindow?.document
    if (d) {
      d.open(); d.write(fullHtml); d.close()
      const w = iframe.contentWindow
      w?.focus(); w?.print()
      iframe.style.visibility = 'hidden'
      const r = () => { if (iframe.parentNode) document.body.removeChild(iframe) }
      if (w) w.onafterprint = r
      setTimeout(r, 500)
    }
  }

  return (
    <Layout title="Etiquetas" subtitle="Impressão de etiquetas de produtos">
      <style>{`@media screen { #area{display:none} }`}</style>
      {carregando ? (
        <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>
      ) : (
        <div className="h-screen flex flex-col bg-slate-100">
          <header className="bg-white border-b border-slate-200 px-4 py-2 flex items-center justify-between shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-rose-500 to-pink-600 flex items-center justify-center"><Printer size={16} className="text-white" /></div>
              <div>
                <h1 className="text-sm font-bold text-slate-800">Impressão de Etiquetas</h1>
                <p className="text-[11px] text-slate-500">{listaEtq.length} etiquetas · {totalPaginas} pág · {cfg.largura}×{cfg.altura}mm</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1.5 text-xs text-slate-600 bg-slate-50 px-2.5 py-1.5 rounded-lg cursor-pointer hover:bg-slate-100 border border-slate-200">
                <input type="checkbox" checked={folhaUnica} onChange={e => setFolhaUnica(e.target.checked)} className="rounded w-3.5 h-3.5 text-blue-600" />
                <span className="font-medium">1 página</span>
              </label>
              <button onClick={handlePrint} className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-rose-600 to-pink-600 text-white rounded-lg font-medium text-sm hover:from-rose-700 hover:to-pink-700 shadow-sm">
                <Printer size={15} /> Imprimir
              </button>
            </div>
          </header>

          <div className="flex-1 flex overflow-hidden">
            {mostrarConfig && (
              <EtiquetaConfig
                secoesAbertas={secoesAbertas} toggleSecao={toggleSecao}
                mostrarConfig={mostrarConfig} setMostrarConfig={setMostrarConfig}
                cfg={cfg} papel={papel} setPapel={setPapel} formato={formato} setFormato={setFormato}
                largura={largura} setLargura={setLargura} altura={altura} setAltura={setAltura}
                margemSup={margemSup} setMargemSup={setMargemSup} margemEsq={margemEsq} setMargemEsq={setMargemEsq}
                margemDir={margemDir} setMargemDir={setMargemDir} margemInf={margemInf} setMargemInf={setMargemInf}
                colunas={colunas} setColunas={setColunas} espacoH={espacoH} setEspacoH={setEspacoH}
                espacoV={espacoV} setEspacoV={setEspacoV} inicioLinha={inicioLinha} setInicioLinha={setInicioLinha}
                campos={campos} toggleCampo={toggleCampo} mostrarBarra={mostrarBarra} setMostrarBarra={setMostrarBarra}
                borda={borda} setBorda={setBorda}
                tamanhoProd={tamanhoProd} setTamanhoProd={setTamanhoProd} tamanhoCod={tamanhoCod} setTamanhoCod={setTamanhoCod}
                tamanhoMarca={tamanhoMarca} setTamanhoMarca={setTamanhoMarca} tamanhoModelo={tamanhoModelo} setTamanhoModelo={setTamanhoModelo}
                alturaBarra={alturaBarra} setAlturaBarra={setAlturaBarra}
                posicoes={posicoes} setPosicoes={setPosicoes}
                alinhamentoH={alinhamentoH} setAlinhamentoH={setAlinhamentoH} alinhamentoV={alinhamentoV} setAlinhamentoV={setAlinhamentoV}
                etqPorPagina={etqPorPagina} totalPaginas={totalPaginas}
                PRESETS={PRESETS}
                copiadoPreset={copiadoPreset} aplicarPreset={aplicarPreset}
                selecionados={selecionados} setMostrarModalProdutos={setMostrarModalProdutos}
                limpar={limpar}
              />
            )}

            {mostrarModalProdutos && (
              <ProdutoModal
                produtos={produtos} selecionados={selecionados} setSelecionados={setSelecionados}
                quantidades={quantidades} setQuantidades={setQuantidades}
                cfg={cfg} campos={campos} mostrarBarra={mostrarBarra}
                onClose={() => setMostrarModalProdutos(false)}
              />
            )}

            {!mostrarConfig && (
              <button onClick={() => setMostrarConfig(true)} className="fixed right-4 top-24 bg-blue-600 hover:bg-blue-700 text-white p-3 rounded-full shadow-lg" title="Configurações">
                <Settings size={20} />
              </button>
            )}

            <EtiquetaPreview
              cfg={cfg} colunas={colunas} espacoH={espacoH} espacoV={espacoV}
              margemSup={margemSup} margemEsq={margemEsq} margemDir={margemDir} margemInf={margemInf}
              pagina={pagina} setPagina={setPagina} totalPaginas={totalPaginas}
              etqPorPagina={etqPorPagina} papel={papel} zoom={zoom} setZoom={setZoom}
              buscaPreview={buscaPreview} setBuscaPreview={setBuscaPreview}
              etiquetasPagina={etiquetasPagina} todasPaginas={todasPaginas}
              inicioLinha={inicioLinha} alinhamentoH={alinhamentoH} alinhamentoV={alinhamentoV}
              campos={campos} mostrarBarra={mostrarBarra} borda={borda}
              posicoes={posicoes} negritos={negritos}
              tamanhoProd={tamanhoProd} tamanhoCod={tamanhoCod} tamanhoMarca={tamanhoMarca}
              tamanhoModelo={tamanhoModelo} tamanhoMarcaEtq={tamanhoMarcaEtq} alturaBarra={alturaBarra}
              etiquetasIndividuais={etiquetasIndividuais} TAMANHO_PAPEL={TAMANHO_PAPEL}
            />
          </div>
        </div>
      )}
    </Layout>
  )
}
