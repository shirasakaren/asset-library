## Summary

<!-- What does this change do and why? -->

## Workspace member(s) touched

- [ ] `backend/`
- [ ] `frontend/`
- [ ] repo root (CI, docker, docs, workspace files)

## Checklist

- [ ] Lint and typecheck pass locally (`pnpm lint && pnpm typecheck`)
- [ ] Tests pass (`pnpm test`)
- [ ] OpenAPI docs are current (`pnpm openapi:sync` — no diff)
- [ ] Database changes ship via the consolidated migration script
- [ ] Environment variables are documented in the relevant `.env.example`
- [ ] Commit messages follow Conventional Commits
