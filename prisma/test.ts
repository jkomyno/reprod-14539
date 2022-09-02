import assert from 'node:assert/strict'
import { PrismaClient } from '@prisma/client'
import { describe, test } from 'node:test'

const prisma = new PrismaClient({
  log: [
    {
      emit: "event",
      level: "query",
    },
  ],
})

prisma.$on('query', (e) => {
  // console.log('Select IN query: %s', e.query)
})

async function clean() {
  const cleanPrismaPromises = [prisma.tag.deleteMany(), prisma.vacancy.deleteMany(), prisma.staffMember.deleteMany()]
  await prisma.$transaction(cleanPrismaPromises)
}

async function createTags(length: number): Promise<number[]> {
  const ids = Array.from({ length }, (_, i) => i + 1)

  const prismaPromises: any = []
  for (const id of ids) {
    prismaPromises.push(
      prisma.tag.create({
        data: {
          id,
        },
      }),
    )
  }

  await prisma.$transaction(prismaPromises)
  return ids
}

async function findUniqueStaffMembers(length: number) {
  const staffMember = await prisma.staffMember.create({
    data: { name: 'StaffMember1' },
  })

  await prisma.vacancy.createMany({
    data: Array.from({ length }, (_, i) => ({
      id: i + 1,
      staffMemberId: staffMember.id,
    })),
  })

  const vacancyIds = (await prisma.vacancy.findMany({ take: length * 10 })).map(vacancy => vacancy.id)
  
  // Get the staffMembers of the vacancies in one go
  const getAllStaffMembersPromises = vacancyIds.map(id => prisma.vacancy.findUnique({
    where: { id }
  }).staffMember())
  const staffMembersFromPrisma = await Promise.all(getAllStaffMembersPromises)

  return { staffMember, staffMembersFromPrisma }
}

async function createPostsWithTags({ nPosts, nTagsPerPost }: { nPosts: number, nTagsPerPost: number }): Promise<number[]> {
  const ids = Array.from({ length: nPosts }, (_, i) => (i * nTagsPerPost) + 1)
  const prismaPromises: any = []

  // each post (with even ids) has two tags (one with the same id, one with an odd id)
  for (const id of ids) {
    const tagIds = Array.from({ length: nTagsPerPost }, (_, i) => id + i)
    const createTagsExpr = tagIds.map(tagId => ({
      tag: {
        create: { id: tagId },
      },
    }))

    prismaPromises.push(
      prisma.post.create({
        data: {
          id,
          tags: {
            create: createTagsExpr,
          },
        },
      }),
    )
  }

  await prisma.$transaction(prismaPromises)
  return ids
}

// @ts-ignore
const describeIf = (condition: boolean) => (condition ? describe : (descr: string, fn: () => void) => {})

const isDatabaseBugged = process.env.IS_DATABASE_BUGGED === '1' || false

describe('explicit IN', () => {
  test('$queryRaw + IN after creating 1000+ elements', async () => {
    await clean()
    const ids = await createTags(1000)
    const tags = await prisma.$queryRawUnsafe<unknown[]>(`
      SELECT * FROM Tag
      WHERE id IN (${ids.join(',')})
      ORDER BY id ASC
    `)
    assert.equal(tags.length, 1000)
    assert.deepEqual(tags[0], { id: 1 })
    assert.deepEqual(tags[999], { id: 1000 })
  })

  test('findMany + IN less than 1000 elements', async () => {
    await clean()
    const ids = await createTags(999)
    const tags = await prisma.tag.findMany({
      where: {
        id: { in: ids },
      },
    })
  
    assert.equal(tags.length, 999)
    assert.deepEqual(tags[0], { id: 1 })
  })

  test('findUnique less than 1000 elements', async () => {
    await clean()
    const length = 999
    const { staffMember, staffMembersFromPrisma } = await findUniqueStaffMembers(length)
    assert.deepEqual(staffMembersFromPrisma, Array.from({ length }, () => ({ id: staffMember.id, name: staffMember.name })))
  })
})

describeIf(isDatabaseBugged)('bugged database', () => {

  /**
   * In a bugged database, selecting 1000+ elements with an IN query will fail silently.
   */

  test('findMany + IN at least 1000 elements', async () => {
    await clean()
    const ids = await createTags(1000)
    const tags = await prisma.tag.findMany({
      where: {
        id: { in: ids },
      },
    })
  
    assert.equal(tags.length, 0)
  })

  test('findMany + IN at least 1000 elements is not influenced by QUERY_BATCH_SIZE=1000', async () => {
    await clean()
    const env = { ...process.env }
    process.env = { ...process.env, QUERY_BATCH_SIZE: '1000' }

    const ids = await createTags(1000)
    const tags = await prisma.tag.findMany({
      where: {
        id: { in: ids },
      },
    })
  
    assert.equal(tags.length, 0)

    process.env = env
  })

  test('findUnique at least 1000 elements', async () => {
    await clean()
    const length = 1000
    const { staffMembersFromPrisma } = await findUniqueStaffMembers(length)
    assert.deepEqual(staffMembersFromPrisma, Array.from({ length }, () => null))
  })

  test('findUnique at least 1000 elements is not influenced by QUERY_BATCH_SIZE=100', async () => {
    await clean()
    const env = { ...process.env }
    process.env = { ...process.env, QUERY_BATCH_SIZE: '1000' }

    const length = 1000
    const { staffMembersFromPrisma } = await findUniqueStaffMembers(length)
    assert.deepEqual(staffMembersFromPrisma, Array.from({ length }, () => null))

    process.env = env
  })
})

describeIf(!isDatabaseBugged)('stable database', () => {
  test('findMany + IN at least 1000 elements', async () => {
    await clean()
    const ids = await createTags(1000)
    const tags = await prisma.tag.findMany({
      where: {
        id: { in: ids },
      },
    })
  
    assert.equal(tags.length, 1000)
    assert.deepEqual(tags[0], { id: 1 })
  })

  test('findUnique at least 1000 elements', async () => {
    await clean()
    const length = 1000
    const { staffMember, staffMembersFromPrisma } = await findUniqueStaffMembers(length)
    assert.deepEqual(staffMembersFromPrisma, Array.from({ length }, () => ({ id: staffMember.id, name: staffMember.name })))
  })
})
