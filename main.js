const express = require('express');
const WebSocket = require('ws');
const log4js = require('log4js');
const fs = require('fs');
const https = require('https');

// 配置日志
const logger = log4js.getLogger();
log4js.configure({
  appenders: {
    console: { type: 'console' },
    file: { type: 'file', filename: 'logs/app.log' },
  },
  categories: {
    default: { appenders: ['console', 'file'], level: 'info' },
  },
});

// 创建Express应用程序
const app = express();

// 创建https服务器
const options = {
  key: fs.readFileSync("./key.pem"), // key文件路径
  cert: fs.readFileSync("./cert.pem") // crt文件路径
}
const httpServer = https.createServer(options, app);

// 将client文件夹设置为静态文件目录
app.use('/', express.static(__dirname + '/client'));

// 创建WebSocket服务器
const WebSocketServer = WebSocket.Server;
const wsServer = new WebSocketServer({ server: httpServer });

/** 信令服务器配置 **/
// wsServer表示整个服务器对象，ws表示单次websocket连接
const roomInfo = {};
wsServer.on('connection', (ws) => {
  console.log('----------- WebSocket Open -----------');
  let userInfo = {};
  // 处理信令
  ws.on('message', (message) => {
    let msgString;
    const msg = JSON.parse(message);
    switch (msg.type) {
      /* 加入房间 */
      case 'join': {
        const rid = msg.roomid;
        const uname = msg.myName;
        logger.info(`${uname} join the room`);
        const wsInfo = {
          wsname: ws,
          roomid: rid,
          userName: uname,
        }
        // 查询房间是否存在，如果存在则加入，如果不存在则生成房间
        if (roomInfo[rid]) {
          if (roomInfo[rid].names.indexOf(uname) === -1) {
            roomInfo[rid].names.push(uname);
            roomInfo[rid].clients.push(wsInfo);
            logger.info(`There are ${roomInfo[rid].clients.length} users in room: ${rid}.`);
          } else {
            const data = {
              type: 'error',
              roomid: msg.roomid,
              msg: '用户名已存在！',
            };
            wsServer.sendToOne(ws, data);
            return false;
          }
        } else {
          roomInfo[rid] = {};
          roomInfo[rid].names = [uname];
          roomInfo[rid].clients = [wsInfo];
        }
        userInfo = {
          roomid: rid,
          userName: uname,
        };
        // 用户加入
        logger.info(`Room: ${rid} join a new user: ${uname}`);
        const msgString = {
          type: 'joined',
          roomid: rid,
          userList: roomInfo[rid].names,
          userName: uname
        };
        wsServer.broadcast(msgString);
        sendToClients = false;
        break;
      }
      /* ICE信息交换 */
      case '__ice_candidate': {
        logger.info('ICE candidate');
        const msgString = {
          type: '__ice_candidate',
          candidate: msg.candidate,
          roomid: msg.roomid,
          receiver: msg.opponame,
          account: msg.account,
          sender: msg.userName
        };
        // 向房间中所有用户用户发送ICE信息
        roomInfo[msg.roomid].clients.forEach((opponent) => {
          if (opponent.uname === msg.receiver) {
            wsServer.sendToOne(opponent.wsname, msgString);
          }
        });
        break;
      }
      case 'video-offer': {
        logger.info('Initiate video offer');
        msgString = {
          type: 'video-offer',
          roomid: msg.roomid,
          sdp: msg.sdp,
          sender: msg.sender,
          receiver: msg.receiver,
          p2paccount: msg.account,
        };
        roomInfo[msg.roomid].clients.forEach((opponent) => {
          if (opponent.userName === msg.receiver) {
            wsServer.sendToOne(opponent.wsname, msgString);
            logger.info('send video offer');
          }
        });
        break;
      }
      case 'video-answer': {
        logger.info('Initiate video answer');
        msgString = {
          type: 'video-answer',
          roomid: msg.roomid,
          sender: msg.sender,
          receiver: msg.receiver,
          sdp: msg.sdp,
          p2paccount: msg.p2paccount
        };
        roomInfo[msg.roomid].clients.forEach((opponent) => {
          if (opponent.userName === msg.receiver) {
            wsServer.sendToOne(opponent.wsname, msgString);
            logger.info('send video answer');
          }
        })
        break;
      }
    }
  });

  // 断开连接（表明用户退出）
  ws.on('close', () => {
    logger.info('User log out.');
    if (userInfo.userName) {
      const roomid = userInfo.roomid;
      const userName = userInfo.userName;
      roomInfo[roomid].clients = roomInfo[roomid].clients.filter(v => v.userName !== userName);
      roomInfo[roomid].names = roomInfo[roomid].names.filter(v => v !== userName);
      wsServer.broadcast({
        type: 'disconnected',
        roomid: roomid,
        account: userName
      });
    }
    ws.close();
  });
});

// 向所有已连接客户端进行广播
wsServer.broadcast = (data) => {
  const roomid = data.roomid;
  const msgString = JSON.stringify(data);
  roomInfo[roomid].clients.forEach((client) => {
    client.wsname.send(msgString);
  });
};

// 单个客户端发送信息
wsServer.sendToOne = (client, data) => {
  const msgString = JSON.stringify(data);
  client.send(msgString);
}

// 启动服务器并监听指定端口
const port = 3000;
httpServer.listen(port, () => {
  console.log(`----------- Server Open on ${port} -----------`);
});
