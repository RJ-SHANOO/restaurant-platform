# CLAUDE.md

Read this before touching anything. It is the contract for this codebase.

---

## What this is

A multi-tenant restaurant SaaS. Independent restaurants sign up themselves, get
a public website in their own colours, add branches, take orders through a POS
and QR tables, feed a kitchen display, bill customers, and pay the platform a
commission. One Super Admin sits above every restaurant.

It is **not** a single-restaurant POS. Every record belongs to a tenant, and one
restaurant must never see another's data.

### Stack

| Layer    | Technology                              |
| -------- | --------------------------------------- |
| Backend  | Node + Express + TypeScript + Prisma    |
| Database | PostgreSQL (Neon)                       |
| Frontend | React 18 + Vite + TypeScript + Tailwind |
| Auth     | JWT (stateless)                         |

Hosting target: Neon (free) + Render (free tier) + Netlify (free).

---

## The five rules

These are not preferences. Breaking any of them is a bug, however clean the
code looks afterwards.

### 1. The tenant comes from the token, never from the request

`src/config/prisma.ts` exports `tenantClient(restaurantId)` — a Prisma client
that injects the tenant filter into every read and the tenant id into every
write.

- Controllers use **`req.db`**, never the imported `prisma`.
- Two legitimate exceptions, both deliberate: `authenticate.ts` (must find a
  user before a tenant exists) and `platformController.ts` (whose entire
  purpose is reading across tenants — which is why that route is gated on
  `requirePlatformAdmin`).
- A cross-tenant read returns **404, not 403**. Confirming a record exists but
  belongs to someone else is itself a disclosure.

**Do not "simplify" the tenant guard.** It looks like ceremony. It is the
security model.

### 2. Prices come from the database, never from the client

`CreateOrderInput` has no price field and must never gain one. The client says
what was ordered; `orderService` reads what it costs from the product row and
the branch's tax settings.

If you find yourself adding `unitPrice` to a request schema, stop.

### 3. Financial records are never updated or deleted to fix a mistake

| Mistake                       | Correction                   |
| ----------------------------- | ---------------------------- |
| Wrong charge                  | A `Refund` row               |
| Wrong bill                    | Status → `void`              |
| Commission on a refunded bill | A negative `CommissionEntry` |
| Wrong stock count             | An `InventoryTransaction`    |

Never `payment.update({ amount })`. Never `commissionEntry.delete()`. Write a
compensating row so the history reconciles.

### 4. Money is `Prisma.Decimal`, never `number`

All arithmetic goes through `src/utils/money.ts`. `0.1 + 0.2 !== 0.3` in binary
floating point, and a fraction of a rupee drifting per line becomes a bill that
does not match what the card machine charged.

`Number(x)` is fine when **serialising for JSON output**. It is not fine for
calculating.

### 5. Kitchen output carries no prices — structurally

`KitchenTicket` and `KitchenTicketItem` have no money columns. Do not add any.
The guarantee is that no template change can leak a total onto the pass,
because there is nothing to leak.

---

## Layout

```
backend/src/
  config/prisma.ts       ← THE TENANT GUARD. Read this first.
  config/env.ts          ← All environment values, resolved once at boot
  middleware/            ← authenticate (JWT→tenant), authorise, errorHandler
  services/              ← ALL business logic lives here
  controllers/           ← Validate input, call a service, serialise output
  routes/index.ts        ← Three tiers: /public, tenant, /platform
  utils/                 ← apiResponse, money, documentNumber

frontend/src/
  api/endpoints.ts       ← Every URL. Nothing builds URLs by hand.
  api/client.ts          ← Axios, token store, ApiError
  context/AuthContext.tsx← user, can(), canAny()
  pages/                 ← One folder per area
  components/ui/         ← Button, TextField, StatCard, StatusPill, …
  styles/theme.css       ← Design tokens
```

