// providers/superflix.js
// SuperFlixAPI Provider - Dublado via API, Legendado via vidsrc-embed (com suporte a séries e filmes)

const BASE_URL = "https://superflixapi.rest";
const CDN_BASE = "https://tmstr1.neonhorizonworkshops.com";
const TMDB_API_KEY = "b64d2f3a4212a99d64a7d4485faed7b3";

let SESSION_DATA = {
    cookies: '',
    csrfToken: '',
    pageToken: ''
};

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Mobile Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'pt-BR',
    'Referer': 'https://lospobreflix.site/',
    'Sec-Fetch-Dest': 'iframe',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'cross-site',
    'Upgrade-Insecure-Requests': '1',
    'Connection': 'keep-alive'
};

const API_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Mobile Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'pt-BR',
    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
    'X-Requested-With': 'XMLHttpRequest',
    'Origin': BASE_URL,
    'Connection': 'keep-alive'
};

const VIDSRC_HEADERS = {
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    'Accept-Language': 'pt-BR',
    'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Mobile Safari/537.36',
    'Referer': 'https://warezcdn.site/',
    'Upgrade-Insecure-Requests': '1'
};

function updateCookies(response) {
    const setCookie = response.headers.get('set-cookie');
    if (setCookie) {
        SESSION_DATA.cookies = setCookie;
    }
}

function getCookieHeader() {
    return SESSION_DATA.cookies ? { 'Cookie': SESSION_DATA.cookies } : {};
}

// Função para corrigir URL com placeholders
function fixVideoUrl(url) {
    let fixedUrl = url;
    
    // Substituir padrão tmstr3.{v1} por tmstr3.neonhorizonworkshops.com
    fixedUrl = fixedUrl.replace(/tmstr3\.\{v\d+\}/g, 'tmstr3.neonhorizonworkshops.com');
    
    // Substituir outros placeholders restantes
    fixedUrl = fixedUrl.replace(/\{v\d+\}/g, 'neonhorizonworkshops.com');
    fixedUrl = fixedUrl.replace(/\{v1\}/g, 'neonhorizonworkshops.com');
    fixedUrl = fixedUrl.replace(/\{v2\}/g, 'neonhorizonworkshops.com');
    fixedUrl = fixedUrl.replace(/\{v3\}/g, 'neonhorizonworkshops.com');
    fixedUrl = fixedUrl.replace(/\{v4\}/g, 'neonhorizonworkshops.com');
    fixedUrl = fixedUrl.replace(/\{v5\}/g, 'neonhorizonworkshops.com');
    
    return fixedUrl;
}

async function getImdbIdFromTmdb(tmdbId, mediaType) {
    try {
        const endpoint = mediaType === 'movie' ? 'movie' : 'tv';
        const url = `https://api.themoviedb.org/3/${endpoint}/${tmdbId}?api_key=${TMDB_API_KEY}`;
        
        console.log(`[TMDB] Buscando IMDB ID para TMDB ${tmdbId} (${mediaType})`);
        
        const response = await fetch(url);
        if (!response.ok) return null;
        
        const data = await response.json();
        
        if (mediaType === 'movie') {
            return data.imdb_id;
        }
        
        const externalUrl = `https://api.themoviedb.org/3/tv/${tmdbId}/external_ids?api_key=${TMDB_API_KEY}`;
        const externalResponse = await fetch(externalUrl);
        if (!externalResponse.ok) return null;
        
        const externalData = await externalResponse.json();
        return externalData.imdb_id;
        
    } catch (error) {
        console.log(`[TMDB] Erro: ${error.message}`);
        return null;
    }
}

