<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { exit; }

function getLobbyPath($name) {
    $dir = sys_get_temp_dir() . '/tower_game';
    if (!is_dir($dir)) mkdir($dir, 0777, true);
    return $dir . '/lobby_' . preg_replace('/[^a-zA-Z0-9_-]/', '_', strtolower($name)) . '.json';
}

$input = json_decode(file_get_contents('php://input'), true) ?: [];
$action     = trim($input['action'] ?? '');
$lobbyName  = trim($input['lobby']  ?? '');
$playerName = trim($input['player'] ?? '');

if (!$action || !$lobbyName || !$playerName) {
    echo json_encode(['error' => 'Fehlende Parameter']); exit;
}

$path = getLobbyPath($lobbyName);

// ── CREATE ──────────────────────────────────────────────
if ($action === 'create') {
    $fp = fopen($path, 'c+');
    if (!$fp) { echo json_encode(['error' => 'Datei konnte nicht erstellt werden']); exit; }
    flock($fp, LOCK_EX);
    $size = filesize($path);
    $existing = ($size > 0) ? json_decode(fread($fp, $size), true) : null;

    if ($existing && isset($existing['host']) && ($existing['status'] ?? '') !== 'finished') {
        flock($fp, LOCK_UN); fclose($fp);
        echo json_encode(['error' => 'Lobby existiert bereits']); exit;
    }

    $playerId = bin2hex(random_bytes(8));
    $seed     = rand(100000, 999999999);
    $lobby = [
        'name'         => $lobbyName,
        'seed'         => $seed,
        'host'         => ['name' => $playerName, 'id' => $playerId, 'ts' => time(), 'ready' => false],
        'guest'        => null,
        'status'       => 'waiting',
        'round'        => 0,
        'events'       => [],
        'next_event_id'=> 1,
    ];

    ftruncate($fp, 0); rewind($fp);
    fwrite($fp, json_encode($lobby));
    flock($fp, LOCK_UN); fclose($fp);

    echo json_encode(['ok' => true, 'role' => 'host', 'player_id' => $playerId, 'seed' => $seed, 'lobby' => $lobbyName]);

// ── JOIN ────────────────────────────────────────────────
} elseif ($action === 'join') {
    if (!file_exists($path)) { echo json_encode(['error' => 'Lobby nicht gefunden']); exit; }
    $fp = fopen($path, 'r+');
    if (!$fp) { echo json_encode(['error' => 'Lobby nicht gefunden']); exit; }
    flock($fp, LOCK_EX);
    $lobby = json_decode(file_get_contents($path), true);

    if (!$lobby || !isset($lobby['host'])) {
        flock($fp, LOCK_UN); fclose($fp);
        echo json_encode(['error' => 'Lobby nicht gefunden']); exit;
    }
    if (!empty($lobby['guest']) && ($lobby['status'] ?? '') !== 'finished') {
        flock($fp, LOCK_UN); fclose($fp);
        echo json_encode(['error' => 'Lobby ist voll']); exit;
    }

    $playerId = bin2hex(random_bytes(8));
    $lobby['guest']  = ['name' => $playerName, 'id' => $playerId, 'ts' => time(), 'ready' => false];
    $lobby['status'] = 'playing';

    $eid = &$lobby['next_event_id'];
    $lobby['events'][] = ['id' => $eid++, 'type' => 'game_start', 'target' => 'host',
        'opponentName' => $playerName, 'seed' => $lobby['seed'], 'role' => 'host'];
    $lobby['events'][] = ['id' => $eid++, 'type' => 'game_start', 'target' => 'guest',
        'opponentName' => $lobby['host']['name'], 'seed' => $lobby['seed'], 'role' => 'guest'];

    ftruncate($fp, 0); rewind($fp);
    fwrite($fp, json_encode($lobby));
    flock($fp, LOCK_UN); fclose($fp);

    echo json_encode(['ok' => true, 'role' => 'guest', 'player_id' => $playerId,
        'seed' => $lobby['seed'], 'lobby' => $lobbyName, 'opponentName' => $lobby['host']['name']]);

} else {
    echo json_encode(['error' => 'Unbekannte Aktion']);
}
