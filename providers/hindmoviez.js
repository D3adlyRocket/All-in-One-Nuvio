/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║                       HindMoviez — Nuvio Stream Plugin                       ║
 * ╠══════════════════════════════════════════════════════════════════════════════╣
 * ║  Source     › https://hindmovie.ltd                                          ║
 * ║  Author     › Sanchit  |  TG: @S4NCHITT                                      ║
 * ║  Project    › Murph's Streams                                                ║
 * ║  Manifest   › https://badboysxs-morpheus.hf.space/manifest.json              ║
 * ╠══════════════════════════════════════════════════════════════════════════════╣
 * ║  Supports   › Movies & Series  (480p / 720p / 1080p / 4K)                    ║
 * ║  Chain      › mvlink.site → hshare.ink → hcloud → Servers                    ║
 * ║  Info       › Quality + Language parsed from page headings                   ║
 * ║  Parallel   › All links resolved concurrently                                ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 */

'use strict';

const cheerio = require('cheerio-without-node-native');

// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────────

const BASE_URL     = 'https://hindmovie.ltd';
const TMDB_API_KEY = '439c478a771f35c05022f9feabcca01c';
const PLUGIN_TAG   = '[HindMoviez]';

const DEFAULT_HEADERS = {
  'User-Agent'      : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept'          : 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language' : 'en-US,en;q=0.9',
};

// ─────────────────────────────────────────────────────────────────────────────
// HTTP Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch a URL and return its response body as text.
 * Returns null on any network or HTTP error.
 */
function fetchText(url, extraHeaders) {
  return fetch(url, {
    headers  : Object.assign({}, DEFAULT_HEADERS, extraHeaders || {}),
    redirect : 'follow',
  })
    .then(function (res) { return res.text(); })
    .catch(function (err) {
      console.log(PLUGIN_TAG + ' Fetch failed [' + url + ']: ' + err.message);
      return null;
    });
}

/**
 * Fetch a URL following all redirects, returning both the final HTML
 * and the resolved URL after any redirect chain.
 */
