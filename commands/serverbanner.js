// commands/serverbanner.js
const { EmbedBuilder, SlashCommandBuilder } = require('discord.js');

module.exports = {
    name: 'serverbanner',
    description: 'Mostra o banner do servidor em alta qualidade (requer Boost Nível 2).',
    aliases: ['banner'],
    category: 'Informação',
    data: new SlashCommandBuilder().setName('serverbanner').setDescription('Mostra o banner do servidor em alta qualidade.'),
    
    async execute(message, args, client, db) {
        
        const guild = message.guild;
        
        const bannerURL = guild.bannerURL({ dynamic: true, size: 4096 });

        if (!bannerURL) {
            return message.reply('Este servidor não possui um banner.');
        }

        const embed = new EmbedBuilder()
            .setColor(0x9B59B6)
            .setTitle(`✨ Banner do Servidor: ${guild.name}`)
            .setImage(bannerURL) 
            .setURL(bannerURL) 
            .setFooter({ text: `ID do Servidor: ${guild.id}` })
            .setTimestamp();

        message.channel.send({ embeds: [embed] });
    },
};