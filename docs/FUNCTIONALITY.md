# BilX — Functionality & Rationale

Every functionality in BilX, what it does, and **why** it works that way. Pairs with `README.md` (setup) and `PROJECT_REPORT.md` (architecture).

The product's defining constraint shapes most decisions: **payment is manual over WhatsApp** (no gateway), and there is **no custom backend** (a React SPA talks straight to Supabase, with Row-Level Security doing the authorization). Many "why"s trace back to those two facts.

---

## 1. Authentication

### Email/password registration with verification
- **What:** Register with name, surname, email, password. Supabase sends a confirmation email; the account must be confirmed before it can log in.
- **Why:** Email verification prevents fake/typo accounts and gives a reliable contact channel (the whole purchase flow runs over email/WhatsApp, so a valid email matters). Name/surname are captured up-front so the admin and instructors see a real person, not just an email.

### Login → role-based redirect
- **What:** After login, admins go to `/admin`, everyone else to `/profile`.
- **Why:** Each role has a different "home"; routing them there immediately avoids an extra click and a confusing landing.

### Password reset
- **What:** "Forgot password" sends a Supabase reset link → `/reset-password` updates the password, then signs out so the user logs in fresh.
- **Why:** Standard, secure recovery using Supabase's built-in flow (no custom token handling to get wrong). Signing out after reset guarantees the new password is actually used.

### New users are always students
- **What:** A signup database trigger forces `role = 'student'`, ignoring anything the client sends.
- **Why:** **Security.** Role must not be self-assignable; otherwise anyone could register as an instructor. Promotion happens only through the admin-reviewed application.

---

## 2. Landing page (visitors, no login)

### Designed gradient hero with CTAs + stats
- **What:** Animated gradient hero with a headline, "Browse courses" (scrolls to the list) and "Become an instructor" CTAs, and live stats (course count, lifetime access).
- **Why:** A bare header + course shelf read as unfinished. A hero with clear CTAs tells a first-time visitor what the site is and what to do. The gradient (instead of a stock photo) keeps it on-brand and fast (no heavy image). "3 languages" was removed because **courses are Azerbaijani-only** — only the UI is multilingual, and advertising languages would mislead.

### Value highlights, "how it works", instructor band, footer
- **What:** A 4-card value strip, a 3-step "how it works" (find → WhatsApp → access), a teach-with-us band, and a footer with links + WhatsApp.
- **Why:** "How it works" is essential here because the **purchase model is unusual** (manual WhatsApp). Without it, visitors wouldn't understand how to actually buy. The rest builds trust and gives the page real structure/SEO content.

### Featured carousel + full grid
- **What:** A horizontal "featured" carousel (only shown when there are more than ~6 courses) plus a full responsive grid of all courses.
- **Why:** Two views of the same short list looked redundant, so the carousel only appears once the catalog is big enough to make "featured" meaningful; the grid always acts as the catalog. The carousel supports **mouse drag-to-scroll** on desktop (touch already scrolls) because side arrows alone feel dated.

### Search
- **What:** Navbar search filters courses by title/description; works on the home page live, and from other pages it navigates home with the query (`?q=`).
- **Why:** The search box is global (in the navbar), so it must do something everywhere — not silently fail off the home page. URL-based query makes results shareable and survives navigation.

### Free preview
- **What:** Visitors can watch the **first lesson** (and any lesson the instructor marks free) of a published course; the rest show as locked. Full lesson titles are visible.
- **Why:** A preview is a conversion driver — people buy what they can sample. Showing titles (without paid video URLs) lets buyers judge the curriculum. The first lesson is auto-free so **every** course has something to sample even if the instructor forgets to mark one.

