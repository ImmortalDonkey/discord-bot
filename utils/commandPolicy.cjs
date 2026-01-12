/**
 * Command execution policy by guild type
 */

const SUBSCRIBER_COMMANDS = new Set([
  'report',
  'reportdebug',
  'reportconfig',
  'leaderboard',
  'ign'
]);

function isMainGuild(guildId) {
  return guildId === process.env.GUILD_ID;
}

function isSubscriberGuild(guildId, subscriberRow) {
  return !!subscriberRow && subscriberRow.enabled === 1;
}

function isCommandAllowed({
  commandName,
  guildId,
  subscriberRow
}) {
  if (isMainGuild(guildId)) return true;

  if (isSubscriberGuild(guildId, subscriberRow)) {
    return SUBSCRIBER_COMMANDS.has(commandName);
  }

  return false;
}

module.exports = {
  isCommandAllowed
};