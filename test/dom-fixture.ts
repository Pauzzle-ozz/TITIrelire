/**
 * Shared test fixture: a DOM that mirrors index.html (splash, header mark, the full
 * multi-profile form, and the result region). Not a test file — imported by the happy-dom
 * suites so the wiring is exercised against the same structure the app ships.
 */
export const INDEX_BODY_HTML = `
  <div id="splash" class="splash" aria-hidden="true">
    <div id="splash-rabbit" class="splash-rabbit"></div>
    <p class="splash-word">TITI'relire</p>
  </div>
  <main>
    <div id="brand-mark"></div>
    <form id="form">
      <select id="profile">
        <option value="micro" selected>Micro-entrepreneur</option>
        <option value="particulier">Particulier salarié</option>
        <option value="societe">Société (SASU)</option>
      </select>

      <div id="fields-micro" class="profile-fields">
        <select id="activity">
          <option value="vente_marchandises">Vente</option>
          <option value="prestations_bic">BIC</option>
          <option value="prestations_bnc" selected>BNC</option>
          <option value="liberal_cipav">CIPAV</option>
        </select>
        <input id="revenue" type="number" value="40000" />
        <input id="parts" type="number" value="1" />
        <input id="other" type="number" value="0" />
        <input id="acre" type="checkbox" />
        <input id="acreReduced" type="checkbox" />
      </div>

      <div id="fields-particulier" class="profile-fields" hidden>
        <input id="p-salaire" type="number" value="40000" />
        <input id="p-parts" type="number" value="1" />
        <input id="p-frais" type="number" />
        <input id="p-per" type="number" value="0" />
        <input id="p-autres" type="number" value="0" />
      </div>

      <div id="fields-societe" class="profile-fields" hidden>
        <input id="s-benefice" type="number" value="100000" />
        <input id="s-dividendes" type="number" />
        <input id="s-parts" type="number" value="1" />
        <input id="s-autres" type="number" value="0" />
        <input id="s-reduced" type="checkbox" checked />
      </div>
    </form>
    <div id="result" aria-live="polite"></div>
  </main>`

/** Installs the fixture into the current happy-dom document. */
export function installIndexDom(): void {
  document.head.innerHTML = ''
  document.body.innerHTML = INDEX_BODY_HTML
}
