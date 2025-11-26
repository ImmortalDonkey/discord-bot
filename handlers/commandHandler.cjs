// handlers/commandHandler.cjs
//
// Loads all slash commands from /commands/*.cjs
// Registers them into client.commands Map
// Executes the correct file when a slash command is used.
//

const fs = require('fs');
const path = require('path');

module.exports = (client) => {
  client.commands = new Map();

  const commandsPath = path.join(__dirname, '..', 'commands');
  const commandFiles = fs.readdirSync(commandsPath)
    .filter(file => file.endsWith('.cjs'));

  for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);

    if (!command.data || !command.execute) {
      console.warn(`⚠ Skipping invalid command file: ${file}`);
      continue;
    }

    client.commands.set(command.data.name, command);
    console.log(`📦 Loaded command: ${command.data.name}`);
  }

  // Execute on interaction
  client.on('interactionCreate', async interaction => {
    if (!interaction.isCommand()) return;

    const command = client.commands.get(interaction.commandName);
    if (!command) {
      console.warn(`⚠ Command not found: ${interaction.commandName}`);
      return;
    }

    try {
      await command.execute(interaction, client);
    } catch (err) {
      console.error(`❌ Error executing /${interaction.commandName}:`, err);
      if (!interaction.replied) {
        interaction.reply({
          content: '❌ An error occurred while running this command.',
          ephemeral: true
        }).catch(() => {});
      }
    }
  });
};

