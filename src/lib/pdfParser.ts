/**
 * Utilitário para ler PDFs de pedidos e extrair:
 * - Nome da loja
 * - Itens solicitados (produto, descrição, unidade, quantidade, observação)
 */

import * as pdfjsLib from "pdfjs-dist";

// Carrega o worker do pdf.js
if (typeof window !== "undefined" && "Worker" in window) {
  try {
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/build/pdf.worker.min.mjs",
      import.meta.url
    ).toString();
  } catch {
    // Fallback: worker padrão pode não funcionar em alguns contextos
  }
}

export interface ItemExtraido {
  produto: string;
  descricao: string;
  unidade: string;
  quantidade: number;
  observacao: string;
}

export interface ResultadoLeitura {
  loja: string | null;
  solicitante: string | null;
  setor: string | null;
  codigo: string | null;
  numero_pedido: string | null;
  data_pedido: string | null;
  itens: ItemExtraido[];
  rawText?: string;
}

/** Lê um PDF a partir de um ArrayBuffer ou Uint8Array e extrai os dados */
export async function lerPDFdeBytes(data: ArrayBuffer | Uint8Array): Promise<ResultadoLeitura> {
  try {
    const uint8 = data instanceof Uint8Array ? data : new Uint8Array(data);
    const pdf = await pdfjsLib.getDocument({ data: uint8 }).promise;
    let textoCompleto = "";

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      let ultimoY: number | null = null;
      let linhaAtual = "";
      const linhas: string[] = [];
      const rawItems: { y: number; str: string }[] = [];
      for (const item of content.items as any[]) {
        if ("str" in item && item.str.trim()) {
          rawItems.push({ y: Math.round(item.transform?.[5] ?? 0), str: item.str.trim() });
        }
      }
      // Ordena do topo (maior y no PDF) pra base (menor y)
      rawItems.sort((a, b) => b.y - a.y);
      for (const { y, str } of rawItems) {
        if (ultimoY !== null && Math.abs(y - ultimoY) > 2) {
          if (linhaAtual.trim()) linhas.push(linhaAtual.trim());
          linhaAtual = "";
        }
        linhaAtual += (linhaAtual ? "  " : "") + str;
        ultimoY = y;
      }
      if (linhaAtual.trim()) linhas.push(linhaAtual.trim());
      textoCompleto += linhas.join("\n") + "\n";
    }

    return extrairDados(textoCompleto);
  } catch (e) {
    console.error("[pdfParser] Erro ao ler PDF:", e);
    return { loja: null, solicitante: null, setor: null, codigo: null, numero_pedido: null, data_pedido: null, itens: [] };
  }
}

/** Extrai texto bruto do PDF (para debug) */
export async function lerPDFBruto(data: ArrayBuffer | Uint8Array): Promise<string> {
  try {
    const uint8 = data instanceof Uint8Array ? data : new Uint8Array(data);
    const pdf = await pdfjsLib.getDocument({ data: uint8 }).promise;
    let texto = "";
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      for (const item of content.items as any[]) {
        if ("str" in item && item.str.trim()) texto += item.str + "\n";
      }
    }
    return texto;
  } catch { return ""; }
}

/** Campos conhecidos para delimitar valores na mesma linha */
const CAMPOS_CONHECIDOS = [
  "Loja", "Solicitante", "Data", "Setor",
  "Produto", "Unidade", "Qtd em Loja", "Observação",
  "Total", "Quantidade Total", "Gerado",
];

/** Extrai o valor de um campo até o próximo marcador de campo conhecido */
function extrairValor(linha: string, prefixo: string): string {
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const outros = CAMPOS_CONHECIDOS.filter(c => c.toLowerCase() !== prefixo.toLowerCase())
    .map(esc).join("|");
  const re = new RegExp(
    `${esc(prefixo)}:\\s*(.*?)(?:\\s+(?:${outros}):|\\s*$)`,"i"
  );
  const m = linha.match(re);
  if (m) return m[1].trim();
  // fallback: pega tudo após o prefixo (linha simples)
  const fallback = linha.replace(new RegExp(`^${esc(prefixo)}:\\s*`, "i"), "").trim();
  return fallback;
}

