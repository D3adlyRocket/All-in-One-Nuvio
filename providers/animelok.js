// Pelisplushd provider for Nuvio
// Source flow based on embed69 extraction used in CloudStream extension.

const TMDB_API_BASE = 'https://api.themoviedb.org/3';
const TMDB_API_KEY = '1865f43a0549ca50d341dd9ab8b29f49';
const BASE_URL = 'https://pelisplushd.la';

const DEFAULT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Referer': BASE_URL + '/'
};

function capitalize(value) {
  if (!value) return 'Unknown';
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

function getTmdbTitleYear(tmdbId, mediaType) {
  const endpoint = mediaType === 'tv' ? 'tv' : 'movie';
  const url = `${TMDB_API_BASE}/${endpoint}/${tmdbId}?api_key=${TMDB_API_KEY}&language=es-ES`;

  return fetch(url)
    .then(function (res) {
      return res.ok ? res.json() : null;
    })
    .then(function (json) {
      if (!json) return { title: String(tmdbId), year: null };
      const title = endpoint === 'tv' ? (json.name || String(tmdbId)) : (json.title || String(tmdbId));
      const date = endpoint === 'tv' ? json.first_air_date : json.release_date;
      const year = date && typeof date === 'string' ? date.split('-')[0] : null;
      return { title: title, year: year };
    })
    .catch(function () {
      return { title: String(tmdbId), year: null };
    });
}

function getImdbId(tmdbId, mediaType) {
  const endpoint = mediaType === 'tv' ? 'tv' : 'movie';
  const url = `${TMDB_API_BASE}/${endpoint}/${tmdbId}/external_ids?api_key=${TMDB_API_KEY}`;

  return fetch(url)
    .then(function (res) {
      return res.ok ? res.json() : null;
    })
    .then(function (json) {
      return json && json.imdb_id ? json.imdb_id : null;
    })
    .catch(function () {
      return null;
    });
}

function buildEmbedUrl(imdbId, mediaType, seasonNum, episodeNum) {
  if (mediaType === 'tv' && seasonNum != null && episodeNum != null) {
    const ep = String(episodeNum).padStart(2, '0');
    return `${BASE_URL}/f/${imdbId}-${seasonNum}x${ep}`;
  }
  return `${BASE_URL}/f/${imdbId}`;
}

function extractDataLinkJson(html) {
  if (!html) return null;

  // dataLink = [...];
  const match = html.match(/dataLink\s*=\s*(\[[\s\S]*?\]);/);
  if (!match || !match[1]) return null;

  try {
    return JSON.parse(match[1]);
  } catch (_) {
    return null;
  }
}

function decryptLinks(encryptedLinks) {
  if (!encryptedLinks || encryptedLinks.length === 0) return Promise.resolve([]);

  return fetch(`${BASE_URL}/api/decrypt`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': DEFAULT_HEADERS['User-Agent'],
      'Referer': DEFAULT_HEADERS['Referer']
    },
    body: JSON.stringify({ links: encryptedLinks })
  })
    .then(function (res) {
      return res.ok ? res.json() : null;
    })
    .then(function (json) {
      if (!json || !json.success || !Array.isArray(json.links)) return [];
      return json.links.map(function (item) {
        return item && item.link ? item.link : null;
      }).filter(Boolean);
    })
    .catch(function () {
      return [];
    });
}

function unpackPackerScript(script) {
  if (!script || script.indexOf('eval(function(p,a,c,k,e,d)') === -1) return null;

  // Convert `eval(function(...)... )` into `function(...)...` call and execute.
  // The Dean Edwards packer function returns the unpacked source as a string.
  try {
    const start = script.indexOf('eval(');
    const end = script.lastIndexOf(')');
    if (start === -1 || end === -1 || end <= start + 5) return null;

    const innerExpression = script.substring(start + 5, end);
    const unpacked = Function('return (' + innerExpression + ');')();
    return typeof unpacked === 'string' ? unpacked : null;
  } catch (_) {
    return null;
  }
}

function absolutizeUrl(url, base) {
  if (!url) return null;
  if (url.indexOf('http://') === 0 || url.indexOf('https://') === 0) return url;
  if (url.indexOf('//') === 0) return 'https:' + url;

  try {
    return new URL(url, base).toString();
  } catch (_) {
    return null;
  }
}

