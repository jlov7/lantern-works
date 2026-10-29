# Frozen authored-studio replays

`legacy-6.0.0.json` protects the original authored-studio rules. Its SHA-256 is
`8b8a8192aefccb7cf5307be540ffc2b021274545602231b26a28d61809b96ac5`.

Each `states` entry hashes `JSON.stringify(state)`, including the initial state
and every successful command prefix. The full state includes contracts,
compositions, copy, events, relationships, pattern work and commands. The six
synthetic tapes contain 393 commands and 399 states:

| Tape | Commands | States |
| --- | ---: | ---: |
| main-courtyard | 70 | 71 |
| main-trail | 86 | 87 |
| careful | 74 | 75 |
| festival-balanced | 147 | 148 |
| continuing-pattern-studio | 15 | 16 |
| inherited-trained-pattern | 1 | 2 |

The final two tapes exercise paid pattern preparation, teaching and inherited
training. The `continuations` entries hash the complete `RunConfig` produced by
`buildContinuation`, including the original v1 snapshot shape.

`legacy.test.ts` checks every state and both continuation hashes under explicit
6.0 rules. Do not regenerate these hashes under newer rules or replace tapes
with policy runs. Current-rule goldens remain separate in `golden.json`.
