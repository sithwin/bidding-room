# Task 3 Implementation Report — Identity Document Upload Endpoint

## Status: DONE_WITH_CONCERNS

## Files Created
- `apps/user-auth/src/application/upload-identity-document.use-case.ts` — use case with MIME type validation, 10 MB size check, R2 upload, domain method call, and repository save
- `apps/user-auth/src/application/upload-identity-document.use-case.test.ts` — 5 unit tests (all mocked)

## Files Modified
- `apps/user-auth/src/presentation/user-router.ts` — added `uploadIdentityDocument` to `UseCases` interface and `POST /identity-document` route with multipart parsing
- `apps/user-auth/src/presentation/user-router.test.ts` — added `uploadIdentityDocument` to `makeUseCases()` mock object to fix TypeScript build error
- `apps/user-auth/src/main.ts` — added R2 env var reads, `R2UploadClient` instantiation, auth middleware for `/api/users/identity-document`, and wired `UploadIdentityDocumentUseCase` into `buildUserRouter`

## Commit
- `a1e3318` feat(user-auth): identity document upload endpoint with R2 storage

## Test Summary
6 test files pass, 35 tests pass. New use case suite: 5/5 pass.
2 pre-existing test files fail (PostgresUserRepository, PostgresTokenRepository) — these require a live PostgreSQL connection and were failing before this task.

## Concern
A pre-existing TypeScript build error exists in `apps/user-auth/src/application/register.use-case.ts` line 52:

  error TS2353: Object literal may only specify known properties,
  and 'emailVerificationCode' does not exist in type 'UserRegisteredPayload'.

This error was present before Task 3 started (git diff confirms the file was not modified). The build fails due to this pre-existing issue. All Task 3 code is correct TypeScript — no errors in any newly created or modified files.

## Key Decisions Applied
- Key format: `identity-docs/{userId}/{Date.now()}.{ext}` (ext derived from `originalFilename.split('.').pop()`)
- Allowed MIME types: `image/jpeg`, `image/png`, `application/pdf`
- Max file size: 10 * 1024 * 1024 bytes (10 MB)
- File type check happens before user lookup (fail-fast ordering)
- Route returns `{ status: 'pending_review' }` on success, `{ error: message }` with 422 on validation/domain errors
- Auth middleware registered at `/api/users/identity-document` in main.ts
- R2 env vars now use `!` non-null assertions (as per brief spec) — fail fast on misconfigured deployments instead of silently passing empty strings to R2 API

---

## Code Review Fixes (Post-Implementation)

**Commit: `1a0aa67` fix(user-auth): use env assertion for R2 vars; clean misleading test mock**

### Finding 1: R2 env vars used `?? ''` instead of `!` assertion
**Status:** FIXED
- Changed `const R2_ACCOUNT_ID = process.env['R2_ACCOUNT_ID'] ?? '';` → `const R2_ACCOUNT_ID = process.env['R2_ACCOUNT_ID']!;` (and 3 other R2 vars)
- Aligns with brief specification and existing pattern for `DATABASE_URL` and `JWT_PUBLIC_KEY`
- Causes early startup failure if R2 vars missing, preventing cryptic R2 auth errors in production

### Finding 2: Misleading mock setup in unsupported-type test
**Status:** FIXED
- Removed `mockRepo.findById.mockResolvedValue(user)` from "rejects unsupported file types" test
- MIME type validation happens before repository lookup, so mock was never executed
- Test now correctly verifies only what's needed: bad MIME type → throws "Unsupported file type"

### Test Results After Fixes
- **All 5 upload-identity-document tests passing:** ✓ uploads file ✓ throws if user not found ✓ rejects unsupported file types ✓ rejects >10MB ✓ accepts jpeg/png
- Total: 6 test files pass, 35 tests pass
- Pre-existing DB connection failures remain (PostgresUserRepository, PostgresTokenRepository tests require live DB)
