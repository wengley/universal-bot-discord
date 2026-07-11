// ===============================
// 1. IMPORTAÇÕES PRINCIPAIS
// ===============================
const { 
    Client, GatewayIntentBits, Collection, Partials, EmbedBuilder, 
    PermissionsBitField, ChannelType 
} = require('discord.js');
const { SupabaseDB } = require('./db/supabaseDb');
const { adaptInteraction, buildArgs } = require('./utils/interactionAdapter');
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

// ===============================
// 2. CONFIGURAÇÕES INICIAIS
// ===============================
dotenv.config();
const db = new SupabaseDB(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const prefix = '!';

// Constantes do Servidor Web
const PORT = process.env.PORT || 3000;
const app = express();

// URL do Ícone de Fallback (Global)
const FALLBACK_ICON_URL = 'https://cdn.discordapp.com/attachments/1414043107867234467/1426614319499706401/captura-de-tela-2018-09-24-as-20.png?ex=68ebdd9e&is=68ea8c1e&hm=50e13cf484f649f0de0daaa6f54d0021a59a136265a01e5531b1008bd0f38a5';

// Lista de Comandos para Config. Geral
const BOT_COMMANDS = [
    { name: `!ppt`, description: 'Inicia uma partida de Pedra, Papel e Tesoura contra o Bot.' },
    { name: `!ping`, description: 'Mostra a latência (ping) do Bot.' },
    { name: `!clear [número]`, description: 'Limpa o número especificado de mensagens no canal. (Requer permissão de Gerenciar Mensagens).' },
    { name: `!lock`, description: 'Bloqueia o canal atual para todos os membros. (Requer permissão de Gerenciar Canais).' },
    { name: `!unlock`, description: 'Desbloqueia o canal atual. (Requer permissão de Gerenciar Canais).' },
];

// Estrutura Padrão de Embed
const DEFAULT_EMBED = {
    enabled: false,
    color: '#5865F2',
    author_name: '',
    author_icon_url: '',
    title: '',
    description: '',
    image_url: '',
    thumbnail_url: '',
    footer_text: '',
    footer_icon_url: '',
};

// ===============================
// 3. FUNÇÕES DE PLACEHOLDERS E EMBED
// ===============================
function processPlaceholders(text, member, guild, isLeave = false) {
    if (!text) return text;
    
    // Cria um objeto de usuário mock se for uma saída, para não dar erro
    const user = isLeave ? { 
        displayName: member.user.username, 
        id: member.id, 
        tag: member.user.tag,
        avatarURL: () => member.user.displayAvatarURL(),
        username: member.user.username
    } : member;

    let processedText = text;

    processedText = processedText.replace(/<\[@user\]>/g, `<@${user.id}>`);
    processedText = processedText.replace(/<\[@user\.name\]>/g, user.displayName || user.user.username);
    processedText = processedText.replace(/<\[user\]>/g, (user.user?.username) || user.username || user.tag);
    processedText = processedText.replace(/<\[user\.id\]>/g, user.id);
    const avatarUrl = user.avatarURL ? user.avatarURL() : (user.user ? user.user.displayAvatarURL() : '');
    processedText = processedText.replace(/<\[user\.avatar\]>/g, avatarUrl);
    processedText = processedText.replace(/<\[guild\.icon\]>/g, guild.iconURL({ size: 1024 }) || FALLBACK_ICON_URL); 
    processedText = processedText.replace(/<\[guild\.name\]>/g, guild.name);

    return processedText;
}

function createEmbedFromSettings(settings, member, guild, isLeave = false) {
    if (!settings || !settings.enabled) return null;
    if (!settings.description && !settings.title && !settings.image_url && !settings.thumbnail_url) return null; 
    
    settings = { ...DEFAULT_EMBED, ...settings };

    const embed = new EmbedBuilder()
        .setColor(settings.color || '#5865F2')
        .setDescription(processPlaceholders(settings.description || '', member, guild, isLeave));

    if (settings.title) {
        embed.setTitle(processPlaceholders(settings.title, member, guild, isLeave));
    }
    if (settings.author_name) {
        embed.setAuthor({
            name: processPlaceholders(settings.author_name, member, guild, isLeave),
            iconURL: processPlaceholders(settings.author_icon_url, member, guild, isLeave) || null,
        });
    }
    if (settings.thumbnail_url) {
        embed.setThumbnail(processPlaceholders(settings.thumbnail_url, member, guild, isLeave));
    }
    if (settings.image_url) {
        embed.setImage(processPlaceholders(settings.image_url, member, guild, isLeave));
    }
    if (settings.footer_text) {
        embed.setFooter({
            text: processPlaceholders(settings.footer_text, member, guild, isLeave),
            iconURL: processPlaceholders(settings.footer_icon_url, member, guild, isLeave) || null,
        });
    }

    return embed;
}

// ===============================
// 4. CONFIGURAÇÃO DO CLIENT DISCORD
// ===============================
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,           
        GatewayIntentBits.GuildMessages,    
        GatewayIntentBits.MessageContent,   
        
        GatewayIntentBits.GuildMembers,     
        GatewayIntentBits.GuildPresences,   
    ],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

