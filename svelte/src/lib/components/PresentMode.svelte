<script>
  import { onMount, onDestroy } from "svelte";
  import { NOTES } from "../constants.js";

  export let activeNotes = new Set(); // Set<midi>
  export let pianoKeys = [];
  export let effect = "particles"; // particles, trails, waves
  export let speed = 1.0;

  let canvas;
  let ctx;
  let animationFrame;
  let particles = [];
  let trails = []; // for trails effect
  let width = 0;
  let height = 0;

  // Color map for notes to make it colorful
  const NOTE_COLORS = [
    "#FF0000", "#FF7F00", "#FFFF00", "#7FFF00", "#00FF00", "#00FF7F",
    "#00FFFF", "#007FFF", "#0000FF", "#7F00FF", "#FF00FF", "#FF007F"
  ];

  // Reactive: trigger spawning on new notes
  let prevActiveNotes = new Set();

  $: {
    // Detect new notes
    activeNotes.forEach(midi => {
      if (!prevActiveNotes.has(midi)) {
        spawnEffect(midi);
      }
    });
    prevActiveNotes = new Set(activeNotes);
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
    height = rect.height;
    canvas.width = width * window.devicePixelRatio;
    canvas.height = height * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
  }

  function getKeyPosition(midi) {
    const keyIndex = pianoKeys.findIndex(k => k.midi === midi);
    if (keyIndex === -1) return 0;

    const whiteKeysCount = 52;
    const whiteKeyWidth = width / whiteKeysCount;
    
    // Count white keys before this midi to find position
    let whiteKeyIndex = 0;
    for (let i = 0; i < pianoKeys.length; i++) {
        if (pianoKeys[i].midi === midi) break;
        if (!pianoKeys[i].isBlack) whiteKeyIndex++;
    }
    
    let x = whiteKeyIndex * whiteKeyWidth;
    if (pianoKeys[keyIndex].isBlack) {
        // Black keys are usually centered on the line between white keys
        // But it depends on the note (C#, D# vs F#, G#, A#)
        // Simplified: 
        x -= whiteKeyWidth * 0.3; // adjust
    }
    
    return x + (pianoKeys[keyIndex].isBlack ? whiteKeyWidth * 0.3 : whiteKeyWidth / 2);
  }

  // Helper for CSS positioning
  function getCssLeft(key) {
    if (width === 0) return 0;
    const whiteKeysCount = 52;
    const whiteKeyWidth = width / whiteKeysCount;
    
    let whiteKeyIndex = 0;
    for (let i = 0; i < pianoKeys.length; i++) {
        if (pianoKeys[i].midi === key.midi) break;
        if (!pianoKeys[i].isBlack) whiteKeyIndex++;
    }
    
    let left = whiteKeyIndex * whiteKeyWidth;
    if (key.isBlack) {
        left -= whiteKeyWidth * 0.35; // Center black key roughly
    }
    return left;
  }
  
  function getCssWidth(isBlack) {
      if (width === 0) return 0;
      const whiteKeysCount = 52;
      const whiteKeyWidth = width / whiteKeysCount;
      return isBlack ? whiteKeyWidth * 0.7 : whiteKeyWidth;
  }

  function spawnEffect(midi) {
    const x = getKeyPosition(midi);
    const color = NOTE_COLORS[midi % 12];

    if (effect === "particles") {
      for (let i = 0; i < 10; i++) {
        particles.push({
          x: x,
          y: height - 50, // Start near keys
          vx: (Math.random() - 0.5) * 2,
          vy: -(Math.random() * 5 + 2),
          color: color,
          life: 1.0,
          size: Math.random() * 5 + 2
        });
      }
    } else if (effect === "trails") {
       trails.push({
           midi: midi,
           x: x,
           y: height - 50,
           color: color,
           active: true
       });
    } else if (effect === "waves") {
        // Waves might be continuous, but we can spawn a ripple
        particles.push({
            type: 'ripple',
            x: x,
            y: height / 2,
            radius: 0,
            color: color,
            life: 1.0
        });
    }
  }

  function loop() {
    ctx.fillStyle = "rgba(0, 0, 0, 0.2)"; // Fade effect
    ctx.fillRect(0, 0, width, height);

    if (effect === "particles") {
        updateParticles();
    } else if (effect === "trails") {
        updateTrails();
    } else if (effect === "waves") {
        updateWaves();
    }

    animationFrame = requestAnimationFrame(loop);
  }

  function updateParticles() {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx * speed;
      p.y += p.vy * speed;
      p.life -= 0.01 * speed;
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

  function updateTrails() {
      // Update existing trails
      for (let i = trails.length - 1; i >= 0; i--) {
          const t = trails[i];
          // If note is still active, keep adding to it?
          // Or just shoot up?
          // Let's make them shoot up like beams.
          
          if (activeNotes.has(t.midi)) {
             // Draw beam
             ctx.fillStyle = t.color;
             ctx.fillRect(t.x - 5, 0, 10, height);
          } else {
              // Fade out
               t.active = false;
               trails.splice(i, 1); // Remove immediately for beam effect
          }
      }
  }

  function updateWaves() {
       for (let i = particles.length - 1; i >= 0; i--) {
          const p = particles[i];
          if (p.type === 'ripple') {
              p.radius += 2 * speed;
              p.life -= 0.01 * speed;
              
              ctx.beginPath();
              ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
              ctx.strokeStyle = p.color;
              ctx.globalAlpha = p.life;
              ctx.lineWidth = 3;
              ctx.stroke();
              ctx.globalAlpha = 1;
              
              if (p.life <= 0) particles.splice(i, 1);
          }
       }
       
       // Also draw continuous wave for active notes
       activeNotes.forEach(midi => {
           const x = getKeyPosition(midi);
           const color = NOTE_COLORS[midi % 12];
           
           ctx.beginPath();
           ctx.moveTo(x, height);
           ctx.lineTo(x, 0);
           ctx.strokeStyle = color;
           ctx.lineWidth = 2;
           ctx.setLineDash([5, 15]);
           ctx.stroke();
           ctx.setLineDash([]);
       });
  }

</script>

<div class="present-container">
  <canvas bind:this={canvas}></canvas>
  <div class="present-keys">
      {#each pianoKeys as key}
        <!-- svelte-ignore a11y-click-events-have-key-events -->
        <!-- svelte-ignore a11y-no-static-element-interactions -->
        <div 
            class="key {key.isBlack ? 'black' : 'white'} {activeNotes.has(key.midi) ? 'active' : ''}"
            style="
                left: {getCssLeft(key)}px; 
                width: {getCssWidth(key.isBlack)}px;
            "
        ></div>
      {/each}
  </div>
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

  .present-keys {
      position: absolute;
      bottom: 0;
      left: 0;
      width: 100%;
      height: 100px; /* Adjust as needed */
      display: flex;
      /* We need to position keys absolutely if we want precise alignment with canvas logic above */
      /* But logic above assumed simple distribution. */
      /* Let's use flex for white keys and absolute for black keys relative to container? */
      /* Actually, for Present mode, it's better to use the same layout logic. */
  }
  
  /* Simple CSS Grid or Flex might not align perfectly with Canvas math. */
  /* Let's use the same math for positioning in CSS */
  
  .key {
      position: absolute;
      bottom: 0;
      /* width and left set by inline styles or logic */
      height: 100%;
      background: white;
      border: 1px solid #ccc;
      border-radius: 0 0 4px 4px;
  }
  
  .key.black {
      background: black;
      height: 60%;
      z-index: 1;
      /* width set below */
  }
  
  .key.active {
      background: #4488ff;
  }
  
  .key.black.active {
      background: #3366cc;
  }
</style>

