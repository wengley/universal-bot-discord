// ===============================
// 1. IMPORTAÇÕES PRINCIPAIS
// ===============================
const { 
    Client, GatewayIntentBits, Collection, Partials, EmbedBuilder, 
    PermissionsBitField, ChannelType 
} = require('discord.js');
const { QuickDB } = require('quick.db');
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const bodyParser = require('body-parser');
const path = require('path');
const dotenv = require('dotenv');

// ===============================
// 2. CONFIGURAÇÕES INICIAIS
// ===============================
dotenv.config();
const db = new QuickDB();
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
// 3. FUNÇÕES DE PLACEHOLDERS E EMBED (Ponto 3)
// ===============================
function processPlaceholders(text, member, guild, isLeave = false) {
    if (!text) return text;
    
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

// Landing Page (Ponto 1)
app.get('/', (req, res) => {
    const ping = client.ws.ping || 'Calculando...';
    const botAvatarUrl = client.isReady() ? client.user.displayAvatarURL({ size: 128 }) : FALLBACK_ICON_URL;
    
    if (req.isAuthenticated()) return res.redirect('/dashboard');
    
    // Renderiza a landing page usando 'landing_page.ejs' (ou 'index_landing.ejs' se for o principal)
    res.render('landing_page', { // Use 'landing_page' ou 'index_landing' conforme a sua preferência
        title: 'Universal Bot', 
        ping: ping, 
        isAuthenticated: req.isAuthenticated(),
        botAvatarUrl: botAvatarUrl
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
app.get('/invite/denied', isAuthenticated, (req, res) => {
    res.redirect('/dashboard?invite=denied');
});

// DASHBOARD DE SERVIDORES
app.get('/dashboard', isAuthenticated, (req, res) => {
    const userGuilds = req.user.guilds.filter(g => {
        const perms = parseInt(g.permissions, 10);
        const isAdmin = (perms & 0x8) === 0x8;
        const isOwner = g.owner; 
        // Filtra guilds onde o usuário é Admin ou Dono
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
        guild: null, // ESSENCIAL: Passa 'null' para o EJS saber que não é uma página de configuração de guild
        activePage: 'servers',
        showInviteAlert: req.query.invite === 'denied',
        botAvatarUrl: botAvatarUrl
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
        guild: context.guild,
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
        // Filtra canais de texto onde o bot tem permissão de enviar mensagens
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

    // Estrutura complexa de salvamento (mantida para robustez)
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

// ROTA BOAS-VINDAS TESTE (Ponto 3: Testar Mensagem)
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

// ROTAS AUTOROLE (GET e POST) (Ponto 4)
app.get('/dashboard/:guildId/autorole', isAuthenticated, async (req, res) => {
    const context = await getGuildContext(req);
    if (context.status !== 200) return res.status(context.status).send(`<h1>Erro ${context.status}</h1><p>${context.message}</p>`);

    const currentSettings = await db.get(`guild_${context.guild.id}.autorole`) || {};
    let availableRoles = [];
    let errorMessage = null;

    try {
        const botMember = context.guild.members.cache.get(client.user.id);
        const botTopRole = botMember ? botMember.roles.highest.position : 0;

        // Filtra cargos que o bot pode gerenciar
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
    
    // Converte a string de IDs de volta para um array de IDs
    const roleIds = roles ? roles.split(',').filter(id => id.length > 0) : [];

    const newSettings = {
        enabled: !!enabled,
        roles: roleIds,
    };

    await db.set(`guild_${context.guild.id}.autorole`, newSettings);
    res.redirect(`/dashboard/${context.guild.id}/autorole?message=success`);
});

// ROTAS "EM CONSTRUÇÃO"
app.get('/dashboard/:guildId/security', isAuthenticated, async (req, res) => {
    const context = await getGuildContext(req);
    if (context.status !== 200) {
        return res.status(context.status).send(`<h1>Erro ${context.status}</h1><p>${context.message}</p>`);
    }
    res.render('security_settings', { // Usando o nome do seu arquivo, se houver lógica.
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
    res.render('vip_settings', { // Usando o nome do seu arquivo, se houver lógica.
        user: req.user, 
        guild: context.guild, 
        activePage: 'vip', 
        botAvatarUrl: context.botAvatarUrl 
    });
});

app.get('/updates', isAuthenticated, async (req, res) => {
    const botAvatarUrl = client.isReady() ? client.user.displayAvatarURL({ size: 128 }) : FALLBACK_ICON_URL;
    res.render('bot_updates', { // Usando o nome do seu arquivo, se houver lógica.
        user: req.user, 
        activePage: 'updates',
        botAvatarUrl: botAvatarUrl
    });
});

// ===============================
// 7. EVENTOS DISCORD (BOAS-VINDAS E AUTOROLE)
// ===============================

client.on('guildMemberAdd', async member => {
    if (!member.guild || member.user.bot) return;

    // 1. Lógica de AutoRole (Ponto 4)
    try {
        const autoroleSettings = await db.get(`guild_${member.guild.id}.autorole`);
        if (autoroleSettings && autoroleSettings.enabled && autoroleSettings.roles.length > 0) {
            await member.roles.add(autoroleSettings.roles, 'AutoRole ativado via Painel.');
        }
    } catch (e) {
        console.error(`Erro ao aplicar AutoRole para ${member.user.tag}: ${e.message}`);
    }

    // 2. Lógica de Welcome (Ponto 3)
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

client.login(process.env.TOKEN_BOT); 

client.once('ready', () => {
    console.log(`✅ Bot online como ${client.user.tag}`);
    app.listen(PORT, () => {
        console.log(`🌐 Painel rodando na porta ${PORT}`);
    });
});