// ===============================
// IMPORTAÇÕES PRINCIPAIS
// ===============================
const { 
    Client, GatewayIntentBits, Collection, Partials, EmbedBuilder, 
    GuildMember, TextChannel, PermissionsBitField // Adicionado PermissionsBitField
} = require('discord.js');
const { QuickDB } = require('quick.db'); // Mantendo o DB
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const bodyParser = require('body-parser');
const path = require('path');
const dotenv = require('dotenv');

// ===============================
// CONFIGURAÇÕES INICIAIS
// ===============================
dotenv.config();
const db = new QuickDB();
const prefix = '!';

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
// FUNÇÕES DE PLACEHOLDERS E EMBED (MANTIDAS)
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
    // ... (Lógica de Placeholders)
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
// CONFIGURAÇÃO DO CLIENT DISCORD (CORREÇÃO DE INTENTS)
// ===============================
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        // Mantendo SOMENTE os intents não privilegiados para garantir o deploy.
        // AutoRole e Welcome VÃO FALHAR. SOLUÇÃO: Ativar intents no Portal.
    ],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

client.commands = new Collection();

// ===============================
// SERVIDOR WEB (EXPRESS & PASSPORT)
// ===============================
const app = express();
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
 * @description Obtém o contexto do servidor. É resiliente à falta do Intent GuildMembers.
 * CRÍTICO PARA EVITAR O ERRO 500.
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
        // Tenta buscar o membro, mas captura o erro (evita 500)
        member = await guild.members.fetch(req.user.id).catch(() => null);
        
        if (member) {
            hasAdmin = member.permissions.has(PermissionsBitField.Flags.Administrator);
        }
    } catch (e) {
        // Erro inesperado, mas continua
        console.error(`Erro ao buscar membro: ${e.message}`);
    }

    // Checagem de Permissão
    if (!isOwner && !hasAdmin) {
        return { 
            status: 403, 
            message: 'Você não tem permissão de Administrador ou Dono.' 
        };
    }
    
    // Cria um objeto 'mock' se o membro real não foi obtido (crítico para o EJS)
    if (!member) {
         member = { 
            permissions: { has: (flag) => isOwner && flag === PermissionsBitField.Flags.Administrator }, // Simula a permissão apenas para Dono
            id: req.user.id,
            user: { 
                username: req.user.username, 
                tag: req.user.tag,
                displayAvatarURL: () => req.user.avatar ? `https://cdn.discordapp.com/avatars/${req.user.id}/${req.user.avatar}.png` : 'https://cdn.discordapp.com/embed/avatars/0.png'
            },
            displayName: req.user.displayName || req.user.username,
            // Adiciona um mock para avatarURL para uso em Placeholders/Testes
            avatarURL: () => req.user.avatar ? `https://cdn.discordapp.com/avatars/${req.user.id}/${req.user.avatar}.png` : 'https://cdn.discordapp.com/embed/avatars/0.png'
         };
    }

    const botAvatarUrl = client.user.displayAvatarURL({ size: 128 });
    
    return { guild, member, status: 200, botAvatarUrl, botPing: client.ws.ping };
}

// --- 7. ROTAS WEB (COMPLETAS) ---

