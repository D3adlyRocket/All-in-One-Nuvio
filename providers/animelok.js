const ffmpeg = require('fluent-ffmpeg');

/**
 * Nuvio Provider Configuration
 * This mimics the structure used in many modern JS-based scrapers.
 */
const NuvioProvider = {
    name: 'AnimePahe',
    baseUrl: 'https://animepahe.si',
    cdnUrl: 'https://vault-99.owocdn.top',

    // Headers required to bypass CDN 403 blocks
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36',
        'Referer': 'https://animepahe.si/',
        'Origin': 'https://animepahe.si',
        'Accept': '*/*',
    }
};

/**
 * getStream
 * The core function to pull the .m3u8 and convert it to .mp4
 */
async function getStream(m3u8Url, outputName = 'video.mp4') {
    console.log(`[Nuvio] Initializing stream capture for: ${outputName}`);

    return new Promise((resolve, reject) => {
        ffmpeg(m3u8Url)
            // Critical: Adding the headers to the input stream
            .inputOptions([
                `-headers User-Agent: ${NuvioProvider.headers['User-Agent']}\r\n`,
                `-headers Referer: ${NuvioProvider.headers.Referer}\r\n`
            ])
            .videoCodec('copy') // 'copy' is fast; it doesn't re-encode, just containers it
            .audioCodec('copy')
            .output(outputName)
            .on('start', (commandLine) => {
                console.log('Spawned FFmpeg with command: ' + commandLine);
            })
            .on('progress', (progress) => {
                if (progress.percent) {
                    console.log(`Processing: ${progress.percent.toFixed(2)}% done`);
                }
            })
            .on('error', (err) => {
                console.error('Error occurred: ' + err.message);
                reject(err);
            })
            .on('end', () => {
                console.log('[Nuvio] Stream successfully pulled!');
                resolve();
            })
            .run();
    });
}

// --- Execution ---
const targetUrl = 'https://vault-99.owocdn.top/stream/99/02/d18c35ee162a888eae0317437c2ea869457884823caec2b42e47218c33e5148a/uwu.m3u8';

getStream(targetUrl, 'anime_episode.mp4');
