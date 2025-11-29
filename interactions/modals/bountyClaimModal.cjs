// interactions/modals/bountyClaimModal.cjs
const { EmbedBuilder } = require("discord.js");

const ID_PREFIX = "bounty_claim_";

module.exports = {
  // modalHandler.cjs expects idPrefix + execute()
  idPrefix: ID_PREFIX,

  /**
   * Handles submission of the bounty claim modal.
   *
   * Custom ID format:
   *   bounty_claim_<bountyId>_<userId>
   */
  async execute(client, interaction) {
    const { customId } = interaction;

    if (!customId.startsWith(ID_PREFIX)) {
      return;
    }

    // Parse IDs from customId
    const raw = customId.slice(ID_PREFIX.length); // "<bountyId>_<userId>"
    const [bountyId, targetUserId] = raw.split("_");

    // Safety: ensure only the original claimer can submit this modal
    if (interaction.user.id !== targetUserId) {
      return interaction.reply({
        content: "❌ This claim form is not assigned to you.",
        ephemeral: true,
      });
    }

    // Look up the bounty from active bounties
    const bounty = client.activeBounties.get(bountyId);
    if (!bounty) {
      return interaction.reply({
        content: "❌ This bounty is no longer active.",
        ephemeral: true,
      });
    }

    // Read form values
    const pokemonId = interaction.fields.getTextInputValue("pokemon_id");
    const proof =
      interaction.fields.getTextInputValue("proof_optional")?.trim() || "";

    // Prevent duplicate claims (same bounty + user)
    const claimKey = `${bountyId}_${interaction.user.id}`;
    if (!client.bountyClaims) client.bountyClaims = new Map();

    if (client.bountyClaims.has(claimKey)) {
      return interaction.reply({
        content: "⚠ You already have an active claim for this bounty.",
        ephemeral: true,
      });
    }

    // Resolve claims forum
    const forumId = process.env.CLAIMS_FORUM_CHANNEL_ID;
    const forumChannel = forumId
      ? await interaction.guild.channels.fetch(forumId).catch(() => null)
      : null;

    if (!forumChannel) {
      return interaction.reply({
        content:
          "❌ Claims forum is not configured correctly. Please tell an admin.",
        ephemeral: true,
      });
    }

    // Staff ping (re-use same STAFF_ROLES env as other systems)
    const staffRolesEnv = process.env.STAFF_ROLES || "";
    const staffMention = staffRolesEnv
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((id) => `<@&${id}>`)
      .join(" ");

    // Build embed for the thread
    const pokemonListText = Array.isArray(bounty.pokemons)
      ? bounty.pokemons.join("\n")
      : String(bounty.pokemons || "Unknown");

    const embed = new EmbedBuilder()
      .setTitle("🔎 Bounty Claim")
      .setDescription("A new bounty claim has been submitted and needs review.")
      .addFields(
        {
          name: "Claimer",
          value: `<@${interaction.user.id}>`,
          inline: true,
        },
        {
          name: "Bounty Targets",
          value: pokemonListText,
          inline: true,
        },
        {
          name: "Reward",
          value: `${Number(bounty.reward || 0).toLocaleString()} PKD`,
          inline: true,
        },
        {
          name: "Pokémon ID",
          value: pokemonId,
          inline: false,
        }
      )
      .setTimestamp();

    if (proof) {
      embed.addFields({
        name: "Screenshot / Notes",
        value: proof,
        inline: false,
      });
    }

    // Create thread in the claims forum
    const thread = await forumChannel.threads.create({
      name: `Bounty Claim – ${interaction.user.username}`,
      message: {
        content: staffMention || "",
        embeds: [embed],
      },
    });

    // Store claim in memory for future logic (approval, etc.)
    client.bountyClaims.set(claimKey, {
      bountyId,
      claimerId: interaction.user.id,
      claimerTag: interaction.user.tag,
      pokemonId,
      proof,
      status: "pending",
      threadId: thread.id,
      createdAt: Date.now(),
    });

    // Confirm to the user
    await interaction.reply({
      content: `📝 Your claim has been submitted: <#${thread.id}>`,
      ephemeral: true,
    });
  },
};