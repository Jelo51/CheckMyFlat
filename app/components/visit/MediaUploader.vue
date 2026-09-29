<script setup lang="ts">
import imageCompression from 'browser-image-compression'
import { Camera, ImagePlus, Loader2, Trash2, Video } from 'lucide-vue-next'
import type { ReportMedia } from '~/composables/useVisitReport'

/**
 * Photos et vidéos de la visite. Les photos sont compressées dans le
 * navigateur (JPEG, plus grand côté limité), puis envoyées directement au
 * stockage privé via une URL signée délivrée après contrôle du quota.
 */
const props = defineProps<{
  requestId: string
  media: ReportMedia[]
  maxDimension: number
  maxVideoSeconds: number
  maxBytes: number
  disabled?: boolean
}>()
const emit = defineEmits<{ changed: [] }>()

const supabase = useSupabaseClient()

interface Upload {
  key: string
  name: string
  status: 'pending' | 'error'
  error?: string
}
const uploads = ref<Upload[]>([])
const usedBytes = computed(() => props.media.reduce((s, m) => s + Number(m.size_bytes), 0))
const usedLabel = computed(
  () => `${Math.round(usedBytes.value / 1024 / 1024)} Mo sur ${Math.round(props.maxBytes / 1024 / 1024)} Mo`,
)

function videoDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(video.src)
      resolve(video.duration)
    }
    video.onerror = () => reject(new Error('Vidéo illisible'))
    video.src = URL.createObjectURL(file)
  })
}

async function prepare(file: File) {
  if (file.type.startsWith('image/')) {
    const compressed = await imageCompression(file, {
      maxWidthOrHeight: props.maxDimension,
      initialQuality: 0.8,
      fileType: 'image/jpeg',
      useWebWorker: true,
    })
    const bitmap = await createImageBitmap(compressed)
    const dims = { width: bitmap.width, height: bitmap.height }
    bitmap.close()
    return { blob: compressed, mime: 'image/jpeg', ...dims, durationSeconds: null }
  }
  if (file.type.startsWith('video/')) {
    const duration = await videoDuration(file)
    if (duration > props.maxVideoSeconds + 1) {
      throw new Error(`Vidéo trop longue : ${props.maxVideoSeconds / 60} min maximum`)
    }
    return {
      blob: file,
      mime: file.type,
      width: null,
      height: null,
      durationSeconds: Math.round(duration * 10) / 10,
    }
  }
  throw new Error('Format non pris en charge')
}

async function uploadOne(file: File) {
  const upload: Upload = {
    key: `${file.name}-${file.size}-${Date.now()}`,
    name: file.name,
    status: 'pending',
  }
  uploads.value.push(upload)
  try {
    const prepared = await prepare(file)
    const { path, token } = await api<{ path: string; token: string }>(
      `/api/visits/${props.requestId}/media/upload-url`,
      {
        method: 'POST',
        body: {
          mime: prepared.mime,
          sizeBytes: prepared.blob.size,
          durationSeconds: prepared.durationSeconds,
        },
      },
    )
    const { error } = await supabase.storage
      .from('report-media')
      .uploadToSignedUrl(path, token, prepared.blob, { contentType: prepared.mime })
    if (error) throw new Error('Envoi interrompu, réessayez')
    await api(`/api/visits/${props.requestId}/media`, {
      method: 'POST',
      body: {
        path,
        width: prepared.width,
        height: prepared.height,
        durationSeconds: prepared.durationSeconds,
      },
    })
    uploads.value = uploads.value.filter((u) => u.key !== upload.key)
    emit('changed')
  } catch (e) {
    const target = uploads.value.find((u) => u.key === upload.key)
    if (target) {
      target.status = 'error'
      target.error = e instanceof Error && !('data' in e) ? e.message : errorMessage(e)
    }
  }
}

async function onFiles(event: Event) {
  const input = event.target as HTMLInputElement
  const files = [...(input.files ?? [])]
  input.value = ''
  // Envois successifs : ménage la connexion mobile.
  for (const file of files) await uploadOne(file)
}

