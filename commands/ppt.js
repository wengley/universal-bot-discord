const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    name: 'ppt',
    description: 'Jogue Pedra, Papel ou Tesoura contra o bot!',
    category: 'Diversão',
    data: new SlashCommandBuilder()
        .setName('ppt')
        .setDescription('Jogue Pedra, Papel ou Tesoura contra o bot!')
        .addStringOption(opt => opt.setName('escolha').setDescription('Sua jogada').setRequired(true)
            .addChoices({ name: 'Pedra', value: 'pedra' }, { name: 'Papel', value: 'papel' }, { name: 'Tesoura', value: 'tesoura' })),
    
    async execute(message, args) {
        // 1. CHECAGEM DO ARGUMENTO DO USUÁRIO
        // O argumento do usuário é o args[0]
        const userChoice = args[0] ? args[0].toLowerCase() : null;

        // Opções válidas e seus respectivos emojis
        const validChoices = {
            'pedra': '🪨',
            'papel': '📄',
            'tesoura': '✂️',
        };

        if (!userChoice || !validChoices[userChoice]) {
            return message.reply(`⚠️ Por favor, escolha **Pedra**, **Papel** ou **Tesoura**. Exemplo: \`!ppt pedra\``);
        }

        // 2. ESCOLHA DO BOT (Randomização)
        const botChoices = Object.keys(validChoices);
        // Gera um índice aleatório (0, 1 ou 2)
        const randomIndex = Math.floor(Math.random() * botChoices.length);
        const botChoice = botChoices[randomIndex];

        // 3. DETERMINAR O VENCEDOR
        let result;
        let color; // Cor do embed

        if (userChoice === botChoice) {
            result = 'EMPATE';
            color = 0xAAAAAA; // Cinza
        } else if (
            (userChoice === 'pedra' && botChoice === 'tesoura') ||
            (userChoice === 'papel' && botChoice === 'pedra') ||
            (userChoice === 'tesoura' && botChoice === 'papel')
        ) {
            result = 'VOCÊ VENCEU! 🎉';
            color = 0x00FF00; // Verde
        } else {
            result = 'EU VENCÍ! 🤖';
            color = 0xFF0000; // Vermelho
        }

        // 4. CRIAR O EMBED DE RESULTADO
        const pptEmbed = {
            color: color,
            title: `Jogo de Pedra, Papel e Tesoura!`,
            description: `**${result}**`,
            fields: [
                {
                    name: `Sua Escolha (${message.author.username})`,
                    value: `${validChoices[userChoice]} ${userChoice.toUpperCase()}`,
                    inline: true,
                },
                {
                    name: `Minha Escolha (Universal Bot)`,
                    value: `${validChoices[botChoice]} ${botChoice.toUpperCase()}`,
                    inline: true,
                },
            ],
            timestamp: new Date().toISOString(),
        };

        // 5. ENVIAR A MENSAGEM
        message.channel.send({ embeds: [pptEmbed] });
    },
};