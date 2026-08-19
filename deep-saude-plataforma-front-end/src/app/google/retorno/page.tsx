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
    /*
      Redesign — vocabulário do `8109afc`. Esta rota nasceu ontem e ele nunca a
      viu; o alinhamento é para ela não destoar do resto.

      📌 `soft-icon` para o sucesso e `terra-icon` para a recusa: são as duas
      formas de ícone que ele definiu no `globals.css`, e usá-las evita inventar
      um terceiro tratamento. O vermelho da falha continua por token de estado, e
      não por cor crua, para o modo escuro dele não quebrar.
    */
    <div className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <p className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[.12em] text-muted-foreground">
            <span className="h-px w-6 bg-accent" /> Google Agenda
          </p>
          <CardTitle className="flex items-center gap-3 section-title">
            {desfecho.ok ? (
              <>
                <span className="soft-icon h-10 w-10">
                  <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
                </span>
                Agenda conectada
              </>
            ) : (
              <>
                <span className="terra-icon h-10 w-10">
                  <AlertTriangle className="h-5 w-5" aria-hidden="true" />
                </span>
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
