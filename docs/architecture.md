# Architecture

```
                   ┌──────────────────────────────┐
                   │      React (Netlify)         │
                   │  platform · admin · POS ·    │
                   │  kitchen · public QR site    │
                   └──────────────┬───────────────┘
                                  │ Bearer JWT
                   ┌──────────────▼───────────────┐
                   │   Express API (Render)       │
                   │  middleware → controller →   │
                   │  service → Prisma            │
                   └──────────────┬───────────────┘
                                  │
                        ┌─────────▼─────────┐
                        │ PostgreSQL (Neon) │
                        └───────────────────┘
```

---

## 1. Multi-tenancy

**Shared database, shared schema, `restaurantId` on every row, enforced by a
Prisma client extension.**

Laravel had a global scope that silently added the filter to every query.
Prisma has no equivalent, so `src/config/prisma.ts` builds one:

```ts
const db = tenantClient(restaurantId);
```

Every `findMany`, `findFirst`, `count`, `updateMany` and `deleteMany` on a
tenant-scoped model gets `restaurantId` merged into its `where`. Every `create`
gets it merged into `data`. `update` and `delete` verify ownership before
touching the row.

The property that matters: **isolation is not each query's responsibility**. A
developer who forgets the filter still gets a filtered query.

Controllers use `req.db`, never the bare `prisma` import. The two places that
legitimately use `prisma` directly are authentication (which must find a user
before a tenant exists) and the platform controller (whose whole purpose is
reading across tenants — which is why that route is gated on
`requirePlatformAdmin`).

**A cross-tenant read reports 404, not 403.** Confirming that a record exists
but belongs to someone else is itself a disclosure.

### Why not a database per tenant

At 100 restaurants that is 100 migration runs per deploy, and cross-tenant
platform reporting becomes an aggregation nightmare. Shared schema with
enforced scoping gives the same isolation guarantee with one migration path —
provided the enforcement is genuinely automatic, which is what the extension
above is for.

---

## 2. Roles

| Role | `restaurantId` | `branchId` | Sees |
|---|---|---|---|
| Super Admin | `null` | `null` | Everything, across tenants |
| Restaurant Owner | set | `null` | One restaurant, all branches |
| Branch Manager | set | set | One branch |
| Cashier | set | set | One branch: orders and billing |
| Kitchen Staff | set | set | Tickets only — no prices, no customers |

Permissions are slugs (`orders.void`, `billing.refund`) in a many-to-many with
roles. Adding a capability means adding a slug to `ROLE_MATRIX` in the seed, not
inventing a bespoke check inside a controller.

The Super Admin role holds **no permission rows at all**. Platform admins are
recognised by `restaurantId === null` and granted everything implicitly, so
there is no list to fall out of date as permissions are added.

**Frontend guards are convenience, not security.** `can()` hides controls a user
cannot use; the API re-checks every permission on every request regardless.

---

## 3. The restaurant's own website

This is the module that makes the platform a platform rather than a POS.

Registration creates a `RestaurantWebsite` row immediately, unpublished. The
owner opens **Appearance**, picks colours, a font, a layout and a logo, and
publishes. `GET /public/sites/:slug` then serves that content to anyone.

The theme is **discrete columns, not a JSON blob** — so a bad value is rejected
on the way in, and a colour can be queried or reported on later.

Values are validated against fixed sets. Free-form CSS is deliberately not
accepted: a restaurant pasting arbitrary styles into a page the platform serves
is a route to both broken layouts and script injection.

The public endpoint returns only what a stranger should see: theme, menu, branch
addresses. No staff, no revenue, and **no QR tokens** — a table's token is its
credential and must never appear on a public page.

---

## 4. Orders

```
   QR scan ─┐
            ├─► pending ──► confirmed ──► preparing ──► ready ──► served ──► completed
   POS ─────┘      │            │             │           │          │
                   └────────────┴─────────────┴───────────┘          │
                              cancelled                           voided
```

`ALLOWED_TRANSITIONS` in `orderService.ts` is the whole machine, as data.
`transition()` is the only place a status changes, and it validates the move,
writes a history row (who, when, why), then runs that transition's side effects:

- **→ confirmed** creates kitchen tickets and commits inventory
- **→ cancelled / voided** cancels tickets, reverses inventory, frees the table
- **→ completed** frees the table

