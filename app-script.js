/**
 * ☕️ Vancouver Coffee Bean Automation (v3.1 Final Safe Mode)
 * * FEATURES:
 * 1. Robust Fetching: Deduplication based on Shop + Name.
 * 2. Auto-Safe: No UI alerts.
 * 3. AI Enrichment: Master function (Turtle Mode) preserved.
 * 4. XHS Generator:
 * - Strict Prompt (Chinese).
 * - Shop Diversity (Try to pick 3 diff shops).
 * - 30-Day Cooldown (No repeats within a month).
 * * * SETUP:
 * 1. Run 'setupHeaders' once manually to add the "Last Promoted Date" column.
 */

// ================= CONFIGURATION =================

/**
 * IMPORTANT: For security, set these in Script Properties instead of hardcoding:
 *
 * In Google Apps Script Editor:
 * 1. Go to Project Settings (gear icon on left sidebar)
 * 2. Scroll to "Script Properties"
 * 3. Click "Add script property"
 * 4. Add these properties:
 *    - GEMINI_API_KEY: Your Gemini API key
 *    - SPREADSHEET_ID: Your Google Sheets ID
 *    - GITHUB_TOKEN: Your GitHub personal access token
 *
 * OR use the legacy method:
 * File > Project properties > Script properties tab > Add rows
 */

// Get configuration from Script Properties (preferred) or fallback to constants
function getConfig() {
  const props = PropertiesService.getScriptProperties();

  return {
    GEMINI_API_KEY: props.getProperty('GEMINI_API_KEY') || "",
    SPREADSHEET_ID: props.getProperty('SPREADSHEET_ID') || "",
    GITHUB_TOKEN: props.getProperty('GITHUB_TOKEN') || ""
  };
}

// Default constants (used as fallback if Script Properties not set)
const GEMINI_API_KEY = "";
const SPREADSHEET_ID = "";
const DATA_SHEET_NAME = "Sheet1";

// Model Configuration
const ENRICH_MODEL = "gemini-2.5-flash";  // Cheap model for bulk enrichment
const REPORT_MODEL = "gemini-2.5-pro";    // Premium model for weekly reports

// GitHub Configuration
const GITHUB_OWNER = "minzhang28";
const GITHUB_REPO = "coffee-weekly";
const GITHUB_TOKEN = "";

// ============ TUNING PARAMETERS ============

/**
 * SCORING WEIGHTS (must add up to 1.0)
 * Adjust these to change recommendation priorities
 */
const SCORING_WEIGHTS = {
  quality: 0.40,      // Rare varieties, special processes, famous farms (40%)
  seasonality: 0.25,  // Freshness and crop timing (25%)
  value: 0.25,        // Price fairness (25%)
  versatility: 0.10   // Roast match for brew method (10%)
};

/**
 * CANDIDATE SELECTION
 * How many top candidates to send to AI for final selection
 */
const TOP_CANDIDATES_COUNT = 6;  // AI picks 2 from these 6 per category

/**
 * PROMOTION RULES
 */
const COOLDOWN_DAYS = 30;   // Days before same bean can be promoted again
const FRESHNESS_DAYS = 14;  // Only consider beans synced in last N days

/**
 * ENRICHMENT SETTINGS
 */
const ENRICH_SLEEP_SECONDS = 2;        // Cooldown between API calls
const ENRICH_ERROR_SLEEP_SECONDS = 120; // Cooldown after rate limit error

/**
 * PRESET SCORING PROFILES
 * Uncomment one to quickly switch between strategies:
 */

// BALANCED (Default) - Mix of specialty and value
// Current settings above

// ADVENTUROUS - Favor rare varieties and seasonality
// SCORING_WEIGHTS = { quality: 0.50, seasonality: 0.30, value: 0.10, versatility: 0.10 };

// VALUE-FOCUSED - Prioritize price fairness
// SCORING_WEIGHTS = { quality: 0.30, seasonality: 0.20, value: 0.40, versatility: 0.10 };

// SEASONAL - Emphasize fresh arrivals
// SCORING_WEIGHTS = { quality: 0.35, seasonality: 0.40, value: 0.15, versatility: 0.10 };

// =================================================

function onOpen() {
  try {
    SpreadsheetApp.getUi().createMenu('☕️ Coffee DB')
      .addItem('🔄 1. Sync Data', 'syncCoffeeData')
      .addItem('🧠 2. AI Enrich', 'enrichNewBeans')
      .addItem('📝 3. Generate Post', 'generateWeeklyPost')
      .addSeparator()
      .addItem('🔁 Reset Status to Pending', 'resetStatusToPending')
      .addSeparator()
      .addItem('🛠 Setup Headers', 'setupHeaders')
      .addItem('🔧 Setup Script Properties', 'setupScriptProperties')
      .addItem('🔍 Check Configuration', 'checkConfiguration')
      .addSeparator()
      .addItem('🔍 Debug Prototype', 'debugPrototype')
      .addItem('🔍 Debug Rogue Wave', 'debugRogueWave')
      .addToUi();
  } catch (e) {
    console.log("UI menu skipped (Automation mode).");
  }
}

/**
 * Interactive setup for Script Properties
 * Run this once to configure your API keys and IDs securely
 */
function setupScriptProperties() {
  const ui = SpreadsheetApp.getUi();

  // Get current values
  const props = PropertiesService.getScriptProperties();
  const currentGemini = props.getProperty('GEMINI_API_KEY') || "";
  const currentSpreadsheet = props.getProperty('SPREADSHEET_ID') || "";
  const currentGithub = props.getProperty('GITHUB_TOKEN') || "";

  // Gemini API Key
  const geminiResponse = ui.prompt(
    'Setup: Gemini API Key',
    `Enter your Gemini API key:\n\nCurrent: ${currentGemini ? '***' + currentGemini.slice(-4) : 'Not set'}\n\nGet one at: https://aistudio.google.com/app/apikey`,
    ui.ButtonSet.OK_CANCEL
  );

  if (geminiResponse.getSelectedButton() === ui.Button.OK) {
    const geminiKey = geminiResponse.getResponseText().trim();
    if (geminiKey) {
      props.setProperty('GEMINI_API_KEY', geminiKey);
      console.log('✅ Gemini API Key saved');
    }
  }

  // Spreadsheet ID
  const spreadsheetResponse = ui.prompt(
    'Setup: Spreadsheet ID',
    `Enter your Google Sheets ID:\n\nCurrent: ${currentSpreadsheet || 'Not set'}\n\nFind it in your sheet URL:\nhttps://docs.google.com/spreadsheets/d/[SPREADSHEET_ID]/edit`,
    ui.ButtonSet.OK_CANCEL
  );

  if (spreadsheetResponse.getSelectedButton() === ui.Button.OK) {
    const spreadsheetId = spreadsheetResponse.getResponseText().trim();
    if (spreadsheetId) {
      props.setProperty('SPREADSHEET_ID', spreadsheetId);
      console.log('✅ Spreadsheet ID saved');
    }
  }

  // GitHub Token
  const githubResponse = ui.prompt(
    'Setup: GitHub Token',
    `Enter your GitHub personal access token:\n\nCurrent: ${currentGithub ? '***' + currentGithub.slice(-4) : 'Not set'}\n\nCreate one at:\nhttps://github.com/settings/tokens\n(Need: repo scope)`,
    ui.ButtonSet.OK_CANCEL
  );

  if (githubResponse.getSelectedButton() === ui.Button.OK) {
    const githubToken = githubResponse.getResponseText().trim();
    if (githubToken) {
      props.setProperty('GITHUB_TOKEN', githubToken);
      console.log('✅ GitHub Token saved');
    }
  }

  ui.alert(
    'Setup Complete',
    'Script Properties have been saved securely.\n\nRun "Check Configuration" to verify everything is set up correctly.',
    ui.ButtonSet.OK
  );
}

/**
 * Check if all required configuration is set
 */
function checkConfiguration() {
  const config = getConfig();

  const status = {
    gemini: config.GEMINI_API_KEY ? '✅ Set' : '❌ Missing',
    spreadsheet: config.SPREADSHEET_ID ? '✅ Set' : '❌ Missing',
    github: config.GITHUB_TOKEN ? '✅ Set' : '⚠️ Optional (needed for GitHub push)'
  };

  const message = `Configuration Status:

Gemini API Key: ${status.gemini}
Spreadsheet ID: ${status.spreadsheet}
GitHub Token: ${status.github}

${!config.GEMINI_API_KEY || !config.SPREADSHEET_ID ? '\n⚠️ Run "Setup Script Properties" to configure missing items.' : '✅ All required settings configured!'}`;

  console.log(message);

  try {
    SpreadsheetApp.getUi().alert('Configuration Check', message, SpreadsheetApp.getUi().ButtonSet.OK);
  } catch (e) {
    console.log("UI alert skipped (Automation mode).");
  }
}

