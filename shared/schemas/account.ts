import { z } from './zod'

export const ROLES = ['visitor', 'user', 'agent', 'admin'] as const
export type Role = (typeof ROLES)[number]
/** Rôles attribuables à un compte (`visitor` désigne un non-connecté). */
export const ACCOUNT_ROLES = ['user', 'agent', 'admin'] as const
export type AccountRole = (typeof ACCOUNT_ROLES)[number]

export const ROLE_LABELS: Record<Role, string> = {
  visitor: 'Visiteur',
  user: 'Client',
  agent: 'Agent',
  admin: 'Admin',
}

export const PASSWORD_MIN = 8

const email = z.email({ error: 'Email invalide' }).trim().toLowerCase()
const password = z
  .string()
  .min(PASSWORD_MIN, { error: `${PASSWORD_MIN} caractères minimum` })
  .max(72)
const fullName = z.string().trim().min(2, { error: 'Indiquez votre nom' }).max(120)
const phone = z
  .string()
  .trim()
  .regex(/^[+0-9 ().-]{6,20}$/, { error: 'Numéro de téléphone invalide' })

export const signUpSchema = z.object({
  fullName,
  email,
  password,
  acceptTerms: z.literal(true, { error: 'Vous devez accepter les conditions générales' }),
})

export const signInSchema = z.object({
  email,
  password: z.string().min(1, { error: 'Indiquez votre mot de passe' }),
})

export const forgotPasswordSchema = z.object({ email })
export const resetPasswordSchema = z.object({ password })

export const profileSchema = z.object({
  fullName,
  phone: phone.nullish(),
})

export const adminUserCreateSchema = z.object({
  email,
  fullName,
  role: z.enum(ACCOUNT_ROLES),
})

export const adminUserUpdateSchema = z.object({
  fullName: fullName.optional(),
  phone: phone.nullish(),
  role: z.enum(ACCOUNT_ROLES).optional(),
  suspended: z.boolean().optional(),
})
