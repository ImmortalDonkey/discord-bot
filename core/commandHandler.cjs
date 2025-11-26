// core/commandHandler.cjs
const fs = require("fs");
const path = require("path");

const commandsDir = path.join(__dirname, "..", "interactions", "commands");

// Cache command modules
const commandModules = new Map();

// Load all command files
for (const file of fs.readdirSync(commandsDir)) {
  if (!file.endsWith(".cjs")) continue;

  const cmd = require(path.join(commandsDir, file));

  /**
   * Each command must export:
   *  - name: "setlocation"
   *  - execute(client, interaction)
   */
  if (!cmd.name || !cmd.execute) {
    console.warn(`⚠ Invalid command module: ${file}`);
    continue;
  }

  commandModules.set(cmd.name, cmd);
}

console.log(`📦 Loaded ${commandModules.size} command modules.`);

module.exports = {
  async handle(client, interaction) {
    if (!interaction.isChatInputCommand()) return false;

    const cmd = commandModules.get(interaction.commandName);

    if (!cmd) {
      console.warn(`⚠ No handler for command: ${interaction.commandName}`);
      return false;
    }

    try {
      await cmd.execute(client, interaction);
    } catch (err) {
      console.error(`❌ Error in command ${interaction.commandName}:`, err);
      try {
        await interaction.reply({
          content: "❌ An error occurred while executing this command.",
          ephemeral: true
        });
      } catch {}
    }

    return true;
  }
};
