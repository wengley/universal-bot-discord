const { PermissionsBitField } = require('discord.js');

module.exports = {
    name: 'clear',
    aliases: ['limpar'], // Adiciona um alias para o comando, se quiser
    description: 'Apaga um número específico de mensagens no canal (máx 100).',
    
    async execute(message, args) {
        // 1. CHECAGEM DE PERMISSÕES DO AUTOR
        if (!message.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
            return message.reply({ content: '❌ Você não tem permissão para usar este comando. Permissão necessária: **Gerenciar Mensagens**.', ephemeral: true });
        }
        
        // 2. OBTER A QUANTIDADE
        // O argumento é o args[0]
        const amount = parseInt(args[0]);

        if (isNaN(amount) || amount <= 0 || amount > 100) {
            return message.reply('⚠️ Por favor, forneça um número de mensagens a ser apagado entre 1 e 100.');
        }

        // 3. CHECAGEM DE PERMISSÕES DO BOT
        if (!message.guild.members.me.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
            return message.reply('❌ Meu bot não tem permissão para **Gerenciar Mensagens** para executar este comando. Dê a permissão ao meu cargo.');
        }

        // 4. EXECUTAR A EXCLUSÃO
        try {
            // bulkDelete apaga a quantidade + 1 (o próprio comando do usuário)
            const fetched = await message.channel.messages.fetch({ limit: amount + 1 });
            await message.channel.bulkDelete(fetched, true); // O 'true' ignora mensagens com mais de 14 dias

            // 5. MENSAGEM DE CONFIRMAÇÃO (Temporária)
            // É importante enviar uma mensagem de sucesso e apagá-la logo em seguida
            const replyMessage = await message.channel.send(`✅ ${amount} mensagens apagadas com sucesso.`);
            
            // Apaga a mensagem de confirmação após 5 segundos
            setTimeout(() => replyMessage.delete().catch(err => console.log("Erro ao apagar mensagem de confirmação:", err)), 5000);

        } catch (error) {
            console.error(error);
            message.reply('❌ Ocorreu um erro ao tentar apagar as mensagens. Mensagens com mais de 14 dias não podem ser apagadas em massa.');
        }
    },
};