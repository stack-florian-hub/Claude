// Contrôle visuel local : sert le dossier, injecte une base factice depuis data/seed.json, capture desktop et mobile.
// node tests/screenshot.js <dossier_sortie>
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), out = process.argv[2] || '.';
const seed = fs.existsSync(path.join(root, 'data/seed.json')) ? JSON.parse(fs.readFileSync(path.join(root, 'data/seed.json'))) : { biens: [], marche: {} };
const srv = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
  if (p === '/geo.json') p = '/data/geo.json';
  const f = path.join(root, p);
  if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  let body = fs.readFileSync(f);
  if (p === '/index.html') body = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>' + body + '</body></html>';
  res.writeHead(200, { 'content-type': p.endsWith('.html') ? 'text/html; charset=utf-8' : p.endsWith('.js') ? 'text/javascript' : 'application/json' }); res.end(body);
}).listen(0, async () => {
  const port = srv.address().port, empty = process.argv.includes('--vide');
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' }).catch(() => chromium.launch());
  const init = `(() => { const seed = ${JSON.stringify(empty ? { biens: [], marche: {} } : seed)};
    function snap(list){ return { docs: list.map(([id,d])=>({id, exists:true, data:()=>d})), size:list.length, empty:!list.length } }
    function coll(name){ const items = name==='biens' ? seed.biens.map(b=>[b.id,b]) : name==='marche' ? Object.entries(seed.marche||{}) : name==='journal' ? (seed.journal||[]).map((j,i)=>['j'+i,j]) : [];
      const q = { limit(){return q}, onSnapshot(cb){ setTimeout(()=>cb(snap(items)),50); return ()=>{} }, doc(id){ return { set: async()=>{} } } }; return q; }
    const db = { collection: coll, doc(){ return { onSnapshot(cb){ setTimeout(()=>cb({exists:false}),50); return ()=>{} }, set: async()=>{} } } };
    window.claude = { use: async (n) => n==='db' ? db : null }; })();`;
  const errors = [];
  for (const [name, vp, scheme] of [['desktop', { width: 1300, height: 900 }, 'light'], ['mobile', { width: 400, height: 860 }, 'dark']]) {
    const ctx = await browser.newContext({ viewport: vp, colorScheme: scheme });
    const page = await ctx.newPage(); page.on('pageerror', e => errors.push(name + ': ' + e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(name + ' console: ' + m.text()); });
    await page.addInitScript(init);
    await page.goto(`http://localhost:${port}/`); await page.waitForTimeout(900);
    const tabs = empty ? ['tableau'] : ['tableau', 'comparatif', 'carte', 'simulateur', 'strategies', 'marche', 'parametres', 'journal'];
    for (const t of tabs) {
      await page.click(`[data-tab="${t}"]`); await page.waitForTimeout(400);
      const ow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      if (ow > 0) errors.push(`${name}/${t}: débordement horizontal ${ow}px`);
      await page.screenshot({ path: path.join(out, `${empty ? 'vide-' : ''}${name}-${t}.png`), fullPage: false });
    }
    if (!empty) { await page.click('[data-tab="comparatif"]'); await page.waitForTimeout(300); const f = await page.$('tr.click'); if (f) { await f.click(); await page.waitForTimeout(400); await page.screenshot({ path: path.join(out, `${name}-fiche.png`) }); } }
    await ctx.close();
  }
  console.log(JSON.stringify(errors, null, 1)); await browser.close(); srv.close();
});
