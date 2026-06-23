import './globals.css';

export const metadata = {
  title: 'AdaptaJIREH',
  description: 'Sistema de aprendizaje adaptativo con repetición espaciada',
  applicationName: 'AdaptaJIREH',
  icons: {
    icon: '/logo-jireh.png',
    shortcut: '/logo-jireh.png',
    apple: '/logo-jireh.png',
  },
};

export const viewport = {
  themeColor: '#0284c7',
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
