// ===============================
// IMPORTAÇÕES PRINCIPAIS
// ===============================
const { Client, GatewayIntentBits, Collection, Partials, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { QuickDB } = require('quick.db');
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const bodyParser = require('body-parser');

// ===============================
// CONFIGURAÇÕES INICIAIS
// ===============================
dotenv.config();
const db = new QuickDB();
const prefix = '!';

// ===============================
// CONFIGURAÇÃO DO CLIENT DISCORD
// ===============================
const client = new Client({
    // Garante que o bot possa ver guilds, mensagens, conteúdo e membros
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
    ],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

client.commands = new Collection();

// ===============================
// CARREGAMENTO DE COMANDOS
// ===============================
const commandsPath = path.join(__dirname, 'commands');
if (fs.existsSync(commandsPath)) {
    const commandFiles = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));
    for (const file of commandFiles) {
        const cmd = require(path.join(commandsPath, file));
        if (cmd.name && cmd.execute) client.commands.set(cmd.name, cmd);
    }
} else {
    console.warn('[AVISO] Pasta "commands" não encontrada!');
}

// ===============================
// EVENTOS DISCORD E FUNÇÕES AUXILIARES
// ===============================

// Funções Auxiliares (mantidas para o painel)
const replacePlaceholders = (text, member) => {
    if (!text) return '';
    return text
        .replace(/\{user\}/g, member.user.tag)
        .replace(/\{mention\}/g, `<@${member.id}>`)
        .replace(/\{guild\}/g, member.guild.name)
        .replace(/\{count\}/g, member.guild.memberCount);
};

const buildEmbed = (data, member) => {
    if (!data?.enabled) return null;
    const e = new EmbedBuilder();
    if (data.color) e.setColor(parseInt(data.color.replace('#', '0x'), 16));
    if (data.title) e.setTitle(replacePlaceholders(data.title, member));
    if (data.description) e.setDescription(replacePlaceholders(data.description, member));
    if (data.footerText) e.setFooter({ text: replacePlaceholders(data.footerText, member) });
    e.setTimestamp();
    return e;
};

// Evento de Membro Entrando (Exemplo)
client.on('guildMemberAdd', async member => {
    const join = await db.get(`join_notif_${member.guild.id}`);
    if (!join || !join.channelId) return;
    const ch = member.guild.channels.cache.get(join.channelId);
    if (!ch) return;
    const embed = buildEmbed(join.embed, member);
    const text = replacePlaceholders(join.text, member);
    ch.send({ content: text || null, embeds: embed ? [embed] : [] }).catch(() => {});
});

// Evento de Comando (Prefixado)
client.on('messageCreate', async message => {
    if (message.author.bot || !message.content.startsWith(prefix)) return;
    const args = message.content.slice(prefix.length).trim().split(/ +/);
    const name = args.shift().toLowerCase();
    const command = client.commands.get(name);
    if (!command) return;
    try {
        await command.execute(message, args, client, db);
    } catch (e) {
        console.error(e);
        message.reply('❌ Erro ao executar comando.');
    }
});

// ===============================
// SERVIDOR WEB (EXPRESS)
// ===============================
const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
// CORREÇÃO CRÍTICA DO RENDER E SINTOXE EJS
app.engine('ejs', require('ejs').__express); 
app.use(express.static('public')); // Permite CSS/JS/Imagens
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// ===============================
// AUTENTICAÇÃO DISCORD
// ===============================
app.use(
    session({
        secret: process.env.SESSION_SECRET || 'uma-chave-secreta-forte',
        resave: false,
        saveUninitialized: false,
    })
);

app.use(passport.initialize());
app.use(passport.session());

// CONFIGURAÇÃO DE VARIÁVEIS DE AMBIENTE (Corrigido para _BOT)
const CLIENT_ID = process.env.CLIENT_ID_BOT;
const CLIENT_SECRET = process.env.CLIENT_SECRET_BOT;
const CALLBACK_URL = process.env.CALLBACK_URL;

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

passport.use(
    new DiscordStrategy(
        {
            clientID: CLIENT_ID, 
            clientSecret: CLIENT_SECRET, 
            callbackURL: CALLBACK_URL,
            scope: ['identify', 'guilds'],
        },
        (accessToken, refreshToken, profile, done) => {
            process.nextTick(() => done(null, profile));
        }
    )
);

// ===============================
// ROTAS WEB
// ===============================
const isAuthenticated = (req, res, next) => {
    if (req.isAuthenticated()) return next();
    if (req.method === 'POST') {
        return res.status(401).json({ success: false, message: 'Sua sessão expirou.' });
    }
    res.redirect('/login');
};

