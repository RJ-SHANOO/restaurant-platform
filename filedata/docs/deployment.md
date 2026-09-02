# Deployment

Three free services. Total cost to run and test: nothing.

```
Neon        →  PostgreSQL      free forever
Render      →  Node API        free tier
Netlify     →  React frontend  free
```

Deploy in this order. The frontend needs the API's URL, and the API needs the
database's URL, so working backwards means redoing steps.

---

## 1. Database — Neon

1. Sign up at [neon.tech](https://neon.tech) with GitHub.
2. Create a project. Region: pick the one nearest your customers.
3. From the dashboard, copy **both** connection strings:
   - the **pooled** one (has `-pooler` in the host) → `DATABASE_URL`
   - the **direct** one → `DIRECT_URL`

Prisma needs both: the pooled connection at runtime, the direct one for
migrations, which need a session they can hold open.

---

## 2. Push your code to GitHub

Make the repository **private** — `.env` is gitignored, but a private repo is
the right default for a commercial project.

```bash
git init
git add .
git commit -m "Restaurant platform"
git branch -M main
git remote add origin https://github.com/you/restaurant-platform.git
git push -u origin main
```

---

## 3. Backend — Render

1. Sign up at [render.com](https://render.com) with GitHub.
2. **New → Web Service** → pick your repository.
3. Render reads `backend/render.yaml`, so the build settings fill themselves in.
   Confirm: root directory `backend`, build `npm install && npm run build`,
   start `npm run start`.
4. Under **Environment**, add:

```
DATABASE_URL   = your Neon pooled string
DIRECT_URL     = your Neon direct string
FRONTEND_URL   = http://localhost:5173      (updated in step 5)
```

`JWT_SECRET` is generated automatically by the blueprint.

5. **Create Web Service**. First build takes 3–5 minutes.

Once it is live, create the tables. Open the Render **Shell** tab:

```bash
npx prisma db push
npm run seed
```

Check it: `https://your-api.onrender.com/health` should return JSON.

> **Free tier behaviour.** The service sleeps after 15 minutes idle and takes
> 30–50 seconds to wake. The first request after a quiet spell will feel broken
> but is not. Move to the $7 Starter plan before customers depend on it.

---

## 4. Frontend — Netlify

1. Sign up at [netlify.com](https://netlify.com) with GitHub.
2. **Add new site → Import an existing project** → pick the repository.
3. Build settings come from `frontend/netlify.toml`. Leave them.
4. Before deploying, open **Environment variables** and add:

```
VITE_API_BASE_URL    = https://your-api.onrender.com/api
VITE_PUBLIC_SITE_URL = https://your-site.netlify.app
```

You will not know the second value until after the first deploy. Deploy, copy
the URL Netlify gives you, set it here, then **Deploys → Trigger deploy**.

Vite reads environment variables at *build* time, not at run time, so changing
one always needs a fresh deploy to take effect.

---

## 5. Connect them

Back in Render, set:

```
FRONTEND_URL = https://your-site.netlify.app
```

Save. Render redeploys automatically.

Skip this and every request fails with a CORS error — the browser blocks a
call from an origin the API has not named. It is the most common deployment
failure and looks like a broken API rather than a configuration gap.

---

## 6. Before real customers

- [ ] **Change the seeded passwords.** `admin@platform.test` / `Password123` is
      now on the public internet.
- [ ] Delete the demo restaurants once you have real ones.
- [ ] Upgrade Render off the free tier so the API does not sleep.
- [ ] Set `PLATFORM_COMMISSION_VALUE` to the rate you actually intend to charge.
      Changing it later affects new registrations only — existing restaurants
      keep the terms they agreed to.

---

## Troubleshooting

**CORS error in the browser console**
`FRONTEND_URL` on Render does not match your Netlify URL exactly. It is
compared as a string: `https://x.netlify.app` and `https://x.netlify.app/` are
different values.

**`Can't reach database server`**
Neon suspends idle databases. The first connection after a quiet period can
time out; retry. If it persists, check that `DATABASE_URL` is the pooled string.

**Login works locally but not in production**
`VITE_API_BASE_URL` was set after the build. Trigger a fresh deploy.

**`Table does not exist`**
`prisma db push` was never run against the production database. Do it from the
Render shell.
