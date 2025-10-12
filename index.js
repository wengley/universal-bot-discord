// ===============================
// 1. IMPORTAÇÕES E SETUP
// ===============================
const { 
    Client, GatewayIntentBits, Collection, Partials, EmbedBuilder, 
    PermissionsBitField 
} = require('discord.js');
const { QuickDB } = require('quick.db');
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const bodyParser = require('body-parser');
const path = require('path');
const dotenv = require('dotenv');

// Configurações
dotenv.config();
const db = new QuickDB();
const prefix = '!';

// Constantes do Servidor Web
const PORT = process.env.PORT || 3000;
const app = express();

// URL do Ícone de Fallback (Global)
const FALLBACK_ICON_URL = 'https://cdn.discordapp.com/attachments/1414043107867234467/1426614319499706401/captura-de-tela-2018-09-24-as-20.png?ex=68ebdd9e&is=68ea8c1e&hm=50e13cf484f649f0de0daaa6f54d0021a59a136265a01e5531b1008bd0f38a5';

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

// Lista de Comandos para Config. Geral
const BOT_COMMANDS = [
    { name: `!ppt`, description: 'Inicia uma partida de Pedra, Papel e Tesoura contra o Bot.' },
    { name: `!ping`, description: 'Mostra a latência (ping) do Bot.' },
    { name: `!clear [número]`, description: 'Limpa o número especificado de mensagens no canal.' },
    { name: `!lock`, description: 'Bloqueia o canal atual.' },
    { name: `!unlock`, description: 'Desbloqueia o canal atual.' },
];

// ===============================
// 2. FUNÇÕES DE PROCESSAMENTO
// ===============================
function processPlaceholders(text, member, guild, isLeave = false) {
    if (!text) return text;
    
    // Configurações de membro (garante que funciona para user join/leave e mock member)
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
    processedText = processedText.replace(/<\[user\]>/g, user.user.username || user.tag);
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
// 3. CONFIGURAÇÃO DO CLIENT DISCORD
// ===============================
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});
client.commands = new Collection();

// ===============================
// 4. SERVIDOR WEB E AUTENTICAÇÃO
// ===============================
const CLIENT_ID = process.env.CLIENT_ID_BOT;
const CLIENT_SECRET = process.env.CLIENT_SECRET_BOT;
const CALLBACK_URL = process.env.CALLBACK_URL;

app.use(express.static('public'));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Configurações de Session e Passport (mantidas)
app.use(session({
    secret: process.env.SESSION_SECRET || 'UMA_CHAVE_MUITO_SECRETA_E_GRANDE',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: 'auto', maxAge: 60 * 60 * 1000 * 24 * 7 }
}));
app.use(passport.initialize());
app.use(passport.session());

