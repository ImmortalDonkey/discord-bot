require('dotenv').config();
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const db = require('./database');

(async () => {
  console.log("🚀 Starting Google Sheet ➝ SQLite migration...");

  // ================================
  // Setup Google Sheets authentication
  // ================================
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || !process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL) {
    console.error("❌ Missing Google Sheets credentials in .env");
    process.exit(1);
  }

  const serviceAuth = new JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });

  // ================================
  // Load sheet
  // ================================
  const doc = new GoogleSpreadsheet(process.env.GOOGLE_SHEET_ID, serviceAuth);
  await doc.loadInfo();
  const sheet = doc.sheetsByIndex[0];
  console.log(`📄 Connected to Sheet: ${sheet.title}`);

  const rows = await sheet.getRows();
  let countImported = 0;
  let totalPointsImported = 0;

  // ================================
  // Import each row
  // ================================
  console.log("🔄 Importing rows...");
  await db.init(); // Initialize database

  for (const row of rows) {
    const username = row.Username;
    const userId = row.DiscordID;
    const points = parseInt(row.Points);

    if (!userId || isNaN(points)) continue;

    await db.addPoints(userId, username || "Unknown", points, "Sheet migration");
    countImported++;
    totalPointsImported += points;
  }

  console.log("🎉 Migration complete!");
  console.log(`📌 Rows imported: ${countImported}`);
  console.log(`🪙 Total points migrated: ${totalPointsImported}`);
  process.exit(0);
})();
