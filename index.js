const { Client, GatewayIntentBits, Collection, Partials } = require('discord.js');
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
// 3. EVENTO: MEMBRO ENTRA (AUTO-ROLE)
// ===================================
client.on('guildMemberAdd', async member => {
    
    // Pega o ID do cargo salvo no DB
    const roleId = await db.get(`autorole_${member.guild.id}`);
    
    if (roleId) {
        try {
            const role = member.guild.roles.cache.get(roleId);
            
            // Garante que o bot pode dar o cargo
            if (role && role.position < member.guild.members.me.roles.highest.position) {
                await member.roles.add(role, 'Auto-Role configurado via Painel Web.');
                console.log(`[AUTO-ROLE] Cargo ${role.name} dado a ${member.user.tag}.`);
            }
        } catch (error) {
            console.error(`[ERRO AUTO-ROLE] Não foi possível dar o cargo ao membro ${member.user.tag}:`, error);
        }
    }
});


// ===================================
// 4. EVENTO: MENSAGEM RECEBIDA (COMANDOS E AFK)
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
// 5. LOGIN DO BOT (Discord)
// ===================================

client.login(process.env.TOKEN_BOT); 


// ===================================
// 6. SERVIDOR WEB PARA RENDER (Painel e Ping 24/7)
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
    // Usa a variável de ambiente do Render, com um fallback seguro.
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
    
    // 1. Verificar se o bot está no servidor
    const guild = client.guilds.cache.get(guildId);
    if (!guild) {
        return res.status(404).send('Bot não está neste servidor ou servidor inválido.');
    }
    
    // 2. Verificar se o usuário logado é administrador
    const userGuild = req.user.guilds.find(g => g.id === guildId);
    if (!userGuild || !((userGuild.permissions & 0x8) === 0x8 || (userGuild.permissions & 0x20) === 0x20)) {
        return res.status(403).send('Você não tem permissão de Administrador/Gerenciar Servidor neste local.');
    }

    // 3. Obter dados do servidor
    const roles = guild.roles.cache
        .filter(r => r.id !== guild.id) // Remove o cargo @everyone
        .sort((a, b) => b.position - a.position); // Ordena por posição

    // 4. Obter a configuração atual do Auto-Role
    const currentAutoroleId = await db.get(`autorole_${guildId}`);

    res.render('guild_settings', { 
        user: req.user,
        guild: guild,
        roles: roles,
        currentAutoroleId: currentAutoroleId,
        client: client
    });
});

// Rota POST para Salvar Auto-Role
app.post('/dashboard/:guildId/autorole', isAuthenticated, async (req, res) => {
    const guildId = req.params.guildId;
    const { roleId } = req.body; // Pega o roleId enviado pelo site

    // 1. Verificação de permissão (segurança no backend)
    const userGuild = req.user.guilds.find(g => g.id === guildId);
    if (!userGuild || !((userGuild.permissions & 0x8) === 0x8 || (userGuild.permissions & 0x20) === 0x20)) {
        return res.status(403).json({ success: false, message: 'Permissão negada.' });
    }

    if (roleId === 'none') {
        // Desativar Auto-Role
        await db.delete(`autorole_${guildId}`);
        return res.json({ success: true, message: 'Auto-Role desativado com sucesso.' });
    }

    const guild = client.guilds.cache.get(guildId);
    if (!guild || !guild.roles.cache.has(roleId)) {
        return res.status(400).json({ success: false, message: 'Cargo inválido.' });
    }
    
    // 2. Verificação de hierarquia do bot
    const selectedRole = guild.roles.cache.get(roleId);
    if (selectedRole.position >= guild.members.me.roles.highest.position) {
         return res.status(400).json({ success: false, message: 'O cargo é superior ou igual ao meu. Não consigo atribuí-lo.' });
    }

    // 3. Salvar no QuickDB
    await db.set(`autorole_${guildId}`, roleId);

    res.json({ success: true, message: `Auto-Role definido para @${selectedRole.name}.` });
});

// Ouve na porta
app.listen(PORT, () => {
    console.log(`✅ Servidor Web do Render iniciado na porta ${PORT} para o Painel.`);
});