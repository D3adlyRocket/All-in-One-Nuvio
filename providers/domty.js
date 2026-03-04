var BASE = "https://cima4u.tv";

var DEFAULT_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
  "Accept-Language": "en-US,en;q=0.9",
  "Referer": BASE
};

function http(url, headers) {
  return fetch(url, {
    headers: Object.assign({}, DEFAULT_HEADERS, headers || {})
  }).then(r => r.text());
}

function extractStreams(html, referer) {
  var results = [];
  var re = /(https?:\/\/[^"' ]+\.(m3u8|mp4)[^"' ]*)/g;
  var m;

  while ((m = re.exec(html)) !== null) {
    results.push({
      name: "Cima4U",
      url: m[1],
      quality: "HD",
      headers: { Referer: referer }
    });
  }

  return results;
}

function findMoviePage(html) {
  var m = html.match(/<a href="(https?:\/\/[^"]+)"[^>]*class="[^"]*movie/i);
  if (m) return m[1];

  m = html.match(/<a href="(https?:\/\/[^"]+)"/);
  return m ? m[1] : null;
}

function findWatchPage(html) {
  var m = html.match(/href="(https?:\/\/[^"]+watch[^"]+)"/i);
  if (m) return m[1];

  m = html.match(/data-url="(https?:\/\/[^"]+)"/i);
  return m ? m[1] : null;
}

function getTitle(tmdbId, mediaType) {
  var type = mediaType === "movie" ? "movie" : "tv";

  var url =
    "https://api.themoviedb.org/3/" +
    type +
    "/" +
    tmdbId +
    "?api_key=44c4c1f0a1d7b6f0a4c3a1e8e6e1c111";

  return fetch(url)
    .then(r => r.json())
    .then(j => j.title || j.name);
}

function getStreams(tmdbId, mediaType, season, episode) {
  return getTitle(tmdbId, mediaType).then(title => {

    var searchUrl = BASE + "/?s=" + encodeURIComponent(title);

    return http(searchUrl).then(searchHtml => {

      var moviePage = findMoviePage(searchHtml);
      if (!moviePage) return [];

      return http(moviePage).then(movieHtml => {

        var watchPage = findWatchPage(movieHtml) || moviePage;

        return http(watchPage).then(watchHtml => {

          var streams = extractStreams(watchHtml, watchPage);

          // also scan iframes
          var iframeMatch = watchHtml.match(/<iframe[^>]+src="([^"]+)"/i);

          if (!streams.length && iframeMatch) {
            return http(iframeMatch[1]).then(iframeHtml =>
              extractStreams(iframeHtml, iframeMatch[1])
            );
          }

          return streams;
        });
      });
    });
  });
}

module.exports = { getStreams };
