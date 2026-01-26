# **App Name**: AgendaWise

## Core Features:

- Google Calendar Sync: Integração segura com o Google Calendar usando OAuth 2.0 e hooks do React, permitindo que os usuários façam login e concedam permissão para acessar seus calendários.
- Perfis de Pacientes: Um portal seguro onde os psicólogos podem criar e organizar perfis de pacientes, garantindo confidencialidade e fácil acesso.
- Gerenciamento de Consultas: Funcionalidade para agendar, gerenciar e visualizar compromissos diretamente no aplicativo, sincronizado com o Google Calendar do psicólogo.
- Upload de Documentos: Permitir que os usuários carreguem documentos e os anexem aos arquivos dos pacientes. Os arquivos são carregados no Google Cloud Storage usando URLs assinados.
- Notas de Sessão: Permite o armazenamento e organização seguros de notas de sessão e documentos relacionados ao paciente usando o Google Cloud Storage, facilmente acessíveis durante as consultas.
- AI Note Analyzer: Ferramenta de IA generativa para sugerir palavras-chave, temas ou insights potenciais com base nas notas de sessão carregadas. Essa ferramenta irá usar a IA para decidir se e quando usar um determinado trecho das notas.
- Note Filtering and Export: Capacidade de aplicar várias opções de filtragem em notas e exportar subconjuntos filtrados de seus documentos como .txt ou .pdf.

## Style Guidelines:

- Cor primária: --sage-green (#95A084), representando calma e profissionalismo.
- Cor secundária: --warm-beige (#C4A584) para áreas de conteúdo e botões secundários.
- Cor de fundo: --cream (#F5F0E8) para um visual leve e convidativo.
- Cor de borda e linhas: --light-gray (#D3D3D3) para sutileza e clareza visual.
- Cor de texto principal: --charcoal (#4A4A4A) para alta legibilidade.
- Cor de destaque: --terracotta (#D2845A) para alertas, botões de ação importantes e notificações.
- Cor de texto secundária: --charcoal (#4A4A4A) com opacidade reduzida (ex: 70%) para informações menos importantes.
- Fonte do título: 'Playfair Display' para títulos e cabeçalhos, transmitindo elegância e profissionalismo.
- Fonte do corpo: 'Safira March' para o corpo do texto, garantindo legibilidade e uma aparência acolhedora.
- Ícones: Design minimalista e elegante, alinhados com as cores e fontes escolhidas.  Uso de ícones que remetem à natureza e tranquilidade (folhas, flores estilizadas) para reforçar a sensação de calma.
- Layout: Design limpo e organizado, com uso de espaços em branco para evitar sobrecarga visual.  Estrutura em abas ou seções claramente demarcadas para fácil navegação entre agenda, pacientes e notas.
- Animações sutis: Transições suaves entre páginas e elementos.  Efeitos de hover discretos nos botões para feedback visual.