---
name: JPTL Operations
description: A clean, high-contrast property-operations workspace on slate surfaces, navy brand, emerald actions and semantic statuses.
colors:
  app: "#F8FAFC"
  surface: "#FFFFFF"
  surface-hover: "#F1F5F9"
  line: "#E2E8F0"
  line-strong: "#CBD5E1"
  brand-navy: "#0F172A"
  cta-emerald: "#10B981"
  cta-fill: "#047857"
  cta-fill-hover: "#065F46"
  info-blue: "#2563EB"
  info-blue-hover: "#1D4ED8"
  ink: "#1E293B"
  ink-muted: "#64748B"
  success-ink: "#15803D"
  success-bg: "#DCFCE7"
  success-line: "#BBF7D0"
  warning-ink: "#B45309"
  warning-bg: "#FEF3C7"
  warning-line: "#FDE68A"
  danger: "#DC2626"
  danger-ink: "#B91C1C"
  danger-bg: "#FEE2E2"
  danger-line: "#FECACA"
  dark-app: "#0B1120"
  dark-surface: "#0F172A"
  dark-ink: "#E2E8F0"
  dark-ink-muted: "#94A3B8"
typography:
  display:
    fontFamily: "IBM Plex Sans, system-ui, sans-serif"
    fontSize: "clamp(2rem, 4vw, 3rem)"
    fontWeight: 700
    lineHeight: 1.12
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "IBM Plex Sans, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 650
    lineHeight: 1.25
  title:
    fontFamily: "IBM Plex Sans, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: 1.35
  body:
    fontFamily: "IBM Plex Sans, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: "IBM Plex Sans, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: 1.4
  code:
    fontFamily: "IBM Plex Mono, ui-monospace, monospace"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.45
rounded:
  sm: "6px"
  md: "8px"
  lg: "12px"
  xl: "14px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.cta-fill}"
    textColor: "#FFFFFF"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  button-primary-hover:
    backgroundColor: "{colors.cta-fill-hover}"
  button-brand:
    backgroundColor: "{colors.brand-navy}"
    textColor: "#FFFFFF"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  button-danger:
    backgroundColor: "{colors.danger}"
    textColor: "#FFFFFF"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  card-base:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.lg}"
    padding: "20px"
  input-field:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "8px 12px"

---

# JPTL design system

## Overview

**Creative North Star: Civic Operations, Clearly Routed.** JPTL is a working property-management tool for landlords, residents, property managers, technicians, and platform operators. The layout stays category-standard and familiar. A calm slate-and-white workspace, a deep navy brand, emerald for money-moving actions, and strict semantic status colors make dense daily work scannable.

Light is the default in both frontends; each has a navy dark theme toggle. Tenant workflows stay mobile-first, while landlord and Superadmin workspaces prioritize efficient desktop scanning.

## Source of truth

All color, surface, button, badge, card and input styling lives in `apps/client/src/theme.css` (copied verbatim to `apps/superadmin/src/theme.css`). It defines CSS variables for both themes, semantic Tailwind utilities (`bg-app`, `bg-surface`, `text-ink`, `text-ink-muted`, `border-line`, `bg-brand`, ...), and component classes. Legacy Tailwind names used across the code (`indigo-*`, `rose-*`, status tints, slate in dark mode) are remapped there so older markup lands on the palette. Prefer the semantic utilities and component classes in new code; never hardcode hex values in JSX.

## Colors

- **Surfaces:** app `#F8FAFC`; cards and modals `#FFFFFF` with a `1px #E2E8F0` border and soft elevation; hover and table striping `#F1F5F9`.
- **Brand:** navy `#0F172A` for headers, sidebar active state, and non-transactional primary actions.
- **Primary action:** emerald. `#10B981` is the brand emerald for icons, focus accents, progress, and indicators. Filled CTA buttons use `#047857` (hover `#065F46`) because white text on `#10B981` is only 2.5:1 and fails WCAG AA.
- **Secondary / info:** blue `#2563EB` (hover `#1D4ED8`) for links, informational accents, and info badges.
- **Text:** `#1E293B` primary, `#64748B` muted (also used for placeholders, since `#94A3B8` is 2.6:1 on white).
- **Status:** success `#15803D` on `#DCFCE7` / border `#BBF7D0`; warning `#B45309` on `#FEF3C7` / `#FDE68A`; danger `#B91C1C` on `#FEE2E2` / `#FECACA`. Paid, active and resolved are success; pending, expiring soon and in progress are warning; overdue, urgent and delete are danger. Never recolor a status to match the brand.
- **Dark theme:** app `#0B1120`, surface `#0F172A`, hover `#1E293B`, borders `#253046`/`#334155`, text `#E2E8F0`/`#94A3B8`; brand inverts to a light fill with navy text; status colors use lighter inks on translucent tints.

## Typography

IBM Plex Sans for everything: headings at 600–700, body and tables at 400, labels at 500. Numbers use tabular figures so amounts and dates align. IBM Plex Mono (`.font-code`) is only for genuine codes such as ticket IDs, receipt numbers and references; never use monospace as decoration on labels. The legacy `font-mono` class now renders Plex Sans with tabular figures. Labels are short and sentence case. No gradient text.

## Layout

- Landlord and Superadmin: stable sidebar, compact top bar, responsive content grid, and data tables with clear column hierarchy.
- Tenant: prioritize the current lease, next payment, open requests, and resident notices; collapse navigation and complex lists for narrow screens.
- Use a consistent 4/8/16/24/32px spacing rhythm. Keep heading groups distinct from the content they introduce.
- Loading, empty, error, disabled, and success states must remain visible and actionable.
- Touch targets at least 44px tall on mobile; keyboard focus always visible.

## Elevation & Depth

White surfaces on the slate app background, separated by a 1px `#E2E8F0` border and a soft offset shadow. Overlays use a stronger soft shadow. No glass blur, glow halos, or nested card stacks.

## Shapes

8px controls and buttons (6px for small buttons), 12px cards, 14px large panels and modals. Pills only for statuses and filters.

## Components

- **Buttons** (`.btn` + variant): `btn-primary` emerald for transactional actions (Save, Submit, Pay, Approve, Create); `btn-brand` navy for non-transactional primaries; `btn-info` blue; `btn-secondary` white with a `#CBD5E1` border; `btn-ghost` transparent muted text; `btn-danger` solid red for critical deletes; `btn-danger-soft` for minor removals. Sizes `btn-sm`, `btn-lg`, `btn-icon`. Disabled is 50% opacity with `not-allowed` and no hover change. Focus shows a 2px blue ring.
- **Badges** (`.badge` + `badge-success|warning|danger|info|neutral`): text plus tint plus border; always pair color with a label.
- **Cards** (`.card`, `.card-pop`): white surface, line border, soft shadow.
- **Inputs:** white fill, `#CBD5E1` border, `#64748B` placeholder, blue focus border with a soft ring, red border for invalid.

## Do's and Don'ts

- Do preserve JPTL's real product language, data, permissions, and role-specific workflows.
- Do use the tokens and component classes; check AA contrast for any new pairing.
- Do keep operational data scannable and actions explicit.
- Don't hardcode hex colors or add one-off button styles in JSX.
- Don't introduce fictional metrics, decorative illustrations, glass cards, gradient text, or glow effects.
- Don't rely on color alone for balances, payment status, lease state, or alerts.
