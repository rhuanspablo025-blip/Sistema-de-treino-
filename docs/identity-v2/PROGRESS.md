# Identity V2 progress

Branch: `feat/identity-management-v2` (isolated; no merge to `main`).

Statuses reflect repository inspection on 2026-11-20.

| Area | Status | Evidence / next work |
|---|---|---|
| Existing user management | Partially implemented | `app/page.jsx`, `/api/users`, role helpers; legacy `student/trainer/admin/dev` model remains. |
| Turso identity foundation | Not started | Current app still uses compatibility document collections; audit schema and design additive migrations. |
| CPF uniqueness and validation | Not started | No verified CPF identity flow found; implement normalization/check digits before provider integration. |
| Email/phone verification | Blocked by provider credentials for live delivery | Build challenge/storage and provider adapters; production success must require real provider. |
| Password policy | Partially implemented | Existing auth/register flow; audit hashing and strengthen policy without breaking accounts. |
| Sessions/devices/MFA | Not started | Session version exists; trusted devices, OTP challenges and DEV MFA need new infrastructure. |
| Roles/central authorization | Partially implemented | Legacy role checks exist in `lib/roles.js` and `lib/api-auth.js`; migrate compatibly to DEV/PERSONAL/ALUNO permissions. Immutable owner ID is not confirmed; do not assign DEV by name. |
| Personal-student relationships | Partially implemented | Existing owner/coach fields; no complete invitation/relationship lifecycle identified. |
| Registration experience | Partially implemented | Existing login/register pages; seven-step verified onboarding not implemented. |
| DEV global console | Not started | Existing admin views are not the specified owner console. |
| Personal console | Partially implemented | Existing student/user screens; tenant isolation and relationship enforcement require audit. |
| Independent student workouts | Partially implemented | Existing workout engine; ownership/mode rules require implementation. |
| Visual validation | Not started for identity V2 | Capture specified viewports after redesigned flows exist. |
| Security and regression tests | Partially implemented | Existing 23-test suite; required identity/tenant/concurrency cases remain. |
| External integrations | Blocked by credentials for production validation | Email, SMS and authorized CPF provider credentials are not present in source inspection. |

No production database changes, destructive migrations, commits, or deploys have been made for Identity V2.

## Implementation update — relational identity foundation

Completed and executed locally:
- Added transactional, idempotent SQL migration `identity_v2_001` for identities, encrypted CPF fields and HMAC lookup, credentials, sessions, devices, verification challenges, relationships, invites and security events.
- Database constraints enforce normalized identity uniqueness, one non-closed DEV, valid role and student-mode pairings, relationship uniqueness, and foreign keys.
- Added CPF check-digit validation, AES-256-GCM CPF encryption, keyed CPF lookup, username/email/phone normalization, scrypt password hashing, and transactional pending identity creation. Public creation accepts PERSONAL/ALUNO only.
- `getTursoClient()` exposes the existing Turso client for SQL-native identity work; legacy document collections remain unchanged.
- Local libSQL migration and constraints are exercised in `tests/identity-v2.test.mjs`.

Validation: identity tests 4/4; full suite 27/27; production build passed on retry after Next.js security advisory prompt. No production database was touched. No real provider credentials were used.

Still pending: migration wiring through an explicit safe rollout, registration API/UI integration, live verification providers, relationship lifecycle APIs, session/device/MFA flows and owner ID configuration. No owner was promoted to DEV.
