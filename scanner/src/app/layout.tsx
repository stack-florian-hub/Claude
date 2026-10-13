import './globals.css';
import type { Metadata } from 'next';
import Nav from '@/components/Nav';

export const metadata: Metadata = { title: 'Scanner MdB – TUÉ et Fils', description: 'Scanner d’anomalies de prix immobiliers (annonces × DVF)' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap" />
      </head>
      <body>
        <div className="shell">
          <Nav />
          <main>{children}</main>
        </div>
      </body>
    </html>
  );
}
