function getStreams(tmdbId, mediaType, seasonNum, episodeNum, title) {

    return new Promise(function(resolve) {

        let searchUrl = "https://atishmkv3.bond/?s=" + encodeURIComponent(title);

        fetch(searchUrl)
        .then(function(res){ return res.text(); })
        .then(function(html){

            let match = html.match(/href="(https:\/\/atishmkv3\.bond\/[^"]+)"/i);

            if(!match){
                resolve([]);
                return;
            }

            return fetch(match[1]).then(function(r){ return r.text(); });
        })

        .then(function(html){

            if(!html){
                resolve([]);
                return;
            }

            // find rpmhub iframe
            let iframe = html.match(/https:\/\/atishmkv\.rpmhub\.site\/#([a-z0-9]+)/i);

            if(!iframe){
                resolve([]);
                return;
            }

            let streamId = iframe[1];

            // construct possible HLS path
            let testStream = "https://atishmkv.rpmhub.site/hls/" + streamId + "/master.m3u8";

            resolve([
                {
                    url: testStream,
                    name: "AtishMKV",
                    quality: "Auto",
                    type: "hls"
                }
            ]);

        })

        .catch(function(){
            resolve([]);
        });

    });
}
