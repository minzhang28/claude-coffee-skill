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
//const MODEL_NAME = "gemini-2.0-flash";
const MODEL_NAME = "gemini-2.5-pro"; 

// =================================================

function onOpen() {
  try {
    SpreadsheetApp.getUi().createMenu('☕️ Coffee DB')
      .addItem('🔄 1. Sync Data', 'syncCoffeeData')
      .addItem('🧠 2. AI Enrich', 'enrichNewBeans')
      .addItem('📝 3. Generate Post', 'generateWeeklyPost')
      .addSeparator()
      .addItem('🛠 Setup Headers', 'setupHeaders')
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
  
  // 1. 构建现有的指纹库 (Shop + Name) 防止重复
  let existingMap = new Map(); // 使用 Map 存储行号
  if (lastRow > 1) {
    const data = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
    data.forEach((row, index) => {
      // Key: "shop_beanname" (lowercase for safety)
      const key = (row[0] + "_" + row[1]).trim().toLowerCase();
      existingMap.set(key, index + 2); // 存储行号 (index + 2 because loop starts at 0 and header is 1)
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
        item.weight,     
        item.stock,      
        item.desc,       
        item.url,        
        item.roastDate,  
        new Date(),      
        "", "", "", "", "", "", "", "", "", "", "", "", // 10-21
        "", "", "", "", "", "", "", "", "", "", "", "", // 22-33
        "", "", "", "",                                 // 34-37
        "PENDING",       // 38 Status
        ""               // 39 Last Promoted Date (Empty initially)
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
  
  // === ⚙️ 核心配置 ===
  const SLEEP_SECONDS = 2;        // 正常冷却时间 (秒)
  const ERROR_SLEEP_SECONDS = 120; // 报错冷却时间 (秒)
  // ==================

  const sheet = getTargetSheet();
  const lastRow = sheet.getLastRow();
  
  if (lastRow < 2) return;

  const range = sheet.getRange(2, 1, lastRow - 1, 38); 
  const values = range.getValues();
  let processedCount = 0;

  for (let i = 0; i < values.length; i++) {
    const row = values[i];
    
    const beanName = row[1];
    const priceStr = row[2]; 
    const stock = row[4];   
    const rawDesc = row[5]; 
    const status = row[37]; 

    if (status === "PENDING") {
      
      if (stock !== "In Stock") {
        console.log(`⏩ Skipping Row ${i+2} (${beanName}): Sold Out`);
        sheet.getRange(i + 2, 38).setValue("SKIPPED");
        SpreadsheetApp.flush(); 
        continue;
      }

      if (rawDesc) {
        let success = false;
        let attempt = 1;
        
        while (!success && attempt <= 2) {
          try {
            console.log(`⚡ Processing Row ${i+2} (${attempt}/2): ${beanName}...`);

            const enriched = callGeminiForEnrichment(rawDesc, priceStr);
            
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
              getVal("score_v60"), getVal("score_espresso"), getVal("score_frenchpress"), getVal("score_coldbrew"), 
              getVal("price_per_gram"), getVal("value_score"), 
              getVal("comparison"), getVal("recommend_reason"), getVal("avoid_tips") 
            ];

            sheet.getRange(i + 2, 10, 1, 28).setValues([rowData]);
            sheet.getRange(i + 2, 38).setValue("COMPLETED");
            
            SpreadsheetApp.flush(); 
            
            processedCount++;
            success = true;
            
            console.log(`☕ Saved Row ${i+2}. Cooling down for ${SLEEP_SECONDS}s...`);
            Utilities.sleep(SLEEP_SECONDS * 1000); 

          } catch (e) {
            console.error(`❌ Row ${i+2} Error: ${e.message}`);
            
            if (e.message.includes("quota") || e.message.includes("429") || e.message.includes("Limit")) {
              console.log(`🛑 Rate Limit Hit! Sleeping for ${ERROR_SLEEP_SECONDS}s...`);
              Utilities.sleep(ERROR_SLEEP_SECONDS * 1000);
            } else {
              sheet.getRange(i + 2, 38).setValue("ERROR");
              SpreadsheetApp.flush();
              break; 
            }
          }
          attempt++;
        }
      }
    }
  }
  console.log(`🎉 All Done. Enriched: ${processedCount} beans.`);
}

function callGeminiForEnrichment(desc, priceStr) {
  const today = new Date();
  const dateStr = today.toLocaleDateString("en-US", { year: 'numeric', month: 'long' });

  const schema = `
    Role: You are a Senior Coffee Buyer & Q-Grader.
    Context: Today is ${dateStr}.
    Task: Analyze description and price to extract structured data.
    
    👉 LOGIC 1: SEASONALITY (CRITICAL):
    - **in_season_status**:
      - "Fresh Arrival": Text explicitly says "New", "Fresh Crop", "Just Arrived".
      - "Peak Season": Southern Hemisphere beans (Peru, Brazil) right now (Jan/Feb).
      - "Late Harvest": Northern Hemisphere beans (Ethiopia, Kenya) if NO mention of "New Crop" (likely last year's).
      - "Past Crop": Old beans on sale.
    - **seasonality_reason**: One short sentence explaining the status based on origin calendar.

    👉 LOGIC 2: RARITY (STRICT):
    - Do NOT use Price as the primary factor.
    - Set "is_rare": true ONLY if:
      1. **Variety**: Gesha, Sudan Rume, Eugenioides, Wush Wush, Sidra, Pink Bourbon, Pacamara.
      2. **Process**: Anaerobic, Carbonic Maceration, Thermal Shock, Co-ferment, Koji, Experimental.
      3. **Competition**: "COE", "Auction Lot", "Competition Series", "National Winner".
      4. **Producer**: Finca Deborah, Wilton Benitez, 90 Plus.

    Required JSON Structure (snake_case keys):
    { 
      "country": "", "region": "", "farm": "", "altitude": "", 
      "variety": "", "process": "", 
      "roast_level": "Light/Medium/Dark", 
      "usage": "Filter/Espresso/Omni", 
      "flavors": "", 
      "acidity": "Infer level", 
      "sweetness": "Infer level", 
      "body": "Infer level", 
      
      "in_season_status": "Fresh Arrival / Peak Season / Late Harvest / Past Crop", 
      "seasonality_reason": "Reasoning", 
      "freshness_score": "1-10", 
      
      "is_rare": "true/false", 
      "is_microlot": "true/false", 
      "is_special_process": "true/false", 
      "is_exclusive": "true/false", 
      
      "score_v60": "1-100", 
      "score_espresso": "1-100", 
      "score_frenchpress": "1-100", 
      "score_coldbrew": "1-100", 
      
      "price_per_gram": "Calculate", 
      "value_score": "1-10", 
      "comparison": "", 
      "recommend_reason": "", 
      "avoid_tips": "" 
    }
    
    Data:
    Description: ${desc}
    Price: ${priceStr}
  `;
  
  const result = callGeminiAPI(schema, false);
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
    flavors: headers.indexOf("Flavor Keywords"),
    inSeason: headers.indexOf("In Season (Status)"), 
    seasonReason: headers.indexOf("Seasonality Reason"),
    isRare: headers.indexOf("Is Rare"),
    valueScore: headers.indexOf("Value Score"),
    status: headers.indexOf("Status"),
    lastPromoted: 38 // Index 38 (Column 39) for Last Promoted Date
  };

  const today = new Date();
  const COOLDOWN_DAYS = 30; // 冷却期 30 天

  const beans = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    
    if (row[idx.status] === "COMPLETED" && row[idx.stock] === "In Stock") {
      
      // 🛡️ 30天冷却期检查
      const lastDate = row[idx.lastPromoted];
      let isCool = true;
      if (lastDate instanceof Date) {
        const diffTime = Math.abs(today - lastDate);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
        if (diffDays < COOLDOWN_DAYS) isCool = false;
      }

      if (isCool) {
        beans.push({
          rowIndex: i + 1, // 记录行号，用于回写日期
          shop: row[idx.shop],
          name: row[idx.name],
          price: row[idx.price],
          weight: row[idx.weight],
          roast_date: formatDate(row[idx.roastDate]),
          origin: `${row[idx.country]} ${row[idx.region]}`,
          variety: row[idx.variety],
          process: row[idx.process],
          roast: row[idx.roastLevel],
          flavors: row[idx.flavors],
          season_status: row[idx.inSeason],
          season_reason: row[idx.seasonReason],
          is_rare: row[idx.isRare],
          value_score: row[idx.valueScore]
        });
      }
    }
  }

  if (beans.length === 0) { console.log("No beans available (all sold out or in cooldown)."); return; }

  // === 2. 智能选品 (店铺去重逻辑) ===
  
  // 1. Rare Pick (稀有优先，不看店铺)
  const rarePick = beans.find(b => b.is_rare === true) || beans[0];

  // 2. Season Pick (尝试找不同店铺)
  let seasonPick = beans.find(b => 
    b !== rarePick && 
    (b.season_status || "").toString().match(/Fresh|Peak/i) &&
    b.shop !== rarePick.shop
  );
  // 兜底
  if (!seasonPick) {
    seasonPick = beans.find(b => 
      b !== rarePick && 
      (b.season_status || "").toString().match(/Fresh|Peak/i)
    ) || beans[1] || beans[0];
  }

  // 3. Value Pick (尝试找第三家店铺)
  const sortedByValue = [...beans].sort((a, b) => b.value_score - a.value_score);
  let valuePick = sortedByValue.find(b => 
    b !== rarePick && 
    b !== seasonPick && 
    b.shop !== rarePick.shop && 
    b.shop !== seasonPick.shop
  );
  // 兜底
  if (!valuePick) {
    valuePick = sortedByValue.find(b => 
      b !== rarePick && 
      b !== seasonPick && 
      b.shop !== rarePick.shop
    ) || sortedByValue.find(b => b !== rarePick && b !== seasonPick) || beans[2] || beans[0];
  }

  const selection = [rarePick, seasonPick, valuePick].filter(Boolean);
  
  console.log(`Selection Shops: ${selection.map(b => b.shop).join(", ")}`);

  // === 3. Prompt (Strictly Preserved) ===
  const beansJson = JSON.stringify(selection, null, 2);
  
  const prompt = `
    角色：你是温哥华一家精品咖啡店的 Head Barista（首席咖啡师）。
    任务：给熟客写一篇小红书风格的咖啡豆推荐周报。

    核心理论基础：
	  ∙	Jonathan Gagné（咖啡科学家）的实证研究
	  ∙	SCA Golden Cup 标准
	  ∙	James Hoffmann 的冲煮技术
    
    ### 🛑 核心语气要求 (用质朴和专业的语气，不浮夸)：
    
    1. **拒绝化学课**：
       ❌ 坏例子：“通过厌氧发酵产生的乙酸乙酯化合物提供了强烈的水果酯香……”
       ✅ 好例子（行话）：“这支豆子发酵感很足，喝起来像蓝莓果酱，但如果冲不好容易有酱味。”
    
    2. **拒绝营销号废话**：
       ❌ 坏例子：“味蕾的交响乐，精致的芳香物质在舌尖跳舞……”
       ✅ 好例子（专业）：“酸质很亮，像喝热的柠檬水，非常解腻。”
    
    3. **物理逻辑要直给**：
       ❌ 坏例子：“由于其高密度特性，需要更高的热能激发……”
       ✅ 好例子（专业）：“这豆子密度很高（高海拔），可以用 96°C 水冲，不然酸味出不来。”
    
    4. **拒绝浮夸和夸张的语气**：
       ❌ 坏例子：“产季末的宝贝，喝一支少一支，错过就要等明年新产季了……”
       ✅ 好例子（专业）：“现在是这个豆子的产季末，如过错过了就要等到明年的新产季。”

    5. **不要用"我"第一人称**：
       ❌ 坏例子：“我会用95度水……”
       ✅ 好例子（行话）：“建议用95度水。”

    ### 📝 输出模板 (必须严格执行)：

    # 标题 本周手冲推荐

    # 开篇 (50字，直奔主题，本周是什么主题？)

    ---
    
    ## 推荐 1: [豆子名称]
    
    ### 1. 基本信息

    #### 豆子介绍
    烘焙商：[店名] | 名称：[豆子名称]
    📍 [产地] | 🌱 [品种] | ⚙️ [处理法]
    🔥 [烘焙度] | 📅 [日期] | 💰 [价格]
    
    
    #### 入手理由
    🌟 ① [时令/状态]
    - [用专业语气说话：例如 "正是这个豆子的产季，季节合适"]
    🌟 ② [稀缺/性价比]
    - [用专业语气说话]
    
    ### 2. 风味档案
    
    #### 味觉印象
    🌱 [品种]
    【特性】[一句话描述]
    【喝起来像】[具体的食物描述，不要抽象形容词]
    
    #### 冲煮参考
    📌 [推荐器械：V60/意式/冷萃]
    粉水比：[比例]
    水温：[具体温度] (⚠️ 必填：一句话解释为什么要这个温度，例如"浅烘怕萃不透")
    研磨：[粗细描述]


    ---
    (对推荐 2 和 3 重复以上结构)
    ---
    
    # 怎么选 (一句话总结)
    (表格)
    
    
    ### 📥 豆子数据:
    ${beansJson}
    
    ### 🏪 地址库:
    - Revolver: 325 Cambie St
    - Prototype: 883 E Hastings
    - Pallet: 2305 Ontario St
    - Modus: 112 W Broadway
    - Nemesis: 302 W Hastings
  `;

  try {
    const postContent = callGeminiAPI(prompt, false);
    saveDraft(postContent);

    // ✨ 核心回写：更新 Last Promoted Date
    console.log("📝 Updating 'Last Promoted Date' for selected beans...");
    selection.forEach(bean => {
      // 写入当前日期到第 39 列
      sheet.getRange(bean.rowIndex, 39).setValue(new Date());
    });
    console.log("✅ Dates updated. Cooldown active for 30 days.");

  } catch (e) {
    console.error("Failed:", e.message);
  }
}

// === HELPER FUNCTIONS ===

function formatDate(dateObj) {
  if (!dateObj) return "近日";
  if (typeof dateObj === 'string') return dateObj;
  try {
    return Utilities.formatDate(dateObj, Session.getScriptTimeZone(), "MM月dd日");
  } catch (e) {
    return "近日";
  }
}

function saveDraft(content) {
  const targetSheet = getTargetSheet(); 
  const ss = targetSheet.getParent(); 
  let sheet = ss.getSheetByName("Weekly_Drafts");
  if (!sheet) {
    sheet = ss.insertSheet("Weekly_Drafts");
    sheet.appendRow(["Date", "Generated Post Content"]);
    sheet.setColumnWidth(1, 150); 
    sheet.setColumnWidth(2, 600); 
    sheet.getRange("B:B").setWrap(true);
  }
  const today = new Date();
  sheet.appendRow([today, content]);
  console.log("✅ Post generated and saved to 'Weekly_Drafts' sheet.");
}

function callGeminiAPI(text, forceJson) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${GEMINI_API_KEY}`;
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
    {name: "Revolver", domain: "revolvercoffee.ca"},
    {name: "Rogue Wave", domain: "roguewavecoffee.ca"},
    {name: "Prototype", domain: "prototypecoffee.ca"},
    {name: "Pallet", domain: "palletcoffeeroasters.com"},
    {name: "Luna", domain: "enjoylunacoffee.com"}
  ];

  shops.forEach(shop => {
    const result = fetchShopify(shop.name, shop.domain);
    console.log(`${shop.name}: Found ${result.length}`);
    allBeans = allBeans.concat(result);
  });

  return filterForCoffee(allBeans);
}

function fetchShopify(shopName, domain) {
  try {
    const url = `https://${domain}/products.json?limit=250`;
    const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    if (response.getResponseCode() !== 200) return [];
    const json = JSON.parse(response.getContentText());
    
    return json.products.map(p => {
      const v = p.variants[0];
      let desc = (p.body_html || "").replace(/<[^>]*>?/gm, ' ').replace(/\s+/g, ' ').trim();
      if (desc.length < 50) desc = p.title + ". " + desc;

      return {
        shop: shopName,
        name: p.title,
        price: "$" + v.price,
        weight: v.weight > 0 ? v.weight + v.weight_unit : "Unknown",
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

function filterForCoffee(items) {
  const exclude = ["gift card", "subscription", "workshop", "tee", "tote", "filter", "kettle", "dripper", "class", "cupping", "soap", "socks"];
  return items.filter(item => {
    const name = item.name.toLowerCase();
    const type = (item.type || "").toLowerCase();
    if (exclude.some(bad => name.includes(bad) || type.includes(bad))) return false;
    const isCoffeeType = type.includes("coffee") || type.includes("bean") || type.includes("espresso");
    const nameLooksLikeCoffee = name.includes("washed") || name.includes("natural") || name.includes("honey") || name.includes("g") || name.includes("lb");
    return isCoffeeType || nameLooksLikeCoffee;
  });
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
    "V60 Score", "Espresso Score", "French Press Score", "Cold Brew Score",
    "Price/g", "Value Score",
    "Comparison", "Reason", "Avoid Tips",
    "Status", 
    "Last Promoted Date" // ✨ Col 39 (New)
  ];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight("bold");
  sheet.setFrozenRows(1);
  console.log("✅ Headers updated: Added 'Last Promoted Date'.");
}
