/**
 * Fiscal rule base for the French micro-entrepreneur régime — parameters of 2026.
 *
 * The rules are written in {@link https://publi.codes | publicodes}, the open,
 * explainable rule language maintained by the French state (URSSAF / betagouv).
 * Keeping the legal parameters here — declaratively, separate from the application
 * code — is what makes TITI'relire transparent *and* maintainable: when a finance
 * act changes a rate, this file changes, not the engine.
 *
 * Every figure below is cross-checked against at least two independent sources;
 * the full sourced table lives in `docs/parameters-2026.md`.
 *
 * Conventions:
 *  - amounts are plain numbers in euros, rates are written as percentages (`12.3%`);
 *  - inputs (set at runtime via the situation) carry a default so the base is always
 *    evaluable on its own;
 *  - identifiers avoid apostrophes on purpose (see `micro . CA`).
 */
export const RULES_YAML = String.raw`
micro:
  titre: Micro-entrepreneur

# ── Inputs (overridden at runtime via setSituation) ───────────────────────────
micro . CA:
  titre: Chiffre d'affaires annuel
  valeur: 0

micro . activité:
  titre: Catégorie d'activité
  valeur: "'vente'"

micro . versement libératoire:
  titre: Option pour le versement forfaitaire libératoire
  valeur: non

micro . ACRE:
  titre: Bénéfice de l'ACRE (première année)
  valeur: non

micro . ACRE réduit:
  titre: ACRE au taux réduit (création à partir du 01/07/2026)
  valeur: non

micro . foyer:
  titre: Foyer fiscal

micro . foyer . parts:
  titre: Nombre de parts de quotient familial
  valeur: 1

micro . foyer . autres revenus imposables:
  titre: Autres revenus nets imposables du foyer
  valeur: 0

# ── Social contributions (URSSAF) ─────────────────────────────────────────────
# Global 2026 rates by activity (excl. CFP, excl. versement libératoire).
micro . taux cotisations:
  titre: Taux de cotisations sociales
  variations:
    - si: micro . activité = 'vente'
      alors: 12.3%
    - si: micro . activité = 'service BIC'
      alors: 21.2%
    - si: micro . activité = 'service BNC'
      alors: 25.6%
    - sinon: 23.2% # libéral CIPAV

# ACRE relief: 50 % for creations before 01/07/2026, 25 % from that date, over the
# first 12 months. Does not apply to the CFP.
micro . ACRE réduit effectif:
  toutes ces conditions:
    - micro . ACRE
    - micro . ACRE réduit

micro . réduction ACRE:
  titre: Réduction ACRE appliquée aux cotisations
  variations:
    - si: micro . ACRE réduit effectif
      alors: 25%
    - si: micro . ACRE
      alors: 50%
    - sinon: 0%

micro . taux cotisations effectif:
  titre: Taux de cotisations après ACRE
  valeur: micro . taux cotisations * (100% - micro . réduction ACRE)

micro . cotisations sociales:
  titre: Cotisations sociales
  valeur: micro . CA * micro . taux cotisations effectif

# ── Training contribution (CFP) ───────────────────────────────────────────────
# 0.1 % commerçant (vente), 0.3 % artisan, 0.2 % libéral / BNC. For BIC services we
# assume the artisanal rate (0.3 %); commercial services would be 0.1 %.
micro . taux CFP:
  titre: Taux de contribution à la formation professionnelle
  variations:
    - si: micro . activité = 'vente'
      alors: 0.1%
    - si: micro . activité = 'service BIC'
      alors: 0.3%
    - sinon: 0.2% # BNC / libéral

micro . CFP:
  titre: Contribution à la formation professionnelle
  valeur: micro . CA * micro . taux CFP

# ── Taxable income under the micro régime (flat allowance) ────────────────────
micro . taux abattement:
  titre: Taux d'abattement forfaitaire
  variations:
    - si: micro . activité = 'vente'
      alors: 71%
    - si: micro . activité = 'service BIC'
      alors: 50%
    - sinon: 34% # BNC / libéral

# The flat allowance cannot be lower than 305 € (but never exceeds turnover).
micro . abattement minimum:
  le minimum de:
    - 305
    - micro . CA

micro . abattement:
  titre: Abattement forfaitaire
  le maximum de:
    - micro . CA * micro . taux abattement
    - micro . abattement minimum

micro . revenu imposable:
  titre: Revenu imposable de l'activité
  valeur: micro . CA - micro . abattement

# ── Income tax — progressive scale (barème 2026, revenus 2025) ────────────────
# Computed as the household's marginal tax: IR(other income + micro) − IR(other income).
# The barème 'multiplicateur' handles the quotient familial (plafonds × parts).
micro . foyer . revenu imposable total:
  valeur: micro . foyer . autres revenus imposables + micro . revenu imposable

micro . foyer . IR avec micro:
  titre: Impôt du foyer avec l'activité
  barème:
    assiette: micro . foyer . revenu imposable total
    multiplicateur: micro . foyer . parts
    tranches: &baremeIR2026
      - plafond: 11600
        taux: 0%
      - plafond: 29579
        taux: 11%
      - plafond: 84577
        taux: 30%
      - plafond: 181917
        taux: 41%
      - taux: 45%

micro . foyer . IR sans micro:
  titre: Impôt du foyer sans l'activité
  barème:
    assiette: micro . foyer . autres revenus imposables
    multiplicateur: micro . foyer . parts
    tranches: *baremeIR2026

micro . impôt barème:
  titre: Impôt sur le revenu au barème (part de l'activité)
  valeur: micro . foyer . IR avec micro - micro . foyer . IR sans micro

# ── Income tax — flat option (versement libératoire) ──────────────────────────
micro . taux versement libératoire:
  titre: Taux du versement libératoire
  variations:
    - si: micro . activité = 'vente'
      alors: 1%
    - si: micro . activité = 'service BIC'
      alors: 1.7%
    - sinon: 2.2% # BNC / libéral

micro . montant versement libératoire:
  titre: Versement libératoire
  valeur: micro . CA * micro . taux versement libératoire

micro . impôt sur le revenu:
  titre: Impôt sur le revenu
  variations:
    - si: micro . versement libératoire
      alors: micro . montant versement libératoire
    - sinon: micro . impôt barème

# ── Aggregates ────────────────────────────────────────────────────────────────
micro . prélèvements totaux:
  titre: Prélèvements totaux
  somme:
    - micro . cotisations sociales
    - micro . CFP
    - micro . impôt sur le revenu

micro . revenu net:
  titre: Revenu net après prélèvements
  valeur: micro . CA - micro . prélèvements totaux

# ── Thresholds (for warnings) ─────────────────────────────────────────────────
micro . seuils:
  titre: Seuils

micro . seuils . plafond micro:
  titre: Plafond du régime micro
  variations:
    - si: micro . activité = 'vente'
      alors: 203100
    - sinon: 83600

micro . seuils . franchise TVA:
  titre: Seuil de franchise en base de TVA
  variations:
    - si: micro . activité = 'vente'
      alors: 85000
    - sinon: 37500

# Seuil majoré (de tolérance) : au-dessus, la franchise cesse dès le mois de dépassement ;
# entre le seuil de base et le majoré, elle est conservée l'année en cours.
micro . seuils . franchise TVA majorée:
  titre: Seuil majoré de franchise en base de TVA
  variations:
    - si: micro . activité = 'vente'
      alors: 93500
    - sinon: 41250

micro . seuils . dépassement plafond:
  valeur: micro . CA > micro . seuils . plafond micro

micro . seuils . dépassement franchise TVA:
  valeur: micro . CA > micro . seuils . franchise TVA

micro . seuils . dépassement franchise TVA majorée:
  valeur: micro . CA > micro . seuils . franchise TVA majorée
`
