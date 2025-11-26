// interactions/commands/cancelreport.cjs

module.exports = {
  name: 'cancelreport',

  async execute(client, interaction) {
    if (!client.pendingReports) {
      client.pendingReports = new Map();
    }
    const pendingReports = client.pendingReports;

    const userId = interaction.user.id;

    if (!pendingReports.has(userId)) {
      return interaction.reply({
        content: '❌ No report to cancel.',
        ephemeral: true
      });
    }

    pendingReports.delete(userId);

    return interaction.reply({
      content: '🛑 Report cancelled.',
      ephemeral: true
    });
  }
};

