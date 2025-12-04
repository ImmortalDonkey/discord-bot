Absolutely — here is a complete, single-file, long-term architecture reference for your project, rewritten cleanly and fully consolidated.

This is now the definitive ARCHITECTURE.md for your bot.
It includes all core systems, updated design decisions, naming conventions, and current flow logic — everything needed to confidently maintain and expand the bot over time.


---

📌 ARCHITECTURE.md

Roaming Companion & Bounty System — Full Project Structure & Data Flow

Last updated: 2025-12-04
Author: ImmortalDonkey


---

1️⃣ — Vision & Purpose

This Discord bot powers the Roamers Union community for Pokémon Vortex gameplay automation:

✔ Tracks roaming Pokémon sightings
✔ Handles points economy + rank system
✔ Enables bounty hunting with approvals + rewards
✔ Makes staff operations efficient with modals, threads & PNG cards
✔ Designed to run 24/7 on Raspberry Pi Zero 2 W


---

2️⃣ — Tech Overview

Layer	Technology

Language	Node.js (CommonJS)
Discord API	discord.js v14
Database	SQLite3 (on local disk)
Graphics	canvas
Hosting	Raspberry Pi Zero 2 W + PM2
Config	.env with process.env.*
Code Style	camelCase in JS / snake_case in DB



---

3️⃣ — Core Features

Feature	Description

🐾 Roaming Reports	Real-time reporting of Pokémon spawns, with rarity routing and per-hour restrictions
⭐ Points & Ranks	Earn points → lifetime total → automatic rank tiers
🎯 Bounty System	Players request hunts, staff approve, hunters claim completion
📍 Player Locations	Tracks who is hunting where to avoid conflicts
🖼 Card Rendering	PNG art for bounty and report messages
🔔 Scheduling	Auto-start & auto-expire timed bounties



---

4️⃣ — Folder & Module Structure

project-root/
├── index.cjs                  # Main bot, event handlers, scheduler init
├── deploy-commands.cjs        # Slash command deploy utility
├── database.cjs               # SQLite layer + in-memory caches
│
├── interactions/
│   ├── commands/              # Slash commands
│   ├── buttons/               # Button interaction handlers
│   ├── modals/                # Modal submission handlers
│   └── autocomplete/          # Autocomplete providers
│
├── utils/                     # Logic/helper layer below commands
│
├── renderers/                 # PNG card generation
│
├── sprites/                   # Pokémon art on Pi (ignored in git)
└── data/                      # SQLite DB file (ignored in git)


---

5️⃣ — Naming Conventions

DB Schema	JS Code	Bridge

snake_case	camelCase	normalize helpers in database.cjs


Example:

SQLite Column	JS Object Field

start_time	startTime
rarity_key	rarityKey
reporter_id	reporterId


📌 Rule: All patches to DB functions must use camelCase.
Normalization handles the conversion automatically.


---

6️⃣ — Systems Breakdown

6.1 Roaming Reports

🔹 Player uses /report pokemon:<autocomplete> route:<autocomplete>
🔹 Routing based on rarity:

Rarity	Channel	Role Ping	Base Points

paradox	CHANNEL_PARADOX	ROLE_PARADOX	200
roamerMonth	CHANNEL_ROAMER_OF_MONTH	Ping	30
legendary / rare	CHANNEL_RARE	Ping	20
common	No ping	1	


⏱ Time-based point scaling

00-29 min → 100%

30-39 → 75%

40-49 → 50%

50-59 → 10%


⛔ Duplicate protection:
A Pokémon may only be reported once per hour globally.

🧠 Current implementation:

Production /report uses in-memory maps only

Debug /reportdebug writes to DB + renders PNG card


📌 Future goal: Migrate full reporting to SQLite DB.


---

6.2 Points & Rank System

Stored in DB	Derived at runtime

Spendable points	RankName
lifetime_points	PKD conversion (200k each)
point_logs history	


Ranks are awarded by lifetime points (values inside rankSystem.cjs)

Staff Commands:

/editpoints @user <delta>

/leaderboard



---

6.3 Claims & PKD Redemption

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

6.5 Bounty System

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

7️⃣ — Data Model Summary

🎯 Full table schemas + how code uses them:

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

8️⃣ — Scheduler Architecture

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

🔟 — Permissions & Roles

Staff actions granted by:

Permissions: ManageGuild OR

Role names defined via .env as STAFF_ROLES OR

Includes “Admin Team”


Players must have:

ROLE_BOUNTY_HUNTER (or name match) for bounty request access



---

1️⃣1️⃣ — Environment Variables

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

🧩 Module Dependency Structure

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

1️⃣3️⃣ — Future Improvements Roadmap

Priority	Task

🔥	Convert /report from memory → DB-backed
⚙️	Merge legacy location utils → canonical store
🛡	Improve staff permission checks (configurable)
📦	Migrate sprites to remote CDN to lighten Pi load
🧪	Expand /reportedit safety & audits
📊	Add analytics for roaming spawn popularity



---

🧠 Key Rules for Contributions

✔ ALWAYS camelCase in JavaScript
✔ ONLY snake_case in SQLite tables
✔ ALL DB writes/reads go through database.cjs
✔ No business logic inside Discord event files
✔ Scheduler must be idempotent (safe to re-run)


---

End of Document

This architecture file is authoritative.
All future updates and refactors must follow 