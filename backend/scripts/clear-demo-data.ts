import { PrismaClient } from '@prisma/client';
import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

const prisma = new PrismaClient();

/**
 * Removes the two demo restaurants seeded by `seedDemo()` in prisma/seed.ts
 * - Karahi House and Cafe Meridian - along with every branch, table, user,
 * category, product and order that belongs to them.
 *
 * A restaurant delete cascades in the schema (onDelete: Cascade from
 * Restaurant down through Branch, User, Order, etc.), so deleting the two
 * Restaurant rows is enough. This script does not touch anything else -
 * the Super Admin (admin@platform.test) has restaurantId null and is never
 * a match for a slug lookup, so it is untouched by construction, not by a
 * special case here.
 *
 * These slugs must match the ones in prisma/seed.ts's DEMOS array.
 */
const DEMO_SLUGS = ['karahi-house', 'cafe-meridian'];

async function main() {
  const restaurants = await prisma.restaurant.findMany({
    where: { slug: { in: DEMO_SLUGS } },
    select: { id: true, name: true, slug: true },
  });

  if (restaurants.length === 0) {
    console.log('No demo restaurants found. Nothing to do.');
    return;
  }

  console.log('Found:');
  for (const restaurant of restaurants) {
    console.log(`  ${restaurant.name} (${restaurant.slug})`);
  }

  const rl = readline.createInterface({ input: stdin, output: stdout });
  const answer = await rl.question(
    `\nYe ${restaurants.length} restaurant${restaurants.length > 1 ? 's' : ''} delete karegi, ` +
      `saath sab branches, tables, users, orders bhi. Sure? (yes/no) `,
  );
  rl.close();

  if (answer.trim().toLowerCase() !== 'yes') {
    console.log('Cancelled. Nothing deleted.');
    return;
  }

  for (const restaurant of restaurants) {
    await prisma.restaurant.delete({ where: { id: restaurant.id } });
    console.log(`  deleted: ${restaurant.name}`);
  }

  console.log('\nDone.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
