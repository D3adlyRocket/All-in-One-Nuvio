/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║                      4KHDHub — Nuvio Stream Plugin                          ║
 * ╠══════════════════════════════════════════════════════════════════════════════╣
 * ║  Source     › https://4khdhub.dad                                           ║
 * ║  Author     › Sanchit  |  TG: @S4NCHITT                                     ║
 * ║  Project    › Murph's Streams                                                ║
 * ║  Manifest   › https://badboysxs-morpheus.hf.space/manifest.json             ║
 * ╠══════════════════════════════════════════════════════════════════════════════╣
 * ║  Supports   › Movies & Series (480p / 1080p / 2160p 4K / DV HDR)            ║
 * ║  Chain      › gadgetsweb.xyz → HubCloud → /bypass extractor API             ║
 * ║  Info       › Quality · codec · language · size from page badges            ║
 * ║  Parallel   › All cards resolved concurrently                               ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 */

'use strict';

const cheerio = require('cheerio-without-node-native');

// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────────

const BASE_URL      = 'https://4khdhub.dad';
const TMDB_API_KEY  = '439c478a771f35c05022f9feabcca01c';
const EXTRACTOR_API = 'https://extractors-api.onrender.com'; // endpoint: /bypass?url=
const PLUGIN_TAG    = '[4KHDHub]';

const DEFAULT_HEADERS = {
  'User-Agent'   : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept'       : 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language' : 'en-US,en;q=0.9',
  'Referer'      : BASE_URL + '/',
};

// ─────────────────────────────────────────────────────────────────────────────
// Simple LRU Cache
// ─────────────────────────────────────────────────────────────────────────────

function LRUCache(max, ttlMs) {
  this.max  = max;
  this.ttl  = ttlMs;
  this.data = {};
  this.order = [];
}
LRUCache.prototype.get = function (k) {
  var e = this.data[k];
  if (!e) return undefined;
  if (Date.now() - e.ts > this.ttl) { delete this.data[k]; return undefined; }
  return e.v;
};
LRUCache.prototype.set = function (k, v) {
  if (this.data[k]) { this.data[k] = { v: v, ts: Date.now() }; return; }
  if (this.order.length >= this.max) { delete this.data[this.order.shift()]; }
  this.order.push(k);
  this.data[k] = { v: v, ts: Date.now() };
};

var streamCache = new LRUCache(200, 30 * 60 * 1000);
var metaCache   = new LRUCache(500, 24 * 60 * 60 * 1000);
var pageCache   = new LRUCache(300, 60 * 60 * 1000);

// ─────────────────────────────────────────────────────────────────────────────
// HTTP Helpers
// ─────────────────────────────────────────────────────────────────────────────

function fetchText(url, extraHeaders) {
  return fetch(url, {
    headers  : Object.assign({}, DEFAULT_HEADERS, extraHeaders || {}),
    redirect : 'follow',
  })
    .then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.text();
    })
    .catch(function (err) {
      console.log(PLUGIN_TAG + ' fetchText failed [' + url.slice(0, 80) + ']: ' + err.message);
      return null;
    });
}

