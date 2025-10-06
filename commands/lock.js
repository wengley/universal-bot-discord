const { PermissionsBitField, EmbedBuilder } = require('discord.js');

module.exports = {
    name: 'lock',
    description: 'Bloqueia um canal para impedir que membros enviem mensagens (apenas leitura).',
    aliases: ['bloquear'],

    async execute(message, args) {
        // 1. CHECAGEM DE PERMISSÃO DO USUÁRIO
        if (!message.member.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
            return message.reply("❌ Você precisa da permissão **Gerenciar Canais** para usar este comando.");
        }

        // 2. CHECAGEM DE PERMISSÃO DO BOT
        if (!message.guild.members.me.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
            return message.reply("❌ Eu preciso da permissão **Gerenciar Canais** para bloquear este canal.");
        }
        
        // 3. ENCONTRAR O CARGO @everyone (Necessário para a ação)
        const everyoneRole = message.guild.roles.cache.find(role => role.name === '@everyone');
        
        // 4. BLOQUEAR O CANAL
        try {
            // O comando edita as permissões do cargo @everyone no canal atual.
            // .set(Permissão, Valor): SEND_MESSAGES para FALSE (bloqueia o envio)
            await message.channel.permissionOverwrites.edit(everyoneRole, {
                SendMessages: false 
            });

            // 5. RESPOSTA E FEEDBACK
            const lockEmbed = new EmbedBuilder()
                .setColor(0xFF0000) // Vermelho
                .setTitle('🔒 Canal Bloqueado')
                .setDescription(`Este canal foi bloqueado por ${message.author}.`)
                .setTimestamp();

            await message.channel.send({ embeds: [lockEmbed] });
            
        } catch (error) {
            console.error('Erro ao bloquear canal:', error);
            message.reply('❌ Ocorreu um erro ao tentar bloquear o canal. Verifique minhas permissões.');
        }
    },
};