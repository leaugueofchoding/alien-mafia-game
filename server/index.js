// server/index.js 파일의 전체 코드를 이 내용으로 교체해주세요.

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

const PORT = process.env.PORT || 3001;
let gameRooms = {}; // <- let 으로 변경하여 문제 해결
const ADMIN_ROOM = 'admin_room';
const timerIntervals = {};

// --- 경로 설정 시작 ---
// __dirname은 현재 파일(index.js)이 있는 'server' 폴더를 가리킵니다.
const serverPath = __dirname;
// 여기서 한 단계 위로 올라가면 프로젝트의 루트 폴더입니다.
const rootPath = path.join(serverPath, '..');

// JSON 파일과 public 폴더의 정확한 경로를 지정합니다.
const presetsPath = path.join(serverPath, 'presets.json');
const missionsPath = path.join(serverPath, 'missions.json');
const publicPath = path.join(rootPath, 'client/public');
// --- 경로 설정 끝 ---

// 파일 로드
const presetsData = fs.readFileSync(presetsPath, 'utf8');
const PRESETS = JSON.parse(presetsData);
const MISSIONS = JSON.parse(fs.readFileSync(missionsPath, 'utf8'));

// 직업 설명 및 엔딩 메시지 (생략 - 기존 코드와 동일)
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
  },
  biochem_weapon_success: {
    winner: '탐사대',
    reason: '위대한 의사들이 마침내 에일리언에게만 치명적인 생화학 무기를 개발하는 데 성공했습니다! 함선 전체에 무기가 살포되고 에일리언들은 흔적도 없이 사라졌습니다.'
  },
  salvation_success: {
    winner: '탐사대',
    reason: '신의 사도의 굳건한 믿음이 마침내 하늘에 닿았습니다. 성스러운 빛이 함선을 감싸자 모든 에일리언이 소멸하였고, 탐사대는 구원받았습니다.'
  },
  crew_win_hero: {
    winner: '탐사대',
    reason: '영웅은 천재적인 두뇌나 특별한 능력으로 만들어지는 게 아닙니다. 우리와 같은 평범한 사람들이 강인한 의지를 갖고 서로의 힘을 모을 때, 우리 모두는 영웅이 되는 겁니다.'
  },
  crew_win_cold_survivors: {
    winner: '생존자',
    reason: '뛰어난 자질을 갖춘 생존자들은 위협 속에서 살아남았습니다. 하지만 특별한 능력이 없다고 상대를 가벼이 여겨서는 안 됩니다. 그런 냉정함 덕분에 살아남았다고 하면, 달리 할 말은 없겠습니다.'
  }
};


// --- 라우팅 설정 시작 (가장 중요한 부분) ---
// client/public 폴더를 정적 파일 제공 폴더로 설정합니다.
app.use(express.static(publicPath));

// 루트 URL('/') 요청 시 index.html 파일을 보냅니다.
app.get('/', (req, res) => {
  res.sendFile(path.join(publicPath, 'index.html'));
});

// '/admin' URL 요청 시 admin.html 파일을 보냅니다.
app.get('/admin', (req, res) => {
  res.sendFile(path.join(publicPath, 'admin.html'));
});

// '/situation-board.html' URL 요청 시 situation-board.html 파일을 보냅니다.
app.get('/situation-board.html', (req, res) => {
  res.sendFile(path.join(publicPath, 'situation-board.html'));
});
// --- 라우팅 설정 끝 ---


// --- 게임 로직 함수들 (생략 - 기존 코드와 동일) ---
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
function resolveEscapeEnding(roomCode) {
  const room = gameRooms[roomCode];
  if (!room) return;

  // 탈출 성공자 중에 '일반 승객'이 있는지 확인
  const hasOrdinaryPassenger = room.escapees.some(p => p.role === '일반 승객');

  if (hasOrdinaryPassenger) {
    // 일반 승객이 있으면 '영웅' 엔딩
    endGame(roomCode, 'crew_win_hero');
  } else {
    // 일반 승객이 없으면 '냉정한 생존자들' 엔딩
    endGame(roomCode, 'crew_win_cold_survivors');
  }
}
function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function broadcastAlienSelections(roomCode) {
  const room = gameRooms[roomCode];
  if (!room || !room.selections) return;

  const allAliens = room.players.filter(p => p.role.includes('에일리언'));
  allAliens.forEach(alienPlayer => {
    io.to(alienPlayer.id).emit('nightSelectionUpdate', { selections: room.selections });
  });
}

function broadcastUpdates(roomCode) {
  if (gameRooms[roomCode]) {
    const room = gameRooms[roomCode];
    const missionPresetNames = Object.keys(MISSIONS);
    // 관리자에게 항상 rooms, presets, missionPresets 전체를 전송
    io.to(ADMIN_ROOM).emit('updateAdmin', {
      rooms: gameRooms,
      presets: PRESETS,
      missionPresets: missionPresetNames
    });
    io.to(roomCode).emit('boardUpdate', room);
    io.to(roomCode).emit('updateRoom', room);
  }
}

function transitionToNightPhase(roomCode) {
  const room = gameRooms[roomCode];
  if (!room) return;

  console.log(`[${roomCode}] Cleaning up minigame and transitioning to night phase.`);

  // 미니게임 관련 상태를 먼저 초기화합니다.
  delete room.ejectionState;
  delete room.ejectionVotes;
  delete room.ejectionNominations;
  delete room.ejectionMinigame;

  const livingPlayers = room.players.filter(p => p.status === 'alive');
  const normalAliens = livingPlayers.filter(p => p.role === '에일리언');
  const queen = livingPlayers.find(p => p.role === '에일리언 여왕');
  const activeAlienCount = normalAliens.length + (queen && !queen.abilityUsed ? 1 : 0);

  if (activeAlienCount === 0) {
    const logMessage = '[시스템] 능력을 사용할 수 있는 에일리언이 없습니다.';
    console.log(`[${roomCode}] No active aliens. Announcing and scheduling next phase.`);

    if (room.gameLog) {
      room.gameLog.unshift({ text: logMessage, type: 'log' });
    }
    // ★★★ 핵심 수정: broadcastUpdates(roomCode) 호출을 제거합니다. ★★★
    io.to(roomCode).emit('noAlienActivity', { message: "오늘 밤에는 능력을 사용할 수 있는 에일리언이 없습니다. 바로 탐사대 활동을 시작합니다." });
    // 관리자에게는 로그가 포함된 업데이트를 한 번 보내줍니다.
    io.to(ADMIN_ROOM).emit('updateAdmin', { rooms: gameRooms, presets: PRESETS, missionPresets: Object.keys(MISSIONS) });


    setTimeout(() => {
      const roomNow = gameRooms[roomCode];
      if (roomNow && roomNow.status === 'playing') {
        roomNow.phase = 'night_crew_action';
        startCrewActionPhase(roomCode);
      }
    }, 4000);
  } else {
    room.phase = 'night_alien_action';
    room.selections = {};
    delete room.alienActionTriggered;
    delete room.crewActionTriggered;
    broadcastUpdates(roomCode);
  }
}

// server/index.js의 checkWinConditions 함수 바로 위에 추가합니다.

function checkAllAlienActionsComplete(roomCode) {
  const room = gameRooms[roomCode];
  if (!room || !room.alienActionsConfirmed) return;

  const livingAliens = room.players.filter(p => p.status === 'alive' && p.role.includes('에일리언'));
  const normalAliens = livingAliens.filter(p => p.role === '에일리언');
  const queen = livingAliens.find(p => p.role === '에일리언 여왕');

  const activeAlienCount = normalAliens.length + (queen && !queen.abilityUsed ? 1 : 0);
  console.log(`[${roomCode}] 활동 완료 확인 중... (완료: ${room.alienActionsConfirmed.length} / 필요: ${activeAlienCount})`);

  // 모든 활동 가능 에일리언이 행동을 마쳤다면
  if (room.alienActionsConfirmed.length >= activeAlienCount) {
    if (room.gameLog) {
      room.gameLog.unshift({ text: `[시스템] 에일리언이 사냥감 선택을 마쳤습니다.`, type: 'log' });
    }

    // 활동한 플레이어와 관전자 모두에게 '활동 종료' 신호를 보냅니다.
    livingAliens.forEach(alien => {
      io.to(alien.id).emit('actionConfirmed');
    });

    broadcastUpdates(roomCode);
  }
}

