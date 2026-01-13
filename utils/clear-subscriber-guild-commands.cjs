// utils/clear-subscriber-guild-commands.cjs

require('dotenv').config();

const { REST, Routes } = require('discord.js');

const CLIENT_ID = '1436547365711511625';          // your app ID
const SUBSCRIBER_GUILD_ID = '1105396606372683826'; // <-- NEW subscriber guild

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log(
      `🧹 Clearing guild-scoped commands for subscriber guild ${SUBSCRIBER_GUILD_ID}...`
    );

    await rest.put(
      Routes.applicationGuildCommands(
        CLIENT_ID,
        SUBSCRIBER_GUILD_ID
      ),
      { body: [] } // deletes ALL guild-scoped commands for this guild
    );

    console.log('✅ Subscriber guild commands cleared successfully');
  } catch (err) {
    console.error('❌ Failed to clear subscriber guild commands:', err);
  }
})();
