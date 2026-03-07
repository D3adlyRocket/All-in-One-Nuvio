import fetch from "node-fetch";
import * as cheerio from "cheerio";

const PROVIDER_NAME = "AsiaFlix";
const BASE_URL = "https://asiaflix.net";

async function search(title) {
    try {
        const res = await fetch(`${BASE_URL}/search?q=${encodeURIComponent(title)}`);
        const html = await res.text();
        const $ = cheerio.load(html);

        let results = [];

        $(".film_list-wrap .flw-item").each((i, el) => {
            const name = $(el).find(".film-detail a").text().trim();
            const url = BASE_URL + $(el).find(".film-detail a").attr("href");

            results.push({
                title: name,
                url
            });
        });

        return results;

    } catch (err) {
        console.log(PROVIDER_NAME, "search error", err);
        return [];
    }
}

async function getEpisodePage(url, season, episode) {
    try {
        const res = await fetch(url);
        const html = await res.text();
        const $ = cheerio.load(html);

        let epUrl = null;

        $(".episodes-list a").each((i, el) => {
            const epNum = i + 1;

            if (epNum === episode) {
                epUrl = BASE_URL + $(el).attr("href");
            }
        });

        return epUrl;

    } catch {
        return null;
    }
}

async function extractIframe(url) {
    try {
        const res = await fetch(url);
        const html = await res.text();
        const $ = cheerio.load(html);

        let iframe = $("iframe").attr("src");

        return iframe || null;

    } catch {
        return null;
    }
}

export async function getStreams(tmdbId, type, season, episode) {

    try {

        // Get TMDB title
        const tmdb = await fetch(
            `https://api.themoviedb.org/3/${type}/${tmdbId}?api_key=439c478a771f35c05022f9feabcca01c`
        );

        const data = await tmdb.json();
        const title = type === "movie" ? data.title : data.name;

        const results = await search(title);

        if (!results.length) return [];

        const page = results[0].url;

        let episodePage = page;

        if (type === "tv") {
            episodePage = await getEpisodePage(page, season, episode);
        }

        if (!episodePage) return [];

        const iframe = await extractIframe(episodePage);

        if (!iframe) return [];

        return [
            {
                name: PROVIDER_NAME,
                url: iframe,
                type: "embed"
            }
        ];

    } catch (err) {
        console.log(PROVIDER_NAME, "error", err);
        return [];
    }
}
