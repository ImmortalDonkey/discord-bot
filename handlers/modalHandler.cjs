// handlers/modalHandler.cjs
const path = require('path');
const fs = require('fs');

const modalHandlers = [];

const modalsDir = path.join(__dirname, '..', 'interactions', 'modals');
const files = fs.readdirSync(modalsDir).filter(f => f.endsWith('.cjs'));

for (const file of files) {
  const handler = require(path.join(modalsDir, file));
  if (handler && handler.idPrefix && handler.execute) {
    modalHandlers.push(handler);
  } else {
    console.warn(`⚠ Invalid modal handler: ${file}`);
  }
}

module.exports = async (client, interaction) => {
  const id = interaction.customId;

  for (const handler of modalHandlers) {
    if (id.startsWith(handler.idPrefix)) {
      try {
        return await handler.execute(client, interaction);
      } catch (err) {
        console.error(`❌ Modal Error (${id}):`, err);
        return interaction.reply({
          content: '❌ Modal error.',
          ephemeral: true
        });
      }
    }
  }

  return interaction.reply({ content: '❌ Unknown modal.', ephemeral: true });
};

