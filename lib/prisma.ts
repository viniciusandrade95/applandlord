import { PrismaClient } from '@prisma/client'

const globalForPrisma = global as unknown as { prisma: PrismaClient }
const prismaLogLevels = process.env.NODE_ENV === 'production' ? ['warn', 'error'] : ['query', 'warn', 'error']

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: prismaLogLevels,
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
