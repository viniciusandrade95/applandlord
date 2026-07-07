import type { Metadata, Viewport } from 'next'
import type { CSSProperties, ReactNode } from 'react'
import localFont from 'next/font/local'
import './globals.css'

// Geist (open-source, Vercel) auto-hospedada — sem depender de CDN em build/runtime.
// Alimenta --font-sans (interface). --font-display aponta para a mesma família,
// para os títulos das restantes páginas deixarem de usar a serifa antiga.
const geist = localFont({
  src: [
    { path: './fonts/Geist-Regular.woff2', weight: '400', style: 'normal' },
    { path: './fonts/Geist-Medium.woff2', weight: '500', style: 'normal' },
    { path: './fonts/Geist-SemiBold.woff2', weight: '600', style: 'normal' },
  ],
  variable: '--font-sans',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Applandlord',
  description: 'MVP para gestao de imoveis, contratos e cobrancas.',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

const rootStyle = { '--font-display': 'var(--font-sans)' } as CSSProperties

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="pt" style={rootStyle}>
      <body className={geist.variable}>{children}</body>
    </html>
  )
}
