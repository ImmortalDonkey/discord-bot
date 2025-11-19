// debug-sheet.js
require('dotenv').config();
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');

(async () => {
  console.log("🔎 Debugging sheet column names...");

  const serviceAuth = new JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });

  const doc = new GoogleSpreadsheet(process.env.GOOGLE_SHEET_ID, serviceAuth);
  await doc.loadInfo();
  const sheet = doc.sheetsByIndex[0];
  console.log(`📄 Sheet: ${sheet.title}`);

  const rows = await sheet.getRows();
  if (!rows.length) return console.log("❌ No rows found!");

  console.log("🧾 Example row keys:", Object.keys(rows[0]));
})();
