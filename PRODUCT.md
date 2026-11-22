# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Landlords:** Property owners and managers managing multiple residential rental properties, units, tenant onboarding, billing records, and maintenance ticket resolution from a desktop/tablet web dashboard.
- **Tenants:** Residential occupants viewing lease details, paying rent (simulated payment flow), uploading compliance documents, and submitting maintenance tickets with photo attachments via a mobile-first responsive PWA.
- **Superadmin:** Platform overseers monitoring overall system health, real-time user sessions, audit trails, account statuses (suspend/reactivate), and error logs.

## Product Purpose

An integrated home rental and property maintenance management system (JPTL) designed to eliminate fragmented communication and manual recordkeeping by unifying property administration, leasing workflows, rent tracking, and maintenance operations into an automated, transparent platform.

## Positioning

A unified multi-role rental management platform combining a desktop operational workspace for landlords with an intuitive mobile-friendly tenant portal and platform oversight for superadmins—distinguished by synchronized cascading workflow automations (ticket transitions trigger audit logs, in-app notifications, and push dispatches) and server-enforced role-based data isolation.

## Operating Context

- **Landlord Workspace:** Used on desktop or laptop displays during daily administrative routines; requires dense, scannable data tables, quick status toggles, and modal-driven workflows for creating units, leases, and tenant assignments.
- **Tenant Portal:** Used primarily on mobile phones on-the-go or during move-in; requires simple navigation, clear bill payment reminders, document submission, and high-contrast forms for snapping photos and reporting repairs.
- **Superadmin Console:** Desktop monitoring dashboard focused on security, session monitoring, error logs, and platform oversight.

## Capabilities and Constraints

- **Architecture:** Monorepo comprising `apps/client` (Vite, React 19, Tailwind CSS v4, Framer Motion, Lucide icons), `apps/superadmin` (Vite, React 19, Tailwind CSS v4), and `apps/server` (Express, MongoDB/Mongoose, JWT auth, Cloudinary).
- **Security & RBAC:** Strict server-side query scoping ensuring landlords only access their properties/tenants and tenants only access their unit/lease data, with unscoped read oversight for superadmins.
- **Event-Driven Automations:** Ticket status changes and simulated payment settlements trigger synchronized audit logging, notification dispatch, and push notification triggers.
- **Deployment:** Vercel frontend deployments with containerized Docker / AWS production environments.

## Brand Commitments

- **Tone & Voice:** Professional, trustworthy, clean, and reliable.
- **Aesthetic Direction:** Light slate workspace (`#F8FAFC` app, white cards), deep navy brand `#0F172A`, emerald for transactional actions, blue for secondary/info, and strict semantic status colors, with a navy dark theme available in both frontends. Keep the category-standard operations layout familiar, crisp, and readable; use flat bordered surfaces, restrained motion, and clear task-oriented hierarchy. Tokens live in `apps/client/src/theme.css`.

## Evidence on Hand

- Functional monorepo codebase in `apps/client`, `apps/superadmin`, and `apps/server`.
- Complete functional requirements and data models in `docs/architecture/requirements.md`, `docs/architecture/erd.md`, and module-specific documents in `docs/`.
- Automated Playwright end-to-end test suite (`playwright.config.js`, `tests/`).

## Product Principles

1. **Role-Tailored Density:** Present high-density, scannable data for landlord/admin decision-making while providing focused, step-by-step simplicity for tenant interactions.
2. **Transparent System State:** Every mutation (lease creation, ticket progression, payment status) provides immediate visual feedback, persistent auditability, and clear status badges.
3. **Frictionless Workflows:** Guide complex multi-step operations (such as onboarding tenants, unit allocation, and maintenance dispatch) through coherent modal flows and inline validations.
4. **Resilient Production Quality:** Maintain high contrast ratios, responsive layouts, robust error states, and predictable component behavior across all breakpoints.

## Accessibility & Inclusion

- Adherence to WCAG 2.1 AA standards for color contrast, readable font sizing, keyboard navigability across forms and dialogs, and minimum 44x44px touch targets on mobile viewports.
