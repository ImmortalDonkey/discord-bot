const { EmbedBuilder } = require("discord.js");

module.exports = {
  name: "whereami",

  async execute(client, interaction) {
    const user = interaction.user;
    const playerLocations = client.playerLocations;

    const data = playerLocations.get(user.id);

    if (!data) {
      return interaction.reply({
        content: "❌ You haven't set a location!",
        ephemeral: true
      });
    }

    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor("Blue")
          .setTitle("📍 Your Location")
          .addFields(
            { name: "Location", value: data.location },
            { name: "Updated", value: data.timestamp.toLocaleString() }
          )
      ]
    });
  }
};

