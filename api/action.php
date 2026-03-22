<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { exit; }

function getLobbyPath($name) {
    $dir = sys_get_temp_dir() . '/tower_game';
    return $dir . '/lobby_' . preg_replace('/[^a-zA-Z0-9_-]/', '_', strtolower($name)) . '.json';
}

function addEvent(&$lobby, $target, $type, $extra = []) {
    $event = array_merge(['id' => $lobby['next_event_id']++, 'type' => $type, 'target' => $target], $extra);
    $lobby['events'][] = $event;
    if (count($lobby['events']) > 300) {
        $lobby['events'] = array_values(array_slice($lobby['events'], -300));
    }
}

$input = json_decode(file_get_contents('php://input'), true) ?: [];
$lobbyName = trim($input['lobby']     ?? '');
$playerId  = trim($input['player_id'] ?? '');
$type      = trim($input['type']      ?? '');

if (!$lobbyName || !$playerId || !$type) {
    echo json_encode(['error' => 'Fehlende Parameter']); exit;
}

$path = getLobbyPath($lobbyName);
if (!file_exists($path)) { echo json_encode(['error' => 'Lobby nicht gefunden']); exit; }

$fp = fopen($path, 'r+');
if (!$fp) { echo json_encode(['error' => 'Datei nicht schreibbar']); exit; }
flock($fp, LOCK_EX);
$lobby = json_decode(file_get_contents($path), true);

if (!$lobby) { flock($fp, LOCK_UN); fclose($fp); echo json_encode(['error' => 'Parse-Fehler']); exit; }

// Determine role
$role = null;
if ($lobby['host']['id'] === $playerId) $role = 'host';
elseif (!empty($lobby['guest']) && $lobby['guest']['id'] === $playerId) $role = 'guest';

if (!$role) { flock($fp, LOCK_UN); fclose($fp); echo json_encode(['error' => 'Unbekannter Spieler']); exit; }

$opponent = $role === 'host' ? 'guest' : 'host';

switch ($type) {

    case 'ready_next_round':
        $lobby[$role]['ready'] = true;
        if (!empty($lobby[$opponent]['ready'])) {
            // Both ready → start round
            $round = ($lobby['round'] ?? 0) + 1;
            $lobby['round'] = $round;
            $lobby['host']['ready'] = false;
            $lobby['guest']['ready'] = false;
            addEvent($lobby, 'both', 'round_start', ['round' => $round]);
        } else {
            addEvent($lobby, $opponent, 'opponent_ready');
        }
        break;

    case 'send_attack':
        addEvent($lobby, $opponent, 'incoming_attack', [
            'units'      => $input['units']  ?? [],
            'senderName' => $lobby[$role]['name'],
        ]);
        break;

    case 'tower_placed':
        addEvent($lobby, $opponent, 'opponent_tower', [
            'towerName' => $input['towerName'] ?? '',
            'gridX'     => (int)($input['gridX'] ?? 0),
            'gridY'     => (int)($input['gridY'] ?? 0),
            'level'     => (int)($input['level'] ?? 1),
        ]);
        break;

    case 'tower_sold':
        addEvent($lobby, $opponent, 'opponent_tower_sold', [
            'gridX' => (int)($input['gridX'] ?? 0),
            'gridY' => (int)($input['gridY'] ?? 0),
        ]);
        break;

    case 'player_defeated':
        addEvent($lobby, $opponent, 'you_win',  ['opponentName' => $lobby[$role]['name']]);
        addEvent($lobby, $role,     'you_lose');
        $lobby['status'] = 'finished';
        break;

    case 'sync_lives':
        addEvent($lobby, $opponent, 'opponent_lives', ['lives' => (int)($input['lives'] ?? 0)]);
        break;

    case 'leave':
        addEvent($lobby, $opponent, 'player_left');
        $lobby['status'] = 'finished';
        break;

    default:
        flock($fp, LOCK_UN); fclose($fp);
        echo json_encode(['error' => 'Unbekannter Typ']); exit;
}

ftruncate($fp, 0); rewind($fp);
fwrite($fp, json_encode($lobby));
flock($fp, LOCK_UN); fclose($fp);

echo json_encode(['ok' => true]);
