/**
 * Hashhackers - Pure Promise Version (TV Support, Quality, Size, Strict Filter)
 */

function formatBytes(bytes) {
    if (!bytes || bytes == 0) return "Unknown";
    var k = 1024;
    var sizes = ["Bytes", "KB", "MB", "GB", "TB"];
    var i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

function fetchJson(url, options) {
    console.log("[Hashhackers] Fetching: " + url);
    return fetch(url, options || {}).then(function(res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
    }).catch(function(err) {
        console.error("[Hashhackers] Fetch Failed: " + err.message);
        throw err;
    });
}

function getStreams(tmdbId, mediaType, season, episode) {
    console.log("[Hashhackers] getStreams: " + tmdbId + " | Type: " + mediaType);
    
    // Support both movies and TV shows
    if (mediaType !== 'movie' && mediaType !== 'tv') return Promise.resolve([]);

    var isTv = mediaType === 'tv';
    var isImdb = String(tmdbId).startsWith("tt");
    
    // 1. Get TMDB info
    var tmdbUrl = isImdb 
        ? "https://api.themoviedb.org/3/find/" + tmdbId + "?api_key=d131017ccc6e5462a81c9304d21476de&external_source=imdb_id&language=en-US"
        : "https://api.themoviedb.org/3/" + (isTv ? "tv" : "movie") + "/" + tmdbId + "?api_key=d131017ccc6e5462a81c9304d21476de&language=en-US";

    return fetchJson(tmdbUrl)
        .then(function(tmdbData) {
            var mediaData;
            if (isImdb) {
                mediaData = isTv ? (tmdbData.tv_results && tmdbData.tv_results[0]) : (tmdbData.movie_results && tmdbData.movie_results[0]);
            } else {
                mediaData = tmdbData;
            }
            
            if (!mediaData) return [];

            var title = isTv ? mediaData.name : mediaData.title;
            var releaseDate = isTv ? mediaData.first_air_date : mediaData.release_date;
            var year = releaseDate ? releaseDate.split('-')[0] : '';
            
            // Format Query (e.g. "The Boys 2019 S01E01" or "Fight Club 1999")
            var queryStr = title + " " + year;
            if (isTv && season !== undefined && episode !== undefined) {
                var s = season < 10 ? '0' + season : season;
                var e = episode < 10 ? '0' + episode : episode;
                queryStr += " S" + s + "E" + e;
            }
            var query = encodeURIComponent(queryStr.trim());

            // 2. Get Token from Vercel (Cache Buster included)
            var tokenUrl = "https://hashhackers.vercel.app/api/token?nocache=" + new Date().getTime();
            
            return fetchJson(tokenUrl)
                .then(function(tokenData) {
                    var token = tokenData.token;
                    if (!token) return [];

                    var HASH_HEADERS = {
                        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0.1 Mobile/15E148 Safari/604.1",
                        "Accept": "*/*",
                        "Authorization": "Bearer " + token,
                        "Origin": "https://bollywood.eu.org",
                        "Referer": "https://bollywood.eu.org/"
                    };

                    var searchUrl = "https://tga-hd.api.hashhackers.com/mix_media_files/search?q=" + query + "&page=1";
                    
                    // 3. Search Hashhackers
                    return fetchJson(searchUrl, { headers: HASH_HEADERS })
                        .then(function(searchData) {
                            var files = searchData.files || [];
                            
                            // STRICT FILTERING: Only pure .mkv or .mp4 files allowed
                            var validFiles = files.filter(function(f) {
                                var fn = f.file_name.toLowerCase().trim();
                                return /\.(mkv|mp4)$/.test(fn);
                            });

                            if (validFiles.length === 0) return [];

                            var topFiles = validFiles.slice(0, 6);
                            var streamPromises = topFiles.map(function(file) {
                                
                                // 4. Generate Links
                                return fetchJson("https://tga-hd.api.hashhackers.com/genLink?type=mix_media&id=" + file.id, { headers: HASH_HEADERS })
                                    .then(function(linkData) {
                                        if (linkData.success && linkData.url) {
                                            var fn = file.file_name.toLowerCase();
                                            var quality = "Auto";
                                            
                                            if (fn.includes("2160p") || fn.includes("4k")) quality = "4K";
                                            else if (fn.includes("1080p")) quality = "1080p";
                                            else if (fn.includes("720p")) quality = "720p";
                                            else if (fn.includes("480p")) quality = "480p";

                                            return {
                                                name: "Hashhackers",
                                                title: file.file_name,
                                                url: linkData.url,
                                                quality: quality,
                                                size: formatBytes(parseInt(file.file_size))
                                            };
                                        }
                                        return null;
                                    }).catch(function() { return null; });
                            });

                            return Promise.all(streamPromises).then(function(results) {
                                return results.filter(function(r) { return r !== null; });
                            });
                        });
                });
        }).catch(function(error) {
            console.error("[Hashhackers] Error: " + error.message);
            return [];
        });
}

module.exports = { getStreams: getStreams };
