# Vancouver Coffee Weekly - Automated Recommendation System

An intelligent coffee recommendation system that analyzes data from Vancouver's specialty coffee roasters and generates bilingual weekly reports using AI-powered selection and multi-dimensional scoring.

---

## 🎯 How It Works

The system uses a **3-phase hybrid approach** combining deterministic JavaScript scoring with AI-powered selection and content generation.

### Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│  Phase 0: Data Collection                               │
│  - Fetch product data from Shopify/Squarespace APIs     │
│  - Sync to Google Sheets                                │
│  - Enrich with AI analysis (variety, process, etc.)     │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  Phase 1: JavaScript Pre-Scoring (Deterministic)        │
│  - Calculate 4 scores for ALL beans:                    │
│    • Quality (40%): Rare varieties, special processes   │
│    • Seasonality (25%): Freshness, crop timing          │
│    • Value (25%): Price fairness                        │
│    • Versatility (10%): Roast match for brew method     │
│  - Sort by recommendation score                          │
│  - Select top 6 candidates per category                 │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  Phase 2: AI Selection (Context-Aware)                  │
│  - Send top 6+6 candidates to AI with descriptions      │
│  - AI picks best 2 pour-over + 2 espresso beans         │
│  - Validates no duplicates or category mismatches       │
│  - Returns selections with reasoning                    │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  Phase 3: AI Content Generation                         │
│  - Generate bilingual content (Chinese + English)       │
│  - Write detailed profiles and recommendations          │
│  - Save to Google Sheets and push to GitHub             │
└─────────────────────────────────────────────────────────┘
```

---

## 📊 Multi-Dimensional Scoring System

### Scoring Weights (Configurable)

Located at **lines 32-38** in `app-script.js`:

```javascript
const SCORING_WEIGHTS = {
  quality: 0.40,      // Rare varieties, special processes, famous farms
  seasonality: 0.25,  // Freshness and crop timing
  value: 0.25,        // Price fairness
  versatility: 0.10   // Roast match for brew method
};
```

### 1. Quality Score (0-10)

**Base:** 2 points

**Bonuses:**
- Premium variety (Geisha, Pink Bourbon, Sidra, etc.): +3
- Rare variety flag: +2
- Special process (Anaerobic, Carbonic, Koji): +2
- Micro lot: +1
- Famous farm (Granja Paraiso, Wilton Benitez, etc.): +1
- Competition (COE, Auction): +2

**Examples:**
- Generic blend: 2/10
- Single-origin Caturra: 4/10
- Geisha from famous farm: 9/10

### 2. Seasonality Score (0-10)

**Status-based:**
- Fresh Arrival: 10 points
- Peak Season: 8 points
- Late Harvest: 5 points
- Past Crop: 2 points

**Modifiers:**
- Freshness ≥9: +1
- Freshness ≤6: -1

### 3. Value Score (0-10)

Uses AI-calculated score from enrichment phase that considers:
- Category fit (Rare vs Accessible vs Premium)
- Price position relative to quality
- Market value assessment

### 4. Versatility Score (0-10)

**Pour-over preference:**
- Light: 10
- Light-Medium: 8
- Medium: 6
- Medium-Dark: 3
- Dark: 1

**Espresso preference:**
- Dark: 10
- Medium-Dark: 10
- Medium: 9
- Light-Medium: 7
- Light: 5

**Bonuses:**
- Clear tasting notes: +1
- High freshness: +1

---

## 🎛️ Configuration & Tuning

### Key Parameters (Top of `app-script.js`)

```javascript
// Scoring weights
const SCORING_WEIGHTS = { quality: 0.40, seasonality: 0.25, value: 0.25, versatility: 0.10 };

// Candidate selection
const TOP_CANDIDATES_COUNT = 6;  // AI picks 2 from these N per category

// Promotion rules
const COOLDOWN_DAYS = 30;        // Days before same bean can reappear
const FRESHNESS_DAYS = 14;       // Only consider beans synced recently

