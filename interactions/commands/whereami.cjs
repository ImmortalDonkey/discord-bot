// interactions/commands/whereami.cjs
const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("whereami")
    .setDescription("See your current hunting location"),

  async execute(client, interaction) {
    const user = interaction.user;

    // Ensure structure exists
    if (!client.playerLocations) client.playerLocations = new Map();
    const playerLocations = client.playerLocations;

    const data = playerLocations.get(user.id);

    if (!data) {
      return interaction.reply({
        content: "❌ You haven't set a location yet.",
        ephemeral: true
      });
    }

    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor("Blue")
          .setTitle("📍 Your Location")
          .addFields(
            { name: "Location", value: data.location, inline: true },
            {
              name: "Updated",
              value: data.timestamp.toLocaleString(),
              inline: true
            }
          )
      ],
      ephemeral: true
    });
  }
};
