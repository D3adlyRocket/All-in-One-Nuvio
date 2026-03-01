const cheerio = require('cheerio-without-node-native');

// Constants
const BASE_URL = 'https://4khdhub.fans';
const TMDB_API_KEY = '439c478a771f35c05022f9feabcca01c';

// Polyfills & Helpers
// -----------------------------------------------------------------------------

// atob Polyfill
const atob = (input) => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
  let str = String(input).replace(/=+$/, '');
  if (str.length % 4 === 1) throw new Error("'atob' failed: The string to be decoded is not correctly encoded.");
  let output = '';
  for (
    let bc = 0, bs, buffer, i = 0;
    (buffer = str.charAt(i++));
    ~buffer && ((bs = bc % 4 ? bs * 64 + buffer : buffer), bc++ % 4)
      ? (output += String.fromCharCode(255 & (bs >> ((-2 * bc) & 6))))
      : 0
  ) {
    buffer = chars.indexOf(buffer);
  }
  return output;
};

// Rot13 Cipher
const rot13Cipher = (str) => {
  return str.replace(/[a-zA-Z]/g, function (c) {
    return String.fromCharCode((c <= 'Z' ? 90 : 122) >= (c = c.charCodeAt(0) + 13) ? c : c - 26);
  });
};

// Levenshtein Distance
const levenshtein = {
  get: function (s, t) {
    if (s === t) {
      return 0;
    }
    var n = s.length, m = t.length;
    if (n === 0) {
      return m;
    }
    if (m === 0) {
      return n;
    }
    var d = [];
    for (var i = 0; i <= n; i++) {
      d[i] = [];
      d[i][0] = i;
    }
    for (var j = 0; j <= m; j++) {
      d[0][j] = j;
    }
    for (var i = 1; i <= n; i++) {
      for (var j = 1; j <= m; j++) {
        var cost = (s.charAt(i - 1) === t.charAt(j - 1)) ? 0 : 1;
        d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      }
    }
    return d[n][m];
  }
};

