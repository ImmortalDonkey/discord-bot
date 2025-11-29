// interactions/commands/bountyrequest.cjs
const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');

const {
  getHighestRarityForList,
  getRarityDisplayLabel
} = require('../../utils/rarity.cjs');

const {
  clampHours,
  parseHourFromStartTimeString,
  getNextOccurrenceOfHour
} = require('../../utils/timeUtils.cjs');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('bountyrequest')
    .setDescription('Submit a new bounty request')

    .addStringOption(o =>
      o.setName('pokemon1')
        .setDescription('Main Pokémon')
        .setAutocomplete(true)
        .setRequired(true)
    )

    .addStringOption(o =>
      o.setName('starttime')
        .setDescription('Start time (or Start Now)')
        .setRequired(true)
        .addChoices(
          { name: 'Start Now', value: 'now' },
          ...Array.from({ length: 24 }, (_, h) => ({
            name: `${String(h).padStart(2, '0')}:00`,
            value: `${String(h).padStart(2, '0')}:00`
          }))
        )
    )

    .addIntegerOption(o =>
      o.setName('duration')
        .setDescription('How long the bounty runs for')
        .setRequired(true)
        .addChoices(
          { name: '1 hour', value: 1 },
          { name: '2 hours', value: 2 },
          { name: '3 hours', value: 3 },
          { name: '4 hours', value: 4 },
          { name: '5 hours', value: 5 },
          { name: '6 hours', value: 6 },
          { name: '12 hours', value: 12 },
          { name: '24 hours', value: 24 },
          { name: '48 hours', value: 48 },
          { name: '72 hours', value: 72 }
        )
    )

    .addIntegerOption(o =>
      o.setName('reward')
        .setDescription('Reward amount (pkd)')
        .setRequired(true)
    )

    .addStringOption(o =>
      o.setName('notes')
        .setDescription('Required note/message')
        .setRequired(true)
    )

    .addStringOption(o =>
      o.setName('pokemon2')
        .setDescription('Optional second Pokémon')
        .setAutocomplete(true)
    )

    .addStringOption(o =>
      o.setName('pokemon3')
        .setDescription('Optional third Pokémon')
        .setAutocomplete(true)
    ),

  async execute(client, interaction) {
    const member = interaction.member;

    // Role check
    const bountyRoleId = process.env.ROLE_BOUNTY_HUNTER || null;
    let hasRole = false;

    if (bountyRoleId) {
      hasRole = member.roles.cache.has(bountyRoleId);
    } else {
      hasRole = member.roles.cache.some(r =>
        r.name === 'Bounty Hunter' || r.name === 'Roaming Bounty Hunter'
      );
    }

    if (!hasRole) {
      return interaction.reply({
        content: '🚫 You do not have permission to request bounties.',
        ephemeral: true
      });
    }

    // Options
    const p1 = interaction.options.getString('pokemon1');
    const p2 = interaction.options.getString('pokemon2');
    const p3 = interaction.options.getString('pokemon3');
    const notes = interaction.options.getString('notes');
    const startTimeStr = interaction.options.getString('starttime');
    const durationHoursRaw = interaction.options.getInteger('duration');
    const reward = interaction.options.getInteger('reward');

    const pokemons = [p1, p2, p3].filter(Boolean);

    const durationHours = clampHours(durationHoursRaw);
    const durationMs = durationHours * 3600000;

    // Start/end time
    let startTime;
    if (startTimeStr === 'now') {
      startTime = new Date();
    } else {
      const hour = parseHourFromStartTimeString(startTimeStr);
      startTime = getNextOccurrenceOfHour(hour);
    }

    const endTime = new Date(startTime.getTime() + durationMs);
    const bountyId = `${Date.now()}_${interaction.user.id}`;

    const bounty = {
      id: bountyId,
      requesterId: interaction.user.id,
      requesterName: interaction.user.username,
      pokemons,
      notes,
      startTime,
      endTime,
      durationHours,
      reward,
      createdAt: new Date(),
      startsNow: startTimeStr === 'now'
    };

    // Store in pending
    if (!client.pendingBounties) client.pendingBounties = new Map();
    client.pendingBounties.set(bountyId, bounty);

    // Channel to send staff review embed
    const requestChannelId = process.env.BOUNTY_REQUEST_CHANNEL_ID;
    const requestChannel = requestChannelId
      ? await interaction.guild.channels.fetch(requestChannelId).catch(() => null)
      : null;

    if (!requestChannel) {
      return interaction.reply({
        content: '❌ Bounty request channel not configured.',
        ephemeral: true
      });
    }

    // Staff ping
    const staffRolesEnv = process.env.STAFF_ROLES || '';
    const staffMention = staffRolesEnv
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
      .map(id => `<@&${id}>`)
      .join(' ');

    // Rarity
    const rarityKey = getHighestRarityForList(pokemons);
    const rarityLabel = getRarityDisplayLabel(rarityKey);

    const pokemonListLines = pokemons.map(p => `• ${p}`).join('\n');
    const startUnix = Math.floor(startTime.getTime() / 1000);
    const endUnix = Math.floor(endTime.getTime() / 1000);

    const startFieldValue =
      startTimeStr === 'now'
        ? `<t:${startUnix}:F> (Starts on approval)`
        : `<t:${startUnix}:F>`;

    const embed = new EmbedBuilder()
      .setTitle('📝 New Bounty Request')
      .setDescription('A new bounty has been requested and is awaiting staff approval.')
      .addFields(
        { name: 'Trainer', value: `<@${interaction.user.id}>`, inline: true },
        { name: 'Rarity', value: rarityLabel, inline: true },
        { name: 'Reward', value: `${reward.toLocaleString()} PKD`, inline: false },
        { name: 'Pokémon Targets', value: pokemonListLines || '—', inline: false },
        { name: 'Requested Start', value: startFieldValue, inline: false },
        { name: 'Requested End', value: `<t:${endUnix}:F>`, inline: false },
        { name: 'Duration', value: `${durationHours} hour(s)`, inline: true },
        { name: 'Note', value: notes, inline: false }
      )
      .setFooter({ text: `Bounty ID: ${bountyId}` })
      .setTimestamp();

    const buttons = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`approvebounty_${bountyId}`)
        .setLabel('Approve')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`denybounty_${bountyId}`)
        .setLabel('Deny')
        .setStyle(ButtonStyle.Danger)
    );

    await requestChannel.send({
      content: staffMention || '',
      embeds: [embed],
      components: [buttons]
    });

    return interaction.reply({
      content: '✅ Bounty request submitted. Staff have been notified.',
      ephemeral: true
    });
  }
};