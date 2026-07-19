# FilmPlus Latino — Nuvio Plugin

Plugin para [Nuvio](https://github.com/NuvioPlugin) construido a partir de la **config en vivo**
que la app **FilmPlus** (`com.dpsteam.filmplus`) descarga en tiempo de ejecución:

- **`github.com/sonicko16/vip`** → `info.json`, `scripts.json`, `cuevinfo.json`, `oceaninfo.json`,
  `nuuinfo.json`, `otroinfo.json`, `zeus.json`, `universalscripts.txt`
- **`github.com/sonicko16/hiden-content`** → `plushdinfo.json`, `pelisfileinfo.json`,
  `searchscripts.json`, `universaldata.txt`

Los scrapers "hardcoded" del APK estaban muertos porque la app **no** los usa: lee todo de esta
config remota. Aquí está portada la config real.

## Instalación
```
https://raw.githubusercontent.com/<usuario>/<repo>/main/manifest.json
```

## Arquitectura FilmPlus
`TMDB → sitio de búsqueda → URL de embed → extractor por host → .m3u8/.mp4`

### Fuentes de búsqueda (scrapers del manifest)
| id | Sitio | Método FilmPlus | Estado (comprobado 2026-07) |
|----|-------|-----------------|------------------------------|
| `poseidonhd` | poseidonhd2.co | `biz` (`videos":[…]`) | ✅ **sitio en vivo** |
| `cuevana` | Cuevana / PelisPlusHD | `hd` (GraphQL esplay) | ⚠️ API `api.esplay.one` rotó; actualiza `GQL_HOSTS`/`SITES` |
| `pelisplay` | PelisPlay | `pelisfile` | ⚠️ `pelisplay.info` cayó; actualiza `BASE` con el dominio actual |

### Extractores (librería compartida, inlineada en cada `.js`)
Portados fielmente de `scripts.json` + los `*Regex` de `info.json`:

| Extractor | Hosts (regex en vivo) | Estado |
|-----------|------------------------|--------|
| `fast` (StreamWish) | streamwish, filelions, hlswish, playerwish… | ✅ unpack `p,a,c,k,e,d` → `file:` |
| `ultra` (Filemoon) | filemoon, vidhide, okhd.nu, lamovie.link… | ✅ |
| `dood` | doodstream, d0o0d, d-s.io | ✅ `pass_md5` + token |
| `zeus` (VOE) | voe.sx (+ espejos) | ✅ hls/mp4 |
| `odin` | goodstream, vimeos | ✅ |
| `hub` (EmbedHub) | embedhub.xyz | ✅ API `haley` + decode hex (W0→q0) → fembed |
| `vip` (OK.ru) | okru.link | ✅ API `apizz.okru.link` **en vivo** + AES-CBC (requiere `CryptoJS` en el runtime de Nuvio) |
| `ocean` / `nuu` / `moe` | oceanplay.me, nuuuppp.cloud, plusvip.net | ⚠️ decode base64 de la página (best-effort) |
| `sb` | sbstream | ✅ `/e/` |

Claves/IV de OK.ru y el mapa hex de EmbedHub salen **verbatim** de la config.

## ⚠️ Límites reales (honesto)
FilmPlus scrapea dentro de un **WebView** (con `cloudflare-scrape`), así que ejecuta JS de los
sitios y pasa retos anti-bot. Nuvio usa `fetch` normal. Por eso **no** se pueden portar tal cual:

- **Cuevana (flujo completo)**, **descarga SB** y **PlusVIP/PlusHD**: usan **reCAPTCHA v3 /
  Cloudflare Turnstile** (`grecaptcha.execute`, `turnstile.render`). Imposible sin navegador real.
- Sitios tras **Incapsula/Cloudflare** (pelisplushd.to, cuevanahd.net, pelisplus.lat) → 403 desde `fetch`.
- Sitios **SPA/Next.js**: la búsqueda depende de su API interna exacta.

Si un scraper no devuelve nada suele ser un **dominio que rotó**: edita `BASE` / `SITES` /
`GQL_HOSTS` en el `.js` con el dominio actual (mira `info.json` de la app o los `*info.json` del repo).

## Créditos
- Config y scripts originales: **sonicko16** (FilmPlus).
- Formato de plugin: [All-in-One-Nuvio](https://github.com/NuvioPlugin/All-in-One-Nuvio) /
  [Nuvio-Providers-Latino](https://github.com/KennethJYS/Nuvio-Providers-Latino).
