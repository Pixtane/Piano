# 🎹 Virtuoso Web Piano

A modular, server-ready web-based piano application with recording, playback, metronome, and MIDI file support.

## Features

- **88-key Piano**: Full piano keyboard with visual feedback
- **Multiple Input Modes**: Real keys (q2w3...) or Max keys (123...) mapping
- **Recording & Playback**: Record your performances and play them back
- **Metronome**: Adjustable BPM and time signature (4/4, 3/4)
- **MIDI Support**: Upload and convert MIDI files to playable songs
- **Song Marketplace**: Browse and import pre-loaded songs
- **Sustain Pedal**: Toggle or hold mode with spacebar

## Project Structure

```
Piano/
├── server.js          # Express server
├── package.json       # Dependencies
├── public/            # Static files served to client
│   ├── index.html     # Main HTML file
│   ├── styles.css     # Stylesheet
│   └── app.js         # Main application logic (Alpine.js)
├── src/               # Modular source code
│   ├── constants.js   # Constants (key mappings, notes)
│   ├── audio.js       # Audio initialization and playback
│   ├── piano.js       # Piano key generation and input handling
│   ├── recording.js   # Recording storage and management
│   ├── playback.js    # Playback functionality
│   ├── metronome.js   # Metronome logic
│   └── marketplace.js # Song marketplace and MIDI parsing
├── assets/            # Audio samples (piano keys, metronome)
└── songs/             # Song files and manifest
```

## Installation

1. Install dependencies:
```bash
npm install
```

2. Make sure you have the `assets/` folder with all the required audio samples:
   - Piano samples: `24.mp3`, `29.mp3`, `36.mp3`, `41.mp3`, `48.mp3`, `53.mp3`, `60.mp3`, `64.mp3`, `65.mp3`, `69.mp3`, `72.mp3`, `77.mp3`, `79.mp3`, `84.mp3`, `96.mp3`
   - Metronome samples: `metro-hi-final.mp3`, `metro-low-final.mp3`

3. Ensure the `songs/` folder exists with a `manifest.json` file listing available songs.

## Running the Server

Start the server:
```bash
npm start
```

The application will be available at `http://localhost:3000`

## API Endpoints

### GET `/api/songs`
Returns a list of all available songs from the marketplace.

### POST `/api/songs`
Saves a new song to the server.

**Request Body:**
```json
{
  "name": "Song Name",
  "composer": "Composer Name",
  "description": "Song description",
  "data": [/* array of note events */]
}
```

## Usage

### Playing the Piano

- **Real Keys Mode**: Use keys like `q`, `2`, `w`, `3`, `e`, `r`, etc. to play notes
- **Max Keys Mode**: Use number and letter keys sequentially
- **Mouse**: Click on piano keys to play
- **Sustain**: Press spacebar to toggle/hold sustain pedal

### Recording

1. Click the "● Record" button
2. Play your piece
3. Click "■ Stop & Save" when done
4. Enter a name for your recording
5. Your recording will appear in the recordings panel

### Metronome

1. Set your desired BPM (30-300)
2. Choose time signature (4/4 or 3/4)
3. Click "Start" to begin

### MIDI Upload

1. Click "🎵 Marketplace"
2. Drag and drop a MIDI file or click to select
3. Edit song name, composer, description, and tempo
4. Preview the song
5. Click "💾 Save to Songs" to add it to the marketplace

## Technologies

- **Backend**: Node.js with Express
- **Frontend**: Alpine.js for reactivity
- **Audio**: Tone.js for audio synthesis
- **Styling**: CSS3 with CSS variables

## Browser Compatibility

Requires a modern browser with:
- ES6 module support
- Web Audio API support
- LocalStorage support

## License

MIT



