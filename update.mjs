import fs from 'fs';
const CHANNEL = 'bazari_dolaraka';

const toEn = s => s.replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d));
const ok = n => n >= 100000 && n <= 250000;
const num = s => Number(s.replace(/[,،٬]/g, ''));

function parseRates(raw) {
  const text = toEn(raw);
  const out = {};
  if (/تمن|حەوالە|حوالة/.test(text)) return out;
  const m = text.match(/\$\s*100\s*=\s*([\d,]+)/);
  if (m && ok(num(m[1]))) out.main = num(m[1]);
  const lines = text.split('\n');
  const i = lines.findIndex(l => /سلێمانی|سلیمانی|سليمانية/.test(l));
  if (i >= 0) {
    const block = lines.slice(i, i + 12).join('\n');
    const sell = block.match(/(\d[\d,]{4,})\s*ع/);
    const buy = block.match(/(\d[\d,]{4,})\s*ط/);
    if (sell && ok(num(sell[1]))) out.sulaymaniyah = num(sell[1]);
    if (buy && ok(num(buy[1]))) out.sulaymaniyahBuy = num(buy[1]);
  }
  return out;
}

const decode = s => s
  .replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n));

async function readPage(before) {
  const url = `https://t.me/s/${CHANNEL}` + (before ? `?before=${before}` : '');
  const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!r.ok) throw new Error('t.me ' + r.status);
  const html = await r.text();
  const posts = [];
  for (const chunk of html.split('data-post="').slice(1)) {
    const id = Number(chunk.match(/^[^"]+\/(\d+)"/)?.[1]);
    const body = chunk.match(/js-message_text[^>]*>([\s\S]*?)<\/div>/)?.[1];
    const time = chunk.match(/datetime="([^"]+)"/)?.[1];
    if (id && body) posts.push({ id, time, text: decode(body) });
  }
  return posts.sort((a, b) => a.id - b.id);
}

const FILE = 'api/rates';
let rates = {};
try { rates = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch {}

const posts = await readPage();
const apply = list => {
  for (const p of list) {
    const f = parseRates(p.text);
    Object.assign(rates, f);
    if (f.main && p.time) rates.updatedAt = p.time;
  }
};
if (!rates.main && posts.length) apply(await readPage(posts[0].id));
apply(posts);

fs.mkdirSync('api', { recursive: true });
fs.writeFileSync(FILE, JSON.stringify(rates));
console.log(rates);
