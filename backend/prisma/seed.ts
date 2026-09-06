import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const prisma = new PrismaClient();

/**
 * Seeds the platform in two layers:
 *
 *   seedCore() - the permission vocabulary, the five system roles, and the
 *   Super Admin. This is what a production deployment needs and nothing
 *   more. It always runs.
 *
 *   seedDemo() - two demo restaurants with their own branches, tables, menu
 *   and staff. Development-only, and only runs when SEED_DEMO_DATA=true is
 *   set (in .env, or passed to the process). Two restaurants rather than
 *   one, deliberately: tenant isolation is the single most important
 *   property of this system, and it cannot be seen at all with only one
 *   tenant in the database. Sign in as each owner in turn and neither can
 *   see the other's branches, orders or revenue.
 */

const SEED_DEMO_DATA = process.env.SEED_DEMO_DATA === 'true' || process.argv.includes('--demo');

// -----------------------------------------------------------------------------
//  Permissions
// -----------------------------------------------------------------------------

const PERMISSIONS: { slug: string; name: string; group: string }[] = [
  // Branches
  { slug: 'branches.view', name: 'View branches', group: 'Branches' },
  { slug: 'branches.create', name: 'Add branches', group: 'Branches' },
  { slug: 'branches.update', name: 'Edit branches', group: 'Branches' },
  { slug: 'branches.delete', name: 'Close branches', group: 'Branches' },

  // Menu
  { slug: 'menu.view', name: 'View menu', group: 'Menu' },
  { slug: 'menu.create', name: 'Add menu items', group: 'Menu' },
  { slug: 'menu.update', name: 'Edit menu items', group: 'Menu' },
  { slug: 'menu.delete', name: 'Remove menu items', group: 'Menu' },

  // Tables
  { slug: 'tables.view', name: 'View tables', group: 'Tables' },
  { slug: 'tables.create', name: 'Add tables', group: 'Tables' },
  { slug: 'tables.update', name: 'Edit tables and rotate QR codes', group: 'Tables' },

  // Orders
  { slug: 'orders.view', name: 'View orders', group: 'Orders' },
  { slug: 'orders.create', name: 'Take orders', group: 'Orders' },
  { slug: 'orders.update', name: 'Edit orders', group: 'Orders' },
  { slug: 'orders.updateStatus', name: 'Move orders along', group: 'Orders' },
  { slug: 'orders.cancel', name: 'Cancel orders', group: 'Orders' },
  { slug: 'orders.void', name: 'Void completed orders', group: 'Orders' },

  // Kitchen
  { slug: 'kitchen.view', name: 'View the kitchen board', group: 'Kitchen' },
  { slug: 'kitchen.updateStatus', name: 'Update ticket status', group: 'Kitchen' },

  // Billing
  { slug: 'billing.view', name: 'View bills', group: 'Billing' },
  { slug: 'billing.issue', name: 'Issue bills', group: 'Billing' },
  { slug: 'billing.collect', name: 'Take payment', group: 'Billing' },
  { slug: 'billing.refund', name: 'Issue refunds', group: 'Billing' },

  // Inventory
  { slug: 'inventory.view', name: 'View stock', group: 'Inventory' },
  { slug: 'inventory.adjust', name: 'Adjust stock', group: 'Inventory' },
  { slug: 'inventory.purchase', name: 'Record purchases', group: 'Inventory' },

  // Website
  { slug: 'website.view', name: 'View website settings', group: 'Website' },
  { slug: 'website.update', name: 'Edit the website and theme', group: 'Website' },

  // Reports
  { slug: 'reports.view', name: 'View reports', group: 'Reports' },
  { slug: 'reports.export', name: 'Export reports', group: 'Reports' },

  // Expenses
  { slug: 'expenses.view', name: 'View expenses', group: 'Expenses' },
  { slug: 'expenses.record', name: 'Record and edit expenses', group: 'Expenses' },

  { slug: 'customers.view', name: 'View customers', group: 'Customers' },
  { slug: 'customers.create', name: 'Add customers', group: 'Customers' },
  { slug: 'customers.update', name: 'Edit customers', group: 'Customers' },
  { slug: 'customers.delete', name: 'Remove customers', group: 'Customers' },

  // Staff
  { slug: 'staff.view', name: 'View staff', group: 'Staff' },
  { slug: 'staff.create', name: 'Add staff', group: 'Staff' },
  { slug: 'staff.update', name: 'Edit staff', group: 'Staff' },
  { slug: 'staff.delete', name: 'Remove staff', group: 'Staff' },

  // Settings
  { slug: 'settings.view', name: 'View settings', group: 'Settings' },
  { slug: 'settings.update', name: 'Change settings', group: 'Settings' },
];

