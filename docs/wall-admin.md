# Owner portal and wall moderation

The owner can sign in, edit and publish the wall, review visitor contributions, and change the owner password from the browser. The public wall continues to read the active revision from the Worker. The browser workflow uses the existing wall data format and private media bucket.

## Routes and screen behavior

| Route                     | Behavior                                                                                                                                                                                                       |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/login`                  | Single password field and a **Sign in** button. A valid session redirects to `/admin/wall`. Invalid credentials produce one generic error. Rate limiting shows when to retry.                                  |
| `/admin`                  | Redirects signed-in owners to `/admin/wall` and signed-out owners to `/login`.                                                                                                                                 |
| `/admin/wall`             | **Wall** in the left navigation. The **Editor** view contains the wall canvas, item forms, and **Save draft**, **Preview**, and **Publish** controls. A **Submissions** view links to the review queue.        |
| `/admin/wall/submissions` | Shows pending submissions newest first, with photo previews and **Accept** and **Reject** actions. A status filter gives access to accepted and rejected records.                                              |
| `/admin/password`         | **Change password** in the left navigation. Requires current password, new password, and confirmation. Shows validation and confirmation after a successful change.                                            |
| `/wall`                   | Public browsing with a **Contribute** button. The form accepts a title and a note or a single photo with an optional caption and required alt text. Successful submission shows that the owner will review it. |

The admin shell provides **Sign out** and adapts its navigation to narrow screens. Use labeled forms, keyboard-accessible buttons, visible focus, and status feedback for saves, publishes, uploads, and moderation. Provide numeric `x` and `y` inputs in item forms as a keyboard alternative to dragging. Sign-in and admin pages are rendered on demand, carry `Cache-Control: no-store` and `X-Robots-Tag: noindex`, and stay out of the sitemap. [Astro on-demand rendering](https://docs.astro.build/en/guides/on-demand-rendering/)

### Editor behavior

- Initialize the server draft from the current active revision or an empty wall. Load it on every editor entry. Retain stable item IDs, folder links, nested layouts, layer order, and canvas coordinates. Reuse the wall canvas and the existing validation rules where practical.
- The owner can add, edit, move, and remove notes, photos, and folders. Expose the existing item fields, including photo caption and alt text, folder description, and note body. Confirm removal of a nonempty folder and tell the owner how many descendants will be removed.
- Local edits are dirty until **Save draft** succeeds. Show the pending state, prevent duplicate submits, and keep local changes after an error. Preview uses editor state and private image URLs, including unsaved edits. Publish saves dirty changes first and publishes the specific saved version. Leaving with dirty edits gives the owner a chance to save. A conflict keeps local edits visible and offers a deliberate reload of the server draft.
- If the CLI publishes while the hosted draft has unpublished changes, return a conflict at publish time and offer a confirmed **Start from live wall** action. Keep both the draft version and active revision in that request to prevent resetting work from another tab. A clean draft can follow a newer live revision automatically.
- Accepting a contribution adds a card once to the draft. The owner may choose a destination folder, with root as the default, then edit or drag the card in the editor. Accepted and rejected are terminal review states. The existing editor delete action removes an accepted card from the draft if plans change. Its submission record remains accepted.

## Request and deployment boundaries

Use the existing Astro Vercel adapter and Cloudflare Worker. Astro serves a same-origin API for browser mutations and private reads. Resolve routes from a fixed allowlist, cap request sizes, check same-origin `Origin` on every mutation, and forward only explicitly created headers. The Worker authorizes every internal request with a shared `WALL_ADMIN_SERVICE_KEY` supplied by Astro. Admin routes also verify the opaque owner session, with session creation and credential lookup available only to Astro. Private responses are noncacheable and the browser proxy forwards no internal auth headers or credential records. Pass only a trusted client address from the Astro platform to the authenticated Worker request, hash the address before storage, and deny over-limit requests before password derivation or image work. Keep the public wall read endpoints and local publisher compatible. [Vercel request headers](https://vercel.com/docs/headers/request-headers)

| Browser API                                     | Contract                                                                                                                                                                                                                                                                  |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/admin/login`                         | `{ password }` → `204` and a session cookie. `401` for invalid password, `429` when limited, `503` if server configuration is missing.                                                                                                                                    |
| `POST /api/admin/logout`                        | Revokes the supplied session and expires the cookie. Safe to retry.                                                                                                                                                                                                       |
| `POST /api/admin/password`                      | `{ currentPassword, newPassword, confirmation }` → `204` and a replacement cookie. Invalid fields or wrong current password return field-level feedback.                                                                                                                  |
| `GET /api/admin/wall/draft`                     | Returns `{ version, baseRevision, activeRevision, items }`. Generation starts at a known version and increases on every persisted mutation.                                                                                                                               |
| `PUT /api/admin/wall/draft`                     | `{ version, items }` → the saved draft. A stale version returns `409` with enough information to reload.                                                                                                                                                                  |
| `POST /api/admin/wall/publish`                  | `{ version, baseRevision }` → `{ revision, version }`. Repeating the same successful request can read back its committed result.                                                                                                                                          |
| `POST /api/admin/wall/reset`                    | `{ version, activeRevision }` → draft seeded from the current live wall after explicit owner confirmation.                                                                                                                                                                |
| `POST /api/admin/wall/media`                    | A multipart `photo` → `{ mediaId, width, height }` after both variants exist.                                                                                                                                                                                             |
| `GET /api/admin/wall/media/:id/:variant`        | Authenticated thumbnail or detail response for a known wall asset. Use the same route for queued photos.                                                                                                                                                                  |
| `GET /api/admin/wall/submissions`               | A bounded, cursor-based list filtered by `pending`, `accepted`, or `rejected`.                                                                                                                                                                                            |
| `POST /api/admin/wall/submissions/:id/decision` | `{ action, folderId?, version? }`, with draft version required for accept. Replays return an existing matching decision. An opposite decision or a stale accept returns `409`.                                                                                            |
| `POST /api/wall/submissions`                    | Multipart form with a client-generated submission UUID, title, note or caption, optional photo, and alt text if a photo is present. `201` means D1 contains a pending submission. Repeating the same UUID and content after a lost response returns the existing receipt. |

