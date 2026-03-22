<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

function getLobbyPath($name) {
    $dir = sys_get_temp_dir() . '/tower_game';
    return $dir . '/lobby_' . preg_replace('/[^a-zA-Z0-9_-]/', '_', strtolower($name)) . '.json';
}

$lobbyName   = trim($_GET['lobby']         ?? '');
$playerId    = trim($_GET['player_id']     ?? '');
$lastEventId = (int)($_GET['last_event_id'] ?? 0);

if (!$lobbyName || !$playerId) {
    echo json_encode(['error' => 'Fehlende Parameter']); exit;
}

$path = getLobbyPath($lobbyName);
if (!file_exists($path)) {
    echo json_encode(['error' => 'Lobby nicht gefunden']); exit;
}

// Read & update heartbeat atomically
$fp = fopen($path, 'r+');
if (!$fp) { echo json_encode(['error' => 'Lesefehler']); exit; }
flock($fp, LOCK_EX);
$lobby = json_decode(file_get_contents($path), true);

if (!$lobby) { flock($fp, LOCK_UN); fclose($fp); echo json_encode(['error' => 'Parse-Fehler']); exit; }

// Determine role
$role = null;
if ($lobby['host']['id'] === $playerId) $role = 'host';
elseif (!empty($lobby['guest']) && $lobby['guest']['id'] === $playerId) $role = 'guest';

if (!$role) { flock($fp, LOCK_UN); fclose($fp); echo json_encode(['error' => 'Unbekannter Spieler']); exit; }

// Update own heartbeat
$lobby[$role]['ts'] = time();

// Prune old acknowledged events (keep last 300)
if (count($lobby['events']) > 300) {
    $lobby['events'] = array_values(array_slice($lobby['events'], -300));
}

ftruncate($fp, 0); rewind($fp);
fwrite($fp, json_encode($lobby));
flock($fp, LOCK_UN); fclose($fp);

// Filter events for this player since last seen
$myEvents = array_values(array_filter($lobby['events'], function($e) use ($role, $lastEventId) {
    return $e['id'] > $lastEventId && ($e['target'] === $role || $e['target'] === 'both');
}));

// Check opponent heartbeat (15 second timeout)
$opponentRole = $role === 'host' ? 'guest' : 'host';
$opponentOnline = false;
if (!empty($lobby[$opponentRole])) {
    $opponentOnline = (time() - ($lobby[$opponentRole]['ts'] ?? 0)) < 15;
}

echo json_encode([
    'events'          => $myEvents,
    'opponent_online' => $opponentOnline,
    'status'          => $lobby['status'] ?? 'waiting',
]);
