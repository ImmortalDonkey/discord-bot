Roaming Companion — Project Structure, Data Flow, and Architecture Lock

Last updated: 2026-01-11 Author: ImmortalDonkey

━━━━━━━━━━━━━━━━━━━━ Vision & Purpose ━━━━━━━━━━━━━━━━━━━━ This Discord bot powers the Roamers Union community for Pokémon Vortex gameplay automation:

Tracks roaming Pokémon sightings (manual + automatic)

Handles points economy and rank system

Enables bounty hunting with approvals and rewards

Automates staff flows with buttons, modals, and threads

Renders PNG cards (reports, bounties, leaderboards)

Designed to run 24/7 on a Raspberry Pi with PM2


━━━━━━━━━━━━━━━━━━━━ Tech Overview ━━━━━━━━━━━━━━━━━━━━ Language: Node.js (CommonJS) Discord API: discord.js v14 Database: SQLite3 (local) Graphics: canvas Hosting: Raspberry Pi Zero 2 W + PM2 Config: .env / .env.dev selected by NODE_ENV Code style: camelCase (JS) / snake_case (DB)

━━━━━━━━━━━━━━━━━━━━ Project Layout (high level) ━━━━━━━━━━━━━━━━━━━━ discord-bot-main/ ├── index.cjs ├── deploy-commands.cjs ├── database.cjs ├── README.md ├── ARCHITECTURE.md ├── data/ │   ├── bot.db │   └── bot_backup.db ├── cards/                     # generated PNG outputs (ephemeral) ├── handlers/ │   ├── commandHandler.cjs │   ├── buttonHandler.cjs │   ├── modalHandler.cjs │   └── autocompleteHandler.cjs ├── interactions/ │   ├── commands/ │   ├── buttons/ │   ├── modals/ │   └── autocomplete/ ├── renderers/ │   ├── reportCard.cjs │   ├── reportCard.debug.cjs   # canonical renderer (LOCKED) │   ├── leaderboardCard.cjs │   └── ... ├── sprites/                   # Pokémon sprites and assets └── utils/ ├── bountyScheduler.cjs ├── reportScheduler.cjs ├── roamerWatcher.cjs ├── reportDispatcher.cjs ├── reportDispatchAdapter.cjs ├── vortexApi.cjs ├── vortexRoamerHandler.cjs ├── initRolesChannel.cjs ├── rarity.cjs ├── validation.cjs ├── rankSystem.cjs └── ...

Notes:

