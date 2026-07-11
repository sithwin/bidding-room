# Kickoff prompt — lot image processing (paste into a fresh session)

Execute two implementation plans in this repo using the
superpowers:subagent-driven-development skill, in this exact order.

## Order (strict)
1. `docs/superpowers/plans/2026-07-10-lot-image-management.md` — the UNEXECUTED
   prerequisite. Verified absent as of 2026-07-11: no
   `apps/catalogue/migrations/004_add_lot_image_key.sql`, no
   `delete-image-use-case.ts` / `reorder-images-use-case.ts`, no `confirm`
   proxy in `apps/admin/src/presentation/lots-router.ts`, no `key` field on the
   catalogue domain `LotImage`. This plan must fully complete first.
2. `docs/superpowers/plans/2026-07-11-lot-image-processing-pipeline.md` — depends
   on plan 1 (migration 005, pending-status uploader, confirm publishing, etc.).
   Its own PREREQUISITE section restates the check.

## Branch
Before any implementation commit, create and switch to a new branch off `main`:
`feat/lot-image-processing` (or a worktree on that branch via
superpowers:using-git-worktrees). Do NOT implement on `main`.

## How to run
- Use superpowers:subagent-driven-development: fresh implementer subagent per
  task, task reviewer (spec + quality) after each, fix loop for
  Critical/Important findings, broad whole-branch review at the end.
- Pick the cheapest model that fits each task (most tasks in plan 2 contain the
  full code to write -> transcription-tier implementers; reviewers mid-tier).
- Both plans are TDD with exact file paths, code, and commands. Hand each
  implementer only its task brief (`scripts/task-brief PLAN_FILE N`), not the
  whole plan.

## Context notes (things a fresh session won't know)
- Repo: The Carat Room auction platform (Turborepo + pnpm). See root `CLAUDE.md`.
- Design spec for plan 2: `docs/superpowers/specs/2026-07-11-lot-image-processing-pipeline-design.md`.
- Key decisions already made: reusable `packages/image-processing` library
  (Clean Architecture ports/adapters), hosted inside catalogue-service's
  composition root; RabbitMQ + R2 ship, Kafka + AWS-S3 are test-only
  proof-of-concept adapters proving swappability; virus scan (ClamAV) +
  thumbnail (sharp) toggled by config; multipart upload above a 20MB threshold;
  rejected images kept with a warning badge (not auto-deleted).
- Watch the standing repo lessons in `CLAUDE.md` (migrate-on-boot, mirror
  migrations into `tests/db-init/init.sql`, diff env vars against BOTH
  docker-compose files, event payloads typed against `@carat-room/shared-types`,
  queue bindings diffed against `infra/rabbitmq/definitions.json`).

## Finish
After both plans pass their final reviews, use
superpowers:finishing-a-development-branch to decide merge/PR.
