import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Activity, FileText, Users, Database, ArrowRight, Clock, RefreshCw } from "lucide-react";
import { Link } from "wouter";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

interface Stats {
  filesProcessed: number;
  totalFiles: number;
  recordsConsolidated: number;
  totalRows: number;
  dataSizeGB: string;
}

interface ActivityPoint {
  date: string;
  count: number;
  rows: number;
}

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [activity, setActivity] = useState<ActivityPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [dbOk, setDbOk] = useState<boolean | null>(null);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/stats");
      if (response.ok) {
        const data = await response.json();
        setStats(data.stats);
        setDbOk(true);

        // Formata datas para exibição (dd/MM)
        const formatted = (data.recentActivity || []).map((a: ActivityPoint) => ({
          ...a,
          date: new Date(a.date + "T00:00:00").toLocaleDateString("pt-BR", {
            day: "2-digit",
            month: "2-digit",
          }),
        }));
        setActivity(formatted);
      } else {
        setDbOk(false);
      }
    } catch (error) {
      console.error("Error fetching stats:", error);
      setDbOk(false);
    } finally {
      setLoading(false);
    }
  };

  const fmt = (n?: number) =>
    n !== undefined ? n.toLocaleString("pt-BR") : "--";

  return (
    <div className="p-8 space-y-8 h-full overflow-y-auto bg-background/50">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Dashboard</h1>
          <p className="text-muted-foreground mt-2">Visão geral do sistema de consolidação de dados.</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={fetchStats} disabled={loading} className="gap-1">
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            Atualizar
          </Button>
          <Link href="/import">
            <Button size="lg" className="gap-2 shadow-lg hover:shadow-primary/20 transition-all">
              Novo Projeto <ArrowRight size={16} />
            </Button>
          </Link>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="shadow-sm hover:shadow-md transition-shadow border-l-4 border-l-primary">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Arquivos Processados</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {loading ? <span className="text-muted-foreground text-lg">--</span> : fmt(stats?.filesProcessed)}
            </div>
            <p className="text-xs text-muted-foreground">
              {stats && stats.totalFiles > 0
                ? `de ${fmt(stats.totalFiles)} arquivos enviados`
                : "Nenhum arquivo ainda"}
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-sm hover:shadow-md transition-shadow border-l-4 border-l-chart-2">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Registros Consolidados</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {loading ? <span className="text-muted-foreground text-lg">--</span> : fmt(stats?.recordsConsolidated)}
            </div>
            <p className="text-xs text-muted-foreground">
              {stats && stats.recordsConsolidated > 0 ? "Registros únicos no banco" : "Nenhum registro"}
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-sm hover:shadow-md transition-shadow border-l-4 border-l-chart-3">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de Linhas Importadas</CardTitle>
            <Database className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {loading ? <span className="text-muted-foreground text-lg">--</span> : fmt(stats?.totalRows)}
            </div>
            <p className="text-xs text-muted-foreground">
              {stats && Number(stats.dataSizeGB) > 0
                ? `${stats.dataSizeGB} GB processados`
                : "Aguardando dados"}
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-sm hover:shadow-md transition-shadow border-l-4 border-l-chart-4">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Taxa de Consolidação</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {loading ? (
                <span className="text-muted-foreground text-lg">--</span>
              ) : stats && stats.totalRows > 0 ? (
                `${Math.round((stats.recordsConsolidated / stats.totalRows) * 100)}%`
              ) : (
                "--"
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {stats && stats.totalRows > 0
                ? `${fmt(stats.recordsConsolidated)} de ${fmt(stats.totalRows)} linhas`
                : "Aguardando processamento"}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        {/* Gráfico de Atividade Real */}
        <Card className="col-span-4 shadow-sm">
          <CardHeader>
            <CardTitle>Atividade Recente</CardTitle>
            <CardDescription>Arquivos importados nos últimos 30 dias.</CardDescription>
          </CardHeader>
          <CardContent className="pl-2">
            {loading ? (
              <div className="h-[200px] flex items-center justify-center text-muted-foreground">
                <RefreshCw className="animate-spin mr-2" size={16} /> Carregando...
              </div>
            ) : activity.length === 0 ? (
              <div className="h-[200px] flex items-center justify-center text-muted-foreground bg-muted/20 rounded-md border border-dashed">
                <Activity className="mr-2 h-4 w-4" />
                Nenhuma atividade nos últimos 30 dias
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={activity} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={{ fontSize: 12, borderRadius: 8 }}
                    formatter={(value: any, name: string) => [
                      value,
                      name === "count" ? "Arquivos" : "Registros",
                    ]}
                    labelFormatter={(label) => `Data: ${label}`}
                  />
                  <Bar dataKey="count" name="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Status do Sistema */}
        <Card className="col-span-3 shadow-sm">
          <CardHeader>
            <CardTitle>Status do Sistema</CardTitle>
            <CardDescription>Monitoramento em tempo real.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                  <span className="text-sm font-medium">Motor de Processamento</span>
                </div>
                <span className="text-sm text-muted-foreground">Online</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`h-2 w-2 rounded-full ${dbOk === false ? "bg-red-500" : "bg-green-500"}`} />
                  <span className="text-sm font-medium">Banco de Dados</span>
                </div>
                <span className="text-sm text-muted-foreground">
                  {dbOk === false ? "Erro de conexão" : "Supabase (PostgreSQL)"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-green-500" />
                  <span className="text-sm font-medium">Formatos suportados</span>
                </div>
                <span className="text-sm text-muted-foreground">XLSX · XLS · ODS · CSV</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-green-500" />
                  <span className="text-sm font-medium">Capacidade de upload</span>
                </div>
                <span className="text-sm text-muted-foreground">500 MB · 500 arquivos</span>
              </div>

              {stats && (
                <div className="pt-3 border-t space-y-1.5">
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Resumo do Banco</p>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Arquivos no banco</span>
                    <span className="font-medium">{fmt(stats.totalFiles)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Registros únicos</span>
                    <span className="font-medium">{fmt(stats.recordsConsolidated)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Volume total</span>
                    <span className="font-medium">{stats.dataSizeGB} GB</span>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
