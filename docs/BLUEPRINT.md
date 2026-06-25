# Avrico Estates — Orchard Management System
## Product Specification & Development Blueprint (v2)

A professional system to identify, track and manage every tree, task, input and
harvest across the 10‑hectare Avrico Estates avocado orchard.

---

## 0. The orchard (current data)

| Zone | Trees (planned) |
|------|-----------------|
| A1   | 1,154 |
| A2   | 175   |
| A3   | 385   |
| B1   | 524   |
| B2   | 634   |
| **Total** | **2,872** |

---

## 1. Tree identification — the professional standard

### Unique Tree ID format
```
ZONE - Rrr - Tttt        e.g.  B2-R01-T003
        │     └ Tree number within the row (3 digits, zero‑padded)
        └────── Row number within the zone (2 digits, zero‑padded)
```
- **Zone** uses your existing codes: `A1 A2 A3 B1 B2`.
- **Row** = `R` + 2 digits (`R01`…`R99`). Padding keeps IDs sortable and tidy.
- **Tree** = `T` + 3 digits (`T001`…`T999`). A1's ~1,154 trees over its rows stay
  well within 999 trees/row.

### Recommended numbering rules (how real orchards do it)
1. **Fixed datum.** Pick one permanent reference corner — e.g. the corner nearest
   the **main access road / northern boundary** — and never change it.
2. **Rows count one way.** Number rows `R01, R02 …` moving in **one consistent
   direction** away from the datum (e.g. west → east).
3. **Trees count one way.** Within every row, number trees starting from the
   **same end** (the end nearest the access road) and increase along the row.
4. **Number by physical position, not by living trees.** The 3rd planting spot in
   a row is always `T003` — even if it is currently Missing or Dead. This keeps
   row lengths and IDs stable forever.
5. **Replacements keep the ID.** When a dead tree is replaced, the new tree
   **inherits the same ID** (`B2-R01-T003`); the change is recorded in the tree's
   *replacement history*. Never renumber.
6. **Mark the field.** Put a durable post/label at the **start of each row** with
   the row number, and a marker every 10th tree. Later, add a **QR tag per tree**
   (see Future Features) so a worker scans instead of counts.

### Tree statuses
`Healthy · Needs Inspection · Weak · Diseased · Dead · Missing · Replaced`

### Duplicate prevention (the key rule)
A tree position `(zone, row, tree number)` is **unique**. The database enforces a
unique constraint; the app checks before saving. If the position already exists:

> **“This tree already exists: B2-R01-T003. Current status: Dead.
> Do you want to update this tree record instead?”**
> → **Update existing** · **View history** · **Cancel**

No duplicate is ever created.

---

## 2. Recommended technology stack

The current stack is the right professional choice — reliable, scalable, and not
over‑complicated:

| Layer | Choice | Why |
|------|--------|-----|
| **Frontend** | React (Vite) **PWA** | Installs on any phone, works like an app, one codebase for all devices. Mobile‑first for field use. |
| **Backend / DB** | **Supabase** (PostgreSQL + Auth + Storage) | Real relational database (great for reporting & integrity), built‑in logins, photo storage, no server to run. |
| **Security** | **Row Level Security** in Postgres | Permissions enforced by the database itself, not just the screens — a worker *cannot* delete data even if they tried to bypass the app. |
| **Hosting** | GitHub Pages + GitHub Actions | Free, auto‑deploys on every change, custom domain (`app.avricoestates.com`). |
| **Offline (future)** | PWA service worker + local cache / IndexedDB sync | Field areas with poor signal can record and sync later. |

---

## 3. Database design

Full SQL is in **`supabase/schema_v2.sql`**. Model overview:

**Orchard structure**
- `zones` — blocks A1…B2 (code, name, area, planned tree count).
- `rows` — rows within a zone (zone_id, row_number).
- `trees` — every tree: `tree_code`, zone_id, row_number, tree_number, status,
  planted_on, soft‑delete (`archived` / `deleted_at`), last_inspection_on.

**Tree life‑history (append‑only)**
- `tree_inspections` — date, inspector, status found, findings, photo.
- `tree_treatments` — date, product (optionally an inventory item), qty, reason.
- `tree_photos` — photos with captions.
- `tree_replacements` — replacement history (when, why, by whom).

**Inventory & warehouse**
- `inventory_items` — material, category, unit, **min_stock** (low‑stock level),
  location. (Current stock is derived from movements.)
- `stock_movements` — every IN / OUT / TRANSFER / ADJUST: qty, who, when, why,
  linked zone and/or task.

**Produce & yield**
- `storage_locations` — sheds / cold rooms.
- `yield_records` — harvest **by block**: zone, produce type, qty, grade, date.
- `produce_batches` — produce held in storage (type, source zone, grade, qty,
  location, status: in_storage / sold / moved / used).
- `produce_movements` — produce IN/OUT of storage.

**Work**
- `tasks` — title, instructions, assignee, priority, due date, status
  (Pending / In Progress / Completed / Overdue / Cancelled), and optional links to
  a zone, row, tree, inventory item or produce batch.
- `task_submissions` — append‑only completion + photo evidence.

**People**
- `profiles` — one per login: full name, **role** (owner / manager / worker /
  viewer), active flag, phone, job title.

