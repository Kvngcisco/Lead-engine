import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'Lead Engine', description: 'Your daily prospecting workspace.' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
