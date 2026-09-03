<template>
  <div class="h-screen flex flex-col bg-slate-100">
    <!-- Header -->
    <header class="bg-white border-b border-slate-200 px-4 py-2 flex items-center justify-between shadow-sm">
      <div class="flex items-center gap-3">
        <div class="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white">🏷️</div>
        <div>
          <h1 class="text-sm font-bold text-slate-800">Etiquetas — Vue.js</h1>
          <p class="text-[11px] text-slate-500">{{ listaEtq.length }} etiquetas · {{ totalPaginas }} pág · {{ cfg.largura }}×{{ cfg.altura }}mm — convertido de React</p>
        </div>
      </div>
      <div class="flex items-center gap-2">
        <span class="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-1 rounded-full">Vue 3 + Vite</span>
        <button @click="handlePrint" class="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">🖨️ Imprimir</button>
      </div>
    </header>

    <div class="flex-1 flex overflow-hidden">
      <!-- Sidebar Config -->
      <div class="w-80 border-r border-slate-200 bg-white flex flex-col overflow-hidden">
        <!-- Selecionar Produtos (topo) -->
        <div class="px-3 py-3 border-b border-slate-100 bg-slate-50/50">
          <div class="text-[10px] text-slate-500 mb-1">{{ selecionados.length }} produto(s) selecionados</div>
          <button @click="mostrarModal=true" class="w-full rounded-lg border border-blue-300 bg-blue-50 px-3 py-2 text-[11px] font-medium text-blue-700 hover:bg-blue-100">📋 Selecionar Produtos</button>
        </div>

        <div class="flex-1 overflow-y-auto">
          <!-- Presets -->
          <div class="border-b border-slate-100">
            <button @click="secoes.presets = !secoes.presets" class="flex w-full items-center justify-between px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
              <span>Presets</span><span>{{ secoes.presets ? '▼' : '▶' }}</span>
            </button>
            <div v-if="secoes.presets" class="px-3 pb-3">
              <div class="grid grid-cols-2 gap-1.5">
                <button v-for="pr in PRESETS" :key="pr.nome" @click="aplicarPreset(pr)" :class="['flex flex-col items-center gap-0.5 rounded-lg border px-2 py-2 text-[10px] hover:border-blue-400 hover:bg-blue-50', copiadoPreset===pr.nome ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-300' : 'border-slate-200']">
                  <span class="text-base">{{ pr.icone }}</span><span class="font-medium">{{ pr.nome }}</span>
                </button>
              </div>
            </div>
          </div>

          <!-- Papel -->
          <div class="border-b border-slate-100">
            <button @click="secoes.papel = !secoes.papel" class="flex w-full items-center justify-between px-3 py-2 text-xs font-semibold hover:bg-slate-50"><span>Papel — só A4</span><span>{{ secoes.papel ? '▼' : '▶' }}</span></button>
            <div v-if="secoes.papel" class="px-3 pb-3">
              <div class="bg-blue-50 border border-blue-200 rounded-lg p-2.5 text-center">
                <div class="text-[11px] font-bold text-blue-700">📄 Folha A4</div><div class="text-[9px] text-blue-600">210 × 297 mm</div>
              </div>
              <div class="grid grid-cols-2 gap-1.5 mt-2">
                <div><label class="text-[10px] font-medium text-slate-500">Largura (mm)</label><input type="number" v-model.number="largura" @input="formato='custom'" class="w-full rounded border border-slate-200 px-2 py-1 text-xs" /></div>
                <div><label class="text-[10px] font-medium text-slate-500">Altura (mm)</label><input type="number" v-model.number="altura" @input="formato='custom'" class="w-full rounded border border-slate-200 px-2 py-1 text-xs" /></div>
              </div>
            </div>
          </div>

          <!-- Layout -->
          <div class="border-b border-slate-100">
            <button @click="secoes.layout = !secoes.layout" class="flex w-full items-center justify-between px-3 py-2 text-xs font-semibold hover:bg-slate-50"><span>Layout</span><span>{{ secoes.layout ? '▼' : '▶' }}</span></button>
            <div v-if="secoes.layout" class="px-3 pb-3 space-y-2">
              <div class="grid grid-cols-2 gap-1.5">
                <div><label class="text-[10px] font-medium">Colunas</label><input type="number" v-model.number="colunas" min="1" class="w-full rounded border px-2 py-1 text-xs" /></div>
                <div><label class="text-[10px] font-medium">Início</label><input type="number" v-model.number="inicioLinha" min="1" class="w-full rounded border px-2 py-1 text-xs" /></div>
                <div><label class="text-[10px] font-medium">Espaço H (mm)</label><input type="number" v-model.number="espacoH" step="0.5" class="w-full rounded border px-2 py-1 text-xs" /></div>
                <div><label class="text-[10px] font-medium">Espaço V (mm)</label><input type="number" v-model.number="espacoV" step="0.5" class="w-full rounded border px-2 py-1 text-xs" /></div>
              </div>
            </div>
          </div>

          <!-- Campos -->
          <div class="border-b border-slate-100">
            <button @click="secoes.campos = !secoes.campos" class="flex w-full items-center justify-between px-3 py-2 text-xs font-semibold hover:bg-slate-50"><span>Campos</span><span>{{ secoes.campos ? '▼' : '▶' }}</span></button>
            <div v-if="secoes.campos" class="px-3 pb-3 space-y-1">
              <label v-for="c in ['codigo','produto','marca','modelo']" :key="c" class="flex items-center gap-2 py-0.5">
                <input type="checkbox" :checked="campos.includes(c)" @change="toggleCampo(c)" class="rounded w-3.5 h-3.5" />
                <span class="text-xs capitalize">{{ c }}</span>
              </label>
              <label class="flex items-center gap-2 py-0.5">
                <input type="checkbox" v-model="mostrarBarra" class="rounded w-3.5 h-3.5" />
                <span class="text-xs">Barcode</span>
              </label>
            </div>
          </div>


        </div>
      </div>

      <!-- Preview -->
      <div class="flex-1 flex flex-col overflow-hidden">
        <div class="bg-white border-b border-slate-200 px-4 py-2 flex items-center justify-between">
          <div class="flex items-center gap-2">
            <span class="text-xs font-semibold">Preview Vue</span>
            <div class="flex items-center gap-1 bg-slate-100 rounded-lg px-2 py-1">
              <button @click="zoom=Math.max(0.3,zoom-0.1)" class="text-slate-500 hover:text-slate-700">−</button>
              <span class="text-[10px] w-10 text-center">{{ Math.round(zoom*100) }}%</span>
              <button @click="zoom=Math.min(3,zoom+0.1)" class="text-slate-500 hover:text-slate-700">+</button>
            </div>
          </div>
          <span class="text-[10px] text-slate-400">{{ pagina }}/{{ totalPaginas }}</span>
        </div>

        <div class="flex-1 overflow-auto bg-slate-100 p-4 flex justify-center">
          <div v-if="listaEtq.length===0" class="flex items-center justify-center h-full text-sm text-slate-400">Selecione produtos para visualizar</div>
          <div v-else :style="{ width: cfg.papelLargura * 96 / 25.4 * zoom + 'px', height: cfg.papelAltura * 96 / 25.4 * zoom + 'px', flexShrink: 0 }">
            <div id="area-vue" class="relative bg-white shadow-lg" :style="{ width: cfg.papelLargura+'mm', height: cfg.papelAltura+'mm', padding: `${margemSup}mm ${margemDir}mm ${margemInf}mm ${margemEsq}mm`, transform: `scale(${zoom})`, transformOrigin: 'top left', boxSizing: 'border-box' }">
              <div :style="{ display: 'grid', gridTemplateColumns: `repeat(${colunas}, ${cfg.largura}mm)`, gap: `${espacoV}mm ${espacoH}mm`, justifyContent: alinhamentoH==='center'?'center':alinhamentoH==='right'?'end':'start', alignContent: alinhamentoV==='center'?'center':alinhamentoV==='end'?'end':'start' }">
                <div v-for="etq in etiquetasPagina" :key="etq.uid" :style="{ width: cfg.largura+'mm', height: cfg.altura+'mm', position: 'relative', background: '#fff', border: bordaCss, boxSizing: 'border-box', overflow: 'hidden' }">
                  <div v-if="mostrarBarra" :style="{ position: 'absolute', top: posicoes.barra.top+'mm', left: posicoes.barra.left+'mm', right: '1mm', height: alturaBarra+'mm', display: 'flex', justifyContent: 'center', alignItems: 'center', background: '#fff', zIndex: 0 }">
                    <svg :ref="el => { if(el) renderBarcode(el, etq.codigo) }" style="display:block;width:auto;max-width:100%;height:100%;background:#fff;"></svg>
                  </div>
                  <p v-if="campos.includes('codigo')" :style="{ position: 'absolute', top: posicoes.codigo.top+'mm', left: posicoes.codigo.left+'mm', fontSize: tamanhoCod+'mm', fontWeight: negritos.codigo?'bold':'normal', zIndex: 2, margin:0, padding:0, lineHeight:1.3, fontFamily:'sans-serif', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }">{{ etq.codigo }}</p>
                  <p v-if="campos.includes('produto')" :style="{ position: 'absolute', top: posicoes.produto.top+'mm', left: posicoes.produto.left+'mm', fontSize: tamanhoProd+'mm', fontWeight: negritos.produto?'bold':'normal', zIndex: 2, margin:0, padding:0, lineHeight:1.3, fontFamily:'sans-serif', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }">{{ etq.nome }}</p>
                  <p v-if="campos.includes('marca')" :style="{ position: 'absolute', top: posicoes.marca.top+'mm', left: posicoes.marca.left+'mm', fontSize: tamanhoMarca+'mm', fontWeight: negritos.marca?'bold':'normal', zIndex: 2, margin:0, padding:0, lineHeight:1.3, fontFamily:'sans-serif', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }">{{ etq.marca || '—' }}</p>
                  <p v-if="campos.includes('modelo')" :style="{ position: 'absolute', top: posicoes.modelo.top+'mm', left: posicoes.modelo.left+'mm', fontSize: tamanhoModelo+'mm', fontWeight: negritos.modelo?'bold':'normal', zIndex: 2, margin:0, padding:0, lineHeight:1.3, fontFamily:'sans-serif', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }">{{ etq.modelo || '—' }}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div v-if="totalPaginas>1" class="bg-white border-t border-slate-200 px-4 py-2 flex items-center justify-center gap-3">
          <button @click="pagina=Math.max(1,pagina-1)" :disabled="pagina===1" class="px-3 py-1 rounded border text-[11px] disabled:opacity-40">Anterior</button>
          <span class="text-[11px]">Página {{ pagina }} de {{ totalPaginas }}</span>
          <button @click="pagina=Math.min(totalPaginas,pagina+1)" :disabled="pagina===totalPaginas" class="px-3 py-1 rounded border text-[11px] disabled:opacity-40">Próxima</button>
        </div>
      </div>
    </div>

    <!-- Modal Produtos -->
    <div v-if="mostrarModal" class="fixed inset-0 z-50 flex items-center justify-center bg-black/40" @click="mostrarModal=false">
      <div class="bg-white rounded-xl shadow-2xl w-[520px] max-h-[80vh] flex flex-col" @click.stop>
        <div class="flex items-center justify-between border-b px-4 py-3">
          <div><h2 class="text-sm font-bold">Selecionar Produtos</h2><p class="text-[10px] text-slate-500">{{ selecionados.length }} selecionados</p></div>
          <button @click="mostrarModal=false" class="text-slate-400 hover:text-slate-600">✕</button>
        </div>
        <div class="px-3 py-2 border-b">
          <input v-model="buscaProd" placeholder="Buscar..." class="w-full pl-3 pr-3 py-1.5 rounded-lg border border-slate-200 text-xs focus:border-blue-400 focus:outline-none" />
        </div>
        <div class="flex-1 overflow-y-auto p-2">
          <label v-for="pr in filtrados" :key="pr.id" :class="['flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer', selecionados.includes(pr.id) ? 'bg-blue-50' : 'hover:bg-slate-50']">
            <input type="checkbox" :checked="selecionados.includes(pr.id)" @change="toggleSelecionado(pr.id)" class="rounded w-4 h-4" />
            <div class="flex-1 min-w-0"><div class="text-xs font-medium truncate">{{ pr.nome }}</div><div class="text-[10px] text-slate-500">{{ pr.codigo }} {{ pr.marca ? '· '+pr.marca : '' }}</div></div>
            <input type="number" :value="quantidades[pr.id] ?? 1" @click.stop @change="e => quantidades[pr.id]=Math.max(1, parseInt(e.target.value)||1)" class="w-14 rounded border px-1.5 py-0.5 text-right text-[11px]" min="1" />
          </label>
        </div>
        <div class="flex items-center justify-between border-t px-4 py-3">
          <span class="text-[10px] text-slate-500">{{ selecionados.length }} selecionados</span>
          <button @click="mostrarModal=false" class="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-xs">Confirmar</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, watch } from 'vue'
