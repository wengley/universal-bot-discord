const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');

module.exports = {
    name: 'beijar',
    description: 'Beija um usuário com um GIF divertido e permite retribuir.',
    
    async execute(message, args) {
        // 1. LISTA DE GIFS DE BEIJO (Substitua pelos seus próprios links!)
        const kissGifs = [
            'https://tenor.com/view/yosuga-no-sora-anime-kiss-couple-kiss-gif-17646642948001779483', // Exemplo 1
            'https://tenor.com/view/yuki-yuki-and-itsuomi-kiss-itsuomi-gif-8959322022735711966', // Exemplo 2
            'https://tenor.com/view/kiss-me-gif-13265134655129066209', // Exemplo 3
            'https://tenor.com/view/ichigo-hiro-anime-kiss-anime-gif-8146116001988818857', // Exemplo 4
            'https://tenor.com/view/megumi-kato-kiss-saekano-aki-tomoya-gif-26277378'
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