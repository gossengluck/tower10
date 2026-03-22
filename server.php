<?php
// Tower Defense Multiplayer WebSocket Server (Pure PHP)
// Keine externen Pakete nötig – nutzt eingebaute PHP Socket-Funktionen

$port = (int)(getenv('APP_PORT') ?: ($argv[1] ?? 3000));

$lobbies = [];
$clients = []; // int(socket) => ['socket', 'handshake', 'buffer', 'lobbyName', 'role', 'name']

$server = socket_create(AF_INET, SOCK_STREAM, SOL_TCP);
socket_set_option($server, SOL_SOCKET, SO_REUSEADDR, 1);
socket_bind($server, '0.0.0.0', $port);
socket_listen($server, 10);
socket_set_nonblock($server);

echo "\n🎮 Tower Defense Multiplayer Server (PHP)\n";
echo "   Port: $port\n";
echo "   WebSocket: ws://0.0.0.0:$port\n\n";

// ─── WebSocket Handshake ────────────────────────────────────────────────────

function doHandshake($socket, $data)
{
    if (preg_match('/Sec-WebSocket-Key:\s*(.*)\r\n/i', $data, $m)) {
        $accept = base64_encode(sha1(trim($m[1]) . '258EAFA5-E914-47DA-95CA-C5AB0DC85B11', true));
        $resp   = "HTTP/1.1 101 Switching Protocols\r\n"
                . "Upgrade: websocket\r\n"
                . "Connection: Upgrade\r\n"
                . "Sec-WebSocket-Accept: $accept\r\n\r\n";
        socket_write($socket, $resp, strlen($resp));
        return true;
    }
    return false;
}

// ─── Frame Encoding / Decoding ─────────────────────────────────────────────

function wsEncode($text)
{
    $len = strlen($text);
    if ($len < 126) {
        return chr(0x81) . chr($len) . $text;
    } elseif ($len < 65536) {
        return chr(0x81) . chr(126) . pack('n', $len) . $text;
    } else {
        return chr(0x81) . chr(127) . pack('J', $len) . $text;
    }
}

