"use client"; // Error components must be Client Components

import React, { useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { AlertTriangle } from 'lucide-react';

export default function AdminDashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error("Erro na página Admin Dashboard:", error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-200px)] text-center p-4">
      <AlertTriangle className="h-16 w-16 text-destructive mb-4" />
      <h2 className="text-2xl font-semibold text-destructive mb-2">Oops! Algo deu errado.</h2>
      <p className="text-muted-foreground mb-6">
        Não foi possível carregar os dados do dashboard. Por favor, tente novamente.
      </p>
      {error?.message && (
        <p className="text-sm text-muted-foreground bg-muted p-2 rounded-md mb-4">
          Detalhes do erro: {error.message}
        </p>
      )}
      <Button
        onClick={
          // Attempt to recover by trying to re-render the segment
          () => reset()
        }
      >
        Tentar Novamente
      </Button>
    </div>
  );
}