/**
 * What each role can do.
 *
 * Worth reading closely, because this is where least privilege is actually
 * decided. A cashier can take money but not refund it. Kitchen staff can see
 * tickets and nothing else - no prices, no customers, no reports.
 */
const ROLE_MATRIX: Record<string, { name: string; description: string; permissions: string[] }> = {
  restaurant_owner: {
    name: 'Restaurant Owner',
    description: 'Full control of one restaurant and all of its branches.',
    permissions: ['*'],
  },

  branch_manager: {
    name: 'Branch Manager',
    description: 'Runs one branch: staff, stock, orders and refunds.',
    permissions: [
      'branches.view',
      'menu.view', 'menu.update',
      'tables.view', 'tables.create', 'tables.update',
      'orders.view', 'orders.create', 'orders.update', 'orders.updateStatus',
      'orders.cancel', 'orders.void',
      'kitchen.view', 'kitchen.updateStatus',
      'billing.view', 'billing.issue', 'billing.collect', 'billing.refund',
      'inventory.view', 'inventory.adjust', 'inventory.purchase',
      'reports.view',
      'expenses.view', 'expenses.record',
      'customers.view', 'customers.create', 'customers.update', 'customers.delete',
      'staff.view',
      'settings.view', 'settings.update',
    ],
  },

  cashier: {
    name: 'Cashier',
    description: 'Takes orders and payment at the counter.',
    permissions: [
      'menu.view',
      'tables.view',
      'orders.view', 'orders.create', 'orders.update', 'orders.updateStatus', 'orders.cancel',
      'kitchen.view',
      'billing.view', 'billing.issue', 'billing.collect',
      // Deliberately no billing.refund: giving money back is a manager's call.
      'customers.view', 'customers.create', 'customers.update',
      // Deliberately no customers.delete: removing a customer record is a manager's call.
    ],
  },

  waiter: {
    name: 'Waiter',
    description: 'Takes table orders, brings the bill and can collect payment. Cannot void or refund.',
    permissions: [
      'menu.view',
      'tables.view',
      'orders.view', 'orders.create', 'orders.update', 'orders.updateStatus',
      // Deliberately no orders.cancel or orders.void: walking back an order is
      // a manager or cashier call, not a waiter's.
      'kitchen.view',
      'billing.view', 'billing.issue', 'billing.collect',
      // Deliberately no billing.refund: giving money back is a manager's call.
      'customers.view', 'customers.create',
    ],
  },

  kitchen_staff: {
    name: 'Kitchen Staff',
    description: 'Sees prep tickets. No prices, no customers, no reports.',
    permissions: ['kitchen.view', 'kitchen.updateStatus', 'orders.view'],
  },
};

// -----------------------------------------------------------------------------

async function seedPermissionsAndRoles() {
  console.log('  permissions and roles');

  for (const permission of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { slug: permission.slug },
      create: { slug: permission.slug, name: permission.name, groupName: permission.group },
      update: { name: permission.name, groupName: permission.group },
    });
  }

  const allPermissions = await prisma.permission.findMany();

  // The Super Admin role holds no permission rows at all. Platform admins are
  // recognised by restaurantId being null and are granted everything implicitly
  // in the authorisation middleware, so there is no list here to fall out of
  // date as new permissions are added.
  const superAdmin = await prisma.role.upsert({
    where: { restaurantId_slug: { restaurantId: null as never, slug: 'super_admin' } },
    create: {
      slug: 'super_admin',
      name: 'Super Admin',
      description: 'Runs the platform. Sees every restaurant.',
      isSystem: true,
    },
    update: {},
  }).catch(async () => {
    const existing = await prisma.role.findFirst({
      where: { slug: 'super_admin', restaurantId: null },
    });

    return existing ?? prisma.role.create({
      data: {
        slug: 'super_admin',
        name: 'Super Admin',
        description: 'Runs the platform. Sees every restaurant.',
        isSystem: true,
      },
    });
  });

  for (const [slug, definition] of Object.entries(ROLE_MATRIX)) {
    let role = await prisma.role.findFirst({ where: { slug, restaurantId: null } });

    if (!role) {
      role = await prisma.role.create({
        data: {
          slug,
          name: definition.name,
          description: definition.description,
          isSystem: true,
        },
      });
    }

    const granted =
      definition.permissions[0] === '*'
        ? allPermissions
        : allPermissions.filter((permission) =>
            definition.permissions.includes(permission.slug),
          );

    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });

    await prisma.rolePermission.createMany({
      data: granted.map((permission) => ({ roleId: role!.id, permissionId: permission.id })),
      skipDuplicates: true,
    });
  }

  return superAdmin;
}

