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