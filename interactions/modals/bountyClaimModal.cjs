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
  ids: ["bountyclaim|"],

  async execute(client, interaction) {
    try {
      const customId = interaction.customId;
      const parts = customId.split("|");

      const bountyId = parts[1];
      const hunterId = parts[2];

      if (!bountyId || !hunterId) {
        return interaction.reply({
          content: "❌ Invalid claim data (missing IDs).",
          ephemeral: true
        });
      }

      // -----------------------------------------------------
      // Validate bounty exists + is open
      // -----------------------------------------------------
      const bounty = await db.getBountyById(bountyId);
      if (!bounty) {
        return interaction.reply({
          content: "❌ Could not find this bounty.",
          ephemeral: true
        });
      }

      if (bounty.status !== "open") {
        return interaction.reply({
          content: "❌ This bounty is not accepting claims.",
          ephemeral: true
        });
      }

      // -----------------------------------------------------
      // Prevent multiple active claims per hunter
      // -----------------------------------------------------
      const existing = await db.getPendingClaimForBountyAndHunter(bountyId, hunterId);
      if (existing) {
        return interaction.reply({
          content: "⚠ You already have a pending claim for this bounty.",
          ephemeral: true
        });
      }

      // -----------------------------------------------------
      // Get modal values
      // -----------------------------------------------------
      const pokemonId = interaction.fields.getTextInputValue("pokemon_id");
      const proof = interaction.fields.getTextInputValue("proof_optional") || "";

      // -----------------------------------------------------
      // Create claim entry in both memory + SQLite
      // -----------------------------------------------------
      const claimId = `${Date.now()}_${hunterId}`;

      await db.createBountyClaim({
        id: claimId,
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
      // Create claim thread in the Claims forum
      // -----------------------------------------------------
      const forumId = process.env.CLAIMS_FORUM_CHANNEL_ID;
      const forum = interaction.guild.channels.cache.get(forumId);

      if (!forum || forum.type !== ChannelType.GuildForum) {
        return interaction.reply({
          content: "❌ Claims forum channel is missing or not a Forum.",
          ephemeral: true
        });
      }

      const threadTitle = `Claim • ${interaction.user.username} • ${pokemonId}`;

      const starter = {
        content: `📬 **New bounty claim submitted by <@${hunterId}>**`
      };

      // Create the thread
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
          { name: "Notes", value: proof || "None provided", inline: false }
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

      // Send embed inside thread
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
      // Final ephemeral response to user
      // -----------------------------------------------------
      return interaction.reply({
        content: "✅ Your bounty claim has been submitted!",
        ephemeral: true
      });
    }

    catch (err) {
      console.error("❌ Modal handler error:", err);
      return interaction.reply({
        content: "❌ An error occurred submitting your claim.",
        ephemeral: true
      });
    }
  }
};