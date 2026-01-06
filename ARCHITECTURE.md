# ARCHITECTURE.md
Roaming Companion — Project Structure, Data Flow, and Fix Roadmap

Last updated: 2026-01-06  
Author: ImmortalDonkey

---

## Vision & Purpose
This Discord bot powers the Roamers Union community for Pokémon Vortex gameplay automation:

- Tracks roaming Pokémon sightings (manual + automatic)
- Handles points economy + rank system
- Enables bounty hunting with approvals + rewards
- Automates staff flows with buttons/modals/threads
- Renders PNG cards (reports, bounties, leaderboards)
- Designed to run 24/7 on Raspberry Pi with PM2

---

## Tech Overview
- Language: Node.js (CommonJS)
- Discord API: discord.js v14
- Database: SQLite3 (local)
- Graphics: canvas
- Hosting: Raspberry Pi Zero 2 W + PM2
- Config: `.env` / `.env.dev` selected by `NODE_ENV`
- Code style: camelCase (JS) / snake_case (DB)

---

## Project Layout (high level)
discord-bot-main/ ├── index.cjs ├── deploy-commands.cjs ├── database.cjs ├── README.md ├── ARCHITECTURE.md ├── data/ │   ├── bot.db │   └── bot_backup.db ├── cards/                      # generated PNG outputs ├── handlers/ │   ├── commandHandler.cjs │   ├── buttonHandler.cjs │   ├── modalHandler.cjs │   └── autocompleteHandler.cjs ├── interactions/ │   ├── commands/ │   ├── buttons/ │   ├── modals/ │   └── autocomplete/ ├── renderers/ │   ├── reportCard.cjs │   ├── reportCard.debug.cjs │   ├── leaderboardCard.cjs │   └── ... ├── sprites/                    # Pokémon sprites and assets └── utils/ ├── bountyScheduler.cjs ├── reportScheduler.cjs ├── roamerWatcher.cjs ├── vortexApi.cjs ├── initRolesChannel.cjs ├── rarity.cjs ├── validation.cjs ├── rankSystem.cjs └── ...
Copy code

Notes:
- `handlers/*` wire Discord interactions to `interactions/*`
- `utils/*` contains business logic and schedulers
- `renderers/*` should be visuals only (Canvas output)
- `database.cjs` is the single source of truth for persistent state

---

## Runtime Data Flow

### Bot boot sequence (index.cjs)
1. Load env (`.env` or `.env.dev`)
2. Create Discord client
3. Connect DB / run migrations
4. Initialize handlers (commands/buttons/modals/autocomplete)
5. Initialize roles channel messages (if enabled)
6. Start schedulers:
   - bounty scheduler
   - report expiry scheduler
   - roamer watcher (polling Vortex feed)
7. Start heartbeat Express server

### Manual report flow (/report)
Interaction:
- `/report` (slash command) validates inputs
- Fetches/infers rarity and card preferences
- Renders report card PNG
- Sends Discord message with buttons (where applicable)
- Writes report record + point log to DB

### Automatic report flow (Vortex watcher)
Watcher:
- Polls Vortex feed on interval
- Dedups in memory (performance)
- Calls handler to:
  - DB-dedup authoritative record
  - render card
  - post message
  - award points (if applicable)

### Report expiry flow (reportScheduler)
- Runs aligned to the next minute
- Finds expired reports
- Re-renders “expired” version of the card
- Edits the original message to remove buttons
- Updates DB + removes PNG
- Later removes expired report rows after a delay

### Roles channel flow (initRolesChannel)
- Ensures role pick messages exist
- Persists message IDs in DB to avoid duplicates
- Buttons apply/remove roles for:
  - single Pokémon roles
  - group rarity roles

---

## Module Separation Rules (current intent)
| Layer | Responsibility |
|------|----------------|
| DB (`database.cjs`) | Persistent truth |
| Utils (`utils/*`) | Business logic, integrations, schedulers |
| Interactions (`interactions/*`) | Discord UI and wiring |
| Handlers (`handlers/*`) | Routing to the correct module |
| Renderers (`renderers/*`) | Visual output only |

---

## Known Issues (to be fixed)
1. Points identity mismatch: manual awards to Discord identity, auto awards to IGN identity → drift
2. Multiple sources of truth for Pokémon lists/rarity groups across modules
3. Renderer import inconsistency (`reportCard` vs `reportCard.debug`)
4. Schedulers rely on channel cache (fragile on cold start)
5. Roles bootstrap doesn’t recreate messages if DB IDs exist but messages were deleted
6. File cleanup is inconsistent (risk of orphan PNG files)
7. No persistent “scheduler health” tracking in DB
8. Dedup logic depends on memory cache (DB should remain authoritative)
9. Unused dependencies may exist (e.g., node-fetch)
10. No centralized boot-time config sanity check

---

## Fix Roadmap (ordered)
1) Decide and implement canonical identity model for points  
2) Unify rarity/pokemon definitions into a single canonical module  
3) Unify report renderer usage across manual/auto/expiry flows  
4) Replace scheduler cache channel lookups with fetch fallback  
5) Make roles channel bootstrap resilient to deleted messages  
6) Introduce `safeUnlink()` helper and use it everywhere  
7) Add scheduler health logging into DB (`bot_meta` keys)  
8) Confirm and lock DB-authoritative dedup behavior  
9) Remove unused dependencies after confirmation  
10) Add config sanity check on boot

---

## Key Contribution Rules
- camelCase in JavaScript
- snake_case in SQLite tables
- all DB reads/writes go through `database.cjs`
- no business logic in Discord event files
- schedulers must be idempotent and safe to re-run

---
End of document