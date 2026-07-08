import './globals.css';
import ModoOffline from '@/components/ModoOffline';

export const metadata = {
  title: 'AdaptaJIREH',
  description: 'Sistema de aprendizaje adaptativo con repetición espaciada',
  applicationName: 'AdaptaJIREH',
  icons: {
    icon: '/icon-192.png',
    shortcut: '/icon-192.png',
    apple: '/apple-touch-icon.png',
  },
};

export const viewport = {
  themeColor: '#0284c7',
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body>
        <ModoOffline />
        {children}
      </body>
    </html>
  );
}
