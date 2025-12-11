<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { themeStore } from '../store/theme'

const stars = ref<Array<{
  top: string,
  left: string,
  size: string,
  delay: string,
  duration: string,
  opacity: number,
  type: 'circle' | 'cross'
}>>([])

// Generate stars with improved logic
function generateStars() {
  const count = 40 // Reduced from 75 to lower density
  const newStars = []
  
  for (let i = 0; i < count; i++) {
    // Random position
    const top = Math.random() * 100
    const left = Math.random() * 100
    
    const type = Math.random() > 0.85 ? 'cross' : 'circle' // 15% chance for cross stars

    // Size: 1.5px to 3px (Reduced from 2-4px)
    // Cross stars need to be slightly larger to be visible
    const baseSize = type === 'cross' ? (3 + Math.random() * 3) : (1.5 + Math.random() * 1.5)
    const size = `${baseSize.toFixed(1)}px`
    
    // Animation
    // Random delay: 0s to 5s
    const delay = `${(Math.random() * 5).toFixed(1)}s`
    // Duration: 3s to 8s (slow twinkling)
    const duration = `${(3 + Math.random() * 5).toFixed(1)}s`
    
    // Random base opacity for variation
    const opacity = 0.5 + Math.random() * 0.5

    newStars.push({ top: `${top}%`, left: `${left}%`, size, delay, duration, opacity, type })
  }
  stars.value = newStars as any
}

// Remove internal isDark check since App.vue controls visibility
// But if we want to be safe, we can keep it or just render always if mounted
const isDark = computed(() => themeStore.activeTheme.value === 'dark')

onMounted(() => {
  generateStars()
})
</script>

<template>
  <div v-if="isDark" class="star-container">
    <div 
      v-for="(s, i) in stars" 
      :key="i" 
      class="star"
      :class="s.type"
      :style="{
        top: s.top,
        left: s.left,
        width: s.size,
        height: s.size,
        animationDelay: s.delay,
        animationDuration: s.duration,
        '--base-opacity': s.opacity
      }"
    ></div>
  </div>
</template>

<style scoped>
.star-container {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: -1; /* Behind everything */
  pointer-events: none;
  overflow: hidden;
}

.star {
  position: absolute;
  background: #ffffff;
  
  opacity: 0;
  animation-name: twinkle;
  animation-timing-function: ease-in-out;
  animation-iteration-count: infinite;
}

.star.circle {
  border-radius: 50%;
  /* Feathered edges: Blur radius makes it soft but core stays relatively bright */
  filter: blur(0.8px);
  /* Optional: Box shadow for extra glow without blurriness */
  box-shadow: 0 0 2px rgba(255, 255, 255, 0.6);
}

.star.cross {
  background: #ffffff;
  clip-path: polygon(50% 0%, 65% 40%, 100% 50%, 65% 60%, 50% 100%, 35% 60%, 0% 50%, 35% 40%);
  filter: blur(0.5px);
  box-shadow: 0 0 4px rgba(255, 255, 255, 0.8);
  aspect-ratio: 1;
}

@keyframes twinkle {
  0% {
    opacity: 0.2;
    transform: scale(0.8);
  }
  50% {
    opacity: var(--base-opacity, 1);
    transform: scale(1.1);
  }
  100% {
    opacity: 0.2;
    transform: scale(0.8);
  }
}
</style>
