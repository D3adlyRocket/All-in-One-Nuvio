/**
 * BrazucaPlay - Provider Nuvio para conteúdo em Português
 * Baseado nas fontes Superflix, Overflix e VisãoCine (comunidade Brazuca)
 * Compatível com o formato de repositório Nuvio
 */

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
  'Connection': 'keep-alive'
};

const API = 'https://enc-dec.app/api/dec-videasy';
const TMDB_API_KEY = 'd131017ccc6e5462a81c9304d21476de';
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

// Servidores em Português (Superflix, Overflix, VisãoCine)
const SERVERS = {
  'Superflix': {url: 'https://api.videasy.net/superflix/sources-with-title',
    language: 'Português'},
  'Overflix': {url: 'https://api2.videasy.net/overflix/sources-with-title',
    language: 'Português'},
  'Kayo': {url: 'https://api2.videasy.net/cuevana-spanish/sources-with-title, 
    language: 'Spanish'},
  'VisãoCine': {url: 'https://api.videasy.net/visioncine/sources-with-title',
    language: 'Português'}
};

function requestRaw(method, urlString, options) {
  return fetch(urlString, {
    method: method,
    headers: (options && options.headers) || {},
    body: (options && options.body) || undefined
  }).then(function(response) {
    return response.text().then(function(body) {
      if (response.ok) {
        return { status: response.status, headers: response.headers, body: body };
      } else {
        throw new Error('HTTP ' + response.status + ': ' + body);
      }
    });
  });
}

function getText(url) {
  return requestRaw('GET', url, { headers: HEADERS }).then(function(res) { return res.body; });
}

function getJson(url) {
  return requestRaw('GET', url, { headers: HEADERS }).then(function(res) {
    try {
      return JSON.parse(res.body);
    } catch (e) {
      throw new Error('Invalid JSON from GET ' + url + ': ' + e.message);
    }
  });
}

function postJson(url, jsonBody, extraHeaders) {
  var body = JSON.stringify(jsonBody);
  var headers = Object.assign({}, HEADERS, { 'Content-Type': 'application/json' }, extraHeaders || {});
  return requestRaw('POST', url, { headers: headers, body: body }).then(function(res) {
    try {
      return JSON.parse(res.body);
    } catch (e) {
      throw new Error('Invalid JSON from POST ' + url + ': ' + e.message);
    }
  });
}

function decryptVideoEasy(encryptedText, tmdbId) {
  return postJson(API + '/dec-videasy', { text: encryptedText, id: tmdbId })
    .then(function(response) { return response.result; });
}

function fetchMovieDetails(tmdbId) {
  var url = TMDB_BASE_URL + '/movie/' + tmdbId + '?api_key=' + TMDB_API_KEY + '&append_to_response=external_ids';
  return getJson(url).then(function(data) {
    return {
      id: data.id,
      title: data.title,
      year: data.release_date ? data.release_date.split('-')[0] : '',
      imdbId: (data.external_ids && data.external_ids.imdb_id) ? data.external_ids.imdb_id : '',
      mediaType: 'movie',
      overview: data.overview,
      poster: data.poster_path ? 'https://image.tmdb.org/t/p/w500' + data.poster_path : '',
      backdrop: data.backdrop_path ? 'https://image.tmdb.org/t/p/w1280' + data.backdrop_path : ''
    };
  });
}

function fetchTvDetails(tmdbId) {
  var url = TMDB_BASE_URL + '/tv/' + tmdbId + '?api_key=' + TMDB_API_KEY + '&append_to_response=external_ids';
  return getJson(url).then(function(data) {
    return {
      id: data.id,
      title: data.name,
      year: data.first_air_date ? data.first_air_date.split('-')[0] : '',
      imdbId: (data.external_ids && data.external_ids.imdb_id) ? data.external_ids.imdb_id : '',
      mediaType: 'tv',
      overview: data.overview,
      poster: data.poster_path ? 'https://image.tmdb.org/t/p/w500' + data.poster_path : '',
      backdrop: data.backdrop_path ? 'https://image.tmdb.org/t/p/w1280' + data.backdrop_path : '',
      numberOfSeasons: data.number_of_seasons,
      numberOfEpisodes: data.number_of_episodes
    };
  });
}

function fetchMediaDetails(tmdbId, mediaType) {
  if (mediaType === 'movie') return fetchMovieDetails(tmdbId);
  if (mediaType === 'tv') return fetchTvDetails(tmdbId);
  return fetchMovieDetails(tmdbId).catch(function() { return fetchTvDetails(tmdbId); });
}