app.get('/', (req, res) => {
    res.status(200).send(client.isReady() ? `✅ Bot online. Ping: ${client.ws.ping}ms` : '⏳ Bot iniciando...');
});

app.get('/login', passport.authenticate('discord', { scope: ['identify', 'guilds'] }));
app.get(
    '/callback',
    passport.authenticate('discord', { failureRedirect: '/' }),
    (req, res) => res.redirect('/dashboard')
);
app.get('/logout', (req, res, next) => req.logout(() => res.redirect('/')));

// Rota de Seleção de Servidor (LÓGICA FINAL DE FILTRO)
app.get('/dashboard', isAuthenticated, (req, res) => {
    
    // 1. Filtra as guilds do usuário por permissão (Admin/Gerenciar)
    const userGuilds = req.user.guilds.filter(g => {
        // PERMISSÕES: 0x8 é Administrador, 0x20 é Gerenciar Servidor
        const perms = parseInt(g.permissions, 10);
        return ((perms & 0x8) === 0x8) || ((perms & 0x20) === 0x20); 
    });

    // 2. Lista de IDs das guilds onde o BOT está
    const botGuildIds = client.guilds.cache.map(g => g.id);
    
    // 3. Categoriza as Guilds
    const dashboardGuilds = userGuilds.map(g => {
        const botInGuild = botGuildIds.includes(g.id);
        
        // Define se o usuário PODE configurar (Bot está + Usuário tem permissão)
        const userPerms = parseInt(g.permissions, 10);
        const canConfigure = botInGuild && (((userPerms & 0x8) === 0x8) || ((userPerms & 0x20) === 0x20));

        return {
            id: g.id,
            name: g.name,
            icon: g.icon,
            isInBot: botInGuild, // O bot está no servidor?
            canConfigure: canConfigure, // O usuário pode configurar?
        };
    });

    res.render('dashboard', { 
        user: req.user, 
        guilds: dashboardGuilds, // Lista filtrada e categorizada
        guild: null, 
        activePage: 'home' 
    }); 
});

// Rota de Atualizações
app.get('/updates', isAuthenticated, (req, res) => {
    res.render('bot_updates', { user: req.user, guild: null, activePage: 'updates' });
});

// Rota de Configurações Gerais
app.get('/dashboard/:guildId', isAuthenticated, async (req, res) => {
    const guildId = req.params.guildId;
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return res.status(404).send('Servidor inválido ou bot não está nele.');

    const currentAutoroleId = await db.get(`autorole_${guildId}`) || 'none';
    const roles = guild.roles.cache.filter(r => r.id !== guild.id).sort((a, b) => b.position - a.position);

    res.render('guild_settings', { 
        user: req.user,
        guild: guild,
        roles: roles,
        currentAutoroleId: currentAutoroleId,
        activePage: 'settings'
    });
});

// Rota de Comandos
app.get('/dashboard/:guildId/config', isAuthenticated, async (req, res) => {
    const guild = client.guilds.cache.get(req.params.guildId);
    if (!guild) return res.status(404).send('Servidor inválido.');
    
    const commandsList = client.commands.map(cmd => ({
        name: prefix + cmd.name,
        desc: cmd.description || 'Sem descrição.',
    }));
    
    res.render('guild_config', { 
        user: req.user, 
        guild, 
        commands: commandsList,
        activePage: 'config',
    });
});

// Rota de Logs de Eventos
app.get('/dashboard/:guildId/events', isAuthenticated, async (req, res) => {
    const guild = client.guilds.cache.get(req.params.guildId);
    if (!guild) return res.status(404).send('Servidor inválido ou bot não está nele.');

    const recentLogs = [
        { type: 'INFO', message: 'Logs de evento ainda não implementados.', timestamp: new Date() },
    ];

    res.render('guild_events', {
        user: req.user,
        guild: guild, 
        logs: recentLogs,
        activePage: 'events',
    });
});

// Rota para salvar configurações (Exemplo)
app.post('/dashboard/:guildId/save', isAuthenticated, async (req, res) => {
    // Lógica para salvar configurações (e.g., autorole) aqui
    res.json({ success: true, message: 'Configurações salvas (Lógica a ser implementada).' });
});


// ===============================
// INICIA O BOT E O SERVIDOR WEB (GARANTIA DE ORDEM CORRETA)
// ===============================

// 1. Faz login do bot
client.login(process.env.TOKEN_BOT);

// 2. Ouve na porta SOMENTE após o bot estar pronto
client.once('ready', () => {
    console.log(`✅ Bot online como ${client.user.tag}`);

    app.listen(PORT, () => {
        console.log(`🌐 Painel rodando na porta ${PORT}`);
        console.log(`🔗 Link do Painel: ${CALLBACK_URL.replace('/callback', '')}`);
    });
});