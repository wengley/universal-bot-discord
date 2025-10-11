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
// SERVIDOR WEB (EXPRESS)
// ===============================
const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static('public'));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// ===============================
// AUTENTICAÇÃO DISCORD
// ===============================
const CLIENT_ID = process.env.CLIENT_ID_BOT;
const CLIENT_SECRET = process.env.CLIENT_SECRET_BOT;
const CALLBACK_URL = process.env.CALLBACK_URL;

app.use(session({
    secret: process.env.SESSION_SECRET || 'UMA_CHAVE_MUITO_SECRETA_E_GRANDE',
    resave: false,
    saveUninitialized: false,
}));

app.use(passport.initialize());
app.use(passport.session());

passport.use(new DiscordStrategy({
    clientID: CLIENT_ID,
    clientSecret: CLIENT_SECRET,
    callbackURL: CALLBACK_URL,
    scope: ['identify', 'email', 'guilds'], 
}, (accessToken, refreshToken, profile, cb) => {
    // Adiciona o global_name (nome de exibição) ao profile para uso no EJS
    profile.displayName = profile.global_name || profile.username;
    return cb(null, profile);
}));

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

const isAuthenticated = (req, res, next) => {
    if (req.isAuthenticated()) return next();
    res.redirect('/login');
};

// ===============================
// FUNÇÃO DE VERIFICAÇÃO (CRÍTICA)
// ===============================
async function getGuildContext(req) {
    if (!client.isReady()) return { status: 503, message: 'Bot não está pronto. Tente novamente em instantes.' };

    const guild = client.guilds.cache.get(req.params.guildId);
    if (!guild) return { status: 404, message: 'Servidor inválido ou bot não está nele.' };

    let member;
    try {
        member = await guild.members.fetch(req.user.id);
    } catch (e) {
        return { status: 403, message: 'Você não é mais membro deste servidor ou erro de permissão.' };
    }

    const isOwner = guild.ownerId === req.user.id;
    const hasAdmin = member.permissions.has('ADMINISTRATOR');

    if (!isOwner && !hasAdmin) {
        return { status: 403, message: 'Você não tem permissão de Administrador ou Dono para gerenciar este servidor.' };
    }
    
    return { guild, member, status: 200 };
}


// ===============================
// ROTAS WEB
// ===============================

// ... (Rotas / e /login /callback /logout - Mantenha as que você tinha) ...
app.get('/', (req, res) => {
    const ping = client.ws.ping || 'Calculando...';
    if (req.isAuthenticated()) return res.redirect('/dashboard');
    res.render('index_landing', { 
        title: 'Universal Bot',
        ping: ping,
        isAuthenticated: req.isAuthenticated(),
    }); 
});
app.get('/login', (req, res) => {
    passport.authenticate('discord', { scope: ['identify', 'email', 'guilds'] })(req, res);
});

app.get('/callback', passport.authenticate('discord', {
    failureRedirect: '/' 
}), (req, res) => {
    res.redirect('/dashboard'); 
});

app.get('/logout', (req, res) => {
    req.logout((err) => {
        if (err) return res.send("Erro ao fazer logout.");
        res.redirect('/');
    });
});
app.get('/dashboard', isAuthenticated, (req, res) => {
    
    const userGuilds = req.user.guilds.filter(g => {
        const perms = parseInt(g.permissions, 10);
        const isAdmin = (perms & 0x8) === 0x8;
        const isOwner = g.owner; 
        return isAdmin || isOwner; 
    });

    const botGuildIds = client.guilds.cache.map(g => g.id);
    
    const dashboardGuilds = userGuilds.map(g => {
        const botInGuild = botGuildIds.includes(g.id);
        const userPerms = parseInt(g.permissions, 10);
        
        const canConfigure = botInGuild;

        return {
            id: g.id,
            name: g.name,
            icon: g.icon,
            isInBot: botInGuild, 
            canConfigure: canConfigure,
            userRole: g.owner ? 'Dono' : ((userPerms & 0x8) === 0x8 ? 'Administrador' : 'Membro'),
        };
    });

    res.render('dashboard', { 
        user: req.user, 
        guilds: dashboardGuilds,
        guild: null, 
        activePage: 'servers',
        showInviteAlert: req.query.invite === 'denied' 
    }); 
});
app.get('/updates', isAuthenticated, (req, res) => {
    res.render('bot_updates', { user: req.user, guild: null, activePage: 'updates' });
});

