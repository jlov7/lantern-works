# Lantern Works

Vite, React and strict TypeScript. The deterministic engine lives in `src/engine`;
the player interface lives in `src/ui`. Use the pnpm version in `package.json`.

- Verify with `pnpm verify`. It generates `docs/BALANCE.md`; inspect that change.
- Keep rules changes versioned and preserve supported saved histories. Regenerate
  goldens deliberately with `UPDATE_GOLDEN=1 pnpm exec vitest run src/engine/golden.test.ts`.
- Unit tests use `.test.ts`; browser interactions use Playwright under `e2e/`.
- Keep engine logic independent of the DOM, clocks, network and model providers.
- Validate saves, replay links and model responses at their boundaries.
- Respect `LICENSE`, `CONTENT-LICENSE.md` and third-party notices.
- Never commit credentials, local paths, logs or private play histories.
- Use plain British English. Preserve keyboard access, reduced motion, save
  recovery and the illustrated alternative to the 3D studio.
