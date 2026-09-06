# PROJECT STRUCTURE

Open this first. Legend: `✅` built · `🔜` scheduled

```
restaurant-platform/
│
├── README.md                          ✅ Setup and commands
├── PROJECT_STRUCTURE.md               ✅ This file
│
├── backend/                           ── NODE + EXPRESS + TS ──
│   ├── package.json                   ✅
│   ├── tsconfig.json                  ✅
│   ├── .env.example                   ✅
│   ├── render.yaml                    ✅ One-click deploy config
│   │
│   ├── prisma/
│   │   ├── schema.prisma              ✅ Every table, 36 models
│   │   └── seed.ts                    ✅ seedCore() always; seedDemo() behind SEED_DEMO_DATA
│   │   
│   ├── scripts/
│   │   └── clear-demo-data.ts         ✅ Deletes the two demo restaurants, with a confirm prompt
│   │
│   └── src/
│       ├── server.ts                  ✅ Entry point
│       ├── app.ts                     ✅ Express setup, CORS, security
│       │
│       ├── jobs/
│       │   └── commissionRunScheduler.ts ✅ Hourly: closes due CommissionRuns,
│       │                                    sweeps them into a Settlement
│       │
│       ├── config/
│       │   ├── env.ts                 ✅ All environment values, resolved once
│       │   └── prisma.ts              ✅ THE TENANT GUARD — read this one
│       │
│       ├── middleware/
│       │   ├── authenticate.ts        ✅ JWT → tenant context
│       │   ├── authorise.ts           ✅ Permission and role gates
│       │   └── errorHandler.ts        ✅ One error shape for everything
│       │
│       ├── services/                  ── ALL BUSINESS LOGIC ──
│       │   ├── authService.ts         ✅ Login, registration, terms
│       │   ├── staffService.ts        ✅ Staff CRUD — User is not tenant-scoped,
│       │   │                             so restaurantId is filtered by hand here
│       │   ├── uploadService.ts       ✅ Cloudinary upload_stream, buffer in / URL out
│       │   ├── menuService.ts         ✅ Categories, products, variants, modifier groups
│       │   ├── orderService.ts        ✅ Pricing, idempotency, state machine
│       │   ├── kitchenService.ts      ✅ Station routing, print payload
│       │   ├── inventoryService.ts    ✅ Append-only stock ledger
│       │   ├── purchaseService.ts     ✅ Draft → received, writes the ledger
│       │   ├── billingService.ts      ✅ Invoice, payment, refund
│       │   ├── commissionService.ts   ✅ Accrual, reversal, settlement
│       │   ├── reportService.ts       ✅ Sales summary, revenue by day, top items
│       │   ├── websiteService.ts      ✅ Per-restaurant site and theme
│       │   └── settingsService.ts     ✅ resolveCharges() — Mezbaan tax/service-charge
│       │                                 math, called from orderService (estimate) and
│       │                                 billingService (binding, at invoice-issue time)
│       │
│       ├── controllers/
│       │   ├── authController.ts      ✅
│       │   ├── staffController.ts     ✅ Staff accounts + role listing (see staffService)
│       │   ├── settingsController.ts  ✅ Restaurant profile (name, contact, currency…)
│       │   ├── branchSettingsController.ts ✅ Mezbaan — one branch's business profile,
│       │   │                                 hours, tax mode, online ordering
│       │   ├── uploadController.ts    ✅ One image-upload endpoint, used by every form
│       │   ├── branchController.ts    ✅ Reference CRUD pattern — copy this
│       │   ├── menuController.ts      ✅ Categories, products, modifier groups
│       │   ├── tableController.ts     ✅ Dining tables (QR itself is qrController)
│       │   ├── orderController.ts     ✅
│       │   ├── kitchenController.ts   ✅
│       │   ├── inventoryController.ts ✅ Items, levels, ledger, adjustments
│       │   ├── supplierController.ts  ✅
│       │   ├── customerController.ts  ✅
│       │   ├── purchaseController.ts  ✅
│       │   ├── expenseController.ts   ✅
│       │   ├── paymentMethodController.ts ✅
│       │   ├── reportController.ts    ✅
│       │   ├── billingController.ts   ✅
│       │   ├── websiteController.ts   ✅
│       │   ├── platformController.ts  ✅ Super Admin
│       │   └── qrController.ts        ✅ QR scan → menu → order
│       │
│       ├── routes/index.ts            ✅ Three tiers: public / tenant / platform
│       ├── utils/
│       │   ├── apiResponse.ts         ✅ Response envelope + HttpError
│       │   ├── money.ts               ✅ ALL money arithmetic
│       │   ├── documentNumber.ts      ✅ LHR-01-20260812-0045
│       │   └── businessDate.ts        ✅ Timezone-aware calendar day, for
│       │                                 CommissionRun cycle windowing
│       └── types/express.d.ts         ✅ req.actor, req.db, req.tenantId
│
└── frontend/                          ── REACT + VITE + TS ──
    ├── netlify.toml                   ✅ Build + SPA redirect
    ├── tailwind.config.js             ✅ Design tokens
    │
    └── src/
        ├── main.tsx                   ✅
        ├── api/
        │   ├── client.ts              ✅ Axios, token, ApiError
        │   └── endpoints.ts           ✅ Every URL in one place
        ├── context/
        │   ├── AuthContext.tsx        ✅ User, permissions, can()
        │   └── NotificationContext.tsx ✅ Polls for new orders; sound + toast +
        │                                 browser notification, unread count
        ├── routes/                    ✅ AppRoutes, ProtectedRoute, navigation
        ├── layouts/                   ✅ DashboardLayout, PosLayout
        ├── components/
        │   ├── ui/                    ✅ Button, TextField, ImageUploadField, StatCard, Modal,
        │   │                             NotificationBell, …
        │   ├── shared/KitchenTicketCard.tsx  ✅ Signature component
        │   ├── website/               ✅ WebsiteEditorPage's 5 tabs, shared field
        │   │                             atoms, live preview
        │   └── settings/              ✅ Mezbaan's 4 tabs + PaymentMethodsManager,
        │                                 shared between MezbaanSettingsPage and the
        │                                 standalone PaymentMethodsPage
        ├── pages/
        │   ├── auth/                  ✅ Login, Register (with terms)
        │   ├── platform/              ✅ Dashboard, RestaurantList
        │   ├── restaurant/            ✅ Dashboard, Branches, Orders, Menu, Tables,
        │   │                             Inventory, Suppliers, Customers, Staff, Settings,
        │   │                             Mezbaan, PaymentMethods, Expenses, Reports,
        │   │                             WebsiteEditor ← the theme editor
        │   ├── pos/                   ✅ PosTerminal
        │   ├── kitchen/                ✅ KitchenDisplay
        │   ├── publicsite/            ✅ QrMenu, PublicSite (`/site/:slug`)
        │   └── errors/                ✅
        ├── styles/theme.css           ✅ Dark tokens, animations
        ├── utils/siteTheme.ts         ✅ Theme columns → colours, shared by
        │                                 PublicSitePage and QrMenuPage
        ├── types/api.ts               ✅ Mirrors the API
        └── utils/                     ✅ format, statusMeta
```

## Where to change what

| I need to change…                | File |
|---|---|
| Colours, animation               | `frontend/src/styles/theme.css` + `tailwind.config.js` |
| Sidebar links                    | `frontend/src/routes/navigation.ts` |
| An API URL                       | `frontend/src/api/endpoints.ts` |
| How totals are calculated        | `backend/src/utils/money.ts` |
| What order states are legal      | `backend/src/services/orderService.ts` → `ALLOWED_TRANSITIONS` |
| Who can do what                  | `backend/prisma/seed.ts` → `ROLE_MATRIX` |
| Default commission rate          | `backend/.env` → `PLATFORM_COMMISSION_VALUE` |
| How commission is charged        | `backend/src/services/commissionService.ts` |
| Tenant isolation rules           | `backend/src/config/prisma.ts` |
| A database table                 | `backend/prisma/schema.prisma`, then `npm run prisma:push` |

## Still to build

| Module | State |
|---|---|
| Desktop bridge (.exe) | Out of scope for this stack — a native app with printer/cash-drawer/offline-queue access, not a web build |
