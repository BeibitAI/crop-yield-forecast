// Сбор данных для прогноза урожайности пшеницы в Казахстане.
//   Урожайность: FAOSTAT (официальная выгрузка Production: Crops and livestock, без ключа)
//   Погода:      NASA POWER (открытый API) или ERA5 через Copernicus CDS API (нужен ключ CDSAPI_KEY)
// Запуск:  node collector/collect.mjs [--weather power|era5] [--from 2000]
// Результат: data/kz_wheat.csv — формат, который понимает сайт прогноза (импорт CSV).

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RAW = path.join(ROOT, 'data', 'raw');
const OUT = path.join(ROOT, 'data', 'kz_wheat.csv');
const MANUAL = path.join(ROOT, 'data', 'manual_yields.csv');

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : def; };
const WEATHER = opt('weather', 'power');
const FROM_YEAR = +opt('from', '2000');

const FAO_ZIP_URL = 'https://bulks-faostat.fao.org/production/Production_Crops_Livestock_E_All_Data_(Normalized).zip';
const KZ_AREA = '108', WHEAT_ITEM = '15';
const ELEMENTS = { '5312': 'area_ha', '5412': 'yield', '5510': 'production_t' };

// Точки зернового пояса (север Казахстана). Погода усредняется по ним — грубое приближение
// к национальной урожайности, где основная яровая пшеница сосредоточена в этих областях.
const POINTS = [
  { name: 'Костанайская', lat: 53.2, lon: 63.6 },
  { name: 'Северо-Казахстанская', lat: 54.4, lon: 69.0 },
  { name: 'Акмолинская', lat: 52.3, lon: 70.0 },
];

const log = (...a) => console.log(...a);

