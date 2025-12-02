// interactions/modals/bountyClaimModal.cjs
const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType
} = require("discord.js");

const db = require("../../database.cjs");

module.exports = {
  // IMPORTANT FIX — must match prefix only
  ids: ["bountyclaim"],

  async execute(client, interaction) {
    try {
      // Prevent “Unknown interaction”
      await interaction.deferReply({ ephemeral: true });

      // Parse customId → "bountyclaim|<bountyId>|<hunterId>"
      const [prefix, bountyId, hunterId] = interaction.customId.split("|");

      if (!bountyId || !hunterId) {
        return interaction.editReply("❌ Invalid claim data (missing IDs).");
      }

      // -----------------------------------------------------
      // Validate bounty exists + open
      // -----------------------------------------------------
      const bounty = await db.getBountyById(bountyId);

      if (!bounty) {
        return interaction.editReply("❌ Could not find this bounty.");
      }

      if (bounty.status !== "open") {
        return interaction.editReply("❌ This bounty is not accepting claims.");
      }

      // -----------------------------------------------------
      // Prevent multiple active claims per hunter
      // -----------------------------------------------------
      const existing = await db.getPendingClaimForBountyAndHunter(
        bountyId,
        hunterId
      );

      if (existing) {
        return interaction.editReply(
          "⚠ You already have a pending claim for this bounty."
        );
      }

      // -----------------------------------------------------
      // Read modal fields
      // -----------------------------------------------------
      const pokemonId = interaction.fields.getTextInputValue("pokemon_id");
      const proof =
        interaction.fields.getTextInputValue("proof_optional") || "";

      // -----------------------------------------------------
      // Create SQLite claim — *let SQLite set ID*
      // -----------------------------------------------------
      const claimId = await db.createBountyClaim({
        bountyId,
        hunterId,
        pokemonId,
        proof,
        status: "pending",
        createdAt: Date.now(),
        resolvedAt: null,
        resolverId: null,
        claimThreadId: null,
        claimMessageId: null
      });

      // -----------------------------------------------------
      // Create claim thread in the Claims Forum
      // -----------------------------------------------------
      const forumId = process.env.CLAIMS_FORUM_CHANNEL_ID;
      const forum = interaction.guild.channels.cache.get(forumId);

      if (!forum || forum.type !== ChannelType.GuildForum) {
        return interaction.editReply(
          "❌ Claims forum channel is missing or not a valid Forum."
        );
      }

      const threadTitle = `Claim • ${interaction.user.username} • ${pokemonId}`;

      const starter = {
        content: `📬 **New bounty claim submitted by <@${hunterId}>**`
      };

      const thread = await forum.threads.create({
        name: threadTitle,
        message: starter
      });

      // -----------------------------------------------------
      // Build claim embed
      // -----------------------------------------------------
      const embed = new EmbedBuilder()
        .setTitle("🔎 New Bounty Claim")
        .setColor("Yellow")
        .addFields(
          { name: "Bounty ID", value: bountyId, inline: true },
          { name: "Claimer", value: `<@${hunterId}>`, inline: true },
          { name: "Pokémon ID", value: pokemonId, inline: true },
          { name: "Notes", value: proof || "None provided" }
        )
        .setTimestamp();

      // Staff buttons
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`approveclaim_${claimId}`)
          .setLabel("Approve Claim")
          .setStyle(ButtonStyle.Success),

        new ButtonBuilder()
          .setCustomId(`denyclaim_${claimId}`)
          .setLabel("Deny Claim")
          .setStyle(ButtonStyle.Danger)
      );

      const claimMessage = await thread.send({
        embeds: [embed],
        components: [row]
      });

      // -----------------------------------------------------
      // Save thread + message IDs
      // -----------------------------------------------------
      await db.updateBountyClaim(claimId, {
        claimThreadId: thread.id,
        claimMessageId: claimMessage.id
      });

      // -----------------------------------------------------
      // Final response
      // -----------------------------------------------------
      return interaction.editReply("✅ Your bounty claim has been submitted!");
    } catch (err) {
      console.error("❌ Modal handler error:", err);
      return interaction.editReply(
        "❌ An error occurred submitting your claim."
      );
    }
  }
};