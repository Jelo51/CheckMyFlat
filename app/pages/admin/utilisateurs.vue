<script setup lang="ts">
import { Download, Search, UserPlus } from 'lucide-vue-next'
import { formatEuros } from '#shared/domain/pricing'
import { formatDay } from '#shared/utils/time'
import { ACCOUNT_ROLES, ROLE_LABELS, adminUserCreateSchema, type AccountRole } from '#shared/schemas/account'
import type { Tables } from '~/types/database.types'

definePageMeta({ layout: 'app', roles: ['admin'] })
useSeoMeta({ title: 'Utilisateurs' })

type AdminUser = Tables<'profiles'> & { emailConfirmed: boolean; requestCount: number; spentCents: number }

const { profile } = useProfile()
const { data: users, refresh } = await useAsyncData('admin-users', () => api<AdminUser[]>('/api/admin/users'))

const search = ref('')
const roleFilter = ref<AccountRole | ''>('')
const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  return (users.value ?? []).filter(
    (u) =>
      (!roleFilter.value || u.role === roleFilter.value) &&
      (!q || `${u.full_name ?? ''} ${u.email}`.toLowerCase().includes(q)),
  )
})
const createdThisWeek = computed(
  () =>
    (users.value ?? []).filter((u) => Date.now() - new Date(u.created_at).getTime() < 7 * 86400_000).length,
)

const message = ref<{ tone: 'success' | 'error'; text: string } | null>(null)
async function run(fn: () => Promise<unknown>, success: string) {
  message.value = null
  try {
    await fn()
    message.value = { tone: 'success', text: success }
    await refresh()
  } catch (e) {
    message.value = { tone: 'error', text: errorMessage(e) }
  }
}

const changeRole = (u: AdminUser, role: AccountRole) =>
  run(
    () => api(`/api/admin/users/${u.id}`, { method: 'PATCH', body: { role } }),
    `Rôle de ${u.email} : ${ROLE_LABELS[role]}.`,
  )
const toggleSuspend = (u: AdminUser) =>
  run(
    () => api(`/api/admin/users/${u.id}`, { method: 'PATCH', body: { suspended: !u.suspended_at } }),
    u.suspended_at ? `Compte ${u.email} réactivé.` : `Compte ${u.email} suspendu.`,
  )

// Invitation
const invite = reactive({ email: '', fullName: '', role: 'user' as AccountRole })
const inviteForm = useFormErrors()
const inviting = ref(false)
async function submitInvite() {
  const data = inviteForm.validate(adminUserCreateSchema, invite)
  if (!data) return
  inviting.value = true
  await run(
    () => api('/api/admin/users', { method: 'POST', body: data }),
    `Invitation envoyée à ${data.email}.`,
  )
  inviting.value = false
  if (message.value?.tone === 'success') Object.assign(invite, { email: '', fullName: '', role: 'user' })
}

// Suppression
const deleteDialog = ref<{ open: () => void; close: () => void } | null>(null)
const toDelete = ref<AdminUser | null>(null)
const deleteError = ref<string | null>(null)
function askDelete(u: AdminUser) {
  toDelete.value = u
  deleteError.value = null
  deleteDialog.value?.open()
}
async function confirmDelete() {
  if (!toDelete.value) return
  try {
    await api(`/api/admin/users/${toDelete.value.id}`, { method: 'DELETE' })
    deleteDialog.value?.close()
    message.value = { tone: 'success', text: `Compte ${toDelete.value.email} supprimé.` }
    await refresh()
  } catch (e) {
    deleteError.value = errorMessage(e)
  }
}

/** Export CSV (séparateur « ; » pour Excel en français). */
function exportCsv() {
  const rows = [
    ['Nom', 'Email', 'Rôle', 'Inscrit le', 'Demandes', 'Dépensé (€)', 'État'],
    ...filtered.value.map((u) => [
      u.full_name ?? '',
      u.email,
      ROLE_LABELS[u.role as AccountRole],
      formatDay(u.created_at),
      String(u.requestCount),
      (u.spentCents / 100).toFixed(2).replace('.', ','),
      u.suspended_at ? 'Suspendu' : u.emailConfirmed ? 'Actif' : 'Email non vérifié',
    ]),
  ]
  const csv = rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(';')).join('\n')
  const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }))
  const a = Object.assign(document.createElement('a'), {
    href: url,
    download: 'utilisateurs-checkmyflat.csv',
  })
  a.click()
  URL.revokeObjectURL(url)
}
</script>

