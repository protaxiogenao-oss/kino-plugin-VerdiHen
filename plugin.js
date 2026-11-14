/// <reference path="./kino.d.ts" />
/**
 * VerHentai — Kino plugin v1.0.3
 * Author: Hotaru Yume / hotaruyume
 * Fuente: verhentai.com
 * - Home: Estrenos, Tendencias, Sin Censura, Incesto, Milfs, Furry…
 * - Series + episodios
 * - Resolve: player-logic API → HLS (octopusmanifest + master-lengs / esp-rrr)
 * - Subtítulos: ajuste preferSub; master HLS reescrito con Español (genérico) DEFAULT
 * - streamHosts any + hosts de ambos CDN
 * v1.0.3: preferSub setting; rewrite DEFAULT es; resolve multi-intento; más hosts CDN
 */

const BASE = "https://verhentai.com";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

const HOME_ROW = 16;
const MAX_PAGE = 48;
const AD_RE =
  /\b(sponsored|sponsor|advert|promo|trafficjunky|exoclick|juicyads|havenclick|outbrain|taboola|click here|buy now|affiliate|brazzers|see more)\b/i;

function hdr(extra) {
  var h = {
    "User-Agent": UA,
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "es-ES,es;q=0.9,en;q=0.5",
    Referer: BASE + "/",
  };
  if (extra) for (var k in extra) h[k] = extra[k];
  return h;
}

function strip(s) {
  return String(s || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function abs(u) {
  if (!u) return "";
  u = String(u).replace(/&amp;/g, "&").trim();
  if (!u || u.indexOf("data:") === 0) return "";
  if (u.indexOf("//") === 0) return "https:" + u;
  if (u.indexOf("http") === 0) return u;
  if (u.charAt(0) === "/") return BASE + u;
  return BASE + "/" + u;
}

function makeId(s) {
  return String(s || "x")
    .replace(/^https?:\/\/verhentai\.com/i, "")
    .replace(/[^A-Za-z0-9._~/-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 140);
}

function isAdBlock(title, path, block) {
  var t = (title || "") + " " + (path || "") + " " + (block || "");
  return AD_RE.test(t);
}

async function fetchText(url, extra, soft) {
  try {
    var r = await kino.fetch(url, {
      headers: hdr(extra),
      timeoutMs: 16000,
    });
    if (!r.ok) {
      if (soft) return "";
      throw new Error("HTTP " + r.status + " " + url);
    }
    return await r.text();
  } catch (e) {
    if (soft) return "";
    throw e;
  }
}

function parseItems(html, max) {
  max = max || MAX_PAGE;
  var byId = {};
  var order = [];

  function ensure(slug) {
    if (!byId[slug]) {
      byId[slug] = {
        id: makeId(slug),
        ref: "series:" + slug,
        title: "",
        poster: "",
        kind: "series",
        adult: true,
      };
      order.push(slug);
    }
    return byId[slug];
  }

  var reItem =
    /<div[^>]*class="[^"]*\bitem\b[^"]*"[^>]*>[\s\S]*?<a[^>]+href="((?:https?:\/\/verhentai\.com)?\/online\/([^"/?#]+)\/?)"[^>]*>[\s\S]*?<\/a>[\s\S]*?<\/div>/gi;
  var m;
  while ((m = reItem.exec(html))) {
    var slug = m[2];
    if (!slug || /episodio|episode/i.test(slug)) continue;
    var block = m[0];
    if (isAdBlock("", slug, block)) continue;

    var rec = ensure(slug);

    var img =
      block.match(/<img[^>]+src="(https?:\/\/[^"]+)"/i) ||
      block.match(/data-src="(https?:\/\/[^"]+)"/i) ||
      block.match(/srcset="(https?:\/\/[^"\s,]+)/i);
    if (img && !rec.poster) {
      var p = abs(img[1]);
      if (p && !/lazy|placeholder|data:|havenclick|ads/i.test(p)) rec.poster = p;
    }

    var alt = block.match(/alt="([^"]{2,})"/i);
    if (alt) {
      var t = strip(alt[1].replace(/\s*cover\s*$/i, ""));
      if (t.length >= 2) rec.title = t;
    }
    if (!rec.title) {
      var titleEl = block.match(/class="[^"]*title[^"]*"[^>]*>([^<]{2,})/i);
      if (titleEl) rec.title = strip(titleEl[1]);
    }
    if (!rec.title) {
      rec.title = slug
        .replace(/-/g, " ")
        .replace(/\b\w/g, function (c) {
          return c.toUpperCase();
        });
    }
  }

  if (order.length < 4) {
    var reLink =
      /<a[^>]+href="((?:https?:\/\/verhentai\.com)?\/online\/([^"/?#]+)\/?)"[^>]*>([\s\S]*?)<\/a>/gi;
    while ((m = reLink.exec(html))) {
      var slug2 = m[2];
      if (!slug2 || /episodio|episode/i.test(slug2)) continue;
      if (isAdBlock("", slug2, m[3])) continue;
      var rec2 = ensure(slug2);
      if (!rec2.poster) {
        var im = m[3].match(/src="(https?:\/\/[^"]+)"/i) || m[3].match(/data-src="(https?:\/\/[^"]+)"/i);
        if (im) {
          var p2 = abs(im[1]);
          if (p2 && !/lazy|placeholder|havenclick|ads/i.test(p2)) rec2.poster = p2;
        }
      }
      if (!rec2.title || rec2.title.length < 3) {
        var al = m[3].match(/alt="([^"]{3,})"/i);
        if (al) rec2.title = strip(al[1].replace(/\s*cover\s*$/i, ""));
      }
      if (!rec2.title) {
        rec2.title = slug2
          .replace(/-/g, " ")
          .replace(/\b\w/g, function (c) {
            return c.toUpperCase();
          });
      }
    }
  }

  var out = [];
  for (var i = 0; i < order.length && out.length < max; i++) {
    var r = byId[order[i]];
    if (r && r.title && r.title.length >= 2) out.push(r);
  }
  return out;
}