### Share a course
- **What:** A "Share" button on each course page. On mobile it opens the native share sheet (`navigator.share` → WhatsApp/Telegram/etc.); on desktop it copies the course link to the clipboard with a confirmation toast. Shared links also **unfurl with a rich preview** (the course's own title, description, and thumbnail).
- **Why:** Course pages are public, so the link itself is shareable, but a button (native share + copy fallback) is far better UX than asking people to copy the address bar. Rich previews matter because BilX is a client-rendered SPA: a link crawler would otherwise only see generic meta tags. `api/og-course.js` serves crawlers (matched by user-agent in `vercel.json`) a small HTML doc with per-course Open Graph tags, while real browsers fall through to the normal SPA untouched — and if the lookup ever fails, it degrades to valid generic tags, never a broken preview.

---

## 3. Student

### Student dashboard ("My courses" + discover)
- **What:** Shows enrolled courses with progress; if none, shows an empty state plus a "discover courses" grid.
- **Why:** A logged-in student's first need is "continue my courses." The discover fallback prevents a dead-end empty screen for new students who haven't bought yet.

### WhatsApp request → manual access
- **What:** On a course page, "Contact on WhatsApp" opens a prefilled chat and logs a `requests` row. The admin later grants access by the student's email.
- **Why:** This is the **core monetization path** — there's no payment gateway, so purchase is a human conversation. Logging the request gives the admin a record of who's interested. Access is keyed by **email** so the admin can grant it even if the student hasn't created an account yet.

### Enrollment notification
- **What:** When the admin grants access, the student gets an in-app notification ("you now have access to X").
- **Why:** Closes the loop after an off-platform payment — the student gets immediate, in-app confirmation that their purchase went through, rather than wondering.

### Video progress tracking
- **What:** Watched lessons are recorded; the course shows a completion percentage; the player can auto-advance.
- **Why:** Progress is a basic expectation of any course platform — it helps students resume and feel momentum.

### Comments & ratings
- **What:** Enrolled students comment per lesson and rate the course (with an average shown).
- **Why:** Comments let students ask the instructor questions in context; ratings provide social proof for prospective buyers and feedback for instructors. Both are restricted to enrolled users so they're authentic.

### Inbox (message admin/instructor + reply)
- **What:** Students message the admin or a course's instructor, and can **reply** to messages they receive. Recipient choice is a segmented toggle; replying targets the original sender directly.
- **Why:** Support and instructor Q&A need a channel that isn't WhatsApp. Reply was added because "view-only" messages are useless for a conversation. The recipient toggle (vs. raw radios) is clearer and on-brand.

---

## 4. Instructor

### End-to-end flow (at a glance)

```
1. Apply to teach
   Student → "Müəllim ol" → modal (name, read-only email, required phone)
   → admin notified.

2. Get approved
   Admin approves → role becomes "instructor" (atomic RPC)
   → in-app + email "you're now an instructor".

3. Create a course
   Teacher panel → New course (title, description, price, cover image)
   → cover uploads to Supabase Storage (thumbnails)
   → course saved as status = draft.

4. Add lessons (video → Bunny Stream)
   For each lesson: title, optional duration, free-preview toggle, pick a video file.
     a. Browser → POST /api/bunny-create-video  (verifies approved instructor,
        creates the Bunny video, returns GUID + short-lived upload signature)
     b. Browser → Bunny  (TUS resumable upload, live progress bar; the file never
        passes through our server, the API key never reaches the browser)
     c. Browser → Supabase  (insert videos row with bunny_video_id, order_index,
        is_free — the FIRST lesson is auto-marked a free preview)

5. Submit for approval
   "Submit course" → status = pending. Admin reviews and approves/rejects.

6. After approval → read-only
   The instructor can no longer edit the course or its lessons; changes go through
   the admin via Inbox. (Building is only allowed while draft/pending.)

7. Ongoing
   Email notifications on enrollments, ratings, comments, and inbox messages.
```

Playback (student side) mirrors step 4 in reverse: `CoursePage` → `POST /api/bunny-playback` → access check (free preview → anyone; else enrolled/owner/admin) → **signed, expiring** Bunny embed URL → the player auto-advances to the next lesson on "ended" (Player.js protocol over postMessage).

### Apply to teach
- **What:** A student applies via a modal (name/surname prefilled, email read-only, **phone required**); the admin is notified.
- **Why:** Instructors are vetted, not self-serve, to keep course quality and trust. **Phone is required** so the admin can contact them directly (consistent with the WhatsApp-first model). Email is locked to the account's email to avoid impersonation.

### Approval + congratulations
- **What:** On admin approval, the user's role becomes instructor (atomically, via an RPC) and they get an in-app + email "you're now an instructor" message.
- **Why:** The atomic RPC prevents half-applied state (status updated but role not). The notification tells them they can now start teaching.

### Create course + add lessons + submit
- **What:** Instructors create a course (title, description, price, thumbnail), add lessons (video file → **Bunny Stream**, optional duration, free-preview toggle), then submit for approval (status → pending).
- **Why:** This is the content pipeline. Submit-for-approval keeps the admin in control of what goes public.

### Video hosting on Bunny Stream
- **What:** Lesson videos upload **directly from the browser to Bunny** over a resumable (TUS) upload with a live progress bar. The flow is: the dashboard calls `/api/bunny-create-video` (which verifies the caller is an approved instructor, creates the Bunny video, and returns a short-lived **upload signature**); the browser then streams the file straight to Bunny; finally the Bunny video GUID is saved to `videos.bunny_video_id`. Playback uses `/api/bunny-playback`, which checks access (free preview → anyone; otherwise enrolled/owner/admin) and returns a **signed, expiring embed URL**.
- **Why:** Two hard constraints shaped this. (1) Serverless request bodies are capped at ~4.5 MB, so a multi-hundred-MB video **cannot** be proxied through a function — the browser must talk to Bunny directly, and the API key must stay server-side, hence the presigned-upload split. (2) A plain Bunny embed URL is public; with **Token Authentication** on the library and per-request signed URLs minted only after an access check, a paid lesson can't be watched (or shared) without server authorization — the same protection the platform's access control depends on. Legacy YouTube/Storage lessons (`video_source = 'legacy'`) still play through the old path so nothing breaks.

### Approved courses are read-only to the instructor
- **What:** Once a course is approved, the instructor can't edit it or its lessons; they're told to message the admin for changes. (While draft/pending they can still build it.)
- **Why:** Per the workflow spec, the admin owns what's published — an instructor shouldn't silently change a course students paid for. Editing routes through the admin so changes are reviewed. (The course-edit page is admin-only, enforced in the UI.)

### Instructor email notifications
- **What:** Emails for: a student joined your course, rated it, commented, or messaged you; and admin messages.
- **Why:** Instructors aren't always in the app; email keeps them responsive to students and aware of activity.

### Mode switch (student ↔ teacher)
- **What:** Instructors default to the student view and can switch to the teacher panel (and back) from the navbar.
- **Why:** Instructors are also learners; one account serving both roles avoids duplicate logins, and the explicit switch keeps the two contexts clear.

---

## 5. Admin

### Course moderation
- **What:** See all courses; approve/reject (toggles `is_published` + `status`), edit, or delete.
- **Why:** The admin is the quality gate and the only one who can publish. Edit/delete give full control over the catalog.

### Grant / revoke access
- **What:** Grant a student access to a course by **email**; revoke it. Granting notifies the student (in-app + email).
- **Why:** This is how a "purchase" becomes real access in a manual-payment model. Email-keying lets the admin grant access from just the WhatsApp conversation.

### Teacher application review
- **What:** Approve/reject pending applications; pending count badge in the sidebar; a bell notification when a new one arrives.
- **Why:** Vetting instructors needs a clear queue. The badge/notification means the admin doesn't miss applications.

### User directory + profile drill-down
- **What:** A users table (role, name, email, phone, signup date, status) backed by an admin-only RPC reading real emails from `auth.users`. Clicking a user shows their courses, comments, **last active + device**, and lets the admin message, **ban/unban**, or **delete** them.
- **Why:** The admin needs real identities to support users and run the business — but emails must **not** leak through the public profiles table, so they come via a `SECURITY DEFINER` admin-only function. Ban/delete are basic moderation tools (with self-protection so the admin can't lock itself out). Last-active/device help spot issues and verify the session feature.

### Statistics
- **What:** KPI cards (total users, students, instructors, courses, enrollments) and a per-month bar breakdown (new users, new teachers, courses shared, courses bought).
- **Why:** The owner asked for a monthly report ("in June: X bought, Y users…"). Visual KPIs + monthly bars give an at-a-glance business pulse without a separate analytics tool.

---

## 6. Notifications & email

### In-app notification bell
- **What:** A bell with unread count and a dropdown; notifications for enroll/comment/rating/inbox/teacher events, with deep links.
- **Why:** Immediate, in-context feedback while the user is on the site — cheaper and faster than email for things they'll see anyway.

### Transactional email (Resend via edge function)
- **What:** Emails to the admin/instructor/student/approved-teacher for the same events, sent by the `notify-email` Edge Function.
- **Why:** Email reaches users who aren't currently in the app (the people who most need to act — an instructor with a new student, a student who got access). It runs in an **edge function** (not the browser) so the Resend API key stays secret and HTML is safely escaped server-side.

### Cross-user notifications via RPC
- **What:** A student notifying an instructor (or the admin) goes through `create_notification` / `notify_admin` functions.
- **Why:** RLS forbids writing a notification row for *another* user (that would be an abuse vector). A `SECURITY DEFINER` RPC performs the controlled insert so legitimate cross-user pings work without opening the table up.

---

## 7. Single active session per user

- **What:** Each login writes a fresh session token (overwriting the previous one). The app checks it on load/focus, runs a 2-minute heartbeat, and listens via Realtime; if the account logs in elsewhere, the old device is logged out with a message. A post-login grace window stops a device from kicking itself; logout/kick use local scope.
- **Why:** Requested to stop **account sharing** (one purchase used on many devices simultaneously) — the main leakage risk in a paid-content product. "Newest login wins" (Option A) is the least confusing behavior and avoids lock-outs. It's **app-enforced** (not a hard DB wall) because a hard wall on this stack brings real fragility (token-refresh edge cases, forced global re-logins) for little extra benefit at this product's risk level — see `PROJECT_REPORT.md §5`.

---

## 8. Cross-cutting

### Multi-language UI (AZ/RU/EN)
- **What:** A language switcher; all UI strings come from `i18n.jsx`; choice persists.
- **Why:** The audience reads Azerbaijani/Russian/English; a translated UI widens reach. **Content stays Azerbaijani** — only the interface is translated, so we don't promise multilingual courses.

### Row-Level Security everywhere
- **What:** Every table enforces access in Postgres; the browser only ever uses the public anon key.
- **Why:** With no backend, the **database is the security boundary**. RLS guarantees a user can only read/write what they're allowed to, even though requests come straight from the browser.

### Manual-payment design (no gateway)
- **What:** Purchases happen over WhatsApp; the admin grants access.
- **Why:** A deliberate business choice for this market — simpler to launch, no payment-processor integration/fees, and it fits how the operator already sells. Nearly every flow (requests, email-keyed enrollments, admin grant, "how it works") exists to support it.

### Accessibility & performance touches
- **What:** Keyboard focus rings, reduced-motion support, lazy/async images, WebP assets, loading skeletons, responsive layouts.
- **Why:** A professional, usable site for keyboard users, slow connections, and phones — and to keep the (image-heavy) landing page fast.
