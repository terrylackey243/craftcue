// Renders synthetic "photos" of fictional craft products (brand: Maple Lane Crafts) for the
// vision recording suite. Run inside the Playwright image; see CONTRIBUTING.md.
import { chromium } from '@playwright/test'

const pkg = (color, bg, label, sub, size, count, upc) => `
<div style="width:360px;height:470px;background:${bg};border-radius:18px;padding:22px;box-shadow:0 8px 20px #0004;font-family:Arial;display:flex;flex-direction:column;gap:10px;transform:rotate(${(Math.random()*6-3).toFixed(1)}deg)">
  <div style="font-size:18px;font-weight:bold;color:#333">MAPLE LANE CRAFTS</div>
  <div style="font-size:34px;font-weight:900;color:#222;line-height:1.05">${label}</div>
  <div style="font-size:20px;color:#444">${sub}</div>
  <div style="flex:1;border-radius:10px;background:${color};border:3px solid #fff"></div>
  <div style="display:flex;justify-content:space-between;align-items:end">
    <div style="font-size:22px;font-weight:bold">${size}<br><span style="font-size:18px">${count}</span></div>
    ${upc ? `<div style="background:#fff;padding:6px;text-align:center;font:14px monospace"><div style="height:44px;width:120px;background:repeating-linear-gradient(90deg,#000 0 2px,#fff 2px 4px,#000 4px 5px,#fff 5px 8px)"></div>${upc}</div>` : ''}
  </div>
</div>`

const scenes = {
  package: `<body style="margin:0;background:#c9b79c;display:flex;align-items:center;justify-content:center;height:100vh">${pkg('#111', '#f3e7d3', 'PERMANENT ADHESIVE VINYL', 'Glossy finish · Outdoor', '12 in x 12 in', '6 SHEETS', '8 50012 34567 6')}</body>`,
  loose: `<body style="margin:0;background:#d9d4cc;display:flex;align-items:center;justify-content:center;height:100vh">
    <div style="width:520px;height:140px;border-radius:70px;background:linear-gradient(#e05a8a,#b8325f 60%,#e77aa0);box-shadow:0 12px 24px #0005;position:relative">
      <div style="position:absolute;right:-8px;top:10px;width:120px;height:120px;border-radius:50%;background:radial-gradient(#fff 18%,#e8dccb 20%,#e05a8a 55%)"></div>
    </div></body>`,
  bulk: `<body style="margin:0;background:#b89f7c;height:100vh;display:grid;grid-template-columns:repeat(3,1fr);gap:30px;padding:40px;box-sizing:border-box;align-items:center;justify-items:center">
    ${pkg('#f2c12e', '#fff8e8', 'IRON-ON HEAT TRANSFER', 'Glitter · Gold', '12 in x 19 in', '3 SHEETS')}
    ${pkg('#8fb996', '#eef6ee', 'CARDSTOCK', '80 lb · Sage green', '8.5 x 11 in', '50 SHEETS')}
    ${pkg('#fafafa', '#e9eef7', 'SUBLIMATION MUG BLANKS', 'White ceramic', '11 oz', '4 MUGS')}
    ${pkg('#eee', '#fdecef', 'TRANSFER TAPE', 'Standard grip · Clear', '12 in x 10 ft', '1 ROLL')}
    ${pkg('repeating-linear-gradient(45deg,#e74c3c 0 20px,#3498db 20px 40px,#2ecc71 40px 60px)', '#fff', 'FELT SHEETS', 'Rainbow assortment', '9 x 12 in', '20 SHEETS')}
  </body>`,
}
const sizes = { package: [900, 1100], loose: [1100, 800], bulk: [1500, 1250] }
const browser = await chromium.launch()
for (const [name, html] of Object.entries(scenes)) {
  const page = await browser.newPage({ viewport: { width: sizes[name][0], height: sizes[name][1] } })
  await page.setContent(html)
  await page.screenshot({ path: `tests/fixtures/photos/${name}.jpg`, type: 'jpeg', quality: 85 })
  await page.close()
}
await browser.close()
console.log('done')