function sectionRef(path) {
  return "browse:" + path.replace(/^\//, "");
}

function preferSubSetting() {
  try {
    var v = kino.config && kino.config.get ? kino.config.get("preferSub") : null;
    if (v === "en" || v === "off" || v === "es") return v;
  } catch (e) {}
  return "es";
}

/** Rewrite master playlist: Spanish DEFAULT=YES, rename to Español (genérico), absolutize URIs */
function rewriteMasterForSpanish(pl, basePl, prefer) {
  if (!pl || prefer === "off") return null;
  var lines = pl.split("\n");
  var out = [];
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    if (/TYPE=SUBTITLES/i.test(line) && /LANGUAGE="/i.test(line)) {
      var langM = line.match(/LANGUAGE="([^"]+)"/i);
      var lang = langM ? langM[1].toLowerCase() : "";
      var isEs = lang === "es" || lang === "spa" || lang.indexOf("es-") === 0;
      var isEn = lang === "en" || lang === "eng" || lang.indexOf("en-") === 0;

      // Absolutize URI=
      line = line.replace(/URI="([^"]+)"/i, function (_, u) {
        if (u.indexOf("http") === 0) return 'URI="' + u + '"';
        return 'URI="' + basePl + u.replace(/^\.\//, "") + '"';
      });

      if (prefer === "es" && isEs) {
        line = line.replace(/NAME="[^"]*"/i, 'NAME="Español (genérico)"');
        line = line.replace(/DEFAULT=NO/gi, "DEFAULT=YES");
        line = line.replace(/AUTOSELECT=NO/gi, "AUTOSELECT=YES");
        if (!/DEFAULT=/i.test(line)) line += ",DEFAULT=YES,AUTOSELECT=YES";
      } else if (prefer === "es" && isEn) {
        line = line.replace(/DEFAULT=YES/gi, "DEFAULT=NO");
        line = line.replace(/AUTOSELECT=YES/gi, "AUTOSELECT=NO");
      } else if (prefer === "en" && isEn) {
        line = line.replace(/DEFAULT=NO/gi, "DEFAULT=YES");
        line = line.replace(/AUTOSELECT=NO/gi, "AUTOSELECT=YES");
      } else if (prefer === "en" && isEs) {
        line = line.replace(/DEFAULT=YES/gi, "DEFAULT=NO");
      }
      out.push(line);
      continue;
    }
    // Absolutize relative media playlist paths (non-# lines)
    if (line && line.charAt(0) !== "#" && /\.m3u8|index\.txt/i.test(line) && line.indexOf("http") !== 0) {
      out.push(basePl + line.replace(/^\.\//, ""));
      continue;
    }
    // Absolutize URI= on audio etc.
    if (/URI="/i.test(line) && !/^#EXT-X-STREAM-INF/i.test(line)) {
      line = line.replace(/URI="([^"]+)"/i, function (_, u) {
        if (u.indexOf("http") === 0) return 'URI="' + u + '"';
        return 'URI="' + basePl + u.replace(/^\.\//, "") + '"';
      });
    }
    out.push(line);
  }
  return out.join("\n");
}