client.commands = new Collection();

// Carrega todos os comandos de /commands para dentro de client.commands
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
for (const file of commandFiles) {
    try {
        const command = require(path.join(commandsPath, file));
        if (command?.name && typeof command.execute === 'function') {
            client.commands.set(command.name, command);
        } else {
            console.warn(`⚠️ Comando em ${file} não tem 'name' ou 'execute' válidos — ignorado.`);
        }
    } catch (e) {
        console.error(`❌ Erro ao carregar comando ${file}: ${e.message}`);
    }
}
console.log(`📦 ${client.commands.size} comandos carregados.`);

// ===============================
// 5. SERVIDOR WEB (EXPRESS & PASSPORT)
// ===============================
const CLIENT_ID = process.env.CLIENT_ID_BOT;
const CLIENT_SECRET = process.env.CLIENT_SECRET_BOT;
const CALLBACK_URL = process.env.CALLBACK_URL; 

app.use(express.static('public'));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(session({
    secret: process.env.SESSION_SECRET || 'UMA_CHAVE_MUITO_SECRETA_E_GRANDE',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: 'auto', maxAge: 60 * 60 * 1000 * 24 * 7 }
}));
app.use(passport.initialize());
app.use(passport.session());

passport.use(new DiscordStrategy({
    clientID: CLIENT_ID,
    clientSecret: CLIENT_SECRET,
    callbackURL: CALLBACK_URL,
    scope: ['identify', 'email', 'guilds'], 
}, (accessToken, refreshToken, profile, cb) => {
    profile.displayName = profile.global_name || profile.username;
    return cb(null, profile);
}));
passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

const isAuthenticated = (req, res, next) => {
    if (req.isAuthenticated()) return next();
    res.redirect('/login');
};

/**
 * @description Obtém o contexto do servidor, garantindo que o usuário tenha permissão.
 */
async function getGuildContext(req) {
    if (!client.isReady()) return { status: 503, message: 'Bot não está pronto.' };
    if (!req.user) return { status: 401, message: 'Usuário não autenticado.' };
    
    const guild = client.guilds.cache.get(req.params.guildId);
    if (!guild) return { status: 404, message: 'Servidor inválido ou bot não está nele.' };

    let member = null;
    let isOwner = guild.ownerId === req.user.id;
    let hasAdmin = false;

    try {
        member = await guild.members.fetch(req.user.id).catch(() => null);
        
        if (member) {
            hasAdmin = member.permissions.has(PermissionsBitField.Flags.Administrator);
        }
    } catch (e) {
        console.error(`Erro ao buscar membro: ${e.message}.`);
    }

    if (!isOwner && !hasAdmin) {
        return { 
            status: 403, 
            message: 'Você não tem permissão de Administrador ou Dono.' 
        };
    }
    
    // Cria um objeto 'mock' se o membro real não foi obtido (crítico para o EJS não quebrar)
    if (!member) {
         member = { 
            permissions: { has: (flag) => isOwner && flag === PermissionsBitField.Flags.Administrator },
            id: req.user.id,
            user: { 
                username: req.user.username, 
                tag: req.user.tag,
                displayAvatarURL: () => req.user.avatar ? `https://cdn.discordapp.com/avatars/${req.user.id}/${req.user.avatar}.png` : 'https://cdn.discordapp.com/embed/avatars/0.png'
            },
            displayName: req.user.displayName || req.user.username,
            avatarURL: () => req.user.avatar ? `https://cdn.discordapp.com/avatars/${req.user.id}/${req.user.avatar}.png` : 'https://cdn.discordapp.com/embed/avatars/0.png'
         };
    }

    const botAvatarUrl = client.user.displayAvatarURL({ size: 128 });
    
    return { guild, member, status: 200, botAvatarUrl, botPing: client.ws.ping };
}

