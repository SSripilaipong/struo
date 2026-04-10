import { escapeHtml } from '../utils.js'

interface CollectionItem {
  name: string
  type: string
}

interface CollectionResponse {
  items: CollectionItem[]
}

class StruoCollection extends HTMLElement {
  connectedCallback(): void {
    this.render()
  }

  private async render(): Promise<void> {
    let data: CollectionResponse

    try {
      const res = await fetch('/api/collection')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      data = await res.json()
    } catch (err) {
      this.innerHTML = `<div class="error-state">Failed to load collection.</div>`
      return
    }

    if (data.items.length === 0) {
      this.innerHTML = `
        <div class="collection">
          <div class="collection-header">
            <div class="collection-wordmark">struo</div>
            <h1 class="collection-title">index</h1>
          </div>
          <div class="empty-state">No definitions found in index.sto.</div>
        </div>
      `
      return
    }

    const cards = data.items.map((item) => `
      <li>
        <a class="collection-card" href="/_mapping/${encodeURIComponent(item.name)}">
          <span class="card-name">${escapeHtml(item.name)}</span>
          <span class="card-badge">${escapeHtml(item.type)}</span>
        </a>
      </li>
    `).join('')

    this.innerHTML = `
      <div class="collection">
        <div class="collection-header">
          <div class="collection-wordmark">struo</div>
          <h1 class="collection-title">index</h1>
          <p class="collection-subtitle">${data.items.length} definition${data.items.length === 1 ? '' : 's'}</p>
        </div>
        <ul class="collection-list">${cards}</ul>
      </div>
    `
  }
}

customElements.define('struo-collection', StruoCollection)
