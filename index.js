// ===============================
// IMPORTAÇÕES PRINCIPAIS
// ===============================
const { 
    Client, GatewayIntentBits, Collection, Partials, EmbedBuilder, 
    GuildMember, TextChannel 
} = require('discord.js');
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

// Lista de Comandos para Config. Geral (Mantida)
const BOT_COMMANDS = [
    { name: `!ppt`, description: 'Inicia uma partida de Pedra, Papel e Tesoura contra o Bot.' },
    { name: `!ping`, description: 'Mostra a latência (ping) do Bot.' },
    { name: `!clear [número]`, description: 'Limpa o número especificado de mensagens no canal. (Requer permissão de Gerenciar Mensagens).' },
    { name: `!lock`, description: 'Bloqueia o canal atual para todos os membros. (Requer permissão de Gerenciar Canais).' },
    { name: `!unlock`, description: 'Desbloqueia o canal atual. (Requer permissão de Gerenciar Canais).' },
];

// Estrutura Padrão de Embed (Mantida)
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
// FUNÇÃO DE PROCESSAMENTO DE PLACEHOLDERS (PONTO 3 - Variáveis em Embed)
// ===============================
function processPlaceholders(text, member, guild, isLeave = false) {
    if (!text) return text;
    
    // Simula um usuário genérico (o bot) ou usa o usuário atual do painel para testes
    const user = isLeave ? { 
        displayName: member.user.username, 
        id: member.id, 
        tag: member.user.tag,
        avatarURL: () => member.user.displayAvatarURL(),
        username: member.user.username
    } : member;

    let processedText = text;

    // Variáveis do Usuário
    processedText = processedText.replace(/<\[@user\]>/g, `<@${user.id}>`);
    processedText = processedText.replace(/<\[@user\.name\]>/g, user.displayName || user.user.username);
    processedText = processedText.replace(/<\[user\]>/g, user.user.username || user.tag);
    processedText = processedText.replace(/<\[user\.id\]>/g, user.id);
    processedText = processedText.replace(/<\[user\.avatar\]>/g, user.avatarURL ? user.avatarURL() : user.user.displayAvatarURL());
    
    // Variáveis do Servidor
    processedText = processedText.replace(/<\[guild\.icon\]>/g, guild.iconURL({ size: 1024 }) || '');
    processedText = processedText.replace(/<\[guild\.name\]>/g, guild.name);

    return processedText;
}

// ===============================
// FUNÇÃO DE CRIAÇÃO DE EMBED
// ===============================
function createEmbedFromSettings(settings, member, guild, isLeave = false) {
    if (!settings.enabled) return null;

    const embed = new EmbedBuilder()
        .setColor(settings.color || '#5865F2')
        .setDescription(processPlaceholders(settings.description, member, guild, isLeave));

    // Processa variáveis nos outros campos (Mantido do último script)
    if (settings.title) {
        embed.setTitle(processPlaceholders(settings.title, member, guild, isLeave));
    }
    if (settings.author_name) {
        embed.setAuthor({
            name: processPlaceholders(settings.author_name, member, guild, isLeave),
            iconURL: processPlaceholders(settings.author_icon_url, member, guild, isLeave),
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
            iconURL: processPlaceholders(settings.footer_icon_url, member, guild, isLeave),
        });
    }

    return embed;
}

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
// AUTENTICAÇÃO DISCORD (CRÍTICO)
// ===============================
const CLIENT_ID = process.env.CLIENT_ID_BOT;
const CLIENT_SECRET = process.env.CLIENT_SECRET_BOT;
const CALLBACK_URL = process.env.CALLBACK_URL;

