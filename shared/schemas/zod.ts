import { z } from 'zod'

/** Zod configuré en français : messages par défaut lisibles par les utilisateurs. */
z.config(z.locales.fr())

export { z }