Use `400` or `422` for validation errors, `401` for absent or expired admin sessions, `403` for origin or service authorization failures, `404` for unavailable private records, `409` for concurrency conflicts, `413` for size limits, and `503` for recoverable storage or configuration errors. The UI keeps form input on retriable failures. API paths and response naming can follow existing repo conventions if the browser and Worker agree.

## Owner password and sessions

Add an `admin_credentials` singleton with `password_hash`, `version`, and `updated_at`. Use a unique random salt and a versioned scrypt hash. Derive and verify with Node `crypto.scrypt` in Astro's server runtime, using a constant-time comparison and a bounded password length. Exchange the stored hash only between Astro and the service-key-protected Worker credential endpoint. Persist opaque random session tokens by SHA-256 digest in `admin_sessions` with `credential_version` and `expires_at`. Each session lookup joins the current credential version and checks its expiry. Issue an eight-hour, host-only `HttpOnly; SameSite=Lax; Path=/` cookie with `Secure` on HTTPS. The browser never receives the credential hash or a session token in JSON.

The initial password is configured by the operator as an `ADMIN_BOOTSTRAP_PASSWORD` server secret in Astro. Seed the hash with an insert-if-absent that returns the authoritative row. A database password always takes precedence. Use 16 to 128 characters for new passwords, allow spaces and Unicode, and compare the exact supplied password. Accept up to 512 UTF-8 bytes. Require a distinct new password. Allow password managers with appropriate autocomplete values. Document removing the bootstrap secret after the first successful login and document recovery via an authorized operator resetting the stored hash and incrementing the credential version. Keep secrets and password-bearing bodies out of logs.

Apply separate short-window limits for login, verifying the current password, and public contributions, using per-client and bounded global limits for login and public submissions. `429` includes `Retry-After`. Use separate keys for the actions and expire old accounting rows or use rate-limit bindings. For preview and production, direct the Astro gateway to the matching Worker environment.

```text
signIn(password, clientKey):
    allowAttempt("login", clientKey)
    credential = worker.getCredential()
    if credential absent:
        credential = worker.insertIfAbsent(scryptHash(bootstrapSecret))
    require verifyScrypt(password, credential.hash)
    token = randomBytes(32)
    require worker.insertSessionIfVersionMatches(hash(token), credential.version, expiry)
    setCookie(token)

changePassword(cookie, current, next, confirmation, clientKey):
    credential, session = worker.getCurrentCredentialForSession(hash(cookie))
    allowAttempt("change-password", clientKey)
    validate next, confirmation, and policy
    require verifyScrypt(current, credential.hash)
    replacement = randomBytes(32)
    require worker.atomicRotate(hash(cookie), credential.version,
                               scryptHash(next), hash(replacement), expiry)
    setCookie(replacement)
```

