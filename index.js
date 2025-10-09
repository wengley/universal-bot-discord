const { Client, GatewayIntentBits, Collection, Partials, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv'); 
const { QuickDB } = require('quick.db'); 
const db = new QuickDB(); 

// REQUIRES PARA O PAINEL WEB
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;


dotenv.config(); 

// Configuração do Bot Discord
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
const prefix = '!'; 

// ===================================
// 1. CARREGAMENTO DE COMANDOS
// ===================================
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js')); 


for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    try {
        const command = require(filePath);
        
        if ('name' in command && 'execute' in command) {
            client.commands.set(command.name, command);
        } else {
            console.warn(`[AVISO] O comando em ${filePath} está faltando a propriedade "name" ou "execute" necessária.`);
        }
    } catch (error) {
        console.error(`[ERRO NO COMANDO] Não foi possível carregar ${file}:`, error);
    }
}

// ===================================
// 2. EVENTO: BOT ONLINE
// ===================================
client.once('ready', () => {
    console.log(`\n===================================`);
    console.log(`✅ Bot pronto! Conectado como ${client.user.tag}`);
    console.log(`===================================\n`);
});


// ===================================
// FUNÇÕES AUXILIARES DE NOTIFICAÇÃO
// ===================================

const replacePlaceholders = (text, member) => {
    if (!text) return null;
    return text
        .replace(/{user}/g, member.user.tag)
        .replace(/{mention}/g, `<@${member.id}>`)
        .replace(/{guild}/g, member.guild.name)
        .replace(/{count}/g, member.guild.memberCount);
};

const buildEmbed = (embedData, member) => {
    if (!embedData || !embedData.enabled) return null;

    const embed = new EmbedBuilder();
    
    // Processa cada campo do embed, aplicando placeholders
    if (embedData.color) {
        // Converte a cor HEX (e.g., #7289da) para um número inteiro (0x7289da) que o Discord.js usa
        embed.setColor(parseInt(embedData.color.replace('#', '0x'), 16)); 
    }
    
    // Configura os campos
    if (embedData.authorName) embed.setAuthor({ 
        name: replacePlaceholders(embedData.authorName, member), 
        iconURL: embedData.authorIconUrl || member.user.displayAvatarURL() // Usa URL padrão se ícone não for fornecido
    });
    if (embedData.title) embed.setTitle(replacePlaceholders(embedData.title, member));
    if (embedData.description) embed.setDescription(replacePlaceholders(embedData.description, member));
    if (embedData.imageUrl) embed.setImage(embedData.imageUrl);
    if (embedData.thumbnailUrl) embed.setThumbnail(embedData.thumbnailUrl);
    if (embedData.footerText) embed.setFooter({ 
        text: replacePlaceholders(embedData.footerText, member), 
        iconURL: embedData.footerIconUrl || member.guild.iconURL() // Usa URL padrão se ícone não for fornecido
    });
    
    embed.setTimestamp(); // Adiciona timestamp padrão
    
    return embed;
};

// Envia a mensagem (Texto, Embed, ou Ambos)
const sendMessage = async (target, text, embed) => {
    const messages = [];

    if (text) messages.push(text);
    if (embed) messages.push(embed);

    if (messages.length === 0) return;

    // Se houver apenas texto, envia como string
    if (messages.length === 1 && typeof messages[0] === 'string') {
        await target.send(messages[0]);
        return;
    }
    
    // Se houver embed(s) e/ou texto junto, envia com objeto
    const payload = {
        content: messages.find(m => typeof m === 'string') || null,
        embeds: messages.filter(m => typeof m === 'object'),
    };
    
    await target.send(payload);
};


