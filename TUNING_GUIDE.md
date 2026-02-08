# Tuning Guide: Coffee Recommendation Parameters

All tuning parameters are now centralized at the top of `app-script.js` for easy configuration.

---

## 📊 Scoring Weights

Located at **lines 32-38** in `app-script.js`:

```javascript
const SCORING_WEIGHTS = {
  quality: 0.40,      // Rare varieties, special processes, famous farms (40%)
  seasonality: 0.25,  // Freshness and crop timing (25%)
  value: 0.25,        // Price fairness (25%)
  versatility: 0.10   // Roast match for brew method (10%)
};
```

### What Each Weight Controls

**Quality (default: 40%)**
- Premium varieties: Geisha, Pink Bourbon, Sidra, Eugenioides
- Special processes: Anaerobic, Carbonic Maceration, Koji
- Famous farms: Granja Paraiso, Wilton Benitez, Finca Deborah
- Competition lots: COE, Auction winners

**Seasonality (default: 25%)**
- Fresh Arrival: 10 points
- Peak Season: 8 points
- Late Harvest: 5 points
- Past Crop: 2 points

**Value (default: 25%)**
- AI-calculated price fairness score
- Considers category fit + price position
- Already built into enrichment data

**Versatility (default: 10%)**
- Roast level match for brew method
- Light roast = 10 for pour-over, 5 for espresso
- Dark roast = 1 for pour-over, 10 for espresso

### ⚠️ Important Rules