async function loadEpisodeHtml(slug, epNum) {
  var candidates = [];
  if (epNum) {
    candidates.push(BASE + "/online/" + slug + "/episodio-" + epNum + "/");
    candidates.push(BASE + "/online/" + slug + "/episodio-" + epNum);
  }
  candidates.push(BASE + "/online/" + slug + "/");
  candidates.push(BASE + "/online/" + slug);

  var lastHtml = "";
  var lastUrl = candidates[0];
  for (var i = 0; i < candidates.length; i++) {
    var url = candidates[i];
    var html = await fetchText(url, { Referer: BASE + "/online/" + slug + "/" }, true);
    if (!html) continue;
    lastHtml = html;
    lastUrl = url;
    if (/player\.php\?data=/i.test(html)) {
      return { html: html, pageUrl: url };
    }
  }
  return { html: lastHtml, pageUrl: lastUrl };
}

function extractPlayerData(html) {
  if (!html) return null;
  var dm =
    html.match(/player\.php\?data=([^"&\s]+)/i) ||
    html.match(/data=([A-Za-z0-9+/=%:]{40,})/i);
  return dm ? dm[1] : null;
}

async function callPlayerApi(en, iv, pageUrl) {
  var b = btoa(iv);
  var boundary = "----KinoBoundary" + Date.now().toString(36);
  var body =
    "--" +
    boundary +
    '\r\nContent-Disposition: form-data; name="action"\r\n\r\nzarat_get_data_player_ajax\r\n--' +
    boundary +
    '\r\nContent-Disposition: form-data; name="a"\r\n\r\n' +
    en +
    "\r\n--" +
    boundary +
    '\r\nContent-Disposition: form-data; name="b"\r\n\r\n' +
    b +
    "\r\n--" +
    boundary +
    "--\r\n";

  var apiRes = await kino.fetch(BASE + "/wp-content/plugins/player-logic/api.php", {
    method: "POST",
    headers: hdr({
      "Content-Type": "multipart/form-data; boundary=" + boundary,
      Origin: BASE,
      Referer: pageUrl,
      Accept: "*/*",
    }),
    body: body,
    timeoutMs: 16000,
  });
  if (!apiRes.ok) {
    throw kino.error("unavailable", "api-" + apiRes.status, {
      userMessage: "El servidor de vídeo no respondió (" + apiRes.status + "). Prueba otro episodio.",
    });
  }
  var apiJson = JSON.parse(await apiRes.text());
  if (!apiJson.status || !apiJson.data || !apiJson.data.sources || !apiJson.data.sources.length) {
    throw kino.error("unavailable", "no-sources", {
      userMessage: "No hay fuentes de vídeo disponibles para este episodio.",
    });
  }
  return apiJson;
}

export async function home() {
  var html = await fetchText(BASE + "/");
  var rows = [];
  var reSec =
    /<h3[^>]*class="[^"]*htitle[^"]*"[^>]*>\s*([^<]+?)(?:\s*<a[^>]+href="([^"]+)"[^>]*>[\s\S]*?<\/a>)?\s*<\/h3>\s*<div[^>]*class="[^"]*block_slider[^"]*"[^>]*>([\s\S]*?)(?=<h3[^>]*class="[^"]*htitle|<\/div>\s*<\/div>\s*<\/div>\s*<div class="block"|$)/gi;

  var m;
  var seen = {};
  while ((m = reSec.exec(html))) {
    var title = strip(m[1]);
    if (!title || title.length < 3) continue;
    var moreHref = m[2] ? abs(m[2]) : "";
    var blockHtml = m[3] || "";
    if (seen[title]) continue;
    seen[title] = true;

    var items = parseItems(blockHtml, HOME_ROW);
    if (items.length === 0) continue;

    var row = {
      id: makeId(title),
      title: title,
      items: items,
    };
    if (moreHref) {
      var path = moreHref.replace(BASE, "").replace(/\/$/, "") || "/";
      row.ref = sectionRef(path);
    }
    rows.push(row);
  }

  if (rows.length === 0) {
    var all = parseItems(html, HOME_ROW * 3);
    if (all.length) {
      rows.push({ id: "home", title: "Hentai", items: all.slice(0, HOME_ROW) });
    }
  }

  return rows;
}

export async function browse(ref, cursor) {
  var path = String(ref || "").replace(/^browse:/, "");
  if (!path) path = "/";
  if (path.charAt(0) !== "/") path = "/" + path;

  var page = 1;
  if (cursor) {
    var cm = String(cursor).match(/page=(\d+)/);
    if (cm) page = parseInt(cm[1], 10) || 1;
  }

  var url = BASE + path;
  if (page > 1) {
    if (url.indexOf("?") >= 0) url += "&page=" + page;
    else url += (url.slice(-1) === "/" ? "" : "/") + "page/" + page + "/";
  }

  var html = await fetchText(url);
  var items = parseItems(html, MAX_PAGE);

  var next = null;
  if (items.length >= Math.min(20, MAX_PAGE - 4)) {
    next = "page=" + (page + 1);
  }
  if (!next && /rel="next"|class="[^"]*next[^"]*"|›|»|Siguiente/i.test(html)) {
    next = "page=" + (page + 1);
  }

  return { items: items, next: next };
}

export async function search(query) {
  var q = (query && query.q) || "";
  if (!q || !String(q).trim()) return [];

  var page = 1;
  if (query.cursor) {
    var cm = String(query.cursor).match(/page=(\d+)/);
    if (cm) page = parseInt(cm[1], 10) || 1;
  }

  var url = BASE + "/?s=" + encodeURIComponent(String(q).trim());
  if (page > 1) url += "&page=" + page;

  var html = await fetchText(url);
  var items = parseItems(html, MAX_PAGE);

  var next = null;
  if (items.length >= 20) next = "page=" + (page + 1);

  if (query.cursor || next) {
    return { items: items, next: next };
  }
  return items;
}

export async function episodes(ref) {
  var slug = String(ref || "").replace(/^series:/, "").replace(/^\/online\//, "").replace(/\/$/, "");
  if (!slug) throw new Error("ref inválido");

  var url = BASE + "/online/" + slug + "/";
  var html = await fetchText(url);

  var seriesTitle = "";
  var tm = html.match(/<h1[^>]*>([^<]{2,})<\/h1>/i) || html.match(/property="og:title"\s+content="([^"]+)"/i);
  if (tm) seriesTitle = strip(tm[1]);

  var poster = "";
  var pm =
    html.match(/property="og:image"\s+content="(https?:\/\/[^"]+)"/i) ||
    html.match(/class="[^"]*cover[^"]*"[^>]*>[\s\S]*?<img[^>]+src="(https?:\/\/[^"]+)"/i);
  if (pm) poster = abs(pm[1]);

  var overview = "";
  var om = html.match(/property="og:description"\s+content="([^"]+)"/i);
  if (om) overview = strip(om[1]);

  var year = "";
  var ym = html.match(/>\s*(20\d{2})\s*</);
  if (ym) year = ym[1];

  var eps = [];
  var reEp =
    /<a[^>]+href="((?:https?:\/\/verhentai\.com)?\/online\/[^"]+\/episodio-(\d+)\/?)"[^>]*>[\s\S]*?(?:Episodio\s*(\d+)|Episode\s*(\d+))?[\s\S]*?<\/a>/gi;
  var seen = {};
  var m;
  while ((m = reEp.exec(html))) {
    var num = parseInt(m[2] || m[3] || m[4], 10);
    if (!num || seen[num]) continue;
    seen[num] = true;

    var still = "";
    var sm = m[0].match(/src="(https?:\/\/[^"]+)"/i) || m[0].match(/data-src="(https?:\/\/[^"]+)"/i);
    if (sm) still = abs(sm[1]);

    var air = "";
    var dm = m[0].match(/(\d{1,2}\s+de\s+\w+\s+de\s+20\d{2})/i);
    if (dm) air = strip(dm[1]);

    eps.push({
      season: 1,
      number: num,
      ref: "ep:" + slug + ":" + num,
      title: "Episodio " + num,
      still: still || undefined,
      airDate: air || undefined,
    });
  }

  eps.sort(function (a, b) {
    return a.number - b.number;
  });

  if (eps.length === 0 && /player\.php\?data=|player-logic|zarat_get_data/i.test(html)) {
    eps.push({
      season: 1,
      number: 1,
      ref: "ep:" + slug + ":1",
      title: seriesTitle || "Episodio 1",
    });
  }

  return {
    series: {
      title: seriesTitle || slug.replace(/-/g, " "),
      poster: poster || undefined,
      overview: overview || undefined,
      year: year || undefined,
    },
    episodes: eps,
  };
}

