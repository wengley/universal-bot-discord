// =========================
// GEMINI - SISTEMA COMPLETO
// =========================
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const path = require('path');
const bodyParser = require('body-parser');
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const { QuickDB } = require('quick.db');
const db = new QuickDB();

const app = express();
const PORT = process.env.PORT || 3000;

// =========================
// BOT DISCORD
// =========================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.once('ready', () => {
  console.log(`✅ Bot conectado como ${client.user.tag}`);
});
client.login(process.env.TOKEN);

// =========================
// CONFIG EXPRESS
// =========================
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// =========================
// AUTENTICAÇÃO DISCORD
// =========================
passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

passport.use(new DiscordStrategy({
  clientID: process.env.CLIENT_ID,
  clientSecret: process.env.CLIENT_SECRET,
  callbackURL: process.env.CALLBACK_URL,
  scope: ['identify', 'guilds']
}, (accessToken, refreshToken, profile, done) => {
  process.nextTick(() => done(null, profile));
}));

app.use(session({
  secret: 'chave-super-secreta',
  resave: false,
  saveUninitialized: false
}));
app.use(passport.initialize());
app.use(passport.session());

// =========================
// FUNÇÕES AUXILIARES
// =========================
function isAuthenticated(req, res, next) {
  if (req.isAuthenticated()) return next();
  res.redirect('/login');
}

const replacePlaceholders = (text, member) => {
  if (!text) return '';
  return text
    .replace(/\{member\}/g, member.user.username)
    .replace(/\{member_mention\}/g, `<@${member.id}>`)
    .replace(/\{server\}/g, member.guild.name);
};

const buildEmbed = (embedConfig, member) => {
  if (!embedConfig || !embedConfig.enabled) return null;
  const embed = new EmbedBuilder()
    .setColor(embedConfig.color || '#5865F2')
    .setTitle(replacePlaceholders(embedConfig.title || '', member))
    .setDescription(replacePlaceholders(embedConfig.description || '', member));
  return embed;
};

// =========================
// ROTAS PRINCIPAIS
// =========================
app.get('/', (req, res) => {
  res.render('index', { user: req.user });
});

app.get('/login', passport.authenticate('discord'));
app.get('/callback', passport.authenticate('discord', {
  failureRedirect: '/'
}), (req, res) => res.redirect('/dashboard'));

app.get('/logout', (req, res) => {
  req.logout(() => res.redirect('/'));
});

// =========================
// DASHBOARD SERVIDORES
// =========================
app.get('/dashboard', isAuthenticated, async (req, res) => {
  res.render('dashboard', { user: req.user });
});

app.get('/dashboard/:guildId', isAuthenticated, async (req, res) => {
  try {
    const guildId = req.params.guildId;
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return res.send('Bot não está neste servidor.');

    const joinData = await db.get(`join_notif_${guildId}`) || {};
    const leaveData = await db.get(`leave_notif_${guildId}`) || {};
    const dmData = await db.get(`dm_notif_${guildId}`) || {};
    const autoRole = await db.get(`autorole_${guildId}`) || 'none';

    res.render('guild_config', {
      user: req.user,
      guild,
      joinData,
      leaveData,
      dmData,
      autoRole
    });
  } catch (err) {
    console.error('Erro ao renderizar dashboard:', err);
    res.status(500).send('Erro interno no painel.');
  }
});

// =========================
// ROTAS DE SALVAMENTO E TESTE
// =========================
const hasManageOrAdmin = (userGuild) => {
  if (!userGuild) return false;
  const perms = parseInt(userGuild.permissions || 0, 10);
  return ((perms & 0x8) === 0x8) || ((perms & 0x20) === 0x20);
};

const pushLog = async (guildId, type, message) => {
  try {
    const key = `logs_${guildId}`;
    const arr = (await db.get(key)) || [];
    arr.unshift({ type, message, timestamp: new Date().toISOString() });
    await db.set(key, arr.slice(0, 200));
  } catch (e) {
    console.error('Erro ao salvar log:', e);
  }
};

