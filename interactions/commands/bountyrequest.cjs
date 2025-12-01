// interactions/commands/bountyrequest.cjs
const {
  SlashCommandBuilder,
  EmbedBuilder,
  ChannelType
} = require('discord.js');

const {
  clampHours,
  parseHourFromStartTimeString,
  getNextOccurrenceOfHour,
} = require('../../utils/timeUtils.cjs');

const {
  getHighestRarityForList,
  getRarityDisplayLabel,
} = require('../../utils/rarity.cjs');

const db = require('../../database.cjs');
const { getBountyRequestChannel } = require('../../utils/channelResolver.cjs');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('bountyrequest')
    .setDescription('Submit a new bounty request')

    .addStringOption(o =>
      o.setName('pokemon1')
        .setDescription('Main Pokémon')
        .setAutocomplete(true)
        .setRequired(true),
    )

    .addStringOption(o =>
      o.setName('starttime')
        .setDescription('Start time (or Start Now)')
        .setRequired(true)
        .addChoices(
          { name: 'Start Now', value: 'now' },
          ...Array.from({ length: 24 }, (_, h) => ({
            name: `${String(h).padStart(2, '0')}:00`,
            value: `${String(h).padStart(2, '0')}:00`,
          })),
        ),
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
          { name: '72 hours', value: 72 },
        ),
    )

    .addIntegerOption(o =>
      o.setName('reward')
        .setDescription('Reward amount (PKD)')
        .setRequired(true),
    )

    .addStringOption(o =>
      o.setName('notes')
        .setDescription('Required note/message')
        .setRequired(true),
    )

    .addStringOption(o =>
      o.setName('pokemon2')
        .setDescription('Optional second Pokémon')
        .setAutocomplete(true),
    )

    .addStringOption(o =>
      o.setName('pokemon3')
        .setDescription('Optional third Pokémon')
        .setAutocomplete(true),
    ),

  async execute(client, interaction) {
    const member = interaction.member;

    // ROLE CHECK
    const bountyRoleId = process.env.ROLE_BOUNTY_HUNTER || null;
    let hasRole = false;

    if (bountyRoleId) {
      hasRole = member.roles.cache.has(bountyRoleId);
    } else {
      hasRole = member.roles.cache.some(r =>
        r.name === 'Bounty Hunter' || r.name === 'Roaming Bounty Hunter',
      );
    }

    if (!hasRole) {
      return interaction.reply({
        content: '🚫 You do not have permission to request bounties.',
        ephemeral: true,
      });
    }

    // OPTIONS
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

    // SERVER TIME
    let startTime;
    const now = new Date();
    if (startTimeStr === 'now') {
      startTime = now;
    } else {
      const hour = parseHourFromStartTimeString(startTimeStr);
      startTime = getNextOccurrenceOfHour(hour);
    }

    const endTime = new Date(startTime.getTime() + durationMs);

    const startMs = startTime.getTime();
    const endMs = endTime.getTime();

    const bountyId = `${Date.now()}_${interaction.user.id}`;
    const displayName =
      member?.nickname || interaction.user.username || interaction.user.tag;

    // Rarity
    const rarityKey = getHighestRarityForList(pokemons);
    const rarityLabel = getRarityDisplayLabel(rarityKey);

    // THREAD
    const guild = interaction.guild;
    const requestChannel = await getBountyRequestChannel(guild);

    if (!requestChannel || requestChannel.type !== ChannelType.GuildText) {
      return interaction.reply({
        content: '❌ Bounty request channel is not configured correctly.',
        ephemeral: true,
      });
    }

    const threadName = `bounty-${interaction.user.username}-${Date.now()}`;
    const requestThread = await requestChannel.threads.create({
      name: threadName,
      type: ChannelType.PrivateThread,
      invitable: false,
    });

    const startUnix = Math.floor(startMs / 1000);
    const endUnix = Math.floor(endMs / 1000);

    const startFieldValue =
      startTimeStr === 'now'
        ? `<t:${startUnix}:F> (Start on approval / immediately)`
        : `<t:${startUnix}:F>`;

    const pokemonListLines = pokemons.map(p => `• ${p}`).join('\n');

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
        { name: 'Note', value: notes, inline: false },
        {
          name: 'Bounty ID',
          value: `${bountyId} | Today at <t:${Math.floor(Date.now() / 1000)}:t>`,
          inline: false,
        },
      )
      .setTimestamp();

    const approveId = `approvebounty_${bountyId}`;
    const denyId = `denybounty_${bountyId}`;

    const row = {
      type: 1,
      components: [
        { type: 2, style: 3, custom_id: approveId, label: 'Approve' },
        { type: 2, style: 4, custom_id: denyId, label: 'Deny' },
      ],
    };

    const staffRolesEnv = process.env.STAFF_ROLES || '';
    const staffMention = staffRolesEnv
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
      .map(id => `<@&${id}>`)
      .join(' ');

    const requestMessage = await requestThread.send({
      content: staffMention || '',
      embeds: [embed],
      components: [row],
    });

    // MEMORY STORAGE — FINAL OBJECT
    const bountyRecord = {
      id: bountyId,
      guildId: guild.id,
      requesterId: interaction.user.id,
      requesterName: displayName,
      pokemons,
      notes,
      startTime: startMs,
      endTime: endMs,
      durationHours,
      reward,
      rarityKey,
      rarityLabel,
      startsImmediately: startTimeStr === 'now',
      status: 'pending',
      createdAt: Date.now(),
      approvedAt: null,
      requestThreadId: requestThread.id,
      requestMessageId: requestMessage.id,
      announcementChannelId: null,
      announcementMessageId: null,
      cardChannelId: null,
      cardMessageId: null,
      winnerId: null,
      winnerClaimId: null
    };

    await db.createBounty(bountyRecord);

    return interaction.reply({
      content: '✅ Bounty request submitted. Staff have been notified in your private bounty thread.',
      ephemeral: true,
    });
  },
};
