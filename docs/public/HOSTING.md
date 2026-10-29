# Hosting the game

For the project owner, a static Vercel site is the simplest way to let someone
open a link and play. Visitors need a modern browser. There is no game backend,
database, login, model key or per-player AI charge for normal play. Hosting usage
still follows the owner's Vercel plan.

Other developers may reuse the MIT code, but publishing the complete game with
its reserved artwork and story requires permission under
[CONTENT-LICENSE.md](../../CONTENT-LICENSE.md).

## Build settings

Use the clean public source as the project root. The included `vercel.json` sets
the framework and build commands below. Select and verify Node.js 24 in the Vercel
project settings to match `.nvmrc`.

| Setting | Value |
| --- | --- |
| Framework | Vite |
| Node.js | 24, matching `.nvmrc` |
| Package manager | Exact pnpm version from `package.json` |
| Install command | `pnpm install --frozen-lockfile` |
| Build command | `pnpm build` |
| Output directory | `dist` |
| Environment variables | None required |

The app uses a single document and fragment links. It does not need a server
function or a catch-all rewrite. The configuration also sets response headers
and keeps the page, service worker and manifest revalidatable. Built assets have
content hashes.

Vercel's [Vite documentation](https://vercel.com/docs/frameworks/frontend/vite)
describes importing and deploying a Vite project. Connect only the source intended
for publication. A private development repository may contain material that does
not belong in a public source release.

## Before sharing the address

1. Run `pnpm verify` from the exact source being deployed.
2. Build a preview deployment, then play the guided first day on desktop and phone.
3. Check a saved season after reload, a copied replay, the illustrated fallback,
   reduced motion and the help dialog on that address.
4. Load the game online, disconnect, and reopen it to check offline support.
5. Check response headers and confirm that a normal session makes no AI requests.
6. Use a stable public address for release. Saves on preview addresses do not move
   automatically to a new domain. Keep replay links before switching addresses.

These hosted checks are separate from local tests. Local tests cannot establish
that a future deployment, domain or CDN is configured correctly.

## Updates

Keep supported historical rules and their replay tests. Service workers wait for
open tabs to close before taking over. Check an old open tab, a fresh tab and an
offline reopen when releasing an update. Never advise players to clear all site
data to get a newer version; that also removes their local saves.

## Another static host

Serve the contents of `dist/` over HTTPS. For a local rehearsal, `pnpm preview`
serves the build on port 47613. Relative build assets support subdirectory hosting,
but confirm that the host serves the same path with its trailing slash and the
service worker's expected scope. Double-clicking the HTML file is not a supported
way to run the game.
