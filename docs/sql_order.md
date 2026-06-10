# BilX — SQL run order

All scripts run in the **Supabase SQL Editor**. Every script is idempotent (safe to
re-run). Comparisons are written to tolerate the live schema drift this project
accumulated, so order mostly matters only for first-time setup.

---

## TL;DR — just run this

For a fresh database **or** to repair an existing one, run **one file**:

```
reconcile.sql
```

It creates every table, adds missing columns, fixes `enrollments` types/constraints,
recreates all RLS policies (recursion-free), and creates all functions/triggers. It
supersedes everything in the "Canonical set" below. If it errors only on a non-numeric
`enrollments.course_id` value, clean that data and re-run.

> **Upgrading an existing DB for Bunny video hosting?** `reconcile.sql` already
> includes it. If you only want the delta, run `add_bunny_video.sql` — it adds
> `videos.bunny_video_id` / `videos.video_source` and makes `videos.video_url`
> nullable (idempotent).

---

## Canonical set (equivalent to reconcile.sql, run in this order)

Use this only if you prefer the original modular files over `reconcile.sql`.

| # | File | Purpose |
|---|------|---------|
| 1 | `bilx_schema.sql` | Base tables, grants, RLS for profiles / Courses / videos / enrollments / video_progress / requests |
| 2 | `teacher_applications.sql` | `teacher_applications` table, **`admin_review_teacher_application` RPC**, `is_approved_instructor()`, signup trigger, hardened (recursion-free) profiles/Courses/videos policies |
| 3 | `phase2_schema.sql` | notifications, inbox_messages, video_comments, course_ratings + their policies |
| 4 | `notifications_rpc.sql` | `create_notification` RPC (needs the `notifications` table from #3) |
| 5 | `phase1_free_preview.sql` | adds `videos.is_free` (preview lessons) |
| 6 | `videos_duration.sql` | adds `videos.duration` |
| 7 | `fix_rls_recursion.sql` | `is_approved_instructor()` + recursion-free Courses/videos policies (already folded into #2; run if you applied an older #2) |
| 8 | `fix_enrollments_column_types.sql` | `enrollments`: `user_id → text`, `course_id → bigint`, adds `id`/`status`/`enrolled_at`, PK, unique constraint |

### Recommended extras (data backfill / hardening)

| # | File | Purpose |
|---|------|---------|
| 9 | `phase1_course_status_fix.sql` | backfills `Courses.status` from `is_published` |
| 10 | `public_instructor_names.sql` | backfills instructor display names (needs #2) |
| 11 | `phase1_email_visibility.sql` | revokes anon access to email-bearing tables (needs #2) |

### Order rules
- `#2` before `#10` / `#11` (they reference `teacher_applications`).
- `#4` after `#3` (RPC needs the `notifications` table).
- `#7` / `#8` can run last.

---

## Do NOT run

| File | Why |
|------|-----|
| `course_lessons_permissions.sql` | Dead — references a `course_lessons` table that no longer exists (app uses `videos`). Will error. |
| `teacher_applications_minimal.sql` | Superseded by `teacher_applications.sql`. |
| `teacher_application_review_function.sql` | Superseded by `teacher_applications.sql`. |
| `fix_admin_teacher_approval.sql` | Superseded by `teacher_applications.sql`. |
| `fix_teacher_review_no_reviewed_at.sql` | Superseded by `teacher_applications.sql` (now adds `reviewed_at`). |
| `teacher_access_from_approved_application.sql` | Superseded by `teacher_applications.sql`. |
| `admin_profiles_fix.sql` | One-off; only addresses Supabase Advisor lint warnings, not functionality. |
| `security_advisor_warnings_fix.sql` | Optional — clears Supabase Advisor warnings only. |
| `security_remove_admin_rpc_warnings.sql` | Optional — clears Supabase Advisor warnings only. |
| `security_rls_emergency_check.sql` | Diagnostic only. |

These are kept for history. They are **not** part of the run order.

---

## Edge function (separate from SQL)

`functions/notify-email/index.ts` is a Deno Edge Function, deployed with the CLI, not
the SQL editor:

```
supabase functions deploy notify-email
```

Required env (Edge Function secrets): `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `ADMIN_EMAIL`.

---

## Notes

- **Admin** is identified by `public.is_admin()` (defined once in `reconcile.sql`), which
  all policies and admin RPCs call. To change the admin, edit the email in that one
  function plus `ADMIN_EMAIL` in `src/profileApi.js` on the app side. (The older modular
  files still inline the literal in each policy — another reason to prefer `reconcile.sql`.)
- `admin_list_users()` (in `reconcile.sql`) powers the admin Users tab — real emails and
  signup dates come from `auth.users` via this RPC, admin-only.
