# Bil-X — Project Report

A technical report covering architecture, data model, security, the main features, and known trade-offs. For setup see `README.md`; for the SQL run order see `sql_order.md`.

---

## 1. Overview

Bil-X is an Azerbaijani-language **video course marketplace**. The defining product decision is that **payments are manual over WhatsApp** — there is no payment gateway. The flow is:

1. A visitor browses courses and watches a free preview.
2. They contact the team on WhatsApp from the course page.
3. After payment, the **admin grants course access** by the student's email.
4. The student is notified and can watch the course.

Instructors apply to teach, create courses, and submit them for admin approval. The admin moderates everything.

---

## 2. Architecture

```
Browser (React SPA)  ──HTTPS──>  Supabase
   │                               ├── Auth (email/password, JWT)
   │                               ├── Postgres + Row-Level Security  ← all access control
   │                               ├── Storage (thumbnails)
   │                               ├── Realtime (single-session kick)
   │                               └── Edge Function: notify-email (Resend)
   ├──> Vercel serverless /api/* (email helpers + Bunny presign/playback)
   └──> Bunny Stream (direct TUS upload; token-authenticated embed playback)
```

There is **no traditional backend**. The SPA talks to Supabase directly using the public anon key; **all authorization is enforced by Postgres Row-Level Security (RLS)**. Privileged operations that can't be expressed as plain RLS run through `SECURITY DEFINER` Postgres functions (RPCs).

### Key client modules
- `App.jsx` — routing, auth/session bootstrap, the single-session enforcer, and the landing page.
- `supabase.js` — the configured client (fails fast if env vars are missing).
- `profileApi.js` — profile loading, `ADMIN_EMAIL`, `isAdmin()`.
- `i18n.jsx` — AZ/RU/EN string tables behind a `useLanguage()` context.

---

## 3. Data model (Postgres)

Canonical schema lives in `supabase/reconcile.sql` (idempotent — safe to re-run).

| Table | Purpose | Key columns |
|-------|---------|-------------|
| `profiles` | user role + display name | `user_id` (PK→auth.users), `role` (student/instructor), `full_name` |
| `Courses` | courses | `id`, `title`, `price`, `instructor_id`, `instructor_name`, `is_published`, `status` (draft/pending/approved/rejected) |
| `videos` | lessons | `id`, `course_id`, `title`, `video_url` (legacy), `bunny_video_id`, `video_source`, `order_index`, `is_free`, `duration` |
| `enrollments` | course access (email-keyed) | `user_id` **(text — email)**, `course_id`, `status` |
| `video_progress` | watched flags | `user_id`, `video_id`, `watched` |
| `requests` | WhatsApp access requests | `user_id`, `user_email`, `course_id`, `status` |
| `teacher_applications` | become-instructor requests | `user_id`, `name`, `surname`, `email`, `phone`, `status`, `reviewed_at` |
| `notifications` | in-app bell | `user_id`, `title`, `body`, `link`, `is_read` |
| `inbox_messages` | messaging | `sender_id/email`, `recipient_id/email`, `course_id`, `body` |
| `video_comments` | per-lesson comments | `user_id`, `video_id`, `body` |
| `course_ratings` | course reviews | `user_id`, `course_id`, `rating`, `review` |
| `user_sessions` | single active session | `user_id` (PK), `session_token`, `last_active`, `device_info` |

### Identity-model note (important)
`enrollments.user_id` is **`text` and holds the student's email** (not a UUID). This intentionally supports "grant access by email" before/after signup. Queries match on email; the schema was reconciled to this after early drift (the live DB had `uuid`/`text` mismatches). RLS comparisons cast to `::text` to stay type-safe. This is a known soft spot (a user enrolled by both email and UUID could duplicate) — acceptable for the manual flow, documented for the future.

---

## 4. Security model (RLS + RPCs)

Every table has RLS enabled. Highlights:

