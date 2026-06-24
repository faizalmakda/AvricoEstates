# 🌳 Avrico Estates

A simple, phone-friendly app for running the Avrico Estates farm — trees, tasks,
inventory, and yield — with two kinds of login:

| Login | Who | Can do |
| --- | --- | --- |
| **Owner / Admin** | The 3 directors (log in at the same time, each with their own account) | Everything: create/edit/delete/archive trees, create/assign/edit/delete tasks, manage inventory & yield, view all dashboards & reports, add users, edit permissions, and view the farm manager's photo evidence. |
| **Farm Manager** | One farm manager | View tasks assigned to him, mark them complete with photo evidence, and add tree status logs (Healthy, Dead, Diseased, Weak, Missing, Replaced, Needs Inspection) with notes & photos. **Cannot** delete anything, edit task instructions, or change settings. |

### The key safety rule
The farm manager can only **add** things — every completion and every tree
status update is saved as a **new entry**. He can never overwrite or delete an
existing record. This isn't just hidden in the app: it's enforced by the
database itself (Row Level Security), so the rule holds even if someone tried to
go around the app.

## How it's built (plain English)
- **The app** runs in any phone or computer web browser and can be "Added to
  Home Screen" so it behaves like a normal installed app. It's published free on
  GitHub Pages.
- **The data** (logins, trees, tasks, photos) lives in **Supabase** — a free
  cloud database. You sign up once; there is **no server for you to run or
  maintain**.

## Get it running
See **[SETUP.md](./SETUP.md)** for friendly, step-by-step instructions
(about 15 minutes, no coding needed). In short:

1. Create a free Supabase project and run `supabase/schema.sql` in its SQL editor.
2. Add your two Supabase keys as GitHub Action secrets.
3. Turn on GitHub Pages — the app builds and goes live automatically.
4. Create the 3 director logins + the farm manager login, and set their roles.

## For developers
```bash
npm install
cp .env.example .env   # fill in your Supabase URL + anon key
npm run dev            # http://localhost:5173
```

### Project layout
```
src/
  pages/            Dashboard, Tasks, Trees, Inventory, Produce, Reports, Users, Login
  components/       Layout (role-aware nav) + reusable UI
  auth/             AuthContext (session + profile/role)
  lib/permissions.js  Who-can-do-what (UI side; DB enforces the real rules)
supabase/
  schema.sql        Tables + Row Level Security policies (the real permission engine)
  functions/create-user  Edge Function so owners can add users in-app, securely
```