function getTargetSheet() {
  const config = getConfig();
  const spreadsheetId = config.SPREADSHEET_ID || SPREADSHEET_ID;

  if (!spreadsheetId) {
    throw new Error("SPREADSHEET_ID not configured. Set it in Script Properties or in code.");
  }

  const ss = SpreadsheetApp.openById(spreadsheetId);
  let sheet = ss.getSheetByName(DATA_SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(DATA_SHEET_NAME);
  return sheet;
}

/**
 * CORE 1: SYNC DATA (With Deduplication)
 * Uses Shop + Name as a unique key to prevent duplicates.
 */
function syncCoffeeData() {
  console.log("Starting Data Sync...");
  const sheet = getTargetSheet();
  const lastRow = sheet.getLastRow();

  // 1. Build existing fingerprint map (Shop + Name) to prevent duplicates
  let existingMap = new Map(); // Store row numbers for quick lookup
  if (lastRow > 1) {
    const data = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
    data.forEach((row, index) => {
      // Key: "shop_beanname" (lowercase for safety)
      const key = (row[0] + "_" + row[1]).trim().toLowerCase();
      existingMap.set(key, index + 2); // Store row number (index + 2 because loop starts at 0 and header is 1)
    });
  }

  // 2. Fetch Real Data
  const scrapedData = fetchAllShopifyData();
  console.log(`Total candidates fetched: ${scrapedData.length}`);

  let newCount = 0;
  let updateCount = 0;

  // 3. Process Data
  scrapedData.forEach(item => {
    const key = (item.shop + "_" + item.name).trim().toLowerCase();

    if (!existingMap.has(key)) {
      // --- NEW BEAN (Add only if not exists) ---
      sheet.appendRow([
        item.shop,
        item.name,
        item.price,
        "",              // Weight (empty, filled during enrichment)
        item.stock,
        item.desc,
        item.url,
        item.imageUrl || "", // Image URL (Column 8)
        item.roastDate,
        new Date(),
        "", "", "", "", "", "", "", "", "", "", "", "",         // 11-22 (12 fields)
        "", "", "", "", "", "", "", "", "", "", "", "",         // 23-34 (12 fields)
        "PENDING",       // 35 Status
        ""               // 36 Last Promoted Date (Empty initially)
      ]);
      newCount++;
      // Add to map to prevent dupes within the same fetch batch
      existingMap.set(key, "just_added");
    } else {
      // --- EXISTING BEAN (Update Stock/Price/Image) ---
      const rowIndex = existingMap.get(key);
      if (rowIndex !== "just_added") {
        sheet.getRange(rowIndex, 3).setValue(item.price);
        sheet.getRange(rowIndex, 5).setValue(item.stock);
        if (item.imageUrl) {
          sheet.getRange(rowIndex, 8).setValue(item.imageUrl); // Update image URL
        }
        sheet.getRange(rowIndex, 10).setValue(new Date()); // Updated At is column 10
        updateCount++;
      }
    }
  });

  console.log(`Sync Complete! New Beans: ${newCount}, Updated Stock: ${updateCount}`);
}

/**
 * UTILITY: RESET STATUS TO PENDING
 * Resets column AH (Status) to "PENDING" for all rows (or specific statuses).
 * Options:
 * - resetAll: true = Reset all rows (default)
 * - resetAll: false = Only reset COMPLETED, SKIPPED, ERROR rows (preserve PENDING)
 */
function resetStatusToPending(resetAll = true) {
  console.log("🔄 Resetting Status column to PENDING...");

  const sheet = getTargetSheet();
  const lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    console.log("No data rows to reset.");
    return;
  }

  // Read current status values
  const statusRange = sheet.getRange(2, 35, lastRow - 1, 1); // Status column (35)
  const statuses = statusRange.getValues();

  let resetCount = 0;

  // Update status values
  const newStatuses = statuses.map(row => {
    const currentStatus = row[0];

    if (resetAll) {
      // Reset all rows
      resetCount++;
      return ["PENDING"];
    } else {
      // Only reset non-PENDING rows
      if (currentStatus === "COMPLETED" || currentStatus === "SKIPPED" || currentStatus === "ERROR") {
        resetCount++;
        return ["PENDING"];
      }
      return [currentStatus];
    }
  });

  // Write back to sheet
  statusRange.setValues(newStatuses);

  console.log(`✅ Reset complete! ${resetCount} rows set to PENDING.`);

  // Show user confirmation
  try {
    SpreadsheetApp.getUi().alert(
      'Status Reset Complete',
      `${resetCount} rows have been reset to PENDING.\n\nYou can now run "AI Enrich" to re-process these beans.`,
      SpreadsheetApp.getUi().ButtonSet.OK
    );
  } catch (e) {
    console.log("UI alert skipped (Automation mode).");
  }
}

/**
 * CORE 2: AI ENRICHMENT (MASTER VERSION)
 * Strictly preserved as requested.
 */
function enrichNewBeans() {
  console.log("🚀 Starting Master Enrichment...");

  // === ⚙️ Core Configuration (from top of script) ===
  const SLEEP_SECONDS = ENRICH_SLEEP_SECONDS;
  const ERROR_SLEEP_SECONDS = ENRICH_ERROR_SLEEP_SECONDS;
  // ================================

  // === 💰 Cost Tracking ===
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  const PROMPT_TOKENS = 800;      // Estimated prompt size
  const DESC_TOKENS_AVG = 200;    // Average description size
  const OUTPUT_TOKENS_AVG = 300;  // Average response size
  // ========================

  const sheet = getTargetSheet();
  const lastRow = sheet.getLastRow();

  if (lastRow < 2) return;

  const range = sheet.getRange(2, 1, lastRow - 1, 36); // Read all 36 columns
  const values = range.getValues();
  let processedCount = 0;

  for (let i = 0; i < values.length; i++) {
    const row = values[i];

    const beanName = row[1];
    const priceStr = row[2];
    const stock = row[4];
    const rawDesc = row[5];
    const status = row[34]; // Column 35 (0-indexed)

    if (status === "PENDING") {

      if (stock !== "In Stock") {
        console.log(`⏩ Skipping Row ${i+2} (${beanName}): Sold Out`);
        sheet.getRange(i + 2, 35).setValue("SKIPPED"); // Status column (35)
        SpreadsheetApp.flush();
        continue;
      }

      if (rawDesc) {
        let success = false;
        let attempt = 1;

        while (!success && attempt <= 2) {
          try {
            console.log(`⚡ Processing Row ${i+2} (${attempt}/2): ${beanName}...`);

            const enriched = enrichSingleBean(rawDesc, priceStr);

            const getVal = (key) => {
              if (!enriched) return "";
              const foundKey = Object.keys(enriched).find(k => k.toLowerCase() === key.toLowerCase());
              return foundKey ? enriched[foundKey] : "";
            };

            const rowData = [
              getVal("country"), getVal("region"), getVal("farm"), getVal("altitude"),
              getVal("variety"), getVal("process"), getVal("roast_level"), getVal("usage"),
              getVal("flavors"), getVal("acidity"), getVal("sweetness"), getVal("body"),
              getVal("in_season_status"),
              getVal("seasonality_reason"),
              getVal("freshness_score"),
              getVal("is_rare"), getVal("is_microlot"), getVal("is_special_process"), getVal("is_exclusive"),
              getVal("score_v60"), getVal("score_espresso"),
              getVal("price_per_gram"), getVal("value_score"),
              getVal("recommend_reason")
            ];

            // Write enrichment data (24 fields starting at column 11: Country)
            sheet.getRange(i + 2, 11, 1, 24).setValues([rowData]);

            // Write extracted weight directly to Column 4 (Weight)
            const weight = getVal("weight_extracted");
            if (weight) {
              sheet.getRange(i + 2, 4).setValue(weight);
            }

            sheet.getRange(i + 2, 35).setValue("COMPLETED"); // Status column (35)

            SpreadsheetApp.flush();

            processedCount++;
            success = true;

            // Track token usage for cost estimation
            totalInputTokens += PROMPT_TOKENS + DESC_TOKENS_AVG;
            totalOutputTokens += OUTPUT_TOKENS_AVG;

            console.log(`☕ Saved Row ${i+2}. Cooling down for ${SLEEP_SECONDS}s...`);
            Utilities.sleep(SLEEP_SECONDS * 1000);

          } catch (e) {
            console.error(`❌ Row ${i+2} Error: ${e.message}`);

            if (e.message.includes("quota") || e.message.includes("429") || e.message.includes("Limit")) {
              console.log(`🛑 Rate Limit Hit! Sleeping for ${ERROR_SLEEP_SECONDS}s...`);
              Utilities.sleep(ERROR_SLEEP_SECONDS * 1000);
            } else {
              sheet.getRange(i + 2, 35).setValue("ERROR"); // Status column (35)
              SpreadsheetApp.flush();
              break;
            }
          }
          attempt++;
        }
      }
    }
  }

  // Calculate and display cost estimate
  // Gemini 2.5 Flash Lite pricing: $0.075/1M input tokens, $0.30/1M output tokens
  const inputCost = (totalInputTokens * 0.075) / 1000000;
  const outputCost = (totalOutputTokens * 0.30) / 1000000;
  const totalCost = inputCost + outputCost;

  console.log(`\n🎉 All Done. Enriched: ${processedCount} beans.`);
  console.log(`📊 Token Usage:`);
  console.log(`   Input: ${totalInputTokens.toLocaleString()} tokens`);
  console.log(`   Output: ${totalOutputTokens.toLocaleString()} tokens`);
  console.log(`💰 Estimated Cost: $${totalCost.toFixed(4)} (Input: $${inputCost.toFixed(4)}, Output: $${outputCost.toFixed(4)})`);
}

/**
 * Enriches a single coffee bean by calling Gemini API
 * @param {string} desc - Coffee description
 * @param {string} priceStr - Price string
 * @returns {Object} Enriched data object with 24 fields
 */