// Returns [payload|'__close__'|'__ping__'|null, bytesConsumed]
function wsDecode($data)
{
    if (strlen($data) < 2) return [null, 0];

    $b0     = ord($data[0]);
    $b1     = ord($data[1]);
    $opcode = $b0 & 0x0F;
    $masked = ($b1 & 0x80) !== 0;
    $plen   = $b1 & 0x7F;
    $offset = 2;

    if ($plen === 126) {
        if (strlen($data) < 4) return [null, 0];
        $plen   = unpack('n', substr($data, 2, 2))[1];
        $offset = 4;
    } elseif ($plen === 127) {
        if (strlen($data) < 10) return [null, 0];
        $plen   = unpack('J', substr($data, 2, 8))[1];
        $offset = 10;
    }

    $total = $offset + ($masked ? 4 : 0) + $plen;
    if (strlen($data) < $total) return [null, 0]; // incomplete

    if ($opcode === 8) return ['__close__', $total];
    if ($opcode === 9) return ['__ping__',  $total];

    if ($masked) {
        $mask    = substr($data, $offset, 4);
        $offset += 4;
        $payload = '';
        for ($i = 0; $i < $plen; $i++) {
            $payload .= $data[$offset + $i] ^ $mask[$i % 4];
        }
    } else {
        $payload = substr($data, $offset, $plen);
    }

    return [$payload, $total];
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function sendMsg($socket, $msg)
{
    if ($socket === null) return;
    $frame = wsEncode(json_encode($msg));
    @socket_write($socket, $frame, strlen($frame));
}

function broadcastLobby(&$lobby, $msg, $exclude = null)
{
    $frame = wsEncode(json_encode($msg));
    foreach (['host', 'guest'] as $r) {
        if ($lobby[$r] !== null && $lobby[$r] !== $exclude) {
            @socket_write($lobby[$r], $frame, strlen($frame));
        }
    }
}

function closeClient($id)
{
    global $clients, $lobbies;
    if (!isset($clients[$id])) return;

    $ln = $clients[$id]['lobbyName'];
    if ($ln && isset($lobbies[$ln])) cleanupLobby($ln);

    @socket_close($clients[$id]['socket']);
    unset($clients[$id]);
    echo "Verbindung getrennt (id=$id)\n";
}

function cleanupLobby($lobbyName)
{
    global $lobbies, $clients;
    if (!isset($lobbies[$lobbyName])) return;

    broadcastLobby($lobbies[$lobbyName], ['type' => 'player_left']);

    foreach (['host', 'guest'] as $r) {
        $s = $lobbies[$lobbyName][$r];
        if ($s !== null && isset($clients[(int)$s])) {
            $clients[(int)$s]['lobbyName'] = null;
        }
    }

    unset($lobbies[$lobbyName]);
    echo "Lobby \"$lobbyName\" geschlossen\n";
}

// ─── Message Handler ────────────────────────────────────────────────────────

function handleMessage($id, $sock, $msg)
{
    global $lobbies, $clients;

    switch ($msg['type'] ?? '') {

        case 'create_lobby': {
            $ln  = $msg['lobbyName'] ?? '';
            $pn  = $msg['playerName'] ?? 'Spieler 1';
            if (isset($lobbies[$ln])) {
                sendMsg($sock, ['type' => 'error', 'message' => 'Lobby existiert bereits!']);
                return;
            }
            $seed           = mt_rand(0, 999999999);
            $lobbies[$ln]   = [
                'host'       => $sock,
                'guest'      => null,
                'hostName'   => $pn,
                'guestName'  => null,
                'seed'       => $seed,
                'hostReady'  => false,
                'guestReady' => false,
                'round'      => 0,
            ];
            $clients[$id]['lobbyName'] = $ln;
            $clients[$id]['role']      = 'host';
            $clients[$id]['name']      = $pn;
            sendMsg($sock, ['type' => 'lobby_created', 'lobbyName' => $ln, 'role' => 'host', 'playerName' => $pn]);
            echo "Lobby \"$ln\" erstellt von $pn\n";
            break;
        }

        case 'join_lobby': {
            $ln  = $msg['lobbyName'] ?? '';
            $pn  = $msg['playerName'] ?? 'Spieler 2';
            if (!isset($lobbies[$ln])) {
                sendMsg($sock, ['type' => 'error', 'message' => 'Lobby nicht gefunden!']);
                return;
            }
            if ($lobbies[$ln]['guest'] !== null) {
                sendMsg($sock, ['type' => 'error', 'message' => 'Lobby ist voll!']);
                return;
            }
            $lobbies[$ln]['guest']     = $sock;
            $lobbies[$ln]['guestName'] = $pn;
            $clients[$id]['lobbyName'] = $ln;
            $clients[$id]['role']      = 'guest';
            $clients[$id]['name']      = $pn;

            sendMsg($sock, [
                'type'         => 'lobby_joined',
                'lobbyName'    => $ln,
                'role'         => 'guest',
                'playerName'   => $pn,
                'opponentName' => $lobbies[$ln]['hostName'],
                'seed'         => $lobbies[$ln]['seed'],
            ]);
            sendMsg($lobbies[$ln]['host'], [
                'type'         => 'game_start',
                'opponentName' => $pn,
                'seed'         => $lobbies[$ln]['seed'],
                'role'         => 'host',
            ]);
            sendMsg($sock, [
                'type'         => 'game_start',
                'opponentName' => $lobbies[$ln]['hostName'],
                'seed'         => $lobbies[$ln]['seed'],
                'role'         => 'guest',
            ]);
            echo "$pn tritt Lobby \"$ln\" bei\n";
            break;
        }

        case 'ready_next_round': {
            $ln = $clients[$id]['lobbyName'];
            if (!$ln || !isset($lobbies[$ln])) break;
            $role = $clients[$id]['role'];

            if ($role === 'host') $lobbies[$ln]['hostReady']  = true;
            else                  $lobbies[$ln]['guestReady'] = true;

            $opp = $role === 'host' ? $lobbies[$ln]['guest'] : $lobbies[$ln]['host'];
            sendMsg($opp, ['type' => 'opponent_ready']);

            if ($lobbies[$ln]['hostReady'] && $lobbies[$ln]['guestReady']) {
                $lobbies[$ln]['round']++;
                $lobbies[$ln]['hostReady']  = false;
                $lobbies[$ln]['guestReady'] = false;
                broadcastLobby($lobbies[$ln], ['type' => 'round_start', 'round' => $lobbies[$ln]['round']]);
                echo "Lobby \"$ln\" → Runde {$lobbies[$ln]['round']}\n";
            }
            break;
        }

        case 'send_attack': {
            $ln = $clients[$id]['lobbyName'];
            if (!$ln || !isset($lobbies[$ln])) break;
            $opp = $clients[$id]['role'] === 'host' ? $lobbies[$ln]['guest'] : $lobbies[$ln]['host'];
            sendMsg($opp, ['type' => 'incoming_attack', 'units' => $msg['units'], 'senderName' => $clients[$id]['name']]);
            break;
        }

        case 'tower_placed': {
            $ln = $clients[$id]['lobbyName'];
            if (!$ln || !isset($lobbies[$ln])) break;
            $opp = $clients[$id]['role'] === 'host' ? $lobbies[$ln]['guest'] : $lobbies[$ln]['host'];
            sendMsg($opp, ['type' => 'opponent_tower', 'towerName' => $msg['towerName'], 'gridX' => $msg['gridX'], 'gridY' => $msg['gridY'], 'level' => $msg['level'] ?? 1]);
            break;
        }

        case 'tower_sold': {
            $ln = $clients[$id]['lobbyName'];
            if (!$ln || !isset($lobbies[$ln])) break;
            $opp = $clients[$id]['role'] === 'host' ? $lobbies[$ln]['guest'] : $lobbies[$ln]['host'];
            sendMsg($opp, ['type' => 'opponent_tower_sold', 'gridX' => $msg['gridX'], 'gridY' => $msg['gridY']]);
            break;
        }

        case 'player_defeated': {
            $ln = $clients[$id]['lobbyName'];
            if (!$ln || !isset($lobbies[$ln])) break;
            $opp = $clients[$id]['role'] === 'host' ? $lobbies[$ln]['guest'] : $lobbies[$ln]['host'];
            sendMsg($opp, ['type' => 'you_win', 'opponentName' => $clients[$id]['name']]);
            sendMsg($sock, ['type' => 'you_lose']);
            break;
        }

        case 'sync_lives': {
            $ln = $clients[$id]['lobbyName'];
            if (!$ln || !isset($lobbies[$ln])) break;
            $opp = $clients[$id]['role'] === 'host' ? $lobbies[$ln]['guest'] : $lobbies[$ln]['host'];
            sendMsg($opp, ['type' => 'opponent_lives', 'lives' => $msg['lives']]);
            break;
        }
    }
}

// ─── Main Loop ──────────────────────────────────────────────────────────────

while (true) {
    $read = [$server];
    foreach ($clients as $c) {
        $read[] = $c['socket'];
    }
    $write  = null;
    $except = null;

    if (@socket_select($read, $write, $except, 0, 100000) < 1) continue;

    // New connection
    if (in_array($server, $read)) {
        $newSock = @socket_accept($server);
        if ($newSock !== false) {
            socket_set_nonblock($newSock);
            $id            = (int)$newSock;
            $clients[$id]  = [
                'socket'    => $newSock,
                'handshake' => false,
                'buffer'    => '',
                'lobbyName' => null,
                'role'      => null,
                'name'      => '',
            ];
            echo "Neue Verbindung (id=$id)\n";
        }
        unset($read[array_search($server, $read)]);
    }

    // Data from clients
    foreach ($read as $sock) {
        $id = (int)$sock;
        if (!isset($clients[$id])) continue;

        $data = @socket_read($sock, 8192, PHP_BINARY_READ);

        if ($data === false || $data === '') {
            closeClient($id);
            continue;
        }

        $clients[$id]['buffer'] .= $data;

        // WebSocket handshake
        if (!$clients[$id]['handshake']) {
            if (strpos($clients[$id]['buffer'], "\r\n\r\n") !== false) {
                if (doHandshake($sock, $clients[$id]['buffer'])) {
                    $clients[$id]['handshake'] = true;
                    $clients[$id]['buffer']    = '';
                    echo "Handshake OK (id=$id)\n";
                } else {
                    closeClient($id);
                }
            }
            continue;
        }

        // Process complete WebSocket frames
        while (strlen($clients[$id]['buffer']) > 0) {
            [$payload, $frameLen] = wsDecode($clients[$id]['buffer']);

            if ($frameLen === 0) break; // incomplete, wait for more

            $clients[$id]['buffer'] = substr($clients[$id]['buffer'], $frameLen);

            if ($payload === '__close__') { closeClient($id); break; }
            if ($payload === '__ping__')  {
                @socket_write($sock, chr(0x8A) . chr(0), 2); // pong
                continue;
            }
            if ($payload === null) { closeClient($id); break; }

            $msg = json_decode($payload, true);
            if ($msg) handleMessage($id, $sock, $msg);
        }
    }
}
