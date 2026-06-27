import type { Metadata } from 'next';
import { Toaster } from 'sonner';
import Providers from '@/components/providers';
import './globals.css';

export const metadata: Metadata = {
  title: 'N-Go | Tennis Club Management',
  description: 'Plataforma de gestión para clubes de tenis',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        <Providers>
          {children}
          <Toaster richColors position="top-right" />
        </Providers>
      </body>
    </html>
  );
}
