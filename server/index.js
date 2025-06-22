// 기존 index.js 파일의 모든 내용을 이 코드로 교체해주세요.

const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

const PORT = 3001;
const gameRooms = {};
const ADMIN_ROOM = 'admin_room';
const timerIntervals = {};

const presetsPath = path.join(__dirname, 'presets.json');
const presetsData = fs.readFileSync(presetsPath, 'utf8');
const PRESETS = JSON.parse(presetsData);

const ROLE_DESCRIPTIONS = {
  '에일리언 여왕': '게임 중 단 한 번, [사냥] 능력으로 두 명을 제거할 수 있습니다. 특정 위기 상황에서는 네 명을 잡아먹기도 합니다.',
  '에일리언': '여왕의 부하입니다. 매일 밤 한 명을 [포식]할 수 있습니다.',
  '에일리언 알': '2일이 지나고 3일째부터 활동합니다. 부화 시 [오염] 또는 [부화]의 결과가 있습니다.',
  '함장': '2발의 총알로 의심되는 참여자를 [즉결 처분]할 수 있습니다.',
  '엔지니어': '함장이 사망하면 [비상탈출 버튼]을 가동할지 선택할 수 있습니다.',
  '의사': '모든 의사가 4일간 생존하면 [생화학 무기]를 개발하여 승리합니다.',
  '초능력자': '단 한 번, 4명의 정체를 [꿰뚫어보기]할 수 있습니다. 실패 시 부작용이 있습니다.',
  '수다쟁이': '매일 한 명의 정체를 익명으로 [폭로하기]합니다.',
  '뚱이': '탐사대의 빌런입니다. 비상탈출 시 식량을 모두 [호로록!] 먹어 치웁니다.',
  '신의 사도': '죽지 않고 4일간 기도에 성공하면 탐사대를 [구원]합니다.',
  '군인': '1발의 총알로 의심되는 참가자 한 명을 [저격]하여 탈락시킬 수 있습니다.',
  '일반 승객': '특별한 능력은 없지만, 투표를 통해 진실을 밝혀내야 합니다.'
};

const ENDING_MESSAGES = {
  crew_win_queen_eliminated: {
    winner: '탐사대',
    reason: '마침내 에일리언 무리의 우두머리, 에일리언 여왕을 제거하는 데 성공했습니다! 탐사선에 평화가 찾아왔습니다.'
  },
  crew_win_escape_success: {
    winner: '탐사대',
    reason: '수많은 위기를 극복하고, 생존자들은 무사히 지구로 귀환했습니다. 당신들은 인류의 영웅입니다!'
  },
  alien_win_assassinate: {
    winner: '에일리언', reason: '탐사대의 핵심 인물인 함장과 엔지니어를 모두 제거하는 데 성공했습니다!'
  },
  alien_win_escape_timeout: {
    winner: '에일리언',
    reason: '탐사대는 제한 시간 내에 의견을 모으지 못하고 귀중한 탈출 기회를 놓치고 말았습니다. 함선에 남은 이들에게 남은 것은 절망뿐입니다.'
  },
  alien_win_glutton: {
    winner: '에일리언',
    reason: '치명적인 식량 약탈자, \'뚱이\'가 캡슐에 탑승했습니다. 살아남기 위해 발버둥 쳤지만, 결국 모두 굶주림 속에서 비참한 최후를 맞이했습니다.'
  },
  alien_win_escape_aliens: {
    winner: '에일리언',
    reason: '에일리언이 캡슐에 잠입하는 것을 막지 못했습니다. 캡슐 안에서 벌어진 최후의 사투 끝에, 탐사대는 전멸하고 말았습니다.'
  },
  alien_win_escape_plague: {
    winner: '에일리언',
    reason: '캡슐 내에 역병이 창궐했으나, 의사가 없어 속수무책으로 당했습니다. 생존자들은 고통 속에서 죽음을 맞이했습니다.'
  },
  alien_win_escape_malfunction: {
    winner: '에일리언',
    reason: '캡슐에 치명적인 결함이 발생했지만, 엔지니어의 부재로 수리할 수 없었습니다. 캡슐은 우주의 미아가 되었습니다.'
  }
};

// index.js

// ★★★ 기존 endGame 함수를 아래 코드로 교체해주세요. ★★★
function endGame(roomCode, endingKey, detailLog = '') {
  const room = gameRooms[roomCode];
  if (!room || room.status === 'game_over') return;

  const ending = ENDING_MESSAGES[endingKey];
  if (!ending) {
    console.error(`[${roomCode}] FATAL: Could not find ending for key: ${endingKey}`);
    return;
  }

  console.log(`[${roomCode}] Game Over. Winner: ${ending.winner}, Reason: ${ending.reason}`);

  room.status = 'game_over';
  room.winner = ending.winner;

  // 1. 엔딩 이유를 타이핑 애니메이션으로 먼저 보여주기 위한 이벤트 전송
  io.to(roomCode).emit('endingSequenceStart', { reason: ending.reason });

  // 2. 4.5초 후, 역할 공개 등이 포함된 최종 게임 오버 화면 전송
  setTimeout(() => {
    const rolesPayload = room.players.map(p => ({ name: p.name, role: p.role || '역할 미정' }));
    const gameOverPayload = {
      winner: ending.winner,
      reason: ending.reason,
      detailLog: detailLog,
      roles: rolesPayload
    };
    io.to(roomCode).emit('gameOver', gameOverPayload);
    broadcastUpdates(roomCode);
  }, 4500); // 4.5초 지연
}

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function broadcastUpdates(roomCode) {
  if (gameRooms[roomCode]) {
    const room = gameRooms[roomCode];
    io.to(ADMIN_ROOM).emit('updateAdmin', { rooms: gameRooms });
    io.to(roomCode).emit('boardUpdate', room);
    io.to(roomCode).emit('updateRoom', room);
  }
}

