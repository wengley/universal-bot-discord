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
// ... (Mantenha o seu código de inicialização do client aqui)
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
// ... (Mantenha o seu código de eventos/lógica de boas-vindas e buildEmbed aqui)

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
// AUTENTICAÇÃO DISCORD (FINAL)
// ===============================
const CLIENT_ID = process.env.CLIENT_ID_BOT;
const CLIENT_SECRET = process.env.CLIENT_SECRET_BOT;
const CALLBACK_URL = process.env.CALLBACK_URL;

// 1. Configuração da Session
app.use(session({
    secret: process.env.SESSION_SECRET || 'UMA_CHAVE_MUITO_SECRETA_E_GRANDE', // Use uma variável de ambiente!
    resave: false,
    saveUninitialized: false,
}));

// 2. Inicializa o Passport
app.use(passport.initialize());
app.use(passport.session());

// 3. Define a Estratégia Discord
passport.use(new DiscordStrategy({
    clientID: CLIENT_ID,
    clientSecret: CLIENT_SECRET,
    callbackURL: CALLBACK_URL,
    // NOVO ESCOPO: 'identify' (user), 'guilds' (servidores), 'email' (para ter o nome de exibição)
    scope: ['identify', 'email', 'guilds'], 
}, (accessToken, refreshToken, profile, cb) => {
    // Adiciona propriedades de exibição para facilitar no EJS
    profile.displayName = profile.username; // Nome de exibição (username)
    profile.firstName = profile.username.split('_')[0] || profile.username.split('#')[0]; // Simula o primeiro nome
    return cb(null, profile);
}));

// 4. Serialização e Desserialização (Padrão)
passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

// 6. Middleware de Autenticação
const isAuthenticated = (req, res, next) => {
    if (req.isAuthenticated()) return next();
    res.redirect('/login');
};

// ===============================
// ROTAS WEB (AGORA COM AS ROTAS BASE DE LOGIN)
// ===============================

// Rota de Login (Inicia o processo OAuth)
app.get('/login', (req, res) => {
    passport.authenticate('discord', { scope: ['identify', 'email', 'guilds'] })(req, res);
});

// Rota de Callback (Retorna do Discord)
app.get('/callback', passport.authenticate('discord', {
    failureRedirect: '/' 
}), (req, res) => {
    // Redireciona diretamente para a página de Servidores
    res.redirect('/dashboard'); 
});

// Rota de Logout
app.get('/logout', (req, res) => {
    req.logout((err) => {
        if (err) return res.send("Erro ao fazer logout.");
        res.redirect('/');
    });
});

// Rota Principal (Homepage/Landing Page Simples)
app.get('/', (req, res) => {
    // Se logado, vai direto para o dashboard, senão exibe a landing page
    if (req.isAuthenticated()) return res.redirect('/dashboard');
    res.render('index_landing', { title: 'Universal Bot' }); // Crie este arquivo EJS
});

// =========================================================
// ROTA DE DASHBOARD (FILTRO FINAL E REFORÇADO)
// =========================================================
app.get('/dashboard', isAuthenticated, (req, res) => {
    
    // Filtra apenas servidores onde o usuário TEM a permissão ADMINISTRATOR (0x8) OU é DONO (0x2000000000000)
    const userGuilds = req.user.guilds.filter(g => {
        const perms = parseInt(g.permissions, 10);
        // Filtra por Administrador (0x8)
        const isAdmin = (perms & 0x8) === 0x8;
        // Filtra por Dono (flag 'owner' deve ser true)
        const isOwner = g.owner; 

        return isAdmin || isOwner; 
    });

    const botGuildIds = client.guilds.cache.map(g => g.id);
    
    const dashboardGuilds = userGuilds.map(g => {
        const botInGuild = botGuildIds.includes(g.id);
        const userPerms = parseInt(g.permissions, 10);
        
        // Botão Configurar só aparece se o BOT estiver no servidor
        const canConfigure = botInGuild;

        return {
            id: g.id,
            name: g.name,
            icon: g.icon,
            isInBot: botInGuild, 
            canConfigure: canConfigure,
            // Adiciona a informação de permissão para exibir no dashboard
            userRole: g.owner ? 'Dono' : ((userPerms & 0x8) === 0x8 ? 'Administrador' : 'Membro'),
        };
    });

    res.render('dashboard', { 
        user: req.user, 
        guilds: dashboardGuilds,
        guild: null, 
        activePage: 'servers' 
    }); 
});

// Rota de Atualizações
app.get('/updates', isAuthenticated, (req, res) => {
    res.render('bot_updates', { user: req.user, guild: null, activePage: 'updates' });
});

// Rota de Configurações Gerais
app.get('/dashboard/:guildId', isAuthenticated, async (req, res) => {
    const guild = client.guilds.cache.get(req.params.guildId);
    if (!guild) return res.status(404).send('Servidor inválido ou bot não está nele.');

    // ... (Verificação de permissão)
    
    res.render('guild_settings', { 
        user: req.user,
        guild: guild,
        channels: guild.channels.cache.filter(c => c.type === 0),
        activePage: 'settings'
    });
});
// ... (Mantenha as rotas de Boas-Vindas)

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