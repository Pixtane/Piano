<script>
    import { createEventDispatcher } from 'svelte';
    import { Play, Pause, Repeat, Volume2 } from 'lucide-svelte';
    import { formatTime } from '../recording.js';

    export let recordings = [];
    export let playingRecordings = new Set(); // Set of indices
    export let recordingRepeat = new Set();
    export let recordingVolumes = new Map();
    export let recordingProgress = new Map();
    
    // Functions passed from parent or we can assume props are updated
    // Svelte props are reactive.
    export let getCurrentTime = (index) => 0;
    export let getDuration = (index) => 0;
    export let getProgress = (index) => 0;
    
    // Local state for volume popover
    let volumePopoverOpen = null;
    
    // Local state for timeline dragging
    let draggingIndex = null;
    let dragStartX = 0;
    let dragAnimationFrame = null;
    let dragTimelineEl = null;

    const dispatch = createEventDispatcher();

    function toggleVolumePopover(index) {
        if (volumePopoverOpen === index) {
            volumePopoverOpen = null;
        } else {
            volumePopoverOpen = index;
        }
    }
    
    // Force reactivity by tracking the map
    // This ensures the component re-renders when the map is updated
    $: progressKeys = Array.from(recordingProgress.keys());
    $: progressSize = recordingProgress.size;
    
    // Helper functions that use the reactive recordingProgress prop
    function getCurrentTimeReactive(index) {
        // Reference progressSize to ensure reactivity
        const _ = progressSize; // Force dependency
        return recordingProgress.get(index) || 0;
    }
    
    function getProgressReactive(index) {
        const dur = getDuration(index);
        if (dur === 0) return 0;
        // Reference progressSize to ensure reactivity
        const _ = progressSize; // Force dependency
        const current = recordingProgress.get(index) || 0;
        return Math.min(1, current / dur);
    }
    
    // Create a reactive object that tracks progress for each recording
    // This ensures Svelte tracks changes to individual values
    $: progressValues = Object.fromEntries(recordingProgress);
    
    function handleTimelineMouseDown(index, event) {
        event.preventDefault();
        draggingIndex = index;
        dragStartX = event.clientX;
        
        // Store reference to timeline element
        dragTimelineEl = event.currentTarget.closest('.track-timeline') || event.currentTarget;
        
        // Calculate initial seek position
        const rect = dragTimelineEl.getBoundingClientRect();
        const clickX = event.clientX - rect.left;
        const progress = Math.max(0, Math.min(1, clickX / rect.width));
        
        // Seek immediately on mousedown (not dragging yet, so restart playback)
        dispatch('seek', { index, event, progress, isDragging: false });
        
        let lastMouseX = event.clientX;
        
        // Use requestAnimationFrame for smooth, frequent updates (60fps)
        const updateDrag = () => {
            if (draggingIndex !== index || !dragTimelineEl) {
                dragAnimationFrame = null;
                return;
            }
            
            const currentRect = dragTimelineEl.getBoundingClientRect();
            const mouseX = lastMouseX - currentRect.left;
            const progress = Math.max(0, Math.min(1, mouseX / currentRect.width));
            
            // Update visual progress only while dragging
            dispatch('seek', { index, event: { clientX: lastMouseX }, progress, isDragging: true });
            
            dragAnimationFrame = requestAnimationFrame(updateDrag);
        };
        
        // Add global mouse handlers
        const handleMouseMove = (e) => {
            if (draggingIndex !== index) return;
            
            lastMouseX = e.clientX;
            
            // Start animation frame loop if not already running
            if (!dragAnimationFrame) {
                dragAnimationFrame = requestAnimationFrame(updateDrag);
            }
        };
        
        const handleMouseUp = (e) => {
            if (draggingIndex === index) {
                // Cancel animation frame
                if (dragAnimationFrame) {
                    cancelAnimationFrame(dragAnimationFrame);
                    dragAnimationFrame = null;
                }
                
                // Final seek when drag ends - restart playback if needed
                const currentRect = dragTimelineEl.getBoundingClientRect();
                const mouseX = e.clientX - currentRect.left;
                const finalProgress = Math.max(0, Math.min(1, mouseX / currentRect.width));
                dispatch('seek', { index, event: e, progress: finalProgress, isDragging: false });
                
                draggingIndex = null;
                dragTimelineEl = null;
                document.removeEventListener('mousemove', handleMouseMove);
                document.removeEventListener('mouseup', handleMouseUp);
                window.removeEventListener('mouseleave', handleMouseUp);
                document.body.style.userSelect = '';
                document.body.style.cursor = '';
            }
        };
        
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        window.addEventListener('mouseleave', handleMouseUp);
        document.body.style.userSelect = 'none';
        document.body.style.cursor = 'pointer';
        
        // Start the animation frame loop immediately for continuous updates
        dragAnimationFrame = requestAnimationFrame(updateDrag);
    }
