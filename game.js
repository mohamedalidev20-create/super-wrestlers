// ضع رابط سيرفر Socket.IO المنشور هنا بعد نشر backend.
const SERVER_URL = "https://YOUR-SERVER-DOMAIN.example";

const CHARACTERS = [
  "Nova","Blaze","Frost","Volt","Titan","Shadow","Comet","Vortex",
  "Phoenix","Glacier","Storm","Echo","Atlas","Lumen","Rogue","Orbit",
  "Quake","Mystic","Pulse","Solar","Lunar","Cinder","Aero","Neon",
  "Drift","Spark","Boulder","Mirage","Flare","Cyclone","Prism","Cosmo"
];
const ARENAS = [
  "Neon City","Sky Temple","Crystal Dome","Volcano Ring",
  "Ice Fortress","Jungle Arena","Moon Base","Desert Colosseum"
];
const ARENA_COLORS = [0x172b4d,0x3b245f,0x174d50,0x542d22,0x31516b,0x245039,0x171d46,0x59452b];

const $ = id => document.getElementById(id);
const characterSelect = $("character");
const arenaSelect = $("arena");
CHARACTERS.forEach((name,i)=>characterSelect.add(new Option(`${i+1}. ${name}`,name)));
ARENAS.forEach((name,i)=>arenaSelect.add(new Option(name,String(i))));

let socket = null, roomCode = null, isHost = false, myId = null;
let scene, camera, renderer, arenaFloor;
let avatars = new Map(), keys = new Set(), myPosition = {x:0,z:0};
let gameStarted = false, lastMoveSent = 0;

function setStatus(message){ $("status").textContent = message; }
function connect(){
  if(socket?.connected) return Promise.resolve();
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error("انتهت مهلة الاتصال بالسيرفر")),10000);
    socket.once("connect",()=>{clearTimeout(timer);myId=socket.id;resolve();});
    socket.once("connect_error",err=>{clearTimeout(timer);reject(err);});
    socket.connect();
  });
}

$("createBtn").onclick = async ()=>{
  try{
    await connect();
    socket.emit("createRoom",{character:characterSelect.value,arena:Number(arenaSelect.value)},reply=>{
      if(!reply?.ok){setStatus(reply?.error||"تعذر إنشاء الغرفة");return;}
      roomCode=reply.code;isHost=true;showLobby();
    });
  }catch(e){setStatus("مش قادر أوصل للسيرفر. راجع رابط السيرفر.");}
};
$("joinBtn").onclick = async ()=>{
  const code=$("roomCode").value.trim().toUpperCase();
  if(!code){setStatus("اكتب كود الغرفة الأول.");return;}
  try{
    await connect();
    socket.emit("joinRoom",{code,character:characterSelect.value},reply=>{
      if(!reply?.ok){setStatus(reply?.error||"تعذر دخول الغرفة");return;}
      roomCode=code;isHost=false;showLobby();
    });
  }catch(e){setStatus("مش قادر أوصل للسيرفر. راجع رابط السيرفر.");}
};
function showLobby(){
  $("lobby").hidden=false;
  $("codeLabel").textContent=roomCode;
  setStatus("اتصلت بالغرفة بنجاح!");
}
$("startBtn").onclick=()=>socket?.emit("startMatch",{code:roomCode},reply=>{
  if(!reply?.ok)setStatus(reply?.error||"مش قادر أبدأ المباراة");
});
$("leaveBtn").onclick=()=>{if(socket&&roomCode)socket.emit("leaveRoom",{code:roomCode});location.reload();};

if(!SERVER_URL.startsWith("https://YOUR-SERVER")){
  // لا شيء؛ سيتم الاتصال عند إنشاء أو دخول غرفة.
}

socket = io(SERVER_URL,{autoConnect:false,transports:["websocket","polling"]});
socket.on("connect",()=>{myId=socket.id;});
socket.on("roomUpdate",room=>{
  $("codeLabel").textContent=room.code;
  $("teamLabel").textContent=`اللاعبون: ${room.players.length}/8`;
  $("players").innerHTML="";
  room.players.forEach(p=>{
    const li=document.createElement("li");
    li.textContent=`${p.character} — ${p.team==="blue"?"الأزرق":"البرتقالي"}${p.id===myId?" (أنت)":""}`;
    $("players").appendChild(li);
  });
  $("startBtn").disabled=room.hostId!==myId;
});
socket.on("matchStarted",data=>{
  $("menu").hidden=true;$("game").hidden=false;gameStarted=true;
  $("matchStatus").textContent=`الساحة: ${ARENAS[data.arena]||ARENAS[0]}`;
  init3D(data.arena);
  updatePlayers(data.players);
});
socket.on("state",data=>{
  if(!gameStarted)return;
  updatePlayers(data.players);
  $("matchStatus").textContent=data.winner?`الفريق ${data.winner==="blue"?"الأزرق":"البرتقالي"} فاز!`:"المباراة شغالة";
});
socket.on("roomError",msg=>setStatus(msg));
socket.on("disconnect",()=>{if(gameStarted)$("matchStatus").textContent="انقطع الاتصال بالسيرفر";});

