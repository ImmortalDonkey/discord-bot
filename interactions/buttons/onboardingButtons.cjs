'use strict';

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  AttachmentBuilder
} = require('discord.js');

const path = require('path');
const fs = require('fs');
const db = require('../../database.cjs');
const { availableLocations } = require('../../utils/locations.cjs');
const { pokemonRoles } = require('../../utils/rolesConfig.cjs');

const ASSETS_DIR = path.join(__dirname, '..', '..', 'assets', 'report-bg');
const ROUTES_PER_PAGE = 1; // one at a time with banner
const POKEMON_PER_PAGE = 5;

const RARITY_DEFS = [
  { key: 'paradox',      label: 'Paradox' },
  { key: 'roamer_month', label: 'Roamer of the Month' },
  { key: 'legendary',    label: 'Legendary' },
  { key: 'rare',         label: 'Rare' },
  { key: 'common',       label: 'Common' }
];

// ─── helpers ───────────────────────────────────────────

function parseSelections(json) {
  try { return JSON.parse(json || '{}'); } catch { return {}; }
}

function locationSlug(loc) {
  return loc.toLowerCase().replace(/['\s]+/g, s => s === "'" ? '' : '-').replace(/[^a-z0-9-]/g, '');
}

function labelToDbPokemonKey(label) {
  return String(label || '')
    .toLowerCase()
    .replace(/[()']/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

async function patchSelections(discordId, guildId, patch) {
  const session = await db.getOnboardingSession(discordId, guildId);
  const sel = parseSelections(session?.selections_json);
  const merged = { ...sel, ...patch };
  await db.upsertOnboardingSession({ discordId, guildId, selectionsJson: JSON.stringify(merged) });
  return merged;
}

async function finishSession(interaction, config, session, member) {
  const sel = parseSelections(session?.selections_json);
  const guildId = interaction.guild.id;

  // Assign player role
  if (config.player_role_id) {
    await member.roles.add(config.player_role_id).catch(() => {});
  }

  // Assign route roles
  if (Array.isArray(sel.routes)) {
    for (const loc of sel.routes) {
      const row = await db.getGuildRouteRole(guildId, loc).catch(() => null);
      if (row?.role_id) await member.roles.add(row.role_id).catch(() => {});
    }
  }

  // Assign rarity roles
  if (Array.isArray(sel.rarities)) {
    for (const key of sel.rarities) {
      const row = await db.getGuildRarityRole(guildId, key).catch(() => null);
      if (row?.role_id) await member.roles.add(row.role_id).catch(() => {});
    }
  }

  // Assign pokemon roles
  if (Array.isArray(sel.pokemon)) {
    for (const label of sel.pokemon) {
      const key = labelToDbPokemonKey(label);
      const row = await db.getGuildPokemonRole(guildId, key).catch(() => null);
      if (row?.role_id) await member.roles.add(row.role_id).catch(() => {});
    }
  }

  // Set IGN if captured
  if (sel.ign) {
    await db.setPlayerIgn(member.id, sel.ign).catch(() => {});
  }

  const rolesRef = config.roles_channel_id ? ` Update them anytime in <#${config.roles_channel_id}>.` : '';

  await interaction.update({
    embeds: [
      new EmbedBuilder()
        .setTitle('You\'re all set!')
        .setDescription(`Welcome to the Roamers Union! Your notifications have been configured.${rolesRef}`)
        .setColor(0x22c55e)
    ],
    components: []
  });

  await db.upsertOnboardingSession({ discordId: member.id, guildId, completed: 1 });

  // Archive thread after short delay
  setTimeout(async () => {
    const thread = interaction.channel;
    if (thread?.isThread()) {
      await thread.setArchived(true).catch(() => {});
    }
  }, 4000);
}

// ─── step builders ─────────────────────────────────────

function buildIgnStep() {
  const embed = new EmbedBuilder()
    .setTitle('Step 1 — Pokémon Vortex IGN')
    .setDescription('What is your **in-game name** on Pokémon Vortex?\n\nThis links your Discord account to your in-game identity.')
    .setColor(0x6366f1);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('onboard_ign')
      .setLabel('Enter IGN')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('onboard_skip_ign')
      .setLabel('Skip')
      .setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row], files: [] };
}

function buildRouteStep(idx, selections) {
  const loc = availableLocations[idx];
  const slug = locationSlug(loc);
  const selected = (selections.routes || []).includes(loc);

  const embed = new EmbedBuilder()
    .setTitle(`Step 2 — Route Notifications`)
    .setDescription(`Do you want notifications when a roamer is spotted at **${loc}**?`)
    .setFooter({ text: `Location ${idx + 1} of ${availableLocations.length}` })
    .setColor(0x0ea5e9);

  const files = [];
  const imgPath = path.join(ASSETS_DIR, `${slug}.png`);
  if (fs.existsSync(imgPath)) {
    files.push(new AttachmentBuilder(imgPath, { name: `${slug}.png` }));
    embed.setImage(`attachment://${slug}.png`);
  }

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`onboard_route_on:${idx}`)
      .setLabel(selected ? '✅ ON' : 'ON')
      .setStyle(selected ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`onboard_route_off:${idx}`)
      .setLabel(!selected ? '❌ OFF' : 'OFF')
      .setStyle(!selected ? ButtonStyle.Danger : ButtonStyle.Secondary)
  );

  const navBtns = [];
  if (idx > 0) {
    navBtns.push(
      new ButtonBuilder()
        .setCustomId(`onboard_route_prev:${idx}`)
        .setLabel('← Prev')
        .setStyle(ButtonStyle.Secondary)
    );
  }
  if (idx < availableLocations.length - 1) {
    navBtns.push(
      new ButtonBuilder()
        .setCustomId(`onboard_route_next:${idx}`)
        .setLabel('Next →')
        .setStyle(ButtonStyle.Primary)
    );
  }
  navBtns.push(
    new ButtonBuilder()
      .setCustomId('onboard_route_skip')
      .setLabel('Skip routes')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('onboard_route_done')
      .setLabel('Done with routes')
      .setStyle(ButtonStyle.Success)
  );

  const row2 = new ActionRowBuilder().addComponents(navBtns);

  return { embeds: [embed], components: [row1, row2], files };
}

function buildRarityStep(selections) {
  const chosen = selections.rarities || [];

  const embed = new EmbedBuilder()
    .setTitle('Step 3 — Rarity Notifications')
    .setDescription(
      'Select the **rarity groups** you want to be notified about.\n' +
      'You can toggle each one on or off — green means active.'
    )
    .setColor(0xf59e0b);

  const toggleBtns = RARITY_DEFS.map(r =>
    new ButtonBuilder()
      .setCustomId(`onboard_rarity_toggle:${r.key}`)
      .setLabel(chosen.includes(r.key) ? `✅ ${r.label}` : r.label)
      .setStyle(chosen.includes(r.key) ? ButtonStyle.Success : ButtonStyle.Secondary)
  );

  const row1 = new ActionRowBuilder().addComponents(toggleBtns);
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('onboard_rarity_skip')
      .setLabel('Skip rarities')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('onboard_rarity_done')
      .setLabel('Done')
      .setStyle(ButtonStyle.Success)
  );

  return { embeds: [embed], components: [row1, row2], files: [] };
}

