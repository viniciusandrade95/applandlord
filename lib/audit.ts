import { prisma } from '@/lib/prisma'

type AuditSeverity = 'INFO' | 'WARN' | 'ERROR'

type AuditEventInput = {
  ownerId: string
  actorId?: string | null
  action: string
  entityType: string
  entityId?: string | null
  severity?: AuditSeverity
  metadata?: Record<string, unknown>
  ipAddress?: string | null
  userAgent?: string | null
}

/**
 * Objetivo: persistir um evento crítico na trilha de auditoria do tenant.
 *
 * Entrada:
 * - ownerId: string obrigatório.
 * - actorId/entityId/ipAddress/userAgent: opcionais.
 * - action/entityType: strings obrigatórias para classificação do evento.
 * - severity: INFO|WARN|ERROR (default INFO).
 * - metadata: objeto JSON serializável.
 *
 * Saída:
 * - Promise<void>. Em caso de erro de escrita, não propaga exceção para não
 *   interromper o fluxo principal da API.
 */
export async function logAuditEvent(input: AuditEventInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        ownerId: input.ownerId,
        actorId: input.actorId ?? null,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        severity: input.severity ?? 'INFO',
        metadata: input.metadata,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
      },
    })
  } catch (error) {
    console.error('Failed to persist audit log', {
      action: input.action,
      entityType: input.entityType,
      ownerId: input.ownerId,
      error,
    })
  }
}
