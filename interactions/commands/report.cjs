// interactions/commands/report.cjs
const {
  EmbedBuilder,
  AttachmentBuilder
} = require('discord.js');

const db = require('../../database.cjs');
const { getRankName } = require('../../utils/rankSystem.cjs');
const {
  getRarity,
  getRarityDisplayLabel
} = require('../../utils/rarity.cjs');
const { calculateAwardedPoints } = require('../../utils/scoring.cjs');
const { checkReportAllowed } = require('../../utils/reportLimiter.cjs');
const { createReportCardActive } = require('../../renderers/reportCard.cjs');

module.exports = {
  name: 'report',

  /**
   * /report pokemon:<string> route:<string>
   */
  async execute(client, interaction) {
    const user = interaction.user;
    const guild = interaction.guild;

    // Make sure we have a shared pendingReports map on the client
    if (!client.pendingReports) {
      client.pendingReports = new Map();
    }
    const pendingReports = client.pendingReports;

    const pokemon = interaction.options.getString('pokemon');
    const route = interaction.options.getString('route');

    // Determine rarity
    const rarityKey = getRarity(pokemon);
    const rarityLabel = getRarityDisplayLabel(rarityKey);

    // Enforce one report per Pokémon per calendar hour
    const now = new Date();
    const allowResult = checkReportAllowed(pokemon, now);
    if (!allowResult.allowed) {
      return interaction.reply({
        content: `❌ **${pokemon}** has already been reported this hour.\nYou can report it again ${allowResult.nextResetLabel}.`,
        ephemeral: true
      });
    }

    // Resolve role/channel from env
    const upperKey = rarityKey.toUpperCase();
    const roleId = process.env[`ROLE_${upperKey}`];
    const channelId = process.env[`CHANNEL_${upperKey}`];

    if (!channelId) {
      return interaction.reply({
        content: `❌ No channel configured for rarity **${rarityLabel}**. Ask an admin to set \`CHANNEL_${upperKey}\` in the environment.`,
        ephemeral: true
      });
    }

    const targetChannel = await guild.channels.fetch(channelId).catch(() => null);
    if (!targetChannel) {
      return interaction.reply({
        content: `❌ I couldn't find the configured channel <#${channelId}>.`,
        ephemeral: true
      });
    }

    // Track pending report (so /cancelreport still works)
    pendingReports.set(user.id, {
      pokemon,
      route,
      createdAt: now
    });

    // If user used wrong channel, warn & auto-move
    if (interaction.channel.id !== channelId) {
      await interaction.reply({
        content: `⚠ Wrong channel! Your report will be posted in <#${channelId}>.`,
        ephemeral: true
      });
      setTimeout(() => interaction.deleteReply().catch(() => {}), 10000);
    }

    // End-of-hour availability text
    const expiry = new Date(now);
    expiry.setMinutes(59, 59, 999);
    const expiryTime = expiry.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit'
    });

    // Calculate points with diminishing returns
    const finalPoints = calculateAwardedPoints(rarityKey, now);

    // Award points (+ lifetime) via DB
    const updatedRow = await db.addPoints(
      user.id,
      user.username,
      finalPoints,
      `Report: ${pokemon}`
    );
    const lifetime = updatedRow?.lifetime_points || 0;
    const rankName = getRankName(lifetime);

    // Build report card image via your renderer
    const cardId = `${Date.now()}_${user.id}`;
    const cardPath = await createReportCardActive({
      id: cardId,
      trainerName: user.username,
      rankName,
      pokemonName: pokemon,
      rarityKey,
      rarityLabel,
      points: finalPoints,
      routeName: route
    });

    const attachment = new AttachmentBuilder(cardPath, {
      name: `report_${cardId}.png`
    });

    // Timing band text for embed field
    const minute = now.getMinutes();
    let timingText = '';
    if (minute < 30) timingText = '100% award (full points)';
    else if (minute < 40) timingText = '75% award';
    else if (minute < 50) timingText = '50% award';
    else timingText = '10% minimum award';

    // Embed (still keeps your old info, but with extra fields)
    const embed = new EmbedBuilder()
      .setColor('Random')
      .setTitle(`🐾 Wild ${pokemon} spotted!`)
      .setDescription(
        `**${user.username}** has found a wild **${pokemon}**!\n` +
        `📍 Location: **${route}**\n` +
        `⏳ Available until **${expiryTime}**`
      )
      .addFields(
        { name: '📊 Rarity', value: rarityLabel, inline: true },
        { name: '⏱ Timing', value: timingText, inline: true },
        { name: '🏆 Points Awarded', value: String(finalPoints), inline: true },
        { name: 'Trainer Rank', value: rankName, inline: true }
      )
      .setImage(`attachment://report_${cardId}.png`)
      .setTimestamp();

    const mentionParts = [`<@${user.id}>`];
    if (roleId) mentionParts.push(`<@&${roleId}>`);
    const content = mentionParts.join(' ');

    // Send to correct rarity channel
    await targetChannel.send({
      content,
      embeds: [embed],
      files: [attachment]
    });

    // Final ephemeral confirmation
    if (interaction.replied || interaction.deferred) {
      // already warned about wrong channel
      return;
    }

    return interaction.reply({
      content: `✔ Report submitted in <#${channelId}>.`,
      ephemeral: true
    });
  }
};

