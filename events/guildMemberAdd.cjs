const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');

module.exports = async (client, member) => {
  // DEV ONLY SAFETY
  if (process.env.NODE_ENV !== 'dev') return;

  console.log(`👤 New member joined (DEV): ${member.user.tag}`);

  const guild = member.guild;

  // Assign New Arrival role
  const newArrival = guild.roles.cache.get(process.env.ROLE_NEW_ARRIVAL);
  if (newArrival) {
    await member.roles.add(newArrival).catch(err => {
      console.error('❌ Failed to assign New Arrival role:', err);
    });
  } else {
    console.warn('⚠ ROLE_NEW_ARRIVAL not found');
  }

  // Send onboarding message
  const channel = guild.channels.cache.get(process.env.CHANNEL_START_HERE);
  if (!channel) {
    console.warn('⚠ CHANNEL_START_HERE not found');
    return;
  }

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('onboard_yes')
      .setLabel('Yes')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('onboard_no')
      .setLabel('No')
      .setStyle(ButtonStyle.Secondary)
  );

  await channel.send({
    content: `👋 Welcome ${member}!

Do you play **Pokémon Vortex**?`,
    components: [row]
  });
};
