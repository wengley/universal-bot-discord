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
// (Mantenha o seu código de inicialização do client aqui)
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
// (Mantenha o seu código de eventos/lógica de boas-vindas aqui)

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
// AUTENTICAÇÃO DISCORD (COMPLETA)
// ===============================
const CLIENT_ID = process.env.CLIENT_ID_BOT;
const CLIENT_SECRET = process.env.CLIENT_SECRET_BOT;
const CALLBACK_URL = process.env.CALLBACK_URL;

// 1. Configuração da Session
app.use(session({
    secret: 'UMA_CHAVE_MUITO_SECRETA_E_GRANDE', // Mude isso para uma string segura
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
    scope: ['identify', 'guilds'], // Escopos necessários para dashboard
}, (accessToken, refreshToken, profile, cb) => {
    // Aqui você pode salvar o profile (usuário) no seu banco de dados, se necessário
    return cb(null, profile);
}));

// 4. Serialização (Guarda o ID na session)
passport.serializeUser((user, done) => {
    done(null, user);
});

// 5. Desserialização (Recupera o objeto user)
passport.deserializeUser((obj, done) => {
    done(null, obj);
});

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
    // Redireciona para o Discord para autenticar
    passport.authenticate('discord', { scope: ['identify', 'guilds'] })(req, res);
});

// Rota de Callback (Retorna do Discord)
app.get('/callback', passport.authenticate('discord', {
    failureRedirect: '/' // Se falhar, volta para a homepage
}), (req, res) => {
    // Se for bem-sucedido, redireciona para o dashboard
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
    // Renderiza uma página inicial simples ou redireciona para o dashboard se autenticado
    if (req.isAuthenticated()) {
        return res.redirect('/dashboard');
    }
    // Você deve criar um arquivo 'views/index.ejs' ou similar para uma landing page.
    res.send('<p>Bem-vindo ao Painel. <a href="/login">Faça Login com Discord</a></p>');
});

// =========================================================
// ROTA DE DASHBOARD (Que estava falhando: AGORA DEFINIDA)
// =========================================================
app.get('/dashboard', isAuthenticated, (req, res) => {
    
    const userGuilds = req.user.guilds.filter(g => {
        const perms = parseInt(g.permissions, 10);
        // Filtra por Admin (8) ou Gerenciar Servidor (32)
        return ((perms & 0x8) === 0x8) || ((perms & 0x20) === 0x20); 
    });

    const botGuildIds = client.guilds.cache.map(g => g.id);
    
    const dashboardGuilds = userGuilds.map(g => {
        const botInGuild = botGuildIds.includes(g.id);
        const userPerms = parseInt(g.permissions, 10);
        const canConfigure = botInGuild && (((userPerms & 0x8) === 0x8) || ((userPerms & 0x20) === 0x20));

        return {
            id: g.id,
            name: g.name,
            icon: g.icon,
            isInBot: botInGuild, 
            canConfigure: canConfigure, 
        };
    });

    res.render('dashboard', { 
        user: req.user, 
        guilds: dashboardGuilds,
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
    const guild = client.guilds.cache.get(req.params.guildId);
    if (!guild) return res.status(404).send('Servidor inválido ou bot não está nele.');

    // Verifica permissão do usuário
    const member = guild.members.cache.get(req.user.id);
    if (!member || !member.permissions.has('ADMINISTRATOR') && !member.permissions.has('MANAGE_GUILD')) {
        return res.status(403).send('Você não tem permissão para gerenciar este servidor.');
    }

    res.render('guild_settings', { 
        user: req.user,
        guild: guild,
        channels: guild.channels.cache.filter(c => c.type === 0),
        activePage: 'settings'
    });
});

// ROTA DE BOAS-VINDAS (GET/POST) - Mantidas da última resposta
// ... (Mantenha as rotas /dashboard/:guildId/welcome e /dashboard/:guildId/welcome/save)
// O código para estas rotas está na resposta anterior e foi validado.

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