function enrichSingleBean(desc, priceStr) {
  const today = new Date();
  const dateStr = today.toLocaleDateString("en-US", { year: 'numeric', month: 'long' });

  const schema = `
    Role: You are a Professional Coffee Buyer & Q-Grader.
    Context: Today is ${dateStr}.
    Task: Analyze the given coffee description and price to extract structured data for sourcing and evaluation.

    LOGIC 1: SEASONALITY (CRITICAL)
    in_season_status:
    - "Fresh Arrival" – text explicitly mentions "New," "Fresh Crop," or "Just Arrived."
    - "Peak Season" – beans from origins currently at peak availability:
      * Jan–Apr: Central & South America (Brazil, Peru, Colombia, Central America)
      * May–Aug: East Africa (Ethiopia, Kenya, Burundi, Rwanda)
      * Sep–Dec: Asia–Pacific (Indonesia, PNG, Myanmar)
    - "Late Harvest" – Northern Hemisphere coffees outside their arrival window if not labeled "new crop."
    - "Past Crop" – clearly old stock or discounted beans likely past prime.

    seasonality_reason: One concise sentence explaining why it fits that seasonality status (based on harvest and shipping calendars).

    freshness_score:
    - 10 = New arrival or current crop
    - 7–8 = Peak availability
    - 4–6 = Late harvest
    - 1–3 = Past crop

    LOGIC 2: SENSORY INFERENCE
    Infer sensory structure and tactile balance from descriptors:
    - High acidity: citrus, floral, tropical, berry, sparkling
    - Medium acidity: stone fruit, balanced fruit, tea-like
    - Low acidity: chocolate, nutty, spice, earthy, mellow
    - High sweetness: honey, caramel, ripe fruit, syrupy
    - Body: light (tea-like), medium (juicy/silky), heavy (creamy/full)

    LOGIC 3: RARITY (STRICT)
    is_rare: true only if at least one condition holds:
    - Variety: Gesha, Sudan Rume, Eugenioides, Wush Wush, Sidra, Pink Bourbon, Pacamara
    - Process: Anaerobic, Carbonic Maceration, Thermal Shock, Koji, Co-ferment, or any labeled "Experimental"
    - Competition Recognition: "COE," "Auction Lot," "Competition Series," "National Winner"
    - Producer: Finca Deborah, Wilton Benitez, Ninety Plus, El Diviso, or other famous competition producers

    is_special_process: true when process ≠ standard washed/natural/honey
    is_exclusive: true when the lot is direct trade, importer partnership, or uniquely sourced

    LOGIC 4: VALUE AND SCORING
    score_v60 / score_espresso: Target 1–100. If not explicit, infer from quality language ("graded 87+" → 87 score).
    - For blends or when no score available: Use baseline 75 (commercial) or 82 (specialty/single-origin quality)

    price_per_gram: Convert from indicated format ($/lb, $/kg, etc.) into numeric USD-per-gram value.

    value_score: ALWAYS calculate this field (never leave null).

    VALUE = "Is this a good [category] coffee at this price?" NOT "how does this compare to rare Gesha"

    Step 1: Identify Coffee Category and Intent
      Categories:
      A. Daily Espresso Blend (chocolate/caramel, low acidity, milk-friendly, approachable)
      B. Premium Espresso (single-origin or blend with complexity, fruit notes, espresso-focused)
      C. Daily Filter (balanced, versatile, everyday drinking)
      D. Premium Filter (single-origin, distinct origin character, peak season)
      E. Specialty/Microlot (rare variety, special process, competition lot, exceptional quality)

      Indicators:
      - Blends with "chocolate, caramel, smooth, milk-friendly" → Category A
      - Espresso-roasted single-origin with fruit → Category B
      - Blends marked "versatile, balanced, approachable" → Category C
      - Single-origin with clear origin character → Category D
      - Gesha, anaerobic, COE, micro-lot → Category E

    Step 2: Expected Price Range by Category (USD per gram)
      Category A (Daily Espresso): $0.03-0.05/g (good daily driver)
      Category B (Premium Espresso): $0.06-0.09/g (quality espresso)
      Category C (Daily Filter): $0.04-0.06/g (everyday filter)
      Category D (Premium Filter): $0.07-0.11/g (peak season single-origin)
      Category E (Specialty/Microlot): $0.12-0.40/g (rare/competition)

    Step 3: Calculate Fitness Quality (0-10)
      For each category, score how WELL it fulfills its role:

      Category A: Is it truly smooth, chocolatey, milk-friendly? (not sour or bright)
      Category B: Does it have espresso complexity without being too light?
      Category C: Is it truly balanced and versatile?
      Category D: Does it show clear origin character and seasonality?
      Category E: Does it justify rarity (truly special process/variety/competition)?

      Score 8-10: Excellent example of its category
      Score 5-7: Decent but unremarkable for category
      Score 1-4: Poor fit or category mismatch

    Step 4: Calculate Value Score (1-10)
      Formula: value_score = (Fitness Quality * 0.6) + (Price Position * 0.4)

      Price Position:
      - 9-10: Priced below expected range (bargain)
      - 7-8: Lower end of range (good value)
      - 5-6: Mid-range (fair)
      - 3-4: Upper end (premium)
      - 1-2: Above expected (overpriced)

      Examples:
      - $15/340g espresso blend, chocolate/caramel, smooth ($0.044/g, Cat A, Fitness 9): value_score = 9
        (Perfect daily espresso at perfect price)
      - $20/250g Colombia single-origin filter, peak season ($0.08/g, Cat D, Fitness 8): value_score = 8
        (Good single-origin at fair price)
      - $45/250g Gesha Anaerobic, competition lot ($0.18/g, Cat E, Fitness 9): value_score = 8
        (Premium specialty fairly priced)
      - $25/250g generic blend, vague description ($0.10/g, Cat A/C, Fitness 4): value_score = 2
        (Overpriced commodity, unclear category)

    recommend_reason: Summarize why this coffee stands out (category fit, freshness, value, variety, etc.).

    LOGIC 5: DATA COMPLETENESS
    - If any field is unavailable, leave as null (not an empty string)
    - Assume all prices are roasted unless clearly marked as green coffee

    LOGIC 6: WEIGHT EXTRACTION
    weight_extracted: Extract bag size from description in grams (numeric only)
    - Look for patterns like "250g", "340g", "12oz", "1lb", "1kg"
    - Convert to grams: 1oz = 28.35g, 1lb = 453.6g, 1kg = 1000g
    - Return numeric value only (e.g., "250" not "250g")
    - If weight unclear or pack without unit weight, leave null

    OUTPUT FORMAT
    Return a single JSON block using snake_case:
    {
      "country": "",
      "region": "",
      "farm": null,
      "altitude": "",
      "variety": "",
      "process": "",
      "roast_level": "Light/Medium/Dark",
      "usage": "Filter/Espresso/Omni",
      "flavors": "",
      "acidity": "Low/Medium/High",
      "sweetness": "Low/Medium/High",
      "body": "Light/Medium/Heavy",

      "in_season_status": "Fresh Arrival / Peak Season / Late Harvest / Past Crop",
      "seasonality_reason": "",
      "freshness_score": "",

      "is_rare": "",
      "is_microlot": "",
      "is_special_process": "",
      "is_exclusive": "",

      "score_v60": "",
      "score_espresso": "",
      "weight_extracted": "",
      "price_per_gram": "",
      "value_score": "",
      "recommend_reason": ""
    }

    Data:
    Description: ${desc}
    Price: ${priceStr}
  `;

  const result = callGeminiAPI(schema, false, ENRICH_MODEL);
  try {
    return JSON.parse(result.replace(/```json/g, "").replace(/```/g, "").trim());
  } catch (e) {
    return {};
  }
}

/**
 * 📝 CORE 3: WEEKLY REPORT GENERATOR (v2.0 - Multi-Dimensional Scoring + Hybrid AI Selection)
 * FEATURES:
 * 1. 🎯 JavaScript pre-scoring (Quality + Seasonality + Value + Versatility)
 * 2. 🤖 Two-phase AI selection:
 *    - Phase 1: AI picks 2+2 from top 10+10 candidates (with descriptions for context)
 *    - Phase 2: AI generates full bilingual report for selected beans
 * 3. 🛡️ 30-Day Cooldown + Shop Diversity
 * 4. ✅ Fixes duplicate beans and wrong category issues
 */

// ============= SCORING FUNCTIONS =============

function calculateQualityScore(bean) {
  let score = 2.0; // Base score

  const variety = (bean.variety || "").toLowerCase();
  const process = (bean.process || "").toLowerCase();
  const name = (bean.name || "").toLowerCase();

  // Premium varieties (+3)
  const premiumVarieties = ['gesha', 'geisha', 'pink bourbon', 'pacamara', 'eugenioides',
                            'sidra', 'wush wush', 'laurina', 'sudan rume'];
  if (premiumVarieties.some(pv => variety.includes(pv))) {
    score += 3;
  }

  // Rare variety flag (+2)
  if (bean.is_rare === true || bean.is_rare === 'TRUE') {
    score += 2;
  }

  // Special process (+2)
  const specialProcesses = ['anaerobic', 'carbonic', 'koji', 'co-ferment', 'extended fermentation'];
  if (specialProcesses.some(sp => process.includes(sp))) {
    score += 2;
  }

  // Micro lot (+1)
  if (bean.is_microlot === true || bean.is_microlot === 'TRUE') {
    score += 1;
  }

  // Famous farms/producers (+1)
  const famousFarms = ['granja paraiso', 'wilton benitez', 'finca deborah', 'ninety plus',
                       'el diviso', 'altieri', 'finca la esmeralda'];
  if (famousFarms.some(farm => name.includes(farm))) {
    score += 1;
  }

  // Competition (+2)
  if (/\b(coe|competition|auction)\b/i.test(name)) {
    score += 2;
  }

  return Math.min(score, 10);
}

function calculateSeasonalityScore(bean) {
  const seasonScores = {
    'fresh arrival': 10,
    'peak season': 8,
    'late harvest': 5,
    'past crop': 2
  };

  const season = (bean.season_status || "").toLowerCase();
  let score = seasonScores[season] || 5;

  // Freshness adjustment
  const freshness = parseInt(bean.freshness_score) || 5;
  if (freshness >= 9) {
    score = Math.min(score + 1, 10);
  } else if (freshness <= 6) {
    score = Math.max(score - 1, 0);
  }

  return score;
}

