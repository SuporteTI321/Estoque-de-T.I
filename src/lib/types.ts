export interface Loja {
  id: number;
  nome: string;
  codigo: string;
  endereco: string | null;
  contato: string | null;
  ativo: boolean;
}

export interface Categoria {
  id: number;
  nome: string;
  descricao: string | null;
  ativa: boolean;
}

export interface Produto {
  id: number;
  codigo: string;
  nome: string;
  marca: string | null;
  modelo: string | null;
  descricao: string | null;
  categoria_id: number | null;
  categoria_nome: string | null;
  fornecedor_id: number | null;
  fornecedor_nome: string | null;
  unidade: string;
  preco_compra: number;
  preco_venda: number;
  estoque: number;
  estoque_minimo: number;
  ativo: boolean;
  custo_total?: number;
}

export interface Usuario {
  id: number;
  nome: string;
  email: string;
  senha?: string;
  perfil: "admin" | "filial" | "operador" | string;
  loja_id: number | null;
  loja_nome: string | null;
  ativo: boolean;
}

export interface Movimentacao {
  id: number;
  tipo: "entrada" | "saida" | "transferencia" | string;
  produto_id: number;
  produto_nome: string | null;
  produto_codigo?: string;
  quantidade: number;
  loja_origem_id: number | null;
  loja_origem_nome: string | null;
  loja_destino_id: number | null;
  loja_destino_nome: string | null;
  usuario_id: number | null;
  observacao: string | null;
  data_movimento: string;
  preco_compra?: number;
  unidade?: number;
}

export interface Solicitacao {
  id: number;
  loja_id: number;
  loja_nome: string | null;
  usuario_id: number | null;
  usuario_nome: string | null;
  observacao: string | null;
  status: "pendente" | "em_analise" | "aprovado" | "rejeitado" | string;
  data_solicitacao: string;
  total_itens: number | null;
}

export interface SolicitacaoItem {
  id: number;
  solicitacao_id: number;
  produto_id: number;
  produto_nome: string | null;
  produto_codigo: string | null;
  unidade: string | null;
  quantidade: number;
}

export interface Pedido {
  id: number;
  numero: string;
  loja_id: number;
  loja_nome: string | null;
  loja_codigo: string | null;
  solicitante: string;
  setor: string | null;
  origem: string | null;
  status: string;
  arquivo_pdf: string | null;
  data_pedido: string;
}

export interface PedidoItem {
  id: number;
  pedido_id: number;
  produto_id: number;
  produto_nome: string;
  unidade: string;
  quantidade: number;
}

export interface Alerta {
  id: number;
  tipo: string;
  titulo: string;
  mensagem: string;
  data_alerta: string;
  lido: boolean;
}

export interface DashboardStats {
  total_produtos: number;
  itens_estoque: number;
  estoque_baixo: number;
  itens_indisponiveis: number;
  solicitacoes_pendentes: number;
  entradas_mes: number;
  saidas_mes: number;
  valor_total_estoque: number;
}