function fetchJson(url, extraHeaders) {
  return fetch(url, {
    headers  : Object.assign({}, DEFAULT_HEADERS, { 'Accept': 'application/json' }, extraHeaders || {}),
    redirect : 'follow',
  })
    .then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    })
    .catch(function (err) {
      console.log(PLUGIN_TAG + ' fetchJson failed [' + url.slice(0, 80) + ']: ' + err.message);
      return null;
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Levenshtein Distance
// ─────────────────────────────────────────────────────────────────────────────

function levenshtein(s, t) {
  if (s === t) return 0;
  var n = s.length, m = t.length;
  if (!n) return m; if (!m) return n;
  var d = [];
  for (var i = 0; i <= n; i++) { d[i] = [i]; }
  for (var j = 0; j <= m; j++) { if (!d[0]) d[0] = []; d[0][j] = j; }
  for (var i2 = 1; i2 <= n; i2++)
    for (var j2 = 1; j2 <= m; j2++) {
      var cost = s[i2-1] === t[j2-1] ? 0 : 1;
      d[i2][j2] = Math.min(d[i2-1][j2]+1, d[i2][j2-1]+1, d[i2-1][j2-1]+cost);
    }
  return d[n][m];
}

// ─────────────────────────────────────────────────────────────────────────────
// TMDB
// ─────────────────────────────────────────────────────────────────────────────

function getTmdbDetails(tmdbId, type) {
  var cacheKey = '4khd_meta_' + tmdbId + '_' + type;
  var hit = metaCache.get(cacheKey);
  if (hit) return Promise.resolve(hit);

  var isTv = (type === 'tv' || type === 'series');
  var url  = 'https://api.themoviedb.org/3/' + (isTv ? 'tv' : 'movie') + '/' + tmdbId + '?api_key=' + TMDB_API_KEY;
  console.log(PLUGIN_TAG + ' TMDB → ' + url);

  return fetchJson(url).then(function (d) {
    if (!d) return null;
    var title   = isTv ? d.name  : d.title;
    var dateStr = isTv ? d.first_air_date : d.release_date;
    var year    = dateStr ? parseInt(dateStr.slice(0, 4)) : 0;
    var result  = { title: title || null, year: year, isTv: isTv };
    if (title) metaCache.set(cacheKey, result);
    return result;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// URL Helpers
// ─────────────────────────────────────────────────────────────────────────────

function isGdrive(url) {
  var u = (url || '').toLowerCase();
  return u.includes('drive.google.com') ||
         u.includes('googleusercontent.com') ||
         (u.includes('googleapis.com') && !u.includes('tmdb'));
}

function isPixelDrain(url) {
  return (url || '').toLowerCase().includes('pixeldrain');
}

function isR2Cdn(url) {
  var u = (url || '').toLowerCase();
  return u.includes('.r2.dev') || u.includes('r2.cloudflarestorage');
}

function isR2CdnSigned(url) {
  if (!isR2Cdn(url)) return false;
  try {
    var token = new URL(url).searchParams.get('token');
    return !!(token && token.length > 4);
  } catch (e) { return false; }
}

function normalisePixelDrain(url) {
  try {
    var u = new URL(url);
    var parts = u.pathname.split('/').filter(Boolean);
    var fileId = null;
    if (parts[0] === 'u'   && parts[1]) fileId = parts[1];
    else if (parts[0] === 'file' && parts[1]) fileId = parts[1];
    else if (parts[0] === 'api' && parts[1] === 'file' && parts[2]) fileId = parts[2];
    if (!fileId && parts.length === 1 && parts[0].length > 4) fileId = parts[0];
    return fileId ? 'https://pixeldrain.com/api/file/' + fileId + '?download' : null;
  } catch (e) { return null; }
}

function serverLabel(url) {
  var u = (url || '').toLowerCase();
  if (u.includes('pixeldrain'))                    return 'PixelDrain';
  if (u.includes('pub-') && u.includes('.r2.dev')) return 'R2 CDN';
  if (u.includes('.r2.dev'))                       return 'R2 CDN';
  if (u.includes('mayhem') || u.includes('/fsl')) return 'FSL';
  if (u.includes('gofile'))                        return 'GoFile';
  if (u.includes('mega.nz'))                       return 'Mega';
  if (u.includes('workers.dev'))                   return 'CF Worker';
  if (u.includes('hubcloud'))                      return 'HubCloud';
  return 'Direct';
}

// ─────────────────────────────────────────────────────────────────────────────
// atob Polyfill + rot13
// ─────────────────────────────────────────────────────────────────────────────

function atobPolyfill(input) {
  var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
  var str = String(input).replace(/=+$/, '');
  var output = '';
  for (var bc = 0, bs, buffer, i = 0;
    (buffer = str.charAt(i++));
    ~buffer && ((bs = bc % 4 ? bs * 64 + buffer : buffer), bc++ % 4)
      ? (output += String.fromCharCode(255 & (bs >> ((-2 * bc) & 6)))) : 0) {
    buffer = chars.indexOf(buffer);
  }
  return output;
}

function rot13(str) {
  return str.replace(/[a-zA-Z]/g, function (c) {
    return String.fromCharCode(
      (c <= 'Z' ? 90 : 122) >= (c = c.charCodeAt(0) + 13) ? c : c - 26
    );
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Info Parsers — read quality, codec, language, size from page HTML
// ─────────────────────────────────────────────────────────────────────────────

function extractQuality(text) {
  var t = (text || '').toUpperCase();
  if (/\b(2160P|4K)\b/.test(t))  return '4K';
  if (/\b1080P\b/.test(t))       return '1080p';
  if (/\b720P\b/.test(t))        return '720p';
  if (/\b480P\b/.test(t))        return '480p';
  return 'HD';
}

function extractCodec(text) {
  var t = text || '';
  if (/DV[\s.]?HDR[\s.]?H[\s.]?265/i.test(t)) return 'DV HDR H265';
  if (/HDR[\s.-]DV[\s.]?H[\s.]?265/i.test(t)) return 'HDR DV H265';
  if (/DV[\s.]?HDR/i.test(t))                  return 'DV HDR';
  if (/HDR[\s.-]DV/i.test(t))                  return 'HDR DV';
  if (/\bHDR\b/i.test(t))                       return 'HDR';
  if (/H[\s.]?265|HEVC/i.test(t))               return 'HEVC';
  if (/H[\s.]?264|x264/i.test(t))               return 'x264';
  if (/\bAV1\b/i.test(t))                       return 'AV1';
  return null;
}

function extractAudio(text) {
  var t = text || '';
  if (/DDP5\.1.*Atmos|Atmos.*DDP/i.test(t)) return 'DDP5.1 Atmos';
  if (/DDP5\.1/i.test(t))                   return 'DDP5.1';
  if (/AAC5\.1/i.test(t))                   return 'AAC5.1';
  if (/\bAtmos\b/i.test(t))                 return 'Atmos';
  if (/\bDDP\b/i.test(t))                   return 'DDP';
  if (/\bAAC\b/i.test(t))                   return 'AAC';
  return null;
}

function extractLanguages(text) {
  var t = text || '';
  var langs = [];
  var LANG_MAP = [
    ['Hindi',      /\bHindi\b/i],
    ['English',    /\bEnglish\b/i],
    ['Tamil',      /\bTamil\b/i],
    ['Telugu',     /\bTelugu\b/i],
    ['Malayalam',  /\bMalayalam\b/i],
    ['Kannada',    /\bKannada\b/i],
    ['Bengali',    /\bBengali\b/i],
    ['Punjabi',    /\bPunjabi\b/i],
    ['Korean',     /\bKorean\b/i],
    ['Japanese',   /\bJapanese\b/i],
    ['Chinese',    /\bChinese\b/i],
    ['Spanish',    /\bSpanish\b/i],
    ['French',     /\bFrench\b/i],
    ['German',     /\bGerman\b/i],
    ['Arabic',     /\bArabic\b/i],
    ['Russian',    /\bRussian\b/i],
    ['Turkish',    /\bTurkish\b/i],
    ['Portuguese', /\bPortuguese\b/i],
  ];
  LANG_MAP.forEach(function (pair) {
    if (pair[1].test(t)) langs.push(pair[0]);
  });
  // Check for "Multi" — means multiple langs
  if (/\bMulti\b/i.test(t) && !langs.length) langs.push('Multi-Audio');
  return langs;
}

function extractSize(text) {
  var m = (text || '').match(/([\d.]+\s*(?:GB|MB|TB))/i);
  return m ? m[1].replace(/\s+/g, '') : null;
}

/**
 * Parse all metadata from a .download-item card element.
 * The new 4khdhub.dad page has this structure per card:
 *
 *   .download-header
 *     .flex-1           → "Peaky Blinders: The Immortal Man (2160p WEB-DL DV HDR H265)"
 *     code > span.badge → coloured pills: size, languages, source
 *   .file-title         → "Peaky.Blinders...2026.2160p.NF.WEB-DL.Multi.DDP5.1.DV.HDR.H.265-4kHDHub.Com.mkv"
 *   a.btn               → "Download HubCloud" href=gadgetsweb.xyz/?id=...
 *                          "Download HubDrive"  href=gadgetsweb.xyz/?id=...
 */
function parseCardInfo($, el) {
  var header     = $(el).find('.download-header').first();
  var headerText = header.find('.flex-1').clone().children('code').remove().end().text().trim();
  var fileTitle  = $(el).find('.file-title').text().trim();

  // Collect all badge text (size, language, source)
  var badgeText = '';
  header.find('code .badge, code span').each(function (_, b) {
    badgeText += ' ' + $(b).text().trim();
  });

  var corpus = headerText + ' ' + fileTitle + ' ' + badgeText;

  var quality   = extractQuality(corpus);
  var codec     = extractCodec(fileTitle + ' ' + headerText);
  var audio     = extractAudio(fileTitle);
  var languages = extractLanguages(badgeText + ' ' + headerText);
  var size      = extractSize(badgeText);

  // Source label
  var srcMatch = corpus.match(/\b(WEB[\s-]?DL|WEBRip|BluRay|BRRip|HDCAM|NF|AMZN|DSNP)\b/i);
  var source   = srcMatch ? srcMatch[1].toUpperCase() : 'WEB-DL';

  return {
    quality   : quality,
    codec     : codec,
    audio     : audio,
    source    : source,
    languages : languages,
    size      : size,
    filename  : fileTitle,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Redirect Chain
// gadgetsweb.xyz/?id=BASE64 → follows redirect → HubCloud URL
// Then: HubCloud URL → /bypass extractor API → direct stream URLs
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolve gadgetsweb.xyz redirect → target URL (usually a HubCloud page).
 * Strategy: follow redirect chain normally; read res.url for final destination.
 */
function resolveGadgetsWeb(gadgetsUrl) {
  console.log(PLUGIN_TAG + ' gadgetsweb → ' + gadgetsUrl.slice(0, 80));
  return fetch(gadgetsUrl, {
    headers  : Object.assign({}, DEFAULT_HEADERS, { 'Referer': BASE_URL + '/' }),
    redirect : 'follow',
  })
    .then(function (res) {
      var finalUrl = res.url || gadgetsUrl;
      // If we ended up somewhere useful (not back at gadgetsweb), return it
      if (!finalUrl.includes('gadgetsweb') && finalUrl.startsWith('http')) {
        return finalUrl;
      }
      // Try to find redirect target in the page body
      return res.text().then(function (html) {
        // meta refresh
        var m = html.match(/url=([^\s"']+)/i);
        if (m && m[1].startsWith('http')) return m[1];
        // window.location
        var m2 = html.match(/window\.location(?:\.href)?\s*=\s*["']([^"']+)["']/i);
        if (m2) return m2[1];
        // Any HubCloud href
        var m3 = html.match(/href=["']([^"']*hubcloud[^"']+)["']/i);
        if (m3) return m3[1];
        console.log(PLUGIN_TAG + ' gadgetsweb body fallback failed');
        return null;
      });
    })
    .catch(function (err) {
      console.log(PLUGIN_TAG + ' gadgetsweb resolve error: ' + err.message);
      return null;
    });
}

/**
 * Resolve old-style obfuscated redirect (4khdhub.fans pattern, kept as fallback).
 */
function resolveObfuscatedRedirect(redirectUrl) {
  return fetchText(redirectUrl).then(function (html) {
    if (!html) return null;
    try {
      var m = html.match(/'o','(.*?)'/);
      if (m) {
        var step4 = JSON.parse(atobPolyfill(rot13(atobPolyfill(atobPolyfill(m[1])))));
        if (step4 && step4.o) return atobPolyfill(step4.o);
      }
      var m2 = html.match(/var\s+o\s*=\s*['"]([A-Za-z0-9+/=]+)['"]/);
      if (m2) {
        var decoded = atobPolyfill(m2[1]);
        if (decoded.startsWith('http')) return decoded;
      }
    } catch (e) {
      console.log(PLUGIN_TAG + ' Obfuscated decode error: ' + e.message);
    }
    return null;
  });
}

/**
 * Extract a URL value from any shape of API response object.
 */
function extractStreamUrl(s) {
  if (!s || typeof s !== 'object') return null;
  var fields = ['url','link','src','stream','directUrl','streamUrl','download','downloadUrl','href','file','source','path'];
  for (var i = 0; i < fields.length; i++) {
    var val = s[fields[i]];
    if (val && typeof val === 'string' && val.startsWith('http')) return val;
  }
  var nested = ['data','result','info','media'];
  for (var j = 0; j < nested.length; j++) {
    var inner = s[nested[j]];
    if (inner && typeof inner === 'object' && !Array.isArray(inner)) {
      var u = extractStreamUrl(inner);
      if (u) return u;
    }
  }
  return null;
}

/**
 * Call the extractor API /bypass endpoint with a HubCloud URL.
 * Returns array of { url, label, size, direct }.
 */
function resolveViaExtractorApi(hubCloudUrl) {
  var apiUrl = EXTRACTOR_API + '/bypass?url=' + encodeURIComponent(hubCloudUrl);
  console.log(PLUGIN_TAG + ' Extractor API → ' + apiUrl.slice(0, 120));

  return fetch(apiUrl, {
    headers  : { 'User-Agent': DEFAULT_HEADERS['User-Agent'] },
    redirect : 'follow',
  })
    .then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    })
    .then(function (data) {
      if (!data) return [];
      var results = [];

      console.log(PLUGIN_TAG + ' API keys: ' + Object.keys(data).join(', '));

      // Process a single stream entry
      function processEntry(s, label, size) {
        var streamUrl = extractStreamUrl(s) || (typeof s === 'string' && s.startsWith('http') ? s : null);
        if (!streamUrl) return;

        // Fix pixeldrain
        if (isPixelDrain(streamUrl)) {
          streamUrl = normalisePixelDrain(streamUrl);
          if (!streamUrl) return;
        }

        if (isGdrive(streamUrl)) return;
        // Skip unsigned R2
        if (isR2Cdn(streamUrl) && !isR2CdnSigned(streamUrl)) return;

        var direct = isPixelDrain(streamUrl) || isR2CdnSigned(streamUrl);
        var qualHint = (s && (s.quality || s.label || s.name)) || label || '';
        var sizeHint = (s && (s.size || s.filesize)) || size || null;

        console.log(PLUGIN_TAG + ' ✔ stream (' + (direct ? 'direct' : 'proxy') + '): ' + streamUrl.slice(0, 80));
        results.push({ url: streamUrl, label: qualHint, size: sizeHint, direct: direct });
      }

      // streams[] array
      if (Array.isArray(data.streams) && data.streams.length) {
        data.streams.forEach(function (s) { processEntry(s, '', null); });
      }

      // links[] array
      if (!results.length && Array.isArray(data.links) && data.links.length) {
        data.links.forEach(function (s) { processEntry(s, '', null); });
      }

      // top-level url field
      if (!results.length && data.url) {
        processEntry({ url: data.url }, data.label || '', data.size || null);
      }

      console.log(PLUGIN_TAG + ' Extractor returned ' + results.length + ' stream(s)');
      return results;
    })
    .catch(function (err) {
      console.log(PLUGIN_TAG + ' Extractor API error: ' + err.message);
      return [];
    });
}

/**
 * Full resolution chain for one download card:
 * gadgetsweb.xyz → HubCloud URL → extractor /bypass → direct stream(s)
 */
function resolveCard($, el) {
  // Collect all download button hrefs from the card
  var hubCloudUrl = null;
  var hubDriveUrl = null;

  $(el).find('a.btn[href], a[href*="gadgetsweb"]').each(function (_, a) {
    var href = $(a).attr('href') || '';
    var text = $(a).text().trim().toLowerCase();
    if (!href) return;
    if ((text.includes('hubcloud') || href.includes('gadgetsweb')) && !hubCloudUrl) {
      hubCloudUrl = href;
    } else if (text.includes('hubdrive') && !hubDriveUrl) {
      hubDriveUrl = href;
    }
  });

  var entryUrl = hubCloudUrl || hubDriveUrl;
  if (!entryUrl) {
    console.log(PLUGIN_TAG + ' No download button found in card');
    return Promise.resolve([]);
  }

  // Step 1: Resolve gadgetsweb redirect → HubCloud URL
  var resolvePromise;
  if (entryUrl.includes('gadgetsweb')) {
    resolvePromise = resolveGadgetsWeb(entryUrl).then(function (resolved) {
      if (resolved) return resolved;
      // Fallback: try obfuscated decode
      return resolveObfuscatedRedirect(entryUrl);
    });
  } else {
    // Direct hubcloud or other URL
    resolvePromise = Promise.resolve(entryUrl);
  }

  return resolvePromise.then(function (hubUrl) {
    if (!hubUrl) {
      console.log(PLUGIN_TAG + ' Redirect resolve failed for: ' + entryUrl.slice(0, 70));
      return [];
    }
    console.log(PLUGIN_TAG + ' Resolved to: ' + hubUrl.slice(0, 80));

    // If it's a HubDrive page, look for inner HubCloud link
    if (hubUrl.toLowerCase().includes('hubdrive')) {
      return fetchText(hubUrl).then(function (innerHtml) {
        if (!innerHtml) return [];
        var $ = cheerio.load(innerHtml);
        var innerHubCloud = $('a[href*="hubcloud"]').first().attr('href');
        if (innerHubCloud) {
          console.log(PLUGIN_TAG + ' Inner HubCloud: ' + innerHubCloud.slice(0, 80));
          return resolveViaExtractorApi(innerHubCloud);
        }
        return resolveViaExtractorApi(hubUrl);
      });
    }

    // Step 2: Extractor API
    return resolveViaExtractorApi(hubUrl);
  }).catch(function (err) {
    console.log(PLUGIN_TAG + ' resolveCard error: ' + err.message);
    return [];
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Site Search
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Search 4khdhub.dad for a title+year and return the best matching page URL.
 * The new site has <a class="movie-card"> with .movie-card-title and .movie-card-meta.
 */
function findPageUrl(title, year, isSeries) {
  var cacheKey = '4khd_page_' + title + '_' + year;
  var hit = pageCache.get(cacheKey);
  if (hit) return Promise.resolve(hit);

  // Try with title+year first, then title only
  function doSearch(query) {
    var searchUrl = BASE_URL + '/?s=' + encodeURIComponent(query);
    console.log(PLUGIN_TAG + ' Search → ' + searchUrl);

    return fetchText(searchUrl).then(function (html) {
      if (!html) return null;
      var $ = cheerio.load(html);
      var candidates = [];

      $('a.movie-card[href]').each(function (_, el) {
        var href      = $(el).attr('href') || '';
        var cardTitle = $(el).find('.movie-card-title').text().trim();
        var metaText  = $(el).find('.movie-card-meta').text().trim();
        var cardYear  = parseInt((metaText.match(/\d{4}/) || [])[0]) || 0;

        if (!href || !cardTitle) return;
        if (!href.startsWith('http')) href = BASE_URL + (href.startsWith('/') ? '' : '/') + href;

        var dist = levenshtein(cardTitle.toLowerCase(), title.toLowerCase());
        candidates.push({ href: href, title: cardTitle, year: cardYear, dist: dist });
      });

      if (!candidates.length) return null;

      // Sort: closest title first, then year proximity
      candidates.sort(function (a, b) {
        if (a.dist !== b.dist) return a.dist - b.dist;
        return Math.abs(a.year - year) - Math.abs(b.year - year);
      });

      var best = candidates[0];
      var maxDist = Math.min(5, Math.floor(title.length * 0.35));
      if (best.dist > maxDist) {
        console.log(PLUGIN_TAG + ' Best hit "' + best.title + '" dist=' + best.dist + ' > max=' + maxDist);
        return null;
      }

      console.log(PLUGIN_TAG + ' Hit: "' + best.title + '" (' + best.year + ') dist=' + best.dist);
      return best.href;
    });
  }

  return doSearch(title + ' ' + year).then(function (url) {
    if (url) { pageCache.set(cacheKey, url); return url; }
    return doSearch(title).then(function (url2) {
      if (url2) pageCache.set(cacheKey, url2);
      return url2;
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Detail Page Scraper
// ─────────────────────────────────────────────────────────────────────────────

function scrapeDetailPage(pageUrl, isSeries, season, episode) {
  console.log(PLUGIN_TAG + ' Detail page → ' + pageUrl);

  return fetchText(pageUrl).then(function (html) {
    if (!html) return { $: null, cards: [] };
    var $ = cheerio.load(html);
    var cards = [];

    if (isSeries && season != null && episode != null) {
      var seasonStr  = 'S' + String(season).padStart(2, '0');
      var episodeStr = 'Episode-' + String(episode).padStart(2, '0');

      $('.episode-item').each(function (_, el) {
        if ($('.episode-title', el).text().indexOf(seasonStr) === -1) return;
        $('.episode-download-item, .download-item', el).each(function (_, item) {
          if ($(item).text().indexOf(episodeStr) !== -1) cards.push(item);
        });
      });

      // Fallback: just grab all download-items
      if (!cards.length) {
        $('.download-item').each(function (_, el) { cards.push(el); });
      }
    } else {
      $('.download-item').each(function (_, el) { cards.push(el); });
    }

    console.log(PLUGIN_TAG + ' ' + cards.length + ' download card(s)');
    return { $: $, cards: cards };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Stream Builder
// ─────────────────────────────────────────────────────────────────────────────

function buildStream(streamUrl, info, tmdbTitle, tmdbYear, season, episode, isSeries, direct) {
  var quality  = info.quality || 'HD';
  var langStr  = info.languages && info.languages.length ? info.languages.join(' + ') : null;
  var server   = serverLabel(streamUrl);

  // ── Name (stream picker row) ───────────────────────────────────────────────
  var nameParts = ['🎬 4KHDHub'];
  nameParts.push(quality);
  if (info.codec)  nameParts.push(info.codec);
  if (info.source) nameParts.push(info.source);
  if (info.size)   nameParts.push(info.size);
  var streamName = nameParts.join(' | ');

  // ── Title (detail subtitle lines) ─────────────────────────────────────────
  var lines = [];

  var titleLine = tmdbTitle;
  if (tmdbYear) titleLine += ' (' + tmdbYear + ')';
  if (isSeries && season != null && episode != null) {
    titleLine += ' · S' + String(season).padStart(2,'0') + 'E' + String(episode).padStart(2,'0');
  }
  lines.push(titleLine);

  var techParts = [];
  if (info.quality) techParts.push(info.quality);
  if (info.source)  techParts.push(info.source);
  if (info.codec)   techParts.push(info.codec);
  if (techParts.length) lines.push('📺 ' + techParts.join(' · '));

  if (langStr) lines.push('🔊 ' + langStr);
  if (info.audio) lines.push('🎵 ' + info.audio);
  if (info.size || server) lines.push('💾 ' + (info.size || '') + (info.size && server ? '  ' : '') + (server ? '[' + server + ']' : ''));
  if (info.filename) lines.push('📄 ' + info.filename.slice(0, 72) + (info.filename.length > 72 ? '…' : ''));

  lines.push("by Sanchit · @S4NCHITT · Murph's Streams");

  return {
    name    : streamName,
    title   : lines.join('\n'),
    url     : streamUrl,
    quality : quality,
    direct  : !!direct,
    behaviorHints: {
      notWebReady : true,
      bingeGroup  : '4khdhub',
    },
  };
}

function qualitySortScore(q) {
  if (!q) return 0;
  if (/4K|2160/i.test(q)) return 2160;
  var m = q.match(/(\d+)p/i);
  return m ? parseInt(m[1]) : 100;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API — getStreams
// ─────────────────────────────────────────────────────────────────────────────

function getStreams(tmdbId, type, season, episode) {
  var cacheKey = '4khd_' + tmdbId + '_' + type + '_' + season + '_' + episode;
  var hit = streamCache.get(cacheKey);
  if (hit) { console.log(PLUGIN_TAG + ' Cache HIT: ' + cacheKey); return Promise.resolve(hit); }

  var isSeries = (type === 'tv' || type === 'series');
  var s = season  ? parseInt(season)  : null;
  var e = episode ? parseInt(episode) : null;

  console.log(PLUGIN_TAG + ' ► ' + tmdbId + ' | ' + type + (s ? ' S' + s + 'E' + e : ''));

  return getTmdbDetails(tmdbId, type).then(function (details) {
    if (!details || !details.title) {
      console.log(PLUGIN_TAG + ' TMDB failed'); return [];
    }

    var title = details.title;
    var year  = details.year;
    console.log(PLUGIN_TAG + ' Title: "' + title + '" (' + year + ')');

    return findPageUrl(title, year, isSeries).then(function (pageUrl) {
      if (!pageUrl) { console.log(PLUGIN_TAG + ' Page not found'); return []; }
      console.log(PLUGIN_TAG + ' Page → ' + pageUrl);

      return scrapeDetailPage(pageUrl, isSeries, s, e).then(function (result) {
        var $ = result.$;
        var cards = result.cards;
        if (!cards.length) { console.log(PLUGIN_TAG + ' No cards found'); return []; }

        var cardData = cards.slice(0, 8).map(function (card) {
          return { card: card, info: parseCardInfo($, card) };
        });

        console.log(PLUGIN_TAG + ' Resolving ' + cardData.length + ' card(s)…');

        var resolvePromises = cardData.map(function (item) {
          return resolveCard($, item.card)
            .then(function (links) { return { info: item.info, links: links }; })
            .catch(function () { return { info: item.info, links: [] }; });
        });

        return Promise.all(resolvePromises).then(function (resolved) {
          var streams = [];
          var seen    = {};

          resolved.forEach(function (res) {
            res.links.forEach(function (link) {
              if (!link.url || isGdrive(link.url)) return;
              if (seen[link.url]) return;
              seen[link.url] = true;

              // Merge extractor quality hint into info
              var info = Object.assign({}, res.info);
              if (link.label && extractQuality(link.label) !== 'HD') {
                info.quality = extractQuality(link.label);
              }
              if (link.size && !info.size) info.size = link.size;

              streams.push(buildStream(
                link.url, info,
                title, year, s, e, isSeries, link.direct
              ));
            });
          });

          // Sort 4K → 1080p → 720p → 480p
          streams.sort(function (a, b) {
            return qualitySortScore(b.quality) - qualitySortScore(a.quality);
          });

          console.log(PLUGIN_TAG + ' ✔ ' + streams.length + ' stream(s) (' + streams.filter(function(x){return x.direct;}).length + ' direct)');
          if (streams.length) streamCache.set(cacheKey, streams);
          return streams;
        });
      });
    });
  }).catch(function (err) {
    console.error(PLUGIN_TAG + ' Fatal: ' + err.message);
    return [];
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Export
// ─────────────────────────────────────────────────────────────────────────────

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { getStreams };
} else {
  global.getStreams = getStreams;
}