// ===============================
// 6. ROTAS WEB 
// ===============================

// Landing Page
app.get('/', (req, res) => {
    const ping = client.ws.ping || 'Calculando...'; 
    const botAvatarUrl = client.isReady() ? client.user.displayAvatarURL({ size: 128 }) : FALLBACK_ICON_URL;
    
    if (req.isAuthenticated()) return res.redirect('/dashboard');
    
    res.render('landing_page', { 
        title: 'Universal Bot', 
        ping: ping, 
        isAuthenticated: req.isAuthenticated(),
        botAvatarUrl: botAvatarUrl,
        guild: null // Passado como null para evitar erros em includes
    }); 
});
app.get('/login', (req, res) => {
    passport.authenticate('discord', { scope: ['identify', 'email', 'guilds'] })(req, res);
});
app.get('/callback', passport.authenticate('discord', { failureRedirect: '/' }), (req, res) => {
    res.redirect('/dashboard'); 
});
app.get('/logout', (req, res, next) => {
    req.logout((err) => {
        if (err) { return next(err); }
        res.redirect('/');
    });
});
app.get('/invite/denied', isAuthenticated, (req, res) => {
    res.redirect('/dashboard?invite=denied');
});

// DASHBOARD DE SERVIDORES
app.get('/dashboard', isAuthenticated, (req, res) => {
    if (!client.isReady()) {
        return res.status(503).send('Bot está inicializando. Por favor, tente novamente em instantes.');
    }

    const userGuilds = req.user.guilds.filter(g => {
        const perms = parseInt(g.permissions, 10);
        const isAdmin = (perms & 0x8) === 0x8;
        const isOwner = g.owner; 
        return isAdmin || isOwner; 
    });
    const botGuildIds = client.guilds.cache.map(g => g.id);
    const botAvatarUrl = client.user.displayAvatarURL({ size: 128 });
    
    const dashboardGuilds = userGuilds.map(g => {
        const botInGuild = botGuildIds.includes(g.id);
        const userPerms = parseInt(g.permissions, 10);
        const iconUrl = g.icon 
            ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png?size=96` 
            : FALLBACK_ICON_URL; 
        
        return {
            id: g.id,
            name: g.name,
            icon: iconUrl, 
            isInBot: botInGuild, 
            canConfigure: botInGuild,
            userRole: g.owner ? 'Dono' : ((userPerms & 0x8) === 0x8 ? 'Administrador' : 'Membro'),
        };
    });

    res.render('dashboard', { 
        user: req.user, 
        guilds: dashboardGuilds,
        guild: null, 
        activePage: 'servers',
        showInviteAlert: req.query.invite === 'denied',
        botAvatarUrl: botAvatarUrl,
        
        // Variáveis CRÍTICAS para o dashboard.ejs
        client_id: client.user.id, 
        callback_url: CALLBACK_URL 
    }); 
});

// Rota base de CONFIGURAÇÃO DO SERVIDOR (Menu Geral)
app.get('/dashboard/:guildId', isAuthenticated, async (req, res) => {
    const context = await getGuildContext(req);
    if (context.status !== 200) {
        return res.status(context.status).send(`<h1>Erro ${context.status}</h1><p>${context.message}</p>`);
    }

    res.render('guild_settings', { 
        user: req.user,
        guild: context.guild, // CRÍTICO: Passa o objeto guild
        activePage: 'settings',
        botPing: context.botPing,
        commands: BOT_COMMANDS,
        botAvatarUrl: context.botAvatarUrl
    });
});

// ROTAS BOAS-VINDAS (GET e POST)
app.get('/dashboard/:guildId/welcome', isAuthenticated, async (req, res) => {
    const context = await getGuildContext(req);
    if (context.status !== 200) return res.status(context.status).send(`<h1>Erro ${context.status}</h1><p>${context.message}</p>`);
    
    const currentSettings = await db.get(`guild_${context.guild.id}.welcome`) || {};
    let textChannels = [];
    let errorMessage = null;

    try {
        textChannels = context.guild.channels.cache
            .filter(c => c.type === ChannelType.GuildText && c.permissionsFor(client.user.id)?.has(PermissionsBitField.Flags.SendMessages))
            .map(c => ({ id: c.id, name: c.name }));
    } catch (e) {
        console.error(`Erro ao carregar canais para Welcome: ${e.message}`);
        errorMessage = "Falha ao carregar canais de texto. Verifique as permissões do Bot.";
    }
    
    const settings = {
        join_enabled: currentSettings.join_enabled || false,
        join_channel_id: currentSettings.join_channel_id || '',
        join_message: currentSettings.join_message || 'Boas-vindas, <[@user]>! Esperamos que se divirta.',
        join_embed: { ...DEFAULT_EMBED, ...(currentSettings.join_embed || {}) },
        leave_enabled: currentSettings.leave_enabled || false,
        leave_channel_id: currentSettings.leave_channel_id || '',
        leave_message: currentSettings.leave_message || 'Adeus, <[@user.name]>. Sentiremos sua falta.',
        leave_embed: { ...DEFAULT_EMBED, ...(currentSettings.leave_embed || {}) },
        dm_enabled: currentSettings.dm_enabled || false,
        dm_message: currentSettings.dm_message || 'Obrigado por entrar no nosso servidor!',
        dm_embed: { ...DEFAULT_EMBED, ...(currentSettings.dm_embed || {}) },
    };

    res.render('welcome_settings', { 
        user: req.user,
        guild: context.guild,
        activePage: 'welcome',
        settings: settings,
        textChannels: textChannels,
        message: req.query.message,
        errorMessage: errorMessage, 
        botAvatarUrl: context.botAvatarUrl
    });
});

app.post('/dashboard/:guildId/welcome', isAuthenticated, async (req, res) => {
    const context = await getGuildContext(req);
    if (context.status !== 200) return res.status(context.status).send(`<h1>Erro ${context.status}</h1><p>${context.message}</p>`);

    const newSettings = {
        join_enabled: !!req.body.join_enabled,
        join_channel_id: req.body.join_channel_id || '',
        join_message: req.body.join_message || '',
        join_embed: { enabled: !!req.body.join_embed_enabled, color: req.body.join_embed_color, author_name: req.body.join_embed_author_name, author_icon_url: req.body.join_embed_author_icon_url, title: req.body.join_embed_title, description: req.body.join_embed_description, image_url: req.body.join_embed_image_url, thumbnail_url: req.body.join_embed_thumbnail_url, footer_text: req.body.join_embed_footer_text, footer_icon_url: req.body.join_embed_footer_icon_url },
        leave_enabled: !!req.body.leave_enabled,
        leave_channel_id: req.body.leave_channel_id || '',
        leave_message: req.body.leave_message || '',
        leave_embed: { enabled: !!req.body.leave_embed_enabled, color: req.body.leave_embed_color, author_name: req.body.leave_embed_author_name, author_icon_url: req.body.leave_embed_author_icon_url, title: req.body.leave_embed_title, description: req.body.leave_embed_description, image_url: req.body.leave_embed_image_url, thumbnail_url: req.body.leave_embed_thumbnail_url, footer_text: req.body.leave_embed_footer_text, footer_icon_url: req.body.leave_embed_footer_icon_url },
        dm_enabled: !!req.body.dm_enabled,
        dm_message: req.body.dm_message || '',
        dm_embed: { enabled: !!req.body.dm_embed_enabled, color: req.body.dm_embed_color, author_name: req.body.dm_embed_author_name, author_icon_url: req.body.dm_embed_author_icon_url, title: req.body.dm_embed_title, description: req.body.dm_embed_description, image_url: req.body.dm_embed_image_url, thumbnail_url: req.body.dm_embed_thumbnail_url, footer_text: req.body.dm_embed_footer_text, footer_icon_url: req.body.dm_embed_footer_icon_url },
    };

    await db.set(`guild_${context.guild.id}.welcome`, newSettings);
    res.redirect(`/dashboard/${context.guild.id}/welcome?message=success`);
});

app.post('/dashboard/:guildId/welcome/test', isAuthenticated, async (req, res) => {
    const context = await getGuildContext(req);
    if (context.status !== 200) return res.status(500).json({ success: false, message: context.message });

    const { type, channel_id, message, embed_data } = req.body;
    
    const channel = context.guild.channels.cache.get(channel_id);
    if (!channel || channel.type !== ChannelType.GuildText || !channel.permissionsFor(client.user.id)?.has(PermissionsBitField.Flags.SendMessages)) {
        return res.status(400).json({ success: false, message: 'Canal inválido, ou o Bot não pode enviar mensagens nele.' });
    }
    
    const mockMember = context.member; 
    const isLeave = type === 'leave';
    
    let content = processPlaceholders(message, mockMember, context.guild, isLeave);
    let embed = embed_data.enabled ? createEmbedFromSettings(embed_data, mockMember, context.guild, isLeave) : null;
    
    const testMessageSuffix = `\n*(Mensagem de Teste enviada via Painel por ${req.user.displayName})*`;
    
    if (embed) {
        const currentFooter = embed_data.footer_text || '';
        embed.setFooter({
            text: `${processPlaceholders(currentFooter, mockMember, context.guild, isLeave)} | MENSAGEM DE TESTE (Painel)`,
            iconURL: processPlaceholders(embed_data.footer_icon_url, mockMember, context.guild, isLeave),
        });
        content = content.length > 0 ? content + testMessageSuffix : testMessageSuffix;
    } else {
        content = `${content} ${testMessageSuffix}`;
    }

    try {
        await channel.send({ content: content, embeds: embed ? [embed] : [] });
        return res.json({ success: true, message: `Mensagem de Teste enviada com sucesso para #${channel.name}!` });
    } catch (error) {
        return res.status(500).json({ success: false, message: `Erro ao enviar: ${error.message}` });
    }
});

// ROTAS AUTOROLE (GET e POST)
app.get('/dashboard/:guildId/autorole', isAuthenticated, async (req, res) => {
    const context = await getGuildContext(req);
    if (context.status !== 200) return res.status(context.status).send(`<h1>Erro ${context.status}</h1><p>${context.message}</p>`);

    const currentSettings = await db.get(`guild_${context.guild.id}.autorole`) || {};
    let availableRoles = [];
    let errorMessage = null;

    try {
        const botMember = context.guild.members.cache.get(client.user.id);
        const botTopRole = botMember ? botMember.roles.highest.position : 0;

        availableRoles = context.guild.roles.cache
            .filter(role => !role.managed && role.position < botTopRole && role.id !== context.guild.id)
            .sort((a, b) => b.position - a.position)
            .map(role => ({ 
                id: role.id, 
                name: role.name, 
                color: `#${role.color.toString(16).padStart(6, '0').toUpperCase()}` 
            }));

    } catch (e) {
        console.error(`Erro ao carregar cargos para Autorole: ${e.message}`);
        errorMessage = "Falha ao carregar cargos. Verifique se o Bot tem permissão para ver todos os cargos.";
    }

    const settings = {
        enabled: currentSettings.enabled || false,
        roles: currentSettings.roles || [],
    };

    res.render('autorole_settings', {
        user: req.user,
        guild: context.guild,
        activePage: 'autorole',
        settings: settings,
        availableRoles: availableRoles,
        message: req.query.message,
        errorMessage: errorMessage, 
        botAvatarUrl: context.botAvatarUrl
    });
});

app.post('/dashboard/:guildId/autorole', isAuthenticated, async (req, res) => {
    const context = await getGuildContext(req);
    if (context.status !== 200) return res.status(context.status).send(`<h1>Erro ${context.status}</h1><p>${context.message}</p>`);

    const { enabled, roles } = req.body;
    
    const roleIds = roles ? roles.split(',').filter(id => id.length > 0) : [];

    const newSettings = {
        enabled: !!enabled,
        roles: roleIds,
    };

    await db.set(`guild_${context.guild.id}.autorole`, newSettings);
    res.redirect(`/dashboard/${context.guild.id}/autorole?message=success`);
});

// ROTAS GLOBAIS DE INFORMAÇÃO
// Rota de Updates (CRÍTICA: Passando guild: null)
app.get('/updates', isAuthenticated, async (req, res) => {
    const ping = client.ws.ping || 'N/A';
    const botAvatarUrl = client.isReady() ? client.user.displayAvatarURL({ size: 128 }) : FALLBACK_ICON_URL;
    
    res.render('bot_updates', { // Chama bot_updates.ejs
        user: req.user, 
        activePage: 'updates',
        botAvatarUrl: botAvatarUrl,
        guild: null, // CRÍTICO: Passado como null
        ping: ping 
    });
});

// ROTAS "EM CONSTRUÇÃO"
app.get('/dashboard/:guildId/security', isAuthenticated, async (req, res) => {
    const context = await getGuildContext(req);
    if (context.status !== 200) {
        return res.status(context.status).send(`<h1>Erro ${context.status}</h1><p>${context.message}</p>`);
    }
    res.render('security_settings', { 
        user: req.user, 
        guild: context.guild, 
        activePage: 'security', 
        botAvatarUrl: context.botAvatarUrl 
    });
});

app.get('/dashboard/:guildId/vip', isAuthenticated, async (req, res) => {
    const context = await getGuildContext(req);
    if (context.status !== 200) {
        return res.status(context.status).send(`<h1>Erro ${context.status}</h1><p>${context.message}</p>`);
    }
    res.render('vip_settings', { 
        user: req.user, 
        guild: context.guild, 
        activePage: 'vip', 
        botAvatarUrl: context.botAvatarUrl 
    });
});

app.get('/dashboard/:guildId/ticket', isAuthenticated, async (req, res) => {
    const context = await getGuildContext(req);
    if (context.status !== 200) {
        return res.status(context.status).send(`<h1>Erro ${context.status}</h1><p>${context.message}</p>`);
    }
    res.render('coming_soon', {
        user: req.user,
        guild: context.guild,
        activePage: 'ticket',
        activePageDisplay: 'Tickets/Suporte',
        botAvatarUrl: context.botAvatarUrl
    });
});

// 404 — rota inexistente
app.use((req, res) => {
    res.status(404).send(`<!DOCTYPE html><html lang="pt-br"><head><meta charset="UTF-8">
        <title>404 - Página não encontrada</title><link rel="stylesheet" href="/css/styles.css"></head>
        <body style="display:flex;align-items:center;justify-content:center;height:100vh;text-align:center;font-family:'Inter',sans-serif;">
        <div><h1 style="font-family:'Space Grotesk',sans-serif;font-size:3em;color:var(--accent);margin-bottom:10px;">404</h1>
        <p>Essa página não existe.</p>
        <a href="/dashboard" class="btn btn-primary" style="margin-top:15px;display:inline-block;">Voltar ao Painel</a></div>
        </body></html>`);
});

// Handler de erros — evita a tela branca genérica do Express quando algo quebra
app.use((err, req, res, next) => {
    console.error(`❌ Erro na rota ${req.method} ${req.originalUrl}:`, err.stack || err.message);
    res.status(500).send(`<!DOCTYPE html><html lang="pt-br"><head><meta charset="UTF-8">
        <title>Erro interno</title><link rel="stylesheet" href="/css/styles.css"></head>
        <body style="display:flex;align-items:center;justify-content:center;height:100vh;text-align:center;font-family:'Inter',sans-serif;">
        <div><h1 style="font-family:'Space Grotesk',sans-serif;font-size:3em;color:var(--danger);margin-bottom:10px;">Ops!</h1>
        <p>Algo deu errado ao carregar essa página. Já registrei o erro no log do servidor.</p>
        <a href="/dashboard" class="btn btn-primary" style="margin-top:15px;display:inline-block;">Voltar ao Painel</a></div>
        </body></html>`);
});

// ===============================
// 7. EVENTOS DISCORD
// ===============================

// Comandos por prefixo (!ping, !balance, etc.)
client.on('messageCreate', async message => {
    if (message.author.bot || !message.guild) return;
    if (!message.content.startsWith(prefix)) return;

    const args = message.content.slice(prefix.length).trim().split(/ +/);
    const commandName = args.shift().toLowerCase();
    if (!commandName) return;

    const command = client.commands.get(commandName)
        || client.commands.find(cmd => cmd.aliases && cmd.aliases.includes(commandName));
    if (!command) return;

    try {
        await command.execute(message, args, client, db);
    } catch (e) {
        console.error(`❌ Erro ao executar comando '${commandName}': ${e.message}`);
        message.reply('❌ Ocorreu um erro ao executar esse comando.').catch(() => {});
    }
});

client.on('guildMemberAdd', async member => {
    if (!member.guild || member.user.bot) return;

    // 1. Lógica de AutoRole
    try {
        const autoroleSettings = await db.get(`guild_${member.guild.id}.autorole`);
        if (autoroleSettings && autoroleSettings.enabled && autoroleSettings.roles.length > 0) {
            await member.roles.add(autoroleSettings.roles, 'AutoRole ativado via Painel.');
        }
    } catch (e) {
        console.error(`Erro ao aplicar AutoRole para ${member.user.tag}: ${e.message}`);
    }

    // 2. Lógica de Welcome
    try {
        const welcomeSettings = await db.get(`guild_${member.guild.id}.welcome`);
        
        // Mensagem de Entrada no Canal
        if (welcomeSettings && welcomeSettings.join_enabled && welcomeSettings.join_channel_id) {
            const channel = member.guild.channels.cache.get(welcomeSettings.join_channel_id);
            if (channel && channel.type === ChannelType.GuildText) {
                const message = processPlaceholders(welcomeSettings.join_message, member, member.guild);
                const embed = createEmbedFromSettings(welcomeSettings.join_embed, member, member.guild);
                
                await channel.send({ content: message, embeds: embed ? [embed] : [] });
            }
        }

        // Mensagem em DM
        if (welcomeSettings && welcomeSettings.dm_enabled && welcomeSettings.dm_message) {
            const dmMessage = processPlaceholders(welcomeSettings.dm_message, member, member.guild);
            const dmEmbed = createEmbedFromSettings(welcomeSettings.dm_embed, member, member.guild);
            
            await member.send({ content: dmMessage, embeds: dmEmbed ? [dmEmbed] : [] }).catch(e => console.log(`Não foi possível enviar DM para ${member.user.tag}`));
        }
    } catch (e) {
        console.error(`Erro ao enviar mensagem de Welcome para ${member.user.tag}: ${e.message}`);
    }
});

client.on('guildMemberRemove', async member => {
    if (!member.guild || member.user.bot) return;

    // Lógica de Saída (Leave)
    try {
        const welcomeSettings = await db.get(`guild_${member.guild.id}.welcome`);
        
        if (welcomeSettings && welcomeSettings.leave_enabled && welcomeSettings.leave_channel_id) {
            const channel = member.guild.channels.cache.get(welcomeSettings.leave_channel_id);
            if (channel && channel.type === ChannelType.GuildText) {
                const message = processPlaceholders(welcomeSettings.leave_message, member, member.guild, true);
                const embed = createEmbedFromSettings(welcomeSettings.leave_embed, member, member.guild, true);
                
                await channel.send({ content: message, embeds: embed ? [embed] : [] });
            }
        }
    } catch (e) {
        console.error(`Erro ao enviar mensagem de Saída para ${member.user.tag}: ${e.message}`);
    }
});

// ===============================
// 8. INICIALIZAÇÃO
// ===============================

client.login(process.env.TOKEN_BOT).catch((err) => {
    console.error(`❌ Falha ao logar no Discord: ${err.message}`);
});

// O painel web sobe imediatamente, independente do bot estar conectado
// no Discord ou não (antes ficava preso dentro do 'ready', então se o bot
// desconectasse depois, não tinha como saber pelo Render se o app travou).
app.listen(PORT, () => {
    console.log(`🌐 Painel rodando na porta ${PORT}`);
});

client.once('ready', () => {
    console.log(`✅ Bot online como ${client.user.tag}`);
    registerSlashCommands();
});

// Registra os Slash Commands (/) em todos os servidores onde o bot já está.
// Registro por servidor = aparece na hora (registro global pode levar até 1h).
async function registerSlashCommands() {
    const slashData = [...client.commands.values()]
        .filter(cmd => cmd.data)
        .map(cmd => cmd.data.toJSON());

    let ok = 0, fail = 0;
    for (const guild of client.guilds.cache.values()) {
        try {
            await guild.commands.set(slashData);
            ok++;
        } catch (e) {
            fail++;
            console.error(`❌ Falha ao registrar slash commands em ${guild.name}: ${e.message}`);
        }
    }
    console.log(`⚡ ${slashData.length} slash commands registrados em ${ok} servidor(es)${fail ? ` (${fail} falharam)` : ''}.`);
}

// Registra os slash commands automaticamente em qualquer novo servidor
client.on('guildCreate', async guild => {
    const slashData = [...client.commands.values()]
        .filter(cmd => cmd.data)
        .map(cmd => cmd.data.toJSON());
    try {
        await guild.commands.set(slashData);
        console.log(`⚡ Slash commands registrados no novo servidor: ${guild.name}`);
    } catch (e) {
        console.error(`❌ Falha ao registrar slash commands em ${guild.name}: ${e.message}`);
    }
});

// Slash Commands (/) — reusa a MESMA lógica dos comandos de prefixo (!)
// através do adaptador, sem duplicar código nenhum.
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);
    if (!command) return;

    try {
        await interaction.deferReply();
        const fakeMessage = adaptInteraction(interaction);
        const args = buildArgs(interaction);
        await command.execute(fakeMessage, args, client, db);
    } catch (e) {
        console.error(`❌ Erro ao executar /${interaction.commandName}: ${e.message}`);
        const errorPayload = { content: '❌ Ocorreu um erro ao executar esse comando.' };
        if (interaction.deferred || interaction.replied) {
            await interaction.editReply(errorPayload).catch(() => {});
        } else {
            await interaction.reply({ ...errorPayload, ephemeral: true }).catch(() => {});
        }
    }
});

// Logs de diagnóstico: sem isso, uma queda de conexão no Discord era
// invisível — o painel continuava respondendo normal e escondia o problema.
client.on('error', (err) => {
    console.error(`❌ Erro no cliente Discord: ${err.message}`);
});

client.on('shardError', (error, id) => {
    console.error(`❌ Erro no shard ${id}: ${error.message}`);
});

client.on('shardDisconnect', (event, id) => {
    console.warn(`⚠️ Shard ${id} desconectou (código ${event.code}). Motivo: ${event.reason || 'desconhecido'}`);
});

client.on('shardReconnecting', (id) => {
    console.log(`🔄 Shard ${id} tentando reconectar...`);
});

client.on('shardResume', (id, replayed) => {
    console.log(`✅ Shard ${id} voltou a conectar (${replayed} eventos reprocessados)`);
});