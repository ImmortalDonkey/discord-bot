// interactions/commands/reportdebug.cjs

const { SlashCommandBuilder } = require('discord.js');
const db = require('../../database.cjs');
const { dispatchReport } = require('../../utils/reportDispatcher.cjs');
const { renderReportCardDebug } = require('../../renderers/reportCard.debug.cjs');
const { validateReport } = require('../../utils/validation.cjs');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('reportdebug')
    .setDescription('Debug report (full live flow, no economy impact)')
    .addStringOption(option =>
      option
        .setName('pokemon')
        .setDescription('Pokémon name')
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName('rarity')
        .setDescription('Rarity key')
        .setRequired(true)
    ),

  async execute(client, interaction) {
    await interaction.deferReply({ ephemeral: true });

    const pokemonName = interaction.options.getString('pokemon');
    const rarityKey = interaction.options.getString('rarity');

    // 1️⃣ Validate input (same rules as live)
    const validation = await validateReport({
      interaction,
      pokemonName,
      rarityKey,
      debug: true
    });

    if (!validation.ok) {
      return interaction.editReply({
        content: validation.message
      });
    }

    // 2️⃣ Create canonical report (DEBUG)
    const report = await db.createReport({
      pokemon_name: pokemonName,
      pokemon_key: validation.pokemonKey,
      rarity_key: rarityKey,
      reporter_discord_id: interaction.user.id,
      reporter_username: interaction.user.username,
      is_debug: 1
    });

    // 3️⃣ Dispatch globally (MAIN + subscribers)
    await dispatchReport({
      client,
      report: {
        id: report.id,
        rarityKey: rarityKey,
        pokemonKey: validation.pokemonKey
      },
      renderCard: async () =>
        renderReportCardDebug({
          ...report,
          pokemonKey: validation.pokemonKey,
          rarityKey,
          expired: false
        }),
      components: validation.components // same buttons as live
    });

    // 4️⃣ Confirm to caller
    await interaction.editReply({
      content:
        '✅ Debug report dispatched to all configured guilds.\n' +
        'This used the **exact same flow as live**.'
    });
  }
};