// clear-subscriber-guild-commands.cjs

require('dotenv').config();

const { REST, Routes } = require('discord.js');

// Example values (as provided)
const CLIENT_ID = '1436547365711511625';
const SUBSCRIBER_GUILD_ID = '1449573522455400521';

// Token is read from env
const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log(
      `🧹 Clearing guild-scoped commands for subscriber guild ${SUBSCRIBER_GUILD_ID}...`
    );

    // THIS deletes ALL guild-scoped commands for that guild
    await rest.put(
      Routes.applicationGuildCommands(CLIENT_ID, SUBSCRIBER_GUILD_ID),
      { body: [] }
    );

    console.log('✅ Subscriber guild commands cleared successfully');
  } catch (err) {
    console.error('❌ Failed to clear subscriber guild commands:', err);
  }
})();
