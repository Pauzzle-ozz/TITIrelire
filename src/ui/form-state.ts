/**
 * Pure mapping between the DOM form and the vault's remembered inputs.
 *
 * The vault stores each profile's fields as an opaque `Record<string, unknown>` (see
 * {@link ../vault/types.js}). This module is the *only* place that knows which field ids
 * belong to which profile and how to read/write them, so the persistence layer stays
 * decoupled from the form. Everything here is pure over an injected `Document` — no globals,
 * fully unit-testable under happy-dom.
 */
import type { ProfileInputs, VaultProfile } from '../vault/types.js'

/** Field ids per profile, mirroring index.html. Checkboxes are listed in {@link CHECKBOX_IDS}. */
export const FIELD_IDS: Record<VaultProfile, readonly string[]> = {
  micro: ['activity', 'revenue', 'parts', 'other', 'acre', 'acreReduced'],
  particulier: ['p-salaire', 'p-parts', 'p-frais', 'p-per', 'p-autres'],
  societe: ['s-benefice', 's-dividendes', 's-parts', 's-autres', 's-reduced'],
}

/** Ids whose value is a boolean (checkbox), not a string. */
export const CHECKBOX_IDS: ReadonlySet<string> = new Set(['acre', 'acreReduced', 's-reduced'])

/** Reads the profile currently selected in the `#profile` dropdown (defaults to `micro`). */
export function readActiveProfile(doc: Document): VaultProfile {
  const select = doc.getElementById('profile') as HTMLSelectElement | null
  const value = select?.value
  return value === 'particulier' || value === 'societe' ? value : 'micro'
}

/** Reads one profile's field values from the DOM (checkbox → boolean, else string). */
export function readProfileInputs(doc: Document, profile: VaultProfile): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const id of FIELD_IDS[profile]) {
    const el = doc.getElementById(id) as HTMLInputElement | HTMLSelectElement | null
    if (el === null) continue
    out[id] = CHECKBOX_IDS.has(id) ? (el as HTMLInputElement).checked : el.value
  }
  return out
}

/** Reads the whole form (active profile + every profile's fields) into vault shape. */
export function readForm(doc: Document): { activeProfile: VaultProfile; profileInputs: ProfileInputs } {
  return {
    activeProfile: readActiveProfile(doc),
    profileInputs: {
      micro: readProfileInputs(doc, 'micro'),
      particulier: readProfileInputs(doc, 'particulier'),
      societe: readProfileInputs(doc, 'societe'),
    },
  }
}

/** Writes one profile's saved values back into the DOM fields (missing ids are skipped). */
export function applyProfileInputs(
  doc: Document,
  profile: VaultProfile,
  values: Record<string, unknown> | undefined,
): void {
  if (values === undefined) return
  for (const id of FIELD_IDS[profile]) {
    if (!(id in values)) continue
    const el = doc.getElementById(id) as HTMLInputElement | HTMLSelectElement | null
    if (el === null) continue
    const value = values[id]
    if (CHECKBOX_IDS.has(id)) {
      ;(el as HTMLInputElement).checked = Boolean(value)
    } else if (value !== undefined && value !== null) {
      el.value = String(value)
    }
  }
}

/**
 * Prefills the whole form from a saved snapshot: selects the active profile and restores
 * every remembered field. The caller is responsible for triggering a recompute afterwards.
 */
export function applyForm(
  doc: Document,
  snapshot: { activeProfile: VaultProfile; profileInputs: ProfileInputs },
): void {
  const select = doc.getElementById('profile') as HTMLSelectElement | null
  if (select !== null) select.value = snapshot.activeProfile
  applyProfileInputs(doc, 'micro', snapshot.profileInputs.micro)
  applyProfileInputs(doc, 'particulier', snapshot.profileInputs.particulier)
  applyProfileInputs(doc, 'societe', snapshot.profileInputs.societe)
}
