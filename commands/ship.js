const { EmbedBuilder, SlashCommandBuilder } = require('discord.js');

module.exports = {
    name: 'ship',
    description: 'Calcula a porcentagem de compatibilidade entre 1 ou 2 membros.',
    category: 'Diversão',
    data: new SlashCommandBuilder()
        .setName('ship')
        .setDescription('Calcula a compatibilidade entre você e outra pessoa (ou entre duas pessoas).')
        .addUserOption(opt => opt.setName('usuario').setDescription('Primeira pessoa').setRequired(false))
        .addUserOption(opt => opt.setName('usuario2').setDescription('Segunda pessoa (opcional)').setRequired(false)),
    
    async execute(message, args) {
        let user1, user2;

        // 1. LÓGICA DE IDENTIFICAÇÃO DOS MEMBROS
        const mentions = message.mentions.members.filter(m => !m.user.bot);

        if (mentions.size === 0 && args.length === 0) {
            // Caso 1: !ship (Shipa o autor com o próprio bot)
            user1 = message.member;
            user2 = message.client.user; 
        } else if (mentions.size === 1) {
            // Caso 2: !ship @user (Shipa o autor com o usuário mencionado)
            user1 = message.member;
            user2 = mentions.first();
        } else if (mentions.size >= 2) {
            // Caso 3: !ship @user1 @user2 (Shipa os dois primeiros mencionados)
            const mentionArray = Array.from(mentions.values());
            user1 = mentionArray[0];
            user2 = mentionArray[1];
        } else {
            return message.reply('⚠️ Uso: `!ship @user` ou `!ship @user1 @user2`.');
        }

        // 2. CHECAGENS BÁSICAS
        if (user1.id === user2.id) {
            return message.reply('Você não pode shipar a mesma pessoa com ela mesma! 😜');
        }
        if (user1.user.bot && user2.user.bot) {
            return message.reply('Isso é um namoro entre robôs. Deixe o código rolar. 🤖');
        }

        // 3. GARANTIR CONSISTÊNCIA NO SHIP (A com B é igual a B com A)
        // Coloca os IDs em ordem para que o cálculo seja sempre o mesmo
        const ids = [user1.id, user2.id].sort();
        const combinedId = BigInt(ids[0]) + BigInt(ids[1]);
        
        const seed = parseInt(combinedId.toString().slice(-4)); 
        const random = (seed * 9301 + 49297) % 233280;
        const percentage = Math.floor((random / 233280) * 101); 

        // 4. DEFINIR MENSAGEM, COR E BARRA
        let shipMessage;
        let color;
        const emojiBar = '⬜'; 
        const filledBar = '█'; 
        const barLength = 10;
        const filledBlocks = Math.round((percentage / 100) * barLength);
        const progressBar = filledBar.repeat(filledBlocks) + emojiBar.repeat(barLength - filledBlocks);

        if (percentage >= 90) {
            shipMessage = "💕 **Casamento à vista!** É amor verdadeiro!";
            color = 0xff00ff;
        } else if (percentage >= 70) {
            shipMessage = "💖 **Uau!** Forte conexão! Quase lá!";
            color = 0xff69b4;
        } else if (percentage >= 40) {
            shipMessage = "🤔 **Tem potencial**, mas precisa de esforço!";
            color = 0xffff00;
        } else {
            shipMessage = "💔 **Corre!** Isso não vai dar certo!";
            color = 0xff0000;
        }
        
        // 5. CRIAR EMBED
        const shipEmbed = new EmbedBuilder()
            .setColor(color)
            .setTitle(`💖 Avaliação de Ship: ${user1.user.username} e ${user2.user.username}`)
            .setDescription(`Resultado do Ship:\n\n**${progressBar} ${percentage}%**\n\n${shipMessage}`)
            .setThumbnail(user1.user.displayAvatarURL({ dynamic: true }))
            .setFooter({ text: `Shippado por: ${message.author.tag}` })
            .setTimestamp();

        message.channel.send({ embeds: [shipEmbed] });
    },
};