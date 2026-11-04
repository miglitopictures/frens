# Frens — Platform Spec

Frens is a small website where one person hosts a **room**, up to 5 friends join
through a link + password, and everyone plays **toys** together in real time.

A *toy* is anything multiplayer: a game (Gartic, Worms, TowerFall) or a creative
tool (painting, storyboard, game of life). For the platform they are the same thing.

## Goals

- Simple to read, simple to change. No framework. Plain JavaScript.
- No server of our own. The site is static (can live on GitHub Pages).
- Adding a new toy = one new folder + one line in the registry.

## Non-goals (for now)

- Accounts, saved rooms, history.
- Rooms that survive the host leaving.
- Public room lists / matchmaking.
- Anti-cheat. Everyone is a friend.

## Stack

| Piece        | Choice                    |
|--------------|---------------------------|
| Build / dev  | Vite                      |
| Language     | Plain JavaScript (ES modules) |
| Networking   | PeerJS (WebRTC data channels) |
| Rendering    | DOM for menus, Canvas for toys |
| UI language  | Portuguese                |
| Code language| English                   |

## Folder structure

```
frens/
  index.html
  docs/
    SPEC.md            this file
    TOYS.md            how to build a toy
  src/
    main.js            router: home screen <-> room screen
    style.css
    net/room.js        the only file that talks to PeerJS
    lobby/home.js      create / join a room
    lobby/room-view.js player list, link, toy picker, start button
    toys/
      registry.js      list of all toys
      _template/       copy this to start a new toy
      cursors/         test toy: everyone sees everyone's mouse
      gartic/
      worms/
```

`net/` and `lobby/` are created in step 2.

## Network model

### Topology: star, host is the authority

```
   friend ─┐
   friend ─┼──▶  HOST  ──▶ everyone
   friend ─┘   (runs the toy's rules)
```

- Every friend opens **one** PeerJS connection, to the host.
- Friends never talk to each other directly. If a message must reach everyone,
  the host forwards it.
- The host is also a player. Its own client talks to its own host logic through a
  local "fake connection" (no network), so the code path is the same for everyone.

### Room id and link

- The host's PeerJS id **is** the room id. Format: `frens-` + 6 random lowercase
  letters/digits (e.g. `frens-k3x9q2`). The prefix avoids clashing with other apps
  on the public PeerJS server.
- Room link: `https://<site>/#/room/k3x9q2`
  - Uses the `#` part so it works on static hosting and never reaches a server.
- The password is **not** in the link. The host tells it to friends separately.

### Password

- Optional. Chosen by the host when creating the room.
- On connect, the friend sends `hello { name, password }`.
- The host compares. Wrong password → `reject { reason }` and closes the connection.

### Limits

- Max **6** players per room (host + 5).
- A toy can ask for fewer with `maxPlayers`, and can require `minPlayers` to start.

### Signaling server

- v1 uses the free public PeerJS server (`0.peerjs.com`).
- If it becomes unreliable, run our own (`npx peerjs --port 9000`) and change
  one config line in `net/room.js`.
- Known limitation: some networks (mobile 4G, corporate) block direct WebRTC and
  need a TURN server. Not handled in v1.

## Messages

Every message on the wire is a plain object:

```js
{ kind: 'sys', type: 'welcome', data: { ... } }          // platform message
{ kind: 'toy', toyId: 'gartic', type: 'stroke', data: {...} } // toy message
```

Toy messages carry `toyId`, so messages from a toy that already stopped are ignored.

### Platform (`sys`) messages

| Direction       | type       | data                                      | Meaning |
|-----------------|------------|-------------------------------------------|---------|
| friend → host   | `hello`    | `{ name, password }`                      | I want to join |
| host → friend   | `welcome`  | `{ you, players, phase, toyId }`          | You're in; here is the room state |
| host → friend   | `reject`   | `{ reason }`                              | Wrong password / room full |
| host → all      | `players`  | `{ players }`                             | Player list changed |
| host → all      | `toyStart` | `{ toyId }`                               | Mount this toy |
| host → all      | `toyStop`  | `{}`                                      | Back to the lobby |

A **player** is `{ id, name, isHost }`. `id` is the PeerJS id.

## Room phases

```
  lobby ──[host clicks Começar]──▶ playing ──[toy calls end() / host clicks Voltar]──▶ lobby
```

- **lobby**: shows the link, the player list, the toy picker. Only the host can pick and start.
- **playing**: the toy owns the screen. A small top bar keeps "Voltar ao lobby" (host only)
  and the player list.
- Friends who join during **playing** go straight into the running toy. The toy's host
  half is told through `onPlayersChange` and should send them the current state.

## Leaving

- A friend leaves → host removes them and broadcasts `players`.
- The host leaves → the room is over. Friends see "O host saiu" and return home.

## User flow

```
Home
 ├─ [Criar sala]  name + optional password ──▶ Room (as host)
 └─ opening a room link ──▶ name + password ──▶ Room (as friend)

Room (lobby)
  link to copy · players (n/6) · toy picker · [Começar] (host)
```

The player's name is remembered in `localStorage` so they don't retype it.

## Build plan

1. Scaffold + specs (this step).
2. `net/room.js` + lobby + `cursors` test toy. Proves rooms, link, password, players.
3. Gartic clone.
4. Worms clone.
