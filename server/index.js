const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

const PORT = 3001;
const gameRooms = {};
const ADMIN_ROOM = 'admin_room';

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

app.use(express.static(path.join(__dirname, '../client/public')));
app.get('/', (req, res) => { res.sendFile(path.join(__dirname, '../client/public', 'index.html')); });
app.get('/admin', (req, res) => { res.sendFile(path.join(__dirname, '../client/public', 'admin.html')); });

io.on('connection', (socket) => {
  console.log('새로운 유저가 접속했습니다! socket ID:', socket.id);

  socket.on('adminConnect', () => {
    socket.join(ADMIN_ROOM);
    console.log('관리자가 접속했습니다.');
    socket.emit('updateAdmin', gameRooms);
  });

  socket.on('joinGame', (data) => {
    const { name, code } = data;
    socket.join(code);
    if (!gameRooms[code]) {
      gameRooms[code] = { players: [] };
    }
    const newPlayer = { id: socket.id, name: name };
    gameRooms[code].players.push(newPlayer);
    io.to(code).emit('updateRoom', gameRooms[code].players);
    io.to(ADMIN_ROOM).emit('updateAdmin', gameRooms);
  });

  socket.on('startGame', (data) => {
    const { code, settings } = data;
    console.log(`[${code}] 방의 게임 시작 요청. 설정:`, settings);
    const room = gameRooms[code];
    if (!room) return;
    const roles = [];
    for (const roleName in settings) {
        for (let i = 0; i < settings[roleName]; i++) {
            roles.push(roleName);
        }
    }
    const players = room.players;
    while (roles.length < players.length) {
        roles.push('일반 승객');
    }
    const shuffledRoles = shuffle(roles);
    players.forEach((player, index) => {
        player.role = shuffledRoles[index];
    });
    room.status = 'playing';
    console.log(`[${code}] 방 역할 배정 완료:`, room.players);
    players.forEach(player => {
        io.to(player.id).emit('roleAssigned', { role: player.role });
    });
  });

  socket.on('disconnect', () => {
    console.log('유저가 접속을 끊었습니다. socket ID:', socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`서버가 ${PORT}번 포트에서 실행 중입니다.`);
});