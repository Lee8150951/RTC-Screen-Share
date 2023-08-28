let roomid = null;
let userName = null;
// websocket 实例
let chatSocket = null;
// 获取摄像头和音频配置
let mediaConstraints = { 'audio': true, 'video': true };
// 视频盒子
let videoBox = document.getElementById('videoBox');
// 文本消息盒子
let textBox = document.getElementById('textBox');
// 存储用户对象
peerList = {};

// 获得用户屏幕数据流并加入房间
const getUserMedia = () => {
  console.log('into getUserMedia');
  try {
    // 不支持相关设备
    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
      console.log('getUserMedia is not supported');
    }
    const mediaConstraints = { 'audio': true, 'video': true };

    const videoElement = document.getElementById('localVideo');
    console.log('get local stream');
    // 获取本地流
    navigator.mediaDevices.getDisplayMedia(mediaConstraints).then((mediaStream) => {
      // 通过video进行渲染
      videoElement.srcObject = mediaStream;
      window.localStream = mediaStream;
      roomid = document.getElementById('roomid').value;
      userName = document.getElementById('username').value;
      if (roomid == null || userName == null) {
        alert('姓名和id不能为空');
      }
      sendMessage({
        roomid: roomid,
        myName: userName,
        type: 'join',
      });
    })
  } catch (err) {
    console.log('获取本地摄像头失败：' + err);
  }
}

// websocket初始化
const websocketInit = () => {
  try {
    chatSocket = new WebSocket('wss://localhost:3000');
  } catch (error) {
    console.log('发生错误：' + error);
  }
  // 监听消息
  chatSocket.onmessage = function (evt) {
    const msg = JSON.parse(evt.data);
    switch (msg.type) {
      case 'joined':
        console.log('user joined');
        // 所有成员, 新加入的user
        userJoined(msg.userList, msg.userName);
        break;
      case '__ice_candidate':
        console.log('__ice_candidate');
        //如果是一个ICE的候选，则将其加入到PeerConnection中
        if (msg.candidate) {
          peerList[msg.account] && peerList[msg.account].addIceCandidate(msg.candidate).catch(() => { });
          //这个其实时表示判断&&前面的结果然后计算后面的表达式;
          console.log('end __ice_candidate');
        }
        break;
      case 'video-offer':
        console.log('video-offer');
        createAnswer(msg);
        break;
      case 'video-answer':
        console.log('video-answer');
        peerList[msg.p2paccount] && peerList[msg.p2paccount].setRemoteDescription(msg.sdp).catch(function () { });
        break;
      case 'disconnected':
        console.log('disconnected');
        console.log(msg.account);
        let dom = document.querySelector('#' + [msg.account, userName].sort().join('-'));
        if (dom) {
          dom.remove();
        }
        break;
      case 'error':
        alert(msg.msg);
        break;
      default:
        console.log('未知的信息收到了:');
        console.log(msg);
    }
  };
  //连接成功建立的回调方法
  chatSocket.onopen = () => {
    console.log("onopen");
  }
  //连接关闭的回调方法
  chatSocket.onclose = () =>  {
    console.log("websocket.onclose");
  }
  //连接发生错误的回调方法
  chatSocket.onerror = () =>  {
    console.log("chatSocket.error");
  };
}

// 监听用户加入
const userJoined = (userList, sender) => {
  // 如果sender等于自己时，就向所有的users发送音视频数据
  if (sender === userName && userList.length > 1) {
    userList.forEach((opponent) => {
      let p2p = {};
      let arr = [opponent, userName];
      // 会话对
      p2p.account = arr.sort().join('-');
      // 查询是否存在通信对，如果不存在则发起音频传输
      if (!peerList[p2p.account] && opponent !== userName) {
        getPeerConnection(p2p.account, opponent);
        createOffer(p2p.account, opponent, peerList[p2p.account]);
      }
    });
  }
}

// 发送消息
const sendMessage = (msg) => {
  msg.roomid = roomid;
  chatSocket.send(JSON.stringify(msg));
}

/** WebRTC **/
// 创建RTCPeerConnection
const getPeerConnection = (p2p, oppo) => {
  // 创建RTCPeerConnection
  const peer = new RTCPeerConnection();
  // 向RTCPeerConnection中加入需要发送的流
  console.log('添加本地流');
  peer.addStream(window.localStream);
  // 检测是否存在peer.addTrack方法
  if (peer.addTrack !== undefined) {
    peer.ontrack = (event) => {
      console.log('添加远端流');
      // 如果检测到媒体流连接到本地，将其绑定到一个video标签上输出
      let videos = document.querySelector('#' + p2p);
      if (videos) {
        videos.srcObject = event.streams[0];
      } else {
        let video = document.createElement('video');
        video.controls = true;
        video.autoplay = true;
        video.srcObject = event.streams[0];
        video.id = p2p;
        video.className = 'col-md-6';
        videoBox.append(video);
      }
    }
  } else {
    peer.onaddstream = (event) => {
      let videos = document.querySelector('#' + p2p);
      if (videos) {
        videos.srcObject = event.stream;
      } else {
        let video = document.createElement('video');
        video.controls = true;
        video.autoplay = true;
        video.srcObject = event.stream;
        video.id = p2p;
        video.className = 'col-md-4';
        videoBox.append(video);
      }
    };
  }
  // 发送ICE候选到其他客户端
  peer.onicecandidate = (event) => {
    const opponent = oppo;
    console.log('into peer.onicecandidate');
    if (event.candidate) {
      sendMessage({
        roomid: '10',
        type: '__ice_candidate',
        candidate: event.candidate,
        opponame: opponent,
        account: p2p
      });
    }
  };
  peerList[p2p] = peer;  //添加map成员;
}

// 创建offer
const createOffer = (p2pAccount, oppoName, peer) => {
  // 发送offer，发送本地session描述
  peer.createOffer({
    offerToReceiveAudio: true,
    offerToReceiveVideo: true,
  }).then((desc) => {
    peer.setLocalDescription(desc);
    sendMessage({
      roomid: '10',
      type: 'video-offer',
      sdp: desc,
      sender: userName,
      receiver: oppoName,
      account: p2pAccount,
    });
    console.log("receiver" + oppoName);
  });
}

// 接收到了offer做出响应
const createAnswer = (msg) => {
  getPeerConnection(msg.p2paccount, msg.sender);
  // 上面的调用会产生一个 peerList[p2p.account];
  peerList[msg.p2paccount].setRemoteDescription(msg.sdp)
    .then(() => peerList[msg.p2paccount].createAnswer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: true,
    }))
    .then((answer) => peerList[msg.p2paccount].setLocalDescription(answer))
    .then(() => {
      sendMessage({
        roomid: '10',
        type: 'video-answer',
        sdp: peerList[msg.p2paccount].localDescription,
        sender: userName,
        receiver: msg.sender,
        p2paccount: msg.p2paccount
      })
    })
    .catch(() => { });
}

//网页加载时运行;
websocketInit();
