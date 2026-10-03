# AarogyaGrid — Design

## Visual identity

- **Fonts:** `Space Grotesk` for display/headings, `Inter` for body
  text, `IBM Plex Mono` for anything ID-like or numeric (login IDs,
  dates in meta rows, badges) — the mono font is what gives the
  "medical record / terminal" feel to credentials and stats.
- **Color:** a teal/green primary (`--primary: #0F6B5C` in light mode,
  `#2FD9AC` in dark mode) evokes clinical/health branding without
  being a literal red-cross cliché. Amber (`--accent`) for
  "needs attention soon" states (expiring subscriptions, pending
  reviews). Red (`--danger`) reserved for destructive actions and
  actually-expired/failed states. Green (`--success`) for
  active/applied/good states.
- **Shape language:** big soft radius (`--radius: 16px`) on cards and
  panels, small radius (8-10px) on buttons/inputs/badges — panels feel
  like physical folders, controls feel like clickable chips.
- **Dark mode** is a full parallel palette (not just an inverted
  filter), toggled via `.dark` on `<body>`, persisted in
  `localStorage` (`ag_theme`), shared across `index.html` and
  `admin.html`.

## Layout patterns

- **Auth screen:** centered card, role picker as three (now four,
  with Doctor) tappable `.role-card.tilt` tiles, each with an icon, a
  one-line description, and a "issued by X" chain hint — reinforcing
  the trust-chain mental model before the user even logs in.
- **Dashboard screen:** classic sidebar + content layout
  (`.dash-wrap` → `.sidebar` + `.content`). The sidebar holds brand,
  nav items, theme toggle, profile strip, and logout — in that fixed
  order, top to bottom, on every role's dashboard.
- **Sidebar collapse:** clicking the chevron button in the sidebar
  header shrinks it to an icon rail (`.sidebar.collapsed`, 76px wide).
  Labels (`nav-item span`, theme label, profile name/id, logout label)
  hide; icons stay. State persists per-device via `localStorage`
  (`ag_sidebar_collapsed`) so it stays collapsed across reloads.
- **Content sections:** each dashboard "page" is a `.section` inside
  `.content`, toggled via a `data-section` attribute matched against
  the clicked `.nav-item`'s `data-nav` — only one is visible
  (`.section.active`) at a time, with a small fade-up entrance
  animation.

## Reusable components

| Class | Used for |
|---|---|
| `.stat-card` | Big number + label, top of most overview pages |
| `.panel` | White/dark card container with a header + body |
| `.panel-head` | Title + description + optional action button, inside a panel |
| `.form-grid` / `.field` | Two-column responsive form layout |
| `.list` / `.row-card` | Vertical list of records (patients, doctors, consultations) — avatar-initial, name, meta line, optional badge, optional action buttons |
| `.badge` (`-success`/`-danger`/`-accent`) | Small status pill — used for subscription status, appointment proximity, and consultation pending/applied state |
| `.assign-group` | Groups a doctor's row-cards under their name, used only on the hospital's Doctor Assignments tab |
| `.notify-banner` | Amber attention banner (subscription expiring, appointment soon) |
| `.modal-overlay` / `.modal` | Profile editor, shared across all four roles |
| `.toast` | Bottom-corner success/error confirmation after any action |

## Role-specific UI decisions

- **Doctor dashboard** deliberately does *not* let a doctor edit a
  patient's record directly or see other hospitals' patients — the
  only patient-facing action is "submit a consultation" via a
  `<select>` of that doctor's own hospital's patients
  (`API.patients.listByHospital(doctor.hospitalId)`), reinforcing that
  a doctor proposes, the hospital disposes.
- **Hospital's Doctor Assignments tab** groups by doctor first
  (`.assign-group` per doctor), because the ask this answers is
  "which doctor has which patient" — grouping by patient would answer
  a different question and bury the doctor-workload view the hospital
  actually wants.
- **Prescription photo** renders as a simple `<img class="rx-image">`
  under the prescription text on the patient dashboard — capped at
  280px wide so a phone photo of a handwritten note doesn't dominate
  the page, with a subtle border so it reads as an attached document,
  not a decorative image.
- Status badges reuse the same three-color vocabulary everywhere
  (green = good/done, amber = attention/pending, red = bad/expired)
  so a user moving between an admin's subscription view and a doctor's
  consultation view doesn't have to relearn what a color means.
