
ARCHITECTURE.md

Roaming Companion & Bounty System — Full Project Structure & Data Flow

Last updated: 2025-12-04
Author: ImmortalDonkey


---

Vision & Purpose

This Discord bot powers the Roamers Union community for Pokémon Vortex gameplay automation:

Tracks roaming Pokémon sightings
Handles points economy + rank system
Enables bounty hunting with approvals + rewards
Makes staff operations efficient with modals, threads & PNG cards
Designed to run 24/7


---


Tech Overview

Layer	Technology

Language	Node.js (CommonJS)
Discord API	discord.js v14
Database	SQLite3 (on local disk)
Graphics	canvas
Hosting	Raspberry Pi Zero 2 W + PM2
Config	.env with process.env.*
Code Style	camelCase in JS / snake_case in DB



---



Core Features

Real-time reporting of Pokémon spawns

Points based on rarity & Timing

Points redemable for PKD

Ranks	 based on lifetime points

Automatic rank tiers

Bounty system 

In-game player location tracking

Card Rendering	PNG art for bounty and report messages

Scheduling	Auto-start & auto-expire timed bounties and reports



---


Folder & Module Structure

── ARCHITECTURE.md
├── cards
│   └── report_1764188678151_219914193695014912.png
├── data
│   ├── bot_backup.db
│   └── bot.db
├── database.cjs
├── deploy-commands.cjs
├── discord-bot-backup-20251122-0102.zip
├── handlers
│   ├── autocompleteHandler.cjs
│   ├── buttonHandler.cjs
│   ├── commandHandler.cjs
│   └── modalHandler.cjs
├── index.cjs
├── interactions
│   ├── autocomplete
│   ├── buttons
│   ├── commands
│   └── modals
├── node_modules
│   ├── abbrev
│   ├── accepts
│   ├── agent-base
│   ├── agentkeepalive
│   ├── aggregate-error
│   ├── ansi-regex
│   ├── aproba
│   ├── are-we-there-yet
│   ├── array-flatten
│   ├── asynckit
│   ├── axios
│   ├── balanced-match
│   ├── base64-js
│   ├── bignumber.js
│   ├── bindings
│   ├── bl
│   ├── body-parser
│   ├── brace-expansion
│   ├── buffer
│   ├── buffer-equal-constant-time
│   ├── bytes
│   ├── cacache
│   ├── call-bind-apply-helpers
│   ├── call-bound
│   ├── canvas
│   ├── chownr
│   ├── clean-stack
│   ├── color-support
│   ├── combined-stream
│   ├── concat-map
│   ├── console-control-strings
│   ├── content-disposition
│   ├── content-type
│   ├── cookie
│   ├── cookie-signature
│   ├── data-uri-to-buffer
│   ├── debug
│   ├── decompress-response
│   ├── deep-extend
│   ├── delayed-stream
│   ├── delegates
│   ├── depd
│   ├── destroy
│   ├── detect-libc
│   ├── discord-api-types
│   ├── @discordjs
│   ├── discord.js
│   ├── dotenv
│   ├── dunder-proto
│   ├── ecdsa-sig-formatter
│   ├── ee-first
│   ├── emoji-regex
│   ├── encodeurl
│   ├── end-of-stream
│   ├── env-paths
│   ├── err-code
│   ├── escape-html
│   ├── es-define-property
│   ├── es-errors
│   ├── es-object-atoms
│   ├── es-set-tostringtag
│   ├── etag
│   ├── expand-template
│   ├── express
│   ├── extend
│   ├── fast-deep-equal
│   ├── fetch-blob
│   ├── file-uri-to-path
│   ├── finalhandler
│   ├── follow-redirects
│   ├── form-data
│   ├── formdata-polyfill
│   ├── forwarded
│   ├── fresh
│   ├── fs-constants
│   ├── fs-minipass
│   ├── fs.realpath
│   ├── function-bind
│   ├── @gar
│   ├── gauge
│   ├── gaxios
│   ├── gcp-metadata
│   ├── get-intrinsic
│   ├── get-proto
│   ├── github-from-package
│   ├── glob
│   ├── google-auth-library
│   ├── google-logging-utils
│   ├── google-spreadsheet
│   ├── gopd
│   ├── graceful-fs
│   ├── gtoken
│   ├── hasown
│   ├── has-symbols
│   ├── has-tostringtag
│   ├── has-unicode
│   ├── http-cache-semantics
│   ├── http-errors
│   ├── http-proxy-agent
│   ├── https-proxy-agent
│   ├── humanize-ms
│   ├── iconv-lite
│   ├── ieee754
│   ├── imurmurhash
│   ├── indent-string
│   ├── infer-owner
│   ├── inflight
│   ├── inherits
│   ├── ini
│   ├── ip-address
│   ├── ipaddr.js
│   ├── isexe
│   ├── is-fullwidth-code-point
│   ├── is-lambda
│   ├── is-stream
│   ├── json-bigint
│   ├── jwa
│   ├── jws
│   ├── lodash
│   ├── lodash.snakecase
│   ├── lru-cache
│   ├── magic-bytes.js
│   ├── make-dir
│   ├── make-fetch-happen
│   ├── @mapbox
│   ├── math-intrinsics
│   ├── media-typer
│   ├── merge-descriptors
│   ├── methods
│   ├── mime
│   ├── mime-db
│   ├── mime-types
│   ├── mimic-response
│   ├── minimatch
│   ├── minimist
│   ├── minipass
│   ├── minipass-collect
│   ├── minipass-fetch
│   ├── minipass-flush
│   ├── minipass-pipeline
│   ├── minipass-sized
│   ├── minizlib
│   ├── mkdirp
│   ├── mkdirp-classic
│   ├── ms
│   ├── nan
│   ├── napi-build-utils
│   ├── negotiator
│   ├── node-abi
│   ├── node-addon-api
│   ├── node-domexception
│   ├── node-fetch
│   ├── node-gyp
│   ├── nopt
│   ├── @npmcli
│   ├── npmlog
│   ├── object-assign
│   ├── object-inspect
│   ├── once
│   ├── on-finished
│   ├── parseurl
│   ├── path-is-absolute
│   ├── path-to-regexp
│   ├── p-map
│   ├── prebuild-install
│   ├── promise-inflight
│   ├── promise-retry
│   ├── proxy-addr
│   ├── proxy-from-env
│   ├── pump
│   ├── qs
│   ├── range-parser
│   ├── raw-body
│   ├── rc
│   ├── readable-stream
│   ├── retry
│   ├── rimraf
│   ├── safe-buffer
│   ├── safer-buffer
│   ├── @sapphire
│   ├── semver
│   ├── send
│   ├── serve-static
│   ├── set-blocking
│   ├── setprototypeof
│   ├── side-channel
│   ├── side-channel-list
│   ├── side-channel-map
│   ├── side-channel-weakmap
│   ├── signal-exit
│   ├── simple-concat
│   ├── simple-get
│   ├── smart-buffer
│   ├── socks
│   ├── socks-proxy-agent
│   ├── sqlite3
│   ├── ssri
│   ├── statuses
│   ├── string_decoder
│   ├── string-width
│   ├── strip-ansi
│   ├── strip-json-comments
│   ├── tar
│   ├── tar-fs
│   ├── tar-stream
│   ├── toidentifier
│   ├── @tootallnate
│   ├── tr46
│   ├── tslib
│   ├── ts-mixer
│   ├── tunnel-agent
│   ├── type-is
│   ├── @types
│   ├── undici
│   ├── undici-types
│   ├── unique-filename
│   ├── unique-slug
│   ├── unpipe
│   ├── util-deprecate
│   ├── utils-merge
│   ├── uuid
│   ├── vary
│   ├── @vladfrangu
│   ├── webidl-conversions
│   ├── web-streams-polyfill
│   ├── whatwg-url
│   ├── which
│   ├── wide-align
│   ├── wrappy
│   ├── ws
│   └── yallist
├── package.json
├── package-lock.json
├── README.md
├── renderers
│   ├── bountyCardEndFailed.cjs
│   ├── bountyCardSuccess.cjs
│   ├── card-images
│   ├── cardRenderer.cjs
│   ├── report-bg
│   ├── reportCard.cjs
│   └── report-images
├── sprites
│   ├── Ancient Alakazam.png
│   ├── Ancient Gengar.png
│   ├── Ancient Jigglypuff.png
│   ├── Bombirdier.png
│   ├── Bramblin.png
│   ├── Clone Blastoise.png
│   ├── Clone Charizard.png
│   ├── Clone Venusaur.png
│   ├── Crystal Onix.png
│   ├── Cyclizar.png
│   ├── Dialga (Primal).png
│   ├── Entei.png
│   ├── Gimmighoul (Roaming).png
│   ├── Glastrier.png
│   ├── Golden Sudowoodo.png
│   ├── Gouging Fire.png
│   ├── Iron Boulder.png
│   ├── Iron Crown.png
│   ├── Iron Leaves.png
│   ├── Koraidon.png
│   ├── Latias.png
│   ├── Latios.png
│   ├── Meta Groudon.png
│   ├── Mewtwo (Shadow).png
│   ├── Miraidon.png
│   ├── Pink Rhyhorn.png
│   ├── Raging Bolt.png
│   ├── Raikou.png
│   ├── Rayquaza (Illusion).png
│   ├── Reddy.png
│   ├── Snorlax (Snowman).png
│   ├── Spectrier.png
│   ├── Suicune.png
│   ├── Varoom.png
│   ├── Walking Wake.png
│   ├── XD001.png
│   ├── Z2.png
│   └── Zygarde (Cell).png
└── utils
    ├── bountyScheduler.cjs
    ├── channelResolver.cjs
    ├── googleSheets.cjs
    ├── locationData.cjs
    ├── locations.cjs
    ├── locationStorage.cjs
    ├── logger.cjs
    ├── pendingStore.cjs
    ├── points.cjs
    ├── rankSystem.cjs
    ├── rarity.cjs
    ├── reportChannelRouter.cjs
    ├── reportLimiter.cjs
    ├── reportLogic.cjs
    ├── reportScheduler.cjs
    ├── reportValidator.cjs
    ├── roleSync.cjs
    ├── scoring.cjs
    └── timeUtils.cjs