import JsBarcode from 'jsbarcode'
import { api } from '../lib/api'

// --- Constantes copiadas do projeto Next.js ---
const TAMANHO_PAPEL = { a4: { nome: 'A4', largura: 210, altura: 297 } }
const TAMANHO_ETIQUETA = { pequeno: { largura: 50, altura: 25 }, medio: { largura: 70, altura: 35 }, grande: { largura: 100, altura: 50 }, custom: { largura: 50, altura: 25 } }
const PRESETS = [
  { nome: 'Etiqueta Padrão', icone: '📦', formato: 'medio', papel: 'a4', colunas: 3, margemSup: 5, margemEsq: 5, margemDir: 5, margemInf: 5, espacoH: 0, espacoV: 0, campos: ['codigo','produto','marca','modelo'], mostrarBarra: false, borda: { ativa: false, estilo: 'dashed', largura: 0.2, cor: '#ccc' }, posicoes: { codigo: {top:2,left:1}, produto:{top:6,left:1}, marca:{top:14,left:1}, modelo:{top:18,left:1}, barra:{top:60,left:1}}, negritos: {codigo:false,produto:true,marca:false,modelo:false}, tamanhos: {codigo:2.1,produto:2.8,marca:1.8,modelo:1.4,alturaBarra:10} },
  { nome: 'Com Código', icone: '📊', formato: 'medio', papel: 'a4', colunas: 2, margemSup: 5, margemEsq: 8, margemDir: 8, margemInf: 5, espacoH: 5, espacoV: 3, campos: ['codigo','produto','marca','modelo'], mostrarBarra: true, borda: { ativa: true, estilo: 'solid', largura: 0.2, cor: '#333' }, posicoes: { codigo:{top:2,left:1}, produto:{top:5,left:1}, marca:{top:10,left:1}, modelo:{top:14,left:1}, barra:{top:20,left:1}}, negritos: {codigo:true,produto:true,marca:false,modelo:false}, tamanhos: {codigo:2.5,produto:2.8,marca:1.8,modelo:1.4,alturaBarra:8} },
]

