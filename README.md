# feed

`<nostr-feed>` — a live nostr note feed web component. **No build step.**
One file: [`feed.js`](feed.js).

Part of [nostr-client](https://github.com/nostr-client) — a modular, composable
nostr client where each repo does one thing.

**Live demo:** https://nostr-client.github.io/feed/

## Use

```html
<script type="module" src="https://nostr-client.github.io/feed/feed.js"></script>

<nostr-feed limit="25"></nostr-feed>                 <!-- global firehose -->
<nostr-feed authors="82341f88…,3bf0c63f…"></nostr-feed>  <!-- following (hex!) -->
<nostr-feed relays="wss://relay.example.com"></nostr-feed>
```

Attributes (all reactive — change them and the feed resubscribes):

| attribute | default | notes |
|---|---|---|
| `authors` | everyone | comma-separated **hex** pubkeys — hex is the primitive |
| `kinds` | `1` | comma-separated kind numbers |
| `limit` | `30` | initial backlog; stays live after EOSE |
| `relays` | shared `defaultPool()` | comma-separated relay URLs |
| `hashtag` | — | filter to one `#t` topic |
| `flush` (flag) | cards | zero gap between notes — flat list layouts |
| `flat` (flag) | cards | hairline-row note styling (bluesky/mastodon look) |

Or set the `.pool` property to any object with `subscribe`/`list`.

## What it does

- streams events live, deduped across relays, newest first
- resolves author profiles (kind 0) in **batched** queries, 400 ms debounce
- renders content safely — DOM nodes only, never `innerHTML` on user content;
  links get `rel="noopener noreferrer"`, image URLs become inline `<img>`
- npub only ever appears as display text ([nip19](https://github.com/nostr-client/nip19));
  all APIs are hex

## License

AGPL-3.0-or-later
