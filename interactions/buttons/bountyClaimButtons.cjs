// interactions/buttons/bountyClaimButtons.cjs
const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits
} = require("discord.js");

const db = require("../../database.cjs");
const { createBountyCard } = require("../../renderers/cardRenderer.cjs");
const { getRankName } = require("../../utils/rankSystem.cjs");

module.exports = {
  ids: ["approveclaim_", "denyclaim_"],

  async execute(client, interaction) {
    const id = interaction.customId;

    if (id.startsWith("approveclaim_")) {
      return handleApproveClaim(client, interaction);
    }

    if (id.startsWith("denyclaim_")) {
      return handleDenyClaim(client, interaction);
    }
  }
};

function isStaffMember(member) {
  const staffRolesEnv = process.env.STAFF_ROLES || '';
  const staffRoles = staffRolesEnv
    .split(',')
    .map(r => r.trim())
    .filter(Boolean);

  const memberRoles = member.roles.cache.map(r => r.id);

  const hasStaffRole = staffRoles.some(r => memberRoles.includes(r));
  const isAdmin = member.permissions.has(PermissionFlagsBits.Administrator);

  return hasStaffRole || isAdmin;
}

// ───────────────────────────────
// APPROVE CLAIM
// ───────────────────────────────
async function handleApproveClaim(client, interaction) {
  if (!isStaffMember(interaction.member)) {
    return interaction.reply({
      content: "❌ You do not have permission to approve bounty claims.",
      ephemeral: true
    });
  }

  const claimId = interaction.customId.replace("approveclaim_", "");
  const claim = await db.getBountyClaimById(claimId);

  if (!claim || claim.status !== "pending") {
    return interaction.reply({
      content: "❌ This claim is not pending or no longer exists.",
      ephemeral: true
    });
  }

  const bounty = await db.getBountyById(claim.bounty_id);

  if (!bounty) {
    return interaction.reply({
      content: "⚠ Could not load bounty for this claim.",
      ephemeral: true
    });
  }

  if (bounty.status !== "open") {
    return interaction.reply({
      content: "❌ This bounty is no longer open.",
      ephemeral: true
    });
  }

  // Mark claim approved
  await db.updateBountyClaim(claimId, {
    status: "approved",
    resolved_at: Date.now(),
    resolver_id: interaction.user.id
  });

  // Mark bounty completed
  await db.updateBounty(bounty.id, {
    status: "completed",
    winner_id: claim.hunter_id,
    winner_claim_id: claimId
  });

  // Remove claim buttons from the thread embed
  const embed = EmbedBuilder.from(interaction.message.embeds[0])
    .setColor("Green")
    .setTitle("✔ Bounty Claim Approved")
    .addFields({
      name: "Approved by",
      value: `<@${interaction.user.id}>`,
      inline: false
    });

  await interaction.update({
    embeds: [embed],
    components: []
  });

  // DM Hunter
  try {
    const hunter = await client.users.fetch(claim.hunter_id);
    await hunter.send(
      `🎉 **Your bounty claim has been approved!**\n` +
      `You have completed the bounty for **${bounty.id}**.\n\n` +
      `Reward: **${Number(bounty.reward || 0).toLocaleString()} PKD**`
    );
  } catch (err) {
    console.warn("Could not DM hunter:", err);
  }

  // Remove claim button from the bounty card (card message)
  try {
    const guild = interaction.guild;
    const channel = await guild.channels.fetch(bounty.card_channel_id).catch(() => null);
    if (channel) {
      const cardMsg = await channel.messages.fetch(bounty.card_message_id).catch(() => null);
      if (cardMsg) {
        await cardMsg.edit({ components: [] }).catch(() => {});
      }
    }
  } catch (err) {
    console.warn("Could not update card message:", err);
  }

  // Post COMPLETED CARD to bounty channel
  try {
    const guild = interaction.guild;
    const pokemons = JSON.parse(bounty.pokemons || "[]");

    const member = await guild.members.fetch(claim.hunter_id).catch(() => null);

    const username =
      member?.nickname ||
      member?.user?.username ||
      "Hunter";

    const dbUser = await db.getUserById(claim.hunter_id);
    const rank = dbUser ? getRankName(dbUser.lifetime_points || 0) : "Rookie Trainer";

    const cardPath = await createBountyCard({
      bountyId: bounty.id,
      username,
      rankName: rank,
      rarityKey: bounty.rarity_key,
      rarityLabel: bounty.rarity_label,
      pokemons,
      startLabel: new Date(bounty.start_time).toLocaleString("en-GB"),
      endLabel: new Date(bounty.end_time).toLocaleString("en-GB"),
      durationLabel: `${bounty.duration_hours} hour(s)`,
      note: bounty.notes || "",
      rewardLabel: `${Number(bounty.reward || 0).toLocaleString()} PKD`,
      avatarUrl: member?.displayAvatarURL({ extension: "png", size: 512 }) || null
    });

    const bountyChannelId = process.env.BOUNTY_CHANNEL_ID;
    const channel = await guild.channels.fetch(bountyChannelId);

    const completedEmbed = new EmbedBuilder()
      .setTitle("🎉 Bounty Completed!")
      .setDescription(`<@${claim.hunter_id}> has successfully claimed this bounty!`)
      .addFields(
        { name: "Pokémon ID", value: claim.pokemon_id, inline: true },
        { name: "Reward", value: `${bounty.reward.toLocaleString()} PKD`, inline: true }
      )
      .setColor("Green")
      .setTimestamp();

    await channel.send({
      embeds: [completedEmbed],
      files: [cardPath]
    });
  } catch (err) {
    console.error("Could not post completed bounty card:", err);
  }

  // Delete claim thread
  try {
    if (claim.claim_thread_id) {
      const thread = await interaction.guild.channels.fetch(claim.claim_thread_id).catch(() => null);
      if (thread) await thread.delete().catch(() => {});
    }
  } catch (err) {
    console.warn("Could not delete claim thread:", err);
  }

  return;
}

// ───────────────────────────────
// DENY CLAIM
// ───────────────────────────────
async function handleDenyClaim(client, interaction) {
  if (!isStaffMember(interaction.member)) {
    return interaction.reply({
      content: "❌ You do not have permission to deny bounty claims.",
      ephemeral: true
    });
  }

  const claimId = interaction.customId.replace("denyclaim_", "");
  const claim = await db.getBountyClaimById(claimId);

  if (!claim || claim.status !== "pending") {
    return interaction.reply({
      content: "❌ This claim is not pending or no longer exists.",
      ephemeral: true
    });
  }

  const bounty = await db.getBountyById(claim.bounty_id);

  // Mark claim denied
  await db.updateBountyClaim(claimId, {
    status: "denied",
    resolved_at: Date.now(),
    resolver_id: interaction.user.id
  });

  // Update embed
  const embed = EmbedBuilder.from(interaction.message.embeds[0])
    .setColor("Red")
    .setTitle("❌ Bounty Claim Denied")
    .addFields({
      name: "Denied by",
      value: `<@${interaction.user.id}>`,
      inline: false
    });

  await interaction.update({
    embeds: [embed],
    components: []
  });

  // DM Hunter
  try {
    const hunter = await client.users.fetch(claim.hunter_id);
    await hunter.send(
      `❌ Your bounty claim for **${bounty.id}** has been denied by staff.`
    );
  } catch {}

  // Keep bounty open
  return;
}