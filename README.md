# Bil-X

Bil-X is an online **video course platform** for Azerbaijani-language courses. Students browse courses, watch a free preview, and request access over WhatsApp; an admin grants access after manual payment; instructors create courses and submit them for admin approval.

- **Frontend:** React 19 + Vite, React Router 7, multi-language UI (AZ / RU / EN)
- **Backend:** Supabase (Postgres + Auth + Storage + Edge Functions) — no custom server
- **Email:** Resend (via a Supabase Edge Function)
- **Hosting:** Vercel (SPA + serverless `api/` functions)

---

## Documentation

| Doc | What's in it |
|-----|--------------|
| **README.md** (this file) | Overview, roles & features, tech stack, setup, configuration, project structure, deployment |
| [**docs/PROJECT_REPORT.md**](./docs/PROJECT_REPORT.md) | Architecture, data model, security model (RLS + RPCs), feature internals, trade-offs, known limitations, operational checklist |
| [**docs/FUNCTIONALITY.md**](./docs/FUNCTIONALITY.md) | Every functionality with what it does and **why** (design rationale) |
| [**docs/sql_order.md**](./docs/sql_order.md) | Which SQL files to run and in what order (`reconcile.sql` is the canonical one) |

---

## Roles & features

**Visitor (no login)**
- Browse published courses (featured carousel + full grid, searchable).
- Watch the **free preview** lesson of any published course (first lesson + any the instructor marks free).
- Contact via WhatsApp from a course page.

**Student**
- Register (email verification) and reset password.
- "My courses" with progress tracking; discover more courses.
- Request a course over WhatsApp → admin grants access → in-app notification.
- Comment on lessons, rate courses.
- Inbox: message the admin or a course's instructor, and **reply** to received messages.

**Instructor**
- Apply to teach (admin approves); gets a notification/email on approval.
- Create courses (title, description, price, thumbnail), upload lessons (YouTube link or file), submit for approval.
- Approved courses are read-only (changes go through the admin).
- Email notifications for enrollments, ratings, comments, and inbox messages.

**Admin** (identified by a single email, see Configuration)
- Review/approve/reject/edit/delete courses.
- Grant/revoke course access by student email.
- Review teacher applications.
- User directory with real emails, signup dates, **last active / device**, and per-user profile drill-down (courses, comments); ban / delete users.
- Monthly statistics (new users, new teachers, courses shared, courses bought).

**Platform**
- **Single active session per user** (newest login wins; the previous device is logged out — instant via Realtime).
- In-app notifications (bell) + transactional emails.

---

## Tech stack

| Area | Choice |
|------|--------|
| UI | React 19, Vite 8, React Router 7 |
| State/data | Supabase JS client (direct from the browser, secured by RLS) |
| Auth | Supabase Auth (email/password) |
| DB | Supabase Postgres + Row-Level Security |
| Storage | Supabase Storage (`thumbnails`, `videos` buckets) |
| Email | Resend via the `notify-email` Edge Function |
| i18n | Custom context in `src/i18n.jsx` (AZ/RU/EN) |
| Hosting | Vercel |

---

## Getting started

### Prerequisites
- Node.js 20+
- A Supabase project
- A Resend account (for emails)

### 1. Install
```bash
npm install
```

### 2. Environment
Copy `.env.example` to `.env` and fill in:
```
VITE_SUPABASE_URL=...        # your Supabase project URL
VITE_SUPABASE_ANON_KEY=...   # Supabase anon/public key
VITE_APP_ORIGIN=http://localhost:5173   # used for auth redirect links
```
(`RESEND_API_KEY`, `WEBHOOK_SECRET`, `ADMIN_EMAIL` are used by serverless/edge functions, not the SPA — see below.)

### 3. Database
In the Supabase SQL editor, run **`supabase/reconcile.sql`** — one idempotent script that creates every table, column, constraint, RLS policy, function, and trigger. See **`docs/sql_order.md`** for details and the legacy/modular files.

After running it, enable **Realtime** for `public.user_sessions` (the script adds it to the `supabase_realtime` publication; verify in Database → Publications). This powers the instant single-session kick.

### 4. Storage
Create two **public** buckets in Supabase Storage: `thumbnails` and `videos`.

### 5. Edge function (emails)
Deploy the notification function and set its secrets:
```bash
supabase functions deploy notify-email
# secrets (Supabase dashboard or CLI):
#   RESEND_API_KEY, ADMIN_EMAIL, SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
```

### 6. Email templates (optional)
Paste `supabase/email_templates/confirm_signup.html` into Supabase → Authentication → Email Templates → "Confirm signup" for a branded confirmation/welcome email.

### 7. Run
```bash
npm run dev      # http://localhost:5173
npm run build    # production build
npm run preview  # preview the build
npm run lint     # eslint
```

---

## Configuration

- **Admin account:** identified by the email in `public.is_admin()` (in `reconcile.sql`) and `ADMIN_EMAIL` in `src/profileApi.js`. To change the admin, update both.
- **WhatsApp number:** `src/contact.js`.
- **App origin / auth redirects:** `VITE_APP_ORIGIN` (`src/appUrl.js`).

---

## Project structure

```
src/
  App.jsx              # router, auth/session bootstrap, landing page (Home)
  Navbar.jsx           # nav, search, notifications, teacher application modal
  Login/Register/ResetPassword.jsx
  StudentProfile.jsx   # student dashboard
  InstructorDashboard.jsx
  AdminDashboard.jsx   # admin: courses, access, teachers, users, stats
  CoursePage.jsx       # course detail, player, preview, comments, ratings
  Inbox.jsx            # messaging
  i18n.jsx             # AZ/RU/EN strings
  profileApi.js, courseAuthors.js, contact.js, appUrl.js, supabase.js
  index.css            # all styles
supabase/
  reconcile.sql        # canonical, run-this schema (source of truth)
  functions/notify-email/   # Deno edge function (Resend emails)
  email_templates/     # branded auth email
  *.sql                # legacy/modular migrations (see docs/sql_order.md)
api/                   # Vercel serverless email helpers
```

---

## Deployment (Vercel)
- Connect the repo; Vercel builds the SPA (`vite build`) and deploys `api/` as serverless functions.
- `vercel.json` sets SPA rewrites + a strict Content-Security-Policy and security headers.
- Set the same env vars in Vercel project settings.

---

## Notes & limitations
- The **single-session** feature is **app-enforced** (sessions table + Realtime + focus re-check), not a hard server-side wall — sufficient for course-access protection. See `docs/PROJECT_REPORT.md`.
- Payments are **manual via WhatsApp** by design; there is no payment gateway.
- Course content is Azerbaijani; the **UI** supports AZ/RU/EN.

See **`docs/PROJECT_REPORT.md`** for architecture, data model, security model, and the full change history.
