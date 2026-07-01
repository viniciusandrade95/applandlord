import Link from 'next/link'
import { ReactNode } from 'react'

const navItems = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/portfolio', label: 'Portfólio' },
  { href: '/leases', label: 'Contratos' },
  { href: '/billing', label: 'Financeiro' },
  { href: '/operations', label: 'Operação' },
]

export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  return (
    <div className="workspace-layout">
      <aside className="workspace-sidebar">
        <Link className="workspace-brand" href="/dashboard">Applandlord</Link>
        <nav className="workspace-nav" aria-label="Navegação principal">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="workspace-nav-link"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>
      <div className="workspace-content">{children}</div>
    </div>
  )
}
