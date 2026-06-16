'use strict';

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ChannelType
} = require('discord.js');

const db = require('../database.cjs');

module.exports = async (client, member) => {
  const { guild, id: discordId } = member;

  const config = await db.getOnboardingConfig(guild.id).catch(() => null);
  if (!config?.onboarding_channel_id) return;

  const channel = await client.channels.fetch(config.onboarding_channel_id).catch(() => null);
  if (!channel) {
    console.warn(`[onboarding] channel not found: ${config.onboarding_channel_id}`);
    return;
  }

  let thread;
  try {
    thread = await channel.threads.create({
      name: `Welcome — ${member.user.username}`,
      type: ChannelType.PrivateThread,
      invitable: false
    });
    await thread.members.add(discordId);
  } catch (err) {
    console.error(`[onboarding] failed to create thread for ${member.user.tag}:`, err);
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle('Welcome to the Roamers Union!')
    .setDescription(
      `Hey ${member}! Do you play **Pokémon Vortex**?\n\n` +
      'This helps us set up your notifications and verify your account.'
    )
    .setColor(0xf59e0b);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('onboard_yes')
      .setLabel('I play Vortex!')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('onboard_no')
      .setLabel('Just browsing')
      .setStyle(ButtonStyle.Secondary)
  );

  await thread.send({ embeds: [embed], components: [row] });

  await db.upsertOnboardingSession({
    discordId,
    guildId: guild.id,
    threadId: thread.id,
    step: 'welcome',
    selectionsJson: '{}',
    startedAt: Date.now(),
    completed: 0
  });

  await db.touchPlayerGuild(discordId, guild.id).catch(() => {});

  console.log(`[onboarding] started for ${member.user.tag} — thread ${thread.id}`);
};
