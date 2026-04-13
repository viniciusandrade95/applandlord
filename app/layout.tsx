import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'
import { Fraunces, Space_Grotesk } from 'next/font/google'
import './globals.css'

const display = Fraunces({
  subsets: ['latin'],
  variable: '--font-display',
})

const sans = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-sans',
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

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="pt">
      <body className={`${display.variable} ${sans.variable}`}>{children}</body>
    </html>
  )
}
