/**
 * Every API path the frontend knows about, in one place.
 *
 * Nothing else in the codebase builds a URL string by hand - that way a route
 * rename on the backend is a one-file change here rather than a search across
 * thirty components.
 */
export const endpoints = {
  auth: {
    login: '/public/auth/login',
    registerRestaurant: '/public/auth/register-restaurant',
    platformTerms: '/public/platform-terms',
    me: '/me',
    logout: '/auth/logout',
  },

  platform: {
    dashboard: '/platform/dashboard',
    restaurants: '/platform/restaurants',
    restaurant: (id: number) => `/platform/restaurants/${id}`,
    commercialTerms: (id: number) => `/platform/restaurants/${id}/commercial-terms`,
    status: (id: number) => `/platform/restaurants/${id}/status`,
    settle: (id: number) => `/platform/restaurants/${id}/settle`,
    settlements: '/platform/settlements',
    commission: '/platform/commission',
    activity: '/platform/activity',
  },

  branches: {
    list: '/branches',
    create: '/branches',
    detail: (id: number) => `/branches/${id}`,
  },

  menu: {
    categories: '/menu/categories',
    category: (id: number) => `/menu/categories/${id}`,
    products: '/menu/products',
    product: (id: number) => `/menu/products/${id}`,
    modifierGroups: '/menu/modifier-groups',
    modifierGroup: (id: number) => `/menu/modifier-groups/${id}`,
  },

  inventory: {
    items: '/inventory/items',
    item: (id: number) => `/inventory/items/${id}`,
    levels: '/inventory/levels',
    transactions: '/inventory/transactions',
    lowStock: '/inventory/low-stock',
    adjustments: '/inventory/adjustments',
  },

  suppliers: {
    list: '/suppliers',
    create: '/suppliers',
    detail: (id: number) => `/suppliers/${id}`,
  },

  customers: {
    list: '/customers',
    create: '/customers',
    detail: (id: number) => `/customers/${id}`,
  },

  staff: {
    list: '/staff',
    create: '/staff',
    detail: (id: number) => `/staff/${id}`,
    roles: '/roles',
  },

  settings: {
    show: '/settings',
    update: '/settings',
  },

  /** Mezbaan: one branch's own business profile, hours, tax and online ordering. */
  branchSettings: {
    show: '/branch-settings',
    update: '/branch-settings',
  },

  uploads: {
    create: '/uploads',
  },

  purchases: {
    list: '/purchases',
    create: '/purchases',
    receive: (id: number) => `/purchases/${id}/receive`,
    cancel: (id: number) => `/purchases/${id}/cancel`,
  },

  paymentMethods: {
    list: '/payment-methods',
    create: '/payment-methods',
    detail: (id: number) => `/payment-methods/${id}`,
  },

  expenses: {
    list: '/expenses',
    create: '/expenses',
    detail: (id: number) => `/expenses/${id}`,
  },

  reports: {
    summary: '/reports/summary',
    revenueByDay: '/reports/revenue-by-day',
    topItems: '/reports/top-items',
    paymentBreakdown: '/reports/payment-breakdown',
  },

  orders: {
    list: '/orders',
    create: '/orders',
    detail: (id: number) => `/orders/${id}`,
    transition: (id: number) => `/orders/${id}/transition`,
  },

  billing: {
    issueInvoice: (orderId: number) => `/orders/${orderId}/invoice`,
    pay: (orderId: number) => `/orders/${orderId}/pay`,
    receipt: (orderId: number) => `/orders/${orderId}/receipt`,
    invoice: (invoiceId: number) => `/invoices/${invoiceId}`,
    capturePayment: (invoiceId: number) => `/invoices/${invoiceId}/payments`,
    refund: (invoiceId: number) => `/invoices/${invoiceId}/refunds`,
  },

  kitchen: {
    board: '/kitchen/board',
    ticketStatus: (id: number) => `/kitchen/tickets/${id}/status`,
    printPayload: (id: number) => `/kitchen/tickets/${id}/print-payload`,
  },

  /** The restaurant's control over its own public site. */
  website: {
    show: '/website',
    update: '/website',
    setPublished: '/website/published',
  },

  tables: {
    list: '/tables',
    create: '/tables',
    detail: (id: number) => `/tables/${id}`,
    rotateQr: (id: number) => `/tables/${id}/rotate-qr`,
  },

  publicSite: {
    /** A visitor's view of restaurant-slug's site. No token needed. */
    bySlug: (slug: string) => `/public/sites/${slug}`,
    resolveTable: (qrToken: string) => `/public/qr/${qrToken}`,
    placeOrder: (qrToken: string) => `/public/qr/${qrToken}/orders`,
    orderStatus: (qrToken: string, orderNumber: string) =>
      `/public/qr/${qrToken}/orders/${orderNumber}`,
    addOrderItems: (qrToken: string, orderNumber: string) =>
      `/public/qr/${qrToken}/orders/${orderNumber}/items`,
  },
} as const;