// Bytes Parser/Formatter
const bytes = {
  parse: function (val) {
    if (typeof val === 'number') return val;
    if (!val) return 0;
    var match = val.match(/^([0-9.]+)\s*([a-zA-Z]+)$/);
    if (!match) return 0;
    var num = parseFloat(match[1]);
    var unit = match[2].toLowerCase();
    var multiplier = 1;
    if (unit.indexOf('k') === 0) multiplier = 1024;
    else if (unit.indexOf('m') === 0) multiplier = 1024 * 1024;
    else if (unit.indexOf('g') === 0) multiplier = 1024 * 1024 * 1024;
    else if (unit.indexOf('t') === 0) multiplier = 1024 * 1024 * 1024 * 1024;
    return num * multiplier;
  },
  format: function (val) {
    if (val === 0) return '0 B';
    var k = 1024;
    var sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    var i = Math.floor(Math.log(val) / Math.log(k));
    if (i < 0) i = 0;
    return parseFloat((val / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
};

// Fetch Helper
function fetchText(url, options) {
  options = options || {};
  return fetch(url, {
    headers: Object.assign({
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    }, options.headers || {})
  })
    .then(function (res) {
      return res.text();
    })
    .catch(function (err) {
      console.log('[4KHDHub] Request failed for ' + url + ': ' + err.message);
      return null;
    });
}

// -----------------------------------------------------------------------------
// Core Logic
// -----------------------------------------------------------------------------

function getTmdbDetails(tmdbId, type) {
  var isSeries = type === 'series' || type === 'tv';
  var url = 'https://api.themoviedb.org/3/' + (isSeries ? 'tv' : 'movie') + '/' + tmdbId + '?api_key=' + TMDB_API_KEY;
  console.log('[4KHDHub] Fetching TMDB details from: ' + url);
  return fetch(url)
    .then(function (res) { return res.json(); })
    .then(function (data) {
      if (isSeries) {
        return {
          title: data.name,
          year: data.first_air_date ? parseInt(data.first_air_date.split('-')[0]) : 0
        };
      } else {
        return {
          title: data.title,
          year: data.release_date ? parseInt(data.release_date.split('-')[0]) : 0
        };
      }
    })
    .catch(function (error) {
      console.log('[4KHDHub] TMDB request failed: ' + error.message);
      return null;
    });
}

function fetchPageUrl(name, year, isSeries) {
  var searchUrl = BASE_URL + '/?s=' + encodeURIComponent(name + ' ' + year);
  return fetchText(searchUrl).then(function (html) {
    if (!html) return null;
    var $ = cheerio.load(html);
    var targetType = isSeries ? 'Series' : 'Movies';

    var matchingCards = $('.movie-card')
      .filter(function (_i, el) {
        var hasFormat = $(el).find('.movie-card-format:contains("' + targetType + '")').length > 0;
        return hasFormat;
      })
      .filter(function (_i, el) {
        var metaText = $(el).find('.movie-card-meta').text();
        var movieCardYear = parseInt(metaText);
        return !isNaN(movieCardYear) && Math.abs(movieCardYear - year) <= 1;
      })
      .filter(function (_i, el) {
        var movieCardTitle = $(el).find('.movie-card-title')
          .text()
          .replace(/\[.*?]/g, '')
          .trim();
        return levenshtein.get(movieCardTitle.toLowerCase(), name.toLowerCase()) < 5;
      })
      .map(function (_i, el) {
        var href = $(el).attr('href');
        if (href && href.indexOf('http') !== 0) {
          href = BASE_URL + (href.indexOf('/') === 0 ? '' : '/') + href;
        }
        return href;
      })
      .get();

    return matchingCards.length > 0 ? matchingCards[0] : null;
  });
}

function resolveRedirectUrl(redirectUrl) {
  return fetchText(redirectUrl).then(function (redirectHtml) {
    if (!redirectHtml) return null;

    try {
      var redirectDataMatch = redirectHtml.match(/'o','(.*?)'/);
      if (!redirectDataMatch) return null;

      var step1 = atob(redirectDataMatch[1]);
      var step2 = atob(step1);
      var step3 = rot13Cipher(step2);
      var step4 = atob(step3);
      var redirectData = JSON.parse(step4);

      if (redirectData && redirectData.o) {
        return atob(redirectData.o);
      }
    } catch (e) {
      console.log('[4KHDHub] Error resolving redirect: ' + e.message);
    }
    return null;
  });
}

function extractSourceResults($, el) {
  // This function returns a Promise resolving to { url, meta } or null
  var localHtml = $(el).html();
  var sizeMatch = localHtml.match(/([\d.]+ ?[GM]B)/);
  var heightMatch = localHtml.match(/\d{3,}p/);

  var title = $(el).find('.file-title, .episode-file-title').text().trim();

  if (!heightMatch) {
    heightMatch = title.match(/(\d{3,4})p/i);
  }

  var height = heightMatch ? parseInt(heightMatch[0]) : 0;
  if (height === 0 && (title.indexOf('4K') !== -1 || title.indexOf('4k') !== -1 || localHtml.indexOf('4K') !== -1 || localHtml.indexOf('4k') !== -1)) {
    height = 2160;
  }

  var meta = {
    bytes: sizeMatch ? bytes.parse(sizeMatch[1]) : 0,
    height: height,
    title: title
  };

  var hubCloudLink = $(el).find('a')
    .filter(function (_i, a) { return $(a).text().indexOf('HubCloud') !== -1; })
    .attr('href');

  if (hubCloudLink) {
    return resolveRedirectUrl(hubCloudLink).then(function (resolved) {
      return { url: resolved, meta: meta };
    });
  }

  var hubDriveLink = $(el).find('a')
    .filter(function (_i, a) { return $(a).text().indexOf('HubDrive') !== -1; })
    .attr('href');

  if (hubDriveLink) {
    return resolveRedirectUrl(hubDriveLink).then(function (resolvedDrive) {
      if (resolvedDrive) {
        return fetchText(resolvedDrive).then(function (hubDriveHtml) {
          if (hubDriveHtml) {
            var $2 = cheerio.load(hubDriveHtml);
            var innerCloudLink = $2('a:contains("HubCloud")').attr('href');
            if (innerCloudLink) {
              return { url: innerCloudLink, meta: meta };
            }
          }
          return null;
        });
      }
      return null;
    });
  }

  return Promise.resolve(null);
}

function extractHubCloud(hubCloudUrl, baseMeta) {
  if (!hubCloudUrl) return Promise.resolve([]);

  // Referer: hubCloudUrl
  return fetchText(hubCloudUrl, { headers: { Referer: hubCloudUrl } }).then(function (redirectHtml) {
    if (!redirectHtml) return [];

    var redirectUrlMatch = redirectHtml.match(/var url ?= ?'(.*?)'/);
    if (!redirectUrlMatch) return [];

    var finalLinksUrl = redirectUrlMatch[1];
    return fetchText(finalLinksUrl, { headers: { Referer: hubCloudUrl } }).then(function (linksHtml) {
      if (!linksHtml) return [];

      var $ = cheerio.load(linksHtml);
      var results = [];
      var sizeText = $('#size').text();
      var titleText = $('title').text().trim();

      var currentMeta = Object.assign({}, baseMeta, {
        bytes: bytes.parse(sizeText) || baseMeta.bytes,
        title: titleText || baseMeta.title
      });

      $('a').each(function (_i, el) {
        var text = $(el).text();
        var href = $(el).attr('href');
        if (!href) return;

        if (text.indexOf('FSL') !== -1 || text.indexOf('Download File') !== -1) {
          results.push({
            source: 'FSL',
            url: href,
            meta: currentMeta
          });
        }
        else if (text.indexOf('PixelServer') !== -1) {
          var pixelUrl = href.replace('/u/', '/api/file/');
          results.push({
            source: 'PixelServer',
            url: pixelUrl,
            meta: currentMeta
          });
        }
      });
      return results;
    });
  });
}

function getStreams(tmdbId, type, season, episode) {
  return getTmdbDetails(tmdbId, type).then(function (tmdbDetails) {
    if (!tmdbDetails) return [];

    var title = tmdbDetails.title;
    var year = tmdbDetails.year;
    console.log('[4KHDHub] Search: ' + title + ' (' + year + ')');

    var isSeries = type === 'series' || type === 'tv';
    return fetchPageUrl(title, year, isSeries).then(function (pageUrl) {
      if (!pageUrl) {
        console.log('[4KHDHub] Page not found');
        return [];
      }
      console.log('[4KHDHub] Found page: ' + pageUrl);

      return fetchText(pageUrl).then(function (html) {
        if (!html) return [];
        var $ = cheerio.load(html);

        var itemsToProcess = [];

        if (isSeries && season && episode) {
          // Find specific season and episode
          var seasonStr = 'S' + String(season).padStart(2, '0');
          var episodeStr = 'Episode-' + String(episode).padStart(2, '0');

          $('.episode-item').each(function (_i, el) {
            if ($('.episode-title', el).text().indexOf(seasonStr) !== -1) {
              var downloadItems = $('.episode-download-item', el)
                .filter(function (_j, item) { return $(item).text().indexOf(episodeStr) !== -1; });

              downloadItems.each(function (_k, item) {
                itemsToProcess.push(item);
              });
            }
          });
        } else {
          // Movies
          $('.download-item').each(function (_i, el) {
            itemsToProcess.push(el);
          });
        }

        console.log('[4KHDHub] Processing ' + itemsToProcess.length + ' items');

        var streamPromises = itemsToProcess.map(function (item) {
          return extractSourceResults($, item)
            .then(function (sourceResult) {
              if (sourceResult && sourceResult.url) {
                console.log('[4KHDHub] Extracting from HubCloud: ' + sourceResult.url);
                return extractHubCloud(sourceResult.url, sourceResult.meta).then(function (extractedLinks) {
                  return extractedLinks.map(function (link) {
                    return {
                      name: '4KHDHub - ' + link.source + (sourceResult.meta.height ? ' ' + sourceResult.meta.height + 'p' : ''),
                      title: link.meta.title + '\n' + bytes.format(link.meta.bytes || 0),
                      url: link.url,
                      quality: sourceResult.meta.height ? sourceResult.meta.height + 'p' : undefined,
                      behaviorHints: {
                        bingeGroup: '4khdhub-' + link.source
                      }
                    };
                  });
                });
              }
              return [];
            })
            .catch(function (err) {
              console.log('[4KHDHub] Item processing error: ' + err.message);
              return [];
            });
        });

        return Promise.all(streamPromises).then(function (results) {
          // Flatten results
          return results.reduce(function (acc, val) { return acc.concat(val); }, []);
        });
      });
    });
  });
}

// Export for React Native compatibility
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { getStreams };
} else {
  global.getStreams = getStreams;
}
