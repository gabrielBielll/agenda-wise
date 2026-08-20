import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth";

// Arquivo de rota do App Router: só handlers podem ser exportados daqui.
// A configuração está em @/lib/auth.
const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
