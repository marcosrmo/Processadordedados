import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CheckCircle2, AlertTriangle, XCircle, Search } from "lucide-react";

interface ColumnMapping {
  id: string;
  sheetId: string;
  originalColumnName: string;
  columnIndex: number;
  mappedFieldName: string | null;
  displayName: string | null;
  detectionMethod: string;
  confidence: number;
  sampleValues: string[];
}

export default function Analysis() {
  const [mappings, setMappings] = useState<ColumnMapping[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMappings();
  }, []);

  const fetchMappings = async () => {
    try {
      const response = await fetch('/api/analysis/mappings');
      if (response.ok) {
        const data = await response.json();
        setMappings(data.mappings);
      }
    } catch (error) {
      console.error('Error fetching mappings:', error);
    } finally {
      setLoading(false);
    }
  };

  const groupedMappings = mappings.reduce((acc, mapping) => {
    const field = mapping.mappedFieldName || 'unmapped';
    if (!acc[field]) {
      acc[field] = [];
    }
    acc[field].push(mapping);
    return acc;
  }, {} as Record<string, ColumnMapping[]>);

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 90) return 'text-green-600';
    if (confidence >= 70) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getConfidenceIcon = (confidence: number) => {
    if (confidence >= 90) return <CheckCircle2 size={16} className="text-green-500" />;
    if (confidence >= 70) return <AlertTriangle size={16} className="text-yellow-500" />;
    return <XCircle size={16} className="text-red-500" />;
  };

  const totalColumns = mappings.length;
  const mappedColumns = mappings.filter(m => m.mappedFieldName).length;

  if (loading) {
    return (
      <div className="p-8 h-full flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Carregando análise...</p>
        </div>
      </div>
    );
  }

  if (totalColumns === 0) {
    return (
      <div className="p-8 h-full flex flex-col gap-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">Análise de Estrutura</h1>
            <p className="text-muted-foreground mt-2">Relatório de identificação de colunas e qualidade dos dados.</p>
          </div>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center border-2 border-dashed rounded-lg bg-muted/10 text-muted-foreground">
          <div className="p-4 rounded-full bg-muted/20 mb-4">
            <Search size={32} />
          </div>
          <h3 className="text-lg font-medium">Nenhum dado analisado</h3>
          <p className="text-sm max-w-sm text-center mt-2">Importe arquivos na aba "Importar Arquivos" para visualizar a análise de estrutura aqui.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 h-full flex flex-col gap-6 overflow-hidden">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Análise de Estrutura</h1>
          <p className="text-muted-foreground mt-2">Relatório de identificação de colunas e qualidade dos dados.</p>
        </div>
        <div className="flex gap-2">
          <Badge variant="outline" className="px-4 py-1 text-sm bg-background" data-testid="badge-total-columns">
            Total de Colunas: {totalColumns}
          </Badge>
          <Badge variant="outline" className="px-4 py-1 text-sm bg-background" data-testid="badge-mapped-columns">
            Colunas Mapeadas: {mappedColumns}
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 min-h-0 flex-1">
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle>Padrões Detectados</CardTitle>
            <CardDescription>Campos identificados automaticamente</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Object.entries(groupedMappings)
                .filter(([field]) => field !== 'unmapped')
                .map(([field, fieldMappings]) => {
                  const avgConfidence = fieldMappings.reduce((sum, m) => sum + m.confidence, 0) / fieldMappings.length;
                  return (
                    <div key={field} className="flex items-center justify-between">
                      <span className="text-sm font-medium">
                        {fieldMappings[0]?.displayName || field}
                      </span>
                      <Badge className="bg-green-100 text-green-700 hover:bg-green-200 border-none">
                        {Math.round(avgConfidence)}% Match
                      </Badge>
                    </div>
                  );
                })}
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-3 shadow-sm flex flex-col min-h-0 border-sidebar-border">
          <CardHeader className="flex flex-row items-center justify-between border-b px-6 py-4">
            <div>
              <CardTitle>Mapeamento de Colunas</CardTitle>
              <CardDescription>
                Correspondência entre nomes originais e campos normalizados.
                {mappings.length > 100 && (
                  <span className="ml-1 text-[11px]">(exibindo primeiros 100 de {mappings.length})</span>
                )}
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="p-0 flex-1 min-h-0">
            <ScrollArea className="h-full">
              <Table>
                <TableHeader className="bg-muted/50 sticky top-0 z-10">
                  <TableRow>
                    <TableHead className="w-[200px]">Campo Normalizado</TableHead>
                    <TableHead>Coluna Original</TableHead>
                    <TableHead>Método de Detecção</TableHead>
                    <TableHead>Amostras</TableHead>
                    <TableHead className="text-right">Confiança</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {mappings.slice(0, 100).map((mapping) => (
                    <TableRow key={mapping.id} className="hover:bg-muted/20" data-testid={`row-mapping-${mapping.id}`}>
                      <TableCell className="font-medium flex items-center gap-2">
                        {getConfidenceIcon(mapping.confidence)}
                        <span data-testid={`text-field-${mapping.id}`}>
                          {mapping.displayName || mapping.mappedFieldName || 'Não mapeado'}
                        </span>
                      </TableCell>
                      <TableCell className="text-muted-foreground font-mono text-xs">
                        {mapping.originalColumnName}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="font-mono text-xs font-normal">
                          {mapping.detectionMethod}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                        {mapping.sampleValues.slice(0, 2).join(', ')}
                      </TableCell>
                      <TableCell className="text-right">
                        <span className={`font-bold ${getConfidenceColor(mapping.confidence)}`} data-testid={`text-confidence-${mapping.id}`}>
                          {mapping.confidence}%
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