app.use(session({
    secret: process.env.SESSION_SECRET || 'UMA_CHAVE_MUITO_SECRETA_E_GRANDE',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: 'auto',
        maxAge: 60 * 60 * 1000 * 24 * 7 // 1 semana
    }
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

// ===============================
// FUNÇÃO DE VERIFICAÇÃO (CRÍTICA PARA ERRO 500/404)
// ===============================
async function getGuildContext(req) {
    if (!client.isReady()) return { status: 503, message: 'Bot não está pronto. Tente novamente em instantes.' };
    if (!req.user) return { status: 401, message: 'Usuário não autenticado.' }; // Garantia
    
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
    
    // Adiciona o URL do avatar do bot para usar no EJS
    const botAvatarUrl = client.user.displayAvatarURL({ size: 128 });
    
    return { guild, member, status: 200, botAvatarUrl: botAvatarUrl };
}


// ===============================
// ROTAS WEB
// ===============================

// LANDING PAGE (PONTO 2 - Corrigido)
app.get('/', (req, res) => {
    const ping = client.ws.ping || 'Calculando...';
    // Garante que o avatar do bot esteja pronto
    const botAvatarUrl = client.isReady() ? client.user.displayAvatarURL({ size: 128 }) : '/img/default_bot_avatar.png';
    
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

// DASHBOARD DE SERVIDORES (CRÍTICO - Ponto onde o erro pode começar)
app.get('/dashboard', isAuthenticated, (req, res) => {
    
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
        showInviteAlert: req.query.invite === 'denied',
        botAvatarUrl: botAvatarUrl
    }); 
});


// Rota base de CONFIGURAÇÃO DO SERVIDOR (CORRIGE Cannot GET)
app.get('/dashboard/:guildId', isAuthenticated, async (req, res) => {
    const context = await getGuildContext(req);
    // Se o status NÃO for 200, ele vai parar aqui e retornar o erro!
    if (context.status !== 200) {
        return res.status(context.status).send(`<h1>Erro ${context.status}</h1><p>${context.message}</p>`);
    }

    const botPing = client.ws.ping; 

    res.render('guild_settings', { 
        user: req.user,
        guild: context.guild,
        activePage: 'settings',
        botPing: botPing,
        commands: BOT_COMMANDS,
        botAvatarUrl: context.botAvatarUrl // Passa o avatar do bot
    });
});


// 2. ROTAS BOAS-VINDAS (Mantida a Lógica Completa)
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
        dm_message: currentSettings.dm_message || 'Obrigado por entrar no nosso servidor! Se precisar de ajuda, é só chamar.',
        dm_embed: { ...DEFAULT_EMBED, ...(currentSettings.dm_embed || {}) },
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
        message: req.query.message,
        botAvatarUrl: context.botAvatarUrl
    });
});

