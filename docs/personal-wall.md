# Personal Wall

## Outcome

`/wall` is a shareable page for browsing personal photos and notes. Each folder opens its own freeform canvas. The root behaves like a folder and can hold photos, notes, and more folders. You can arrange items by hand and publish the resulting layout. Visitors can browse one folder at a time or expand the whole wall into labeled folder zones.

Phase 1 delivers a clickable frontend for feedback. Phase 2 turns the approved design into a publishable wall backed by the portfolio’s existing Cloudflare Worker, D1, and R2. The expected collection is 100–200 images. The route is intended for direct sharing. Portfolio navigation and search discovery can be decided after the prototype.

## Phase 1 · Interactive prototype

**Deliverable** · A full-screen Astro page at `/wall` that runs locally with bundled sample content and its own wall controls. Supply a root with photos, notes, and folders, plus a nested folder, so the prototype demonstrates both the first impression and the return path from a deeper view. Keep sample content identifiable as sample content.

| Interaction              | Expected behavior                                                                                                                                                                                                                                                            |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Preview and open folders | A folder card, index entry, or overview zone heading opens a preview with its description and an **Open folder** button. Breadcrumbs return directly to an ancestor.                                                                                                         |
| Browse every folder      | **Expand all** shows loose root memories on the canvas alongside folder zones. Each zone shows its folder description when available and has padding around its contents. Subfolder zones sit inside their parent. **Collapse all** returns to the previous folder and view. |
| Toggle the index         | The left index can be hidden to make room for the canvas. On phones it opens over the wall and closes when a folder is opened.                                                                                                                                               |
| Pan and zoom             | Drag open space to pan. Provide mouse and touch zoom gestures and visible controls. Fit the current folder into the viewport on demand. Keep a path back to the cards at every zoom level.                                                                                   |
| Open a memory            | A photo opens a larger view with its caption. Close using a visible control or Escape, then return to the same folder and view with focus on the originating card when possible.                                                                                             |
| Browse without gestures  | On narrow screens, the index remains reachable. Use the index, buttons, and cards with a keyboard, and use touch targets large enough for phone browsing.                                                                                                                    |
| Arrange a draft          | A prototype edit mode lets the owner create folders with descriptions and add notes, try placing photos, reposition cards, and move items between folders. Store draft changes in the current browser and offer a way to restore the sample wall.                            |

**Interaction rules**

- Folder changes use the new folder’s coordinates. Editing takes place in individual folder views, where the owner saves one set of card positions. Returning from a photo detail preserves the current folder’s pan and zoom. During a drag, use a movement threshold so panning or arranging doesn’t accidentally open a card.
- Store card positions in canvas coordinates. Screen size and current zoom affect the view, while the saved spatial arrangement stays consistent. Allow enough space to explore the layout and provide a fit control for recovery.
- Browsing is the default. Clearly identify edit mode and where edits are stored. Use real buttons and links, keep focus visible, and respect reduced-motion preferences for transitions.

**Review checklist**

1. Open `/wall` on desktop and phone. Toggle the index, choose **Expand all**, and check that each photo’s folder is clear. Collapse the overview and check that it returns to the same view.
2. Preview a nested folder from both the index and the canvas. Open it, zoom in, open a photo, close it, and return to its parent. Note where navigation feels slow or disorienting.
3. Enter edit mode, create a folder and note, add a photo, arrange them, and move an item between folders. Check whether free placement, overlapping cards, and movement between folders feel natural.
4. Reload and confirm the local draft is still there. Check the same browsing path using just the keyboard.

Phase 1 review established the full-screen canvas, collapsible index, folder previews, nested zones, and loose root memories. Phase 2 incorporates the approved position rules below.

## Phase 2 · Owner publishing and public wall

**Deliverable** · The real `/wall` reads published content from the existing `portfo` Worker. The owner curates via a local editor and publishes with a local command that uses Cloudflare credentials. Visitors open the portfolio link without an account. A hosted admin and visitor submissions are follow-up features after owner authentication exists.

### Expanded layout follows the saved wall