// Rota para Simular Convite Negado (Bot privado)
app.get('/invite/denied', isAuthenticated, (req, res) => {
    res.redirect('/dashboard?invite=denied');
});

// ===============================
// ROTAS DE CONFIGURAÇÃO (FUNCIONAL)
// ===============================

// Configurações Gerais
app.get('/dashboard/:guildId', isAuthenticated, async (req, res) => {
    const context = await getGuildContext(req);
    if (context.status !== 200) return res.status(context.status).send(context.message);

    const botPing = client.ws.ping; 

    res.render('guild_settings', { 
        user: req.user,
        guild: context.guild,
        channels: context.guild.channels.cache.filter(c => c.type === 0),
        activePage: 'settings',
        botPing: botPing, 
    });
});

// 1. ROTAS BOAS-VINDAS (WELCOME)
app.get('/dashboard/:guildId/welcome', isAuthenticated, async (req, res) => {
    const context = await getGuildContext(req);
    if (context.status !== 200) return res.status(context.status).send(context.message);
    
    const settings = {
        channel_id: await db.get(`guild_${context.guild.id}.welcome.channel_id`) || '',
        message: await db.get(`guild_${context.guild.id}.welcome.message`) || 'Boas-vindas, {user}!',
    };

    const textChannels = context.guild.channels.cache
        .filter(c => c.type === 0 && c.permissionsFor(client.user.id)?.has('SendMessages'))
        .map(c => ({ id: c.id, name: c.name }));

    res.render('welcome_settings', { 
        user: req.user,
        guild: context.guild,
        activePage: 'welcome',
        settings: settings,
        textChannels: textChannels,
        message: req.query.message
    });
});

app.post('/dashboard/:guildId/welcome', isAuthenticated, async (req, res) => {
    const context = await getGuildContext(req);
    if (context.status !== 200) return res.status(context.status).send(context.message);

    const { channel_id, welcome_message } = req.body;

    await db.set(`guild_${context.guild.id}.welcome.channel_id`, channel_id);
    await db.set(`guild_${context.guild.id}.welcome.message`, welcome_message);

    res.redirect(`/dashboard/${context.guild.id}/welcome?message=success`);
});


// 2. ROTAS AUTOROLE
app.get('/dashboard/:guildId/autorole', isAuthenticated, async (req, res) => {
    const context = await getGuildContext(req);
    if (context.status !== 200) return res.status(context.status).send(context.message);

    const settings = {
        role_id: await db.get(`guild_${context.guild.id}.autorole.role_id`) || '',
    };
    
    const roles = context.guild.roles.cache
        .filter(r => r.editable && r.id !== context.guild.id)
        .map(r => ({ id: r.id, name: r.name }));

    res.render('autorole_settings', { 
        user: req.user,
        guild: context.guild,
        activePage: 'autorole',
        settings: settings,
        roles: roles,
        message: req.query.message
    });
});

app.post('/dashboard/:guildId/autorole', isAuthenticated, async (req, res) => {
    const context = await getGuildContext(req);
    if (context.status !== 200) return res.status(context.status).send(context.message);

    const { role_id } = req.body;

    await db.set(`guild_${context.guild.id}.autorole.role_id`, role_id);

    res.redirect(`/dashboard/${context.guild.id}/autorole?message=success`);
});


// ROTAS PLACEHOLDER (Event Logs - Em Construção)
app.get('/dashboard/:guildId/eventlogs', isAuthenticated, async (req, res) => {
    const context = await getGuildContext(req);
    if (context.status !== 200) return res.status(context.status).send(context.message);

    res.render('guild_feature', { 
        user: req.user,
        guild: context.guild,
        activePage: 'eventlogs', 
        featureName: 'Event Logs',
        message: 'Em construção. Esta funcionalidade estará disponível em breve!',
    });
});


// ===============================
// INICIA O BOT E O SERVIDOR WEB
// ===============================
client.login(process.env.TOKEN_BOT);
client.once('ready', () => {
    console.log(`✅ Bot online como ${client.user.tag}`);
    app.listen(PORT, () => {
        console.log(`🌐 Painel rodando na porta ${PORT}`);
    });
});