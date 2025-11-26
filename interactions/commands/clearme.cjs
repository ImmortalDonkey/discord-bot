// interactions/commands/clearme.cjs

module.exports = {
  name: "clearme",

  async execute(client, interaction) {
    const user = interaction.user;
    const playerLocations = client.playerLocations;

    playerLocations.delete(user.id);

    return interaction.reply({
      content: "🧹 You were marked inactive.",
      ephemeral: true
    });
  }
};

