import { escapeHtml } from '../utils.js'

interface SetResponse {
  name: string
  elements: string[]
}

class StruoSet extends HTMLElement {
  static get observedAttributes(): string[] {
    return ['name']
  }

  connectedCallback(): void {
    this.render()
  }

  private async render(): Promise<void> {
    const name = this.getAttribute('name') ?? ''

    let data: SetResponse

    try {
      const res = await fetch(`/api/set/${encodeURIComponent(name)}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      data = await res.json()
    } catch {
      this.innerHTML = `
        <div class="mapping-page">
          <nav class="mapping-nav">
            <a class="back-link" href="/">← collection</a>
          </nav>
          <div class="error-state">Set "${escapeHtml(name)}" not found.</div>
        </div>
      `
      return
    }

    const items = data.elements.length === 0
      ? `<li class="set-empty">∅ empty set</li>`
      : data.elements.map(el => `<li class="set-element">${escapeHtml(el)}</li>`).join('')

    this.innerHTML = `
      <div class="mapping-page">
        <nav class="mapping-nav">
          <a class="back-link" href="/">← collection</a>
          <h1 class="mapping-title">${escapeHtml(data.name)}</h1>
          <span class="mapping-type-badge">set</span>
        </nav>
        <div class="graph-container">
          <ul class="set-list">${items}</ul>
        </div>
      </div>
    `
  }
}

customElements.define('struo-set', StruoSet)
