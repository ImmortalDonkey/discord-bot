// interactions/modals/bountyClaimModal.cjs
const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');

const {
  getHighestRarityForList,
  getRarityDisplayLabel
} = require('../../utils/rarity.cjs');

module.exports = {
  // modalHandler expects idPrefix + execute()
  idPrefix: 'bountyclaim_',

  /**
   * customId: bountyclaim_<bountyId>
   */
  async execute(client, interaction) {
    const customId = interaction.customId; // bountyclaim_<bountyId>
    const bountyId = customId.replace('bountyclaim_', '');

    if (!client.activeBounties) client.activeBounties = new Map();
    const bounty = client.activeBounties.get(bountyId);

    if (!bounty) {
      return interaction.reply({
        content: '❌ This bounty is no longer active.',
        ephemeral: true
      });
    }

    const proof = interaction.fields.getTextInputValue('proof_id');
    const extraNote = interaction.fields.getTextInputValue('extra_note') || '—';

    const forumId = process.env.CLAIMS_FORUM_CHANNEL_ID;
    if (!forumId) {
      return interaction.reply({
        content: '❌ Claims forum not configured. Ask an admin to set `CLAIMS_FORUM_CHANNEL_ID`.',
        ephemeral: true
      });
    }

    const forum = await interaction.guild.channels.fetch(forumId).catch(() => null);
    if (!forum) {
      return interaction.reply({
        content: '❌ Could not find the claims forum channel.',
        ephemeral: true
      });
    }

    // Staff mention
    const staffRolesEnv = process.env.STAFF_ROLES || '';
    const staffMention = staffRolesEnv
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
      .map(id => `<@&${id}>`)
      .join(' ');

    const rarityKey = getHighestRarityForList(bounty.pokemons);
    const rarityLabel = getRarityDisplayLabel(rarityKey);

    const claimerId = interaction.user.id;

    const thread = await forum.threads.create({
      name: `Bounty Claim • ${interaction.user.username}`,
      message: {
        content: `${staffMention} New bounty claim from <@${claimerId}>`
      }
    });

    const pokemonList = bounty.pokemons.map(p => `• ${p}`).join('\n') || '—';

    const embed = new EmbedBuilder()
      .setTitle('📨 Bounty Claim Submitted')
      .setDescription('A hunter has submitted a claim for an active bounty.')
      .addFields(
        { name: 'Hunter', value: `<@${claimerId}>`, inline: true },
        { name: 'Requester', value: `<@${bounty.requesterId}>`, inline: true },
        { name: 'Bounty ID', value: bounty.id, inline: false },
        { name: 'Rarity', value: rarityLabel, inline: true },
        {
          name: 'Targets',
          value: pokemonList,
          inline: false
        },
        {
          name: 'Reward',
          value: `${bounty.reward.toLocaleString()} PKD`,
          inline: true
        },
        {
          name: 'Proof / Pokémon ID',
          value: proof,
          inline: false
        },
        {
          name: 'Extra Notes',
          value: extraNote,
          inline: false
        }
      )
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`approvebountyclaim_${bounty.id}_${claimerId}`)
        .setLabel('Approve Claim')
        .setStyle(ButtonStyle.Success)
    );

    await thread.send({
      embeds: [embed],
      components: [row]
    });

    // OPTIONAL: track claim in memory
    if (!client.bountyClaims) client.bountyClaims = new Map();
    client.bountyClaims.set(`${bounty.id}:${claimerId}`, {
      bountyId: bounty.id,
      claimerId,
      threadId: thread.id,
      proof,
      extraNote,
      createdAt: new Date()
    });

    return interaction.reply({
      content: `✅ Your bounty claim has been submitted: <#${thread.id}>`,
      ephemeral: true
    });
  }
};