async function download(url, dest) {
  if (fs.existsSync(dest)) { log(`  уже скачано: ${path.relative(ROOT, dest)}`); return; }
  log(`  скачиваю ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest + '.part', Buffer.from(await res.arrayBuffer()));
  fs.renameSync(dest + '.part', dest);
}

// ---------- FAOSTAT ----------

// Потоковое чтение одного файла из zip без внешних библиотек
function zipEntryStream(zipPath, match) {
  const fd = fs.openSync(zipPath, 'r');
  const size = fs.fstatSync(fd).size;
  const tail = Buffer.alloc(Math.min(size, 65557));
  fs.readSync(fd, tail, 0, tail.length, size - tail.length);
  const eocd = tail.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) throw new Error('Не найден каталог zip-архива');
  const cdSize = tail.readUInt32LE(eocd + 12), cdOffset = tail.readUInt32LE(eocd + 16);
  const cd = Buffer.alloc(cdSize);
  fs.readSync(fd, cd, 0, cdSize, cdOffset);
  for (let p = 0; p < cdSize;) {
    const method = cd.readUInt16LE(p + 10), comp = cd.readUInt32LE(p + 20);
    const nLen = cd.readUInt16LE(p + 28), eLen = cd.readUInt16LE(p + 30), cLen = cd.readUInt16LE(p + 32);
    const local = cd.readUInt32LE(p + 42), name = cd.toString('utf8', p + 46, p + 46 + nLen);
    if (match.test(name)) {
      const lh = Buffer.alloc(30);
      fs.readSync(fd, lh, 0, 30, local);
      const start = local + 30 + lh.readUInt16LE(26) + lh.readUInt16LE(28);
      fs.closeSync(fd);
      const raw = fs.createReadStream(zipPath, { start, end: start + comp - 1 });
      return method === 8 ? raw.pipe(zlib.createInflateRaw()) : raw;
    }
    p += 46 + nLen + eLen + cLen;
  }
  fs.closeSync(fd);
  throw new Error(`В архиве нет файла ${match}`);
}

function splitCsv(line) {
  const out = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

async function loadFaostat() {
  log('FAOSTAT: урожайность пшеницы, Казахстан');
  const zip = path.join(RAW, 'faostat', 'Production_Crops_Livestock_E_All_Data_(Normalized).zip');
  await download(FAO_ZIP_URL, zip);
  const rl = readline.createInterface({ input: zipEntryStream(zip, /All_Data_\(Normalized\)\.csv$/) });
  let idx = null;
  const years = {};
  for await (const line of rl) {
    if (!idx) {
      const h = splitCsv(line.replace(/^﻿/, ''));
      idx = { area: h.indexOf('Area Code'), item: h.indexOf('Item Code'), el: h.indexOf('Element Code'), year: h.indexOf('Year'), unit: h.indexOf('Unit'), value: h.indexOf('Value') };
      if (Object.values(idx).some(i => i < 0)) throw new Error('Неожиданный заголовок FAOSTAT: ' + h.join(' | '));
      continue;
    }
    if (!line.startsWith(KZ_AREA + ',') && !line.startsWith(`"${KZ_AREA}"`)) continue;
    const c = splitCsv(line);
    if (c[idx.item] !== WHEAT_ITEM || !ELEMENTS[c[idx.el]]) continue;
    const y = +c[idx.year], v = parseFloat(c[idx.value]);
    if (!Number.isFinite(v)) continue;
    const key = ELEMENTS[c[idx.el]];
    (years[y] ??= {})[key] = key === 'yield' ? toTonsPerHa(v, c[idx.unit]) : v;
  }
  const rows = Object.entries(years).map(([y, r]) => ({ year: +y, ...r })).filter(r => r.year >= FROM_YEAR && r.yield != null).sort((a, b) => a.year - b.year);
  if (!rows.length) throw new Error('В FAOSTAT не нашлось урожайности пшеницы для Казахстана');
  log(`  лет с урожайностью: ${rows.length} (${rows[0].year}–${rows.at(-1).year})`);
  return rows;
}

function toTonsPerHa(v, unit) {
  const u = unit.toLowerCase().replace(/\s/g, '');
  if (u === 'kg/ha') return v / 1000;
  if (u === 'hg/ha' || u === '100g/ha') return v / 10000;
  if (u === 't/ha') return v;
  throw new Error(`Неизвестная единица урожайности FAOSTAT: ${unit}`);
}

// Урожайность за годы, которых ещё нет в FAOSTAT (например, предварительные итоги БНС РК)
function loadManual() {
  if (!fs.existsSync(MANUAL)) return [];
  const lines = fs.readFileSync(MANUAL, 'utf8').replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim() && !l.startsWith('#'));
  return lines.slice(1).map(l => {
    const [y, v, src] = l.split(';');
    return { year: +y, yield: parseFloat(String(v).replace(',', '.')), source: (src || 'ручной ввод').trim() };
  }).filter(r => Number.isFinite(r.year) && Number.isFinite(r.yield));
}

// ---------- Погода: NASA POWER ----------

async function powerDaily(pt, endDate) {
  const file = path.join(RAW, 'power', `${pt.lat}_${pt.lon}_${FROM_YEAR}_${endDate}.json`);
  const url = `https://power.larc.nasa.gov/api/temporal/daily/point?parameters=PRECTOTCORR,T2M_MAX&community=AG` +
    `&latitude=${pt.lat}&longitude=${pt.lon}&start=${FROM_YEAR}0101&end=${endDate}&format=JSON`;
  await download(url, file);
  const p = JSON.parse(fs.readFileSync(file, 'utf8')).properties.parameter;
  const days = {};
  for (const [d, v] of Object.entries(p.PRECTOTCORR)) days[d] = { precip: v, tmax: p.T2M_MAX[d] };
  return days; // ключ YYYYMMDD; пропуск = -999
}

// ---------- Погода: ERA5 (Copernicus CDS API) ----------
// Нужен бесплатный аккаунт на cds.climate.copernicus.eu, принятая лицензия ERA5 и ключ в переменной CDSAPI_KEY.

const CDS = 'https://cds.climate.copernicus.eu/api';

async function era5Daily(pt, endDate) {
  const key = process.env.CDSAPI_KEY;
  if (!key) throw new Error('Для ERA5 задайте ключ: $env:CDSAPI_KEY="ваш-ключ" (профиль на cds.climate.copernicus.eu)');
  const file = path.join(RAW, 'era5', `${pt.lat}_${pt.lon}_${FROM_YEAR}_${endDate}.csv`);
  if (!fs.existsSync(file)) {
    const headers = { 'PRIVATE-TOKEN': key, 'Content-Type': 'application/json' };
    const end = `${endDate.slice(0, 4)}-${endDate.slice(4, 6)}-${endDate.slice(6)}`;
    const body = { inputs: { variable: ['2m_temperature', 'total_precipitation'], location: { longitude: pt.lon, latitude: pt.lat }, date: [`${FROM_YEAR}-01-01/${end}`], data_format: 'csv' } };
    log(`  ERA5: запрос для точки ${pt.name}`);
    let res = await fetch(`${CDS}/retrieve/v1/processes/reanalysis-era5-single-levels-timeseries/execution`, { method: 'POST', headers, body: JSON.stringify(body) });
    if (!res.ok) throw new Error(`CDS: HTTP ${res.status} ${await res.text()}`);
    const job = await res.json();
    let status = job.status;
    while (!['successful', 'failed', 'dismissed'].includes(status)) {
      await new Promise(r => setTimeout(r, 5000));
      status = (await (await fetch(`${CDS}/retrieve/v1/jobs/${job.jobID}`, { headers })).json()).status;
      log(`    статус: ${status}`);
    }
    if (status !== 'successful') throw new Error(`CDS: задание ${job.jobID} завершилось со статусом ${status}`);
    const results = await (await fetch(`${CDS}/retrieve/v1/jobs/${job.jobID}/results`, { headers })).json();
    const href = results.asset?.value?.href;
    if (!href) throw new Error('CDS: в ответе нет ссылки на файл');
    const buf = Buffer.from(await (await fetch(href)).arrayBuffer());
    fs.mkdirSync(path.dirname(file), { recursive: true });
    // Ответ может прийти как CSV или как zip с одним CSV внутри
    if (buf.readUInt32LE(0) === 0x04034b50) {
      const zp = file + '.zip'; fs.writeFileSync(zp, buf);
      const chunks = []; for await (const ch of zipEntryStream(zp, /\.csv$/)) chunks.push(ch);
      fs.writeFileSync(file, Buffer.concat(chunks));
    } else fs.writeFileSync(file, buf);
  }
  // Часовые значения -> сутки: осадки (м -> мм) суммируются, температура (К -> °C) берётся максимум
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean);
  const h = lines[0].split(','), it = h.findIndex(c => /time/i.test(c)), itp = h.indexOf('tp'), it2 = h.indexOf('t2m');
  if (it < 0 || itp < 0 || it2 < 0) throw new Error('ERA5: неожиданный заголовок CSV: ' + lines[0]);
  const days = {};
  for (const l of lines.slice(1)) {
    const c = l.split(','), d = c[it].slice(0, 10).replace(/-/g, '');
    const day = (days[d] ??= { precip: 0, tmax: -Infinity });
    day.precip += parseFloat(c[itp]) * 1000;
    day.tmax = Math.max(day.tmax, parseFloat(c[it2]) - 273.15);
  }
  return days;
}

