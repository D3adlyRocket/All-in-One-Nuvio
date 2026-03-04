var BASE = "https://cimawbas.org";

var HEADERS = {
  "User-Agent": "Mozilla/5.0",
  "Accept-Language": "en,ar;q=0.9"
};

function http(url, ref) {
  var h = Object.assign({}, HEADERS);
  if (ref) h["Referer"] = ref;

  return fetch(url, { headers: h })
    .then(function(r){ return r.text(); });
}

function getTitle(tmdbId, mediaType) {

  var url = "https://api.themoviedb.org/3/" +
    (mediaType === "movie" ? "movie/" : "tv/") +
    tmdbId +
    "?api_key=44c4ce0f5e0a5c3a7e9d";

  return fetch(url)
    .then(function(r){ return r.json(); })
    .then(function(j){ return j.title || j.name; });
}

function extract(html, referer) {

  var out = [];
  var re = /(https?:\/\/[^"' ]+\.(m3u8|mp4)[^"' ]*)/g;
  var m;

  while ((m = re.exec(html)) !== null) {

    out.push({
      name: "DOMTY",
      url: m[1],
      quality: "HD",
      headers: { Referer: referer }
    });

  }

  return out;
}

function getStreams(tmdbId, mediaType, season, episode) {

  return getTitle(tmdbId, mediaType).then(function(title){

    var search = BASE + "/?s=" + encodeURIComponent(title);

    return http(search, BASE).then(function(html){

      var link = html.match(/<a href="(https?:\/\/[^"]+)"/i);
      if (!link) return [];

      var page = link[1];

      return http(page, search).then(function(p){

        var streams = extract(p, page);

        var iframe = p.match(/<iframe[^>]+src="([^"]+)"/i);

        if (!streams.length && iframe) {
          return http(iframe[1], page).then(function(i){
            return extract(i, iframe[1]);
          });
        }

        return streams;
      });

    });

  }).catch(function(){
    return [];
  });

}

module.exports = { getStreams };
