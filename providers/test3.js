// ============================================================
// Einthusan Provider - Solid Extraction + Spin Fix
// ============================================================

var BASE_URL = 'https://einthusan.tv';

var HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Linux; Android 15; ALT-NX1 Build/HONORALT-N31; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/146.0.7680.177 Mobile Safari/537.36',
  'Referer': 'https://einthusan.tv/',
  'sec-ch-ua': '"Chromium";v="146", "Not-A.Brand";v="24", "Android WebView";v="146"',
  'Accept': '*/*',
  'Accept-Encoding': 'identity;q=1, *;q=0'
};

function getStreams(tmdbId, mediaType) {
  return new Promise(function (resolve) {
    // Testing with ID 21lw - Hindi
    var watchUrl = BASE_URL + '/movie/watch/21lw/?lang=hindi';

    fetch(watchUrl, { headers: HEADERS })
      .then(function (res) { return res.text(); })
      .then(function (html) {
        if (!html) {
          console.log('Error: Empty HTML response');
          return resolve([]);
        }

        // --- MULTI-STAGE EXTRACTION ---
        // We look for cdn1, then generic mp4/m3u8, then encoded links
        var patterns = [
          /["'](https?:\/\/cdn1\.einthusan\.io\/[^"']+)["']/i,
          /["'](https?:\/\/[^"']+\.(?:m3u8|mp4)[^"']*)["']/i,
          /file\s*:\s*["']([^"']+)["']/i
        ];

        var streamUrl = null;
        for (var i = 0; i < patterns.length; i++) {
          var match = html.match(patterns[i]);
          if (match && match[1]) {
            streamUrl = match[1];
            break; 
          }
        }

        if (streamUrl) {
          // --- BULLETPROOF CLEANING ---
          // 1. Fix HTML entities
          streamUrl = streamUrl.replace(/&amp;/g, '&');
          // 2. Remove escape backslashes
          streamUrl = streamUrl.replace(/\\/g, '');
          // 3. Trim whitespace or quotes
          streamUrl = streamUrl.trim().replace(/^["']|["']$/g, '');

          console.log('SUCCESS: Link extracted -> ' + streamUrl);

          resolve([{
            url: streamUrl,
            quality: 'HD',
            format: streamUrl.indexOf('m3u8') !== -1 ? 'm3u8' : 'mp4',
            // --- THE SPIN FIX ---
            // The player MUST send these or the CDN will hang the socket (spin forever)
            headers: {
              'User-Agent': HEADERS['User-Agent'],
              'Referer': 'https://einthusan.tv/',
              'Origin': 'https://einthusan.tv',
              'Accept-Encoding': 'identity;q=1, *;q=0'
            }
          }]);
        } else {
          console.log('FAILURE: No stream link found in HTML source');
          resolve([]);
        }
      })
      .catch(function (err) {
        console.log('CRITICAL FETCH ERROR: ' + err);
        resolve([]);
      });
  });
}

module.exports = { getStreams: getStreams };