passport.use(new DiscordStrategy({
    clientID: CLIENT_ID, clientSecret: CLIENT_SECRET, callbackURL: CALLBACK_URL, scope: ['identify', 'email', 'guilds'], 
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
 * @description Obtém o contexto do servidor, com tratamento de erros.
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
        return { status: 403, message: 'Você não tem permissão de Administrador ou Dono.' };
    }
    
    // Objeto 'mock' de segurança
    if (!member) {
         member = { 
            permissions: { has: (flag) => isOwner && flag === PermissionsBitField.Flags.Administrator },
            id: req.user.id,
            user: { username: req.user.username, tag: req.user.tag, displayAvatarURL: () => req.user.avatar ? `https://cdn.discordapp.com/avatars/${req.user.id}/${req.user.avatar}.png` : 'https://cdn.discordapp.com/embed/avatars/0.png' },
            displayName: req.user.displayName || req.user.username,
            avatarURL: () => req.user.avatar ? `https://cdn.discordapp.com/avatars/${req.user.id}/${req.user.avatar}.png` : 'https://cdn.discordapp.com/embed/avatars/0.png'
         };
    }

    const botAvatarUrl = client.user.displayAvatarURL({ size: 128 });
    
    return { guild, member, status: 200, botAvatarUrl, botPing: client.ws.ping };
}

// ===============================
// 5. ROTAS WEB (CORRIGIDA /dashboard)
// ===============================

// Rota de Status (Health Check)
app.get('/status', (req, res) => {
    if (client.isReady()) {
        res.status(200).send('Servidor e Bot OK');
    } else {
        res.status(503).send('Bot ainda não está pronto.');
    }
});

// Landing Page (PONTO 1)
app.get('/', (req, res) => {
    if (req.isAuthenticated()) return res.redirect('/dashboard');
    res.render('landing_page', { 
        title: 'Universal Bot | Painel de Controle',
        isAuthenticated: req.isAuthenticated(),
        botAvatarUrl: client.isReady() ? client.user.displayAvatarURL({ size: 128 }) : FALLBACK_ICON_URL,
    }); 
});
app.get('/login', (req, res) => {
    passport.authenticate('discord', { scope: ['identify', 'email', 'guilds'] })(req, res);
});
app.get('/callback', passport.authenticate('discord', { failureRedirect: '/' }), (req, res) => {
    res.redirect('/dashboard'); 
});
app.get('/logout', (req, res) => {
    req.logout(() => res.redirect('/')); 
});

// ROTA DASHBOARD (GUILD SELECT) - CORRIGE O 'Cannot GET /dashboard'
app.get('/dashboard', isAuthenticated, (req, res) => {
    // Filtra apenas os servidores onde o usuário é Administrador ou Dono
    const managedGuilds = req.user.guilds.filter(guild => {
        // Verifica permissão de Administrador (bit 3 - 0x8)
        const permissions = new PermissionsBitField(BigInt(guild.permissions));
        const isAdmin = permissions.has(PermissionsBitField.Flags.Administrator);
        
        // Também verifica se o bot está no servidor (cache)
        const isBotInGuild = client.guilds.cache.has(guild.id);
        
        return isAdmin && isBotInGuild;
    });

    res.render('dashboard', { 
        user: req.user, 
        guilds: managedGuilds,
        activePage: 'guild_select', 
        botAvatarUrl: client.isReady() ? client.user.displayAvatarURL({ size: 128 }) : FALLBACK_ICON_URL
    }); 
});


// Rota base de CONFIGURAÇÃO DO SERVIDOR (guild_settings.ejs)
app.get('/dashboard/:guildId', isAuthenticated, async (req, res) => {
    const context = await getGuildContext(req);
    if (context.status !== 200) return res.status(context.status).send(`<h1>Erro ${context.status}</h1><p>${context.message}</p>`);

    res.render('guild_settings', { 
        user: req.user, guild: context.guild, activePage: 'settings',
        botPing: context.botPing, commands: BOT_COMMANDS, botAvatarUrl: context.botAvatarUrl
    });
});

// ROTA AUTOROLE (GET e POST) (PONTO 4: Lógica de Carregamento e Salvar)
app.get('/dashboard/:guildId/autorole', isAuthenticated, async (req, res) => {
    const context = await getGuildContext(req);
    if (context.status !== 200) return res.status(context.status).send(`<h1>Erro ${context.status}</h1><p>${context.message}</p>`);

    const currentSettings = await db.get(`guild_${context.guild.id}.autorole`) || { roles: [] };
    let availableRoles = [];
    let errorMessage = null;

    try {
        const botMember = context.guild.members.cache.get(client.user.id);
        const botTopRole = botMember ? botMember.roles.highest.position : 0;

        availableRoles = context.guild.roles.cache
            .filter(role => !role.managed && role.position < botTopRole && role.id !== context.guild.id)
            .sort((a, b) => b.position - a.position)
            .map(role => ({ 
                id: role.id, name: role.name, 
                color: `#${role.color.toString(16).padStart(6, '0').toUpperCase()}` 
            }));

    } catch (e) {
        console.error(`Erro ao carregar cargos para Autorole: ${e.message}`);
        errorMessage = "Falha ao carregar cargos. Verifique as permissões do Bot.";
    }

    const settings = { 
        enabled: currentSettings.enabled || false, 
        roles: currentSettings.roles.map(roleId => {
            const role = context.guild.roles.cache.get(roleId);
            return {
                id: roleId,
                name: role ? role.name : 'Cargo Não Encontrado',
                color: role ? `#${role.color.toString(16).padStart(6, '0').toUpperCase()}` : '#99aab5'
            };
        }) || [],
    };

    res.render('autorole_settings', {
        user: req.user, guild: context.guild, activePage: 'autorole', settings: settings,
        availableRoles: availableRoles, message: req.query.message,
        errorMessage: errorMessage, botAvatarUrl: context.botAvatarUrl
    });
});
app.post('/dashboard/:guildId/autorole', isAuthenticated, async (req, res) => {
    const context = await getGuildContext(req);
    if (context.status !== 200) return res.status(context.status).send(`<h1>Erro ${context.status}</h1><p>${context.message}</p>`);

    const { enabled, roles } = req.body;
    const roleIds = roles ? roles.split(',').filter(id => id.length > 0) : [];

    await db.set(`guild_${context.guild.id}.autorole`, { enabled: !!enabled, roles: roleIds });
    res.redirect(`/dashboard/${context.guild.id}/autorole?message=success`);
});


// ROTAS BOAS-VINDAS (GET/POST mantidas)
app.get('/dashboard/:guildId/welcome', isAuthenticated, async (req, res) => {
    const context = await getGuildContext(req);
    if (context.status !== 200) return res.status(context.status).send(`<h1>Erro ${context.status}</h1><p>${context.message}</p>`);
    
    const currentSettings = await db.get(`guild_${context.guild.id}.welcome`) || {};
    let textChannels = [];
    let errorMessage = null;

    try {
        textChannels = context.guild.channels.cache
            .filter(c => c.type === 0 && c.permissionsFor(client.user.id)?.has(PermissionsBitField.Flags.SendMessages))
            .map(c => ({ id: c.id, name: c.name }));
    } catch (e) {
        console.error(`Erro ao carregar canais para Welcome: ${e.message}`);
        errorMessage = "Falha ao carregar canais. Verifique se o Bot tem permissão para ver/enviar mensagens nos canais de texto.";
    }
    
    // Configuração de settings (precisa ser completa para o EJS)
    const settings = {
        enabled: currentSettings.enabled || false,
        join_channel_id: currentSettings.join_channel_id || null,
        leave_channel_id: currentSettings.leave_channel_id || null,
        join_message: currentSettings.join_message || "Bem-vindo(a) <[@user]>!",
        leave_message: currentSettings.leave_message || "<[user]> saiu do servidor.",
        join_embed: { ...DEFAULT_EMBED, ...currentSettings.join_embed },
        leave_embed: { ...DEFAULT_EMBED, ...currentSettings.leave_embed },
    };

    res.render('welcome_settings', { 
        user: req.user, guild: context.guild, activePage: 'welcome', settings: settings,
        textChannels: textChannels, message: req.query.message,
        errorMessage: errorMessage, botAvatarUrl: context.botAvatarUrl
    });
});

app.post('/dashboard/:guildId/welcome', isAuthenticated, async (req, res) => {
    const context = await getGuildContext(req);
    if (context.status !== 200) return res.status(context.status).send(`<h1>Erro ${context.status}</h1><p>${context.message}</p>`);

    // Lógica de salvamento aqui.
    await db.set(`guild_${context.guild.id}.welcome`, req.body);
    res.redirect(`/dashboard/${context.guild.id}/welcome?message=success`);
});

// ROTA BOAS-VINDAS TESTE (PONTO 3: Testar Mensagem)
app.post('/dashboard/:guildId/welcome/test', isAuthenticated, async (req, res) => {
    const context = await getGuildContext(req);
    if (context.status !== 200) return res.status(500).json({ success: false, message: context.message });

    const { type, channel_id, message, embed_data } = req.body;
    
    const channel = context.guild.channels.cache.get(channel_id);
    if (!channel || channel.type !== 0 || !channel.permissionsFor(client.user.id)?.has(PermissionsBitField.Flags.SendMessages)) {
        return res.status(400).json({ success: false, message: 'Canal inválido, inalcançável, ou o Bot não tem permissão para enviar mensagens.' });
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
            iconURL: processPlaceholders(embed_data.footer_icon_url, mockMember, context.guild, isLeave) || null,
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


// ROTAS DE "EM CONSTRUÇÃO"
app.get('/dashboard/:guildId/security', isAuthenticated, async (req, res) => {
    const context = await getGuildContext(req);
    if (context.status !== 200) return res.status(context.status).send(`<h1>Erro ${context.status}</h1><p>${context.message}</p>`);
    res.render('coming_soon', { user: req.user, guild: context.guild, activePage: 'security', activePageDisplay: 'Segurança', botAvatarUrl: context.botAvatarUrl });
});

app.get('/dashboard/:guildId/vip', isAuthenticated, async (req, res) => {
    const context = await getGuildContext(req);
    if (context.status !== 200) return res.status(context.status).send(`<h1>Erro ${context.status}</h1><p>${context.message}</p>`);
    res.render('coming_soon', { user: req.user, guild: context.guild, activePage: 'vip', activePageDisplay: 'VIP/Premium', botAvatarUrl: context.botAvatarUrl });
});

app.get('/dashboard/:guildId/guild_events', isAuthenticated, async (req, res) => {
    const context = await getGuildContext(req);
    if (context.status !== 200) return res.status(context.status).send(`<h1>Erro ${context.status}</h1><p>${context.message}</p>`);
    res.render('coming_soon', { user: req.user, guild: context.guild, activePage: 'guild_events', activePageDisplay: 'Eventos', botAvatarUrl: context.botAvatarUrl });
});


// ===============================
// 6. EVENTOS DISCORD E INICIALIZAÇÃO
// ===============================

// Eventos do Bot
client.on('guildMemberAdd', async member => {
    const settings = await db.get(`guild_${member.guild.id}.autorole`);

    // Lógica de AutoRole funcional
    if (settings && settings.enabled && settings.roles && settings.roles.length > 0) {
        try {
            await member.roles.add(settings.roles, 'AutoRole ativado via painel.');
        } catch (e) {
            console.error(`Falha ao adicionar AutoRole no servidor ${member.guild.id}: ${e.message}`);
        }
    }

    // Lógica de Welcome Message aqui
});

// Inicialização Final
client.login(process.env.TOKEN_BOT); 

client.once('ready', () => {
    console.log(`✅ Bot online como ${client.user.tag}`);
    app.listen(PORT, () => {
        console.log(`🌐 Painel rodando na porta ${PORT}`);
    });
});