const produtos = ref([])
const selecionados = ref([])
const quantidades = reactive({})
const papel = ref('a4')
const formato = ref('medio')
const largura = ref(70)
const altura = ref(35)
const margemSup = ref(5), margemEsq = ref(5), margemDir = ref(5), margemInf = ref(5)
const colunas = ref(3), espacoH = ref(0), espacoV = ref(0), inicioLinha = ref(1)
const campos = ref(['codigo','produto','marca','modelo'])
const mostrarBarra = ref(false)
const borda = reactive({ ativa: false, estilo: 'dashed', largura: 0.2, cor: '#ccc' })
const tamanhoProd = ref(2.8), tamanhoCod = ref(2.1), tamanhoMarca = ref(1.8), tamanhoModelo = ref(1.4), alturaBarra = ref(10)
const posicoes = reactive({ codigo:{top:2,left:1}, produto:{top:6,left:1}, marca:{top:14,left:1}, modelo:{top:18,left:1}, barra:{top:20,left:1} })
const negritos = reactive({ codigo:false, produto:true, marca:false, modelo:false })
const alinhamentoH = ref('center'), alinhamentoV = ref('start')
const pagina = ref(1), zoom = ref(1), busca = ref(''), buscaProd = ref('')
const mostrarModal = ref(false)
const secoes = reactive({ presets:true, papel:true, layout:true, campos:true })
const copiadoPreset = ref(null)

