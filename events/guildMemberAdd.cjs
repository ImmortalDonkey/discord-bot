// events/guildMemberAdd.cjs
const { sendInitialOnboarding } = require("../handlers/onboardingHandler.cjs");

module.exports = async (client, member) => {
  try {
    if (process.env.ROLE_NEW_ARRIVAL) {
      await member.roles.add(process.env.ROLE_NEW_ARRIVAL);
    }
  } catch (e) {
    console.error("❌ Onboarding: failed to add ROLE_NEW_ARRIVAL", e?.message || e);
  }

  await sendInitialOnboarding(member);
};