---

Naming Conventions

DB Schema	JS Code	Bridge

snake_case	camelCase	normalize helpers in database.cjs


Example:

SQLite Column	JS Object Field

start_time	startTime
rarity_key	rarityKey
reporter_id	reporterId


Rule: All patches to DB functions must use camelCase.
Normalization handles the conversion automatically.


---

Commands:

Roaming Reports

Player uses /report pokemon:<autocomplete> route:<autocomplete>

Bot renderes png based on route name and pokemon and posts it to the relevant channel


Routing to channel based on rarity:

	
# Channels
CHANNEL_ROAMERMONTH=1435690836242202726
CHANNEL_PARADOX=1435654854235390032
CHANNEL_LEGENDARY=1435661851307413595
CHANNEL_RARE=1435661851307413595
CHANNEL_COMMON=1435661913764794399

Role Ping always

ROLE_BOUNTY_HUNTER=1435680732575174797

Role ping based on rarity

ROLE_ROAMERMONTH=1435719395996340315
ROLE_PARADOX=1435669555891671113
ROLE_LEGENDARY=1435659457312063620
ROLE_RARE=1435659457312063620
ROLE_COMMON=1435669340497383464

Base Points

paradox	CHANNEL_PARADOX	ROLE_PARADOX	200
roamerMonth	CHANNEL_ROAMER_OF_MONTH	Ping	30
legendary / rare	CHANNEL_RARE	Ping	20
common	No ping	1	


