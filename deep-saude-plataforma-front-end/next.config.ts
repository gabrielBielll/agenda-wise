import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
  /* config options here */
  typescript: {
    // Religado. Estava `true`, e por isso 10 erros de tipo sobreviviam no
    // repositório — entre eles um contador do painel financeiro que ficava
    // permanentemente em zero e quatro definições de tipo apagadas por edições
    // parciais. TypeScript com o build ignorando erros é decoração.
    ignoreBuildErrors: false,
  },
  eslint: {
    // Ainda ignorado: religar isto exige uma passada de limpeza própria, que é
    // trabalho separado. O type check é o que pega bug de verdade.
    ignoreDuringBuilds: true,
  },
  output: 'standalone',
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'placehold.co',
        port: '',
        pathname: '/**',
      },
    ],
  },
  async rewrites() {
    // ⚠️ Estes rewrites NÃO são opcionais: todo o módulo financeiro
    // (FinanceiroClient) chama `/api/agendamentos/...` e `/api/pacientes/...`
    // em caminho relativo. Sem eles, marcar pagamento, marcar repasse e as
    // transferências em lote deixam de funcionar.
    //
    // O destino era `http://localhost:3000` fixo. Em desenvolvimento funciona,
    // porque o backend roda nessa porta; em produção, com frontend e backend em
    // hosts diferentes, todas essas rotas apontavam para lugar nenhum.
    const apiUrl =
      process.env.API_PROXY_TARGET ??
      process.env.NEXT_PUBLIC_API_URL ??
      'http://localhost:3000';

    const rotas = [
      'agendamentos',
      'pacientes',
      'psicologos',
      'prontuarios',
      'bloqueios',
      'usuarios',
      'admin',
      'google',
    ];

    return rotas.map((rota) => ({
      source: `/api/${rota}/:path*`,
      destination: `${apiUrl}/api/${rota}/:path*`,
    }));
  },
};

export default nextConfig;
