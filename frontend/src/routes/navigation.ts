import {
  Banknote, Building2, ChefHat, ClipboardList, CreditCard, LayoutDashboard, Package,
  Percent, QrCode, Receipt, Settings, Store, Truck, Users, UtensilsCrossed, Wallet, ConciergeBell,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface NavigationItem {
  label: string;
  to: string;
  icon: LucideIcon;
  /** Hidden unless the signed-in user holds this permission. */
  permission?: string;
  end?: boolean;
  badge?: number;
}

export interface NavigationSection {
  title: string;
  items: NavigationItem[];
}

/** Super Admin: the platform's own operating console. */
export const PLATFORM_NAVIGATION: NavigationSection[] = [
  {
    title: 'Overview',
    items: [
      { label: 'Dashboard', to: '/platform', icon: LayoutDashboard, end: true },
      { label: 'Restaurants', to: '/platform/restaurants', icon: Store },
    ],
  },
  {
    title: 'Revenue',
    items: [
      { label: 'Commission', to: '/platform/commission', icon: Percent },
      { label: 'Settlements', to: '/platform/settlements', icon: Wallet },
    ],
  },
  {
    title: 'Platform',
    items: [
      { label: 'Activity log', to: '/platform/activity', icon: ClipboardList },
      { label: 'Settings', to: '/platform/settings', icon: Settings },
    ],
  },
];

/** Restaurant owner and branch manager. */
export const RESTAURANT_NAVIGATION: NavigationSection[] = [
  {
    title: 'Overview',
    items: [
      { label: 'Dashboard', to: '/app', icon: LayoutDashboard, end: true },
      { label: 'Orders', to: '/app/orders', icon: Receipt, permission: 'orders.view' },
    ],
  },
  {
    title: 'Operations',
    items: [
      { label: 'Branches', to: '/app/branches', icon: Building2, permission: 'branches.view' },
      { label: 'Tables & QR', to: '/app/tables', icon: QrCode, permission: 'tables.view' },
      { label: 'Menu', to: '/app/menu', icon: UtensilsCrossed, permission: 'menu.view' },
      { label: 'Kitchen', to: '/kitchen', icon: ChefHat, permission: 'kitchen.view' },
    ],
  },
  {
    title: 'Business',
    items: [
      { label: 'Inventory', to: '/app/inventory', icon: Package, permission: 'inventory.view' },
      { label: 'Suppliers', to: '/app/suppliers', icon: Truck, permission: 'inventory.view' },
      { label: 'Expenses', to: '/app/expenses', icon: Banknote, permission: 'expenses.view' },
      { label: 'Customers', to: '/app/customers', icon: Users, permission: 'customers.view' },
      { label: 'Payments', to: '/app/payment-methods', icon: CreditCard, permission: 'settings.view' },
      { label: 'Reports', to: '/app/reports', icon: ClipboardList, permission: 'reports.view' },
    ],
  },
  {
    title: 'Configuration',
    items: [
      { label: 'Staff & roles', to: '/app/staff', icon: Users, permission: 'staff.view' },
      { label: 'Website', to: '/app/website', icon: Store, permission: 'website.view' },
      { label: 'Mezbaan', to: '/app/mezbaan', icon: ConciergeBell, permission: 'settings.view' },
      { label: 'Settings', to: '/app/settings', icon: Settings, permission: 'settings.view' },
    ],
  },
];
