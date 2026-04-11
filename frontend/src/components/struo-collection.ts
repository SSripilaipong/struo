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

    const cards = data.items.map((item) => {
      const href = itemHref(item)
      const inner = `<span class="card-name">${escapeHtml(item.name)}</span><span class="card-badge">${escapeHtml(item.type)}</span>`
      const card = href
        ? `<a class="collection-card" href="${href}">${inner}</a>`
        : `<div class="collection-card collection-card--static">${inner}</div>`
      return `<li>${card}</li>`
    }).join('')

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

function itemHref(item: CollectionItem): string | null {
  switch (item.type) {
    case 'arrow':  return `/_arrow/${encodeURIComponent(item.name)}`
    case 'arrows': return `/_arrows/${encodeURIComponent(item.name)}`
    case 'set':    return `/_set/${encodeURIComponent(item.name)}`
    case 'graph':  return `/_graph/${encodeURIComponent(item.name)}`
    default:       return null
  }
}

customElements.define('struo-collection', StruoCollection)
