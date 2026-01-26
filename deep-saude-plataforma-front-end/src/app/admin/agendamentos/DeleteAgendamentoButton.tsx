"use client";

import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import { useTransition } from "react";
import { deleteAgendamento } from "./actions";
import { useToast } from "@/hooks/use-toast";

export function DeleteAgendamentoButton({ id }: { id: string }) {
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();

  const handleDelete = () => {
    if (confirm("Tem certeza que deseja excluir este agendamento?")) {
      startTransition(async () => {
        const result = await deleteAgendamento(id);
        if (result.success) {
          toast({
            title: "Sucesso",
            description: result.message,
            className: "bg-green-500 text-white",
          });
        } else {
          toast({
            title: "Erro",
            description: result.message,
            variant: "destructive",
          });
        }
      });
    }
  };

  return (
    <Button 
      variant="ghost" 
      size="icon" 
      onClick={handleDelete} 
      disabled={isPending}
      className="text-destructive hover:text-destructive/90 hover:bg-destructive/10"
    >
      <Trash2 className="h-4 w-4" />
    </Button>
  );
}
