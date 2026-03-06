function getStreams(tmdbId, mediaType, season, episode) {
    return new Promise(function(resolve, reject) {
        // 1. Récupération du titre via l'API interne (plus stable)
        var apiUrl = "https://api.themoviedb.org/3/movie/" + tmdbId + "?api_key=8d6d91784c04f98f6e241852615c441b&language=fr-FR";
        
        fetch(apiUrl)
            .then(function(res) { return res.json(); })
            .then(function(meta) {
                var title = meta.title;
                var searchUrl = "https://movix.blog/search?q=" + encodeURIComponent(title);
                
                // 2. Recherche sur Movix
                return fetch(searchUrl);
            })
            .then(function(res) { return res.text(); })
            .then(function(html) {
                // 3. Extraction de l'ID du film
                var match = html.match(/href="\/movie\/([^"]+)"/);
                if (!match) {
                    resolve([]);
                    return;
                }

                var movieUrl = "https://movix.blog/movie/" + match[1];

                // 4. Envoi du lien final à Nuvio
                resolve([
                    {
                        "name": "Movix HD",
                        "title": "Nexus/Dragiv [VF]",
                        "url": movieUrl,
                        "quality": "1080p",
                        "headers": {
                            "Referer": "https://movix.blog/",
                            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
                        }
                    }
                ]);
            })
            .catch(function(err) {
                resolve([]);
            });
    });
}

// Export requis par Nuvio
module.exports = { getStreams: getStreams };
