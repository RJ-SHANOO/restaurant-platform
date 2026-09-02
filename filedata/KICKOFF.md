# Kickoff prompt

Paste the block below into Claude Code, in this project's folder.

---

```
CLAUDE.md padho pehle — wo is project ka contract hai. Phir README.md,
PROJECT_STRUCTURE.md aur docs/architecture.md.

Uske baad poora codebase analyse karo: backend/src ki har file, backend/prisma/schema.prisma,
aur frontend/src ki har file. Mujhe batao tumne kya samjha — ek paragraph mein,
lambi list nahi.

PHIR RUK JANA. Aage ka kaam phase mein karna hai, ek saath nahi.

PHASE 1 — chalao
  1. backend aur frontend dono mein: npm install
  2. dono mein .env.example se .env banao
  3. backend: npx prisma generate
  4. backend: npx tsc --noEmit          → saare type errors theek karo
  5. frontend: npm run typecheck        → saare type errors theek karo

  Ye code Prisma client generate kiye baghair likha gaya tha, is liye type
  errors ki tawaqqo hai — khaas kar jahan `as never` ya `Record<string, any>`
  likha hai. Unhe asli Prisma types se replace karo.

  Neon ka connection string main dunga. Us step pe ruk kar mujh se maang lena.

  Phase 1 khatam hone pe batao kya kya theek kiya. Phir ruk jana.

PHASE 2 — menu management
  Categories, products, variants, modifiers ka poora CRUD.
  Backend: service + controller + routes, branchController.ts ka pattern copy karke.
  Frontend: pages/restaurant/MenuPage.tsx
  Sab kuch req.db se, kabhi seedha prisma se nahi.
  Typecheck saaf karke batao. Phir ruk jana.

PHASE 3 — tables aur QR
  Tables ka CRUD, QR code image generate karna (qrcode package), print layout.
  Frontend: pages/restaurant/TablesPage.tsx
  Typecheck saaf karke batao. Phir ruk jana.

PHASE 4 — public website renderer
  Route /site/:slug jo GET /public/sites/:slug se data leta hai aur restaurant
  ke apne colors, font aur layout mein render karta hai.
  Ye sab se ahem missing feature hai.
  Typecheck saaf karke batao. Phir ruk jana.

PHASE 5 — inventory, payments config, expenses ki UI
PHASE 6 — reports

USOOL (ye tornay nahi):
  - req.db istemal karo, prisma nahi
  - order request mein price ka field kabhi mat daalo
  - financial rows kabhi update/delete mat karo — compensating row likho
  - kitchen models mein paisa kabhi mat daalo
  - folders rename ya restructure mat karo
  - naya package add karne se pehle poochho

Har phase ke baad ruk kar batao. Sab ek saath mat karna.
```

---

## Neon connection string

Phase 1 mein Claude Code rukega aur connection string maangega.

1. [neon.tech](https://neon.tech) pe GitHub se sign up
2. Project banao
3. Dashboard se **do** strings copy karo:
   - pooled (host mein `-pooler` hoga) → `DATABASE_URL`
   - direct → `DIRECT_URL`

Dono `backend/.env` mein daalne hain.

JWT secret is command se:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
```

Phir:

```bash
cd backend
npm run prisma:push
npm run seed
npm run dev
```
