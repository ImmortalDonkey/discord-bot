const {
  SlashCommandBuilder,
  EmbedBuilder,
  ChannelType
} = require('discord.js');

const db = require('../../database.cjs');

const {
  clampHours,
  parseHourFromStartTimeString,
  getNextOccurrenceOfHour,
} = require('../../utils/timeUtils.cjs');

const {
  getHighestRarityForList,
  getRarityDisplayLabel,
} = require('../../utils/rarity.cjs');

const { getBountyRequestChannel } = require('../../utils/channelResolver.cjs');

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
        .setDescription('Reward amount (PKD)')
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

  // ────────────────────────────────────────────────
  // EXECUTE
  // ────────────────────────────────────────────────
  async execute(client, interaction) {
    const member = interaction.member;

    // ------------------------------------------------------------
    // ROLE CHECK
    // ------------------------------------------------------------
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

    // ------------------------------------------------------------
    // OPTIONS
    // ------------------------------------------------------------
    const p1 = interaction.options.getString('pokemon1');
    const p2 = interaction.options.getString('pokemon2');
    const p3 = interaction.options.getString('pokemon3');
    const notes = interaction.options.getString('notes');
    const startTimeStr = interaction.options.getString('starttime');
    const durationHoursRaw = interaction.options.getInteger('duration');
    const reward = interaction.options.getInteger('reward');
    
    const pokemons = [p1, p2, p3].filter(Boolean);
    const rarityKey = getHighestRarityForList(pokemons);
    const rarityLabel = getRarityDisplayLabel(rarityKey);
    const durationHours = clampHours(durationHoursRaw);
    const durationMs = durationHours * 3600000;

    const now = new Date();

    let startTime;
    let endTime;

    // ------------------------------------------------------------
    // START TIME — SERVER TIME ONLY
    // ------------------------------------------------------------
    if (startTimeStr === 'now') {
      startTime = now;

      // Next half-past the hour
      const nextHalf = new Date(now.getTime());
      if (now.getMinutes() < 30) {
        nextHalf.setMinutes(30, 0, 0);
      } else {
        nextHalf.setHours(nextHalf.getHours() + 1, 30, 0, 0);
      }

      endTime = new Date(nextHalf.getTime() + durationMs);
    } else {
      const hour = parseHourFromStartTimeString(startTimeStr);
      startTime = getNextOccurrenceOfHour(hour);
      endTime = new Date(startTime.getTime() + durationMs);
    }

    const startMs = startTime.getTime();
    const endMs = endTime.getTime();

    const bountyId = `${Date.now()}_${interaction.user.id}`;
    const displayName =
      member?.nickname || interaction.user.username || interaction.user.tag;

    // ------------------------------------------------------------
    // CREATE PRIVATE REQUEST THREAD
    // ------------------------------------------------------------
    const guild = interaction.guild;
    const requestChannel = await getBountyRequestChannel(guild);

    if (!requestChannel || requestChannel.type !== ChannelType.GuildText) {
      return interaction.reply({
        content: '❌ Bounty request channel misconfigured.',
        ephemeral: true
      });
    }

    const thread = await requestChannel.threads.create({
      name: `bounty-${interaction.user.username}-${Date.now()}`,
      type: ChannelType.PrivateThread,
      invitable: false
    });

    const requestMessage = await thread.send({
      content: (process.env.STAFF_ROLES || '')
        .split(',')
        .map(id => id.trim())
        .filter(Boolean)
        .map(id => `<@&${id}>`)
        .join(' ') || '',
      embeds: [
        new EmbedBuilder()
          .setTitle('📝 New Bounty Request')
          .addFields(
            { name: 'Trainer', value: `<@${interaction.user.id}>`, inline: true },
            { name: 'Rarity', value: rarityLabel, inline: true },
            { name: 'Reward', value: `${reward.toLocaleString()} PKD`, inline: false },
            { name: 'Pokémon Targets', value: pokemons.map(p => `• ${p}`).join('\n') },
            {
              name: 'Requested Start',
              value: startTimeStr === 'now'
                ? 'Starts immediately on approval'
                : `<t:${Math.floor(startMs / 1000)}:F>`
            },
            { name: 'Requested End', value: `<t:${Math.floor(endMs / 1000)}:F>` },
            { name: 'Duration', value: `${durationHours} hour(s)` },
            { name: 'Notes', value: notes },
            {
              name: 'Bounty ID',
              value: `${bountyId} | <t:${Math.floor(Date.now()/1000)}:t>`
            }
          )
          .setTimestamp()
      ]
    });

    // ------------------------------------------------------------
    // STORE INTO SQLITE DATABASE
    // ------------------------------------------------------------
    await db.run(
      `INSERT INTO bounties (
        id,
        guild_id,
        requester_id,
        requester_name,
        pokemons,
        notes,
        start_time,
        end_time,
        duration_hours,
        reward,
        rarity_key,
        rarity_label,
        starts_immediately,
        status,
        created_at,
        approved_at,
        request_thread_id,
        request_message_id,
        announcement_channel_id,
        announcement_message_id,
        card_channel_id,
        card_message_id,
        winner_id,
        winner_claim_id
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        bountyId,
        guild.id,
        interaction.user.id,
        displayName,
        JSON.stringify(pokemons),
        notes,
        startMs,
        endMs,
        durationHours,
        reward,
        rarityKey,
        rarityLabel,
        startTimeStr === 'now' ? 1 : 0,
        'pending',
        Date.now(),
        null,
        thread.id,
        requestMessage.id,
        null,
        null,
        null,
        null,
        null,
        null
      ]
    );

    return interaction.reply({
      content: '✅ Bounty request submitted! Staff have been notified.',
      ephemeral: true
    });
  }
};