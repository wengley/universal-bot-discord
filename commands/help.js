const { EmbedBuilder } = require('discord.js');

module.exports = {
    name: 'help',
    description: 'Lista todos os comandos disponíveis do bot.',
    aliases: ['comandos', 'ajuda'],
    
    async execute(message, args) {
        // Pega todos os comandos que o cliente carregou (do handler no index.js)
        const commands = message.client.commands;
        const commandList = [];

        // Filtra e prepara a lista
        for (const command of commands.values()) {
            // Ignora comandos que você não quer que apareça no help (ex: comandos internos)
            if (command.name === 'adv') continue; 

            commandList.push({
                name: `!${command.name}`,
                value: command.description,
                inline: false, // Força a quebra de linha
            });
        }

        // Divide a lista em seções (Moderação, Interação, Utilitário)
        const modCommands = commandList.filter(c => ['!ban', '!kick', '!unban', '!clear', '!adv', '!embedcreate'].includes(c.name));
        const funCommands = commandList.filter(c => ['!ppt', '!beijar', '!ship'].includes(c.name));
        const utilCommands = commandList.filter(c => !modCommands.some(m => m.name === c.name) && !funCommands.some(f => f.name === c.name));


        const helpEmbed = new EmbedBuilder()
            .setColor(0x0099ff)
            .setTitle('📚 Central de Ajuda do Universal Bot')
            .setDescription('Use `!` seguido pelo comando. Ex: `!kick @usuario`')
            .addFields(
                { name: '\u200B', value: '\u200B' }, // Espaçador
                { name: '🛠️ Comandos de Moderação e Admin', value: modCommands.map(c => `**${c.name}**: ${c.value}`).join('\n') || 'Nenhum.', inline: false },
                { name: '\u200B', value: '\u200B' }, // Espaçador
                { name: '🎲 Comandos de Interação e Diversão', value: funCommands.map(c => `**${c.name}**: ${c.value}`).join('\n') || 'Nenhum.', inline: false },
                { name: '\u200B', value: '\u200B' }, // Espaçador
                { name: '✨ Comandos Utilitários', value: utilCommands.map(c => `**${c.name}**: ${c.value}`).join('\n') || 'Nenhum.', inline: false },
            )
            .setFooter({ text: `Total de ${commandList.length} comandos carregados.` })
            .setTimestamp();

        message.channel.send({ embeds: [helpEmbed] });
    },
};