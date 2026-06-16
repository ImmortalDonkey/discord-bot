'use strict';

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  AttachmentBuilder
} = require('discord.js');
const path = require('path');
const fs = require('fs');

const db = require('../../database.cjs');
const { availableLocations } = require('../../utils/locations.cjs');

const ASSETS_DIR = path.join(__dirname, '..', '..', 'assets', 'report-bg');

function locationSlug(loc) {
  return loc.toLowerCase().replace(/'/g, '').replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

function buildRouteStep(idx, sel) {
  const loc = availableLocations[idx];
  const slug = locationSlug(loc);
  const selected = (sel.routes || []).includes(loc);

  const embed = new EmbedBuilder()
    .setTitle('Step 2 — Route Notifications')
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

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`onboard_route_next:${idx}`)
      .setLabel('Next →')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('onboard_route_skip')
      .setLabel('Skip routes')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('onboard_route_done')
      .setLabel('Done with routes')
      .setStyle(ButtonStyle.Success)
  );

  return { embeds: [embed], components: [row1, row2], files };
}

module.exports = {
  ids: ['onboarding_ign_modal'],

  async execute(client, interaction) {
    const ign = interaction.fields.getTextInputValue('ign_input')?.trim();
    const { member, guild } = interaction;

    if (!ign) {
      return interaction.reply({ content: '❌ IGN cannot be empty.', flags: 64 });
    }

    // Update session: store IGN, advance to routes step
    const session = await db.getOnboardingSession(member.id, guild.id).catch(() => null);
    let sel = {};
    try { sel = JSON.parse(session?.selections_json || '{}'); } catch {}
    sel.ign = ign;

    await db.upsertOnboardingSession({
      discordId: member.id,
      guildId: guild.id,
      step: 'routes',
      selectionsJson: JSON.stringify(sel)
    }).catch(() => {});

    await db.setPlayerIgn(member.id, ign).catch(() => {});

    // Reply goes to the private thread automatically
    return interaction.reply(buildRouteStep(0, sel));
  }
};
