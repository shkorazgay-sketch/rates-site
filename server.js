import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';

const { PORT = 3000, CHANNEL = 'bazari_dolaraka' } = process.env;
const FILE = './rates.json';

let rates = { main: 168000, sulaymaniyah: 167700, sulaymaniyahBuy: 167650, updatedAt: null, lastPostId: 0 };
try { rates = { ...rates, ...JSON.parse(fs.readFileSync(FILE, 'utf8')) }; } catch {}
const save = () => { try { fs.writeFileSync(FILE, JSON.stringify(rates)); } catch {} };

const toEn = s => s.replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d));
const ok = n => n >= 100000 && n <= 250000; // نرخی ١٠٠ دۆلار بە دینار
const num = s => Number(s.replace(/[,،٬]/g, ''));

// دەقی پۆستێک دەخوێنێتەوە. شێوازەکانی چەناڵەکە:
//   "$100=168,550"                  ← نرخی سەرەکی بازاڕ
//   "سلێمانی  167,700 ع  167,650 ط ..." ← نرخی سلێمانی (ع=فرۆشتن، ط=کڕین)
export function parseRates(raw) {
  const text = toEn(raw);
  const out = {};
  if (/تمن|حەوالە|حوالة/.test(text)) return out; // نرخی تمەن و حەوالە پشتگوێ بخە

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

export async function poll() {
  try {
    const r = await fetch(`https://t.me/s/${CHANNEL.replace('@', '')}`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!r.ok) return console.log('t.me وەڵامی نەدایەوە', r.status);
    const html = await r.text();
    const posts = [];
    for (const chunk of html.split('data-post="').slice(1)) {
      const id = Number(chunk.match(/^[^"]+\/(\d+)"/)?.[1]);
      const body = chunk.match(/js-message_text[^>]*>([\s\S]*?)<\/div>/)?.[1];
      if (id && body) posts.push({ id, text: decode(body) });
    }
    posts.sort((a, b) => a.id - b.id);
    const todo = rates.lastPostId ? posts.filter(p => p.id > rates.lastPostId) : posts.slice(-15);
    for (const p of todo) {
      const found = parseRates(p.text);
      if (Object.keys(found).length) {
        rates = { ...rates, ...found, updatedAt: new Date().toISOString() };
        console.log('نرخ نوێ بوویەوە، پۆستی', p.id, found);
      }
      rates.lastPostId = Math.max(rates.lastPostId || 0, p.id);
    }
    if (todo.length) save();
  } catch (e) { console.log('هەڵە لە خوێندنەوە:', e.message); }
}

const app = express();
app.use(cors());
app.get('/api/rates', (req, res) => res.json(rates));
app.get('/', (req, res) => res.sendFile(path.resolve('index.html')));

if (process.argv[1].endsWith('server.js')) {
  poll();
  setInterval(poll, 60_000);
  app.listen(PORT, () => console.log('کار دەکات لەسەر', PORT));
}
