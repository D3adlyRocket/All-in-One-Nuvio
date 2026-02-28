/**
 * fshd - Built from src/fshd/
 * Generated: 2026-01-11T20:02:01.388Z
 */
var window = typeof globalThis !== 'undefined' ? globalThis : typeof global !== 'undefined' ? global : typeof self !== 'undefined' ? self : {};
var self = window;


// src/fshd/http.js
var BASE_URL = "https://fshd.link";
var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
var HEADERS = {
  "User-Agent": USER_AGENT,
  "Accept": "application/json, text/javascript, */*; q=0.01",
  "X-Requested-With": "XMLHttpRequest",
  "Origin": BASE_URL,
  "Referer": BASE_URL + "/"
};
function request(url, options) {
  var opts = options || {};
  var headers = Object.assign({}, HEADERS, opts.headers || {});
  var method = opts.method || "GET";
  var body = opts.body || null;
  if (method === "POST" && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/x-www-form-urlencoded; charset=UTF-8";
  }
  return new Promise(function(resolve, reject) {
    fetch(url, {
      method,
      headers,
      body
    }).then(function(res) {
      if (!res.ok) {
        reject(new Error("HTTP " + res.status + ": " + url));
      } else {
        resolve(res);
      }
    }).catch(function(err) {
      reject(err);
    });
  });
}

// src/fshd/packer.js
function unpack(packed) {
  try {
    var pParams = /}\s*\(\s*'([^']*)'\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*'([^']*)'\s*\.split/.exec(packed);
    if (!pParams) return null;
    var p = pParams[1];
    var a = parseInt(pParams[2]);
    var c = parseInt(pParams[3]);
    var k = pParams[4].split("|");
    var e = function(c2) {
      return (c2 < a ? "" : e(parseInt(c2 / a))) + ((c2 = c2 % a) > 35 ? String.fromCharCode(c2 + 29) : c2.toString(36));
    };
    var d = {};
    for (var i = 0; i < c; i++) {
      var key = k[i] || e(i);
      d[e(i)] = k[i] || e(i);
    }
    var unpacked = p.replace(/\b\w+\b/g, function(w) {
      return d[w] || w;
    });
    return unpacked;
  } catch (err) {
    return null;
  }
}

// src/fshd/extractor.js
function extractInternalPlayer(finalUrl, referer) {
  const browserHeaders = {
    "Accept": "*/*",
    "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
    "DNT": "1",
    "Priority": "u=1, i",
    "Referer": finalUrl,
    "Sec-CH-UA": '"Google Chrome";v="143", "Chromium";v="143", "Not A(Brand";v="24"',
    "Sec-CH-UA-Mobile": "?0",
    "Sec-CH-UA-Platform": '"Linux"',
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-origin",
    "Sec-GPC": "1",
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36"
  };
  return request(finalUrl, { headers: browserHeaders }).then((res) => res.text()).then((html) => {
    var baseUrlMatch = html.match(/var player_base_url\s*=\s*"([^"]+)"/);
    var baseUrl = baseUrlMatch ? baseUrlMatch[1] : "https://112234152.xyz";
    var packedMatch = html.match(/eval\s*\((function\(p,a,c,k,e,d\).+?)\)\s*;?\s*<\/script>/);
    if (!packedMatch) return [];
    var unpacked = unpack("eval(" + packedMatch[1] + ")");
    var m3u8Match = unpacked.match(/["']([^"']+\.txt[^"']*)["']/) || unpacked.match(/videoUrl\s*[:=]\s*["'](.*?)["']/);
    if (!m3u8Match) return [];
    var cleanPath = m3u8Match[1].replace(/\\/g, "");
    var masterUrl = cleanPath.indexOf("http") === 0 ? cleanPath : baseUrl.replace(/\/$/, "") + "/" + cleanPath.replace(/^\//, "");
    return [{
      url: masterUrl,
      quality: 1080,
      type: "hls",
      headers: browserHeaders
    }];
  });
}

