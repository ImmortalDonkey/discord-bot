// interactions/commands/activebounties.cjs
module.exports = {
  name: "activebounties",

  async execute(client, interaction) {
    return interaction.reply({
      content: "📝 Active bounties will be added soon.",
      ephemeral: true
    });
  }
};

