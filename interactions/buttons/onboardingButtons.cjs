const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');

// Utility helpers
function getRole(guild, id) {
  return guild.roles.cache.get(id) || null;
}

function getChannel(guild, id) {
  return guild.channels.cache.get(id) || null;
}

module.exports = {
  ids: [
    'onboard_yes',
    'onboard_no',
    'interest_paradox',
    'interest_roamer',
    'interest_legendary',
    'interest_common'
  ],

  async execute(client, interaction) {
    const { guild, member, customId } = interaction;

    // DEV SAFETY (extra guard)
    if (process.env.ENV !== 'dev') {
      return interaction.reply({
        content: '⚠ Onboarding is disabled.',
        ephemeral: true
      });
    }

    // ─────────────────────────────
    // YES – plays Pokémon Vortex
    // ─────────────────────────────
    if (customId === 'onboard_yes') {
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('interest_paradox')
          .setLabel('Paradox')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('interest_roamer')
          .setLabel('Roamer of the Month')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('interest_legendary')
          .setLabel('Legendary & Rare')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('interest_common')
          .setLabel('Common')
          .setStyle(ButtonStyle.Secondary)
      );

      return interaction.reply({
        content:
`🎮 **Welcome Trainer!**

This server tracks roaming Pokémon, rare sightings, and bounties.

Choose what you want notifications for:`,
        components: [row],
        ephemeral: true
      });
    }

    // ─────────────────────────────
    // NO – does not play Vortex
    // ─────────────────────────────
    if (customId === 'onboard_no') {
      const guest = getRole(guild, process.env.ROLE_GUEST);
      const newArrival = getRole(guild, process.env.ROLE_NEW_ARRIVAL);

      if (guest) await member.roles.add(guest);
      if (newArrival) await member.roles.remove(newArrival);

      return interaction.reply({
        content: '👋 You’ve been added as a **Guest**.',
        ephemeral: true
      });
    }

    // ─────────────────────────────
    // INTEREST SELECTION
    // ─────────────────────────────
    const interestMap = {
      interest_paradox: process.env.ROLE_PARADOX,
      interest_roamer: process.env.ROLE_ROAMERMONTH,
      interest_legendary: process.env.ROLE_LEGENDARY,
      interest_common: process.env.ROLE_COMMON
    };

    if (interestMap[customId]) {
      const trainer = getRole(guild, process.env.ROLE_TRAINER);
      const newArrival = getRole(guild, process.env.ROLE_NEW_ARRIVAL);
      const interestRole = getRole(guild, interestMap[customId]);
      const tutorial = getChannel(guild, process.env.CHANNEL_TUTORIAL);

      if (trainer) await member.roles.add(trainer);
      if (interestRole) await member.roles.add(interestRole);
      if (newArrival) await member.roles.remove(newArrival);

      return interaction.reply({
        content: `✅ You’re all set! Head to ${tutorial} to get started.`,
        ephemeral: true
      });
    }
  }
};