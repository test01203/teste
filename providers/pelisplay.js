// pelisplay provider for Nuvio  --  ported from LIVE FilmPlus config (github.com/sonicko16)
// Self-contained: shared extractor lib (v2) inlined + site logic.

// ===========================================================================
// FilmPlus -> Nuvio shared library (extractors + helpers)  v2
// Faithfully ported from the LIVE FilmPlus config (github.com/sonicko16):
//   info.json, scripts.json, otroinfo.json, oceaninfo.json, nuuinfo.json
// Each provider inlines this block (Nuvio loads scrapers in isolation).
// ===========================================================================
var TMDB_API_KEY = '439c478a771f35c05022f9feabcca01c';
var UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36';

var HOST_RX = {
  dood:  /doodstream|dood|d0o0d|d0000d|d-s\.io|ds2play|vidply/i,
  fast:  /streamwish|filelions|ryderjet|mivalyo|dinisglows|hglink|pfwish|wishembed|embedwish|wishfast|obeywish|swhoi\.com|playerwish|hlswish|ghbrisk|bysejikuar|bysedikamoum/i,
  ultra: /minochinos|dintezuvio|vidhide|lamovie\.link|okhd\.nu|pfmoon|filemoon|embedmoon|moonembed|fmembed|film\.la|filelions|ryderjet|mivalyo/i,
  zeus:  /voe\.sx|\bvoe\b|vincentincludesuccessful|brookethoughi|jamesstartstudent|ryanagoinvolve|jasonresponsemeasure|graceaddresscommunity|shannonpersonalcost/i,
  vip:   /okru\.link/i,
  odin:  /goodstream|vimeos/i,
  sb:    /sbstream|sbembed|watchsb|sbfast|sbbrisk|streamsss/i,
  hub:   /embedhub\.xyz/i,
  ocean: /oceanplay\.me|players\.oceanplay/i,
  nuu:   /nuuuppp\.cloud|nuu/i,
  moe:   /plusvip\.net/i,
  fembed:/vanfem\.com|fembed/i
};

