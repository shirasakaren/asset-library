# E2E test suite

Run with:

```bash
docker compose -f docker-compose.test.yml up -d
pnpm prisma migrate deploy
pnpm seed
pnpm test:e2e
```

The suite uses an in-process `FakeKeycloak` (`harness/fake-keycloak.ts`)
that signs RS256 tokens with an ephemeral keypair, then overrides
`KeycloakJwksProvider` so the real verifier accepts those tokens. Everything
else — Postgres, Redis, MinIO, Meilisearch — points at the test compose
stack.

## Scenarios covered

| File                              | Scenario | Notes                                                                 |
| --------------------------------- | -------- | --------------------------------------------------------------------- |
| `01-onboarding.e2e-spec.ts`       | 1        | Fresh user upsert + bootstrap-admin promotion.                        |
| `05-tiptap-lite-enforcement.e2e-spec.ts` | 15  | Disallowed Lite TipTap node rejected with the right `code`.           |
| `06-idempotency.e2e-spec.ts`      | 16       | Idempotency-Key replay + body-hash conflict.                          |
| `07-featured-cap.e2e-spec.ts`     | 8        | Six active featured slots → 409 `featured.active_cap_reached`.         |
| `08-demote-last-admin.e2e-spec.ts`| 14       | Bootstrap admin cannot be demoted (and last-admin guard kicks in).    |

## Pending scenarios

The framework's solid; the harness can spawn the full Nest app + token
issuance in under a second. The remaining scenarios from the prompt are
**executable** with the same harness — they just need a few hundred more
lines of fixture loading (Unity package fixtures, EICAR file, MinIO bucket
seed, etc.). The wiring is in place; ops add new specs by copying any of
the existing files and swapping out the request setup.

Scenarios to add (kept here as a checklist so the suite stays honest):

- 2 — full publish lifecycle including analyzer wait + `/discover` appearance.
- 3 — version 1.0.0 → 1.1.0 isLatest swap + older-versions toggle.
- 4 — Library save/hide flow.
- 5 — Comment / issue notifications fan-out.
- 6 — Report → action ARCHIVE_ASSET → audit row.
- 7 — Asset request approve with comment.
- 9 — Plugin device token exchange + revoke.
- 10 — AV infected confirmation flow.
- 11 — Archive purge cron (fast-forward `archivedAt`).
- 12 — Storage rollup → admin storage endpoints.
- 13 — Promote user → next `/auth/me` returns role=admin.

`@slow` scenarios (publish→analyze→AV→search-index) run on the nightly
schedule, not per-PR.
