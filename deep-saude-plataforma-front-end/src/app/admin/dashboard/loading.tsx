import React from 'react';
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card"; // CardFooter adicionado aqui

export default function AdminDashboardLoading() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <Skeleton className="h-8 w-3/4 md:w-1/2 mb-2" /> {/* Skeleton para o título h1 */}
        <Skeleton className="h-4 w-1/2 md:w-1/3" />    {/* Skeleton para o parágrafo de descrição */}
      </div>

      {/* Grid para os Skeletons dos StatsCards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, index) => (
          <Card key={index}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <Skeleton className="h-4 w-20" /> {/* Skeleton para o título do card */}
              <Skeleton className="h-5 w-5 rounded-full" /> {/* Skeleton para o ícone */}
            </CardHeader>
            <CardContent>
              <Skeleton className="h-7 w-24 mb-1" /> {/* Skeleton para o valor principal */}
              <Skeleton className="h-3 w-32" />    {/* Skeleton para a descrição do card */}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Placeholders para Gráficos e Tabelas */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-40 mb-1" /> {/* Skeleton para título do gráfico/tabela */}
            <Skeleton className="h-3 w-48" />    {/* Skeleton para descrição do gráfico/tabela */}
          </CardHeader>
          <CardContent>
            <Skeleton className="h-[300px] w-full" /> {/* Skeleton para a área do gráfico/tabela */}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-32 mb-1" />
            <Skeleton className="h-3 w-40" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-[300px] w-full" />
          </CardContent>
        </Card>
      </div>
       {/* Skeleton para o StatsCard adicional de previsão */}
       <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-5 w-5 rounded-full" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-7 w-32 mb-1" />
            </CardContent>
            <CardFooter>
                <Skeleton className="h-3 w-36" />
            </CardFooter>
        </Card>
    </div>
  );
}