// --- AutoRole ---
app.post('/dashboard/:guildId/autorole', isAuthenticated, async (req, res) => {
  try {
    const guildId = req.params.guildId;
    const roleId = String(req.body.roleId || 'none');
    await db.set(`autorole_${guildId}`, roleId);
    await pushLog(guildId, 'CONFIG', `Auto-role atualizado por ${req.user.username}`);
    res.json({ success: true, message: 'Auto-role salvo com sucesso.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Erro interno.' });
  }
});

// --- Salvar entrada ---
app.post('/dashboard/:guildId/save_join', isAuthenticated, async (req, res) => {
  try {
    const guildId = req.params.guildId;
    const payload = {
      channelId: String(req.body.channelId || 'none'),
      text: String(req.body.text || ''),
      embed: req.body.embed || { enabled: false }
    };
    await db.set(`join_notif_${guildId}`, payload);
    await pushLog(guildId, 'CONFIG', `Mensagem de entrada atualizada por ${req.user.username}`);
    res.json({ success: true, message: 'Mensagem de entrada salva.' });
  } catch {
    res.status(500).json({ success: false, message: 'Erro ao salvar.' });
  }
});

// --- Salvar saída ---
app.post('/dashboard/:guildId/save_leave', isAuthenticated, async (req, res) => {
  try {
    const guildId = req.params.guildId;
    const payload = {
      channelId: String(req.body.channelId || 'none'),
      text: String(req.body.text || ''),
      embed: req.body.embed || { enabled: false }
    };
    await db.set(`leave_notif_${guildId}`, payload);
    await pushLog(guildId, 'CONFIG', `Mensagem de saída atualizada por ${req.user.username}`);
    res.json({ success: true, message: 'Mensagem de saída salva.' });
  } catch {
    res.status(500).json({ success: false, message: 'Erro ao salvar.' });
  }
});

// --- Salvar DM ---
app.post('/dashboard/:guildId/save_dm', isAuthenticated, async (req, res) => {
  try {
    const guildId = req.params.guildId;
    const payload = {
      text: String(req.body.text || ''),
      embed: req.body.embed || { enabled: false }
    };
    await db.set(`dm_notif_${guildId}`, payload);
    await pushLog(guildId, 'CONFIG', `Mensagem DM atualizada por ${req.user.username}`);
    res.json({ success: true, message: 'Mensagem DM salva.' });
  } catch {
    res.status(500).json({ success: false, message: 'Erro ao salvar.' });
  }
});

// --- Testar entrada ---
app.post('/dashboard/:guildId/test_join', isAuthenticated, async (req, res) => {
  try {
    const guildId = req.params.guildId;
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return res.status(404).json({ success: false, message: 'Bot não está no servidor.' });

    const member = await guild.members.fetch(req.user.id).catch(() => null);
    if (!member) return res.status(404).json({ success: false, message: 'Você não é membro.' });

    const channel = guild.channels.cache.get(req.body.channelId);
    if (!channel) return res.status(404).json({ success: false, message: 'Canal não encontrado.' });

    const embed = buildEmbed(req.body.embed, member);
    const text = replacePlaceholders(req.body.text, member);
    await channel.send({ content: text || null, embeds: embed ? [embed] : [] });

    res.json({ success: true, message: 'Mensagem de teste enviada.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Erro ao enviar teste.' });
  }
});

// --- Testar DM ---
app.post('/dashboard/:guildId/test_dm', isAuthenticated, async (req, res) => {
  try {
    const guildId = req.params.guildId;
    const guild = client.guilds.cache.get(guildId);
    const member = await guild.members.fetch(req.user.id).catch(() => null);
    if (!member) return res.status(404).json({ success: false, message: 'Você não é membro.' });

    const embed = buildEmbed(req.body.embed, member);
    const text = replacePlaceholders(req.body.text, member);
    await member.send({ content: text || null, embeds: embed ? [embed] : [] });

    res.json({ success: true, message: 'DM de teste enviada.' });
  } catch {
    res.status(500).json({ success: false, message: 'Erro ao enviar DM.' });
  }
});

// =========================
// INICIAR SERVIDOR
// =========================
app.listen(PORT, () => console.log(`🌐 Painel rodando na porta ${PORT}`));
