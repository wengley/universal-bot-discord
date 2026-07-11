const { PermissionsBitField, PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');

module.exports = {
    name: 'kick',
    description: 'Expulsa um membro do servidor.',
    category: 'Moderação',
    data: new SlashCommandBuilder()
        .setName('kick')
        .setDescription('Expulsa um membro do servidor.')
        .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
        .addUserOption(opt => opt.setName('usuario').setDescription('Membro a expulsar').setRequired(true))
        .addStringOption(opt => opt.setName('motivo').setDescription('Motivo da expulsão').setRequired(false)),
    
    async execute(message, args) {
        // 1. CHECAGEM DE PERMISSÕES DO AUTOR
        if (!message.member.permissions.has(PermissionsBitField.Flags.KickMembers)) {
            return message.reply({ content: '❌ Você não tem permissão para usar este comando. Permissão necessária: **Expulsar Membros**.', ephemeral: true });
        }
        
        // 2. ENCONTRAR O MEMBRO
        // O primeiro argumento (args[0]) é geralmente a menção ou ID
        const memberToKick = message.mentions.members.first() || message.guild.members.cache.get(args[0]);

        if (!memberToKick) {
            return message.reply('⚠️ Por favor, mencione o membro ou forneça o ID para ser expulso.');
        }

        // 3. DEFINIR O MOTIVO
        // O motivo é o resto dos argumentos, ou um motivo padrão
        const reason = args.slice(1).join(' ') || 'Nenhum motivo fornecido.';

        // 4. CHECAGENS DE HIERARQUIA
        
        // Verifica se o bot pode expulsar o usuário (seus cargos têm que ser mais altos)
        if (!memberToKick.kickable) {
            return message.reply('⚠️ Não posso expulsar este membro. Meu cargo é igual ou inferior ao dele, ou é o dono do servidor.');
        }

        // Verifica se o autor está tentando expulsar a si mesmo
        if (memberToKick.id === message.author.id) {
            return message.reply('Você não pode se auto-expulsar.');
        }

        // 5. EXECUTAR A EXPULSÃO
        try {
            await memberToKick.kick(reason);

            // Cria o Embed de confirmação
            const kickEmbed = {
                color: 0xff0000, // Vermelho
                title: '👢 Membro Expulso',
                fields: [
                    { name: 'Usuário', value: `${memberToKick.user.tag} (${memberToKick.id})`, inline: false },
                    { name: 'Moderador', value: `${message.author.tag}`, inline: true },
                    { name: 'Motivo', value: reason, inline: false },
                ],
                timestamp: new Date().toISOString(),
                footer: { text: message.guild.name },
            };

            message.channel.send({ embeds: [kickEmbed] });
            
        } catch (error) {
            console.error(error);
            message.reply('❌ Ocorreu um erro ao tentar expulsar o membro.');
        }
    },
};