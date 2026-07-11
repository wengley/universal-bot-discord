// commands/servericon.js
const { EmbedBuilder, SlashCommandBuilder } = require('discord.js');

module.exports = {
    name: 'servericon',
    description: 'Mostra o ícone (avatar) do servidor em alta qualidade.',
    aliases: ['icon', 'serveravatar'],
    category: 'Informação',
    data: new SlashCommandBuilder().setName('servericon').setDescription('Mostra o ícone (avatar) do servidor em alta qualidade.'),
    
    async execute(message, args, client, db) {
        
        const guild = message.guild;
        
        const iconURL = guild.iconURL({ dynamic: true, size: 4096 });

        if (!iconURL) {
            return message.reply('Este servidor não possui um ícone (avatar).');
        }

        const embed = new EmbedBuilder()
            .setColor(0x3498DB)
            .setTitle(`🖼️ Ícone do Servidor: ${guild.name}`)
            .setImage(iconURL)
            .setURL(iconURL) 
            .setFooter({ text: `ID do Servidor: ${guild.id}` })
            .setTimestamp();

        message.channel.send({ embeds: [embed] });
    },
};