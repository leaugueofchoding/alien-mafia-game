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
  '의사': '탐사대 활동 시 1명을 지목합니다. 생존 의사 2명 이상이 같은 대상을 지목하면 당일 밤 에일리언 포식에서 면역됩니다. 처음 시작한 의사 전원 생존 시 의학 승리!',
  '초능력자': '단 한 번, 4명의 정체를 [꿰뚫어보기]할 수 있습니다. 실패 시 부작용이 있습니다.',
  '수다쟁이': '매일 한 명의 정체를 익명으로 [폭로하기]합니다.',
  '뚱이': '탐사대의 빌런입니다. 비상탈출 시 식량을 모두 [호로록!] 먹어 치웁니다.',
  '신의 사도': '죽지 않고 4일간 기도에 성공하면 탐사대를 [구원]합니다.',
  '군인': '1발의 총알로 의심되는 참가자 한 명을 [저격]하여 탈락시킬 수 있습니다.',
  '일반 승객': '특별한 능력은 없지만, 투표를 통해 진실을 밝혀내야 합니다.',
  '경호원': '플레이어 한 명을 지정하여 다음 날 아침까지 이어지는 모든 공격으로부터 보호합니다. 경호 대상이 공격당하면 경호원이 대신 희생됩니다.',
  '에일리언 주술사': '매일 밤 탐사대원 한 명의 능력을 무력화시킵니다. 공격 능력은 없습니다.'
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
  medical_victory: {
    winner: '탐사대 (의학 승리)',
    reason: '처음 탑승했던 의사 전원이 끝까지 생존했습니다! 의료진의 헌신으로 우주선을 지켜냈습니다.',
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
// ── 로그 추가 헬퍼 (중복 방지) ──
function addLog(room, text, type = 'log') {
  if (!room.gameLog) room.gameLog = [];
  // 직전 로그와 동일한 텍스트면 중복 추가 방지
  const last = room.gameLog[0];
  const lastText = typeof last === 'string' ? last : last?.text;
  if (lastText === text) return;
  room.gameLog.unshift({ text, type });
}

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

  // 2. 4.5초 후, 역할 공개 + 주효 플레이 포함한 최종 게임 오버 화면 전송
  setTimeout(() => {
    const rolesPayload = room.players.map(p => ({ name: p.name, role: p.role || '역할 미정', status: p.status, causeOfDeath: p.causeOfDeath || null }));
    const gameOverPayload = {
      winner: ending.winner,
      reason: ending.reason,
      detailLog: detailLog,
      roles: rolesPayload,
      notablePlays: room.notablePlays || []
    };
    io.to(roomCode).emit('gameOver', gameOverPayload);
    broadcastUpdates(roomCode);
  }, 4500);
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
  // Q5: 방출 미니게임 완료 후 순서: 탐사대 활동 → 에일리언 활동
  const room = gameRooms[roomCode];
  if (!room) return;

  // 미니게임 관련 상태 초기화
  delete room.ejectionState;
  delete room.ejectionVotes;
  delete room.ejectionNominations;
  delete room.ejectionMinigame;

  // Q5: 탐사대 활동을 먼저 시작
  room.phase = 'night_crew_action';
  room.crewActionTriggered = false;
  delete room.alienActionTriggered;
  delete room.alienActionsConfirmed;
  delete room.selections;
  delete room.bodyguardProtection;
  delete room.medicalProtectionTarget;
  delete room.doctorProtections;
  delete room.shamanBlockedPlayers;

  if (room.gameLog) room.gameLog.unshift({ text: '[' + room.day + '일차 밤 1단계] 탐사대 활동 시작', type: 'phase_change' });

  startCrewActionPhase(roomCode);
  broadcastUpdates(roomCode);
}