1. **Weights must sum to 1.0** (or 100%)
2. **Minimum 0.05** per weight (don't zero out any category)
3. **Test after changes** - run generateWeeklyPost() and check rankings

---

## 🎯 Preset Profiles

Uncomment the profile you want in `app-script.js` (lines 53-63):

### 1. Balanced (Default) ✅
```javascript
SCORING_WEIGHTS = { quality: 0.40, seasonality: 0.25, value: 0.25, versatility: 0.10 };
```
**Best for:** General audience, mix of specialty and value
**Typical results:** 1-2 rare beans, 2 solid value picks

---

### 2. Adventurous (Specialty-Focused)
```javascript
SCORING_WEIGHTS = { quality: 0.50, seasonality: 0.30, value: 0.10, versatility: 0.10 };
```
**Best for:** Enthusiast audience, willing to pay premium
**Typical results:** 3-4 rare/special beans, prices $0.10-0.25/g

---

### 3. Value-Focused (Budget-Conscious)
```javascript
SCORING_WEIGHTS = { quality: 0.30, seasonality: 0.20, value: 0.40, versatility: 0.10 };
```
**Best for:** Price-sensitive audience
**Typical results:** 1 rare bean, 3 great-value beans, prices $0.06-0.12/g

---

### 4. Seasonal (Freshness Priority)
```javascript
SCORING_WEIGHTS = { quality: 0.35, seasonality: 0.40, value: 0.15, versatility: 0.10 };
```
**Best for:** Highlighting fresh arrivals and peak season
**Typical results:** Focus on "Fresh Arrival" and "Peak Season" status

---

## 🔢 Candidate Count

Located at **line 44**:

```javascript
const TOP_CANDIDATES_COUNT = 6;  // AI picks 2 from these N per category
```

### How It Works
- JavaScript scores all beans
- Sorts by recommendation score
- Sends top N to AI for final selection
- AI picks best 2 from N

### Recommendations by Count

| Count | Token Cost | Selection Rate | When to Use |
|-------|------------|----------------|-------------|
| 4 | ~$0.007 | 50% | Limited beans available |
| 6 | ~$0.009 | 33% | **Recommended default** |
| 8 | ~$0.011 | 25% | More shop diversity needed |
| 10 | ~$0.013 | 20% | Maximum choice for AI |

**Sweet spot:** 6 candidates (good balance of cost, quality, diversity)

---

## ⏰ Promotion Rules

Located at **lines 49-50**:

```javascript
const COOLDOWN_DAYS = 30;   // Days before same bean can be promoted again
const FRESHNESS_DAYS = 14;  // Only consider beans synced in last N days
```

### Cooldown Days (default: 30)
**What it does:** Prevents same bean appearing in reports within N days

**When to adjust:**
- **Increase to 45-60**: More variety, slower rotation
- **Decrease to 21**: Allow popular beans more frequently
- **Set to 0**: No cooldown (testing only)

### Freshness Days (default: 14)
**What it does:** Only considers beans synced recently

**When to adjust:**
- **Increase to 21**: Include slightly older sync data
- **Decrease to 7**: Only freshest data (if syncing daily)
- **Set to 30**: Include all recent beans

---

## ⚙️ Enrichment Settings

Located at **lines 55-56**:

```javascript
const ENRICH_SLEEP_SECONDS = 2;        // Cooldown between API calls
const ENRICH_ERROR_SLEEP_SECONDS = 120; // Cooldown after rate limit error
```

### Sleep Seconds (default: 2)
**What it does:** Delay between enriching each bean

**When to adjust:**
- **Increase to 3-5**: Reduce API rate (conservative)
- **Decrease to 1**: Faster enrichment (if no rate limits)
- **Set to 0.5**: Maximum speed (risky)

### Error Sleep (default: 120)
**What it does:** Wait time after hitting rate limit

**When to adjust:**
- **Increase to 180-300**: If frequently hitting limits
- **Decrease to 60**: If limits are temporary
- Keep default unless issues occur

---

## 🧪 Testing Your Changes

### 1. Test Scoring Changes
```javascript
// In Apps Script, run:
generateWeeklyPost();

// Check console output:
// "Top N Pour-Over Candidates" - are rankings correct?
// Look at Q/S/V/Ver scores - do they reflect your weights?
```

### 2. Validate Results
- [ ] Top beans match your expectations
- [ ] Shop diversity is good (4-5+ shops)
- [ ] No duplicates across categories
- [ ] Cost is acceptable (check logs)

### 3. Compare Before/After
```javascript
// Before changing weights, note:
// - Which beans ranked #1-6
// - Their scores breakdown

// After changing weights:
// - Did rankings change as expected?
// - Are new top beans better for your goals?
```

---

## 📈 Common Tuning Scenarios

### Scenario 1: "Too many generic blends in top picks"
**Solution:** Increase quality weight
```javascript
SCORING_WEIGHTS = { quality: 0.50, seasonality: 0.25, value: 0.15, versatility: 0.10 };
```

---

### Scenario 2: "Missing fresh arrivals"
**Solution:** Increase seasonality weight
```javascript
SCORING_WEIGHTS = { quality: 0.35, seasonality: 0.40, value: 0.15, versatility: 0.10 };
```

---

### Scenario 3: "Prices too high for audience"
**Solution:** Increase value weight
```javascript
SCORING_WEIGHTS = { quality: 0.30, seasonality: 0.20, value: 0.40, versatility: 0.10 };
```

---

### Scenario 4: "Not enough shop diversity"
**Solution:** Increase candidate count
```javascript
const TOP_CANDIDATES_COUNT = 8;  // Up from 6
```

---

### Scenario 5: "Same beans appearing too often"
**Solution:** Increase cooldown period
```javascript
const COOLDOWN_DAYS = 45;  // Up from 30
```

---

## 🔍 Monitoring Tips

### Console Output Analysis
Look for these indicators in logs:

**Good Signs:**
- Top beans have quality scores 7-10
- Mix of rare (8-10) and accessible (5-7) options
- 4-5+ different shops in top 6
- AI reasoning mentions "diversity" and "balance"

**Warning Signs:**
- All top beans from same shop
- Quality scores all below 6
- Same beans week after week
- AI reasoning says "limited options"

### Adjustment Frequency
- **Weekly**: Check rankings, adjust if needed
- **Monthly**: Review overall patterns, tune weights
- **Quarterly**: Evaluate if profiles match audience

---

## 💡 Pro Tips

1. **Start conservative**: Use default balanced profile first
2. **Change one thing at a time**: Easier to understand impact
3. **Document changes**: Note what you changed and why
4. **A/B test**: Try different profiles for 2-3 weeks each
5. **Ask for feedback**: See what your audience prefers

---

## 📞 Need Help?

**Common Questions:**

**Q: Can I set quality to 100%?**
A: No, all weights must be > 0. Minimum 0.05 (5%) per weight.

**Q: Do weights have to be whole numbers?**
A: No! Use decimals: 0.35, 0.275, etc. Must sum to 1.0.

**Q: How often should I change weights?**
A: Only when rankings don't match your goals. Don't change just to change.

**Q: Can I have more than 4 weights?**
A: No, the 4 dimensions are fixed. Adjust their proportions only.

---

**Version:** 2.0
**Last Updated:** 2026-02-07
**Quick Edit Location:** `app-script.js` lines 32-56
