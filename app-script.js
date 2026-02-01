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

const GEMINI_API_KEY = "";
const SPREADSHEET_ID = "";
const DATA_SHEET_NAME = "Sheet1";

// Model Configuration
const ENRICH_MODEL = "gemini-2.5-flash-lite";  // Cheap model for bulk enrichment
const REPORT_MODEL = "gemini-2.5-pro";         // Premium model for weekly reports

// =================================================

function onOpen() {
  try {
    SpreadsheetApp.getUi().createMenu('☕️ Coffee DB')
      .addItem('🔄 1. Sync Data', 'syncCoffeeData')
      .addItem('🧠 2. AI Enrich', 'enrichNewBeans')
      .addItem('📝 3. Generate Post', 'generateWeeklyPost')
      .addSeparator()
      .addItem('🛠 Setup Headers', 'setupHeaders')
      .addItem('🔍 Debug Prototype', 'debugPrototype')
      .addItem('🔍 Debug Rogue Wave', 'debugRogueWave')
      .addToUi();
  } catch (e) {
    console.log("UI menu skipped (Automation mode).");
  }
}

function getTargetSheet() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
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
        item.roastDate,
        new Date(),
        "", "", "", "", "", "", "", "", "", "", "", "",         // 10-21 (12 fields)
        "", "", "", "", "", "", "", "", "", "", "", "",         // 22-33 (12 fields)
        "PENDING",       // 34 Status
        ""               // 35 Last Promoted Date (Empty initially)
      ]);
      newCount++;
      // Add to map to prevent dupes within the same fetch batch
      existingMap.set(key, "just_added");
    } else {
      // --- EXISTING BEAN (Update Stock/Price) ---
      const rowIndex = existingMap.get(key);
      if (rowIndex !== "just_added") {
        sheet.getRange(rowIndex, 3).setValue(item.price);
        sheet.getRange(rowIndex, 5).setValue(item.stock);
        sheet.getRange(rowIndex, 9).setValue(new Date());
        updateCount++;
      }
    }
  });

  console.log(`Sync Complete! New Beans: ${newCount}, Updated Stock: ${updateCount}`);
}

/**
 * CORE 2: AI ENRICHMENT (MASTER VERSION)
 * Strictly preserved as requested.
 */