// ---------- Признаки ----------

// Тепловой стресс — градусо-дни выше 30 °C за июнь–август: сумма (Tmax − 30) по дням, когда Tmax > 30.
// Учитывает и число жарких дней, и силу жары; на проверке по годам точнее, чем «число дней выше 30 °C в июле».
function seasonFeatures(days, year) {
  let precip = 0, heat = 0, nP = 0, nT = 0;
  for (const [d, v] of Object.entries(days)) {
    if (+d.slice(0, 4) !== year) continue;
    const md = +d.slice(4);
    if (md >= 501 && md <= 731 && v.precip > -900) { precip += v.precip; nP++; }
    if (md >= 601 && md <= 831 && v.tmax > -900) { heat += Math.max(0, v.tmax - 30); nT++; }
  }
  // Сезон считается, только если данные есть почти за все дни
  return { precip: nP >= 88 ? precip : NaN, heat: nT >= 90 ? heat : NaN };
}

// ---------- Сборка ----------

const fmt = (v, d) => Number.isFinite(v) ? v.toFixed(d).replace('.', ',') : '';

async function main() {
  const faostat = await loadFaostat();
  const manual = loadManual().filter(m => m.year >= FROM_YEAR && !faostat.some(r => r.year === m.year));
  if (manual.length) log(`Ручные данные (${path.relative(ROOT, MANUAL)}): ${manual.map(m => `${m.year} — ${m.source}`).join('; ')}`);
  const yields = [...faostat.map(r => ({ ...r, source: 'FAOSTAT' })), ...manual].sort((a, b) => a.year - b.year);

  const end = new Date(Date.now() - 10 * 864e5); // у источников погоды задержка в несколько дней
  const endDate = end.toISOString().slice(0, 10).replace(/-/g, '');
  log(`Погода: ${WEATHER === 'era5' ? 'ERA5 (Copernicus)' : 'NASA POWER'}, ${FROM_YEAR}–${endDate}`);
  const perPoint = [];
  for (const pt of POINTS) {
    log(`  точка: ${pt.name} (${pt.lat}, ${pt.lon})`);
    perPoint.push(WEATHER === 'era5' ? await era5Daily(pt, endDate) : await powerDaily(pt, endDate));
  }

  const lastWeatherYear = +endDate.slice(4) >= 901 ? end.getUTCFullYear() : end.getUTCFullYear() - 1;
  const byYear = new Map(yields.map(r => [r.year, r]));
  const rows = [];
  for (let y = FROM_YEAR; y <= lastWeatherYear; y++) {
    const f = perPoint.map(days => seasonFeatures(days, y));
    const precip = f.reduce((s, x) => s + x.precip, 0) / f.length;
    const heat = f.reduce((s, x) => s + x.heat, 0) / f.length;
    const r = byYear.get(y);
    if (!r && y <= yields.at(-1).year) continue;
    rows.push({ year: y, yield: r?.yield, area: r?.area_ha, prod: r?.production_t, precip, heat, source: r?.source });
  }

  const header = 'год;урожайность_т_га;осадки_май_июль_мм;градусо_дни_выше_30_июнь_август;убранная_площадь_га;валовой_сбор_т;источник_урожайности';
  const body = rows.map(r => [r.year, fmt(r.yield, 3), fmt(r.precip, 0), fmt(r.heat, 1), fmt(r.area, 0), fmt(r.prod, 0), r.source || ''].join(';'));
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, '﻿' + [header, ...body].join('\n') + '\n');

  const future = rows.filter(r => r.yield == null);
  log(`\nГотово: ${path.relative(ROOT, OUT)}`);
  log(`  лет с урожайностью: ${rows.length - future.length}; лет только с погодой (для прогноза): ${future.map(r => r.year).join(', ') || 'нет'}`);
}

main().catch(e => { console.error('Ошибка:', e.message); process.exit(1); });
