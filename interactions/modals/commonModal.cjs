// interactions/modals/commonModal.cjs
/**
 * Generic modal handler template
 * Use when you need a simple one-input modal for future features.
 *
 * Custom ID pattern:
 *   commonmodal_<action>
 */

module.exports = {
  // Must be an array to be picked up by modalHandler.cjs
  ids: ["commonmodal_"],

  async execute(client, interaction) {
    const customId = interaction.customId; // ex: commonmodal_notes
    const prefix = "commonmodal_";
    const action = customId.startsWith(prefix)
      ? customId.substring(prefix.length)
      : customId;

    // Example: get text from modal field "input"
    const inputValue = interaction.fields.getTextInputValue("input");

    return interaction.reply({
      content:
        `📝 **Received input for action:** \`${action}\`\n` +
        `**Value:** ${inputValue}`,
      flags: 64 // ephemeral
    });
  }
};
