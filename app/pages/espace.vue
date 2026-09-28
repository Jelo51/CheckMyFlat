<script setup lang="ts">
definePageMeta({ auth: true })

const { home } = useProfile()
await navigateTo(home.value, { replace: true })
</script>

<template>
  <div />
</template>