function checkWinConditions(roomCode) {
  const room = gameRooms[roomCode];
  if (!room || room.status !== 'playing') return false;

  let endingType = null;
  let detailLog = '';

  const alienQueen = room.players.find(p => p.role === '에일리언 여왕');
  if (alienQueen && alienQueen.status === 'dead') {
    endingType = 'crew_win_queen_eliminated';
    const captain = room.players.find(p => p.role === '함장');
    const soldier = room.players.find(p => p.role === '군인');

    switch (alienQueen.causeOfDeath) {
      case 'captain_shot':
        detailLog = `${captain ? captain.name : '함장'}이(가) 에일리언 여왕을 즉결처분으로 사살했습니다.`;
        break;
      case 'soldier_shot':
        detailLog = `${soldier ? soldier.name : '군인'}이(가) 에일리언 여왕을 사살하는데 성공했습니다.`;
        break;
      case 'ejected':
        detailLog = `탐사대의 예리한 감각과 추론으로 에일리언 여왕을 방출했습니다.`;
        break;
      default:
        detailLog = `에일리언 여왕이 제거되었습니다.`;
    }
  }

  if (!endingType) {
    const captain = room.players.find(p => p.role === '함장');
    const engineer = room.players.find(p => p.role === '엔지니어');
    if (captain && captain.status === 'dead' && engineer && engineer.status === 'dead') {
      endingType = 'alien_win_assassinate';
    }
  }

  if (endingType) {
    const ending = ENDING_MESSAGES[endingType];
    if (!ending) {
      console.error(`오류: 엔딩 메시지를 찾을 수 없습니다 - ${endingType}`);
      return false;
    }
    room.status = 'game_over';
    io.to(roomCode).emit('gameOver', { winner: ending.winner, reason: ending.reason, detailLog: detailLog });
    io.to(ADMIN_ROOM).emit('updateAdmin', { rooms: gameRooms });
    return true;
  }

  return false;
}

// server/index.js

// server/index.js

// 이 함수 전체를 아래 코드로 교체해주세요.
function eliminatePlayer(roomCode, playerId, cause = 'unknown') {
  const room = gameRooms[roomCode];
  if (!room) return false;
  const player = room.players.find(p => p.id === playerId);

  if (player && player.status !== 'dead') {
    player.status = 'dead';
    player.causeOfDeath = cause;
    io.to(playerId).emit('youAreDead');

    const gameEndedByElimination = checkWinConditions(roomCode);
    if (gameEndedByElimination) return true;

    if (player.role === '함장') {
      const engineer = room.players.find(p => p.role === '엔지니어' && p.status === 'alive');
      if (engineer) {
        room.pendingAction = 'engineer_choice';
      } else {
        // 함장도 엔지니어도 모두 죽었으면 즉시 에일리언 승리
        checkWinConditions(roomCode);
      }
    }
    broadcastUpdates(roomCode);
    return true;
  }
  return false;
}

app.use(express.static(path.join(__dirname, '../client/public')));
app.get('/', (req, res) => { res.sendFile(path.join(__dirname, '../client/public', 'index.html')); });
app.get('/admin', (req, res) => { res.sendFile(path.join(__dirname, '../client/public', 'admin.html')); });