function calculateVersatilityScore(bean, brewMethod) {
  const roast = (bean.roast || "").toLowerCase();

  let score = 5; // Default

  if (brewMethod === 'filter') {
    if (roast.includes('light') && !roast.includes('medium')) {
      score = 10;
    } else if (roast.includes('light-medium') || roast.includes('light medium')) {
      score = 8;
    } else if (roast.includes('medium') && !roast.includes('dark')) {
      score = 6;
    } else if (roast.includes('medium-dark') || roast.includes('medium dark')) {
      score = 3;
    } else if (roast.includes('dark')) {
      score = 1;
    }
  } else { // espresso
    if (roast.includes('dark') && !roast.includes('medium')) {
      score = 10;
    } else if (roast.includes('medium-dark') || roast.includes('medium dark')) {
      score = 10;
    } else if (roast.includes('medium') && !roast.includes('light')) {
      score = 9;
    } else if (roast.includes('light-medium') || roast.includes('light medium')) {
      score = 7;
    } else if (roast.includes('light')) {
      score = 5;
    }
  }

  // Bonus for clear tasting notes
  const flavors = bean.flavors || "";
  if (flavors.length > 20) {
    score = Math.min(score + 1, 10);
  }

  // Bonus for high freshness
  const freshness = parseInt(bean.freshness_score) || 5;
  if (freshness > 7) {
    score = Math.min(score + 1, 10);
  }

  return score;
}

function calculateRecommendationScore(bean, brewMethod) {
  const quality = calculateQualityScore(bean);
  const seasonality = calculateSeasonalityScore(bean);
  const value = parseFloat(bean.value_score) || 5.0;
  const versatility = calculateVersatilityScore(bean, brewMethod);

  // Weighted combination using configured weights
  const finalScore =
    (quality * SCORING_WEIGHTS.quality) +
    (seasonality * SCORING_WEIGHTS.seasonality) +
    (value * SCORING_WEIGHTS.value) +
    (versatility * SCORING_WEIGHTS.versatility);

  return {
    quality: quality,
    seasonality: seasonality,
    value: value,
    versatility: versatility,
    final: finalScore
  };
}

/**
 * Post-processes markdown content to insert product images
 * @param {string} markdown - The markdown content from AI
 * @param {Array} beans - Array of bean objects with url and image_url
 * @returns {string} - Markdown with images inserted
 */
function insertProductImages(markdown, beans) {
  let result = markdown;

  beans.forEach(bean => {
    if (!bean.url || !bean.image_url) {
      console.log(`⚠️ Skipping image for ${bean.name} (missing URL or image URL)`);
      return;
    }

    // Escape special regex characters in URL
    const urlEscaped = bean.url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Find heading with this bean's URL: ### ... [bean name](url)\n
    // Insert image line right after the heading
    const pattern = new RegExp(`(###[^\\n]*\\]\\(${urlEscaped}\\)\\n)`, 'g');
    const imageMarkdown = `\n![${bean.name}](${bean.image_url})\n`;

    const beforeReplace = result;
    result = result.replace(pattern, `$1${imageMarkdown}`);

    if (result === beforeReplace) {
      console.log(`⚠️ Could not find heading for: ${bean.name}`);
    } else {
      console.log(`✅ Inserted image for: ${bean.name}`);
    }
  });

  return result;
}

// ============= MAIN FUNCTION =============