const cfg = computed(() => {
  const base = formato.value==='custom' ? { largura: largura.value, altura: altura.value } : TAMANHO_ETIQUETA[formato.value]
  const papelCfg = TAMANHO_PAPEL[papel.value]
  return { ...base, papelLargura: papelCfg.largura, papelAltura: papelCfg.altura }
})
const listaEtq = computed(() => {
  const lista=[]; let uid=0
  selecionados.value.forEach(id=>{
    const prod=produtos.value.find(p=>p.id===id)
    if(prod){ const qtd=quantidades[id]||1; for(let i=0;i<qtd;i++) lista.push({...prod, uid:uid++}) }
  })
  return lista
})
const capTotal = computed(()=>{
  if(papel.value==='rollo') return 1
  const areaUtil=cfg.value.papelAltura - margemSup.value - margemInf.value
  const linhas=Math.max(1,Math.floor(areaUtil/(cfg.value.altura + espacoV.value)))
  const total=linhas*colunas.value
  const skip=Math.max(0,Math.min(total-1,(inicioLinha.value-1)*colunas.value))
  return total - skip
})
const totalPaginas = computed(()=> Math.max(1, Math.ceil(listaEtq.value.length / capTotal.value)))
const etiquetasPagina = computed(()=>{
  const start=(pagina.value-1)*capTotal.value
  let slice=listaEtq.value.slice(start, start+capTotal.value)
  if(!busca.value.trim()) return slice
  const q=busca.value.toLowerCase()
  return slice.filter(p=> (p.nome?.toLowerCase()||'').includes(q) || (p.codigo?.toLowerCase()||'').includes(q))
})
const filtrados = computed(()=>{
  if(!buscaProd.value.trim()) return produtos.value
  const q=buscaProd.value.toLowerCase()
  return produtos.value.filter(p=> (p.nome?.toLowerCase()||'').includes(q) || (p.codigo?.toLowerCase()||'').includes(q))
})
const bordaCss = computed(()=> borda.ativa ? `${borda.largura}mm ${borda.estilo} ${borda.cor}` : '1px solid transparent')

