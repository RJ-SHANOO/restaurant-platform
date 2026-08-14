# API Reference

Base URL: `http://localhost:8000/api`

## Envelope

```jsonc
{ "success": true,  "message": "…", "data": {},  "meta": {} }
{ "success": false, "message": "…", "errors": { "field": ["…"] } }
```

`200` ok · `201` created · `401` not signed in · `403` no permission ·
`404` not found (or scoped away) · `409` conflict · `422` validation ·
`429` rate limited

Authenticated requests send `Authorization: Bearer {token}`.

---

## Public — no token

| Method | Path | Notes |
|---|---|---|
| POST | `/public/auth/login` | `email`, `password`, `restaurantSlug?` · 8/min |
| POST | `/public/auth/register-restaurant` | See below · 5/10min |
| GET | `/public/platform-terms` | The commission a new restaurant would get |
| GET | `/public/sites/:slug` | A restaurant's public website content |
| GET | `/public/qr/:qrToken` | Resolves table → restaurant, branch, menu |
| POST | `/public/qr/:qrToken/orders` | Places the order · 12/min |

**`POST /public/auth/register-restaurant`**

```json
{
  "restaurantName": "Karahi House",
  "ownerName": "Umair Ghafoor",
  "email": "owner@karahihouse.com",
  "phone": "03001234567",
  "password": "Password123",
  "city": "Lahore",
  "acceptsTerms": true
}
```

There is no commission field. The rate is read from config, fixed onto the
restaurant, and echoed back as `agreedTerms`. A value sent here is ignored.

Registration creates in one transaction: the restaurant, a main branch, the
owner account, an unpublished website, a cash payment method, a starter
category and a kitchen station.

---

## Tenant — signed in

| Method | Path | Permission |
|---|---|---|
| GET | `/me` | authenticated |
| POST | `/auth/logout` | authenticated |
| GET | `/branches` | `branches.view` |
| POST | `/branches` | `branches.create` |
| GET/PUT/DELETE | `/branches/:id` | `branches.view` / `.update` / `.delete` |
| GET | `/orders` | `orders.view` — `?status` `?liveOnly` `?channel` `?date` |
| POST | `/orders` | `orders.create` |
| GET | `/orders/:id` | `orders.view` |
| POST | `/orders/:id/transition` | varies by target status |
| POST | `/orders/:orderId/invoice` | `billing.issue` |
| GET | `/invoices/:id` | `billing.view` |
| POST | `/invoices/:id/payments` | `billing.collect` |
| POST | `/invoices/:id/refunds` | `billing.refund` |
| GET | `/kitchen/board` | `kitchen.view` |
| PATCH | `/kitchen/tickets/:id/status` | `kitchen.updateStatus` |
| GET | `/kitchen/tickets/:id/print-payload` | `kitchen.view` |
| GET | `/website` | `website.view` |
| PUT | `/website` | `website.update` |
| PATCH | `/website/published` | `website.update` |
| POST | `/tables/:id/rotate-qr` | `tables.update` |

**`POST /orders`**

```json
{
  "branchId": 1,
  "diningTableId": 12,
  "orderType": "dine_in",
  "idempotencyKey": "8f14e45f-ceea-467a-9a1b-1c8f4a9e1234",
  "items": [
    { "productId": 5, "quantity": 2, "kitchenNote": "No onion" },
    { "productId": 9, "quantity": 1, "productVariantId": 3, "modifierIds": [7] }
  ]
}
```

No `unitPrice`, and there never will be. Replaying the same `idempotencyKey`
returns the original order rather than creating a second one.

**`POST /orders/:id/transition`**

```json
{ "status": "confirmed" }
{ "status": "cancelled", "reason": "Customer left" }
```

`reason` is required for `cancelled` and `voided`. An illegal move returns
`422` listing the legal options.

**`PUT /website`**

```json
{
  "primaryColor": "#F5A524",
  "secondaryColor": "#3DD68C",
  "backgroundShade": "dark",
  "fontFamily": "Sora",
  "layoutStyle": "bold",
  "logoUrl": "https://…/logo.png",
  "tagline": "Charcoal grill since 1998",
  "showMenu": true,
  "showBranches": true
}
```

Every value is checked against a fixed set. Free-form CSS is not accepted —
arbitrary styles on a page the platform serves is a route to both broken
layouts and script injection.

---

## Platform — Super Admin only

| Method | Path |
|---|---|
| GET | `/platform/dashboard` |
| GET | `/platform/restaurants` |
| GET | `/platform/restaurants/:id` |
| PATCH | `/platform/restaurants/:id/commercial-terms` |
| PATCH | `/platform/restaurants/:id/status` |
| POST | `/platform/restaurants/:id/settle` |
| GET | `/platform/settlements` |

Header `X-View-Restaurant-Id: {id}` lets a platform admin scope any tenant
endpoint to one restaurant. Honoured for platform admins only.
