// interactions/commands/clearall.cjs
const { PermissionFlagsBits } = require("discord.js");

module.exports = {
  name: "clearall",

  async execute(client, interaction) {
    // Admin only
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({
        content: "❌ Admins only.",
        ephemeral: true
      });
    }

    const playerLocations = client.playerLocations;
    playerLocations.clear();

    return interaction.reply("🧹 All locations cleared.");
  }
};