// Enrichment settings
const ENRICH_SLEEP_SECONDS = 2;
const ENRICH_ERROR_SLEEP_SECONDS = 120;
```

### Preset Profiles

**Balanced (Default):**
```javascript
{ quality: 0.40, seasonality: 0.25, value: 0.25, versatility: 0.10 }
```
Good mix of specialty and value beans.

**Adventurous (Specialty-Focused):**
```javascript
{ quality: 0.50, seasonality: 0.30, value: 0.10, versatility: 0.10 }
```
Prioritizes rare varieties and fresh arrivals.

**Value-Focused (Budget-Conscious):**
```javascript
{ quality: 0.30, seasonality: 0.20, value: 0.40, versatility: 0.10 }
```
Emphasizes price fairness and accessibility.

See **[TUNING_GUIDE.md](./TUNING_GUIDE.md)** for detailed tuning instructions.

---

## 🔧 Key Functions

### Main Workflow

1. **`syncCoffeeData()`** - Fetch and sync product data from shops
2. **`enrichNewBeans()`** - AI enrichment for new beans
3. **`generateWeeklyPost()`** - Generate recommendations and bilingual content

### Scoring Functions (Lines 489-631)

- `calculateQualityScore(bean)` - Detects rare varieties, processes, farms
- `calculateSeasonalityScore(bean)` - Evaluates freshness and timing
- `calculateVersatilityScore(bean, brewMethod)` - Matches roast to method
- `calculateRecommendationScore(bean, brewMethod)` - Combines all scores

### Category Filtering (Lines 750-1035)

**Prevents duplicates and mismatches:**
- Excludes espresso-named beans from pour-over
- Strict roast level filtering (Light for pour-over, Medium/Dark for espresso)
- Handles "Omni" roasts with special logic

---

## 🖼️ Product Images

Product images are automatically captured during sync and inserted into generated reports.

**Sources:**
- **Shopify stores:** `cdn.shopify.com` URLs from `images` array
- **Squarespace stores:** `images.squarespace-cdn.com` from `assetUrl` field

**Image workflow:**
1. Captured during `syncCoffeeData()` and stored in "Image URL" column
2. Post-processed after AI generation - inserted into markdown via `insertProductImages()`
3. Converted to HTML `<img>` tags by `convert.js`

See **[IMAGE_SETUP_GUIDE.md](./IMAGE_SETUP_GUIDE.md)** for setup details.

---

## 💰 Cost Analysis

### Per-Report Cost Breakdown

| Component | Cost | Details |
|-----------|------|---------|
| Enrichment | $0.004/bean | Gemini 2.5 Flash Lite |
| Selection (Phase 1) | $0.009 | Gemini 2.5 Pro (~2,196 tokens input) |
| Generation (Phase 2) | $0.038 | Gemini 2.5 Pro (~5,200 tokens combined) |
| **Total** | **~$0.047** | For 4 selected beans with bilingual content |

### Annual Estimate

- 52 weekly reports: ~$2.44/year
- Plus enrichment costs: ~$0.20-0.40/year (varies by new bean count)
- **Total: ~$2.65-2.85/year**

---

## 🚀 Getting Started

### Prerequisites

1. Google Apps Script project
2. Google Sheets with coffee data
3. Gemini API key
4. GitHub token (for pushing content)

### Setup

1. **Configure Script Properties:**
```javascript
// Run in Apps Script:
setupScriptProperties();
```

Or manually set:
- `GEMINI_API_KEY`
- `SPREADSHEET_ID`
- `GITHUB_TOKEN`

2. **Initialize Sheet Headers:**
```javascript
setupHeaders();
```

3. **First Sync:**
```javascript
syncCoffeeData();
enrichNewBeans();
```

4. **Generate Report:**
```javascript
generateWeeklyPost();
```

See **[SETUP_GUIDE.md](./SETUP_GUIDE.md)** for detailed setup instructions.

---

## 📁 File Structure

```
claude-coffee-skill/
├── app-script.js              # Main Google Apps Script
├── README.md                  # This file
├── IMPLEMENTATION_SUMMARY.md  # v2.0 architecture details
├── TUNING_GUIDE.md           # Scoring parameter tuning
├── SETUP_GUIDE.md            # Configuration and setup
├── IMAGE_SETUP_GUIDE.md      # Product image integration
└── token_savings.md          # Cost optimization details
```

---

## 🎨 HTML Report Generation

The system outputs markdown files that are converted to HTML using `convert.js` in the **coffee-weekly** repo.

**Design features:**
- Neumorphic soft UI design
- DM Sans + Noto Serif SC typography
- Staggered card animations on load
- Enhanced hover states with subtle rotation
- Product images from shop CDNs
- Bilingual support (Chinese/English)

**Convert to HTML:**
```bash
cd ~/Work/coffee-weekly
node convert.js
```

---

## 🐛 Troubleshooting

### Common Issues

**"No beans available" after filtering:**
- Check `FRESHNESS_DAYS` - may need to increase
- Check `COOLDOWN_DAYS` - recently promoted beans are excluded
- Verify beans are marked "COMPLETED" in status column

**"AI selection incomplete" (0 beans selected):**
- Check bean name matching in `findBeanByName()`
- Verify top candidates have descriptions
- Check console logs for API errors

**Images not showing:**
- Verify "Image URL" column exists (column 8)
- Re-run `syncCoffeeData()` to capture images
- Check if shop URLs are accessible

See individual guide files for detailed troubleshooting.

---

## 📝 Version History

### v2.0 (2026-02-07)
- ✅ Multi-dimensional scoring system
- ✅ Hybrid JavaScript + AI selection
- ✅ Fixed duplicate beans across categories
- ✅ Fixed espresso beans in pour-over
- ✅ Product image integration
- ✅ Reduced candidates from 10 to 6 (36% token savings)
- ✅ Centralized tuning parameters
- ✅ Squarespace URL fixes

### v1.0 (Previous)
- Basic value-score based selection
- Single-phase AI generation
- Placeholder images

---

## 🤝 Contributing

The system is designed to be tunable and extensible:

1. **Adjust scoring weights** in `SCORING_WEIGHTS` for different audience preferences
2. **Add new shops** by updating shop configurations
3. **Modify scoring logic** in scoring functions (lines 489-631)
4. **Customize AI prompts** for different content styles

---

## 📄 License

Private project for Vancouver Coffee Weekly.

---

**Last Updated:** 2026-02-07
**Version:** 2.0
**Status:** ✅ Production Ready