</script>

<svelte:window on:click={() => volumePopoverOpen = null} />

<div class="recorder-panel">
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px;">
        <div style="display: flex; align-items: center; gap: 10px">
            <strong>Saved Recordings</strong>
            <button 
                on:click={() => dispatch('createRecording')}
                style="background: var(--accent); padding: 4px 12px; font-size: 0.85rem;"
            >
                + Create
            </button>
        </div>
    </div>
    
    <div>
        {#each recordings as rec, index}
            <div class="track-item">
                <div class="track-item-header">
                    <span>{rec.name} ({rec.data.length} notes)</span>
                    <div class="track-item-controls">
                        {#if playingRecordings.has(index)}
                            {@const currentTime = recordingProgress.get(index) || 0}
                            <span style="margin-right: 10px; color: var(--accent); font-size: 0.9rem;">
                                {formatTime(currentTime)}
                            </span>
                        {/if}
                        
                        <button class="icon-button play" on:click={() => dispatch('togglePlay', index)}>
                             {#if playingRecordings.has(index)}
                                <Pause size={16} />
                             {:else}
                                <Play size={16} />
                             {/if}
                        </button>
                        
                        <button 
                            class="icon-button repeat {recordingRepeat.has(index) ? 'active' : ''}"
                            on:click={() => dispatch('toggleRepeat', index)}
                        >
                            <Repeat size={16} />
                        </button>
                        
                        <div style="position: relative">
                            <button 
                                class="icon-button volume" 
                                on:click|stopPropagation={() => toggleVolumePopover(index)}
                            >
                                <Volume2 size={16} />
                            </button>
                             {#if volumePopoverOpen === index}
                                <!-- svelte-ignore a11y-click-events-have-key-events -->
                                <!-- svelte-ignore a11y-no-static-element-interactions -->
                                <div class="volume-popover" on:click|stopPropagation>
                                    <div class="volume-slider-container">
                                        <label>Volume: {Math.round((recordingVolumes.get(index) || 0.8) * 100)}%</label>
                                        <input 
                                            type="range" 
                                            class="volume-slider"
                                            value={recordingVolumes.get(index) || 0.8}
                                            min="0"
                                            max="1"
                                            step="0.01"
                                            on:input={(e) => dispatch('setVolume', { index, volume: parseFloat(e.currentTarget.value) })}
                                        />
                                    </div>
                                </div>
                             {/if}
                        </div>
                        
                        <button on:click={() => dispatch('editRecording', index)} style="background: #4488ff">Edit</button>
                        <button class="danger" on:click={() => dispatch('deleteRecording', index)}>X</button>
                    </div>
                </div>
                
                {#if playingRecordings.has(index) || recordingProgress.has(index)}
                     {@const currentTime = recordingProgress.get(index) || 0}
                     {@const progress = getDuration(index) > 0 ? Math.min(1, currentTime / getDuration(index)) : 0}
                     <div class="track-timeline-container">
                        <span style="font-size: 0.8rem; color: #aaa; min-width: 50px">
                            {formatTime(currentTime)}
                        </span>
                        <!-- svelte-ignore a11y-click-events-have-key-events -->
                        <!-- svelte-ignore a11y-no-static-element-interactions -->
                        <div 
                            class="track-timeline" 
                            data-timeline-index={index}
                            style="cursor: pointer; user-select: none;"
                            on:mousedown={(e) => handleTimelineMouseDown(index, e)}
                            on:click={(e) => {
                                // Only handle click if not dragging
                                if (draggingIndex === null) {
                                    dispatch('seek', { index, event: e });
                                }
                            }}
                        >
                            <div class="track-timeline-progress" style="width: {progress * 100}%"></div>
                        </div>
                        <span style="font-size: 0.8rem; color: #aaa; min-width: 50px; text-align: right;">
                            {formatTime(getDuration(index))}
                        </span>
                     </div>
                {/if}
            </div>
        {/each}
    </div>
</div>

