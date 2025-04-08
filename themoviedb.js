const express = require('express');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const { Worker } = require('worker_threads');
require('dotenv').config(); // Load environment variables from .env file

const app = express();
const PORT = process.env.PORT || 3000;

// Configure middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// TMDB API configuration
const TMDB_API_KEY = process.env.TMDB_API_KEY;
const TMDB_READ_ACCESS_TOKEN = process.env.TMDB_READ_ACCESS_TOKEN;

// Base path for TV shows
const TV_SHOWS_BASE_PATH = process.env.TV_SHOWS_BASE_PATH;

// Verify configuration
if (!TMDB_API_KEY || !TMDB_READ_ACCESS_TOKEN) {
    console.error('Error: TMDB API credentials are missing. Please check your .env file.');
    process.exit(1);
}

if (!TV_SHOWS_BASE_PATH) {
    console.error('Error: TV_SHOWS_BASE_PATH is missing. Please check your .env file.');
    process.exit(1);
}

console.log(`Using TV show path: ${TV_SHOWS_BASE_PATH}`);

// Verify path exists
try {
    if (!fs.existsSync(TV_SHOWS_BASE_PATH)) {
        console.error(`Error: TV show path does not exist or is not accessible: ${TV_SHOWS_BASE_PATH}`);
        console.error('Make sure the network share is mounted and accessible.');
        process.exit(1);
    } else {
        console.log('TV show path exists and is accessible.');
    }
} catch (error) {
    console.error(`Error accessing TV show path: ${error.message}`);
    process.exit(1);
}

// Configure axios defaults for TMDB
const tmdbAPI = axios.create({
  baseURL: 'https://api.themoviedb.org/3',
  headers: {
    'Authorization': `Bearer ${TMDB_READ_ACCESS_TOKEN}`,
    'Content-Type': 'application/json'
  }
});

// TMDB image configuration
const TMDB_IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/';
const TMDB_POSTER_SIZE = 'w500';

// Helper function to download an image
async function downloadImage(imageUrl, outputPath) {
    if (!imageUrl) return false;

    const fullImageUrl = `${TMDB_IMAGE_BASE_URL}${TMDB_POSTER_SIZE}${imageUrl}`;

    try {
        const response = await axios({
            method: 'GET',
            url: fullImageUrl,
            responseType: 'stream'
        });

        const writer = fs.createWriteStream(outputPath);
        response.data.pipe(writer);

        return new Promise((resolve, reject) => {
            writer.on('finish', () => resolve(true));
            writer.on('error', err => {
                fs.unlink(outputPath, () => reject(err));
            });
        });
    } catch (error) {
        console.error(`Failed to download image:`, error.message);
        return false;
    }
}