function buildPokemonStep(page, selections) {
  const chosen = selections.pokemon || [];
  const start = page * POKEMON_PER_PAGE;
  const slice = pokemonRoles.slice(start, start + POKEMON_PER_PAGE);
  const totalPages = Math.ceil(pokemonRoles.length / POKEMON_PER_PAGE);

  const embed = new EmbedBuilder()
    .setTitle('Step 4 — Pokémon Notifications')
    .setDescription(
      'Select individual Pokémon you want to track.\n' +
      'Toggle each one on or off.'
    )
    .setFooter({ text: `Page ${page + 1} of ${totalPages}` })
    .setColor(0xa855f7);

  const toggleBtns = slice.map(p =>
    new ButtonBuilder()
      .setCustomId(`onboard_pokemon_toggle:${labelToDbPokemonKey(p.label)}:${page}`)
      .setLabel(chosen.includes(p.label) ? `✅ ${p.label}` : p.label)
      .setStyle(chosen.includes(p.label) ? ButtonStyle.Success : ButtonStyle.Secondary)
  );

  const row1 = new ActionRowBuilder().addComponents(toggleBtns);

  const navBtns = [];
  if (page > 0) {
    navBtns.push(
      new ButtonBuilder()
        .setCustomId(`onboard_pokemon_prev:${page}`)
        .setLabel('← Prev')
        .setStyle(ButtonStyle.Secondary)
    );
  }
  if (page < totalPages - 1) {
    navBtns.push(
      new ButtonBuilder()
        .setCustomId(`onboard_pokemon_next:${page}`)
        .setLabel('Next →')
        .setStyle(ButtonStyle.Primary)
    );
  }
  navBtns.push(
    new ButtonBuilder()
      .setCustomId('onboard_pokemon_skip')
      .setLabel('Skip')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('onboard_pokemon_done')
      .setLabel('Done')
      .setStyle(ButtonStyle.Success)
  );

  const row2 = new ActionRowBuilder().addComponents(navBtns);

  return { embeds: [embed], components: [row1, row2], files: [] };
}