function extractPlayableUrlsFromText(text, baseUrl) {
  if (!text) return [];
  const found = [];

  const directPattern = /(https?:\/\/[^'"\s]+(?:\.m3u8|\.mp4|\.mkv|\.webm|\.mpd)[^'"\s]*)/gi;
  const relativePattern = /(["']\/?[^"']+(?:\.m3u8|\.mp4|\.mkv|\.webm|\.mpd)[^"']*["'])/gi;

  let match;
  while ((match = directPattern.exec(text)) !== null) {
    if (match[1]) found.push(match[1]);
  }

  while ((match = relativePattern.exec(text)) !== null) {
    const raw = match[1].replace(/^['"]|['"]$/g, '');
    const abs = absolutizeUrl(raw, baseUrl);
    if (abs) found.push(abs);
  }

  const unique = [];
  const seen = new Set();
  found.forEach(function (u) {
    const clean = (u || '').replace(/\\\//g, '/');
    if (!clean) return;
    if (seen.has(clean)) return;
    seen.add(clean);
    unique.push(clean);
  });

  return unique;
}

function resolveEmbedPageUrls(embedUrl) {
  if (!embedUrl) return Promise.resolve([]);

  return fetch(embedUrl, {
    headers: {
      'User-Agent': DEFAULT_HEADERS['User-Agent'],
      'Referer': BASE_URL + '/'
    }
  })
    .then(function (res) {
      return res.ok ? res.text() : null;
    })
    .then(function (html) {
      if (!html) return [];

      const directUrls = extractPlayableUrlsFromText(html, embedUrl);
      if (directUrls.length > 0) return directUrls;

      // Some hosts pack the player script with Dean Edwards packer.
      const packedScripts = [];
      const scriptBlockRegex = /<script[^>]*>([\s\S]*?)<\/script>/gi;
      let scriptMatch;
      while ((scriptMatch = scriptBlockRegex.exec(html)) !== null) {
        const code = scriptMatch[1] || '';
        if (code.indexOf('eval(function(p,a,c,k,e,d)') !== -1) {
          packedScripts.push(code);
        }
      }
      let unpackedUrls = [];

      packedScripts.forEach(function (script) {
        const unpacked = unpackPackerScript(script);
        if (!unpacked) return;
        unpackedUrls = unpackedUrls.concat(extractPlayableUrlsFromText(unpacked, embedUrl));
      });

      if (unpackedUrls.length > 0) return unpackedUrls;

      return [];
    })
    .catch(function () {
      return [];
    });
}

function detectType(url) {
  if (!url) return null;
  const value = url.toLowerCase();
  if (value.indexOf('.m3u8') !== -1) return 'hls';
  if (value.indexOf('.mpd') !== -1) return 'dash';
  if (value.indexOf('.mp4') !== -1 || value.indexOf('.mkv') !== -1 || value.indexOf('.webm') !== -1) return 'direct';
  return null;
}

function isLikelyVideoUrl(url) {
  if (!url || typeof url !== 'string') return false;
  const value = url.toLowerCase();
  return (
    value.startsWith('http://') ||
    value.startsWith('https://')
  ) && (
    value.indexOf('.m3u8') !== -1 ||
    value.indexOf('.mp4') !== -1 ||
    value.indexOf('.mkv') !== -1 ||
    value.indexOf('.webm') !== -1 ||
    value.indexOf('.mpd') !== -1 ||
    value.indexOf('/playlist') !== -1 ||
    value.indexOf('manifest') !== -1
  );
}

function validateVideoCandidate(url) {
  if (!url || typeof url !== 'string') return Promise.resolve(null);

  // Fast-path for explicit media extensions.
  if (isLikelyVideoUrl(url)) {
    return Promise.resolve({ url: url, type: detectType(url) || 'direct' });
  }

  // Fallback: probe the URL and accept only if content-type indicates media.
  return fetch(url, {
    method: 'GET',
    headers: {
      'Range': 'bytes=0-1',
      'User-Agent': DEFAULT_HEADERS['User-Agent'],
      'Referer': DEFAULT_HEADERS['Referer']
    }
  })
    .then(function (res) {
      if (!res || !res.ok) return null;
      const contentType = (res.headers.get('content-type') || '').toLowerCase();
      const finalUrl = res.url || url;

      if (
        contentType.indexOf('video/') !== -1 ||
        contentType.indexOf('application/vnd.apple.mpegurl') !== -1 ||
        contentType.indexOf('application/x-mpegurl') !== -1 ||
        contentType.indexOf('application/dash+xml') !== -1
      ) {
        return {
          url: finalUrl,
          type: detectType(finalUrl) || (contentType.indexOf('mpegurl') !== -1 ? 'hls' : 'direct')
        };
      }

      return null;
    })
    .catch(function () {
      return null;
    });
}

function getStreams(tmdbId, mediaType, seasonNum, episodeNum) {
  const effectiveType = mediaType === 'tv' ? 'tv' : 'movie';
  const season = seasonNum != null ? Number(seasonNum) : null;
  const episode = episodeNum != null ? Number(episodeNum) : null;

  console.log(`[Pelisplushd] Request: tmdb=${tmdbId}, type=${effectiveType}, season=${season}, episode=${episode}`);

  return Promise.all([
    getImdbId(tmdbId, effectiveType),
    getTmdbTitleYear(tmdbId, effectiveType)
  ]).then(function (results) {
    const imdbId = results[0];
    const info = results[1];

    if (!imdbId) {
      console.log('[Pelisplushd] No IMDB id found for TMDB:', tmdbId);
      return [];
    }

    const pageUrl = buildEmbedUrl(imdbId, effectiveType, season, episode);
    console.log('[Pelisplushd] Fetching page:', pageUrl);

    return fetch(pageUrl, { headers: DEFAULT_HEADERS })
      .then(function (res) {
        return res.ok ? res.text() : null;
      })
      .then(function (html) {
        const groups = extractDataLinkJson(html);
        if (!groups || !Array.isArray(groups) || groups.length === 0) {
          console.log('[Pelisplushd] dataLink not found');
          return [];
        }

        const decryptJobs = [];
        groups.forEach(function (group) {
          const language = group && group.video_language ? group.video_language : 'Unknown';
          const embeds = group && Array.isArray(group.sortedEmbeds) ? group.sortedEmbeds : [];
          const encryptedLinks = embeds
            .map(function (x) { return x && x.link ? x.link : null; })
            .filter(Boolean);

          if (encryptedLinks.length > 0) {
            decryptJobs.push(
              decryptLinks(encryptedLinks).then(function (urls) {
                return { language: language, urls: urls };
              })
            );
          }
        });

        if (decryptJobs.length === 0) return [];

        return Promise.all(decryptJobs)
          .then(function (languageSets) {
            const candidates = [];
            languageSets.forEach(function (set) {
              const lang = capitalize(set.language);
              (set.urls || []).forEach(function (url) {
                candidates.push({ language: lang, url: url });
              });
            });

            return Promise.all(candidates.map(function (c) {
              return resolveEmbedPageUrls(c.url)
                .then(function (resolvedUrls) {
                  if (!resolvedUrls || resolvedUrls.length === 0) {
                    return [c.url];
                  }
                  return resolvedUrls;
                })
                .then(function (urls) {
                  return Promise.all(urls.map(function (url) {
                    return validateVideoCandidate(url).then(function (validated) {
                      if (!validated) return null;
                      return {
                        language: c.language,
                        url: validated.url,
                        type: validated.type
                      };
                    });
                  }));
                })
                .then(function (items) {
                  return items.filter(Boolean);
                });
            })).then(function (nested) {
              return nested.reduce(function (acc, item) {
                return acc.concat(item || []);
              }, []);
            });
          })
          .then(function (validatedList) {
            const uniq = new Set();
            const streams = [];

            validatedList.filter(Boolean).forEach(function (item) {
              const key = `${item.language}|${item.url}`;
              if (uniq.has(key)) return;
              uniq.add(key);

              const title = (effectiveType === 'tv' && season != null && episode != null)
                ? `${info.title} S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}`
                : (info.year ? `${info.title} (${info.year})` : info.title);

              streams.push({
                name: `Pelisplushd ${item.language}`,
                title: title,
                url: item.url,
                quality: item.type === 'hls' ? 'Adaptive' : '1080p',
                type: item.type === 'hls' ? 'hls' : 'direct',
                headers: {
                  'User-Agent': DEFAULT_HEADERS['User-Agent'],
                  'Referer': BASE_URL + '/'
                },
                provider: 'peliplushd'
              });
            });

            console.log(`[Pelisplushd] Valid streams: ${streams.length}`);
            return streams;
          });
      });
  }).catch(function (error) {
    console.error('[Pelisplushd] Error:', error && error.message ? error.message : String(error));
    return [];
  });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { getStreams };
} else {
  global.PelisplushdScraperModule = { getStreams };
}
