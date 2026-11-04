# Backlog

Things we decided to do later. Most important first.

## Network

- [ ] **Add a TURN server.** Some networks (symmetric NAT, blocked UDP, client
  isolation on guest Wi-Fi) block direct WebRTC connections. Firefox shows
  "ICE failed, your TURN server appears to be broken". PeerJS's own free TURN was
  shut down in Dec 2023 (https://github.com/peers/peerjs/discussions/1172).
  Plan: Metered Open Relay free tier (20 GB/month). Fetch `iceServers` from their
  API in `net/room.js` and pass them as `config` to `new Peer(...)`. Keep working
  without TURN if the fetch fails.
  Seen on: 2026-11-04, first Wi-Fi failed, shared 5G worked.

## Look and feel

- [ ] Refine the visual style of the whole platform and all toys together.

## Toys

- [x] Gartic clone (themes, custom words, choose 1 of 3, hints, scores)
- [x] Worms clone (teams of 3, wind, bazooka, destructible terrain)
- [ ] Gartic: paint bucket, undo
- [ ] Worms: more weapons (grenade with bounce), fall damage, gravestones
