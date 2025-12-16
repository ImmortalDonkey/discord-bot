const fs = require('fs');
const path = require('path');

function initEventHandlers(client) {
  const eventsDir = path.join(__dirname, '..', 'events');

  if (!fs.existsSync(eventsDir)) {
    console.warn('⚠ No events directory found');
    return;
  }

  const files = fs.readdirSync(eventsDir).filter(f => f.endsWith('.cjs'));

  for (const file of files) {
    const eventName = file.replace('.cjs', '');
    const eventPath = path.join(eventsDir, file);

    const handler = require(eventPath);

    if (typeof handler !== 'function') {
      console.warn(`⚠ Event "${file}" does not export a function`);
      continue;
    }

    client.on(eventName, (...args) => handler(client, ...args));
    console.log(`✅ Loaded event: ${eventName}`);
  }
}

module.exports = { initEventHandlers };