handlers/* wire Discord interactions to interactions/*

utils/* contains business logic, schedulers, and integrations

renderers/* must remain visual-only (Canvas output)

database.cjs is the single source of truth for persistent state


━━━━━━━━━━━━━━━━━━━━ Runtime Data Flow ━━━━━━━━━━━━━━━━━━━━

Bot boot sequence (index.cjs)

Load env (.env or .env.dev)

Create Discord client

Connect DB and ensure schema

Initialize handlers (commands / buttons / modals / autocomplete)

Initialize roles channel messages (if enabled)

Start schedulers:

bounty scheduler

report lifecycle scheduler

roamer watcher (Vortex polling)


Start heartbeat Express server


━━━━━━━━━━━━━━━━━━━━ Manual report flow (/report) ━━━━━━━━━━━━━━━━━━━━

Slash command validates inputs

Rarity and card preferences resolved

Report card PNG rendered

Discord message posted

Report record written to DB

Points awarded and logged


━━━━━━━━━━━━━━━━━━━━ Automatic report flow (Vortex watcher) ━━━━━━━━━━━━━━━━━━━━ Watcher (roamerWatcher.cjs):

Polls Vortex feed on interval

Performs in-memory dedup for performance

Normalises timestamps

Forwards valid entries into pipeline


Handler (vortexRoamerHandler.cjs):

DB-level dedup (authoritative)

Ensures IGN profile exists

Calculates rarity and points

Renders report card PNG

Creates canonical report row in DB

Dispatches posting via reportDispatcher


━━━━━━━━━━━━━━━━━━━━ Report dispatch & routing (LOCKED) ━━━━━━━━━━━━━━━━━━━━ reportDispatcher.cjs is the ONLY module allowed to post to Discord.

Routing rules:

MAIN guild (owner server)

Channel IDs sourced from .env (CHANNEL_<RARITY>)

Role IDs sourced from .env:

ROLE_<RARITY>

ROLE_POKEMON_<NORMALISED_NAME>



SUBSCRIBER guilds

Channel and role IDs sourced from DB

Supports Pokémon role + rarity role per guild



Pokémon name normalisation is canonical and locked:

Uppercase

Spaces replaced with underscores

Parentheses removed


Examples:

"Ancient Gengar" → ANCIENT_GENGAR

"Zygarde (Cell)" → ZYGARDE_CELL


━━━━━━━━━━━━━━━━━━━━ Report lifecycle (reportScheduler.cjs) — LOCKED ━━━━━━━━━━━━━━━━━━━━ The scheduler is lifecycle-only and guild-agnostic. It must NEVER perform routing logic.

Expiry phase:

Runs on interval

Finds reports whose active window has ended

Re-renders the SAME card using the SAME renderer

Updates status text to "Expired"

Edits all associated Discord messages in place

Updates report row in DB

Old PNG is deleted locally


Cleanup phase (2 hours after creation):

Discord messages are NOT deleted

Report rows are deleted from DB

PNG files are deleted from disk (Pi only)


This applies equally to:

Manual reports

Automatic Vortex reports

Main guild messages

Subscriber guild messages


━━━━━━━━━━━━━━━━━━━━ Roles channel flow (initRolesChannel) ━━━━━━━━━━━━━━━━━━━━

Ensures role picker messages exist

Stores message IDs in DB

Buttons apply/remove roles for:

Individual Pokémon

Rarity groups



━━━━━━━━━━━━━━━━━━━━ Module Separation Rules (LOCKED) ━━━━━━━━━━━━━━━━━━━━ Layer | Responsibility DB (database.cjs) | Persistent truth Utils (utils/) | Business logic, integrations, schedulers Interactions (interactions/) | Discord UI definitions Handlers (handlers/) | Routing to correct module Renderers (renderers/) | Visual output only Dispatcher (reportDispatcher.cjs) | Discord posting only

━━━━━━━━━━━━━━━━━━━━ Onboarding System ━━━━━━━━━━━━━━━━━━━━

Triggered by: guildMemberAdd event (events/guildMemberAdd.cjs)

Flow:
  1. Private thread created in guild_onboarding_config.onboarding_channel_id
  2. Welcome embed with [I play Vortex!] / [Just browsing] buttons
  3. "Just browsing" → assign guest_role_id → archive thread
  4. "I play Vortex!" → IGN step (modal or skip) → Routes → Rarities → Pokémon → Summary → Confirm
  5. Confirm → assign player_role_id + selected route/rarity/pokémon roles → archive thread
  6. 10-min timeout → auto-assign guest role → archive (handled by reportScheduler)

DB tables:
  guild_onboarding_config  — channel + role config per guild
  onboarding_sessions      — per-user session state + selections_json
  guild_route_roles        — location → role_id mapping (populated by /roledeploy create-route-roles:true)

Route roles:
  Created via /roledeploy with create-route-roles:true option
  Stored in guild_route_roles table
  Pinged by reportDispatcher when a roamer report matches the location

Commands:
  /onboardingconfig — set onboarding_channel, roles_channel, rules_channel, guest_role, player_role
  /roledeploy       — deploy roles panel + optional route role creation


━━━━━━━━━━━━━━━━━━━━ Known Issues (tracked) ━━━━━━━━━━━━━━━━━━━━

Points identity mismatch (Discord vs IGN)

Multiple sources of truth for Pokémon/rarity definitions

Renderer import inconsistency (historical)

Roles bootstrap fragile if messages deleted manually

No scheduler health telemetry in DB

In-memory dedup not persisted (DB remains authoritative)

No boot-time config sanity validation


━━━━━━━━━━━━━━━━━━━━ Fix Roadmap (ordered) ━━━━━━━━━━━━━━━━━━━━

Lock canonical identity model for points

Unify Pokémon and rarity definitions into one module

Enforce single report renderer everywhere

Make roles bootstrap resilient to deleted messages

Introduce safeUnlink() helper for file cleanup

Add scheduler health logging (bot_meta)

Add config sanity checks on startup

Remove unused dependencies after audit


━━━━━━━━━━━━━━━━━━━━ Key Contribution Rules (LOCKED) ━━━━━━━━━━━━━━━━━━━━

camelCase in JavaScript

snake_case in SQLite

All DB access via database.cjs

No business logic in Discord event files

Schedulers must be idempotent and safe to re-run


End of document