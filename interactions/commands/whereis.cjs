const { EmbedBuilder } = require("discord.js");

module.exports = {
  name: "whereis",

  async execute(client, interaction) {
    const target = interaction.options.getUser("user");
    const playerLocations = client.playerLocations;

    const data = playerLocations.get(target.id);

    if (!data) {
      return interaction.reply({
        content: "❌ They haven't set a location.",
        ephemeral: true
      });
    }

    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor("Orange")
          .setTitle(`📍 ${target.username}’s Location`)
          .addFields(
            { name: "Location", value: data.location },
            { name: "Updated", value: data.timestamp.toLocaleString() }
          )
      ]
    });
  }
};

