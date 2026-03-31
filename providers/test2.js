// TukTuk Cinema Provider for Nuvio
// Version: 1.7.0 - Fixed Stream Format Detection
// Only returns playable stream URLs (M3U8, MP4)

const cheerio = require('cheerio-without-node-native');

const MAIN_URL = 'https://tuktukhd.com/';
const TMDB_API_KEY = '70896ffbbb915bc34056a969379c0393';

const DEBUG_MODE = true;

const WORKING_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Accept': '*/*',
  'Accept-Language': 'en-US,en;q=0.9,ar;q=0.8',
  'Referer': 'https://tuktukhd.com/'
};

function createDebugStream(name, title, info) {
  return {
    name: '🔍 ' + name,
    title: title || 'Debug',
    url: 'about:blank',
    quality: info || 'Debug',
    size: 'Info',
    headers: WORKING_HEADERS,
    provider: 'tuktukcinema-debug'
  };
}

function fixUrl(url) {
  if (!url) return null;
  if (url.startsWith('http')) return url;
  if (url.startsWith('//')) return `https:${url}`;
  if (url.startsWith('/')) return `${MAIN_URL}${url}`;
  return `${MAIN_URL}/${url}`;
}

/**
 * Check if URL is a playable stream format
 */
function isPlayableStream(url) {
  if (!url) return false;
  
  const lowerUrl = url.toLowerCase();
  
  // M3U8 playlists are ALWAYS playable
  if (lowerUrl.includes('.m3u8')) return true;
  
  // Direct video files
  if (lowerUrl.includes('.mp4') || lowerUrl.includes('.mkv') || 
      lowerUrl.includes('.avi') || lowerUrl.includes('.webm')) {
    return true;
  }
  
  // MPD (DASH) streams
  if (lowerUrl.includes('.mpd')) return true;
  
  // Avoid known download/file hosting patterns
  if (lowerUrl.includes('download') || lowerUrl.includes('dl.') || 
      lowerUrl.includes('file') || lowerUrl.includes('upload')) {
    return false;
  }
  
  // If it has 'stream' in URL, it's likely playable
  if (lowerUrl.includes('stream')) return true;
  
  return false;
}

function extractEpisodeNumber(text) {
  if (!text) return null;
  
  console.log(`[TukTuk] Extracting from: "${text}"`);
  
  const arabicToEnglish = {
    '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
    '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9'
  };
  
  let match = text.match(/الحلقة\s*(\d+)/);
  if (match) return parseInt(match[1]);
  
  match = text.match(/الحلقه\s*(\d+)/);
  if (match) return parseInt(match[1]);
  
  match = text.match(/الحلقة\s*([٠-٩]+)/);
  if (match) {
    let num = '';
    for (let i = 0; i < match[1].length; i++) {
      num += arabicToEnglish[match[1][i]] || match[1][i];
    }
    return parseInt(num);
  }
  
  match = text.match(/الحلقه\s*([٠-٩]+)/);
  if (match) {
    let num = '';
    for (let i = 0; i < match[1].length; i++) {
      num += arabicToEnglish[match[1][i]] || match[1][i];
    }
    return parseInt(num);
  }
  
  match = text.match(/episode\s*(\d+)/i) || text.match(/ep\.?\s*(\d+)/i) || text.match(/\be(\d+)\b/i);
  if (match) return parseInt(match[1]);
  
  match = text.match(/\b(\d+)\b/);
  if (match) return parseInt(match[1]);
  
  return null;
}