/** Extrai loja, solicitante e itens do texto reconhecido */
function extrairDados(texto: string): ResultadoLeitura {
  // Pré-processamento: quebra linhas que contêm múltiplos campos conhecidos
  const linhasBrutas = texto.split("\n").map((l) => l.trim()).filter(Boolean);
  const linhas: string[] = [];
  for (const linha of linhasBrutas) {
    const regex = new RegExp(
      `(?<=^|\\s{2,})(${CAMPOS_CONHECIDOS.map(c => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join("|")}):`,
      "gi"
    );
    const matches = Array.from(linha.matchAll(regex));
    if (matches.length <= 1) {
      linhas.push(linha);
    } else {
      // Divide a linha em várias, uma por campo
      for (let j = 0; j < matches.length; j++) {
        const start = matches[j].index!;
        const end = j + 1 < matches.length ? matches[j + 1].index! : linha.length;
        linhas.push(linha.slice(start, end).trim());
      }
    }
  }

  // Extrai Loja
  let loja: string | null = null;
  for (let i = 0; i < linhas.length; i++) {
    if (/^Loja:/i.test(linhas[i])) {
      loja = extrairValor(linhas[i], "Loja");
      if (loja) break;
    }
  }
  if (!loja) {
    for (let i = 0; i < linhas.length; i++) {
      if (/^Loja$/i.test(linhas[i].trim()) && i + 1 < linhas.length) {
        loja = linhas[i+1].trim();
        break;
      }
    }
  }

  // Extrai Solicitante
  let solicitante: string | null = null;
  for (let i = 0; i < linhas.length; i++) {
    if (/^Solicitante:/i.test(linhas[i])) {
      solicitante = extrairValor(linhas[i], "Solicitante");
      if (solicitante) break;
    }
  }
  if (!solicitante) {
    for (let i = 0; i < linhas.length; i++) {
      if (/^Solicitante$/i.test(linhas[i].trim()) && i + 1 < linhas.length) {
        solicitante = linhas[i+1].trim();
        break;
      }
    }
  }

  // Extrai Setor / Departamento
  let setor: string | null = null;
  for (let i = 0; i < linhas.length; i++) {
    if (/^(Setor|Departamento|Depto|Seção|Seção):/i.test(linhas[i])) {
      setor = extrairValor(linhas[i], linhas[i].split(":")[0]);
      if (setor) break;
    }
  }
  if (!setor) {
    for (let i = 0; i < linhas.length; i++) {
      if (/^(Setor|Departamento|Depto|Seção|Seção)$/i.test(linhas[i].trim()) && i + 1 < linhas.length) {
        setor = linhas[i+1].trim();
        break;
      }
    }
  }

  // Extrai Data
  let data_pedido: string | null = null;
  for (let i = 0; i < linhas.length; i++) {
    if (/^Data:/i.test(linhas[i])) {
      data_pedido = extrairValor(linhas[i], "Data");
      if (data_pedido) break;
    }
  }
  if (!data_pedido) {
    for (let i = 0; i < linhas.length; i++) {
      if (/^Data$/i.test(linhas[i].trim()) && i + 1 < linhas.length) {
        data_pedido = linhas[i+1].trim();
        break;
      }
    }
  }

  const itens = extrairTabela(linhas);

  const prefixo = loja ? loja.split(/\s+/).map(w => w[0]).join('').toUpperCase().substring(0, 5) : 'PED';
  const numero_pedido = prefixo;

  return { loja, solicitante, setor, codigo: null, numero_pedido, data_pedido, itens, rawText: texto };
}

