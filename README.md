# Nuvio Providers - Compiled by =[D3adly]=

A collection of high-quality local scrapers for the Nuvio streaming application. These scrapers allow you to fetch premium streams from various sources directly within the app.

## Installation

1. Open **Nuvio** app
2. Go to **Settings → Local Scrapers**
3. Add this repository URL:
   ```
   https://raw.githubusercontent.com/D3adlyRocket/All-in-One-Nuvio/refs/heads/main/manifest.json
   ```
4. Enable the scrapers you want to use

## Available Scrapers 

| Provider | Content | Quality | NuvioApp | NuvioTV |
|---|---|---|---|---|
| 📽️ AnimeKai | Anime | 1080p / 720p | ✅ | ✅ |
| 🎥 KissKH | Asian Movies / Drama | 1080p / 720p | ✅ | ✅ |
| 🎥 VidSrc | Film & Serial | 1080p / 720p | ✅ | ✅ |
| 🎬 VidLink | Film & Serial | 1080p / 720p | ✅ | ✅ |


### 4KHDHub
- **Status**: ✅ Active and Tested
- **Description**: Premium 4K/UHD streaming with multiple quality options
- **Supported Types**: Movies, TV Shows
- **Supported Languages**: English, Hindi
- **Quality Options**: 360p, 480p, 720p, 1080p, 1440p, 2160p (4K)

## Features

- 🎬 Movies and TV Shows support
- 🎯 Automatic TMDB integration
- 📊 Multiple quality options
- 🌍 Multi-language support
- ⚡ Fast and reliable scraping
- 🔒 Proper headers and referer handling

## How It Works

1. Search for a movie or TV show in Nuvio
2. The scraper fetches content metadata from TMDB
3. It searches the streaming provider for matching content
4. Returns available streams with quality information
5. Select a stream and play

## Development

### Provider Structure

Each provider must:
- Export a `getStreams` function
- Use Promise-based approach (NO async/await)
- Return an array of stream objects
- Handle errors gracefully

### Stream Object Format

```javascript
{
    name: "Provider - Quality",           // Display name
    title: "Movie Title (Year)",          // Full title with year
    url: "https://stream-url",            // Direct stream URL
    quality: "1080p",                     // Quality level
    size: "2.5GB",                        // File size (optional)
    provider: "provider-id",              // Provider identifier
    headers: {                            // Required headers
        'User-Agent': '...',
        'Referer': '...'
    }
}
```

### Function Signature

```javascript
function getStreams(tmdbId, mediaType, seasonNum, episodeNum) {
    // tmdbId: TMDB ID (string)
    // mediaType: "movie" or "tv" (string)
    // seasonNum: Season number (number, TV only)
    // episodeNum: Episode number (number, TV only)
    
    return Promise.resolve([...streams]);
}
```

## Troubleshooting

### No Streams Found
- Ensure you have a stable internet connection
- Try searching for popular content
- Check if the provider is enabled in settings

### Slow Loading
- Providers may take 5-15 seconds to search
- This is normal due to multiple HTTP requests
- Patient waiting is required

### Streams Won't Play
- Try opening in an external player
- Check if the stream URL is accessible from your region
- Some streams may be region-restricted

## Requirements

- Nuvio app (latest version recommended)
- Stable internet connection
- JavaScript enabled in Nuvio

## Performance

- **Average Search Time**: 5-15 seconds
- **Success Rate**: 85%+
- **Quality Support**: Up to 4K (2160p)
- **Concurrent Requests**: Optimized for stability

## License

This project is licensed under the GNU General Public License v3.0 - see the LICENSE file for details.

## Disclaimer

This project is for educational purposes only. Users are responsible for ensuring their use complies with applicable laws and regulations in their jurisdiction.

## Support

For issues or questions:
1. Check this README
2. Review provider logs in Nuvio
3. Verify internet connection
4. Try with different content

## Version History

### v1.0.0
- Initial release with 4KHDHub provider
- Full movie and TV show support
- Multiple quality options
- Proper error handling

---

**Created with ❤️ for Nuvio**
