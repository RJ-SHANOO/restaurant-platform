/**
 * Shapes returned by the Laravel API.
 *
 * These mirror the PHP API Resources one for one. When a resource changes on
 * the backend, this file is the single place the frontend has to follow.
 */

export interface ApiEnvelope<T> {
  success: boolean;
  message: string;
  data: T;
  meta?: { pagination?: Pagination };
}

export interface ApiErrorEnvelope {
  success: false;
  message: string;
  errors?: Record<string, string[]>;
}

export interface Pagination {
  currentPage: number;
  perPage: number;
  total: number;
  lastPage: number;
}

export type UserRole =
  | 'super_admin'
  | 'restaurant_owner'
  | 'branch_manager'
  | 'cashier'
  | 'kitchen_staff';

export interface AuthenticatedUser {
  id: number;
  fullName: string;
  email: string;
  phone: string | null;
  avatarUrl: string | null;
  status: 'active' | 'suspended';
  scope: {
    isPlatformAdmin: boolean;
    restaurantId: number | null;
    branchId: number | null;
    restaurantName?: string | null;
    restaurantSlug?: string | null;
    branchName?: string | null;
  };
  primaryRole: UserRole | null;
  permissions: string[];
  lastLoginAt: string | null;
}

export interface Restaurant {
  id: number;
  name: string;
  slug: string;
  contactEmail: string;
  contactPhone: string;
  city: string | null;
  currencyCode: string;
  status: 'pending' | 'active' | 'suspended' | 'closed';
  logoUrl: string | null;
  branding: { primaryColor: string; accentColor: string };
  commercialTerms: {
    commissionType: 'percentage' | 'fixed';
    commissionValue: number;
    settlementFrequency: 'daily' | 'every_2_days' | 'weekly' | 'monthly';
  };
  counts?: { branches?: number; orders?: number; users?: number };
  activatedAt: string | null;
  createdAt: string;
}

export interface Branch {
  id: number;
  name: string;
  code: string;
  addressLine: string | null;
  city: string | null;
  phone: string | null;
  status: 'active' | 'inactive';
  charges: { taxPercentage: number; serviceChargePercentage: number };
  hours: { opensAt: string; closesAt: string };
  capabilities: { acceptsQrOrders: boolean; acceptsDelivery: boolean };
  counts?: { diningTables?: number; users?: number };
  createdAt: string;
}

export type TableStatus = 'available' | 'occupied' | 'reserved' | 'out_of_service';

export interface DiningTable {
  id: number;
  branchId: number;
  branch?: { id: number; name: string };
  label: string;
  capacity: number;
  areaName: string | null;
  status: TableStatus;
  qrToken: string;
  orderCount: number;
  createdAt: string;
}

export interface InventoryItem {
  id: number;
  name: string;
  sku: string | null;
  unit: string;
  reorderLevel: number;
  costPerUnit: number;
  createdAt: string;
}

export interface StockLevel {
  branchId: number;
  branch: { id: number; name: string };
  item: InventoryItem;
  quantity: number;
  isLow: boolean;
  updatedAt: string;
}

export type InventoryTxnType = 'purchase' | 'sale' | 'adjustment' | 'wastage' | 'transfer_in' | 'transfer_out' | 'reversal';

export interface InventoryTransaction {
  id: number;
  type: InventoryTxnType;
  item: { id: number; name: string; unit: string };
  branch: { id: number; name: string };
  quantityDelta: number;
  balanceAfter: number;
  unitCost: number;
  sourceType: string | null;
  sourceId: number | null;
  note: string | null;
  createdAt: string;
}

export interface Supplier {
  id: number;
  name: string;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  addressLine: string | null;
  purchaseCount: number;
  createdAt: string;
}

export interface Customer {
  id: number;
  fullName: string;
  phone: string;
  email: string | null;
  addressLine: string | null;
  notes: string | null;
  orderCount: number;
  createdAt: string;
}

