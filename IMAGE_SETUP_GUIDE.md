# Product Images Setup Guide

Your reports now include actual product images instead of placeholders! 📸

---

## ✅ What Changed

### 1. New "Image URL" Column in Google Sheets
- Added between "URL" and "Roast Date" columns
- Automatically populated during sync
- Contains direct image URLs from Shopify/Squarespace

### 2. Image Capture During Sync
- `fetchShopify()`: Captures first product image from `images` array
- `fetchSquarespace()`: Captures from `assetUrl` field
- Updates existing beans with new images

### 3. Images in Generated Markdown
All reports now include images using standard markdown syntax:

```markdown
### Pick 1: [Bean Name](product_url)

![Bean Name](image_url)

#### Coffee Profile
...
```

### 4. Automatic HTML Conversion
Your existing `convert.js` in `coffee-weekly` repo automatically converts markdown images to HTML `<img>` tags - no changes needed!

---

## 🚀 Setup Steps

### Step 1: Update Sheet Headers
```javascript
// In Google Apps Script, run:
setupHeaders();
```

This adds the new "Image URL" column.

### Step 2: Re-Sync Data to Capture Images
```javascript
// Run:
syncCoffeeData();
```

This will:
- Fetch product data including images
- Add image URLs to existing beans
- Populate new beans with images

### Step 3: Generate Report
```javascript
// Run as normal:
generateWeeklyPost();
```

The generated markdown will now include images!

---

## 📊 What Images Look Like

### In Markdown (GitHub):
```markdown
### Pick 1: [Panama Bambito Estate Geisha](https://roguewavecoffee.ca/products/...)

![Panama Bambito Estate Geisha](https://cdn.shopify.com/s/files/1/0042/0773/8992/files/geisha.jpg)

#### Coffee Profile
- Roaster: Rogue Wave
- Origin: Panama
...
```

### In HTML (Your Site):
```html
<h3>Pick 1: <a href="https://roguewavecoffee.ca/products/...">Panama Bambito Estate Geisha</a></h3>

<img src="https://cdn.shopify.com/s/files/1/0042/0773/8992/files/geisha.jpg" alt="Panama Bambito Estate Geisha">

<h4>Coffee Profile</h4>
<ul>
  <li>Roaster: Rogue Wave</li>
  <li>Origin: Panama</li>
  ...
</ul>
```

---

## 🔍 Verify Images Work

### Check Google Sheet
1. Open your spreadsheet
2. Find "Image URL" column (column 8)
3. Hover over URLs - should see image previews
4. If empty, run `syncCoffeeData()` again

### Check Generated Markdown
1. After running `generateWeeklyPost()`
2. Open the generated file in `coffee-weekly/posts/YYYY-MM-DD/`
3. Look for lines like: `![Bean Name](https://cdn.shopify.com/...)`
4. Open in markdown preview - images should display

### Check HTML Output
1. In your `coffee-weekly` repo, run: `node convert.js`
2. Open the generated HTML in browser
3. Product images should display above each coffee profile

---

## 🐛 Troubleshooting

### Images Not Showing in Sheet
**Problem:** "Image URL" column is empty

**Solution:**
1. Run `setupHeaders()` to ensure column exists
2. Run `syncCoffeeData()` to fetch images
3. Check if shop APIs are working (some products might not have images)

---

### Images Not in Generated Report
**Problem:** Generated markdown has no `![...]()` lines

**Solution:**
1. Verify sheet has image URLs populated
2. Re-run `generateWeeklyPost()`
3. Check console for errors

---

### Broken Image Links
**Problem:** Images show as broken in HTML

**Possible causes:**
1. **Shopify CDN URLs expired** - rare, but can happen
2. **Product removed** - old beans may have dead links
3. **CORS issues** - some CDNs block external embedding

**Solution:**
- Re-sync data to get fresh URLs: `syncCoffeeData()`
- Images are from official product pages, so should work
- If persistent, check if shop changed image hosting

---

### Images Too Large/Slow
**Problem:** Page loads slowly with large images

**Solution:** Update your `convert.js` or CSS to add responsive sizing:

```css
/* In your template.html or CSS */
img {
  max-width: 100%;
  height: auto;
  max-height: 400px;
  object-fit: cover;
}
```

---

## 📝 Image Sources

### Shopify Stores (Most shops)
- Format: `https://cdn.shopify.com/s/files/1/.../product.jpg`
- Usually high-quality product photos
- CDN-hosted, fast loading
- Stores: Revolver, Rogue Wave, Pallet, Nemesis, Elysian, Matchstick

### Squarespace Stores (Prototype)
- Format: `https://images.squarespace-cdn.com/.../product.jpg`
- Professional product photography
- Also CDN-hosted

---

## 💡 Pro Tips

1. **Image Quality**: Shops upload their own images - quality varies
2. **Fallback**: If image URL is empty, markdown still works (just no image shown)
3. **Alt Text**: Uses bean name as alt text for accessibility
4. **Lazy Loading**: Consider adding `loading="lazy"` in your HTML template for performance
5. **Cache**: CDN images are cached, so updates may take time to reflect

---

## 🎨 Customization Options

### Option 1: Different Image Size
Shopify CDN supports image transformations in URL:
```
Original: https://cdn.shopify.com/.../image.jpg
Small:    https://cdn.shopify.com/.../image_small.jpg
Medium:   https://cdn.shopify.com/.../image_medium.jpg
Large:    https://cdn.shopify.com/.../image_large.jpg
```

You can modify URLs in your markdown generation or HTML template.

### Option 2: Add Image Gallery
If products have multiple images (stored in API response), you could:
1. Capture all image URLs (not just first)
2. Store as JSON in sheet
3. Generate carousel in HTML

### Option 3: Thumbnail View
Create a summary page with all bean images as thumbnails linking to full reports.

---

## 🔄 Next Steps

1. ✅ Run `setupHeaders()` to add column
2. ✅ Run `syncCoffeeData()` to populate images
3. ✅ Run `generateWeeklyPost()` to test
4. ✅ Check markdown file has images
5. ✅ Run your `convert.js` to generate HTML
6. ✅ View in browser to verify images display

---

## ❓ FAQ

**Q: Do I need to change anything in coffee-weekly repo?**
A: No! The existing `convert.js` automatically handles markdown images.

**Q: What if a bean has no image?**
A: The sync will save an empty string. The markdown will just not have an image line (report still works fine).

**Q: Can I use my own images instead?**
A: Yes, just manually edit the "Image URL" column in the sheet with your preferred URL.

**Q: Do images work on GitHub?**
A: Yes! GitHub markdown preview will display them automatically.

**Q: Are these images copyright-free?**
A: These are official product photos from the coffee shops. Since you're linking to their products, it's fair use, but proper attribution (shop name + product link) is included.

---

**Version:** 2.0
**Date:** 2026-02-07
**Status:** ✅ Ready to use
