/**
 * utils/reportDispatcher.cjs
 *
 * Responsible for POSTING reports to Discord.
 * This is the ONLY file that should call channel.send().
 *
 * FINAL ROUTING RULES (LOCKED):
 * - MAIN guild → env-based channels + roles
 * - SUBSCRIBER guilds → DB-based channels + roles
 */

const db = require('../database.cjs');
const fs = require('fs');
const path = require('path');
const { createReportCard } = require('../renderers/reportCard.cjs');

/**
 * Normalise Pokémon names to ENV-safe keys (MAIN GUILD ONLY)
 */
function normalizePokemonKeyEnv(name) {
  return String(name || '')
    .toUpperCase()
    .replace(/[()']/g, '')
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

/**
 * Normalise keys to DB-safe format (SUBSCRIBER GUILDS)
 * Used for BOTH Pokémon and rarity keys
 */
function normalizeDbKey(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[()']/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

function getMainGuildMentions({ rarityKey, pokemonName }) {
  const mentions = [];

  const pokemonKeyEnv = normalizePokemonKeyEnv(pokemonName);
  const pokemonRoleId = process.env[`ROLE_POKEMON_${pokemonKeyEnv}`];
  const rarityRoleId = process.env[`ROLE_${String(rarityKey || '').toUpperCase()}`];

  if (pokemonRoleId) mentions.push(`<@&${pokemonRoleId}>`);
  if (rarityRoleId) mentions.push(`<@&${rarityRoleId}>`);

  return mentions;
}

async function getSubscriberMentions({ guildId, rarityKey, pokemonName }) {
  const mentions = [];

  // Pokémon role lookup (raw → normalized)
  const rawPokemonKey = String(pokemonName || '');
  const normalizedPokemonKey = normalizeDbKey(rawPokemonKey);

  let pokemonRole = await db.getGuildPokemonRole(guildId, rawPokemonKey);
  if (!pokemonRole && normalizedPokemonKey !== rawPokemonKey) {
    pokemonRole = await db.getGuildPokemonRole(guildId, normalizedPokemonKey);
  }

  // Rarity role lookup (raw → normalized)
  const rawRarityKey = String(rarityKey || '');
  const normalizedRarityKey = normalizeDbKey(rawRarityKey);

  let rarityRole = await db.getGuildRarityRole(guildId, rawRarityKey);
  if (!rarityRole && normalizedRarityKey !== rawRarityKey) {
    rarityRole = await db.getGuildRarityRole(guildId, normalizedRarityKey);
  }

  if (pokemonRole?.role_id) mentions.push(`<@&${pokemonRole.role_id}>`);
  if (rarityRole?.role_id) mentions.push(`<@&${rarityRole.role_id}>`);

  return mentions;
}

async function ensureMappingsForLegacyReport(report) {
  // Some older/manual reports may only have channelId/messageId without report_messages rows.
  // We can still operate correctly by creating a single mapping for the canonical guild.
  if (!report?.id || !report?.guildId || !report?.channelId || !report?.messageId) return;

  await db.addReportMessageMapping({
    reportId: report.id,
    guildId: report.guildId,
    channelId: report.channelId,
    messageId: report.messageId
  });
}

async function renderReportImageToDisk(report) {
  const reportCardPrefs = report?.reporterId
    ? await db.getReportCardPrefs(report.reporterId)
    : null;

  const statusText = report.status === 'expired' ? 'Expired' : 'Active';

  return createReportCard({
    reporterName: report.reporterName,
    pokemonName: report.pokemonName,
    location: report.location,
    rarityKey: report.rarityKey,
    rarityLabel: report.rarityLabel,
    points: report.points,
    trainerRank: report.trainerRank || 'Trainer',
    statusText,
    reportCardPrefs
  });
}

async function safeFetchMessage(client, channelId, messageId) {
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel) return null;
  const msg = await channel.messages.fetch(messageId).catch(() => null);
  return msg || null;
}

async function safeDeleteFile(filePath) {
  if (!filePath) return;
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch {}
}

/**
 * Update an existing report card across ALL guilds where it was posted.
 *
 * - Updates the PNG on every mapped Discord message
 * - Updates message content (mentions) WITHOUT pinging (allowedMentions: { parse: [] })
 */
async function dispatchReportUpdate(client, reportId) {
  if (!client || !reportId) return;

  const report = await db.getReport(reportId);
  if (!report) return;

  // Ensure at least one mapping exists for legacy/manual reports
  await ensureMappingsForLegacyReport(report);

  const mappings = await db.getReportMessageMappings(reportId);
  if (!mappings.length) return;

  const newCardPath = await renderReportImageToDisk(report);

  // Best-effort: remove old local PNG once the new one is created
  await safeDeleteFile(report.imagePath);

  // Persist new image path (canonical only)
  await db.updateReport(reportId, { imagePath: newCardPath });

  const mainGuildId = process.env.GUILD_ID;

  for (const m of mappings) {
    const msg = await safeFetchMessage(client, m.channel_id, m.message_id);
    if (!msg) continue;

    // Recompute mentions so the text stays correct across edits,
    // but prevent pings on edit.
    let mentions = [];
    try {
      if (m.guild_id === mainGuildId) {
        mentions = getMainGuildMentions({
          rarityKey: report.rarityKey,
          pokemonName: report.pokemonName
        });
      } else {
        mentions = await getSubscriberMentions({
          guildId: m.guild_id,
          rarityKey: report.rarityKey,
          pokemonName: report.pokemonName
        });
      }
    } catch {}

    await msg
      .edit({
        content: mentions.length ? mentions.join(' ') : msg.content,
        files: [{ attachment: fs.readFileSync(newCardPath), name: path.basename(newCardPath) }],
        // Keep components unchanged by leaving them undefined
        allowedMentions: { parse: [] }
      })
      .catch(() => null);
  }
}

/**
 * Delete an existing report card across ALL guilds where it was posted.
 */
async function dispatchReportDelete(client, reportId) {
  if (!client || !reportId) return;

  const report = await db.getReport(reportId);
  // Even if report is already gone, try to remove orphan messages via mappings.

  if (report) {
    await ensureMappingsForLegacyReport(report);
  }

  const mappings = await db.getReportMessageMappings(reportId);

  for (const m of mappings) {
    const msg = await safeFetchMessage(client, m.channel_id, m.message_id);
    if (!msg) continue;
    await msg.delete().catch(() => null);
  }

  // Remove mappings + canonical report (deleteReport already removes mappings)
  await db.deleteReport(reportId);

  // Clean disk PNG if we still have the path
  if (report?.imagePath) {
    await safeDeleteFile(report.imagePath);
  }
}

async function postToGuild({
  client,
  guildId,
  channelId,
  pokemonRoleId,
  rarityRoleId,
  report,
  renderCard,
  components
}) {
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel) {
    console.warn('⚠ Failed to fetch channel:', channelId);
    return;
  }

  const mentions = [];
  if (pokemonRoleId) mentions.push(`<@&${pokemonRoleId}>`);
  if (rarityRoleId) mentions.push(`<@&${rarityRoleId}>`);

  const { buffer, filename } = await renderCard();

  const msg = await channel.send({
    content: mentions.length ? mentions.join(' ') : undefined,
    files: [{ attachment: buffer, name: filename }],
    components
  });

  await db.addReportMessageMapping({
    reportId: report.id,
    guildId,
    channelId: channel.id,
    messageId: msg.id
  });

  console.log(
    `📤 Report posted to #${channel.name} (${report.rarityKey}) [${guildId}]`
  );
}

async function dispatchReport({
  client,
  report,
  renderCard,
  components = []
}) {
  if (!client || !report?.id || !report?.rarityKey) {
    console.warn('⚠ dispatchReport called with invalid payload:', report);
    return;
  }

  const mainGuildId = process.env.GUILD_ID;

  // ──────────────────────────────
  // MAIN GUILD (ENV) — MUST SUCCEED
  // ──────────────────────────────
  const mainChannelId =
    process.env[`CHANNEL_${report.rarityKey.toUpperCase()}`];

  if (mainChannelId) {
    const pokemonKeyEnv = normalizePokemonKeyEnv(report.pokemonKey);

    await postToGuild({
      client,
      guildId: mainGuildId,
      channelId: mainChannelId,
      pokemonRoleId: process.env[`ROLE_POKEMON_${pokemonKeyEnv}`],
      rarityRoleId: process.env[`ROLE_${report.rarityKey.toUpperCase()}`],
      report,
      renderCard,
      components
    });
  }

  // ──────────────────────────────
  // SUBSCRIBER GUILDS (DB FAN-OUT)
  // BEST-EFFORT — NEVER BREAK DISPATCH
  // ──────────────────────────────
  const subscribers = await db.getSubscriberGuilds();

  for (const g of subscribers) {
    try {
      // ── Pokémon role lookup (raw → normalized)
      const rawPokemonKey = report.pokemonKey;
      const normalizedPokemonKey = normalizeDbKey(rawPokemonKey);

      let pokemonRole =
        await db.getGuildPokemonRole(g.guild_id, rawPokemonKey);

      if (!pokemonRole && normalizedPokemonKey !== rawPokemonKey) {
        pokemonRole =
          await db.getGuildPokemonRole(g.guild_id, normalizedPokemonKey);
      }

      // ── Rarity role lookup (raw → normalized)
      const rawRarityKey = report.rarityKey;
      const normalizedRarityKey = normalizeDbKey(rawRarityKey);

      let rarityRole =
        await db.getGuildRarityRole(g.guild_id, rawRarityKey);

      if (!rarityRole && normalizedRarityKey !== rawRarityKey) {
        rarityRole =
          await db.getGuildRarityRole(g.guild_id, normalizedRarityKey);
      }

      await postToGuild({
        client,
        guildId: g.guild_id,
        channelId: g.report_channel_id,
        pokemonRoleId: pokemonRole?.role_id || null,
        rarityRoleId: rarityRole?.role_id || null,
        report,
        renderCard,
        components
      });

    } catch (err) {
      console.error(
        `❌ Subscriber dispatch failed | report=${report.id} guild=${g.guild_id}`,
        err?.code || err?.message || err
      );
    }
  }
}

/**
 * Vortex entry point
 */
async function dispatchVortexRoamer(client, roamer) {
  const { handleVortexRoamer } = require('./vortexRoamerHandler.cjs');
  return handleVortexRoamer(client, roamer);
}

module.exports = {
  dispatchReport,
  dispatchVortexRoamer,
  dispatchReportUpdate,
  dispatchReportDelete
};