function fetchTextWithFinalUrl(url, extraHeaders) {
  return fetch(url, {
    headers  : Object.assign({}, DEFAULT_HEADERS, extraHeaders || {}),
    redirect : 'follow',
  })
    .then(function (res) {
      return res.text().then(function (text) {
        return { html: text, finalUrl: res.url };
      });
    })
    .catch(function (err) {
      console.log(PLUGIN_TAG + ' Fetch+redirect failed [' + url + ']: ' + err.message);
      return { html: null, finalUrl: url };
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// TMDB — Title & Year Lookup
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolve a TMDB ID to a { title, year } object.
 * Handles both movie and TV/series types.
 */
function getTmdbDetails(tmdbId, type) {
  var isSeries = (type === 'series' || type === 'tv');
  var endpoint = isSeries ? 'tv' : 'movie';
  var url = 'https://api.themoviedb.org/3/' + endpoint + '/' + tmdbId + '?api_key=' + TMDB_API_KEY;

  console.log(PLUGIN_TAG + ' TMDB lookup → ' + url);

  return fetch(url)
    .then(function (res) { return res.json(); })
    .then(function (data) {
      if (isSeries) {
        return {
          title : data.name,
          year  : data.first_air_date ? parseInt(data.first_air_date.split('-')[0]) : 0,
        };
      }
      return {
        title : data.title,
        year  : data.release_date ? parseInt(data.release_date.split('-')[0]) : 0,
      };
    })
    .catch(function (err) {
      console.log(PLUGIN_TAG + ' TMDB request failed: ' + err.message);
      return null;
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Page Info Extractor
// Reads quality, language, size and source from the H3 headings on the page.
//
// HindMovie uses headings like:
//   "Peaky Blinders The Immortal Man 2026 Hindi-English 1080P Web-DL [2.3GB]"
//   "Peaky Blinders The Immortal Man 2026 Hindi-English 480P Web-DL [373MB]"
//
// Each H3 heading directly precedes its download button, so we pair them.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse a single H3 heading string and extract:
 *   quality    — "1080p" / "720p" / "480p" / "4K" / "2160p"
 *   languages  — ["Hindi", "English"] etc.
 *   size       — "2.3GB" / "373MB" etc.
 *   source     — "Web-DL" / "BluRay" / "WEB-DL" etc.
 *   is10bit    — true if "10bit" appears
 *
 * Example heading:
 *   "Peaky Blinders The Immortal Man 2026 Hindi-English 1080P 10bit Web-DL [2.3GB]"
 */
function parseHeadingInfo(heading) {
  var text = heading || '';

  // ── Quality ────────────────────────────────────────────────────────────────
  var qualityMatch = text.match(/\b(4K|2160[pP]|1080[pP]|720[pP]|480[pP]|360[pP])\b/i);
  var quality = qualityMatch ? qualityMatch[1].toUpperCase().replace('P', 'p') : null;
  // Normalise 4K alias
  if (quality && quality.toLowerCase() === '4k') quality = '2160p';

  // ── 10-bit flag ────────────────────────────────────────────────────────────
  var is10bit = /\b10\s*[Bb]it\b/.test(text);

  // ── Source (Web-DL, BluRay, WEBRip, HDTV …) ───────────────────────────────
  var sourceMatch = text.match(/\b(Web[\s-]?DL|WEB[\s-]?DL|WEBRip|BluRay|Blu[\s-]?Ray|BRRip|HDTV|HDCAM|CAM|TS)\b/i);
  var source = sourceMatch ? sourceMatch[1].replace(/\s/g, '-') : null;

  // ── File size ──────────────────────────────────────────────────────────────
  var sizeMatch = text.match(/\[([0-9.]+\s*(?:MB|GB|TB|KB))\]/i);
  var size = sizeMatch ? sizeMatch[1].trim() : null;

  // ── Languages ─────────────────────────────────────────────────────────────
  // Match "Hindi-English", "Hindi English", "Multi Audio", etc.
  // Strategy: find a run of known language words separated by - or spaces
  var KNOWN_LANGS = [
    'Hindi', 'English', 'Tamil', 'Telugu', 'Malayalam', 'Kannada',
    'Bengali', 'Punjabi', 'Marathi', 'Urdu', 'Japanese', 'Korean',
    'Chinese', 'Spanish', 'French', 'German', 'Arabic', 'Russian',
    'Turkish', 'Portuguese', 'Italian', 'Thai', 'Multi',
  ];

  var langPattern = new RegExp(
    '\\b(' + KNOWN_LANGS.join('|') + ')(?:[\\s-]+(' + KNOWN_LANGS.join('|') + '))*\\b',
    'gi'
  );

  var languages = [];
  var seen = {};
  var langMatch;
  while ((langMatch = langPattern.exec(text)) !== null) {
    // Split the full match on hyphens/spaces to get individual langs
    langMatch[0].split(/[\s-]+/).forEach(function (word) {
      var cap = word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
      if (KNOWN_LANGS.map(function(l){return l.toLowerCase();}).indexOf(cap.toLowerCase()) !== -1 && !seen[cap]) {
        seen[cap] = true;
        languages.push(cap);
      }
    });
  }

  return {
    quality  : quality,
    is10bit  : is10bit,
    source   : source,
    size     : size,
    languages: languages,
  };
}

/**
 * Build a clean, human-readable label from parsed heading info.
 * e.g. "1080p · Web-DL · 10bit · Hindi + English · 2.3GB"
 */
function buildInfoLabel(info) {
  var parts = [];
  if (info.quality)             parts.push(info.quality);
  if (info.source)              parts.push(info.source);
  if (info.is10bit)             parts.push('10bit');
  if (info.languages.length)   parts.push(info.languages.join(' + '));
  if (info.size)                parts.push(info.size);
  return parts.join(' · ') || 'Unknown';
}

// ─────────────────────────────────────────────────────────────────────────────
// Parsers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extract article cards (title + URL) from a HindMoviez search results page.
 */
function parseArticles(html) {
  var $ = cheerio.load(html);
  var results = [];

  $('article').each(function (_i, el) {
    var titleTag = $(el).find('h2.entry-title, a[rel="bookmark"]').first();
    if (!titleTag.length) return;

    var title = titleTag.text().trim();
    var a     = titleTag.is('a') ? titleTag : titleTag.find('a').first();
    var link  = a.attr('href');

    if (link) results.push({ title: title, link: link });
  });

  return results;
}

/**
 * Extract download buttons (mvlink.site links) paired with their H3 headings.
 *
 * HindMovie page structure:
 *   <h3>... Movie Title 2026 Hindi-English 1080P Web-DL [2.3GB]</h3>
 *   <p><a href="https://mvlink.site/XXXXX">Download Links</a></p>
 *
 * We walk every H3 in the entry-content, then find the next mvlink anchor.
 * This gives us accurate quality + language metadata per button.
 */
function parseDownloadButtons(html) {
  var $ = cheerio.load(html);
  var buttons = [];

  $('.entry-content h3').each(function (_i, h3) {
    var headingText = $(h3).text().trim();

    // Only process headings that contain a download button nearby
    // Walk forward siblings until we find an mvlink anchor or hit another H3
    var sibling = $(h3).next();
    var mvlinkHref = null;

    while (sibling.length && !sibling.is('h3') && !sibling.is('h2')) {
      var anchor = sibling.find('a[href*="mvlink.site"]').first();
      if (anchor.length) {
        mvlinkHref = anchor.attr('href');
        break;
      }
      sibling = sibling.next();
    }

    if (!mvlinkHref) return; // No button found after this heading

    var info = parseHeadingInfo(headingText);
    console.log(PLUGIN_TAG + ' Found button: ' + headingText.slice(0, 80));

    buttons.push({
      heading : headingText,
      link    : mvlinkHref,
      info    : info,
    });
  });

  // Fallback: if no H3-paired buttons found, grab all mvlink anchors with
  // quality scraped from surrounding context (original behaviour)
  if (!buttons.length) {
    $('a[href*="mvlink.site"]').each(function (_i, el) {
      var href = $(el).attr('href');
      var ctx  = $(el).closest('p, div').prev('h3').text()
               + ' ' + $(el).closest('p, div').text();

      var info = parseHeadingInfo(ctx);
      buttons.push({ heading: ctx.trim(), link: href, info: info });
    });
  }

  return buttons;
}

/**
 * Extract individual episode links (or a single movie link) from an mvlink page.
 */
function parseEpisodes(html) {
  var $ = cheerio.load(html);
  var episodes = [];

  $('a').each(function (_i, el) {
    var text = $(el).text().trim();
    if (/Episode\s*\d+/i.test(text)) {
      episodes.push({ title: text, link: $(el).attr('href') });
    }
  });

  // Fallback for movies — look for a "Get Links" button
  if (!episodes.length) {
    var getLinks = $('a').filter(function (_i, el) {
      return /Get Links/i.test($(el).text());
    }).first();

    if (getLinks.length) {
      episodes.push({ title: 'Movie Link', link: getLinks.attr('href') });
    }
  }

  return episodes;
}

/**
 * Locate the hshare.ink redirect URL from an mvlink page or its final URL.
 */
function parseHshareUrl(html, finalUrl) {
  if (finalUrl && finalUrl.indexOf('hshare.ink') !== -1) return finalUrl;

  var $ = cheerio.load(html);

  var btn = $('a').filter(function (_i, el) {
    return /Get Links/i.test($(el).text());
  }).first();

  if (btn.length) {
    var href = btn.attr('href') || '';
    if (href.indexOf('hshare.ink') !== -1) return href;
  }

  var fallback = $('a[href*="hshare.ink"]').first().attr('href');
  return fallback || null;
}

/**
 * Extract the hcloud "HPage" link from an hshare page.
 */
function parseHcloudUrl(html) {
  var $ = cheerio.load(html);
  var btn = $('a').filter(function (_i, el) {
    return /HPage/i.test($(el).text());
  }).first();
  return btn.length ? btn.attr('href') : null;
}

/**
 * Extract numbered server download links from the final hcloud page.
 * Tries #download-btn{N} IDs first, then falls back to link text matching.
 */
function parseServers(html) {
  var $ = cheerio.load(html);
  var servers = {};

  for (var i = 1; i <= 5; i++) {
    var btn = $('#download-btn' + i);
    if (btn.length && btn.attr('href')) {
      servers['Server ' + i] = btn.attr('href');
    }
  }

  if (!Object.keys(servers).length) {
    $('a').each(function (_i, el) {
      var text = $(el).text().trim();
      if (/Server\s*\d+/i.test(text)) {
        servers[text] = $(el).attr('href');
      }
    });
  }

  return servers;
}

// ─────────────────────────────────────────────────────────────────────────────
// Redirect Chain Resolver
// mvlink.site → hshare.ink → hcloud → { Server 1, Server 2, … }
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Walk the full 4-step redirect chain and return a map of
 * server names → final download URLs.
 */
function resolveServerChain(mvlinkUrl) {
  return fetchTextWithFinalUrl(mvlinkUrl).then(function (result) {
    if (!result.html) return {};

    var hshareUrl = parseHshareUrl(result.html, result.finalUrl);
    if (!hshareUrl) {
      console.log(PLUGIN_TAG + ' hshare URL not found for: ' + mvlinkUrl);
      return {};
    }

    return fetchText(hshareUrl).then(function (hshareHtml) {
      if (!hshareHtml) return {};

      var hcloudUrl = parseHcloudUrl(hshareHtml);
      if (!hcloudUrl) {
        console.log(PLUGIN_TAG + ' hcloud URL not found for: ' + hshareUrl);
        return {};
      }

      return fetchText(hcloudUrl).then(function (hcloudHtml) {
        if (!hcloudHtml) return {};
        return parseServers(hcloudHtml);
      });
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Site Search
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Search HindMoviez for the given title and return the URL of the best-matching page.
 */
function findPageUrl(title) {
  var searchUrl = BASE_URL + '/?s=' + encodeURIComponent(title);

  return fetchText(searchUrl).then(function (html) {
    if (!html) return null;

    var articles = parseArticles(html);
    if (!articles.length) return null;

    console.log(PLUGIN_TAG + ' Search hit → "' + articles[0].title + '"');
    return articles[0].link;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API — getStreams
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Main entry point called by the Nuvio plugin runner.
 *
 * @param {string}        tmdbId   - TMDB content ID
 * @param {string}        type     - "movie" | "series" | "tv"
 * @param {number|string} season   - Season number  (series only)
 * @param {number|string} episode  - Episode number (series only)
 * @returns {Promise<Array>}         Array of Nuvio-compatible stream objects
 */
function getStreams(tmdbId, type, season, episode) {
  return getTmdbDetails(tmdbId, type).then(function (details) {
    if (!details) {
      console.log(PLUGIN_TAG + ' TMDB lookup returned nothing — aborting.');
      return [];
    }

    var isSeries = (type === 'series' || type === 'tv');
    var label    = details.title + (isSeries ? ' S' + season + 'E' + episode : '');
    console.log(PLUGIN_TAG + ' ► Searching for: ' + label);

    return findPageUrl(details.title).then(function (pageUrl) {
      if (!pageUrl) {
        console.log(PLUGIN_TAG + ' Page not found for: ' + details.title);
        return [];
      }
      console.log(PLUGIN_TAG + ' Page → ' + pageUrl);

      return fetchText(pageUrl).then(function (pageHtml) {
        if (!pageHtml) return [];

        // ── Parse download buttons WITH quality/language from page headings ──
        var buttons = parseDownloadButtons(pageHtml);
        if (!buttons.length) {
          console.log(PLUGIN_TAG + ' No download buttons on page.');
          return [];
        }
        console.log(PLUGIN_TAG + ' ' + buttons.length + ' download button(s) found.');

        // ── Fetch all mvlink pages in parallel ──────────────────────────────
        var mvPromises = buttons.map(function (btn) {
          return fetchTextWithFinalUrl(btn.link).then(function (result) {
            return {
              html     : result.html,
              finalUrl : result.finalUrl,
              info     : btn.info,
              heading  : btn.heading,
            };
          });
        });

        return Promise.all(mvPromises).then(function (mvResults) {

          // ── Collect episodes / links to resolve ────────────────────────────
          var toResolve = [];

          mvResults.forEach(function (mv) {
            if (!mv.html) return;
            var episodes = parseEpisodes(mv.html);

            episodes.forEach(function (ep) {
              if (isSeries && season && episode) {
                var epStr = 'Episode ' + String(episode).padStart(2, '0');
                if (ep.title.indexOf(epStr) === -1) return;
              }
              toResolve.push({ ep: ep, info: mv.info, heading: mv.heading });
            });
          });

          if (!toResolve.length) {
            console.log(PLUGIN_TAG + ' No matching links to resolve.');
            return [];
          }
          console.log(PLUGIN_TAG + ' Resolving ' + toResolve.length + ' link(s) in parallel…');

          // ── Resolve all server chains in parallel ──────────────────────────
          var resolvePromises = toResolve.map(function (item) {
            return resolveServerChain(item.ep.link).then(function (servers) {
              return { ep: item.ep, info: item.info, heading: item.heading, servers: servers };
            });
          });

          return Promise.all(resolvePromises).then(function (resolved) {
            var streams = [];

            resolved.forEach(function (res) {
              var info      = res.info;
              var infoLabel = buildInfoLabel(info);

              Object.keys(res.servers).forEach(function (serverName) {
                var url = res.servers[serverName];
                if (!url) return;

                // ── Stream name (shown in picker) ────────────────────────────
                // e.g. "🎬 HindMoviez | Server 1 | 1080p · Web-DL · Hindi + English · 2.3GB"
                var streamName = '🎬 HindMoviez | ' + serverName + ' | ' + infoLabel;

                // ── Stream title (subtitle lines below name) ──────────────────
                var titleLines = [];
                if (info.quality)            titleLines.push('📺 ' + info.quality + (info.is10bit ? ' 10bit' : ''));
                if (info.source)             titleLines.push('🎞 ' + info.source);
                if (info.languages.length)   titleLines.push('🔊 ' + info.languages.join(' + '));
                if (info.size)               titleLines.push('💾 ' + info.size);
                titleLines.push('by Sanchit · @S4NCHITT · Murph\'s Streams');

                streams.push({
                  name  : streamName,
                  title : titleLines.join('\n'),
                  url   : url,
                  quality: info.quality || undefined,
                  behaviorHints: {
                    bingeGroup : 'hindmoviez-' + serverName.replace(/\s+/g, '-').toLowerCase(),
                  },
                });
              });
            });

            console.log(PLUGIN_TAG + ' Done — ' + streams.length + ' stream(s) ready.');
            return streams;
          });
        });
      });
    });
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
