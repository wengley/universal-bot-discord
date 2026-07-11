const { PermissionsBitField, PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');

module.exports = {
    name: 'adv',
    description: 'Aplica uma advertência numerada e atribui o cargo correspondente.',
    category: 'Moderação',
    data: new SlashCommandBuilder()
        .setName('adv')
        .setDescription('Aplica uma advertência numerada e atribui o cargo correspondente.')
        .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
        .addUserOption(opt => opt.setName('usuario').setDescription('Membro a advertir').setRequired(true))
        .addIntegerOption(opt => opt.setName('numero').setDescription('Número da advertência').setRequired(true)
            .addChoices({ name: '1', value: 1 }, { name: '2', value: 2 }, { name: '3', value: 3 }))
        .addStringOption(opt => opt.setName('motivo').setDescription('Motivo da advertência').setRequired(false)),
    
    async execute(message, args) {
        // ID do Canal de Logs. **SUBSTITUA ESTE VALOR COM O ID DO SEU CANAL DE LOGS.**
        const CANAL_LOGS_ID = 'SEU_ID_DO_CANAL_DE_LOGS_AQUI'; 

        // ===========================================
        // 1. MAPEAMENTO DE CARGOS DE ADVERTÊNCIA
        // **SUBSTITUA ESTES VALORES COM OS IDs DOS CARGOS REAIS!**
        // ===========================================
        const ADV_ROLES = {
            '1': '1424187143764578405', // Ex: Cargo "Advertência 1"
            '2': '1424187157626622022', // Ex: Cargo "Advertência 2"
            '3': '1424187180271800392', // Ex: Cargo "Advertência 3 / Kick"
            // Você pode adicionar mais números aqui, como '4', '5', etc.
        };
        
        // 2. CHECAGEM DE PERMISSÕES DO AUTOR (Ainda precisa de permissão de kick/ban para advertir)
        if (!message.member.permissions.has(PermissionsBitField.Flags.KickMembers)) {
            return message.reply({ content: '❌ Você não tem permissão para dar advertências. Permissão necessária: **Expulsar Membros**.', ephemeral: true });
        }
        
        // 3. ENCONTRAR MEMBRO, NÚMERO E MOTIVO
        const memberToWarn = message.mentions.members.first() || message.guild.members.cache.get(args[0]);

        if (!memberToWarn) {
            return message.reply('⚠️ Por favor, mencione o membro ou forneça o ID para advertir.');
        }

        let advNumber;
        let reason;

        // Lógica para capturar o número e o motivo, independentemente de ser menção ou ID.
        if (message.mentions.members.first()) {
            advNumber = args[1]; // Ex: !adv @user 1 motivo
            reason = args.slice(2).join(' ') || 'Nenhum motivo fornecido.';
        } else {
            advNumber = args[1]; // Ex: !adv 123456 1 motivo
            reason = args.slice(2).join(' ') || 'Nenhum motivo fornecido.';
        }

        // Checagem se o número da adv foi fornecido e se ele tem um cargo mapeado
        if (!advNumber || !ADV_ROLES[advNumber]) {
            return message.reply(`⚠️ Por favor, especifique um **número de advertência válido** (${Object.keys(ADV_ROLES).join(', ')}).`);
        }
        
        // 4. PREPARAR CARGO
        const roleIdToAssign = ADV_ROLES[advNumber];
        const role = message.guild.roles.cache.get(roleIdToAssign);

        if (!role) {
             return message.reply(`❌ O cargo para a Advertência N° ${advNumber} (ID: ${roleIdToAssign}) não foi encontrado no servidor. Verifique o ID no arquivo adv.js.`);
        }

        // 5. CHECAGENS DE HIERARQUIA DO BOT
        if (!message.guild.members.me.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
            return message.reply('❌ Meu bot não tem permissão para **Gerenciar Cargos** para executar este comando. Dê a permissão ao meu cargo.');
        }

        if (role.position >= message.guild.members.me.roles.highest.position) {
            return message.reply(`❌ O cargo **${role.name}** está no mesmo nível ou acima do meu cargo mais alto. Não posso atribuí-lo.`);
        }
        
        // 6. ADICIONAR O CARGO
        try {
            // Remove outros cargos de advertência, se houver, para garantir que só tenha o mais novo.
            const advRoleIds = Object.values(ADV_ROLES);
            const currentAdvRoles = memberToWarn.roles.cache.filter(r => advRoleIds.includes(r.id));
            
            // Tenta remover os cargos de advertência antigos
            if (currentAdvRoles.size > 0) {
                await memberToWarn.roles.remove(currentAdvRoles, `Nova Advertência N° ${advNumber}`);
            }

            // Adiciona o novo cargo
            await memberToWarn.roles.add(role, `Advertência N° ${advNumber} - Moderador: ${message.author.tag}`);
            
            // 7. ENVIAR MENSAGEM PRIVADA (DM) AO USUÁRIO ADVERTIDO
            try {
                const dmEmbed = {
                    color: 0xffa500, // Laranja
                    title: `🚨 Você Recebeu o Aviso N° ${advNumber}`,
                    description: `Você recebeu um aviso no servidor **${message.guild.name}**. O cargo **${role.name}** foi atribuído a você.`,
                    fields: [
                        { name: 'Motivo', value: reason, inline: false },
                        { name: 'Moderador', value: `${message.author.tag}`, inline: true },
                    ],
                    timestamp: new Date().toISOString(),
                    footer: { text: 'Por favor, ajuste seu comportamento.' },
                };

                await memberToWarn.send({ embeds: [dmEmbed] });
            } catch (error) {
                console.error(`Não foi possível enviar DM para ${memberToWarn.user.tag}: ${error.message}`);
            }

            // 8. ENVIAR MENSAGEM DE SUCESSO E LOGAR
            const successEmbed = {
                color: 0xffa500,
                title: `⚠️ Membro Advertido (Aviso N° ${advNumber})`,
                fields: [
                    { name: 'Usuário', value: `${memberToWarn.user.tag} (${memberToWarn.id})`, inline: false },
                    { name: 'Cargo Atribuído', value: role.name, inline: true },
                    { name: 'Moderador', value: `${message.author.tag}`, inline: true },
                    { name: 'Motivo', value: reason, inline: false },
                ],
                timestamp: new Date().toISOString(),
            };

            message.channel.send({ embeds: [successEmbed] });

            const logsChannel = message.guild.channels.cache.get(CANAL_LOGS_ID);
            if (logsChannel) {
                logsChannel.send({ embeds: [successEmbed] });
            }
            
        } catch (error) {
            console.error(error);
            message.reply('❌ Ocorreu um erro ao tentar atribuir o cargo. Verifique se o bot tem permissão e se seu cargo está acima do cargo da advertência.');
        }
    },
};