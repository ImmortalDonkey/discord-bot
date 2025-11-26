// utils/googleSheets.cjs

const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');

let sheet = null; // exported reference

/**
 * Initialise Google Sheets (if credentials exist).
 */
async function initGoogleSheet() {
  // If either key is missing, disable
  if (
    !process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY ||
    !process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
  ) {
    console.log("⚠ Sheets disabled (missing private key or email).");
    return;
  }

  try {
    const SHEET_ID = process.env.GOOGLE_SHEET_ID;

    const serviceAuth = new JWT({
      email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      key: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.replace(/\\n/g, '\n'),
      scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });

    const doc = new GoogleSpreadsheet(SHEET_ID, serviceAuth);

    await doc.loadInfo();
    sheet = doc.sheetsByIndex[0];

    console.log(`📄 Connected to Sheet: ${sheet.title}`);
  } catch (err) {
    console.log("❌ Sheets setup failed:", err);
  }
}

module.exports = {
  initGoogleSheet,
  getSheet: () => sheet
};