app.post('/dashboard/:guildId/welcome', isAuthenticated, async (req, res) => {
    // ... (Lógica de salvamento das configurações de welcome - Mantenha a mesma do script anterior) ...
    const context = await getGuildContext(req);
    if (context.status !== 200) return res.status(context.status).send(`<h1>Erro ${context.status}</h1><p>${context.message}</p>`);

    const { 
        join_enabled, join_channel_id, join_message, 
        join_embed_enabled, join_embed_color, join_embed_author_name, join_embed_author_icon_url, 
        join_embed_title, join_embed_description, join_embed_image_url, join_embed_thumbnail_url,
        join_embed_footer_text, join_embed_footer_icon_url,
        
        leave_enabled, leave_channel_id, leave_message, 
        leave_embed_enabled, leave_embed_color, leave_embed_author_name, leave_embed_author_icon_url, 
        leave_embed_title, leave_embed_description, leave_embed_image_url, leave_embed_thumbnail_url,
        leave_embed_footer_text, leave_embed_footer_icon_url,

        dm_enabled, dm_message, 
        dm_embed_enabled, dm_embed_color, dm_embed_author_name, dm_embed_author_icon_url, 
        dm_embed_title, dm_embed_description, dm_embed_image_url, dm_embed_thumbnail_url,
        dm_embed_footer_text, dm_embed_footer_icon_url,
    } = req.body;

    const newSettings = {
        join_enabled: !!join_enabled,
        join_channel_id: join_channel_id || '',
        join_message: join_message || '',
        join_embed: {
            enabled: !!join_embed_enabled,
            color: join_embed_color,
            author_name: join_embed_author_name,
            author_icon_url: join_embed_author_icon_url,
            title: join_embed_title,
            description: join_embed_description,
            image_url: join_embed_image_url,
            thumbnail_url: join_embed_thumbnail_url,
            footer_text: join_embed_footer_text,
            footer_icon_url: join_embed_footer_icon_url,
        },
        leave_enabled: !!leave_enabled,
        leave_channel_id: leave_channel_id || '',
        leave_message: leave_message || '',
        leave_embed: {
            enabled: !!leave_embed_enabled,
            color: leave_embed_color,
            author_name: leave_embed_author_name,
            author_icon_url: leave_embed_author_icon_url,
            title: leave_embed_title,
            description: leave_embed_description,
            image_url: leave_embed_image_url,
            thumbnail_url: leave_embed_thumbnail_url,
            footer_text: leave_embed_footer_text,
            footer_icon_url: leave_embed_footer_icon_url,
        },
        dm_enabled: !!dm_enabled,
        dm_message: dm_message || '',
        dm_embed: {
            enabled: !!dm_embed_enabled,
            color: dm_embed_color,
            author_name: dm_embed_author_name,
            author_icon_url: dm_embed_author_icon_url,
            title: dm_embed_title,
            description: dm_embed_description,
            image_url: dm_embed_image_url,
            thumbnail_url: dm_embed_thumbnail_url,
            footer_text: dm_embed_footer_text,
            footer_icon_url: dm_embed_footer_icon_url,
        },
    };

    await db.set(`guild_${context.guild.id}.welcome`, newSettings);
    res.redirect(`/dashboard/${context.guild.id}/welcome?message=success`);
});


// Rota POST para TESTAR MENSAGEM (Funcionalidade de Teste Mantida)
app.post('/dashboard/:guildId/welcome/test', isAuthenticated, async (req, res) => {
    const context = await getGuildContext(req);
    if (context.status !== 200) return res.status(context.status).json({ success: false, message: context.message });

    const { type, channel_id, message, embed_data } = req.body;
    
    const channel = context.guild.channels.cache.get(channel_id);
    if (!channel || channel.type !== 0) {
        return res.status(400).json({ success: false, message: 'Canal inválido ou inalcançável.' });
    }
    
    const mockMember = context.member; 
    const isLeave = type === 'leave';
    
    let content = processPlaceholders(message, mockMember, context.guild, isLeave);
    let embed = embed_data.enabled ? createEmbedFromSettings(embed_data, mockMember, context.guild, isLeave) : null;
    
    // Adiciona o aviso de teste
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
        console.error('Erro ao enviar mensagem de teste:', error);
        return res.status(500).json({ success: false, message: `Erro ao enviar: O bot pode não ter permissão de enviar mensagens no canal. Detalhe: ${error.message}` });
    }
});


// 3. ROTAS AUTOROLE (Funcionalidade Garantida)
app.get('/dashboard/:guildId/autorole', isAuthenticated, async (req, res) => {
    const context = await getGuildContext(req);
    if (context.status !== 200) return res.status(context.status).send(`<h1>Erro ${context.status}</h1><p>${context.message}</p>`);

    const settings = {
        enabled: await db.get(`guild_${context.guild.id}.autorole.enabled`) || false,
        roles: await db.get(`guild_${context.guild.id}.autorole.roles`) || [],
    };
    
    // Filtra cargos editáveis, não sendo @everyone e abaixo da hierarquia do bot
    const availableRoles = context.guild.roles.cache
        .filter(r => r.editable && r.id !== context.guild.id && r.position < context.guild.members.me.roles.highest.position)
        .map(r => ({ id: r.id, name: r.name, color: r.hexColor }));

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

    const { enabled, roles = '' } = req.body;
    
    const rolesArray = roles.split(',').filter(id => id.length > 0);
    
    await db.set(`guild_${context.guild.id}.autorole.enabled`, !!enabled);
    await db.set(`guild_${context.guild.id}.autorole.roles`, rolesArray);

    res.redirect(`/dashboard/${context.guild.id}/autorole?message=success`);
});