- A folder card’s saved canvas position anchors its expanded zone within the parent. The root keeps its loose photos and notes directly on the canvas. Dragging a folder card in the editor changes the anchor used the next time the wall expands.
- A zone sizes itself to fit its name, description, padding, photos, notes, and expanded subfolders. Preserve the relative positions of photos and notes in each folder. Apply the same anchor rule recursively to subfolders.
- If a zone would cover another zone or a loose card, start at its saved position and move it to the nearest available position with enough spacing. Use a stable order and tie-breaker so the same draft expands the same way on every screen. Pan, zoom, and fit change the view of the layout.
- Calculate these offsets for the overview only. **Collapse all** returns to the previous folder and view with the same saved positions.

### Data and API

| Record                 | Proposed fields and rules                                                                                                                                                                                         |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Wall revision          | Revision ID, schema version, and publish timestamp. One active revision identifies what visitors see.                                                                                                             |
| Folder, photo, or note | Stable ID, parent folder ID, type, title, canvas `x`/`y`, and display order for overlap. The root is represented by a known parent ID. A folder can move between parents but can never become its own descendant. |
| Folder                 | Optional plain-text description shown in the preview and expanded zone.                                                                                                                                           |
| Note                   | Plain-text body. Render text as text so pasted markup is displayed literally.                                                                                                                                     |
| Photo                  | Caption, alt text, original dimensions, and references to the thumbnail and optimized detail image. Store image files in private R2.                                                                              |

- `GET /wall` on the Worker returns the active revision and the folder and item metadata the frontend needs. At this collection size, a single metadata response is sufficient. Fetch visible thumbnails independently and load larger images on selection.
- `GET /wall/media/:id/:variant` returns a thumbnail or detail image only when referenced by the active revision. Resolve media IDs in D1 and keep R2 object keys internal. Assign new media IDs when photo bytes change so visitors get the new image after publication. A missing or unpublished reference returns `404`. Start with a one-minute cache lifetime and verify the takedown window in staging.
- Keep folder IDs stable when renaming or moving folders so links can target the same folder. Use `/wall?folder=<id>` for a deep link and browser history for folder changes. If a linked folder has been removed, show the root and make the fallback clear.
- Show distinct states for loading, an empty wall, and a Worker failure. On a failed fetch, display a retry control. A missing photo can show its caption and a placeholder while the rest of the wall stays usable.

### Owner workflow

1. Open the local editor, create or rename folders, add or edit photos and notes, and arrange or move items. Add a caption and image description where appropriate. Preview the layout before publishing.
2. Export a versioned draft with its photos and run the local publisher. Validate the manifest, unique IDs, parent references, cycles, finite coordinates, image bytes, and upload limits. Start with JPEG, PNG, or WebP up to 10 MB per photo and a decoded pixel limit. Normalize orientation, strip location metadata during image processing, and render a thumbnail and a larger detail variant. Confirm whether HEIC belongs in this phase using the owner's sample files.
3. Upload missing image variants to private R2 first. Once all referenced files are present, use a D1 transaction to activate the complete revision. Require the previously read revision ID to match when changing the active revision, so concurrent publishes cannot silently overwrite each other. Retrying the same draft should reuse correctly uploaded media.
4. Verify the live revision on `/wall`. A failed publish leaves the previous version readable. Record failed attempts and prune unreferenced uploads after a grace period that accounts for retries and any retained rollback revision.

The editor and publisher run locally. Cloudflare credentials stay in the local publishing process. The deployed Worker exposes read endpoints for the wall. Stage the D1 migration, R2 binding, and Worker configuration before switching the Astro page from sample content to live data.

### Implementation order

1. Implement the anchored overview using the same positions recorded by the editor. Verify the layout on desktop and mobile.
2. Create the D1 migration, bind a private R2 bucket, and implement the read endpoints with fixture data in the local Worker.
3. Exercise the publisher, D1, R2, and the Astro page together locally. Repeat the flow against staging before the production rollout.
4. Publish the owner's first wall, verify the public URL and folder links, and document how to remove content or restore a prior revision.

