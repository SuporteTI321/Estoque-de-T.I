import type { Categoria } from "./types";

export function normCat(s: string): string {
  return s.toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/s+$/, "");
}

export const CATS_PADRAO: Categoria[] = [
  { id: 1, nome: "Material de Escritório", descricao: "Papelaria e materiais administrativos", ativa: true },
  { id: 2, nome: "Material de Limpeza", descricao: "Produtos de higiene e limpeza", ativa: true },
  { id: 3, nome: "Ferramentas", descricao: "Ferramentas manuais e elétricas", ativa: true },
  { id: 4, nome: "Material Elétrico", descricao: "Cabos, disjuntores e componentes elétricos", ativa: true },
  { id: 5, nome: "EPI", descricao: "Equipamentos de proteção individual", ativa: true },
  { id: 6, nome: "Informática", descricao: "Suprimentos e acessórios de informática", ativa: true },
  { id: 7, nome: "Serviços", descricao: "Prestação de serviços terceirizados", ativa: true },
  { id: 8, nome: "Decoração", descricao: "Itens de decoração e ambientação", ativa: true },
  { id: 9, nome: "Utilidades", descricao: "Utensílios e itens diversos", ativa: true },
  { id: 10, nome: "Construção", descricao: "Materiais de construção e reparos", ativa: true },
  { id: 11, nome: "Descartáveis", descricao: "Produtos descartáveis em geral", ativa: true },
  { id: 12, nome: "Diversos", descricao: "Itens não classificados", ativa: true },
  { id: 13, nome: "Automotivo", descricao: "Peças e acessórios automotivos", ativa: true },
  { id: 14, nome: "Móveis", descricao: "Móveis e utensílios para escritório", ativa: true },
  { id: 15, nome: "Vestuário", descricao: "Uniformes e vestuário profissional", ativa: true },
  { id: 16, nome: "Alimentos", descricao: "Alimentos e bebidas em geral", ativa: true },
  { id: 17, nome: "Hidráulico", descricao: "Conexões, tubos, registros e materiais hidráulicos", ativa: true },
  { id: 18, nome: "Embalagem", descricao: "Sacos, fitas, caixas e materiais para embalagem", ativa: true },
  { id: 19, nome: "Copa / Cozinha", descricao: "Utensílios e descartáveis para copa e cozinha", ativa: true },
  { id: 20, nome: "Sinalização", descricao: "Placas, fitas, cones e materiais de sinalização", ativa: true },
  { id: 21, nome: "Manutenção Predial", descricao: "Tintas, massas, cimentos e materiais para manutenção", ativa: true },
  { id: 22, nome: "Proteção e Segurança", descricao: "Extintores, câmeras, alarmes e materiais de segurança patrimonial", ativa: true },
  { id: 23, nome: "Esporte e Lazer", descricao: "Bolas, redes, jogos e materiais esportivos", ativa: true },
  { id: 24, nome: "Didático / Cultural", descricao: "Livros, revistas e material pedagógico", ativa: true },
  { id: 25, nome: "Jardinagem", descricao: "Sementes, adubos, ferramentas e materiais para jardim", ativa: true },
  { id: 26, nome: "Primeiros Socorros", descricao: "Curativos, medicamentos básicos e materiais hospitalares", ativa: true },
  { id: 27, nome: "Fonte Colmeia", descricao: "Fontes de alimentação tipo colmeia para computadores", ativa: true },
  { id: 28, nome: "Produto Fonte Colmeia", descricao: "Produtos relacionados a fontes de alimentação colmeia", ativa: true },
  { id: 29, nome: "Áudio e Vídeo", descricao: "Equipamentos, cabos, microfones e materiais de áudio e vídeo", ativa: true },
  { id: 30, nome: "Eletrônicos", descricao: "Componentes, dispositivos e equipamentos eletrônicos", ativa: true },
  { id: 31, nome: "Cabo de Força de PC", descricao: "Cabos de força, fontes de alimentação e periféricos de PC", ativa: true },
  { id: 32, nome: "Cabo de Força de Impressora", descricao: "Cabos de força e fontes de alimentação para impressoras", ativa: true },
];