function checkWinConditions(roomCode) {
  const room = gameRooms[roomCode];
  if (!room || room.status !== 'playing') return false;

  let endingType = null;
  let detailLog = ''; // 상세 로그를 저장할 변수

  const alienQueen = room.players.find(p => p.role === '에일리언 여왕');
  const captain = room.players.find(p => p.role === '함장');
  const engineer = room.players.find(p => p.role === '엔지니어');
  const soldier = room.players.find(p => p.role === '군인');

  // 1. 탐사대 승리 조건: 에일리언 여왕 사망
  if (alienQueen && alienQueen.status === 'dead') {
    endingType = 'crew_win_queen_eliminated';

    switch (alienQueen.causeOfDeath) {
      case 'captain_shot':
        detailLog = `${captain ? captain.name : '함장'}이(가) 에일리언 여왕을 즉결처분으로 사살했습니다.`;
        break;
      case 'soldier_shot':
        detailLog = `${soldier ? soldier.name : '군인'}이(가) 에일리언 여왕을 사살하는 데 성공했습니다.`;
        break;
      case 'ejected_minigame':
        detailLog = `탐사대원의 날카로운 추리와 행운의 도움으로 에일리언 여왕을 제거했습니다.`;
        break;
      case 'psychic_fail':
        detailLog = `초능력자의 폭주에 휘말려 에일리언 여왕이 사망했습니다.`;
        break;
      default:
        detailLog = `에일리언 여왕이 제거되었습니다.`;
    }
  }

  // 2. 에일리언 승리 조건: 함장과 엔지니어 모두 사망
  if (!endingType) {
    if (captain && captain.status === 'dead' && engineer && engineer.status === 'dead') {
      endingType = 'alien_win_assassinate';

      const captainDeadByPsychic = captain.causeOfDeath === 'psychic_fail';
      const engineerDeadByPsychic = engineer.causeOfDeath === 'psychic_fail';

      // ★★★ 추가된 부분: 에일리언 알 사망 원인 확인 ★★★
      const captainDeadByEgg = captain.causeOfDeath === 'egg_contamination';
      const engineerDeadByEgg = engineer.causeOfDeath === 'egg_contamination';

      if (captainDeadByPsychic && engineerDeadByPsychic) {
        detailLog = `초능력자의 폭주에 휘말려 함장과 엔지니어가 모두 사망했습니다.`;
      } else if (captainDeadByPsychic) {
        detailLog = `초능력자의 폭주에 휘말려 함장이 사망했습니다.`;
      } else if (engineerDeadByPsychic) {
        detailLog = `초능력자의 폭주에 휘말려 엔지니어가 사망했습니다.`;
      } else if (captainDeadByEgg && engineerDeadByEgg) {
        detailLog = `에일리언 알의 오염으로 함장과 엔지니어가 모두 사망했습니다.`;
      } else if (captainDeadByEgg) {
        detailLog = `에일리언 알의 오염으로 함장이 사망했습니다.`;
      } else if (engineerDeadByEgg) {
        detailLog = `에일리언 알의 오염으로 엔지니어가 사망했습니다.`;
      }
      // ★★★ 여기까지 ★★★
    }
  }

  if (endingType) {
    endGame(roomCode, endingType, detailLog);
    return true;
  }

  return false;
}

function checkSpecialVictoryConditions(roomCode) {
  const room = gameRooms[roomCode];
  if (!room || room.status !== 'playing' || room.day < 5) return false;

  // ★★★ 신규 추가: 5일차 에일리언 승리 조건 (최우선) ★★★
  const alienQueen = room.players.find(p => p.role === '에일리언 여왕');
  if (alienQueen && alienQueen.status === 'alive') {
    // 5일차 아침에 여왕이 살아있으면 즉시 에일리언 승리
    console.log(`[${roomCode}] Alien Queen is alive on Day 5. Alien victory.`);
    endGame(roomCode, 'alien_win_escape_timeout', '탐사대는 너무 오랜 시간을 허비했습니다. 결국 함선은 에일리언의 차지가 되었습니다.');
    return true; // 에일리언 승리로 게임 종료
  }

  // --- 의사 승리 조건 (우선순위 2) ---
  const initialDoctorCount = room.initialSettings['의사'] || 0;
  if (initialDoctorCount > 0) {
    const aliveDoctors = room.players.filter(p => p.role === '의사' && p.status === 'alive').length;
    if (aliveDoctors === initialDoctorCount) {
      console.log(`[${roomCode}] Doctor victory condition met.`);
      endGame(roomCode, 'biochem_weapon_success');
      return true; // 의사 승리로 게임 종료
    }
  }

  // --- 신의 사도 승리 조건 (우선순위 3) ---
  const apostle = room.players.find(p => p.role === '신의 사도');
  if (apostle && apostle.status === 'alive') {
    const history = room.playerGroupHistory[apostle.id];
    if (history && history.length >= 4) {
      const firstChoice = history[0];
      const isConsistent = history.slice(0, 4).every(choice => choice === firstChoice);
      if (isConsistent) {
        console.log(`[${roomCode}] Apostle of God victory condition met.`);
        endGame(roomCode, 'salvation_success');
        return true; // 신의 사도 승리로 게임 종료
      }
    }
  }

  return false;
}

function eliminatePlayer(roomCode, playerId, cause = 'unknown', broadcast = true) {
  const room = gameRooms[roomCode];
  if (!room) return false;
  const player = room.players.find(p => p.id === playerId);

  if (player && player.status !== 'dead') {
    player.status = 'dead';
    player.causeOfDeath = cause;
    io.to(playerId).emit('youAreDead');

    const targetPlayer = room.players.find(p => p.id === playerId);
    const targetName = targetPlayer ? targetPlayer.name : '누군가';
    const causeMap = {
      'admin_action': `[관리자]가 ${targetName}님을 사망 처리했습니다.`,
      'alien_kill': `[에일리언]이 ${targetName}님을 포식했습니다.`,
      'captain_shot': `[함장]이 ${targetName}님을 즉결처분했습니다.`,
      'soldier_shot': `[군인]이 ${targetName}님을 사살했습니다.`,
      'psychic_fail': `[초능력자]의 능력이 폭주하여 ${targetName}님이 휘말렸습니다.`,
      'egg_contamination': `[에일리언 알]이 오염되어 ${targetName}님이 사망했습니다.`,
      'ejected_minigame': `[방출 미니게임] 결과, ${targetName}님이 함선 외부로 방출되었습니다.`
    };
    if (causeMap[cause] && room.gameLog) {
      room.gameLog.unshift({ text: causeMap[cause], type: 'log' });
    }

    const gameEndedByElimination = checkWinConditions(roomCode);
    if (gameEndedByElimination) return true;

    if (player.role === '함장') {
      const engineer = room.players.find(p => p.role === '엔지니어' && p.status === 'alive');
      if (engineer) {
        room.pendingAction = 'engineer_choice';
      } else {
        checkWinConditions(roomCode);
      }
    }

    // ★★★ 수정: broadcast 파라미터가 true일 때만 업데이트를 보냅니다. ★★★
    if (broadcast) {
      broadcastUpdates(roomCode);
    }
    return true;
  }
  return false;
}

function startCrewActionPhase(roomCode) {
  const room = gameRooms[roomCode];
  if (!room) return;

  room.crewActionTriggered = true;
  if (room.gameLog) {
    room.gameLog.unshift({ text: `[탐사대 활동 시작]`, type: 'phase_change' });
  }

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

  broadcastUpdates(roomCode);
}

