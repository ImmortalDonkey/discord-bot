// interactions/commands/whereis.cjs
const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("whereis")
    .setDescription("Check another player's current location")
    .addUserOption(opt =>
      opt.setName("user")
        .setDescription("The user to check")
        .setRequired(true)
    ),

  async execute(client, interaction) {
    const target = interaction.options.getUser("user");

    // Ensure structure exists
    if (!client.playerLocations) client.playerLocations = new Map();
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
          .setTitle(`📍 ${target.username}'s Location`)
          .addFields(
            { name: "Location", value: data.location, inline: true },
            {
              name: "Updated",
              value: data.timestamp.toLocaleString(),
              inline: true
            }
          )
      ]
    });
  }
};
