const { PermissionsBitField } = require('discord.js');

module.exports = {
    name: 'ban',
    description: 'Bane um membro permanentemente do servidor.',
    
    async execute(message, args) {
        // 1. CHECAGEM DE PERMISSÕES DO AUTOR
        if (!message.member.permissions.has(PermissionsBitField.Flags.BanMembers)) {
            return message.reply({ content: '❌ Você não tem permissão para usar este comando. Permissão necessária: **Banir Membros**.', ephemeral: true });
        }
        
        // 2. ENCONTRAR O MEMBRO
        const memberToBan = message.mentions.members.first() || message.guild.members.cache.get(args[0]);

        if (!memberToBan) {
            return message.reply('⚠️ Por favor, mencione o membro ou forneça o ID para ser banido.');
        }

        // 3. DEFINIR O MOTIVO
        const reason = args.slice(1).join(' ') || 'Nenhum motivo fornecido.';

        // 4. CHECAGENS DE HIERARQUIA
        
        // Verifica se o bot pode banir o usuário
        if (!memberToBan.bannable) {
            return message.reply('⚠️ Não posso banir este membro. Meu cargo é igual ou inferior ao dele, ou é o dono do servidor.');
        }

        // Verifica se o autor está tentando banir a si mesmo
        if (memberToBan.id === message.author.id) {
            return message.reply('Você não pode se auto-banir.');
        }

        // 5. EXECUTAR O BANIMENTO
        try {
            await memberToBan.ban({ reason: reason });

            // Cria o Embed de confirmação
            const banEmbed = {
                color: 0xaa0000, // Vermelho Escuro
                title: '🔨 Membro Banido',
                fields: [
                    { name: 'Usuário', value: `${memberToBan.user.tag} (${memberToBan.id})`, inline: false },
                    { name: 'Moderador', value: `${message.author.tag}`, inline: true },
                    { name: 'Motivo', value: reason, inline: false },
                ],
                timestamp: new Date().toISOString(),
                footer: { text: message.guild.name },
            };

            message.channel.send({ embeds: [banEmbed] });
            
        } catch (error) {
            console.error(error);
            message.reply('❌ Ocorreu um erro ao tentar banir o membro.');
        }
    },
};