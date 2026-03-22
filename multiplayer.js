// Multiplayer via PHP-Polling (kein WebSocket, kein Node.js)
export class Multiplayer {
  constructor() {
    this.connected    = false;
    this.lobbyName    = null;
    this.playerId     = null;
    this.role         = null; // 'host' | 'guest'
    this.playerName   = '';
    this.opponentName = '';
    this.seed         = 0;
    this.opponentReady = false;
    this.myReady       = false;
    this.round         = 0;
    this.opponentLives = 20;
    this.lastEventId   = 0;
    this._pollTimer    = null;
    this._pollActive   = false;
    this._opponentWasOnline = false;

    // Callbacks
    this.onError            = null;
    this.onLobbyCreated     = null;
    this.onGameStart        = null;
    this.onOpponentReady    = null;
    this.onRoundStart       = null;
    this.onIncomingAttack   = null;
    this.onOpponentTower    = null;
    this.onOpponentTowerSold= null;
    this.onYouWin           = null;
    this.onYouLose          = null;
    this.onPlayerLeft       = null;
    this.onOpponentLives    = null;
  }

  // ── CREATE LOBBY ──────────────────────────────────────
  async createLobby(lobbyName, playerName) {
    this.lobbyName  = lobbyName;
    this.playerName = playerName;
    try {
      const res  = await fetch('api/lobby.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create', lobby: lobbyName, player: playerName }),
      });
      const data = await res.json();
      if (data.error) { if (this.onError) this.onError(data.error); return; }

      this.playerId  = data.player_id;
      this.role      = 'host';
      this.seed      = data.seed;
      this.connected = true;
      if (this.onLobbyCreated) this.onLobbyCreated({ lobbyName, playerName });
      this._startPolling();
    } catch (e) {
      if (this.onError) this.onError('Server nicht erreichbar');
    }
  }

  // ── JOIN LOBBY ────────────────────────────────────────
  async joinLobby(lobbyName, playerName) {
    this.lobbyName  = lobbyName;
    this.playerName = playerName;
    try {
      const res  = await fetch('api/lobby.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'join', lobby: lobbyName, player: playerName }),
      });
      const data = await res.json();
      if (data.error) { if (this.onError) this.onError(data.error); return; }

      this.playerId     = data.player_id;
      this.role         = 'guest';
      this.seed         = data.seed;
      this.opponentName = data.opponentName;
      this.connected    = true;
      this._startPolling();
    } catch (e) {
      if (this.onError) this.onError('Server nicht erreichbar');
    }
  }

  // ── POLLING ───────────────────────────────────────────
  _startPolling() {
    this._pollActive = true;
    this._doPoll();
  }

  _stopPolling() {
    this._pollActive = false;
    if (this._pollTimer) clearTimeout(this._pollTimer);
  }

  async _doPoll() {
    if (!this._pollActive) return;
    try {
      const url = `api/poll.php?lobby=${encodeURIComponent(this.lobbyName)}`
                + `&player_id=${this.playerId}`
                + `&last_event_id=${this.lastEventId}`;
      const res  = await fetch(url);
      const data = await res.json();

      if (data.events && data.events.length > 0) {
        for (const ev of data.events) {
          if (ev.id > this.lastEventId) this.lastEventId = ev.id;
          this._handleEvent(ev);
        }
      }

      // Detect opponent disconnect
      if (this._opponentWasOnline && data.opponent_online === false && this.connected) {
        this._stopPolling();
        if (this.onPlayerLeft) this.onPlayerLeft();
      }
      if (data.opponent_online) this._opponentWasOnline = true;

    } catch (e) {
      console.warn('Poll-Fehler:', e);
    }

    if (this._pollActive) {
      this._pollTimer = setTimeout(() => this._doPoll(), 600);
    }
  }

  // ── EVENT HANDLER ─────────────────────────────────────
  _handleEvent(msg) {
    switch (msg.type) {
      case 'error':
        if (this.onError) this.onError(msg.message); break;

      case 'game_start':
        this.opponentName = msg.opponentName;
        this.seed = msg.seed;
        this.role = msg.role;
        if (this.onGameStart) this.onGameStart(msg); break;

      case 'opponent_ready':
        this.opponentReady = true;
        if (this.onOpponentReady) this.onOpponentReady(); break;

      case 'round_start':
        this.round = msg.round;
        this.opponentReady = false;
        this.myReady = false;
        if (this.onRoundStart) this.onRoundStart(msg.round); break;

      case 'incoming_attack':
        if (this.onIncomingAttack) this.onIncomingAttack(msg.units, msg.senderName); break;

      case 'opponent_tower':
        if (this.onOpponentTower) this.onOpponentTower(msg); break;

      case 'opponent_tower_sold':
        if (this.onOpponentTowerSold) this.onOpponentTowerSold(msg); break;

      case 'you_win':
        if (this.onYouWin) this.onYouWin(msg.opponentName); break;

      case 'you_lose':
        if (this.onYouLose) this.onYouLose(); break;

      case 'player_left':
        this._stopPolling();
        if (this.onPlayerLeft) this.onPlayerLeft(); break;

      case 'opponent_lives':
        this.opponentLives = msg.lives;
        if (this.onOpponentLives) this.onOpponentLives(msg.lives); break;
    }
  }

  // ── SEND ACTION ───────────────────────────────────────
  async _send(data) {
    try {
      await fetch('api/action.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lobby: this.lobbyName, player_id: this.playerId, ...data }),
      });
    } catch (e) { console.warn('Sende-Fehler:', e); }
  }

  readyNextRound()                        { this.myReady = true; this._send({ type: 'ready_next_round' }); }
  sendAttack(units)                       { this._send({ type: 'send_attack', units }); }
  syncTowerPlaced(towerName, gx, gy, lvl){ this._send({ type: 'tower_placed', towerName, gridX: gx, gridY: gy, level: lvl }); }
  syncTowerSold(gx, gy)                  { this._send({ type: 'tower_sold',   gridX: gx, gridY: gy }); }
  sendDefeated()                         { this._send({ type: 'player_defeated' }); }
  syncLives(lives)                       { this._send({ type: 'sync_lives', lives }); }

  disconnect() {
    this._stopPolling();
    this._send({ type: 'leave' });
    this.connected = false;
  }

  // ── HELPERS ───────────────────────────────────────────
  static seededRandom(seed) {
    let s = seed;
    return function () {
      s = (s * 1664525 + 1013904223) & 0xFFFFFFFF;
      return (s >>> 0) / 0xFFFFFFFF;
    };
  }

  isHost()       { return this.role === 'host'; }
  isGuest()      { return this.role === 'guest'; }
  getPlayerSide(){ return this.role === 'host' ? 'left' : 'right'; }
}
