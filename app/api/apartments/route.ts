import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { asNumber, asString } from '@/lib/landlord'
import { requireCurrentUserId } from '@/lib/auth'

/**
 * Objetivo: tratar um "apartamento" como uma unidade atómica de imóvel + unidade, escondendo
 * o conceito de "unidade" da interface. Cria/atualiza os dois numa única transação, para nunca
 * deixar um imóvel órfão (sem unidade) nem uma escrita parcial (imóvel guardado, renda não).
 *
 * POST  { name, addressLine1, city, postalCode, monthlyRent, region?, country? }
 *   -> cria Property + Unit. `region` assume `city` por omissão. 201 { property, unit }.
 * PATCH { propertyId, unitId, name?, addressLine1?, city?, postalCode?, monthlyRent? }
 *   -> atualiza Property (nome/morada/cidade/CP) + Unit (nome/renda). NÃO altera a região
 *      (preserva o valor existente, que pode diferir da cidade). 200 { property, unit }.
 */
export async function POST(request: Request) {
  const { userId, response } = await requireCurrentUserId()
  if (!userId) return response ?? NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await request.json()
    const name = asString(body.name)
    const addressLine1 = asString(body.addressLine1)
    const city = asString(body.city)
    const postalCode = asString(body.postalCode)
    const region = asString(body.region) || city
    const monthlyRent = asNumber(body.monthlyRent)

    if (!name || !addressLine1 || !city || !postalCode || !Number.isFinite(monthlyRent) || monthlyRent <= 0) {
      return NextResponse.json(
        { error: 'name, addressLine1, city, postalCode e uma renda positiva são obrigatórios' },
        { status: 400 }
      )
    }

    const result = await prisma.$transaction(async (tx) => {
      const property = await tx.property.create({
        data: {
          ownerId: userId,
          name,
          addressLine1,
          city,
          region,
          postalCode,
          country: asString(body.country, 'Portugal'),
        },
      })

      const unit = await tx.unit.create({
        data: {
          ownerId: userId,
          propertyId: property.id,
          name,
          monthlyRent,
          status: 'Vacant',
        },
      })

      return { property, unit }
    })

    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create apartment'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  const { userId, response } = await requireCurrentUserId()
  if (!userId) return response ?? NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await request.json()
    const propertyId = asString(body.propertyId)
    const unitId = asString(body.unitId)

    if (!propertyId || !unitId) {
      return NextResponse.json({ error: 'propertyId and unitId are required' }, { status: 400 })
    }

    const [property, unit] = await Promise.all([
      prisma.property.findFirst({ where: { id: propertyId, ownerId: userId } }),
      prisma.unit.findFirst({ where: { id: unitId, ownerId: userId } }),
    ])

    if (!property || !unit) {
      return NextResponse.json({ error: 'Apartment not found' }, { status: 404 })
    }

    const name = asString(body.name, property.name)
    const addressLine1 = asString(body.addressLine1, property.addressLine1)
    const city = asString(body.city, property.city)
    const postalCode = asString(body.postalCode, property.postalCode)
    const monthlyRent = body.monthlyRent === undefined ? unit.monthlyRent : asNumber(body.monthlyRent, unit.monthlyRent)

    if (!name || !addressLine1 || !city || !postalCode || !Number.isFinite(monthlyRent) || monthlyRent <= 0) {
      return NextResponse.json({ error: 'Dados do apartamento inválidos' }, { status: 400 })
    }

    const result = await prisma.$transaction(async (tx) => {
      const updatedProperty = await tx.property.update({
        where: { id: propertyId },
        data: { name, addressLine1, city, postalCode }, // região preservada de propósito
      })

      const updatedUnit = await tx.unit.update({
        where: { id: unitId },
        data: { name, monthlyRent },
      })

      return { property: updatedProperty, unit: updatedUnit }
    })

    return NextResponse.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update apartment'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
