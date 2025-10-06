const { EmbedBuilder } = require('discord.js');

module.exports = {
    name: 'avatar',
    description: 'Mostra o avatar seu ou de um usuário mencionado.',
    aliases: ['pfp', 'foto'],
    
    async execute(message, args) {
        // Prioriza o usuário mencionado, caso contrário, usa o autor da mensagem
        const member = message.mentions.members.first() || message.member;
        const user = member.user;

        const avatarEmbed = new EmbedBuilder()
            .setColor(0x00ae86)
            .setTitle(`🖼️ Avatar de ${user.username}`)
            .setImage(user.displayAvatarURL({ dynamic: true, size: 4096 })) // Tamanho máximo e dinâmico (GIF)
            .setFooter({ text: `Requisitado por: ${message.author.tag}` })
            .setTimestamp();

        message.channel.send({ embeds: [avatarEmbed] });
    },
};