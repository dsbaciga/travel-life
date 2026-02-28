# Supabase Migration Evaluation

**Date**: 2026-02-28
**Status**: Evaluation / Research
**Scope**: Migrating Travel Life backend from self-hosted Express + PostgreSQL to Supabase

---

## Executive Summary

Migrating Travel Life to Supabase is a **medium-to-large effort** (estimated 4–8 weeks of focused work). The migration is feasible because the app already uses PostgreSQL, but the self-hosted architecture has deep integration points — custom JWT auth, local file storage, in-memory caches, cron jobs, and middleware — that don't have 1:1 Supabase equivalents. The biggest wins would be eliminating infrastructure management and gaining managed auth, but the biggest costs are rewriting the file upload pipeline and losing fine-grained control over middleware and background jobs.

**Difficulty Rating: 6/10** — Not a trivial swap, but not a rewrite either.

---

## Current Architecture at a Glance

| Component | Current Implementation |
|---|---|
| Database | PostgreSQL 15 + PostGIS, 30 tables, Prisma ORM |
| Auth | Custom JWT (HS256, 15m access + 7d refresh), bcrypt, in-memory token blacklist |
| API Server | Express 4.18, 24 route modules, Zod validation |
| File Storage | Local filesystem (`uploads/`), Sharp thumbnails, EXIF extraction |
| Background Jobs | node-cron (daily trip status update, token blacklist cleanup) |
| Rate Limiting | express-rate-limit (in-memory, tiered) |
| Geocoding | Self-hosted Nominatim (Docker) |
| External APIs | Immich, OpenRouteService, OpenWeatherMap, AviationStack |
| Email | Nodemailer with per-user SMTP config |
| Real-time | None (polling-based) |

---

## Migration Complexity by Component

### 1. Database Schema — LOW difficulty

**What changes**: Very little. Supabase is PostgreSQL, so the schema migrates almost directly.

