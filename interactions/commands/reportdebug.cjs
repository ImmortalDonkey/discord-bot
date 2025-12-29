// interactions/commands/reportdebug.cjs
// ======================================================
// DEBUG REPORT COMMAND
// ======================================================

const {
  SlashCommandBuilder,
  AttachmentBuilder
} = require("discord.js");

const db = require("../../database.cjs");
const { createReportCard } = require("../../renderers/reportCard.debug.cjs");

// ------------------------------------------------------
// HELPERS
// ------------------------------------------------------

function getGuildNickname(member) {
  return (
    member?.nickname ||
    member?.displayName ||
    member?.user?.username ||
    "Unknown Trainer"
  );
}

function routeUsesOn(route) {
  return /\d+$/.test(String(route || "").trim());
}

// ------------------------------------------------------
// COMMAND DEFINITION
// ------------------------------------------------------

module.exports = {
  data: new SlashCommandBuilder()
    .setName("reportdebug")
    .setDescription("DEBUG: Generate a report card without saving to DB")
    .addStringOption(opt =>
      opt
        .setName("pokemon")
        .setDescription("Pokémon name")
        .setRequired(true)
    )
    .addStringOption(opt =>
      opt
        .setName("route")
        .setDescription("Route / location")
        .setRequired(true)
    )
    .addStringOption(opt =>
      opt
        .setName("ign")
        .setDescription("In-game name (IGN)")
        .setRequired(false)
    )
    .addUserOption(opt =>
      opt
        .setName("id")
        .setDescription("Discord user (encounterer)")
        .setRequired(false)
    ),

  async execute(client, interaction) {
    await interaction.deferReply({ ephemeral: true });

    const pokemonName = interaction.options.getString("pokemon")?.trim();
    const location = interaction.options.getString("route")?.trim();
    const ignInput = interaction.options.getString("ign");
    const userInput = interaction.options.getUser("id");

    // --------------------------------------------------
    // VALIDATION: EXACTLY ONE OF ign OR id
    // --------------------------------------------------
    if ((ignInput && userInput) || (!ignInput && !userInput)) {
      return interaction.editReply({
        content:
          "❌ You must provide **exactly one** of `ign` or `id`."
      });
    }

    const guild = interaction.guild;
    const reporterMember = interaction.member;
    const reporterName = getGuildNickname(reporterMember);

    let reportType = "encounter";
    let encountererName = reporterName;
    let encountererType = "discord";
    let reporterType = "discord";

    // --------------------------------------------------
    // IGN FLOW → SIGHTING
    // --------------------------------------------------
    if (ignInput) {
      const player = await db.getPlayerByIgn(ignInput);

      if (!player) {
        return interaction.editReply({
          content: `❌ No registered player found with IGN **${ignInput}**`
        });
      }

      reportType = "sighting";
      encountererName = player.ign;
      encountererType = "ign";
    }

    // --------------------------------------------------
    // USER ID FLOW → ENCOUNTER
    // --------------------------------------------------
    if (userInput) {
      const member = await guild.members.fetch(userInput.id).catch(() => null);

      if (!member) {
        return interaction.editReply({
          content: "❌ That user is not in this server."
        });
      }

      encountererName = getGuildNickname(member);
      encountererType = "discord";
    }

    // --------------------------------------------------
    // GRAMMAR
    // --------------------------------------------------
    const prep = routeUsesOn(location) ? "on" : "at";

    // --------------------------------------------------
    // BUILD RENDER PAYLOAD
    // --------------------------------------------------
    const renderPayload = {
      reportType,

      reporterName,
      reporterType,

      encountererName,
      encountererType,

      pokemonName,
      location,

      rarityKey: "common",
      rarityLabel: "Common",

      points: 0,
      trainerRank: "—",

      statusText: "Active"
    };

    // --------------------------------------------------
    // RENDER
    // --------------------------------------------------
    let imagePath;
    try {
      imagePath = await createReportCard(renderPayload);
    } catch (err) {
      console.error("❌ Report debug render failed:", err);
      return interaction.editReply({
        content: "❌ Failed to render report card."
      });
    }

    const attachment = new AttachmentBuilder(imagePath);

    await interaction.editReply({
      content: `🧪 **Debug Report (${reportType})**\nGrammar: **${prep}**`,
      files: [attachment]
    });
  }
};