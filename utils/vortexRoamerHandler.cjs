const db = require("../database.cjs");
const { getRarity, getRarityDisplayLabel } = require("./rarity.cjs");
const { calculateAwardedPoints } = require("./scoring.cjs");
const { getRankName } = require("./rankSystem.cjs");
const { createReportCard } = require("../renderers/reportCard.debug.cjs");
const { getRoleForRarity } = require("./reportChannelRouter.cjs");
const { getPokemonRoleId } = require("./pokemonRoleResolver.cjs");

async function handleVortexRoamer(client, roamer) {
  if (!client) return;

  const {
    roamer_name,
    time_found,
    location,
    found_by_username
  } = roamer;

  const ign = String(found_by_username || "").trim();
  if (!ign) return;

  // Dedup
  const exists = await db.hasVortexRoamer(roamer_name, time_found);
  if (exists) return;
  await db.insertVortexRoamer(roamer_name, time_found);

  // Ensure IGN identity
  await db.ensureIgnProfileExists(ign);

  const guild = client.guilds.cache.get(process.env.GUILD_ID);
  if (!guild) return;

  const channel = await guild.channels
    .fetch(process.env.REPORT_CARD_CHANNEL_ID)
    .catch(() => null);

  if (!channel) return;

  // Rarity + points
  const rarityKey = getRarity(roamer_name);
  const rarityLabel = getRarityDisplayLabel(rarityKey);
  const now = new Date();
  const points = calculateAwardedPoints(rarityKey, now);

  const updated = await db.addIgnPoints(
    ign,
    points,
    `Vortex Auto Report: ${roamer_name}`
  );

  const trainerRank = getRankName(updated?.lifetime_points || 0);

  // Expiry
  const expiresAt = new Date(now);
  expiresAt.setMinutes(59, 59, 999);
  const deleteAt = expiresAt.getTime() + 24 * 60 * 60 * 1000;

  const reportId = `vortex_${Date.now()}`;

  // Card
  const cardPath = await createReportCard({
    reportType: "encounter",
    reporterName: ign,
    reporterType: "ign",
    encountererName: ign,
    encountererType: "ign",
    pokemonName: roamer_name,
    location,
    rarityKey,
    rarityLabel,
    points,
    trainerRank,
    statusText: "Active"
  });

  // ───────── PINGS ─────────
  const rarityRoleId = getRoleForRarity(rarityKey);
  const pokemonRoleId = getPokemonRoleId(roamer_name);

  const mentions = [
    pokemonRoleId ? `<@&${pokemonRoleId}>` : null,
    rarityRoleId ? `<@&${rarityRoleId}>` : null
  ].filter(Boolean);

  // ───────── SEND ─────────
  const sent = await channel.send({
    content: mentions.join(" "),
    allowedMentions: {
      roles: [pokemonRoleId, rarityRoleId].filter(Boolean)
    },
    files: [cardPath]
  });

  await db.createReport({
    id: reportId,
    guildId: guild.id,
    reporterId: null,
    reporterName: ign,
    trainerRank,
    pokemonName: roamer_name,
    rarityKey,
    rarityLabel,
    location,
    status: "active",
    messageId: sent.id,
    channelId: sent.channelId,
    points,
    expiresAt: expiresAt.getTime(),
    deleteAt,
    createdAt: now.getTime(),
    imagePath: cardPath
  });

  console.log(
    `🛰️ Vortex card posted: ${roamer_name} (${rarityKey})`
  );
}

module.exports = { handleVortexRoamer };