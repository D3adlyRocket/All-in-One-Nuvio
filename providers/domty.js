console.log("[DOMTY] Provider Loaded");

// ── Headers ─────────────────────────────────────────
var DEFAULT_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

// ── HTTP ────────────────────────────────────────────
function httpGet(url, extraHeaders) {
  var headers = Object.assign({}, DEFAULT_HEADERS, extraHeaders || {});

  return fetch(url, { headers: headers }).then(function (res) {
    if (!res.ok) throw new Error("HTTP " + res.status);
    return res.text();
  });
}

// ── Extract Links ───────────────────────────────────
function extractDirectSources(html) {
  var sources = [];

  var patterns = [
    /(https?:\/\/[^"' ]+\.m3u8[^"' ]*)/gi,
    /(https?:\/\/[^"' ]+\.mp4[^"' ]*)/gi,
    /source\s*:\s*["']([^"']+)["']/gi,
    /file\s*:\s*["']([^"']+)["']/gi,
    /src\s*:\s*["']([^"']+)["']/gi,
    /(https?:\/\/[^"' ]+\/hls\/[^"' ]+)/gi,
  ];

  patterns.forEach(function (re) {
    var m;

    while ((m = re.exec(html)) !== null) {
      var url = m[1] || m[0];

      url = url.replace(/\\\//g, "/");

      if (url.indexOf("//") === 0) url = "https:" + url;

      if (sources.indexOf(url) === -1) sources.push(url);
    }
  });

  return sources;
}

// ── Extract iframes ─────────────────────────────────
function extractIframes(html) {
  var iframes = [];

  var re = /<iframe[^>]+(?:src|data-src)=["']([^"']+)["']/gi;
  var m;

  while ((m = re.exec(html)) !== null) {
    var url = m[1];

    if (url.indexOf("//") === 0) url = "https:" + url;

    if (url.indexOf("http") === 0) iframes.push(url);
  }

  return iframes;
}

// ── Quality ─────────────────────────────────────────
function normalizeQuality(str) {
  if (!str) return "HD";
  if (/2160|4k/i.test(str)) return "4K";
  if (/1080/i.test(str)) return "1080p";
  if (/720/i.test(str)) return "720p";
  if (/480/i.test(str)) return "480p";
  return "HD";
}

// ── Stream Object ───────────────────────────────────
function makeStream(name, url, quality, referer) {
  return {
    name: name,
    title: quality,
    url: url,
    quality: quality,
    headers: {
      Referer: referer,
      Origin: referer,
      "User-Agent": DEFAULT_HEADERS["User-Agent"],
    },
  };
}

// ── Fetch Page Streams ──────────────────────────────
function fetchStreamsFromPage(name, pageUrl, base) {
  return httpGet(pageUrl, { Referer: base })
    .then(function (html) {
      var streams = [];

      extractDirectSources(html).forEach(function (u) {
        streams.push(makeStream(name, u, normalizeQuality(u), pageUrl));
      });

      if (streams.length) return streams;

      var iframes = extractIframes(html);

      return Promise.all(
        iframes.slice(0, 10).map(function (src) {
          return httpGet(src, { Referer: pageUrl })
            .then(function (iframeHtml) {
              return extractDirectSources(iframeHtml).map(function (u) {
                return makeStream(name, u, normalizeQuality(u), src);
              });
            })
            .catch(function () {
              return [];
            });
        })
      ).then(function (r) {
        return r.reduce(function (a, b) {
          return a.concat(b);
        }, streams);
      });
    })
    .catch(function () {
      return [];
    });
}

// ── Search Site ─────────────────────────────────────
function searchSite(name, base, query) {
  var url = base + "/?s=" + encodeURIComponent(query);

  return httpGet(url, { Referer: base })
    .then(function (html) {
      var items = [];
      var re = /<article[\s\S]*?<\/article>/gi;
      var m;

      while ((m = re.exec(html)) !== null) {
        var block = m[0];

        var titleM = block.match(/<h[12][^>]*>(.*?)<\/h[12]>/i);
        var linkM = block.match(/href=["'](https?:\/\/[^"']+)["']/i);

        if (titleM && linkM) {
          var title = titleM[1].replace(/<[^>]+>/g, "").trim();

          items.push({
            name: name,
            base: base,
            title: title,
            url: linkM[1],
          });
        }
      }

      return items;
    })
    .catch(function () {
      return [];
    });
}

// ── Sources ─────────────────────────────────────────
var SOURCES = [
  { id: "cimawbas", base: "https://cimawbas.org" },
  { id: "egybest", base: "https://egybest.la" },
  { id: "mycima", base: "https://mycima.horse" },
  { id: "fajer", base: "https://fajer.show" },
  { id: "aksv", base: "https://ak.sv" },
];

// ── Main ────────────────────────────────────────────
function getStreams(tmdbId, mediaType, season, episode) {
  console.log("[DOMTY] Searching for:", tmdbId);

  var query = tmdbId;

  var promises = SOURCES.map(function (source) {
    return searchSite(source.id, source.base, query)
      .then(function (results) {
        if (!results.length) return [];

        var target = results[0];

        return fetchStreamsFromPage(source.id, target.url, source.base);
      })
      .catch(function () {
        return [];
      });
  });

  return Promise.all(promises).then(function (results) {
    var all = results.reduce(function (a, b) {
      return a.concat(b);
    }, []);

    var seen = {};

    return all.filter(function (s) {
      if (seen[s.url]) return false;
      seen[s.url] = true;
      return true;
    });
  });
}

module.exports = { getStreams };