- **Admin** is `public.is_admin()` — a single function comparing the JWT email to the admin address (one source of truth; used by all admin policies/RPCs).
- **Instructors** are gated by `public.is_approved_instructor()` (a `SECURITY DEFINER` function) instead of inline subqueries — this avoids a **Courses ⇄ profiles RLS recursion** that was hit early on.
- **Free previews / lesson reads** use `public.has_course_access()` (definer) so a logged-out visitor can read free lessons without a grant on `enrollments` (which would otherwise raise "permission denied").
- **Cross-user writes** that plain RLS forbids go through definer RPCs:
  - `admin_review_teacher_application(id, decision)` — approve/reject + set role atomically.
  - `create_notification(...)` — let a user notify another (e.g., student → instructor).
  - `notify_admin(...)` — application/inbox pings to the admin.
  - `admin_list_users()` — admin-only directory joining `auth.users` + `profiles` + `user_sessions` (real emails, signup date, last active, device, ban status).
  - `admin_set_user_banned(...)`, `admin_delete_user(...)` — ban/unban and hard-delete (with self-protection so the admin can't lock itself out).

A signup trigger (`create_profile_for_new_user`) forces new users to `role = 'student'`, so the role can't be self-escalated; only `admin_review_teacher_application` promotes to instructor.

---

## 5. Notable features

### Landing page
Designed gradient hero (animated glow + dot grid, no stock photo), value highlights, **featured carousel** (shown only when there are enough courses) + **full grid**, "how it works" (the WhatsApp flow), instructor CTA, and a footer. Mouse drag-to-scroll on the carousel; scroll-reveal motion (respects `prefers-reduced-motion`).

### Course preview
Lesson titles for published courses are exposed (URL-free) via the `lesson_previews` view, so prospective buyers see the full curriculum. The **first lesson is a free preview**: it's marked `is_free = true` (a one-time backfill in `reconcile.sql`, and `InstructorDashboard` auto-marks the first lesson free on creation), and the `videos` read policy exposes `is_free` lessons for published courses. (An earlier order-index-based RLS rule was dropped because a policy on `videos` that sub-queries `videos` causes infinite recursion.)

**Video hosting (Bunny Stream).** Lessons are hosted on Bunny, referenced by `videos.bunny_video_id`. Two serverless endpoints bracket the lifecycle: `api/bunny-create-video.js` verifies the caller is an approved instructor, creates the Bunny video, and returns a short-lived TUS upload signature (the API key never reaches the browser, and the file never transits the function — it goes browser → Bunny directly); `api/bunny-playback.js` checks access (free preview → anyone, else enrolled/owner/admin) and returns a **signed, expiring embed URL**, which only works because **Token Authentication** is enabled on the library. Both endpoints use the Supabase **service role** to verify the JWT and read enrollment, since RLS's `auth.uid()` isn't available server-side. The `videos` row's `bunny_video_id` is only readable by clients RLS already allows (free previews, or the full set once enrolled/owner/admin), so its presence doubles as the per-lesson "unlocked" signal in `CoursePage`. Legacy YouTube/Storage lessons (`video_source = 'legacy'`, with a `video_url`) keep playing through the old YouTube-iframe / `<video>` path; embedding-restricted YouTube videos degrade to a "Watch on YouTube" link.

### Notifications
- **In-app bell** (`notifications` table) for enroll/comment/rating/inbox/teacher events.
- **Email** via the `notify-email` edge function (admin, instructor, enrolled student, approved teacher). HTML is escaped and links are validated (http/https only).

### Single active session per user
**Option A (newest login wins), app-enforced.**
- On login, a fresh `session_token` is written to `user_sessions` (overwriting the previous one) and stored in `localStorage`.
- The app checks on load + focus, runs a 2-minute `last_active` heartbeat, and **subscribes via Realtime** to its session row.
- When the account logs in elsewhere, the token no longer matches → the old device is logged out with a message (instant via Realtime, otherwise on next focus/action).
- A short **post-login grace window** prevents the just-logged-in device from kicking itself during the token-settle race.
- Logout/kick use **`signOut({ scope: 'local' })`** so ending one device's session never revokes the others.

**Trade-off:** enforcement is in the client, not a hard server wall. A tampered client could keep an old JWT working against Supabase (RLS doesn't yet check the session token). For protecting course access this is the right balance; a hard wall would need a custom access-token hook + RLS on every table, with real fragility (token-refresh edge cases, lockouts, forced global re-login) — see the discussion in the change history.

### Admin dashboard
Branded sidebar (brand, active accent, account + logout), tabs for pending courses, teacher applications, access, users, courses, and **statistics** (KPI cards + a monthly bar breakdown). User profile modal shows courses, comments, last-active/device, and ban/delete + a direct message composer.

---

## 6. Internationalization
`src/i18n.jsx` holds AZ (default), RU, and EN string tables; `useLanguage()` exposes `t(key)` and the language switcher persists to `localStorage`. **Course content is Azerbaijani-only**; only the UI is translated.

---

## 7. Performance
- Hero and flag images were converted **PNG → WebP** (hero 1.6 MB → ~67 KB; flags 70–240 KB → ~1 KB each).
- The landing page renders courses immediately and only does the author-name lookup when needed (no blocking second query).
- Loading skeletons, lazy/async image hints, and a single ~40 KB CSS bundle (≈8 KB gzipped).

---

## 8. Known limitations / future work
- **Enrollment identity** is email-keyed `text` (see §3) — works, but a UUID-based model would be cleaner long-term.
- **Single-session** is app-enforced (see §5) — adequate, not tamper-proof.
- **Admin email is hardcoded** in `is_admin()` + `src/profileApi.js` — fine, but an `admins` table/role would scale better.
- The `api/*.js` Vercel email helpers are **superseded** by the edge function and currently unused (kept in the repo).
- Several **legacy `supabase/*.sql`** patch files predate `reconcile.sql`; `sql_order.md` lists which are authoritative vs. "do not run."

---

## 9. Operational checklist
1. Run `supabase/reconcile.sql` in the SQL editor (idempotent; re-run after pulling schema changes). For an existing DB, `add_bunny_video.sql` is the Bunny-only delta.
2. Enable Realtime for `public.user_sessions`.
3. Create a public Storage bucket `thumbnails` (lesson videos now live on Bunny).
4. Create a Bunny Stream library; enable **Token Authentication**; set `BUNNY_API_KEY`, `BUNNY_LIBRARY_ID`, `BUNNY_CDN_HOSTNAME`, `BUNNY_TOKEN_AUTH_KEY` (+ `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`) in Vercel.
5. Deploy `notify-email` and set its secrets; redeploy after changes.
6. Set the "Confirm signup" email template (optional).
7. Set env vars locally (`.env`) and in Vercel.
