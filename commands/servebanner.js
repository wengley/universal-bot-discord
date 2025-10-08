// commands/serverbanner.js
const { EmbedBuilder } = require('discord.js');

module.exports = {
    name: 'serverbanner',
    description: 'Mostra o banner do servidor em alta qualidade (requer Boost Nível 2).',
    aliases: ['banner'],
    
    async execute(message, args, client, db) {
        
        const guild = message.guild;
        
        const bannerURL = guild.bannerURL({ dynamic: true, size: 4096 });

        if (!bannerURL) {
            return message.reply('Este servidor não possui um banner. O banner é geralmente liberado no Nível 2 de Boost.');
        }

        const embed = new EmbedBuilder()
            .setColor(0x9B59B6)
            .setTitle(`✨ Banner do Servidor: ${guild.name}`)
            .setImage(bannerURL) // Define a imagem como o banner do servidor
            .setURL(bannerURL) // Link para a imagem em alta qualidade
            .setFooter({ text: `ID do Servidor: ${guild.id}` })
            .setTimestamp();

        message.channel.send({ embeds: [embed] });
    },
};