// (이하 모든 소켓 이벤트 핸들러는 생략 - 기존 코드와 동일)
io.on('connection', (socket) => {

  socket.on('adminConnect', () => {
    socket.join(ADMIN_ROOM);
    // MISSIONS 객체의 키(프리셋 이름) 목록을 함께 전송하도록 수정
    const missionPresetNames = Object.keys(MISSIONS);
    socket.emit('updateAdmin', { rooms: gameRooms, presets: PRESETS, missionPresets: missionPresetNames });
  });

  socket.on('boardConnect', (data) => {
    const { roomCode } = data;
    if (gameRooms[roomCode]) {
      socket.join(roomCode);
      io.to(socket.id).emit('boardUpdate', gameRooms[roomCode]);
    }
  });

  socket.on('createRoom', (data) => {
    const { code } = data;
    if (gameRooms[code]) {
      socket.emit('adminError', `오류: 초대 코드 '${code}'는 이미 사용 중입니다.`);
      return;
    }

    gameRooms[code] = {
      players: [],
      status: 'waiting',
      day: 0,
      phase: 'lobby',
      settings: {},
      groupCount: 6,
      gameLog: [] // ★★★ 로그 저장 공간 추가 ★★★
    };
    console.log(`[${code}] Admin created a new room.`);
    broadcastUpdates(code);
  });

  socket.on('resetServer', () => {
    // 모든 게임 룸의 타이머를 정지
    Object.keys(gameRooms).forEach(code => {
      if (timerIntervals[code]) {
        clearInterval(timerIntervals[code]);
        delete timerIntervals[code];
      }
    });

    // gameRooms 객체를 초기화
    gameRooms = {};

    console.log("SERVER RESET: All game rooms have been cleared by an admin.");

    // 관리자 페이지에 즉시 변경사항 전파
    const missionPresetNames = Object.keys(MISSIONS);
    io.to(ADMIN_ROOM).emit('updateAdmin', { rooms: gameRooms, presets: PRESETS, missionPresets: missionPresetNames });
  });


  socket.on('joinGame', (data) => {
    const { name, code } = data;

    // ★★★ 핵심 수정 ★★★
    // 게임 방이 존재하는지 먼저 확인
    if (!gameRooms[code]) {
      socket.emit('joinFailed', '존재하지 않는 초대 코드입니다. 관리자에게 문의하세요.');
      return;
    }

    // 기존 로직: 방이 이미 시작되었는지 확인
    if (gameRooms[code].status === 'playing') {
      socket.emit('joinFailed', '이미 시작된 게임에는 참여할 수 없습니다.');
      return;
    }

    socket.join(code);
    // 방 생성 로직은 삭제됨: if (!gameRooms[code]) { ... }

    const newPlayer = { id: socket.id, name: name, status: 'alive' };
    gameRooms[code].players.push(newPlayer);
    broadcastUpdates(code);
  });

  // server/index.js

  // ★★★ 기존 startGame 핸들러를 아래 코드로 통째로 교체해주세요. ★★★
  socket.on('startGame', (data) => {
    const { code, settings, groupCount, selectedPreset, useEjectionMinigame } = data;
    const room = gameRooms[code];
    if (!room || room.status === 'playing') return;

    // 1. 역할 설정과 미니게임 설정을 하나의 settings 객체로 통합합니다.
    room.settings = settings; // 'settings'는 역할 인원 정보입니다.
    room.settings.useEjectionMinigame = useEjectionMinigame; // 여기에 미니게임 사용 여부를 추가합니다.

    // 2. 나머지 게임 정보를 설정합니다.
    room.groupCount = groupCount;
    room.initialSettings = { ...room.settings }; // 기존 initialSettings는 백업용으로 유지합니다.
    room.playerGroupHistory = {};
    room.dailyMissionSolves = {};
    room.gameLog = [];

    // --- 미션 보드 생성 로직 (기존과 동일) ---
    const missionSet = MISSIONS[selectedPreset];

    if (missionSet && missionSet.length >= 0) {
      const shuffledMissions = shuffle([...missionSet]);
      const selectedMissions = shuffledMissions.slice(0, 30);

      room.missionBoard = {
        progress: 0,
        problems: selectedMissions.map(mission => ({
          id: mission.id,
          question: mission.question,
          answer: mission.answer,
          status: 'unsolved',
          solvedBy: null,
          failedBy: null
        }))
      };
      console.log(`[${code}] Mission board created with preset: ${selectedPreset}`);
    } else {
      room.missionBoard = null;
      console.warn(`[${code}] Warning: Selected preset '${selectedPreset}' has less than 25 questions. Starting without mission board.`);
    }
    // --- 미션 보드 로직 끝 ---

    const roles = [];
    for (const roleName in settings) {
      // 주의: useEjectionMinigame은 역할이 아니므로 제외하고 역할을 배분합니다.
      if (roleName !== 'useEjectionMinigame') {
        for (let i = 0; i < settings[roleName]; i++) { roles.push(roleName); }
      }
    }
    const players = room.players;
    const shuffledRoles = shuffle(roles);

    players.forEach((player, index) => {
      player.role = shuffledRoles[index];
      player.description = ROLE_DESCRIPTIONS[shuffledRoles[index]] || '';
      player.abilityUsed = false;
      if (player.role === '함장') player.bullets = 2;
      else if (player.role === '군인') player.bullets = 1;

      room.playerGroupHistory[player.id] = [];
      delete player.group;
    });

    room.status = 'playing';
    room.phase = 'role_reveal';
    room.day = 1;
    room.needsGroupSelection = true;

    broadcastUpdates(code);
  });

  socket.on('revivePlayer', (data) => {
    const { roomCode, playerId } = data;
    const room = gameRooms[roomCode];
    if (!room) return;

    const player = room.players.find(p => p.id === playerId);
    if (player && player.status === 'dead') {
      player.status = 'alive';
      delete player.causeOfDeath; // 사망 원인 초기화
      io.to(playerId).emit('youAreAlive');
      console.log(`[${roomCode}] Player ${player.name} (${playerId}) has been REVIVED by admin.`);
      broadcastUpdates(roomCode);
    }
  });

  // ★★★ [추가] 관리자의 강제 퇴장 요청을 처리하는 핸들러 ★★★
  socket.on('kickPlayer', (data) => {
    const { roomCode, playerId } = data;
    const room = gameRooms[roomCode];

    // 대기중인 방에서만 강퇴 가능
    if (!room || room.status !== 'waiting') {
      return;
    }

    const playerIndex = room.players.findIndex(p => p.id === playerId);
    if (playerIndex > -1) {
      const kickedPlayer = room.players.splice(playerIndex, 1)[0];
      console.log(`[${roomCode}] Admin kicked player ${kickedPlayer.name}.`);

      // 강퇴당한 플레이어에게 알림
      io.to(playerId).emit('joinFailed', '관리자에 의해 퇴장당했습니다.');

      // 방의 모든 인원에게 변경사항 전파
      broadcastUpdates(roomCode);
    }
  });

  socket.on('disconnect', () => {
    console.log(`Player disconnected: ${socket.id}`);
    for (const code in gameRooms) {
      const room = gameRooms[code];
      const disconnectedPlayer = room.players.find(p => p.id === socket.id);

      // 해당 방에서 플레이어를 찾았고, 게임이 진행 중이며, 아직 살아있는 플레이어라면
      if (disconnectedPlayer && room.status === 'playing' && disconnectedPlayer.status === 'alive') {
        const playerName = disconnectedPlayer.name;
        console.log(`[${code}] Player ${playerName} is being eliminated due to disconnection.`);

        // 단순히 제거하는 대신, '사망 처리' 함수를 호출
        eliminatePlayer(code, disconnectedPlayer.id, 'disconnection');

        break;
      }
      // 게임 시작 전 대기실에서 나간 경우, 기존처럼 제거
      else if (disconnectedPlayer && room.status === 'waiting') {
        const playerIndex = room.players.findIndex(p => p.id === socket.id);
        if (playerIndex > -1) {
          const playerName = room.players[playerIndex].name;
          console.log(`[${code}] Removing player ${playerName} from waiting room.`);
          room.players.splice(playerIndex, 1);
          broadcastUpdates(code);
          break;
        }
      }
    }
  });

  // server/index.js

  socket.on('selectGroup', (data) => {
    const { roomCode, groupNumber } = data; // 이 함수 안에서는 'roomCode'를 사용해야 합니다.
    const room = gameRooms[roomCode];
    if (!room) return;

    const player = room.players.find(p => p.id === socket.id);
    if (player) {
      player.group = groupNumber;

      if (room.playerGroupHistory && room.playerGroupHistory[player.id]) {
        room.playerGroupHistory[player.id].push(groupNumber);
      }
      console.log(`[${roomCode}] Player ${player.name} selected group ${player.group}.`);

      const allAlivePlayers = room.players.filter(p => p.status === 'alive');
      const allSelectedGroup = allAlivePlayers.every(p => !!p.group);

      if (allSelectedGroup && room.settings.useEjectionMinigame) {
        // ★★★ 수정: 'code'를 'roomCode'로 변경 ★★★
        console.log(`[${roomCode}] All players selected group with minigame ON. Checking for single-member groups.`);

        if (room.gameLog) {
          room.gameLog.unshift(`[회의] 모든 생존자가 모둠 선택을 완료했습니다.`);
        }

        const alivePlayerGroups = new Set(allAlivePlayers.map(p => p.group));

        alivePlayerGroups.forEach(groupNum => {
          const groupMembers = allAlivePlayers.filter(p => p.group === groupNum);

          if (groupMembers.length === 1) {
            const singlePlayer = groupMembers[0];
            if (room.ejectionNominations && !room.ejectionNominations[groupNum]) {
              room.ejectionNominations[groupNum] = singlePlayer.id;
              // 이 부분은 원래 'roomCode'로 되어있어 문제가 없습니다.
              console.log(`[${roomCode}] Auto-nominated player ${singlePlayer.name} from single-member group ${groupNum}.`);
            }
          }
        });

        const totalActiveGroups = alivePlayerGroups.size;
        if (room.ejectionNominations) {
          const allGroupsNominated = Object.keys(room.ejectionNominations).length === totalActiveGroups;
          if (allGroupsNominated && totalActiveGroups > 0) {
            if (room.ejectionState !== 'minigame_pending') {
              room.ejectionState = 'minigame_pending';
              // ★★★ 수정: 'code'를 'roomCode'로 변경 ★★★
              console.log(`[${roomCode}] All active groups have nominated. State is now minigame_pending.`);

              const nomineeIds = Object.values(room.ejectionNominations);
              const nomineeNames = nomineeIds.map(id => room.players.find(p => p.id === id)?.name).join(', ');
              if (room.gameLog) {
                room.gameLog.unshift(`[회의] 최종 방출 후보가 ${nomineeNames}(으)로 결정되었습니다.`);
              }
            }
          }
        }
      }

      broadcastUpdates(roomCode);
    }
  });

  // ★★★ [1/6] 관리자가 '1차 후보 지목 시작' 버튼을 눌렀을 때
  socket.on('startEjectionNomination', (data) => {
    const { code } = data;
    const room = gameRooms[code];
    if (!room) return;
    room.ejectionState = 'nominating';
    console.log(`[${code}] Ejection nomination started by admin.`);
    broadcastUpdates(code);
  });

  // server/index.js

  // ★★★ 기존 nominateForEjection 핸들러를 아래 코드로 통째로 교체해주세요. ★★★
  socket.on('nominateForEjection', (data) => {
    const { roomCode, targetId } = data;
    const voterId = socket.id;
    const room = gameRooms[roomCode];
    if (!room || room.ejectionState !== 'nominating') return;

    const voter = room.players.find(p => p.id === voterId);
    if (!voter || !voter.group) return;

    const groupNum = voter.group;
    if (!room.ejectionVotes[groupNum]) {
      room.ejectionVotes[groupNum] = {};
    }
    room.ejectionVotes[groupNum][voterId] = targetId;
    console.log(`[${roomCode}] Player ${voter.name} from group ${groupNum} voted for player ID ${targetId}`);

    const groupMembers = room.players.filter(p => p.status === 'alive' && p.group === groupNum);
    const allVoted = groupMembers.every(p => room.ejectionVotes[groupNum][p.id]);

    if (allVoted) {
      console.log(`[${roomCode}] All members of group ${groupNum} have voted.`);
      const voteCounts = {};
      Object.values(room.ejectionVotes[groupNum]).forEach(votedId => {
        voteCounts[votedId] = (voteCounts[votedId] || 0) + 1;
      });

      let maxVotes = 0;
      let nominees = [];
      for (const playerId in voteCounts) {
        if (voteCounts[playerId] > maxVotes) {
          maxVotes = voteCounts[playerId];
          nominees = [playerId];
        } else if (voteCounts[playerId] === maxVotes) {
          nominees.push(playerId);
        }
      }

      const finalNomineeId = nominees[Math.floor(Math.random() * nominees.length)];
      room.ejectionNominations[groupNum] = finalNomineeId;
      console.log(`[${roomCode}] Group ${groupNum} final nominee (ID: ${finalNomineeId}) has been decided.`);

      // ★★★ 핵심 수정: '전체 모둠 수'가 아닌 '생존자가 있는 실제 모둠 수'를 기준으로 확인합니다.
      const alivePlayerGroups = new Set(
        room.players
          .filter(p => p.status === 'alive' && p.group)
          .map(p => p.group)
      );
      const totalActiveGroups = alivePlayerGroups.size;
      const allGroupsNominated = Object.keys(room.ejectionNominations).length === totalActiveGroups;

      if (allGroupsNominated && totalActiveGroups > 0) {
        room.ejectionState = 'minigame_pending';
        console.log(`[${roomCode}] All ${totalActiveGroups} active groups have nominated. State is now minigame_pending.`);

        // ★★★ 여기에 아래 로그 추가 코드를 넣으면 됩니다. ★★★
        const nomineeIds = Object.values(room.ejectionNominations);
        const nomineeNames = nomineeIds.map(id => room.players.find(p => p.id === id)?.name).join(', ');
        if (room.gameLog) {
          room.gameLog.unshift(`[회의] 최종 방출 후보가 ${nomineeNames}(으)로 결정되었습니다.`);
        }
      }
    }
    broadcastUpdates(roomCode);
  });

  // ★★★ [3/6] 관리자가 '미니게임 시작' 버튼을 눌렀을 때
  socket.on('startEjectionMinigame', (data) => {
    const { code } = data;
    const room = gameRooms[code];
    if (!room || room.ejectionState !== 'minigame_pending') return;

    const candidates = Object.values(room.ejectionNominations);
    const cardCount = candidates.length;
    let cards = new Array(cardCount).fill({ content: '생존' });
    const ejectionCardIndex = Math.floor(Math.random() * cardCount);
    cards[ejectionCardIndex] = { content: '방출' };

    room.ejectionMinigame = {
      candidates: candidates,
      cards: shuffle(cards.map((card, index) => ({ id: index, content: card.content }))),
      selections: {}, // { candidateId: cardId }
      results: null
    };

    room.ejectionState = 'minigame_active';
    console.log(`[${code}] Ejection minigame started. Candidates:`, candidates);
    broadcastUpdates(code);
  });

  // 기존 socket.on('selectEjectionCard', ...) 핸들러를 삭제하고 아래 코드로 교체

  socket.on('selectEjectionCard', (data) => {
    const { roomCode, cardId } = data;
    const candidateId = socket.id;
    const room = gameRooms[roomCode];

    // 방, 미니게임, selections 객체의 유효성을 먼저 확인하여 안정성을 높입니다.
    if (!room || !room.ejectionMinigame || !room.ejectionMinigame.selections) {
      console.error(`[${roomCode}] ERROR: Room or ejection minigame not properly initialized for selectEjectionCard.`);
      return;
    }

    if (!['minigame_active', 'minigame_all_selected'].includes(room.ejectionState)) {
      console.error(`[${roomCode}] ERROR: Card selection attempted in invalid state (${room.ejectionState}).`);
      return;
    }

    const { candidates, selections } = room.ejectionMinigame;

    // 플레이어가 유효한 후보인지, 이미 선택했는지, 다른 사람이 선택한 카드인지 확인합니다.
    const isCandidate = candidates.includes(candidateId);
    const hasAlreadySelected = !!selections[candidateId];
    const isCardTaken = Object.values(selections).includes(cardId);

    if (isCandidate && !hasAlreadySelected && !isCardTaken) {
      selections[candidateId] = cardId;
      console.log(`[STATE_UPDATE][${roomCode}] Player ${candidateId} selected card ${cardId}. Current Selections:`, JSON.stringify(selections));

      // 모든 후보가 카드를 선택했는지 확인합니다.
      const allCandidatesSelected = candidates.every(id => !!selections[id]);
      if (allCandidatesSelected) {
        room.ejectionState = 'minigame_all_selected';
        if (room.gameLog) {
          room.gameLog.unshift({ text: '[방출 미니게임] 모든 후보가 선택을 마쳤습니다. 관리자는 결과를 공개해주세요.', type: 'log' });
        }
        console.log(`[${roomCode}] All candidates have selected. State is now 'minigame_all_selected'.`);
      }
      broadcastUpdates(roomCode);
    } else {
      // 선택 실패 시 원인을 로그로 남겨 디버깅을 돕습니다.
      console.warn(`[${roomCode}] Card selection failed for ${candidateId}. isCandidate: ${isCandidate}, hasAlreadySelected: ${hasAlreadySelected}, isCardTaken: ${isCardTaken}`);
    }
  });

  // 교체할 내용 1: resolveEjectionMinigame 핸들러 (최종)
  socket.on('resolveEjectionMinigame', (data) => {
    const { code } = data;
    const room = gameRooms[code];
    if (!room || !['minigame_active', 'minigame_all_selected'].includes(room.ejectionState) || !room.ejectionMinigame) {
      return;
    }

    const { candidates, selections, cards } = room.ejectionMinigame;
    const unselectedIds = candidates.filter(id => selections[id] === undefined);
    if (unselectedIds.length > 0) {
      const unselectedNames = unselectedIds.map(id => room.players.find(p => p.id === id)?.name || 'Unknown').join(', ');
      socket.emit('confirmForceEject', {
        playerIds: unselectedIds,
        playerNames: unselectedNames
      });
    } else {
      let ejectedPlayerId = null;
      for (const candidateId in selections) {
        const cardId = selections[candidateId];
        const card = cards.find(c => c.id === cardId);
        if (card && card.content === '방출') {
          ejectedPlayerId = candidateId;
          break;
        }
      }

      const finalEjectedIds = ejectedPlayerId ? [ejectedPlayerId] : [];
      const ejectedNames = finalEjectedIds.length > 0
        ? room.players.find(p => p.id === ejectedPlayerId)?.name
        : '없음';

      if (room.gameLog) {
        room.gameLog.unshift({ text: `[방출 미니게임] 결과, ${ejectedNames}님이 방출되었습니다.`, type: 'log' });
      }

      io.to(code).emit('revealEjectionResult', {
        ejectedPlayerIds: finalEjectedIds,
        cards: cards,
        selections: selections
      });

      setTimeout(() => {
        if (ejectedPlayerId) {
          eliminatePlayer(code, ejectedPlayerId, 'ejected_minigame', false);
        }
        if (gameRooms[code]?.status !== 'game_over') {
          transitionToNightPhase(code);
        }
      }, 5000);
    }
  });

  socket.on('forceEjectPlayers', (data) => {
    const { roomCode, playerIds } = data;
    const room = gameRooms[roomCode];
    if (!room || !room.ejectionMinigame) return;

    const { selections, cards } = room.ejectionMinigame;
    let realEjectedPlayerId = null;
    for (const candidateId in selections) {
      const cardId = selections[candidateId];
      const card = cards.find(c => c.id === cardId);
      if (card && card.content === '방출') {
        realEjectedPlayerId = candidateId;
        break;
      }
    }

    const finalEjectedIds = new Set(playerIds);
    if (realEjectedPlayerId) {
      finalEjectedIds.add(realEjectedPlayerId);
    }
    const finalEjectedIdsArray = Array.from(finalEjectedIds);

    io.to(roomCode).emit('revealEjectionResult', {
      ejectedPlayerIds: finalEjectedIdsArray,
      cards: room.ejectionMinigame.cards,
      selections: room.ejectionMinigame.selections
    });

    setTimeout(() => {
      finalEjectedIdsArray.forEach(playerId => {
        eliminatePlayer(roomCode, playerId, 'ejected_minigame', false);
      });

      if (room.gameLog) {
        const ejectedNames = finalEjectedIdsArray.map(id => room.players.find(p => p.id === id)?.name).join(', ');
        room.gameLog.unshift(`[방출 미니게임] ${ejectedNames}님이 방출되었습니다.`);
      }

      if (gameRooms[roomCode]?.status === 'game_over') return;

      // ★★★ 핵심 수정: 상태를 직접 변경하는 대신, 통합된 함수를 호출합니다. ★★★
      transitionToNightPhase(roomCode);

    }, 5000);
  });

  // 교체할 부분 2: disconnect 핸들러
  socket.on('disconnect', () => {
    console.log(`Player disconnected: ${socket.id}`);
    for (const code in gameRooms) {
      const room = gameRooms[code];
      const disconnectedPlayer = room.players.find(p => p.id === socket.id);

      if (disconnectedPlayer) {
        if (room.status === 'playing' && disconnectedPlayer.status === 'alive') {
          const playerName = disconnectedPlayer.name;
          console.log(`[${code}] Player ${playerName} is being eliminated due to disconnection.`);
          eliminatePlayer(code, disconnectedPlayer.id, 'disconnection');
        }
        else if (room.status === 'waiting') {
          const playerIndex = room.players.findIndex(p => p.id === socket.id);
          if (playerIndex > -1) {
            const playerName = room.players[playerIndex].name;
            console.log(`[${code}] Removing player ${playerName} from waiting room.`);
            room.players.splice(playerIndex, 1);
          }
        }

        // ★★★ 아래 if 블록 전체를 삭제해주세요. ★★★
        /*
        if (room.ejectionState === 'nominating' && disconnectedPlayer.group) {
          const groupNum = disconnectedPlayer.group;
          const groupMembers = room.players.filter(p => p.status === 'alive' && p.group === groupNum);
          if (groupMembers.length > 0 && groupMembers.every(p => room.ejectionVotes?.[groupNum]?.[p.id])) {
            socket.emit('nominateForEjection', { roomCode: code, targetId: null });
          }
        }
        */
        // ★★★ 여기까지 삭제 ★★★

        broadcastUpdates(code);
        break;
      }
    }
  });

  socket.on('nextPhase', (data) => {
    const { code, phase, day } = data;
    const room = gameRooms[code];
    if (!room) return;

    if (room.phase === 'meeting' && room.needsGroupSelection) {
      const unselectedPlayers = room.players.filter(p => p.status === 'alive' && !p.group);
      if (unselectedPlayers.length > 0) {
        const names = unselectedPlayers.map(p => p.name).join(', ');
        return socket.emit('adminError', `아직 모둠을 선택하지 않은 참가자가 있습니다: ${names}`);
      }
    }

    if (timerIntervals[code]) {
      clearInterval(timerIntervals[code]);
      delete timerIntervals[code];
    }

    // ★★★ 핵심 수정 ★★★
    if (phase === 'night_alien_action') {
      const livingPlayers = room.players.filter(p => p.status === 'alive');
      const normalAliens = livingPlayers.filter(p => p.role === '에일리언');
      const queen = livingPlayers.find(p => p.role === '에일리언 여왕');
      const activeAlienCount = normalAliens.length + (queen && !queen.abilityUsed ? 1 : 0);

      if (activeAlienCount === 0) {
        const logMessage = '[시스템] 능력을 사용할 수 있는 에일리언이 없습니다.';
        console.log(`[${code}] No active aliens. Announcing and scheduling next phase.`);

        if (room.gameLog) {
          room.gameLog.unshift({ text: logMessage, type: 'log' });
        }
        // 클라이언트에게 공지 메시지 전송
        io.to(code).emit('noAlienActivity', { message: "오늘 밤에는 능력을 사용할 수 있는 에일리언이 없습니다. 바로 탐사대 활동을 시작합니다." });
        broadcastUpdates(code); // 관리자에게 로그를 즉시 보여주기 위해 업데이트

        // 4초 후 탐사대 활동 단계로 자동 전환
        setTimeout(() => {
          const roomNow = gameRooms[code];
          if (roomNow && roomNow.status === 'playing') {
            roomNow.phase = 'night_crew_action';
            startCrewActionPhase(code); // 탐사대 활동 시작 및 상태 전파
          }
        }, 4000);

        return; // 즉시 다음 단계로 넘어가지 않도록 여기서 함수 종료
      } else {
        room.phase = phase;
        if (room.gameLog) {
          room.gameLog.unshift({ text: `[${day}일차 밤] 에일리언 활동을 시작합니다.`, type: 'phase_change' });
        }
      }
    } else {
      room.phase = phase;
      if (phase === 'meeting') {
        if (room.gameLog) {
          room.gameLog.unshift({ text: `[${day}일차 회의 시작]`, type: 'phase_change' });
        }
        if (room.settings.useEjectionMinigame) {
          room.ejectionState = 'pending_start';
          room.ejectionVotes = {};
          room.ejectionNominations = {};
          room.ejectionMinigame = {};
        }
      }
    }

    room.day = parseInt(day, 10);

    if (room.phase === 'night_alien_action' || room.phase === 'night_crew_action') {
      room.selections = {};
      delete room.alienActionTriggered;
      delete room.crewActionTriggered;
      delete room.ejectionState;
      delete room.ejectionVotes;
      delete room.ejectionNominations;
      delete room.ejectionMinigame;
    }

    broadcastUpdates(code);
  });

  // 기존의 socket.on('triggerAlienAction', ...) 핸들러를 찾아서 아래 코드로 완전히 교체해주세요.

  // 교체할 내용 2: triggerAlienAction 핸들러
  socket.on('triggerAlienAction', (data) => {
    const { code } = data;
    const room = gameRooms[code];
    // ★★★ 수정: 이제 이 핸들러는 에일리언이 '있을 때만' 호출되므로, 유무 확인 로직을 모두 삭제합니다.
    if (!room || room.phase !== 'night_alien_action') return;

    try {
      room.alienActionTriggered = true;
      room.alienActionsConfirmed = [];

      const livingPlayers = room.players.filter(p => p.status === 'alive');
      const allAlienRoles = livingPlayers.filter(p => p.role.includes('에일리언'));
      const normalAliens = allAlienRoles.filter(p => p.role === '에일리언');
      const queen = allAlienRoles.find(p => p.role === '에일리언 여왕');
      const egg = allAlienRoles.find(p => p.role === '에일리언 알');

      const allAlienIds = allAlienRoles.map(p => p.id);
      const targets = livingPlayers
        .filter(p => !allAlienIds.includes(p.id))
        .map(p => ({ id: p.id, name: p.name }));

      // 각 에일리언에게 역할을 부여하는 로직은 그대로 유지합니다.
      normalAliens.forEach(alien => {
        const otherAliens = allAlienRoles.filter(a => a.id !== alien.id).map(a => a.name);
        io.to(alien.id).emit('alienAction', { otherAliens, targets });
      });

      if (queen) {
        const otherAliens = allAlienRoles.filter(a => a.id !== queen.id).map(a => a.name);
        if (!queen.abilityUsed) {
          io.to(queen.id).emit('queenHuntAction', { otherAliens, targets });
        } else if (normalAliens.length > 0) {
          io.to(queen.id).emit('alienAction', { otherAliens, targets, observer: true });
        }
      }

      if (egg) {
        const otherAliens = allAlienRoles.filter(a => a.id !== egg.id).map(a => a.name);
        // 관전 조건: 일반 에일리언이 있거나, 능력을 안 쓴 여왕이 있거나
        if (normalAliens.length > 0 || (queen && !queen.abilityUsed)) {
          io.to(egg.id).emit('alienAction', { otherAliens, targets, observer: true });
        }
      }

      broadcastUpdates(code);
    } catch (error) {
      console.error(`[FATAL ERROR in triggerAlienAction]`, error);
      io.to(ADMIN_ROOM).emit('adminError', `서버 오류 발생: ${error.message}.`);
    }
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

  // server/index.js

  socket.on('resolveQueenRampage', (data) => {
    const { code } = data;
    const room = gameRooms[code];
    if (!room || !room.selections) return;

    console.log(`[${code}] 관리자가 여왕의 만찬 결과를 적용합니다.`);

    const queenSelection = Object.values(room.selections).flat();
    const uniqueTargets = [...new Set(queenSelection)];

    uniqueTargets.forEach(targetId => {
      eliminatePlayer(code, targetId, 'queen_rampage');
    });

    const gameEnded = checkWinConditions(code);
    if (gameEnded) return;

    // --- ★★★ 핵심 수정 파트 ★★★ ---
    // 1. 만찬 이후의 모든 상태를 완벽하게 초기화합니다.
    delete room.pendingAction;
    delete room.rampageTriggered;
    delete room.queenActionTaken;
    delete room.selections;
    delete room.alienActionTriggered;
    delete room.crewActionTriggered;

    // 2. 게임 단계를 '탐사대 활동'으로 명확히 전환합니다.
    room.phase = 'night_crew_action';
    // --- ★★★ 여기까지가 수정된 부분입니다. ★★★

    broadcastUpdates(code);
  });

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
    room.timeLeft = 90; // 

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
      // ★★★ 핵심 수정: 선택 정보를 덮어쓰지 않고, selectorId를 키로 저장합니다.
      if (targetId) {
        // targetId가 null이면 선택 취소, 아니면 선택
        room.selections[selectorId] = targetId;
      } else {
        // 선택 취소 시 해당 플레이어의 선택만 제거
        delete room.selections[selectorId];
      }
      broadcastAlienSelections(roomCode);
    }
  });

  socket.on('alienActionFinished', () => {
    const selectorId = socket.id;
    let roomCode = '';
    for (const code in gameRooms) {
      if (gameRooms[code].players.some(p => p.id === selectorId)) { roomCode = code; break; }
    }

    if (roomCode) {
      const room = gameRooms[roomCode];
      if (!room || !room.alienActionsConfirmed || room.alienActionsConfirmed.includes(selectorId)) return;

      io.to(selectorId).emit('actionConfirmed'); // 행동을 완료한 플레이어에게 즉시 피드백

      room.alienActionsConfirmed.push(selectorId);
      checkAllAlienActionsComplete(roomCode);
    }
  });

  socket.on('resolveNightActions', (data) => {
    const { code } = data;
    const room = gameRooms[code];
    if (!room) return;

    // ★★★ 추가: 100% 미션 보상(포식 1회 저지) 적용 로직 ★★★
    if (room.alienAttackBlocked && room.selections) {
      // 1. 역할이 '에일리언'인 플레이어의 선택만 모두 수집합니다.
      const alienSelectors = [];
      for (const selectorId in room.selections) {
        const selector = room.players.find(p => p.id === selectorId);
        // 여왕의 '사냥' 등은 제외하고, 순수 '에일리언'의 '포식'만 대상으로 합니다.
        if (selector && selector.role === '에일리언' && !Array.isArray(room.selections[selectorId])) {
          alienSelectors.push(selectorId);
        }
      }

      // 2. 포식을 시도한 에일리언이 있다면, 그중 랜덤으로 1명을 고릅니다.
      if (alienSelectors.length > 0) {
        const randomIndex = Math.floor(Math.random() * alienSelectors.length);
        const blockedSelectorId = alienSelectors[randomIndex];

        // 3. 랜덤으로 선택된 1명의 선택(공격)을 무효화합니다.
        delete room.selections[blockedSelectorId];

        room.gameLog.unshift({ text: '[탐사대]의 결의가 에일리언의 포식을 1회 저지했습니다.', type: 'mission_buff' });
      }

      // 4. 버프는 1회용이므로 사용 후 즉시 플래그를 해제합니다.
      room.alienAttackBlocked = false;
    }
    // ★★★ 여기까지 ★★★

    if (room.selections) {
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
      uniqueTargets.forEach(targetId => {
        eliminatePlayer(code, targetId, 'alien_kill');
      });
    }

    const gameEnded = checkWinConditions(code);
    if (gameEnded) return;

    if (room.pendingAction === 'queen_rampage') {
      delete room.pendingAction;
      delete room.rampageTriggered;
    }

    delete room.alienActionTriggered;
    delete room.selections; // ★★★ 추가: 선택 기록 삭제

    room.phase = 'night_crew_action';
    startCrewActionPhase(code); // ★★★ 변경: broadcast 대신 새 함수 호출
  });

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

  // ★★★ 기존 startEscapeSequence 함수를 이 코드로 교체해주세요. ★★★
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
    // ★★★ 수정: 불필요하고 혼란을 주던 로그를 아래의 명확한 로그로 변경
    room.escapeLog.push(`>>> 관리자는 [관문 1단계 확인] 버튼을 눌러 다음 검사를 진행하세요.`);

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

  // ★★★ 기존 resolveEscapeStep 함수 전체를 아래 코드로 교체해주세요. ★★★
  socket.on('resolveEscapeStep', (data) => {
    const { code } = data;
    const room = gameRooms[code];
    if (!room || room.phase !== 'escape_sequence' || room.pendingAction === 'crisis_roulette') return;

    let resultMessage = '';
    let nextStep = room.escapeStep + 1;

    switch (room.escapeStep) {
      case 0: // 1관문: 뚱이 체크
        const hasGlutton = room.escapees.some(p => p.role === '뚱이');
        if (hasGlutton) {
          room.escapeLog.push(">>> 치명적인 식량 약탈자 뚱이가 잠입된 것이 확인되었습니다.");
          broadcastUpdates(code);
          setTimeout(() => endGame(code, 'alien_win_glutton'), 4500);
          return; // 함수 즉시 종료
        } else {
          resultMessage = "[1차 관문 통과] 식량 창고는 안전합니다.";
        }
        break;

      case 1: // 2관문: 에일리언 체크
        const aliensOnBoard = room.escapees.filter(p => p.role.includes('에일리언'));
        const soldierOnBoard = room.escapees.some(p => p.role === '군인');
        if (aliensOnBoard.length > 0 && !soldierOnBoard) {
          resultMessage = "[2관문 위기] 군인 없이 에일리언이 잠입했습니다! 최후의 사투가 벌어집니다...";
          room.pendingAction = 'crisis_roulette';
          // ★★★ 수정: 미션 보너스 적용 ★★★
          let battleSuccessRate = 0.5; // 기본 50%
          if (room.missionBoard?.progress >= 0.7) battleSuccessRate += 0.20;
          else if (room.missionBoard?.progress >= 0.6) battleSuccessRate += 0.10;
          const isSuccess = Math.random() < battleSuccessRate; const crisisOptions = ['에일리언 퇴치', '탐사대 전멸'];
          room.crisis = { type: '최후의 사투', options: crisisOptions, result: isSuccess ? crisisOptions[0] : crisisOptions[1], failureEnding: 'alien_win_escape_aliens' };
          room.escapeLog.push(`>>> ${resultMessage}`);
          return broadcastUpdates(code); // ★★★ 상태 설정 후 즉시 종료 ★★★
        } else if (aliensOnBoard.length > 0 && soldierOnBoard) {
          resultMessage = "[2관문 통과] 에일리언이 잠입했으나, 용맹한 군인의 활약으로 처치했습니다!";
        } else {
          resultMessage = "[2관문 통과] 에일리언의 잠입은 없었습니다.";
        }
        break;

      case 2: // 3관문: 의사 체크
        const doctorOnBoard = room.escapees.some(p => p.role === '의사');

        if (!doctorOnBoard) { // 의사가 없으면 100% 확률로 위기 발생
          resultMessage = "[3관문 위기] 캡슐에 의사가 없어 역병이 창궐했습니다! 룰렛으로 생존자를 결정합니다.";
          room.pendingAction = 'crisis_roulette';
          let plagueSuccessRate = 0.5; // 기본 50%
          if (room.missionBoard?.progress >= 0.7) plagueSuccessRate += 0.20;
          else if (room.missionBoard?.progress >= 0.6) plagueSuccessRate += 0.10;
          const isSuccess = Math.random() < plagueSuccessRate;
          const crisisOptions = ['면역력 승리', '탐사대 전멸'];
          room.crisis = { type: '역병 창궐', options: crisisOptions, result: isSuccess ? crisisOptions[0] : crisisOptions[1], failureEnding: 'alien_win_escape_plague' };
          room.escapeLog.push(`>>> ${resultMessage}`);
          return broadcastUpdates(code);
        } else { // 의사가 있으면 100% 확률로 통과
          resultMessage = "[3관문 통과] 다행히 캡슐에 유능한 의사가 있어 역병을 예방했습니다.";
        }
        break;

      case 3: // 4관문: 엔지니어 체크
        const engineerOnBoard = room.escapees.some(p => p.role === '엔지니어');

        if (!engineerOnBoard) { // 엔지니어가 없으면 100% 확률로 위기 발생
          resultMessage = "[4관문 위기] 캡슐에 치명적인 결함이 발생했습니다! 엔지니어가 없는 절망적인 상황... 하지만 잠재된 영웅이 기적을 만들 수 있을까요?";
          room.pendingAction = 'crisis_roulette';
          let repairSuccessRate = 0.5; // 기본 50%
          if (room.missionBoard?.progress >= 0.7) repairSuccessRate += 0.20;
          else if (room.missionBoard?.progress >= 0.6) repairSuccessRate += 0.10;
          const isSuccess = Math.random() < repairSuccessRate; const crisisOptions = ['수리 성공', '수리 실패'];
          room.crisis = { type: '치명적인 캡슐 결함', options: crisisOptions, result: isSuccess ? crisisOptions[0] : crisisOptions[1], failureEnding: 'alien_win_escape_malfunction' };
          room.escapeLog.push(`>>> ${resultMessage}`);
          return broadcastUpdates(code);
        } else { // 엔지니어가 있으면 100% 확률로 통과
          resultMessage = "[4관문 통과] 엔지니어의 점검 결과, 캡슐은 아무 이상 없었습니다.";
        }
        break;

      case 4: // 최종 관문 통과
        resolveEscapeEnding(code);
        return;
    }

    room.escapeStep = nextStep;
    room.escapeLog.push(`>>> ${resultMessage}`);
    if (nextStep < 4) { // 마지막 단계가 아닐 때만 다음 단계 안내 메시지 추가
      room.escapeLog.push(`>>> 관리자는 [관문 ${nextStep + 1}단계 확인] 버튼을 눌러주세요.`);
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

  // ★★★ 기존 startCrisisRoulette 함수를 이 코드로 교체해주세요. ★★★
  socket.on('startCrisisRoulette', (data) => {
    const { roomCode } = data;
    const room = gameRooms[roomCode];
    if (!room || !room.crisis) return;

    const { type, options, result, failureEnding } = room.crisis;
    const isSuccess = result === options[0];

    const ROULETTE_DURATION = 3000;
    const VIEW_DURATION = 1500;
    const HIDE_DELAY = ROULETTE_DURATION + VIEW_DURATION;

    io.to(roomCode).emit('showRoulette', {
      title: type,
      options: options.map(opt => ({ front: '?', back: opt })),
    });

    setTimeout(() => {
      io.to(roomCode).emit('rouletteResult', { result: result });
    }, ROULETTE_DURATION);

    setTimeout(() => {
      io.to(roomCode).emit('hideRoulette');

      delete room.pendingAction;
      delete room.crisis;

      if (!isSuccess) {
        endGame(roomCode, failureEnding);
      } else {
        // ★★★ 핵심 수정: 위기 종류에 따라 다른 성공 메시지를 출력합니다. ★★★
        if (type === '치명적인 캡슐 결함') {
          room.escapeLog.push(">>> 기적이 일어났습니다! 평소 기계 만지기를 좋아했던 일반 승객이 필사적인 노력 끝에 캡슐을 수리하는 데 성공했습니다! 모두가 그를 영웅으로 부릅니다.");
        } else {
          // 기존의 다른 위기 상황들을 위한 기본 성공 메시지
          room.escapeLog.push(`>>> [위기 극복] 탐사대는 ${type}에서 살아남았습니다!`);
        }

        // 룰렛 성공 후 다음 단계로 진행
        room.escapeStep += 1;
        const nextStep = room.escapeStep;
        // 4관문(step:3) 통과 시 최종 성공이므로 다음 단계 안내는 필요 없음
        if (nextStep < 4) {
          room.escapeLog.push(`>>> 관리자는 [관문 ${nextStep + 1}단계 확인] 버튼을 눌러주세요.`);
        }
        broadcastUpdates(roomCode);
      }
    }, HIDE_DELAY);
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

      if (room && queen && queen.role === '에일리언 여왕' && !queen.abilityUsed && targetIds) {
        // 여왕의 선택을 서버에 기록합니다.
        room.selections[selectorId] = targetIds;

        // 관리자에게 로그를 남깁니다.
        if (room.gameLog) {
          const targetNames = targetIds.map(id => room.players.find(p => p.id === id)?.name).join(', ');
          room.gameLog.unshift({ text: `[시스템] 에일리언 여왕이 [사냥] 능력으로 ${targetNames}을(를) 선택했습니다.`, type: 'log' });
        }

        // ★★★ 핵심 수정 ★★★
        // 여왕의 행동은 '활동 완료'로 간주하지 않고, 턴 종료를 확인하지 않습니다.
        // 그냥 여왕의 화면만 업데이트하고, 다른 에일리언들이 이 선택을 볼 수 있게 합니다.
        io.to(selectorId).emit('actionConfirmed'); // 여왕에게 선택이 완료되었음을 알림
        broadcastAlienSelections(roomCode);     // 다른 에일리언에게 선택 현황 공유
        broadcastUpdates(roomCode);              // 관리자 화면 업데이트
      }
    }
  });

  socket.on('skipQueenHunt', () => {
    const selectorId = socket.id;
    let roomCode = '';
    for (const code in gameRooms) {
      if (gameRooms[code].players.some(p => p.id === selectorId)) { roomCode = code; break; }
    }

    if (roomCode) {
      const room = gameRooms[roomCode];
      const queen = room.players.find(p => p.id === socket.id);
      if (room && queen && queen.role === '에일리언 여왕' && !queen.abilityUsed) {

        io.to(selectorId).emit('actionConfirmed'); // 여왕에게 즉시 피드백

        // 여왕이 행동을 '완료'했음을 기록하고, 턴 종료 여부를 확인합니다.
        if (!room.alienActionsConfirmed.includes(selectorId)) {
          room.alienActionsConfirmed.push(selectorId);
        }
        checkAllAlienActionsComplete(roomCode);
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

  // 수정 후 코드
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

      if (room && queen && queen.role === '에일리언 여왕' && !queen.abilityUsed && targetIds) {
        // ★★★ 핵심: 능력 사용 기록을 다시 추가합니다. ★★★
        queen.abilityUsed = true;
        room.selections[selectorId] = targetIds;

        if (room.gameLog) {
          const targetNames = targetIds.map(id => room.players.find(p => p.id === id)?.name).join(', ');
          room.gameLog.unshift({ text: `[시스템] 에일리언 여왕이 [사냥] 능력으로 ${targetNames}을(를) 선택했습니다.`, type: 'log' });
        }

        // 여왕에게만 행동 완료 피드백을 보내고, 턴 종료는 확인하지 않습니다.
        io.to(selectorId).emit('actionConfirmed');
        broadcastAlienSelections(roomCode);
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

    const room = gameRooms[roomCode];

    if (room.missionBoard && room.missionBoard.progress >= 0.8) {
      console.log(`[${roomCode}] Queen's Rampage cancelled by mission success (Progress: ${room.missionBoard.progress * 100}%)`);
      room.missionBoard.progress = 0;
      io.to(roomCode).emit('globalAlert', {
        title: "미션 성공!",
        message: `탐사대가 미션의 80% 이상을 해결하여 여왕의 광란을 잠재웠습니다! 위기는 일단 지나갔습니다.`
      });
      delete room.pendingAction;
      broadcastUpdates(roomCode);
    } else {
      // ★★★ 수정: 여기에 로그 추가 ★★★
      if (room.gameLog) {
        room.gameLog.unshift({ text: '엔지니어가 [계속 싸운다]를 선택했습니다. 여왕의 만찬이 시작됩니다.', type: 'phase_change' });
      }
      console.log(`[${roomCode}] 엔지니어가 싸움을 선택했습니다. 여왕의 만찬을 준비합니다.`);
      room.pendingAction = 'queen_rampage';
      io.to(roomCode).emit('feastAnnounced');
      broadcastUpdates(roomCode);
    }
  });

  socket.on('engineerChoseEscape', () => {
    let roomCode = '';
    for (const code in gameRooms) {
      if (gameRooms[code].players.some(p => p.id === socket.id)) { roomCode = code; break; }
    }
    if (!roomCode) return;

    const room = gameRooms[roomCode];
    console.log(`[${roomCode}] 엔지니어가 비상탈출을 선택했습니다.`);

    // ★★★ 수정: 여기에 로그 추가 ★★★
    if (room.gameLog) {
      room.gameLog.unshift({ text: '[시스템] 엔지니어가 [비상탈출캡슐]을 가동하기로 선택했습니다.', type: 'phase_change' });
    }

    const livingPlayers = room.players.filter(p => p.status === 'alive');
    if (livingPlayers.length < 4) {
      console.log(`[${roomCode}] 생존자가 4명 미만이라 비상탈출이 불가능합니다.`);
      const detailLog = `생존 인원이 4명보다 적어 비상탈출 캡슐을 가동할 수 없습니다.`;
      endGame(roomCode, 'alien_win_escape_malfunction', detailLog);
      return;
    }

    room.pendingAction = 'escape_survivor_selection';
    broadcastUpdates(roomCode);
  });

  socket.on('useAlienEggAbility', () => {
    const selectorId = socket.id;
    let roomCode = '';
    for (const code in gameRooms) {
      if (gameRooms[code].players.some(p => p.id === selectorId)) { roomCode = code; break; }
    }
    if (!roomCode) return;

    const room = gameRooms[roomCode];
    const alienEgg = room.players.find(p => p.id === selectorId);

    if (!alienEgg || alienEgg.role !== '에일리언 알' || room.day !== 2 || alienEgg.abilityUsed) {
      return;
    }

    alienEgg.abilityUsed = true;
    const isHatch = Math.random() < 0.5;
    const result = isHatch ? '부화' : '오염';
    const ROULETTE_DURATION = 3000;
    const VIEW_DURATION = 1500;

    io.to(roomCode).emit('showRoulette', {
      title: '에일리언 알 부화 시퀀스',
      options: [{ front: '?', back: '부화' }, { front: '?', back: '오염' }],
    });

    setTimeout(() => {
      io.to(roomCode).emit('rouletteResult', { result: result });
    }, ROULETTE_DURATION);

    setTimeout(() => {
      if (isHatch) {
        console.log(`[${roomCode}] Alien Egg hatched successfully.`);
        alienEgg.role = '에일리언';
        alienEgg.description = ROLE_DESCRIPTIONS['에일리언'];
        if (room.gameLog) room.gameLog.unshift(`[에일리언 알]이 부화했습니다. 우리 중에 에일리언이 하나 더 있습니다.`);
      } else { // [오염] 발생 시
        console.log(`[${roomCode}] Alien Egg CONTAMINATED the group.`);
        if (alienEgg.group) {
          // ★★★ 핵심 수정: 자기 자신을 제외하는 조건을 삭제하여 '알'도 사망자에 포함시킵니다. ★★★
          const playersToEliminate = room.players.filter(p =>
            p.status === 'alive' &&
            p.group === alienEgg.group &&
            p.role !== '에일리언' &&
            p.role !== '에일리언 여왕'
            // p.id !== alienEgg.id  <- 이 줄이 삭제되었습니다.
          );

          const deadNames = playersToEliminate.map(p => p.name).join(', ');
          if (room.gameLog) room.gameLog.unshift(`[에일리언 알]이 오염되었습니다. ${deadNames} 사망.`);
          playersToEliminate.forEach(player => {
            eliminatePlayer(roomCode, player.id, 'egg_contamination');
          });
        }
      }
      broadcastUpdates(roomCode);
    }, ROULETTE_DURATION + VIEW_DURATION);
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
        if (room.gameLog) room.gameLog.unshift(`[수다쟁이]가 ${target.name}님의 정체를 폭로했습니다!`);
        console.log(`[${roomCode}] Chatterbox ${chatterbox.name} revealed ${target.name}'s role as ${target.role}.`);

        // 능력 사용이 완료되었음을 클라이언트에 알림
        io.to(selectorId).emit('actionConfirmed');

        // 변경된 상태를 모든 클라이언트에 전파
        broadcastUpdates(roomCode);
      }
    }
  });

  // index.js의 usePsychicAbility 핸들러

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

    if (!Array.isArray(targetIds) || targetIds.length < 1 || targetIds.length > 4) {
      console.error(`[${roomCode}] Invalid psychic target count: ${targetIds.length}`);
      return;
    }

    if (!psychic || psychic.role !== '초능력자' || psychic.abilityUsed) return;
    if (!psychic.group) return io.to(selectorId).emit('abilityError', '모둠을 먼저 선택해야 능력을 사용할 수 있습니다.');

    psychic.abilityUsed = true;

    // ★★★ 수정: 선택한 대상 수에 따라 성공 확률을 다르게 설정 ★★★
    let successRate = 0;
    switch (targetIds.length) {
      case 1: successRate = 1.0; break; // 100%
      case 2: successRate = 0.8; break; // 80%
      case 3: successRate = 0.6; break; // 60%
      case 4: successRate = 0.5; break; // 50%
    }

    if (room.missionBoard && room.missionBoard.progress >= 0.5) {
      successRate += 0.15;
    }
    const isSuccess = Math.random() < successRate;
    // ★★★ 여기까지 ★★★

    const result = isSuccess ? '성공' : '실패';
    const ROULETTE_DURATION = 4000;
    const VIEW_DURATION = 1500;

    io.to(roomCode).emit('showRoulette', {
      title: '초능력 판정',
      options: [{ front: '?', back: '성공' }, { front: '?', back: '실패' }],
    });

    setTimeout(() => {
      io.to(roomCode).emit('rouletteResult', { result: result });
    }, ROULETTE_DURATION);

    setTimeout(() => {
      // 성공 또는 실패 로직 적용
      if (isSuccess) {
        const targetNames = targetIds.map(id => {
          const p = room.players.find(p => p.id === id);
          return p ? p.name : '';
        }).filter(Boolean).join(', ');

        // ★★★ 로그 메시지를 이름이 포함되도록 수정 ★★★
        if (room.gameLog) room.gameLog.unshift(`[초능력자]가 ${targetNames}님의 정체를 꿰뚫어보는 데 성공했습니다.`); targetIds.forEach(targetId => {
          const target = room.players.find(p => p.id === targetId);
          if (target) {
            target.revealedRole = target.role;
            target.revealedBy = 'psychic';
          }
        });
      } else {
        const psychicGroup = room.players.filter(p => p.status === 'alive' && p.group === psychic.group);
        const psychicIndex = psychicGroup.findIndex(p => p.id === psychic.id);

        if (psychicIndex !== -1) {
          const playersToEliminate = new Set([psychic.id]);
          if (psychicGroup.length > 1) {
            playersToEliminate.add(psychicGroup[(psychicIndex - 1 + psychicGroup.length) % psychicGroup.length].id);
            playersToEliminate.add(psychicGroup[(psychicIndex + 1) % psychicGroup.length].id);
          }

          // ★★★ 사망자 이름으로 로그를 만들기 위해 아래 코드 추가 ★★★
          const deadNames = Array.from(playersToEliminate).map(id => {
            const p = room.players.find(p => p.id === id);
            return p ? p.name : '';
          }).filter(Boolean).join(', ');

          if (room.gameLog) room.gameLog.unshift(`[초능력자]가 에너지를 제어하지 못하고 폭주하여 ${deadNames}님이 사망했습니다.`);
          playersToEliminate.forEach(playerId => eliminatePlayer(roomCode, playerId, 'psychic_fail'));
        }
      }
      broadcastUpdates(roomCode);
    }, ROULETTE_DURATION + VIEW_DURATION);
  });

  socket.on('endNightAndStartMeeting', (data) => {
    const { code } = data;
    const room = gameRooms[code];
    if (!room) return;

    room.dailyMissionSolves = {};
    room.day += 1;
    room.phase = 'meeting';

    if (room.gameLog) {
      room.gameLog.unshift({ text: `[${room.day}일차 회의 시작]`, type: 'phase_change' });
    }

    // 밤 단계와 관련된 모든 상태를 여기서 다시 한번 초기화합니다.
    delete room.selections;
    delete room.alienActionTriggered;
    delete room.crewActionTriggered;

    if (room.settings.useEjectionMinigame) {
      room.ejectionState = 'pending_start';
      room.ejectionVotes = {};
      room.ejectionNominations = {};
      room.ejectionMinigame = {};
    }

    const gameEnded = checkSpecialVictoryConditions(code);
    if (gameEnded) {
      return;
    }

    if (room.day > 1) {
      room.needsGroupSelection = true;
      room.players.forEach(p => {
        if (p.status === 'alive') {
          delete p.group;
        }
      });
    }
    broadcastUpdates(code);
  });

  socket.on('missionError', (message) => {
    alert(message);
  });

  socket.on('submitMissionAnswer', (data) => {
    const { problemIndex, answer } = data;
    const playerId = socket.id;
    let roomCode = '';
    for (const code in gameRooms) {
      if (gameRooms[code].players.some(p => p.id === playerId)) { roomCode = code; break; }
    }

    if (roomCode) {
      const room = gameRooms[roomCode];
      const player = room.players.find(p => p.id === playerId);
      if (!room.missionBoard) return;
      const problem = room.missionBoard.problems[problemIndex];

      if (!player || !problem || problem.status !== 'unsolved') return;

      // ★★★ 수정된 부분 1: 도전 기회 확인 및 즉시 차감 ★★★
      const attemptedCount = room.dailyMissionSolves[playerId] || 0;
      if (attemptedCount >= 1) {
        return socket.emit('missionError', '오늘은 이미 미션에 도전했습니다. 내일을 기다려주세요!');
      }

      // 정답 확인 전에 도전 횟수를 먼저 기록하여 기회를 차감합니다.
      room.dailyMissionSolves[playerId] = attemptedCount + 1;
      // ★★★ 여기까지 ★★★

      const isCorrect = answer.trim().toLowerCase() === problem.answer.trim().toLowerCase();

      if (isCorrect) {
        problem.status = 'solved';
        problem.solvedBy = player.name;
        // 여기서 도전 횟수를 올리던 기존 코드는 삭제되었습니다.
      } else {
        problem.status = 'failed';
        problem.failedBy = player.name;
      }

      const oldProgress = room.missionBoard.progress || 0;
      const totalSolved = room.missionBoard.problems.filter(p => p.status === 'solved').length;
      const totalProblems = room.missionBoard.problems.length;
      room.missionBoard.progress = totalProblems > 0 ? (totalSolved / totalProblems) : 0;
      const newProgress = room.missionBoard.progress;

      const milestones = [
        { progress: 0.5, message: '[50%] 탐사대의 사기가 증가했습니다. [초능력자] 능력 판정 확률이 15% 증가합니다.' },
        { progress: 0.6, message: '[60%] 탐사대의 지성이 증가했습니다. [비상탈출] 위기 극복 확률이 10% 증가합니다.' },
        { progress: 0.7, message: '[70%] 탐사대의 손재주가 증가했습니다. [비상탈출] 위기 극복 확률이 추가로 10% 더 증가합니다. (총 20%)' },
        { progress: 0.8, message: '[80%] 탐사대의 의지가 증가했습니다. 함장 사망 시 [여왕의 만찬]을 저지합니다.' },
        { progress: 0.9, message: '[90%] 탐사대의 결의가 극에 달합니다. 에일리언의 다음 [포식]을 1회 저지합니다.' }
      ];

      milestones.forEach(ms => {
        if (oldProgress < ms.progress && newProgress >= ms.progress) {
          room.gameLog.unshift({ text: ms.message, type: 'mission_buff' });
          if (ms.progress === 1.0) {
            room.alienAttackBlocked = true;
          }
        }
      });

      console.log(`[${roomCode}] Mission Progress: ${totalSolved}/${totalProblems} (${(newProgress * 100).toFixed(0)}%)`);
      broadcastUpdates(roomCode);
    }
  });
});

server.listen(PORT, () => {
  console.log(`서버가 ${PORT}번 포트에서 실행 중입니다.`);
});