// Get available TV show folders
app.get('/api/folders', (req, res) => {
    try {
        const folders = fs.readdirSync(TV_SHOWS_BASE_PATH)
            .filter(item => {
                const itemPath = path.join(TV_SHOWS_BASE_PATH, item);
                return fs.statSync(itemPath).isDirectory();
            })
            .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })) // Sort alphabetically, case insensitive
            .map(folder => ({
                name: folder,
                path: path.join(TV_SHOWS_BASE_PATH, folder)
            }));

        res.json({ success: true, folders });
    } catch (error) {
        console.error('Error reading folders:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Search TMDB for TV shows
app.get('/api/search', async (req, res) => {
    const query = req.query.query;

    if (!query) {
        return res.status(400).json({ success: false, error: 'Query parameter is required' });
    }

    try {
        const response = await tmdbAPI.get('/search/tv', {
            params: { query }
        });

        const shows = response.data.results.map(show => ({
            id: show.id,
            name: show.name,
            overview: show.overview,
            poster_path: show.poster_path,
            first_air_date: show.first_air_date,
            year: show.first_air_date ? new Date(show.first_air_date).getFullYear() : 'Unknown'
        }));

        res.json({ success: true, shows });
    } catch (error) {
        console.error('Error searching shows:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get details for a specific show
app.get('/api/show/:id', async (req, res) => {
    const { id } = req.params;

    try {
        const response = await tmdbAPI.get(`/tv/${id}`);
        const show = {
            id: response.data.id,
            name: response.data.name,
            overview: response.data.overview,
            poster_path: response.data.poster_path,
            seasons: response.data.seasons,
            first_air_date: response.data.first_air_date,
            year: response.data.first_air_date ? new Date(response.data.first_air_date).getFullYear() : 'Unknown'
        };

        res.json({ success: true, show });
    } catch (error) {
        console.error('Error fetching show details:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get season details
app.get('/api/show/:id/season/:season', async (req, res) => {
    const { id, season } = req.params;

    try {
        const response = await tmdbAPI.get(`/tv/${id}/season/${season}`);
        res.json({ success: true, season: response.data });
    } catch (error) {
        console.error('Error fetching season details:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Process a TV show folder
app.post('/api/process', async (req, res) => {
    const { folderPath, showId, confirmRenames = false, downloadPosters = true } = req.body;

    if (!folderPath || !showId) {
        return res.status(400).json({
            success: false,
            error: 'Folder path and show ID are required'
        });
    }

    try {
        // Get show details
        const showResponse = await tmdbAPI.get(`/tv/${showId}`);
        const showInfo = showResponse.data;
        const officialShowName = showInfo.name;

        // Check if folder exists
        if (!fs.existsSync(folderPath)) {
            return res.status(404).json({
                success: false,
                error: 'Folder not found'
            });
        }

        // Send initial response to client
        res.json({
            success: true,
            message: 'Processing started',
            showName: officialShowName
        });

        // Start background processing
        processShowFolder(folderPath, showId, officialShowName, confirmRenames, downloadPosters);

    } catch (error) {
        console.error('Error processing folder:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Worker to process the show in the background
function processShowFolder(folderPath, showId, showName, confirmRenames, downloadPosters = true) {
    console.log(`Processing ${showName} in ${folderPath}...`);

    // Download show poster
    (async () => {
        try {
            // Get show info
            const showInfo = await tmdbAPI.get(`/tv/${showId}`);

            // Download show poster if enabled
            if (downloadPosters && showInfo.data.poster_path) {
                const showPosterPath = path.join(folderPath, `${showName} - Poster.jpg`);
                if (!fs.existsSync(showPosterPath)) {
                    console.log('Downloading show poster...');
                    await downloadImage(showInfo.data.poster_path, showPosterPath);
                }
            }

            // Find season folders
            const seasonFolders = fs.readdirSync(folderPath)
                .filter(item => {
                    const itemPath = path.join(folderPath, item);
                    return fs.statSync(itemPath).isDirectory() && /season\s*\d+/i.test(item);
                })
                .sort();

            if (!seasonFolders.length) {
                console.error('No season folders found');
                return;
            }

            // Process each season
            for (const folder of seasonFolders) {
                const season = parseInt(folder.match(/\d+/)[0]);
                const seasonPath = path.join(folderPath, folder);

                processSeasonFolder(seasonPath, showId, showName, season, downloadPosters);
            }

        } catch (error) {
            console.error('Error in background processing:', error);
        }
    })();
}

// Process a season folder
async function processSeasonFolder(folderPath, showId, showName, season, downloadPosters = true) {
    try {
        console.log(`Processing season ${season}...`);

        // Get season episodes
        const seasonResponse = await tmdbAPI.get(`/tv/${showId}/season/${season}`);
        const seasonEpisodes = seasonResponse.data.episodes || [];

        if (!seasonEpisodes.length) {
            console.error(`No episode data found for season ${season}`);
            return;
        }

        // Create posters directory if downloading is enabled and it doesn't exist
        let postersDir;
        if (downloadPosters) {
            postersDir = path.join(folderPath, 'posters');
            if (!fs.existsSync(postersDir)) {
                fs.mkdirSync(postersDir);
            }
        }

        // Get video files
        const files = fs.readdirSync(folderPath).sort();
        const videoFiles = files.filter(file => {
            const filePath = path.join(folderPath, file);
            const ext = path.extname(file);
            return ['.mp4', '.mkv', '.avi'].includes(ext.toLowerCase()) && !fs.statSync(filePath).isDirectory();
        });

        // Check if episode count matches file count
        if (videoFiles.length !== seasonEpisodes.length) {
            console.warn(`Warning: Number of video files (${videoFiles.length}) doesn't match episode count (${seasonEpisodes.length}) for season ${season}`);
        }

        let stats = { renamed: 0, skipped: 0, errors: 0, postersDownloaded: 0 };

        // Process each file
        for (const [index, file] of videoFiles.entries()) {
            try {
                const filePath = path.join(folderPath, file);
                const ext = path.extname(file);

                // Match file to episode by index (assumes files are ordered correctly)
                if (index >= seasonEpisodes.length) {
                    console.warn(`More files than episodes found for season ${season}`);
                    continue;
                }

                const episode = seasonEpisodes[index];
                const episodeNum = episode.episode_number;
                const episodeTitle = episode.name || 'Unknown';

                // Clean episode title to remove characters that are problematic for filenames
                const cleanTitle = episodeTitle
                    .replace(/[\\/:*?"<>|]/g, '') // Remove illegal filename characters
                    .replace(/\s+/g, ' ')         // Normalize whitespace
                    .trim();

                const expectedName = `${showName} - S${season.toString().padStart(2, '0')}E${episodeNum.toString().padStart(2, '0')} - ${cleanTitle}`;

                // Check if file already has correct name
                const isCorrectlyNamed = path.basename(file, ext) === expectedName;

                // Rename file if needed
                if (!isCorrectlyNamed) {
                    const newFilePath = path.join(folderPath, expectedName + ext);
                    fs.renameSync(filePath, newFilePath);
                    stats.renamed++;
                    console.log(`Renamed: ${file} -> ${expectedName + ext}`);
                } else {
                    stats.skipped++;
                }

                // Download episode poster if enabled
                if (downloadPosters && episode.still_path) {
                    const posterPath = path.join(postersDir, `${expectedName}.jpg`);

                    // Only download if poster doesn't already exist
                    if (!fs.existsSync(posterPath)) {
                        const downloaded = await downloadImage(episode.still_path, posterPath);
                        if (downloaded) {
                            stats.postersDownloaded++;
                            console.log(`Downloaded poster for ${expectedName}`);
                        }
                    }
                }
            } catch (error) {
                console.error(`Error processing file:`, error.message);
                stats.errors++;
            }
        }

        console.log(`Season ${season} processing complete:`);
        console.log(`  Renamed: ${stats.renamed}`);
        console.log(`  Skipped: ${stats.skipped}`);
        console.log(`  Posters Downloaded: ${stats.postersDownloaded}`);
        if (stats.errors) console.log(`  Errors: ${stats.errors}`);

    } catch (error) {
        console.error(`Error processing season ${season}:`, error.message);
    }
}

// Start the server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});