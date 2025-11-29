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

    const dispatch = createEventDispatcher();

    function toggleVolumePopover(index) {
        if (volumePopoverOpen === index) {
            volumePopoverOpen = null;
        } else {
            volumePopoverOpen = index;
        }
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
                            <span style="margin-right: 10px; color: var(--accent); font-size: 0.9rem;">
                                {formatTime(getCurrentTime(index))}
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
                     <div class="track-timeline-container">
                        <span style="font-size: 0.8rem; color: #aaa; min-width: 50px">
                            {formatTime(getCurrentTime(index))}
                        </span>
                        <!-- svelte-ignore a11y-click-events-have-key-events -->
                        <!-- svelte-ignore a11y-no-static-element-interactions -->
                        <div 
                            class="track-timeline" 
                            on:click={(e) => dispatch('seek', { index, event: e })}
                        >
                            <div class="track-timeline-progress" style="width: {getProgress(index) * 100}%"></div>
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

