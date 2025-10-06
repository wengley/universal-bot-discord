const { PermissionsBitField } = require('discord.js');

module.exports = {
    name: 'say',
    description: 'Faz o bot enviar uma mensagem de texto (Apenas Administradores).',
    
    async execute(message, args) {
        // 1. CHECAGEM DE PERMISSÕES DO AUTOR
        if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return message.reply({ content: '❌ Você precisa da permissão de **Administrador** para usar este comando.', ephemeral: true });
        }
        
        // 2. OBTER A MENSAGEM
        // Junta todos os argumentos para formar a mensagem completa
        const messageToSay = args.join(' ');
        
        if (!messageToSay) {
            return message.reply('⚠️ Por favor, forneça o texto que você quer que o bot diga. Ex: `!say Olá a todos!`');
        }

        // 3. APAGAR A MENSAGEM DO COMANDO (Opcional, mas limpa o chat)
        try {
            await message.delete(); 
        } catch (error) {
            // Ignora se o bot não tiver permissão para apagar mensagens
            console.error('Erro ao apagar mensagem do comando !say:', error);
        }

        // 4. ENVIAR A MENSAGEM DO BOT
        message.channel.send(messageToSay);
    },
};