function buildVideoEasyUrl(serverConfig, mediaType, title, year, tmdbId, imdbId, seasonId, episodeId) {
  var params = {
    title: title,
    mediaType: mediaType,
    year: year,
    tmdbId: tmdbId,
    imdbId: imdbId
  };
  if (mediaType === 'tv' && seasonId && episodeId) {
    params.seasonId = seasonId;
    params.episodeId = episodeId;
  }
  var queryString = Object.keys(params)
    .map(function(key) { return encodeURIComponent(key) + '=' + encodeURIComponent(params[key]); })
    .join('&');
  return serverConfig.url + '?' + queryString;
}

function extractQualityFromUrl(url) {
  var m = url.match(/(\d{3,4})p/i);
  if (m) {
    var q = parseInt(m[1]);
    if (q >= 240 && q <= 4320) return q + 'p';
  }
  if (url.indexOf('1080') !== -1 || url.indexOf('1920') !== -1) return '1080p';
  if (url.indexOf('720') !== -1 || url.indexOf('1280') !== -1) return '720p';
  if (url.indexOf('480') !== -1 || url.indexOf('854') !== -1) return '480p';
  if (url.indexOf('360') !== -1 || url.indexOf('640') !== -1) return '360p';
  return 'Adaptive';
}

function formatStreamsForNuvio(mediaData, serverName, serverConfig, mediaDetails) {
  if (!mediaData || typeof mediaData !== 'object' || !mediaData.sources) return [];
  var streams = [];
  mediaData.sources.forEach(function(source) {
    if (source.url) {
      var quality = source.quality || extractQualityFromUrl(source.url);
      var headers = Object.assign({}, HEADERS);
      if (source.url.indexOf('.m3u8') !== -1) {
        headers['Accept'] = 'application/vnd.apple.mpegurl,application/x-mpegURL,*/*';
        headers['Referer'] = 'https://videasy.net/';
      } else if (source.url.indexOf('.mp4') !== -1) {
        headers['Accept'] = 'video/mp4,*/*';
        headers['Range'] = 'bytes=0-';
      }
      streams.push({
        name: 'BrazucaPlay ' + serverName + ' ' + serverConfig.language + ' - ' + quality,
        title: mediaDetails.title + ' (' + mediaDetails.year + ')',
        url: source.url,
        quality: quality,
        size: 'Unknown',
        headers: headers,
        provider: 'brazucaplay'
      });
    }
  });
  return streams;
}

function fetchFromServer(serverName, serverConfig, mediaType, title, year, tmdbId, imdbId, seasonId, episodeId) {
  var url = buildVideoEasyUrl(serverConfig, mediaType, title, year, tmdbId, imdbId, seasonId, episodeId);
  return getText(url)
    .then(function(encryptedData) {
      if (!encryptedData || encryptedData.trim() === '') throw new Error('No encrypted data received');
      return decryptVideoEasy(encryptedData, tmdbId);
    })
    .then(function(decryptedData) {
      return formatStreamsForNuvio(decryptedData, serverName, serverConfig, { title: title, year: year });
    })
    .catch(function() { return []; });
}

function getStreams(tmdbId, mediaType, seasonNum, episodeNum) {
  return new Promise(function(resolve) {
    fetchMediaDetails(tmdbId, mediaType)
      .then(function(mediaDetails) {
        var serverPromises = Object.keys(SERVERS).map(function(serverName) {
          return fetchFromServer(
            serverName,
            SERVERS[serverName],
            mediaDetails.mediaType,
            mediaDetails.title,
            mediaDetails.year,
            tmdbId,
            mediaDetails.imdbId,
            seasonNum,
            episodeNum
          );
        });
        return Promise.all(serverPromises);
      })
      .then(function(results) {
        var allStreams = [];
        results.forEach(function(streams) { allStreams = allStreams.concat(streams); });
        var seen = {};
        var unique = [];
        allStreams.forEach(function(s) {
          if (!seen[s.url]) {
            seen[s.url] = true;
            unique.push(s);
          }
        });
        var getQ = function(q) {
          var qq = (q || '').toLowerCase().replace(/p$/, '');
          if (qq === '4k' || qq === '2160') return 2160;
          if (qq === '1080') return 1080;
          if (qq === '720') return 720;
          if (qq === '480') return 480;
          if (qq === '360') return 360;
          if (qq === 'adaptive' || qq === 'auto') return 4000;
          var n = parseInt(qq);
          return isNaN(n) ? 0 : n;
        };
        unique.sort(function(a, b) { return getQ(b.quality) - getQ(a.quality); });
        resolve(unique);
      })
      .catch(function() { resolve([]); });
  });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { getStreams };
} else {
  global.getStreams = getStreams;
}
