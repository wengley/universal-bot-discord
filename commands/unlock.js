const { PermissionsBitField, PermissionFlagsBits, EmbedBuilder, SlashCommandBuilder } = require('discord.js');

module.exports = {
    name: 'unlock',
    description: 'Desbloqueia um canal para que membros possam enviar mensagens novamente.',
    aliases: ['desbloquear'],
    category: 'Moderação',
    data: new SlashCommandBuilder()
        .setName('unlock')
        .setDescription('Desbloqueia o canal atual para envio de mensagens.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

    async execute(message, args) {
        // 1. CHECAGEM DE PERMISSÃO DO USUÁRIO
        if (!message.member.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
            return message.reply("❌ Você precisa da permissão **Gerenciar Canais** para usar este comando.");
        }

        // 2. CHECAGEM DE PERMISSÃO DO BOT
        if (!message.guild.members.me.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
            return message.reply("❌ Eu preciso da permissão **Gerenciar Canais** para desbloquear este canal.");
        }
        
        // 3. ENCONTRAR O CARGO @everyone (Necessário para a ação)
        const everyoneRole = message.guild.roles.cache.find(role => role.name === '@everyone');

        // 4. DESBLOQUEAR O CANAL
        try {
            // O comando edita as permissões do cargo @everyone no canal atual.
            // .set(Permissão, Valor): SEND_MESSAGES para NULL (restaura a permissão padrão, que é TRUE)
            await message.channel.permissionOverwrites.edit(everyoneRole, {
                SendMessages: null
            });

            // 5. RESPOSTA E FEEDBACK
            const unlockEmbed = new EmbedBuilder()
                .setColor(0x00FF00) // Verde
                .setTitle('🔓 Canal Desbloqueado')
                .setDescription(`Este canal foi desbloqueado por ${message.author}.`)
                .setTimestamp();

            await message.channel.send({ embeds: [unlockEmbed] });
            
        } catch (error) {
            console.error('Erro ao desbloquear canal:', error);
            message.reply('❌ Ocorreu um erro ao tentar desbloquear o canal. Verifique minhas permissões.');
        }
    },
};