export const NETMIRROR_URL = "https://net52.cc";
export const TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c";

export const PLATFORM_MAP = {
    netflix: { 
        ott: 'nf', 
        search: '/mobile/search.php', 
        post: '/mobile/post.php', 
        episodes: '/mobile/episodes.php', 
        playlist: '/mobile/playlist.php', 
        img: 'poster/v',
        epImg: 'epimg/150'
    },
    primevideo: { 
        ott: 'pv', 
        search: '/mobile/pv/search.php', 
        post: '/mobile/pv/post.php', 
        episodes: '/mobile/pv/episodes.php', 
        playlist: '/mobile/pv/playlist.php', 
        img: 'pv/v',
        epImg: 'pvepimg'
    },
    hotstar: { 
        ott: 'hs', 
        search: '/mobile/hs/search.php', 
        post: '/mobile/hs/post.php', 
        episodes: '/mobile/hs/episodes.php', 
        playlist: '/mobile/hs/playlist.php', 
        img: 'hs/v',
        epImg: 'hsepimg'
    },
    disney: { 
        ott: 'hs', 
        search: '/mobile/hs/search.php', 
        post: '/mobile/hs/post.php', 
        episodes: '/mobile/hs/episodes.php', 
        playlist: '/mobile/hs/playlist.php', 
        img: 'hs/v',
        epImg: 'hsepimg'
    }
};

export const BASE_HEADERS = {
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
    "Accept-Language": "en-IN,en-US;q=0.9,en;q=0.8",
    "Cache-Control": "max-age=0",
    "Connection": "keep-alive",
    "sec-ch-ua": "\"Not(A:Brand\";v=\"8\", \"Chromium\";v=\"144\", \"Android WebView\";v=\"144\"",
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": "\"Android\"",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "same-origin",
    "Sec-Fetch-User": "?1",
    "Upgrade-Insecure-Requests": "1",
    "User-Agent": "Mozilla/5.0 (Linux; Android 13; Pixel 5 Build/TQ3A.230901.001; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/144.0.7559.132 Safari/537.36 /OS.Gatu v3.0",
    "X-Requested-With": "XMLHttpRequest"
};
