"use server";

import { z } from "zod";
import { cookies } from "next/headers";
import { jwtDecode } from "jwt-decode";
import { redirect } from "next/navigation";

// Mantemos o schema para consistência e futuras validações no servidor se necessário.
const loginSchema = z.object({
  email: z.string().email({ message: "E-mail inválido." }),
  password: z.string().min(6, { message: "A senha deve ter pelo menos 6 caracteres." }),
  clinicCode: z.string().min(3, { message: "Código da clínica inválido." }),
});

export type LoginFormState = {
  message: string;
  errors?: {
    email?: string[];
    password?: string[];
    clinicCode?: string[];
    _form?: string[];
  };
  success: boolean;
};

interface JwtPayload {
  user_id: string;
  clinica_id: string;
  papel_id: string;
  role: string;
  exp: number;
}

// --- FUNÇÃO DE LOGIN ATUALIZADA PARA CONECTAR COM A API REAL ---
export async function handleLogin(
  prevState: LoginFormState,
  formData: FormData
): Promise<LoginFormState> {
  // 1. Extrair os dados do formulário
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  // 2. Definir a URL da API a partir das variáveis de ambiente
  const apiUrl = `${process.env.NEXT_PUBLIC_API_URL}/api/auth/login`;

  let redirectPath = null;

  // 3. Tentar fazer a chamada à API
  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      // O backend em Clojure espera a chave "senha"
      body: JSON.stringify({ email, senha: password }),
    });

    const data = await response.json();

    // 4. Lidar com a resposta da API
    if (!response.ok) {
      return {
        message: data.erro || "Credenciais inválidas. Verifique seu e-mail e senha.",
        errors: { _form: [data.erro || "Credenciais inválidas."] },
        success: false,
      };
    }

    // 5. Se o login for bem-sucedido, extrair o token e definir o cookie
    const apiToken = data.token;
    if (!apiToken) {
      return { message: "Token de autenticação não recebido do servidor.", success: false };
    }

    // Decodificar o token para saber o papel
    let decoded: JwtPayload;
    try {
      decoded = jwtDecode<JwtPayload>(apiToken);
    } catch (e) {
      console.error("Erro ao decodificar token:", e);
      return { message: "Erro ao processar credenciais.", success: false };
    }

    // Definir cookie genérico para sessão
    cookies().set("sessionToken", apiToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      path: "/",
      sameSite: "lax",
      maxAge: 60 * 60 * 24, // 24 horas
    });

    // Definir redirecionamento baseado no papel
    if (decoded.role === 'admin_clinica') {
      redirectPath = "/admin/dashboard";
    } else {
      // Assumindo psicólogo ou outros
      redirectPath = "/dashboard";
    }

  } catch (error) {
    if (redirectPath) throw error; // Re-throw redirect error which is handled by Next.js
    console.error("Erro de rede ou conexão ao tentar fazer login:", error);
    return {
      message: "Erro de conexão com o servidor. Tente novamente mais tarde.",
      errors: { _form: ["Não foi possível conectar ao servidor de autenticação."] },
      success: false,
    };
  }

  // Executar o redirecionamento fora do bloco try-catch da requisição
  if (redirectPath) {
    redirect(redirectPath);
  }

  return { message: "Login realizado com sucesso!", success: true };
}