async function seedSuperAdmin(superAdminRoleId: number) {
  console.log('  super admin');

  const existing = await prisma.user.findFirst({
    where: { email: 'admin@platform.test', restaurantId: null },
  });

  if (existing) {
    return existing;
  }

  return prisma.user.create({
    data: {
      restaurantId: null,
      branchId: null,
      fullName: 'Platform Administrator',
      email: 'admin@platform.test',
      phone: '03001234567',
      password: await bcrypt.hash('Password123', 12),
      status: 'active',
      roles: { create: { roleId: superAdminRoleId } },
    },
  });
}

function token(length = 48): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = crypto.randomBytes(length);

  let value = '';
  for (let i = 0; i < length; i += 1) value += alphabet[bytes[i] % alphabet.length];
  return value;
}

interface DemoDefinition {
  name: string;
  slug: string;
  city: string;
  primaryColor: string;
  branches: { name: string; code: string; address: string; tables: number }[];
  categories: { name: string; products: { name: string; price: number; prep: number }[] }[];
}

const DEMOS: DemoDefinition[] = [
  {
    name: 'Karahi House',
    slug: 'karahi-house',
    city: 'Lahore',
    primaryColor: '#F5A524',
    branches: [
      { name: 'Gulberg Branch', code: 'LHR-01', address: '12-A Main Boulevard, Gulberg III, Lahore', tables: 12 },
      { name: 'DHA Branch', code: 'LHR-02', address: 'Phase 5 Commercial, DHA, Lahore', tables: 8 },
    ],
    categories: [
      {
        name: 'Karahi',
        products: [
          { name: 'Chicken Karahi Half', price: 1250, prep: 20 },
          { name: 'Mutton Karahi Half', price: 2100, prep: 25 },
        ],
      },
      {
        name: 'BBQ',
        products: [
          { name: 'Seekh Kabab', price: 450, prep: 12 },
          { name: 'Malai Boti', price: 620, prep: 15 },
          { name: 'Chicken Tikka', price: 520, prep: 15 },
        ],
      },
      {
        name: 'Breads',
        products: [
          { name: 'Roghni Naan', price: 90, prep: 6 },
          { name: 'Garlic Naan', price: 120, prep: 6 },
          { name: 'Plain Naan', price: 60, prep: 5 },
        ],
      },
      {
        name: 'Beverages',
        products: [
          { name: 'Fresh Lime', price: 180, prep: 3 },
          { name: 'Doodh Patti', price: 150, prep: 5 },
        ],
      },
    ],
  },
  {
    name: 'Cafe Meridian',
    slug: 'cafe-meridian',
    city: 'Islamabad',
    primaryColor: '#5B9CFF',
    branches: [
      { name: 'F-7 Branch', code: 'ISB-01', address: 'Bhittai Road, F-7 Markaz, Islamabad', tables: 10 },
    ],
    categories: [
      {
        name: 'Coffee',
        products: [
          { name: 'Flat White', price: 480, prep: 5 },
          { name: 'Cold Brew', price: 520, prep: 4 },
        ],
      },
      {
        name: 'Plates',
        products: [
          { name: 'Shakshuka', price: 890, prep: 18 },
          { name: 'Club Sandwich', price: 750, prep: 12 },
        ],
      },
    ],
  },
];

