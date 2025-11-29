// interactions/modals/bountyClaimModal.cjs
const { EmbedBuilder } = require("discord.js");

const ID_PREFIX = "bounty_claim_";

module.exports = {
  idPrefix: ID_PREFIX,

  async execute(client, interaction) {
    const { customId } = interaction;

    if (!customId.startsWith(ID_PREFIX)) return;

    // Format: bounty_claim_<bountyId>_<userId>
    const raw = customId.replace(ID_PREFIX, "");
    const parts = raw.split("_");

    const bountyId = parts[0];
    const targetUserId = parts[1];

    if (!bountyId || !targetUserId) {
      return interaction.reply({
        content: "❌ Invalid claim form (missing data).",
        ephemeral: true,
      });
    }

    // Prevent other users submitting someone else's claim modal
    if (interaction.user.id !== targetUserId) {
      return interaction.reply({
        content: "❌ This claim form is not assigned to you.",
        ephemeral: true,
      });
    }

    const bounty = client.activeBounties.get(bountyId);
    if (!bounty) {
      return interaction.reply({
        content: "❌ This bounty is no longer active.",
        ephemeral: true,
      });
    }

    // Inputs
    const pokemonId = interaction.fields.getTextInputValue("pokemon_id");
    const proof =
      interaction.fields.getTextInputValue("proof_optional")?.trim() || "";

    // Unique claim key
    const claimKey = `${bountyId}_${interaction.user.id}`;

    if (!client.bountyClaims) client.bountyClaims = new Map();
    if (client.bountyClaims.has(claimKey)) {
      return interaction.reply({
        content: "⚠ You already claimed this bounty.",
        ephemeral: true,
      });
    }

    // Claims forum
    const forumId = process.env.CLAIMS_FORUM_CHANNEL_ID;
    const forum = await interaction.guild.channels
      .fetch(forumId)
      .catch(() => null);

    if (!forum) {
      return interaction.reply({
        content: "❌ Claims forum not configured.",
        ephemeral: true,
      });
    }

    // Staff ping
    const staffRolesEnv = process.env.STAFF_ROLES || "";
    const staffMention = staffRolesEnv
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((id) => `<@&${id}>`)
      .join(" ");

    // Thread title
    const targetName = bounty.pokemons?.[0] || "Unknown Pokémon";
    const threadTitle = `Claim • ${targetName} • ${interaction.member.displayName}`;

    // Thread embed
    const embed = new EmbedBuilder()
      .setTitle("🔎 Bounty Claim")
      .setDescription("A new bounty claim has been submitted.")
      .addFields(
        { name: "Claimer", value: `<@${interaction.user.id}>`, inline: true },
        {
          name: "Bounty Targets",
          value: bounty.pokemons?.join("\n") || "Unknown",
          inline: true,
        },
        {
          name: "Reward",
          value: `${Number(bounty.reward).toLocaleString()} PKD`,
          inline: true,
        },
        { name: "Pokémon ID", value: pokemonId }
      )
      .setTimestamp();

    if (proof) {
      embed.addFields({ name: "Screenshot / Notes", value: proof });
    }

    // Create forum thread
    const thread = await forum.threads.create({
      name: threadTitle,
      message: {
        content: staffMention || "",
        embeds: [embed],
      },
    });

    // Save claim
    client.bountyClaims.set(claimKey, {
      bountyId,
      claimerId: interaction.user.id,
      pokemonId,
      proof,
      status: "pending",
      threadId: thread.id,
      createdAt: Date.now(),
    });

    // User confirmation
    return interaction.reply({
      content: `📝 Claim submitted successfully: <#${thread.id}>`,
      ephemeral: true,
    });
  },
};