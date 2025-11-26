// commands/report.cjs

const {
  SlashCommandBuilder,
  AttachmentBuilder,
  ChannelType
} = require('discord.js');

const {
  buildReport,
  processReportPoints,
  isDuplicateReport,
  storeReport
} = require('../utils/reportLogic.cjs');

const { getRarity, getRarityDisplayLabel } = require('../utils/rarity.cjs');
const { createReportCardActive, createReportCardExpired } = require('../renderers/reportCard.cjs');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('report')
    .setDescription('Report a roaming Pokémon')
    .addStringOption(opt =>
      opt.setName('pokemon')
        .setDescription('Name of the Pokémon')
        .setAutocomplete(true)
        .setRequired(true)
    )
    .addStringOption(opt =>
      opt.setName('route')
        .setDescription('Route / location where it was found')
        .setAutocomplete(true)
        .setRequired(true)
    ),

  /**
   * REPORT COMMAND EXECUTION
   */
  async execute(interaction, client) {
    const user = interaction.user;

    const pokemon = interaction.options.getString('pokemon');
    const route = interaction.options.getString('route');

    const guildMember = await interaction.guild.members
      .fetch(user.id)
      .catch(() => null);

    const nickname = guildMember?.displayName || user.username;
    const rarityKey = getRarity(pokemon);
    const rarityLabel = getRarityDisplayLabel(rarityKey);

    // -----------------------------
    // 1. DUPLICATE REPORT CHECK
    // -----------------------------
    if (isDuplicateReport(pokemon)) {
      return interaction.reply({
        content: `❌ **Duplicate report blocked.**\nA wild **${pokemon}** has already been reported this hour.`,
        ephemeral: true
      });
    }

    // -----------------------------
    // 2. BUILD REPORT OBJECT
    // -----------------------------
    const report = buildReport({
      userId: user.id,
      username: user.username,
      nickname,
      pokemon,
      route
    });

    // -----------------------------
    // 3. POINT CALCULATION
    // -----------------------------
    const { pointsAwarded, rankName } = await processReportPoints(
      user.id,
      user.username,
      rarityKey
    );
    report.pointsAwarded = pointsAwarded;
    report.rankName = rankName;

    // -----------------------------
    // 4. STORE IN MEMORY HISTORY
    // -----------------------------
    storeReport(report);

    // -----------------------------
    // 5. RARITY CHANNEL SELECTION
    // -----------------------------
    const channelId = process.env[`CHANNEL_${rarityKey.toUpperCase()}`];
    if (!channelId) {
      return interaction.reply({
        content: `❌ Missing channel configuration for rarity: **${rarityKey}**`,
        ephemeral: true
      });
    }

    const targetChannel = await interaction.guild.channels
      .fetch(channelId)
      .catch(() => null);

    if (!targetChannel) {
      return interaction.reply({
        content: `❌ Could not locate configured channel <#${channelId}>.`,
        ephemeral: true
      });
    }

    // -----------------------------
    // 6. WRONG CHANNEL REDIRECT
    // -----------------------------
    if (interaction.channel.id !== channelId) {
      await interaction.reply({
        content: `⚠ Wrong channel detected — your report will be posted in <#${channelId}>.`,
        ephemeral: true
      });

      setTimeout(() => interaction.deleteReply().catch(() => {}), 8000);
    }

    // -----------------------------
    // 7. PNG CARD RENDER (ACTIVE)
    // -----------------------------
    const cardPath = await createReportCardActive({
      id: report.id,
      trainerName: nickname,
      rankName,
      pokemonName: pokemon,
      rarityLabel,
      rarityKey,
      points: pointsAwarded,
      routeName: route
    });

    const fileName = `report_${report.id}.png`;
    const attachment = new AttachmentBuilder(cardPath, {
      name: fileName
    });

    // -----------------------------
    // 8. SEND REPORT (with pings)
    // -----------------------------
    const roleId = process.env[`ROLE_${rarityKey.toUpperCase()}`];
    const mentionText = roleId ? `<@${user.id}> <@&${roleId}>` : `<@${user.id}>`;

    const msg = await targetChannel.send({
      content: mentionText,
      files: [attachment]
    });

    // -----------------------------
    // 9. SCHEDULE EXPIRY UPDATE
    // -----------------------------
    const msUntilExpiry = report.expiry.getTime() - Date.now();

    setTimeout(async () => {
      try {
        const expiredCard = await createReportCardExpired({
          id: report.id,
          trainerName: nickname,
          rankName,
          pokemonName: pokemon,
          rarityLabel,
          rarityKey,
          points: pointsAwarded,
          routeName: route
        });

        const expiredAttachment = new AttachmentBuilder(expiredCard, {
          name: fileName
        });

        // Replace PNG without re-pinging anyone
        await msg.edit({
          content: msg.content, // remains unchanged, discord will NOT re-ping
          files: [expiredAttachment]
        });
      } catch (err) {
        console.error('❌ Failed to update expired report card:', err);
      }
    }, msUntilExpiry);

    // -----------------------------
    // 10. CONFIRM TO USER
    // -----------------------------
    return interaction.reply({
      content: `✔ Report for **${pokemon}** submitted in <#${channelId}>.`,
      ephemeral: true
    });
  }
};

