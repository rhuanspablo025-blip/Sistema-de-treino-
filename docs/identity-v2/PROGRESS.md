# Identity V2 — implementation progress

Branch: `feat/identity-management-v2`. No merge to `main` or production deployment/database migration.

## Implemented in code

- SQL-native, idempotent migration `identity_v2_001` for identity profiles, identities, credentials, sessions, devices, email/SMS challenges, CPF verification proofs, relationships, invites, and security events. Foreign keys, role/mode checks, globally unique normalized identity keys, one active DEV constraint, and indexes are enforced by SQLite/libSQL.
- `scripts/migrate-identity-v2.mjs` / `npm run migrate:identity-v2` applies the migration only when `TURSO_DATABASE_URL` uses `file:`. It refuses remote Turso URLs.
- Identity services normalize usernames/e-mail/BR mobile numbers, mathematically validate CPF, protect CPF with AES-256-GCM and lookup HMAC, and hash passwords with scrypt plus a 12–128 character strength policy.
- New user creation is transactional. Public roles are limited to `PERSONAL` and `ALUNO`; personal/student profile data is stored in SQL. Verified account creation consumes a CPF provider proof and requires consumed, matching e-mail and SMS challenges, terms acceptance, and initial-device consent.
- Verification challenges use random six-digit codes, HMAC storage, expiration, five-attempt exhaustion, one-minute resend cooldown, five-per-hour shared destination limits, invalidation, single-use consumption, and opportunistic 30-day cleanup. Challenge purposes exposed publicly are limited to signup email and phone.
- Resend-compatible e-mail delivery and Twilio SMS delivery adapters are implemented. CPF verification calls the configured provider and stores only keyed hashes and proof metadata; provider absence/failure never fabricates success. CPF verification has a shared per-CPF attempt limit.
- Seven-step `/register` experience handles Personal/Aluno selection, identity/CPF check, e-mail and SMS challenges, password strength, profile configuration, terms/device consent, and safe session-only draft persistence. CPF, contact, code, and password values are not persisted in browser storage.
- The existing login/session lookup accepts active Identity V2 users while retaining legacy account lookup. Identity V2 logins persist token hashes in SQL; logout revokes the matching SQL session.

## Evidence from this checkout

- Local `file::memory:` migration applied successfully through `npm run migrate:identity-v2`; a non-`file:` URL was rejected before connecting.
- `npm test`: 30/30 passed, including migration idempotence, unique constraints, foreign-key enforcement, CPF proof binding/replay rejection, password policy, verification expiry/single use, and shared resend limits.
- `npm run build`: passed after the required retry. Next.js 16.4.3 displays its built-in security upgrade advisory; the build then completes with all routes compiled.
- The enabled providers still need deployment environment values (`RESEND_API_KEY`, `IDENTITY_EMAIL_FROM`, Twilio credentials, CPF provider URL/token, and 32-byte identity/HMAC keys). Signup correctly remains unavailable without required verification services and keys.

## Remaining work

- Integrate provider-owned CPF verification into a real provider contract review and configure credentials; do not use fake success.
- Import/reconcile legacy identity records and cross-check duplicate usernames/contact/CPF across old records before enabling the new registration flow broadly.
- Implement central role/permission migration, confirmed immutable DEV owner ID, and safe legacy role mapping without promoting an admin by name.
- Complete Personal↔Aluno invite/accept/reject/suspend/unlink lifecycle, capacity enforcement, and tenant-isolation tests.
- Enforce independent-student workout ownership across existing workout APIs.
- Finish device trust/revocation and mandatory DEV MFA; implement DEV and Personal management consoles against SQL.
- Add end-to-end tests for the new HTTP flows and verify provider delivery in a configured non-production environment.

No external provider credentials were available to this implementation, and the remote database was not modified.
