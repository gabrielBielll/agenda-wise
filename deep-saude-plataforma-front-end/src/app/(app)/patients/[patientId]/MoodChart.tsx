"use client";

import React from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp } from "lucide-react";

interface MoodChartProps {
  data: any[];
}

const MOOD_LABELS: Record<number, string> = {
  1: "😢 Deprimido",
  2: "😟 Triste",
  3: "😐 Neutro",
  4: "🙂 Bem",
  5: "😁 Muito Bem"
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const moodValue = payload[0].value;
    return (
      <div className="bg-white dark:bg-gray-950 p-3 border rounded-md shadow-lg text-sm">
        <p className="font-semibold mb-1">{label}</p>
        <p className="text-primary font-medium">
          {MOOD_LABELS[moodValue] || `Nota: ${moodValue}`}
        </p>
        {payload[0].payload.note && (
           <p className="text-gray-500 text-xs italic mt-1 max-w-[200px] truncate">
            {payload[0].payload.note}
           </p>
        )}
      </div>
    );
  }
  return null;
};

export default function MoodChart({ data }: MoodChartProps) {
  // 1. Filtrar apenas registros com humor
  // 2. Ordenar por data da sessão (antigo -> novo) para o gráfico
  const chartData = React.useMemo(() => {
    return data
      .filter((item) => item.humor !== null && item.humor !== undefined)
      .sort((a, b) => {
        // Usar data_sessao se disponível, senão data_registro
        const dateA = a.data_sessao ? new Date(a.data_sessao) : new Date(a.data_registro);
        const dateB = b.data_sessao ? new Date(b.data_sessao) : new Date(b.data_registro);
        return dateA.getTime() - dateB.getTime();
      })
      .map((item) => {
        // Usar data_sessao se disponível, senão data_registro
        const displayDate = item.data_sessao ? new Date(item.data_sessao) : new Date(item.data_registro);
        return {
          date: displayDate.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
          fullDate: displayDate.toLocaleString('pt-BR'),
          humor: item.humor,
          note: item.conteudo || "Sem anotação"
        };
      });
  }, [data]);

  if (chartData.length === 0) {
    return (
      <Card className="shadow-md mt-6">
        <CardHeader>
          <CardTitle className="font-headline text-xl flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            Evolução do Humor
          </CardTitle>
        </CardHeader>
        <CardContent>
           <div className="h-[200px] flex flex-col items-center justify-center text-muted-foreground border-2 border-dashed rounded-md">
              <p>Nenhum dado de humor registrado.</p>
              <p className="text-sm">Registre uma evolução com "Humor" para visualizar o gráfico.</p>
           </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-md mt-6">
      <CardHeader>
        <CardTitle className="font-headline text-xl flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-primary" />
          Evolução do Humor
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={chartData}
              margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-gray-200 dark:stroke-gray-800" />
              <XAxis 
                dataKey="date" 
                tick={{ fontSize: 12 }} 
                tickLine={false} 
                axisLine={false}
                padding={{ left: 20, right: 20 }}
              />
              <YAxis 
                domain={[1, 5]} 
                ticks={[1, 2, 3, 4, 5]} 
                tickFormatter={(value) => {
                    const emojis: Record<number, string> = { 1: "😢", 2: "😟", 3: "😐", 4: "🙂", 5: "😁" };
                    return emojis[value] || value;
                }}
                tick={{ fontSize: 16 }}
                width={40}
                tickLine={false} 
                axisLine={false}
              />
              <Tooltip content={<CustomTooltip />} />
              <Line 
                type="monotone" 
                dataKey="humor" 
                stroke="hsl(var(--primary))" 
                strokeWidth={2} 
                dot={{ r: 4, fill: "hsl(var(--primary))" }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
