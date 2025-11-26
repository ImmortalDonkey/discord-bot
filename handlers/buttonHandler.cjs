// handlers/buttonHandler.cjs
const path = require('path');
const fs = require('fs');

const buttonHandlers = [];

// Load every file in interactions/buttons
const buttonsDir = path.join(__dirname, '..', 'interactions', 'buttons');
const files = fs.readdirSync(buttonsDir).filter(f => f.endsWith('.cjs'));

for (const file of files) {
  const handler = require(path.join(buttonsDir, file));
  if (handler && handler.ids && handler.execute) {
    buttonHandlers.push(handler);
  } else {
    console.warn(`⚠ Invalid button handler: ${file}`);
  }
}

module.exports = async (client, interaction) => {
  const id = interaction.customId;

  for (const handler of buttonHandlers) {
    if (handler.ids.some(prefix => id.startsWith(prefix))) {
      try {
        return await handler.execute(client, interaction);
      } catch (err) {
        console.error(`❌ Button Error (${id}):`, err);
        return interaction.reply({
          content: '❌ Button error.',
          ephemeral: true
        });
      }
    }
  }

  return interaction.reply({ content: '❌ Unknown button.', ephemeral: true });
};

