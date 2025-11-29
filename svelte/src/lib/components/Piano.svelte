<script>
  import { createEventDispatcher } from 'svelte';
  
  export let keys = [];
  export let showNotes = true;
  export let pianoWidth = 0;
  export let activeNotes = new Set(); // Set<midi>

  const dispatch = createEventDispatcher();

  function handleMouseDown(midi) {
    dispatch('noteOn', { midi });
  }

  function handleMouseUp(midi) {
    dispatch('noteOff', { midi });
  }
  
  function handleMouseLeave(midi) {
    // Only trigger off if it was actually playing? 
    // The parent handles logic. If we send off and it wasn't on, it's fine (stopMIDINote handles it).
    dispatch('noteOff', { midi });
  }
</script>

<div class="piano-container">
  <div class="piano-keys" style="width: {pianoWidth}px">
    {#each keys as key (key.midi)}
      <!-- svelte-ignore a11y-click-events-have-key-events -->
      <!-- svelte-ignore a11y-no-static-element-interactions -->
      <div
        id="key-{key.midi}"
        class="key {key.isBlack ? 'black' : 'white'} {activeNotes.has(key.midi) ? 'active' : ''}"
        style={key.isBlack ? `left: ${key.leftPos}px` : ''}
        on:mousedown={() => handleMouseDown(key.midi)}
        on:mouseup={() => handleMouseUp(key.midi)}
        on:mouseleave={() => handleMouseLeave(key.midi)}
      >
        <span class="key-note {showNotes ? '' : 'hidden'}">
          {key.noteName}{key.octave}
        </span>
        <span class="key-bind">{key.keyBind || ''}</span>
      </div>
    {/each}
  </div>
</div>