- **30 Prisma models** → Supabase tables (Prisma works with Supabase's PostgreSQL)
- **PostGIS** → Supabase supports PostGIS natively
- **GIST indexes** on geography columns → Supported
- **Enums** (5 total) → Supported
- **jsonb fields** (e.g., `User.activityCategories`) → Supported

**Approach options**:

- **Keep Prisma**: Continue using Prisma ORM pointed at Supabase's PostgreSQL connection string. Minimal code changes. This is the path of least resistance.
- **Switch to Supabase client**: Replace Prisma with `@supabase/supabase-js` and use Row Level Security. Major rewrite of all 15+ service files. Not recommended unless you want to go all-in on Supabase patterns.

**Estimated effort**: 1–2 days (keep Prisma) or 2–3 weeks (switch to Supabase client).

### 2. Authentication — MEDIUM difficulty

**Current system**: Custom JWT with HS256 signing, bcrypt password hashing, in-memory token blacklist, refresh token rotation via HTTP-only cookies, password version tracking for token invalidation, file-access authentication via Bearer token or refresh cookie.

**Supabase Auth provides**:

- Email/password auth out of the box
- JWT tokens (access + refresh) managed automatically
- Row Level Security integration
- OAuth providers (Google, GitHub, etc.) for free
- Email confirmation, password reset flows

**Migration challenges**:

- **Password version tracking**: Current system invalidates all tokens when a user changes their password via a `passwordVersion` field. Supabase Auth handles this differently (session revocation). Need to verify equivalent behavior.
- **File access auth**: Current `/uploads` middleware checks Bearer token OR refresh cookie for `<img>` tag access. Supabase Storage has its own access control model.
- **Token blacklist**: In-memory blacklist for logout. Supabase handles session management natively.
- **CSRF protection**: Custom middleware — would need to be rethought with Supabase Auth flow.
- **User model coupling**: The User model has 15 relations and stores app-specific fields (activityCategories, defaultTripTypes, smtpConfig). These would need to live in a separate `profiles` table linked to Supabase's `auth.users`.

**Estimated effort**: 1–2 weeks (auth rewrite + testing all flows).

### 3. File Storage — HIGH difficulty

**Current system**: Multer uploads → magic bytes validation → Sharp thumbnail generation → EXIF extraction → local filesystem storage. Videos processed with ffmpeg for duration. Immich integration as alternate source.

**Supabase Storage provides**:

- S3-compatible object storage
- Built-in access control via RLS policies
- Image transformations (resize, crop) on the fly
- CDN delivery

**Migration challenges**:

- **Server-side processing pipeline**: The current upload flow does significant processing (magic bytes validation, EXIF extraction, thumbnail generation, video duration detection). This logic would need to run in a Supabase Edge Function or a separate processing service — Supabase Storage alone doesn't handle this.
- **Thumbnail generation**: Currently done synchronously with Sharp on upload. With Supabase Storage, you can use on-the-fly image transforms, but the URLs and caching behavior differ.
- **EXIF extraction**: Currently extracts coordinates and timestamps from uploaded photos using `exifr`. This would need to happen in an Edge Function triggered on upload.
- **Video processing**: `fluent-ffmpeg` for duration extraction requires ffmpeg binary — not available in Edge Functions. Would need a separate worker or skip this feature.
- **Immich integration**: Proxies requests to Immich server — unchanged, but URL patterns for serving photos would change.
- **Existing files**: All uploaded photos/thumbnails need to be migrated to Supabase Storage buckets.

**Estimated effort**: 2–3 weeks (rewrite upload pipeline, Edge Functions, data migration).

### 4. API Server / Express Middleware — MEDIUM difficulty

**Option A: Keep Express server, use Supabase as database only**

- Minimal changes — just swap the database connection string
- Keep all middleware (Helmet, CORS, rate limiting, error handling)
- Still need to host the Express server somewhere
- **This partially defeats the purpose of migrating to Supabase**

**Option B: Move API to Supabase Edge Functions**

- Rewrite 24 route modules as Edge Functions (Deno runtime)
- Lose Express middleware ecosystem (Helmet, express-rate-limit, etc.)
- Need alternative rate limiting (Supabase has built-in rate limits but less granular)
- Zod validation works in Deno, but some npm packages may not
- Each Edge Function is a separate deployment unit — different operational model

**Option C: Hybrid — Use Supabase for auth/storage/database, keep Express for business logic**

- Best of both worlds but adds architectural complexity
- Two systems to maintain and monitor
- Network latency between Express server and Supabase cloud

**Estimated effort**: 0 days (Option A) / 3–4 weeks (Option B) / 1 week (Option C).

### 5. Background Jobs — LOW-MEDIUM difficulty

**Current jobs**:

- Daily trip status auto-update (node-cron, midnight)
- Token blacklist cleanup (every 24 hours)

**Supabase alternatives**:

- **pg_cron**: PostgreSQL extension available in Supabase. Can run SQL-based cron jobs directly. The trip status update is simple enough to be a SQL function.
- **Edge Functions + external cron**: Use an external cron service (e.g., cron-job.org, GitHub Actions) to trigger Supabase Edge Functions.
- **Database webhooks**: Supabase can trigger functions on database events.

**Estimated effort**: 2–3 days.

### 6. Rate Limiting — LOW-MEDIUM difficulty

**Current**: express-rate-limit with tiered limits (auth: 15/15min, search: 10/min, general: 1000/15min).

**Supabase**: Has built-in rate limiting at the infrastructure level but with less granularity. For Edge Functions, you'd need to implement custom rate limiting using a database table or Redis.

**Estimated effort**: 1–2 days (if keeping Express) / 3–5 days (if using Edge Functions).

### 7. Geocoding (Nominatim) — NO CHANGE

Self-hosted Nominatim is independent of the backend. It would continue running as a Docker container regardless of migration. No effort required.

### 8. External API Integrations — LOW difficulty

Immich, OpenRouteService, OpenWeatherMap, AviationStack — all are HTTP calls via Axios. These work identically whether called from Express or Edge Functions. The only change is importing Axios vs. using Deno's `fetch` if moving to Edge Functions.

**Estimated effort**: 1–2 days (mostly import/fetch adjustments if using Edge Functions).

### 9. Email (Nodemailer) — MEDIUM difficulty

**Current**: Per-user SMTP configuration stored in User model. Users configure their own SMTP servers for sending trip invitations.

**Supabase**: Has built-in email for auth flows but not for arbitrary transactional email. Per-user SMTP config would still need custom code — either in an Edge Function or a separate service. Nodemailer doesn't run in Deno natively.

**Estimated effort**: 2–3 days.

---

## Advantages of Migrating to Supabase

### Strong Advantages

1. **Managed infrastructure**: No more managing PostgreSQL backups, updates, or scaling. Supabase handles replication, point-in-time recovery, and automated backups.

2. **Managed authentication**: Supabase Auth provides email/password, OAuth providers, MFA, email verification, and password reset out of the box. Eliminates ~500 lines of custom JWT code and removes the security burden of maintaining auth.

3. **Row Level Security (RLS)**: Database-level access control. Currently, every service method manually checks `verifyTripAccessWithPermission()`. With RLS, unauthorized access is impossible at the database layer — a stronger security guarantee.

4. **Built-in storage with CDN**: Supabase Storage provides S3-compatible storage with built-in CDN, access control, and on-the-fly image transforms. Eliminates local filesystem dependency and makes the app stateless.

5. **Real-time capabilities**: Supabase Realtime enables live subscriptions to database changes. While not currently needed, this would make trip collaboration much richer (live editing, presence indicators) with minimal code.

6. **Dashboard and monitoring**: Supabase provides a web dashboard for database management, query monitoring, storage browsing, auth user management, and logs — replacing the need for Prisma Studio and manual log inspection.

7. **Easier horizontal scaling**: Stateless Edge Functions scale automatically. No need to manage server instances or worry about in-memory state (token blacklist, rate limit counters) across multiple servers.

8. **Free tier available**: Supabase's free tier includes 500MB database, 1GB storage, 50K monthly active users — more than enough for personal use.

### Moderate Advantages

9. **PostgREST auto-generated API**: Supabase auto-generates a RESTful API from your database schema. Some CRUD endpoints could be replaced entirely, reducing custom code.

10. **TypeScript type generation**: `supabase gen types` generates TypeScript types directly from your database schema, eliminating manual type maintenance.

11. **Database branching** (Pro plan): Preview database changes in isolated branches before deploying — safer migrations.

12. **Edge Functions**: Globally distributed serverless functions for custom business logic, reducing latency for geographically distributed users.

---

## Disadvantages and Risks

### Significant Concerns

1. **Vendor lock-in**: Moving from self-hosted PostgreSQL to Supabase ties you to their platform. While Supabase is open-source and you can self-host it, the managed service has proprietary features (Edge Functions runtime, Storage CDN).

2. **Loss of control**: Custom middleware (Helmet security headers, CSRF, fine-grained rate limiting) doesn't translate directly. Supabase has its own security model, but it's less configurable.

3. **File processing gap**: The current upload pipeline (magic bytes validation, EXIF extraction, Sharp thumbnails, ffmpeg video processing) is too complex for Supabase Storage alone. You'd need Edge Functions or an external processing service, adding complexity.

4. **Edge Function limitations**: Deno runtime, 150s max execution time (on Pro), limited npm compatibility. Some dependencies (Sharp, fluent-ffmpeg) won't work in Edge Functions and require alternative approaches.

5. **Cost at scale**: While the free tier is generous, the Pro plan ($25/month) adds up with storage, bandwidth, and Edge Function invocations. Self-hosting on a home server or VPS may be cheaper for a personal app.

6. **Per-user SMTP**: The current per-user SMTP configuration pattern is unusual and doesn't fit Supabase's email model. Would need custom handling.

7. **Migration risk**: 30 tables with 70+ relationships, existing user data, uploaded files — all need to be migrated carefully. Any data loss is unacceptable for a personal travel documentation app.

8. **Self-hosted Nominatim**: Still needs to run somewhere. Supabase doesn't replace this dependency — you'd still need a server or container host for geocoding.

---

## Recommended Migration Paths

### Path 1: Database-Only Migration (Lowest Risk) — 1–2 weeks

Keep the Express server. Point Prisma at Supabase's PostgreSQL. Optionally adopt Supabase Auth.

**What changes**:

- Database connection string
- Optionally: auth system → Supabase Auth
- Everything else stays the same

**Pros**: Minimal code changes, managed database backups, easy rollback.
**Cons**: Still need to host Express server, doesn't leverage most Supabase features.

### Path 2: Auth + Database + Storage (Medium Risk) — 4–6 weeks

Migrate database, authentication, and file storage to Supabase. Keep Express for API logic.

**What changes**:

- Database → Supabase PostgreSQL
- Auth → Supabase Auth
- File uploads → Supabase Storage + Edge Functions for processing
- Express server still runs API logic

**Pros**: Stateless app server, managed auth and storage, CDN for photos.
**Cons**: Hybrid architecture complexity, Edge Function limitations for image processing.

### Path 3: Full Migration (Highest Risk) — 6–10 weeks

Replace Express entirely with Supabase Edge Functions, RLS, and PostgREST.

**What changes**:

- Everything moves to Supabase
- 24 route modules → Edge Functions + PostgREST auto-API
- All middleware → Supabase security model
- Cron jobs → pg_cron

**Pros**: No server to maintain, fully managed, globally distributed.
**Cons**: Major rewrite, Deno runtime constraints, loss of npm ecosystem, highest risk.

---

## Recommendation

For a personal travel documentation app that's already 92% complete and production-ready, **Path 1 (Database-Only)** offers the best effort-to-value ratio. You get managed database backups and monitoring with minimal disruption.

**Path 2** is worth considering if you want to eliminate local file storage (making the app truly portable/stateless) and simplify authentication. But budget 4–6 weeks and accept that the file processing pipeline will need significant rework.

**Path 3 is not recommended** unless you're prepared for a near-complete backend rewrite and are comfortable with Deno/Edge Function constraints.

---

## Decision Matrix

| Factor | Stay (Express + PG) | Path 1 (DB only) | Path 2 (Auth+DB+Storage) | Path 3 (Full) |
|---|---|---|---|---|
| Effort | 0 | 1–2 weeks | 4–6 weeks | 6–10 weeks |
| Risk | None | Low | Medium | High |
| Infrastructure burden | High | Medium | Low | Minimal |
| Feature disruption | None | None | Moderate | Significant |
| Vendor lock-in | None | Low | Medium | High |
| Monthly cost | VPS/home server | $0–25 | $25+ | $25+ |
| Rollback difficulty | N/A | Easy | Moderate | Hard |
