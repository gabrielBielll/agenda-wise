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
  /**
   * 🔴 Um BOOLEANO, não o endereço — e a diferença é o ponto (A-024).
   *
   * A tela do admin precisa distinguir *"o backend está fora do ar"* de *"esta
   * build saiu sem endereço nenhum"*, porque a primeira melhora esperando e a
   * segunda **nunca** melhora.
   *
   * ⚠️ **Medido em 19/08, e derrubou o desenho anterior:** eu tinha suposto que
   * o proxy apontando para si mesmo devolveria **404** e que isso identificaria
   * a build incompleta. Os dois casos devolvem **500**:
   *
   * ```
   * proxy -> ele mesmo (sem variável)      500
   * proxy correto, backend fora do ar      500
   * ```
   *
   * Ou seja: a resposta não distingue nada, e a guarda que eu tinha escrito
   * nunca dispararia. O sinal precisa vir do tempo de build — como vinha antes.
   *
   * 📌 **O que muda em relação ao desenho antigo:** antes o cliente lia
   * `NEXT_PUBLIC_API_URL`, e por isso o **endereço** do backend ia no bundle e a
   * porta dele tinha de ficar aberta para a internet. Aqui vai `'1'` ou `''`.
   * O navegador aprende *se* havia endereço, nunca *qual* — e o backend pode
   * viver em rede privada.
   *
   * E cobre as DUAS variáveis: a guarda antiga só olhava uma, e acusaria falta
   * de configuração numa build que tivesse apenas `API_PROXY_TARGET`.
   */
  env: {
    NEXT_PUBLIC_API_CONFIGURADA:
      (process.env.API_PROXY_TARGET ?? process.env.NEXT_PUBLIC_API_URL) ? '1' : '',
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

    return [
      /**
       * 🔴 `health` entra aqui para que o NAVEGADOR pare de falar com o backend
       * direto (A-024).
       *
       * Era a última chamada do cliente que usava `NEXT_PUBLIC_API_URL`, e por
       * causa dela o endereço do backend ia embutido no bundle e a porta dele
       * precisava estar aberta para a internet. Medido em 19/08: das 28 origens
       * que usam a variável, **uma** rodava no navegador — esta.
       *
       * ⚠️ Sem sub-rota: `/api/health` é folha. Fica explícito em vez de entrar
       * na lista de prefixos, porque `/api/health/:path*` casaria com caminhos
       * que não existem e mascararia um 404 legítimo.
       */
      { source: '/api/health', destination: `${apiUrl}/api/health` },
      ...rotas.map((rota) => ({
        source: `/api/${rota}/:path*`,
        destination: `${apiUrl}/api/${rota}/:path*`,
      })),
    ];
  },
};

export default nextConfig;
