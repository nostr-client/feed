/**
 * feed.js — <nostr-feed>, a live nostr note feed.
 * No build step. Subscription, dedup and ordering live here; each note is a
 * <nostr-note> card from the note repo (rich safe content, shared profile
 * resolution, reactions if reactions.js is on the page).
 *
 * Part of https://github.com/nostr-client — one repo, one thing.
 * License: AGPL-3.0-or-later
 *
 * Usage:
 *   <script type="module" src="https://nostr-client.github.io/feed/feed.js"></script>
 *   <nostr-feed limit="30"></nostr-feed>
 *   <nostr-feed authors="<hex>,<hex>"></nostr-feed>     <!-- hex, always hex -->
 *   <nostr-feed hashtag="bitcoin"></nostr-feed>
 *   <nostr-feed relays="wss://a,wss://b" kinds="1" limit="20"></nostr-feed>
 *
 * All attributes are reactive — change one and the feed resubscribes.
 * Clicking a note emits 'nostr:note-click' { event } (from the note card).
 */

import { Pool, defaultPool } from 'https://nostr-client.github.io/pool/pool.js'
import 'https://nostr-client.github.io/note/note.js'

const HEX64 = /^[0-9a-f]{64}$/

const TEMPLATE = /* html */ `
<style>
  :host { display: block;
    font-family: var(--nc-font, ui-sans-serif, system-ui, sans-serif); }
  .status { font-size: .78rem; color: var(--nc-faint, #a8a4b0); margin: .5rem .2rem; }
  #notes { display: grid; gap: .65rem; }
</style>
<div class="status" id="status">connecting…</div>
<div id="notes"></div>
`

class NostrFeed extends HTMLElement {
  static observedAttributes = ['authors', 'kinds', 'relays', 'limit', 'hashtag']

  constructor() {
    super()
    this.attachShadow({ mode: 'open' }).innerHTML = TEMPLATE
    this.notesEl = this.shadowRoot.getElementById('notes')
    this.statusEl = this.shadowRoot.getElementById('status')
    this.pool = null
    this.sub = null
    this.count = 0
  }

  connectedCallback() { this._resubscribe() }
  disconnectedCallback() { this.sub?.close() }

  attributeChangedCallback(_n, oldVal, newVal) {
    if (oldVal !== newVal && this.isConnected) this._resubscribe()
  }

  get _pool() {
    const relays = this.getAttribute('relays')
    if (relays) return (this.pool = new Pool(relays.split(',').map((s) => s.trim())))
    return this.pool ?? (this.pool = defaultPool())
  }

  _filters() {
    const filter = {
      kinds: (this.getAttribute('kinds') || '1').split(',').map(Number),
      limit: Number(this.getAttribute('limit') || 30),
    }
    const authors = this.getAttribute('authors')
    if (authors) {
      const list = authors.split(',').map((s) => s.trim().toLowerCase()).filter((s) => HEX64.test(s))
      if (!list.length) return null // authors requested but none valid — show nothing
      filter.authors = list
    }
    const hashtag = this.getAttribute('hashtag')
    if (hashtag) filter['#t'] = [hashtag.replace(/^#/, '').toLowerCase()]
    return [filter]
  }

  _resubscribe() {
    this.sub?.close()
    this.notesEl.innerHTML = ''
    this.count = 0
    const filters = this._filters()
    if (!filters) { this.statusEl.textContent = 'no valid authors (hex pubkeys required)'; return }
    this.statusEl.textContent = 'loading…'
    this.sub = this._pool.subscribe(filters, {
      onEvent: (event) => this._add(event),
      onEose: () => { this.statusEl.textContent = this.count + ' notes · live' },
    })
  }

  _add(event) {
    this.count++
    const note = document.createElement('nostr-note')
    note.setAttribute('clickable', '')
    if (this.pool && this.getAttribute('relays')) note.pool = this.pool
    note.event = event
    note.dataset.ts = event.created_at

    // insert newest-first by created_at
    let next = null
    for (const el of this.notesEl.children) {
      if (Number(el.dataset.ts) < event.created_at) { next = el; break }
    }
    this.notesEl.insertBefore(note, next)

    const max = Number(this.getAttribute('limit') || 30) * 3
    while (this.notesEl.children.length > max) this.notesEl.lastChild.remove()
  }
}

if (!customElements.get('nostr-feed')) customElements.define('nostr-feed', NostrFeed)
