# Demo Accounts

Local and demo login credentials, created by `apps/server/scripts/seed-demo.js` (reseeded 2026-11-21). Every account except Superadmin uses the password **`Password123!`**.

## Quick reference

| Role | Name | Email | Password | Property / unit | Sign in at |
| :--- | :--- | :--- | :--- | :--- | :--- |
| Superadmin | System Superadmin | `superadmin@jptl.sys` | `admin123` | Whole platform | Superadmin portal |
| Landlord | Alexander Vance | `landlord@jptl.dev` | `Password123!` | Owns all 5 properties (Professional plan) | Main sign-in |
| Property Manager | Maria Santos | `pm@jptl.dev` | `Password123!` | Aura Sky Towers, Lumina Green Park | Main sign-in |
| Technician | Ramon Cruz | `tech@jptl.dev` | `Password123!` | Aura, Vantro, Lumina (tickets assigned to him) | Main sign-in |
| Tenant | Sophia Lim | `sophia@jptl.dev` | `Password123!` | Unit 14B · Aura Sky Towers (Makati) | Tenant sign-in |
| Tenant | Liam Carter | `liam@jptl.dev` | `Password123!` | Loft 304 · Vantro Executive Lofts (BGC) | Tenant sign-in |
| Tenant | David Mercado | `david@jptl.dev` | `Password123!` | Villa 04 · Solis Villa Estate (Alabang) | Tenant sign-in |
| Tenant | Miguel Reyes | `miguel@jptl.dev` | `Password123!` | Apt 2A · Lumina Green Park (Quezon City) | Tenant sign-in |
| Tenant | Ana Dela Cruz | `ana@jptl.dev` | `Password123!` | Apt 2B · Lumina Green Park (Quezon City) | Tenant sign-in |
| Tenant (pre-added) | Elena Rostova | `elena@jptl.dev` | `Password123!` | Not assigned yet (read-only access) | Tenant sign-in |

## Scenarios in the data

| Account | What to try |
| :--- | :--- |
| Sophia | November rent paid; an in-progress aircon ticket assigned to the technician. |
| Liam | November rent partly paid (₱20,000 of ₱32,000). |
| David | November rent marked "paid onsite", waiting for the landlord to approve it in Rent Roll. |
| Miguel | November rent overdue; open plumbing ticket; lease ends 2026-12-31 (lease-end reminders). |
| Ana | November rent due 2026-11-25. |
| Lumina Green Park | Water is a shared meter set to "actual bill": enter a source bill in Rent Roll → Utility bills to split it across Apts 2A and 2B. |
| Elena | Pre-added tenant: can sign in but can't create lease-bound records until assigned. |

Two-factor sign-in is off on every account. Turn it on in Settings → Security (Superadmin: Security tab).

## Commands

Run from `apps/server`. Both scripts target the database in `MONGO_URI`.

```bash
# 1. Back up first (stored in /database at the repo root, git-ignored)
mongodump --uri="$MONGO_URI" --archive=../../database/jptl-backup-$(date +%Y%m%d-%H%M%S).archive.gz --gzip

# 2. Preview, then wipe everything except superadmin accounts and system settings
node scripts/reset-except-superadmin.js
RESET_ALL_CONFIRM=1 node scripts/reset-except-superadmin.js --execute --confirm-database jptl --backup ../../database/<backup-file>

# 3. Seed fresh demo data (refuses if a landlord already exists)
SEED_DEMO_CONFIRM=1 node scripts/seed-demo.js --execute

# Restore a backup if needed (overwrites matching documents)
mongorestore --uri="$MONGO_URI" --archive=../../database/<backup-file> --gzip --drop
```

The previous data (83 users, 34 properties, and so on) is in `database/jptl-backup-20261121-221003.archive.gz`.