function getTitleFromTMDB(tmdbId, mediaType) {
  return new Promise(function(resolve, reject) {
    const endpoint = mediaType === 'movie' ? 'movie' : 'tv';
    const tmdbUrl = `https://api.themoviedb.org/3/${endpoint}/${tmdbId}?api_key=${TMDB_API_KEY}&language=en-US`;
    
    fetch(tmdbUrl)
      .then(function(response) {
        if (!response.ok) throw new Error(`TMDB ${response.status}`);
        return response.json();
      })
      .then(function(data) {
        const title = data.title || data.name || data.original_title || data.original_name;
        const year = data.release_date ? data.release_date.substring(0, 4) : 
                     data.first_air_date ? data.first_air_date.substring(0, 4) : '';
        
        if (!title) {
          reject(new Error('No title'));
          return;
        }
        
        console.log(`[TukTukCinema] Title: "${title}"`);
        resolve({ title: title, year: year });
      })
      .catch(reject);
  });
}

function similarity(s1, s2) {
  if (!s1 || !s2) return 0;
  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;
  if (longer.length === 0) return 1.0;
  const editDistance = levenshteinDistance(longer.toLowerCase(), shorter.toLowerCase());
  return (longer.length - editDistance) / longer.length;
}

function levenshteinDistance(s1, s2) {
  const costs = [];
  for (let i = 0; i <= s1.length; i++) {
    let lastValue = i;
    for (let j = 0; j <= s2.length; j++) {
      if (i === 0) {
        costs[j] = j;
      } else if (j > 0) {
        let newValue = costs[j - 1];
        if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
          newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
        }
        costs[j - 1] = lastValue;
        lastValue = newValue;
      }
    }
    if (i > 0) costs[s2.length] = lastValue;
  }
  return costs[s2.length];
}

