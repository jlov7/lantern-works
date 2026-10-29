# Quality and known limits

Lantern Works is a personal R&D game. New seasons use `lantern-7.0.0` rules.
The source includes automated checks for engine behaviour, saved histories,
browser interaction, accessibility rules and the production bundle.

`pnpm verify` is the main local gate. Its browser suite uses Chromium at desktop
and phone widths, including offline reopening and updates. Earlier compiled-game
qualification also exercised Firefox and WebKit; those historical runs do not
qualify later code changes. The included `pnpm test:compat` suite checks first play,
dialogs, recovery and replay backups in Firefox and WebKit. `pnpm test:dev` checks
native dialogs under React's development lifecycle. Automated checks are
engineering evidence; they do not establish that people will enjoy the game.

The complete career and its main outcomes have been exercised through the UI.
Ordinary management can be repetitive, and later phone pages can be long. Fresh
human playtests, direct listening, physical-phone comfort and assistive-technology
sessions remain outstanding. Automated accessibility scans do not replace those
observations.

Saves are local to a browser and site address. They are not cloud backups. Very
large seasons may exceed replay-link limits. Optional model requests depend on
an external provider and are not required to play; no live provider call is part
of the normal verification command.

Check saving, replay links and offline reopening on the actual hosting address
before sharing a deployment with players.
