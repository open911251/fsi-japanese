// 語音收發中繼（DAVE 相容層）
// 背景：Discord 2026-03 起強制語音 E2EE（DAVE），Python 生態（discord-ext-voice-recv）尚未支援，
// discord.js @discordjs/voice 0.19.2+ 配合 @snazzah/davey 已修復——所以收發音走 Node，大腦留在 Python。
// 職責：進/出頻道（127.0.0.1:8790 控制）、收音斷句（AfterSilence 800ms）、
//       把 PCM 丟給 Python（8789 /voice/utterance）、播回覆 WAV、barge-in。
const fs = require('fs');
const path = require('path');
const http = require('http');
const { Readable } = require('stream');
const { Client, GatewayIntentBits } = require('discord.js');
const {
  joinVoiceChannel, EndBehaviorType, createAudioPlayer, createAudioResource,
  StreamType, VoiceConnectionStatus, entersState,
} = require('@discordjs/voice');
const prism = require('prism-media');

const RAW = fs.readFileSync(path.join(__dirname, '..', 'config.json'), 'utf8');
const CFG = JSON.parse(RAW);
const BRAIN = 'http://127.0.0.1:' + (CFG.listen_port || 8789);
// Discord ID 超過 JS 安全整數，JSON.parse 會把數字型別的 id 四捨五入——從原文抽字串
const TARGET = (RAW.match(/"discord_user_id"\s*:\s*"?(\d+)"?/) || [])[1] || String(CFG.discord_user_id);
const CONTROL_PORT = CFG.relay_port || 8790;
const MIN_UTT_BYTES = Math.floor(48000 * 2 * 2 * 0.35); // 0.35 秒（48k 立體聲 s16）

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates] });
const player = createAudioPlayer();
let conn = null;
let busy = false;

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

function postBrain(p, body) {
  return new Promise((resolve, reject) => {
    const req = http.request(BRAIN + p, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' } }, res => {
      const bufs = [];
      res.on('data', d => bufs.push(d));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(bufs) }));
    });
    req.on('error', reject);
    req.setTimeout(180000, () => req.destroy(new Error('timeout')));
    if (body) req.write(body);
    req.end();
  });
}

function playWav(buf) {
  player.play(createAudioResource(Readable.from(buf), { inputType: StreamType.Arbitrary }));
}

function findUserVC() {
  for (const g of client.guilds.cache.values()) {
    const vs = g.voiceStates.cache.get(TARGET);
    if (vs && vs.channelId) return g.channels.cache.get(vs.channelId);
  }
  return null;
}

async function handleUtterance(pcm) {
  if (pcm.length < MIN_UTT_BYTES) return;
  if (busy) { log('busy, drop', pcm.length); return; } // 上一句還在跑就丟棄，不排隊回舊話
  busy = true;
  try {
    const r = await postBrain('/voice/utterance', pcm);
    if (r.status === 200 && r.body.length) playWav(r.body);
  } catch (e) {
    log('utterance err:', e.message);
  } finally {
    busy = false;
  }
}

async function join() {
  const ch = findUserVC();
  if (!ch) return false;
  conn = joinVoiceChannel({
    channelId: ch.id,
    guildId: ch.guild.id,
    adapterCreator: ch.guild.voiceAdapterCreator,
    selfDeaf: false,
  });
  await entersState(conn, VoiceConnectionStatus.Ready, 15000);
  conn.subscribe(player);
  const receiver = conn.receiver;
  receiver.speaking.on('start', userId => {
    if (userId !== TARGET) return;
    player.stop(); // barge-in：使用者開口就閉嘴
    if (receiver.subscriptions.has(userId)) return;
    const opus = receiver.subscribe(userId, { end: { behavior: EndBehaviorType.AfterSilence, duration: 800 } });
    const dec = new prism.opus.Decoder({ rate: 48000, channels: 2, frameSize: 960 });
    const chunks = [];
    opus.pipe(dec);
    dec.on('data', c => chunks.push(c));
    dec.on('end', () => handleUtterance(Buffer.concat(chunks)));
    opus.on('error', e => log('opus err:', e.message));
    dec.on('error', e => log('decode err:', e.message));
  });
  try {
    const r = await postBrain('/voice/greet', null);
    if (r.status === 200) playWav(r.body);
  } catch (e) { log('greet err:', e.message); }
  log('joined', ch.name);
  return true;
}

http.createServer((req, res) => {
  if (req.method !== 'POST') { res.statusCode = 404; return res.end(); }
  if (req.url === '/join') {
    join().then(ok => res.end(ok ? 'ok' : 'no'))
      .catch(e => { log('join err:', e.message); res.end('no'); });
  } else if (req.url === '/leave') {
    if (conn) { conn.destroy(); conn = null; }
    res.end('ok');
  } else { res.statusCode = 404; res.end(); }
}).listen(CONTROL_PORT, '127.0.0.1', () => log('control on', CONTROL_PORT));

client.on('clientReady', () => log('relay logged in as', client.user.tag));
client.on('ready', () => log('relay ready as', client.user.tag));
client.login(CFG.discord_token);