**Reporting views** (ready‑made for the dashboard & reports)
`v_trees_per_zone`, `v_tree_status_by_zone`, `v_low_stock`, `v_inventory_levels`,
`v_yield_by_zone`, `v_produce_in_storage`, `v_task_status_counts`.

These answer: trees per zone · dead/diseased by zone · replacement history ·
yield by block · stock levels · stock usage over time · task completion rates.

---

## 4. User roles & permissions

| Capability | Owner/Admin | Farm Manager | Worker | Viewer |
|---|:--:|:--:|:--:|:--:|
| View dashboards & reports | ✅ | ✅ | ✅ | ✅ |
| Register / edit trees | ✅ | ✅ | — | — |
| Add inspections / treatments / tree photos | ✅ | ✅ | ✅ | — |
| Archive (soft‑delete) trees | ✅ | ✅ | — | — |
| Permanently delete | ✅ | — | — | — |
| Create / assign / edit tasks | ✅ | ✅ | — | — |
| Complete assigned tasks + upload evidence | ✅ | ✅ | ✅ | — |
| Add stock / record usage | ✅ | ✅ | ✅¹ | — |
| Manage inventory items, produce, yield, zones/rows | ✅ | ✅ | — | — |
| Manage users & permissions | ✅ | — | — | — |

¹ Workers can record stock *usage* (OUT) but not edit item definitions.
All rules are enforced in the database (RLS), not only in the UI.

---

## 5. Pages & navigation

```
Dashboard            KPIs, alerts, charts, recent activity
Orchard (Zones)      Block overview + drill into rows
Tree Register        Searchable/filterable list of every tree
  └ Add / Edit Tree  Structured ID entry + duplicate prevention
  └ Tree Details     Status, inspections, treatments, photos, replacements, history
Inventory / Warehouse Items, stock levels, low‑stock, movements
Produce Storage      Batches in storage, in/out movements
Yield Tracking       Harvest by block, over time, best zones
Tasks                Create/assign, statuses, evidence
Reports              All the standard reports + export
Users                Roles & permissions (owner only)
```

### User flow (core: registering a tree)
1. Manager opens **Tree Register → Add Tree**.
2. Picks **Zone**, types **Row** and **Tree number** → app shows the live ID
   `B2-R01-T003`.
3. On save, app checks for an existing tree at that position.
   - **New** → record created.
   - **Exists** → duplicate dialog (Update / View history / Cancel).
4. Tree detail page lets staff add inspections, treatments, photos over time.

---

## 6. Data validation & duplicate logic

- Zone must be one of the defined zones.
- Row number ≥ 1; tree number ≥ 1 (integers).
- `tree_code` auto‑generated from zone+row+tree — never typed by hand.
- **Unique** on `(zone_id, row_number, tree_number)` **and** on `tree_code`
  (DB‑enforced).
- Add flow performs a pre‑check `select … where tree_code = ?`; if found, returns
  the existing record + offers Update / History / Cancel (no insert).
- Quantities (stock, yield) must be ≥ 0; movements validated so stock can't go
  negative on OUT.
- Deletes are **soft** by default (`archived = true`, `deleted_at` set); hard
  delete is owner‑only.

---

## 7. Suggested dashboard charts
- **Trees by zone** (bar) and **status mix** (stacked bar / donut per zone).
- **Trees needing attention** (count cards: Dead, Diseased, Weak, Needs Inspection).
- **Yield by zone** (bar) and **yield over time** (line, last 6–12 months).
- **Inventory levels** with **low‑stock alerts** (red rows).
- **Produce in storage** (by type) and **task status** (Pending/In Progress/
  Completed/Overdue) donut.
- **Recent activity** feed (latest inspections, harvests, stock movements).

---

## 8. MVP build plan (phased & verifiable)

- **Phase 1 — Orchard structure & Tree Register** *(in progress)*
  Zones overview, full Tree Register, Add/Edit with the structured ID + duplicate
  prevention, Tree Details with inspections/treatments/photos/replacements,
  soft‑delete. 4‑role permission model.
- **Phase 2 — Inventory & Warehouse**
  Items + min‑stock, stock movements (in/out/transfer), low‑stock alerts, usage by
  zone/task/person.
- **Phase 3 — Produce & Yield**
  Yield by block, storage locations, produce batches & movements, storage reports.
- **Phase 4 — Tasks upgrade**
  New statuses, links to zone/row/tree/item/batch, overdue automation, evidence.
- **Phase 5 — Dashboard & Reports**
  All KPI cards, charts and exportable reports wired to the reporting views.
- **Phase 6 — Polish & PWA**
  Mobile refinements, offline cache, performance for thousands of trees.

---

## 9. Future features
- **QR codes per tree** — print weatherproof tags; scan to open the tree page.
- **GPS tree mapping** — capture lat/long per tree; map view of the orchard.
- **Offline mode** — record inspections/tasks with no signal, sync later.
- **Native mobile app wrapper** — optional, from the same PWA.
- **Barcode/QR stock tracking** — scan inventory in/out.
- **Worker performance reports** — tasks completed, on‑time rate, areas covered.
- **Spray/treatment scheduling & reminders**, weather integration, cost tracking.

---

*This blueprint is the reference for the build. Each phase ships as a working,
tested increment on top of the live app.*
