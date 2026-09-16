import './globals.css';

export const metadata = {
  title: 'Five Poses v2',
  description: 'Five-shot fashion e-commerce image generation with pattern-locked references.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