function enrichNewBeans() {
  console.log("🚀 Starting Master Enrichment...");

  // === ⚙️ Core Configuration ===
  const SLEEP_SECONDS = 2;        // Normal cooldown (seconds)
  const ERROR_SLEEP_SECONDS = 120; // Error recovery cooldown (seconds)
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

  const range = sheet.getRange(2, 1, lastRow - 1, 35);
  const values = range.getValues();
  let processedCount = 0;

  for (let i = 0; i < values.length; i++) {
    const row = values[i];

    const beanName = row[1];
    const priceStr = row[2];
    const stock = row[4];
    const rawDesc = row[5];
    const status = row[33]; // Column 34 (0-indexed)

    if (status === "PENDING") {

      if (stock !== "In Stock") {
        console.log(`⏩ Skipping Row ${i+2} (${beanName}): Sold Out`);
        sheet.getRange(i + 2, 34).setValue("SKIPPED");
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

            // Write enrichment data (24 fields starting at column 10)
            sheet.getRange(i + 2, 10, 1, 24).setValues([rowData]);

            // Write extracted weight directly to Column 4 (Weight)
            const weight = getVal("weight_extracted");
            if (weight) {
              sheet.getRange(i + 2, 4).setValue(weight);
            }

            sheet.getRange(i + 2, 34).setValue("COMPLETED");

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
              sheet.getRange(i + 2, 34).setValue("ERROR");
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
 * 📝 CORE 3: WEEKLY REPORT GENERATOR
 * FEATURES ADDED:
 * 1. 🛡️ 30-Day Cooldown: Checks Column 39 (Last Promoted Date).
 * 2. 🛡️ Shop Diversity: Tries to pick 3 beans from different shops.
 * 3. 🛡️ Strict Prompt: Uses your exact requested Chinese prompt.
 */
function generateWeeklyPost() {
  console.log("☕ Starting Weekly Post (Cooldown + Diversity + Strict Prompt)...");

  const sheet = getTargetSheet();
  const data = sheet.getDataRange().getValues();
  const headers = data[0];

  const idx = {
    shop: headers.indexOf("Shop"),
    name: headers.indexOf("Bean Name"),
    price: headers.indexOf("Price"),
    weight: headers.indexOf("Weight"),
    stock: headers.indexOf("Stock"),
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
    isRare: headers.indexOf("Is Rare"),
    valueScore: headers.indexOf("Value Score"),
    status: headers.indexOf("Status"),
    updatedAt: headers.indexOf("Updated At"),
    lastPromoted: headers.indexOf("Last Promoted Date")
  };

  const today = new Date();
  const COOLDOWN_DAYS = 30; // Promotion cooldown period (30 days)
  const FRESHNESS_DAYS = 14; // Only consider beans synced in last 14 days

  const beans = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];

    if (row[idx.status] === "COMPLETED" && row[idx.stock] === "In Stock") {

      // 🛡️ Freshness check (only consider recently synced beans)
      const updatedAt = row[idx.updatedAt];
      let isFresh = false;
      if (updatedAt instanceof Date) {
        const daysSinceUpdate = Math.ceil((today - updatedAt) / (1000 * 60 * 60 * 24));
        if (daysSinceUpdate <= FRESHNESS_DAYS) isFresh = true;
      }

      if (!isFresh) continue; // Skip stale data

      // 🛡️ 30-day promotion cooldown check
      const lastDate = row[idx.lastPromoted];
      let isCool = true;
      if (lastDate instanceof Date) {
        const diffTime = Math.abs(today - lastDate);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        if (diffDays < COOLDOWN_DAYS) isCool = false;
      }

      if (isCool) {
        beans.push({
          rowIndex: i + 1, // Record row number for writing back promotion date
          shop: row[idx.shop],
          name: row[idx.name],
          price: row[idx.price],
          weight: row[idx.weight],
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
          value_score: row[idx.valueScore]
        });
      }
    }
  }

  if (beans.length === 0) {
    console.log(`No beans available (filters: freshness <${FRESHNESS_DAYS} days, cooldown >${COOLDOWN_DAYS} days).`);
    return;
  }

  console.log(`✅ Found ${beans.length} candidate beans after freshness & cooldown filters.`);

  // === 2. Smart Selection (2 Pour Over + 2 Espresso) ===

  // Separate beans by usage
  const filterBeans = beans.filter(b => {
    const usage = (b.usage || "").toString().toLowerCase();
    const roast = (b.roast || "").toString().toLowerCase();
    // Include: Filter, V60, or Omni (but prefer light/medium roasts for Omni)
    if (usage.includes("filter") || usage.includes("v60")) return true;
    if (usage.includes("omni") && (roast.includes("light") || roast.includes("medium"))) return true;
    return false;
  });

  const espressoBeans = beans.filter(b => {
    const usage = (b.usage || "").toString().toLowerCase();
    const roast = (b.roast || "").toString().toLowerCase();
    // Include: Espresso, or Omni (but prefer medium/dark roasts for Omni)
    if (usage.includes("espresso")) return true;
    if (usage.includes("omni") && (roast.includes("medium") || roast.includes("dark"))) return true;
    return false;
  });

  console.log(`Filter candidates: ${filterBeans.length}, Espresso candidates: ${espressoBeans.length}`);

  // Debug: Show first few beans' usage values
  if (filterBeans.length === 0 && espressoBeans.length === 0 && beans.length > 0) {
    console.log("⚠️ Debug: No beans classified. Checking first 3 beans:");
    beans.slice(0, 3).forEach((b, i) => {
      console.log(`  Bean ${i+1}: usage="${b.usage}", roast="${b.roast}"`);
    });
  }

  // Sort by value score for selection
  const filterSorted = [...filterBeans].sort((a, b) => b.value_score - a.value_score);
  const espressoSorted = [...espressoBeans].sort((a, b) => b.value_score - a.value_score);

  // Pick 2 pour over beans (prioritize: rare/season + value)
  const filterPick1 = filterSorted.find(b =>
    b.is_rare === true || (b.season_status || "").toString().match(/Fresh|Peak/i)
  ) || filterSorted[0];

  const filterPick2 = filterSorted.find(b =>
    b !== filterPick1 &&
    b.shop !== filterPick1?.shop
  ) || filterSorted[1];

  // Pick 2 espresso beans (prioritize: rare/season + value)
  const espressoPick1 = espressoSorted.find(b =>
    b.is_rare === true || (b.season_status || "").toString().match(/Fresh|Peak/i)
  ) || espressoSorted[0];

  const espressoPick2 = espressoSorted.find(b =>
    b !== espressoPick1 &&
    b.shop !== espressoPick1?.shop
  ) || espressoSorted[1];

  const selection = {
    filter: [filterPick1, filterPick2].filter(Boolean),
    espresso: [espressoPick1, espressoPick2].filter(Boolean)
  };

  console.log(`Selected Pour Over (${selection.filter.length}): ${selection.filter.map(b => b?.shop).join(", ")}`);
  console.log(`Selected Espresso (${selection.espresso.length}): ${selection.espresso.map(b => b?.shop).join(", ")}`);

  // Check if we have enough beans
  if (selection.filter.length < 2) {
    console.log(`⚠️ Warning: Only ${selection.filter.length} pour over beans available (need 2)`);
  }
  if (selection.espresso.length < 2) {
    console.log(`⚠️ Warning: Only ${selection.espresso.length} espresso beans available (need 2)`);
  }
  if (selection.filter.length === 0 && selection.espresso.length === 0) {
    console.log("❌ No beans available for report generation");
    return;
  }

  // === 3. Bilingual Prompt (Chinese for RedNote + English for Instagram) ===
  const beansData = {
    filter: selection.filter,
    espresso: selection.espresso
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

    ### 推荐 1: [豆子名称]

    #### 基本信息
    烘焙商：[店名] | 名称：[豆子名称]
    📍 [产地] | 🌱 [品种] | ⚙️ [处理法]
    🔥 [烘焙度] | 📅 [日期] | 💰 [价格]

    #### 入手理由
    🌟 ① [时令/状态]
    - [专业语气，例如 "正是这个豆子的产季"]
    🌟 ② [稀缺/性价比]
    - [专业语气]

    #### 风味档案
    🌱 [品种]
    【特性】[一句话]
    【喝起来像】[具体食物，不要抽象词]

    #### 冲煮参考（手冲/V60）
    粉水比：[比例]
    水温：[温度] (⚠️ [原因，例如"浅烘怕萃不透"])
    研磨：[粗细]

    ### 推荐 2: [豆子名称]
    [重复以上结构]

    ---

    ## 意式豆推荐

    ### 推荐 1: [豆子名称]

    #### 基本信息
    烘焙商：[店名] | 名称：[豆子名称]
    📍 [产地] | 🌱 [品种] | ⚙️ [处理法]
    🔥 [烘焙度] | 📅 [日期] | 💰 [价格]

    #### 入手理由
    🌟 ① [时令/状态]
    🌟 ② [稀缺/性价比]

    #### 风味档案
    🌱 [品种]
    【特性】[一句话]
    【喝起来像】[具体食物]

    #### 冲煮参考（意式机）
    粉量：[克数]
    萃取比例：[比如1:2]
    水温：[温度] (⚠️ [原因])
    研磨：[细度]

    ### 推荐 2: [豆子名称]
    [重复以上结构]

    ---

    # 怎么选
    [表格总结：手冲vs意式的选择建议]

    ENGLISH TEMPLATE (Instagram格式):
    # This Week's Coffee Picks

    [50-word intro explaining this week's theme]

    ---

    ## Pour Over Recommendations

    ### Pick 1: [Bean Name]

    #### Coffee Profile
    Roaster: [Shop] | Name: [Bean Name]
    📍 [Origin] | 🌱 [Variety] | ⚙️ [Process]
    🔥 [Roast] | 📅 [Date] | 💰 [Price]

    #### Why Get This
    🌟 ① [Seasonality/Status]
    - [Professional tone]
    🌟 ② [Rarity/Value]
    - [Professional tone]

    #### Flavor Profile
    🌱 [Variety]
    **Character**: [One line]
    **Tastes Like**: [Specific food comparisons]

    #### Brew Guide (V60/Pour Over)
    Ratio: [ratio, e.g., 1:16]
    Temp: [temp] (⚠️ [reason, e.g., "light roast needs high temp"])
    Grind: [coarseness]

    ### Pick 2: [Bean Name]
    [Repeat structure]

    ---

    ## Espresso Recommendations

    ### Pick 1: [Bean Name]

    #### Coffee Profile
    Roaster: [Shop] | Name: [Bean Name]
    📍 [Origin] | 🌱 [Variety] | ⚙️ [Process]
    🔥 [Roast] | 📅 [Date] | 💰 [Price]

    #### Why Get This
    🌟 ① [Seasonality/Status]
    🌟 ② [Rarity/Value]

    #### Flavor Profile
    🌱 [Variety]
    **Character**: [One line]
    **Tastes Like**: [Specific food comparisons]

    #### Brew Guide (Espresso Machine)
    Dose: [grams]
    Ratio: [e.g., 1:2]
    Temp: [temp] (⚠️ [reason])
    Grind: [fineness]

    ### Pick 2: [Bean Name]
    [Repeat structure]

    ---

    # Quick Guide
    [Summary table comparing pour over vs espresso picks]

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
      // If wrapped in markdown code block, clean it
      const cleaned = rawResponse.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      bilingualContent = JSON.parse(cleaned);
    }

    // Validate structure
    if (!bilingualContent.chinese || !bilingualContent.english) {
      throw new Error("Response missing chinese or english field");
    }

    // Calculate output tokens
    const chineseLength = (bilingualContent.chinese.content || "").length;
    const englishLength = (bilingualContent.english.content || "").length;
    const estimatedOutputTokens = Math.ceil((chineseLength + englishLength) / 4);

    // Save both versions
    saveDraft(bilingualContent.chinese.content, "Chinese", bilingualContent.chinese.title);
    saveDraft(bilingualContent.english.content, "English", bilingualContent.english.title);

    console.log("✅ Chinese version saved");
    console.log("✅ English version saved");

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

function callGeminiAPI(text, forceJson, modelName) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${GEMINI_API_KEY}`;
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

      return {
        shop: shopName,
        name: p.title,
        price: "$" + v.price,
        stock: v.available ? "In Stock" : "Sold Out",
        desc: desc,
        url: `https://${domain}/products/${p.handle}`,
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

      return {
        shop: shopName,
        name: p.title,
        price: "$" + price,
        stock: inStock ? "In Stock" : "Sold Out",
        desc: desc,
        url: p.fullUrl || `https://www.${domain}${p.urlId}`,
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
  const result = fetchSquarespace("Prototype", "prototypecoffee.ca");
  console.log(`Fetched ${result.length} products from Prototype (Squarespace)`);

  if (result.length > 0) {
    console.log("First 3 products:");
    result.slice(0, 3).forEach(p => {
      console.log(`  - Name: "${p.name}"`);
      console.log(`    Type: "${p.type}"`);
      console.log(`    Stock: "${p.stock}"`);
      console.log(`    Price: "${p.price}"`);
      console.log(`    Weight: "${p.weight}"`);
    });
  }

  const filtered = filterForCoffee(result);
  console.log(`After filtering: ${filtered.length} coffee products`);

  if (filtered.length === 0 && result.length > 0) {
    console.log("❌ All products were filtered out!");
    console.log("Checking filter logic...");
    result.forEach(item => {
      const name = item.name.toLowerCase();
      const type = (item.type || "").toLowerCase();
      const isCoffeeType = type.includes("coffee") || type.includes("bean") || type.includes("espresso");
      const nameLooksLikeCoffee = name.includes("washed") || name.includes("natural") || name.includes("honey") || name.includes("g") || name.includes("lb");
      console.log(`"${item.name}" - Type: "${type}", Coffee Type: ${isCoffeeType}, Name Match: ${nameLooksLikeCoffee}`);
    });
  }
}

// ================= INIT =================

function setupHeaders() {
  const sheet = getTargetSheet();
  const headers = [
    "Shop", "Bean Name", "Price", "Weight", "Stock", "Description", "URL", "Roast Date", "Updated At",
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
