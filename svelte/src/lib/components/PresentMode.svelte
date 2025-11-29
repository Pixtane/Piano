<script>
  import { onMount, onDestroy } from "svelte";
  import { NOTES } from "../constants.js";

  export let activeNotes = new Set(); // Set<midi>
  export let pianoKeys = [];
  export let pianoWidth = 0;
  export let effect = "none"; // none, particles
  export let startDelay = 5.0; // How many seconds before note plays to start falling
  export let fallSpeed = 1.0; // Multiplier for fall speed
  export let recordingData = null; // Recording data for timing
  export let playbackStartTime = 0; // When playback started (performance.now())

  let canvas;
  let ctx;
  let animationFrame;
  let particles = [];
  let fallingKeys = []; // for falling keys visualization
  let width = 0;
  let height = 0;
  let pianoHeightRatio = 0.15; // Piano takes 15% of canvas height
  let allFallingKeys = []; // Pre-calculated falling keys from recording

  // Color map for notes - consistent based on note pitch
  const NOTE_COLORS = [
    "#FF0000", "#FF7F00", "#FFFF00", "#7FFF00", "#00FF00", "#00FF7F",
    "#00FFFF", "#007FFF", "#0000FF", "#7F00FF", "#FF00FF", "#FF007F"
  ];

  // Reactive: trigger spawning on new notes for effects
  let prevActiveNotes = new Set();

  $: {
    // Detect new notes for effects
    activeNotes.forEach(midi => {
      if (!prevActiveNotes.has(midi)) {
        spawnEffect(midi);
      }
    });
    prevActiveNotes = new Set(activeNotes);
  }

  // When recording data, dimensions, or settings change, pre-calculate all falling keys
  // Include startDelay and fallSpeed in dependencies so changes trigger recalculation
  $: if (recordingData && pianoKeys.length > 0 && width > 0 && height > 0 && pianoWidth > 0) {
    // Force reactivity on startDelay and fallSpeed by using them in the condition
    calculateFallingKeys();
  }
  
  // Separate reactive statement to ensure startDelay and fallSpeed changes trigger recalculation
  $: if (recordingData && pianoKeys.length > 0 && width > 0 && height > 0 && pianoWidth > 0 && startDelay >= 0 && fallSpeed > 0) {
    calculateFallingKeys();
  }

  onMount(() => {
    ctx = canvas.getContext("2d");
    resize();
    window.addEventListener("resize", resize);
    loop();

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(animationFrame);
    };
  });

  function resize() {
    const rect = canvas.parentElement.getBoundingClientRect();
    width = rect.width;
    height = rect.height; // Full canvas height
    canvas.width = width * window.devicePixelRatio;
    canvas.height = height * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    
    // Recalculate falling keys when canvas is resized
    if (recordingData && pianoKeys.length > 0 && width > 0) {
      calculateFallingKeys();
    }
  }
  
  function getPianoHeight() {
    return height * pianoHeightRatio;
  }
  
  function getVisualizationHeight() {
    return height * (1 - pianoHeightRatio);
  }

  function getKeyPosition(midi) {
    const key = pianoKeys.find(k => k.midi === midi);
    if (!key) return 0;
    
    // Use the actual leftPos from piano keys, scaled to canvas width
    const scale = width / pianoWidth;
    const keyWidth = key.isBlack ? 34 : 52; // Approximate key widths
    return key.leftPos * scale + (keyWidth * scale / 2);
  }

  function getKeyWidth(midi) {
    const key = pianoKeys.find(k => k.midi === midi);
    if (!key) return 0;
    
    const scale = width / pianoWidth;
    return key.isBlack ? 34 * scale : 52 * scale;
  }
  
  function getKeyLeft(midi) {
    const key = pianoKeys.find(k => k.midi === midi);
    if (!key) return 0;
    
    const scale = width / pianoWidth;
    return key.leftPos * scale;
  }

  function calculateFallingKeys() {
    if (!recordingData || !recordingData.data || recordingData.data.length === 0) {
      allFallingKeys = [];
      return;
    }

    // Sort events by time
    const sortedEvents = [...recordingData.data].sort((a, b) => a.time - b.time);
    
    // Find the total duration of the song
    const lastEvent = sortedEvents[sortedEvents.length - 1];
    const totalDuration = lastEvent ? lastEvent.time + 0.5 : 10;
    
    // Calculate preview time (how many seconds should be visible at once)
    // This is fixed - keys always start appearing this many seconds before notes play
    const previewTime = 5.0; // Fixed preview time
    const visHeight = getVisualizationHeight();
    // Base pixels per second for height calculation (duration representation)
    const basePixelsPerSecond = visHeight / previewTime;
    // Velocity pixels per second (for fall speed, affected by fallSpeed multiplier)
    const velocityPixelsPerSecond = basePixelsPerSecond * fallSpeed;
    
    // Track note start times to calculate durations
    const noteStarts = new Map(); // midi -> { time, event }
    const calculatedKeys = [];

    // Process events to find note durations
    sortedEvents.forEach(event => {
      if (event.type === "on") {
        noteStarts.set(event.midi, { time: event.time, event });
      } else if (event.type === "off") {
        const start = noteStarts.get(event.midi);
        if (start) {
          const duration = event.time - start.time;
          const key = pianoKeys.find(k => k.midi === event.midi);
          if (key && duration > 0) {
            calculatedKeys.push({
              midi: event.midi,
              startTime: start.time,
              duration: duration,
              key: key
            });
          }
          noteStarts.delete(event.midi);
        }
      }
    });

    // Handle notes that never had an "off" event (use default duration)
    noteStarts.forEach((start, midi) => {
      const key = pianoKeys.find(k => k.midi === midi);
      if (key) {
        calculatedKeys.push({
          midi: midi,
          startTime: start.time,
          duration: 0.5, // Default duration
          key: key
        });
      }
    });

    // Convert to falling keys with proper positioning
    allFallingKeys = calculatedKeys.map(note => {
      const scale = width / pianoWidth;
      const keyLeft = note.key.leftPos * scale;
      const keyWidth = (note.key.isBlack ? 34 : 52) * scale;
      const color = NOTE_COLORS[note.midi % 12];
      
      // Calculate base height based on duration (in pixels)
      // This is the minimum height, will be scaled by fallSpeed in updateFallingKeys
      const baseKeyHeight = Math.max(10, note.duration * basePixelsPerSecond);
      
      // Note: velocity and height are recalculated in updateFallingKeys()
      // based on current fallSpeed and startDelay values
      
      return {
        midi: note.midi,
        x: keyLeft,
        y: 0, // Will be calculated based on time
        width: keyWidth,
        baseHeight: baseKeyHeight, // Base height, will be scaled by fallSpeed
        color: color,
        isBlack: note.key.isBlack,
        startTime: note.startTime,
        duration: note.duration
      };
    });
  }

  function spawnEffect(midi) {
    const x = getKeyPosition(midi);
    const color = NOTE_COLORS[midi % 12];
    const visHeight = getVisualizationHeight();
    const pianoTop = visHeight;

    if (effect === "particles") {
      for (let i = 0; i < 10; i++) {
        particles.push({
          x: x,
          y: pianoTop - 10, // Start near keys
          vx: (Math.random() - 0.5) * 2,
          vy: -(Math.random() * 5 + 2),
          color: color,
          life: 1.0,
          size: Math.random() * 5 + 2
        });
      }
    }
  }


  function loop() {
    const visHeight = getVisualizationHeight();
    const pianoTop = visHeight;
    const pianoHeight = getPianoHeight();
    
    // Clear visualization area with fade effect
    ctx.fillStyle = "rgba(0, 0, 0, 0.2)";
    ctx.fillRect(0, 0, width, visHeight);

    // Update and draw falling keys
    updateFallingKeys();

    if (effect === "particles") {
        updateParticles();
    }
    
    // Draw piano at the bottom
    drawPiano(pianoTop, pianoHeight);

    animationFrame = requestAnimationFrame(loop);
  }
  
  function drawPiano(pianoTop, pianoHeight) {
    if (pianoKeys.length === 0 || pianoWidth === 0) return;
    
    const scale = width / pianoWidth;
    const whiteKeyHeight = pianoHeight;
    const blackKeyHeight = pianoHeight * 0.6;
    
    // Draw white keys first
    pianoKeys.forEach(key => {
      if (!key.isBlack) {
        const x = key.leftPos * scale;
        const keyWidth = 52 * scale;
        const isActive = activeNotes.has(key.midi);
        
        // Draw white key
        ctx.fillStyle = isActive ? "#66aaff" : "#ffffff";
        ctx.fillRect(x, pianoTop, keyWidth, whiteKeyHeight);
        
        // Border
        ctx.strokeStyle = "#ccc";
        ctx.lineWidth = 1;
        ctx.strokeRect(x, pianoTop, keyWidth, whiteKeyHeight);
      }
    });
    
    // Draw black keys on top
    pianoKeys.forEach(key => {
      if (key.isBlack) {
        const x = key.leftPos * scale;
        const keyWidth = 34 * scale;
        const isActive = activeNotes.has(key.midi);
        
        // Draw black key
        ctx.fillStyle = isActive ? "#4488ff" : "#000000";
        ctx.fillRect(x, pianoTop, keyWidth, blackKeyHeight);
        
        // Border
        ctx.strokeStyle = "#000";
        ctx.lineWidth = 1;
        ctx.strokeRect(x, pianoTop, keyWidth, blackKeyHeight);
      }
    });
  }

  function updateFallingKeys() {
    if (!playbackStartTime || allFallingKeys.length === 0) return;
    
    // Calculate elapsed time since visualization started (includes delay period)
    const elapsedSinceStart = (performance.now() - playbackStartTime) / 1000;
    // Use fixed preview time (not startDelay)
    const previewTime = 5.0; // Fixed preview time
    const visHeight = getVisualizationHeight();
    const pianoTop = visHeight;
    
    // Calculate velocity - bottom edge should reach piano when note plays
    // When elapsed = previewTime, y should = pianoTop
    // So: pianoTop = previewTime * velocity, therefore velocity = pianoTop / previewTime
    // But we want fallSpeed to affect how fast it moves, so we scale by fallSpeed
    const baseVelocityPixelsPerSecond = visHeight / previewTime;
    const velocityPixelsPerSecond = baseVelocityPixelsPerSecond * fallSpeed;
    
    // Clear active falling keys
    fallingKeys = [];
    
    // Find all keys that should be visible now
    allFallingKeys.forEach(key => {
      // Calculate when this key should start appearing
      // Keys should start appearing previewTime seconds before the note plays
      // But we need to account for startDelay - keys should start higher during the delay
      const adjustedPreviewTime = previewTime / fallSpeed;
      // Key's actual start time in the song (in song time)
      const keySongTime = key.startTime;
      // When should the key start appearing? previewTime before it plays, but accounting for delay
      // During delay, keys should be moving, so we calculate from the visualization start
      const keyVisualizationStartTime = keySongTime + startDelay - adjustedPreviewTime;
      const elapsed = elapsedSinceStart - keyVisualizationStartTime;
      
      // Key should be visible if it's within the preview window
      // Allow keys to be visible during delay period (elapsed can be negative during delay)
      if (elapsed >= -adjustedPreviewTime && elapsed <= adjustedPreviewTime + key.duration) {
        // Calculate Y position: start from top (y=0), move down based on elapsed time
        // Use velocity that includes fallSpeed for faster movement
        // If elapsed is negative (during delay), key starts above the canvas
        const y = elapsed * velocityPixelsPerSecond;
        
        // Recalculate height based on current fallSpeed only (not speed)
        // Higher fallSpeed = longer keys (they stretch as they move faster)
        // The height represents the visual "trail" - faster movement = longer trail
        const keyHeight = key.baseHeight * fallSpeed;
        
        // Only show if it's visible on screen (hasn't completely passed the piano)
        // The key's bottom edge is at y, so show if bottom edge hasn't passed the piano top
        // Also allow keys that start above the canvas (during delay)
        if (y <= pianoTop + keyHeight && y + keyHeight >= 0) {
          fallingKeys.push({
            ...key,
            y: y,
            height: keyHeight
          });
        }
      }
    });
    
    // Draw all visible falling keys
    fallingKeys.forEach(key => {
      // Draw the falling key
      ctx.fillStyle = key.color;
      ctx.globalAlpha = 1.0;
      
      // Calculate the actual Y position (top of the key)
      // y represents the bottom of the key, so top is y - height
      const keyTop = key.y - key.height;
      
      // Only draw if the key is at least partially visible in visualization area
      // Allow keys that start above canvas (during delay) - they'll be clipped automatically
      if (keyTop < pianoTop && key.y > -key.height) {
        // Draw a rectangular key shape
        ctx.fillRect(key.x, keyTop, key.width, key.height);
        
        // Add a border to make it look more like a key
        ctx.strokeStyle = key.isBlack ? "#000" : "#333";
        ctx.lineWidth = 2;
        ctx.strokeRect(key.x, keyTop, key.width, key.height);
      }
    });
  }

  function updateParticles() {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.life -= 0.01;
      p.vy += 0.1; // Gravity

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.globalAlpha = p.life;
      ctx.fill();
      ctx.globalAlpha = 1;

      if (p.life <= 0) particles.splice(i, 1);
    }
  }


</script>

<div class="present-container">
  <canvas bind:this={canvas}></canvas>
</div>

<style>
  .present-container {
    width: 100%;
    height: 100%;
    position: relative;
    background: #000;
    overflow: hidden;
  }

  canvas {
    width: 100%;
    height: 100%;
    display: block;
  }
</style>

