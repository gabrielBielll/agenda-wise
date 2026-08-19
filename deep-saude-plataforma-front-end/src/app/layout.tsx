import './globals.css';
import { Providers } from "@/components/Providers";
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: "AgendaWise · Deep Saúde",
  description: "Um espaço de cuidado para sua prática clínica.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&family=Newsreader:ital,opsz,wght@0,6..72,400;1,6..72,400;1,6..72,500&display=swap" rel="stylesheet" />
      </head>
      <body className="font-body antialiased">
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