// ===================================
// 3. EVENTO: MEMBRO ENTRA (AUTO-ROLE, NOTIFICAÇÃO E DM)
// ===================================
client.on('guildMemberAdd', async member => {
    
    // --- LÓGICA AUTO-ROLE ---
    const roleId = await db.get(`autorole_${member.guild.id}`);
    
    if (roleId) {
        try {
            const role = member.guild.roles.cache.get(roleId);
            if (role && role.position < member.guild.members.me.roles.highest.position) {
                await member.roles.add(role, 'Auto-Role configurado via Painel Web.');
            }
        } catch (error) {
            console.error(`[ERRO AUTO-ROLE] Não foi possível dar o cargo ao membro ${member.user.tag}:`, error);
        }
    }

    // --- LÓGICA NOTIFICAÇÃO DE ENTRADA (CANAL) ---
    const joinData = await db.get(`join_notif_${member.guild.id}`);
    if (joinData && joinData.channelId && joinData.channelId !== 'none') {
        const channel = member.guild.channels.cache.get(joinData.channelId);
        
        if (channel) {
            const finalEmbed = buildEmbed(joinData.embed, member);
            const finalText = replacePlaceholders(joinData.text, member);

            try {
                await sendMessage(channel, finalText, finalEmbed);
            } catch (error) {
                console.error(`Erro ao enviar mensagem de entrada em ${member.guild.name}:`, error);
            }
        }
    }
    
    // --- LÓGICA MENSAGEM DE DM ---
    const dmData = await db.get(`dm_notif_${member.guild.id}`);

    if (dmData) {
        const finalEmbed = buildEmbed(dmData.embed, member);
        const finalText = replacePlaceholders(dmData.text, member);

        try {
            await sendMessage(member, finalText, finalEmbed);
        } catch (error) {
             // Ignora o erro se o usuário tiver DMs desativadas
        }
    }
});


// ===================================
// 4. EVENTO: MEMBRO SAI (NOTIFICAÇÃO)
// ===================================
client.on('guildMemberRemove', async member => {
    
    // --- LÓGICA NOTIFICAÇÃO DE SAÍDA (CANAL) ---
    const leaveData = await db.get(`leave_notif_${member.guild.id}`);

    if (leaveData && leaveData.channelId && leaveData.channelId !== 'none') {
        const channel = member.guild.channels.cache.get(leaveData.channelId);
        
        if (channel) {
            const finalEmbed = buildEmbed(leaveData.embed, member);
            const finalText = replacePlaceholders(leaveData.text, member);

            try {
                await sendMessage(channel, finalText, finalEmbed);
            } catch (error) {
                console.error(`Erro ao enviar mensagem de saída em ${member.guild.name}:`, error);
            }
        }
    }
});


// ===================================
// 5. EVENTO: MENSAGEM RECEBIDA (COMANDOS E AFK)
// ===================================
client.on('messageCreate', async message => {
    
    if (message.author.bot) return;

    // --- VERIFICAÇÃO DE AFK (Retorno) ---
    const guildId = message.guild.id;
    const userAfkStatus = await db.get(`afk_${guildId}_${message.author.id}`); 
    
    if (userAfkStatus) {
        await db.delete(`afk_${guildId}_${message.author.id}`);
        
        try {
            if (message.member.nickname && message.member.nickname.includes("[AFK]")) {
                const newNickname = message.member.nickname.replace(/\[AFK\]\s*/, '').trim();
                await message.member.setNickname(newNickname.length > 0 ? newNickname : null);
            }
        } catch (error) {
             // Ignora o erro de permissão de nick
        }
        
        message.channel.send(`👋 **Bem-vindo(a) de volta, ${message.author}!** Seu status AFK foi removido.`).then(msg => {
            setTimeout(() => msg.delete().catch(console.error), 7000); 
        }).catch(console.error);
    }
    
    // --- TRATAMENTO DE COMANDOS ! ---
    
    if (!message.content.startsWith(prefix)) return; 

    const args = message.content.slice(prefix.length).trim().split(/ +/);
    const commandName = args.shift().toLowerCase();

    const command = client.commands.get(commandName) || client.commands.find(cmd => cmd.aliases && cmd.aliases.includes(commandName));

    if (!command) return; 

    try {
        command.execute(message, args, client, db); 
    } catch (error) {
        console.error(`[ERRO DE EXECUÇÃO] Comando ${commandName}:`, error);
        message.reply('❌ Ocorreu um erro ao tentar executar este comando!');
    }
});


// ===================================
// 6. LOGIN DO BOT (Discord)
// ===================================

client.login(process.env.TOKEN_BOT); 


// ===================================
// 7. SERVIDOR WEB PARA RENDER (Painel e Ping 24/7)
// ===================================
const app = express();
const PORT = process.env.PORT || 3000;

// Configuração do EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware para processar dados JSON no POST
app.use(express.json());

// Configuração da Sessão
app.use(session({
    secret: process.env.SESSION_SECRET || 'uma-chave-secreta-forte-e-aleatoria-criada-por-voce', 
    resave: false,
    saveUninitialized: false,
}));

