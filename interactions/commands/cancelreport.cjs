// interactions/commands/cancelreport.cjs

module.exports = {
  name: 'cancelreport',

  async execute(client, interaction) {
    // Ensure pendingReports map exists
    if (!client.pendingReports) {
      client.pendingReports = new Map();
    }

    const pendingReports = client.pendingReports;
    const userId = interaction.user.id;

    const entry = pendingReports.get(userId);

    // Nothing to cancel
    if (!entry) {
      return interaction.reply({
        content: '❌ You have no active report to cancel.',
        ephemeral: true
      });
    }

    // Remove the pending report
    pendingReports.delete(userId);

    return interaction.reply({
      content: `🛑 Your report for **${entry.pokemon}** on **${entry.route}** has been cancelled.`,
      ephemeral: true
    });
  }
};
