# Synthetic game fixtures

These command tapes and local-storage examples exercise deterministic game regressions. They describe fictional game states and do not establish human play, usability, or enjoyment results.

`manifest.json` records each fixture's purpose, recorded rules versions, and SHA-256. Legacy tests can select a supported rules version explicitly. The production-day fixture contains only the native replay payload. Storage and save-array fixtures retain their native container shapes for their readers.

Keep configuration, command order, rules selection, and storage relationships intact when changing a fixture. Existing engine golden fixtures remain under `src/engine/fixtures`.