// Inicializa Passport
app.use(passport.initialize());
app.use(passport.session());

// --- Configuração do Discord OAuth2 ---
const CLIENT_ID = process.env.CLIENT_ID_BOT; 
const CLIENT_SECRET = process.env.CLIENT_SECRET_BOT; 
const CALLBACK_URL = process.env.CALLBACK_URL; 

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

passport.use(new DiscordStrategy({
    clientID: CLIENT_ID,
    clientSecret: CLIENT_SECRET, 
    callbackURL: CALLBACK_URL,
    scope: ['identify', 'guilds']
},
(accessToken, refreshToken, profile, done) => {
    process.nextTick(() => done(null, profile));
}));

// --- Rotas do Site ---

// Middleware de Autenticação
const isAuthenticated = (req, res, next) => {
    if (req.isAuthenticated()) {
        return next();
    }
    res.redirect('/login');
};

// Rota de Login 
app.get('/login', passport.authenticate('discord', { scope: ['identify', 'guilds'] }));

// Rota de Callback 
app.get('/callback', passport.authenticate('discord', {
    failureRedirect: '/'
}), (req, res) => {
    res.redirect('/dashboard');
});

// Rota de Logout
app.get('/logout', (req, res, next) => {
    req.logout((err) => {
        if (err) { return next(err); }
        res.redirect('/');
    });
});

// Rota Principal (Ping de Estabilidade 24/7)
app.get('/', (req, res) => {
    if (client.isReady()) {
        res.status(200).send(`✅ Bot Discord está online. Ping: ${client.ws.ping}ms.`);
    } else {
        res.status(503).send('Bot está iniciando...');
    }
});

// Rota do Painel (Requer login)
app.get('/dashboard', isAuthenticated, (req, res) => {
    res.render('dashboard', { 
        user: req.user,
        client: client,
        db: db,
        guilds: req.user.guilds 
    });
});

// Rota de Configuração por Servidor
app.get('/dashboard/:guildId', isAuthenticated, async (req, res) => {
    const guildId = req.params.guildId;
    
    const guild = client.guilds.cache.get(guildId);
    if (!guild) {
        return res.status(404).send('Bot não está neste servidor ou servidor inválido.');
    }
    
    const userGuild = req.user.guilds.find(g => g.id === guildId);
    if (!userGuild || !((userGuild.permissions & 0x8) === 0x8 || (userGuild.permissions & 0x20) === 0x20)) {
        return res.status(403).send('Você não tem permissão de Administrador/Gerenciar Servidor neste local.');
    }

    // Obter dados do servidor
    const roles = guild.roles.cache
        .filter(r => r.id !== guild.id)
        .sort((a, b) => b.position - a.position);
        
    const textChannels = guild.channels.cache
        .filter(c => c.type === 0) // type 0 é canal de texto
        .sort((a, b) => a.position - b.position);

    // Obter configurações atuais
    const currentAutoroleId = await db.get(`autorole_${guildId}`);
    
    // Configurações Padrão para evitar erros de renderização no EJS
    const defaultEmbed = { enabled: false, color: '#7289da', authorName: null, authorIconUrl: null, title: null, description: null, imageUrl: null, thumbnailUrl: null, footerText: null, footerIconUrl: null };
    
    const joinNotif = await db.get(`join_notif_${guildId}`) || { channelId: 'none', text: 'Boas-vindas, {mention}! Temos agora {count} membros!', embed: defaultEmbed };
    const leaveNotif = await db.get(`leave_notif_${guildId}`) || { channelId: 'none', text: 'Adeus, {user}! Sentiremos sua falta.', embed: { ...defaultEmbed, color: '#e74c3c' } };
    const dmNotif = await db.get(`dm_notif_${guildId}`) || { text: 'Obrigado por entrar em {guild}!', embed: { ...defaultEmbed, color: '#2ecc71' } };
    
    // Garante que o objeto embed exista mesmo que o objeto pai tenha sido criado sem ele
    joinNotif.embed = joinNotif.embed || defaultEmbed;
    leaveNotif.embed = leaveNotif.embed || { ...defaultEmbed, color: '#e74c3c' };
    dmNotif.embed = dmNotif.embed || { ...defaultEmbed, color: '#2ecc71' };

    res.render('guild_settings', { 
        user: req.user,
        guild: guild,
        roles: roles,
        textChannels: textChannels,
        currentAutoroleId: currentAutoroleId,
        joinNotif: joinNotif,
        leaveNotif: leaveNotif,
        dmNotif: dmNotif,
        client: client
    });
});

