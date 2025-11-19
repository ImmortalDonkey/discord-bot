require('dotenv').config();
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const db = require('./database');

(async () => {
  console.log("🚀 Starting Google Sheet ➝ SQLite migration...");

  // Google Sheets auth
  const serviceAuth = new JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });

  const doc = new GoogleSpreadsheet(process.env.GOOGLE_SHEET_ID, serviceAuth);
  await doc.loadInfo();
  const sheet = doc.sheetsByIndex[0];
  console.log(`📄 Connected to Sheet: ${sheet.title}`);

  const rows = await sheet.getRows();
  await db.init();

  let imported = 0;
  let total = 0;

  console.log("📦 Importing rows...");

  for (const row of rows) {
    const data = row._rawData;
    if (!data || data.length < 3) continue;

    const username = data[0];
    const userId = data[1];
    const points = parseInt(data[2]);

    if (!userId || isNaN(points)) continue;

    await db.addPoints(userId, username || "Unknown", points, "Sheet migration");
    imported++;
    total += points;
  }

  console.log(`🎉 Migration complete!`);
  console.log(`📌 Rows imported: ${imported}`);
  console.log(`🪙 Total points migrated: ${total}`);

  process.exit(0);
})();
