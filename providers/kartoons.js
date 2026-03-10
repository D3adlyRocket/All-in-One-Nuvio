// Nuvio Local Scraper Template: kartoons.me
// IMPORTANT: async/await is NOT supported in Nuvio. Use standard Promises.

function getStreams(tmdbId, mediaType, seasonNum, episodeNum) {
    return new Promise((resolve, reject) => {
        // Placeholder title - in a real app, you'd convert the tmdbId to a real title
        let searchTitle = "ben-10"; 
        let searchUrl = `https://kartoons.me/?s=${searchTitle}`;

        // 1. Search the site
        fetch(searchUrl)
            .then(response => response.text())
            .then(html => {
                // 2. Find the link to the cartoon's post
                let postMatch = html.match(/href="(https:\/\/kartoons\.me\/[^"]+)"/);
                if (!postMatch) return resolve([]);
                
                return fetch(postMatch[1]); 
            })
            .then(response => response ? response.text() : null)
            .then(html => {
                if (!html) return resolve([]);

                // 3. Look for the video player iframe or direct mp4/m3u8 link
                // This regex looks for standard video sources or embed links often used on anime/cartoon sites
                let streamMatch = html.match(/src=["'](https:\/\/[^"']+\.(?:mp4|m3u8)[^"']*)["']/i) || 
                                  html.match(/src=["'](https:\/\/[^"']+(?:file|embed|v|e)\/[^"']+)["']/i);

                if (streamMatch) {
                    let streamUrl = streamMatch[1];
                    resolve([{
                        name: "Kartoons",
                        description: "Cartoon/Anime Stream",
                        url: streamUrl,
                        behaviorHints: {
                            notWebReady: false 
                        }
                    }]);
                } else {
                    resolve([]); // Link not found
                }
            })
            .catch(error => {
                resolve([]); 
            });
    });
}

module.exports = { getStreams };
