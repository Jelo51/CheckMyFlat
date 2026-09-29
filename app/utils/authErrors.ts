/** Messages d'erreur Supabase Auth → français. */
const MESSAGES: Record<string, string> = {
  invalid_credentials: 'Email ou mot de passe incorrect.',
  user_already_exists: 'Un compte existe déjà avec cet email.',
  email_exists: 'Un compte existe déjà avec cet email.',
  email_not_confirmed: 'Confirmez votre adresse email avant de vous connecter (lien reçu par email).',
  weak_password: 'Mot de passe trop faible : 8 caractères minimum.',
  same_password: 'Choisissez un mot de passe différent de l’actuel.',
  over_email_send_rate_limit: 'Trop d’emails envoyés. Réessayez dans quelques minutes.',
  over_request_rate_limit: 'Trop de tentatives. Réessayez dans quelques minutes.',
  user_banned: 'Ce compte est suspendu.',
  session_expired: 'Votre session a expiré. Reconnectez-vous.',
  otp_expired: 'Ce lien a expiré. Demandez-en un nouveau.',
}

export function authErrorMessage(error: { code?: string; message?: string } | null | undefined): string {
  return (error?.code && MESSAGES[error.code]) || 'Une erreur est survenue. Réessayez.'
}
