// interactions/commands/ign.cjs

const { SlashCommandBuilder } = require("discord.js");
const db = require("../../database.cjs");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("ign")
    .setDescription("Manage your Pokémon IGN (in-game name)")
    .addSubcommand(sub =>
      sub
        .setName("set")
        .setDescription("Set or update your Pokémon IGN")
        .addStringOption(opt =>
          opt
            .setName("ign")
            .setDescription("Your in-game name")
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName("view")
        .setDescription("View your registered Pokémon IGN")
    )
    .addSubcommand(sub =>
      sub
        .setName("clear")
        .setDescription("Remove your registered Pokémon IGN")
    ),

  async execute(client, interaction) {
    const sub = interaction.options.getSubcommand();
    const user = interaction.user;
    const member = interaction.member;
    const guild = interaction.guild;

    // Always track that this player exists in this guild
    if (guild) {
      await db.touchPlayerGuild(user.id, guild.id);
    }

    // ──────────────────────────────
    // /ign set
    // ──────────────────────────────
    if (sub === "set") {
      const ignInput = interaction.options.getString("ign").trim();

      if (!ignInput) {
        return interaction.reply({
          content: "❌ IGN cannot be empty.",
          flags: 64
        });
      }

      const profile = await db.upsertPlayerProfile({
        discordId: user.id,
        username: user.username,
        nickname: member?.nickname || null,
        ign: ignInput
      });

      return interaction.reply({
        content: `✅ Your IGN has been set to **${profile.ign}**.`,
        flags: 64
      });
    }

    // ──────────────────────────────
    // /ign view
    // ──────────────────────────────
    if (sub === "view") {
      const profile = await db.getPlayerByDiscordId(user.id);

      if (!profile || !profile.ign) {
        return interaction.reply({
          content: "ℹ️ You don’t have an IGN registered yet.\nUse `/ign set <name>` to add one.",
          flags: 64
        });
      }

      const updated =
        profile.updated_at
          ? `<t:${Math.floor(profile.updated_at / 1000)}:R>`
          : "unknown";

      return interaction.reply({
        content: `🎮 **Registered IGN:** **${profile.ign}**\n🕒 Last updated: ${updated}`,
        flags: 64
      });
    }

    // ──────────────────────────────
    // /ign clear
    // ──────────────────────────────
    if (sub === "clear") {
      const profile = await db.getPlayerByDiscordId(user.id);

      if (!profile || !profile.ign) {
        return interaction.reply({
          content: "ℹ️ You don’t currently have an IGN registered.",
          flags: 64
        });
      }

      await db.clearPlayerIgn(user.id);

      return interaction.reply({
        content: "🗑️ Your IGN has been cleared. You can set a new one at any time using `/ign set`.",
        flags: 64
      });
    }
  }
};