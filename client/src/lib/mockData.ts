import { useState, useEffect } from "react";

export type FileStatus = "pending" | "processing" | "analyzing" | "completed" | "error";

export interface MockFile {
  id: string;
  name: string;
  size: number;
  type: "xlsx" | "csv" | "xls";
  status: FileStatus;
  progress: number;
  rowCount: number;
  colCount: number;
  uploadedAt: string;
}

export interface CustomerRecord {
  id: string;
  originalSource: string;
  name: string;
  cpf: string;
  phone: string;
  address: string;
  number: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
  ticket: number;
  date: string;
  confidence: number; // 0-100 score of data quality
  status: "valid" | "merged" | "incomplete";
}

const FIRST_NAMES = ["Ana", "Bruno", "Carlos", "Daniela", "Eduardo", "Fernanda", "Gabriel", "Helena", "Igor", "Julia", "Lucas", "Mariana", "Nicolas", "Olivia", "Pedro"];
const LAST_NAMES = ["Silva", "Santos", "Oliveira", "Souza", "Rodrigues", "Ferreira", "Alves", "Pereira", "Lima", "Gomes", "Costa", "Ribeiro", "Martins"];
const CITIES = ["São Paulo", "Rio de Janeiro", "Belo Horizonte", "Curitiba", "Porto Alegre", "Salvador", "Recife", "Fortaleza"];
const STATES = ["SP", "RJ", "MG", "PR", "RS", "BA", "PE", "CE"];
const STREETS = ["Rua das Flores", "Av. Paulista", "Rua Augusta", "Av. Copacabana", "Rua da Praia", "Av. Brasil", "Rua do Comércio"];

export function generateMockFiles(count: number): MockFile[] {
  return Array.from({ length: count }).map((_, i) => ({
    id: `file-${Math.random().toString(36).substr(2, 9)}`,
    name: `vendas_202${3 + (i % 2)}_regiao_${String.fromCharCode(65 + i)}.xlsx`,
    size: Math.floor(Math.random() * 5000000) + 100000,
    type: i % 3 === 0 ? "csv" : "xlsx",
    status: "pending",
    progress: 0,
    rowCount: 0,
    colCount: 0,
    uploadedAt: new Date().toISOString()
  }));
}

export function generateMockData(count: number): CustomerRecord[] {
  return Array.from({ length: count }).map((_, i) => {
    const firstName = FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)];
    const lastName = LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)];
    const cityIndex = Math.floor(Math.random() * CITIES.length);
    
    return {
      id: `rec-${Math.random().toString(36).substr(2, 9)}`,
      originalSource: `vendas_202${3 + (i % 2)}.xlsx`,
      name: `${firstName} ${lastName}`,
      cpf: `${Math.floor(Math.random() * 999)}.${Math.floor(Math.random() * 999)}.${Math.floor(Math.random() * 999)}-${Math.floor(Math.random() * 99)}`,
      phone: `(11) 9${Math.floor(Math.random() * 9999)}-${Math.floor(Math.random() * 9999)}`,
      address: STREETS[Math.floor(Math.random() * STREETS.length)],
      number: `${Math.floor(Math.random() * 2000)}`,
      complement: Math.random() > 0.5 ? `Apto ${Math.floor(Math.random() * 100)}` : "",
      neighborhood: "Centro",
      city: CITIES[cityIndex],
      state: STATES[cityIndex],
      ticket: Math.floor(Math.random() * 1000) + 50,
      date: new Date(2024, Math.floor(Math.random() * 12), Math.floor(Math.random() * 28)).toLocaleDateString('pt-BR'),
      confidence: Math.floor(Math.random() * 30) + 70,
      status: Math.random() > 0.8 ? "merged" : "valid"
    };
  });
}

// Simulation hook
export function useProcessingSimulation() {
  const [step, setStep] = useState(0);
  const [logs, setLogs] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  const steps = [
    "Inicializando motor de processamento Python...",
    "Carregando bibliotecas Pandas e OpenPyXL...",
    "Lendo arquivos e mapeando abas...",
    "Contando colunas e identificando cabeçalhos...",
    "Aplicando Regex para detecção de CPFs e Telefones...",
    "Normalizando endereços e logradouros...",
    "Unificando registros duplicados (Fuzzy Matching)...",
    "Consolidando base de dados SQL...",
    "Gerando relatório final...",
    "Concluído."
  ];

  const startSimulation = () => {
    setIsProcessing(true);
    setStep(0);
    setLogs([]);
  };

  useEffect(() => {
    if (!isProcessing) return;

    if (step < steps.length) {
      const timeout = setTimeout(() => {
        setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${steps[step]}`]);
        setStep(prev => prev + 1);
      }, 1500); // 1.5s per step
      return () => clearTimeout(timeout);
    } else {
      setIsProcessing(false);
    }
  }, [isProcessing, step]);

  return { step, logs, isProcessing, totalSteps: steps.length, startSimulation };
}