// src/fshd/logic.js
var OPTIONS_API = "https://fshd.link/api/options";
var PLAYER_API = "https://fshd.link/api/players";
var AJAX_HEADERS = {
  "X-Requested-With": "XMLHttpRequest",
  "Accept": "application/json",
  "Content-Type": "application/json"
};
function getStreamsFSHD(tmdbId, season, episode) {
  var url = "https://fshd.link/serie/" + tmdbId + "/" + season + "/" + episode;
  console.log("Acessando p\xE1gina para capturar Content ID interno");
  return request(url).then(function(res) {
    return res.text();
  }).then(function(html) {
    var seasonRegex = new RegExp('class="episodeSelector[^"]*"\\s+data-season="' + season + '"[\\s\\S]*?<div[^>]*?data-contentid="(\\d+)"', "i");
    var activeMatch = html.match(/class="episodeOption active" data-contentid="(\d+)"/);
    var contentId = activeMatch ? activeMatch[1] : null;
    if (!contentId) {
      var fallbackMatch = html.match(seasonRegex);
      contentId = fallbackMatch ? fallbackMatch[1] : null;
    }
    if (!contentId) throw new Error("N\xE3o foi poss\xEDvel encontrar o data-contentid no HTML.");
    console.log("Content ID encontrado:", contentId);
    return startApiFlow(contentId, url);
  });
}
function startApiFlow(contentId, referer) {
  console.log("API Options com ID:", contentId);
  return request(OPTIONS_API, {
    method: "POST",
    headers: Object.assign({}, AJAX_HEADERS, { "Referer": referer }),
    body: JSON.stringify({
      "content_id": parseInt(contentId),
      "content_type": "2"
    })
  }).then(function(res) {
    return res.text();
  }).then(function(text) {
    var serverIds = [];
    var regex = /["']ID["']\s*:\s*(\d+)/g;
    var match;
    while ((match = regex.exec(text)) !== null) {
      serverIds.push(match[1]);
    }
    if (serverIds.length === 0) return [];
    var promises = serverIds.map(function(videoId) {
      return request(PLAYER_API, {
        method: "POST",
        headers: Object.assign({}, AJAX_HEADERS, { "Referer": referer }),
        body: JSON.stringify({
          "content_info": parseInt(contentId),
          "content_type": "2",
          "video_id": parseInt(videoId)
        })
      }).then(function(res) {
        return res.text();
      }).then(function(playerJson) {
        var urlMatch = playerJson.match(/["']video_url["']\s*:\s*["'](.*?)["']/);
        var playerUrl = urlMatch ? urlMatch[1].replace(/\\/g, "") : null;
        if (!playerUrl) return null;
        return request(playerUrl, { headers: { "Referer": referer } }).then(function(res) {
          return res.text();
        }).then(function(pageHtml) {
          var finalMatch = pageHtml.match(/window\.location\.href\s*=\s*"([^"]+)"/);
          var finalUrl = finalMatch ? finalMatch[1] : null;
          if (finalUrl) {
            return extractInternalPlayer(finalUrl, playerUrl);
          }
          return null;
        });
      });
    });
    return Promise.all(promises);
  }).then(function(results) {
    var flattened = [];
    results.forEach(function(r) {
      if (r) flattened = flattened.concat(r);
    });
    return flattened;
  });
}

// src/fshd/index.js
function getStreams(tmdbId, mediaType, seasonNum, episodeNum) {
  if (mediaType !== "tv") return Promise.resolve([]);
  return getStreamsFSHD(tmdbId, seasonNum, episodeNum).then(function(streams) {
    return streams.map(function(s) {
      var qualityLabel = (s.quality || "1080") + "p";
      return {
        name: "FSHD " + (s.lang || "Dublado") + " " + qualityLabel,
        title: "Servidor: Fsplay",
        url: s.url,
        quality: s.quality || 1080,
        group: s.lang || "Dublado",
        provider: "fshd",
        headers: s.headers
      };
    });
  }).then(function(results) {
    return results.sort(function(a, b) {
      return b.quality - a.quality;
    });
  });
}
if (typeof module !== "undefined" && module.exports) {
  module.exports = { getStreams };
} else {
  global.getStreams = getStreams;
}