function baseHeaders(referer) {
  var h = { 'User-Agent': UA, 'Accept-Language': 'es-MX,es;q=0.8,en-US;q=0.5,en;q=0.3' };
  if (referer) { h['Referer'] = referer; try { h['Origin'] = new URL(referer).origin; } catch (e) {} }
  return h;
}
async function txt(url, referer, extra) {
  try { return await (await fetch(url, { headers: Object.assign(baseHeaders(referer), extra || {}) })).text(); } catch (e) { return ''; }
}
async function jsn(url, referer, extra) {
  try { return await (await fetch(url, { headers: Object.assign(baseHeaders(referer), extra || {}) })).json(); } catch (e) { return null; }
}
async function post(url, body, referer, extra) {
  try {
    return await (await fetch(url, { method: 'POST',
      headers: Object.assign(baseHeaders(referer), { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest' }, extra || {}),
      body: body })).text();
  } catch (e) { return ''; }
}

async function getMeta(tmdbId, type) {
  var t = type === 'tv' ? 'tv' : 'movie';
  var d = await jsn('https://api.themoviedb.org/3/' + t + '/' + tmdbId + '?api_key=' + TMDB_API_KEY + '&language=es-ES');
  if (!d) return null;
  var date = d.release_date || d.first_air_date || '';
  return { title: d.title || d.name || '', original: d.original_title || d.original_name || '', year: date ? parseInt(date.slice(0, 4), 10) : null };
}

function norm(s) { return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim(); }
function slugify(s) { return norm(s).replace(/\s+/g, '-'); }
function match(a, b) { var x = norm(a), y = norm(b); return x === y || x.indexOf(y) !== -1 || y.indexOf(x) !== -1; }
function qual(t) { t = (t || '').toString(); if (/2160|4k|uhd/i.test(t)) return '2160p'; if (/1080/.test(t)) return '1080p'; if (/720/.test(t)) return '720p'; if (/480/.test(t)) return '480p'; if (/360/.test(t)) return '360p'; return 'HD'; }

function b64decode(s) { try { return typeof atob !== 'undefined' ? atob(s) : Buffer.from(s, 'base64').toString('binary'); } catch (e) { return ''; } }
function b64encode(s) { try { return typeof btoa !== 'undefined' ? btoa(s) : Buffer.from(s, 'binary').toString('base64'); } catch (e) { return ''; } }

function unpack(src) {
  try {
    var m = src.match(/\}\s*\(\s*'(.*?)'\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*'(.*?)'\.split\('\|'\)/);
    if (!m) return src;
    var p = m[1].replace(/\\'/g, "'").replace(/\\\\/g, '\\');
    var radix = parseInt(m[2], 10), count = parseInt(m[3], 10), tab = m[4].split('|');
    function e(c) { return (c < radix ? '' : e(parseInt(c / radix, 10))) + ((c = c % radix) > 35 ? String.fromCharCode(c + 29) : c.toString(36)); }
    while (count--) if (tab[count]) p = p.replace(new RegExp('\\b' + e(count) + '\\b', 'g'), tab[count]);
    return p;
  } catch (e) { return src; }
}
function grabUrls(html) {
  var out = [], m, re = /(https?:\\?\/\\?\/[^\s"'\\<>()]+?\.(?:m3u8|mp4)[^\s"'\\<>()]*)/gi;
  while ((m = re.exec(html)) !== null) out.push(m[1].replace(/\\\//g, '/'));
  var re2 = /(?:file|hls|source|src)\s*[:=]\s*["']([^"']+\.(?:m3u8|mp4)[^"']*)["']/gi;
  while ((m = re2.exec(html)) !== null) out.push(m[1]);
  return out;
}
function classify(url) { for (var k in HOST_RX) if (HOST_RX[k].test(url)) return k; return 'unknown'; }

// grab the biggest base64-looking blob from a page (ocean/nuu/moe wrap it)
function biggestB64(html) {
  var best = '', m, re = /['"]([A-Za-z0-9+/=]{200,})['"]/g;
  while ((m = re.exec(html)) !== null) if (m[1].length > best.length) best = m[1];
  return best;
}

async function resolveEmbed(url, referer) {
  var out = [];
  if (!url) return out;
  url = url.replace(/&amp;/g, '&').trim();
  if (url.indexOf('//') === 0) url = 'https:' + url;
  var kind = classify(url), host = ''; try { host = new URL(url).host; } catch (e) {}
  try {
    if (kind === 'dood') {
      var d = await txt(url, referer);
      var pass = (d.match(/\/pass_md5\/[^"'\s]+/) || [])[0];
      if (pass) {
        var token = (d.match(/token=([a-z0-9]+)/i) || [])[1] || pass.split('/').pop();
        var md5 = await txt('https://' + host + pass, url);
        var rnd = ''; for (var i = 0; i < 10; i++) rnd += 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 62)];
        out.push({ url: md5.trim() + rnd + '?token=' + token + '&expiry=' + Date.now(), quality: 'HD', server: 'DoodStream' });
      }
      return out;
    }
    if (kind === 'hub') { return await embedHub(url); }
    if (kind === 'ocean' || kind === 'nuu' || kind === 'moe') {
      var pg = await txt(url, referer);
      var blob = biggestB64(pg); var dec = blob ? b64decode(blob) : pg;
      var f = (dec.match(/'hls'\s*:\s*'(.+?)'/) || dec.match(/file\s*:?\s*['"]([^'"]+)['"]/) || [])[1];
      if (f && /^[A-Za-z0-9+/=]{20,}$/.test(f)) { var f2 = b64decode(f); if (/https?:/.test(f2)) f = f2; }
      if (f) out.push({ url: f, quality: qual(f), server: kind === 'ocean' ? 'Ocean' : (kind === 'nuu' ? 'Nuu' : 'PlusVIP') });
      grabUrls(dec).forEach(function (u) { out.push({ url: u, quality: qual(u), server: kind }); });
      return out;
    }
    if (kind === 'zeus') {
      var v = await txt(url, referer);
      var hls = (v.match(/["']?hls["']?\s*:\s*["']([^"']+)["']/) || [])[1];
      if (hls) out.push({ url: /^[A-Za-z0-9+/=]{20,}$/.test(hls) ? b64decode(hls) : hls, quality: 'HD', server: 'VOE' });
      grabUrls(v).forEach(function (u) { out.push({ url: u, quality: qual(u), server: 'VOE' }); });
      return out;
    }
    if (kind === 'vip') { var s = await okruLink(url); if (s) out.push({ url: s, quality: 'HD', server: 'OK.ru' }); return out; }
    // fast / ultra / sb / odin / unknown -> load /e/ page, unpack, grab file
    var page = url.replace('/v/', '/e/').replace('/f/', '/e/');
    var h = await txt(page, referer);
    var srv = kind === 'ultra' ? 'Filemoon' : kind === 'sb' ? 'StreamSB' : kind === 'fast' ? 'StreamWish' : kind === 'odin' ? 'GoodStream' : (host.split('.')[0] || 'Embed');
    grabUrls(unpack(h)).concat(grabUrls(h)).forEach(function (u) { out.push({ url: u, quality: qual(u), server: srv }); });
  } catch (e) {}
  return out;
}

// EmbedHub (otroinfo/hubinfo): haley API token=btoa(id) -> {"data":"<hex>"} -> decode
async function embedHub(url) {
  var out = [];
  try {
    var id = url.split('/').filter(Boolean).pop();
    var token = b64encode(id);
    var hdr = { 'x-hub': 'F4o01jFM2AE5lgp7', 'Origin': 'https://v1.embedhub.xyz', 'Referer': 'https://v1.embedhub.xyz/' };
    var r = await txt('https://api.embedhub.xyz/api/v2/haley?token=' + token, 'https://v1.embedhub.xyz/', hdr);
    var hex = (r.match(/\{\s*"data"\s*:\s*"(.+?)"\s*\}/) || [])[1];
    if (!hex) return out;
    var q0 = '0123456789ABCDEF'.split(''), W0 = 'BE843719FC6250AD'.split('');
    var mapped = ''; for (var i = 0; i < hex.length; i++) { var c = hex[i], idx = W0.indexOf(c); mapped += idx >= 0 ? q0[idx] : c; }
    var data = ''; for (var s = 0; s + 1 < mapped.length; s += 2) data += String.fromCharCode(parseInt(mapped.substr(s, 2), 16));
    data = data.replace(/embedhub\.xyz\\?\/api\\?\/source\\?\//g, 'fembed.com/v/');
    grabUrls(data).forEach(function (u) { out.push({ url: u, quality: qual(u), server: 'EmbedHub' }); });
    var links = data.match(/https?:\/\/[^"'\\\s]+/g) || [];
    for (var k = 0; k < links.length; k++) if (/fembed|vanfem/.test(links[k])) out.push({ url: links[k], quality: 'HD', server: 'Fembed' });
  } catch (e) {}
  return out;
}

// OK.ru (scripts.json 'vip'): POST apizz.okru.link/decoding + AES-CBC
async function okruLink(url) {
  try {
    var t = url.split('t=')[1]; if (!t) return '';
    var resp = await post('https://apizz.okru.link/decoding', 'video=' + t, 'https://okru.link/', { 'Origin': 'https://okru.link' });
    var o = JSON.parse(resp);
    if (o.status !== 'decoded' || !o.video) return '';
    if (typeof CryptoJS === 'undefined') return '';
    var b = o.video.replace(/\./g, '+').replace(/_/g, '/').replace(/-/g, '=');
    var key = CryptoJS.enc.Utf8.parse('HoRaNcODoLdwiTyptaiNflUXEGOdliZa');
    var iv = CryptoJS.enc.Utf8.parse('AKeNSiDgetRiNuTo');
    return CryptoJS.AES.decrypt(b, key, { iv: iv }).toString(CryptoJS.enc.Utf8);
  } catch (e) { return ''; }
}

function toStreams(name, raw, referer) {
  var seen = {}, list = [];
  raw.forEach(function (r) {
    if (!r || !r.url || !/^https?:/.test(r.url) || seen[r.url]) return; seen[r.url] = 1;
    list.push({ name: name, title: (r.quality || 'HD') + ' · ' + (r.server || name), url: r.url, quality: r.quality || 'HD', headers: baseHeaders(referer) });
  });
  return list;
}

// ===== PelisPlay  (pelisfile method, pelisplay.info) =======================
// searchscripts.json -> scripts.pelisgratis/lat; regex file: '(.+?)'
var BASE = 'https://pelisplay.info';

function findIframes(html) {
  var out = [], m;
  var re = /(?:data-src|data-litespeed-src|src)=["']([^"']+)["']/gi;
  while ((m = re.exec(html)) !== null) out.push(m[1]);
  var re2 = /["'](https?:\/\/[^"']*?(?:embed|player|\/e\/|\/v\/|okru|dood|filemoon|streamwish|voe|vanfem|fembed)[^"']*)["']/gi;
  while ((m = re2.exec(html)) !== null) out.push(m[1]);
  return out.filter(function (u, i) { return out.indexOf(u) === i && HOST_RX_ANY(u); });
}
function HOST_RX_ANY(u) { for (var k in HOST_RX) if (HOST_RX[k].test(u)) return true; return false; }

async function collectFrom(pageUrl) {
  var raw = [];
  var html = await txt(pageUrl, BASE);
  if (!html || html.length < 300) return raw;
  var frames = findIframes(html);
  for (var i = 0; i < frames.length; i++) {
    var u = frames[i]; if (u.indexOf('//') === 0) u = 'https:' + u;
    raw = raw.concat(await resolveEmbed(u, pageUrl));
  }
  grabUrls(html).forEach(function (u) { raw.push({ url: u, quality: qual(u), server: 'Direct' }); });
  return raw;
}

async function getStreams(tmdbId, type, season, episode) {
  try {
    var meta = await getMeta(tmdbId, type);
    if (!meta) return [];
    var html = await txt(BASE + '/?s=' + encodeURIComponent(meta.title), BASE);
    var hit = null, m, re = /<a[^>]+href="([^"]+)"[^>]*>\s*(?:<[^>]+>\s*)*([^<]{2,90})</gi;
    var results = [];
    while ((m = re.exec(html)) !== null) if (/\/(?:pelicula|movie|serie|series|ver|watch)/i.test(m[1])) results.push({ url: m[1], title: m[2] });
    for (var i = 0; i < results.length; i++) if (match(results[i].title, meta.title) || match(results[i].title, meta.original)) { hit = results[i]; break; }
    if (!hit && results.length) hit = results[0];
    if (!hit) return [];
    var pageUrl = hit.url; if (pageUrl.indexOf('http') !== 0) pageUrl = BASE + pageUrl;
    if (type === 'tv') {
      var slug = pageUrl.replace(/\/+$/, '').split('/').pop();
      pageUrl = BASE + '/episodes/' + slug + '-' + season + 'x' + episode + '/';
    }
    var raw = await collectFrom(pageUrl);
    return toStreams('PelisPlay', raw, BASE);
  } catch (e) { return []; }
}
module.exports = { getStreams: getStreams };