function generateWeeklyPost() {
  console.log("☕ Starting Weekly Post (v2.0 - Multi-Dimensional Scoring + Hybrid AI)...");

  const sheet = getTargetSheet();
  const data = sheet.getDataRange().getValues();
  const headers = data[0];

  const idx = {
    shop: headers.indexOf("Shop"),
    name: headers.indexOf("Bean Name"),
    price: headers.indexOf("Price"),
    weight: headers.indexOf("Weight"),
    stock: headers.indexOf("Stock"),
    desc: headers.indexOf("Description"),
    url: headers.indexOf("URL"),
    imageUrl: headers.indexOf("Image URL"),
    roastDate: headers.indexOf("Roast Date"),
    country: headers.indexOf("Country"),
    region: headers.indexOf("Region"),
    variety: headers.indexOf("Variety"),
    process: headers.indexOf("Process"),
    roastLevel: headers.indexOf("Roast Level"),
    usage: headers.indexOf("Usage"),
    flavors: headers.indexOf("Flavor Keywords"),
    inSeason: headers.indexOf("In Season (Status)"),
    seasonReason: headers.indexOf("Seasonality Reason"),
    freshnessScore: headers.indexOf("Freshness Score"),
    isRare: headers.indexOf("Is Rare"),
    isMicrolot: headers.indexOf("Micro Lot"),
    valueScore: headers.indexOf("Value Score"),
    status: headers.indexOf("Status"),
    updatedAt: headers.indexOf("Updated At"),
    lastPromoted: headers.indexOf("Last Promoted Date")
  };

  const today = new Date();
  // Use configured values from top of script
  const cooldownDays = COOLDOWN_DAYS;
  const freshnessDays = FRESHNESS_DAYS;

  const beans = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];

    if (row[idx.status] === "COMPLETED" && row[idx.stock] === "In Stock") {

      // 🛡️ Freshness check (only consider recently synced beans)
      const updatedAt = row[idx.updatedAt];
      let isFresh = false;
      if (updatedAt instanceof Date) {
        const daysSinceUpdate = Math.ceil((today - updatedAt) / (1000 * 60 * 60 * 24));
        if (daysSinceUpdate <= freshnessDays) isFresh = true;
      }

      if (!isFresh) continue; // Skip stale data

      // 🛡️ Promotion cooldown check
      const lastDate = row[idx.lastPromoted];
      let isCool = true;
      if (lastDate instanceof Date) {
        const diffTime = Math.abs(today - lastDate);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        if (diffDays < cooldownDays) isCool = false;
      }

      if (isCool) {
        beans.push({
          rowIndex: i + 1, // Record row number for writing back promotion date
          shop: row[idx.shop],
          name: row[idx.name],
          price: row[idx.price],
          weight: row[idx.weight],
          url: row[idx.url],
          image_url: row[idx.imageUrl], // Product image
          roast_date: formatDate(row[idx.roastDate]),
          origin: `${row[idx.country]} ${row[idx.region]}`,
          variety: row[idx.variety],
          process: row[idx.process],
          roast: row[idx.roastLevel],
          usage: row[idx.usage],
          flavors: row[idx.flavors],
          season_status: row[idx.inSeason],
          season_reason: row[idx.seasonReason],
          is_rare: row[idx.isRare],
          is_microlot: row[idx.isMicrolot],
          freshness_score: row[idx.freshnessScore],
          value_score: row[idx.valueScore],
          description: row[idx.desc] // Need for AI Phase 1
        });
      }
    }
  }

  if (beans.length === 0) {
    console.log(`No beans available (filters: freshness <${freshnessDays} days, cooldown >${cooldownDays} days).`);
    return;
  }

  console.log(`✅ Found ${beans.length} candidate beans after freshness & cooldown filters.`);

  // === 2. Apply Multi-Dimensional Scoring ===

  console.log("🎯 Calculating multi-dimensional scores...");

  const scoredBeans = beans.map(b => {
    const filterScores = calculateRecommendationScore(b, 'filter');
    const espressoScores = calculateRecommendationScore(b, 'espresso');

    return {
      ...b,
      filter_quality: filterScores.quality,
      filter_seasonality: filterScores.seasonality,
      filter_value: filterScores.value,
      filter_versatility: filterScores.versatility,
      filter_score: filterScores.final,
      espresso_quality: espressoScores.quality,
      espresso_seasonality: espressoScores.seasonality,
      espresso_value: espressoScores.value,
      espresso_versatility: espressoScores.versatility,
      espresso_score: espressoScores.final
    };
  });

  console.log(`✅ Scored ${scoredBeans.length} beans with quality/seasonality/value/versatility.`);

  // === 3. Improved Category Filtering (Fix duplicate/wrong category issues) ===

  const filterBeans = scoredBeans.filter(b => {
    const usage = (b.usage || "").toString().toLowerCase();
    const roast = (b.roast || "").toString().toLowerCase();
    const name = (b.name || "").toString().toLowerCase();

    // Exclude beans explicitly named as "Espresso" products (unless also tagged for filter)
    if (name.includes("espresso") && !usage.includes("filter") && !usage.includes("v60")) {
      return false;
    }

    // Include: Filter, V60 usage
    if (usage.includes("filter") || usage.includes("v60")) return true;

    // For Omni beans: Only include if Light roast (avoid overlap with espresso)
    if (usage.includes("omni")) {
      // Only light roast (not light-medium, not medium)
      if (roast.includes("light") && !roast.includes("medium")) {
        return true;
      }
    }

    return false;
  });

  const espressoBeans = scoredBeans.filter(b => {
    const usage = (b.usage || "").toString().toLowerCase();
    const roast = (b.roast || "").toString().toLowerCase();

    // Include: Espresso usage
    if (usage.includes("espresso")) return true;

    // For Omni beans: Include if Medium or darker (but not Light-Medium to avoid light roasts)
    if (usage.includes("omni")) {
      const isLightMedium = roast.includes("light") && roast.includes("medium");
      const isMediumOrDarker = roast.includes("medium") || roast.includes("dark");

      // Include if medium/dark but NOT light-medium
      if (isMediumOrDarker && !isLightMedium) {
        return true;
      }
    }

    return false;
  });

  console.log(`Filter candidates: ${filterBeans.length}, Espresso candidates: ${espressoBeans.length}`);

  if (filterBeans.length === 0 && espressoBeans.length === 0 && scoredBeans.length > 0) {
    console.log("⚠️ Debug: No beans classified. Checking first 3 beans:");
    scoredBeans.slice(0, 3).forEach((b, i) => {
      console.log(`  Bean ${i+1}: usage="${b.usage}", roast="${b.roast}", name="${b.name.substring(0, 40)}"`);
    });
  }

  // Sort by NEW recommendation score (not old value_score)
  const filterSorted = [...filterBeans].sort((a, b) => b.filter_score - a.filter_score);
  const espressoSorted = [...espressoBeans].sort((a, b) => b.espresso_score - a.espresso_score);

  // Get top N candidates for each category (configured at top of script)
  const filterTopN = filterSorted.slice(0, TOP_CANDIDATES_COUNT);
  const espressoTopN = espressoSorted.slice(0, TOP_CANDIDATES_COUNT);

  console.log(`\n🎯 Top ${TOP_CANDIDATES_COUNT} Pour-Over Candidates (by recommendation_score):`);
  filterTopN.forEach((b, i) => {
    console.log(`  ${i+1}. [${b.filter_score.toFixed(2)}] ${b.shop} - ${b.name.substring(0, 45)}`);
    console.log(`      Q:${b.filter_quality.toFixed(1)} S:${b.filter_seasonality.toFixed(1)} V:${b.filter_value.toFixed(1)} Ver:${b.filter_versatility.toFixed(1)}`);
  });

  console.log(`\n🎯 Top ${TOP_CANDIDATES_COUNT} Espresso Candidates (by recommendation_score):`);
  espressoTopN.forEach((b, i) => {
    console.log(`  ${i+1}. [${b.espresso_score.toFixed(2)}] ${b.shop} - ${b.name.substring(0, 45)}`);
    console.log(`      Q:${b.espresso_quality.toFixed(1)} S:${b.espresso_seasonality.toFixed(1)} V:${b.espresso_value.toFixed(1)} Ver:${b.espresso_versatility.toFixed(1)}`);
  });

  if (filterTopN.length < 2 || espressoTopN.length < 2) {
    console.log(`❌ Not enough candidates (Filter: ${filterTopN.length}, Espresso: ${espressoTopN.length})`);
    return;
  }

  // === 4. AI PHASE 1: Bean Selection (with full context including descriptions) ===

  console.log(`\n🤖 AI Phase 1: Selecting 2 pour-over + 2 espresso from top ${TOP_CANDIDATES_COUNT} candidates each...`);

  // Prepare compact data for selection (with descriptions for context!)
  const prepareSelectionData = (bean, index) => {
    // Calculate price per gram safely
    let pricePerGram = 0;
    if (bean.price_per_g) {
      pricePerGram = parseFloat(bean.price_per_g);
    } else if (bean.price && bean.weight) {
      // Handle both string ("$20.00") and number (20.00) formats
      const priceValue = typeof bean.price === 'string'
        ? parseFloat(bean.price.replace('$', ''))
        : parseFloat(bean.price);
      const weightValue = parseFloat(bean.weight);
      if (!isNaN(priceValue) && !isNaN(weightValue) && weightValue > 0) {
        pricePerGram = priceValue / weightValue;
      }
    }

    return {
      index: index + 1,
      shop: bean.shop,
      name: bean.name,
      description: bean.description, // ← OPTION B: Include description for context
      variety: bean.variety,
      process: bean.process,
      roast: bean.roast,
      usage: bean.usage,
      season_status: bean.season_status,
      is_rare: bean.is_rare,
      price_per_g: pricePerGram,
      quality_score: bean.filter_quality || bean.espresso_quality,
      seasonality_score: bean.filter_seasonality || bean.espresso_seasonality,
      value_score: bean.value_score,
      recommendation_score: bean.filter_score || bean.espresso_score
    };
  };

  const selectionData = {
    pour_over_candidates: filterTopN.map((b, i) => prepareSelectionData(b, i)),
    espresso_candidates: espressoTopN.map((b, i) => prepareSelectionData(b, i))
  };

  const selectionPrompt = buildSelectionPrompt(selectionData);

  let selectionResult;
  try {
    const rawSelection = callGeminiAPI(selectionPrompt, false, REPORT_MODEL);
    // Clean potential markdown wrapper
    const cleaned = rawSelection.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    selectionResult = JSON.parse(cleaned);

    console.log("✅ AI Selection Complete:");
    console.log(`   Pour-over picks: ${selectionResult.pour_over_picks.join(", ")}`);
    console.log(`   Espresso picks: ${selectionResult.espresso_picks.join(", ")}`);
    console.log(`   Reasoning: ${selectionResult.reasoning}`);

  } catch (e) {
    console.error("❌ AI Selection failed:", e.message);
    console.log("Falling back to JavaScript selection (top 2 from each category)...");

    // Fallback: Just pick top 2 from each
    selectionResult = {
      pour_over_picks: filterTopN.slice(0, 2).map(b => b.name),
      espresso_picks: espressoTopN.slice(0, 2).map(b => b.name),
      reasoning: "Fallback to top-scored beans due to AI selection error"
    };
  }

  // Find selected beans in original arrays
  const findBeanByName = (beans, nameFromAI) => {
    // AI might return "Shop - Bean Name" or just "Bean Name"
    // Try exact match first
    let found = beans.find(b => b.name === nameFromAI);

    if (!found) {
      // Try removing shop prefix if AI included it
      // Format: "Rogue Wave - Panama - Bambito Estate..." → "Panama - Bambito Estate..."
      const withoutShop = nameFromAI.replace(/^[^-]+-\s*/, '').trim();
      found = beans.find(b => b.name === withoutShop);
    }

    if (!found) {
      // Try partial match (bean name contains the search string or vice versa)
      found = beans.find(b =>
        b.name.includes(nameFromAI) ||
        nameFromAI.includes(b.name) ||
        (b.shop + ' - ' + b.name) === nameFromAI
      );
    }

    if (!found) {
      console.log(`⚠️ Could not find bean: "${nameFromAI}"`);
      console.log(`Available beans: ${beans.slice(0, 3).map(b => `"${b.name}"`).join(', ')}...`);
    }

    return found;
  };

  const selection = {
    filter: selectionResult.pour_over_picks.map(name => findBeanByName(scoredBeans, name)).filter(Boolean),
    espresso: selectionResult.espresso_picks.map(name => findBeanByName(scoredBeans, name)).filter(Boolean)
  };

  if (selection.filter.length < 2 || selection.espresso.length < 2) {
    console.log(`❌ AI selection incomplete (Filter: ${selection.filter.length}, Espresso: ${selection.espresso.length})`);
    return;
  }

  // === 5. AI PHASE 2: Generate Bilingual Content ===

  console.log("\n🤖 AI Phase 2: Generating bilingual content for selected beans...");

  // Prepare bean data for AI (exclude image_url to avoid JSON issues)
  const prepareForAI = (beans) => beans.map(b => {
    const { image_url, ...rest } = b; // Remove image_url
    return rest;
  });

  const beansData = {
    filter: prepareForAI(selection.filter),
    espresso: prepareForAI(selection.espresso)
  };
  const beansJson = JSON.stringify(beansData, null, 2);

  const prompt = `
    Role: You are a Head Barista at a Vancouver specialty coffee shop.

    Task: Generate weekly coffee recommendations for TWO platforms in ONE response:
    1. RedNote (小红书): Chinese audience, casual but professional
    2. Instagram: English audience, specialty coffee enthusiasts

    Theoretical Foundation (apply to both languages):
    • Jonathan Gagné's empirical research
    • SCA Golden Cup standards
    • James Hoffmann's brewing techniques

    ### 🛑 CORE TONE RULES (apply to BOTH languages):

    1. **Refuse Chemistry Lecture**:
       ❌ Bad: "Anaerobic fermentation produces ethyl acetate compounds that provide intense fruity esters..."
       ✅ Good: "Heavy fermentation notes, tastes like blueberry jam. Can get funky if brewed wrong."

    2. **Refuse Marketing Fluff**:
       ❌ Bad: "A symphony on your palate, aromatic molecules dancing on your tongue..."
       ✅ Good: "Bright acidity, like hot lemonade. Very refreshing."

    3. **Physical Logic - Be Direct**:
       ❌ Bad: "Due to its high-density characteristics, requires elevated thermal energy activation..."
       ✅ Good: "High-density beans (high altitude). Use 96°C water or acidity won't extract."

    4. **Refuse Hype and Exaggeration**:
       ❌ Bad: "End of season treasure! Get it before it's gone, won't see it until next year's harvest..."
       ✅ Good: "This is end of season for this bean. If you miss it, wait until next year's crop."

    5. **No First Person "I"**:
       ❌ Bad: "I would use 95°C water..."
       ✅ Good: "Recommend 95°C water."

    ### 📝 OUTPUT FORMAT (CRITICAL - Return valid JSON only):

    Return a JSON object with this EXACT structure:
    {
      "chinese": {
        "title": "本周手冲推荐",
        "content": "[Full Chinese article following template below]"
      },
      "english": {
        "title": "This Week's Pour Over Picks",
        "content": "[Full English article following template below]"
      }
    }

    CHINESE TEMPLATE (小红书风格):
    # 本周推荐

    [开篇50字，直奔主题，本周主题是什么？]

    ---

    ## 手冲豆推荐

    ### 推荐 1: [豆子名称](url)


    #### 基本信息
    - 烘焙商：[店名]
    - 产地：[产地]
    - 品种：[品种]
    - 处理法：[处理法]
    - 烘焙度：[烘焙度]
    - 烘焙日期：[日期]
    - 价格：[价格]

    #### 入手理由
    ① [时令/状态]
    - [专业语气，例如 "正是这个豆子的产季"]

    ② [稀缺/性价比]
    - [专业语气]

    #### 风味档案
    **品种特性**：[一句话]

    **风味描述**：[具体食物，不要抽象词]

    #### 冲煮参考（手冲/V60）
    - 粉水比：[比例]
    - 水温：[温度]（[原因，例如"浅烘怕萃不透"]）
    - 研磨：[粗细]

    ### 推荐 2: [豆子名称](url)


    [重复以上结构]

    ---

    ## 意式豆推荐

    ### 推荐 1: [豆子名称](url)


    #### 基本信息
    - 烘焙商：[店名]
    - 产地：[产地]
    - 品种：[品种]
    - 处理法：[处理法]
    - 烘焙度：[烘焙度]
    - 烘焙日期：[日期]
    - 价格：[价格]

    #### 入手理由
    ① [时令/状态]

    ② [稀缺/性价比]

    #### 风味档案
    **品种特性**：[一句话]

    **风味描述**：[具体食物]

    #### 冲煮参考（意式机）
    - 粉量：[克数]
    - 萃取比例：[比如1:2]
    - 水温：[温度]（[原因]）
    - 研磨：[细度]

    ### 推荐 2: [豆子名称](url)


    [重复以上结构]

    ---

    ## 怎么选

    [写一段3-4句话的选择建议，用故事化的方式说明：
    - 什么场景下选哪款豆子
    - 不同口味偏好的人适合哪款
    - 用自然对话的语气，避免列表或条目式表达
    例如："如果你平时喜欢酸度明亮的手冲，XX豆子会让你惊喜。想要稳定经典的口感，可以试试XX。意式机的话，XX适合做单品SOE，XX则是做奶咖的好底子。"]

    ENGLISH TEMPLATE (Instagram格式):
    # This Week's Coffee Picks

    [50-word intro explaining this week's theme]

    ---

    ## Pour Over Recommendations

    ### Pick 1: [Bean Name](url)


    #### Coffee Profile
    - Roaster: [Shop]
    - Origin: [Origin]
    - Variety: [Variety]
    - Process: [Process]
    - Roast: [Roast]
    - Roast Date: [Date]
    - Price: [Price]

    #### Why Get This
    ① [Seasonality/Status]
    - [Professional tone]

    ② [Rarity/Value]
    - [Professional tone]

    #### Flavor Profile
    **Variety Character**: [One line]

    **Tastes Like**: [Specific food comparisons]

    #### Brew Guide (V60/Pour Over)
    - Ratio: [ratio, e.g., 1:16]
    - Temp: [temp] ([reason, e.g., "light roast needs high temp"])
    - Grind: [coarseness]

    ### Pick 2: [Bean Name](url)


    [Repeat structure]

    ---

    ## Espresso Recommendations

    ### Pick 1: [Bean Name](url)


    #### Coffee Profile
    - Roaster: [Shop]
    - Origin: [Origin]
    - Variety: [Variety]
    - Process: [Process]
    - Roast: [Roast]
    - Roast Date: [Date]
    - Price: [Price]

    #### Why Get This
    ① [Seasonality/Status]

    ② [Rarity/Value]

    #### Flavor Profile
    **Variety Character**: [One line]

    **Tastes Like**: [Specific food comparisons]

    #### Brew Guide (Espresso Machine)
    - Dose: [grams]
    - Ratio: [e.g., 1:2]
    - Temp: [temp] ([reason])
    - Grind: [fineness]

    ### Pick 2: [Bean Name](url)


    [Repeat structure]

    ---

    ## How to Choose

    [Write a 3-4 sentence narrative guide that explains:
    - Which bean to choose for different scenarios
    - What flavor preferences match which coffee
    - Use natural, conversational and professional tone (no bullet points or lists)
    Example: "If you're into bright, fruity pour overs, grab the XX—it's hitting peak season right now. For a more balanced daily drinker, XX is your safe bet. On the espresso side, XX pulls a clean, fruity shot that's wild as a single origin. XX is your workhorse for milk drinks—sweet, chocolatey, and bulletproof."]

    IMPORTANT:
    - Return ONLY valid JSON (no markdown code blocks, no extra text)
    - Use \\n for line breaks inside strings
    - Escape quotes properly
    - Keep same structure, beans, and recommendations in both languages
    - Chinese should feel native to 小红书 audience
    - English should feel native to specialty coffee enthusiasts

    ### 📥 Bean Data (4 beans total):
    ${beansJson}

    Note:
    - "filter" array contains 2 pour over beans
    - "espresso" array contains 2 espresso beans
    - Use the appropriate beans for each section
    - Each bean has a "url" field - use it to make the bean name clickable in the heading: [Bean Name](url)

    ### 🏪 Shop Addresses:
    - Revolver: 325 Cambie St
    - Rogue Wave: 1300 Hunter St (Smithe location)
    - Prototype: 883 E Hastings St
    - Pallet: 2305 Ontario St
    - Nemesis: 302 W Hastings St (Gastown)
    - Elysian: 590 W Broadway
    - Matchstick: 639 E 15th Ave (Main St location)
  `;

  try {
    console.log("🤖 Generating bilingual content with Gemini Pro...");

    // === 💰 Token Usage Tracking ===
    const promptLength = prompt.length;
    const estimatedInputTokens = Math.ceil(promptLength / 4); // Rough estimate: 4 chars per token

    const rawResponse = callGeminiAPI(prompt, false, REPORT_MODEL);

    // Parse JSON response
    let bilingualContent;
    try {
      // Try to parse as-is first
      bilingualContent = JSON.parse(rawResponse);
    } catch (parseError) {
      console.log("⚠️ Initial parse failed, attempting cleanup...");
      try {
        // If wrapped in markdown code block, clean it
        const cleaned = rawResponse.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
        bilingualContent = JSON.parse(cleaned);
      } catch (secondError) {
        // Log the raw response to help debug
        console.error("❌ JSON Parse Error:", secondError.message);
        console.error("Raw response (first 500 chars):", rawResponse.substring(0, 500));
        console.error("Raw response (chars 300-800):", rawResponse.substring(300, 800));
        throw new Error(`Failed to parse AI response: ${secondError.message}`);
      }
    }

    // Validate structure
    if (!bilingualContent.chinese || !bilingualContent.english) {
      console.error("❌ Response structure invalid:", JSON.stringify(Object.keys(bilingualContent)));
      throw new Error("Response missing chinese or english field");
    }

    if (!bilingualContent.chinese.content || !bilingualContent.english.content) {
      console.error("❌ Content missing in response");
      console.error("Chinese keys:", Object.keys(bilingualContent.chinese || {}));
      console.error("English keys:", Object.keys(bilingualContent.english || {}));
      throw new Error("Response missing content field");
    }

    // Post-process: Insert product images into markdown
    console.log("🖼️ Inserting product images into markdown...");
    const allBeans = [...selection.filter, ...selection.espresso];
    bilingualContent.chinese.content = insertProductImages(bilingualContent.chinese.content, allBeans);
    bilingualContent.english.content = insertProductImages(bilingualContent.english.content, allBeans);

    // Calculate output tokens
    const chineseLength = (bilingualContent.chinese.content || "").length;
    const englishLength = (bilingualContent.english.content || "").length;
    const estimatedOutputTokens = Math.ceil((chineseLength + englishLength) / 4);

    // Save both versions to Google Sheets
    saveDraft(bilingualContent.chinese.content, "Chinese", bilingualContent.chinese.title || "本周推荐");
    saveDraft(bilingualContent.english.content, "English", bilingualContent.english.title || "This Week's Picks");

    console.log("✅ Chinese version saved to sheet");
    console.log("✅ English version saved to sheet");

    // Push to GitHub
    const dateStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
    console.log("\n📤 Pushing to GitHub...");
    console.log(`Date: ${dateStr}`);
    console.log(`Chinese content length: ${chineseLength} chars`);
    console.log(`English content length: ${englishLength} chars`);

    const chinesePushed = pushToGitHub(bilingualContent.chinese.content, "Chinese", dateStr);
    const englishPushed = pushToGitHub(bilingualContent.english.content, "English", dateStr);

    if (chinesePushed && englishPushed) {
      console.log("✅ Both versions pushed to GitHub successfully");
    } else if (chinesePushed || englishPushed) {
      console.log("⚠️ Partial success: Some files failed to push to GitHub");
    } else {
      console.log("❌ GitHub push failed for both versions");
    }

    // ✨ Core writeback: Update Last Promoted Date
    console.log("📝 Updating 'Last Promoted Date' for selected beans...");
    const allSelected = [...selection.filter, ...selection.espresso].filter(Boolean);
    allSelected.forEach(bean => {
      // Write current date to Last Promoted Date column
      sheet.getRange(bean.rowIndex, idx.lastPromoted + 1).setValue(new Date());
    });
    console.log(`✅ Dates updated for ${allSelected.length} beans. Cooldown active for 30 days.`);

    // === 💰 Cost Report ===
    // Gemini 2.5 Pro pricing: $3.5/1M input, $14/1M output
    const inputCost = (estimatedInputTokens * 3.5) / 1000000;
    const outputCost = (estimatedOutputTokens * 14) / 1000000;
    const totalCost = inputCost + outputCost;

    console.log(`\n📊 Token Usage:`);
    console.log(`   Input: ${estimatedInputTokens.toLocaleString()} tokens (prompt + bean data)`);
    console.log(`   Output: ${estimatedOutputTokens.toLocaleString()} tokens (Chinese: ${Math.ceil(chineseLength/4).toLocaleString()}, English: ${Math.ceil(englishLength/4).toLocaleString()})`);
    console.log(`💰 Estimated Cost: $${totalCost.toFixed(4)} (Input: $${inputCost.toFixed(4)}, Output: $${outputCost.toFixed(4)})`);

  } catch (e) {
    console.error("❌ Generation failed:", e.message);
    console.error("Stack:", e.stack);
  }
}

