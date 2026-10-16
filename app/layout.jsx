import './globals.css';
import MultiplayerClient from '@/components/MultiplayerClient';

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#090d16',
};

export const metadata = {
  // the site's own address, so share links and images in the business pages are absolute (NEXT_PUBLIC_SITE_URL in production)
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'),
  // iOS Safari turns anything that looks like a phone number (the city number, scores, prices) into a link
  // before the page loads, which breaks hydration. Nothing in the app is a phone number, so switch it off.
  formatDetection: { telephone: false, email: false, address: false },
  title: 'VoxelVenture | Digital Commercial District',
  description: 'Isometric 3D commercial city and interactive storefront directory.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="antialiased overflow-hidden">
        {children}
        <MultiplayerClient />
      </body>
    </html>
  );
}