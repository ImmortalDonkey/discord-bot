const { EmbedBuilder } = require("discord.js");

module.exports = {
  name: "setlocation",

  async execute(client, interaction) {
    const loc = interaction.options.getString("location");
    const user = interaction.user;

    // Shared global map
    const playerLocations = client.playerLocations;

    playerLocations.set(user.id, {
      location: loc,
      timestamp: new Date(),
      username: user.username
    });

    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor("Green")
          .setTitle("📍 Location Updated")
          .setDescription(`Your location is now **${loc}**`)
      ],
      ephemeral: true   // <-- restored privacy
    });
  }
};
