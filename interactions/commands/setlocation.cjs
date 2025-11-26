// interactions/commands/setlocation.cjs
const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("setlocation")
    .setDescription("Set your current hunting location")
    .addStringOption(o =>
      o.setName("location")
        .setDescription("Your current route / area")
        .setRequired(true)
        .setAutocomplete(true)
    ),

  async execute(client, interaction) {
    const user = interaction.user;
    const loc = interaction.options.getString("location");

    // Ensure structure exists
    if (!client.playerLocations) client.playerLocations = new Map();
    const playerLocations = client.playerLocations;

    // Save location
    playerLocations.set(user.id, {
      location: loc,
      timestamp: new Date(),
      username: user.username
    });

    // Respond
    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor("Green")
          .setTitle("📍 Location Updated")
          .setDescription(`Your location is now **${loc}**`)
      ],
      ephemeral: true
    });
  }
};