function getStreams(tmdbId, mediaType, seasonNum, episodeNum) {
  return new Promise(function(resolve, reject) {
    const debugStreams = [];
    
    console.log(`[TukTukCinema] ===== REQUEST =====`);
    console.log(`[TukTukCinema] TMDB: ${tmdbId}, Type: ${mediaType}, S${seasonNum}E${episodeNum}`);
    
    if (DEBUG_MODE) {
      debugStreams.push(createDebugStream(`Request S${seasonNum}E${episodeNum}`, `TMDB: ${tmdbId}`, mediaType));
    }
    
    if (!tmdbId) {
      resolve([createDebugStream('ERROR: No TMDB ID', '', '')]);
      return;
    }
    
    getTitleFromTMDB(tmdbId, mediaType)
      .then(function(tmdbData) {
        const searchTitle = tmdbData.title;
        const searchUrl = `${MAIN_URL}/?s=${encodeURIComponent(searchTitle)}`;
        
        if (DEBUG_MODE) {
          debugStreams.push(createDebugStream(`Title: "${searchTitle}"`, `Year: ${tmdbData.year}`, 'TMDB'));
        }
        
        return fetch(searchUrl, { headers: WORKING_HEADERS })
          .then(function(response) { return response.text(); })
          .then(function(html) {
            return { html: html, searchTitle: searchTitle };
          });
      })
      .then(function(searchData) {
        const $ = cheerio.load(searchData.html);
        const results = [];
        
        $('div.Block--Item').each(function() {
          const $item = $(this);
          const link = $item.find('a').first();
          const href = fixUrl(link.attr('href'));
          const title = $item.find('div.Block--Info h3').text().trim() || link.attr('title') || '';
          
          if (href && title) {
            const score = similarity(title.toLowerCase(), searchData.searchTitle.toLowerCase());
            results.push({ title: title, url: href, score: score });
          }
        });
        
        if (results.length === 0) {
          resolve([createDebugStream('ERROR: No results', `"${searchData.searchTitle}"`, '')].concat(debugStreams));
          return Promise.reject(new Error('No results'));
        }
        
        results.sort(function(a, b) { return b.score - a.score; });
        const bestMatch = results[0];
        
        if (DEBUG_MODE) {
          debugStreams.push(createDebugStream(`Match: "${bestMatch.title}"`, `${(bestMatch.score*100).toFixed(0)}%`, ''));
        }
        
        return fetch(bestMatch.url, { headers: WORKING_HEADERS })
          .then(function(response) { return response.text(); })
          .then(function(html) {
            return { html: html, contentUrl: bestMatch.url, contentTitle: bestMatch.title };
          });
      })
      .then(function(contentData) {
        const $content = cheerio.load(contentData.html);
        
        if (mediaType === 'movie' || !seasonNum || !episodeNum) {
          return Promise.resolve({ episodeUrl: contentData.contentUrl, contentTitle: contentData.contentTitle });
        }
        
        console.log(`[TukTukCinema] TV: S${seasonNum}E${episodeNum}`);
        
        const seasonLinks = $content('section.allseasonss a[href*="/series/"]');
        
        if (DEBUG_MODE) {
          debugStreams.push(createDebugStream(`TV: ${seasonLinks.length} seasons`, `S${seasonNum}E${episodeNum}`, 'Arabic'));
        }
        
        if (seasonLinks.length > 0) {
          if (seasonNum > seasonLinks.length) {
            resolve([createDebugStream('ERROR: Season unavailable', `S${seasonNum}`, `Only ${seasonLinks.length}`)].concat(debugStreams));
            return Promise.reject(new Error('Season'));
          }
          
          const seasonLink = seasonLinks.eq(seasonNum - 1);
          const seasonUrl = fixUrl(seasonLink.attr('href'));
          
          return fetch(seasonUrl, { headers: WORKING_HEADERS })
            .then(function(response) { return response.text(); })
            .then(function(seasonHtml) {
              const $season = cheerio.load(seasonHtml);
              const episodes = $season('section.allepcont div.row a');
              
              let foundEpisode = null;
              let foundIndex = -1;
              let foundTitle = '';
              
              episodes.each(function(index) {
                const $ep = $season(this);
                const epTitle = $ep.find('div.ep-info h2').text().trim() || 
                               $ep.find('div.epnum').text().trim() || 
                               $ep.text().trim();
                
                const epNum = extractEpisodeNumber(epTitle);
                
                if (epNum === episodeNum) {
                  foundEpisode = $ep;
                  foundIndex = index;
                  foundTitle = epTitle;
                  return false;
                }
              });
              
              if (!foundEpisode) {
                resolve([createDebugStream('ERROR: Episode not found', `E${episodeNum}`, `Total: ${episodes.length}`)].concat(debugStreams));
                return Promise.reject(new Error('Episode'));
              }
              
              const episodeUrl = fixUrl(foundEpisode.attr('href'));
              
              if (DEBUG_MODE) {
                debugStreams.push(createDebugStream(`Found E${episodeNum}!`, foundTitle, `Index: ${foundIndex}`));
              }
              
              if (!episodeUrl) {
                resolve([createDebugStream('ERROR: No URL', '', '')].concat(debugStreams));
                return Promise.reject(new Error('URL'));
              }
              
              return { episodeUrl: episodeUrl, contentTitle: contentData.contentTitle };
            });
        } else {
          const episodes = $content('section.allepcont div.row a');
          
          let foundEpisode = null;
          let foundIndex = -1;
          
          episodes.each(function(index) {
            const $ep = $content(this);
            const epTitle = $ep.find('div.ep-info h2').text().trim() || 
                           $ep.find('div.epnum').text().trim() || 
                           $ep.text().trim();
            
            const epNum = extractEpisodeNumber(epTitle);
            
            if (epNum === episodeNum) {
              foundEpisode = $ep;
              foundIndex = index;
              return false;
            }
          });
          
          if (!foundEpisode) {
            resolve([createDebugStream('ERROR: Episode not found', `E${episodeNum}`, '')].concat(debugStreams));
            return Promise.reject(new Error('Episode'));
          }
          
          const episodeUrl = fixUrl(foundEpisode.attr('href'));
          
          if (DEBUG_MODE) {
            debugStreams.push(createDebugStream(`Found E${episodeNum}`, `Index: ${foundIndex}`, ''));
          }
          
          if (!episodeUrl) {
            resolve([createDebugStream('ERROR: No URL', '', '')].concat(debugStreams));
            return Promise.reject(new Error('URL'));
          }
          
          return Promise.resolve({ episodeUrl: episodeUrl, contentTitle: contentData.contentTitle });
        }
      })
      .then(function(result) {
        if (!result || !result.episodeUrl) {
          resolve([createDebugStream('ERROR: No result', '', '')].concat(debugStreams));
          return Promise.reject(new Error('Result'));
        }
        
        const watchUrl = result.episodeUrl.endsWith('/') 
          ? `${result.episodeUrl}watch/` 
          : `${result.episodeUrl}/watch/`;
        
        if (DEBUG_MODE) {
          debugStreams.push(createDebugStream('Watch page', watchUrl.substring(0, 40) + '...', ''));
        }
        
        return fetch(watchUrl, { headers: WORKING_HEADERS })
          .then(function(response) { return response.text(); })
          .then(function(html) {
            return { watchHtml: html, watchUrl: watchUrl, contentTitle: result.contentTitle };
          });
      })
      .then(function(watchData) {
        const $watch = cheerio.load(watchData.watchHtml);
        const iframe = $watch('div.player--iframe iframe');
        const iframeSrc = fixUrl(iframe.attr('src'));
        
        if (!iframeSrc) {
          resolve([createDebugStream('ERROR: No iframe', '', '')].concat(debugStreams));
          return Promise.reject(new Error('Iframe'));
        }
        
        console.log(`[TukTukCinema] Iframe: ${iframeSrc}`);
        
        if (DEBUG_MODE) {
          debugStreams.push(createDebugStream('Iframe found', iframeSrc.substring(0, 40) + '...', iframeSrc.includes('megatukmax') ? 'MTM' : 'Ext'));
        }
        
        // For TukTuk Cinema, the streams often don't work directly
        // Return the iframe URL for Nuvio to handle as external player
        if (!iframeSrc.includes('megatukmax')) {
          const streams = [{
            name: 'TukTuk Cinema - Watch in Browser',
            title: watchData.contentTitle,
            url: iframeSrc,
            quality: 'External Player',
            size: 'Unknown',
            headers: { 'User-Agent': WORKING_HEADERS['User-Agent'], 'Referer': watchData.watchUrl },
            provider: 'tuktukcinema'
          }];
          
          if (DEBUG_MODE) {
            resolve([
              createDebugStream('⚠️ PLAYBACK INFO', 'URLs may not be direct streams', 'Try external player'),
              createDebugStream('Alternative', 'Open in browser recommended', watchData.watchUrl.substring(0, 40) + '...')
            ].concat(debugStreams).concat(streams));
          } else {
            resolve(streams);
          }
          return Promise.reject(new Error('Done'));
        }
        
        const iframeId = iframeSrc.split('/').pop();
        const iframeUrl = `https://w.megatukmax.xyz/iframe/${iframeId}`;
        
        return fetch(iframeUrl, { headers: { ...WORKING_HEADERS, 'Referer': watchData.watchUrl }})
          .then(function(response) { return response.text(); })
          .then(function(html) {
            return { iframeHtml: html, iframeUrl: iframeUrl, contentTitle: watchData.contentTitle, watchUrl: watchData.watchUrl };
          });
      })
      .then(function(iframeData) {
        let version = '';
        const patterns = [
          /"version"\s*:\s*"([a-f0-9]{32,})"/,
          /X-Inertia-Version["']?\s*[:=]\s*["']([a-f0-9]{32,})["']/
        ];
        
        for (let i = 0; i < patterns.length; i++) {
          const match = iframeData.iframeHtml.match(patterns[i]);
          if (match && match[1]) {
            version = match[1];
            break;
          }
        }
        
        if (!version) version = '852467c2571830b8584cc9bce61b6cde';
        
        const inertiaHeaders = {
          'User-Agent': WORKING_HEADERS['User-Agent'],
          'Accept': 'application/json',
          'X-Inertia': 'true',
          'X-Inertia-Version': version,
          'X-Inertia-Partial-Component': 'files/mirror/video',
          'X-Inertia-Partial-Data': 'streams',
          'X-Requested-With': 'XMLHttpRequest',
          'Referer': iframeData.iframeUrl,
          'Origin': 'https://w.megatukmax.xyz'
        };
        
        return fetch(iframeData.iframeUrl, { headers: inertiaHeaders })
          .then(function(response) { return response.json(); })
          .then(function(apiData) {
            const streams = [];
            const playableStreams = [];
            const nonPlayableStreams = [];
            
            if (apiData.props && apiData.props.streams && apiData.props.streams.data) {
              const qualities = apiData.props.streams.data;
              
              for (let i = 0; i < qualities.length; i++) {
                const quality = qualities[i];
                const label = quality.label || 'Unknown';
                
                if (quality.mirrors && quality.mirrors.length > 0) {
                  for (let j = 0; j < quality.mirrors.length; j++) {
                    const mirror = quality.mirrors[j];
                    let link = mirror.link;
                    
                    if (link && link.startsWith('//')) link = `https:${link}`;
                    
                    if (link) {
                      const driver = mirror.driver || 'source';
                      const isPlayable = isPlayableStream(link);
                      
                      console.log(`[TukTukCinema] ${label} (${driver}): ${isPlayable ? '✓ PLAYABLE' : '✗ Not playable'} - ${link.substring(0, 50)}`);
                      
                      const streamObj = {
                        name: `TukTuk - ${label} (${driver})${isPlayable ? '' : ' ⚠️'}`,
                        title: iframeData.contentTitle,
                        url: link,
                        quality: label,
                        size: isPlayable ? 'Stream' : 'Download link',
                        headers: {
                          'User-Agent': WORKING_HEADERS['User-Agent'],
                          'Referer': iframeData.iframeUrl
                        },
                        provider: 'tuktukcinema'
                      };
                      
                      if (isPlayable) {
                        playableStreams.push(streamObj);
                      } else {
                        nonPlayableStreams.push(streamObj);
                      }
                    }
                  }
                }
              }
            }
            
            // Add warning stream
            const warnings = [];
            if (DEBUG_MODE) {
              warnings.push(createDebugStream(
                `Found: ${playableStreams.length} playable, ${nonPlayableStreams.length} download`,
                playableStreams.length > 0 ? 'Try M3U8 streams first' : 'No direct streams found',
                'Check format compatibility'
              ));
              
              // Add iframe as fallback option
              warnings.push({
                name: '🌐 Open in External Browser',
                title: 'Fallback: Browser playback',
                url: iframeData.watchUrl,
                quality: 'Browser',
                size: 'External',
                headers: { 'User-Agent': WORKING_HEADERS['User-Agent'] },
                provider: 'tuktukcinema-external'
              });
            }
            
            // Prioritize playable streams
            const finalStreams = playableStreams.length > 0 ? playableStreams : nonPlayableStreams;
            
            if (finalStreams.length === 0) {
              resolve([createDebugStream('ERROR: No streams', 'API returned empty', '')].concat(debugStreams).concat(warnings));
            } else {
              console.log(`[TukTukCinema] Returning ${finalStreams.length} stream(s)`);
              resolve((DEBUG_MODE ? debugStreams.concat(warnings) : []).concat(finalStreams));
            }
          });
      })
      .catch(function(error) {
        if (error.message === 'Done' || error.message === 'No results' || 
            error.message === 'Season' || error.message === 'Episode' ||
            error.message === 'URL' || error.message === 'Result' || error.message === 'Iframe') {
          return;
        }
        console.error(`[TukTukCinema] Error: ${error.message}`);
        resolve([createDebugStream('ERROR', error.message, '')].concat(debugStreams));
      });
  });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { getStreams };
} else {
  global.getStreams = getStreams;
}