function toggleCampo(c){ campos.value = campos.value.includes(c) ? campos.value.filter(x=>x!==c) : [...campos.value, c] }
function toggleSelecionado(id){
  if(selecionados.value.includes(id)){
    selecionados.value=selecionados.value.filter(x=>x!==id)
    delete quantidades[id]
  } else {
    selecionados.value=[...selecionados.value, id]
    quantidades[id]=quantidades[id]||1
  }
}
function aplicarPreset(pr){
  formato.value=pr.formato; papel.value=pr.papel; colunas.value=pr.colunas
  margemSup.value=pr.margemSup; margemEsq.value=pr.margemEsq; margemDir.value=pr.margemDir; margemInf.value=pr.margemInf
  espacoH.value=pr.espacoH; espacoV.value=pr.espacoV; campos.value=[...pr.campos]
  mostrarBarra.value=pr.mostrarBarra; Object.assign(borda, pr.borda)
  Object.assign(posicoes, pr.posicoes); Object.assign(negritos, pr.negritos)
  tamanhoProd.value=pr.tamanhos.produto; tamanhoCod.value=pr.tamanhos.codigo
  tamanhoMarca.value=pr.tamanhos.marca; tamanhoModelo.value=pr.tamanhos.modelo
  alturaBarra.value=pr.tamanhos.alturaBarra
  copiadoPreset.value=pr.nome; setTimeout(()=>copiadoPreset.value=null,1500)
}
function renderBarcode(el, value){
  try{
    const calcW=()=>{
      const disponivelMm=Math.max(12, cfg.value.largura - (posicoes.barra.left??1) -2)
      const disponivelPx=disponivelMm*3.78
      const modulos=value.length*11+35
      const raw=(disponivelPx-20)/modulos
      if(cfg.value.largura<=30) return Math.max(0.7,Math.min(1.4,raw))
      if(value.length>12) return Math.max(0.9,Math.min(2.0,raw))
      if(value.length>8) return Math.max(1.0,Math.min(2.2,raw))
      return Math.max(1.2,Math.min(2.6,raw))
    }
    const w=calcW()
    const h=Math.round(alturaBarra.value*4.8)
    JsBarcode(el, value, { format:'CODE128', width:w, height:h, fontSize:10, displayValue:false, background:'#FFFFFF', lineColor:'#000000', margin:10, flat:true })
    el.style.backgroundColor='#fff'
  } catch {}
}
function handlePrint(){
  const area=document.getElementById('area-vue')
  if(!area) return
  const html=area.innerHTML
  const css=`@page{margin:0;size:A4 portrait}*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}body{margin:0;padding:0;background:#fff;font-family:sans-serif}.folha{page-break-after:always}.folha:last-child{page-break-after:auto}svg{background:#fff !important;shape-rendering:crispEdges}`
  const fullHtml=`<!DOCTYPE html><html><head><meta charset="utf-8"><style>${css}</style></head><body>${html}</body></html>`
  const win=window.open('','_blank','width=900,height=700')
  if(!win){ const iframe=document.createElement('iframe'); iframe.style.cssText='position:fixed;top:0;left:0;width:100vw;height:100vh;border:none;z-index:999999'; document.body.appendChild(iframe); const d=iframe.contentWindow?.document; if(d){ d.open(); d.write(fullHtml); d.close(); setTimeout(()=>{ iframe.contentWindow?.print(); setTimeout(()=>iframe.remove(),500)},300)} return }
  win.document.open(); win.document.write(fullHtml); win.document.close()
  win.focus(); setTimeout(()=>win.print(),300)
}

onMounted(async()=>{
  try{
    const d=await api.produtos.list()
    produtos.value=d
  } catch {}
})
</script>

<style scoped>
/* Vue SFC - estilos isolados */
</style>
