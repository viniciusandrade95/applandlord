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
    <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', minHeight: '100vh' }}>
      <aside style={{ borderRight: '1px solid rgba(148, 163, 184, 0.25)', padding: '24px 16px', background: '#0f172a' }}>
        <div style={{ color: '#e2e8f0', fontWeight: 700, marginBottom: 16 }}>Applandlord</div>
        <nav style={{ display: 'grid', gap: 8 }}>
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              style={{
                color: '#cbd5e1',
                textDecoration: 'none',
                border: '1px solid rgba(148, 163, 184, 0.25)',
                borderRadius: 10,
                padding: '10px 12px',
                fontSize: 14,
              }}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>
      <div>{children}</div>
    </div>
  )
}