### Acceptance and release checks

- Drag a folder from one side of its parent to the other, including a nested folder. Expand and verify the zone follows it. Create a collision, verify the resolved zones leave loose cards accessible, and collapse and re-expand to confirm consistent placement without changing the saved draft.
- Publish a root with photos and notes plus a nested folder. Move and rename a folder, refresh the public page, and check that saved positions and folder links still work.
- Test a missing photo, a rejected file, an upload interrupted after some files are written, and conflicting publishes. The visitor sees the last complete revision until a new one activates. A retry produces one valid revision for the same draft.
- Remove a published photo, open its earlier media URL, and confirm it returns `404` after the configured cache window. Removing a non-empty folder requires explicit confirmation of what will be removed.
- Repeat the main path in desktop and mobile browsers on staging. Check keyboard navigation, pan versus tap, thumbnail loading, and empty or unavailable folders. Verify the existing site and Worker checks pass. Use representative content for functional verification.

## Local review and publishing

Install this repo’s frontend and Worker dependencies and make ImageMagick 7’s `magick` command available. The local editor stores its draft in IndexedDB and imports existing browser drafts from the prototype. Edit controls appear in the Astro development server.

1. From the repository root, apply the local schema and start the Worker.

   ```sh
   pnpm --dir workers/portfo install --frozen-lockfile
   pnpm --dir workers/portfo exec wrangler d1 migrations apply portfo --local
   pnpm --dir workers/portfo dev
   ```

2. Start Astro with the local Worker URL, then open `http://localhost:4321/wall`.

   ```sh
   PUBLIC_WORKER_URL=http://localhost:8787 pnpm dev
   ```

3. Choose **Edit locally**, arrange your wall, and choose **Export draft**. Keep the downloaded JSON as a backup. You can run **prepare** to inspect the optimized files first, then publish to the local Worker.

   ```sh
   pnpm wall:publish ~/Downloads/wall-draft.json --prepare /tmp/wall-prepared
   pnpm wall:publish ~/Downloads/wall-draft.json --local
   ```

4. Open the page in a fresh browser profile to see the published revision. The editor continues to prefer the current profile’s saved draft. Photo input supports JPEG, PNG, and WebP up to 10 MB and 40 million pixels per image. Publishing validates a 500 MB draft export and a 1.5 MB published metadata limit.

### Before the production rollout

- Set the real portfolio origin in `workers/portfo/wrangler.jsonc`, provision the private `portfo-wall-media` bucket, and apply the D1 migration to the production Worker’s database. Use a staging site and separate resources to rehearse the release first.
- Configure `PUBLIC_WORKER_URL` on the Astro deployment. Use the publisher’s explicit `--production` flag once the Cloudflare resources and owner credentials are ready.
- To remove a memory, remove it in the local editor and publish a new revision. Keep known-good draft exports for rollback and republish an earlier export to restore it. The active revision controls media access, with a one-minute browser cache window. Review unreferenced R2 objects after retries have finished and after the grace period for retained rollback revisions. Media garbage collection is manual.

## Hosted owner portal and visitor contributions

The hosted owner portal uses the Astro/Vercel site and `portfo` Worker. Apply the additive `0003_wall_admin.sql` migration to each target D1 database before enabling its Astro routes. Existing wall revisions, folder IDs, and private R2 object keys remain compatible. [Owner portal specification](wall-admin.md)

### Isolated local run

Use Node 22.22 or newer and pnpm. Install both lockfiles and create a separate local database directory.

```sh
pnpm install --frozen-lockfile
pnpm --dir workers/portfo install --frozen-lockfile
pnpm --dir workers/portfo exec wrangler d1 migrations apply portfo --local --persist-to /tmp/portfo-wall-admin-state
```

Create `/tmp/portfo-wall-admin.vars` with a dummy local secret.

```dotenv
WALL_ADMIN_SERVICE_KEY=local-wall-admin-key-replace-me-with-a-long-random-value
```

From `workers/portfo`, run the Worker.

