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
 * ║  Parallel   › All quality & episode links resolved concurrently              ║
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
 * Extract quality-labelled download buttons (mvlink.site links)
 * from a movie or series detail page.
 */
function parseDownloadButtons(html) {
  var $ = cheerio.load(html);
  var links = [];

  $('a[href*="mvlink.site"]').each(function (_i, el) {
    var href = $(el).attr('href');
    var text = $(el).text().trim();
    var ctx  = text;

    // Widen context to parent + previous sibling for quality detection
    var parent = $(el).parent();
    if (parent.length) {
      ctx += ' ' + parent.text();
      var prev = parent.prev();
      if (prev.length) ctx += ' ' + prev.text();
    }

    var match   = ctx.match(/(480p|720p|1080p|2160p|4K)/i);
    var quality = match ? match[1] : 'Unknown';

    links.push({ quality: quality, link: href, text: text });
  });

  return links;
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
  // Already landed on hshare after redirect
  if (finalUrl && finalUrl.indexOf('hshare.ink') !== -1) return finalUrl;

  var $ = cheerio.load(html);

  // "Get Links" button may point directly to hshare
  var btn = $('a').filter(function (_i, el) {
    return /Get Links/i.test($(el).text());
  }).first();

  if (btn.length) {
    var href = btn.attr('href') || '';
    if (href.indexOf('hshare.ink') !== -1) return href;
  }

  // Fallback — any anchor pointing to hshare
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

  // Fallback — links whose text reads "Server N"
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
 * Returns an empty object if any step in the chain fails.
 */
function resolveServerChain(mvlinkUrl) {
  // Step 1 — Follow mvlink (may redirect internally)
  return fetchTextWithFinalUrl(mvlinkUrl).then(function (result) {
    if (!result.html) return {};

    // Step 2 — Locate hshare.ink URL
    var hshareUrl = parseHshareUrl(result.html, result.finalUrl);
    if (!hshareUrl) {
      console.log(PLUGIN_TAG + ' hshare URL not found for: ' + mvlinkUrl);
      return {};
    }

    // Step 3 — Fetch hshare page, extract hcloud URL
    return fetchText(hshareUrl).then(function (hshareHtml) {
      if (!hshareHtml) return {};

      var hcloudUrl = parseHcloudUrl(hshareHtml);
      if (!hcloudUrl) {
        console.log(PLUGIN_TAG + ' hcloud URL not found for: ' + hshareUrl);
        return {};
      }

      // Step 4 — Fetch hcloud page, parse final server links
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
// Utility
// ─────────────────────────────────────────────────────────────────────────────

/** Convert a quality string (e.g. "1080p", "4K") to a pixel-height integer. */
function qualityToHeight(quality) {
  if (!quality) return 0;
  var q = quality.toLowerCase();
  if (q === '4k' || q === '2160p') return 2160;
  if (q === '1080p')               return 1080;
  if (q === '720p')                return 720;
  if (q === '480p')                return 480;
  return 0;
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

        var qualityButtons = parseDownloadButtons(pageHtml);
        if (!qualityButtons.length) {
          console.log(PLUGIN_TAG + ' No download buttons on page.');
          return [];
        }
        console.log(PLUGIN_TAG + ' ' + qualityButtons.length + ' quality option(s) found.');

        // ── Fetch all mvlink pages in parallel ──────────────────────────────
        var mvPromises = qualityButtons.map(function (qb) {
          return fetchTextWithFinalUrl(qb.link).then(function (result) {
            return { html: result.html, finalUrl: result.finalUrl, quality: qb.quality };
          });
        });

        return Promise.all(mvPromises).then(function (mvResults) {

          // ── Collect episodes / links to resolve ────────────────────────────
          var toResolve = [];

          mvResults.forEach(function (mv) {
            if (!mv.html) return;
            var episodes = parseEpisodes(mv.html);

            episodes.forEach(function (ep) {
              // For series: filter to the specifically requested episode
              if (isSeries && season && episode) {
                var epStr = 'Episode ' + String(episode).padStart(2, '0');
                if (ep.title.indexOf(epStr) === -1) return;
              }
              toResolve.push({ ep: ep, quality: mv.quality });
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
              return { ep: item.ep, quality: item.quality, servers: servers };
            });
          });

          return Promise.all(resolvePromises).then(function (resolved) {
            var streams = [];

            resolved.forEach(function (res) {
              var height = qualityToHeight(res.quality);

              Object.keys(res.servers).forEach(function (serverName) {
                var url = res.servers[serverName];
                if (!url) return;

                streams.push({
                  name  : '🎬 HindMoviez | ' + serverName + (height ? ' · ' + height + 'p' : ''),
                  title : res.ep.title + '\n' + res.quality + '\nby Sanchit · @S4NCHITT · Murph\'s Streams',
                  url   : url,
                  quality: height ? height + 'p' : res.quality,
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
