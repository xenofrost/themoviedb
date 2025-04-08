# TV Show Organizer

A web-based TV show organizer application that uses the TMDB (The Movie Database) API to help you manage and track your favorite TV shows.

![](screenshot/screenshot.png)

## Features

- Search for TV shows using TMDB's extensive database
- View detailed information about TV shows
- RESTful API endpoints for TV show data
- Cross-origin resource sharing (CORS) enabled
- Uses shoelace UI - https://shoelace.style/

## Prerequisites

Before you begin, ensure you have installed:
- Node.js (v12 or higher)
- npm (comes with Node.js)

## Installation

1. Clone the repository:
```bash
git clone https://github.com/xenofrost/themoviedb.git
cd themoviedb
```

2. Install dependencies:
```bash
npm install
```

3. Edit a `.env` file in the root directory:
```env
TMDB_API_KEY=your_tmdb_api_key_here
TMDB_READ_ACCESS_TOKEN=your_tmdb_read_access_token
TV_SHOWS_BASE_PATH=//PATH/TO/YOUR/TVSHOWS
PORT=3000
```
Replace `your_tmdb_api_key_here` with your actual TMDB API key. You can get one by registering at [TMDB's website](https://www.themoviedb.org/documentation/api). 
Replace `your_tmdb_read_access_token` with your actual TMDB read access token. You can get one by registering at [TMDB's website](https://www.themoviedb.org/documentation/api).

## Usage

### Development Mode

To run the application in development mode with auto-reload:

```bash
npm run dev
```

### Production Mode

To run the application in production mode:

```bash
npm start
```

The server will start on the default port (usually 3000 unless specified otherwise in your environment variables).

## Project Structure

```
themoviedb/
├── node_modules/
├── themoviedb.js    # Main application file
├── package.json     # Project dependencies and scripts
├── .env            # Environment variables
└── README.md       # Project documentation
```

## Dependencies

- express: ^4.18.2 - Web framework for Node.js
- axios: ^1.6.0 - HTTP client for making API requests
- cors: ^2.8.5 - Middleware for enabling CORS
- dotenv: ^16.3.1 - Loading environment variables
- nodemon: ^3.0.1 (dev dependency) - Development auto-reload utility

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- [TMDB](https://www.themoviedb.org/) for providing the API
- All contributors and maintainers