const deleting = ref<string | null>(null)
async function remove(id: string) {
  deleting.value = id
  try {
    await api(`/api/visits/${props.requestId}/media/${id}`, { method: 'DELETE' })
    emit('changed')
  } finally {
    deleting.value = null
  }
}

const photoNumber = computed(() => {
  const map = new Map<string, number>()
  props.media.filter((m) => m.kind === 'photo').forEach((m, i) => map.set(m.id, i + 1))
  return map
})
</script>

<template>
  <div>
    <div class="flex flex-wrap gap-2">
      <label
        class="btn btn-primary btn-sm cursor-pointer"
        :class="{ 'pointer-events-none opacity-50': disabled }"
      >
        <UiIcon :icon="Camera" :size="18" />
        Prendre une photo
        <input
          type="file"
          accept="image/*"
          capture="environment"
          class="sr-only"
          :disabled="disabled"
          @change="onFiles"
        />
      </label>
      <label
        class="btn btn-ghost btn-sm cursor-pointer"
        :class="{ 'pointer-events-none opacity-50': disabled }"
      >
        <UiIcon :icon="Video" :size="18" />
        Filmer
        <input
          type="file"
          accept="video/*"
          capture="environment"
          class="sr-only"
          :disabled="disabled"
          @change="onFiles"
        />
      </label>
      <label
        class="btn btn-ghost btn-sm cursor-pointer"
        :class="{ 'pointer-events-none opacity-50': disabled }"
      >
        <UiIcon :icon="ImagePlus" :size="18" />
        Importer
        <input
          type="file"
          accept="image/*,video/*"
          multiple
          class="sr-only"
          :disabled="disabled"
          @change="onFiles"
        />
      </label>
      <span class="ml-auto self-center font-mono text-xs text-muted">{{ usedLabel }}</span>
    </div>

    <ul v-if="uploads.length" class="mt-3 grid gap-1.5" aria-live="polite">
      <li v-for="u in uploads" :key="u.key" class="flex items-center gap-2 text-sm">
        <UiIcon v-if="u.status === 'pending'" :icon="Loader2" :size="16" class="animate-spin text-muted" />
        <span class="truncate" :class="{ 'text-danger': u.status === 'error' }">
          {{ u.name }}
          <template v-if="u.status === 'error'">— {{ u.error }}</template>
        </span>
        <button
          v-if="u.status === 'error'"
          type="button"
          class="ml-auto text-xs underline"
          @click="uploads = uploads.filter((x) => x.key !== u.key)"
        >
          Masquer
        </button>
      </li>
    </ul>

    <ul v-if="media.length" class="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4">
      <li
        v-for="m in media"
        :key="m.id"
        class="relative overflow-hidden rounded-md border border-line bg-surface"
      >
        <img
          v-if="m.kind === 'photo' && m.url"
          :src="m.url"
          :alt="`Photo ${photoNumber.get(m.id)}`"
          class="aspect-square w-full object-cover"
          loading="lazy"
        />
        <video
          v-else-if="m.url"
          :src="m.url"
          class="aspect-square w-full object-cover"
          preload="metadata"
          muted
        />
        <span class="absolute left-1 top-1 rounded bg-ink/80 px-1.5 py-0.5 font-mono text-[10px] text-white">
          {{ m.kind === 'photo' ? `Photo ${photoNumber.get(m.id)}` : 'Vidéo' }}
        </span>
        <button
          v-if="!disabled"
          type="button"
          class="absolute right-1 top-1 grid h-8 w-8 place-items-center rounded bg-white/90 text-danger"
          :aria-label="
            m.kind === 'photo' ? `Supprimer la photo ${photoNumber.get(m.id)}` : 'Supprimer la vidéo'
          "
          :disabled="deleting === m.id"
          @click="remove(m.id)"
        >
          <UiIcon :icon="Trash2" :size="16" />
        </button>
      </li>
    </ul>
  </div>
</template>