<template>
  <div>
    <UiPageHeader
      title="Utilisateurs"
      :subtitle="`${users?.length ?? 0} comptes, ${createdThisWeek} créé(s) cette semaine.`"
    >
      <template #actions>
        <button type="button" class="btn btn-ghost btn-sm" @click="exportCsv">
          <UiIcon :icon="Download" :size="16" />
          Exporter
        </button>
      </template>
    </UiPageHeader>
    <UiAlertBox v-if="message" :tone="message.tone" class="mb-4">{{ message.text }}</UiAlertBox>

    <form
      class="card mb-6 grid gap-3 p-5 md:grid-cols-[1fr_1fr_160px_auto] md:items-end"
      novalidate
      @submit.prevent="submitInvite"
    >
      <UiFormField
        v-slot="{ id, invalid }"
        label="Nom"
        :error="inviteForm.errors.value.fullName"
        class="!mb-0"
      >
        <input :id="id" v-model="invite.fullName" class="input" :aria-invalid="invalid" />
      </UiFormField>
      <UiFormField
        v-slot="{ id, invalid }"
        label="Email"
        :error="inviteForm.errors.value.email"
        class="!mb-0"
      >
        <input :id="id" v-model="invite.email" type="email" class="input" :aria-invalid="invalid" />
      </UiFormField>
      <UiFormField v-slot="{ id }" label="Rôle" class="!mb-0">
        <select :id="id" v-model="invite.role" class="input">
          <option v-for="r in ACCOUNT_ROLES" :key="r" :value="r">{{ ROLE_LABELS[r] }}</option>
        </select>
      </UiFormField>
      <button type="submit" class="btn btn-primary" :disabled="inviting">
        <UiIcon :icon="UserPlus" :size="18" />
        Inviter
      </button>
    </form>

    <div class="mb-4 flex flex-wrap gap-3">
      <div class="relative min-w-[220px] flex-1">
        <label for="user-search" class="sr-only">Rechercher un compte</label>
        <UiIcon :icon="Search" :size="18" class="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <input
          id="user-search"
          v-model="search"
          type="search"
          class="input pl-10"
          placeholder="Nom ou email"
        />
      </div>
      <label for="role-filter" class="sr-only">Rôle</label>
      <select id="role-filter" v-model="roleFilter" class="input max-w-[200px]">
        <option value="">Tous les rôles</option>
        <option v-for="r in ACCOUNT_ROLES" :key="r" :value="r">{{ ROLE_LABELS[r] }}</option>
      </select>
    </div>

    <div class="overflow-x-auto rounded-lg border border-line">
      <table class="table min-w-[860px]">
        <thead>
          <tr>
            <th scope="col">Compte</th>
            <th scope="col">Inscrit le</th>
            <th scope="col">Demandes</th>
            <th scope="col">Dépensé</th>
            <th scope="col">Rôle</th>
            <th scope="col">État</th>
            <th scope="col"><span class="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="u in filtered" :key="u.id">
            <td>
              <b>{{ u.full_name ?? '—' }}</b>
              <div class="text-[13px] text-muted">{{ u.email }}</div>
            </td>
            <td class="whitespace-nowrap">{{ formatDay(u.created_at) }}</td>
            <td>{{ u.requestCount }}</td>
            <td class="font-mono">{{ u.spentCents ? formatEuros(u.spentCents, true) : '—' }}</td>
            <td>
              <label :for="`role-${u.id}`" class="sr-only">Rôle de {{ u.email }}</label>
              <select
                :id="`role-${u.id}`"
                :value="u.role"
                class="input !py-1.5 text-sm"
                :disabled="u.id === profile?.id"
                @change="changeRole(u, ($event.target as HTMLSelectElement).value as AccountRole)"
              >
                <option v-for="r in ACCOUNT_ROLES" :key="r" :value="r">{{ ROLE_LABELS[r] }}</option>
              </select>
            </td>
            <td>
              <span
                class="inline-flex whitespace-nowrap rounded-full border px-[9px] py-1 font-mono text-[11.5px]"
                :class="
                  u.suspended_at
                    ? 'border-line-strong text-muted'
                    : u.emailConfirmed
                      ? 'border-brand bg-brand-tint text-brand-dark'
                      : 'border-warn-border bg-warn-tint text-warn'
                "
              >
                {{ u.suspended_at ? 'Suspendu' : u.emailConfirmed ? 'Actif' : 'Email non vérifié' }}
              </span>
            </td>
            <td class="whitespace-nowrap">
              <template v-if="u.id !== profile?.id">
                <button type="button" class="btn btn-ghost btn-sm" @click="toggleSuspend(u)">
                  {{ u.suspended_at ? 'Réactiver' : 'Suspendre' }}
                </button>
                <button type="button" class="btn btn-ghost btn-sm ml-1" @click="askDelete(u)">
                  Supprimer
                </button>
              </template>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <UiReasonDialog
      ref="deleteDialog"
      :title="`Supprimer ${toDelete?.email ?? ''} ?`"
      confirm-label="Supprimer définitivement"
      tone="danger"
      :error="deleteError"
      @confirm="confirmDelete"
    >
      <p>
        Le compte et ses demandes non payées sont supprimés. Un compte ayant des paiements ne peut qu’être
        suspendu.
      </p>
    </UiReasonDialog>
  </div>
</template>
