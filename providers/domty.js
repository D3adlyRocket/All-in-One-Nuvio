console.log('[DOMTY] Provider loaded');

const DOMTY_SITES = [
  'https://mycima.cc',
  'https://wecima.movie',
  'https://akwam.to'
];

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
  'Accept': '*/*',
  'Connection': 'keep-alive'
};

function request(url, headers) {
  return fetch(url, {
    headers: Object.assign({}, HEADERS, headers || {})
  }).then(function (res) {
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.text();
  });
}

function extractSources(html) {
  const sources = [];
  const re = /(https?:\/\/[^"' ]+\.(m3u8|mp4)[^"' ]*)/gi;
  let m;

  while ((m = re.exec(html)) !== null) {
    if (sources.indexOf(m[1]) === -1) {
      sources.push(m[1]);
    }
  }

  return sources;
}

function extractIframes(html) {
  const frames = [];
  const re = /<iframe[^>]+src=["']([^"']+)["']/gi;
  let m;

  while ((m = re.exec(html)) !== null) {
    if (m[1].indexOf('http') === 0) frames.push(m[1]);
  }

  return frames;
}

function searchSite(base, query) {
  const url = base + '/?s=' + encodeURIComponent(query);

  return request(url, { Referer: base }).then(function (html) {
    const results = [];
    const re = /<a[^>]+href=["'](https?:\/\/[^"']+)["']/gi;
    let m;

    while ((m = re.exec(html)) !== null) {
      if (m[1].indexOf(base) !== -1) {
        results.push(m[1]);
      }
    }

    return results.slice(0, 3);
  }).catch(function () {
    return [];
  });
}

function getPageStreams(url) {
  return request(url).then(function (html) {

    let streams = extractSources(html);
    if (streams.length) return streams;

    const iframes = extractIframes(html);

    return Promise.all(
      iframes.slice(0, 3).map(function (frame) {
        return request(frame, { Referer: url })
          .then(function (inner) {
            return extractSources(inner);
          })
          .catch(function () {
            return [];
          });
      })
    ).then(function (lists) {
      return lists.reduce(function (a, b) {
        return a.concat(b);
      }, streams);
    });
  }).catch(function () {
    return [];
  });
}

function getTMDB(tmdbId, mediaType) {
  const url =
    'https://api.themoviedb.org/3/' +
    (mediaType === 'tv' ? 'tv/' : 'movie/') +
    tmdbId;

  return request(url).then(function (html) {
    try {
      const json = JSON.parse(html);
      return json.title || json.name || tmdbId;
    } catch {
      return tmdbId;
    }
  });
}

function getStreams(tmdbId, mediaType, season, episode) {

  console.log('[DOMTY] Fetching streams for', tmdbId);

  return getTMDB(tmdbId, mediaType).then(function (title) {

    console.log('[DOMTY] Title:', title);

    const tasks = DOMTY_SITES.map(function (site) {

      return searchSite(site, title).then(function (results) {

        if (!results.length) return [];

        return getPageStreams(results[0]).then(function (links) {

          return links.map(function (l) {
            return {
              name: 'DOMTY',
              url: l,
              quality: 'HD',
              headers: { Referer: results[0] }
            };
          });
        });
      });
    });

    return Promise.all(tasks).then(function (all) {

      const flat = all.reduce(function (a, b) {
        return a.concat(b);
      }, []);

      const seen = {};
      return flat.filter(function (s) {
        if (seen[s.url]) return false;
        seen[s.url] = true;
        return true;
      });
    });
  });
}

module.exports = { getStreams };