**Controllers stay thin.** Validate with Zod, call a service, serialise. If a
controller is doing arithmetic or orchestrating multiple writes, that logic
belongs in a service.

**`branchController.ts` is the reference CRUD pattern.** Copy its shape for new
resources: index / show / store / update / destroy, Zod schema at the top, a
`serialiseX` function at the bottom.

---

## Conventions

- **camelCase everywhere** — TypeScript fields, JSON keys, query params. The
  database uses snake_case via Prisma's `@map`; that stays inside Prisma.
- **Validation is Zod, in the controller.** Never trust a request body.
- **Errors are thrown, not returned.** Use `HttpError.notFound()`,
  `.forbidden()`, `.validation({ field: ['message'] })`. `errorHandler` renders
  them into the envelope.
- **Response envelope**: `{ success, message, data, meta }`. Use the helpers in
  `utils/apiResponse.ts`; never call `res.json()` directly.
- **Every multi-write operation runs in `prisma.$transaction`.** An order that
  half-creates is worse than one that fails.
- **Soft delete** (`deletedAt`) for catalog and people. **Never** for orders,
  invoices, payments, refunds, commission entries or inventory transactions.

### Writing style for user-facing strings

Plain, specific, no exclamation marks. Say what happened and what to do.

- Good: `"That branch has 3 orders still in service. Close them first."`
- Bad: `"Error! Operation failed!"`

### Comments

Comment **why**, not what. A comment that restates the code is noise. A comment
explaining a non-obvious constraint — why tax applies to the service charge, why
the tenant check returns 404 — earns its place.

---

## Current state

### Working

Auth and JWT · tenant isolation · roles and permissions · restaurant
self-registration · branches · menu management (categories, products,
variants, modifier groups) · tables & QR printing · orders with the full
state machine · POS · QR table ordering · kitchen display · billing
(invoice, payment, refund) · commission accrual and settlement · inventory
(items, stock levels, ledger, manual adjustments) · suppliers & purchases
(draft → received) · payment method configuration · expenses · reports
(sales summary, revenue by day, top items, payment breakdown) · the
restaurant's own public site at `/site/:slug` · website theme editor ·
customers · staff & roles · settings · image upload (Cloudinary) ·
Super Admin console.

### Not built

- Desktop bridge (printers, cash drawer, offline queue) — a native app
  outside this Node + React stack, not something built here

---

## Definition of done

A change is not finished until:

1. `cd backend && npx tsc --noEmit` passes
2. `cd frontend && npm run typecheck` passes
3. New endpoints are added to `frontend/src/api/endpoints.ts`
4. New tenant-scoped queries use `req.db`
5. `PROJECT_STRUCTURE.md` reflects any new file or folder

---

## Working agreement

- **One module at a time.** Do not attempt several areas in one pass. Finish
  menu management, typecheck it, report back, then move on.
- **Report before large refactors.** If a change touches the tenant guard, the
  money utilities, the order state machine, or the Prisma schema, explain what
  and why before doing it.
- **Do not add dependencies** without saying which and why. The current set is
  deliberate and small.
- **Do not rename or restructure folders.** The separate-files layout is a
  requirement from the project owner, not an accident.
- **If a rule above blocks something the user asked for**, say so and explain
  the trade-off. Do not quietly work around it.

## Billing Model (inviolable)

Revenue = fixed monthly subscription + commission on platform-originated
orders only (source: QR, WEB, DELIVERY). POS/dine-in = never commissionable.

Commission SETTLEMENT CYCLE is per-tenant, chosen at onboarding:
DAILY -> settle every business_date close
EVERY_3D -> rolling 3 business_date window
WEEKLY -> 7 business_date window
Store as Tenant.commissionCycle enum + cycle_anchor_date.
Cycle change applies to NEXT cycle only; never re-slices a closed period.

CommissionRun table: (tenant_id, cycle_start, cycle_end) UNIQUE + row lock.
Orders join a run by business_date, NOT created_at (late offline sync must
land in its original cycle; if that run is CLOSED, emit an adjustment row
into the current open run referencing the old cycle).

