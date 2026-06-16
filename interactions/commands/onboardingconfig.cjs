'use strict';

const {
  SlashCommandBuilder,
  ChannelType,
  PermissionFlagsBits,
  EmbedBuilder
} = require('discord.js');
const db = require('../../database.cjs');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('onboardingconfig')
    .setDescription('Configure the onboarding system for new members')
    .addChannelOption(opt =>
      opt.setName('channel')
        .setDescription('Channel where onboarding threads are created (must support threads)')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(false)
    )
    .addChannelOption(opt =>
      opt.setName('roles-channel')
        .setDescription('Your #roles channel (linked in completion message)')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(false)
    )
    .addChannelOption(opt =>
      opt.setName('rules-channel')
        .setDescription('Your #rules channel (linked for guests)')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(false)
    )
    .addRoleOption(opt =>
      opt.setName('guest-role')
        .setDescription('Role assigned to non-players (Just browsing)')
        .setRequired(false)
    )
    .addRoleOption(opt =>
      opt.setName('player-role')
        .setDescription('Role assigned after completing onboarding')
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(client, interaction) {
    await interaction.deferReply({ flags: 64 });

    const channel      = interaction.options.getChannel('channel');
    const rolesChannel = interaction.options.getChannel('roles-channel');
    const rulesChannel = interaction.options.getChannel('rules-channel');
    const guestRole    = interaction.options.getRole('guest-role');
    const playerRole   = interaction.options.getRole('player-role');

    const hasOptions = channel || rolesChannel || rulesChannel || guestRole || playerRole;

    if (!hasOptions) {
      // Show current config
      const cfg = await db.getOnboardingConfig(interaction.guild.id);
      if (!cfg) {
        return interaction.editReply('No onboarding config set yet. Use the options to configure.');
      }

      const embed = new EmbedBuilder()
        .setTitle('Onboarding Config')
        .setColor(0x6366f1)
        .addFields(
          { name: 'Onboarding channel', value: cfg.onboarding_channel_id ? `<#${cfg.onboarding_channel_id}>` : 'Not set', inline: true },
          { name: 'Roles channel',      value: cfg.roles_channel_id       ? `<#${cfg.roles_channel_id}>`       : 'Not set', inline: true },
          { name: 'Rules channel',      value: cfg.rules_channel_id       ? `<#${cfg.rules_channel_id}>`       : 'Not set', inline: true },
          { name: 'Guest role',         value: cfg.guest_role_id          ? `<@&${cfg.guest_role_id}>`         : 'Not set', inline: true },
          { name: 'Player role',        value: cfg.player_role_id         ? `<@&${cfg.player_role_id}>`        : 'Not set', inline: true }
        );

      return interaction.editReply({ embeds: [embed] });
    }

    await db.upsertOnboardingConfig({
      guildId:             interaction.guild.id,
      onboardingChannelId: channel?.id,
      rolesChannelId:      rolesChannel?.id,
      rulesChannelId:      rulesChannel?.id,
      guestRoleId:         guestRole?.id,
      playerRoleId:        playerRole?.id
    });

    const lines = [];
    if (channel)      lines.push(`Onboarding channel → <#${channel.id}>`);
    if (rolesChannel) lines.push(`Roles channel → <#${rolesChannel.id}>`);
    if (rulesChannel) lines.push(`Rules channel → <#${rulesChannel.id}>`);
    if (guestRole)    lines.push(`Guest role → <@&${guestRole.id}>`);
    if (playerRole)   lines.push(`Player role → <@&${playerRole.id}>`);

    return interaction.editReply(`✅ Onboarding config updated:\n${lines.join('\n')}`);
  }
};
