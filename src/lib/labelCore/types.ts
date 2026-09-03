/**
 * LabelCore — Tipos base do novo sistema de etiquetas
 * Sistema criado do zero — configuração completa de campos
 */

export type CampoId = 'codigo' | 'produto' | 'marca' | 'modelo' | 'categoria' | 'barcode'

export interface CampoConfig {
  id: CampoId
  ativo: boolean
  label: string
  top: number // mm
  left: number // mm
  fontSize: number // mm
  bold: boolean
  color: string
  align: 'left' | 'center' | 'right'
  maxWidth?: number // mm, para truncamento
}

export interface BarcodeConfig {
  ativo: boolean
  top: number
  left: number
  right: number // mm da borda direita
  altura: number // mm
  largura: number // 0=auto, >0 manual 0.8-2.6
}

export interface PapelConfig {
  nome: 'A4'
  largura: 210
  altura: 297
}

export interface EtiquetaConfig {
  largura: number // mm
  altura: number // mm
}

export interface LayoutConfig {
  colunas: number
  margemSup: number
  margemEsq: number
  margemDir: number
  margemInf: number
  espacoH: number
  espacoV: number
  inicioLinha: number // 1-based
  alinhamentoH: 'left' | 'center' | 'right'
  alinhamentoV: 'start' | 'center' | 'end'
}

export interface BordaConfig {
  ativa: boolean
  estilo: 'solid' | 'dashed' | 'dotted'
  largura: number // mm
  cor: string
  radius: number // mm
}

export interface LabelConfig {
  etiqueta: EtiquetaConfig
  papel: PapelConfig
  layout: LayoutConfig
  borda: BordaConfig
  campos: Record<CampoId, CampoConfig>
  barcode: BarcodeConfig
}

export interface ProdutoEtiqueta {
  uid: number
  id: number
  codigo: string
  nome: string
  marca?: string | null
  modelo?: string | null
  categoria_nome?: string | null
}

export const DEFAULT_LABEL_CONFIG: LabelConfig = {
  etiqueta: { largura: 25, altura: 10 },
  papel: { nome: 'A4', largura: 210, altura: 297 },
  layout: {
    colunas: 8,
    margemSup: 2,
    margemEsq: 2,
    margemDir: 2,
    margemInf: 2,
    espacoH: 1,
    espacoV: 1,
    inicioLinha: 1,
    alinhamentoH: 'center',
    alinhamentoV: 'start',
  },
  borda: { ativa: false, estilo: 'solid', largura: 0.2, cor: '#cccccc', radius: 0.5 },
  campos: {
    codigo: { id: 'codigo', ativo: false, label: 'Código', top: 2, left: 1, fontSize: 2.0, bold: false, color: '#000000', align: 'left' },
    produto: { id: 'produto', ativo: true, label: 'Produto', top: 2, left: 1, fontSize: 2.0, bold: true, color: '#8B0000', align: 'center' },
    marca: { id: 'marca', ativo: false, label: 'Marca', top: 6, left: 1, fontSize: 1.8, bold: false, color: '#000000', align: 'left' },
    modelo: { id: 'modelo', ativo: true, label: 'Modelo', top: 6, left: 1, fontSize: 1.7, bold: false, color: '#8B0000', align: 'center' },
    categoria: { id: 'categoria', ativo: false, label: 'Categoria', top: 10, left: 1, fontSize: 1.4, bold: false, color: '#666666', align: 'left' },
    barcode: { id: 'barcode', ativo: false, label: 'Barcode', top: 1, left: 1, fontSize: 10, bold: false, color: '#000000', align: 'center' },
  },
  barcode: { ativo: true, top: 1, left: 1, right: 1, altura: 4, largura: 0 },
}

export const CAMPOS_ORDEM: CampoId[] = ['codigo', 'produto', 'marca', 'modelo', 'categoria']
