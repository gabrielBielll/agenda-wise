import axios from 'axios';

const adminApi = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'https://sua-api-render.com/api', // Fallback para URL mock
  headers: { 'Content-Type': 'application/json' },
});

// Interceptor para mock auth em desenvolvimento
adminApi.interceptors.request.use(config => {
  // Nota: process.env.NODE_ENV em aplicações Next.js buildadas para browser
  // será 'production' ou 'development' dependendo do build, não do ambiente de execução do servidor.
  // Para lógica estritamente client-side, isso é geralmente ok.
  // Se precisar de uma verificação mais robusta baseada no ambiente real (ex: Vercel envs),
  // pode ser necessário injetar a variável de ambiente de forma diferente.

  const isAdminTokenAvailable = typeof window !== 'undefined' && localStorage.getItem('adminToken');

  if (process.env.NEXT_PUBLIC_NODE_ENV === 'development' && !isAdminTokenAvailable) {
    config.headers.Authorization = 'Bearer mock-dev-token';
  } else if (isAdminTokenAvailable) {
    config.headers.Authorization = `Bearer ${localStorage.getItem('adminToken')}`;
  }
  // Se não for 'development' e não houver token, a requisição prossegue sem Authorization header.
  // A proteção de rota/lógica de autenticação deve lidar com isso.

  return config;
});

export default adminApi;