There is no path from `pending` to `completed` that skips the kitchen.

### Idempotency

The POS sends an `idempotencyKey` with every order. Replaying it returns the
original rather than creating a second one. This is what makes an offline queue
safe to flush twice — the failure mode it prevents is double-charging a
customer after a reconnect.

---

## 5. Money

**Nothing financial is ever updated or deleted to fix a mistake.**

| Mistake | Correction |
|---|---|
| Wrong charge | A refund row |
| Wrong bill | Status → `void` |
| Commission on a refunded bill | A negative commission entry |
| Wrong stock count | An inventory transaction |

`Prisma.Decimal` throughout, never `Float`. 0.1 + 0.2 is not 0.3 in binary
floating point, and a drift of a fraction of a rupee per line becomes a bill
that does not match what the card machine charged.

`utils/money.ts` computes every total, in this order:

```
subtotal − discount                = taxable base
+ service charge (% of base)
+ tax (% of base + service)
+ delivery + tip
= grand total
```

Tax applies to the service charge because that is how it is assessed here. Each
component is rounded once as it is computed, so the printed lines always sum to
the printed total.

### Commission

```
Bill fully paid  ──► CommissionEntry (charge, pending)
Refund issued    ──► CommissionEntry (reversal, negative, proportional)
Settlement run   ──► entries marked settled and linked
```

Commission accrues **only** on fully-paid, non-void bills. Cancelled and unpaid
orders never generate platform revenue.

The rate is **snapshotted onto each entry**, not referenced. Change a
restaurant's rate tomorrow and last month's books do not move.

Registration fixes the rate from config (`PLATFORM_COMMISSION_VALUE`). The
restaurant sees it before agreeing and cannot propose its own — there is no
commission field on the registration endpoint. The Super Admin can renegotiate
later; that affects entries written from then on.

---

## 6. Kitchen

One ticket per station per order, routed by category. A category with no station
mapping falls into a single default ticket, so a restaurant that has not
configured stations still works on day one.

**Kitchen output carries no prices — structurally.** `KitchenTicket` and
`KitchenTicketItem` have no money columns at all, so no template change can leak
a total onto the pass.

Each ticket's clock is set by its slowest dish, and urgency is banded
(`on_time` / `warning` / `overdue`) so the display and the printer agree on what
counts as late.

---

## 7. Inventory

A ledger, not a counter.

```
inventoryTransactions   append-only, signed deltas, balance snapshot
        │
        └──► branchInventoryLevels   cached projection, rebuildable
```

Nothing writes an absolute quantity. A sale appends a negative row; a
cancellation appends a positive one. If the cache drifts, replaying the ledger
rebuilds it exactly — which a bare counter column could never offer.

---

## 8. QR ordering

```
Table row → qrToken (48 random chars, rotatable)
                │
Customer scans  ▼
      GET  /public/qr/{token}          → restaurant + branch + table + menu
      POST /public/qr/{token}/orders
```

The customer never enters a table number and **cannot** — the request body has
no table field. The token is the credential.

`rotateQrToken` invalidates every printed code for a table in one call, for when
a code leaks or a table is re-laid.

Orders arrive as `pending`; a cashier still confirms them. That stops a
passer-by from flooding a kitchen with orders nobody intends to pay for.

---

## 9. Decisions, and what they cost

| Decision | Why | Trade-off accepted |
|---|---|---|
| Prisma extension for tenancy | One place to audit; automatic | A bug there is catastrophic — hence 404-not-403 and explicit ownership checks |
| Shared schema | One migration path; easy platform reporting | Every tenant-scoped query must go through `req.db` |
| Copy product name onto order items | A receipt must read correctly in five years | Denormalised; a rename does not propagate to history (correct) |
| Ledger inventory | Full traceability, rebuildable | More rows than a counter |
| Theme as columns, not JSON | Validatable, queryable | A new theme field is a migration |
| Commission on payment, not order | Cancelled orders never create phantom revenue | Revenue recognised later than order date |
| Email unique per tenant | One person can hold accounts at two restaurants | Login may need a restaurant hint for duplicates |
| Stateless JWT | No session store, scales trivially | No instant revocation; a denylist is a later decision |
