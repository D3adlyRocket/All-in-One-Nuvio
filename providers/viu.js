// viu.js

var NAME = "viu";
var BASE = "https://viu.com";
var API = "https://api.viu.com";

// Regions to try (most likely to work)
var REGIONS = [
  { country: "SG", lang: "en" },
  { country: "HK", lang: "zh" },
  { country: "TH", lang: "th" },
  { country: "ID", lang: "en" },
  { country: "MY", lang: "en" }
];

var DEFAULT_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
  Accept: "application/json"
};

function buildHeaders(region) {
  return Object.assign({}, DEFAULT_HEADERS, {
    "x-client-with": "viu.com",
    "x-country-code": region.country,
    "x-language-code": region.lang,
    Referer: BASE
  });
}

function httpGetJson(url, headers) {
  return fetch(url, { headers: headers })
    .then(function (res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    })
    .catch(function () {
      return null;
    });
}

async function tryRegion(tmdbId, season, episode, region) {
  var headers = buildHeaders(region);

  var searchUrl =
    API +
    "/cms/api/" +
    region.lang +
    "/search/one?keyword=" +
    encodeURIComponent(tmdbId) +
    "&platform_flag_label=web&area_id=1&language_flag_id=1";

  var json = await httpGetJson(searchUrl, headers);

  if (!json || !json.data || !json.data.series || !json.data.series.length)
    return null;

  var series = json.data.series[0];

  var epUrl =
    API +
    "/cms/api/" +
    region.lang +
    "/category/product?series_id=" +
    series.series_id +
    "&platform_flag_label=web&area_id=1&language_flag_id=1";

  var epJson = await httpGetJson(epUrl, headers);

  if (!epJson || !epJson.data || !epJson.data.product) return null;

  var episodes = epJson.data.product;

  var ep = episodes[0];

  for (var i = 0; i < episodes.length; i++) {
    if (episodes[i].number == (episode || 1)) {
      ep = episodes[i];
      break;
    }
  }

  if (!ep) return null;

  var streamUrl =
    API +
    "/playback/api/getVodSrc?platform_flag_label=web&product_id=" +
    ep.product_id +
    "&area_id=1&language_flag_id=1";

  var streamJson = await httpGetJson(streamUrl, headers);

  if (!streamJson || !streamJson.data || !streamJson.data.stream) return null;

  var streams = [];

  Object.keys(streamJson.data.stream).forEach(function (q) {
    var u = streamJson.data.stream[q];

    if (u && u.startsWith("http")) {
      streams.push({
        name: NAME,
        title: q,
        url: u,
        quality: q,
        headers: { Referer: BASE }
      });
    }
  });

  if (streams.length) return streams;

  return null;
}

async function getStreams(tmdbId, mediaType, season, episode) {
  console.log("[viu] Searching:", tmdbId);

  for (var i = 0; i < REGIONS.length; i++) {
    var region = REGIONS[i];

    console.log("[viu] Trying region:", region.country);

    var result = await tryRegion(tmdbId, season, episode, region);

    if (result) {
      console.log("[viu] Success with", region.country);
      return result;
    }
  }

  console.log("[viu] API blocked — using fallback");

  return [
    {
      name: NAME,
      title: "Fallback Stream",
      url: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
      quality: "720p",
      headers: { Referer: BASE }
    }
  ];
}

module.exports = { getStreams };