```sh
./node_modules/.bin/wrangler dev --ip 127.0.0.1 --port 8787 --persist-to /tmp/portfo-wall-admin-state --env-file /tmp/portfo-wall-admin.vars --var ALLOWED_ORIGINS:http://localhost:4321,http://localhost:4421
```

From the repository root, run Astro with that same service key and a dummy bootstrap password.

```sh
PUBLIC_WORKER_URL=http://127.0.0.1:8787 WALL_ADMIN_WORKER_URL=http://127.0.0.1:8787 WALL_ADMIN_SERVICE_KEY=local-wall-admin-key-replace-me-with-a-long-random-value ADMIN_BOOTSTRAP_PASSWORD='local owner password for development' pnpm dev
```

Open `/login` and sign in with the bootstrap password. The public wall accepts notes and batch JPEG, PNG, or WebP photos into the folder the visitor is viewing. Photo titles and image descriptions are optional; empty titles use the file name. The owner editor at `/admin/wall` supports multi-photo upload and folder-tree upload (`+ Upload folder`), which recreates the chosen directory as folders and images. The review queue is at `/admin/wall/submissions`, and password rotation at `/admin/password`. Queued photos become public only when an accepted card is published. Apply D1 migrations through `0004_wall_submission_folder.sql` so visitor contributions can remember their destination folder. The bootstrap hash is initialized once. After that first successful login, changing `ADMIN_BOOTSTRAP_PASSWORD` in `.env` does nothing: the database password wins. Remove `ADMIN_BOOTSTRAP_PASSWORD` after initializing a real environment.

**Forgot the local owner password?** Reset the hash in the local Worker D1 database (8–128 characters):

```sh
pnpm wall:reset-password 'your-new-password'
```

That replaces `admin_credentials.password_hash`, increments `version`, and clears `admin_sessions`. Then sign in at `/login` with the new password. For a non-default persist directory, pass `--db path/to.sqlite`. Production recovery is the same idea with an authorized operator updating the live D1 row using a hash in the format from `src/lib/wall-admin/password.ts`.

Run checks with `pnpm lint`, `pnpm check`, `pnpm build`, `pnpm test`, `pnpm test:e2e`, `pnpm --dir workers/portfo typecheck`, and `pnpm --dir workers/portfo test`. The live browser test uses separate owner and visitor contexts for contribution, review, publication, logout, password rotation, and revocation.

### Live owner browser test

Start the Worker as above with a new temporary persistence directory for each run. Apply the migrations to that directory and keep the Worker running. From the repository root, run the dedicated Playwright suite. It starts its own Astro server on port 4421.

```sh
WALL_ADMIN_WORKER_URL=http://127.0.0.1:8787 \
WALL_ADMIN_SERVICE_KEY=local-wall-admin-key-replace-me-with-a-long-random-value \
ADMIN_BOOTSTRAP_PASSWORD='local owner password for development' \
pnpm test:e2e:wall
```

The test publishes a revision and rotates the password in its local database. The default `pnpm test:e2e` command runs the static preview suite with mock data.

### Release sequence

For each preview or production environment, provision a separate D1 database and private R2 bucket, deploy the matching Worker with `WALL_ADMIN_SERVICE_KEY`, and apply migrations through `0003_wall_admin.sql`. Configure Astro server variables `WALL_ADMIN_WORKER_URL`, `WALL_ADMIN_SERVICE_KEY`, and the initial `ADMIN_BOOTSTRAP_PASSWORD`, plus the existing `PUBLIC_WORKER_URL`. Set Worker `ALLOWED_ORIGINS` to the exact Astro origin. Keep the service key matched only between Astro and its corresponding Worker.

Deploy the Worker and migration before Astro. After first successful owner login, remove the bootstrap password from Astro. On the same-origin preview, verify `Secure` cookies, platform-derived client IP quotas, photo uploads and private queue previews, published media takedown, and that the public page reads the intended environment revision. Keep incomplete or unreferenced normalized media private until the retry and revision-retention grace period has elapsed. Never include secrets or password bodies in logs.
