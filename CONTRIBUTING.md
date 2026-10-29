# Contributing to Lantern Works

Read the [architecture](docs/public/ARCHITECTURE.md), then play a guided first day.
The game has a pure TypeScript engine and a React interface. Changes should preserve
saved histories, keyboard access, reduced motion and the illustrated studio.

## Start locally

Use Node.js 24 (`.nvmrc`) and the exact pnpm version in `package.json`.

```sh
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm dev
```

Open <http://localhost:5173>. No model key is required. Development contains an
optional local Claude Code bridge; the production build does not include it.

## Check a change

Run the relevant test while working, then run the complete gate:

```sh
pnpm verify
```

It runs typechecking, lint, unit and property tests, balance checks, the production
build, a 150 kB initial-JavaScript budget, and Playwright tests at desktop and phone
widths with accessibility assertions. It regenerates `docs/BALANCE.md`; inspect
changes rather than treating them as a separate hand-authored document. Use
`E2E_PORT=47713 pnpm verify` if the default test port is already occupied.

`pnpm coverage` separately checks engine coverage. `pnpm e2e` builds before serving
its own test instance. Existing fixtures preserve supported old rules; they are
synthetic game records, not customer data. `evals/offers.jsonl` contains the
synthetic phrases used by the offline offer-parser tests; it makes no model calls.

The focused Firefox and WebKit suite covers first play, dialogs, recovery and
replay backups. Install those browsers, then run it separately:

```sh
pnpm exec playwright install firefox webkit
pnpm test:compat
```

`pnpm test:dev` separately checks dialogs against the development server, where
React repeats lifecycle setup and cleanup to expose effect bugs.

## Keep the boundaries clear

- Keep engine code independent of the DOM, wall-clock time and network. Use keyed
  randomness and integer money.
- Version any change that can alter a replayed outcome. Keep historical rules and
  replay fixtures working. Update golden expectations deliberately, not simply to
  make a failing test pass.
- Validate saves, links and model responses with the boundary schemas. Models can
  propose offers; they do not decide outcomes.
- Add regression coverage for bugs. Test pure helpers in `.test.ts` files and UI
  behaviour through Playwright in `e2e/`.
- Pin dependencies and retain notices for bundled libraries and fonts.
- Use plain British English. Explain an action or consequence without jargon.

A pull request should explain the player-visible problem, the changed behaviour,
and the checks run. Keep unrelated cleanup separate. Do not include credentials,
private local paths, diagnostic logs or personal play histories.

Software contributions are under [MIT](LICENSE). Respect the separate
[artwork and game-content terms](CONTENT-LICENSE.md); do not add assets whose
origin or permission is unclear. Report vulnerabilities through [SECURITY.md](SECURITY.md).
