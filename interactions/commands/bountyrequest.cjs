const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');

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
          { name: '00:00', value: '00:00' },
          { name: '01:00', value: '01:00' },
          { name: '02:00', value: '02:00' },
          { name: '03:00', value: '03:00' },
          { name: '04:00', value: '04:00' },
          { name: '05:00', value: '05:00' },
          { name: '06:00', value: '06:00' },
          { name: '07:00', value: '07:00' },
          { name: '08:00', value: '08:00' },
          { name: '09:00', value: '09:00' },
          { name: '10:00', value: '10:00' },
          { name: '11:00', value: '11:00' },
          { name: '12:00', value: '12:00' },
          { name: '13:00', value: '13:00' },
          { name: '14:00', value: '14:00' },
          { name: '15:00', value: '15:00' },
          { name: '16:00', value: '16:00' },
          { name: '17:00', value: '17:00' },
          { name: '18:00', value: '18:00' },
          { name: '19:00', value: '19:00' },
          { name: '20:00', value: '20:00' },
          { name: '21:00', value: '21:00' },
          { name: '22:00', value: '22:00' },
          { name: '23:00', value: '23:00' }
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

  /**
   * EXECUTE
   *
   * Provided by index.cjs:
   * - pendingBounties
   * - rarityGroups
   * - rarityPriority
   * - getHighestRarityForList
   * - getRarityDisplayLabel
   * - clampHours
   * - parseHourFromStartTimeString
   * - getNextOccurrenceOfHour
   */
  async execute(interaction, ctx) {

    // ctx contains all shared objects FROM index.cjs
    const {
      pendingBounties,
      rarityGroups,
      rarityPriority,
      getHighestRarityForList,
      getRarityDisplayLabel,
      clampHours,
      parseHourFromStartTimeString,
      getNextOccurrenceOfHour
    } = ctx;

    const member = interaction.member;

    // ROLE CHECK
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

    // --- Extract ---
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

    // START TIME
    let startTime;
    if (startTimeStr === 'now') {
      startTime = new Date();
    } else {
      const hour = parseHourFromStartTimeString(startTimeStr);
      startTime = getNextOccurrenceOfHour(hour);
    }
    const endTime = new Date(startTime.getTime() + durationMs);

    const bountyId = `${Date.now()}_${interaction.user.id}`;

    // Create bounty object
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

    pendingBounties.set(bountyId, bounty);

    // GET REQUEST CHANNEL
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

    // STAFF PING
    const staffRolesEnv = process.env.STAFF_ROLES || '';
    const staffMention = staffRolesEnv
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
      .map(id => `<@&${id}>`)
      .join(' ');

    const rarity = getHighestRarityForList(pokemons);
    const rarityLabel = getRarityDisplayLabel(rarity);

    const pokemonListLines = pokemons.map(p => `• ${p}`).join('\n');
    const startUnix = Math.floor(startTime.getTime() / 1000);
    const endUnix = Math.floor(endTime.getTime() / 1000);

    const startFieldValue =
      startTimeStr === 'now'
        ? `<t:${startUnix}:F> (Starts on approval)`
        : `<t:${startUnix}:F>`;

    // EMBED
    const embed = new EmbedBuilder()
      .setTitle('📝 New Bounty Request')
      .setDescription('A new bounty has been requested and is awaiting staff approval.')
      .addFields(
        { name: 'Trainer', value: `<@${interaction.user.id}>`, inline: true },
        { name: 'Rarity', value: rarityLabel, inline: true },
        { name: 'Reward', value: `${reward.toLocaleString()} PKD`, inline: false },
        { name: 'Pokémon Targets', value: pokemonListLines, inline: false },
        { name: 'Requested Start', value: startFieldValue, inline: false },
        { name: 'Requested End', value: `<t:${endUnix}:F>`, inline: false },
        { name: 'Duration', value: `${durationHours} hour(s)`, inline: true },
        { name: 'Note', value: notes, inline: false }
      )
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
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
      components: [row]
    });

    return interaction.reply({
      content: '✅ Bounty request submitted. Staff have been notified.',
      ephemeral: true
    });
  }
};