Time-based point scaling

00-29 min → 100%

30-39 → 75%

40-49 → 50%

50-59 → 10%


Duplicate protection:
A Pokémon may only be reported once per hour globally.

When report expires, the card is re-rendered with the status changed to "Expired"



---

Points & Rank System

Stored in DB	Derived at runtime

Spendable points	RankName
lifetime_points	PKD conversion (200k each)
point_logs history	


Ranks are awarded by lifetime points (values inside rankSystem.cjs)

Staff Commands:

/editpoints @user <delta>

/leaderboard



---

Claims & PKD Redemption

User: /mypoints → personal profile embed
Then: /claim <points> → creates claim thread

Staff resolves using:

Buttons: approve / close


DB:

Table	Columns

points	points, lifetime points, rank name
point_logs	history of edits & claims



---

6.4 Player Location Tracking

Commands:

/setlocation, /whereami, /whereis, /clearme, /clearall


Storage:

client.playerLocations (in-memory object)

utils/locations.cjs is canonical source for autocomplete lists


Displays active routes & hunters using /activeroutes


---

Bounty System

Workflow:

User → /bountyrequest → Staff Approval Thread → Announcement → Scheduled → Card → Claims → Win → Payout

DB Core Tables:

bounties

bounty_claims


Scheduler Responsibilities:

