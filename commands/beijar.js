const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, SlashCommandBuilder } = require('discord.js');

module.exports = {
    name: 'beijar',
    description: 'Beija um usuário com um GIF divertido e permite retribuir.',
    category: 'Diversão',
    data: new SlashCommandBuilder()
        .setName('beijar')
        .setDescription('Beija um usuário com um GIF divertido.')
        .addUserOption(opt => opt.setName('usuario').setDescription('Quem você quer beijar').setRequired(true)),

    async execute(message, args) {
        // Links diretos de mídia (media.tenor.com) — os links de página do
        // Tenor não funcionam em embeds, precisam ser o arquivo .gif direto.
        const kissGifs = [
            'https://media1.tenor.com/m/yjs5F1dPcLkAAAAC/anime-kiss.gif',
            'https://media1.tenor.com/m/KbXEleDty0IAAAAC/cheek-kiss.gif',
            'https://media1.tenor.com/m/mxB3FaghrOUAAAAC/anime-kiss-anime-kiss-cheek.gif',
        ];

        const memberToKiss = message.mentions.members.first();
        
        if (!memberToKiss) {
            return message.reply('⚠️ Por favor, mencione quem você gostaria de beijar!');
        }
        if (memberToKiss.id === message.author.id) {
            return message.reply('Você não pode beijar a si mesmo! 🤦‍♂️');
        }
        if (memberToKiss.user.bot) {
            return message.reply('Bots não precisam de beijos, apenas de café e código limpo.');
        }

        // 2. ESCOLHER UM GIF ALEATÓRIO
        const randomIndex = Math.floor(Math.random() * kissGifs.length);
        const randomGif = kissGifs[randomIndex];

        // 3. MONTAR O EMBED
        const kissEmbed = new EmbedBuilder()
            .setColor(0xff69b4)
            .setTitle('💕 Beijo na bochecha! 💕')
            .setDescription(`**${message.author.username}** beijou **${memberToKiss.user.username}**!`)
            .setImage(randomGif)
            .setFooter({ text: `Clique em Retribuir se você for ${memberToKiss.user.username}!` })
            .setTimestamp();

        // 4. CRIAR O BOTÃO
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    // ID customizado. CRUCIAL para identificar a interação
                    .setCustomId(`retribuir_${memberToKiss.id}`) 
                    .setLabel('Retribuir Beijo')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('💋'),
            );

        // 5. ENVIAR A MENSAGEM
        const sentMessage = await message.channel.send({ 
            embeds: [kissEmbed], 
            components: [row] 
        });

        // 6. COLETOR DE INTERAÇÃO (Espera pelo clique)
        // O filtro garante que só quem recebeu o beijo pode clicar
        const filter = (interaction) => interaction.customId === `retribuir_${memberToKiss.id}` && interaction.user.id === memberToKiss.id;
        
        try {
            const confirmation = await sentMessage.awaitMessageComponent({ filter, time: 60000 }); // Espera por 60 segundos
            
            // Cria o embed de retribuição
            const retributeEmbed = new EmbedBuilder()
                .setColor(0x00ffff) 
                .setTitle('💋 Beijo Retribuído! 💋')
                .setDescription(`**${memberToKiss.user.username}** retribuiu o beijo de **${message.author.username}**!`)
                .setImage(kissGifs[Math.floor(Math.random() * kissGifs.length)])
                .setFooter({ text: 'Que amor!' })
                .setTimestamp();

            // Edita a mensagem removendo o botão e colocando o novo embed
            await confirmation.update({ embeds: [retributeEmbed], components: [] }); 

        } catch (e) {
            // Se o tempo acabar ou houver erro, desativa o botão
            sentMessage.edit({ components: [new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('disabled') 
                    .setLabel('Tempo Esgotado')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(true)
            )] }).catch(() => {});
        }
    },
};