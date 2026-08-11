import './globals.css';

export const metadata = {
  title: 'JC CRM',
  description: 'JC Commercial — leads, quotes and follow-up',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0b7a50',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en-AU">
      <body>{children}</body>
    </html>
  );
}
