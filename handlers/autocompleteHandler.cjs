const path = require('path');
const fs = require('fs');

const autoModules = [];

// Folder: interactions/autocomplete/
const autoDir = path.join(__dirname, '..', 'interactions', 'autocomplete');

if (fs.existsSync(autoDir)) {
  const files = fs.readdirSync(autoDir).filter(f => f.endsWith('.cjs'));

  for (const file of files) {
    const mod = require(path.join(autoDir, file));

    // EXPECTED:
    // commands: ["report"]
    // options: ["pokemon"]
    // run(interaction)

    if (
      mod &&
      Array.isArray(mod.commands) &&
      Array.isArray(mod.options) &&
      typeof mod.run === "function"
    ) {
      autoModules.push(mod);
      console.log(`✅ Loaded autocomplete: ${file}`);
    } else {
      console.warn(`⚠ Invalid autocomplete file skipped: ${file}`);
    }
  }
} else {
  console.warn('⚠ autocomplete directory missing:', autoDir);
}

module.exports = async (client, interaction) => {
  const cmd = interaction.commandName;
  const focused = interaction.options.getFocused(true);
  const option = focused?.name;

  // Debug log
  // console.log("Autocomplete event:", { cmd, option });

  // Look for a matching module
  const mod = autoModules.find(m =>
    m.commands.includes(cmd) && m.options.includes(option)
  );

  if (!mod) {
    console.warn(`❌ No autocomplete match: command=${cmd} option=${option}`);
    return;
  }

  try {
    await mod.run(interaction);
  } catch (err) {
    console.error(`❌ Autocomplete error in ${cmd}/${option}:`, err);
  }
};
