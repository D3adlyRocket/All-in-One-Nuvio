console.log("UHDMovies provider loaded");

const TMDB = "439c478a771f35c05022f9feabcca01c";
const DOMAIN = "https://uhdmovies.tips";

function request(url){
    return fetch(url,{
        headers:{
            "User-Agent":"Mozilla/5.0",
            "Accept":"text/html"
        }
    }).then(r=>{
        if(!r.ok) throw new Error();
        return r.text();
    });
}

function findPost(html){
    const m = html.match(/<a href="(https:\/\/uhdmovies[^"]+)"[^>]*class="post-title"/i);
    return m ? m[1] : null;
}

function extractLinks(html){

    const results=[];
    const regex=/<a href="(https?:\/\/[^"]+)"/gi;

    let m;
    while((m=regex.exec(html))!==null){

        const url=m[1];

        if(
            url.includes("driveleech") ||
            url.includes("gdflix") ||
            url.includes("hubdrive") ||
            url.includes("pixeldrain") ||
            url.includes("1fichier")
        ){
            results.push({
                name:"UHDMovies",
                title:"UHDMovies",
                url:url,
                quality:"HD",
                provider:"uhdmovies"
            });
        }
    }

    return results;
}

async function scrape(title,year){

    const search=`${DOMAIN}/?s=${encodeURIComponent(title+" "+year)}`;
    console.log("search",search);

    const searchHtml=await request(search).catch(()=>null);
    if(!searchHtml) return [];

    const post=findPost(searchHtml);
    if(!post) return [];

    const page=await request(post).catch(()=>null);
    if(!page) return [];

    return extractLinks(page);
}

function getStreams(tmdbId,type="movie",season=null,episode=null){

    const url=`https://api.themov
