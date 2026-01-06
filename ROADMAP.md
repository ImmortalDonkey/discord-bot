# ROADMAP.md  
Roaming Companion — Stabilisation & Architecture Hardening Plan

Owner: ImmortalDonkey  
Last updated: 2026-01-06  
Status: Planned (pre-execution)

---

## Purpose

This roadmap defines a **safe, sequential plan** to resolve known architectural and correctness issues in the Roaming Companion Discord bot.

Goals:
- Eliminate data inconsistencies and hidden drift
- Establish single sources of truth
- Improve scheduler reliability and observability
- Prevent regressions between manual, automatic, and expiry flows
- Document architecture clearly before and after changes

Rules:
- One issue at a time
- Cumulative patches only (no destructive refactors)
- Full files returned for every patch
- Architecture documentation updated incrementally

---

## Stage 0 — Baseline Safety (Required Before Changes)

**Objective:** Ensure changes are reversible and observable.

### Tasks
- [ ] Create a backup branch or copy of the working project
- [ ] Confirm bot boots cleanly on target environment (Pi)
- [ ] Confirm `/report`, auto-report, and at least one scheduler tick work

### Acceptance Criteria
- Bot starts without runtime errors
- No DB migration failures
- Logs show schedulers starting normally

---

## Stage 1 — Architecture Documentation (Pre-Fix)

**Objective:** Document the *current* architecture and explicitly list known issues.

### Tasks
- [ ] Replace existing `ARCHITECTURE.md` with the “BEFORE fixes” version
- [ ] Ensure document includes:
  - Module map
  - Runtime data flows
  - Known issues list
  - Fix roadmap summary

### Acceptance Criteria
- Architecture reflects current reality (even if flawed)
- No ambiguity about where problems exist

---

## Stage 2 — Issue #1: Points Identity Model (Highest Impact)

**Problem**  
Manual reports award points to Discord identity, while Vortex auto-reports award to IGN identity, causing split lifetime totals and leaderboard drift.

### Decision Required
Choose **one** canonical identity model:

- **Option A (recommended): IGN-first**
  - If IGN is linked → award to `ign:<ign_norm>`
  - Otherwise → award to Discord identity or no points
- Option B: Discord-only
- Option C: Dual storage with unified display

### Tasks
- [ ] Define canonical identity rule
- [ ] Update manual report flow to follow rule
- [ ] Update auto-report flow to follow rule
- [ ] Ensure leaderboard and rank calculations align
- [ ] Preserve historical logs where possible

### Acceptance Criteria
- A single user never has split lifetime totals
- Manual and automatic reports contribute to the same progression
- `/leaderboard` and rank output are consistent

---

## Stage 3 — Issue #2: Canonical Pokémon & Rarity Source

**Problem**  
Multiple files define Pokémon lists and rarity logic, creating disagreement risks.

### Tasks
- [ ] Designate `utils/rarity.cjs` as the single source of truth
- [ ] Export all required helpers from that module
- [ ] Refactor:
  - validation
  - autocomplete
  - scoring
  - role grouping
  to import from the canonical module

### Acceptance Criteria
- Pokémon validity, rarity color, autocomplete, and scoring never disagree
- No duplicated Pokémon lists remain elsewhere in the codebase

---

## Stage 4 — Issue #3: Renderer Canonicalisation

**Problem**  
Different flows import different report renderers (`reportCard.cjs` vs `reportCard.debug.cjs`), risking visual regressions.

### Tasks
- [ ] Choose a single canonical report renderer file
- [ ] Update all flows to import it:
  - manual `/report`
  - vortex auto-report
  - report expiry scheduler
- [ ] Remove or gate debug-only behavior via environment flags (if needed)

### Acceptance Criteria
- Manual, auto, and expired cards always render identically
- No duplicate renderer logic exists

---

## Stage 5 — Issue #4: Scheduler Channel Fetch Robustness

**Problem**  
Schedulers rely on cached channels, which may not exist on cold start.

### Tasks
- [ ] Replace critical `.cache.get()` calls with:
  - cache fast-path + `guild.channels.fetch()` fallback
- [ ] Apply to all scheduler message send/edit paths

### Acceptance Criteria
- Cold start + immediate scheduler tick works reliably
- No false “invalid channel” errors after reboot

---

## Stage 6 — Issue #5: Roles Channel Bootstrap Resilience

**Problem**  
If role messages are deleted manually, the bot believes they still exist and does not recreate them.

### Tasks
- [ ] On boot, fetch stored role message IDs
- [ ] If a message is missing:
  - recreate it
  - update DB record
- [ ] Preserve existing role grouping behavior

### Acceptance Criteria
- Deleting a role message and rebooting recreates it automatically
- No duplicate messages are created unnecessarily

---

## Stage 7 — Issue #6: Centralised File Cleanup (`safeUnlink`)

**Problem**  
PNG cleanup is inconsistent and can leave orphan files or crash on missing paths.

### Tasks
- [ ] Introduce `utils/fs.cjs`
- [ ] Implement `safeUnlink(path)` and `ensureDir(path)`
- [ ] Replace direct `fs.unlinkSync` / `fs.unlink` usage

### Acceptance Criteria
- Missing files never crash cleanup logic
- Disk does not accumulate orphan PNGs over time

---

## Stage 8 — Issue #7: Scheduler Health Tracking

**Problem**  
There is no persistent way to know whether schedulers are running correctly.

### Tasks
- [ ] Add DB keys for scheduler heartbeats:
  - report scheduler
  - bounty scheduler
  - vortex watcher
- [ ] Update each tick to write a timestamp

### Acceptance Criteria
- DB shows last successful tick times
- Scheduler stalls are diagnosable without log scraping

---

## Stage 9 — Issue #8: Dedup Authority Confirmation (Vortex)

**Problem**  
In-memory dedup exists, but DB must remain authoritative across restarts.

### Tasks
- [ ] Confirm DB dedup always blocks duplicates
- [ ] Ensure memory cache is treated as optimization only
- [ ] Verify restart behavior does not repost old sightings

### Acceptance Criteria
- Restarting the bot never reposts old spawns
- New spawns are never suppressed incorrectly

---

## Stage 10 — Issue #9: Dependency Cleanup

**Problem**  
Unused dependencies increase maintenance risk.

### Tasks
- [ ] Confirm `node-fetch` is unused
- [ ] Remove unused dependency
- [ ] Reinstall/prune node_modules

### Acceptance Criteria
- Bot runs without missing-module errors
- Dependency list matches actual usage

---

## Stage 11 — Issue #10: Boot-Time Config Sanity Check

**Problem**  
Missing environment variables cause silent feature failures.

### Tasks
- [ ] Add `utils/configCheck.cjs`
- [ ] On boot, log:
  - missing env vars
  - which features are disabled as a result

### Acceptance Criteria
- Startup logs clearly indicate misconfiguration
- No silent failures

---

## Final Stage — Architecture Documentation (Post-Fix)

**Objective:** Lock in the final, correct architecture.

### Tasks
- [ ] Replace `ARCHITECTURE.md` with the “AFTER fixes” version
- [ ] Ensure document reflects:
  - canonical identity model
  - canonical rarity source
  - scheduler health tracking
  - resilience guarantees

### Acceptance Criteria
- Architecture documentation matches actual behavior
- New contributors can reason about the system without tribal knowledge

---

## Execution Rule

⚠️ **Do not skip stages.**  
Each stage must be completed, verified, and documented before moving on.

---
End of document