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
const ADMIN_ROOM = 'admin_room'; // 관리자들만 접속할 방 이름

app.use(express.static(path.join(__dirname, '../client/public')));
app.get('/', (req, res) => { res.sendFile(path.join(__dirname, '../client/public', 'index.html')); });
app.get('/admin', (req, res) => { res.sendFile(path.join(__dirname, '../client/public', 'admin.html')); });

io.on('connection', (socket) => {
  console.log('새로운 유저가 접속했습니다! socket ID:', socket.id);

  // 관리자 페이지가 접속했음을 알리는 이벤트
  socket.on('adminConnect', () => {
    socket.join(ADMIN_ROOM);
    console.log('관리자가 접속했습니다.');
    // 접속한 관리자에게 현재 게임방 목록을 보내줍니다.
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
    
    // 해당 방 플레이어들에게 최신 정보를 방송
    io.to(code).emit('updateRoom', gameRooms[code].players);
    // 모든 관리자에게 최신 게임방 목록 정보를 방송
    io.to(ADMIN_ROOM).emit('updateAdmin', gameRooms);
  });

  socket.on('disconnect', () => {
    console.log('유저가 접속을 끊었습니다. socket ID:', socket.id);
    // 추후 로직 추가
  });
});

server.listen(PORT, () => {
  console.log(`서버가 ${PORT}번 포트에서 실행 중입니다.`);
});

io.on('connection', (socket) => {
  // ... ('adminConnect', 'joinGame' 이벤트 리스너는 이전과 동일) ...

  // --- 새로운 이벤트 리스너 추가 ---
  // 'startGame' 이벤트를 관리자로부터 수신합니다.
  socket.on('startGame', (roomCode) => {
    console.log(`[${roomCode}] 방의 게임 시작 요청을 받았습니다.`);
    // 여기에 다음 단계에서 역할을 배정하고 게임을 시작하는 로직을 추가할 겁니다.
  });

  // ... ('disconnect' 이벤트 리스너는 이전과 동일) ...
});