// === HELPER FUNCTIONS ===

function formatDate(dateObj) {
  if (!dateObj) return "Recent";
  if (typeof dateObj === 'string') return dateObj;
  try {
    return Utilities.formatDate(dateObj, Session.getScriptTimeZone(), "MMM dd");
  } catch (e) {
    return "Recent";
  }
}

function saveDraft(content, language, title) {
  const targetSheet = getTargetSheet();
  const ss = targetSheet.getParent();
  let sheet = ss.getSheetByName("Weekly_Drafts");
  if (!sheet) {
    sheet = ss.insertSheet("Weekly_Drafts");
    sheet.appendRow(["Date", "Language", "Title", "Content"]);
    sheet.setColumnWidth(1, 150);
    sheet.setColumnWidth(2, 80);
    sheet.setColumnWidth(3, 200);
    sheet.setColumnWidth(4, 600);
    sheet.getRange("D:D").setWrap(true);
  }
  const today = new Date();
  sheet.appendRow([today, language || "N/A", title || "N/A", content]);
  console.log(`✅ ${language} post saved to 'Weekly_Drafts' sheet.`);
}

/**
 * Pushes markdown content to GitHub repository
 * @param {string} content - Markdown content to push
 * @param {string} language - Language identifier (Chinese/English)
 * @param {string} date - Date string for filename (YYYY-MM-DD format)
 * @returns {boolean} Success status
 */
