// interactions/buttons/bountyButtons.cjs
const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  ids: [
    'approvebounty_',
    'denybounty_'
  ],

  async execute(client, interaction) {
    const pendingBounties = client.pendingBounties || global.pendingBounties;
    const activeBounties = client.activeBounties || global.activeBounties;

    const isApprove = interaction.customId.startsWith('approvebounty_');
    const prefix = isApprove ? 'approvebounty_' : 'denybounty_';
    const bountyId = interaction.customId.substring(prefix.length);

    const bounty = pendingBounties.get(bountyId);
    if (!bounty) {
      return interaction.reply({ content: '❌ Bounty not found or already processed.', ephemeral: true });
    }

    // STAFF PERMISSION CHECK
    const staffRolesEnv = process.env.STAFF_ROLES || '';
    const staffRoles = staffRolesEnv.split(',').map(r => r.trim()).filter(Boolean);
    const memberRoleIds = interaction.member.roles.cache.map(r => r.id);
    const isStaff = staffRoles.some(r => memberRoleIds.includes(r));

    if (!isStaff && !interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({
        content: '❌ You do not have permission to process bounties.',
        ephemeral: true
      });
    }

    // ========================
    // DENY BOUNTY
    // ========================
    if (!isApprove) {
      pendingBounties.delete(bountyId);

      const deniedEmbed = EmbedBuilder.from(interaction.message.embeds[0] || new EmbedBuilder())
        .setColor('Red')
        .setTitle('📝 Bounty Request (Denied)');

      await interaction.message.edit({
        embeds: [deniedEmbed],
        components: []
      });

      return interaction.reply({ content: '❌ Bounty request denied.', ephemeral: true });
    }

    // ========================
    // APPROVE BOUNTY
    // ========================
    pendingBounties.delete(bountyId);
    activeBounties.set(bountyId, {
      ...bounty,
      approved: true,
      approvedBy: interaction.user.id,
      completed: false
    });

    const approvedEmbed = EmbedBuilder.from(interaction.message.embeds[0] || new EmbedBuilder())
      .setColor('Green')
      .setTitle('📝 Bounty Request (Approved)');

    await interaction.message.edit({
      embeds: [approvedEmbed],
      components: []
    });

    return interaction.reply({
      content: '✔ Bounty approved. Announcements scheduled.',
      ephemeral: true
    });
  }
};

