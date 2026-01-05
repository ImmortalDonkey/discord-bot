const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require("discord.js");

const db = require("../database.cjs");
const rolesConfig = require("./rolesConfig.cjs");

/**
 * Build the single "Manage" button for a role
 */
function buildManageButton(roleId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`role_manage_${roleId}`)
      .setLabel("Manage")
      .setStyle(ButtonStyle.Primary)
  );
}

/**
 * Ensure a single permanent role message exists.
 * If it already exists in DB, it is NOT reposted.
 */
async function ensureRoleMessage({
  guild,
  channel,
  roleId,
  label,
  roleType
}) {
  // DB is source of truth
  const existing = await db.getRoleMessage(roleId);
  if (existing) return;

  // Extra safety: ensure role still exists in guild
  const role = guild.roles.cache.get(roleId);
  if (!role) {
    console.warn(
      `⚠ Skipping role message (role not found in guild): ${label} (${roleId})`
    );
    return;
  }

  const message = await channel.send({
    content: `**${label}**`,
    components: [buildManageButton(roleId)]
  });

  await db.saveRoleMessage({
    roleId,
    messageId: message.id,
    channelId: channel.id,
    roleType
  });

  console.log(`✅ Role message created: ${label}`);
}

/**
 * Initialise the #roles channel.
 * Safe to run on every startup.
 */
async function initRolesChannel(client) {
  if (!client?.guilds?.cache) return;

  const guild = client.guilds.cache.get(process.env.GUILD_ID);
  if (!guild) {
    console.warn("⚠ initRolesChannel: guild not found");
    return;
  }

  const channelId = process.env.CHANNEL_ROLES;
  if (!channelId) {
    console.warn("⚠ initRolesChannel: CHANNEL_ROLES not configured");
    return;
  }

  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (!channel) {
    console.warn("⚠ initRolesChannel: roles channel not found");
    return;
  }

  // ──────────────────────────────
  // RARITY GROUP ROLES
  // ──────────────────────────────
  for (const entry of rolesConfig.rarityRoles) {
    const roleId = process.env[entry.env];
    if (!roleId) {
      console.warn(
        `⚠ Missing env for rarity role: ${entry.env}`
      );
      continue;
    }

    await ensureRoleMessage({
      guild,
      channel,
      roleId,
      label: entry.label,
      roleType: "rarity"
    });
  }

  // ──────────────────────────────
  // INDIVIDUAL POKÉMON ROLES
  // ──────────────────────────────
  for (const entry of rolesConfig.pokemonRoles) {
    const roleId = process.env[entry.env];
    if (!roleId) {
      console.warn(
        `⚠ Missing env for Pokémon role: ${entry.env}`
      );
      continue;
    }

    await ensureRoleMessage({
      guild,
      channel,
      roleId,
      label: entry.label,
      roleType: "pokemon"
    });
  }
}

module.exports = { initRolesChannel };
