/*{
    "name": "ShowBox TV",
    "description": "ShowBox Scraper for Android TV",
    "version": "1.3.0",
    "settings": [
        {
            "name": "uiToken",
            "type": "text",
            "label": "UI Token (Cookie)",
            "placeholder": "Paste token here..."
        },
        {
            "name": "ossGroup",
            "type": "text",
            "label": "OSS Group",
            "placeholder": "Optional"
        }
    ]
}*/

// Use 'var' for maximum compatibility with older TV OS versions
var TMDB_API_KEY = '439c478a771f35c05022f9feabcca01c';
var TMDB_BASE_URL = 'https://api.themoviedb.org/3';
var SHOWBOX_API_BASE = 'https://febapi.nuvioapp.space/api/media';

var WORKING_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Linux; Android 10; SM-G981B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/80.0.3987.162 Mobile Safari/537.36',
    'Accept': 'application/json'
};

function getSettingsValue(key) {
    try {
        // Android TV bridge often uses 'global.SCRAPER_SETTINGS'
        var settings = (typeof global !== 'undefined' && global.SCRAPER_SETTINGS) ? global.SCRAPER_SETTINGS : {};
        return settings[key] || "";
    } catch (e) {
        return "";
    }
}

function getStreams(tmdbId, mediaType, seasonNum, episodeNum) {
    var cookie = getSettingsValue('uiToken');
    var ossGroup = getSettingsValue('ossGroup');

    if (!cookie) {
        console.log("[ShowBox] No Token in Settings");
        return Promise.resolve([]);
    }

    // Manual URL concatenation for older JS engines
    var tmdbUrl = TMDB_BASE_URL + (mediaType === 'tv' ? '/tv/' : '/movie/') + tmdbId + '?api_key=' + TMDB_API_KEY;

    return fetch(tmdbUrl)
        .then(function(res) { return res.json(); })
        .then(function(mediaInfo) {
            var title = (mediaType === 'tv' ? mediaInfo.name : mediaInfo.title) || "Media";
            var year = (mediaType === 'tv' ? mediaInfo.first_air_date : mediaInfo.release_date || "").split('-')[0];

            var apiUrl;
            if (mediaType === 'tv') {
                var ossPath = ossGroup ? '/oss=' + ossGroup : '';
                apiUrl = SHOWBOX_API_BASE + '/tv/' + tmdbId + ossPath + '/' + seasonNum + '/' + episodeNum + '?cookie=' + encodeURIComponent(cookie);
            } else {
                apiUrl = SHOWBOX_API_BASE + '/movie/' + tmdbId + '?cookie=' + encodeURIComponent(cookie);
            }

            return fetch(apiUrl, { headers: WORKING_HEADERS })
                .then(function(res) { return res.json(); })
                .then(function(data) {
                    if (!data || !data.versions) return [];
                    var results = [];
                    for (var i = 0; i < data.versions.length; i++) {
                        var v = data.versions[i];
                        if (!v.links) continue;
                        for (var j = 0; j < v.links.length; j++) {
                            var l = v.links[j];
                            results.push({
                                name: "ShowBox " + (l.quality || "HD"),
                                title: title + (year ? " (" + year + ")" : ""),
                                url: l.url,
                                quality: l.quality || "HD",
                                provider: "showbox"
                            });
                        }
                    }
                    return results;
                });
        })
        .catch(function() { return []; });
}

// Attach to all possible entry points for TV
if (typeof global !== 'undefined') { global.getStreams = getStreams; }
if (typeof window !== 'undefined') { window.getStreams = getStreams; }
if (typeof module !== 'undefined') { module.exports = { getStreams: getStreams }; }
