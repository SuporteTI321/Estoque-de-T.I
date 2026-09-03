/**
 * LabelCore — Presets do novo sistema
 */
import type { LabelConfig } from './types'

export interface Preset {
  nome: string
  icone: string
  config: Partial<LabelConfig>
}

export const PRESETS: Preset[] = [
  {
    nome: 'Só Barcode 25×10',
    icone: '⚡',
    config: {
      etiqueta: { largura: 25, altura: 10 },
      layout: { colunas: 8, margemSup: 2, margemEsq: 2, margemDir: 2, margemInf: 2, espacoH: 1, espacoV: 1, inicioLinha: 1, alinhamentoH: 'center', alinhamentoV: 'start' },
      campos: {
        codigo: { id: 'codigo', ativo: false, label: 'Código', top: 2, left: 1, fontSize: 2.0, bold: false, color: '#000000', align: 'left' },
        produto: { id: 'produto', ativo: false, label: 'Produto', top: 2, left: 1, fontSize: 2.0, bold: true, color: '#8B0000', align: 'center' },
        marca: { id: 'marca', ativo: false, label: 'Marca', top: 6, left: 1, fontSize: 1.7, bold: false, color: '#8B0000', align: 'center' },
        modelo: { id: 'modelo', ativo: false, label: 'Modelo', top: 6, left: 1, fontSize: 1.7, bold: false, color: '#8B0000', align: 'center' },
        categoria: { id: 'categoria', ativo: false, label: 'Categoria', top: 10, left: 1, fontSize: 1.4, bold: false, color: '#666666', align: 'left' },
        barcode: { id: 'barcode', ativo: false, label: 'Barcode', top: 1, left: 1, fontSize: 10, bold: false, color: '#000000', align: 'center' },
      } as any,
      barcode: { ativo: true, top: 1, left: 1, right: 1, altura: 4, largura: 0 },
      borda: { ativa: false, estilo: 'solid', largura: 0.2, cor: '#cccccc', radius: 0.5 },
    },
  },
  {
    nome: 'Foto Câmera 40×15',
    icone: '📸',
    config: {
      etiqueta: { largura: 40, altura: 15 },
      layout: { colunas: 4, margemSup: 3, margemEsq: 3, margemDir: 3, margemInf: 3, espacoH: 2, espacoV: 2, inicioLinha: 1, alinhamentoH: 'center', alinhamentoV: 'start' },
      campos: {
        codigo: { id: 'codigo', ativo: false, label: 'Código', top: 2, left: 1, fontSize: 2.0, bold: false, color: '#000000', align: 'left' },
        produto: { id: 'produto', ativo: true, label: 'Produto', top: 2, left: 1, fontSize: 3.0, bold: true, color: '#8B0000', align: 'center' },
        marca: { id: 'marca', ativo: false, label: 'Marca', top: 6, left: 1, fontSize: 1.7, bold: false, color: '#8B0000', align: 'center' },
        modelo: { id: 'modelo', ativo: true, label: 'Modelo', top: 6, left: 1, fontSize: 2.5, bold: false, color: '#8B0000', align: 'center' },
        categoria: { id: 'categoria', ativo: false, label: 'Categoria', top: 10, left: 1, fontSize: 1.4, bold: false, color: '#666666', align: 'left' },
        barcode: { id: 'barcode', ativo: false, label: 'Barcode', top: 1, left: 1, fontSize: 10, bold: false, color: '#000000', align: 'center' },
      } as any,
      barcode: { ativo: true, top: 9, left: 1, right: 1, altura: 4, largura: 0 },
      borda: { ativa: true, estilo: 'solid', largura: 0.3, cor: '#000000', radius: 0.5 },
    },
  },
  {
    nome: 'Padrão 50×25',
    icone: '📦',
    config: {
      etiqueta: { largura: 50, altura: 25 },
      layout: { colunas: 4, margemSup: 5, margemEsq: 5, margemDir: 5, margemInf: 5, espacoH: 2, espacoV: 2, inicioLinha: 1, alinhamentoH: 'center', alinhamentoV: 'start' },
      campos: {
        codigo: { id: 'codigo', ativo: true, label: 'Código', top: 2, left: 1, fontSize: 2.1, bold: false, color: '#000000', align: 'left' },
        produto: { id: 'produto', ativo: true, label: 'Produto', top: 6, left: 1, fontSize: 2.8, bold: true, color: '#000000', align: 'left' },
        marca: { id: 'marca', ativo: true, label: 'Marca', top: 14, left: 1, fontSize: 1.8, bold: false, color: '#000000', align: 'left' },
        modelo: { id: 'modelo', ativo: true, label: 'Modelo', top: 18, left: 1, fontSize: 1.4, bold: false, color: '#000000', align: 'left' },
        categoria: { id: 'categoria', ativo: false, label: 'Categoria', top: 22, left: 1, fontSize: 1.4, bold: false, color: '#666666', align: 'left' },
        barcode: { id: 'barcode', ativo: false, label: 'Barcode', top: 1, left: 1, fontSize: 10, bold: false, color: '#000000', align: 'center' },
      } as any,
      barcode: { ativo: false, top: 15, left: 1, right: 1, altura: 7, largura: 0 },
      borda: { ativa: false, estilo: 'dashed', largura: 0.2, cor: '#cccccc', radius: 0 },
    },
  },
]
