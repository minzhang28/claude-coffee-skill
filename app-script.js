/**
 * Vancouver Coffee Bean Data Enrichment - Apps Script Version
 * 用 Claude API 自动填充 Google Sheet 的分析列 (列 10-38)
 */

// ============= 配置 =============
const ANTHROPIC_API_KEY = 'your-api-key-here'; // 替换成你的 Anthropic API key
const SPREADSHEET_ID = '1-Ei86RfHKrXnBZIwsiYFEExUqyIbCN0ub-CJhU1yB3U';

// ============= 主函数 =============
function enrichCoffeeData() {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getActiveSheet();
  const lastRow = sheet.getLastRow();
  
  if (lastRow <= 1) {
    Logger.log('没有数据需要处理');
    return;
  }
  
  // 读取所有数据
  const data = sheet.getRange(2, 1, lastRow - 1, 38).getValues();
  
  let processedCount = 0;
  const batchSize = 10; // 每次处理10行
  
  // 遍历每一行
  for (let i = 0; i < data.length && processedCount < batchSize; i++) {
    const row = data[i];
    
    // 检查第10列（Country，索引9）是否为空
    if (row[9] !== '') {
      continue; // 已经分析过，跳过
    }
    
    Logger.log(`\n处理第 ${i + 2} 行: ${row[1]}`);
    
    // 准备输入数据
    const beanData = {
      roaster_name: row[0],
      product_name: row[1],
      price: row[2],
      weight: row[3],
      stock_status: row[4],
      description: row[5] || ''
    };
    
    // 调用 Claude 分析
    const analysis = analyzeCoffeeBean(beanData);
    
    if (analysis) {
      // 计算价格相关
      const pricePerGram = calculatePricePerGram(row[2], row[3]);
      
      // 准备写入的数据（列 10-38）
      const analysisRow = [
        analysis.country || '',
        analysis.region || '',
        analysis.farm || '',
        analysis.altitude || '',
        analysis.variety || '',
        analysis.processing || '',
        analysis.roast_level || '',
        analysis.brew_method || '',
        analysis.flavor_notes || '',
        analysis.acidity || '',
        analysis.sweetness || '',
        analysis.body || '',
        analysis.new_crop || '',
        analysis.harvest_season || '',
        analysis.freshness_score || '',
        analysis.rare_variety || '',
        analysis.micro_lot || '',
        analysis.special_process || '',
        '', // Vancouver Exclusive
        analysis.v60_score || '',
        analysis.espresso_score || '',
        analysis.french_press_score || '',
        analysis.cold_brew_score || '',
        pricePerGram,
        '', // Value Score
        '', // Cross-Shop Avail.
        '', // Regional Comp.
        analysis.recommended_for || '',
        analysis.avoid_if || ''
      ];
      
      // 写入 Sheet（列 J-AL，即第10-38列）
      sheet.getRange(i + 2, 10, 1, 29).setValues([analysisRow]);
      
      Logger.log(`✅ 成功: ${analysis.variety} / ${analysis.processing}`);
      processedCount++;
      
      // 避免触发 API 速率限制
      Utilities.sleep(2000);
    } else {
      Logger.log(`❌ 分析失败`);
    }
  }
  
  Logger.log(`\n完成！本次处理了 ${processedCount} 行数据`);
}

