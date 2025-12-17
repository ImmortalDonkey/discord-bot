const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');

module.exports = async (client, member) => {
  // DEV ONLY
  if (process.env.NODE_ENV !== 'dev') return;

  console.log(`👤 New member joined (DEV): ${member.user.tag}`);

  const guild = member.guild;

  // Assign New Arrival
  const newArrivalId = process.env.ROLE_NEW_ARRIVAL;
  if (newArrivalId) {
    await member.roles.add(newArrivalId).catch(err =>
      console.error('❌ Failed to add New Arrival:', err)
    );
  }

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