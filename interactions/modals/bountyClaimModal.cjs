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
  ids: ["bountyclaim"], // <— FIXED (no pipe)

  async execute(client, interaction) {
    try {
      const [prefix, bountyId, hunterId] = interaction.customId.split("|");

      if (!bountyId || !hunterId) {
        return interaction.reply({
          content: "❌ Invalid claim data (missing IDs).",
          ephemeral: true
        });
      }

      // lookup bounty
      const bounty = await db.getBountyById(bountyId);
      if (!bounty || bounty.status !== "open") {
        return interaction.reply({
          content: "❌ This bounty is not accepting claims.",
          ephemeral: true
        });
      }

      const existing = await db.getPendingClaimForBountyAndHunter(bountyId, hunterId);
      if (existing) {
        return interaction.reply({
          content: "⚠ You already have a pending claim for this bounty.",
          ephemeral: true
        });
      }

      const pokemonId = interaction.fields.getTextInputValue("pokemon_id");
      const proof = interaction.fields.getTextInputValue("proof_optional") || "";

      // Let SQLite assign ID
      const claimId = await db.createBountyClaim({
        bountyId,
        hunterId,
        pokemonId,
        proof
      });

      const forumId = process.env.CLAIMS_FORUM_CHANNEL_ID;
      const forum = interaction.guild.channels.cache.get(forumId);

      if (!forum || forum.type !== ChannelType.GuildForum) {
        return interaction.reply({
          content: "❌ Claims forum channel misconfigured.",
          ephemeral: true
        });
      }

      const thread = await forum.threads.create({
        name: `Claim • ${interaction.user.username} • ${pokemonId}`,
        message: { content: `📬 Claim from <@${hunterId}>` }
      });

      const embed = new EmbedBuilder()
        .setTitle("🔎 New Bounty Claim")
        .setColor("Yellow")
        .addFields(
          { name: "Bounty ID", value: bountyId },
          { name: "Claimer", value: `<@${hunterId}>` },
          { name: "Pokémon ID", value: pokemonId },
          { name: "Notes", value: proof || "None" }
        )
        .setTimestamp();

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

      const msg = await thread.send({ embeds: [embed], components: [row] });

      await db.updateBountyClaim(claimId, {
        claimThreadId: thread.id,
        claimMessageId: msg.id
      });

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