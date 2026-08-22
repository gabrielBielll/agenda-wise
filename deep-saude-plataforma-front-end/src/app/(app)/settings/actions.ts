"use server";

import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { authOptions } from "@/lib/auth";

export type OwnProfileResult = {
  success: boolean;
  message?: string;
  profile?: { nome: string; email: string };
};

const displayNameSchema = z.string().trim().min(1, "Informe seu nome.").max(120, "Use no máximo 120 caracteres.");

async function authenticatedRequest(path: string, init?: RequestInit) {
  const session = await getServerSession(authOptions);
  const token = (session as any)?.backendToken;
  if (!token) return null;

  return fetch(`${process.env.NEXT_PUBLIC_API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
      ...init?.headers,
    },
    cache: "no-store",
  });
}

export async function getOwnProfile(): Promise<OwnProfileResult> {
  try {
    const response = await authenticatedRequest("/api/me");
    if (!response) return { success: false, message: "Sua sessão expirou. Entre novamente." };
    const body = await response.json().catch(() => ({}));
    if (!response.ok) return { success: false, message: body.erro || "Não foi possível carregar seu perfil." };
    return { success: true, profile: { nome: body.nome || "", email: body.email || "" } };
  } catch {
    return { success: false, message: "Não foi possível falar com o servidor." };
  }
}

export async function updateOwnProfile(name: string): Promise<OwnProfileResult> {
  const parsed = displayNameSchema.safeParse(name);
  if (!parsed.success) return { success: false, message: parsed.error.issues[0]?.message };

  try {
    const response = await authenticatedRequest("/api/me", {
      method: "PUT",
      body: JSON.stringify({ nome: parsed.data }),
    });
    if (!response) return { success: false, message: "Sua sessão expirou. Entre novamente." };
    const body = await response.json().catch(() => ({}));
    if (!response.ok) return { success: false, message: body.erro || "Não foi possível salvar o nome." };

    revalidatePath("/dashboard");
    revalidatePath("/settings");
    return {
      success: true,
      message: "Seu nome foi atualizado em toda a Agenda Wise.",
      profile: { nome: body.nome || parsed.data, email: body.email || "" },
    };
  } catch {
    return { success: false, message: "Não foi possível falar com o servidor." };
  }
}
