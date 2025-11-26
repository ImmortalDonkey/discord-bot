// interactions/buttons/reportButtons.cjs
module.exports = {
  ids: [
    // Add future report button prefixes here
  ],

  async execute(client, interaction) {
    return interaction.reply({
      content: "❌ No report button actions are currently implemented.",
      ephemeral: true
    });
  }
};