Commission rows append-only. Reversal = negative row with reverses_id.
Never UPDATE/DELETE. Money = integer minor units. Rate snapshotted on order.

The owner is a doctor who also builds software, communicates in Roman Urdu
mixed with English, and will maintain this himself. Favour clarity over
cleverness — code he can read in six months beats code that saves four lines.

## POS Module — Standing Mandate

### READ THIS FIRST

A working POS module ALREADY EXISTS in this repo. It is not a stub, not a plan,
not a placeholder. It has routes, services, Prisma models, migrations, React
screens, and an offline queue already written and already in use.

Your job is to UNDERSTAND it, then make it fully reliable and efficient.
Your job is NOT to build a POS.

Before you write a single line:

- Find the existing POS code. Read all of it — backend routes, services,
  controllers, Prisma models, frontend screens, hooks, stores, IndexedDB queue.
- Read the existing order lifecycle and KDS flow from the actual code. The real
  statuses are in the codebase. Do not invent a new state machine.
- Read the existing auth + tenant scoping middleware and the five existing roles.
- Read the existing money/tax/discount calculation code before changing it.

If you catch yourself creating a model, service, endpoint, or component that
sounds like something a POS would need — STOP and search the repo first. It
probably already exists under a different name. Extend it. Never duplicate it.
Never rewrite the project. Never delete working functionality.

### Inviolable rules

1. Tenant identity comes from the JWT only. Never trust restaurantId/branchId/
   tenantId from body, query, or headers.
2. Prices, discounts, taxes, and totals are computed server-side from the DB.
   Client money values are inputs to validate, never values to trust.
3. Financial records are append-only. No hard deletes of payments, refunds,
   invoices, or completed orders — reverse via status + reversal rows + audit log.

### Non-negotiables

- No floating-point money. Integer minor units or Decimal, end to end.
- One server-side calculation function is the source of truth for totals.
- Order status transitions enforced server-side using the EXISTING lifecycle.
  Invalid transitions return a clear error.
- Every mutating POS operation is idempotent (idempotencyKey). Assume every
  request arrives twice: double-clicked Pay, network retry, offline replay.
- Unique constraints prevent duplicate KOTs and duplicate payments.
- Prisma transactions for anything multi-step: payment + order status, KOT +
  confirm, table claim, refund.
- Optimistic locking for concurrent order edits and table claims.
- Permission-gate: refund, void, discount override, price override, order
  cancellation, payment reversal. Reuse the existing roles.
- Offline uses the EXISTING IndexedDB queue + idempotencyKey. Extend it, don't
  replace it. Never mark a payment completed offline — queue it as pending.
- Audit log every sensitive action: user, restaurant, branch, action, entity,
  entity ID, timestamp, metadata.
- Structured errors to the client. Never stack traces, DB errors, or internals.
  Never swallow an error silently.
- Strict TypeScript, no `any` without a justifying comment.
- Additive migrations only. Flag anything destructive before running it.
- No mocks, stubs, or TODOs in core POS paths. Don't touch unrelated modules.

### Working method

Before any stage: state what you found in the EXISTING code, what you'll change,
exact files affected, DB changes, and risks. Wait for approval on structural changes.
After any stage: run tsc, run lint, run tests, verify migrations apply, re-read
your own code, fix what you find. Report pass/fail. Never stop at "code generated."

### First task — audit only, change nothing

Read the existing POS end to end. Then report:

- How the current POS actually works, file by file
- Every POS feature marked WORKS / PARTIAL / BROKEN / MISSING
- Bugs and wrong calculations, with file + line
- Security findings ranked by severity, with file + line
- Concurrency gaps where double-submit or offline replay can corrupt data
- Required DB / API / frontend changes, additive vs. breaking
- An ordered plan of independently shippable stages

Then stop and wait for approval.