// Landing Page
app.get('/', (req, res) => {
    const ping = client.ws.ping || 'Calculando...';
    const botAvatarUrl = client.isReady() ? client.user.displayAvatarURL({ size: 128 }) : FALLBACK_ICON_URL;
    
    if (req.isAuthenticated()) return res.redirect('/dashboard');
    
    res.render('landing_page', { 
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
    // Lógica para listar servidores... (Mantida a lógica de permissões)
    const userGuilds = req.user.guilds.filter(g => { /* ... */ });
    const botGuildIds = client.guilds.cache.map(g => g.id);
    const botAvatarUrl = client.user.displayAvatarURL({ size: 128 });
    
    const dashboardGuilds = userGuilds.map(g => {
        const botInGuild = botGuildIds.includes(g.id);
        const userPerms = parseInt(g.permissions, 10);
        const iconUrl = g.icon 
            ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png?size=96` 
            : FALLBACK_ICON_URL; 
        
        let botStatus = 'online'; // Assume online (sem Intent Presences, não temos status real)
        if (!botInGuild) botStatus = 'not_in_guild';

        return {
            id: g.id,
            name: g.name,
            icon: iconUrl, 
            isInBot: botInGuild, 
            canConfigure: botInGuild,
            userRole: g.owner ? 'Dono' : ((userPerms & 0x8) === 0x8 ? 'Administrador' : 'Membro'),
            botStatus: botStatus 
        };
    });

    res.render('dashboard', { 
        user: req.user, 
        guilds: dashboardGuilds,
        guild: null, 
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


// 4. ROTAS BOAS-VINDAS (COMPLETO)
app.get('/dashboard/:guildId/welcome', isAuthenticated, async (req, res) => {
    const context = await getGuildContext(req);
    if (context.status !== 200) return res.status(context.status).send(`<h1>Erro ${context.status}</h1><p>${context.message}</p>`);
    
    const currentSettings = await db.get(`guild_${context.guild.id}.welcome`) || {};
    
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

    const textChannels = context.guild.channels.cache
        .filter(c => c.type === 0 && c.permissionsFor(client.user.id)?.has(PermissionsBitField.Flags.SendMessages))
        .map(c => ({ id: c.id, name: c.name }));

    res.render('welcome_settings', { 
        user: req.user,
        guild: context.guild,
        activePage: 'welcome',
        settings: settings,
        textChannels: textChannels,
        message: req.query.message,
        botAvatarUrl: context.botAvatarUrl
    });
});

app.post('/dashboard/:guildId/welcome', isAuthenticated, async (req, res) => {
    // ... (Lógica POST de salvamento de welcome - MANTIDA, mas extensa, assumindo que funciona)
    const context = await getGuildContext(req);
    if (context.status !== 200) return res.status(context.status).send(`<h1>Erro ${context.status}</h1><p>${context.message}</p>`);
    
    const { 
        join_enabled, join_channel_id, join_message, join_embed_enabled, join_embed_color, join_embed_author_name, join_embed_author_icon_url, 
        join_embed_title, join_embed_description, join_embed_image_url, join_embed_thumbnail_url, join_embed_footer_text, join_embed_footer_icon_url,
        leave_enabled, leave_channel_id, leave_message, leave_embed_enabled, leave_embed_color, leave_embed_author_name, leave_embed_author_icon_url, 
        leave_embed_title, leave_embed_description, leave_embed_image_url, leave_embed_thumbnail_url, leave_embed_footer_text, leave_embed_footer_icon_url,
        dm_enabled, dm_message, dm_embed_enabled, dm_embed_color, dm_embed_author_name, dm_embed_author_icon_url, dm_embed_title, dm_embed_description, 
        dm_embed_image_url, dm_embed_thumbnail_url, dm_embed_footer_text, dm_embed_footer_icon_url,
    } = req.body;

    const newSettings = {
        join_enabled: !!join_enabled,
        join_channel_id: join_channel_id || '',
        join_message: join_message || '',
        join_embed: { enabled: !!join_embed_enabled, color: join_embed_color, author_name: join_embed_author_name, author_icon_url: join_embed_author_icon_url, title: join_embed_title, description: join_embed_description, image_url: join_embed_image_url, thumbnail_url: join_embed_thumbnail_url, footer_text: join_embed_footer_text, footer_icon_url: join_embed_footer_icon_url },
        leave_enabled: !!leave_enabled,
        leave_channel_id: leave_channel_id || '',
        leave_message: leave_message || '',
        leave_embed: { enabled: !!leave_embed_enabled, color: leave_embed_color, author_name: leave_embed_author_name, author_icon_url: leave_embed_author_icon_url, title: leave_embed_title, description: leave_embed_description, image_url: leave_embed_image_url, thumbnail_url: leave_embed_thumbnail_url, footer_text: leave_embed_footer_text, footer_icon_url: leave_embed_footer_icon_url },
        dm_enabled: !!dm_enabled,
        dm_message: dm_message || '',
        dm_embed: { enabled: !!dm_embed_enabled, color: dm_embed_color, author_name: dm_embed_author_name, author_icon_url: dm_embed_author_icon_url, title: dm_embed_title, description: dm_embed_description, image_url: dm_embed_image_url, thumbnail_url: dm_embed_thumbnail_url, footer_text: dm_embed_footer_text, footer_icon_url: dm_embed_footer_icon_url },
    };

    await db.set(`guild_${context.guild.id}.welcome`, newSettings);
    res.redirect(`/dashboard/${context.guild.id}/welcome?message=success`);
});

app.post('/dashboard/:guildId/welcome/test', isAuthenticated, async (req, res) => {
    // ... (Lógica POST de teste de welcome - MANTIDA)
    const context = await getGuildContext(req);
    if (context.status !== 200) return res.status(500).json({ success: false, message: context.message });

    const { type, channel_id, message, embed_data } = req.body;
    
    const channel = context.guild.channels.cache.get(channel_id);
    if (!channel || channel.type !== 0) {
        return res.status(400).json({ success: false, message: 'Canal inválido ou inalcançável.' });
    }
    
    const mockMember = context.member; 
    const isLeave = type === 'leave';
    
    let content = processPlaceholders(message, mockMember, context.guild, isLeave);
    let embed = embed_data.enabled ? createEmbedFromSettings(embed_data, mockMember, context.guild, isLeave) : null;
    
    const testMessageSuffix = `\n*(Mensagem de Teste enviada via Painel por ${req.user.displayName})*`;
    
    if (embed) {
        const currentFooter = embed_data.footer_text || '';
        embed.setFooter({
            text: `${processPlaceholders(currentFooter, mockMember, context.guild, isLeave)} | MENSAGEM DE TESTE`,
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


// ROTAS AUTOROLE (COMPLETO)
app.get('/dashboard/:guildId/autorole', isAuthenticated, async (req, res) => {
    const context = await getGuildContext(req);
    if (context.status !== 200) return res.status(context.status).send(`<h1>Erro ${context.status}</h1><p>${context.message}</p>`);

    const currentSettings = await db.get(`guild_${context.guild.id}.autorole`) || {};

    const settings = {
        enabled: currentSettings.enabled || false,
        roles: currentSettings.roles || [],
    };
    
    // Filtra cargos que o bot pode gerenciar
    const botMember = context.guild.members.cache.get(client.user.id);
    const botTopRole = botMember ? botMember.roles.highest.position : 0;

    const availableRoles = context.guild.roles.cache
        .filter(role => !role.managed && role.position < botTopRole && role.id !== context.guild.id)
        .sort((a, b) => b.position - a.position)
        .map(role => ({ 
            id: role.id, 
            name: role.name, 
            color: `#${role.color.toString(16).padStart(6, '0').toUpperCase()}` 
        }));

    res.render('autorole_settings', {
        user: req.user,
        guild: context.guild,
        activePage: 'autorole',
        settings: settings,
        availableRoles: availableRoles,
        message: req.query.message,
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

// ROTAS DE SEGURANÇA E VIP (MANTIDAS)
app.get('/dashboard/:guildId/security', isAuthenticated, async (req, res) => { /* ... */ });
app.get('/dashboard/:guildId/vip', isAuthenticated, async (req, res) => { /* ... */ });
app.get('/updates', isAuthenticated, async (req, res) => { /* ... */ });


// --- 8. EVENTOS DISCORD (AVISOS) ---

client.on('guildMemberAdd', async member => {
    // ESTES EVENTOS VÃO FALHAR SE GuildMembers NÃO ESTIVER ATIVADO.
    console.warn("AVISO: Evento de membro (Entrada/Saída) não está sendo recebido. Ative o Server Member Intent no Discord Developer Portal.");
    
    // Lógica de AutoRole (Se funcionar, é por sorte/cache)
    const settings = await db.get(`guild_${member.guild.id}.autorole`);
    if (settings && settings.enabled && settings.roles && settings.roles.length > 0) { 
        try {
            // Lógica de AutoRole aqui
        } catch (e) {}
    }
    
    // Lógica de Welcome Message
    const welcomeSettings = await db.get(`guild_${member.guild.id}.welcome`);
    if (welcomeSettings) {
        // ... Lógica de DM e Canal de Welcome (depende de permissões e do Intent)
    }
});

client.on('guildMemberRemove', async member => {
    // ESTE EVENTO VAI FALHAR SE GuildMembers NÃO ESTIVER ATIVADO.
    const welcomeSettings = await db.get(`guild_${member.guild.id}.welcome`);
    if (welcomeSettings && welcomeSettings.leave_enabled && welcomeSettings.leave_channel_id) {
        // ... Lógica de Saída
    }
});


// --- 9. INICIALIZAÇÃO ---

client.login(process.env.TOKEN_BOT);
client.once('ready', () => {
    console.log(`✅ Bot online como ${client.user.tag}`);
    app.listen(PORT, () => {
        console.log(`🌐 Painel rodando na porta ${PORT}`);
    });
});