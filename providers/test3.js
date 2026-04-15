// PrimeSrc Scraper for Nuvio - BASIC VERSION
const PRIMESRC_SITE = "https://primesrc.me";

function getStreams(id, mediaType, season, episode) {
    var type = (season && episode) ? "tv" : "movie";
    var queryPath = "type=" + type;

    // Direct IMDB/TMDB support as per your docs
    if (typeof id === 'string' && id.startsWith('tt')) {
        queryPath += "&imdb=" + id;
    } else {
        queryPath += "&tmdb=" + id;
    }

    if (type === "tv") {
        queryPath += "&season=" + season + "&episode=" + episode;
    }

    var listUrl = "https://primesrc.me/api/v1/list_servers?" + queryPath;

    return fetch(listUrl, {
        headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
            "Referer": PRIMESRC_SITE + "/"
        }
    })
    .then(function(r) { 
        if (!r.ok) return null;
        return r.json(); 
    })
    .then(function(data) {
        if (!data || !data.servers) return [];

        return data.servers.map(function(server) {
            // We use the Embed URL because the 'l' endpoint often requires 
            // browser cookies/tokens that a scraper can't easily get.
            var embedUrl = PRIMESRC_SITE + "/embed/" + type + "?" + queryPath;
            
            // Add the whitelist parameter to force this specific server
            embedUrl += "&whitelistServers=" + encodeURIComponent(server.name);

            return {
                name: "PrimeSrc: " + (server.name || "Server"),
                url: embedUrl,
                quality: "Auto",
                headers: {
                    "Referer": PRIMESRC_SITE + "/",
                    "User-Agent": "Mozilla/5.0 (Linux; Android 10)"
                }
            };
        });
    })
    .catch(function(err) {
        console.log("[PrimeSrc] Fetch Error: " + err.message);
        return [];
    });
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = { getStreams: getStreams };
} else {
    global.getStreams = getStreams;
}