io.on('connection', (socket) => {

  socket.on('adminConnect', () => {
    socket.join(ADMIN_ROOM);
    socket.emit('updateAdmin', { rooms: gameRooms, presets: PRESETS });
  });

  socket.on('boardConnect', (data) => {
    const { roomCode } = data;
    if (gameRooms[roomCode]) {
      socket.join(roomCode);
      io.to(socket.id).emit('boardUpdate', gameRooms[roomCode]);
    }
  });

  socket.on('joinGame', (data) => {
    const { name, code } = data;
    socket.join(code);
    if (!gameRooms[code]) {
      gameRooms[code] = { players: [], status: 'waiting', day: 0, phase: 'lobby' };
    }
    const newPlayer = { id: socket.id, name: name, status: 'alive' };
    gameRooms[code].players.push(newPlayer);
    broadcastUpdates(code);
  });

  socket.on('kickPlayer', (data) => {
    const { roomCode, playerId } = data;
    const room = gameRooms[roomCode];
    if (!room) return;

    // 플레이어 목록에서 해당 플레이어의 인덱스를 찾습니다.
    const playerIndex = room.players.findIndex(p => p.id === playerId);

    if (playerIndex > -1) {
      const kickedPlayerName = room.players[playerIndex].name;

      // ★★★ 핵심: '사망' 처리하는 것이 아니라, 배열에서 플레이어 정보를 완전히 '제거'합니다. ★★★
      room.players.splice(playerIndex, 1);

      console.log(`[${roomCode}] Player ${kickedPlayerName} (${playerId}) was completely REMOVED by admin.`);
    }

    // 해당 플레이어의 소켓 연결이 남아있다면 강제 종료합니다.
    const kickedSocket = io.sockets.sockets.get(playerId);
    if (kickedSocket) {
      kickedSocket.disconnect(true);
    }

    // 변경된 상태(플레이어가 제거된 목록)를 모든 클라이언트에 전파합니다.
    broadcastUpdates(roomCode);
  });

  socket.on('startGame', (data) => {
    const { code, settings, groupCount } = data;
    const room = gameRooms[code];
    if (!room || room.status === 'playing') return;

    room.groupCount = groupCount;

    const roles = [];
    for (const roleName in settings) {
      for (let i = 0; i < settings[roleName]; i++) { roles.push(roleName); }
    }
    const players = room.players;
    const shuffledRoles = shuffle(roles);

    players.forEach((player, index) => {
      player.role = shuffledRoles[index];
      player.description = ROLE_DESCRIPTIONS[shuffledRoles[index]] || '';
      player.abilityUsed = false;
      if (player.role === '함장') player.bullets = 2;
      else if (player.role === '군인') player.bullets = 1;

      // ★★★ 추가: 모든 플레이어의 모둠 정보 초기화 ★★★
      delete player.group;
    });

    room.status = 'playing';
    room.phase = 'role_reveal';
    room.day = 1; // ★★★ 추가: 게임 시작 시 1일차로 명시적 설정 ★★★

    // ★★★ 추가: 게임 시작과 동시에 모둠 선택이 필요함을 알림 ★★★
    room.needsGroupSelection = true;

    broadcastUpdates(code);
  });

  // 그룹 선택 핸들러
  socket.on('selectGroup', (data) => {
    const { roomCode, groupNumber } = data;
    const room = gameRooms[roomCode];
    if (!room) return;

    const player = room.players.find(p => p.id === socket.id);
    if (player) {
      player.group = groupNumber;
      console.log(`[${roomCode}] Player ${player.name} selected group ${player.group}`);

      // 모든 생존자가 그룹 선택을 완료했는지 확인
      const allAlivePlayers = room.players.filter(p => p.status === 'alive');
      const allSelected = allAlivePlayers.every(p => !!p.group);

      if (allSelected) {
        console.log(`[${roomCode}] All players have selected their group.`);
        delete room.needsGroupSelection;
      }

      broadcastUpdates(roomCode);
    }
  });

  // ... 다른 핸들러들 ...
  // server/index.js

  // 1. 이 함수로 교체해주세요.
  // io.on('connection', (socket) => { ... 안에 있는 핸들러입니다 ...

  // ★★★ 기존 코드를 아래 코드로 완전히 교체해주세요. ★★★
  socket.on('nextPhase', (data) => {
    const { code, phase, day } = data;
    console.log(`[${code}] Received nextPhase event. Target phase: ${phase}, Day: ${day}`); // 디버깅 로그 추가

    const room = gameRooms[code];
    if (!room) {
      console.error(`[${code}] Error: Room not found for nextPhase.`);
      return;
    }

    if (room.phase === 'meeting' && room.needsGroupSelection) {
      const unselectedPlayers = room.players.filter(p => p.status === 'alive' && !p.group);
      if (unselectedPlayers.length > 0) {
        const names = unselectedPlayers.map(p => p.name).join(', ');
        // 에러 이벤트를 보낸 클라이언트(관리자)에게만 전송
        socket.emit('adminError', `아직 모둠을 선택하지 않은 참가자가 있습니다: ${names}`);
        return; // 다음 단계로 진행하지 않고 함수 종료
      }
    }

    if (timerIntervals[code]) {
      clearInterval(timerIntervals[code]);
      delete timerIntervals[code];
      console.log(`[${code}] Cleared existing meeting timer.`);
    }

    room.phase = phase;
    room.day = parseInt(day, 10);

    // 밤이 되면 에일리언 활동 관련 상태 초기화
    if (phase === 'night_alien_action') {
      room.selections = {};
      delete room.alienActionTriggered; // 다음 밤을 위해 초기화
      delete room.crewActionTriggered; // 다음 밤을 위해 초기화
    }

    console.log(`[${code}] Room state updated. New phase: ${room.phase}. Broadcasting...`);
    broadcastUpdates(code);
  });

  // server/index.js

  // 1. 이 함수로 교체
  socket.on('triggerAlienAction', (data) => {
    const { code } = data;
    const room = gameRooms[code];
    if (!room) return;

    // ★★★ 추가: 에일리언 활동이 시작되었음을 상태에 기록
    room.alienActionTriggered = true;

    const livingPlayers = room.players.filter(p => p.status === 'alive');
    const allAlienRoles = livingPlayers.filter(p => p.role.includes('에일리언'));
    const allAlienIds = allAlienRoles.map(p => p.id);
    const targets = livingPlayers.filter(p => !allAlienIds.includes(p.id));

    const normalAliens = allAlienRoles.filter(p => p.role === '에일리언');
    normalAliens.forEach(alien => {
      const otherAliens = allAlienRoles.filter(a => a.id !== alien.id).map(a => a.name);
      io.to(alien.id).emit('alienAction', { otherAliens, targets });
    });

    const queen = allAlienRoles.find(p => p.role === '에일리언 여왕');
    if (queen) {
      const otherAliens = allAlienRoles.filter(a => a.id !== queen.id).map(a => a.name);
      if (!queen.abilityUsed) {
        io.to(queen.id).emit('queenHuntAction', { otherAliens, targets });
      } else {
        io.to(queen.id).emit('alienAction', { otherAliens, targets: [] });
      }
    }

    // ★★★ 추가: 변경된 상태를 즉시 전파하여 관리자 UI 갱신
    broadcastUpdates(code);
  });

  // 2. 이 함수로 교체
  socket.on('triggerQueenRampage', (data) => {
    const { code } = data;
    const room = gameRooms[code];
    if (!room || room.pendingAction !== 'queen_rampage') return;

    // ★★★ 추가: 만찬이 시작되었음을 상태에 기록
    room.rampageTriggered = true;

    console.log(`[${code}] 관리자가 여왕의 만찬을 시작시켰습니다.`);
    const queen = room.players.find(p => p.role === '에일리언 여왕' && p.status === 'alive');
    if (queen) {
      const allAlienIds = room.players.filter(p => p.role.includes('에일리언')).map(p => p.id);
      const targets = room.players.filter(p => p.status === 'alive' && !allAlienIds.includes(p.id));
      io.to(queen.id).emit('queenRampageAction', { targets });
    }

    // ★★★ 추가: 변경된 상태를 즉시 전파하여 관리자 UI 갱신
    broadcastUpdates(code);
  });

  // io.on('connection', (socket) => { ... 안에 있는 핸들러입니다 ...

  // ★★★ 기존 코드를 아래 코드로 완전히 교체해주세요. ★★★
  socket.on('startMeetingTimer', (roomCode) => {
    console.log(`[${roomCode}] Received startMeetingTimer event.`); // 디버깅 로그 추가

    if (!gameRooms[roomCode]) {
      console.error(`[${roomCode}] Error: Room not found.`);
      return;
    }
    if (timerIntervals[roomCode]) {
      console.warn(`[${roomCode}] Warning: Timer is already running.`);
      return;
    }

    const room = gameRooms[roomCode];
    room.timeLeft = 120; // 2분

    // 즉시 첫 업데이트를 전송하여 '02:00'이 바로 표시되도록 함
    const initialPayload = { roomCode: roomCode, timeLeft: room.timeLeft };
    io.to(roomCode).emit('timerUpdate', initialPayload);
    io.to(ADMIN_ROOM).emit('timerUpdate', initialPayload);
    console.log(`[${roomCode}] Timer started. Initial time: ${room.timeLeft}s`);

    timerIntervals[roomCode] = setInterval(() => {
      room.timeLeft--;
      const payload = { roomCode: roomCode, timeLeft: room.timeLeft };
      io.to(roomCode).emit('timerUpdate', payload);
      io.to(ADMIN_ROOM).emit('timerUpdate', payload);

      if (room.timeLeft < 0) {
        clearInterval(timerIntervals[roomCode]);
        delete timerIntervals[roomCode];
        console.log(`[${roomCode}] Timer finished and cleared.`);
      }
    }, 1000);
  });

  socket.on('nightAction', (data) => {
    const { targetId } = data;
    const selectorId = socket.id;
    let roomCode = '';
    for (const code in gameRooms) {
      if (gameRooms[code].players.some(p => p.id === selectorId)) {
        roomCode = code;
        break;
      }
    }
    if (roomCode) {
      const room = gameRooms[roomCode];
      if (targetId) {
        room.selections[selectorId] = targetId;
      } else {
        delete room.selections[selectorId];
      }
      const allAliens = room.players.filter(p => p.role.includes('에일리언'));
      allAliens.forEach(alienPlayer => {
        io.to(alienPlayer.id).emit('nightSelectionUpdate', { selections: room.selections });
      });
    }
  });

  // server/index.js

  // server/index.js

  // 이 함수를 아래 코드로 통째로 교체해주세요.
  socket.on('resolveNightActions', (data) => {
    const { code } = data;
    const room = gameRooms[code];
    if (!room || !room.selections) return;

    console.log(`[${code}] 밤 활동 결과 정산 시작. 현재 선택 현황:`, room.selections);

    const targetsToEliminate = [];
    for (const selectorId in room.selections) {
      const selection = room.selections[selectorId];
      if (Array.isArray(selection)) {
        targetsToEliminate.push(...selection);
      } else {
        targetsToEliminate.push(selection);
      }
    }

    const uniqueTargets = [...new Set(targetsToEliminate)];
    console.log(`[${code}] 제거될 대상:`, uniqueTargets);

    uniqueTargets.forEach(targetId => {
      eliminatePlayer(code, targetId, 'alien_kill');
    });

    // ★★★ 핵심 수정 ★★★
    // 밤 활동으로 인한 사망 처리 직후, 즉시 승리/패배 조건을 확인합니다.
    const gameEnded = checkWinConditions(code);
    if (gameEnded) {
      // 게임이 종료되었다면, 여기서 로직을 중단하고 더 이상 진행하지 않습니다.
      return;
    }

    // '여왕의 만찬' 같은 일회성 액션의 상태를 여기서 확실히 제거합니다.
    if (room.pendingAction === 'queen_rampage') {
      delete room.pendingAction;
      delete room.rampageTriggered;
    }

    // 일반 에일리언 활동 시작 플래그 제거
    delete room.alienActionTriggered;

    room.phase = 'night_crew_action';
    broadcastUpdates(code);
  });

  // 3. 이 함수로 교체해주세요.
  socket.on('triggerCrewAction', (data) => {
    const { code } = data;
    const room = gameRooms[code];
    if (!room) return;

    // ★★★ 추가된 부분: 활동이 시작되었음을 상태에 기록 ★★★
    room.crewActionTriggered = true;

    const livingPlayers = room.players.filter(p => p.status === 'alive');

    const soldier = livingPlayers.find(p => p.role === '군인' && p.bullets > 0);
    if (soldier) {
      const targets = livingPlayers.filter(p => p.id !== soldier.id);
      io.to(soldier.id).emit('soldierAction', { targets, bulletsLeft: soldier.bullets });
    }

    const captain = livingPlayers.find(p => p.role === '함장' && p.bullets > 0);
    if (captain) {
      const targets = livingPlayers.filter(p => p.id !== captain.id);
      io.to(captain.id).emit('captainAction', { targets, bulletsLeft: captain.bullets });
    }

    // ★★★ 추가된 부분: 변경된 상태를 모든 클라이언트에 전파하여 UI를 갱신 ★★★
    broadcastUpdates(code);
  });

  // server/index.js

  // 'engineerChoseEscape' 핸들러 추가
  socket.on('engineerChoseEscape', () => {
    let roomCode = '';
    for (const code in gameRooms) {
      if (gameRooms[code].players.some(p => p.id === socket.id)) { roomCode = code; break; }
    }
    if (!roomCode) return;

    const room = gameRooms[roomCode];
    console.log(`[${roomCode}] 엔지니어가 비상탈출을 선택했습니다.`);

    // ★★★ 추가: 생존자 수 체크 ★★★
    const livingPlayers = room.players.filter(p => p.status === 'alive');
    if (livingPlayers.length < 4) {
      console.log(`[${roomCode}] 생존자가 4명 미만이라 비상탈출이 불가능합니다.`);
      room.status = 'game_over';
      const ending = { winner: '에일리언', reason: `생존 인원이 4명보다 적어 비상탈출 캡슐을 가동할 수 없습니다. 남은 탐사대는 절망에 빠졌습니다.` };
      io.to(roomCode).emit('gameOver', ending);
      io.to(ADMIN_ROOM).emit('updateAdmin', { rooms: gameRooms });
      return;
    }

    room.pendingAction = 'escape_survivor_selection';
    broadcastUpdates(roomCode);
  });

  // 'startEscapeSequence' 핸들러를 아래 코드로 교체해주세요.
  socket.on('startEscapeSequence', (data) => {
    const { code, survivorIds } = data;
    const room = gameRooms[code];
    if (!room) return;

    console.log(`[${code}] 비상탈출 시퀀스가 시작되었습니다. 탑승자:`, survivorIds);

    room.escapees = room.players.filter(p => survivorIds.includes(p.id));
    room.phase = 'escape_sequence';
    room.escapeStep = 0; // 0단계부터 시작
    room.escapeLog = [];
    delete room.pendingAction;

    room.escapeLog.push(">>> 비상탈출 시퀀스 가동. 캡슐 인원 확인 시작...");
    room.escapeLog.push(">>> 다음 보안 검사를 진행합니다... [ 1단계 확인] 버튼을 눌러주세요.");

    broadcastUpdates(code);
  });

  socket.on('startEscapeTimer', (roomCode) => {
    if (!gameRooms[roomCode] || timerIntervals[roomCode]) return;
    const room = gameRooms[roomCode];
    room.timeLeft = 210; // 3분 30초

    timerIntervals[roomCode] = setInterval(() => {
      const payload = { roomCode: roomCode, timeLeft: room.timeLeft };
      io.to(roomCode).emit('timerUpdate', payload);
      io.to(ADMIN_ROOM).emit('timerUpdate', payload);

      room.timeLeft--;

      if (room.timeLeft < 0) {
        clearInterval(timerIntervals[roomCode]);
        delete timerIntervals[roomCode];
      }
    }, 1000);
  });

  socket.on('forceEscapeFailure', (data) => {
    const { code } = data;
    const room = gameRooms[code];
    if (!room) return;

    room.status = 'game_over';
    const ending = ENDING_MESSAGES['alien_win_escape_timeout'];
    room.winner = ending.winner; // ★★★ 추가
    io.to(code).emit('gameOver', { winner: ending.winner, reason: ending.reason });
    broadcastUpdates(code);
  });

  socket.on('resolveEscapeStep', (data) => {
    const { code } = data;
    const room = gameRooms[code];
    if (!room || room.phase !== 'escape_sequence') return;

    let resultMessage = '';
    let isGameOver = false;
    let nextStep = room.escapeStep + 1;

    switch (room.escapeStep) {
      // ★★★ 위 case 0: 블록을 아래 코드로 완전히 교체해주세요. ★★★
      case 0: // 1관문: 식량 창고 확인 (뚱이 체크)
        const hasGlutton = room.escapees.some(p => p.role === '뚱이');
        if (hasGlutton) {
          // 1. 요청된 메시지를 로그에 추가합니다.
          room.escapeLog.push(">>> 치명적인 식량 약탈자 뚱이가 잠입된 것이 확인되었습니다.");

          // 2. 이 메시지를 즉시 클라이언트에 전송하여 타이핑 애니메이션을 시작시킵니다.
          broadcastUpdates(code);

          // 3. 7초 후에 게임 종료 함수를 호출합니다.
          setTimeout(() => {
            endGame(code, 'alien_win_glutton');
          }, 4500);

          // 4. 비동기 타이머가 작동하므로, 여기서 함수의 추가 실행을 막습니다.
          return;
        } else {
          resultMessage = "[1차 관문 통과] 식량 창고는 안전합니다. 다행히 굶주린 자는 없는 것 같습니다.";
        }
        break;

      case 1: // 2관문: 에일리언 체크
        const aliensOnBoard = room.escapees.filter(p => p.role.includes('에일리언'));
        const soldierOnBoard = room.escapees.some(p => p.role === '군인');
        if (aliensOnBoard.length > 0) {
          if (soldierOnBoard) {
            resultMessage = "[2관문 통과] 에일리언이 잠입했으나, 용맹한 군인의 활약으로 처치했습니다!";
          } else {
            resultMessage = "[2관문 실패] 군인이 없는 상황에서 에일리언이 잠입했습니다. 최후의 사투가 벌어집니다...";
            isGameOver = true;
            const ending = ENDING_MESSAGES['alien_win_escape_aliens'];
            room.winner = ending.winner;
            io.to(code).emit('gameOver', ending);
          }
        } else {
          resultMessage = "[2관문 통과] 에일리언의 잠입은 없었습니다. 다음 관문을 확인합니다.";
        }
        break;

      case 2: // 3관문: 의사 체크
        const hasPlague = Math.random() < 0.5; // 50% 확률로 역병 발생
        const doctorOnBoard = room.escapees.some(p => p.role === '의사');
        if (hasPlague) {
          if (doctorOnBoard) {
            resultMessage = "[3관문 통과] 역병이 창궐했으나, 유능한 의사가 모두를 치료했습니다.";
          } else {
            resultMessage = "[3관문 실패] 역병이 창궐했지만, 치료할 의사가 없습니다...";
            isGameOver = true;
            const ending = ENDING_MESSAGES['alien_win_escape_plague'];
            room.winner = ending.winner;
            io.to(code).emit('gameOver', ending);
          }
        } else {
          resultMessage = "[3관문 통과] 다행히 캡슐 내부는 위생적이었습니다. 다음 관문을 확인합니다.";
        }
        break;

      case 3: // 4관문: 엔지니어 체크
        const hasMalfunction = Math.random() < 0.5; // 50% 확률로 결함 발생
        const engineerOnBoard = room.escapees.some(p => p.role === '엔지니어');
        if (hasMalfunction) {
          if (engineerOnBoard) {
            resultMessage = "[4관문 통과] 캡슐에 결함이 발생했지만, 엔지니어가 성공적으로 수리했습니다.";
          } else {
            resultMessage = "[4관문 실패] 치명적인 결함이 발생했으나, 수리할 엔지니어가 없습니다...";
            isGameOver = true;
            const ending = ENDING_MESSAGES['alien_win_escape_malfunction'];
            room.winner = ending.winner;
            io.to(code).emit('gameOver', ending);
          }
        } else {
          resultMessage = "[4관문 통과] 캡슐은 아무 이상 없었습니다. 지구로 귀환합니다!";
        }

        // 마지막 관문 통과 시 탐사대 승리 처리
        if (!isGameOver) {
          const finalEnding = ENDING_MESSAGES['crew_win_escape_success'];
          room.winner = finalEnding.winner;
          io.to(code).emit('gameOver', finalEnding);
          isGameOver = true;
        }
        break;
    }

    room.escapeLog.push(`>>> ${resultMessage}`);
    if (isGameOver) {
      room.status = 'game_over';
    } else {
      room.escapeStep = nextStep;
      room.escapeLog.push(`>>> 다음 보안 검사를 진행합니다... [ ${nextStep + 1}단계 확인] 버튼을 눌러주세요.`);
    }

    broadcastUpdates(code);
  });

  // 비상탈출 타이머 시작 핸들러
  socket.on('startEscapeTimer', (roomCode) => {
    if (!gameRooms[roomCode] || timerIntervals[roomCode]) return;
    const room = gameRooms[roomCode];
    room.timeLeft = 210; // 3분 30초

    timerIntervals[roomCode] = setInterval(() => {
      const payload = { roomCode: roomCode, timeLeft: room.timeLeft };
      io.to(roomCode).emit('timerUpdate', payload);
      io.to(ADMIN_ROOM).emit('timerUpdate', payload);

      room.timeLeft--;

      if (room.timeLeft < 0) {
        clearInterval(timerIntervals[roomCode]);
        delete timerIntervals[roomCode];
      }
    }, 1000);
  });

  // 관리자에 의한 비상탈출 실패 처리 핸들러
  socket.on('forceEscapeFailure', (data) => {
    const { code } = data;
    const room = gameRooms[code];
    if (!room) return;

    room.status = 'game_over';
    const ending = ENDING_MESSAGES['alien_win_escape_timeout'];
    io.to(code).emit('gameOver', { winner: ending.winner, reason: ending.reason });
    broadcastUpdates(code);
  });

  // 3. 비상 탈출 관문 핸들러
  socket.on('advanceEscapeSequence', (data) => {
    const { code } = data;
    const room = gameRooms[code];
    if (!room || room.phase !== 'escape_sequence') return;

    // 현재 단계에 따라 로직을 분기합니다.
    switch (room.escapeStep) {
      // [1관문] 뚱이 체크 시작
      case 0:
        console.log(`[${code}] 탈출 시퀀스 1단계: 뚱이 체크 시작`);
        room.escapeStep = 0.5; // 질문 공개 단계로 변경
        break;

      // [1관문] 뚱이 체크 결과 판정
      case 0.5:
        const hasGlutton = room.escapees.some(p => p.role === '뚱이');
        if (hasGlutton) {
          console.log(`[${code}] 뚱이 발견! 비상탈출 실패.`);
          room.escapeResult.step1 = 'fail';
          room.status = 'game_over';
          const ending = ENDING_MESSAGES['alien_win_glutton'];
          io.to(code).emit('gameOver', { winner: ending.winner, reason: ending.reason });
        } else {
          console.log(`[${code}] 뚱이 없음. 1관문 통과.`);
          room.escapeResult.step1 = 'pass';
          room.escapeStep = 1; // 다음 관문 대기 단계로 변경
        }
        break;

      // 다음 관문들은 여기에 case 1, 1.5, ... 로 추가될 예정입니다.
    }

    broadcastUpdates(code);
  });

  socket.on('useSoldierAbility', (data) => {
    const { targetId } = data;
    const selectorId = socket.id;
    let roomCode = '';
    for (const code in gameRooms) {
      if (gameRooms[code].players.some(p => p.id === selectorId)) { roomCode = code; break; }
    }

    if (roomCode) {
      const room = gameRooms[roomCode];
      const soldier = room.players.find(p => p.id === socket.id);
      if (room && soldier && soldier.role === '군인' && soldier.bullets > 0) {
        soldier.bullets--;
        eliminatePlayer(roomCode, targetId, 'soldier_shot');
        broadcastUpdates(roomCode);
      }
    }
  });

  // ★★★ 위 코드를 아래 코드로 교체해주세요. ★★★
  socket.on('eliminatePlayer', (data) => {
    const { roomCode, playerId, cause } = data;
    // 서버에서는 확인 절차 없이 바로 실행합니다. (확인은 admin.html에서 이미 완료됨)
    eliminatePlayer(roomCode, playerId, cause || 'admin_action');
  });

  socket.on('useCaptainAbility', (data) => {
    const { targetId } = data;
    const selectorId = socket.id;
    let roomCode = '';
    for (const code in gameRooms) {
      if (gameRooms[code].players.some(p => p.id === selectorId)) { roomCode = code; break; }
    }

    if (roomCode) {
      const room = gameRooms[roomCode];
      const captain = room.players.find(p => p.id === socket.id);
      if (room && captain && captain.role === '함장' && captain.bullets > 0) {
        captain.bullets--;
        eliminatePlayer(roomCode, targetId, 'captain_shot');
        broadcastUpdates(roomCode);
      }
    }
  });

  socket.on('useQueenHunt', (data) => {
    const { targetIds } = data;
    const selectorId = socket.id;
    let roomCode = '';
    for (const code in gameRooms) {
      if (gameRooms[code].players.some(p => p.id === selectorId)) { roomCode = code; break; }
    }

    if (roomCode) {
      const room = gameRooms[roomCode];
      const queen = room.players.find(p => p.id === socket.id);
      if (room && queen && queen.role === '에일리언 여왕' && !queen.abilityUsed && targetIds && targetIds.length === 2) {
        queen.abilityUsed = true;
        room.selections[selectorId] = targetIds;

        const allAliens = room.players.filter(p => p.role.includes('에일리언'));
        allAliens.forEach(alienPlayer => {
          io.to(alienPlayer.id).emit('nightSelectionUpdate', { selections: room.selections });
        });
      }
    }
  });

  socket.on('triggerQueenRampage', (data) => {
    const { code } = data;
    const room = gameRooms[code];
    if (!room || room.pendingAction !== 'queen_rampage') return;

    // ★★★ 추가: 만찬이 시작되었음을 상태에 기록
    room.rampageTriggered = true;

    console.log(`[${code}] 관리자가 여왕의 만찬을 시작시켰습니다.`);
    const queen = room.players.find(p => p.role === '에일리언 여왕' && p.status === 'alive');
    if (queen) {
      const allAlienIds = room.players.filter(p => p.role.includes('에일리언')).map(p => p.id);
      const targets = room.players.filter(p => p.status === 'alive' && !allAlienIds.includes(p.id));
      io.to(queen.id).emit('queenRampageAction', { targets });
    }

    // ★★★ 추가: 변경된 상태를 즉시 전파하여 관리자 UI 갱신
    broadcastUpdates(code);
  });

  // server/index.js

  // 3. 이 함수로 교체해주세요.
  socket.on('useQueenRampage', (data) => {
    const { targetIds } = data;
    const selectorId = socket.id;
    let roomCode = '';
    for (const code in gameRooms) {
      if (gameRooms[code].players.some(p => p.id === selectorId)) { roomCode = code; break; }
    }

    if (roomCode) {
      const room = gameRooms[roomCode];
      const queen = room.players.find(p => p.id === socket.id);
      // ★★★ 수정: 0명 이상, 4명 이하 선택을 허용하도록 조건 변경 ★★★
      if (room && queen && queen.role === '에일리언 여왕' && targetIds && targetIds.length >= 0 && targetIds.length <= 4) {
        room.selections[selectorId] = targetIds;

        console.log(`[${roomCode}] 여왕 만찬 선택 기록:`, room.selections);
        io.to(selectorId).emit('actionConfirmed');

        const allAliens = room.players.filter(p => p.role.includes('에일리언'));
        allAliens.forEach(alienPlayer => {
          io.to(alienPlayer.id).emit('nightSelectionUpdate', { selections: room.selections });
        });

        broadcastUpdates(roomCode);
      }
    }
  });

  socket.on('engineerChoseToFight', () => {
    let roomCode = '';
    for (const code in gameRooms) {
      if (gameRooms[code].players.some(p => p.id === socket.id)) { roomCode = code; break; }
    }
    if (!roomCode) return;

    console.log(`[${roomCode}] 엔지니어가 싸움을 선택했습니다. 여왕의 만찬을 준비합니다.`);
    const room = gameRooms[roomCode];
    room.pendingAction = 'queen_rampage';
    io.to(roomCode).emit('feastAnnounced');
    broadcastUpdates(roomCode);
  });

  socket.on('engineerChoseEscape', () => {
    let roomCode = '';
    for (const code in gameRooms) {
      if (gameRooms[code].players.some(p => p.id === socket.id)) { roomCode = code; break; }
    }
    console.log(`[${roomCode}] 엔지니어가 비상탈출을 선택했습니다.`);
  });


  socket.on('useChatterboxAbility', (data) => {
    const { targetId } = data;
    const selectorId = socket.id;
    let roomCode = '';

    // 요청을 보낸 플레이어가 속한 방을 찾습니다.
    for (const code in gameRooms) {
      if (gameRooms[code].players.some(p => p.id === selectorId)) {
        roomCode = code;
        break;
      }
    }

    if (roomCode) {
      const room = gameRooms[roomCode];
      const chatterbox = room.players.find(p => p.id === selectorId);
      const target = room.players.find(p => p.id === targetId);

      // 수다쟁이가 맞는지, 하룻밤에 한 번만 사용했는지, 대상이 유효한지 확인
      if (chatterbox && chatterbox.role === '수다쟁이' && target && chatterbox.abilityUsedDay !== room.day) {

        // 능력 사용 기록 (같은 날 중복 사용 방지)
        chatterbox.abilityUsedDay = room.day;

        // 대상의 역할을 공개 상태로 변경
        target.revealedRole = target.role;
        console.log(`[${roomCode}] Chatterbox ${chatterbox.name} revealed ${target.name}'s role as ${target.role}.`);

        // 능력 사용이 완료되었음을 클라이언트에 알림
        io.to(selectorId).emit('actionConfirmed');

        // 변경된 상태를 모든 클라이언트에 전파
        broadcastUpdates(roomCode);
      }
    }
  });

  // index.js의 io.on('connection', ...) 내부

  // ★★★ 기존 usePsychicAbility 핸들러 전체를 아래 코드로 교체해주세요. ★★★
  socket.on('usePsychicAbility', (data) => {
    const { targetIds } = data;
    const selectorId = socket.id;
    let roomCode = '';
    for (const code in gameRooms) {
      if (gameRooms[code].players.some(p => p.id === selectorId)) { roomCode = code; break; }
    }
    if (!roomCode) return;

    const room = gameRooms[roomCode];
    const psychic = room.players.find(p => p.id === selectorId);

    if (!psychic || psychic.role !== '초능력자' || psychic.abilityUsed) return;
    if (!psychic.group) return io.to(selectorId).emit('abilityError', '모둠을 먼저 선택해야 능력을 사용할 수 있습니다.');

    psychic.abilityUsed = true;
    const isSuccess = Math.random() < 0.45; // 45% 성공 확률
    const result = isSuccess ? '성공' : '실패';
    const ROULETTE_DURATION = 5000; // 룰렛 애니메이션 시간
    const VIEW_DURATION = 3500;

    // 1. 모든 플레이어에게 룰렛 UI를 생성하라는 신호를 보냄
    io.to(roomCode).emit('showRoulette', {
      title: '초능력 판정',
      // 옵션을 객체 배열로 변경하여 앞/뒷면을 모두 설정
      options: [
        { front: '?', back: '성공' },
        { front: '?', back: '실패' }
      ],
      duration: ROULETTE_DURATION
    });

    // 2. 룰렛 애니메이션 시간(8초)이 흐른 뒤, 결과를 보냄
    setTimeout(() => {
      io.to(roomCode).emit('rouletteResult', { result: result });
    }, ROULETTE_DURATION);

    // 3. 결과가 공개되고 잠시 후(11초), 실제 게임 상태를 변경하고 업데이트함
    setTimeout(() => {
      if (isSuccess) {
        console.log(`[${roomCode}] Psychic ability SUCCEEDED.`);
        targetIds.forEach(targetId => {
          const target = room.players.find(p => p.id === targetId);
          if (target) {
            target.revealedRole = target.role;
            target.revealedBy = 'psychic';
          }
        });
      } else {
        console.log(`[${roomCode}] Psychic ability FAILED.`);
        // ... (기존 실패 처리 로직은 동일) ...
        const psychicGroup = room.players.filter(p => p.status === 'alive' && p.group === psychic.group);
        const psychicIndex = psychicGroup.findIndex(p => p.id === psychic.id);
        if (psychicIndex !== -1) {
          const playersToEliminate = new Set([psychic.id]);
          if (psychicGroup.length > 1) {
            playersToEliminate.add(psychicGroup[(psychicIndex - 1 + psychicGroup.length) % psychicGroup.length].id);
            playersToEliminate.add(psychicGroup[(psychicIndex + 1) % psychicGroup.length].id);
          }
          playersToEliminate.forEach(playerId => eliminatePlayer(roomCode, playerId, 'psychic_fail'));
        }
      }
      broadcastUpdates(roomCode);
    }, ROULETTE_DURATION + VIEW_DURATION);
  });

  // ★★★ 위 함수를 아래의 완전한 코드로 교체해주세요. ★★★
  socket.on('endNightAndStartMeeting', (data) => {
    const { code } = data;
    const room = gameRooms[code];
    if (!room) return;

    room.day += 1;
    room.phase = 'meeting';

    // ★★★ 핵심 로직 시작 ★★★
    // 2일차 이상의 아침이 되면, 모둠을 새로 선택해야 한다는 상태를 설정합니다.
    if (room.day > 1) {
      room.needsGroupSelection = true;
      // 새 날이 되었으므로 모든 생존 플레이어의 기존 모둠 정보를 초기화합니다.
      // 이렇게 해야 플레이어 화면에서 '!player.group' 조건이 참이 되어 선택 버튼이 나타납니다.
      room.players.forEach(p => {
        if (p.status === 'alive') {
          delete p.group;
        }
      });
    }
    // ★★★ 핵심 로직 끝 ★★★

    broadcastUpdates(code);
  });
});

server.listen(PORT, () => {
  console.log(`서버가 ${PORT}번 포트에서 실행 중입니다.`);
});

// 테스트용 주석