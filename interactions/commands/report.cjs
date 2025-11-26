// interactions/commands/report.cjs
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

const db = require('../../database.cjs');
const { getRankName } = require('../../utils/rankSystem.cjs');
const { getRarity, getRarityDisplayLabel } = require('../../utils/rarity.cjs');
const { calculateAwardedPoints } = require('../../utils/scoring.cjs');
const { checkReportAllowed } = require('../../utils/reportLimiter.cjs');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('report')
    .setDescription('Report a wild Pokémon sighting')
    .addStringOption(o =>
      o.setName('pokemon')
        .setDescription('Pokémon name')
        .setRequired(true)
        .setAutocomplete(true)
    )
    .addStringOption(o =>
      o.setName('route')
        .setDescription('Route / Location name')
        .setRequired(true)
        .setAutocomplete(true)
    ),

  async execute(client, interaction) {
    const user = interaction.user;
    const guild = interaction.guild;

    // Ensure structure exists
    if (!client.pendingReports) client.pendingReports = new Map();
    const pendingReports = client.pendingReports;

    const pokemon = interaction.options.getString('pokemon');
    const route = interaction.options.getString('route');

    // ------------------------------
    // 1. RARITY DETECTION
    // ------------------------------
    const rarityKey = getRarity(pokemon);
    const rarityLabel = getRarityDisplayLabel(rarityKey);

    // ------------------------------
    // 2. PER-HOUR LIMIT
    // ------------------------------
    const now = new Date();
    const allow = checkReportAllowed(pokemon, now);

    if (!allow.allowed) {
      return interaction.reply({
        content: `❌ **${pokemon}** has already been reported this hour.\nYou can report again ${allow.nextResetLabel}.`,
        ephemeral: true
      });
    }

    // ------------------------------
    // 3. CHANNEL + ROLE
    // ------------------------------
    const key = rarityKey.toUpperCase();
    const roleId = process.env[`ROLE_${key}`] || null;
    const channelId = process.env[`CHANNEL_${key}`];

    if (!channelId) {
      return interaction.reply({
        content: `❌ No channel is configured for rarity **${rarityLabel}**. Admin must set \`CHANNEL_${key}\`.`,
        ephemeral: true
      });
    }

    const targetChannel = await guild.channels.fetch(channelId).catch(() => null);
    if (!targetChannel) {
      return interaction.reply({
        content: `❌ Cannot find <#${channelId}>. Check your environment variables.`,
        ephemeral: true
      });
    }

    // ------------------------------
    // 4. SAVE PENDING REPORT
    // ------------------------------
    pendingReports.set(user.id, {
      pokemon,
      route,
      createdAt: now
    });

    // ------------------------------
    // 5. WRONG CHANNEL WARN
    // ------------------------------
    if (interaction.channel.id !== channelId) {
      await interaction.reply({
        content: `⚠ Wrong channel! Your report will be posted in <#${channelId}>.`,
        ephemeral: true
      });
      setTimeout(() => interaction.deleteReply().catch(() => {}), 10000);
    }

    // ------------------------------
    // 6. END OF HOUR
    // ------------------------------
    const expiry = new Date(now);
    expiry.setMinutes(59, 59, 999);

    const expiryStr = expiry.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit'
    });

    // ------------------------------
    // 7. POINTS
    // ------------------------------
    const awarded = calculateAwardedPoints(rarityKey, now);

    const updated = await db.addPoints(
      user.id,
      user.username,
      awarded,
      `Report: ${pokemon}`
    );

    const lifetime = updated?.lifetime_points ?? 0;
    const rankName = getRankName(lifetime);

    // ------------------------------
    // 8. TIMING BAND
    // ------------------------------
    const m = now.getMinutes();
    let timingText = '';

    if (m < 30) timingText = '100% award (full points)';
    else if (m < 40) timingText = '75% award';
    else if (m < 50) timingText = '50% award';
    else timingText = '10% minimum award';

    // ------------------------------
    // 9. EMBED (NO IMAGE)
    // ------------------------------
    const embed = new EmbedBuilder()
      .setColor('Random')
      .setTitle(`🐾 Wild ${pokemon} spotted!`)
      .setDescription(
        `**${user.username}** has spotted a wild **${pokemon}**!\n\n` +
        `📍 **Location:** ${route}\n` +
        `⏳ **Available until:** ${expiryStr}`
      )
      .addFields(
        { name: '📊 Rarity', value: rarityLabel, inline: true },
        { name: '⏱ Timing Band', value: timingText, inline: true },
        { name: '🏆 Points Awarded', value: String(awarded), inline: true },
        { name: '🎖 Trainer Rank', value: rankName, inline: true }
      )
      .setTimestamp();

    // Mentions: user + rarity role:
    const mentions = [`<@${user.id}>`];
    if (roleId) mentions.push(`<@&${roleId}>`);

    // ------------------------------
    // 10. SEND TO RARITY CHANNEL
    // ------------------------------
    await targetChannel.send({
      content: mentions.join(' '),
      embeds: [embed]
    });

    // ------------------------------
    // 11. CONFIRMATION
    // ------------------------------
    if (!interaction.replied && !interaction.deferred) {
      return interaction.reply({
        content: `✔ Report posted in <#${channelId}>.`,
        ephemeral: true
      });
    }
  }
};
