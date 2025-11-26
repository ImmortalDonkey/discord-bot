// interactions/modals/commonModal.cjs
/**
 * Generic modal handler template
 * Use when you need a simple one-input modal for future features.
 *
 * Custom ID: commonmodal_<action>
 */

module.exports = {
  idStartsWith: "commonmodal_",

  async execute(client, interaction) {
    const customId = interaction.customId; // ex: commonmodal_notes
    const action = customId.substring("commonmodal_".length);

    // Example: get text from modal field "input"
    const inputValue = interaction.fields.getTextInputValue("input");

    return interaction.reply({
      content: `📝 **Received input for action:** \`${action}\`\n**Value:** ${inputValue}`,
      ephemeral: true
    });
  }
};