function pushToGitHub(content, language, date) {
  console.log(`🔍 pushToGitHub called with: language="${language}", date="${date}", contentLength=${content ? content.length : 'undefined'}`);

  try {
    // Validate inputs
    if (!content || !language || !date) {
      console.error(`❌ Invalid parameters: content=${!!content}, language=${language}, date=${date}`);
      return false;
    }

    // Get GitHub token from Script Properties
    const config = getConfig();
    const token = config.GITHUB_TOKEN || GITHUB_TOKEN;

    if (!token) {
      console.error("❌ GitHub token not configured. Set GITHUB_TOKEN in Script Properties.");
      return false;
    }

    // Create filename: posts/YYYY-MM-DD/chinese.md or posts/YYYY-MM-DD/english.md
    const languageSuffix = language.toLowerCase();
    const filename = `posts/${date}/${languageSuffix}.md`;

    // Check if file already exists
    const checkUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${filename}`;
    const checkOptions = {
      method: "get",
      headers: {
        "Authorization": `token ${token}`,
        "Accept": "application/vnd.github.v3+json"
      },
      muteHttpExceptions: true
    };

    const checkResponse = UrlFetchApp.fetch(checkUrl, checkOptions);
    const checkStatus = checkResponse.getResponseCode();
    let sha = null;

    if (checkStatus === 200) {
      // File exists, get SHA for update
      const existingFile = JSON.parse(checkResponse.getContentText());
      sha = existingFile.sha;
      console.log(`📝 File exists, will update: ${filename}`);
    } else if (checkStatus === 404) {
      console.log(`📝 Creating new file: ${filename}`);
    } else {
      console.error(`❌ GitHub API error: ${checkStatus}`);
      return false;
    }

    // Encode content to base64 with UTF-8 charset (GitHub API requirement)
    const base64Content = Utilities.base64Encode(content, Utilities.Charset.UTF_8);

    // Create/update file via GitHub API
    const createUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${filename}`;
    const payload = {
      message: `Add ${language} coffee report for ${date}`,
      content: base64Content,
      branch: "main"
    };

    if (sha) {
      payload.sha = sha; // Include SHA for updates
    }

    const createOptions = {
      method: "put",
      headers: {
        "Authorization": `token ${token}`,
        "Accept": "application/vnd.github.v3+json",
        "Content-Type": "application/json"
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };

    const createResponse = UrlFetchApp.fetch(createUrl, createOptions);
    const createStatus = createResponse.getResponseCode();

    if (createStatus === 200 || createStatus === 201) {
      const result = JSON.parse(createResponse.getContentText());
      console.log(`✅ ${language} report pushed to GitHub: ${result.content.html_url}`);
      return true;
    } else {
      console.error(`❌ GitHub push failed: ${createStatus}`);
      console.error(createResponse.getContentText());
      return false;
    }

  } catch (e) {
    console.error(`❌ GitHub push error: ${e.message}`);
    return false;
  }
}

function callGeminiAPI(text, forceJson, modelName) {
  const config = getConfig();
  const apiKey = config.GEMINI_API_KEY || GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error("GEMINI_API_KEY not configured. Set it in Script Properties or in code.");
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
  const payload = {
    contents: [{ parts: [{ text: text }] }],
    generationConfig: forceJson ? { responseMimeType: "application/json" } : undefined
  };

  const options = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  const resp = UrlFetchApp.fetch(url, options);
  const json = JSON.parse(resp.getContentText());
  if (json.error) throw new Error(json.error.message);
  return json.candidates[0].content.parts[0].text;
}

/**
 * Build AI Phase 1 selection prompt
 */
function buildSelectionPrompt(selectionData) {
  const formatCandidate = (bean) => {
    return `${bean.index}. ${bean.shop} - ${bean.name}
   Variety: ${bean.variety || 'N/A'} | Process: ${bean.process || 'N/A'}
   Roast: ${bean.roast || 'N/A'} | Usage: ${bean.usage || 'N/A'}
   Season: ${bean.season_status || 'N/A'} | Rare: ${bean.is_rare || 'No'}
   Price: $${bean.price_per_g ? bean.price_per_g.toFixed(3) : 'N/A'}/g
   Scores - Quality: ${bean.quality_score.toFixed(1)}/10, Seasonality: ${bean.seasonality_score.toFixed(1)}/10, Value: ${bean.value_score}/10
   Description: ${(bean.description || '').substring(0, 300)}...
`;
  };

  return `You are a specialty coffee consultant selecting weekly coffee recommendations for Vancouver.

TASK: Select 2 pour-over and 2 espresso beans from the candidates below.

SELECTION CRITERIA (in priority order):
1. **No duplicates**: Same bean cannot appear in both categories
2. **No mismatched usage**: Beans explicitly named "Espresso" should not be selected for pour-over
3. **Prioritize specialty attributes**: Rare varieties (Geisha, Pink Bourbon), special processes (Anaerobic), fresh arrivals, famous farms
4. **Shop diversity**: Prefer selecting beans from different shops when possible
5. **Balance**: Mix of premium/rare beans with accessible/value options

SCORING GUIDE:
- Quality Score (0-10): Specialty attributes (rare varieties, special processes, famous farms)
- Seasonality Score (0-10): Freshness and crop timing
- Value Score (0-10): Price fairness for the category

IMPORTANT CONTEXT CLUES IN DESCRIPTIONS:
- "Nano lot", "Limited edition", "40kg only" → Very limited availability
- "Competition", "Award", "COE" → Competition recognition
- "Legendary", "Famous", "Renowned" → Prestigious producer
- "Granja Paraiso", "Wilton Benitez", "Finca Deborah" → Famous farms
- "Indigenous community", "Family-run since 19XX" → Story/provenance

POUR-OVER CANDIDATES (Top ${selectionData.pour_over_candidates.length}):
${selectionData.pour_over_candidates.map(formatCandidate).join('\n')}

ESPRESSO CANDIDATES (Top ${selectionData.espresso_candidates.length}):
${selectionData.espresso_candidates.map(formatCandidate).join('\n')}

OUTPUT FORMAT (return valid JSON only, no markdown):
{
  "pour_over_picks": ["Bean name 1 WITHOUT shop prefix", "Bean name 2 WITHOUT shop prefix"],
  "espresso_picks": ["Bean name 3 WITHOUT shop prefix", "Bean name 4 WITHOUT shop prefix"],
  "reasoning": "Brief explanation (2-3 sentences) of why you selected these beans, highlighting key attributes like rare varieties, seasonality, famous farms, or special processes."
}

IMPORTANT: Return ONLY the bean name as shown in the "name" field above (e.g., "Panama - Bambito Estate Geisha | Washed - 100g"), do NOT include the shop name prefix (e.g., do NOT return "Rogue Wave - Panama - Bambito Estate...").`;
}

// ================= FETCHERS (Deduplication Logic Integrated in syncCoffeeData) =================

function fetchAllShopifyData() {
  let allBeans = [];
  const shops = [
    {name: "Revolver", domain: "revolvercoffee.ca", platform: "shopify"},
    {name: "Rogue Wave", domain: "roguewavecoffee.ca", platform: "shopify"},
    {name: "Prototype", domain: "prototypecoffee.ca", platform: "squarespace"},
    {name: "Pallet", domain: "palletcoffeeroasters.com", platform: "shopify"},
    {name: "Nemesis", domain: "nemesis.coffee", platform: "shopify"},
    {name: "Elysian", domain: "elysiancoffee.com", platform: "shopify"},
    {name: "Matchstick", domain: "matchstickyvr.com", platform: "shopify"}
    // {name: "Luna", domain: "enjoylunacoffee.com", platform: "woocommerce"}, // NOTE: WooCommerce requires API auth
  ];

  shops.forEach(shop => {
    let result;
    if (shop.platform === "squarespace") {
      result = fetchSquarespace(shop.name, shop.domain);
    } else {
      result = fetchShopify(shop.name, shop.domain);
    }
    console.log(`${shop.name}: Fetched ${result.length} products`);
    allBeans = allBeans.concat(result);
  });

  const beforeFilter = allBeans.length;
  const filtered = filterForCoffee(allBeans);
  console.log(`Total products: ${beforeFilter}, After coffee filter: ${filtered.length}`);
  return filtered;
}

function fetchShopify(shopName, domain) {
  try {
    const url = `https://${domain}/products.json?limit=250`;
    const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    const statusCode = response.getResponseCode();
    if (statusCode !== 200) {
      console.log(`${shopName} returned status ${statusCode}`);
      return [];
    }
    const json = JSON.parse(response.getContentText());

    return json.products.map(p => {
      const v = p.variants[0];
      let desc = (p.body_html || "").replace(/<[^>]*>?/gm, ' ').replace(/\s+/g, ' ').trim();
      if (desc.length < 50) desc = p.title + ". " + desc;

      // Get first product image
      const imageUrl = (p.images && p.images.length > 0) ? p.images[0].src : "";

      return {
        shop: shopName,
        name: p.title,
        price: "$" + v.price,
        stock: v.available ? "In Stock" : "Sold Out",
        desc: desc,
        url: `https://${domain}/products/${p.handle}`,
        imageUrl: imageUrl,
        roastDate: "",
        type: p.product_type,
        tags: p.tags
      };
    });
  } catch (e) {
    console.error(`Fetch error ${shopName}: ${e.message}`);
    return [];
  }
}

function fetchSquarespace(shopName, domain) {
  try {
    const url = `https://www.${domain}/shop?format=json`;
    const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    const statusCode = response.getResponseCode();
    if (statusCode !== 200) {
      console.log(`${shopName} returned status ${statusCode}`);
      return [];
    }
    const json = JSON.parse(response.getContentText());
    const items = json.items || [];

    return items.map(p => {
      const v = p.variants && p.variants[0] ? p.variants[0] : {};

      // Extract description from excerpt (contains HTML)
      let desc = (p.excerpt || "").replace(/<[^>]*>?/gm, ' ').replace(/\s+/g, ' ').trim();
      if (desc.length < 50) desc = p.title + ". " + desc;

      // Determine stock status
      // Squarespace uses "unlimited: true" or "qtyInStock > 0"
      const inStock = v.unlimited || (v.qtyInStock && v.qtyInStock > 0);

      // Get price from variant
      const price = v.priceMoney ? v.priceMoney.value : (v.price || 0);

      // Get product image
      const imageUrl = p.assetUrl || "";

      // Construct full URL (Squarespace returns relative paths)
      let fullUrl = p.fullUrl;
      if (fullUrl && fullUrl.startsWith('/')) {
        // fullUrl is relative but complete (e.g., "/shop/product-slug")
        fullUrl = `https://www.${domain}${fullUrl}`;
      } else if (!fullUrl || !fullUrl.startsWith('http')) {
        // Fallback: construct from urlId (add /shop prefix)
        const urlSlug = p.urlId || p.url || "";
        fullUrl = `https://www.${domain}/shop/${urlSlug}`;
      }

      return {
        shop: shopName,
        name: p.title,
        price: "$" + price,
        stock: inStock ? "In Stock" : "Sold Out",
        desc: desc,
        url: fullUrl,
        imageUrl: imageUrl,
        roastDate: "",
        type: p.productType === 1 ? "coffee" : "product", // productType 1 = coffee
        tags: p.categories || []
      };
    });
  } catch (e) {
    console.error(`Fetch error ${shopName}: ${e.message}`);
    return [];
  }
}

function filterForCoffee(items) {
  // Comprehensive exclusion list for accessories and non-coffee products
  const exclude = [
    // Gift & subscription
    "gift card", "gift certificate", "subscription", "sample", "sampler pack",
    "sample pack", "sample size", "taster pack", "trial pack",
    // Instant & convenience packs
    "instant", "instant coffee", "2 pack", "3 pack", "4 pack", "5 pack", "6 pack",
    "pack of", "multi-pack", "multipack", "variety pack",
    // Equipment
    "filter", "kettle", "dripper", "grinder", "scale", "brewer", "machine", "carafe",
    "french press", "aeropress", "chemex", "v60", "kalita", "clever",
    "tamper", "pitcher", "jug", "portafilter", "basket", "puck screen",
    // Accessories
    "mug", "cup", "glass", "tumbler", "bottle", "thermos", "flask",
    "tee", "t-shirt", "shirt", "hoodie", "hat", "cap", "tote", "bag",
    "soap", "socks", "sticker", "pin", "poster", "book",
    // Services & events
    "workshop", "class", "cupping", "tasting", "event", "ticket",
    // Cleaning
    "cleaner", "detergent", "brush", "cloth", "towel"
  ];

  return items.filter(item => {
    const name = item.name.toLowerCase();
    const type = (item.type || "").toLowerCase();
    const tags = Array.isArray(item.tags) ? item.tags.join(" ").toLowerCase() :
                 (typeof item.tags === 'string' ? item.tags.toLowerCase() : "");

    // First: Exclude obvious non-coffee items
    if (exclude.some(bad => name.includes(bad) || type.includes(bad))) {
      return false;
    }

    // Second: Check for explicit coffee indicators in product type
    const isCoffeeType = type.includes("coffee") ||
                         type.includes("bean") ||
                         type.includes("espresso") ||
                         type === "1"; // Squarespace productType 1 = coffee

    // Third: Check for coffee-specific terms in name
    const coffeeTerms = [
      "washed", "natural", "honey", "anaerobic", "fermented",
      "ethiopia", "kenya", "colombia", "guatemala", "brazil", "peru", "rwanda",
      "gesha", "bourbon", "caturra", "typica", "sl28", "pacamara",
      "single origin", "blend", "decaf"
    ];
    const hasCoffeeTerm = coffeeTerms.some(term => name.includes(term));

    // Fourth: Check for weight indicators (but not standalone "g" which is too generic)
    const weightPattern = /\d+\s*(g|grams|oz|lb|lbs|kg)\b/i;
    const hasWeight = weightPattern.test(name) || weightPattern.test(type);

    // Fifth: Check tags for coffee-related categories
    const hasCoffeeTag = tags.includes("coffee") || tags.includes("bean") || tags.includes("espresso");

    // Product passes if it matches coffee type OR (has coffee term OR has weight) AND has coffee tag
    return isCoffeeType || hasCoffeeTerm || (hasWeight && hasCoffeeTag) || hasCoffeeTag;
  });
}

// ================= DEBUG =================

function debugRogueWave() {
  const result = fetchShopify("Rogue Wave", "roguewavecoffee.ca");
  console.log(`\n=== ROGUE WAVE DEBUG ===`);
  console.log(`Fetched ${result.length} products from Rogue Wave`);

  if (result.length > 0) {
    console.log("\nAll products (showing first 15):");
    result.slice(0, 15).forEach((p, i) => {
      console.log(`${i+1}. "${p.name}" - Type: "${p.type}"`);
    });
  }

  const filtered = filterForCoffee(result);
  console.log(`\nAfter filtering: ${filtered.length} coffee products`);

  if (result.length !== filtered.length) {
    const removed = result.filter(item => !filtered.includes(item));
    console.log(`\nFiltered out ${removed.length} items:`);
    removed.forEach(item => {
      console.log(`  ❌ "${item.name}" - Type: "${item.type}"`);
    });
  }
}

function debugPrototype() {
  // First, let's fetch raw JSON to see what fields Squarespace provides
  try {
    const url = `https://www.prototypecoffee.ca/shop?format=json`;
    const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    const json = JSON.parse(response.getContentText());
    const items = json.items || [];

    console.log("=== RAW SQUARESPACE API DATA ===");
    console.log(`Fetched ${items.length} items\n`);

    if (items.length > 0) {
      console.log("First product raw data:");
      const p = items[0];
      console.log(`Title: ${p.title}`);
      console.log(`URL fields:`);
      console.log(`  - fullUrl: ${p.fullUrl}`);
      console.log(`  - urlId: ${p.urlId}`);
      console.log(`  - url: ${p.url}`);
      console.log(`  - id: ${p.id}`);
      console.log(`Image fields:`);
      console.log(`  - assetUrl: ${p.assetUrl}`);
      console.log(`  - imageUrl: ${p.imageUrl}`);
      console.log("\nFull object keys:", Object.keys(p).join(", "));
    }
  } catch (e) {
    console.error("Debug error:", e.message);
  }

  console.log("\n=== PROCESSED DATA ===");
  const result = fetchSquarespace("Prototype", "prototypecoffee.ca");
  console.log(`Fetched ${result.length} products from Prototype (Squarespace)`);

  if (result.length > 0) {
    console.log("First 3 products:");
    result.slice(0, 3).forEach(p => {
      console.log(`  - Name: "${p.name}"`);
      console.log(`    URL: "${p.url}"`);
      console.log(`    Type: "${p.type}"`);
      console.log(`    Stock: "${p.stock}"`);
    });
  }

  const filtered = filterForCoffee(result);
  console.log(`After filtering: ${filtered.length} coffee products`);
}

// ================= INIT =================

function setupHeaders() {
  const sheet = getTargetSheet();
  const headers = [
    "Shop", "Bean Name", "Price", "Weight", "Stock", "Description", "URL", "Image URL", "Roast Date", "Updated At",
    "Country", "Region", "Farm", "Altitude",
    "Variety", "Process", "Roast Level", "Usage",
    "Flavor Keywords", "Acidity", "Sweetness", "Body",
    "In Season (Status)", "Seasonality Reason", "Freshness Score",
    "Is Rare", "Micro Lot", "Special Process", "Exclusive",
    "V60 Score", "Espresso Score",
    "Price/g", "Value Score",
    "Reason",
    "Status",
    "Last Promoted Date"
  ];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight("bold");
  sheet.setFrozenRows(1);
  console.log("✅ Headers updated.");
}
