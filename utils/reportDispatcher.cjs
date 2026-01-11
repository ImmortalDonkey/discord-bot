/**
 * utils/reportDispatcher.cjs
 *
 * Handles dispatching of Vortex auto roamer reports.
 */

const fs = require('fs');
const path = require('path');
const { AttachmentBuilder } = require('discord.js');

const db = require('../database.cjs');
const { renderReportCard } = require('../renderers/reportCard.cjs');

/**
 * Dispatch a Vortex roamer report
 * @param {Client} client
 * @param {Object} roamer
 */
async function handleVortexRoamer(client, roamer) {
  try {
    if (!roamer) {
      console.warn('⚠ handleVortexRoamer called without roamer');
      return;
    }

    const {
      roamer_name,
      rarity,
      time_found
    } = roamer;

    if (!roamer_name || !rarity || !time_found) {
      console.warn('⚠ Invalid roamer payload:', roamer);
      return;
    }

    console.log(`🛰️ Handling Vortex roamer: ${roamer_name} (${rarity})`);

    // ──────────────────────────────
    // Resolve channel
    // ──────────────────────────────
    const channelId = await db.getReportChannelId(rarity);

    if (!channelId) {
      console.warn(`⚠ No report channel configured for rarity: ${rarity}`);
      return;
    }

    const channel = await client.channels.fetch(channelId).catch(() => null);

    if (!channel) {
      console.warn(`⚠ Could not resolve channel ${channelId}`);
      return;
    }

    console.log(`📍 Posting to channel: ${channel.name}`);

    // ──────────────────────────────
    // Render report card
    // ──────────────────────────────
    const imagePath = await renderReportCard({
      source: 'vortex',
      pokemon: roamer_name,
      rarity,
      time_found
    });

    if (!imagePath || !fs.existsSync(imagePath)) {
      console.error('❌ Report card render failed');
      return;
    }

    const attachment = new AttachmentBuilder(imagePath);

    // ──────────────────────────────
    // Send message
    // ──────────────────────────────
    const message = await channel.send({
      content: `🛰️ **${roamer_name}** has appeared!`,
      files: [attachment]
    });

    console.log(`✅ Vortex card posted: ${roamer_name} (${rarity})`);

    // ──────────────────────────────
    // Persist message reference
    // ──────────────────────────────
    await db.insertReportMessage({
      report_id: `vortex_${time_found}`,
      channel_id: channel.id,
      message_id: message.id
    });

  } catch (err) {
    console.error('❌ handleVortexRoamer failed:', err);
  }
}

module.exports = {
  handleVortexRoamer
};