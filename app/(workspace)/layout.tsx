'use client'

import Link from 'next/link'
import { ReactNode } from 'react'
import { usePathname } from 'next/navigation'

const navItems = [
  { href: '/dashboard', label: 'Painel', icon: 'home' },
  { href: '/portfolio', label: 'Imóveis', icon: 'building' },
  { href: '/billing', label: 'Finanças', icon: 'wallet' },
  { href: '/operations', label: 'Manutenção', icon: 'tools' },
  { href: '/leases', label: 'Contratos', icon: 'contract' },
]

function NavIcon({ name }: { name: string }) {
  const paths: Record<string, ReactNode> = {
    home: <><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5M9 21v-7h6v7"/></>,
    building: <><path d="M4 21V5l8-3v19M12 8h8v13M8 7v2M8 12v2M8 17v2M16 12v2M16 17v2M2 21h20"/></>,
    wallet: <><path d="M3 6.5A2.5 2.5 0 0 1 5.5 4H19v16H5.5A2.5 2.5 0 0 1 3 17.5z"/><path d="M3 7h16M15 12h7v5h-7a2.5 2.5 0 0 1 0-5Z"/></>,
    tools: <><path d="m14 7 3-3 3 3-3 3M5 19l9-9M4 14l6 6M3 21l3-1-2-2z"/><path d="M13 4a5 5 0 0 0-7 6l3 3"/></>,
    contract: <><path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5"/><path d="M10 13h6M10 17h6"/></>,
    logout: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/></>,
    more: <><circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/></>,
  }

  return <svg className="workspace-nav-icon" viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>
}

export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname()

  return (
    <div className="workspace-layout">
      <a className="skip-link" href="#conteudo-principal">Saltar para o conteúdo</a>
      <aside className="workspace-sidebar">
        <Link className="workspace-brand" href="/dashboard">Applandlord</Link>
        <nav className="workspace-nav" aria-label="Navegação principal">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`workspace-nav-link ${pathname === item.href ? 'workspace-nav-link-active' : ''}`}
            >
              <NavIcon name={item.icon} />
              <span className="workspace-nav-label-mobile">{item.label}</span>
              <span className="workspace-nav-label-desktop">{item.label}</span>
            </Link>
          ))}
        </nav>
        <div className="workspace-sidebar-footer">
          <button
            type="button"
            onClick={async () => {
              await fetch('/api/auth/logout', { method: 'POST' })
              window.location.href = '/login'
            }}
          >
            <NavIcon name="logout" />
            <span>Sair</span>
          </button>
        </div>
      </aside>
      <div className="workspace-content">{children}</div>
    </div>
  )
}
