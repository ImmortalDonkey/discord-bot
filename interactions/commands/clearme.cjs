// interactions/commands/clearme.cjs
const { EmbedBuilder } = require("discord.js");

module.exports = {
  name: "clearme",

  async execute(client, interaction) {
    const userId = interaction.user.id;

    // Ensure maps exist
    if (!client.playerLocations) client.playerLocations = new Map();
    if (!client.pendingReports) client.pendingReports = new Map();

    const hadLocation = client.playerLocations.has(userId);
    const hadReport = client.pendingReports.has(userId);

    client.playerLocations.delete(userId);
    client.pendingReports.delete(userId);

    const embed = new EmbedBuilder()
      .setColor("DarkButNotBlack")
      .setTitle("🧹 Marked Inactive")
      .setDescription("You have been marked inactive and removed from:")
      .addFields(
        { name: "• Location Tracking", value: hadLocation ? "Removed" : "Not Set", inline: true },
        { name: "• Active Sightings", value: hadReport ? "Removed" : "None Reported", inline: true }
      )
      .setTimestamp();

    return interaction.reply({
      embeds: [embed],
      ephemeral: true
    });
  }
};
