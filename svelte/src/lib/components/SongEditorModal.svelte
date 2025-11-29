<script>
    import { createEventDispatcher } from 'svelte';
    import { SongEditor, eventsToNotes, notesToEvents } from '../songEditor.js';
    import { playPreview, stopPreview } from '../marketplace.js';
    
    export let isOpen = false;
    export let recording = null; // { name, data: [] }
    export let pianoKeys = [];

    const dispatch = createEventDispatcher();
    
    let canvas;
    let editorInstance = null;
    let editorName = "";
    let editorSpeedCoefficient = 1.0;
    let editorPlaying = false;
    let editorPlaybackInfo = null;
    
    let selectedCount = 0;
    let noteCount = 0;
    let clipboardSize = 0;
    
    $: if (isOpen && recording) {
        editorName = recording.name;
    }
    
    $: if (!isOpen) {
        stopEditorPlayback();
    }
    
    function setupEditor(node) {
        editorInstance = new SongEditor(node, pianoKeys);
        
        if (recording) {
             const notes = eventsToNotes(recording.data);
             editorInstance.setNotes(notes);
             updateCounts();
        }
        
        node.addEventListener('mouseup', updateCounts);
        node.addEventListener('keyup', updateCounts);
        node.addEventListener('click', updateCounts); // Catch selection changes
        
        // Also update on window resize if needed, mostly for canvas size
        
        return {
            destroy() {
                if (editorInstance) {
                    // editorInstance.destroy(); // If I added destroy method
                }
                editorInstance = null;
            }
        };
    }
    
    function updateCounts() {
        if (editorInstance) {
            selectedCount = editorInstance.selectedNotes.size;
            noteCount = editorInstance.notes.length;
            clipboardSize = editorInstance.clipboard.length;
            // Trigger update
            editorInstance = editorInstance; 
        }
    }

    function save() {
         if (editorInstance) {
             const events = notesToEvents(editorInstance.notes);
             dispatch('save', {
                 ...recording,
                 name: editorName,
                 data: events
             });
         }
    }
    
    function togglePlay() {
        if (editorPlaying) {
            stopEditorPlayback();
        } else {
            if (!editorInstance) return;
            const events = notesToEvents(editorInstance.notes);
            const scaledEvents = events.map(e => ({...e, time: e.time / editorSpeedCoefficient}));
            
            // We need to visualize playback on the editor? 
            // The original `SongEditor` has `setPlayheadTime`.
            // We need a loop to update playhead.
            
            const startTime = performance.now();
            
            editorPlaybackInfo = playPreview(scaledEvents, 0.8, (midi, active) => {
                // Optional: highlight keys on a piano visualization if present
                // Here we just care about audio
            });
            
            // Playhead animation loop
            const loop = () => {
                if (!editorPlaying) return;
                const elapsed = (performance.now() - startTime) / 1000;
                const currentTime = elapsed * editorSpeedCoefficient;
                editorInstance.setPlayheadTime(currentTime);
                requestAnimationFrame(loop);
            };
            
            editorPlaying = true;
            requestAnimationFrame(loop);
            
            // Stop automatically when done (managed by playPreview timeout or we calculate duration)
            const duration = scaledEvents.length > 0 ? scaledEvents[scaledEvents.length-1].time + 1 : 0;
            setTimeout(() => {
                if(editorPlaying) stopEditorPlayback();
            }, duration * 1000);
        }
    }
    
    function stopEditorPlayback() {
        if (editorPlaybackInfo) {
            stopPreview(editorPlaybackInfo);
            editorPlaybackInfo = null;
        }
        editorPlaying = false;
        if (editorInstance) editorInstance.resetPlayhead();
    }
    
    // Editor actions
    function copy() { editorInstance.copySelected(); updateCounts(); }
    function paste() { editorInstance.paste(); updateCounts(); }
    function del() { editorInstance.deleteSelected(); updateCounts(); }
    function selectAll() { 
        // Logic for select all: iterate notes and add to selected
        editorInstance.notes.forEach(n => editorInstance.selectedNotes.add(n));
        editorInstance.draw();
        updateCounts();
    }
    function deselect() { editorInstance.selectedNotes.clear(); editorInstance.draw(); updateCounts(); }

</script>

{#if isOpen}
    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <!-- svelte-ignore a11y-no-static-element-interactions -->
    <div class="modal-overlay" on:click|self={() => dispatch('close')}>
        <div class="modal-content editor-modal" style="display: flex; flex-direction: column; height: 80vh;">
            <div class="modal-header">
                <h2>🎼 Song Editor</h2>
                <button class="modal-close" on:click={() => dispatch('close')}>×</button>
            </div>
            
            <div class="editor-toolbar">
                <div class="editor-toolbar-left" style="display: flex; align-items: center; gap: 10px;">
                    <input 
                        type="text" 
                        bind:value={editorName} 
                        placeholder="Song name..." 
                        style="background: #333; color: white; border: 1px solid #555; padding: 6px 12px; border-radius: 4px;"
                    />
                    <label style="color: #aaa; font-size: 0.9rem;">
                        Speed:
                        <input 
                            type="number" 
                            bind:value={editorSpeedCoefficient} 
                            min="0.1" max="10" step="0.1"
                            style="width: 70px; padding: 4px 8px;"
                        />
                    </label>
                </div>
                
                <div class="editor-toolbar-right" style="display: flex; gap: 5px;">
                    <button on:click={copy} disabled={selectedCount === 0} title="Copy">📋</button>
                    <button on:click={paste} disabled={clipboardSize === 0} title="Paste">📄</button>
                    <button class="danger" on:click={del} disabled={selectedCount === 0} title="Delete">🗑</button>
                    <button on:click={selectAll}>☑</button>
                    <button on:click={deselect} disabled={selectedCount === 0}>☐</button>
                </div>
            </div>
            
            <div class="editor-container" style="flex: 1; background: #1a1a1a; position: relative; overflow: hidden;">
                <canvas 
                    use:setupEditor
                    class="editor-canvas"
                    style="width: 100%; height: 100%; display: block;"
                    on:contextmenu|preventDefault
                ></canvas>
            </div>
            
            <div class="editor-footer" style="display: flex; justify-content: space-between; align-items: center; padding: 10px; background: #252525; border-top: 1px solid #333;">
                <div class="editor-info">
                    <span>{noteCount} notes</span>
                    {#if selectedCount > 0}
                        <span> • {selectedCount} selected</span>
                    {/if}
                </div>
                <div class="editor-actions" style="display: flex; gap: 10px;">
                    <button on:click={togglePlay} class="primary">
                        {editorPlaying ? '⏸ Stop' : '▶ Play'}
                    </button>
                    <button class="danger" on:click={() => dispatch('close')}>Cancel</button>
                    <button style="background: var(--accent)" on:click={save} disabled={!editorName.trim()}>
                        💾 Save
                    </button>
                </div>
            </div>
        </div>
    </div>
{/if}

