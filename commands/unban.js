const { PermissionsBitField } = require('discord.js');

module.exports = {
    name: 'unban',
    description: 'Desbane um usuário do servidor usando seu ID.',
    
    async execute(message, args) {
        // 1. CHECAGEM DE PERMISSÕES DO AUTOR
        if (!message.member.permissions.has(PermissionsBitField.Flags.BanMembers)) {
            return message.reply({ content: '❌ Você não tem permissão para usar este comando. Permissão necessária: **Banir Membros**.', ephemeral: true });
        }
        
        // 2. OBTER O ID DO USUÁRIO
        // O ID é o primeiro argumento
        const userId = args[0];

        if (!userId) {
            return message.reply('⚠️ Por favor, forneça o **ID** do usuário para desbanir.');
        }
        
        // 3. TENTAR BUSCAR O USUÁRIO BANIDO
        let user;
        try {
            user = await message.guild.bans.fetch(userId);
        } catch (error) {
            // Se der erro, geralmente é porque o ID é inválido ou o usuário não está banido
            return message.reply('❌ Não foi possível encontrar este ID na lista de banimentos.');
        }
        
        // 4. EXECUTAR O DESBANIMENTO
        try {
            // O unban precisa do ID, e não do objeto 'member'
            await message.guild.bans.remove(userId);
            
            // Cria o Embed de confirmação
            const unbanEmbed = {
                color: 0x00ff00, // Verde
                title: '✅ Usuário Desbanido',
                fields: [
                    { name: 'Usuário', value: `${user.user.tag} (${user.user.id})`, inline: false },
                    { name: 'Moderador', value: `${message.author.tag}`, inline: true },
                ],
                timestamp: new Date().toISOString(),
                footer: { text: message.guild.name },
            };

            message.channel.send({ embeds: [unbanEmbed] });
            
        } catch (error) {
            console.error(error);
            message.reply('❌ Ocorreu um erro ao tentar desbanir o usuário.');
        }
    },
};