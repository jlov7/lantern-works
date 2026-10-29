# Security and privacy

## Support and reporting

This personal project has no public support inbox or guaranteed response time.
Do not post credentials, private replay links or exploit details in public
discussions.

## What stays in the browser

The game has no account service or game backend. Saves and settings use browser
storage. There is no application analytics or automatic diagnostic upload. A
static host may still keep normal access logs.

Replay links contain moves, saved artwork, and any original text used on prints.
They can also contain the starting resources and relationships of a continuing
studio. A person with a replay link can inspect that data. Link data follows `#`,
which browsers do not include in ordinary HTTP requests to the host.

Crash reports are prepared locally and contain the rules version, error details,
browser information and time. Nothing is sent automatically. Review a report
before sharing it; error messages may contain contextual information.

## Optional Claude access

Normal play makes no AI requests. If a player chooses **Use Claude** and enters
an Anthropic key, the key stays in tab memory and is forgotten on reload. It is
not stored in saves, links or diagnostic reports. Requests go directly from the
browser to `api.anthropic.com`, with task text and the game data needed for an offer
or debrief. Provider terms and billing apply. Avoid entering private information
into an optional model prompt.

This is a bring-your-own-key feature in a browser. Only enter a key on a copy of
the game you trust. The project does not provide a shared key, proxy model calls,
or require visitors to use an AI service.

The development-only bridge in `dev/` accepts two fixed tasks over a token-protected
localhost interface. It uses a developer's locally installed Claude Code and is
not in the production build. Do not expose the development server as a public site.

## Input and deployment boundaries

Saves, replay links and model replies are size-bounded and schema-validated before
use. The simulation replays accepted commands through its rules. The static page
has a content security policy. Vercel headers add framing restrictions and other
response controls; another host needs equivalent configuration.

Supported historical rules are covered by replay tests. The
[quality note](docs/public/QUALITY.md) describes testing limits.
