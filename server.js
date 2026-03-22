// Tower Defense Multiplayer Server
// Usage: node server.js [port]
// Benötigt: npm install ws

const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = parseInt(process.env.APP_PORT) || parseInt(process.argv[2]) || 3000;

// Simple HTTP server to serve game files
const server = http.createServer((req, res) => {
  let filePath = req.url === '/' ? '/index.html' : req.url;
  filePath = path.join(__dirname, filePath);

  const ext = path.extname(filePath);
  const contentTypes = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml'
  };

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }
    res.writeHead(200, { 'Content-Type': contentTypes[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

// WebSocket server
const wss = new WebSocket.Server({ server });

// Lobby storage: { lobbyName: { host: ws, guest: ws, hostName: string, guestName: string, seed: number } }
const lobbies = {};

function broadcast(lobby, msg, excludeWs = null) {
  const data = JSON.stringify(msg);
  if (lobby.host && lobby.host !== excludeWs && lobby.host.readyState === WebSocket.OPEN) {
    lobby.host.send(data);
  }
  if (lobby.guest && lobby.guest !== excludeWs && lobby.guest.readyState === WebSocket.OPEN) {
    lobby.guest.send(data);
  }
}

function send(ws, msg) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

function cleanupLobby(lobbyName) {
  const lobby = lobbies[lobbyName];
  if (!lobby) return;

  broadcast(lobby, { type: 'player_left' });

  // Close connections
  if (lobby.host && lobby.host.readyState === WebSocket.OPEN) {
    lobby.host.lobbyName = null;
  }
  if (lobby.guest && lobby.guest.readyState === WebSocket.OPEN) {
    lobby.guest.lobbyName = null;
  }

  delete lobbies[lobbyName];
  console.log(`Lobby "${lobbyName}" geschlossen`);
}

wss.on('connection', (ws) => {
  console.log('Neue Verbindung');
  ws.lobbyName = null;
  ws.playerRole = null;
  ws.playerName = '';

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    switch (msg.type) {

      case 'create_lobby': {
        const lobbyName = msg.lobbyName;
        const playerName = msg.playerName || 'Spieler 1';

        if (lobbies[lobbyName]) {
          send(ws, { type: 'error', message: 'Lobby existiert bereits!' });
          return;
        }

        // Random seed for synchronized map generation
        const seed = Math.floor(Math.random() * 999999999);

        lobbies[lobbyName] = {
          host: ws,
          guest: null,
          hostName: playerName,
          guestName: null,
          seed: seed,
          hostReady: false,
          guestReady: false,
          round: 0
        };

        ws.lobbyName = lobbyName;
        ws.playerRole = 'host';
        ws.playerName = playerName;

        send(ws, {
          type: 'lobby_created',
          lobbyName: lobbyName,
          role: 'host',
          playerName: playerName
        });

        console.log(`Lobby "${lobbyName}" erstellt von ${playerName}`);
        break;
      }

      case 'join_lobby': {
        const lobbyName = msg.lobbyName;
        const playerName = msg.playerName || 'Spieler 2';
        const lobby = lobbies[lobbyName];

        if (!lobby) {
          send(ws, { type: 'error', message: 'Lobby nicht gefunden!' });
          return;
        }

        if (lobby.guest) {
          send(ws, { type: 'error', message: 'Lobby ist voll!' });
          return;
        }

        lobby.guest = ws;
        lobby.guestName = playerName;

        ws.lobbyName = lobbyName;
        ws.playerRole = 'guest';
        ws.playerName = playerName;

        // Tell guest they joined
        send(ws, {
          type: 'lobby_joined',
          lobbyName: lobbyName,
          role: 'guest',
          playerName: playerName,
          opponentName: lobby.hostName,
          seed: lobby.seed
        });

        // Tell host that guest joined → start game
        send(lobby.host, {
          type: 'game_start',
          opponentName: playerName,
          seed: lobby.seed,
          role: 'host'
        });

        // Tell guest to start game too
        send(ws, {
          type: 'game_start',
          opponentName: lobby.hostName,
          seed: lobby.seed,
          role: 'guest'
        });

        console.log(`${playerName} tritt Lobby "${lobbyName}" bei`);
        break;
      }

      // Player signals "Nächste Runde"
      case 'ready_next_round': {
        const lobby = lobbies[ws.lobbyName];
        if (!lobby) return;

        if (ws.playerRole === 'host') {
          lobby.hostReady = true;
        } else {
          lobby.guestReady = true;
        }

        // Notify opponent that this player is ready
        const opponent = ws.playerRole === 'host' ? lobby.guest : lobby.host;
        send(opponent, { type: 'opponent_ready' });

        // Both ready → start round
        if (lobby.hostReady && lobby.guestReady) {
          lobby.round++;
          lobby.hostReady = false;
          lobby.guestReady = false;

          broadcast(lobby, {
            type: 'round_start',
            round: lobby.round
          });

          console.log(`Lobby "${ws.lobbyName}" → Runde ${lobby.round}`);
        }
        break;
      }

      // Player sends attack units to opponent
      case 'send_attack': {
        const lobby = lobbies[ws.lobbyName];
        if (!lobby) return;

        const opponent = ws.playerRole === 'host' ? lobby.guest : lobby.host;
        send(opponent, {
          type: 'incoming_attack',
          units: msg.units,  // Array of { type, count }
          senderName: ws.playerName
        });
        break;
      }

      // Tower placement sync (optional, for spectating)
      case 'tower_placed': {
        const lobby = lobbies[ws.lobbyName];
        if (!lobby) return;

        const opponent = ws.playerRole === 'host' ? lobby.guest : lobby.host;
        send(opponent, {
          type: 'opponent_tower',
          towerName: msg.towerName,
          gridX: msg.gridX,
          gridY: msg.gridY,
          level: msg.level || 1
        });
        break;
      }

      // Tower sold sync
      case 'tower_sold': {
        const lobby = lobbies[ws.lobbyName];
        if (!lobby) return;

        const opponent = ws.playerRole === 'host' ? lobby.guest : lobby.host;
        send(opponent, {
          type: 'opponent_tower_sold',
          gridX: msg.gridX,
          gridY: msg.gridY
        });
        break;
      }

      // Player lost
      case 'player_defeated': {
        const lobby = lobbies[ws.lobbyName];
        if (!lobby) return;

        const opponent = ws.playerRole === 'host' ? lobby.guest : lobby.host;
        send(opponent, {
          type: 'you_win',
          opponentName: ws.playerName
        });
        send(ws, {
          type: 'you_lose'
        });
        break;
      }

      // Sync lives
      case 'sync_lives': {
        const lobby = lobbies[ws.lobbyName];
        if (!lobby) return;
        const opponent = ws.playerRole === 'host' ? lobby.guest : lobby.host;
        send(opponent, {
          type: 'opponent_lives',
          lives: msg.lives
        });
        break;
      }
    }
  });

  ws.on('close', () => {
    console.log('Verbindung getrennt');
    if (ws.lobbyName && lobbies[ws.lobbyName]) {
      cleanupLobby(ws.lobbyName);
    }
  });

  ws.on('error', (err) => {
    console.error('WebSocket error:', err.message);
  });
});

server.listen(PORT, () => {
  console.log(`\n🎮 Tower Defense Multiplayer Server`);
  console.log(`   HTTP:      http://localhost:${PORT}`);
  console.log(`   WebSocket: ws://localhost:${PORT}`);
  console.log(`\n   Öffne http://localhost:${PORT} im Browser!\n`);
});
