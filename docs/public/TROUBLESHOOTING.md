# Help with Lantern Works

## The miniature room is slow or blank

Open **Settings**, then choose **Illustrated studio**. It shows the same work with
less graphics load. The game also falls back to an illustration if the renderer
cannot load. Reducing motion and closing other graphics-heavy tabs may help.

## My season did not return

Use the same browser, browser profile and site address as before. Saves belong to
that combination; a preview address and a custom domain have separate storage.
Open **Your seasons** on the title screen, including its older entries.

If you saved a replay link, open it to reconstruct that season, then choose
**Save a copy and continue** (or **Keep a copy** at the ending). Opening a replay
alone does not save it. Browser data that has been cleared cannot be recovered
by the game. There is no account or remote save service. Do not clear site data
as your first troubleshooting step.

## I see a save warning

Keep the tab open. A full storage quota, a blocked storage setting or another tab
changing the same history can prevent a save. Follow the warning's recovery
options. If available, copy a replay link and test it in a separate tab before
closing the original. Avoid continuing the same season in several tabs at once.

## A replay will not open

Copy the complete link, including the part after `#`. Messaging apps sometimes
truncate long links. Check that the destination runs a version that supports the
replay's rules. Unsupported older histories are retained in browser storage when
possible; starting a fresh season does not convert them to newer rules.

For a large history that cannot be encoded, a challenge link shares its starting
conditions but does not preserve its moves. A postcard preserves an image only.

## Offline play is unavailable

First open the production game online and leave it long enough to finish loading
its files. Offline support needs HTTPS (or localhost), service workers and browser
storage. It is not enabled by the development server or by double-clicking
`index.html`. Browsers can evict cached files. Reconnect and reload when necessary.

## I still see an earlier version

Finish the current interaction and keep any replay you need. Close all tabs for
this site, then reopen it while online. Updates wait for existing game tabs to
close so they can keep using the files their version expects. Do not delete saves
to update the game.

## Copying or downloading did not work

If clipboard access is blocked, the game offers selectable link or report text
where possible. Select and copy it yourself. Check the browser's download area for
postcards. An error while drawing a postcard does not remove your season.

## Sound is silent

Turn on **Sound** in Settings and interact with the game. Browsers may wait for a
click or tap before playing audio. Check the tab and device volume. Sound is not
required to make a decision or finish a season.

## Something broke

Use **Reload** on the recovery screen. Successfully saved moves remain in the
browser; recent unsaved moves may be missing. You can copy a diagnostic report
before reloading. It contains an error, rules version, browser details and time.
Nothing is automatically sent. Review it before sharing it in a bug report.

For an ordinary bug, include the screen, steps and browser version. A replay can
help reproduce a gameplay problem, but check its contents before posting it.
Report security issues privately using [SECURITY.md](../../SECURITY.md).

[Player guide](PLAYER-GUIDE.md) · [Back to the overview](../../README.md)
