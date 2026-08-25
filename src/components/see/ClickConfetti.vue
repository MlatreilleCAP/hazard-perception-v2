<script setup lang="ts">
withDefaults(
  defineProps<{
    count?: number
  }>(),
  { count: 28 },
)

const COLORS = [
  '#60a1a7',
  '#f8db7d',
  '#FB5CA1',
  '#565a75',
  '#91bab9',
  '#ffffff',
  '#403b3b',
  '#ffe8a3',
]

const particles = Array.from({ length: 28 }, (_, id) => {
  const angle = (Math.PI * 2 * id) / 28 + (id % 3) * 0.28
  const distance = 55 + (id % 5) * 16
  const size = 7 + (id % 4)
  const shape = id % 3 === 0 ? 'circle' : 'rect'
  return {
    id,
    dx: Math.cos(angle) * distance,
    dy: Math.sin(angle) * distance - 24,
    rotate: 90 + ((id * 47) % 220),
    delay: (id % 6) * 0.015,
    size,
    height: shape === 'circle' ? size : size * 0.55,
    radius: shape === 'circle' ? '999px' : '1.5px',
    color: COLORS[id % COLORS.length],
  }
})
</script>

<template>
  <div class="click-confetti" aria-hidden="true">
    <span
      v-for="particle in particles.slice(0, count)"
      :key="particle.id"
      class="click-confetti-piece"
      :style="{
        '--dx': `${particle.dx}px`,
        '--dy': `${particle.dy}px`,
        '--rot': `${particle.rotate}deg`,
        animationDelay: `${particle.delay}s`,
        width: `${particle.size}px`,
        height: `${particle.height}px`,
        borderRadius: particle.radius,
        backgroundColor: particle.color,
      }"
    />
  </div>
</template>