async function getStreams(tmdbId, mediaType, season, episode) {
    const targetSeason = mediaType === 'movie' ? 1 : season;
    const targetEpisode = mediaType === 'movie' ? 1 : episode;
    const results = [];
    const logs = [];
    
    function addLog(step, data) {
        const logStr = `[${step}] ${typeof data === 'object' ? JSON.stringify(data).substring(0, 200) : data}`;
        logs.push(logStr);
        console.log(logStr);
    }
    
    addLog('INICIO', { tmdbId, mediaType, season: targetSeason, episode: targetEpisode });
    
    try {
        // 1. Página inicial
        let pageUrl;
        if (mediaType === 'movie') {
            pageUrl = `${BASE_URL}/filme/${tmdbId}`;
        } else {
            pageUrl = `${BASE_URL}/serie/${tmdbId}/${targetSeason}/${targetEpisode}`;
        }
        
        addLog('PAGE_URL', pageUrl);
        
        const pageResponse = await fetch(pageUrl, {
            headers: { ...HEADERS, ...getCookieHeader() }
        });
        
        addLog('PAGE_STATUS', pageResponse.status);
        
        if (!pageResponse.ok) return results;
        updateCookies(pageResponse);
        
        let html = await pageResponse.text();
        addLog('HTML_LEN', html.length);
        
        let finalHtml = html;
        if (!html.includes('var CSRF_TOKEN') && !html.includes('<!DOCTYPE')) {
            addLog('TRY_ALT_ENCODING', true);
            const altResponse = await fetch(pageUrl, {
                headers: {
                    ...HEADERS,
                    ...getCookieHeader(),
                    'Accept-Encoding': 'gzip, deflate'
                }
            });
            if (altResponse.ok) {
                updateCookies(altResponse);
                finalHtml = await altResponse.text();
                addLog('ALT_HTML_LEN', finalHtml.length);
            }
        }
        
        // ==================== LEGENDADO (via vidsrc-embed) ====================
        addLog('LEGENDADO_INICIO', 'Buscando via vidsrc-embed');
        
        let vidsrcUrl;
        if (mediaType === 'movie') {
            // Filmes: usar IMDB ID
            const imdbId = await getImdbIdFromTmdb(tmdbId, mediaType);
            if (imdbId) {
                vidsrcUrl = `https://vidsrc-embed.ru/embed/${imdbId}`;
                addLog('IMDB_ID', imdbId);
            } else {
                addLog('IMDB_ID_NAO_ENCONTRADO', true);
                vidsrcUrl = null;
            }
        } else {
            // Séries: usar TMDB ID + temporada + episódio
            vidsrcUrl = `https://vsembed.ru/embed/${tmdbId}/${targetSeason}-${targetEpisode}`;
        }
        
        if (vidsrcUrl) {
            addLog('VIDSRC_URL', vidsrcUrl);
            
            try {
                const vidsrcResponse = await fetch(vidsrcUrl, {
                    method: 'GET',
                    headers: VIDSRC_HEADERS
                });
                
                addLog('VIDSRC_STATUS', vidsrcResponse.status);
                
                if (vidsrcResponse.ok) {
                    const vidsrcHtml = await vidsrcResponse.text();
                    addLog('VIDSRC_HTML_LEN', vidsrcHtml.length);
                    
                    // Extrair iframe do vidsrc-embed (rcp)
                    const rcpMatch = vidsrcHtml.match(/<iframe[^>]*src=["']([^"']+)["']/);
                    if (rcpMatch) {
                        let rcpUrl = rcpMatch[1];
                        if (rcpUrl.startsWith('//')) rcpUrl = 'https:' + rcpUrl;
                        if (rcpUrl.startsWith('/')) rcpUrl = 'https://cloudnestra.com' + rcpUrl;
                        addLog('RCP_URL', rcpUrl.substring(0, 100));
                        
                        // Fazer requisição para o rcp
                        const rcpResponse = await fetch(rcpUrl, {
                            method: 'GET',
                            headers: {
                                ...VIDSRC_HEADERS,
                                'Referer': vidsrcUrl
                            }
                        });
                        
                        addLog('RCP_STATUS', rcpResponse.status);
                        
                        if (rcpResponse.ok) {
                            const rcpHtml = await rcpResponse.text();
                            addLog('RCP_HTML_LEN', rcpHtml.length);
                            
                            // Extrair a URL do prorcp do JavaScript
                            const srcMatch = rcpHtml.match(/src:\s*['"]([^'"]+)['"]/);
                            if (srcMatch) {
                                let prorcpUrl = srcMatch[1];
                                addLog('SRC_ENCONTRADO', prorcpUrl.substring(0, 100));
                                
                                if (prorcpUrl.startsWith('/')) {
                                    prorcpUrl = 'https://cloudnestra.com' + prorcpUrl;
                                }
                                
                                if (prorcpUrl.includes('/prorcp/')) {
                                    addLog('PRORCP_URL', prorcpUrl.substring(0, 100));
                                    
                                    // Fazer requisição para o prorcp
                                    const prorcpResponse = await fetch(prorcpUrl, {
                                        method: 'GET',
                                        headers: {
                                            ...VIDSRC_HEADERS,
                                            'Referer': rcpUrl
                                        }
                                    });
                                    
                                    addLog('PRORCP_STATUS', prorcpResponse.status);
                                    
                                    if (prorcpResponse.ok) {
                                        const prorcpHtml = await prorcpResponse.text();
                                        addLog('PRORCP_HTML_LEN', prorcpHtml.length);
                                        
                                        let finalVideoUrl = null;
                                        
                                        // Procurar por URL .m3u8 no prorcp
                                        const m3u8Match = prorcpHtml.match(/https?:\/\/[^"'\s]+\.m3u8[^"'\s]*/);
                                        if (m3u8Match) {
                                            finalVideoUrl = m3u8Match[0];
                                            addLog('M3U8_ENCONTRADA', finalVideoUrl.substring(0, 100));
                                        }
                                        
                                        // Procurar por file: no Playerjs
                                        if (!finalVideoUrl) {
                                            const playerjsMatch = prorcpHtml.match(/file:\s*["']([^"']+\.m3u8[^"']*)["']/);
                                            if (playerjsMatch) {
                                                finalVideoUrl = playerjsMatch[1];
                                                addLog('PLAYERJS_URL_ENCONTRADA', finalVideoUrl.substring(0, 100));
                                            }
                                        }
                                        
                                        // Procurar por securedLink
                                        if (!finalVideoUrl) {
                                            const securedMatch = prorcpHtml.match(/securedLink["']?\s*:\s*["']([^"']+\.m3u8[^"']*)["']/);
                                            if (securedMatch) {
                                                finalVideoUrl = securedMatch[1];
                                                addLog('SECUREDLINK_ENCONTRADA', finalVideoUrl.substring(0, 100));
                                            }
                                        }
                                        
                                        // Procurar por videoSource
                                        if (!finalVideoUrl) {
                                            const sourceMatch = prorcpHtml.match(/videoSource["']?\s*:\s*["']([^"']+\.m3u8[^"']*)["']/);
                                            if (sourceMatch) {
                                                finalVideoUrl = sourceMatch[1];
                                                addLog('VIDEOSOURCE_ENCONTRADA', finalVideoUrl.substring(0, 100));
                                            }
                                        }
                                        
                                        if (finalVideoUrl) {
                                            // Corrigir URL substituindo placeholders
                                            finalVideoUrl = fixVideoUrl(finalVideoUrl);
                                            addLog('URL_CORRIGIDA', finalVideoUrl.substring(0, 100));
                                            
                                            let quality = 720;
                                            if (finalVideoUrl.includes('2160') || finalVideoUrl.includes('4k')) quality = 2160;
                                            else if (finalVideoUrl.includes('1440')) quality = 1440;
                                            else if (finalVideoUrl.includes('1080')) quality = 1080;
                                            else if (finalVideoUrl.includes('720')) quality = 720;
                                            else if (finalVideoUrl.includes('480')) quality = 480;
                                            
                                            let title;
                                            if (mediaType === 'movie') {
                                                title = `Filme ${tmdbId}`;
                                            } else {
                                                title = `S${targetSeason.toString().padStart(2, '0')}E${targetEpisode.toString().padStart(2, '0')}`;
                                            }
                                            
                                            results.push({
                                                name: `SuperFlix Legendado ${quality}p`,
                                                title: title,
                                                url: finalVideoUrl,
                                                quality: quality,
                                                headers: {
                                                    'Referer': 'https://cloudnestra.com/',
                                                    'User-Agent': HEADERS['User-Agent']
                                                }
                                            });
                                            
                                            addLog('LEGENDADO_SUCESSO', { quality, url: finalVideoUrl.substring(0, 80) });
                                        } else {
                                            addLog('LEGENDADO_URL_NAO_ENCONTRADA', true);
                                        }
                                    }
                                } else {
                                    addLog('PRORCP_NAO_ENCONTRADO', prorcpUrl.substring(0, 100));
                                }
                            } else {
                                addLog('SRC_NAO_ENCONTRADO', true);
                            }
                        }
                    } else {
                        addLog('RCP_NAO_ENCONTRADO', true);
                    }
                }
            } catch (e) {
                addLog('LEGENDADO_ERRO', e.message);
            }
        }
        
        // ==================== DUBLADO (via API SuperFlix) ====================
        addLog('DUBLADO_INICIO', 'Buscando via API');
        
        const csrfMatch = finalHtml.match(/var CSRF_TOKEN\s*=\s*["']([^"']+)["']/);
        if (!csrfMatch) {
            addLog('CSRF_TOKEN_NAO_ENCONTRADO', true);
            return results;
        }
        SESSION_DATA.csrfToken = csrfMatch[1];
        addLog('CSRF_TOKEN', SESSION_DATA.csrfToken.substring(0, 30) + '...');
        
        const pageMatch = finalHtml.match(/var PAGE_TOKEN\s*=\s*["']([^"']+)["']/);
        if (!pageMatch) {
            addLog('PAGE_TOKEN_NAO_ENCONTRADO', true);
            return results;
        }
        SESSION_DATA.pageToken = pageMatch[1];
        addLog('PAGE_TOKEN', SESSION_DATA.pageToken.substring(0, 30) + '...');
        
        let contentId = null;
        
        if (mediaType === 'movie') {
            const initialContentMatch = finalHtml.match(/INITIAL_CONTENT_ID\s*=\s*(\d+)/);
            if (initialContentMatch) {
                contentId = initialContentMatch[1];
                addLog('CONTENT_ID_FILME', contentId);
            } else {
                const dataContentMatch = finalHtml.match(/data-contentid=["'](\d+)["']/);
                if (dataContentMatch) contentId = dataContentMatch[1];
                addLog('CONTENT_ID_FALLBACK', contentId);
            }
        } else {
            const epMatch = finalHtml.match(/var ALL_EPISODES\s*=\s*(\{.*?\});/s);
            if (epMatch) {
                try {
                    const episodes = JSON.parse(epMatch[1]);
                    const seasonData = episodes[targetSeason.toString()];
                    if (seasonData) {
                        for (let i = 0; i < seasonData.length; i++) {
                            if (seasonData[i].epi_num === targetEpisode) {
                                contentId = seasonData[i].ID?.toString();
                                addLog('CONTENT_ID_SERIE', { episode: targetEpisode, contentId });
                                break;
                            }
                        }
                    }
                } catch (e) {
                    addLog('PARSE_EPISODES_ERROR', e.message);
                }
            }
        }
        
        if (!contentId) {
            addLog('CONTENT_ID_NAO_ENCONTRADO', true);
            return results;
        }
        
        const optionsParams = new URLSearchParams();
        optionsParams.append('contentid', contentId);
        optionsParams.append('type', mediaType === 'movie' ? 'filme' : 'serie');
        optionsParams.append('_token', SESSION_DATA.csrfToken);
        optionsParams.append('page_token', SESSION_DATA.pageToken);
        optionsParams.append('pageToken', SESSION_DATA.pageToken);
        
        addLog('OPTIONS_REQUEST', { contentId });
        
        const optionsResponse = await fetch(`${BASE_URL}/player/options`, {
            method: 'POST',
            headers: {
                ...API_HEADERS,
                'X-Page-Token': SESSION_DATA.pageToken,
                'Referer': pageUrl,
                ...getCookieHeader()
            },
            body: optionsParams.toString()
        });
        
        addLog('OPTIONS_STATUS', optionsResponse.status);
        
        if (!optionsResponse.ok) {
            addLog('OPTIONS_FAIL', optionsResponse.status);
            return results;
        }
        
        const optionsData = await optionsResponse.json();
        const optionsArray = optionsData?.data?.options || [];
        addLog('OPTIONS_COUNT', optionsArray.length);
        
        for (const option of optionsArray) {
            if (option.type !== 1) {
                addLog('PULAR_SERVIDOR', { id: option.ID, type: option.type, motivo: 'não é dublado' });
                continue;
            }
            
            const videoId = option.ID;
            addLog('PROCESSANDO_DUBLADO', { videoId });
            
            const sourceParams = new URLSearchParams();
            sourceParams.append('video_id', videoId);
            sourceParams.append('page_token', SESSION_DATA.pageToken);
            sourceParams.append('_token', SESSION_DATA.csrfToken);
            
            const sourceResponse = await fetch(`${BASE_URL}/player/source`, {
                method: 'POST',
                headers: {
                    ...API_HEADERS,
                    'Referer': pageUrl,
                    ...getCookieHeader()
                },
                body: sourceParams.toString()
            });
            
            addLog('SOURCE_STATUS', sourceResponse.status);
            
            if (!sourceResponse.ok) {
                addLog('SOURCE_FAIL', sourceResponse.status);
                continue;
            }
            
            const sourceData = await sourceResponse.json();
            const redirectUrl = sourceData?.data?.video_url;
            addLog('REDIRECT_URL', redirectUrl ? redirectUrl.substring(0, 100) + '...' : 'null');
            
            if (!redirectUrl) continue;
            
            const redirectResponse = await fetch(redirectUrl, {
                method: 'GET',
                headers: {
                    ...HEADERS,
                    ...getCookieHeader()
                },
                redirect: 'follow'
            });
            
            addLog('REDIRECT_STATUS', redirectResponse.status);
            
            if (!redirectResponse.ok) {
                addLog('REDIRECT_FAIL', redirectResponse.status);
                continue;
            }
            
            const playerUrl = redirectResponse.url;
            const playerHash = playerUrl.split('/').pop();
            addLog('PLAYER_HASH', playerHash);
            
            const videoParams = new URLSearchParams();
            videoParams.append('hash', playerHash);
            videoParams.append('r', '');
            
            const videoResponse = await fetch(`${CDN_BASE}/player/index.php?data=${playerHash}&do=getVideo`, {
                method: 'POST',
                headers: {
                    'Accept': '*/*',
                    'Accept-Language': 'pt-BR',
                    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                    'Origin': CDN_BASE,
                    'Referer': `${CDN_BASE}/`,
                    'X-Requested-With': 'XMLHttpRequest',
                    'User-Agent': HEADERS['User-Agent']
                },
                body: videoParams.toString()
            });
            
            addLog('VIDEO_STATUS', videoResponse.status);
            
            if (!videoResponse.ok) {
                addLog('VIDEO_FAIL', videoResponse.status);
                continue;
            }
            
            const videoData = await videoResponse.json();
            const finalUrl = videoData.securedLink || videoData.videoSource;
            addLog('FINAL_URL', finalUrl ? finalUrl.substring(0, 100) + '...' : 'null');
            
            if (!finalUrl) continue;
            
            let quality = 720;
            if (finalUrl.includes('2160') || finalUrl.includes('4k')) quality = 2160;
            else if (finalUrl.includes('1440')) quality = 1440;
            else if (finalUrl.includes('1080')) quality = 1080;
            else if (finalUrl.includes('720')) quality = 720;
            else if (finalUrl.includes('480')) quality = 480;
            
            let title;
            if (mediaType === 'movie') {
                title = `Filme ${tmdbId}`;
            } else {
                title = `S${targetSeason.toString().padStart(2, '0')}E${targetEpisode.toString().padStart(2, '0')}`;
            }
            
            results.push({
                name: `SuperFlix Dublado ${quality}p`,
                title: title,
                url: finalUrl,
                quality: quality,
                headers: {
                    'Referer': `${CDN_BASE}/`,
                    'User-Agent': HEADERS['User-Agent']
                }
            });
        }
        
        addLog('RESULTADO_FINAL', { total: results.length, tipos: results.map(r => r.name) });
        return results;
        
    } catch (error) {
        addLog('CATCH_ERROR', error.message);
        return results;
    }
}

module.exports = { getStreams };
