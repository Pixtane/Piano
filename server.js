const express = require("express");
const path = require("path");
const fs = require("fs");
const { File, Track } = require("jsmidgen");

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files
app.use("/assets", express.static(path.join(__dirname, "assets")));
app.use("/songs", express.static(path.join(__dirname, "songs")));
app.use("/src", express.static(path.join(__dirname, "src")));
app.use(express.static(path.join(__dirname, "public")));

// MIDI parsing utility (based on marketplace.js parseMidiFile)
function parseMidiFile(arrayBuffer, fileName) {
  try {
    const data = new Uint8Array(arrayBuffer);
    const events = [];
    let i = 0;

    // Skip MIDI header (14 bytes)
    if (data.length < 14) {
      console.error("MIDI file too short");
      return null;
    }

    // Check for MIDI header
    if (String.fromCharCode(data[0], data[1], data[2], data[3]) !== "MThd") {
      console.error("Invalid MIDI header");
      return null;
    }

    // Read header information
    const ticksPerQuarter = (data[12] << 8) | data[13];

    // Skip to track data
    i = 14;
    let tempo = 500000; // Default tempo (microseconds per quarter note)
    let runningStatus = 0; // For running status

    // Find tempo and notes
    while (i < data.length - 8) {
      // Look for track chunk
      if (
        i + 4 < data.length &&
        String.fromCharCode(data[i], data[i + 1], data[i + 2], data[i + 3]) ===
          "MTrk"
      ) {
        i += 4;
        const trackLength =
          (data[i] << 24) |
          (data[i + 1] << 16) |
          (data[i + 2] << 8) |
          data[i + 3];
        i += 4;
        const trackEnd = i + trackLength;

        let trackTime = 0;
        runningStatus = 0; // Reset running status for each track

        while (i < trackEnd && i < data.length - 1) {
          // Read delta time (variable length)
          let delta = 0;
          let byte = data[i++];
          delta = byte & 0x7f;
          while (byte & 0x80 && i < data.length) {
            byte = data[i++];
            delta = (delta << 7) | (byte & 0x7f);
          }

          trackTime += delta;

          if (i >= data.length) break;

          let status = data[i++];

          // Handle running status
          if (status < 0x80) {
            // This is a data byte, use previous status
            if (runningStatus === 0) {
              console.warn("Running status byte without previous status");
              continue;
            }
            status = runningStatus;
            i--; // Back up to re-read this byte
          } else {
            runningStatus = status;
          }

          const eventType = status & 0xf0;

          if (eventType === 0x90) {
            // Note On
            if (i + 1 >= data.length) break;
            const note = data[i++];
            const velocity = data[i++];

            if (velocity > 0 && note >= 21 && note <= 108) {
              const time = (trackTime * tempo) / (ticksPerQuarter * 1000000); // Convert to seconds
              events.push({
                time: time,
                type: "on",
                midi: note,
                sustain: true,
              });
            } else if (velocity === 0) {
              // Note On with velocity 0 is treated as Note Off
              if (note >= 21 && note <= 108) {
                const time = (trackTime * tempo) / (ticksPerQuarter * 1000000);
                events.push({
                  time: time,
                  type: "off",
                  midi: note,
                  sustain: true,
                });
              }
            }
          } else if (eventType === 0x80) {
            // Note Off
            if (i + 1 >= data.length) break;
            const note = data[i++];
            i++; // Skip velocity

            if (note >= 21 && note <= 108) {
              const time = (trackTime * tempo) / (ticksPerQuarter * 1000000);
              events.push({
                time: time,
                type: "off",
                midi: note,
                sustain: true,
              });
            }
          } else if (status === 0xff) {
            // Meta event
            if (i >= data.length) break;
            const metaType = data[i++];

            // Read length byte (required for all meta events)
            if (i >= data.length) break;
            const metaLength = data[i++];

            if (
              metaType === 0x51 &&
              metaLength === 0x03 &&
              i + 3 <= data.length
            ) {
              // Tempo change
              const tempoBytes = data.slice(i, i + 3);
              tempo =
                (tempoBytes[0] << 16) | (tempoBytes[1] << 8) | tempoBytes[2];
              i += 3;
            } else {
              // Other meta events - skip the data
              if (i + metaLength <= data.length) {
                i += metaLength;
              } else {
                break;
              }
            }
          } else {
            // Skip other events
            if (eventType === 0xc0 || eventType === 0xd0) {
              if (i < data.length) i++; // One data byte
            } else if (eventType === 0xe0 || eventType === 0xb0) {
              if (i + 1 < data.length) i += 2; // Two data bytes
            } else if (eventType === 0xa0 || eventType === 0xf0) {
              // Poly pressure or system exclusive - skip
              if (i < data.length) {
                let length = data[i++];
                if (i + length <= data.length) {
                  i += length;
                }
              }
            }
          }
        }
        // Move to end of track to continue searching for next track
        i = trackEnd;
      } else {
        i++;
      }
    }

    // Sort events by time
    events.sort((a, b) => a.time - b.time);

    if (events.length > 0) {
      return {
        name: fileName.replace(/\.[^/.]+$/, ""),
        composer: "Unknown",
        description: "Converted from MIDI",
        data: events,
      };
    } else {
      console.warn(`No events found in MIDI file: ${fileName}`);
    }
  } catch (error) {
    console.error("MIDI parsing error:", error);
  }

  return null;
}

