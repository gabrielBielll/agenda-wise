import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { concluirConexaoGoogle } from "./actions";

/**
 * A tela que recebe a volta do Google.
 *
 * ⚠️ **Ela está atrás do middleware de propósito** — não é rota pública. Quem
 * chega aqui vem do Google com o cookie de sessão do app ainda válido, e é esse
 * cookie que autoriza o POST para o backend. Sem sessão não há o que concluir.
 *
 * 📌 **Não redireciona sozinha em caso de erro.** Voltar em silêncio para
 * `/settings` deixaria a pessoa olhando um botão "Conectar" que ela **acabou de
 * clicar**, sem nenhuma pista do que houve — e o modo de falha desta integração
 * já é o silêncio. Cada desfecho tem frase própria.
 */
export const dynamic = "force-dynamic";

export default async function RetornoDoGoogle({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; state?: string; error?: string }>;
}) {
  const { code, state, error } = await searchParams;
  const desfecho = await concluirConexaoGoogle(code, state, error);

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-headline text-2xl">
            {desfecho.ok ? (
              <>
                <CheckCircle2 className="h-6 w-6 text-emerald-600" aria-hidden="true" />
                Agenda conectada
              </>
            ) : (
              <>
                <AlertTriangle className="h-6 w-6 text-red-600" aria-hidden="true" />
                {desfecho.titulo}
              </>
            )}
          </CardTitle>
          <CardDescription>
            {desfecho.ok
              ? "A partir de agora as sessões desta agenda passam a sincronizar."
              : desfecho.detalhe}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <Link href={desfecho.voltarPara}>Voltar</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
