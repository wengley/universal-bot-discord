module.exports = {
    // Define o nome do comando (o que vem depois do !)
    name: 'userinfo', 
    description: 'Mostra informações detalhadas de um usuário no servidor.',
    
    // O método 'execute' é o que será rodado quando o usuário digitar !userinfo
    async execute(message, args) {
        // Encontra o usuário:
        // Prioriza o usuário mencionado (args[0]) ou usa o próprio autor da mensagem
        const member = message.mentions.members.first() || message.member;
        
        // Cria o Embed (a caixinha colorida) de resposta
        const userInfoEmbed = {
            color: 0x0099ff, // Cor azul
            title: `Informações de Usuário: ${member.user.tag}`,
            thumbnail: {
                url: member.user.displayAvatarURL({ dynamic: true }),
            },
            fields: [
                {
                    name: '🆔 ID do Usuário',
                    value: member.id,
                    inline: false,
                },
                {
                    name: '🗓️ Entrou no Discord em',
                    // Formata a data para português do Brasil
                    value: member.user.createdAt.toLocaleDateString('pt-BR'),
                    inline: true,
                },
                {
                    name: '🚪 Entrou no Servidor em',
                    value: member.joinedAt.toLocaleDateString('pt-BR'),
                    inline: true,
                },
                {
                    name: '🎨 Cargo Mais Alto',
                    value: member.roles.highest.name,
                    inline: false,
                },
            ],
            timestamp: new Date().toISOString(),
            footer: {
                text: `Comando solicitado por: ${message.author.tag}`,
            },
        };

        // Envia o Embed para o canal onde o comando foi chamado
        await message.channel.send({ embeds: [userInfoEmbed] });
    },
};