Auto-start when startTime arrives

Auto-expire when endTime passes

Swap active card with success/failed card


Card Renderers:

Active: cardRenderer.cjs

Success: bountyCardSuccess.cjs

Failed: bountyCardEndFailed.cjs


PNG files saved local-only on Pi.


---

Data Model Summary

Full table schemas + how code uses them:

TABLE: points

Tracks player economy


TABLE: point_logs

Permanent audit trail


TABLE: bounties

Core metadata for all bounty lifecycle phases


TABLE: bounty_claims

Who is attempting to complete the bounty


TABLE: reports

Pokémon sightings (for debug cards now)


All CRUD handled inside database.cjs:

create*, get*, update*, delete*, getTo* helpers


Memory caches used only for:

memoryBounties

memoryClaims

client.playerLocations

temporary report maps for /report



---

 Scheduler Architecture

Runs inside index.cjs with interval loop:

Function	DB source	Action

getBountiesToStart()	memoryBounties	Create card if startTime reached
getBountiesToExpire()	memoryBounties	Mark expired + post failed card
getReportsToExpire()	reports	Update embed + stale cleanup


Frequency: every 60 seconds


---

9️⃣ — Rendering Architecture

Canvas-based PNG generation:

Renderer	Used for

cardRenderer.cjs	Active bounties
bountyCardSuccess.cjs	Completed bounties
bountyCardEndFailed.cjs	Expired bounties
reportCard.cjs	Staff debug reports


Images saved into:

/renderers/card-images/

/renderers/report-images/


Not tracked in git (ignored via .gitignore).


---

Permissions & Roles


Players must have:

ROLE_BOUNTY_HUNTER (or name match) for bounty request access



---

Environment Variables

These define routing and roles:

Key	Purpose

DISCORD_TOKEN, CLIENT_ID, GUILD_ID	Bot account setup
DB_PATH	Database location
CHANNEL_*	Routing points messages by rarity
ROLE_*	Optional pings
CLAIMS_FORUM_CHANNEL_ID	Claim threads
BOUNTY_REQUEST_CHANNEL_ID	Staff approval threads
BOUNTY_CHANNEL_ID	Public bounty cards
REPORT_CARD_CHANNEL_ID	Staff debug report cards


> Missing values result in graceful no-ping/no-route behavior.




---

Module Dependency Structure

Slash Commands → Utils → (DB + Cache) → Renderer → Discord Output
             ↘ Buttons / Modals ↗

Key separation:

Layer	Responsibility

DB	Permanent truth
Memory	Fast lookup/cache only
Utils	Business logic
Interactions	Command/UI wiring
Scheduler	Automates actions over time
Renderer	Visuals only



---

Future Improvements Roadmap

Priority	Task

Only allow exact name from list of route and pokemon names to avoid card not pulling sprites 

Merge legacy location utils → canonical store

Improve staff permission checks (configurable)

Migrate sprites to remote CDN to lighten Pi load

Expand /reportedit safety & audits
Add analytics for roaming spawn popularity



---

 Key Rules for Contributions

✔ ALWAYS camelCase in JavaScript
✔ ONLY snake_case in SQLite tables
✔ ALL DB writes/reads go through database.cjs
✔ No business logic inside Discord event files
✔ Scheduler must be idempotent (safe to re-run)


---

End of Document

This architecture file is authoritative.
All future updates and refactors must follow 