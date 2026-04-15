// PrimeSrc Scraper for Nuvio
// Returns streams via PrimeSrc API with direct header fixes

var TMDB_API_KEY = "20bf0a5cbc307e7889137457fa5b6b37";
var PRIMESRC_BASE = "https://primesrc.me/api/v1/";

function getStreams(tmdbId, mediaType, seasonNum, episodeNum) {
    var type = (seasonNum && episodeNum) ? "tv" : "movie";
    var url = PRIMESRC_BASE + "list_servers?type=" + type;
    
    // Check if ID is IMDB (tt) or TMDB
    if (typeof tmdbId === 'string' && tmdbId.indexOf('tt') === 0) {
        url += "&imdb=" + tmdbId;
    } else {
        url += "&tmdb=" + tmdbId;
    }

    if (type === "tv") {
        url += "&season=" + seasonNum + "&episode=" + episodeNum;
    }

    var userAgent = "Mozilla/5.0 (Linux; Android 15; ALT-NX1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Mobile Safari/537.36";

    return fetch(url, {
        headers: { "User-Agent": userAgent, "Referer": "https://primesrc.me/" }
    })
    .then(function(response) {
        return response.json();
    })
    .then(function(data) {
        if (!data || !data.servers) return [];

        var streamResults = [];
        var servers = data.servers;

        // Process servers one by one to ensure fetch stability
        var promises = servers.map(function(server) {
            var linkUrl = PRIMESRC_BASE + "l?key=" + server.key;
            
            return fetch(linkUrl, {
                headers: { "User-Agent": userAgent, "Referer": "https://primesrc.me/" }
            })
            .then(function(res) { return res.json(); })
            .then(function(linkData) {
                if (!linkData || !linkData.link) return null;

                var finalUrl = linkData.link;
                var streamRef = "https://primesrc.me/";

                // Apply the Referer logic from your successful playback logs
                if (finalUrl.indexOf("streamta.site") !== -1) streamRef = "https://streamta.site/";
                if (finalUrl.indexOf("cloudatacdn.com") !== -1) streamRef = "https://playmogo.com/";

                return {
                    name: "PrimeSrc - " + (server.name || "Server"),
                    url: finalUrl,
                    quality: "1080p",
                    headers: {
                        "User-Agent": userAgent,
                        "Referer": streamRef,
                        "Origin": streamRef.replace(/\/$/, ""),
                        "Accept": "*/*"
                    }
                };
            })
            .catch(function() { return null; });
        });

        return Promise.all(promises).then(function(results) {
            return results.filter(function(r) { return r !== null; });
        });
    })
    .catch(function(err) {
        return [];
    });
}

if (typeof module !== "undefined") {
    module.exports = { getStreams: getStreams };
}