// ============= Claude API 调用 =============
function analyzeCoffeeBean(beanData) {
  const prompt = `你是一位咖啡数据分析专家。请分析以下咖啡豆信息，并以 JSON 格式返回分析结果。

**咖啡豆信息：**
- 店名: ${beanData.roaster_name}
- 产品名: ${beanData.product_name}
- 价格: ${beanData.price}
- 规格: ${beanData.weight}
- 库存: ${beanData.stock_status}
- 官方描述: ${beanData.description.substring(0, 800)}

**请提取以下信息（如果无法从描述中确定，标记为 "Unknown"）：**

请返回严格的 JSON 格式，字段如下：
{
  "country": "产地国家 (如 Ethiopia, Kenya, Colombia)",
  "region": "产区 (如 Yirgacheffe, Huila, Kirinyaga)",
  "farm": "庄园/合作社名称",
  "altitude": "海拔 (如 1600-1800, 只返回数字范围)",
  "variety": "品种 (如 SL28, Geisha, Bourbon, Heirloom)",
  "processing": "处理法 (如 Washed, Natural, Honey, Anaerobic)",
  "roast_level": "烘焙度 (Light, Light-Medium, Medium, Medium-Dark, Dark 之一)",
  "brew_method": "适合的冲煮方式 (Filter, Espresso, Both)",
  "flavor_notes": "风味关键词，逗号分隔 (如 'Peach, Blackcurrant, Floral')",
  "acidity": "酸质等级 1-5 的数字 (1=低, 5=高)",
  "sweetness": "甜感等级 1-5 的数字",
  "body": "Body 等级 1-5 的数字",
  "new_crop": "是否新产季 (Yes/No/Unknown)",
  "harvest_season": "产季月份 (如 Oct-Dec, 或 Unknown)",
  "freshness_score": "新鲜度评分 1-5 的数字 (基于烘焙日期，如果有)",
  "rare_variety": "是否稀有品种 (Yes/No)",
  "micro_lot": "是否微批次 (Yes/No/Unknown)",
  "special_process": "特殊处理法 (如 Anaerobic, Carbonic Maceration, Co-ferment, 如无则 No)",
  "v60_score": "V60 适配度 1-5 的数字",
  "espresso_score": "意式适配度 1-5 的数字",
  "french_press_score": "法压适配度 1-5 的数字",
  "cold_brew_score": "冷萃适配度 1-5 的数字",
  "recommended_for": "推荐理由，简短一句话",
  "avoid_if": "避坑提示，简短一句话，如无则留空"
}

**分析原则：**
1. V60 适配：高酸质(4-5) + 轻烘焙 + 水洗处理 = 高分(4-5)；日晒处理 = 中等(3)
2. 意式适配：中烘 + Body强(4-5) + 甜感高 = 高分；高酸 = 低分
3. 法压适配：Body强 + 油脂丰富(日晒/蜜处理) = 高分
4. 冷萃适配：低酸(1-2) + 高甜感 + Body强 = 高分
5. 所有评分必须是 1-5 的数字，不要文字

只返回 JSON，不要任何其他文字或markdown标记。`;

  const payload = {
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1500,
    messages: [{
      role: 'user',
      content: prompt
    }]
  };
  
  const options = {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };
  
  try {
    const response = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', options);
    const result = JSON.parse(response.getContentText());
    
    if (result.content && result.content[0] && result.content[0].text) {
      let responseText = result.content[0].text.trim();
      
      // 清理可能的 markdown 代码块标记
      responseText = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      
      const analysis = JSON.parse(responseText);
      return analysis;
    }
    
    Logger.log('API 响应格式异常: ' + response.getContentText());
    return null;
    
  } catch (e) {
    Logger.log('Claude API 调用失败: ' + e.toString());
    return null;
  }
}

// ============= 计算价格相关 =============
function calculatePricePerGram(priceStr, weightStr) {
  try {
    // 提取价格
    const price = parseFloat(priceStr.replace('$', '').trim());
    
    // 提取重量并转换为克
    weightStr = weightStr.toLowerCase();
    let weightInGrams;
    
    if (weightStr.includes('g') && !weightStr.includes('kg')) {
      // 处理克 (250g, 340g)
      weightInGrams = parseFloat(weightStr.match(/\d+/)[0]);
    } else if (weightStr.includes('kg')) {
      // 处理千克
      weightInGrams = parseFloat(weightStr.match(/[\d.]+/)[0]) * 1000;
    } else if (weightStr.includes('oz')) {
      // 处理盎司
      const oz = parseFloat(weightStr.match(/[\d.]+/)[0]);
      weightInGrams = oz * 28.35;
    } else if (weightStr.includes('lb')) {
      // 处理磅
      const lb = parseFloat(weightStr.match(/[\d.]+/)[0]);
      weightInGrams = lb * 453.592;
    } else {
      return 'N/A';
    }
    
    const pricePerGram = price / weightInGrams;
    return '$' + pricePerGram.toFixed(3);
    
  } catch (e) {
    Logger.log('计算价格失败: ' + e.toString());
    return 'N/A';
  }
}

// ============= 创建自定义菜单 =============
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('☕ 咖啡数据工具')
    .addItem('🔄 分析未处理的数据', 'enrichCoffeeData')
    .addItem('📊 查看统计', 'showStats')
    .addToUi();
}

function showStats() {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getActiveSheet();
  const lastRow = sheet.getLastRow();
  
  if (lastRow <= 1) {
    SpreadsheetApp.getUi().alert('没有数据');
    return;
  }
  
  const data = sheet.getRange(2, 1, lastRow - 1, 10).getValues();
  
  let totalBeans = data.length;
  let analyzedBeans = 0;
  let inStock = 0;
  
  data.forEach(row => {
    if (row[9] !== '') analyzedBeans++; // 第10列有数据
    if (row[4] === 'In Stock') inStock++;
  });
  
  const message = `
📊 数据统计

总咖啡豆数: ${totalBeans}
已分析: ${analyzedBeans}
未分析: ${totalBeans - analyzedBeans}
库存中: ${inStock}
已售罄: ${totalBeans - inStock}
  `;
  
  SpreadsheetApp.getUi().alert(message);
}
