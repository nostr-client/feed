/**
 * feed.js — <nostr-feed>, a live nostr note feed with profile resolution.
 * No build step. Composes with the shared pool; safe rendering (no innerHTML
 * of user content).
 *
 * Part of https://github.com/nostr-client — one repo, one thing.
 * License: AGPL-3.0-or-later
 *
 * Usage:
 *   <script type="module" src="https://nostr-client.github.io/feed/feed.js"></script>
 *   <nostr-feed limit="30"></nostr-feed>
 *   <nostr-feed authors="<hex>,<hex>"></nostr-feed>     <!-- hex, always hex -->
 *   <nostr-feed relays="wss://a,wss://b" kinds="1" live></nostr-feed>
 */

import { Pool, defaultPool } from 'https://nostr-client.github.io/pool/pool.js'
import { npubShort } from 'https://nostr-client.github.io/nip19/nip19.js'

const IMAGE_RE = /\.(png|jpe?g|gif|webp|avif)(\?\S*)?$/i
const URL_RE = /https?:\/\/[^\s<>"')\]]+/g

const TEMPLATE = /* html */ `
<style>
  :host { display: block; font-family: system-ui, sans-serif; font-size: .95rem; }
  .status { font-size: .8rem; opacity: .6; margin: .4rem 0; }
  article { display: flex; gap: .7rem; padding: .8rem .4rem;
    border-bottom: 1px solid rgba(127,127,127,.2); }
  .avatar { width: 42px; height: 42px; border-radius: 50%; flex: none;
    object-fit: cover; background: rgba(127,127,127,.2); }
  .body { min-width: 0; flex: 1; }
  .meta { font-size: .8rem; margin-bottom: .2rem; }
  .meta .name { font-weight: 600; }
  .meta .when { opacity: .55; }
  .content { white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.45; }
  .content a { color: var(--nostr-accent, #8e30eb); }
  .content img { max-width: 100%; max-height: 22rem; border-radius: 10px;
    display: block; margin-top: .4rem; }
</style>
<div class="status" id="status">connecting…</div>
<div id="notes"></div>
`

class NostrFeed extends HTMLElement {
  static observedAttributes = ['authors', 'kinds', 'relays', 'limit']

  constructor() {
    super()
    this.attachShadow({ mode: 'open' }).innerHTML = TEMPLATE
    this.notesEl = this.shadowRoot.getElementById('notes')
    this.statusEl = this.shadowRoot.getElementById('status')
    this.pool = null
    this.sub = null
    this.profiles = new Map()   // hex pubkey -> { profile data } | null (pending)
    this.pendingProfiles = new Set()
    this.profileTimer = null
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
      const list = authors.split(',').map((s) => s.trim().toLowerCase()).filter((s) => /^[0-9a-f]{64}$/.test(s))
      if (!list.length) return null // authors requested but none valid — show nothing
      filter.authors = list
    }
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
    const article = document.createElement('article')
    article.dataset.pubkey = event.pubkey

    const avatar = document.createElement('img')
    avatar.className = 'avatar'
    avatar.alt = ''
    avatar.loading = 'lazy'

    const body = document.createElement('div')
    body.className = 'body'
    const meta = document.createElement('div')
    meta.className = 'meta'
    const name = document.createElement('span')
    name.className = 'name'
    name.textContent = npubShort(event.pubkey)
    const when = document.createElement('span')
    when.className = 'when'
    when.textContent = ' · ' + this._ago(event.created_at)
    when.title = new Date(event.created_at * 1000).toLocaleString()
    meta.append(name, when)

    const content = document.createElement('div')
    content.className = 'content'
    this._renderContent(content, event.content)

    body.append(meta, content)
    article.append(avatar, body)

    // insert newest-first by created_at
    let next = null
    for (const el of this.notesEl.children) {
      if (Number(el.dataset.ts) < event.created_at) { next = el; break }
    }
    article.dataset.ts = event.created_at
    this.notesEl.insertBefore(article, next)

    const max = Number(this.getAttribute('limit') || 30) * 3
    while (this.notesEl.children.length > max) this.notesEl.lastChild.remove()

    this._wantProfile(event.pubkey)
    this._applyProfile(article)
  }

  /** text + links + inline images, built with DOM nodes — never innerHTML */
  _renderContent(el, text) {
    if (text.length > 1200) text = text.slice(0, 1200) + '…'
    let last = 0
    for (const match of text.matchAll(URL_RE)) {
      el.append(text.slice(last, match.index))
      const url = match[0]
      if (IMAGE_RE.test(url)) {
        const img = document.createElement('img')
        img.src = url
        img.alt = ''
        img.loading = 'lazy'
        el.append(img)
      } else {
        const a = document.createElement('a')
        a.href = url
        a.textContent = url.length > 60 ? url.slice(0, 60) + '…' : url
        a.target = '_blank'
        a.rel = 'noopener noreferrer'
        el.append(a)
      }
      last = match.index + url.length
    }
    el.append(text.slice(last))
  }

  _ago(ts) {
    const s = Math.max(1, Math.floor(Date.now() / 1000 - ts))
    if (s < 60) return s + 's'
    if (s < 3600) return Math.floor(s / 60) + 'm'
    if (s < 86400) return Math.floor(s / 3600) + 'h'
    return Math.floor(s / 86400) + 'd'
  }

  // ------------------------------------------------ batched kind-0 lookups

  _wantProfile(pubkey) {
    if (this.profiles.has(pubkey) || this.pendingProfiles.has(pubkey)) return
    this.pendingProfiles.add(pubkey)
    clearTimeout(this.profileTimer)
    this.profileTimer = setTimeout(() => this._fetchProfiles(), 400)
  }

  async _fetchProfiles() {
    const authors = [...this.pendingProfiles]
    this.pendingProfiles.clear()
    if (!authors.length) return
    for (const pk of authors) this.profiles.set(pk, null)
    const events = await this._pool.list([{ kinds: [0], authors, limit: authors.length }])
    const newest = new Map()
    for (const ev of events) {
      const prev = newest.get(ev.pubkey)
      if (!prev || prev.created_at < ev.created_at) newest.set(ev.pubkey, ev)
    }
    for (const [pk, ev] of newest) {
      try { this.profiles.set(pk, JSON.parse(ev.content)) } catch {}
    }
    for (const article of this.notesEl.children) this._applyProfile(article)
  }

  _applyProfile(article) {
    const profile = this.profiles.get(article.dataset.pubkey)
    if (!profile) return
    const display = profile.display_name || profile.name
    if (display) article.querySelector('.name').textContent = display
    if (profile.picture) {
      const avatar = article.querySelector('.avatar')
      if (avatar.src !== profile.picture) avatar.src = profile.picture
    }
  }
}

if (!customElements.get('nostr-feed')) customElements.define('nostr-feed', NostrFeed)
