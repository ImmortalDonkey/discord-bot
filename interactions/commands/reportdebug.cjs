// interactions/commands/reportdebug.cjs
const { SlashCommandBuilder } = require("discord.js");

const db = require("../../database.cjs");
const { getRankName } = require("../../utils/rankSystem.cjs");
const { getRarity, getRarityDisplayLabel } = require("../../utils/rarity.cjs");
const { calculateAwardedPoints } = require("../../utils/scoring.cjs");

const { createReportCard } = require("../../renderers/reportCard.cjs");

const STAFF_ROLES = process.env.STAFF_ROLES?.split(",") || [];
const DEBUG_CHANNEL_ID = process.env.REPORT_CARD_CHANNEL_ID;

module.exports = {
  data: new SlashCommandBuilder()
    .setName("reportdebug")
    .setDescription("Staff-only: test the report card renderer")
    .addStringOption(o =>
      o.setName("pokemon")
        .setDescription("Pokémon name")
        .setRequired(true)
        .setAutocomplete(true)
    )
    .addStringOption(o =>
      o.setName("route")
        .setDescription("Route / Location")
        .setRequired(true)
        .setAutocomplete(true)
    ),

  async execute(client, interaction) {
    const user = interaction.user;

    // Staff-only gate
    if (!interaction.member.roles.cache.some(r => STAFF_ROLES.includes(r.id))) {
      return interaction.reply({
        content: "❌ You do not have permission to use this command.",
        ephemeral: true
      });
    }

    await interaction.reply({
      content: "🛠 Rendering preview report card…",
      ephemeral: true
    });

    // Fetch correct nickname (same as bounty cards)
    let trainerName = user.username;
    try {
      const gm = await interaction.guild.members.fetch(user.id);
      trainerName = gm.nickname || user.username;
    } catch {
      trainerName = user.username;
    }

    const pokemon = interaction.options.getString("pokemon");
    const route = interaction.options.getString("route");

    const now = new Date();

    // Rarity
    const rarityKey = getRarity(pokemon);
    const rarityLabel = getRarityDisplayLabel(rarityKey);

    // Points
    const awarded = calculateAwardedPoints(rarityKey, now);
    const updated = await db.addPoints(
      user.id,
      user.username,
      awarded,
      `Debug Report: ${pokemon}`
    );

    const lifetime = updated?.lifetime_points ?? 0;
    const trainerRank = getRankName(lifetime);

    // Create card
    const cardPath = await createReportCard({
      trainerName,
      trainerRank,
      pokemonName: pokemon,
      rarityKey,
      rarityLabel,
      points: awarded,
      location: route,
      expired: false,
      availabilityText: "Available until end of the hour"
    });

    const debugChannel = client.channels.cache.get(DEBUG_CHANNEL_ID);
    if (!debugChannel) {
      return interaction.followUp({
        content: `❌ Cannot find debug channel <#${DEBUG_CHANNEL_ID}>.`,
        ephemeral: true
      });
    }

    await debugChannel.send({
      content: `🛠 **DEBUG REPORT CARD**\nTrainer: ${trainerName}`,
      files: [cardPath]
    });

    return interaction.followUp({
      content: "✅ Debug card posted!",
      ephemeral: true
    });
  }
};
