# Restaurant Platform

A multi-tenant restaurant SaaS. Restaurants register themselves, get a public
website in their own colours, add their branches, take orders through POS and
QR tables, feed the kitchen, bill the customer, and settle commission back to
the platform.

One Super Admin sits above every restaurant and sees all of it.

---

## Stack

| Layer | Technology | Hosting |
|---|---|---|
| Frontend | React 18 + Vite + TypeScript + Tailwind | Netlify — free |
| Backend | Node + Express + TypeScript | Render / Railway — free tier |
| Database | PostgreSQL + Prisma | Neon — free |

No PHP, no Composer, no local database server. Node and a Neon connection
string are the whole requirement.

---

## Setup

### 1. Database

Sign up at [neon.tech](https://neon.tech), create a project, and copy both
connection strings from the dashboard — the pooled one and the direct one.

### 2. Backend

```bash
cd backend
npm install
cp .env.example .env
```

Open `.env` and set:

```
DATABASE_URL="postgresql://…-pooler….neon.tech/…?sslmode=require"
DIRECT_URL="postgresql://…….neon.tech/…?sslmode=require"
JWT_SECRET="a long random string"
```

Generate the secret with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
```

Then create the tables and fill them:

```bash
npm run prisma:push
npm run seed
npm run dev
```

The API is on `http://localhost:8000`. Check `http://localhost:8000/health`.

### 3. Frontend

In a second terminal:

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

Open `http://localhost:5173`.

---

## Seeded accounts

Password for every account: `Password123`

| Email | Role | Lands on |
|---|---|---|
| `admin@platform.test` | Super Admin | Platform console |
| `owner@karahihouse.test` | Restaurant Owner | Restaurant dashboard |
| `manager@karahi-house.test` | Branch Manager | Restaurant dashboard |
| `cashier@karahi-house.test` | Cashier | POS |
| `kitchen@karahi-house.test` | Kitchen Staff | Kitchen display |
| `owner@cafemeridian.test` | Owner, second restaurant | Restaurant dashboard |

Sign in as both owners in turn. Neither can see the other's branches, orders or
revenue — not because the interface hides it, but because the query never
returns it.

---

## Commands

```bash
# Backend
npm run dev              # start with hot reload
npm run prisma:push      # apply the schema (development)
npm run prisma:migrate   # create a versioned migration
npm run prisma:studio    # browse the database in a GUI
npm run seed             # reload demo data
npm run db:reset         # wipe and reseed
npm run typecheck

# Frontend
npm run dev
npm run build
npm run typecheck
```

---

## Three rules the system rests on

**1. The tenant comes from the token, never from the request.**
A client can send `restaurantId: 7`. It is not read. Every tenant-scoped query
goes through a Prisma client already bound to the signed-in user's restaurant,
so a developer who forgets the filter still gets a filtered query.

**2. Prices come from the database, never from the client.**
The order endpoint has no price field. The POS says what was ordered; the
server reads what it costs.

**3. Financial records are never edited or deleted.**
A wrong charge gets a refund row. A wrong bill gets voided. Commission on a
refunded bill gets a negative entry. Nothing is overwritten, so the history
always reconciles.

---

## Documentation

| File | Contents |
|---|---|
| [`PROJECT_STRUCTURE.md`](PROJECT_STRUCTURE.md) | Full file tree, and where to change what |
| [`docs/architecture.md`](docs/architecture.md) | Design decisions and data flow |
| [`docs/deployment.md`](docs/deployment.md) | Neon + Render + Netlify, step by step |
| [`docs/api.md`](docs/api.md) | Endpoint reference |
