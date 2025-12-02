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
    const customId = interaction.customId;

    try {
      // ----------------------------------------------------------
      // 0️⃣ Parse customId → "bountyclaim|<bountyId>|<hunterId>|<nickname>"
      // ----------------------------------------------------------
      const parts = String(customId).split("|");
      const bountyId = parts[1];
      const hunterId = parts[2];
      const rawNickname = parts[3] ? decodeURIComponent(parts[3]) : null;

      if (!bountyId || !hunterId) {
        return interaction.reply({
          content: "❌ Invalid claim data (missing IDs).",
          ephemeral: true
        });
      }

      // ----------------------------------------------------------
      // 1️⃣ Validate bounty exists + is open
      // ----------------------------------------------------------
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

      // Double-check no existing pending claim
      const existing = await db.getPendingClaimForBountyAndHunter(
        bountyId,
        hunterId
      );

      if (existing) {
        return interaction.reply({
          content: "⚠ You already have a pending claim for this bounty.",
          ephemeral: true
        });
      }

      // ----------------------------------------------------------
      // 2️⃣ Get modal fields
      // ----------------------------------------------------------
      const pokemonId = interaction.fields.getTextInputValue("pokemon_id");
      const proof = interaction.fields.getTextInputValue("proof_optional") || "";

      // ----------------------------------------------------------
      // 3️⃣ Resolve nickname (prefer modal data, else fallback)
      // ----------------------------------------------------------
      let nickname = rawNickname;

      if (!nickname) {
        try {
          const member = await interaction.guild.members.fetch(hunterId);
          nickname =
            member?.nickname ||
            member?.displayName ||
            member?.user?.username ||
            interaction.user.username;
        } catch {
          nickname = interaction.user.username;
        }
      }

      // ----------------------------------------------------------
      // 4️⃣ Create claim in SQLite
      // ----------------------------------------------------------
      const claimId = await db.createBountyClaim({
        bountyId,
        hunterId,
        pokemonId,
        proof,
        nickname,          // <-- ✔ store trainer name for later success card
        status: "pending",
        createdAt: Date.now(),
        resolvedAt: null,
        resolverId: null,
        claimThreadId: null,
        claimMessageId: null
      });

      // ----------------------------------------------------------
      // 5️⃣ Create thread in the claims forum
      // ----------------------------------------------------------
      const forumId = process.env.CLAIMS_FORUM_CHANNEL_ID;
      const forum = interaction.guild.channels.cache.get(forumId);

      if (!forum || forum.type !== ChannelType.GuildForum) {
        return interaction.reply({
          content:
            "❌ Claims forum channel is missing or not a Forum. Please tell staff.",
          ephemeral: true
        });
      }

      const threadTitle = `Claim • ${nickname} • ${pokemonId}`;

      const thread = await forum.threads.create({
        name: threadTitle,
        message: {
          content: `📬 **New bounty claim submitted by <@${hunterId}>**`
        }
      });

      // ----------------------------------------------------------
      // 6️⃣ Build claim embed + staff buttons
      // ----------------------------------------------------------
      const embed = new EmbedBuilder()
        .setTitle("🔎 New Bounty Claim")
        .setColor("Yellow")
        .addFields(
          { name: "Bounty ID", value: String(bountyId), inline: true },
          { name: "Claimer", value: `${nickname}\n<@${hunterId}>`, inline: true },
          { name: "Pokémon ID", value: String(pokemonId), inline: true },
          { name: "Notes", value: proof || "None provided", inline: false }
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

      const claimMessage = await thread.send({
        embeds: [embed],
        components: [row]
      });

      // ----------------------------------------------------------
      // 7️⃣ Save thread + message IDs to DB
      // ----------------------------------------------------------
      await db.updateBountyClaim(claimId, {
        claimThreadId: thread.id,
        claimMessageId: claimMessage.id
      });

      // ----------------------------------------------------------
      // 8️⃣ Confirm to user
      // ----------------------------------------------------------
      return interaction.reply({
        content: "✅ Your bounty claim has been submitted!",
        ephemeral: true
      });
    } catch (err) {
      console.error(`❌ Modal handler error (${customId}):`, err);

      if (!interaction.replied && !interaction.deferred) {
        return interaction.reply({
          content:
            "❌ An error occurred while submitting your claim. Please try again or contact staff.",
          ephemeral: true
        });
      }
    }
  }
};