export interface StaffMember {
  id: number;
  fullName: string;
  email: string;
  phone: string | null;
  status: 'active' | 'suspended';
  branch: { id: number; name: string } | null;
  role: { slug: string; name: string } | null;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface Role {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissions: string[];
}

export interface RestaurantSettings {
  id: number;
  name: string;
  slug: string;
  contactEmail: string;
  contactPhone: string;
  addressLine: string | null;
  city: string | null;
  logoPath: string | null;
  currencyCode: string;
  timezone: string;
  status: 'pending' | 'active' | 'suspended' | 'closed';
  commercialTerms: {
    commissionType: 'percentage' | 'fixed';
    commissionValue: number;
    settlementFrequency: 'daily' | 'every_2_days' | 'weekly' | 'monthly';
  };
}

export type PurchaseStatus = 'draft' | 'received' | 'cancelled';

export interface PurchaseLine {
  id: number;
  item: { id: number; name: string; unit: string };
  quantity: number;
  unitCost: number;
  lineTotal: number;
}

export interface Purchase {
  id: number;
  purchaseNumber: string;
  status: PurchaseStatus;
  branch: { id: number; name: string };
  supplier: { id: number; name: string } | null;
  totalAmount: number;
  note: string | null;
  receivedAt: string | null;
  items: PurchaseLine[];
  createdAt: string;
}

export type PaymentMethodKind = 'cash' | 'card' | 'wallet' | 'bank' | 'online';

export interface PaymentMethodConfig {
  id: number;
  name: string;
  code: string;
  kind: PaymentMethodKind;
  requiresReference: boolean;
  accountTitle: string | null;
  accountNumber: string | null;
  qrImageUrl: string | null;
  instructions: string | null;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
}

export interface Expense {
  id: number;
  branchId: number | null;
  branch: { id: number; name: string } | null;
  category: string;
  description: string;
  amount: number;
  incurredOn: string;
  createdAt: string;
}

export interface SalesSummary {
  range: { from: string; to: string };
  orders: { completed: number; byStatus: Record<string, number> };
  revenue: {
    gross: number;
    discounts: number;
    tax: number;
    serviceCharge: number;
    refunds: number;
    net: number;
    averageOrderValue: number;
  };
  expenses: number;
  netAfterExpenses: number;
}

export interface RevenuePoint {
  date: string;
  revenue: number;
  orders: number;
}

export interface TopItemRow {
  productId: number | null;
  name: string;
  quantity: number;
  revenue: number;
}

export interface PaymentBreakdownRow {
  paymentMethodId: number;
  name: string;
  amount: number;
  count: number;
}

export type OrderStatus =
  | 'pending' | 'confirmed' | 'preparing' | 'ready'
  | 'served' | 'completed' | 'cancelled' | 'voided';

export type OrderChannel = 'pos' | 'qr' | 'website' | 'phone' | 'delivery';

export interface OrderTotals {
  subtotal: number;
  discount: number;
  tax: number;
  serviceCharge: number;
  deliveryCharge: number;
  tip: number;
  grandTotal: number;
  paid: number;
  refunded: number;
  outstanding: number;
}

export interface OrderItem {
  id: number;
  productId: number | null;
  productName: string;
  variantName: string | null;
  unitPrice: number;
  quantity: number;
  cancelledQuantity: number;
  billableQuantity: number;
  modifiersAmount: number;
  lineTotal: number;
  status: 'pending' | 'preparing' | 'ready' | 'served' | 'cancelled';
  kitchenNote: string | null;
  selectedModifiers: Array<{ id: number; name: string; price: number }>;
}

export interface Order {
  id: number;
  orderNumber: string;
  channel: OrderChannel;
  orderType: 'dine_in' | 'takeaway' | 'delivery';
  status: OrderStatus;
  guestCount: number;
  table: { id: number; label: string } | null;
  customer: { id: number; name: string | null; phone: string } | null;
  totals: OrderTotals;
  paymentStatus: 'unpaid' | 'partial' | 'paid' | 'refunded';
  customerNote: string | null;
  items?: OrderItem[];
  allowedNextStatuses: OrderStatus[];
  timestamps: {
    createdAt: string;
    confirmedAt: string | null;
    readyAt: string | null;
    completedAt: string | null;
  };
}

export interface KitchenTicket {
  id: number;
  ticketNumber: string;
  orderNumber: string;
  orderType: string;
  tableLabel: string | null;
  station: string | null;
  status: 'queued' | 'preparing' | 'ready' | 'served' | 'cancelled';
  priority: 'normal' | 'rush';
  timing: {
    queuedAt: string;
    elapsedMinutes: number;
    targetMinutes: number;
    urgency: 'on_time' | 'warning' | 'overdue';
  };
  items: Array<{
    id: number;
    productName: string;
    variantName: string | null;
    quantity: number;
    kitchenNote: string | null;
    status: string;
  }>;
  generalNote: string | null;
}

export interface MenuCategory {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  sortOrder: number;
  isActive: boolean;
  parentId: number | null;
  productCount: number;
  createdAt: string;
}

export interface ProductVariant {
  id: number;
  name: string;
  priceDelta: number;
  isDefault: boolean;
  sortOrder: number;
}

export interface Modifier {
  id: number;
  name: string;
  priceDelta: number;
  isAvailable: boolean;
  sortOrder: number;
}

export interface ModifierGroup {
  id: number;
  name: string;
  selectionType: 'single' | 'multiple';
  minSelections: number;
  maxSelections: number;
  isRequired: boolean;
  productCount?: number;
  modifiers: Modifier[];
}

export interface Product {
  id: number;
  categoryId: number;
  category: { id: number; name: string } | null;
  name: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  basePrice: number;
  preparationMinutes: number;
  tracksInventory: boolean;
  isAvailable: boolean;
  isFeatured: boolean;
  sortOrder: number;
  variants: ProductVariant[];
  modifierGroups: ModifierGroup[];
  createdAt: string;
}

export interface SiteNavLink {
  label: string;
  url: string;
}

export interface PublicSite {
  restaurant: { name: string; slug: string; city: string | null; currencyCode: string; phone: string };
  theme: {
    primaryColor: string;
    secondaryColor: string;
    backgroundShade: string;
    fontFamily: string;
    layoutStyle: string;
    logoUrl: string | null;
    bannerUrl: string | null;
  };
  content: {
    tagline: string | null;
    aboutText: string | null;
    facebookUrl: string | null;
    instagramUrl: string | null;
    whatsappPhone: string | null;
    allowOnlineOrder: boolean;
  };
  header: {
    logoPosition: string;
    sticky: boolean;
    showPhone: boolean;
    orderNowText: string;
    orderNowTarget: string;
    orderNowUrl: string | null;
    navLinks: SiteNavLink[];
  };
  footer: {
    aboutText: string | null;
    hours: string | null;
    copyrightText: string | null;
    layout: string;
  };
  home: {
    heroHeading: string | null;
    heroButtonText: string;
    showFeaturedProducts: boolean;
    featuredProductsLimit: number;
    showAboutSection: boolean;
    sectionOrder: string[];
  };
  shop: {
    viewStyle: string;
    itemsPerRow: number;
    showPrice: boolean;
    showCategoryFilter: boolean;
    showSearch: boolean;
    showProductImage: boolean;
  };
  branches: Array<{
    id: number;
    name: string;
    addressLine: string | null;
    city: string | null;
    phone: string | null;
    latitude: number | null;
    longitude: number | null;
    openingTime: string | null;
    closingTime: string | null;
    acceptsDelivery: boolean;
    acceptsTakeaway: boolean;
  }>;
  menu: Array<{
    id: number;
    name: string;
    description: string | null;
    imageUrl: string | null;
    products: Array<{
      id: number;
      name: string;
      description: string | null;
      imageUrl: string | null;
      basePrice: number;
      isFeatured: boolean;
    }>;
  }>;
}

export interface MenuProduct {
  id: number;
  name: string;
  description: string | null;
  price: number;
  imageUrl: string | null;
  isFeatured: boolean;
  isAvailable: boolean;
  prepMinutes: number;
  category?: { id: number; name: string };
  variants?: Array<{ id: number; name: string; price: number; isDefault: boolean }>;
}

export interface ActivityLogEntry {
  id: number;
  action: string;
  subjectType: string;
  subjectId: number | null;
  oldValues: Record<string, unknown> | null;
  newValues: Record<string, unknown> | null;
  createdAt: string;
  restaurant: { id: number; name: string } | null;
  user: { id: number; fullName: string } | null;
}

export interface CommissionEntry {
  id: number;
  restaurantId: number;
  invoiceId: number | null;
  settlementId: number | null;
  type: 'charge' | 'reversal';
  status: 'pending' | 'settled';
  baseAmount: number;
  amount: number;
  commissionType: 'percentage' | 'fixed';
  commissionRate: number;
  note: string | null;
  createdAt: string;
  restaurant: { id: number; name: string };
}

export interface Settlement {
  id: number;
  restaurantId: number;
  settlementNumber: string;
  status: 'open' | 'finalised' | 'paid';
  periodStart: string;
  periodEnd: string;
  grossSales: number;
  commissionTotal: number;
  entryCount: number;
  finalisedAt: string | null;
  paidAt: string | null;
  paymentRef: string | null;
  createdAt: string;
  restaurant: { id: number; name: string };
}