In `atomicRotate`, update the credential only if the original version and live requesting session still match. Use a unique operation marker or an equivalent transactional guard so replacement issuance depends on that same successful update. A successful change keeps the current browser signed in with a fresh token and invalidates every older token, including the old cookie in the current browser. A lost response can be recovered by signing in with the new password. D1 batches provide a transaction for these coupled writes. [Cloudflare D1 Database API](https://developers.cloudflare.com/d1/worker-api/d1-database/)

## Drafts, media, and moderation

Add a singleton `wall_draft` with version, base revision, JSON items, and timestamps. Add `wall_submissions` with UUID, payload fingerprint, normalized card fields, status, timestamps, and accepted item ID. Add a small staging table for complete media and a publish receipt keyed by request version and base revision if replay detection needs one. Use one additive migration. Keep the current `wall_revisions`, `wall_revision_media`, and `wall_active` contract.

Validate an entire draft on save and publish. Check safe unique IDs, known kinds, finite coordinates, valid parent folders, acyclic ancestry, text length, JSON byte limits, and photo media references. Root uses the existing sentinel. Preserve the existing draft metadata limit of 1.5 MB. Keep D1 statements under the platform limits and reuse chunked staging if large bound payloads require it. Keep user text plain and render it as text everywhere. [Cloudflare D1 limits](https://developers.cloudflare.com/d1/platform/limits/)

Accept JPEG, PNG, and WebP up to 4,000,000 bytes per photo for hosted upload so multipart requests fit the Vercel Function limit. Validate actual encoded format and cap decoded images at 40 million pixels. Normalize orientation, strip metadata, and encode thumbnail and detail WebP variants using the existing sizing conventions. Use a server-side processor with actual local and deployed support. A Node image processor on Astro can use `sharp`; if used, authorize and rate-limit via Worker first, then send only validated normalized bytes to the trusted internal Worker route. The Worker stores variants in the existing private `wall/<mediaId>/<variant>.webp` shape. Derive IDs from normalized output or a stable processing-versioned source hash. Record provenance for owner uploads and submission-only images separately even when deduplication shares the bytes. Save and publish may use owner-uploaded assets, accepted contributions, and previously published media. Other submission images remain private and never become draft references through an upload ID or public URL. Write D1 completion only after both variants exist. Keep incomplete or unreferenced files private and document cleanup using the existing grace-period approach. [Vercel Function limits](https://vercel.com/docs/functions/limitations)

```text
acceptSubmission(id, expectedVersion, folder):
    existing = readSubmission(id)
    if existing already accepted: return recorded decision
    require existing pending
    draft = readDraft()
    require draft.version == expectedVersion and folder exists in draft
    item.id = stableIdDerivedFrom(id)
    item.position = first available position in a simple grid in folder
    proposed = validate(draft.items plus item)
    atomically:
        update draft to proposed only if version matches and submission is pending
        update submission to accepted only if this same operation changed the draft
    if contention: reread to distinguish same-decision retry from conflict

rejectSubmission(id):
    update status to rejected only from pending
    if unchanged: return same-decision result or opposite-decision conflict

publishDraft(version, baseRevision):
    if a receipt for (version, baseRevision) exists: return its committed result
    draft = readDraft()
    require draft.version == version and draft.baseRevision == baseRevision
    require draft.baseRevision equals live revision, including NULL for an empty wall
    validate draft and ensure all media pairs are complete
    candidate = new revision ID
    atomically:
        insert complete candidate revision only if draft and active still match
        activate candidate only if that insert succeeded
        update draft base and version and record receipt only if candidate activated
    if contention: reread receipt or return conflict with draft intact
```

Use conditional SQL in a D1 batch and verify affected rows. An unconditional second update after a zero-row first update would still commit, so tie dependent writes to a unique operation marker or perform the transition in a single guarded statement or trigger. Preserve the prior active wall on any failure. Keep `/wall/media` gated by active-revision membership, so accepting a submission only makes it eligible for later publication.

## Implementation order

1. Add the migration, private Worker routing and Astro gateway, environment examples, and password/session helpers. Implement `/login`, the admin shell, logout, and the Change password form. Verify credential initialization, expiry, revocation, rotation races, and direct Worker denial.
2. Connect the shared canvas to the authenticated draft API. Implement save, preview, publish, and conflict handling. Add private photo upload and previews. Check portability of the processor and preservation of existing published wall layouts and media.
3. Add the public contribution form, quota checks, and review queue. Wire accept and reject into the draft transaction. Confirm the editor reloads the updated version when returning from moderation.
4. Run the frontend lint, Astro check, build, and relevant tests. Run Worker typecheck and tests with the new migration. Exercise both services together in a browser with separate owner and visitor contexts. Add targeted regression tests for atomic moderation, stale versions, media visibility, password rotation, and stale sessions.
5. Update the local and release instructions with exact commands, secret names, migration order, and preview URL checks. Stage D1/R2 and the Worker before the frontend. Rehearse on separate preview resources when available. Production release and secret provisioning remain operator actions.

## Acceptance criteria

- A visitor can browse public folders and submit both a note and a photo. Anonymous, forged-origin, and direct unauthenticated Worker requests cannot read the review queue, private media, or draft or change any of them.
- The owner can sign in, open the wall from the left navigation, edit and move an existing card, create and delete a card, save and reload, and preview the draft. The public wall continues serving the previous version until publish succeeds.
- In separate browser contexts, submit two contributions, accept one into a folder, reject one, move the accepted card, and publish. Reload the public wall and verify only the accepted contribution appears at the intended position. Include one photo and verify its preview and public image URL follow the correct visibility at each stage.
- Parallel accept and reject yield one terminal decision. Accept retry adds one card. Concurrent saves and a CLI publish produce a recoverable conflict. A failed or repeated publish leaves a consistent active revision.
- Change the password using the current password and confirmation. The other signed-in browser loses access. The current browser continues using its replacement session. The old password and retained bootstrap password fail, the new password works, and logout invalidates its token server-side.
- A local environment can run the full flow using documented commands. A deployed preview is the final check for secure cookies, trusted IP forwarding, image processing, configuration, and the static public wall reading the intended Worker revision.
