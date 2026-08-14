/**
 * Pure presentation for the home dashboard. DOM-free and escaped: turns a small summary into
 * an overview card grid (a couple of live stats + navigation cards to the other pages).
 */
import { escapeHtml } from './render.js'
import { formatEuro } from './tx-view-model.js'

/** The minimal state the dashboard displays. */
export interface DashboardData {
  /** Whether the personal space is currently unlocked. */
  unlocked: boolean
  /** Human label of the active profile. */
  profileLabel: string
  /** Indicative total of identified optimisations for the active profile (euros/year). */
  optimisationTotal: number
}

interface NavCard {
  route: string
  title: string
  desc: string
}

const NAV_CARDS: readonly NavCard[] = [
  { route: 'espace', title: '🔐 Mon espace', desc: 'Créez ou déverrouillez votre coffre chiffré.' },
  { route: 'situation', title: '📝 Ma situation', desc: 'Profil et chiffres de votre foyer / activité.' },
  { route: 'transactions', title: '📊 Mes transactions', desc: 'Importez et classez vos mouvements pro/perso.' },
  { route: 'resultats', title: '🧮 Résultats & conseils', desc: 'Le détail ligne par ligne et les optimisations.' },
]

/** Renders the dashboard overview. */
export function renderDashboard(data: DashboardData): string {
  const espace = data.unlocked ? 'Déverrouillé ✓' : 'Verrouillé'
  const total =
    data.optimisationTotal > 0 ? `${escapeHtml(formatEuro(data.optimisationTotal))}` : '—'
  const cards = NAV_CARDS.map(
    (c) => `
      <a class="dash-card" data-route="${c.route}" href="#/${c.route}">
        <div class="dash-card-t">${escapeHtml(c.title)}</div>
        <div class="dash-card-d">${escapeHtml(c.desc)}</div>
      </a>`,
  ).join('')

  return `
    <div class="dash-grid">
      <div class="dash-stat accent">
        <div class="dash-stat-k">Optimisations identifiées</div>
        <div class="dash-stat-v">${total}</div>
        <div class="dash-stat-sub">estimation indicative / an — profil ${escapeHtml(data.profileLabel)}</div>
      </div>
      <div class="dash-stat">
        <div class="dash-stat-k">Mon espace</div>
        <div class="dash-stat-v">${escapeHtml(espace)}</div>
        <div class="dash-stat-sub">chiffré sur cet appareil</div>
      </div>
      <div class="dash-stat">
        <div class="dash-stat-k">Profil actif</div>
        <div class="dash-stat-v" style="font-size:1.05rem">${escapeHtml(data.profileLabel)}</div>
        <div class="dash-stat-sub">modifiable dans « Ma situation »</div>
      </div>
    </div>
    <div class="dash-links">${cards}</div>`
}
