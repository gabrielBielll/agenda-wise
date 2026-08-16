import React from "react";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import PlataformaClient, { type Clinica, type Metricas } from "./PlataformaClient";

/**
 * Painel do operador da plataforma.
 *
 * Fica em `/plataforma`, fora de `/admin`, de propósito: o admin administra
 * UMA clínica e este opera a plataforma inteira. São eixos diferentes de
 * autorização — misturar as navegações confunde primeiro quem usa e depois
 * quem escreve o código.
 *
 * A proteção tem duas camadas, e só a segunda é de verdade:
 *  1. o middleware exige sessão, como em qualquer rota (negar por padrão);
 *  2. o backend exige a flag `plataforma_admin` no token, em
 *     `wrap-plataforma-admin`, e devolve 403 `nao_e_operador_da_plataforma`.
 *
 * Por isso esta página não checa papel nenhum: ela pergunta à API e mostra o
 * que a API responder. Uma checagem no cliente daria a impressão de ser a
 * guarda, e guarda que mora no navegador não é guarda.
 */

type Falha = { status: number; code?: string; erro?: string };

async function buscar<T>(caminho: string, token: string): Promise<T | Falha> {
  try {
    const resposta = await fetch(`${process.env.NEXT_PUBLIC_API_URL}${caminho}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!resposta.ok) {
      const corpo = await resposta.json().catch(() => ({}));
      return { status: resposta.status, code: corpo.code, erro: corpo.erro };
    }
    return (await resposta.json()) as T;
  } catch {
    return { status: 0, erro: "Não consegui falar com o servidor." };
  }
}

const falhou = (v: unknown): v is Falha =>
  typeof v === "object" && v !== null && "status" in (v as Record<string, unknown>);

export default async function PaginaDaPlataforma() {
  const session = await getServerSession(authOptions);
  const token = (session as any)?.backendToken;

  if (!token) {
    return <PlataformaClient estado={{ tipo: "sem_sessao" }} />;
  }

  const [metricas, clinicas] = await Promise.all([
    buscar<Metricas>("/api/plataforma/metricas", token),
    buscar<Clinica[]>("/api/plataforma/clinicas", token),
  ]);

  const problema = [metricas, clinicas].find(falhou) as Falha | undefined;

  if (problema) {
    if (problema.status === 403) {
      return <PlataformaClient estado={{ tipo: "nao_e_operador" }} />;
    }
    if (problema.status === 401) {
      return <PlataformaClient estado={{ tipo: "sem_sessao" }} />;
    }
    return (
      <PlataformaClient
        estado={{ tipo: "erro", mensagem: problema.erro || `Erro HTTP ${problema.status}.` }}
      />
    );
  }

  return (
    <PlataformaClient
      estado={{
        tipo: "ok",
        metricas: metricas as Metricas,
        clinicas: clinicas as Clinica[],
      }}
    />
  );
}