// 기존 checkAllAlienActionsComplete 함수를 아래 코드로 통째로 교체해주세요.
function checkAllAlienActionsComplete(roomCode) {
  const room = gameRooms[roomCode];
  if (!room || !room.alienActionsConfirmed) return;

  const livingAliens = room.players.filter(p => p.status === 'alive' && p.role.includes('에일리언'));

  // ★★★ 핵심 수정: 주술사까지 포함하여 활동해야 할 에일리언 수를 계산 ★★★
  // 1. 공격 능력이 있는 에일리언 수를 계산합니다.
  // 여왕의 만찬 진행 중이면 여왕은 행동 완료로 간주
  const queenRampageActive = room.pendingAction === 'queen_rampage' || room.queenRampageStarted;
  const attackingAliens = livingAliens.filter(p => {
    if (p.role === '에일리언 여왕') return !p.abilityUsed && !queenRampageActive;
    return p.role === '에일리언';
  });
  let requiredActionCount = attackingAliens.length;

  // 2. 살아있는 주술사가 있다면, 필요한 행동 수에 1을 더합니다.
  const shaman = livingAliens.find(p => p.role === '에일리언 주술사');
  if (shaman) {
    requiredActionCount++;
  }
  // ★★★ 여기까지 수정 ★★★

  console.log(`[${roomCode}] 활동 완료 확인 중... (완료: ${room.alienActionsConfirmed.length} / 필요: ${requiredActionCount})`);

  if (room.alienActionsConfirmed.length >= requiredActionCount) {
    if (room.gameLog) {
      room.gameLog.unshift({ text: '[시스템] 에일리언이 사냥감 선택을 마쳤습니다. (자동 진행)', type: 'log' });
    }
    livingAliens.forEach(alien => {
      io.to(alien.id).emit('actionConfirmed');
    });
    // ★ Q5: 에일리언 전원 완료 시 자동으로 결과 반영
    room.alienActionTriggered = true;
    // BUG1+2 FIX: 에일리언 타이머 즉시 중단 (resolve 후 중복 호출 방지)
    const aTimerKey = roomCode + '_alien';
    if (timerIntervals[aTimerKey]) {
      clearInterval(timerIntervals[aTimerKey]);
      delete timerIntervals[aTimerKey];
    }
    broadcastUpdates(roomCode);
    // 짧은 딜레이 후 자동 resolveNight
    // Q5: 1.5초 후 자동 resolve → goToMorning
    setTimeout(() => {
      const r2 = gameRooms[roomCode];
      if (!r2 || r2.phase !== 'night_alien_action') return;
      resolveNightActionsInternal(roomCode);
    }, 1500);
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

// eliminatePlayer 함수를 찾아 아래 코드로 통째로 교체해주세요.

function eliminatePlayer(roomCode, playerId, cause = 'unknown', broadcast = true) {
  const room = gameRooms[roomCode];
  if (!room) return false;

  // ★★★ 핵심 수정: '살아있는' 경호원을 찾도록 로직 변경 ★★★
  const protectionTargetId = room.bodyguardProtection;
  if (protectionTargetId && playerId === protectionTargetId) {
    // 살아있는 경호원을 찾습니다.
    const aliveBodyguard = room.players.find(p => p.role === '경호원' && p.status === 'alive');

    if (aliveBodyguard) { // 살아있는 경호원이 있다면
      const protectedPlayer = room.players.find(p => p.id === playerId);
      if (protectedPlayer) {
        if (room.gameLog) {
          room.gameLog.unshift({ text: `[경호원]이(가) ${protectedPlayer.name}님을 지키고 대신 희생했습니다.`, type: 'log' });
        }
      }

      // 보호 효과는 사용되었으므로 즉시 삭제
      delete room.bodyguardProtection;

      // 살아있는 경호원 본인을 'bodyguard_sacrifice' 원인으로 제거합니다.
      aliveBodyguard.status = 'dead';
      aliveBodyguard.causeOfDeath = 'bodyguard_sacrifice';
      io.to(aliveBodyguard.id).emit('youAreDead');

      // 승리 조건 확인 등 후속 처리
      const gameEndedBySacrifice = checkWinConditions(roomCode);
      if (gameEndedBySacrifice) return true;

      if (broadcast) {
        broadcastUpdates(roomCode);
      }
      return true; // 원래 대상의 제거는 여기서 중단됩니다.
    }
  }

  // --- 아래는 보호받지 않는 경우의 기존 코드입니다 ---
  const player = room.players.find(p => p.id === playerId);

  if (player && player.status !== 'dead') {
    player.status = 'dead';
    player.causeOfDeath = cause;
    // ── notable play: 개인 관점 ──────────────────────────────────────
    // 기준: 자기 팀 승리에 기여 → best(주효) / 자기 팀에 손해 → worst(아쉬움)
    if (room.notablePlays) {
      const isAlienTeam = player.role && player.role.includes('에일리언');
      const isCoreTarget = ['함장', '엔지니어'].includes(player.role);
      const isAlienQueen = player.role === '에일리언 여왕';

      // ── 에일리언 포식(alien_kill) ──────────────────────────────────
      if (cause === 'alien_kill') {
        if (isCoreTarget) {
          // 에일리언: 함장/엔지니어 포식 성공 → best
          room.notablePlays.push({
            type: 'best',
            text: '에일리언이 ' + player.name + '(' + player.role + ')님을 포식했습니다.'
          });
        }
        // 일반 탐사대원 포식은 기록하지 않음 (평범한 포식)
      }

      // ── 여왕의 만찬(queen_rampage) ─────────────────────────────────
      if (cause === 'queen_rampage') {
        if (isCoreTarget || player.role === '경호원') {
          // 에일리언 여왕: 핵심 인물/경호원 제거 → best
          room.notablePlays.push({
            type: 'best',
            text: '에일리언 여왕이 만찬으로 ' + player.name + '(' + player.role + ')님을 제거했습니다.'
          });
        }
      }

      // 방출 미니게임: notable 미기재 (요청에 따라)

      // ── 폭주/오염(psychic_fail / egg_contamination) ───────────────
      if (cause === 'psychic_fail' || cause === 'egg_contamination') {
        const causeName = cause === 'psychic_fail' ? '초능력자 폭주' : '에일리언 알 오염';
        if (isAlienQueen || isAlienTeam) {
          // 탐사대: 에일리언 폭주/오염 사망 → best
          room.notablePlays.push({
            type: 'best',
            text: player.name + '(' + player.role + ')님이 ' + causeName + '으로 사망했습니다.'
          });
        } else if (isCoreTarget) {
          // 탐사대: 핵심 아군 사망 → worst / 초능력자·알 입장: 아군 피해 → worst
          room.notablePlays.push({
            type: 'worst',
            text: causeName + '으로 ' + player.name + '(' + player.role + ')님이 사망했습니다.'
          });
        }
      }
    }
    // ── 경호원 희생 → resolveNightActionsInternal에서 처리
    // ── 함장/군인 처형 → useCaptainAbility/useSoldierAbility에서 처리
    // ── 수다쟁이/초능력자 능력 → 각 핸들러에서 처리
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
      'ejected_minigame': `[방출 미니게임] 결과, ${targetName}님이 함선 외부로 방출되었습니다.`,
      'vaccine_overdose': `⚠️ [과다 투약] ${targetName}님이 백신 과다 투약으로 사망했습니다.`
    };
    if (causeMap[cause]) {
      addLog(room, causeMap[cause], 'log');
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

    if (broadcast) {
      broadcastUpdates(roomCode);
    }
    return true;
  }
  return false;
}

// ── resolveNightActionsInternal: 자동/수동 양쪽에서 호출 ──────────────
function resolveNightActionsInternal(roomCode) {
  const room = gameRooms[roomCode];
  if (!room || room.phase !== 'night_alien_action') return;
  // BUG1 FIX: 혹시 남아있는 에일리언 타이머 정리 (중복 호출 방지)
  const _aKey = roomCode + '_alien';
  if (timerIntervals[_aKey]) { clearInterval(timerIntervals[_aKey]); delete timerIntervals[_aKey]; }

  if (room.selections) {
    let targetsToEliminate = new Set();
    for (const selectorId in room.selections) {
      const selector = room.players.find(p => p.id === selectorId);
      if (selector && selector.role === '에일리언 주술사') continue;
      const selection = room.selections[selectorId];
      if (Array.isArray(selection)) {
        selection.forEach(id => targetsToEliminate.add(id));
      } else {
        targetsToEliminate.add(selection);
      }
    }
    // 수정 3-나: 백신 2회 누적 기반 포식 저지
    if (room.medicalProtectionTarget && targetsToEliminate.has(room.medicalProtectionTarget)) {
      const immunePlayer = room.players.find(p => p.id === room.medicalProtectionTarget);
      targetsToEliminate.delete(room.medicalProtectionTarget);
      // 백신 2회 소비
      if (room.vaccineCount && room.vaccineCount[room.medicalProtectionTarget] >= 2) {
        room.vaccineCount[room.medicalProtectionTarget] -= 2;
      }
      if (immunePlayer) {
        if (room.gameLog) room.gameLog.unshift({ text: `💉 [의사 백신] ${immunePlayer.name}님이 에일리언 포식을 백신으로 저지하여 생존했습니다.`, type: 'log' });
        if (room.notablePlays) room.notablePlays.push({ type: 'best', text: `의사팀의 백신으로 ${immunePlayer.name}(${immunePlayer.role})님이 에일리언 포식에서 생존했습니다.` });
      }
    }
    delete room.medicalProtectionTarget;
    const uniqueTargets = Array.from(targetsToEliminate);
    const protectionTargetId = room.bodyguardProtection;

    // BUG7 FIX: 경호원 희생 후 경호원 자신이 별도 포식 대상이어도 이미 사망이므로 스킵
    const eliminatedByBodyguard = new Set();
    uniqueTargets.forEach(targetId => {
      if (protectionTargetId && targetId === protectionTargetId) {
        const bodyguard = room.players.find(p => p.role === '경호원' && p.status === 'alive');
        if (bodyguard) {
          const targetPlayer = room.players.find(p => p.id === targetId);
          if (targetPlayer) {
            if (room.gameLog) room.gameLog.unshift({ text: '[경호원]이(가) ' + targetPlayer.name + '님을 지키고 대신 희생했습니다.', type: 'log' });
            // 경호원: 함장/엔지니어 보호 시에만 주효 기재 (이름+역할 모두 표시)
            if (room.notablePlays && ['함장', '엔지니어'].includes(targetPlayer.role)) {
              room.notablePlays.push({ type: 'best', text: bodyguard.name + '(경호원)님이 ' + targetPlayer.name + '(' + targetPlayer.role + ')님을 대신해 희생했습니다.' });
            }
          }
          eliminatedByBodyguard.add(bodyguard.id);
          eliminatePlayer(roomCode, bodyguard.id, 'bodyguard_sacrifice');
        }
        // 경호 대상(함장 등)은 살아남음 → 스킵
      } else if (!eliminatedByBodyguard.has(targetId)) {
        // 경호원이 이미 희생돼서 사망한 경우 중복 제거 스킵
        const targetPlayer = room.players.find(p => p.id === targetId);
        if (targetPlayer && targetPlayer.status === 'alive') {
          eliminatePlayer(roomCode, targetId, 'alien_kill');
        }
      }
    });
  }

  const gameEnded = checkWinConditions(roomCode);
  if (gameEnded) return;

  // Q5: 에일리언 활동이 밤의 마지막 → 바로 다음날 morning 루틴
  goToMorning(roomCode);
}

// autoStartMinigame: minigame_pending 상태에서 미니게임 자동 시작 + 10초 타이머
function autoStartMinigame(roomCode) {
  const r2 = gameRooms[roomCode];
  if (!r2 || r2.ejectionState !== 'minigame_pending') return;
  const cands = Object.values(r2.ejectionNominations);
  if (cands.length === 0) return;
  const cnt = cands.length;
  // 카드 생성: 방출 1개 보장
  const ejIdx = Math.floor(Math.random() * cnt);
  const cards = cands.map((_, i) => ({ id: i, content: i === ejIdx ? '방출' : '생존' }));
  // shuffle
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  r2.ejectionMinigame = { candidates: cands, cards, selections: {}, results: null };
  r2.ejectionState = 'minigame_active';
  broadcastUpdates(roomCode);

  // 10초 타임아웃
  let mgLeft = 10;
  const mgKey = roomCode + '_minigame';
  if (timerIntervals[mgKey]) clearInterval(timerIntervals[mgKey]);
  io.to(roomCode).emit('timerUpdate', { roomCode, timeLeft: mgLeft, label: 'minigame' });
  io.to(ADMIN_ROOM).emit('timerUpdate', { roomCode, timeLeft: mgLeft, label: 'minigame' });
  timerIntervals[mgKey] = setInterval(() => {
    mgLeft--;
    io.to(roomCode).emit('timerUpdate', { roomCode, timeLeft: mgLeft, label: 'minigame' });
    io.to(ADMIN_ROOM).emit('timerUpdate', { roomCode, timeLeft: mgLeft, label: 'minigame' });
    if (mgLeft < 0) {
      clearInterval(timerIntervals[mgKey]);
      delete timerIntervals[mgKey];
      const r3 = gameRooms[roomCode];
      if (!r3 || !['minigame_active', 'minigame_all_selected'].includes(r3.ejectionState)) return;
      const mg = r3.ejectionMinigame;
      const usedIds = Object.values(mg.selections);
      const remaining = mg.cards.filter(c => !usedIds.includes(c.id));
      mg.candidates.forEach(cId => {
        if (mg.selections[cId] === undefined && remaining.length > 0) {
          const pick = remaining.splice(Math.floor(Math.random() * remaining.length), 1)[0];
          mg.selections[cId] = pick.id;
          io.to(cId).emit('cardSelectionConfirmed', { cardId: pick.id });
        }
      });
      r3.ejectionState = 'minigame_all_selected';
      broadcastUpdates(roomCode);
    }
  }, 1000);
}

// goToMorning: 밤 종료 후 다음날 meeting 세팅
function goToMorning(roomCode) {
  const room = gameRooms[roomCode];
  if (!room) return;
  room.day++;
  room.phase = 'meeting';
  room.ejectionState = 'pending_start';
  room.ejectionVotes = {};
  room.ejectionNominations = {};
  room.ejectionMinigame = {};
  delete room.alienActionTriggered;
  delete room.alienActionsConfirmed;
  delete room.queenRampageStarted;
  delete room.selections;
  if (room.gameLog) room.gameLog.unshift({ text: '[' + room.day + '일차 회의 시작]', type: 'phase_change' });
  // 1인 모둠 자동지목 초기화
  room.players.forEach(p => { if (p.status === 'alive') delete p.group; });
  room.needsGroupSelection = true;
  room.dailyMissionSolves = {};
  delete room.shamanBlockedPlayers;
  // 이전 타이머 정리
  const mk = roomCode + '_meeting';
  if (timerIntervals[mk]) { clearInterval(timerIntervals[mk]); delete timerIntervals[mk]; }
  const ak = roomCode + '_alien';
  if (timerIntervals[ak]) { clearInterval(timerIntervals[ak]); delete timerIntervals[ak]; }
  const gameEnded = checkSpecialVictoryConditions(roomCode);
  if (gameEnded) return;
  broadcastUpdates(roomCode);
}

// startCrewActionPhase 함수를 찾아 통째로 교체해주세요.
function startCrewActionPhase(roomCode) {
  const room = gameRooms[roomCode];
  if (!room) return;

  // ★★★ 핵심 수정: 이 시점에서 이전 턴의 보호 효과를 초기화합니다. ★★★
  delete room.bodyguardProtection;

  room.crewActionTriggered = true;
  if (room.gameLog) {
    room.gameLog.unshift({ text: `[탐사대 활동 시작]`, type: 'phase_change' });
  }

  const livingPlayers = room.players.filter(p => p.status === 'alive');

  // 각 역할에 맞는 능력 사용 이벤트를 명시적으로 전송합니다.
  // 의사 능력: 의사 1명이어도 접종 가능 (백신 누적 시스템)
  room.doctorProtections = {}; // 이번 밤 접종 기록 초기화 (vaccineCount는 누적 유지)
  const aliveDoctors = livingPlayers.filter(p => p.role === '의사');
  if (aliveDoctors.length >= 1) {
    aliveDoctors.forEach(doc => {
      io.to(doc.id).emit('doctorAction', { targets: livingPlayers.map(p => ({ id: p.id, name: p.name })) });
    });
  }

  const bodyguard = livingPlayers.find(p => p.role === '경호원');
  if (bodyguard) {
    const targets = livingPlayers.filter(p => p.id !== bodyguard.id);
    io.to(bodyguard.id).emit('bodyguardAction', { targets });
  }

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
      gameLog: [],
      autoMode: true,
      autoMeetingTime: 90,
      autoAlienTime: 60,
      notablePlays: []
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
    if (!gameRooms[code]) {
      socket.emit('joinFailed', '존재하지 않는 초대 코드입니다. 관리자에게 문의하세요.');
      return;
    }
    const room = gameRooms[code];
    // 게임 중 재접속 허용: 같은 이름으로 재연결 시 소켓 ID 업데이트
    if (room.status === 'playing') {
      const existing = room.players.find(p => p.name === name);
      if (existing) {
        existing.id = socket.id;
        socket.join(code);
        io.to(socket.id).emit('updateRoom', room);
        if (existing.role && existing.role.includes('에일리언')) broadcastAlienSelections(code);
        broadcastUpdates(code);
      } else {
        socket.emit('joinFailed', '이미 시작된 게임입니다. 올바른 이름+코드로 재접속하세요.');
      }
      return;
    }
    socket.join(code);
    const newPlayer = { id: socket.id, name: name, status: 'alive' };
    room.players.push(newPlayer);
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
    room.initialDoctorCount = room.players.filter(p => p.role === '의사').length;
    room.doctorProtections = {}; // {targetId: [doctorId, ...]}
    room.vaccineCount = {}; // {targetId: 누적 접종 횟수} — 수정 3-나
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
    if (!room) return;
    const player = room.players.find(p => p.id === playerId);
    if (!player) return;
    io.to(playerId).emit('joinFailed', '관리자에 의해 퇴장당했습니다.');
    if (room.status === 'waiting') {
      room.players.splice(room.players.indexOf(player), 1);
      broadcastUpdates(roomCode);
    } else if (room.status === 'playing') {
      eliminatePlayer(roomCode, playerId, 'admin_kick');
    }
  });

  socket.on('claimRoleForEscape', (data) => {
    const { roomCode, role } = data;
    const playerId = socket.id;
    const room = gameRooms[roomCode];

    if (!room || room.pendingAction !== 'escape_role_claim' || room.claimedRoles[playerId]) {
      return;
    }

    const player = room.players.find(p => p.id === playerId);
    if (player) {
      room.claimedRoles[playerId] = role;
      console.log(`[${roomCode}] ${player.name}님이 역할로 '${role}'을(를) 주장했습니다.`);

      const livingPlayers = room.players.filter(p => p.status === 'alive');
      const allClaimed = livingPlayers.every(p => room.claimedRoles[p.id]);

      if (allClaimed) {
        console.log(`[${roomCode}] 모든 생존자가 역할 주장을 마쳤습니다. 관리자의 투표 시작을 대기합니다.`);
        if (room.gameLog) {
          room.gameLog.unshift({ text: '[시스템] 모든 생존자가 역할 주장을 마쳤습니다. 관리자는 투표를 시작해주세요.', type: 'log' });
        }
        room.pendingAction = 'escape_vote_pending'; // 관리자가 투표 시작 버튼을 누를 수 있는 상태
      }
      broadcastUpdates(roomCode);
    }
  });

  socket.on('startEscapeVote', (data) => {
    const { code } = data;
    const room = gameRooms[code];
    if (!room || room.pendingAction !== 'escape_vote_pending') return;
    // AUTO MODE: 탈출 투표 자동 타이머 (meetingTime 기준)
    if (room.autoMode) {
      if (timerIntervals[code]) { clearInterval(timerIntervals[code]); delete timerIntervals[code]; }
      let escLeft = room.autoMeetingTime || 90;
      room.timeLeft = escLeft;
      io.to(code).emit('timerUpdate', { roomCode: code, timeLeft: escLeft });
      io.to(ADMIN_ROOM).emit('timerUpdate', { roomCode: code, timeLeft: escLeft });
      timerIntervals[code] = setInterval(() => {
        escLeft--;
        room.timeLeft = escLeft;
        io.to(code).emit('timerUpdate', { roomCode: code, timeLeft: escLeft });
        io.to(ADMIN_ROOM).emit('timerUpdate', { roomCode: code, timeLeft: escLeft });
        if (escLeft < 0) {
          clearInterval(timerIntervals[code]);
          delete timerIntervals[code];
          room.timeLeft = 0;
          // 타임아웃: 미투표자 처리 후 강제 종료
          const r2 = gameRooms[code];
          if (r2 && r2.pendingAction === 'escape_survivor_selection') {
            const living = r2.players.filter(p => p.status === 'alive');
            // 미투표자는 랜덤 선택
            living.forEach(p => {
              if (!r2.escapeVotes[p.id]) {
                const others = living.filter(o => o.id !== p.id);
                if (others.length > 0) r2.escapeVotes[p.id] = others[Math.floor(Math.random() * others.length)].id;
              }
            });
            // 탈출 타임아웃 → 에일리언 승리
            r2.status = 'game_over';
            const ending = ENDING_MESSAGES['alien_win_escape_timeout'];
            r2.winner = ending ? ending.winner : '에일리언 팀';
            io.to(code).emit('gameOver', { winner: r2.winner, reason: ending ? ending.reason : '시간 초과' });
            broadcastUpdates(code);
          }
        }
      }, 1000);
    }

    console.log(`[${code}] 관리자가 최종 탑승자 투표를 시작했습니다.`);
    if (room.gameLog) {
      room.gameLog.unshift({ text: '[시스템] 최종 탑승자 선정을 위한 투표가 시작되었습니다.', type: 'phase_change' });
    }

    room.pendingAction = 'escape_survivor_selection';
    room.escapeVotes = {}; // 투표 결과 저장 객체 초기화
    broadcastUpdates(code);
  });

  // P4: disconnect – 게임 중 재접속 대기, 대기실만 제거

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
              const nomineeIds = Object.values(room.ejectionNominations);
              const nomineeNames = nomineeIds.map(function (id) { const p = room.players.find(function (q) { return q.id === id; }); return p ? p.name : '???'; }).join(', ');
              if (room.gameLog) room.gameLog.unshift({ text: '[회의] 최종 방출 후보: ' + nomineeNames + ' — 방출 미니게임을 시작합니다!', type: 'log' });
            }
            // 모두 1인 모둠인 경우 자동 미니게임 시작
            setTimeout(function () { autoStartMinigame(roomCode); }, 800);
          }
        }
      }

      // ── AUTO MODE: 모두 모둠 선택 완료 시 타이머 자동 시작 (1일차/2일차 통일) ──
      if (room.autoMode && room.settings.useEjectionMinigame) {
        const allAlive = room.players.filter(p => p.status === 'alive');
        const allSelected = allAlive.every(p => !!p.group);
        const timerKey = roomCode + '_meeting';
        // BUG1 FIX: 다인 모둠이 있으면 타이머 시작 (1인 자동지목으로 partial nominations된 경우 포함)
        const hasMultiMemberGroup = [...new Set(room.players.filter(p => p.status === 'alive').map(p => p.group))]
          .some(gn => room.players.filter(p => p.status === 'alive' && p.group === gn).length > 1);
        const canStartTimer = allSelected && !timerIntervals[timerKey] &&
          !['minigame_active', 'minigame_all_selected'].includes(room.ejectionState) &&
          (room.ejectionState !== 'minigame_pending' || hasMultiMemberGroup);
        if (canStartTimer) {
          let autoLeft = room.autoMeetingTime || 90;
          room.timeLeft = autoLeft;
          io.to(roomCode).emit('timerUpdate', { roomCode, timeLeft: autoLeft });
          io.to(ADMIN_ROOM).emit('timerUpdate', { roomCode, timeLeft: autoLeft });
          console.log('[' + roomCode + '] AUTO: day ' + room.day + ' meeting timer started after all groups selected');
          broadcastUpdates(roomCode); // Q2: 타이머 시작 즉시 상태 갱신
          timerIntervals[timerKey] = setInterval(() => {
            autoLeft--;
            room.timeLeft = autoLeft;
            io.to(roomCode).emit('timerUpdate', { roomCode, timeLeft: autoLeft });
            io.to(ADMIN_ROOM).emit('timerUpdate', { roomCode, timeLeft: autoLeft });
            if (autoLeft === 30) {
              if (room.ejectionState === 'pending_start') {
                room.ejectionState = 'nominating';
              }
              broadcastUpdates(roomCode);
              // BUG3 FIX: 추가 broadcast로 클라이언트 확실히 갱신
              setTimeout(() => {
                if (gameRooms[roomCode]) broadcastUpdates(roomCode);
              }, 300);
            }
            if (autoLeft < 0) {
              clearInterval(timerIntervals[timerKey]);
              delete timerIntervals[timerKey];
              room.timeLeft = 0;
              if (room.ejectionState === 'nominating' || room.ejectionState === 'pending_start') {
                const alive = room.players.filter(p => p.status === 'alive' && p.group);
                const groups = [...new Set(alive.map(p => p.group))];
                groups.forEach(gn => {
                  if (room.ejectionNominations[gn]) return;
                  const members = alive.filter(p => p.group === gn);
                  if (members.length <= 1) return;
                  const votes = (room.ejectionVotes || {})[gn] || {};
                  const nonVoters = members.filter(p => !votes[p.id]);
                  if (nonVoters.length > 0) {
                    const penalty = nonVoters[Math.floor(Math.random() * nonVoters.length)];
                    room.ejectionNominations[gn] = penalty.id;
                    if (room.gameLog) room.gameLog.unshift({ text: '[자동진행] ' + penalty.name + '님이 미투표 페널티로 방출 후보에 올랐습니다.', type: 'log' });
                  } else {
                    const tally = {};
                    Object.values(votes).forEach(tid => { tally[tid] = (tally[tid] || 0) + 1; });
                    const topId = Object.entries(tally).sort((a, b) => b[1] - a[1])[0]?.[0];
                    if (topId) room.ejectionNominations[gn] = topId;
                  }
                });
                if (Object.keys(room.ejectionNominations).length > 0) {
                  room.ejectionState = 'minigame_pending';
                  broadcastUpdates(roomCode);
                  setTimeout(() => { autoStartMinigame(roomCode); }, 800);
                }
              }
            }
          }, 1000);
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
        const nomineeIds = Object.values(room.ejectionNominations);
        const nomineeNames = nomineeIds.map(id => { const p = room.players.find(q => q.id === id); return p ? p.name : '???'; }).join(', ');
        if (room.gameLog) room.gameLog.unshift({ text: '[회의] 최종 방출 후보: ' + nomineeNames + ' — 방출 미니게임을 시작합니다!', type: 'log' });

        broadcastUpdates(roomCode);
        setTimeout(() => { autoStartMinigame(roomCode); }, 800);
      }
    }
    broadcastUpdates(roomCode);
  });

  // ★★★ [3/6] 관리자가 '미니게임 시작' 버튼을 눌렀을 때
  socket.on('startEjectionMinigame', (data) => {
    const { code } = data;
    const room = gameRooms[code];
    // ★ 수정1: nominating 상태에서도 강제 시작 허용 (비상 버튼 지원)
    if (!room || !['minigame_pending', 'nominating'].includes(room.ejectionState)) return;

    // nominating 상태에서 강제 시작 시 현재 투표 최다득표자를 후보로 추출
    if (room.ejectionState === 'nominating') {
      const votes = room.ejectionVotes || {};
      const tally = {};
      Object.values(votes).forEach(targetId => { tally[targetId] = (tally[targetId] || 0) + 1; });
      if (Object.keys(tally).length === 0) {
        // 투표 없으면 무작위 1명 후보
        const alive = room.players.filter(p => p.status === 'alive');
        if (alive.length > 0) tally[alive[Math.floor(Math.random() * alive.length)].id] = 1;
      }
      const maxVotes = Math.max(...Object.values(tally));
      const topIds = Object.keys(tally).filter(id => tally[id] === maxVotes);
      if (!room.ejectionNominations) room.ejectionNominations = {};
      topIds.forEach(id => {
        const p = room.players.find(p => p.id === id);
        if (p) room.ejectionNominations[id] = id;
      });
      if (room.gameLog) room.gameLog.unshift({ text: `[강제 시작] 현재 투표 결과로 후보 확정: ${topIds.map(id => room.players.find(p => p.id === id)?.name).join(', ')}`, type: 'phase_change' });
    }

    const candidates = Object.values(room.ejectionNominations || {});
    if (candidates.length === 0) {
      console.log(`[${code}] startEjectionMinigame: 후보 없음`);
      return;
    }
    const cardCount = candidates.length;
    let cards = new Array(cardCount).fill({ content: '생존' });
    const ejectionCardIndex = Math.floor(Math.random() * cardCount);
    cards[ejectionCardIndex] = { content: '방출' };

    room.ejectionMinigame = {
      candidates: candidates,
      cards: shuffle(cards.map((card, index) => ({ id: index, content: card.content }))),
      selections: {},
      results: null
    };

    room.ejectionState = 'minigame_active';
    console.log(`[${code}] Ejection minigame started. Candidates:`, candidates);
    broadcastUpdates(code);
  });

  // 기존 socket.on('selectEjectionCard', ...) 핸들러를 삭제하고 아래 코드로 교체

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

    if (isCandidate && !hasAlreadySelected) {
      if (isCardTaken) {
        socket.emit('cardTaken', { message: '이미 다른 참가자가 선택한 카드입니다. 다른 카드를 선택하세요.' });
        return;
      }
      selections[candidateId] = cardId;
      socket.emit('cardSelectionConfirmed', { cardId });

      // Q2: 선택 후 미선택자가 1명이고 남은 카드가 1개면 자동 배정
      const unselectedCandidates = candidates.filter(id => selections[id] === undefined);
      if (unselectedCandidates.length === 1) {
        const selectedCardIds = Object.values(selections).map(c => typeof c === 'object' ? c : c);
        const allCardIds = room.ejectionMinigame.cards.map(c => c.id);
        const remainingCardIds = allCardIds.filter(id => !Object.values(selections).includes(id));
        if (remainingCardIds.length === 1) {
          const lastCandidateId = unselectedCandidates[0];
          selections[lastCandidateId] = remainingCardIds[0];
          io.to(lastCandidateId).emit('cardSelectionConfirmed', { cardId: remainingCardIds[0] });
          console.log('[' + roomCode + '] Q2: auto-assigned last card to ' + lastCandidateId);
        }
      }

      // 모든 후보 선택 완료 확인
      const allCandidatesSelected = candidates.every(id => selections[id] !== undefined);
      if (allCandidatesSelected) {
        room.ejectionState = 'minigame_all_selected';
        if (room.gameLog) room.gameLog.unshift({ text: '[방출 미니게임] 모든 후보가 선택을 마쳤습니다.', type: 'log' });
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

  socket.on('disconnect', () => {
    for (const code in gameRooms) {
      const room = gameRooms[code];
      const p = room.players.find(pl => pl.id === socket.id);
      if (!p) continue;
      if (room.status === 'playing') {
        console.log('[' + code + '] ' + p.name + ' disconnected – awaiting reconnect.');
        io.to(ADMIN_ROOM).emit('updateAdmin', { rooms: gameRooms, presets: PRESETS, missionPresets: Object.keys(MISSIONS) });
      } else if (room.status === 'waiting') {
        room.players.splice(room.players.indexOf(p), 1);
        broadcastUpdates(code);
      }
      break;
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
    // BUG2 FIX: 에일리언 타이머도 함께 정리
    const alienTimerKey = code + '_alien';
    if (timerIntervals[alienTimerKey]) {
      clearInterval(timerIntervals[alienTimerKey]);
      delete timerIntervals[alienTimerKey];
    }

    // ★★★ Q5 순서: meeting → night_crew_action → night_alien_action ★★★
    if (phase === 'night_crew_action') {
      // meeting 종료 → 탐사대 활동 시작
      room.phase = 'night_crew_action';
      room.crewActionTriggered = false;
      room.alienActionTriggered = false;
      delete room.alienActionsConfirmed;
      delete room.selections;
      delete room.bodyguardProtection;
      // ★ medicalProtectionTarget은 탐사대 활동 중 새로 설정되므로 초기화
      delete room.medicalProtectionTarget;
      delete room.doctorProtections;
      delete room.shamanBlockedPlayers;
      if (room.gameLog) room.gameLog.unshift({ text: '[' + room.day + '일차 밤 1단계] 탐사대 활동 시작', type: 'phase_change' });
      startCrewActionPhase(code);
      broadcastUpdates(code);
      return;
    }

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
        // 타이머 키도 초기화 (이전 라운드 타이머 잔존 방지)
        const prevTimerKey = code + '_meeting';
        if (timerIntervals[prevTimerKey]) { clearInterval(timerIntervals[prevTimerKey]); delete timerIntervals[prevTimerKey]; }
        // AUTO MODE: 타이머는 selectGroup에서 모두 선택 완료 시 시작 (1일차/2일차 통일)
        // nextPhase에서는 타이머 시작하지 않음
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

  // 기존 triggerAlienAction 핸들러를 아래 코드로 통째로 교체해주세요.
  socket.on('triggerAlienAction', (data) => {
    const { code } = data;
    const room = gameRooms[code];
    if (!room || room.phase !== 'night_alien_action') return;

    try {
      room.alienActionTriggered = true;
      room.alienActionsConfirmed = [];

      const livingPlayers = room.players.filter(p => p.status === 'alive');
      const allAlienRoles = livingPlayers.filter(p => p.role.includes('에일리언'));
      const normalAliens = allAlienRoles.filter(p => p.role === '에일리언');
      const queen = allAlienRoles.find(p => p.role === '에일리언 여왕');
      const egg = allAlienRoles.find(p => p.role === '에일리언 알');
      const shaman = allAlienRoles.find(p => p.role === '에일리언 주술사');

      const allAlienIds = allAlienRoles.map(p => p.id);
      const targets = livingPlayers
        .filter(p => !allAlienIds.includes(p.id))
        .map(p => ({ id: p.id, name: p.name }));

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
        if (normalAliens.length > 0 || (queen && !queen.abilityUsed)) {
          io.to(egg.id).emit('alienAction', { otherAliens, targets, observer: true });
        }
      }

      // ★★★ 핵심 수정: 주술사에게 별도의 능력 사용 UI를 전송합니다. ★★★
      if (shaman) {
        const otherAliens = allAlienRoles.filter(a => a.id !== shaman.id).map(a => a.name);
        const shamanTargets = livingPlayers
          .filter(p => !p.role.includes('에일리언'))
          .map(p => ({ id: p.id, name: p.name }));
        io.to(shaman.id).emit('shamanAction', { otherAliens, targets: shamanTargets });
      }

      // ── AUTO MODE: 에일리언 활동 타임아웃 (중복 방지) ──
      if (room.autoMode && room.autoAlienTime > 0 && !timerIntervals[code + '_alien']) {
        const alienKey = code + '_alien';
        let alienLeft = room.autoAlienTime;
        room.timeLeft = alienLeft;
        io.to(code).emit('timerUpdate', { roomCode: code, timeLeft: alienLeft });
        io.to(ADMIN_ROOM).emit('timerUpdate', { roomCode: code, timeLeft: alienLeft });
        timerIntervals[alienKey] = setInterval(() => {
          alienLeft--;
          room.timeLeft = alienLeft;
          const ap = { roomCode: code, timeLeft: alienLeft };
          io.to(code).emit('timerUpdate', ap);
          io.to(ADMIN_ROOM).emit('timerUpdate', ap);
          if (alienLeft < 0) {
            clearInterval(timerIntervals[alienKey]);
            delete timerIntervals[alienKey];
            const r2 = gameRooms[code];
            if (!r2 || r2.phase !== 'night_alien_action') return;
            const aliens = r2.players.filter(p => p.status === 'alive' && p.role && p.role.includes('에일리언'));
            aliens.forEach(alien => {
              if (!r2.alienActionsConfirmed) r2.alienActionsConfirmed = [];
              if (!r2.alienActionsConfirmed.includes(alien.id)) {
                r2.alienActionsConfirmed.push(alien.id);
                io.to(alien.id).emit('actionConfirmed');
              }
            });
            checkAllAlienActionsComplete(code);
          }
        }, 1000);
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
      // 수정 3: 여왕의 만찬에도 백신 2회 누적 보호 적용
      if (room.medicalProtectionTarget === targetId) {
        const immunePlayer = room.players.find(p => p.id === targetId);
        // 백신 2회 소비
        if (room.vaccineCount && room.vaccineCount[targetId] >= 2) {
          room.vaccineCount[targetId] -= 2;
        }
        if (immunePlayer) {
          if (room.gameLog) room.gameLog.unshift({ text: `💉 [의사 백신] ${immunePlayer.name}님이 여왕의 만찬에서 백신으로 생존했습니다.`, type: 'log' });
          if (room.notablePlays) room.notablePlays.push({ type: 'best', text: `의사팀의 백신으로 ${immunePlayer.name}(${immunePlayer.role})님이 여왕의 만찬에서 생존했습니다.` });
        }
        delete room.medicalProtectionTarget;
        return; // 이 대상은 사망 처리하지 않음
      }
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

    // BUG3 FIX: 만찬 완료 후 일반 에일리언 행동 완료 여부 확인
    // 여왕은 만찬으로 행동 완료. 나머지 에일리언이 모두 선택했으면 바로 탐사대 활동 진행
    const remainingAliens = room.players.filter(p => p.status === 'alive' && p.role === '에일리언');
    const confirmed = room.alienActionsConfirmed || [];
    const allAliensReady = remainingAliens.length === 0 || remainingAliens.every(p => confirmed.includes(p.id));
    if (allAliensReady) {
      // Q5: 에일리언 활동이 밤 마지막 → 바로 다음날 morning
      goToMorning(code);
    } else {
      room.phase = 'night_alien_action';
      broadcastUpdates(code);
    }
  });

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
    // 자동 완료 or 수동 클릭 모두 Internal로 위임
    resolveNightActionsInternal(data.code);
  });

  socket.on('startEscapeSequence', (data) => {
    const { code, survivorIds } = data;
    const room = gameRooms[code];
    if (!room) return;

    console.log(`[${code}] 비상탈출 시퀀스가 시작되었습니다. 탑승자:`, survivorIds);

    room.escapees = room.players.filter(p => survivorIds.includes(p.id));
    room.phase = 'escape_sequence';
    room.escapeStep = 0;
    room.escapeLog = [];
    delete room.pendingAction;

    room.escapeLog.push(">>> 비상탈출 시퀀스 가동. 캡슐 인원 확인 시작...");
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

  // useSoldierAbility 핸들러를 찾아 통째로 교체해주세요.
  socket.on('useSoldierAbility', (data) => {
    const { targetId } = data;
    const selectorId = socket.id;
    let roomCode = '';
    for (const code in gameRooms) { if (gameRooms[code].players.some(p => p.id === selectorId)) { roomCode = code; break; } }

    if (roomCode) {
      const room = gameRooms[roomCode];
      if (room.shamanBlockedPlayers && room.shamanBlockedPlayers.includes(selectorId)) {
        return io.to(selectorId).emit('abilityError', '누군가의 방해로 능력을 사용할 수 없습니다.');
      }

      const protectionTargetId = room.bodyguardProtection;
      // ★★★ 핵심 수정: 경호원 생사 무관 + 올바른 변수(roomCode) 사용 ★★★
      if (protectionTargetId && targetId === protectionTargetId) {
        const bodyguard = room.players.find(p => p.role === '경호원');
        if (bodyguard) {
          const targetPlayer = room.players.find(p => p.id === targetId);
          if (targetPlayer) {
            if (room.gameLog) {
              room.gameLog.unshift({ text: `[경호원]이(가) ${targetPlayer.name}님을 지키고 대신 희생했습니다.`, type: 'log' });
            }
          }
          eliminatePlayer(roomCode, bodyguard.id, 'bodyguard_sacrifice'); // 올바른 변수 사용
          const soldier = room.players.find(p => p.id === socket.id);
          if (soldier) soldier.bullets--;
          broadcastUpdates(roomCode);
          return;
        }
      }

      const soldier = room.players.find(p => p.id === socket.id);
      if (room && soldier && soldier.role === '군인' && soldier.bullets > 0) {
        soldier.bullets--;
        const soldierTarget = room.players.find(p => p.id === targetId);
        if (soldierTarget && room.notablePlays) {
          const isAlienS = soldierTarget.role && soldierTarget.role.includes('에일리언');
          if (isAlienS) {
            // 군인: 에일리언 저격 성공 → best만 기재
            room.notablePlays.push({
              type: 'best',
              text: soldier.name + '(군인)님이 ' + soldierTarget.name + '(' + soldierTarget.role + ')을 저격했습니다.'
            });
          } else {
            // 군인: 탐사대원 오사 → worst
            room.notablePlays.push({
              type: 'worst',
              text: soldier.name + '(군인)님이 아군 ' + soldierTarget.name + '(' + soldierTarget.role + ')을 오사했습니다.'
            });
          }
        }
        eliminatePlayer(roomCode, targetId, 'soldier_shot');
        broadcastUpdates(roomCode);
      }
    }
  });

  // 기존 useBodyguardAbility 핸들러를 아래 코드로 교체해주세요.
  socket.on('useBodyguardAbility', (data) => {
    const { targetId } = data;
    const selectorId = socket.id;
    let roomCode = '';
    for (const code in gameRooms) { if (gameRooms[code].players.some(p => p.id === selectorId)) { roomCode = code; break; } }

    if (roomCode) {
      const room = gameRooms[roomCode];
      if (room.shamanBlockedPlayers && room.shamanBlockedPlayers.includes(selectorId)) {
        return io.to(selectorId).emit('abilityError', '누군가의 방해로 능력을 사용할 수 없습니다.');
      }

      const bodyguard = room.players.find(p => p.id === socket.id);
      if (room && bodyguard && bodyguard.role === '경호원') {
        // ★★★ 시작: 아래 로직을 추가해주세요. ★★★
        bodyguard.abilityUsedThisTurn = true; // 능력 사용 플래그 설정
        // ★★★ 종료: 여기까지 추가해주세요. ★★★

        room.bodyguardProtection = targetId;
        console.log(`[${roomCode}] 경호원이 다음 공격으로부터 ${targetId}를 보호하도록 설정했습니다.`);

        if (room.gameLog) {
          room.gameLog.unshift({ text: `[시스템] 경호원이 누군가를 비밀리에 보호하기 시작했습니다.`, type: 'log' });
        }
        broadcastUpdates(roomCode);
      }
    }
  });

  // 의사 능력: 백신 누적 시스템 (수정 3-나, 3-다)
  socket.on('useDoctorAbility', (data) => {
    const { targetId } = data;
    const selectorId = socket.id;
    let roomCode = '';
    for (const code in gameRooms) {
      if (gameRooms[code].players.some(p => p.id === selectorId)) { roomCode = code; break; }
    }
    if (!roomCode) return;
    const room = gameRooms[roomCode];
    const doctor = room.players.find(p => p.id === selectorId);
    if (!doctor || doctor.role !== '의사' || doctor.status !== 'alive') return;

    // 이번 밤 이미 접종한 의사는 재사용 불가
    if (!room.doctorProtections) room.doctorProtections = {};
    const alreadyUsed = Object.values(room.doctorProtections).some(arr => Array.isArray(arr) && arr.includes(selectorId));
    if (alreadyUsed) { io.to(selectorId).emit('actionConfirmed'); return; }

    // doctorProtections: { targetId: [doctorId, ...] } — 이번 밤 접종 기록
    if (!room.doctorProtections[targetId]) room.doctorProtections[targetId] = [];
    if (!room.doctorProtections[targetId].includes(selectorId)) {
      room.doctorProtections[targetId].push(selectorId);
    }

    // ── 백신 누적 카운트 (수정 3-나) ──
    if (!room.vaccineCount) room.vaccineCount = {};
    const prevCount = room.vaccineCount[targetId] || 0;
    room.vaccineCount[targetId] = prevCount + 1;
    const newCount = room.vaccineCount[targetId];
    const targetPlayer = room.players.find(p => p.id === targetId);
    const targetName = targetPlayer ? targetPlayer.name : '???';

    console.log(`[${roomCode}] 의사 ${doctor.name} → ${targetName} 백신 접종 (누적 ${newCount}회)`);

    // ── 3-1: 같은 대상에 2명 이상 접종 시 로그 (대상 이름 비공개) ──
    const sameTargetDoctors = room.doctorProtections[targetId].length;
    if (sameTargetDoctors >= 2) {
      // ★ 수정4: 대상 이름 미공개 — "탐사대원 중 한 명이..." 형식
      const logText = `💉 탐사대원 중 한 명이 ${sameTargetDoctors}명의 의사에게 백신 ${newCount}회 접종을 받았습니다.`;
      if (room.gameLog) room.gameLog.unshift({ text: logText, type: 'log' });
      io.to(roomCode).emit('doctorVaccineUpdate', {
        targetName: null, // ★ 수정4: 클라이언트에 이름 전달 안 함
        count: newCount,
        doubleVaccinated: true
      });
    }

    // ── 포식 저지 조건: 백신 2회 누적 시 medicalProtectionTarget 설정 ──
    if (newCount >= 2 && !room.medicalProtectionTarget) {
      room.medicalProtectionTarget = targetId;
      if (room.notablePlays) room.notablePlays.push({ type: 'best', text: `의사팀의 백신으로 ${targetName}님이 포식에서 보호됩니다.` });
    }

    // ── 수정 3-다: 백신 3회 누적 시 과다 투약 사망 (에일리언 팀 면역) ──
    const ALIEN_ROLES = ['에일리언 여왕', '에일리언', '에일리언 알', '에일리언 주술사'];
    if (newCount >= 3 && targetPlayer && !ALIEN_ROLES.includes(targetPlayer.role)) {
      console.log(`[${roomCode}] 백신 과다 투약: ${targetName} 사망 처리`);
      if (room.gameLog) room.gameLog.unshift({ text: `⚠️ [과다 투약] ${targetName}님이 백신 ${newCount}회 접종으로 인한 과다 투약으로 사망했습니다.`, type: 'log' });
      // 과다 투약은 medicalProtection 초기화 후 사망
      if (room.medicalProtectionTarget === targetId) delete room.medicalProtectionTarget;
      eliminatePlayer(roomCode, targetId, 'vaccine_overdose');
    }

    io.to(selectorId).emit('actionConfirmed');
    broadcastUpdates(roomCode);
  });

  // useShamanAbility 핸들러를 찾아 통째로 교체해주세요.
  socket.on('useShamanAbility', (data) => {
    const { targetId } = data;
    const selectorId = socket.id;
    let roomCode = '';
    for (const code in gameRooms) {
      if (gameRooms[code].players.some(p => p.id === selectorId)) { roomCode = code; break; }
    }

    if (roomCode) {
      const room = gameRooms[roomCode];
      const shaman = room.players.find(p => p.id === socket.id);
      if (room && shaman && shaman.role === '에일리언 주술사') {
        room.shamanBlockedPlayers = room.shamanBlockedPlayers || [];
        room.shamanBlockedPlayers.push(targetId);

        room.selections = room.selections || {};
        room.selections[selectorId] = targetId;
        broadcastAlienSelections(roomCode);

        console.log(`[${roomCode}] 주술사가 ${targetId}의 능력을 차단하도록 설정했습니다.`);

        // ★★★ 핵심 수정: 주술사에게 즉시 피드백을 보냅니다. ★★★
        io.to(selectorId).emit('actionConfirmed');

        if (!room.alienActionsConfirmed.includes(selectorId)) {
          room.alienActionsConfirmed.push(selectorId);
        }
        checkAllAlienActionsComplete(roomCode);
      }
    }
  });

  // ★★★ 위 코드를 아래 코드로 교체해주세요. ★★★
  socket.on('eliminatePlayer', (data) => {
    const { roomCode, playerId, cause } = data;
    // 서버에서는 확인 절차 없이 바로 실행합니다. (확인은 admin.html에서 이미 완료됨)
    eliminatePlayer(roomCode, playerId, cause || 'admin_action');
  });

  // useCaptainAbility 핸들러를 찾아 통째로 교체해주세요.
  socket.on('useCaptainAbility', (data) => {
    const { targetId } = data;
    const selectorId = socket.id;
    let roomCode = '';
    for (const code in gameRooms) { if (gameRooms[code].players.some(p => p.id === selectorId)) { roomCode = code; break; } }

    if (roomCode) {
      const room = gameRooms[roomCode];
      if (room.shamanBlockedPlayers && room.shamanBlockedPlayers.includes(selectorId)) {
        return io.to(selectorId).emit('abilityError', '누군가의 방해로 능력을 사용할 수 없습니다.');
      }

      const protectionTargetId = room.bodyguardProtection;
      // ★★★ 핵심 수정: 경호원 생사 무관 + 올바른 변수(roomCode) 사용 ★★★
      if (protectionTargetId && targetId === protectionTargetId) {
        const bodyguard = room.players.find(p => p.role === '경호원');
        if (bodyguard) {
          const targetPlayer = room.players.find(p => p.id === targetId);
          if (targetPlayer) {
            if (room.gameLog) {
              room.gameLog.unshift({ text: `[경호원]이(가) ${targetPlayer.name}님을 지키고 대신 희생했습니다.`, type: 'log' });
            }
          }
          eliminatePlayer(roomCode, bodyguard.id, 'bodyguard_sacrifice'); // 올바른 변수 사용
          const captain = room.players.find(p => p.id === socket.id);
          if (captain) captain.bullets--;
          broadcastUpdates(roomCode);
          return;
        }
      }

      const captain = room.players.find(p => p.id === socket.id);
      if (room && captain && captain.role === '함장' && captain.bullets > 0) {
        captain.bullets--;
        const captainTarget = room.players.find(p => p.id === targetId);
        if (captainTarget && room.notablePlays) {
          const isAlienC = captainTarget.role && captainTarget.role.includes('에일리언');
          if (isAlienC) {
            // 함장: 에일리언 즉결처분 성공 → best만 기재
            room.notablePlays.push({
              type: 'best',
              text: captain.name + '(함장)님이 ' + captainTarget.name + '(' + captainTarget.role + ')을 즉결 처분했습니다.'
            });
          } else {
            // 함장: 탐사대원 오사 → worst
            room.notablePlays.push({
              type: 'worst',
              text: captain.name + '(함장)님이 아군 ' + captainTarget.name + '(' + captainTarget.role + ')을 즉결 처분했습니다.'
            });
          }
        }
        eliminatePlayer(roomCode, targetId, 'captain_shot');
        broadcastUpdates(roomCode);
      }
    }
  });

  // (중복 useQueenHunt 핸들러 제거 - 아래 핸들러가 유효한 버전)

  socket.on('useQueenRampage', (data) => {
    const { targetIds } = data;
    const selectorId = socket.id;
    let roomCode = '';
    for (const code in gameRooms) {
      if (gameRooms[code].players.some(p => p.id === selectorId)) { roomCode = code; break; }
    }
    if (!roomCode) return;
    const room = gameRooms[roomCode];
    const queen = room.players.find(p => p.id === socket.id);

    if (room && queen && queen.role === '에일리언 여왕' && room.rampageTriggered) {
      // ★★★ 시작: 아래 로직을 추가해주세요. ★★★
      room.selections = room.selections || {};
      room.selections[selectorId] = targetIds;
      room.queenActionTaken = true; // 여왕이 행동을 마쳤음을 기록

      const targetNames = targetIds.map(id => room.players.find(p => p.id === id)?.name).join(', ');
      if (room.gameLog) {
        room.gameLog.unshift({ text: `[여왕의 만찬] 여왕이 ${targetNames}을(를) 선택했습니다.`, type: 'log' });
      }
      console.log(`[${roomCode}] Queen rampage selection: ${targetNames}`);

      io.to(selectorId).emit('actionConfirmed'); // 여왕에게 선택 완료 피드백
      broadcastUpdates(roomCode); // 모든 클라이언트에게 상태 업데이트
      // ★★★ 종료: 여기까지 추가해주세요. ★★★
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
      if (room.gameLog) {
        room.gameLog.unshift({ text: '엔지니어가 [계속 싸운다]를 선택했습니다. 여왕의 만찬 전 탐사대 활동을 먼저 진행합니다.', type: 'phase_change' });
      }
      console.log(`[${roomCode}] 엔지니어가 싸움을 선택했습니다. 탐사대 활동 후 여왕의 만찬을 준비합니다.`);

      // ★ 수정5 핵심: pendingAction을 queen_rampage로 예약하되, 페이즈는 night_crew_action으로 먼저 전환
      room.pendingAction = 'queen_rampage';
      room.phase = 'night_crew_action';
      room.crewActionTriggered = false;
      delete room.alienActionTriggered;
      delete room.alienActionsConfirmed;
      delete room.selections;
      delete room.doctorProtections;
      delete room.shamanBlockedPlayers;

      // feastAnnounced는 클라이언트가 pendingAction을 보고 판단하므로 emit
      io.to(roomCode).emit('feastAnnounced');
      // 탐사대 활동 시작
      startCrewActionPhase(roomCode);
      broadcastUpdates(roomCode);
    }
  });

  socket.on('engineerChoseEscape', () => {
    let roomCode = '';
    for (const code in gameRooms) {
      if (gameRooms[code].players.some(p => p.id === socket.id)) {
        roomCode = code;
        break;
      }
    }
    if (!roomCode) return;

    const room = gameRooms[roomCode];
    if (!room) return;

    console.log(`[${roomCode}] 엔지니어가 비상탈출을 선택했습니다.`);

    if (room.gameLog) {
      room.gameLog.unshift({
        text: '[시스템] 엔지니어가 [비상탈출캡슐]을 가동하기로 선택했습니다.',
        type: 'phase_change'
      });
    }

    const livingPlayers = room.players.filter(p => p.status === 'alive');
    if (livingPlayers.length < 4) {
      console.log(`[${roomCode}] 생존자가 4명 미만이라 비상탈출이 불가능합니다.`);
      const detailLog = '생존 인원이 4명보다 적어 비상탈출 캡슐을 가동할 수 없습니다.';
      endGame(roomCode, 'alien_win_escape_malfunction', detailLog);
      return;
    }

    // ★★★ 핵심 수정: '역할 주장' 단계로 상태를 올바르게 변경합니다. ★★★
    room.pendingAction = 'escape_role_claim';
    room.claimedRoles = {}; // 역할 주장 정보를 저장할 객체를 초기화합니다.
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
          // 수정 3-가: 같은 모둠에 살아있는 의사가 있으면 오염 저지 (패시브)
          const doctorInGroup = room.players.find(p =>
            p.status === 'alive' &&
            p.group === alienEgg.group &&
            p.role === '의사'
          );
          if (doctorInGroup) {
            console.log(`[${roomCode}] Doctor passive: egg contamination blocked by ${doctorInGroup.name}`);
            if (room.gameLog) room.gameLog.unshift({ text: `🛡️ [의사 패시브] ${doctorInGroup.name}님이 에일리언 알 오염을 저지했습니다! 모둠원 전원 생존.`, type: 'log' });
          } else {
            const playersToEliminate = room.players.filter(p =>
              p.status === 'alive' &&
              p.group === alienEgg.group &&
              p.role !== '에일리언' &&
              p.role !== '에일리언 여왕'
            );
            const deadNames = playersToEliminate.map(p => p.name).join(', ');
            if (room.gameLog) room.gameLog.unshift(`[에일리언 알]이 오염되었습니다. ${deadNames} 사망.`);
            playersToEliminate.forEach(player => {
              eliminatePlayer(roomCode, player.id, 'egg_contamination');
            });
          }
        }
      }
      broadcastUpdates(roomCode);
    }, ROULETTE_DURATION + VIEW_DURATION);
  });

  socket.on('useChatterboxAbility', (data) => {
    const { targetId } = data;
    const selectorId = socket.id;
    let roomCode = '';
    for (const code in gameRooms) { if (gameRooms[code].players.some(p => p.id === selectorId)) { roomCode = code; break; } }
    if (roomCode) {
      const room = gameRooms[roomCode];
      // ★★★ 주술사 차단 확인 로직 추가 ★★★
      if (room.shamanBlockedPlayers && room.shamanBlockedPlayers.includes(selectorId)) {
        return io.to(selectorId).emit('abilityError', '누군가의 방해로 능력을 사용할 수 없습니다.');
      }
      const chatterbox = room.players.find(p => p.id === selectorId);
      const target = room.players.find(p => p.id === targetId);
      if (chatterbox && chatterbox.role === '수다쟁이' && target && chatterbox.abilityUsedDay !== room.day) {
        chatterbox.abilityUsedDay = room.day;
        target.revealedRole = target.role;
        if (room.gameLog) room.gameLog.unshift('[수다쟁이]가 ' + target.name + '님의 정체를 폭로했습니다!');
        if (room.notablePlays) {
          const isAlienCh = target.role && target.role.includes('에일리언');
          if (isAlienCh) {
            // 수다쟁이: 에일리언 폭로 성공 → best만 기재
            room.notablePlays.push({
              type: 'best',
              text: chatterbox.name + '(수다쟁이)님이 ' + target.name + '(' + target.role + ')의 정체를 폭로했습니다.'
            });
          } else {
            // 수다쟁이: 탐사대 핵심 인물 정보 누설 → worst만 기재
            if (['함장', '엔지니어'].includes(target.role)) {
              room.notablePlays.push({
                type: 'worst',
                text: chatterbox.name + '(수다쟁이)님이 아군 ' + target.name + '(' + target.role + ')의 정보를 누설했습니다.'
              });
            }
          }
        }
        io.to(selectorId).emit('actionConfirmed');
        broadcastUpdates(roomCode);
      }
    }
  });

  socket.on('usePsychicAbility', (data) => {
    const { targetIds } = data;
    const selectorId = socket.id;
    let roomCode = '';
    for (const code in gameRooms) { if (gameRooms[code].players.some(p => p.id === selectorId)) { roomCode = code; break; } }
    if (!roomCode) return;
    const room = gameRooms[roomCode];
    // ★★★ 주술사 차단 확인 로직 추가 ★★★
    if (room.shamanBlockedPlayers && room.shamanBlockedPlayers.includes(selectorId)) {
      return io.to(selectorId).emit('abilityError', '누군가의 방해로 능력을 사용할 수 없습니다.');
    }
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
        if (room.gameLog) room.gameLog.unshift('[초능력자]가 ' + targetNames + '님의 정체를 꿰뚫어보는 데 성공했습니다.');
        // 주효 플레이: 에일리언 탐지 성공 여부로 판단
        const psychicPlayer = room.players.find(p => p.id === selectorId);
        if (psychicPlayer && room.notablePlays) {
          const foundAliens = targetIds.filter(tid => { const tp = room.players.find(p => p.id === tid); return tp && tp.role && tp.role.includes('에일리언'); });
          if (foundAliens.length > 0) {
            const alienNames = foundAliens.map(tid => { const tp = room.players.find(p => p.id === tid); return tp ? tp.name + '(' + tp.role + ')' : '???'; }).join(', ');
            // 초능력자: 에일리언 정체 밝힘 → best만 기재
            room.notablePlays.push({ type: 'best', text: psychicPlayer.name + '(초능력자)님이 ' + alienNames + '의 정체를 밝혔습니다.' });
          }
        } targetIds.forEach(targetId => {
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

  // night_crew_action 완료 → night_alien_action으로 전환 (Q5: 순서 변경)
  socket.on('endNightAndStartMeeting', (data) => {
    const { code } = data;
    const room = gameRooms[code];
    if (!room) return;
    // Q5: 크루 활동 후 바로 에일리언 활동으로
    if (room.phase === 'night_crew_action') {
      room.phase = 'night_alien_action';
      room.alienActionTriggered = false;
      room.alienActionsConfirmed = [];
      room.selections = {};
      delete room.crewActionTriggered;
      delete room.bodyguardProtection;
      // ★ 수정5: medicalProtectionTarget은 여기서 삭제하지 않음 (resolveNightActionsInternal에서 소비)
      delete room.doctorProtections;
      broadcastUpdates(code);
      return;
    }

    // Q5: night_alien_action 완료 → goToMorning (다음날 morning)
    if (room.phase === 'night_alien_action') {
      goToMorning(code);
      return;
    }
    // fallback
    broadcastUpdates(code);
  });

  // ── startMeetingTimer: 수동/강제 타이머 시작 (관리자 비상용 + selectGroup 미완료 대비) ──
  socket.on('startMeetingTimer', (roomCode) => {
    const room = gameRooms[roomCode];
    if (!room) return;
    const timerKey = roomCode + '_meeting';
    if (timerIntervals[timerKey]) { clearInterval(timerIntervals[timerKey]); delete timerIntervals[timerKey]; }
    let autoLeft = room.autoMeetingTime || 90;
    room.timeLeft = autoLeft;
    io.to(roomCode).emit('timerUpdate', { roomCode, timeLeft: autoLeft });
    io.to(ADMIN_ROOM).emit('timerUpdate', { roomCode, timeLeft: autoLeft });
    console.log('[' + roomCode + '] Meeting timer FORCE started by admin');
    timerIntervals[timerKey] = setInterval(() => {
      autoLeft--;
      room.timeLeft = autoLeft;
      io.to(roomCode).emit('timerUpdate', { roomCode, timeLeft: autoLeft });
      io.to(ADMIN_ROOM).emit('timerUpdate', { roomCode, timeLeft: autoLeft });
      if (autoLeft === 30) {
        if (room.ejectionState === 'pending_start') {
          room.ejectionState = 'nominating';
        }
        broadcastUpdates(roomCode);
        setTimeout(() => {
          if (gameRooms[roomCode]) broadcastUpdates(roomCode);
        }, 300);
      }
      if (autoLeft < 0) {
        clearInterval(timerIntervals[timerKey]);
        delete timerIntervals[timerKey];
        room.timeLeft = 0;
        if (room.ejectionState === 'nominating' || room.ejectionState === 'pending_start') {
          const alive = room.players.filter(p => p.status === 'alive' && p.group);
          const groups = [...new Set(alive.map(p => p.group))];
          groups.forEach(gn => {
            if (room.ejectionNominations[gn]) return;
            const members = alive.filter(p => p.group === gn);
            if (members.length <= 1) return;
            const votes = (room.ejectionVotes || {})[gn] || {};
            const nonVoters = members.filter(p => !votes[p.id]);
            if (nonVoters.length > 0) {
              const penalty = nonVoters[Math.floor(Math.random() * nonVoters.length)];
              room.ejectionNominations[gn] = penalty.id;
              if (room.gameLog) room.gameLog.unshift({ text: '[자동진행] ' + penalty.name + '님이 미투표 페널티로 방출 후보에 올랐습니다.', type: 'log' });
            } else {
              const tally = {};
              Object.values(votes).forEach(tid => { tally[tid] = (tally[tid] || 0) + 1; });
              const topId = Object.entries(tally).sort((a, b) => b[1] - a[1])[0]?.[0];
              if (topId) room.ejectionNominations[gn] = topId;
            }
          });
          if (Object.keys(room.ejectionNominations).length > 0) {
            room.ejectionState = 'minigame_pending';
            broadcastUpdates(roomCode);
          }
        }
      }
    }, 1000);
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

      // 사망자도 참여 가능 (탐사대 활동 페이즈 + crewActionTriggered 조건만 확인)
      if (!player || !problem || problem.status !== 'unsolved') return;
      if (room.phase !== 'night_crew_action' || !room.crewActionTriggered) return;

      // 1일 1회 제한 (생존자/사망자 동일 적용)
      const attemptedCount = room.dailyMissionSolves[playerId] || 0;
      if (attemptedCount >= 1) {
        return socket.emit('missionError', '오늘은 이미 미션에 도전했습니다. 내일을 기다려주세요!');
      }
      room.dailyMissionSolves[playerId] = attemptedCount + 1;

      const isCorrect = answer.trim().toLowerCase() === problem.answer.trim().toLowerCase();
      const isDead = player.status === 'dead';

      if (isCorrect) {
        problem.status = 'solved';
        problem.solvedBy = player.name + (isDead ? ' 👻' : '');
        if (isDead && room.gameLog) {
          room.gameLog.unshift({ text: '[사망자 기여] ' + player.name + '님이 미션을 해결했습니다! 👻', type: 'log' });
        }
      } else {
        problem.status = 'failed';
        problem.failedBy = player.name + (isDead ? ' 👻' : '');
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
  socket.on('voteForEscape', (data) => {
    const { roomCode, targetId } = data;
    const voterId = socket.id;
    const room = gameRooms[roomCode];

    if (!room || room.pendingAction !== 'escape_survivor_selection' || room.escapeVotes[voterId]) {
      return;
    }

    const voter = room.players.find(p => p.id === voterId);
    const target = room.players.find(p => p.id === targetId);

    if (voter && target) {
      room.escapeVotes[voterId] = targetId;
      console.log(`[${roomCode}] ${voter.name} voted for ${target.name} to escape.`);

      const livingPlayers = room.players.filter(p => p.status === 'alive');
      const allVoted = livingPlayers.every(p => room.escapeVotes[p.id]);

      if (allVoted) {
        console.log(`[${roomCode}] All players have voted for escape. Resolving.`);
        resolveEscapeVotes(roomCode);
      } else {
        broadcastUpdates(roomCode);
      }
    }
  });
});

function resolveEscapeVotes(roomCode) {
  const room = gameRooms[roomCode];
  if (!room) return;

  const voteCounts = {};
  const livingPlayers = room.players.filter(p => p.status === 'alive');

  // 모든 생존자를 0표로 초기화
  livingPlayers.forEach(player => {
    voteCounts[player.id] = 0;
  });

  // 받은 표를 집계
  Object.values(room.escapeVotes).forEach(votedForId => {
    if (voteCounts.hasOwnProperty(votedForId)) {
      voteCounts[votedForId]++;
    }
  });

  // 득표수를 기준으로 정렬하고, 동점일 경우 랜덤으로 순서를 정합니다.
  const sortedCandidates = Object.entries(voteCounts)
    .sort((a, b) => {
      if (a[1] !== b[1]) return b[1] - a[1]; // 득표수 내림차순
      return Math.random() - 0.5; // 동점이면 랜덤
    });

  // 상위 4명을 탈출자로 선정
  const survivorIds = sortedCandidates.slice(0, 4).map(c => c[0]);
  const survivorNames = survivorIds.map(id => room.players.find(p => p.id === id)?.name).join(', ');

  if (room.gameLog) {
    room.gameLog.unshift({ text: `[투표 결과] ${survivorNames} (이)가 최종 탑승자로 선정되었습니다.`, type: 'log' });
  }

  // 투표 결과를 'escapees'에 저장하고, 관리자가 다음 단계를 누를 수 있도록 상태 변경
  room.escapees = room.players.filter(p => survivorIds.includes(p.id));
  room.pendingAction = 'escape_ready';

  broadcastUpdates(roomCode);
}

function resolveEscapeVotes(roomCode) {
  const room = gameRooms[roomCode];
  if (!room) return;

  const voteCounts = {};
  const livingPlayers = room.players.filter(p => p.status === 'alive');

  livingPlayers.forEach(player => {
    voteCounts[player.id] = 0;
  });

  Object.values(room.escapeVotes).forEach(votedForId => {
    if (voteCounts.hasOwnProperty(votedForId)) {
      voteCounts[votedForId]++;
    }
  });

  const sortedCandidates = Object.entries(voteCounts)
    .sort((a, b) => {
      if (a[1] !== b[1]) return b[1] - a[1];
      return Math.random() - 0.5;
    });

  const survivorIds = sortedCandidates.slice(0, 4).map(c => c[0]);
  const survivorNames = survivorIds.map(id => room.players.find(p => p.id === id)?.name).join(', ');

  if (room.gameLog) {
    room.gameLog.unshift({ text: `[투표 결과] ${survivorNames} (이)가 최종 탑승자로 선정되었습니다.`, type: 'log' });
  }

  // ★★★ 핵심 수정: 'escapees'에 탈출자를 저장하고, 관리자가 다음 단계를 누를 수 있도록 상태를 'escape_ready'로 변경
  room.escapees = room.players.filter(p => survivorIds.includes(p.id));
  room.pendingAction = 'escape_ready';

  broadcastUpdates(roomCode);
}

// ── AUTO MODE ──
io.on('connection', (socket) => {
  socket.on('setAutoMode', (data) => {
    const { roomCode, autoMode, meetingTime, alienTime } = data;
    const room = gameRooms[roomCode];
    if (!room) return;
    room.autoMode = !!autoMode;
    if (typeof meetingTime === 'number') room.autoMeetingTime = meetingTime;
    if (typeof alienTime === 'number') room.autoAlienTime = alienTime;
    console.log(`[${roomCode}] autoMode=${room.autoMode} meetingTime=${room.autoMeetingTime} alienTime=${room.autoAlienTime}`);
    broadcastUpdates(roomCode);
  });
});

// setAutoMode – 자동 진행 모드 설정 (게임 시작 전에만)
io.on('connection', (socket) => {
  socket.on('setAutoMode', (data) => {
    const { roomCode, autoMode, meetingTime, alienTime } = data;
    const room = gameRooms[roomCode];
    if (!room || room.status === 'playing') return; // 게임 중엔 변경 불가
    room.autoMode = !!autoMode;
    if (typeof meetingTime === 'number' && meetingTime >= 60) room.autoMeetingTime = meetingTime;
    if (typeof alienTime === 'number' && alienTime >= 20) room.autoAlienTime = alienTime;
    broadcastUpdates(roomCode);
  });
});

server.listen(PORT, () => {
  console.log(`서버가 ${PORT}번 포트에서 실행 중입니다.`);
});