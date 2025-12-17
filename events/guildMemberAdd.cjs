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
  const newArrival = guild.roles.cache.get(process.env.ROLE_NEW_ARRIVAL);
  if (newArrival) {
    await member.roles.add(newArrival).catch(err =>
      console.error('❌ Failed to add New Arrival:', err)
    );
  }

  // Send Yes / No onboarding
  const channel = guild.channels.cache.get(process.env.CHANNEL_START_HERE);
  if (!channel) return;

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

