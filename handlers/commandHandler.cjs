// handlers/commandHandler.cjs
const path = require('path');
const fs = require('fs');

const commands = new Map();

// Auto-load every file in /commands
const commandsDir = path.join(__dirname, '..', 'commands');
const files = fs.readdirSync(commandsDir).filter(f => f.endsWith('.cjs'));

for (const file of files) {
  const filePath = path.join(commandsDir, file);
  const commandModule = require(filePath);

  if (!commandModule || !commandModule.data || !commandModule.execute) {
    console.warn(`⚠ Skipping invalid command module: ${file}`);
    continue;
  }
  
  commands.set(commandModule.data.name, commandModule);
}

module.exports = async (client, interaction) => {
  const cmd = commands.get(interaction.commandName);
  if (!cmd) {
    return interaction.reply({ content: "❌ Unknown command.", ephemeral: true });
  }

  try {
    await cmd.execute(client, interaction);
  } catch (err) {
    console.error(`❌ Error in command ${interaction.commandName}:`, err);

    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: '❌ An error occurred.', ephemeral: true });
    }
  }
};
