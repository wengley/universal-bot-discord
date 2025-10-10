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
    profile.displayName = profile.username;
    profile.firstName = profile.username.split('_')[0] || profile.username.split('#')[0];
    return cb(null, profile);
}));

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

const isAuthenticated = (req, res, next) => {
    if (req.isAuthenticated()) return next();
    res.redirect('/login');
};

// ===============================
// ROTAS WEB
// ===============================

// Rota Principal (Landing Page com Ping) - Ponto 7
app.get('/', (req, res) => {
    const ping = client.ws.ping || 'Calculando...';
    if (req.isAuthenticated()) return res.redirect('/dashboard');
    // Renderiza a landing page que você criará
    res.render('index_landing', { 
        title: 'Universal Bot',
        ping: ping,
        isAuthenticated: req.isAuthenticated(),
    }); 
});

// Rotas de Auth (Login, Callback, Logout)
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

// ROTA DE DASHBOARD (Filtro e Lógica)
app.get('/dashboard', isAuthenticated, (req, res) => {
    
    const userGuilds = req.user.guilds.filter(g => {
        const perms = parseInt(g.permissions, 10);
        // Filtra por Administrador (0x8) ou Dono
        const isAdmin = (perms & 0x8) === 0x8;
        const isOwner = g.owner; 

        return isAdmin || isOwner; 
    });

    const botGuildIds = client.guilds.cache.map(g => g.id);
    
    const dashboardGuilds = userGuilds.map(g => {
        const botInGuild = botGuildIds.includes(g.id);
        const userPerms = parseInt(g.permissions, 10);
        
        // O botão Configurar só aparece se o BOT estiver no servidor (Ponto 2)
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
        // Adiciona a variável para exibir o alerta de convite (Ponto 8)
        showInviteAlert: req.query.invite === 'denied' 
    }); 
});

// Rota de Atualizações
app.get('/updates', isAuthenticated, (req, res) => {
    res.render('bot_updates', { user: req.user, guild: null, activePage: 'updates' });
});

// Rota de Configurações Gerais (CRÍTICO: Correção do Internal Server Error) - Ponto 4, 9
app.get('/dashboard/:guildId', isAuthenticated, async (req, res) => {
    
    // 1. Garante que o bot está pronto e tem o guild no cache
    if (!client.isReady()) return res.status(503).send('Bot não está pronto. Tente novamente em instantes.');

    const guild = client.guilds.cache.get(req.params.guildId);
    if (!guild) return res.status(404).send('Servidor inválido ou bot não está nele.');

    // 2. Garante que o membro está no cache do guild (importante para evitar crash)
    let member;
    try {
        member = await guild.members.fetch(req.user.id);
    } catch (e) {
        // Se a busca falhar (membro saiu ou erro de API)
        console.error(`Erro ao buscar membro ${req.user.id} no guild ${guild.id}:`, e);
        return res.status(403).send('Você não é mais membro deste servidor ou erro de permissão.');
    }

    // 3. Verifica permissão de Owner ou Admin
    const isOwner = guild.ownerId === req.user.id;
    const hasAdmin = member.permissions.has('ADMINISTRATOR');

    if (!isOwner && !hasAdmin) {
        return res.status(403).send('Você não tem permissão de Administrador ou Dono para gerenciar este servidor.');
    }
    
    // Supondo que você quer o ping na tela de Configurações Gerais
    const botPing = client.ws.ping; 

    res.render('guild_settings', { 
        user: req.user,
        guild: guild,
        channels: guild.channels.cache.filter(c => c.type === 0),
        activePage: 'settings',
        botPing: botPing, // Ponto 6
    });
});

// Rota para Simular Convite Negado (Ponto 8)
app.get('/invite/denied', isAuthenticated, (req, res) => {
    // Redireciona para o dashboard com o parâmetro de alerta
    res.redirect('/dashboard?invite=denied');
});

// ... (Mantenha as rotas de Boas-Vindas se você as tiver)

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