// Rota POST para Salvar Auto-Role
app.post('/dashboard/:guildId/autorole', isAuthenticated, async (req, res) => {
    const guildId = req.params.guildId;
    const { roleId } = req.body;

    const userGuild = req.user.guilds.find(g => g.id === guildId);
    if (!userGuild || !((userGuild.permissions & 0x8) === 0x8 || (userGuild.permissions & 0x20) === 0x20)) {
        return res.status(403).json({ success: false, message: 'Permissão negada.' });
    }

    if (roleId === 'none') {
        await db.delete(`autorole_${guildId}`);
        return res.json({ success: true, message: 'Auto-Role desativado com sucesso.' });
    }

    const guild = client.guilds.cache.get(guildId);
    if (!guild || !guild.roles.cache.has(roleId)) {
        return res.status(400).json({ success: false, message: 'Cargo inválido.' });
    }
    
    const selectedRole = guild.roles.cache.get(roleId);
    if (selectedRole.position >= guild.members.me.roles.highest.position) {
         return res.status(400).json({ success: false, message: 'O cargo é superior ou igual ao meu. Não consigo atribuí-lo.' });
    }

    await db.set(`autorole_${guildId}`, roleId);

    res.json({ success: true, message: `Auto-Role definido para @${selectedRole.name}.` });
});

// ----------------------------------------------------------------------
// Rota POST para Salvar Notificação de Entrada
app.post('/dashboard/:guildId/save_join', isAuthenticated, async (req, res) => {
    const guildId = req.params.guildId;
    const { channelId, text, embed } = req.body; 

    const userGuild = req.user.guilds.find(g => g.id === guildId);
    if (!userGuild || !((userGuild.permissions & 0x8) === 0x8 || (userGuild.permissions & 0x20) === 0x20)) {
        return res.status(403).json({ success: false, message: 'Permissão negada.' });
    }

    if (channelId === 'none' && !text && !(embed && embed.enabled)) {
        await db.delete(`join_notif_${guildId}`);
        return res.json({ success: true, message: 'Notificação de Entrada desativada.' });
    }
    
    if (channelId !== 'none') {
        const guild = client.guilds.cache.get(guildId);
        if (!guild.channels.cache.has(channelId) || guild.channels.cache.get(channelId).type !== 0) {
            return res.status(400).json({ success: false, message: 'Canal de Entrada inválido.' });
        }
    }

    await db.set(`join_notif_${guildId}`, { channelId: channelId, text: text, embed: embed });

    const channelName = channelId !== 'none' ? `#${client.guilds.cache.get(guildId).channels.cache.get(channelId).name}` : 'N/A';
    res.json({ success: true, message: `Notificação de Entrada salva com sucesso no canal: ${channelName}` });
});

// Rota POST para Salvar Notificação de Saída
app.post('/dashboard/:guildId/save_leave', isAuthenticated, async (req, res) => {
    const guildId = req.params.guildId;
    const { channelId, text, embed } = req.body; 

    const userGuild = req.user.guilds.find(g => g.id === guildId);
    if (!userGuild || !((userGuild.permissions & 0x8) === 0x8 || (userGuild.permissions & 0x20) === 0x20)) {
        return res.status(403).json({ success: false, message: 'Permissão negada.' });
    }

    if (channelId === 'none' && !text && !(embed && embed.enabled)) {
        await db.delete(`leave_notif_${guildId}`);
        return res.json({ success: true, message: 'Notificação de Saída desativada.' });
    }
    
    if (channelId !== 'none') {
        const guild = client.guilds.cache.get(guildId);
        if (!guild.channels.cache.has(channelId) || guild.channels.cache.get(channelId).type !== 0) {
            return res.status(400).json({ success: false, message: 'Canal de Saída inválido.' });
        }
    }

    await db.set(`leave_notif_${guildId}`, { channelId: channelId, text: text, embed: embed });

    const channelName = channelId !== 'none' ? `#${client.guilds.cache.get(guildId).channels.cache.get(channelId).name}` : 'N/A';
    res.json({ success: true, message: `Notificação de Saída salva com sucesso no canal: ${channelName}` });
});

