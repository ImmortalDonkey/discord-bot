// handlers/onboardingHandler.cjs
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require("discord.js");

function getChannel(guild, id) {
  if (!id) return null;
  return guild.channels.cache.get(id) || null;
}

async function safeAddRole(member, roleId) {
  if (!roleId) return;
  try {
    await member.roles.add(roleId);
  } catch (e) {
    console.error("❌ Onboarding: failed to add role", roleId, e?.message || e);
  }
}

async function safeRemoveRole(member, roleId) {
  if (!roleId) return;
  try {
    await member.roles.remove(roleId);
  } catch (e) {
    console.error("❌ Onboarding: failed to remove role", roleId, e?.message || e);
  }
}

async function sendInitialOnboarding(member) {
  const guild = member.guild;
  const startChannel = getChannel(guild, process.env.CHANNEL_START_HERE);

  if (!startChannel) {
    console.error("❌ Onboarding: CHANNEL_START_HERE not found/invalid.");
    return;
  }

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("onboard_yes")
      .setLabel("Yes")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId("onboard_no")
      .setLabel("No")
      .setStyle(ButtonStyle.Secondary)
  );

  await startChannel.send({
    content:
`👋 Welcome ${member}!

Do you play **Pokémon Vortex**?`,
    components: [row]
  });
}

async function handleOnboardYes(interaction) {
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("interest_roamermonth")
      .setLabel("Roamer of the Month")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("interest_paradox")
      .setLabel("Paradox")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("interest_legendary")
      .setLabel("Legendary & Rare")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("interest_common")
      .setLabel("Common")
      .setStyle(ButtonStyle.Primary)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("interest_more")
      .setLabel("More info")
      .setStyle(ButtonStyle.Secondary)
  );

  await interaction.reply({
    ephemeral: true,
    content:
`🎮 **Welcome!**

This server is for **roaming Pokémon callouts**, **bounties**, and **rare sightings**.

Select what you want to be notified of:`,
    components: [row1, row2]
  });
}

async function handleOnboardNo(interaction) {
  const member = interaction.member;

  await safeAddRole(member, process.env.ROLE_GUEST);
  await safeRemoveRole(member, process.env.ROLE_NEW_ARRIVAL);

  await interaction.reply({
    ephemeral: true,
    content: "✅ No worries — you’ve been set as a **Guest**."
  });
}

async function handleMoreInfo(interaction) {
  await interaction.reply({
    ephemeral: true,
    content:
`**What these mean:**
• **Roamer of the Month** – special monthly roamers  
• **Paradox** – high-tier paradox roamers  
• **Legendary & Rare** – legendaries + rare roamers  
• **Common** – common roamers (still useful for points / tracking)

Pick one (or we can add multi-select next).`
  });
}

async function handleInterest(interaction, roleEnvKey) {
  const member = interaction.member;
  const guild = interaction.guild;

  const tutorial = getChannel(guild, process.env.CHANNEL_TUTORIAL);

  // Core roles
  await safeAddRole(member, process.env.ROLE_TRAINER);
  await safeRemoveRole(member, process.env.ROLE_NEW_ARRIVAL);

  // Interest role
  await safeAddRole(member, process.env[roleEnvKey]);

  await interaction.reply({
    ephemeral: true,
    content: `✅ You’re all set! Head to ${tutorial ? `<#${tutorial.id}>` : "**#tutorial**"} to get started.`
  });
}

module.exports = {
  sendInitialOnboarding,
  handleOnboardYes,
  handleOnboardNo,
  handleMoreInfo,
  handleInterest
};