var PRIMESRC_API = "https://primesrc.me/api/v1/";

function getStreams(id, mediaType, season, episode) {
    var isImdb = (typeof id === 'string' && id.indexOf('tt') === 0);
    var type = (season && episode) ? "tv" : "movie";
    
    // Step 1: Build Search URL
    var searchUrl = PRIMESRC_API + "list_servers?type=" + type;
    if (isImdb) {
        searchUrl += "&imdb=" + id;
    } else {
        searchUrl += "&tmdb=" + id;
    }
    
    if (type === "tv") {
        searchUrl += "&season=" + season + "&episode=" + episode;
    }

    var ua = "Mozilla/5.0 (Linux; Android 15; ALT-NX1 Build/HONORALT-N31; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/146.0.7680.177 Mobile Safari/537.36";

    // Step 2: Fetch the Server List
    return fetch(searchUrl, {
        headers: { "User-Agent": ua, "Referer": "https://primesrc.me/" }
    })
    .then(function(res) { 
        return res.json(); 
    })
    .then(function(data) {
        if (!data || !data.servers || data.servers.length === 0) return [];

        // Step 3: Resolve the first 5 servers (limiting to avoid sandbox timeout)
        var serverSubset = data.servers.slice(0, 5);
        var fetchPromises = [];

        for (var i = 0; i < serverSubset.length; i++) {
            (function(server) {
                var p = fetch(PRIMESRC_API + "l?key=" + server.key, {
                    headers: { "User-Agent": ua, "Referer": "https://primesrc.me/" }
                })
                .then(function(lRes) { return lRes.json(); })
                .then(function(lData) {
                    if (!lData || !lData.link) return null;

                    var sUrl = lData.link;
                    var streamRef = "https://primesrc.me/";
                    
                    // Apply your log-based fixes for the 23003 error
                    if (sUrl.indexOf("streamta.site") !== -1) streamRef = "https://streamta.site/";
                    if (sUrl.indexOf("cloudatacdn.com") !== -1) streamRef = "https://playmogo.com/";

                    return {
                        name: "PrimeSrc: " + server.name,
                        url: sUrl,
                        quality: "1080p",
                        headers: {
                            "User-Agent": ua,
                            "Referer": streamRef,
                            "Origin": streamRef.replace(/\/$/, ""),
                            "Accept": "*/*"
                        }
                    };
                })
                .catch(function() { return null; });
                
                fetchPromises.push(p);
            })(serverSubset[i]);
        }

        return Promise.all(fetchPromises).then(function(allResults) {
            var validResults = [];
            for (var k = 0; k < allResults.length; k++) {
                if (allResults[k] !== null) validResults.push(allResults[k]);
            }
            return validResults;
        });
    })
    .catch(function(err) {
        return [];
    });
}

if (typeof module !== 'undefined') module.exports = { getStreams: getStreams };