// Rota POST para Salvar Mensagem de DM
app.post('/dashboard/:guildId/save_dm', isAuthenticated, async (req, res) => {
    const guildId = req.params.guildId;
    const { text, embed } = req.body; 

    const userGuild = req.user.guilds.find(g => g.id === guildId);
    if (!userGuild || !((userGuild.permissions & 0x8) === 0x8 || (userGuild.permissions & 0x20) === 0x20)) {
        return res.status(403).json({ success: false, message: 'Permissão negada.' });
    }

    if (!text && !(embed && embed.enabled)) {
        await db.delete(`dm_notif_${guildId}`);
        return res.json({ success: true, message: 'Mensagem de DM desativada.' });
    }

    await db.set(`dm_notif_${guildId}`, { text: text, embed: embed });

    res.json({ success: true, message: `Mensagem de DM salva com sucesso.` });
});


// Rota POST para TESTAR Notificação de Entrada
app.post('/dashboard/:guildId/test_join', isAuthenticated, async (req, res) => {
    const guildId = req.params.guildId;
    const { channelId, text, embed } = req.body; 

    const userGuild = req.user.guilds.find(g => g.id === guildId);
    if (!userGuild || !((userGuild.permissions & 0x8) === 0x8 || (userGuild.permissions & 0x20) === 0x20)) {
        return res.status(403).json({ success: false, message: 'Permissão negada.' });
    }

    const guild = client.guilds.cache.get(guildId);
    const channel = guild.channels.cache.get(channelId);
    
    if (!channel || channel.type !== 0) {
        return res.status(400).json({ success: false, message: 'Canal de texto inválido.' });
    }

    const user = req.user;
    const member = { user: user, id: user.id, guild: guild }; // Mock de Member para teste
    
    const finalEmbed = buildEmbed(embed, member);
    const finalText = text ? `[TESTE DO PAINEL WEB] - ${replacePlaceholders(text, member)}` : null;

    if (!finalText && !finalEmbed) {
        return res.status(400).json({ success: false, message: 'Nenhuma mensagem ou Embed configurado para teste.' });
    }

    try {
        await sendMessage(channel, finalText, finalEmbed);
        return res.json({ success: true, message: `Mensagem de teste de Entrada enviada com sucesso para #${channel.name}.` });
    } catch (error) {
        console.error(`Erro ao enviar mensagem de teste:`, error);
        return res.status(500).json({ success: false, message: 'Erro ao enviar mensagem: O bot pode não ter permissão de escrita no canal.' });
    }
});


// Rota POST para TESTAR Mensagem de DM
app.post('/dashboard/:guildId/test_dm', isAuthenticated, async (req, res) => {
    const guildId = req.params.guildId;
    const { text, embed } = req.body; 

    const userGuild = req.user.guilds.find(g => g.id === guildId);
    if (!userGuild || !((userGuild.permissions & 0x8) === 0x8 || (userGuild.permissions & 0x20) === 0x20)) {
        return res.status(403).json({ success: false, message: 'Permissão negada.' });
    }

    const guild = client.guilds.cache.get(guildId);
    const user = req.user;
    const member = { user: user, id: user.id, guild: guild }; // Mock de Member para teste

    const finalEmbed = buildEmbed(embed, member);
    const finalText = text ? `[TESTE DO PAINEL WEB DM] - ${replacePlaceholders(text, member)}` : null;
    
    if (!finalText && !finalEmbed) {
        return res.status(400).json({ success: false, message: 'Nenhuma mensagem ou Embed configurado para teste de DM.' });
    }

    try {
        const dmUser = await client.users.fetch(user.id);
        await sendMessage(dmUser, finalText, finalEmbed);

        return res.json({ success: true, message: `Mensagem de teste de DM enviada com sucesso para ${user.username}.` });
    } catch (error) {
        console.error(`Erro ao enviar mensagem de teste de DM:`, error);
        return res.status(500).json({ success: false, message: 'Erro ao enviar mensagem de DM. Você deve ter DMs ativadas.' });
    }
});


// Ouve na porta
app.listen(PORT, () => {
    console.log(`✅ Servidor Web do Render iniciado na porta ${PORT} para o Painel.`);
});