function init3D(arenaIndex){
  const stage=$("stage");
  scene=new THREE.Scene();
  scene.background=new THREE.Color(ARENA_COLORS[arenaIndex]||0x172b4d);
  scene.fog=new THREE.Fog(scene.background,18,42);
  camera=new THREE.PerspectiveCamera(55,stage.clientWidth/stage.clientHeight,.1,100);
  camera.position.set(0,13,18);camera.lookAt(0,0,0);
  renderer=new THREE.WebGLRenderer({antialias:true});
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));
  renderer.setSize(stage.clientWidth,stage.clientHeight);
  stage.appendChild(renderer.domElement);
  scene.add(new THREE.HemisphereLight(0xffffff,0x35405a,2));
  const light=new THREE.DirectionalLight(0xffffff,2.2);light.position.set(5,12,8);scene.add(light);

  arenaFloor=new THREE.Mesh(new THREE.CylinderGeometry(10,10,.5,64),
    new THREE.MeshStandardMaterial({color:0x303a4b,roughness:.8}));
  arenaFloor.position.y=-.4;scene.add(arenaFloor);
  const ring=new THREE.Mesh(new THREE.TorusGeometry(9.6,.12,8,80),
    new THREE.MeshStandardMaterial({color:0xffb347,metalness:.5}));
  ring.rotation.x=Math.PI/2;ring.position.y=-.08;scene.add(ring);

  for(let i=0;i<12;i++){
    const a=i/12*Math.PI*2;
    const post=new THREE.Mesh(new THREE.CylinderGeometry(.16,.16,3,12),
      new THREE.MeshStandardMaterial({color:0xc5d1df,metalness:.5}));
    post.position.set(Math.cos(a)*10,1.1,Math.sin(a)*10);scene.add(post);
  }
  window.addEventListener("resize",resize3D);
  window.addEventListener("keydown",onKeyDown);
  window.addEventListener("keyup",onKeyUp);
  animate();
}
function resize3D(){
  if(!renderer)return;const stage=$("stage");
  camera.aspect=stage.clientWidth/stage.clientHeight;camera.updateProjectionMatrix();
  renderer.setSize(stage.clientWidth,stage.clientHeight);
}
function makeAvatar(player){
  const group=new THREE.Group();
  const color=player.team==="blue"?0x32a5ff:0xff9238;
  const mat=new THREE.MeshStandardMaterial({color,roughness:.65});
  const body=new THREE.Mesh(new THREE.CapsuleGeometry(.48,.85,5,10),mat);
  body.position.y=1.05;group.add(body);
  const head=new THREE.Mesh(new THREE.SphereGeometry(.34,18,14),
    new THREE.MeshStandardMaterial({color:0xe6b99a}));
  head.position.y=1.95;group.add(head);
  const aura=new THREE.Mesh(new THREE.TorusGeometry(.62,.045,8,32),
    new THREE.MeshBasicMaterial({color:player.team==="blue"?0x54c7ff:0xffb347}));
  aura.rotation.x=Math.PI/2;aura.position.y=.12;group.add(aura);
  const bar=new THREE.Mesh(new THREE.BoxGeometry(1.1,.09,.08),
    new THREE.MeshBasicMaterial({color:0x25e878}));
  bar.position.y=2.45;group.add(bar);group.userData.healthBar=bar;
  group.userData.playerId=player.id;
  scene.add(group);return group;
}
function updatePlayers(players){
  const alive=new Set(players.map(p=>p.id));
  for(const [id,obj] of avatars){if(!alive.has(id)){scene.remove(obj);avatars.delete(id);}}
  players.forEach(p=>{
    let obj=avatars.get(p.id);if(!obj){obj=makeAvatar(p);avatars.set(p.id,obj);}
    obj.position.set(p.x,0,p.z);
    obj.userData.healthBar.scale.x=Math.max(.01,p.health/100);
    obj.userData.healthBar.position.x=-(1-p.health/100)*.55;
    if(p.id===myId)myPosition={x:p.x,z:p.z};
  });
}
function onKeyDown(e){keys.add(e.key.toLowerCase());if(e.code==="Space"){e.preventDefault();usePower();}}
function onKeyUp(e){keys.delete(e.key.toLowerCase());}
function usePower(){if(gameStarted&&socket)socket.emit("power",{code:roomCode});}
function animate(){
  if(!gameStarted)return;
  requestAnimationFrame(animate);
  const now=performance.now();
  let dx=0,dz=0;
  if(keys.has("w")||keys.has("arrowup"))dz-=.12;
  if(keys.has("s")||keys.has("arrowdown"))dz+=.12;
  if(keys.has("a")||keys.has("arrowleft"))dx-=.12;
  if(keys.has("d")||keys.has("arrowright"))dx+=.12;
  if((dx||dz)&&now-lastMoveSent>50){
    myPosition.x=Math.max(-8,Math.min(8,myPosition.x+dx));
    myPosition.z=Math.max(-8,Math.min(8,myPosition.z+dz));
    socket.emit("move",{code:roomCode,x:myPosition.x,z:myPosition.z});
    lastMoveSent=now;
  }
  const mine=avatars.get(myId);
  if(mine){camera.position.x+=(mine.position.x-camera.position.x)*.025;camera.lookAt(mine.position.x,0,mine.position.z);}
  renderer.render(scene,camera);
}
