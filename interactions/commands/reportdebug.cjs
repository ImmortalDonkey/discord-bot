// interactions/commands/reportdebug.cjs
const {
  SlashCommandBuilder
} = require("discord.js");

const db = require("../../database.cjs");
const { getRankName } = require("../../utils/rankSystem.cjs");
const { getRarity, getRarityDisplayLabel } = require("../../utils/rarity.cjs");
const { calculateAwardedPoints } = require("../../utils/scoring.cjs");
const { checkReportAllowed } = require("../../utils/reportLimiter.cjs");

const { createReportCard } = require("../../renderers/reportCard.cjs");

const STAFF_ROLES = process.env.STAFF_ROLES?.split(",") || [];
const DEBUG_CHANNEL_ID = process.env.REPORT_CARD_CHANNEL_ID;

module.exports = {
  data: new SlashCommandBuilder()
    .setName("reportdebug")
    .setDescription("Staff-only: test the /report card renderer")
    .addStringOption(o =>
      o.setName("pokemon")
        .setDescription("Pokémon name")
        .setRequired(true)
        .setAutocomplete(true)
    )
    .addStringOption(o =>
      o.setName("route")
        .setDescription("Route / Location name")
        .setRequired(true)
        .setAutocomplete(true)
    ),

  async execute(client, interaction) {
    const user = interaction.user;

    // ----------------------
    //  STAFF CHECK
    // ----------------------
    if (!interaction.member.roles.cache.some(r => STAFF_ROLES.includes(r.id))) {
      return interaction.reply({
        content: "❌ You do not have permission to use this command.",
        ephemeral: true
      });
    }

    await interaction.reply({
      content: "🛠 Rendering preview card…",
      ephemeral: true
    });

    // ----------------------
    //  INPUTS
    // ----------------------
    const pokemon = interaction.options.getString("pokemon");
    const route = interaction.options.getString("route");
    const now = new Date();

    // ----------------------
    //  RARITY LOGIC
    // ----------------------
    const rarityKey = getRarity(pokemon);
    const rarityLabel = getRarityDisplayLabel(rarityKey);

    // ----------------------
    //  EXPIRY TIME
    // ----------------------
    const expiry = new Date(now);
    expiry.setMinutes(59, 59, 999);

    // ----------------------
    //  POINTS
    // ----------------------
    const awarded = calculateAwardedPoints(rarityKey, now);
    const updated = await db.addPoints(
      user.id,
      user.username,
      awarded,
      `Debug Report: ${pokemon}`
    );

    const lifetime = updated?.lifetime_points ?? 0;
    const trainerRank = getRankName(lifetime);

    // ----------------------
    //  TIMING BAND TEXT
    // ----------------------
    const m = now.getMinutes();
    let timingText = "";

    if (m < 30) timingText = "100% award (full points)";
    else if (m < 40) timingText = "75% award";
    else if (m < 50) timingText = "50% award";
    else timingText = "10% minimum award";

    // ----------------------
    //  SPRITE NAME
    // ----------------------
    const spriteName = `${pokemon.toLowerCase().replace(/ /g, "-")}.png`;

    // ----------------------
    //  CREATE TEST CARD
    // ----------------------
    const cardPath = await createReportCard({
      trainerName: user.username,
      trainerRank,
      pokemonName: pokemon,
      rarity: rarityLabel,
      points: awarded,
      location: route,
      spriteName,
      expired: false // always false for debug mode
    });

    // ----------------------
    //  DEBUG OUTPUT CHANNEL
    // ----------------------
    const debugChannel = client.channels.cache.get(DEBUG_CHANNEL_ID);

    if (!debugChannel) {
      return interaction.followUp({
        content: `❌ Cannot find debug channel <#${DEBUG_CHANNEL_ID}>.`,
        ephemeral: true
      });
    }

    await debugChannel.send({
      content:
        `🛠 **DEBUG REPORT CARD**\n` +
        `Trainer: ${user.username}\n` +
        `Pokémon: ${pokemon}\n` +
        `Route: ${route}\n` +
        `Rarity: ${rarityLabel}\n` +
        `Points: ${awarded}\n` +
        `Timing: ${timingText}`,
      files: [cardPath]
    });

    return interaction.followUp({
      content: "✅ Debug card posted!",
      ephemeral: true
    });
  }
};