export async function resolve(ref) {
  var r = String(ref || "");
  var slug, epNum;

  var em = r.match(/^ep:([^:]+):(\d+)$/);
  if (em) {
    slug = em[1];
    epNum = parseInt(em[2], 10);
  } else if (r.indexOf("series:") === 0) {
    slug = r.replace(/^series:/, "");
    epNum = 1;
  } else {
    throw new Error("ref no resoluble: " + r);
  }

  var loaded = await loadEpisodeHtml(slug, epNum);
  var html = loaded.html;
  var pageUrl = loaded.pageUrl;
  var dataParam = extractPlayerData(html);

  if (!dataParam) {
    throw kino.error("unavailable", "no-player-data", {
      userMessage:
        "No se encontró el reproductor en este episodio. Puede que aún no esté disponible o el enlace esté roto.",
    });
  }

  var dataB64 = decodeURIComponent(dataParam);
  var raw;
  try {
    var pad = dataB64 + "===".slice(0, (4 - (dataB64.length % 4)) % 4);
    raw = atob(pad);
  } catch (e) {
    throw kino.error("unavailable", "bad-token", {
      userMessage: "Token del reproductor inválido. Reintenta en unos segundos.",
    });
  }

  var parts = raw.split(":|::|:");
  if (parts.length < 2) parts = raw.split(":|:|");
  if (parts.length < 2) {
    throw kino.error("unavailable", "bad-token-parts", {
      userMessage: "No se pudo decodificar el reproductor.",
    });
  }
  var en = parts[0];
  var iv = parts[1];

  var apiJson = await callPlayerApi(en, iv, pageUrl);
  var src = apiJson.data.sources[0];
  var m3u8 = src.src;
  if (!m3u8 || m3u8.indexOf("http") !== 0) {
    throw kino.error("unavailable", "bad-url", {
      userMessage: "La fuente de vídeo no es válida.",
    });
  }

  var prefer = preferSubSetting();
  var subtitles = [];
  var streamUrl = m3u8;
  var basePl = m3u8.replace(/\/[^/?#]*([?#].*)?$/, "/");
  // keep query on master-lengs style URLs for the master itself
  if (m3u8.indexOf("?") >= 0 && /master\.m3u8|playlist/i.test(m3u8)) {
    basePl = m3u8.replace(/\/[^/]*$/, "/");
  }

  try {
    var plRes = await kino.fetch(m3u8, {
      headers: hdr({ Referer: pageUrl, Accept: "*/*" }),
      timeoutMs: 12000,
    });
    if (plRes.ok) {
      var pl = await plRes.text();
      if (!pl || pl.length < 20 || pl.indexOf("#EXTM3U") < 0) {
        throw kino.error("unavailable", "bad-playlist", {
          userMessage: "La lista de reproducción no es válida o expiró. Reintenta.",
        });
      }

      var subRe =
        /#EXT-X-MEDIA:[^\n]*TYPE=SUBTITLES[^\n]*LANGUAGE="([^"]+)"[^\n]*NAME="([^"]*)"[^\n]*URI="([^"]+)"/gi;
      var sm;
      var esUrl = "";
      var enUrl = "";
      while ((sm = subRe.exec(pl))) {
        var lang = (sm[1] || "").toLowerCase();
        var uri = sm[3];
        if (uri.indexOf("http") !== 0) uri = basePl + uri.replace(/^\.\//, "");
        if (lang === "es" || lang === "spa" || lang.indexOf("es-") === 0) {
          if (!esUrl) esUrl = uri;
        } else if (lang === "en" || lang === "eng" || lang.indexOf("en-") === 0) {
          if (!enUrl) enUrl = uri;
        }
      }

      if (prefer !== "off") {
        if (prefer === "es" && esUrl) {
          subtitles.push({
            lang: "es",
            url: esUrl,
            format: "vtt",
            label: "Español (genérico)",
          });
          if (enUrl)
            subtitles.push({ lang: "en", url: enUrl, format: "vtt", label: "Inglés" });
        } else if (prefer === "en" && enUrl) {
          subtitles.push({ lang: "en", url: enUrl, format: "vtt", label: "Inglés" });
          if (esUrl)
            subtitles.push({
              lang: "es",
              url: esUrl,
              format: "vtt",
              label: "Español (genérico)",
            });
        } else {
          if (esUrl)
            subtitles.push({
              lang: "es",
              url: esUrl,
              format: "vtt",
              label: "Español (genérico)",
            });
          if (enUrl)
            subtitles.push({ lang: "en", url: enUrl, format: "vtt", label: "Inglés" });
        }
      }

      // Reescribir master (Español DEFAULT=YES) y ofrecerlo como alternativa.
      // La URL principal sigue siendo el m3u8 original (más compatible en TV/móvil).
      if (prefer === "es" || prefer === "en") {
        var rewritten = rewriteMasterForSpanish(pl, basePl, prefer);
        if (rewritten && /TYPE=SUBTITLES/i.test(rewritten)) {
          streamUrl = m3u8; // principal: original
          // guardamos rewritten en variable para alternatives más abajo
          pl = rewritten; // mark that we have a rewritten version
        }
      }
    }
  } catch (e) {
    if (e && e.code) throw e;
    // playlist fetch failed — still try original m3u8
  }

  // Fallback VTT paths only for octopus-style UUIDs
  if (subtitles.length === 0 && prefer !== "off" && /octopusmanifest\.org/i.test(m3u8)) {
    var baseUuid = m3u8.replace(/\/playlist[^/]*\.m3u8.*$/i, "/");
    if (prefer === "es" || prefer === "en") {
      subtitles = [
        { lang: "es", url: baseUuid + "s/es.vtt", format: "vtt", label: "Español (genérico)" },
        { lang: "en", url: baseUuid + "s/en.vtt", format: "vtt", label: "Inglés" },
      ];
      if (prefer === "en") subtitles.reverse();
    }
  }

  var stream = {
    url: m3u8,
    mime: "application/x-mpegURL",
    headers: {
      "User-Agent": UA,
      Referer: BASE + "/",
      Origin: BASE,
    },
    subtitles: subtitles.length ? subtitles : undefined,
    label: src.label || "Auto",
  };

  // master-lengs y similares: hash con caducidad
  var expM = m3u8.match(/expirein=(\d+)/i) || m3u8.match(/expires?=(\d+)/i);
  if (expM) {
    var exp = parseInt(expM[1], 10);
    var now = Math.floor(Date.now() / 1000);
    if (exp > now + 30) stream.expiresInSeconds = exp - now;
  }

  return stream;
}