/** Extrai itens da tabela do PDF */
function extrairTabela(linhas: string[]): ItemExtraido[] {
  const itens: ItemExtraido[] = [];
  
  // Formato 1: cabeçalho em várias linhas (Produto, Unidade, Qtd em Loja, Observação)
  let inicioTabela = -1;
  let formatoVertical = false;
  for (let i = 0; i < linhas.length; i++) {
    if (linhas[i].trim() === "Produto" && i + 3 < linhas.length && 
        linhas[i+1].trim() === "Unidade" && linhas[i+3].trim() === "Observação") {
      inicioTabela = i + 4;
      formatoVertical = true;
      break;
    }
  }
  
  // Formato 2: cabeçalho em linha única
  if (inicioTabela < 0) {
    for (let i = 0; i < linhas.length; i++) {
      if (/Produto.*(?:Descriç[ãa]o)?.*(?:Unidade|Und).*(?:Qtd|Quantidade)/i.test(linhas[i]) ||
          /(?:Item|Prod|Código|Material).*[Qq][Tt][Dd].*/i.test(linhas[i])) {
        inicioTabela = i + 1;
        break;
      }
    }
  }
  
  if (inicioTabela < 0) {
    // Fallback: tentar linhas com número+quantidade
    for (const linha of linhas) {
      if (/Total|Loja|Solicitante|Data|Gerado|Página|Rodapé/i.test(linha)) continue;
      const partes = linha.split(/\s{2,}/).filter(Boolean);
      if (partes.length >= 2) {
        const possivelQtd = parseInt(partes[partes.length - 1], 10);
        if (!isNaN(possivelQtd) && possivelQtd > 0) {
          itens.push({
            produto: partes.length > 2 ? partes.slice(0, partes.length - 2).join(" ") : partes[0],
            descricao: "",
            unidade: partes.length > 2 ? partes[partes.length - 2] : "Unidade",
            quantidade: possivelQtd,
            observacao: "",
          });
        }
      }
    }
    return itens;
  }
  
  // Pula linhas extras do cabeçalho
  while (inicioTabela < linhas.length) {
    const l = linhas[inicioTabela].trim();
    if (l === "Produto" || l === "Unidade" || l === "Qtd em Loja" || l === "Observação") {
      inicioTabela++;
    } else {
      break;
    }
  }
  
  // --- Formato Vertical: cada coluna ocupa sua própria linha ---
  // Ex: Produto\nUnidade\nQtd em Loja\nObservação\n<produto>\n<unidade>\n<qtd>\n<obs>\n...
  if (formatoVertical && inicioTabela >= 0) {
    // Verifica se realmente é vertical (linhas seguintes sem 2+ espaços consecutivos)
    let amostrasValidas = 0;
    for (let s = 0; s < 4 && inicioTabela + s < linhas.length; s++) {
      if (!/\s{2,}/.test(linhas[inicioTabela + s])) amostrasValidas++;
    }
    const ehVertical = amostrasValidas >= 3;
    
    if (ehVertical) {
      itens.push(...extrairVertical(linhas, inicioTabela));
      return itens;
    }
  }
  // --- Fim Formato Vertical ---

  // --- Formato Horizontal padrão (tudo na mesma linha) ---
  if (inicioTabela >= 0) {
    for (let i = inicioTabela; i < linhas.length; i++) {
      const linha = linhas[i].trim();
      
      if (/^Total|^Quantidade Total|Gerado em/i.test(linha)) break;
      
      const partes = linha.split(/\s{2,}/).filter(Boolean);
      if (partes.length < 2) continue;

      let produto: string, unidade: string, quantidade: number, observacao: string;

      if (partes.length === 3) {
        produto = partes[0];
        unidade = partes[1];
        quantidade = parseInt(partes[2], 10);
        observacao = "";
      } else if (partes.length >= 4) {
        const ultima = partes[partes.length - 1];
        const temObs = ultima === "-" || isNaN(parseInt(ultima, 10));

        if (temObs) {
          produto = partes.slice(0, partes.length - 3).join(" ");
          unidade = partes[partes.length - 3];
          quantidade = parseInt(partes[partes.length - 2], 10);
          observacao = ultima !== "-" ? ultima : "";
        } else {
          produto = partes.slice(0, partes.length - 2).join(" ");
          unidade = partes[partes.length - 2];
          quantidade = parseInt(ultima, 10);
          observacao = "";
        }
      } else {
        produto = partes[0];
        unidade = "Unidade";
        quantidade = parseInt(partes[1], 10);
        observacao = "";
      }

      if (!isNaN(quantidade) && quantidade > 0 && produto && 
          !/^(Total|Loja|Solicitante|Data|Setor)/i.test(produto)) {
        itens.push({ produto, descricao: "", unidade, quantidade, observacao });
      }
    }
  }
  
  // --- Se ainda não encontrou nada, tenta formato vertical cego ---
  // Útil quando o cabeçalho não foi detectado mas os dados estão em colunas verticais
  if (itens.length === 0) {
    itens.push(...extrairVertical(linhas, 0));
  }

  // --- Último recurso: qualquer linha com número no final ---
  if (itens.length === 0) {
    const rejeitar = /^(Total|Loja|Solicitante|Data|Setor|Produto|Unidade|Qtd|Observação|Gerado|Página|Rodapé|Código)/i;
    for (const linha of linhas) {
      const m = linha.match(/^(.+?)\s+(\d+)\s*$/);
      if (!m) continue;
      const produto = m[1].trim();
      const qtd = parseInt(m[2], 10);
      if (!produto || qtd <= 0 || rejeitar.test(produto)) continue;
      itens.push({ produto, descricao: "", unidade: "Un", quantidade: qtd, observacao: "" });
    }
  }
  
  return itens;
}

/** Extrai itens no formato coluna-por-linha: produto, unidade, quantidade, observação em linhas consecutivas */
function extrairVertical(linhas: string[], inicio: number): ItemExtraido[] {
  const itens: ItemExtraido[] = [];
  const ignorar = /^(Total|Loja|Solicitante|Data|Setor|Produto|Unidade|Qtd|Observação|Gerado|Página|Rodapé|Código)/i;
  for (let i = inicio; i < linhas.length; i++) {
    const linha = linhas[i].trim();
    if (!linha || ignorar.test(linha)) continue;
    // Só números puros (ex: "10", "5") — rejeita "18/07/2026" ou "10kg"
    if (!/^\d+$/.test(linha)) continue;
    const qtd = parseInt(linha, 10);
    if (qtd <= 0) continue;
    if (i < 2) continue;
    let produto = linhas[i - 2]?.trim() || "";
    let unidade = linhas[i - 1]?.trim() || "";
    if (ignorar.test(produto)) continue;
    if (!produto) continue;
    // Se "unidade" parece número ou é muito longo, provavelmente é parte do produto
    if (!isNaN(parseInt(unidade, 10)) || unidade.length > 6) {
      produto = (linhas[i - 2] + " " + linhas[i - 1]).trim();
      unidade = "Un";
    }
    let observacao = "";
    if (i + 1 < linhas.length) {
      const prox = linhas[i + 1].trim();
      if (prox && (isNaN(parseInt(prox, 10)) || prox === "-") && !ignorar.test(prox)) {
        observacao = prox !== "-" ? prox : "";
      }
    }
    itens.push({ produto, descricao: "", unidade: unidade || "Unidade", quantidade: qtd, observacao });
  }
  return itens;
}
