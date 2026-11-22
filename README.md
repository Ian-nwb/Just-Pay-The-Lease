# JPTL

**Rental property operations for landlords, their staff and their residents.** JPTL brings rent collection, leases, documents, maintenance and messaging into one system, with a separate console for platform administrators.

| Who | What they do in JPTL |
| --- | --- |
| **Landlords** | Manage properties and units, run the rent roll, review payments, split utility bills, publish building policies, sign documents, see income reports and export CSVs. |
| **Property managers** | Work the rent roll, tickets and tenant requests for the buildings they're assigned to. |
| **Technicians** | See and update the maintenance tickets assigned to them, and message the landlord and the affected residents. |
| **Residents (tenants)** | Pay rent (QR, bank, e-wallet or onsite, with receipt review), report repairs with photos, sign documents, request renewals or IOUs, and message their landlord and building staff. |
| **Superadmin** | Oversees accounts, properties, sessions and the audit trail from a separate console. |

---

## Contents

- [Features](#features)
- [Tech stack](#tech-stack)
- [Repository layout](#repository-layout)
- [Getting started](#getting-started)
- [Demo accounts](#demo-accounts)
- [Testing](#testing)
- [Deployment](#deployment)
- [Documentation](#documentation)
- [Project status](#project-status)

---

## Features

**Rent and money**
- Rent roll with paid, partially paid, overdue and in-review invoices; landlords approve transfer receipts and onsite payments.
- Partial payments, audited reversals and corrections, and resident IOU requests.
- Shared-meter utility billing: enter the real bill, review an exact split, post one invoice per unit, with no double charging against rent.
- **Reports:** monthly income by property, plus CSV exports of the rent roll, income summary, tenant directory, maintenance tickets and utility bills.

**Leases and documents**
- Leases with property-timezone date rules, renewal windows, early-termination requests and move-out.
- Document upload and review; building policies published per property.
- **Signatures for both sides:** drag signature boxes onto any PDF; landlord and resident draw or upload their signature; a signed copy is generated with the signatures stamped in, and the original is kept.

**Maintenance and communication**
- Repair tickets with photos, priority, technician assignment and status history.
- Messaging scoped to who should talk: residents reach their landlord, their building's property managers and the technicians on their tickets.
- In-app, push and opt-in email-digest notifications; rent and lease-end reminders; resident quiet hours.

**Security and access**
- Role- and property-scoped data on the server; staff only see their assigned buildings.
- Separate sign-in pages for landlords/staff and residents.
- Optional two-factor sign-in: authenticator app or email codes (Superadmin: authenticator).

---

## Tech stack

| Part | Built with |
| --- | --- |
| `apps/client` | React 19, Vite, Tailwind CSS v4, Framer Motion, Lucide icons (landlord, staff and resident web app, installable as a PWA) |
| `apps/superadmin` | React 19, Vite, Tailwind CSS v4 |
| `apps/server` | Node.js, Express 5, MongoDB with Mongoose, JWT auth, Cloudinary file storage, Nodemailer, Web Push, `pdf-lib` |
| Tests | Jest + Supertest (API), Playwright (browser), Newman/Postman (API collections) |

The visual design system (IBM Plex type, slate surfaces, navy brand, emerald actions, light and dark themes) is documented in [`DESIGN.md`](DESIGN.md); tokens live in `apps/client/src/theme.css`.

---

## Repository layout

```text
JPTL/
├── apps/
│   ├── client/        # Landlord, staff and resident web app (Vite + React)
│   ├── superadmin/    # Platform administrator console (Vite + React)
│   └── server/        # REST API (Express + MongoDB)
│       └── scripts/   # Demo seed, safe reset, superadmin creation
├── docs/
│   ├── modules/       # How each feature area works
│   ├── architecture/  # Requirements, ERD, architecture notes
│   ├── deployment/    # Vercel, AWS and environment guides
│   ├── testing/       # Test plans, guides and coverage
│   ├── plans/         # Roadmap, on-hold items, implementation plans
│   └── credentials.md # Demo accounts
├── tests/             # Playwright specs and Postman collections
├── docker/            # Docker setup
├── scripts/           # Load testing
├── DESIGN.md          # Design system
├── PRODUCT.md         # Product context, users and principles
└── docker-compose.yml
```

Git-ignored, local only: `database/` (database backups; they contain personal data) and `archive/` (old build artifacts).

---

## Getting started

### Prerequisites

- Node.js 20 or newer (developed on Node 24)
- A MongoDB database (local, or MongoDB Atlas)
- Optional: a Cloudinary account (file uploads), SMTP credentials (email), VAPID keys (push notifications)

### 1. Install

```bash
git clone <repository-url> JPTL
cd JPTL
npm install                      # root test tooling
npm install --prefix apps/server
npm install --prefix apps/client
npm install --prefix apps/superadmin
```

### 2. Configure

Copy each example file and fill it in:

```bash
cp apps/server/.env.example apps/server/.env
cp apps/client/.env.example apps/client/.env
cp apps/superadmin/.env.example apps/superadmin/.env
```

The server needs at least `MONGO_URI`, `JWT_SECRET` and `CLIENT_URL` (the client and superadmin URLs, comma-separated). Uploads need the `CLOUDINARY_*` keys and email needs `SMTP_*`. The optional settings at the bottom of `.env.example` cover reminders, cron, encryption keys and PayMongo (on hold).

> **Use a separate development database.** The reset and seed scripts below replace data. Never point a local `.env` at production.

### 3. Run

In three terminals:

```bash
npm run dev --prefix apps/server      # API on http://localhost:8000
npm run dev --prefix apps/client      # Web app on http://localhost:5173
npm run dev --prefix apps/superadmin  # Superadmin on http://localhost:5174
```

Both frontends proxy `/api` to the API. The reminder scheduler is off locally unless `REMINDERS_ENABLED=true`, so a local server never messages real residents.

### 4. Load demo data (optional)

```bash
cd apps/server
node scripts/create-superadmin.js   # once, if you have no superadmin yet
npm run seed:demo                   # refuses to run if landlord data already exists
```

To start over, back up first, preview, then reset (keeps superadmin accounts only):

```bash
mongodump --uri="$MONGO_URI" --archive=../../database/backup-$(date +%Y%m%d-%H%M%S).archive.gz --gzip
npm run reset:dry-run
RESET_ALL_CONFIRM=1 node scripts/reset-except-superadmin.js --execute --confirm-database <db-name> --backup ../../database/<backup-file>
npm run seed:demo
```

---

## Demo accounts

After `npm run seed:demo`, every account uses the password `Password123!`:

| Role | Email | Sign in at |
| --- | --- | --- |
| Landlord | `landlord@jptl.dev` | `/login` |
| Property manager | `pm@jptl.dev` | `/login` |
| Technician | `tech@jptl.dev` | `/login` |
| Residents | `sophia@`, `liam@`, `david@`, `miguel@`, `ana@`, `elena@jptl.dev` | `/tenant-login` |
| Superadmin | `superadmin@jptl.sys`, password from `SUPERADMIN_PASSWORD` when you run `create-superadmin.js` (defaults to `admin123`; change it outside local development) | Superadmin app |

[`docs/credentials.md`](docs/credentials.md) lists what each demo account is set up to show (overdue rent, items awaiting review, a lease ending soon, and so on).

---

## Testing

Run these against a separate test database only.

```bash
npm run test:integration   # Jest + Supertest API tests (in-memory MongoDB)
npm run test:e2e           # Playwright browser tests
npm run test:postman       # Newman API collections (needs a running API and test accounts)
npm run test:all           # all of the above
npm run lint --prefix apps/client
```

Guides and coverage notes are in [`docs/testing/`](docs/testing/).

---

## Deployment

- **Frontends:** Vercel (see [`docs/deployment/vercel-deployment-checklist.md`](docs/deployment/vercel-deployment-checklist.md)).
- **API:** Docker or AWS (see [`docs/deployment/`](docs/deployment/)); environment variables are explained in [`docs/deployment/cloud-deployment-env-guide.md`](docs/deployment/cloud-deployment-env-guide.md).
- On serverless hosts the in-process reminder scheduler doesn't run; set `CRON_SECRET` and call `GET /api/internal/jobs/reminders` with `Authorization: Bearer <CRON_SECRET>` on a schedule.
- Set `TWO_FACTOR_ENCRYPTION_KEY` before going live, so rotating `JWT_SECRET` later doesn't invalidate saved two-factor setups.

---

## Documentation

| Topic | Where |
| --- | --- |
| Product, users and principles | [`PRODUCT.md`](PRODUCT.md) |
| Design system | [`DESIGN.md`](DESIGN.md) |
| Requirements and data model | [`docs/architecture/`](docs/architecture/) |
| Feature modules | [`docs/modules/`](docs/modules/) |
| Roadmap and status | [`docs/plans/future-plans.md`](docs/plans/future-plans.md) |
| Paused and unfinished work | [`docs/plans/on-hold.md`](docs/plans/on-hold.md) |

---

## Project status

Active development on the `overhaul` branch. Main gaps (details in [`docs/plans/on-hold.md`](docs/plans/on-hold.md)):

- **PayMongo** (plan subscriptions, automatic QR Ph rent, landlord payouts) is built but switched off until a PayMongo account and keys are set up. Rent is currently collected through the landlord's own QR, bank and e-wallet details with receipt review.
- **Signature placement** uses the browser's PDF viewer, so box positions are approximate; installing `pdfjs-dist` in `apps/client` enables exact page rendering.
- Several newer features have tests written that haven't yet been run against a test database.