// ... (Rotas Placeholder e logout) ...
app.get('/updates', isAuthenticated, async (req, res) => {
    const context = await getGuildContext(req);
    // Para esta rota, não precisamos do guildId, apenas do user
    const botAvatarUrl = client.isReady() ? client.user.displayAvatarURL({ size: 128 }) : '/img/default_bot_avatar.png';
    res.render('bot_updates', { user: req.user, guild: null, activePage: 'updates', botAvatarUrl: botAvatarUrl });
});
app.get('/logout', (req, res) => {
    req.logout((err) => {
        if (err) return res.send("Erro ao fazer logout.");
        res.redirect('/');
    });
});
app.get('/invite/denied', isAuthenticated, (req, res) => {
    res.redirect('/dashboard?invite=denied');
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

// ===============================
// EVENTOS DISCORD (AUTOROLE FUNCIONAL)
// ===============================
client.on('guildMemberAdd', async member => {
    if (member.user.bot) return; 
    
    const settings = await db.get(`guild_${member.guild.id}.autorole`);
    
    // AutoRole Logic
    if (settings && settings.enabled && settings.roles && settings.roles.length > 0) {
        try {
            const rolesToAdd = settings.roles.filter(roleId => {
                const role = member.guild.roles.cache.get(roleId);
                // Verifica se o cargo existe e se o bot pode dar o cargo
                return role && role.position < member.guild.members.me.roles.highest.position;
            });
            
            if (rolesToAdd.length > 0) {
                await member.roles.add(rolesToAdd, 'AutoRole ativado via painel.');
            }
        } catch (error) {
            console.error(`[AutoRole] Erro ao adicionar cargos para ${member.user.tag}:`, error.message);
        }
    }
    
    // Welcome Message Logic
    const welcomeSettings = await db.get(`guild_${member.guild.id}.welcome`);
    if (welcomeSettings) {
        const guild = member.guild;
        // Mensagem na DM
        if (welcomeSettings.dm_enabled && (welcomeSettings.dm_message || welcomeSettings.dm_embed.enabled)) {
             try {
                const content = processPlaceholders(welcomeSettings.dm_message, member, guild);
                const embed = createEmbedFromSettings(welcomeSettings.dm_embed, member, guild);
                await member.send({ content: content, embeds: embed ? [embed] : [] });
            } catch (e) {
                // Usuário bloqueou DM
            }
        }

        // Mensagem no Canal
        if (welcomeSettings.join_enabled && welcomeSettings.join_channel_id) {
            const channel = guild.channels.cache.get(welcomeSettings.join_channel_id);
            if (channel instanceof TextChannel) {
                const content = processPlaceholders(welcomeSettings.join_message, member, guild);
                const embed = createEmbedFromSettings(welcomeSettings.join_embed, member, guild);
                try {
                    await channel.send({ content: content, embeds: embed ? [embed] : [] });
                } catch (e) {
                    console.error(`Erro ao enviar boas-vindas:`, e.message);
                }
            }
        }
    }
});

client.on('guildMemberRemove', async member => {
    const welcomeSettings = await db.get(`guild_${member.guild.id}.welcome`);
    if (welcomeSettings && welcomeSettings.leave_enabled && welcomeSettings.leave_channel_id) {
        const guild = member.guild;
        const channel = guild.channels.cache.get(welcomeSettings.leave_channel_id);
        
        if (channel instanceof TextChannel) {
            const content = processPlaceholders(welcomeSettings.leave_message, member, guild, true);
            const embed = createEmbedFromSettings(welcomeSettings.leave_embed, member, guild, true);
            try {
                await channel.send({ content: content, embeds: embed ? [embed] : [] });
            } catch (e) {
                console.error(`Erro ao enviar mensagem de saída:`, e.message);
            }
        }
    }
});