import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
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
    return [
      {
        source: '/api/agendamentos/:path*',
        destination: 'http://localhost:3000/api/agendamentos/:path*',
      },
      {
        source: '/api/pacientes/:path*',
        destination: 'http://localhost:3000/api/pacientes/:path*',
      },
      {
        source: '/api/psicologos/:path*',
        destination: 'http://localhost:3000/api/psicologos/:path*',
      },
      {
        source: '/api/prontuarios/:path*',
        destination: 'http://localhost:3000/api/prontuarios/:path*',
      },
      {
        source: '/api/bloqueios/:path*',
        destination: 'http://localhost:3000/api/bloqueios/:path*',
      },
      {
        source: '/api/usuarios/:path*',
        destination: 'http://localhost:3000/api/usuarios/:path*',
      },
      {
        source: '/api/admin/:path*',
        destination: 'http://localhost:3000/api/admin/:path*',
      },
    ];
  },
};

export default nextConfig;
