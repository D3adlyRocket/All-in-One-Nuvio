const cheerio = require('cheerio-without-node-native');

const PLAYER = "https://s1.devcorp.me/player/player.html";

function getStreams(tmdbId, mediaType, seasonNum, episodeNum) {
    return new Promise((resolve) => {

        const tmdbUrl = `https://api.themoviedb.org/3/${mediaType}/${tmdbId}?api_key=b030404650f279792a8d3287232358e3`;

        fetch(tmdbUrl)
        .then(r => r.json())
        .then(tmdb => {

            const title = tmdb.title || tmdb.name || tmdb.original_title;
            const year = (tmdb.release_date || tmdb.first_air_date || "").substring(0,4);

            let playerUrl;

            if (mediaType === "movie") {
                playerUrl = `${PLAYER}?title=${encodeURIComponent(title)}%20(${year})`;
            } else {
                playerUrl = `${PLAYER}?title=${encodeURIComponent(title)}%20(${year})%20-%20Episode%20${episodeNum}`;
            }

            return fetch(playerUrl);

        })
        .then(r => r.text())
        .then(html => {

            const streams = [];

            const match = html.match(/file=\[(.*?)\]/);

            if (!match) {
                resolve([]);
                return;
            }

            const servers = JSON.parse(`[${match[1]}]`);

            servers.forEach(s => {

                if (!s.file) return;

                streams.push({
                    name: "OneTouchTV",
                    title: s.title || "Server",
                    url: s.file,
                    quality: "Auto",
                    headers: {
                        Referer: "https://s1.devcorp.me/",
                        Origin: "https://s1.devcorp.me"
                    },
                    provider: "onetouchtv"
                });

            });

            resolve(streams);

        })
        .catch(() => resolve([]));

    });
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { getStreams };
} else {
    global.getStreams = getStreams;
}
