const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require("discord.js");

const db = require("../database.cjs");
const { getRankName } = require("./rankSystem.cjs");
const { createBountyCard } = require("../renderers/cardRenderer.cjs");

// End-card renderers
let createBountySuccessCard = null;
let createBountyFailedCard = null;

try {
  createBountySuccessCard =
    require("../renderers/bountyCardSuccess.cjs").createBountySuccessCard;
  createBountyFailedCard =
    require("../renderers/bountyCardEndFailed.cjs").createBountyFailedCard;
} catch {
  console.warn("⚠ End-card renderers not found yet.");
}

function normalize(b) {
  if (!b) return null;
  return {
    id: b.id,
    guildId: b.guild_id || b.guildId,
    requesterId: b.requester_id || b.requesterId,
    requesterName: b.requester_name || b.requesterName,
    pokemons: Array.isArray(b.pokemons)
      ? b.pokemons
      : typeof b.pokemons === "string"
      ? JSON.parse(b.pokemons)
      : b.pokemons_json
      ? JSON.parse(b.pokemons_json)
      : [],
    notes: b.notes,
    startTime: b.start_time || b.startTime,
    endTime: b.end_time || b.endTime,
    durationHours: b.duration_hours || b.durationHours,
    reward: b.reward,
    rarityKey: b.rarity_key || b.rarityKey,
    rarityLabel: b.rarity_label || b.rarityLabel,
    startsImmediately:
      b.starts_immediately === 1 ||
      b.startsImmediately === 1 ||
      b.starts_immediately === true,
    status: b.status,
    requestThreadId: b.request_thread_id || b.requestThreadId,
    announcementChannelId: b.announcement_channel_id || b.announcementChannelId,
    announcementMessageId: b.announcement_message_id || b.announcementMessageId,
    cardChannelId: b.card_channel_id || b.cardChannelId,
    cardMessageId: b.card_message_id || b.cardMessageId
  };
}

/* --------------------------- 
 * POST ACTIVE CARD
 * --------------------------- */
async function postBountyCard(client, raw) {
  const bounty = normalize(raw);

  const guild = client.guilds.cache.get(bounty.guildId);
  if (!guild) return console.error("❌ Guild not found:", bounty.guildId);

  const channel = guild.channels.cache.get(process.env.BOUNTY_CHANNEL_ID);
  if (!channel) return console.error("❌ BOUNTY_CHANNEL_ID invalid");

  const member = await guild.members.fetch(bounty.requesterId).catch(() => null);
  const username =
    member?.nickname ||
    member?.displayName ||
    member?.user?.username ||
    bounty.requesterName ||
    "Trainer";

  const avatarUrl =
    member?.displayAvatarURL({ extension: "png", size: 512 }) ||
    guild.iconURL({ extension: "png", size: 512 });

  let rankName = "Rookie Trainer";
  try {
    const u = await db.getUserById(bounty.requesterId);
    const lifetime = u?.lifetime_points ?? u?.points ?? 0;
    rankName = getRankName(lifetime);
  } catch {}

  const rewardLabel = `${Number(bounty.reward).toLocaleString()} PKD`;

  const startLabel = bounty.startsImmediately
    ? "Starts Immediately"
    : new Date(bounty.startTime).toLocaleString("en-GB");

  const endLabel = new Date(bounty.endTime).toLocaleString("en-GB");
  const durationLabel = `${bounty.durationHours} hour(s)`;

  const cardBuffer = await createBountyCard({
    bountyId: bounty.id,
    username,
    rankName,
    rarityKey: bounty.rarityKey,
    rarityLabel: bounty.rarityLabel,
    pokemons: bounty.pokemons,
    startLabel,
    endLabel,
    durationLabel,
    note: bounty.notes || "Good luck!",
    rewardLabel,
    avatarUrl
  });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`claimbounty_${bounty.id}`)
      .setLabel("Claim Bounty")
      .setStyle(ButtonStyle.Success)
  );

  const msg = await channel.send({
    files: [{ attachment: cardBuffer, name: `bounty_${bounty.id}.png` }],
    components: [row]
  });

  await db.updateBounty(bounty.id, {
    card_channel_id: channel.id,
    card_message_id: msg.id,
    status: "open" // ⭐ move into ACTIVE state
  });

  console.log(`📌 Posted active bounty card #${bounty.id}`);
}

/* --------------------------- */
async function postCompletedCard() {}
async function postFailedCard() {}

/* ---------------------------
 * SCHEDULER LOOP (patched)
 * --------------------------- */
function startBountyScheduler(client) {
  console.log("📅 Bounty Scheduler running …");

  const INTERVAL = 60000;
  setInterval(async () => {
    const now = Date.now();

    try {
      /* START scheduled bounties */
      const toStart = await db.getBountiesToStart(now);
      for (const raw of toStart) {
        const bounty = normalize(raw);

        console.log(`🚀 Starting scheduled bounty: ${bounty.id}`);

        if (bounty.announcementChannelId && bounty.announcementMessageId) {
          const guild = client.guilds.cache.get(bounty.guildId);
          const ch = guild?.channels.cache.get(bounty.announcementChannelId);
          if (ch) {
            const msg = await ch.messages
              .fetch(bounty.announcementMessageId)
              .catch(() => null);
            if (msg) await msg.delete().catch(() => {});
          }
        }

        await postBountyCard(client, bounty);
      }

      /* EXPIRE open bounties */
      const toExpire = await db.getBountiesToExpire(now);
      for (const raw of toExpire) {
        const bounty = normalize(raw);
        const guild = client.guilds.cache.get(bounty.guildId);

        console.log(`⌛ Expiring bounty: ${bounty.id}`);

        if (bounty.cardMessageId) {
          const ch = guild.channels.cache.get(bounty.cardChannelId);
          if (ch) {
            const msg = await ch.messages
              .fetch(bounty.cardMessageId)
              .catch(() => null);
            if (msg) await msg.delete().catch(() => {});
          }
        }

        await db.updateBounty(bounty.id, { status: "expired" });

        await postFailedCard(client, bounty);
      }
    } catch (err) {
      console.error("❌ Scheduler tick failed:", err);
    }
  }, INTERVAL);
}

module.exports = {
  postBountyCard,
  postCompletedCard,
  postFailedCard,
  startBountyScheduler
};