// API Routes
app.get("/api/songs", (req, res) => {
  try {
    const manifestPath = path.join(__dirname, "songs", "manifest.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    const songs = [];

    for (const file of manifest.songs || []) {
      try {
        const songPath = path.join(__dirname, "songs", file);
        if (fs.existsSync(songPath)) {
          // Only support MIDI files
          if (file.endsWith(".mid") || file.endsWith(".midi")) {
            const midiBuffer = fs.readFileSync(songPath);
            console.log(
              `Parsing MIDI file: ${file}, size: ${midiBuffer.length} bytes`
            );
            const songData = parseMidiFile(midiBuffer.buffer, file);
            if (songData) {
              console.log(
                `Successfully parsed ${file}: ${songData.data.length} events`
              );
              songs.push(songData);
            } else {
              console.error(
                `Failed to parse MIDI file: ${file} - no events found`
              );
            }
          } else {
            console.warn(
              `Skipping unsupported file format: ${file} (only .mid and .midi files are supported)`
            );
          }
        }
      } catch (error) {
        console.error(`Error loading song ${file}:`, error);
      }
    }

    res.json(songs);
  } catch (error) {
    console.error("Error loading songs:", error);
    res.status(500).json({ error: "Failed to load songs" });
  }
});

app.post("/api/songs", (req, res) => {
  try {
    const { name, composer, description, data } = req.body;

    if (!name || !data) {
      return res.status(400).json({ error: "Name and data are required" });
    }

    // Sanitize filename
    const sanitizedName = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    const fileName = `${sanitizedName}.mid`;

    // Convert events to MIDI format
    const file = new File();
    const track = new Track();

    // Sort events by time
    const sortedEvents = [...data].sort((a, b) => a.time - b.time);

    if (sortedEvents.length === 0) {
      return res.status(400).json({ error: "No events to save" });
    }

    // Calculate tempo (120 BPM default)
    const defaultTempo = 120;
    const ticksPerQuarter = 480;

    // Set tempo on track (jsmidgen handles this internally)
    track.setTempo(defaultTempo);

    // Convert events to MIDI notes
    // First, pair note-on and note-off events to get note durations
    const noteMap = new Map(); // midi -> { startTime, startTick }
    const notes = []; // Array of { midi, startTick, duration }

    sortedEvents.forEach((event) => {
      // Convert time in seconds to ticks
      const tick = Math.round(
        (event.time * ticksPerQuarter * defaultTempo) / 60
      );

      if (event.type === "on") {
        noteMap.set(event.midi, { startTime: event.time, startTick: tick });
      } else if (event.type === "off") {
        const noteInfo = noteMap.get(event.midi);
        if (noteInfo) {
          const duration = Math.max(1, tick - noteInfo.startTick);
          notes.push({
            midi: event.midi,
            startTick: noteInfo.startTick,
            duration: duration,
          });
          noteMap.delete(event.midi);
        }
      }
    });

    // Handle notes that never got an "off" event - give them a default duration
    noteMap.forEach((noteInfo, midi) => {
      const lastTick =
        sortedEvents.length > 0
          ? Math.round(
              (sortedEvents[sortedEvents.length - 1].time *
                ticksPerQuarter *
                defaultTempo) /
                60
            )
          : noteInfo.startTick;
      const duration = Math.max(1, lastTick - noteInfo.startTick + 480); // 1 beat default
      notes.push({
        midi: midi,
        startTick: noteInfo.startTick,
        duration: duration,
      });
    });

    // Sort notes by start tick
    notes.sort((a, b) => a.startTick - b.startTick);

    // Add notes to track with proper delta times
    // addNote signature: (channel, pitch, dur, time, velocity)
    // where time is delta time from previous event
    let lastTick = 0;
    notes.forEach((note) => {
      const deltaTick = Math.max(0, note.startTick - lastTick);
      track.addNote(0, note.midi, note.duration, deltaTick, 100);
      lastTick = note.startTick;
    });

    file.addTrack(track);
    const midiBytes = file.toBytes();

    // Save MIDI file
    const songPath = path.join(__dirname, "songs", fileName);
    fs.writeFileSync(songPath, Buffer.from(midiBytes));

    // Update manifest
    const manifestPath = path.join(__dirname, "songs", "manifest.json");
    let manifest = { songs: [] };

    if (fs.existsSync(manifestPath)) {
      manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    }

    if (!manifest.songs.includes(fileName)) {
      manifest.songs.push(fileName);
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    }

    // Return song data in the same format as GET endpoint
    const songData = {
      name,
      composer: composer || "Unknown",
      description: description || "",
      data,
    };

    res.json({ success: true, fileName, song: songData });
  } catch (error) {
    console.error("Error saving song:", error);
    res.status(500).json({ error: "Failed to save song" });
  }
});

// Serve main page
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`🎹 Virtuoso Piano Server running on http://localhost:${PORT}`);
});
