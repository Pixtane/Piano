const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files
app.use('/assets', express.static(path.join(__dirname, 'assets')));
app.use('/songs', express.static(path.join(__dirname, 'songs')));
app.use('/src', express.static(path.join(__dirname, 'src')));
app.use(express.static(path.join(__dirname, 'public')));

// API Routes
app.get('/api/songs', (req, res) => {
  try {
    const manifestPath = path.join(__dirname, 'songs', 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const songs = [];

    for (const file of manifest.songs || []) {
      try {
        const songPath = path.join(__dirname, 'songs', file);
        if (fs.existsSync(songPath)) {
          const songData = JSON.parse(fs.readFileSync(songPath, 'utf8'));
          songs.push(songData);
        }
      } catch (error) {
        console.error(`Error loading song ${file}:`, error);
      }
    }

    res.json(songs);
  } catch (error) {
    console.error('Error loading songs:', error);
    res.status(500).json({ error: 'Failed to load songs' });
  }
});

app.post('/api/songs', (req, res) => {
  try {
    const { name, composer, description, data } = req.body;

    if (!name || !data) {
      return res.status(400).json({ error: 'Name and data are required' });
    }

    // Sanitize filename
    const sanitizedName = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    const fileName = `${sanitizedName}.json`;

    const songData = {
      name,
      composer: composer || 'Unknown',
      description: description || '',
      data
    };

    // Save song file
    const songPath = path.join(__dirname, 'songs', fileName);
    fs.writeFileSync(songPath, JSON.stringify(songData, null, 2));

    // Update manifest
    const manifestPath = path.join(__dirname, 'songs', 'manifest.json');
    let manifest = { songs: [] };
    
    if (fs.existsSync(manifestPath)) {
      manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    }

    if (!manifest.songs.includes(fileName)) {
      manifest.songs.push(fileName);
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    }

    res.json({ success: true, fileName, song: songData });
  } catch (error) {
    console.error('Error saving song:', error);
    res.status(500).json({ error: 'Failed to save song' });
  }
});

// Serve main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🎹 Virtuoso Piano Server running on http://localhost:${PORT}`);
});