function buildSummary(selections, config) {
  const routeList = (selections.routes || []).join(', ') || 'None';
  const rarityList = (selections.rarities || [])
    .map(k => RARITY_DEFS.find(r => r.key === k)?.label || k)
    .join(', ') || 'None';
  const pokemonList = (selections.pokemon || []).join(', ') || 'None';
  const ignLine = selections.ign ? `**IGN:** ${selections.ign}` : '**IGN:** Not set';

  const rolesRef = config?.roles_channel_id
    ? `\n\nYou can change these anytime in <#${config.roles_channel_id}>.`
    : '';

  const embed = new EmbedBuilder()
    .setTitle('Summary — Confirm your selections')
    .setColor(0x22c55e)
    .setDescription(
      [
        ignLine,
        `**Routes:** ${routeList}`,
        `**Rarities:** ${rarityList}`,
        `**Pokémon:** ${pokemonList}`,
        rolesRef
      ].join('\n')
    );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('onboard_confirm')
      .setLabel('✓ Confirm')
      .setStyle(ButtonStyle.Success)
  );

  return { embeds: [embed], components: [row], files: [] };
}

// ─── main handler ──────────────────────────────────────

module.exports = {
  ids: ['onboard_'],

  async execute(client, interaction) {
    const { customId, member, guild } = interaction;
    const sub = customId.slice('onboard_'.length);

    // Load session (needed for most steps)
    const session = await db.getOnboardingSession(member.id, guild.id).catch(() => null);
    const config = await db.getOnboardingConfig(guild.id).catch(() => null);

    // ── just browsing ──
    if (sub === 'no') {
      if (config?.guest_role_id) {
        await member.roles.add(config.guest_role_id).catch(() => {});
      }

      const rulesRef = config?.rules_channel_id ? ` Please take a moment to read <#${config.rules_channel_id}>.` : '';

      await interaction.update({
        embeds: [
          new EmbedBuilder()
            .setTitle('Welcome!')
            .setDescription(`No problem — you\'re welcome to explore!${rulesRef} We hope you enjoy the community.`)
            .setColor(0x94a3b8)
        ],
        components: []
      });

      await db.upsertOnboardingSession({
        discordId: member.id,
        guildId: guild.id,
        completed: 1
      }).catch(() => {});

      setTimeout(async () => {
        if (interaction.channel?.isThread()) {
          await interaction.channel.setArchived(true).catch(() => {});
        }
      }, 4000);
      return;
    }

    // ── I play Vortex ──
    if (sub === 'yes') {
      await db.upsertOnboardingSession({
        discordId: member.id,
        guildId: guild.id,
        step: 'ign'
      }).catch(() => {});
      return interaction.update(buildIgnStep());
    }

    // ── open IGN modal ──
    if (sub === 'ign') {
      const modal = new ModalBuilder()
        .setCustomId('onboarding_ign_modal')
        .setTitle('Your Pokémon Vortex IGN');
      const input = new TextInputBuilder()
        .setCustomId('ign_input')
        .setLabel('In-game name')
        .setStyle(TextInputStyle.Short)
        .setMinLength(2)
        .setMaxLength(32)
        .setRequired(true);
      modal.addComponents(new ActionRowBuilder().addComponents(input));
      return interaction.showModal(modal);
    }

    // ── skip IGN → routes ──
    if (sub === 'skip_ign') {
      const sel = parseSelections(session?.selections_json);
      await db.upsertOnboardingSession({ discordId: member.id, guildId: guild.id, step: 'routes' }).catch(() => {});
      return interaction.update(buildRouteStep(0, sel));
    }

    // ── route ON ──
    if (sub.startsWith('route_on:')) {
      const idx = parseInt(sub.split(':')[1], 10);
      const loc = availableLocations[idx];
      const sel = parseSelections(session?.selections_json);
      const routes = sel.routes || [];
      if (!routes.includes(loc)) routes.push(loc);
      const updated = await patchSelections(member.id, guild.id, { routes });
      return interaction.update(buildRouteStep(idx, updated));
    }

    // ── route OFF ──
    if (sub.startsWith('route_off:')) {
      const idx = parseInt(sub.split(':')[1], 10);
      const loc = availableLocations[idx];
      const sel = parseSelections(session?.selections_json);
      const routes = (sel.routes || []).filter(r => r !== loc);
      const updated = await patchSelections(member.id, guild.id, { routes });
      return interaction.update(buildRouteStep(idx, updated));
    }

    // ── route prev ──
    if (sub.startsWith('route_prev:')) {
      const idx = Math.max(0, parseInt(sub.split(':')[1], 10) - 1);
      const sel = parseSelections(session?.selections_json);
      return interaction.update(buildRouteStep(idx, sel));
    }

    // ── route next ──
    if (sub.startsWith('route_next:')) {
      const idx = Math.min(availableLocations.length - 1, parseInt(sub.split(':')[1], 10) + 1);
      const sel = parseSelections(session?.selections_json);
      return interaction.update(buildRouteStep(idx, sel));
    }

    // ── route skip / done → rarities ──
    if (sub === 'route_skip' || sub === 'route_done') {
      const sel = parseSelections(session?.selections_json);
      await db.upsertOnboardingSession({ discordId: member.id, guildId: guild.id, step: 'rarities' }).catch(() => {});
      return interaction.update(buildRarityStep(sel));
    }

    // ── rarity toggle ──
    if (sub.startsWith('rarity_toggle:')) {
      const key = sub.split(':')[1];
      const sel = parseSelections(session?.selections_json);
      const rarities = sel.rarities || [];
      const updated = rarities.includes(key)
        ? rarities.filter(k => k !== key)
        : [...rarities, key];
      const newSel = await patchSelections(member.id, guild.id, { rarities: updated });
      return interaction.update(buildRarityStep(newSel));
    }

    // ── rarity skip / done → pokemon ──
    if (sub === 'rarity_skip' || sub === 'rarity_done') {
      const sel = parseSelections(session?.selections_json);
      await db.upsertOnboardingSession({ discordId: member.id, guildId: guild.id, step: 'pokemon' }).catch(() => {});
      return interaction.update(buildPokemonStep(0, sel));
    }

    // ── pokemon toggle ──
    if (sub.startsWith('pokemon_toggle:')) {
      const parts = sub.split(':');
      const dbKey = parts[1];
      const page = parseInt(parts[2] || '0', 10);
      const pokemonDef = pokemonRoles.find(p => labelToDbPokemonKey(p.label) === dbKey);
      if (!pokemonDef) return interaction.deferUpdate();
      const sel = parseSelections(session?.selections_json);
      const pokemon = sel.pokemon || [];
      const updated = pokemon.includes(pokemonDef.label)
        ? pokemon.filter(l => l !== pokemonDef.label)
        : [...pokemon, pokemonDef.label];
      const newSel = await patchSelections(member.id, guild.id, { pokemon: updated });
      return interaction.update(buildPokemonStep(page, newSel));
    }

    // ── pokemon prev / next ──
    if (sub.startsWith('pokemon_prev:') || sub.startsWith('pokemon_next:')) {
      const isPrev = sub.startsWith('pokemon_prev:');
      const cur = parseInt(sub.split(':')[1], 10);
      const totalPages = Math.ceil(pokemonRoles.length / POKEMON_PER_PAGE);
      const page = isPrev ? Math.max(0, cur - 1) : Math.min(totalPages - 1, cur + 1);
      const sel = parseSelections(session?.selections_json);
      return interaction.update(buildPokemonStep(page, sel));
    }

    // ── pokemon skip / done → summary ──
    if (sub === 'pokemon_skip' || sub === 'pokemon_done') {
      const sel = parseSelections(session?.selections_json);
      await db.upsertOnboardingSession({ discordId: member.id, guildId: guild.id, step: 'summary' }).catch(() => {});
      return interaction.update(buildSummary(sel, config));
    }

    // ── confirm ──
    if (sub === 'confirm') {
      if (!session) {
        return interaction.reply({ content: '❌ Session expired. Please contact staff.', flags: 64 });
      }
      return finishSession(interaction, config, session, member);
    }

    // Unrecognised — ack silently
    return interaction.deferUpdate().catch(() => {});
  }
};