async function seedDemoRestaurant(definition: DemoDefinition) {
  console.log(`  demo restaurant: ${definition.name}`);

  const existing = await prisma.restaurant.findUnique({ where: { slug: definition.slug } });
  if (existing) {
    console.log('    already present, skipping');
    return;
  }

  const password = await bcrypt.hash('Password123', 12);

  const roles = await prisma.role.findMany({
    where: { restaurantId: null, slug: { in: Object.keys(ROLE_MATRIX) } },
  });

  const roleId = (slug: string) => roles.find((role) => role.slug === slug)!.id;

  const restaurant = await prisma.restaurant.create({
    data: {
      name: definition.name,
      slug: definition.slug,
      contactEmail: `owner@${definition.slug.replace(/-/g, '')}.test`,
      contactPhone: '03001112222',
      city: definition.city,
      status: 'active',
      commissionType: 'percentage',
      commissionValue: 5,
      settlementFrequency: 'weekly',
      termsAgreedAt: new Date(),
      website: {
        create: {
          isPublished: true,
          primaryColor: definition.primaryColor,
          tagline: `${definition.name} — ${definition.city}`,
          aboutText: `Serving ${definition.city} since 2019.`,
          showMenu: true,
          showBranches: true,
        },
      },
      paymentMethods: {
        create: [
          { name: 'Cash', code: 'cash', kind: 'cash', sortOrder: 0 },
          { name: 'JazzCash', code: 'jazzcash', kind: 'wallet', requiresReference: true, sortOrder: 1 },
          { name: 'Easypaisa', code: 'easypaisa', kind: 'wallet', requiresReference: true, sortOrder: 2 },
          { name: 'Card', code: 'card', kind: 'card', sortOrder: 3 },
        ],
      },
    },
  });

  // Owner: unbound to any branch, so every branch is theirs.
  await prisma.user.create({
    data: {
      restaurantId: restaurant.id,
      fullName: `${definition.name} Owner`,
      email: `owner@${definition.slug.replace(/-/g, '')}.test`,
      phone: '03001112222',
      password,
      roles: { create: { roleId: roleId('restaurant_owner') } },
    },
  });

  for (const [index, branchDefinition] of definition.branches.entries()) {
    const branch = await prisma.branch.create({
      data: {
        restaurantId: restaurant.id,
        name: branchDefinition.name,
        code: branchDefinition.code,
        addressLine: branchDefinition.address,
        city: definition.city,
        phone: '04211112222',
        openingTime: '12:00',
        closingTime: '23:30',
        status: 'active',
      },
    });

    await prisma.kitchenStation.create({
      data: { restaurantId: restaurant.id, branchId: branch.id, name: 'Main Kitchen' },
    });

    await prisma.diningTable.createMany({
      data: Array.from({ length: branchDefinition.tables }, (_, seat) => ({
        restaurantId: restaurant.id,
        branchId: branch.id,
        label: `Table ${String(seat + 1).padStart(2, '0')}`,
        capacity: 4,
        qrToken: token(48),
      })),
    });

    // Branch-level staff, on the first branch only - enough to demonstrate
    // that a branch-bound user cannot see the sibling branch.
    if (index === 0) {
      const slugPart = definition.slug;

      await prisma.user.createMany({
        data: [
          {
            restaurantId: restaurant.id, branchId: branch.id,
            fullName: 'Branch Manager', email: `manager@${slugPart}.test`,
            password, phone: '03003334444',
          },
          {
            restaurantId: restaurant.id, branchId: branch.id,
            fullName: 'Counter Cashier', email: `cashier@${slugPart}.test`,
            password, phone: '03005556666',
          },
          {
            restaurantId: restaurant.id, branchId: branch.id,
            fullName: 'Head Chef', email: `kitchen@${slugPart}.test`,
            password, phone: '03007778888',
          },
        ],
      });

      const staff = await prisma.user.findMany({
        where: {
          restaurantId: restaurant.id,
          email: { in: [`manager@${slugPart}.test`, `cashier@${slugPart}.test`, `kitchen@${slugPart}.test`] },
        },
      });

      for (const member of staff) {
        const slug = member.email.startsWith('manager')
          ? 'branch_manager'
          : member.email.startsWith('cashier')
            ? 'cashier'
            : 'kitchen_staff';

        await prisma.userRole.create({ data: { userId: member.id, roleId: roleId(slug) } });
      }
    }
  }

  for (const [categoryIndex, categoryDefinition] of definition.categories.entries()) {
    const category = await prisma.category.create({
      data: {
        restaurantId: restaurant.id,
        name: categoryDefinition.name,
        slug: categoryDefinition.name.toLowerCase().replace(/\s+/g, '-'),
        sortOrder: categoryIndex,
      },
    });

    await prisma.product.createMany({
      data: categoryDefinition.products.map((product, productIndex) => ({
        restaurantId: restaurant.id,
        categoryId: category.id,
        name: product.name,
        slug: `${product.name.toLowerCase().replace(/\s+/g, '-')}-${restaurant.id}`,
        basePrice: product.price,
        preparationMinutes: product.prep,
        sortOrder: productIndex,
      })),
    });
  }
}

async function seedCore() {
  const superAdminRole = await seedPermissionsAndRoles();
  await seedSuperAdmin(superAdminRole.id);

  console.log('\nCore seed done. Login: admin@platform.test / Password123\n');
}

async function seedDemo() {
  for (const demo of DEMOS) {
    await seedDemoRestaurant(demo);
  }

  console.log('\nDemo seed done. Every account below uses the password: Password123\n');
  console.log('  owner@karahihouse.test     Restaurant Owner');
  console.log('  manager@karahi-house.test  Branch Manager');
  console.log('  cashier@karahi-house.test  Cashier');
  console.log('  kitchen@karahi-house.test  Kitchen Staff');
  console.log('  owner@cafemeridian.test    Owner of the second restaurant\n');
  console.log('Sign in as both owners in turn: neither can see the other\'s data.\n');
}

async function main() {
  console.log('Seeding.\n');

  await seedCore();

  if (SEED_DEMO_DATA) {
    await seedDemo();
  } else {
    console.log('Skipping demo data (SEED_DEMO_DATA is not set to true).\n');
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
